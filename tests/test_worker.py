import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "qb_worker",
    Path(__file__).resolve().parents[1] / "docker" / "worker" / "worker.py",
)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(worker)


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
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        self.assertIn('START_URL = "https://example.test/app/index.html";', text)
        self.assertIn('TRUSTED_DOMAIN = "example.test";', text)
        self.assertIn('ASSET_STORE_TRUSTED_HOST = "example.test";', text)
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


if __name__ == "__main__":
    unittest.main()
