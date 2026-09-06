import importlib.util
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
            "interface": {"keep_screen_on": False, "orientation": "portrait"},
            "web": {"user_agent_suffix": " QuantumTest"},
            "permissions": {"location": True, "microphone": True, "camera": True},
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
            """package de.starlightunit.wrapper.config;\npublic final class AppConfig {\n public static final String START_URL = \"https://old.test/\";\n public static final String TRUSTED_DOMAIN = \"old.test\";\n public static final String VERSION_NAME = \"0.0.1\";\n public static final String USER_AGENT_SUFFIX = \" old/\" + VERSION_NAME;\n public static final String ASSET_STORE_TRUSTED_HOST = \"old.test\";\n public static final String APP_HEADER_VALUE = \"old\";\n public static final boolean KEEP_SCREEN_ON = true;\n}\n""",
            encoding="utf-8",
        )
        worker.patch_app_config(self.root, self.app, self.config)
        text = path.read_text(encoding="utf-8")
        self.assertIn('START_URL = "https://example.test/app/index.html";', text)
        self.assertIn('TRUSTED_DOMAIN = "example.test";', text)
        self.assertIn('ASSET_STORE_TRUSTED_HOST = "example.test";', text)
        self.assertIn('KEEP_SCREEN_ON = false;', text)

    def test_manifest_adds_only_requested_runtime_permissions(self):
        manifest = self.root / "app/src/main/AndroidManifest.xml"
        manifest.write_text(
            """<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <uses-permission android:name=\"android.permission.INTERNET\" />\n    <application><activity android:name=\"de.starlightunit.wrapper.MainActivity\" android:launchMode=\"singleTask\"></activity></application>\n</manifest>\n""",
            encoding="utf-8",
        )
        worker.patch_manifest(self.root, self.config)
        text = manifest.read_text(encoding="utf-8")
        self.assertIn("android.permission.ACCESS_FINE_LOCATION", text)
        self.assertIn("android.permission.RECORD_AUDIO", text)
        self.assertIn("android.permission.CAMERA", text)
        self.assertIn('android:screenOrientation="portrait"', text)

    def test_profile_never_contains_signing_material(self):
        worker.write_profile(self.root, self.app, self.config, 7)
        data = json.loads((self.root / "quantum-builder-profile.json").read_text(encoding="utf-8"))
        self.assertEqual(data["build_id"], 7)
        self.assertNotIn("password", json.dumps(data).lower())
        self.assertNotIn("keystore", json.dumps(data).lower())


if __name__ == "__main__":
    unittest.main()
