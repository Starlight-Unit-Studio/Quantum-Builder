# Native Navigation Icons

Builder **0.1.0-alpha13**, companion Wrapper **0.1.0-beta10**.

This records the completed icon implementation tranche, merged through Builder
PR #25 and Wrapper PR #26. Alpha14 extends the same icon contract to nested groups;
its 48-field combined limit and new checks are recorded in
[NAVIGATION_GROUPS.md](NAVIGATION_GROUPS.md).

Implementation reviews: [Builder PR #25](https://github.com/Starlight-Unit-Studio/Quantum-Builder/pull/25)
and [Wrapper PR #26](https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper/pull/26).

The editor, profile persistence, preview and asset compiler are implemented and
locally verified. Android rendering is implemented and its navigation sources are
compiled against API 23, with navigation unit tests. Native visual/device acceptance
remains **IMPLEMENTED_PENDING_QA**; no APK installation or emulator run is claimed.

## User workflow

Each shared menu row has a **Normal** and **Aktiv** icon choice. Select one of the
20 built-in symbols or upload a static PNG. Resetting Normal removes its icon;
resetting Aktiv makes the selected state reuse the normal icon. An active-only
icon is also valid and is displayed only while that destination is selected.

The editor preserves icons during ordering, autosave and advanced JSON edits.
Invalid JSON remains editable. An invalid upload does not replace the previous
icon. A late upload cannot overwrite a later selection or another app profile.
Controls work with touch and keyboard, including 360-pixel phone viewports.

The sidebar shows up to 12 shared items; Bottom Tabs uses the first five. When a
surface contains any normal or active icon, it reserves matching icon slots for
all its entries. Entirely iconless profiles retain text-only menus. Labels remain
present and provide the accessible names of menu controls.

## Profile and compilation contract

Both new fields are optional strings; existing label/URL-only profiles are valid.

```json
{
  "label": "Start",
  "url": "/",
  "icon": "home",
  "active_icon": "star"
}
```

| Field/value | Behavior |
|---|---|
| `icon` omitted or empty | No normal icon |
| `active_icon` omitted or empty | Inherit the normal icon |
| Built-in identifier | Use the matching Quantum vector symbol |
| `data:image/png;base64,...` | Store a validated PNG in the app profile |
| `asset:quantum_nav_icons/<sha256>.png` | Worker-generated runtime reference only; rejected as a user-supplied profile value |

Built-in identifiers: `home`, `search`, `grid`, `star`, `heart`, `user`, `settings`,
`info`, `mail`, `cart`, `calendar`, `camera`, `map`, `phone`, `download`, `help`,
`play`, `folder`, `globe`, `link`.

`public/assets/navigation-icons.js` contains the original 24-unit outline paths
and the shared frontend validator/renderer. The beta10 wrapper bundles matching
vector resources. These symbols use the configured foreground color normally and
the accent color when selected. Custom PNGs preserve their own colors and aspect
ratio within a 22dp icon slot; use separate images for a different selected design.

Custom icons have these limits:

- Static PNG only, at most **65,536 decoded bytes (64 KiB)**.
- Width and height each **1 through 256 pixels**.
- Canonical base64, valid PNG signature, chunk bounds/checksums and required chunks.
- Server and worker additionally validate bounded decompression and scanline
  structure. The upload control also decodes the image before accepting it.
- Remote image URLs, SVG data, animated PNGs and arbitrary asset paths are rejected.

The worker validates the complete menu before writing image assets. It hashes
each PNG, deduplicates identical images and writes files below
`app/src/main/assets/quantum_nav_icons/`. The generated Java menu JSON contains
only short references, so even 24 custom images stay outside Java string constants.
Cleanup is restricted to the worker's generated SHA-256 PNG filenames.

## Android behavior and compatibility

Selected state follows the current resolved destination, ignoring only its URL
fragment. Sidebar and tab labels, colors and icon choices update together. A
missing/unreadable selected PNG falls back to the normal icon; an unavailable
normal icon leaves the destination usable with its label. The native loader only
accepts built-in names or the exact generated asset path and bounds reads and
bitmap dimensions before decoding.

An icon-bearing build requires the beta10 `NativeNavigationIcons.java` module.
The compiler fails clearly if an older wrapper ref is selected, instead of
silently creating an app without icons. Iconless profiles still compile against
the previous runtime. The companion icon change is merged into
`compat/android-6-api23`, the default wrapper ref. Group-bearing profiles require
the additional beta11 group module. No changes to the separate wrapper `main`
integration are required.

## Verification and remaining acceptance

Local checks for this tranche:

- 11 JavaScript model/icon tests: legacy menus, every built-in, both states, trusted
  destinations, PNG bounds, malformed data and mutation-free normalization.
- Browser regression against the actual frontend with isolated API/site fixtures:
  hydration, autosave, icon uploads/reset, active rendering, ordering, invalid JSON,
  exact dirty events, delayed upload races, route history and 1440/390/360px layout.
- Real PHP/SQLite persistence tests: built-ins and PNG round trips, invalid inputs,
  all 24 icon slots at the file-size limit, profile and version-code behavior.
- 22 Python compiler tests: deduplicated assets, short generated JSON, old-wrapper
  compatibility, malformed PNGs, cleanup and existing build behavior.
- Companion native checks: 26 navigation JUnit tests and source compilation against
  the Android 6 / API 23 surface; all 20 vectors compile with AAPT2. A generated
  Builder profile compiles and its JSON parses through the actual native config
  and icon policy, with one shared PNG bundled once. These are focused checks;
  full APK assembly, Android lint and device rendering remain unverified here.

Run Builder checks locally:

```bash
node --test tests/test_navigation_model.js tests/test_navigation_icons.js
node tests/test_navigation_ui.cjs
php -d zend.assertions=1 -d assert.exception=1 tests/test_profile_versioning.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_icons.php
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The browser regression requires Playwright and Chromium; an existing Chromium can
be selected with `QB_BROWSER_EXECUTABLE`. Set `QB_SCREENSHOT_DIR` for screenshots.
PHP tests require PDO SQLite, ctype and zlib. All recorded checks run locally;
GitHub Actions quota is not used.

Remaining native acceptance: install a generated icon-bearing APK on Android 6
and a current Android version; inspect mixed sidebar/tab layouts, normal/active
custom images, large system fonts and offline navigation. The browser simulator
approximates presentation and cannot establish those native rendering results.
Native device acceptance is tracked separately from the completed Builder checks.
