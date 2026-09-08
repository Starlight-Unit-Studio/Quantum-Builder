#!/usr/bin/env python3
"""Persistent Android build worker for Starlight Quantum Builder."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import string
import subprocess
import time
import traceback
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from xml.sax.saxutils import escape as xml_escape

DATA_DIR = Path(os.environ.get("QB_DATA_DIR", "/var/lib/quantum-builder")).resolve()
DB_PATH = DATA_DIR / "quantum-builder.sqlite"
REPOSITORY = os.environ.get("QB_WRAPPER_REPOSITORY", "https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper.git")
DEFAULT_REF = os.environ.get("QB_WRAPPER_REF", "compat/android-6-api23")
POLL_SECONDS = max(1, int(os.environ.get("QB_POLL_SECONDS", "3")))
BUILD_ROOT = DATA_DIR / "builds"
WORK_ROOT = DATA_DIR / "work"
SIGNING_ROOT = DATA_DIR / "signing"
CANONICAL_PRODUCTION_SPLASH = Path(os.environ.get("QB_CANONICAL_PRODUCTION_SPLASH", "/worker/assets/quantum_production_splash.jpg")).resolve()
CANONICAL_PRODUCTION_SPLASH_SIZE = 112976

GRADLE_PHASES = (
    ("android-lint", "Running Android debug lint", "lintDebug"),
    ("android-test", "Running Android unit tests", "test"),
    ("android-apk", "Building signed release APK", "assembleRelease"),
    ("android-aab", "Building signed release AAB", "bundleRelease"),
)

GRADLE_FAILURE_MARKERS = (
    "FAILURE:",
    "What went wrong",
    "Execution failed for task",
    "Lint found",
    "Caused by:",
    " error:",
    "Exception",
)

SENSITIVE_COMMAND_OPTIONS = {"-storepass", "-keypass"}


def log(message: str) -> None:
    print(f"[Quantum Builder Worker] {message}", flush=True)


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=5000")
    return con


def claim_build(con: sqlite3.Connection) -> sqlite3.Row | None:
    con.execute("BEGIN IMMEDIATE")
    try:
        row = con.execute("SELECT * FROM builds WHERE status='queued' ORDER BY id LIMIT 1").fetchone()
        if row is None:
            con.execute("COMMIT")
            return None
        changed = con.execute(
            "UPDATE builds SET status='building', stage='prepare', message='Worker claimed build', started_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND status='queued'",
            (row["id"],),
        ).rowcount
        con.execute("COMMIT")
        if changed != 1:
            return None
        return con.execute("SELECT * FROM builds WHERE id=?", (row["id"],)).fetchone()
    except Exception:
        con.execute("ROLLBACK")
        raise


def update_build(con: sqlite3.Connection, build_id: int, **changes: Any) -> None:
    finished = bool(changes.pop("finished", False))
    allowed = {"status", "stage", "message", "artifact_dir"}
    fields: list[str] = []
    values: list[Any] = []
    for key, value in changes.items():
        if key not in allowed or value is None:
            continue
        fields.append(f"{key}=?")
        values.append(value[-4000:] if key == "message" and isinstance(value, str) else value)
    if finished:
        fields.append("finished_at=CURRENT_TIMESTAMP")
    if not fields:
        return
    values.append(build_id)
    con.execute(f"UPDATE builds SET {', '.join(fields)} WHERE id=?", values)


def failure_excerpt(lines: list[str]) -> str:
    """Return the most useful Gradle failure context instead of the generic footer."""
    if not lines:
        return "No command output captured."

    matches: list[int] = []
    for index, line in enumerate(lines):
        if any(marker.lower() in line.lower() for marker in GRADLE_FAILURE_MARKERS):
            matches.append(index)

    if matches:
        start = max(0, matches[0] - 3)
        end = min(len(lines), matches[-1] + 12)
        excerpt = lines[start:end]
        if len(excerpt) > 90:
            excerpt = excerpt[:45] + ["... diagnostic excerpt truncated ..."] + excerpt[-44:]
        return "\n".join(excerpt).strip()

    return "\n".join(lines[-45:]).strip()


def redact_command(command: list[str]) -> list[str]:
    """Return a log-safe copy of a command without mutating the real argv."""
    redacted: list[str] = []
    hide_next = False
    for part in command:
        if hide_next:
            redacted.append("***")
            hide_next = False
            continue
        redacted.append(part)
        if part in SENSITIVE_COMMAND_OPTIONS:
            hide_next = True
    return redacted


def run(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None, output=None) -> None:
    shown_command = redact_command(command)
    log("exec: " + " ".join(shown_command))
    process = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    tail: list[str] = []
    for line in process.stdout:
        if output is not None:
            output.write(line)
            output.flush()
        tail.append(line.rstrip())
        tail = tail[-600:]
    code = process.wait()
    if code:
        raise RuntimeError(
            f"Command failed ({code}): {' '.join(shown_command)}\n"
            + failure_excerpt(tail)
        )


def safe_ref(ref: str) -> str:
    value = ref.strip() or DEFAULT_REF
    if not re.fullmatch(r"[A-Za-z0-9._/-]{1,180}", value) or ".." in value or value.startswith("-"):
        raise ValueError("Unsafe wrapper ref")
    return value


def clone_wrapper(destination: Path, ref: str, output) -> None:
    run(["git", "clone", "--no-tags", "--filter=blob:none", REPOSITORY, str(destination)], output=output)
    run(["git", "fetch", "--depth", "1", "origin", ref], cwd=destination, output=output)
    run(["git", "checkout", "--detach", "FETCH_HEAD"], cwd=destination, output=output)
    shutil.rmtree(destination / ".git", ignore_errors=True)


def install_mandatory_production_splash(project: Path, output=None) -> Path:
    source = CANONICAL_PRODUCTION_SPLASH
    if not source.is_file():
        raise RuntimeError(f"Mandatory production splash missing: {source}")

    data = source.read_bytes()
    if len(data) != CANONICAL_PRODUCTION_SPLASH_SIZE:
        raise RuntimeError(
            f"Mandatory production splash has unexpected size: {len(data)} bytes "
            f"(expected {CANONICAL_PRODUCTION_SPLASH_SIZE})"
        )
    if len(data) < 3 or data[:3] != b"\xff\xd8\xff":
        raise RuntimeError("Mandatory production splash is not valid JPEG data")

    drawable_dir = project / "app/src/main/res/drawable-nodpi"
    drawable_dir.mkdir(parents=True, exist_ok=True)
    for existing in drawable_dir.glob("quantum_production_splash.*"):
        existing.unlink()

    target = drawable_dir / "quantum_production_splash.jpg"
    shutil.copy2(source, target)
    if target.stat().st_size != CANONICAL_PRODUCTION_SPLASH_SIZE:
        raise RuntimeError("Mandatory production splash copy failed integrity check")

    splash_sha = hashlib.sha256(data).hexdigest()
    message = (
        f"Installed mandatory production splash from Quantum Builder source of truth "
        f"({CANONICAL_PRODUCTION_SPLASH_SIZE} bytes, sha256={splash_sha})"
    )
    log(message)
    if output is not None:
        output.write(message + "\n")
        output.flush()
    return target


def random_password(length: int = 48) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def signing_identity(app: sqlite3.Row, output) -> tuple[Path, str]:
    directory = SIGNING_ROOT / str(app["uuid"])
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    keystore = directory / "release.p12"
    password_file = directory / "password"

    if keystore.exists() and password_file.exists():
        return keystore, password_file.read_text(encoding="utf-8").strip()
    if keystore.exists() != password_file.exists():
        raise RuntimeError("Incomplete signing identity detected; key rotation is refused")

    password = random_password()
    clean_name = re.sub(r"[^A-Za-z0-9 ._-]", "", str(app["name"]))[:50] or "Quantum App"
    try:
        run([
            "keytool", "-genkeypair", "-storetype", "PKCS12", "-keystore", str(keystore),
            "-storepass", password, "-keypass", password, "-alias", "quantum-release",
            "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000",
            "-dname", f"CN={clean_name}, OU=Quantum Builder, O=Starlight Unit Studios, C=DE",
        ], output=output)
        os.chmod(keystore, 0o600)
        temp = directory / f"password.tmp.{os.getpid()}"
        temp.write_text(password + "\n", encoding="utf-8")
        os.chmod(temp, 0o600)
        os.replace(temp, password_file)
    except Exception:
        keystore.unlink(missing_ok=True)
        raise
    log(f"Persistent signing identity created for {app['package_id']}")
    return keystore, password


def java_literal(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def groovy_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Wrapper compiler could not patch {label}")
    return updated


def patch_app_config(project: Path, app: sqlite3.Row, config: dict[str, Any]) -> None:
    path = project / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
    text = path.read_text(encoding="utf-8")
    parsed = urlparse(str(app["start_url"]))
    start_host = parsed.hostname or str(config.get("trusted_domain") or "")
    trusted = str(config.get("trusted_domain") or start_host)
    web = config.get("web", {})

    string_values = {
        "START_URL": str(app["start_url"]),
        "TRUSTED_DOMAIN": trusted,
        "VERSION_NAME": str(app["version_name"]),
        "USER_AGENT_SUFFIX": str(web.get("user_agent_suffix") or " QuantumMobileWrapper") + "/" + str(app["version_name"]),
        "ASSET_STORE_TRUSTED_HOST": start_host,
        "APP_HEADER_VALUE": re.sub(r"[^a-z0-9-]+", "-", str(app["package_id"]).lower()).strip("-"),
    }
    for constant, value in string_values.items():
        text = replace_once(
            text,
            rf'(public static final String {re.escape(constant)}\s*=\s*)(?:"(?:\\.|[^"\\])*"|[^;]+)(;)',
            rf'\g<1>{java_literal(value)}\g<2>',
            f"AppConfig.{constant}",
        )

    keep_screen = "true" if bool(config.get("interface", {}).get("keep_screen_on")) else "false"
    text = replace_once(
        text,
        r'(public static final boolean KEEP_SCREEN_ON\s*=\s*)(true|false)(;)',
        rf'\g<1>{keep_screen}\g<3>',
        "AppConfig.KEEP_SCREEN_ON",
    )
    path.write_text(text, encoding="utf-8")


def patch_gradle(project: Path, app: sqlite3.Row) -> None:
    path = project / "app/build.gradle"
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, r"applicationId\s+'[^']+'", f"applicationId '{groovy_literal(str(app['package_id']))}'", "applicationId")
    text = replace_once(text, r"minSdk\s*=\s*\d+", f"minSdk = {int(app['min_sdk'])}", "minSdk")
    text = replace_once(text, r"targetSdk\s*=\s*\d+", f"targetSdk = {int(app['target_sdk'])}", "targetSdk")
    text = replace_once(text, r"versionCode\s*=\s*\d+", f"versionCode = {int(app['version_code'])}", "versionCode")
    text = replace_once(text, r"versionName\s*=\s*'[^']*'", f"versionName = '{groovy_literal(str(app['version_name']))}'", "versionName")

    build_types_marker = "    buildTypes {"
    if build_types_marker not in text:
        raise RuntimeError("Wrapper compiler could not locate buildTypes")
    if "signingConfigs {" not in text:
        signing = """    signingConfigs {
        release {
            storeFile file(System.getenv('QB_SIGNING_STORE_FILE'))
            storePassword System.getenv('QB_SIGNING_STORE_PASSWORD')
            keyAlias 'quantum-release'
            keyPassword System.getenv('QB_SIGNING_STORE_PASSWORD')
        }
    }

