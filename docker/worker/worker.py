#!/usr/bin/env python3
"""Persistent Android build worker for Starlight Quantum Builder."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import string
import subprocess
import tempfile
import time
import traceback
import zlib
from pathlib import Path
from typing import Any, Callable
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
CANONICAL_ATTRIBUTION_BANNER = Path(os.environ.get(
    "QB_CANONICAL_ATTRIBUTION_BANNER",
    "/worker/assets/starlight_footer_banner_transparent.png",
)).resolve()

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


def replace_once(text: str, pattern: str, replacement: str | Callable[[re.Match[str]], str], label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Wrapper compiler could not patch {label}")
    return updated


NAVIGATION_ICON_IDS = frozenset({
    "home", "search", "grid", "star", "heart", "user", "settings", "info", "mail", "cart",
    "calendar", "camera", "map", "phone", "download", "help", "play", "folder", "globe", "link",
})
NAVIGATION_ICON_MAX_BYTES = 65536
NAVIGATION_ICON_ASSET_DIRECTORY = "quantum_nav_icons"


def validate_navigation_png(payload: bytes) -> None:
    """Validate bounded static PNG data using stdlib only; never decode arbitrary-size images."""
    error = "Navigation icons need a valid static PNG, 1 to 256 pixels per side and at most 64 KiB"
    if len(payload) > NAVIGATION_ICON_MAX_BYTES or not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(error)
    offset = 8
    header = None
    palette = False
    image_data = bytearray()
    has_idat = False
    idat_ended = False
    ended = False
    while offset < len(payload):
        if len(payload) - offset < 12:
            raise RuntimeError(error)
        length = int.from_bytes(payload[offset:offset + 4], "big")
        if length > len(payload) - offset - 12:
            raise RuntimeError(error)
        kind = payload[offset + 4:offset + 8]
        data = payload[offset + 8:offset + 8 + length]
        crc = int.from_bytes(payload[offset + 8 + length:offset + 12 + length], "big")
        if (not re.fullmatch(rb"[A-Za-z]{4}", kind) or binascii.crc32(kind + data) != crc
                or (header is None and kind != b"IHDR") or kind == b"acTL"):
            raise RuntimeError(error)
        offset += length + 12
        if kind == b"IHDR":
            if header is not None or length != 13:
                raise RuntimeError(error)
            width = int.from_bytes(data[:4], "big")
            height = int.from_bytes(data[4:8], "big")
            depth, color, compression, filtering, interlace = data[8:13]
            depths = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
            if (not 1 <= width <= 256 or not 1 <= height <= 256 or depth not in depths.get(color, set())
                    or compression != 0 or filtering != 0 or interlace not in {0, 1}):
                raise RuntimeError(error)
            header = (width, height, depth, color, interlace)
        elif kind == b"PLTE":
            if palette or has_idat or not 0 < length <= 768 or length % 3:
                raise RuntimeError(error)
            palette = True
        elif kind == b"IDAT":
            if idat_ended or (header[3] == 3 and not palette):
                raise RuntimeError(error)
            has_idat = True
            image_data.extend(data)
        elif kind == b"IEND":
            if length != 0 or not image_data or offset != len(payload):
                raise RuntimeError(error)
            ended = True
        else:
            if kind[0:1].isupper():
                raise RuntimeError(error)
            if has_idat:
                idat_ended = True
    if not ended or header is None:
        raise RuntimeError(error)

    width, height, depth, color, interlace = header
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    passes = [(0, 0, 1, 1)] if interlace == 0 else [
        (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
        (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2),
    ]
    rows = []
    for x, y, dx, dy in passes:
        pass_width = max(0, (width - x + dx - 1) // dx)
        pass_height = max(0, (height - y + dy - 1) // dy)
        if pass_width and pass_height:
            rows.extend([1 + (pass_width * channels * depth + 7) // 8] * pass_height)
    expected = sum(rows)
    try:
        decoder = zlib.decompressobj()
        decoded = decoder.decompress(image_data, expected + 1)
    except zlib.error as exc:
        raise RuntimeError(error) from exc
    if len(decoded) != expected or not decoder.eof or decoder.unconsumed_tail or decoder.unused_data:
        raise RuntimeError(error)
    offset = 0
    for row_size in rows:
        if decoded[offset] > 4:
            raise RuntimeError(error)
        offset += row_size


def valid_navigation_target(target: str, trusted_domain: str | None = None) -> bool:
    if (target.startswith("//") or re.search(r'[\s\\<>"{}|^\[\]\x00-\x1f\x7f]', target)
            or re.search(r"%(?![0-9a-f]{2})", target, re.IGNORECASE)):
        return False
    if not re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE):
        return True
    if not re.match(r"^https://[a-z0-9.-]+(?::[0-9]+)?(?:[/?#]|$)", target, re.IGNORECASE):
        return False
    try:
        parsed = urlparse(target)
        host = parsed.hostname or ""
        if parsed.scheme.lower() != "https" or not host or parsed.username is not None or parsed.password is not None:
            return False
        parsed.port  # Reject invalid/out-of-range ports consistently with the persisted profile.
    except ValueError:
        return False
    domain = trusted_domain.lower() if trusted_domain is not None else None
    return domain is None or host == domain or host.endswith("." + domain)


def compile_navigation_profile(project: Path, navigation: Any, *, trusted_domain: str | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Validate all menus/rules, then bundle their shared icons in one atomic pass."""
    if not isinstance(navigation, dict):
        raise RuntimeError("Native navigation must be an object")
    for field in ("top_bar", "sidebar", "bottom_tabs", "contextual_toolbar"):
        if field in navigation and not isinstance(navigation[field], bool):
            raise RuntimeError("Native navigation default visibility must be boolean")
    images: dict[str, bytes] = {}
    has_icons = False
    has_groups = False
    group_ids: set[str] = set()
    link_count = 0
    node_count = 0
    total_nodes = 0

    def text_field(item: dict[str, Any], field: str, limit: int) -> str:
        value = item.get(field)
        try:
            if isinstance(value, str) and value.strip() and len(value.strip().encode("utf-8")) <= limit:
                return value.strip()
        except UnicodeEncodeError:
            pass
        raise RuntimeError(f"Native navigation {field} is invalid")

    def compile_icons(item: dict[str, Any], normalized: dict[str, Any]) -> None:
        nonlocal has_icons
        for field in ("icon", "active_icon"):
            if field not in item:
                continue
            value = item[field]
            if not isinstance(value, str):
                raise RuntimeError("Navigation icons must be icon identifiers or PNG data URLs")
            value = value.strip()
            if value == "":
                continue
            if value in NAVIGATION_ICON_IDS:
                normalized[field] = value
            else:
                match = re.fullmatch(r"data:image/png;base64,([A-Za-z0-9+/]+={0,2})", value) if len(value) <= 87406 else None
                if match is None:
                    raise RuntimeError("Navigation icons must be a built-in icon or a PNG up to 64 KiB")
                try:
                    payload = base64.b64decode(match.group(1), validate=True)
                except (ValueError, binascii.Error) as exc:
                    raise RuntimeError("Navigation icon base64 is invalid") from exc
                if base64.b64encode(payload).decode("ascii") != match.group(1):
                    raise RuntimeError("Navigation icon base64 must use canonical encoding")
                validate_navigation_png(payload)
                filename = hashlib.sha256(payload).hexdigest() + ".png"
                images[filename] = payload
                normalized[field] = f"asset:{NAVIGATION_ICON_ASSET_DIRECTORY}/{filename}"
            has_icons = True

    def walk(items: Any, depth: int) -> list[dict[str, Any]]:
        nonlocal link_count, node_count, total_nodes, has_groups
        if not isinstance(items, list):
            raise RuntimeError("Native navigation items and group children must be lists")
        compiled = []
        for item in items:
            node_count += 1
            total_nodes += 1
            if node_count > 24 or total_nodes > 24:
                raise RuntimeError("Native navigation supports at most 24 total nodes across all menus")
            if not isinstance(item, dict):
                raise RuntimeError("Each native navigation item must be an object")
            kind = item.get("type", "link")
            if kind not in ("link", "group"):
                raise RuntimeError("Native navigation item type must be link or group")
            label = text_field(item, "label", 80)
            if kind == "group":
                has_groups = True
                if depth >= 3 or len(group_ids) >= 12:
                    raise RuntimeError("Native navigation supports at most 12 groups and 3 nested group levels")
                group_id = item.get("id")
                if not isinstance(group_id, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", group_id) or group_id in group_ids:
                    raise RuntimeError("Navigation group IDs must be unique lowercase identifiers of at most 40 characters")
                if "url" in item:
                    raise RuntimeError("Navigation groups cannot have a URL")
                collapsed = item.get("collapsed", False)
                if not isinstance(collapsed, bool):
                    raise RuntimeError("Navigation group collapsed must be boolean")
                group_ids.add(group_id)
                normalized = {
                    "type": "group", "id": group_id, "label": label, "collapsed": collapsed,
                    "children": walk(item.get("children"), depth + 1),
                }
            else:
                link_count += 1
                if link_count > 12:
                    raise RuntimeError("Native navigation supports at most 12 link destinations")
                if any(field in item for field in ("children", "id", "collapsed")):
                    raise RuntimeError("Link destinations cannot have group-only fields")
                target = text_field(item, "url", 2048)
                if not valid_navigation_target(target, trusted_domain):
                    raise RuntimeError("Native navigation targets must be valid relative or trusted HTTPS URLs")
                normalized = {"label": label, "url": target}
            compile_icons(item, normalized)
            compiled.append(normalized)
        return compiled

    compiled = walk(navigation.get("items", []), 0)
    menus = navigation.get("menus", [])
    if not isinstance(menus, list) or len(menus) > 3:
        raise RuntimeError("Native navigation supports at most three additional menus in a list")
    menu_ids = {"default"}
    compiled_menus = []
    for menu in menus:
        if not isinstance(menu, dict) or set(menu) - {"id", "label", "items"}:
            raise RuntimeError("Navigation menus must contain only id, label and items")
        menu_id = menu.get("id")
        if not isinstance(menu_id, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", menu_id) or menu_id in menu_ids:
            raise RuntimeError("Menu IDs must be unique lowercase identifiers; default is reserved")
        label = text_field(menu, "label", 80)
        menu_ids.add(menu_id)
        # Group identity and per-menu limits are independent; image assets and
        # the aggregate node budget belong to the whole navigation profile.
        group_ids = set()
        link_count = node_count = 0
        compiled_menus.append({"id": menu_id, "label": label, "items": walk(menu.get("items"), 0)})

    def menu_reference(value: Any) -> str:
        if not isinstance(value, str) or value not in menu_ids:
            raise RuntimeError("Navigation menu references must name an existing menu")
        return value

    sidebar_menu = menu_reference(navigation.get("sidebar_menu", "default"))
    bottom_tabs_menu = menu_reference(navigation.get("bottom_tabs_menu", "default"))
    rules = navigation.get("rules", [])
    if not isinstance(rules, list) or len(rules) > 16:
        raise RuntimeError("Native navigation supports at most 16 ordered URL rules in a list")
    compiled_rules = []
    for rule in rules:
        if not isinstance(rule, dict) or set(rule) - {"match", "path", "host", "sidebar_menu", "bottom_tabs_menu", "visibility"}:
            raise RuntimeError("Navigation URL rules must be objects with supported rule fields")
        match, path = rule.get("match"), rule.get("path")
        if match not in ("exact", "prefix"):
            raise RuntimeError("Navigation URL rules must use exact or prefix matching")
        if (not isinstance(path, str) or len(path) > 2048 or path.startswith("//")
                or not re.fullmatch(r"/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[0-9A-Fa-f]{2})*", path)):
            raise RuntimeError("Navigation rule paths must be ASCII paths starting with /, with valid escapes and no query or fragment")
        normalized_rule: dict[str, Any] = {"match": match, "path": path}
        if "host" in rule:
            # Reject Unicode before case folding: e.g. Kelvin sign lowercases
            # to ASCII k in Python but is not an ASCII DNS host in the profile.
            host = rule["host"].lower() if isinstance(rule["host"], str) and rule["host"].isascii() else ""
            domain = trusted_domain.lower() if trusted_domain is not None else None
            if (not host or len(host) > 253
                    or not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*", host)
                    or domain is not None and host != domain and not host.endswith("." + domain)):
                raise RuntimeError("Navigation rule hosts must be exact DNS names within the trusted domain")
            normalized_rule["host"] = host
        has_override = False
        for field in ("sidebar_menu", "bottom_tabs_menu"):
            if field in rule:
                normalized_rule[field] = menu_reference(rule[field])
                has_override = True
        if "visibility" in rule:
            visibility = rule["visibility"]
            if (not isinstance(visibility, dict) or not visibility
                    or set(visibility) - {"top_bar", "sidebar", "bottom_tabs", "contextual_toolbar"}
                    or any(not isinstance(value, bool) for value in visibility.values())):
                raise RuntimeError("Navigation visibility must be a nonempty object of supported boolean surface overrides")
            normalized_rule["visibility"] = dict(visibility)
            has_override = True
        if not has_override:
            raise RuntimeError("Each navigation URL rule must override a menu or surface visibility")
        compiled_rules.append(normalized_rule)

    extension = bool(compiled_menus or compiled_rules or sidebar_menu != "default" or bottom_tabs_menu != "default")
    profile = {"menus": compiled_menus, "sidebar_menu": sidebar_menu, "bottom_tabs_menu": bottom_tabs_menu, "rules": compiled_rules} if extension else {}

    if extension:
        menu_capability = project / "app/src/main/java/de/starlightunit/wrapper/navigation/NativeNavigationMenus.java"
        app_config = project / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
        if (not menu_capability.is_file() or not app_config.is_file()
                or not re.search(r"public\s+static\s+final\s+String\s+NATIVE_NAVIGATION_PROFILE_JSON\s*=", app_config.read_text(encoding="utf-8"))):
            raise RuntimeError("Navigation menus and URL rules require Quantum Mobile Wrapper beta12 or newer (NativeNavigationMenus.java or NATIVE_NAVIGATION_PROFILE_JSON missing); update the wrapper ref")

    group_capability = project / "app/src/main/java/de/starlightunit/wrapper/navigation/NativeNavigationGroups.java"
    if has_groups and not group_capability.is_file():
        raise RuntimeError("Navigation groups require Quantum Mobile Wrapper beta11 or newer (NativeNavigationGroups.java missing); update the wrapper ref")

    capability = project / "app/src/main/java/de/starlightunit/wrapper/navigation/NativeNavigationIcons.java"
    if has_icons and not capability.is_file():
        raise RuntimeError("Navigation icons require Quantum Mobile Wrapper beta10 or newer (NativeNavigationIcons.java missing); update the wrapper ref")

    # Java constant-pool strings use modified UTF-8. Count UTF-16 code units,
    # including the six-byte representation of non-BMP characters, before writes.
    for value in (compiled, profile):
        menu_json = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        utf16 = menu_json.encode("utf-16-be")
        units = (int.from_bytes(utf16[index:index + 2], "big") for index in range(0, len(utf16), 2))
        if sum(1 if 0 < unit < 128 else 2 if unit < 2048 else 3 for unit in units) > 65535:
            raise RuntimeError("Native navigation JSON exceeds the Java configuration string limit")

    asset_dir = project / "app/src/main/assets" / NAVIGATION_ICON_ASSET_DIRECTORY
    if asset_dir.is_symlink() or not asset_dir.resolve().is_relative_to(project.resolve()):
        raise RuntimeError("Navigation icon asset directory must stay inside the wrapper project")
    if images:
        asset_dir.mkdir(parents=True, exist_ok=True)
        # Validate every icon before writing. Replace individual files atomically.
        with tempfile.TemporaryDirectory(prefix=".nav-icons-", dir=asset_dir.parent) as temporary:
            for filename, payload in images.items():
                staged = Path(temporary) / filename
                staged.write_bytes(payload)
                os.replace(staged, asset_dir / filename)
    if asset_dir.is_dir():
        for old in asset_dir.iterdir():
            if re.fullmatch(r"[0-9a-f]{64}\.png", old.name) and old.name not in images and (old.is_file() or old.is_symlink()):
                old.unlink()
    return compiled, profile


def compile_navigation_items(project: Path, items: Any, *, trusted_domain: str | None = None) -> list[dict[str, Any]]:
    """Compatibility entry point for the existing single-menu compiler contract."""
    compiled, _ = compile_navigation_profile(project, {"items": items}, trusted_domain=trusted_domain)
    return compiled


def patch_app_config(project: Path, app: sqlite3.Row, config: dict[str, Any]) -> None:
    path = project / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
    text = path.read_text(encoding="utf-8")
    parsed = urlparse(str(app["start_url"]))
    start_host = parsed.hostname or str(config.get("trusted_domain") or "")
    trusted = str(config.get("trusted_domain") or start_host)
    web = config.get("web", {})
    if not isinstance(web, dict):
        web = {}
    interface = config.get("interface", {})
    if not isinstance(interface, dict):
        interface = {}
    theme = config.get("theme", {})
    if not isinstance(theme, dict):
        theme = {}
    navigation = config.get("navigation", {})
    if not isinstance(navigation, dict):
        navigation = {}
    links = config.get("links", {})
    if not isinstance(links, dict):
        links = {}
    plugins = config.get("plugins", {})
    custom_headers = web.get("custom_headers", {})
    if not isinstance(custom_headers, dict):
        custom_headers = {}
    asset_sync = config.get("asset_sync", {})
    if not isinstance(asset_sync, dict):
        asset_sync = {}
    manifest_url = str(asset_sync.get("manifest_url") or "").strip()
    if manifest_url.startswith("/"):
        manifest_url = f"{parsed.scheme}://{start_host}{manifest_url}"

    custom_css = str(web.get("custom_css") or "")
    custom_javascript = str(web.get("custom_js") or "")
    if len(custom_css.encode("utf-8")) > 48 * 1024:
        raise RuntimeError("Custom CSS exceeds the 48 KiB runtime limit")
    if len(custom_javascript.encode("utf-8")) > 48 * 1024:
        raise RuntimeError("Custom JavaScript exceeds the 48 KiB runtime limit")

    cookie_mode = str(web.get("cookie_persistence") or "persistent").strip().lower()
    if cookie_mode == "default":
        cookie_mode = "persistent"
    if cookie_mode not in {"persistent", "server", "session"}:
        raise RuntimeError("Unsupported cookie persistence mode")

    dark_mode = str(interface.get("dark_mode") or "dark").strip().lower()
    if dark_mode not in {"dark", "light", "auto"}:
        raise RuntimeError("Unsupported dark mode")

    def normalized_hex_color(value, fallback):
        candidate = str(value or fallback).strip().lower()
        if not re.fullmatch(r"#[0-9a-f]{6}", candidate):
            raise RuntimeError("Theme colors must use #RRGGBB")
        return candidate

    status_bar_color = normalized_hex_color(theme.get("status_bar"), "#020611")
    navigation_bar_color = normalized_hex_color(theme.get("navigation_bar"), "#020611")
    splash_background_color = normalized_hex_color(theme.get("splash_background"), "#020611")
    native_navigation_background = normalized_hex_color(navigation.get("background"), "#020611")
    native_navigation_foreground = normalized_hex_color(navigation.get("foreground"), "#ffffff")
    native_navigation_accent = normalized_hex_color(navigation.get("accent"), "#6fc7ff")
    native_navigation_items, native_navigation_profile = compile_navigation_profile(
        project, navigation,
        trusted_domain=str(config.get("trusted_domain") or parsed.hostname or ""),
    )

    new_window_policy = str(links.get("new_windows") or "blocked").strip().lower()
    if new_window_policy not in {"blocked", "internal", "external"}:
        raise RuntimeError("Unsupported new-window policy")
    deep_link_scheme = str(links.get("deep_link_scheme") or "").strip().lower()
    link_rules = links.get("rules", [])
    if not isinstance(link_rules, list):
        raise RuntimeError("Link rules must be a list")
    if len(link_rules) > 64:
        raise RuntimeError("Link handling supports at most 64 rules")

    string_values = {
        "START_URL": str(app["start_url"]),
        "TRUSTED_DOMAIN": trusted,
        "VERSION_NAME": str(app["version_name"]),
        "USER_AGENT_SUFFIX": str(web.get("user_agent_suffix") or " QuantumMobileWrapper") + "/" + str(app["version_name"]),
        "ASSET_STORE_TRUSTED_HOST": start_host,
        "APP_HEADER_VALUE": re.sub(r"[^a-z0-9-]+", "-", str(app["package_id"]).lower()).strip("-"),
        "CUSTOM_REQUEST_HEADERS_JSON": json.dumps(custom_headers, ensure_ascii=False, separators=(",", ":")),
        "CUSTOM_CSS": custom_css,
        "CUSTOM_JAVASCRIPT": custom_javascript,
        "COOKIE_PERSISTENCE_MODE": cookie_mode,
        "WEB_DARK_MODE": dark_mode,
        "STATUS_BAR_COLOR": status_bar_color,
        "NAVIGATION_BAR_COLOR": navigation_bar_color,
        "SPLASH_BACKGROUND_COLOR": splash_background_color,
        "NATIVE_NAVIGATION_TITLE": str(navigation.get("title") or app["name"]),
        "NATIVE_NAVIGATION_ITEMS_JSON": json.dumps(native_navigation_items, ensure_ascii=False, separators=(",", ":")),
        "NATIVE_NAVIGATION_BACKGROUND_COLOR": native_navigation_background,
        "NATIVE_NAVIGATION_FOREGROUND_COLOR": native_navigation_foreground,
        "NATIVE_NAVIGATION_ACCENT_COLOR": native_navigation_accent,
        "NEW_WINDOW_POLICY": new_window_policy,
        "DEEP_LINK_SCHEME": deep_link_scheme,
        "LINK_RULES_JSON": json.dumps(link_rules, ensure_ascii=False, separators=(",", ":")),
        "ASSET_MANIFEST_URL": manifest_url,
        "ASSET_DOWNLOADER_ROOTS": str(asset_sync.get("roots") or ""),
        "LOADING_INDICATOR_STYLE": str(interface.get("loading_indicator_style") or "top-bar"),
        "LOADING_INDICATOR_COLOR": str(interface.get("loading_indicator_color") or "#6fc7ff"),
    }
    if re.search(r"public\s+static\s+final\s+String\s+NATIVE_NAVIGATION_PROFILE_JSON\s*=", text):
        string_values["NATIVE_NAVIGATION_PROFILE_JSON"] = json.dumps(native_navigation_profile, ensure_ascii=False, separators=(",", ":"))
    for constant, value in string_values.items():
        text = replace_once(
            text,
            rf'(public static final String {re.escape(constant)}\s*=\s*)(?:"(?:\\.|[^"\\])*"|[^;]+)(;)',
            # A callback preserves Java/JSON escapes instead of interpreting
            # them a second time as regular-expression replacement syntax.
            lambda match, literal=java_literal(value): match.group(1) + literal + match.group(2),
            f"AppConfig.{constant}",
        )

    custom_splash_data_url = str(theme.get("custom_splash_data_url") or "")
    custom_splash_enabled = bool(custom_splash_data_url)

    boolean_values = {
        "CUSTOM_SPLASH_ENABLED": custom_splash_enabled,
        "ATTRIBUTION_BANNER_ENABLED": custom_splash_enabled,
        "KEEP_SCREEN_ON": bool(interface.get("keep_screen_on")),
        "PAGE_TRANSITIONS_ENABLED": bool(interface.get("page_transitions")),
        "TOP_NAVIGATION_ENABLED": bool(navigation.get("top_bar")),
        "SIDEBAR_NAVIGATION_ENABLED": bool(navigation.get("sidebar")),
        "BOTTOM_TABS_ENABLED": bool(navigation.get("bottom_tabs")),
        "CONTEXTUAL_TOOLBAR_ENABLED": bool(navigation.get("contextual_toolbar")),
        "IMMERSIVE_FULLSCREEN_ENABLED": bool(interface.get("fullscreen")),
        "PULL_TO_REFRESH_ENABLED": bool(interface.get("pull_to_refresh")),
        "PINCH_TO_ZOOM_ENABLED": bool(interface.get("pinch_to_zoom")),
        "QUANTUM_ASSET_STORE_ENABLED": bool(plugins.get("quantum_asset_store")),
        "ASSET_STORE_PAGE_WARMUP_ENABLED": False,
        "NATIVE_ASSET_DOWNLOADER_ENABLED": bool(plugins.get("native_asset_downloader")),
        "PUBLIC_DOWNLOADS_ENABLED": bool(config.get("permissions", {}).get("public_downloads", True)),
    }
    for constant, enabled in boolean_values.items():
        value = "true" if enabled else "false"
        text = replace_once(
            text,
            rf'(public static final boolean {re.escape(constant)}\s*=\s*)(true|false)(;)',
            rf'\g<1>{value}\g<3>',
            f"AppConfig.{constant}",
        )

    integer_values = {
        "ATTRIBUTION_BANNER_DURATION_MS": max(
            2000,
            min(4000, int(theme.get("attribution_banner_duration_ms") or 3000)),
        ),
        "FONT_SCALE_PERCENT": max(50, min(200, int(interface.get("font_scale") or 100))),
        "LOADING_BAR_THICKNESS_DP": max(1, min(12, int(interface.get("loading_bar_thickness_dp") or 3))),
        "LOADING_SPINNER_SIZE_DP": max(24, min(128, int(interface.get("loading_spinner_size_dp") or 56))),
        "LOADING_OVERLAY_DIM_PERCENT": max(0, min(90, int(interface.get("loading_overlay_dim_percent") or 35))),
    }
    for constant, value in integer_values.items():
        text = replace_once(
            text,
            rf'(public static final int {re.escape(constant)}\s*=\s*)\d+(;)',
            rf'\g<1>{value}\g<2>',
            f"AppConfig.{constant}",
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


def install_profile_launcher_icon(project: Path, config: dict[str, Any]) -> None:
    theme = config.get("theme", {})
    data_url = theme.get("app_icon_data_url", "") if isinstance(theme, dict) else ""
    if not isinstance(data_url, str) or not data_url:
        return

    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", data_url)
    if not match:
        raise RuntimeError("Profile app icon is not a supported data URL")

    extension = {"png": "png", "jpeg": "jpg", "webp": "webp"}[match.group(1)]
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("Profile app icon base64 is invalid") from exc

    if not payload or len(payload) > 600 * 1024:
        raise RuntimeError("Profile app icon must be between 1 byte and 600 KiB")
    if extension == "png" and not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Profile PNG icon signature is invalid")
    if extension == "jpg" and not payload.startswith(b"\xff\xd8\xff"):
        raise RuntimeError("Profile JPEG icon signature is invalid")
    if extension == "webp" and not (len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP"):
        raise RuntimeError("Profile WebP icon signature is invalid")

    drawable_dir = project / "app/src/main/res/drawable-nodpi"
    drawable_dir.mkdir(parents=True, exist_ok=True)
    for old in drawable_dir.glob("quantum_app_icon.*"):
        old.unlink()
    target = drawable_dir / f"quantum_app_icon.{extension}"
    target.write_bytes(payload)

    manifest = project / "app/src/main/AndroidManifest.xml"
    text = manifest.read_text(encoding="utf-8")
    text = replace_once(text, r'android:icon="@[^"]+"', 'android:icon="@drawable/quantum_app_icon"', "launcher icon")
    text = replace_once(text, r'android:roundIcon="@[^"]+"', 'android:roundIcon="@drawable/quantum_app_icon"', "round launcher icon")
    manifest.write_text(text, encoding="utf-8")


def install_profile_custom_splash_and_attribution(
    project: Path,
    config: dict[str, Any],
    output=None,
) -> bool:
    theme = config.get("theme", {})
    data_url = theme.get("custom_splash_data_url", "") if isinstance(theme, dict) else ""
    drawable_dir = project / "app/src/main/res/drawable-nodpi"
    drawable_dir.mkdir(parents=True, exist_ok=True)

    for old in drawable_dir.glob("quantum_custom_splash.*"):
        old.unlink()
    for old in drawable_dir.glob("quantum_studio_attribution_banner.*"):
        old.unlink()

    if not isinstance(data_url, str) or not data_url:
        return False

    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", data_url)
    if not match:
        raise RuntimeError("Profile custom splash is not a supported data URL")

    extension = {"png": "png", "jpeg": "jpg", "webp": "webp"}[match.group(1)]
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise RuntimeError("Profile custom splash base64 is invalid") from exc

    if not payload or len(payload) > 3 * 1024 * 1024:
        raise RuntimeError("Profile custom splash must be between 1 byte and 3 MiB")
    if extension == "png" and not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Profile custom splash PNG signature is invalid")
    if extension == "jpg" and not payload.startswith(b"\xff\xd8\xff"):
        raise RuntimeError("Profile custom splash JPEG signature is invalid")
    if extension == "webp" and not (
        len(payload) >= 12
        and payload[:4] == b"RIFF"
        and payload[8:12] == b"WEBP"
    ):
        raise RuntimeError("Profile custom splash WebP signature is invalid")

    if not CANONICAL_ATTRIBUTION_BANNER.is_file():
        raise RuntimeError(
            f"Canonical STU attribution banner missing: {CANONICAL_ATTRIBUTION_BANNER}"
        )
    banner = CANONICAL_ATTRIBUTION_BANNER.read_bytes()
    if len(banner) < 8 or not banner.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Canonical STU attribution banner is not valid PNG data")

    splash_target = drawable_dir / f"quantum_custom_splash.{extension}"
    banner_target = drawable_dir / "quantum_studio_attribution_banner.png"
    splash_target.write_bytes(payload)
    shutil.copy2(CANONICAL_ATTRIBUTION_BANNER, banner_target)

    message = (
        f"Installed custom splash ({len(payload)} bytes) with canonical STU attribution banner "
        f"({len(banner)} bytes)"
    )
    log(message)
    if output is not None:
        output.write(message + "\n")
        output.flush()
    return True


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

    links = config.get("links", {}) if isinstance(config.get("links", {}), dict) else {}
    deep_link_scheme = str(links.get("deep_link_scheme") or "").strip().lower()
    if deep_link_scheme:
        launcher_filter = """            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
"""
        deep_link_filter = f"""            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="{xml_escape(deep_link_scheme)}" />
            </intent-filter>
"""
        if launcher_filter not in text:
            raise RuntimeError("Wrapper compiler could not locate launcher intent filter")
        text = text.replace(launcher_filter, launcher_filter + deep_link_filter, 1)

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
        install_profile_launcher_icon(project, config)
        install_profile_custom_splash_and_attribution(project, config, output)
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
