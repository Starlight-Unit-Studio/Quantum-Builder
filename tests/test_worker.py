import importlib.util
import base64
import binascii
import copy
import hashlib
import io
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "qb_worker",
    Path(__file__).resolve().parents[1] / "docker" / "worker" / "worker.py",
)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(worker)


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data))


def navigation_png(width=1, height=1, *, depth=8, color=6, image_data=None, padding=0):
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color, 4)
    scanline_size = 1 + (max(0, width) * channels * depth + 7) // 8
    raw = b"\0" * (scanline_size * max(0, height)) if image_data is None else image_data
    header = struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, 0)
    extra = png_chunk(b"tEXt", b"x\0" + b"x" * padding) if padding else b""
    return (b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + extra
            + png_chunk(b"IDAT", zlib.compress(raw)) + png_chunk(b"IEND", b""))


def navigation_data_url(payload=None):
    return "data:image/png;base64," + base64.b64encode(navigation_png() if payload is None else payload).decode("ascii")


class WorkerCompilerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "app/src/main/java/de/starlightunit/wrapper/config").mkdir(parents=True)
        (self.root / "app/src/main/res/values").mkdir(parents=True)
        (self.root / "app/src/main").mkdir(parents=True, exist_ok=True)
        self.app = {
            "uuid": "abc123",
            "name": "Quantum Test",
            "package_id": "de.starlightunit.quantumtest",
            "start_url": "https://example.test/app/index.html",
            "version_name": "1.2.3",
            "version_code": 42,
            "min_sdk": 23,
            "target_sdk": 36,
        }
        self.config = {
            "trusted_domain": "example.test",
            "theme": {
                "status_bar": "#f5f6f8",
                "navigation_bar": "#101820",
                "splash_background": "#001122",
                "attribution_banner_duration_ms": 3000,
            },
            "navigation": {
                "top_bar": True,
                "sidebar": True,
                "bottom_tabs": True,
                "contextual_toolbar": True,
                "title": "Quantum Native",
                "background": "#112233",
                "foreground": "#fefefe",
                "accent": "#44ccff",
                "items": [
                    {"label": "Home", "url": "/"},
                    {"label": "News", "url": "/news"},
                ],
            },
            "links": {
                "new_windows": "external",
                "deep_link_scheme": "quantum",
                "rules": [
                    {"host": "example.test", "path_prefix": "/docs/", "action": "internal"},
                    {"scheme": "mailto", "action": "external"},
                ],
            },
            "interface": {
                "keep_screen_on": False,
                "orientation": "portrait",
                "fullscreen": True,
                "page_transitions": True,
                "dark_mode": "auto",
                "pull_to_refresh": True,
                "pinch_to_zoom": True,
                "font_scale": 125,
                "loading_indicator_style": "bottom-bar",
                "loading_indicator_color": "#ffaa00",
                "loading_bar_thickness_dp": 5,
                "loading_spinner_size_dp": 72,
                "loading_overlay_dim_percent": 45,
            },
            "web": {
                "user_agent_suffix": " QuantumTest",
                "custom_headers": {"X-Test-Client": "phone"},
                "custom_css": "body { background: #010203; }",
                "custom_js": "window.quantumPremium = true;",
                "cookie_persistence": "session",
            },
            "plugins": {"quantum_asset_store": True, "native_asset_downloader": True},
            "asset_sync": {"manifest_url": "/api/asset-manifest.json", "roots": "/assets/portraits/"},
            "permissions": {"location": True, "microphone": True, "camera": True, "public_downloads": True},
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_gradle_release_signing_is_added_to_build_type(self):
        gradle = self.root / "app/build.gradle"
        gradle.write_text(
            """plugins { id 'com.android.application' }\nandroid {\n    namespace 'de.starlightunit.wrapper'\n    compileSdk = 36\n    defaultConfig {\n        applicationId 'de.starlightunit.game'\n        minSdk = 23\n        targetSdk = 36\n        versionCode = 9\n        versionName = '0.1.0-beta9'\n    }\n    buildTypes {\n        debug { applicationIdSuffix = '.debug' }\n        release {\n            minifyEnabled = false\n        }\n    }\n}\n""",
            encoding="utf-8",
        )
        worker.patch_gradle(self.root, self.app)
        text = gradle.read_text(encoding="utf-8")
        self.assertIn("applicationId 'de.starlightunit.quantumtest'", text)
        self.assertIn("versionCode = 42", text)
        self.assertIn("versionName = '1.2.3'", text)
        signing_section = text.split("signingConfigs {", 1)[1].split("buildTypes {", 1)[0]
        build_section = text.split("buildTypes {", 1)[1]
        self.assertNotIn("signingConfig signingConfigs.release", signing_section)
        self.assertIn("signingConfig signingConfigs.release", build_section)

    def test_app_config_compiles_identity_and_keep_screen_on(self):
        path = self.root / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
        path.write_text(
            """package de.starlightunit.wrapper.config;
public final class AppConfig {
 public static final String START_URL = "https://old.test/";
 public static final String TRUSTED_DOMAIN = "old.test";
 public static final String VERSION_NAME = "0.0.1";
 public static final String USER_AGENT_SUFFIX = " old/" + VERSION_NAME;
 public static final String ASSET_STORE_TRUSTED_HOST = "old.test";
 public static final String APP_HEADER_VALUE = "old";
 public static final String CUSTOM_REQUEST_HEADERS_JSON = "{}";
 public static final String CUSTOM_CSS = "";
 public static final String CUSTOM_JAVASCRIPT = "";
 public static final String COOKIE_PERSISTENCE_MODE = "persistent";
 public static final String WEB_DARK_MODE = "dark";
 public static final String STATUS_BAR_COLOR = "#020611";
 public static final String NAVIGATION_BAR_COLOR = "#020611";
 public static final String SPLASH_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_TITLE = "Old";
 public static final String NATIVE_NAVIGATION_ITEMS_JSON = "[]";
 public static final String NATIVE_NAVIGATION_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_FOREGROUND_COLOR = "#ffffff";
 public static final String NATIVE_NAVIGATION_ACCENT_COLOR = "#6fc7ff";
 public static final String NEW_WINDOW_POLICY = "blocked";
 public static final String DEEP_LINK_SCHEME = "";
 public static final String LINK_RULES_JSON = "[]";
 public static final String ASSET_MANIFEST_URL = "";
 public static final String ASSET_DOWNLOADER_ROOTS = "";
 public static final String LOADING_INDICATOR_STYLE = "top-bar";
 public static final String LOADING_INDICATOR_COLOR = "#6fc7ff";
 public static final int LOADING_BAR_THICKNESS_DP = 3;
 public static final int LOADING_SPINNER_SIZE_DP = 56;
 public static final int LOADING_OVERLAY_DIM_PERCENT = 35;
 public static final boolean QUANTUM_ASSET_STORE_ENABLED = false;
 public static final boolean ASSET_STORE_PAGE_WARMUP_ENABLED = true;
 public static final boolean NATIVE_ASSET_DOWNLOADER_ENABLED = false;
 public static final boolean CUSTOM_SPLASH_ENABLED = false;
 public static final boolean ATTRIBUTION_BANNER_ENABLED = false;
 public static final boolean KEEP_SCREEN_ON = true;
 public static final boolean PAGE_TRANSITIONS_ENABLED = false;
 public static final boolean TOP_NAVIGATION_ENABLED = false;
 public static final boolean SIDEBAR_NAVIGATION_ENABLED = false;
 public static final boolean BOTTOM_TABS_ENABLED = false;
 public static final boolean CONTEXTUAL_TOOLBAR_ENABLED = false;
 public static final boolean PUBLIC_DOWNLOADS_ENABLED = true;
 public static final boolean IMMERSIVE_FULLSCREEN_ENABLED = true;
 public static final boolean PULL_TO_REFRESH_ENABLED = false;
 public static final boolean PINCH_TO_ZOOM_ENABLED = false;
 public static final int ATTRIBUTION_BANNER_DURATION_MS = 3000;
 public static final int FONT_SCALE_PERCENT = 100;
}
""",
            encoding="utf-8",
        )
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        self.assertIn('START_URL = "https://example.test/app/index.html";', text)
        self.assertIn('TRUSTED_DOMAIN = "example.test";', text)
        self.assertIn('ASSET_STORE_TRUSTED_HOST = "example.test";', text)
        self.assertIn('CUSTOM_SPLASH_ENABLED = false;', text)
        self.assertIn('ATTRIBUTION_BANNER_ENABLED = false;', text)
        self.assertIn('ATTRIBUTION_BANNER_DURATION_MS = 3000;', text)
        self.assertIn('KEEP_SCREEN_ON = false;', text)
        self.assertIn('PAGE_TRANSITIONS_ENABLED = true;', text)
        self.assertIn('TOP_NAVIGATION_ENABLED = true;', text)
        self.assertIn('SIDEBAR_NAVIGATION_ENABLED = true;', text)
        self.assertIn('BOTTOM_TABS_ENABLED = true;', text)
        self.assertIn('CONTEXTUAL_TOOLBAR_ENABLED = true;', text)
        self.assertIn('NATIVE_NAVIGATION_TITLE = "Quantum Native";', text)
        self.assertIn('NATIVE_NAVIGATION_BACKGROUND_COLOR = "#112233";', text)
        self.assertIn('NATIVE_NAVIGATION_FOREGROUND_COLOR = "#fefefe";', text)
        self.assertIn('NATIVE_NAVIGATION_ACCENT_COLOR = "#44ccff";', text)
        self.assertIn('NEW_WINDOW_POLICY = "external";', text)
        self.assertIn('DEEP_LINK_SCHEME = "quantum";', text)
        self.assertIn('LINK_RULES_JSON = "[{\\\"host\\\":\\\"example.test\\\",\\\"path_prefix\\\":\\\"/docs/\\\",\\\"action\\\":\\\"internal\\\"},{\\\"scheme\\\":\\\"mailto\\\",\\\"action\\\":\\\"external\\\"}]";', text)
        self.assertIn('NATIVE_NAVIGATION_ITEMS_JSON = "[{\\\"label\\\":\\\"Home\\\",\\\"url\\\":\\\"/\\\"},{\\\"label\\\":\\\"News\\\",\\\"url\\\":\\\"/news\\\"}]";', text)
        self.assertIn('WEB_DARK_MODE = "auto";', text)
        self.assertIn('STATUS_BAR_COLOR = "#f5f6f8";', text)
        self.assertIn('NAVIGATION_BAR_COLOR = "#101820";', text)
        self.assertIn('SPLASH_BACKGROUND_COLOR = "#001122";', text)
        self.assertIn('PUBLIC_DOWNLOADS_ENABLED = true;', text)
        self.assertIn('IMMERSIVE_FULLSCREEN_ENABLED = true;', text)
        self.assertIn('PULL_TO_REFRESH_ENABLED = true;', text)
        self.assertIn('PINCH_TO_ZOOM_ENABLED = true;', text)
        self.assertIn('FONT_SCALE_PERCENT = 125;', text)
        self.assertIn('QUANTUM_ASSET_STORE_ENABLED = true;', text)
        self.assertIn('ASSET_STORE_PAGE_WARMUP_ENABLED = false;', text)
        self.assertIn('ASSET_MANIFEST_URL = "https://example.test/api/asset-manifest.json";', text)
        self.assertIn('ASSET_DOWNLOADER_ROOTS = "/assets/portraits/";', text)
        self.assertIn('NATIVE_ASSET_DOWNLOADER_ENABLED = true;', text)
        self.assertIn('CUSTOM_CSS = "body { background: #010203; }";', text)
        self.assertIn('CUSTOM_JAVASCRIPT = "window.quantumPremium = true;";', text)
        self.assertIn('COOKIE_PERSISTENCE_MODE = "session";', text)

        # The real AppConfig patch must reference packaged assets, not embed image data.
        capability = self.root / "app/src/main/java/de/starlightunit/wrapper/navigation/NativeNavigationIcons.java"
        capability.parent.mkdir(parents=True)
        capability.write_text("// supported runtime fixture\n", encoding="utf-8")
        self.config["navigation"]["items"][0]["icon"] = navigation_data_url()
        self.config["navigation"]["items"][0]["active_icon"] = "home"
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        self.assertNotIn("data:image/png;base64,", text)
        self.assertIn("asset:quantum_nav_icons/", text)
        self.assertIn('\\"active_icon\\":\\"home\\"', text)

        # The actual Java configuration retains the recursive tree and quoted
        # labels. Neither JSON escaping layer may be consumed by re.sub().
        group_capability = capability.with_name("NativeNavigationGroups.java")
        group_capability.write_text("// supported runtime fixture\n", encoding="utf-8")
        group_label = 'Account "settings" \\ notes'
        self.config["navigation"]["items"] = [{
            "type": "group", "id": "account", "label": group_label, "collapsed": True,
            "children": self.config["navigation"]["items"],
        }]
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        menu_line = next(line for line in text.splitlines() if "String NATIVE_NAVIGATION_ITEMS_JSON = " in line)
        compiled_tree = json.loads(json.loads(menu_line.split(" = ", 1)[1].removesuffix(";")))
        self.assertEqual(compiled_tree[0]["label"], group_label)
        self.assertTrue(compiled_tree[0]["collapsed"])
        self.assertEqual([leaf["url"] for leaf in compiled_tree[0]["children"]], ["/", "/news"])
        self.assertTrue(compiled_tree[0]["children"][0]["icon"].startswith("asset:quantum_nav_icons/"))
        assets = self.root / "app/src/main/assets/quantum_nav_icons"
        saved_assets = {asset.name: asset.read_bytes() for asset in assets.iterdir()}

        # Invalid descendants and an older selected wrapper leave both source
        # and previously bundled icons intact during a rebuild.
        self.config["navigation"]["items"][0]["children"][1]["url"] = "https://evil.test/"
        with self.assertRaisesRegex(RuntimeError, "trusted HTTPS"):
            worker.patch_app_config(self.root, self.app, self.config)
        self.assertEqual(path.read_text(encoding="utf-8"), text)
        self.assertEqual({asset.name: asset.read_bytes() for asset in assets.iterdir()}, saved_assets)
        self.config["navigation"]["items"][0]["children"][1]["url"] = "/news"
        group_capability.unlink()
        with self.assertRaisesRegex(RuntimeError, "beta11 or newer"):
            worker.patch_app_config(self.root, self.app, self.config)
        self.assertEqual(path.read_text(encoding="utf-8"), text)
        self.assertEqual({asset.name: asset.read_bytes() for asset in assets.iterdir()}, saved_assets)

    def test_loading_indicator_settings_compile_into_app_config(self):
        path = self.root / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
        path.write_text(
            """package de.starlightunit.wrapper.config;
public final class AppConfig {
 public static final String START_URL = "https://old.test/";
 public static final String TRUSTED_DOMAIN = "old.test";
 public static final String VERSION_NAME = "0.0.1";
 public static final String USER_AGENT_SUFFIX = " old/" + VERSION_NAME;
 public static final String ASSET_STORE_TRUSTED_HOST = "old.test";
 public static final String APP_HEADER_VALUE = "old";
 public static final String CUSTOM_REQUEST_HEADERS_JSON = "{}";
 public static final String CUSTOM_CSS = "";
 public static final String CUSTOM_JAVASCRIPT = "";
 public static final String COOKIE_PERSISTENCE_MODE = "persistent";
 public static final String WEB_DARK_MODE = "dark";
 public static final String STATUS_BAR_COLOR = "#020611";
 public static final String NAVIGATION_BAR_COLOR = "#020611";
 public static final String SPLASH_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_TITLE = "Old";
 public static final String NATIVE_NAVIGATION_ITEMS_JSON = "[]";
 public static final String NATIVE_NAVIGATION_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_FOREGROUND_COLOR = "#ffffff";
 public static final String NATIVE_NAVIGATION_ACCENT_COLOR = "#6fc7ff";
 public static final String NEW_WINDOW_POLICY = "blocked";
 public static final String DEEP_LINK_SCHEME = "";
 public static final String LINK_RULES_JSON = "[]";
 public static final String ASSET_MANIFEST_URL = "";
 public static final String ASSET_DOWNLOADER_ROOTS = "";
 public static final String LOADING_INDICATOR_STYLE = "top-bar";
 public static final String LOADING_INDICATOR_COLOR = "#6fc7ff";
 public static final int LOADING_BAR_THICKNESS_DP = 3;
 public static final int LOADING_SPINNER_SIZE_DP = 56;
 public static final int LOADING_OVERLAY_DIM_PERCENT = 35;
 public static final boolean QUANTUM_ASSET_STORE_ENABLED = false;
 public static final boolean ASSET_STORE_PAGE_WARMUP_ENABLED = true;
 public static final boolean NATIVE_ASSET_DOWNLOADER_ENABLED = false;
 public static final boolean CUSTOM_SPLASH_ENABLED = false;
 public static final boolean ATTRIBUTION_BANNER_ENABLED = false;
 public static final boolean KEEP_SCREEN_ON = true;
 public static final boolean PAGE_TRANSITIONS_ENABLED = false;
 public static final boolean TOP_NAVIGATION_ENABLED = false;
 public static final boolean SIDEBAR_NAVIGATION_ENABLED = false;
 public static final boolean BOTTOM_TABS_ENABLED = false;
 public static final boolean CONTEXTUAL_TOOLBAR_ENABLED = false;
 public static final boolean PUBLIC_DOWNLOADS_ENABLED = true;
 public static final boolean IMMERSIVE_FULLSCREEN_ENABLED = true;
 public static final boolean PULL_TO_REFRESH_ENABLED = false;
 public static final boolean PINCH_TO_ZOOM_ENABLED = false;
 public static final int ATTRIBUTION_BANNER_DURATION_MS = 3000;
 public static final int FONT_SCALE_PERCENT = 100;
}
""",
            encoding="utf-8",
        )
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        self.assertIn('LOADING_INDICATOR_STYLE = "bottom-bar";', text)
        self.assertIn('LOADING_INDICATOR_COLOR = "#ffaa00";', text)
        self.assertIn('LOADING_BAR_THICKNESS_DP = 5;', text)
        self.assertIn('LOADING_SPINNER_SIZE_DP = 72;', text)
        self.assertIn('LOADING_OVERLAY_DIM_PERCENT = 45;', text)

    def test_profile_launcher_icon_replaces_manifest_launcher_resource(self):
        manifest = self.root / "app/src/main/AndroidManifest.xml"
        manifest.write_text(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher"></application></manifest>',
            encoding="utf-8",
        )
        png = b"\x89PNG\r\n\x1a\n" + b"icon"
        import base64
        config = {"theme": {"app_icon_data_url": "data:image/png;base64," + base64.b64encode(png).decode("ascii")}}
        worker.install_profile_launcher_icon(self.root, config)
        icon = self.root / "app/src/main/res/drawable-nodpi/quantum_app_icon.png"
        self.assertEqual(icon.read_bytes(), png)
        text = manifest.read_text(encoding="utf-8")
        self.assertIn('android:icon="@drawable/quantum_app_icon"', text)
        self.assertIn('android:roundIcon="@drawable/quantum_app_icon"', text)

    def test_custom_splash_installs_profile_asset_and_canonical_attribution(self):
        import base64

        drawable = self.root / "app/src/main/res/drawable-nodpi"
        drawable.mkdir(parents=True, exist_ok=True)
        splash = b"\x89PNG\r\n\x1a\n" + b"custom-splash"
        banner = b"\x89PNG\r\n\x1a\n" + b"stu-banner"
        banner_source = self.root / "canonical-banner.png"
        banner_source.write_bytes(banner)
        config = {
            "theme": {
                "custom_splash_data_url": "data:image/png;base64,"
                + base64.b64encode(splash).decode("ascii")
            }
        }

        previous = worker.CANONICAL_ATTRIBUTION_BANNER
        worker.CANONICAL_ATTRIBUTION_BANNER = banner_source
        try:
            output = io.StringIO()
            installed = worker.install_profile_custom_splash_and_attribution(
                self.root,
                config,
                output,
            )
        finally:
            worker.CANONICAL_ATTRIBUTION_BANNER = previous

        self.assertTrue(installed)
        self.assertEqual(
            (drawable / "quantum_custom_splash.png").read_bytes(),
            splash,
        )
        self.assertEqual(
            (drawable / "quantum_studio_attribution_banner.png").read_bytes(),
            banner,
        )
        self.assertIn("Installed custom splash", output.getvalue())

    def test_missing_custom_splash_installs_no_attribution_banner(self):
        drawable = self.root / "app/src/main/res/drawable-nodpi"
        drawable.mkdir(parents=True, exist_ok=True)
        (drawable / "quantum_custom_splash.png").write_bytes(b"stale")
        (drawable / "quantum_studio_attribution_banner.png").write_bytes(b"stale")

        installed = worker.install_profile_custom_splash_and_attribution(
            self.root,
            {"theme": {"custom_splash_data_url": ""}},
        )

        self.assertFalse(installed)
        self.assertFalse((drawable / "quantum_custom_splash.png").exists())
        self.assertFalse((drawable / "quantum_studio_attribution_banner.png").exists())

    def test_custom_splash_rejects_invalid_image_signature(self):
        import base64

        payload = b"not-a-png"
        banner_source = self.root / "canonical-banner.png"
        banner_source.write_bytes(b"\x89PNG\r\n\x1a\nvalid")
        config = {
            "theme": {
                "custom_splash_data_url": "data:image/png;base64,"
                + base64.b64encode(payload).decode("ascii")
            }
        }

        previous = worker.CANONICAL_ATTRIBUTION_BANNER
        worker.CANONICAL_ATTRIBUTION_BANNER = banner_source
        try:
            with self.assertRaisesRegex(RuntimeError, "PNG signature"):
                worker.install_profile_custom_splash_and_attribution(self.root, config)
        finally:
            worker.CANONICAL_ATTRIBUTION_BANNER = previous

    def test_custom_splash_flags_and_duration_compile_into_app_config(self):
        import base64
        import copy

        config = copy.deepcopy(self.config)
        config["theme"]["custom_splash_data_url"] = (
            "data:image/png;base64,"
            + base64.b64encode(b"\x89PNG\r\n\x1a\nsmall").decode("ascii")
        )
        config["theme"]["attribution_banner_duration_ms"] = 4000

        path = self.root / "app/src/main/java/de/starlightunit/wrapper/config/AppConfig.java"
        path.write_text(
            """package de.starlightunit.wrapper.config;
public final class AppConfig {
 public static final String START_URL = "https://old.test/";
 public static final String TRUSTED_DOMAIN = "old.test";
 public static final String VERSION_NAME = "0.0.1";
 public static final String USER_AGENT_SUFFIX = " old/" + VERSION_NAME;
 public static final String ASSET_STORE_TRUSTED_HOST = "old.test";
 public static final String APP_HEADER_VALUE = "old";
 public static final String CUSTOM_REQUEST_HEADERS_JSON = "{}";
 public static final String CUSTOM_CSS = "";
 public static final String CUSTOM_JAVASCRIPT = "";
 public static final String COOKIE_PERSISTENCE_MODE = "persistent";
 public static final String WEB_DARK_MODE = "dark";
 public static final String STATUS_BAR_COLOR = "#020611";
 public static final String NAVIGATION_BAR_COLOR = "#020611";
 public static final String SPLASH_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_TITLE = "Old";
 public static final String NATIVE_NAVIGATION_ITEMS_JSON = "[]";
 public static final String NATIVE_NAVIGATION_BACKGROUND_COLOR = "#020611";
 public static final String NATIVE_NAVIGATION_FOREGROUND_COLOR = "#ffffff";
 public static final String NATIVE_NAVIGATION_ACCENT_COLOR = "#6fc7ff";
 public static final String NEW_WINDOW_POLICY = "blocked";
 public static final String DEEP_LINK_SCHEME = "";
 public static final String LINK_RULES_JSON = "[]";
 public static final String ASSET_MANIFEST_URL = "";
 public static final String ASSET_DOWNLOADER_ROOTS = "";
 public static final String LOADING_INDICATOR_STYLE = "top-bar";
 public static final String LOADING_INDICATOR_COLOR = "#6fc7ff";
 public static final int LOADING_BAR_THICKNESS_DP = 3;
 public static final int LOADING_SPINNER_SIZE_DP = 56;
 public static final int LOADING_OVERLAY_DIM_PERCENT = 35;
 public static final boolean QUANTUM_ASSET_STORE_ENABLED = false;
 public static final boolean ASSET_STORE_PAGE_WARMUP_ENABLED = true;
 public static final boolean NATIVE_ASSET_DOWNLOADER_ENABLED = false;
 public static final boolean CUSTOM_SPLASH_ENABLED = false;
 public static final boolean ATTRIBUTION_BANNER_ENABLED = false;
 public static final int ATTRIBUTION_BANNER_DURATION_MS = 3000;
 public static final boolean KEEP_SCREEN_ON = true;
 public static final boolean PAGE_TRANSITIONS_ENABLED = false;
 public static final boolean TOP_NAVIGATION_ENABLED = false;
 public static final boolean SIDEBAR_NAVIGATION_ENABLED = false;
 public static final boolean BOTTOM_TABS_ENABLED = false;
 public static final boolean CONTEXTUAL_TOOLBAR_ENABLED = false;
 public static final boolean PUBLIC_DOWNLOADS_ENABLED = true;
 public static final boolean IMMERSIVE_FULLSCREEN_ENABLED = true;
 public static final boolean PULL_TO_REFRESH_ENABLED = false;
 public static final boolean PINCH_TO_ZOOM_ENABLED = false;
 public static final int FONT_SCALE_PERCENT = 100;
}
""",
            encoding="utf-8",
        )
        worker.patch_app_config(self.root, self.app, config)
        text = path.read_text(encoding="utf-8")
        self.assertIn("CUSTOM_SPLASH_ENABLED = true;", text)
        self.assertIn("ATTRIBUTION_BANNER_ENABLED = true;", text)
        self.assertIn("ATTRIBUTION_BANNER_DURATION_MS = 4000;", text)

    def test_manifest_adds_only_requested_runtime_permissions(self):
        manifest = self.root / "app/src/main/AndroidManifest.xml"
        manifest.write_text(
            """<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <uses-permission android:name=\"android.permission.INTERNET\" />\n    <application><activity android:name=\"de.starlightunit.wrapper.MainActivity\" android:launchMode=\"singleTask\">\n            <intent-filter>\n                <action android:name=\"android.intent.action.MAIN\" />\n                <category android:name=\"android.intent.category.LAUNCHER\" />\n            </intent-filter>\n        </activity></application>\n</manifest>\n""",
            encoding="utf-8",
        )
        worker.patch_manifest(self.root, self.config)
        text = manifest.read_text(encoding="utf-8")
        self.assertIn("android.permission.ACCESS_FINE_LOCATION", text)
        self.assertIn("android.permission.RECORD_AUDIO", text)
        self.assertIn("android.permission.CAMERA", text)
        self.assertIn('android:screenOrientation="portrait"', text)
        self.assertIn('<data android:scheme="quantum" />', text)
        self.assertIn('android.intent.category.BROWSABLE', text)

    def test_profile_never_contains_signing_material(self):
        worker.write_profile(self.root, self.app, self.config, 7)
        data = json.loads((self.root / "quantum-builder-profile.json").read_text(encoding="utf-8"))
        self.assertEqual(data["build_id"], 7)
        self.assertNotIn("password", json.dumps(data).lower())
        self.assertNotIn("keystore", json.dumps(data).lower())

    def test_mandatory_production_splash_replaces_wrapper_copy(self):
        source = self.root / "canonical.jpg"
        payload = b"\xff\xd8\xff\xe0"
        payload += b"\x00" * (worker.CANONICAL_PRODUCTION_SPLASH_SIZE - len(payload))
        source.write_bytes(payload)

        drawable = self.root / "app/src/main/res/drawable-nodpi"
        drawable.mkdir(parents=True, exist_ok=True)
        stale_webp = drawable / "quantum_production_splash.webp"
        stale_webp.write_bytes(b"stale")

        previous = worker.CANONICAL_PRODUCTION_SPLASH
        worker.CANONICAL_PRODUCTION_SPLASH = source
        try:
            output = io.StringIO()
            target = worker.install_mandatory_production_splash(self.root, output)
        finally:
            worker.CANONICAL_PRODUCTION_SPLASH = previous

        self.assertFalse(stale_webp.exists())
        self.assertEqual(target.name, "quantum_production_splash.jpg")
        self.assertEqual(target.read_bytes(), payload)
        self.assertIn("Installed mandatory production splash", output.getvalue())

    def test_generated_release_build_uses_staged_gradle_phases(self):
        self.assertEqual(
            worker.GRADLE_PHASES,
            (
                ("android-lint", "Running Android debug lint", "lintDebug"),
                ("android-test", "Running Android unit tests", "test"),
                ("android-apk", "Building signed release APK", "assembleRelease"),
                ("android-aab", "Building signed release AAB", "bundleRelease"),
            ),
        )

    def test_failure_excerpt_prefers_gradle_root_cause_over_footer(self):
        lines = [f"noise {index}" for index in range(40)]
        lines += [
            "FAILURE: Build failed with an exception.",
            "* What went wrong:",
            "Execution failed for task ':app:lintDebug'.",
            "> Lint found 1 error, 0 warnings.",
        ]
        lines += [f"generic footer {index}" for index in range(80)]
        excerpt = worker.failure_excerpt(lines)
        self.assertIn("Execution failed for task ':app:lintDebug'", excerpt)
        self.assertIn("Lint found 1 error", excerpt)
        self.assertNotEqual(excerpt, "\n".join(lines[-45:]))

    def test_sensitive_keytool_arguments_are_redacted_from_logs_and_errors(self):
        secret = "do-not-log-this-password"
        command = [
            "keytool", "-genkeypair", "-storepass", secret,
            "-keypass", secret, "-alias", "quantum-release",
        ]
        shown = worker.redact_command(command)
        rendered = " ".join(shown)
        self.assertNotIn(secret, rendered)
        self.assertEqual(
            shown,
            [
                "keytool", "-genkeypair", "-storepass", "***",
                "-keypass", "***", "-alias", "quantum-release",
            ],
        )
        self.assertEqual(command[3], secret)
        self.assertEqual(command[5], secret)


class NavigationGroupCompilerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.capabilities = self.root / "app/src/main/java/de/starlightunit/wrapper/navigation"
        self.capabilities.mkdir(parents=True)
        for name in ("NativeNavigationIcons.java", "NativeNavigationGroups.java"):
            (self.capabilities / name).write_text("// runtime capability fixture\n", encoding="utf-8")
        self.assets = self.root / "app/src/main/assets/quantum_nav_icons"

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def group(identifier="section", children=None, **extra):
        return {"type": "group", "id": identifier, "label": "Section", "children": [] if children is None else children, **extra}

    def compile(self, items):
        return worker.compile_navigation_items(self.root, items, trusted_domain="example.test")

    def test_nested_groups_preserve_order_state_icons_and_short_asset_references(self):
        png = navigation_png(24, 18)
        url = navigation_data_url(png)
        items = [{"label": "Home", "url": "/"}, self.group("outer", [
            {"type": "link", "label": "News", "url": "/news", "active_icon": url},
            self.group("inner", [self.group("third", [{"label": "Deep", "url": "https://docs.example.test/deep"}])],
                       collapsed=True, icon="folder"),
        ], icon=url, active_icon="star")]
        original = copy.deepcopy(items)
        compiled = self.compile(items)
        self.assertEqual(items, original)
        outer = compiled[1]
        self.assertFalse(outer["collapsed"])
        self.assertEqual(outer["type"], "group")
        self.assertEqual(outer["children"][0]["label"], "News")
        self.assertNotIn("type", outer["children"][0])
        self.assertTrue(outer["children"][1]["collapsed"])
        self.assertEqual(outer["children"][1]["children"][0]["children"][0]["url"], "https://docs.example.test/deep")
        asset = "asset:quantum_nav_icons/" + hashlib.sha256(png).hexdigest() + ".png"
        self.assertEqual(outer["icon"], asset)
        self.assertEqual(outer["children"][0]["active_icon"], asset)
        self.assertEqual(len(list(self.assets.iterdir())), 1)
        self.assertNotIn("base64", json.dumps(compiled))

    def test_limits_count_all_branches_and_allow_three_group_levels(self):
        groups = [self.group("g" + str(i), [{"label": "Leaf", "url": "/" + str(i)}]) for i in range(12)]
        self.assertEqual(len(self.compile(groups)), 12)
        self.assertEqual(self.compile([self.group("a", [self.group("b", [self.group("c")])])])[0]["id"], "a")
        bad = [
            [self.group("g" + str(i)) for i in range(13)],
            [self.group("left", [{"label": "Item", "url": "/" + str(i)} for i in range(7)]),
             self.group("right", [{"label": "Item", "url": "/" + str(i)} for i in range(6)])],
            [self.group("a", [self.group("b", [self.group("c", [self.group("d")])])])],
            groups + [{"label": "Too many", "url": "/extra"}],
        ]
        for value in bad:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                self.compile(value)

    def test_invalid_group_shapes_and_duplicate_ids_fail_without_changing_assets(self):
        original_png = navigation_data_url()
        self.compile([{"label": "Keep", "url": "/", "icon": original_png}])
        saved = {path.name: path.read_bytes() for path in self.assets.iterdir()}
        invalid_groups = [
            self.group(""), self.group(" Bad "), self.group("UPPER"), self.group("a" * 41),
            self.group("a/b"), self.group("one", collapsed="false"), self.group("one", collapsed=None),
            self.group("one", url=""), self.group("one", url=None),
            self.group("one", children={}), self.group("one", children="[]"),
            {"type": "group", "id": "missing", "label": "Missing children"},
            self.group("one", [self.group("one")]),
            self.group("one", [{"label": "Bad type", "url": "/", "type": "other"}]),
            self.group("one", [{"label": "Bad type", "url": "/", "type": None}]),
            self.group("one", [{"label": "Child", "url": "/", "children": []}]),
            self.group("one", [{"label": "Child", "url": "/", "id": "leaf"}]),
            self.group("one", [{"label": "Child", "url": "/", "collapsed": False}]),
            self.group("one", [{"label": [], "url": "/"}]),
        ]
        for node in invalid_groups:
            with self.subTest(node=node), self.assertRaises(RuntimeError):
                self.compile([self.group("valid", icon=navigation_data_url(navigation_png(2, 2))), node])
            self.assertEqual({path.name: path.read_bytes() for path in self.assets.iterdir()}, saved)
        with self.assertRaises(RuntimeError):
            self.compile([self.group("duplicate"), self.group("branch", [self.group("duplicate")])])

    def test_collapsed_descendants_cannot_bypass_url_or_icon_validation(self):
        unsafe = ["https://evil.test/", "https://example.test.evil.test/", "//evil.test/", "http://example.test/",
                  "https://user:pass@example.test/", "javascript:alert(1)", "/bad path", "/bad%escape",
                  "https://example.test\\@evil.test/", "https://%65xample.test/", "https://example.test:999999/"]
        for target in unsafe:
            with self.subTest(target=target), self.assertRaisesRegex(RuntimeError, "trusted HTTPS"):
                self.compile([self.group("hidden", [self.group("deeper", [{"label": "Unsafe", "url": target}])], collapsed=True)])
        with self.assertRaises(RuntimeError):
            self.compile([self.group("hidden", [self.group("bad", active_icon="https://evil.test/icon.png")])])
        self.assertFalse(self.assets.exists())

    def test_runtime_capabilities_are_independent_and_checked_before_asset_writes(self):
        (self.capabilities / "NativeNavigationGroups.java").unlink()
        self.assertEqual(self.compile([{"label": "Legacy", "url": "/", "icon": "home"}])[0]["icon"], "home")
        with self.assertRaisesRegex(RuntimeError, "beta11 or newer"):
            self.compile([self.group("section", icon=navigation_data_url())])
        self.assertFalse(self.assets.exists())
        (self.capabilities / "NativeNavigationGroups.java").write_text("// supported\n")
        (self.capabilities / "NativeNavigationIcons.java").unlink()
        self.assertEqual(self.compile([self.group()])[0]["children"], [])
        with self.assertRaisesRegex(RuntimeError, "beta10 or newer"):
            self.compile([self.group(icon="folder")])
        with self.assertRaisesRegex(RuntimeError, "beta10 or newer"):
            self.compile([self.group("parent", [self.group("child", [
                {"label": "Nested", "url": "/", "active_icon": navigation_data_url()},
            ])])])
        self.assertFalse(self.assets.exists())

    def test_all_48_maximum_size_icons_stay_out_of_java_constants_and_cleanup_safely(self):
        plain = navigation_png()
        image = navigation_png(padding=65536 - len(plain) - 14)
        self.assertEqual(len(image), 65536)
        url = navigation_data_url(image)
        items = [self.group("g" + str(i), [{"label": "A" * 80, "url": "/" + "a" * 2047,
                                         "icon": url, "active_icon": url}],
                            icon=url, active_icon=url) for i in range(12)]
        compiled = self.compile(items)
        self.assertEqual(len(list(self.assets.iterdir())), 1)
        self.assertNotIn("base64", json.dumps(compiled))
        self.assertLess(len(json.dumps(compiled, ensure_ascii=False).encode("utf-8")), 65535)
        keep = self.assets / "keep.txt"
        keep.write_text("unrelated")
        self.compile([self.group()])
        self.assertEqual([path.name for path in self.assets.iterdir()], ["keep.txt"])


class NavigationIconCompilerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.capability = self.root / "app/src/main/java/de/starlightunit/wrapper/navigation/NativeNavigationIcons.java"
        self.capability.parent.mkdir(parents=True)
        self.capability.write_text("// supported runtime fixture\n", encoding="utf-8")
        self.assets = self.root / "app/src/main/assets/quantum_nav_icons"

    def tearDown(self):
        self.temp.cleanup()

    def test_legacy_items_and_empty_icons_still_compile_without_new_runtime(self):
        self.capability.unlink()
        self.assertEqual(worker.compile_navigation_items(self.root, [{"label": "Home", "url": "/", "icon": " ", "active_icon": ""}]),
                         [{"label": "Home", "url": "/"}])
        self.assertEqual(worker.compile_navigation_items(self.root, []), [])

    def test_builtin_and_active_icons_require_supported_runtime(self):
        for icon in worker.NAVIGATION_ICON_IDS:
            item = {"label": "Home", "url": "/", "icon": icon, "active_icon": "star"}
            self.assertEqual(worker.compile_navigation_items(self.root, [item]), [item])
        self.capability.unlink()
        for field in ("icon", "active_icon"):
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, "beta10 or newer"):
                worker.compile_navigation_items(self.root, [{"label": "Home", "url": "/", field: "home"}])

    def test_custom_icons_deduplicate_keep_original_profile_and_recompile_cleanly(self):
        png = navigation_png(24, 18)
        data_url = navigation_data_url(png)
        filename = hashlib.sha256(png).hexdigest() + ".png"
        items = [{"label": "Home", "url": "/", "icon": data_url, "active_icon": data_url},
                 {"label": "Other", "url": "/other", "icon": data_url}]
        original = copy.deepcopy(items)
        result = worker.compile_navigation_items(self.root, items)
        self.assertEqual(items, original)
        self.assertEqual(result[0]["icon"], "asset:quantum_nav_icons/" + filename)
        self.assertEqual(result[0]["active_icon"], result[1]["icon"])
        self.assertEqual([path.name for path in self.assets.iterdir()], [filename])
        self.assertEqual((self.assets / filename).read_bytes(), png)
        unrelated = self.assets / "README.txt"
        unrelated.write_text("preserve", encoding="utf-8")
        worker.compile_navigation_items(self.root, [{"label": "Home", "url": "/", "icon": "home"}])
        self.assertFalse((self.assets / filename).exists())
        self.assertEqual(unrelated.read_text(encoding="utf-8"), "preserve")

    def test_invalid_icons_are_rejected_before_assets_change(self):
        values = [None, [], {}, True, 2, "unknown", "HOME", "https://evil.test/icon.png", "//evil.test/icon.png",
                  "asset:quantum_nav_icons/" + "a" * 64 + ".png", "../icon.png", "data:image/svg+xml;base64,PHN2Zz4=",
                  "data:image/png;base64,AAAA", "data:image/png;base64,***", navigation_data_url() + "="]
        for value in values:
            with self.subTest(value=str(value)[:50]), self.assertRaises(RuntimeError):
                worker.compile_navigation_items(self.root, [{"label": "Valid", "url": "/", "icon": navigation_data_url()},
                                                          {"label": "Bad", "url": "/bad", "active_icon": value}])
            self.assertFalse(self.assets.exists())

    def test_corrupt_truncated_oversized_and_animated_pngs_are_rejected(self):
        valid = navigation_png()
        corrupt_crc = valid[:29] + bytes([valid[29] ^ 1]) + valid[30:]
        bad_zlib = valid[:33] + png_chunk(b"IDAT", b"not-zlib") + png_chunk(b"IEND", b"")
        zlib_trailing = valid[:33] + png_chunk(b"IDAT", zlib.compress(b"\0" * 5) + b"trailing") + png_chunk(b"IEND", b"")
        noncontiguous = (valid[:33] + png_chunk(b"IDAT", b"") + png_chunk(b"tEXt", b"x\0y")
                         + png_chunk(b"IDAT", zlib.compress(b"\0" * 5)) + png_chunk(b"IEND", b""))
        animated = valid[:33] + png_chunk(b"acTL", struct.pack(">II", 1, 0)) + valid[33:]
        too_big_inflate = navigation_png(image_data=b"\0" * 1_000_000)
        invalid = [b"", b"\x89PNG\r\n\x1a\n", valid[:-1], valid + b"x", corrupt_crc,
                   navigation_png(257, 1), navigation_png(0, 1), navigation_png(1, 257),
                   navigation_png(depth=3), navigation_png(color=5), bad_zlib, zlib_trailing, noncontiguous, animated,
                   navigation_png(image_data=b"\5\0\0\0\0"), too_big_inflate, navigation_png(padding=65536)]
        for payload in invalid:
            with self.subTest(length=len(payload), prefix=payload[:30]), self.assertRaises(RuntimeError):
                worker.compile_navigation_items(self.root, [{"label": "Home", "url": "/", "icon": navigation_data_url(payload)}])

    def test_valid_limits_and_large_menus_stay_below_java_string_limit(self):
        for payload in (navigation_png(), navigation_png(256, 256), navigation_png(256, 256, depth=16)):
            worker.validate_navigation_png(payload)
        unpadded = navigation_png()
        exact_limit = navigation_png(padding=65536 - len(unpadded) - 14)
        self.assertEqual(len(exact_limit), 65536)
        worker.validate_navigation_png(exact_limit)
        items = [{"label": "Item " + str(i), "url": "/" + str(i), "icon": navigation_data_url(exact_limit), "active_icon": navigation_data_url()}
                 for i in range(12)]
        compiled = worker.compile_navigation_items(self.root, items)
        self.assertNotIn("base64", json.dumps(compiled))
        self.assertLess(len(worker.java_literal(json.dumps(compiled)).encode("utf-8")), 65535)
        self.assertEqual(len(list(self.assets.iterdir())), 2)

    def test_indexed_and_interlaced_pngs_are_supported(self):
        prefix = b"\x89PNG\r\n\x1a\n"
        indexed = (prefix + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 1, 1, 3, 0, 0, 0))
                   + png_chunk(b"PLTE", b"\xff\0\0\0\xff\0")
                   + png_chunk(b"IDAT", zlib.compress(b"\0\x40")) + png_chunk(b"IEND", b""))
        # A 2x2 RGBA Adam7 image has rows of 5, 5 and 9 bytes, including filters.
        interlaced = (prefix + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 6, 0, 0, 1))
                      + png_chunk(b"IDAT", zlib.compress(b"\0" * 19)) + png_chunk(b"IEND", b""))
        for png in (indexed, interlaced):
            worker.validate_navigation_png(png)

    def test_symlink_asset_directory_cannot_escape_project(self):
        with tempfile.TemporaryDirectory() as other:
            self.assets.parent.mkdir(parents=True)
            self.assets.symlink_to(other, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "inside the wrapper project"):
                worker.compile_navigation_items(self.root, [{"label": "Home", "url": "/", "icon": navigation_data_url()}])
            self.assertEqual(list(Path(other).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