"""
        text = text.replace(build_types_marker, signing + build_types_marker, 1)

    build_types_at = text.index(build_types_marker)
    prefix, tail = text[:build_types_at], text[build_types_at:]
    match = re.search(r"(\n\s*release\s*\{)(.*?)(\n\s*\})", tail, flags=re.S)
    if not match:
        raise RuntimeError("Wrapper compiler could not locate release build type")
    body = match.group(2)
    if "signingConfig signingConfigs.release" not in body:
        body = "\n            signingConfig signingConfigs.release" + body
        tail = tail[:match.start(2)] + body + tail[match.end(2):]
    path.write_text(prefix + tail, encoding="utf-8")


def patch_strings(project: Path, app: sqlite3.Row) -> None:
    path = project / "app/src/main/res/values/strings.xml"
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, r'(<string name="app_name">).*?(</string>)', rf'\g<1>{xml_escape(str(app["name"]))}\g<2>', "app_name")
    path.write_text(text, encoding="utf-8")


def patch_manifest(project: Path, config: dict[str, Any]) -> None:
    path = project / "app/src/main/AndroidManifest.xml"
    text = path.read_text(encoding="utf-8")
    permissions = config.get("permissions", {})
    requested: list[str] = []
    if permissions.get("location"):
        requested += ["android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"]
    if permissions.get("microphone"):
        requested.append("android.permission.RECORD_AUDIO")
    if permissions.get("camera"):
        requested.append("android.permission.CAMERA")
    insertion = "".join(f'    <uses-permission android:name="{item}" />\n' for item in requested if item not in text)
    if insertion:
        text = text.replace("\n    <application", "\n" + insertion + "\n    <application", 1)

    orientation = str(config.get("interface", {}).get("orientation", "auto"))
    if orientation in {"portrait", "landscape"} and "android:screenOrientation=" not in text:
        text = text.replace(
            'android:launchMode="singleTask">',
            f'android:launchMode="singleTask"\n            android:screenOrientation="{orientation}">',
            1,
        )
    path.write_text(text, encoding="utf-8")


def write_profile(project: Path, app: sqlite3.Row, config: dict[str, Any], build_id: int) -> None:
    profile = {
        "schema": 1,
        "builder": "Starlight Quantum Builder",
        "build_id": build_id,
        "app": {
            "uuid": app["uuid"], "name": app["name"], "package_id": app["package_id"],
            "start_url": app["start_url"], "version_name": app["version_name"],
            "version_code": app["version_code"], "min_sdk": app["min_sdk"], "target_sdk": app["target_sdk"],
        },
        "config": config,
    }
    (project / "quantum-builder-profile.json").write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def make_source_zip(project: Path, destination: Path) -> None:
    destination.unlink(missing_ok=True)
    run([
        "zip", "-qr", str(destination), ".", "-x",
        ".gradle/*", "app/build/*", "build/*", "*.keystore", "*.jks", "*.p12", "*signing.properties",
    ], cwd=project)


def run_gradle_phases(
    con: sqlite3.Connection,
    build_id: int,
    project: Path,
    env: dict[str, str],
    output,
) -> None:
    for stage, message, task in GRADLE_PHASES:
        update_build(con, build_id, stage=stage, message=message)
        output.write(f"\n===== QUANTUM BUILD PHASE: {stage} / {task} =====\n")
        output.flush()
        run(["./gradlew", "--no-daemon", task, "--stacktrace"], cwd=project, env=env, output=output)


def compile_build(con: sqlite3.Connection, build: sqlite3.Row) -> None:
    build_id = int(build["id"])
    app = con.execute("SELECT * FROM apps WHERE id=?", (build["app_id"],)).fetchone()
    if app is None:
        raise RuntimeError("App profile disappeared before build")
    config = json.loads(app["config_json"] or "{}")
    ref = safe_ref(str(build["wrapper_ref"] or config.get("wrapper_ref") or DEFAULT_REF))

    work_dir = WORK_ROOT / f"build-{build_id}"
    project = work_dir / "wrapper"
    artifact_dir = BUILD_ROOT / str(build_id)
    shutil.rmtree(work_dir, ignore_errors=True)
    shutil.rmtree(artifact_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(artifact_dir, 0o755)

    with (artifact_dir / "build.log").open("w", encoding="utf-8") as output:
        update_build(con, build_id, stage="checkout", message=f"Checking out wrapper {ref}")
        clone_wrapper(project, ref, output)

        update_build(con, build_id, stage="branding", message="Installing mandatory Starlight production splash")
        install_mandatory_production_splash(project, output)

        update_build(con, build_id, stage="compile-profile", message="Compiling app profile into wrapper")
        patch_app_config(project, app, config)
        patch_gradle(project, app)
        patch_strings(project, app)
        patch_manifest(project, config)
        write_profile(project, app, config, build_id)

        update_build(con, build_id, stage="signing", message="Preparing persistent app signing identity")
        keystore, password = signing_identity(app, output)

        gradle = project / "gradlew"
        gradle.chmod(gradle.stat().st_mode | 0o111)
        env = os.environ.copy()
        env.update({
            "QB_SIGNING_STORE_FILE": str(keystore),
            "QB_SIGNING_STORE_PASSWORD": password,
            "GRADLE_USER_HOME": str(DATA_DIR / "gradle-cache"),
        })
        run_gradle_phases(con, build_id, project, env, output)

        update_build(con, build_id, stage="artifacts", message="Collecting build artifacts")
        sources = {
            "app-release.apk": project / "app/build/outputs/apk/release/app-release.apk",
            "app-release.aab": project / "app/build/outputs/bundle/release/app-release.aab",
        }
        for source in sources.values():
            if not source.is_file():
                raise RuntimeError(f"Expected artifact missing: {source.name}")
        targets: list[Path] = []
        for name, source in sources.items():
            target = artifact_dir / name
            shutil.copy2(source, target)
            os.chmod(target, 0o644)
            targets.append(target)

        source_zip = artifact_dir / "source.zip"
        make_source_zip(project, source_zip)
        os.chmod(source_zip, 0o644)
        targets.append(source_zip)

        checksums = artifact_dir / "SHA256SUMS"
        checksums.write_text("\n".join(f"{digest(item)}  {item.name}" for item in targets) + "\n", encoding="utf-8")
        os.chmod(checksums, 0o644)

        metadata = {
            "build_id": build_id, "app_uuid": app["uuid"], "package_id": app["package_id"],
            "version_name": app["version_name"], "version_code": app["version_code"], "wrapper_ref": ref,
            "artifacts": {item.name: digest(item) for item in targets},
        }
        (artifact_dir / "build.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    update_build(
        con, build_id, status="complete", stage="complete",
        message="APK, AAB, Source ZIP and SHA256SUMS are ready",
        artifact_dir=str(artifact_dir), finished=True,
    )
    shutil.rmtree(work_dir, ignore_errors=True)
    log(f"Build #{build_id} complete for {app['package_id']}")


def fail_build(con: sqlite3.Connection, build_id: int, error: BaseException) -> None:
    message = str(error).strip() or error.__class__.__name__
    current = con.execute("SELECT stage FROM builds WHERE id=?", (build_id,)).fetchone()
    failed_stage = str(current["stage"] if current and current["stage"] else "unknown")
    update_build(
        con,
        build_id,
        status="failed",
        stage=f"failed:{failed_stage}"[:120],
        message=message,
        finished=True,
    )
    log(f"Build #{build_id} failed in {failed_stage}: {message}")


def main() -> int:
    for directory in (DATA_DIR, BUILD_ROOT, WORK_ROOT, SIGNING_ROOT):
        directory.mkdir(parents=True, exist_ok=True)
    log(f"Worker online. Database: {DB_PATH}")
    while True:
        if not DB_PATH.exists():
            time.sleep(POLL_SECONDS)
            continue
        con = connect()
        try:
            build = claim_build(con)
            if build is None:
                time.sleep(POLL_SECONDS)
                continue
            try:
                compile_build(con, build)
            except Exception as error:
                traceback.print_exc()
                fail_build(con, int(build["id"]), error)
        finally:
            con.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Worker stopped")
        raise SystemExit(0)
