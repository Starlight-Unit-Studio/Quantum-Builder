#!/usr/bin/env python3
"""Quantum Builder Android worker.

Consumes SQLite build jobs, materializes a clean Quantum Mobile Wrapper checkout,
compiles the app profile into the Android project, signs with a stable per-app
key, and publishes APK/AAB/source/checksums into the persistent build store.
"""

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
import sys
import time
import traceback
import xml.sax.saxutils as xml_escape
from pathlib import Path
from typing import Any

DATA_DIR = Path(os.environ.get("QB_DATA_DIR", "/var/lib/quantum-builder")).resolve()
DB_PATH = DATA_DIR / "quantum-builder.sqlite"
REPOSITORY = os.environ.get(
    "QB_WRAPPER_REPOSITORY",
    "https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper.git",
)
DEFAULT_REF = os.environ.get("QB_WRAPPER_REF", "compat/android-6-api23")
POLL_SECONDS = max(1, int(os.environ.get("QB_POLL_SECONDS", "3")))
BUILD_ROOT = DATA_DIR / "builds"
WORK_ROOT = DATA_DIR / "work"
SIGNING_ROOT = DATA_DIR / "signing"


def log(message: str) -> None:
    print(f"[Quantum Builder Worker] {message}", flush=True)


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=5000")
    return connection


def claim_build(connection: sqlite3.Connection) -> sqlite3.Row | None:
    connection.execute("BEGIN IMMEDIATE")
    try:
        build = connection.execute(
            "SELECT * FROM builds WHERE status='queued' ORDER BY id ASC LIMIT 1"
        ).fetchone()
        if build is None:
            connection.execute("COMMIT")
            return None
        changed = connection.execute(
            "UPDATE builds SET status='building', stage='prepare', message='Worker claimed build', "
            "started_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'",
            (build["id"],),
        ).rowcount
        connection.execute("COMMIT")
        if changed != 1:
            return None
        return connection.execute("SELECT * FROM builds WHERE id=?", (build["id"],)).fetchone()
    except Exception:
        connection.execute("ROLLBACK")
        raise


def update_build(
    connection: sqlite3.Connection,
    build_id: int,
    *,
    status: str | None = None,
    stage: str | None = None,
    message: str | None = None,
    artifact_dir: str | None = None,
    finished: bool = False,
) -> None:
    assignments: list[str] = []
    values: list[Any] = []
    for column, value in (("status", status), ("stage", stage), ("message", message), ("artifact_dir", artifact_dir)):
        if value is not None:
            assignments.append(f"{column}=?")
            values.append(value[:4000] if isinstance(value, str) else value)
    if finished:
        assignments.append("finished_at=CURRENT_TIMESTAMP")
    if not assignments:
        return
    values.append(build_id)
    connection.execute(f"UPDATE builds SET {', '.join(assignments)} WHERE id=?", values)


def run(command: list[str], cwd: Path | None = None, env: dict[str, str] | None = None, log_file=None) -> None:
    printable = " ".join(command)
    log(f"exec: {printable}")
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
        if log_file:
            log_file.write(line)
            log_file.flush()
        tail.append(line.rstrip())
        tail = tail[-30:]
    return_code = process.wait()
    if return_code != 0:
        excerpt = "\n".join(tail[-12:])
        raise RuntimeError(f"Command failed ({return_code}): {printable}\n{excerpt}")


def safe_ref(value: str) -> str:
    value = value.strip() or DEFAULT_REF
    if not re.fullmatch(r"[A-Za-z0-9._/-]{1,180}", value) or ".." in value or value.startswith("-"):
        raise ValueError("Unsafe wrapper ref")
    return value


def clone_wrapper(destination: Path, ref: str, build_log) -> None:
    run(["git", "clone", "--no-tags", "--filter=blob:none", REPOSITORY, str(destination)], log_file=build_log)
    run(["git", "fetch", "--depth", "1", "origin", ref], cwd=destination, log_file=build_log)
    run(["git", "checkout", "--detach", "FETCH_HEAD"], cwd=destination, log_file=build_log)
    shutil.rmtree(destination / ".git", ignore_errors=True)


