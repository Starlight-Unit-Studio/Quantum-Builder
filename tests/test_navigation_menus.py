"""Compiler integration for independent menus and page-dependent navigation."""

import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import test_worker as fixtures

worker = fixtures.worker


class NavigationMenusCompilerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.capabilities = self.root / "app/src/main/java/de/starlightunit/wrapper/navigation"
        self.capabilities.mkdir(parents=True)
        for name in ("NativeNavigationMenus.java", "NativeNavigationGroups.java", "NativeNavigationIcons.java"):
            (self.capabilities / name).write_text("// runtime capability fixture\n", encoding="utf-8")
        self.app_config = self.capabilities.parent / "config/AppConfig.java"
        self.app_config.parent.mkdir()
        self.app_config.write_text('public static final String NATIVE_NAVIGATION_PROFILE_JSON = "{}";\n')
        self.assets = self.root / "app/src/main/assets/quantum_nav_icons"

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def menu(identifier="shop", items=None):
        return {"id": identifier, "label": "Menu " + identifier, "items": [] if items is None else items}

    @staticmethod
    def link(url="/"):
        return {"label": "Destination", "url": url}

    @staticmethod
    def rule():
        return {"match": "prefix", "path": "/shop", "sidebar_menu": "shop"}

    def compile(self, navigation):
        return worker.compile_navigation_profile(self.root, navigation, trusted_domain="example.test")

    def snapshot(self):
        return {path.name: path.read_bytes() for path in self.assets.iterdir()} if self.assets.exists() else {}

    def test_independent_menus_share_assets_but_keep_group_namespaces(self):
        png = fixtures.navigation_png(2, 2)
        icon = fixtures.navigation_data_url(png)
        group = {"type": "group", "id": "section", "label": "Section", "icon": icon,
                 "children": [self.link("/shop") | {"active_icon": icon}]}
        source = {"items": [group], "menus": [self.menu("shop", [group]), self.menu("tabs", [self.link("/account")])],
                  "sidebar_menu": "shop", "bottom_tabs_menu": "tabs",
                  "rules": [self.rule() | {"host": "APP.EXAMPLE.TEST", "bottom_tabs_menu": "default",
                                           "visibility": {"top_bar": True, "sidebar": False}}]}
        source["menus"][0]["label"] = ' Store "A" \\ Übersicht 🙂 '
        original = copy.deepcopy(source)
        default, profile = self.compile(source)
        self.assertEqual(source, original)
        self.assertEqual(profile["menus"][0]["label"], 'Store "A" \\ Übersicht 🙂')
        self.assertEqual(profile["sidebar_menu"], "shop")
        self.assertEqual(profile["bottom_tabs_menu"], "tabs")
        self.assertEqual(default[0]["id"], profile["menus"][0]["items"][0]["id"])
        asset = "asset:quantum_nav_icons/" + hashlib.sha256(png).hexdigest() + ".png"
        self.assertEqual(default[0]["icon"], asset)
        self.assertEqual(profile["menus"][0]["items"][0]["children"][0]["active_icon"], asset)
        self.assertEqual(profile["rules"][0]["host"], "app.example.test")
        self.assertEqual(len(self.snapshot()), 1)
        self.assertNotIn("base64", json.dumps([default, profile]))

    def test_invalid_catalogs_and_rules_leave_all_assets_unchanged(self):
        self.compile({"items": [self.link() | {"icon": fixtures.navigation_data_url()}]})
        saved = self.snapshot()
        candidate = {"items": [self.link() | {"icon": fixtures.navigation_data_url(fixtures.navigation_png(2, 2))}],
                     "menus": [self.menu("shop"), self.menu("account")], "rules": [self.rule()]}
        invalid = [
            {"menus": None}, {"menus": {}}, {"rules": None}, {"rules": {}}, {"rules": [None]},
            {"menus": [self.menu("a"), self.menu("b"), self.menu("c"), self.menu("d")]},
            {"menus": [self.menu(), self.menu()]}, {"menus": [self.menu("default")]},
            {"menus": [self.menu() | {"items": {}}]}, {"menus": [{"id": "shop", "label": "Shop"}]},
            {"menus": [self.menu() | {"extra": True}]}, {"rules": [self.rule() | {"enabled": True}]},
            {"rules": [{"match": "exact", "path": "/"}]}, {"rules": [self.rule()] * 17},
            {"menus": [self.menu("shop", [self.link("https://evil.test/")])]},
            {"menus": [self.menu("shop", [self.link() | {"icon": "unknown"}])]},
        ]
        for identifier in ("", "Default", "UPPER", "a\n", " a", "a ", "9a", "a/b", "ä", "a" * 41):
            invalid.append({"menus": [self.menu(identifier)]})
        for field in ("sidebar_menu", "bottom_tabs_menu"):
            for value in (None, [], "unknown", " shop ", 1):
                invalid.extend([{field: value}, {"rules": [self.rule() | {field: value}]}])
        for value in (None, "", "EXACT", "regex", [], 1):
            invalid.append({"rules": [self.rule() | {"match": value}]})
        for value in (None, "", "shop", "//shop", "/shop?x=1", "/shop#x", "/a b", "/a\\b", "/%zz", "/%2", "/ä", "/a\n", "/[", "/<", "/" + "x" * 2048):
            invalid.append({"rules": [self.rule() | {"path": value}]})
        for value in (None, "", " example.test", "example.test ", "example.test.", "a..example.test", "-a.example.test", "a-.example.test", "_a.example.test", "*.example.test", "example.test:443", "https://example.test", "example.test.evil.test", "notexample.test", "evil.test", "K.example.test", "a" * 64 + ".example.test"):
            invalid.append({"rules": [self.rule() | {"host": value}]})
        for value in (None, [], {}, {"invalid": True}, {"sidebar": 1}, {"sidebar": "false"}, {"top_bar": None}):
            invalid.append({"rules": [self.rule() | {"visibility": value}]})
        for override in invalid:
            with self.subTest(override=override), self.assertRaises(RuntimeError):
                self.compile(candidate | override)
            self.assertEqual(self.snapshot(), saved)

    def test_limits_are_per_menu_with_an_aggregate24_node_budget(self):
        source = {"items": [self.link()] * 12, "menus": [self.menu("shop", [self.link()] * 12)]}
        default, profile = self.compile(source)
        self.assertEqual(len(default), 12)
        self.assertEqual(len(profile["menus"][0]["items"]), 12)
        with self.assertRaisesRegex(RuntimeError, "24 total nodes across"):
            self.compile(source | {"menus": source["menus"] + [self.menu("extra", [self.link()])]})
        with self.assertRaisesRegex(RuntimeError, "12 link destinations"):
            self.compile({"menus": [self.menu("shop", [self.link()] * 13)]})
        for path in ("/", "/shop", "/shop/", "/a~b!$&'()*+,;=:@/%2F", "/%2f", "/" + "x" * 2047):
            _, compiled = self.compile({"rules": [{"match": "exact", "path": path, "visibility": {"sidebar": False}}] * 16})
            self.assertEqual(len(compiled["rules"]), 16)
            self.assertEqual(compiled["rules"][0]["path"], path)

    def test_missing_capabilities_are_checked_before_new_or_old_assets_change(self):
        source = {"items": [self.link() | {"icon": fixtures.navigation_data_url()}], "menus": [self.menu()]}
        self.compile(source)
        saved = self.snapshot()
        for filename in ("NativeNavigationMenus.java", "NativeNavigationIcons.java"):
            capability = self.capabilities / filename
            content = capability.read_bytes()
            capability.unlink()
            with self.subTest(filename=filename), self.assertRaises(RuntimeError):
                self.compile(source)
            self.assertEqual(self.snapshot(), saved)
            capability.write_bytes(content)
        self.app_config.write_text("// old wrapper without the profile constant\n")
        with self.assertRaisesRegex(RuntimeError, "beta12 or newer"):
            self.compile(source)
        self.assertEqual(self.snapshot(), saved)
        # Legacy defaults do not require beta12 and still remove stale icons.
        (self.capabilities / "NativeNavigationMenus.java").unlink()
        self.assertEqual(self.compile({"items": [], "menus": [], "rules": [], "sidebar_menu": "default", "bottom_tabs_menu": "default"}), ([], {}))
        self.assertEqual(self.snapshot(), {})
        with self.assertRaisesRegex(RuntimeError, "beta12 or newer"):
            self.compile({"rules": [{"match": "exact", "path": "/", "visibility": {"top_bar": True}}]})

    def test_modified_utf8_constant_limit_is_checked_before_asset_writes(self):
        self.compile({"items": [self.link() | {"icon": fixtures.navigation_data_url()}]})
        saved = self.snapshot()
        # A non-BMP character occupies four UTF-8 bytes but six modified-UTF8
        # bytes in Java's constant pool. The JSON is <64KiB in ordinary UTF-8.
        links = [self.link("/" + "🙂" * 511)] * 12
        source = {"menus": [self.menu("shop", links), self.menu("account", links)]}
        self.assertLess(len(json.dumps(source, ensure_ascii=False).encode("utf-8")), 65535)
        with self.assertRaisesRegex(RuntimeError, "Java configuration string limit"):
            self.compile(source)
        self.assertEqual(self.snapshot(), saved)
        # Long rule paths can exceed the same extension constant together with
        # otherwise valid URLs. Neither case may clean an earlier valid asset.
        source = {"menus": [self.menu("shop", [self.link("/" + "x" * 2047)] * 12),
                            self.menu("account", [self.link("/" + "x" * 2047)] * 12)],
                  "rules": [self.rule() | {"path": "/" + "x" * 2047}] * 16}
        with self.assertRaisesRegex(RuntimeError, "Java configuration string limit"):
            self.compile(source)
        self.assertEqual(self.snapshot(), saved)

    def test_global48_icon_fields_deduplicate_and_survive_across_menu_compilation(self):
        plain = fixtures.navigation_png()
        png = fixtures.navigation_png(padding=65536 - len(plain) - 14)
        self.assertEqual(len(png), 65536)
        icon = fixtures.navigation_data_url(png)
        source = {"items": [self.link() | {"icon": icon, "active_icon": icon}] * 12,
                  "menus": [self.menu("shop", [self.link() | {"icon": icon, "active_icon": icon}] * 12)]}
        default, profile = self.compile(source)
        self.assertEqual(default[0]["icon"], profile["menus"][0]["items"][0]["active_icon"])
        self.assertEqual(len(self.snapshot()), 1)
        keep = self.assets / "keep.txt"
        keep.write_text("unrelated")
        self.compile({"menus": [self.menu()]})
        self.assertEqual(self.snapshot(), {"keep.txt": b"unrelated"})

    def test_app_config_keeps_both_constants_and_preserves_json_escape_layers(self):
        legacy = fixtures.WorkerCompilerTests()
        legacy.setUp()
        try:
            path = legacy.write_app_config_fixture()
            path.write_text(path.read_text().replace("public static final String NATIVE_NAVIGATION_ITEMS_JSON",
                'public static final String NATIVE_NAVIGATION_PROFILE_JSON = "{}";\n    public static final String NATIVE_NAVIGATION_ITEMS_JSON'))
            capabilities = legacy.root / "app/src/main/java/de/starlightunit/wrapper/navigation"
            capabilities.mkdir()
            for name in ("NativeNavigationMenus.java", "NativeNavigationIcons.java"):
                (capabilities / name).write_text("// supported fixture\n")
            label = 'Account "A" \\ Übersicht 🙂'
            legacy.config["navigation"] |= {"menus": [self.menu("shop", [{"label": label, "url": "/shop", "icon": fixtures.navigation_data_url()}])],
                                             "sidebar_menu": "shop", "bottom_tabs_menu": "default", "rules": [self.rule()]}
            worker.patch_app_config(legacy.root, legacy.app, legacy.config)
            text = path.read_text()
            constants = {}
            for name in ("NATIVE_NAVIGATION_ITEMS_JSON", "NATIVE_NAVIGATION_PROFILE_JSON"):
                line = next(line for line in text.splitlines() if "String " + name + " = " in line)
                constants[name] = json.loads(json.loads(line.split(" = ", 1)[1].removesuffix(";")))
            self.assertEqual(len(constants["NATIVE_NAVIGATION_ITEMS_JSON"]), 2)
            self.assertEqual(constants["NATIVE_NAVIGATION_PROFILE_JSON"]["menus"][0]["items"][0]["label"], label)
            self.assertNotIn("data:image/png", text)
            # Returning to legacy settings clears the extension constant.
            for field in ("menus", "sidebar_menu", "bottom_tabs_menu", "rules"):
                legacy.config["navigation"].pop(field)
            worker.patch_app_config(legacy.root, legacy.app, legacy.config)
            self.assertIn('NATIVE_NAVIGATION_PROFILE_JSON = "{}";', path.read_text())
        finally:
            legacy.tearDown()


if __name__ == "__main__":
    unittest.main()