def random_password(length: int = 48) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def signing_identity(app: sqlite3.Row, build_log) -> tuple[Path, str]:
    directory = SIGNING_ROOT / str(app["uuid"])
    directory.mkdir(parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    keystore = directory / "release.p12"
    password_file = directory / "password"

    if keystore.exists() and password_file.exists():
        return keystore, password_file.read_text(encoding="utf-8").strip()

    if keystore.exists() != password_file.exists():
        raise RuntimeError("Incomplete signing identity detected; refusing to rotate an existing app key")

    password = random_password()
    temp_password = directory / f"password.tmp.{os.getpid()}"
    temp_password.write_text(password + "\n", encoding="utf-8")
    os.chmod(temp_password, 0o600)

    dname = f"CN={str(app['name'])[:60]}, OU=Quantum Builder, O=Starlight Unit Studios, C=DE"
    run(
        [
            "keytool", "-genkeypair", "-v", "-storetype", "PKCS12",
            "-keystore", str(keystore), "-storepass", password, "-keypass", password,
            "-alias", "quantum-release", "-keyalg", "RSA", "-keysize", "4096",
            "-validity", "10000", "-dname", dname,
        ],
        log_file=build_log,
    )
    os.chmod(keystore, 0o600)
    os.replace(temp_password, password_file)
    log(f"Created persistent signing identity for {app['package_id']}")
    return keystore, password


def java_literal(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def groovy_literal(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def replace_or_fail(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Wrapper compiler could not patch {label}")
    return updated


def patch_app_config(project: Path, app: sqlite3.Row, config: dict[str, Any]) -> None:
    path = project / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
    text = path.read_text(encoding="utf-8")
    interface = config.get("interface", {})
    web = config.get("web", {})
    trusted = str(config.get("trusted_domain") or "")
    start_url = str(app["start_url"])
    if not trusted:
        trusted = re.sub(r"^www\.", "", re.sub(r"^https?://", "", start_url).split("/")[0])

    replacements = {
        "START_URL": start_url,
        "TRUSTED_DOMAIN": trusted,
        "VERSION_NAME": str(app["version_name"]),
        "USER_AGENT_SUFFIX": str(web.get("user_agent_suffix") or " QuantumMobileWrapper") + "/" + str(app["version_name"]),
        "ASSET_STORE_TRUSTED_HOST": trusted,
        "APP_HEADER_VALUE": re.sub(r"[^a-z0-9-]+", "-", str(app["package_id"]).lower()).strip("-"),
    }
    for constant, value in replacements.items():
        text = replace_or_fail(
            text,
            rf'(public static final String {re.escape(constant)}\s*=\s*)(?:"(?:\\.|[^"\\])*"|[^;]+)(;)',
            rf'\g<1>{java_literal(value)}\g<2>',
            f"AppConfig.{constant}",
        )

    keep_screen = "true" if bool(interface.get("keep_screen_on")) else "false"
    text = replace_or_fail(
        text,
        r'(public static final boolean KEEP_SCREEN_ON\s*=\s*)(true|false)(;)',
        rf'\g<1>{keep_screen}\g<3>',
        "AppConfig.KEEP_SCREEN_ON",
    )
    path.write_text(text, encoding="utf-8")


def patch_gradle(project: Path, app: sqlite3.Row) -> None:
    path = project / "app/build.gradle"
    text = path.read_text(encoding="utf-8")
    text = replace_or_fail(text, r"applicationId\s+'[^']+'", f"applicationId '{groovy_literal(str(app['package_id']))}'", "applicationId")
    text = replace_or_fail(text, r"minSdk\s*=\s*\d+", f"minSdk = {int(app['min_sdk'])}", "minSdk")
    text = replace_or_fail(text, r"targetSdk\s*=\s*\d+", f"targetSdk = {int(app['target_sdk'])}", "targetSdk")
    text = replace_or_fail(text, r"versionCode\s*=\s*\d+", f"versionCode = {int(app['version_code'])}", "versionCode")
    text = replace_or_fail(text, r"versionName\s*=\s*'[^']*'", f"versionName = '{groovy_literal(str(app['version_name']))}'", "versionName")

    if "signingConfigs {" not in text:
        marker = "    buildTypes {"
        signing = """    signingConfigs {\n        release {\n            storeFile file(System.getenv('QB_SIGNING_STORE_FILE'))\n            storePassword System.getenv('QB_SIGNING_STORE_PASSWORD')\n            keyAlias 'quantum-release'\n            keyPassword System.getenv('QB_SIGNING_STORE_PASSWORD')\n        }\n    }\n\n"""
        if marker not in text:
            raise RuntimeError("Wrapper compiler could not locate buildTypes")
        text = text.replace(marker, signing + marker, 1)

    release_match = re.search(r"(release\s*\{)(.*?)(\n\s*\})", text, flags=re.S)
    if not release_match:
        raise RuntimeError("Wrapper compiler could not locate release build type")
    body = release_match.group(2)
    if "signingConfig signingConfigs.release" not in body:
        body = "\n            signingConfig signingConfigs.release" + body
        text = text[: release_match.start(2)] + body + text[release_match.end(2) :]

    path.write_text(text, encoding="utf-8")


def patch_strings(project: Path, app: sqlite3.Row) -> None:
    path = project / "app/src/main/res/values/strings.xml"
    text = path.read_text(encoding="utf-8")
    app_name = xml_escape.escape(str(app["name"]))
    text = replace_or_fail(text, r'(<string name="app_name">).*?(</string>)', rf'\g<1>{app_name}\g<2>', "app_name")
    path.write_text(text, encoding="utf-8")


def patch_manifest(project: Path, config: dict[str, Any]) -> None:
    path = project / "app/src/main/AndroidManifest.xml"
    text = path.read_text(encoding="utf-8")
    permissions = config.get("permissions", {})
    requested: list[str] = []
    if permissions.get("location"):
        requested.extend(["android.permission.ACCESS_COARSE_LOCATION", "android.permission.ACCESS_FINE_LOCATION"])
    if permissions.get("microphone"):
        requested.append("android.permission.RECORD_AUDIO")
    if permissions.get("camera"):
        requested.append("android.permission.CAMERA")

    insertion = ""
    for permission in requested:
        if permission not in text:
            insertion += f'    <uses-permission android:name="{permission}" />\n'
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
            "uuid": app["uuid"],
            "name": app["name"],
            "package_id": app["package_id"],
            "start_url": app["start_url"],
            "version_name": app["version_name"],
            "version_code": app["version_code"],
            "min_sdk": app["min_sdk"],
            "target_sdk": app["target_sdk"],
        },
        "config": config,
    }
    (project / "quantum-builder-profile.json").write_text(
        json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_source_zip(project: Path, destination: Path) -> None:
    if destination.exists():
        destination.unlink()
    run(["zip", "-qr", str(destination), ".", "-x", ".gradle/*", "app/build/*", "build/*", "*.keystore", "*.jks", "*.p12"], cwd=project)


def compile_build(connection: sqlite3.Connection, build: sqlite3.Row) -> None:
    build_id = int(build["id"])
    app = connection.execute("SELECT * FROM apps WHERE id=?", (build["app_id"],)).fetchone()
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
    os.chmod(artifact_dir, 0o750)
    build_log_path = artifact_dir / "build.log"

    with build_log_path.open("w", encoding="utf-8") as build_log:
        update_build(connection, build_id, stage="checkout", message=f"Checking out wrapper {ref}")
        clone_wrapper(project, ref, build_log)

        update_build(connection, build_id, stage="compile-profile", message="Compiling app profile into wrapper")
        patch_app_config(project, app, config)
        patch_gradle(project, app)
        patch_strings(project, app)
        patch_manifest(project, config)
        write_profile(project, app, config, build_id)

        update_build(connection, build_id, stage="signing", message="Preparing persistent app signing identity")
        keystore, password = signing_identity(app, build_log)

        update_build(connection, build_id, stage="android-build", message="Running lint, tests, APK and AAB build")
        gradle = project / "gradlew"
        gradle.chmod(gradle.stat().st_mode | 0o111)
        environment = os.environ.copy()
        environment["QB_SIGNING_STORE_FILE"] = str(keystore)
        environment["QB_SIGNING_STORE_PASSWORD"] = password
        environment["GRADLE_USER_HOME"] = str(DATA_DIR / "gradle-cache")
        run(["./gradlew", "--no-daemon", "lint", "test", "assembleRelease", "bundleRelease"], cwd=project, env=environment, log_file=build_log)

        update_build(connection, build_id, stage="artifacts", message="Collecting build artifacts")
        apk_source = project / "app/build/outputs/apk/release/app-release.apk"
        aab_source = project / "app/build/outputs/bundle/release/app-release.aab"
        if not apk_source.is_file() or not aab_source.is_file():
            raise RuntimeError("Gradle completed without expected APK/AAB artifacts")
        apk_target = artifact_dir / "app-release.apk"
        aab_target = artifact_dir / "app-release.aab"
        shutil.copy2(apk_source, apk_target)
        shutil.copy2(aab_source, aab_target)

        source_target = artifact_dir / "source.zip"
        make_source_zip(project, source_target)

        checksum_target = artifact_dir / "SHA256SUMS"
        checksum_lines = []
        for artifact in (apk_target, aab_target, source_target):
            checksum_lines.append(f"{sha256(artifact)}  {artifact.name}")
        checksum_target.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

        metadata = {
            "build_id": build_id,
            "app_uuid": app["uuid"],
            "package_id": app["package_id"],
            "version_name": app["version_name"],
            "version_code": app["version_code"],
            "wrapper_ref": ref,
            "artifacts": {path.name: sha256(path) for path in (apk_target, aab_target, source_target)},
        }
        (artifact_dir / "build.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    update_build(
        connection,
        build_id,
        status="complete",
        stage="complete",
        message="APK, AAB, Source ZIP and SHA256SUMS are ready",
        artifact_dir=str(artifact_dir),
        finished=True,
    )
    shutil.rmtree(work_dir, ignore_errors=True)
    log(f"Build #{build_id} complete for {app['package_id']}")


def fail_build(connection: sqlite3.Connection, build_id: int, error: BaseException) -> None:
    message = str(error).strip() or error.__class__.__name__
    update_build(
        connection,
        build_id,
        status="failed",
        stage="failed",
        message=message[-3500:],
        finished=True,
    )
    log(f"Build #{build_id} failed: {message}")


def main() -> int:
    for directory in (DATA_DIR, BUILD_ROOT, WORK_ROOT, SIGNING_ROOT):
        directory.mkdir(parents=True, exist_ok=True)
    log(f"Worker online. Database: {DB_PATH}")

    while True:
        if not DB_PATH.exists():
            time.sleep(POLL_SECONDS)
            continue
        connection = connect()
        try:
            build = claim_build(connection)
            if build is None:
                connection.close()
                time.sleep(POLL_SECONDS)
                continue
            try:
                compile_build(connection, build)
            except Exception as error:
                traceback.print_exc()
                fail_build(connection, int(build["id"]), error)
        finally:
            connection.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Worker stopped")
        raise SystemExit(0)
