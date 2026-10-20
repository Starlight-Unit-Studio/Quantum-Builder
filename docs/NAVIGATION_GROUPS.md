# Native Navigation Groups

Builder **0.1.0-alpha14**, companion Wrapper **0.1.0-beta11**.

This tranche adds an ordered tree to the existing shared navigation menu. Sidebar
groups can contain links and other groups; Bottom Tabs consume the same tree's
first five link destinations in depth-first order. Groups do not occupy tab slots.
The scope includes editing, storage, compilation, preview and native runtime code.
Native APK/device acceptance remains separate from the local checks below.

## Profile contract

`navigation.items` remains an array. Existing label/URL-only items and their
optional `icon` and `active_icon` fields are unchanged. An explicit `type: "link"`
is accepted on input and omitted during normalization.

```json
[
  { "label": "Home", "url": "/", "icon": "home" },
  {
    "type": "group",
    "id": "account",
    "label": "Account",
    "collapsed": true,
    "icon": "user",
    "active_icon": "star",
    "children": [
      { "label": "Profile", "url": "/account", "icon": "user" },
      {
        "type": "group",
        "id": "settings",
        "label": "Settings",
        "collapsed": false,
        "children": [
          { "label": "Privacy", "url": "/account/privacy" }
        ]
      }
    ]
  }
]
```

| Field or limit | Contract |
|---|---|
| Link destinations | At most 12 across the entire tree |
| Groups | At most 12 across the entire tree |
| Total nodes | At most 24, counting both links and groups |
| Group depth | At most three group ancestors; a link may sit below the third group |
| `type` | Omitted or `link` for a destination; exactly `group` for a group |
| Group `id` | Required, globally unique, `[a-z][a-z0-9_-]{0,39}`; never trimmed |
| `label` | Required text, trimmed, 1 to 80 UTF-8 bytes |
| Group `children` | Required array; empty groups are valid |
| Group `collapsed` | Strict boolean when present; normalized default is `false` |
| Group `url` | Rejected, including empty or null values |
| Link group fields | `children`, `id` and `collapsed` are rejected on links |
| Link `url` | Existing relative/trusted-HTTPS target contract, at most 2048 UTF-8 bytes |
| `icon`, `active_icon` | Existing built-ins or bounded static PNG data URLs on both kinds of node |

The frontend, PHP and worker validate all levels and count global limits. Duplicate
group IDs, unknown types, invalid descendants or a fourth group level invalidate
the complete draft. Invalid saves leave the stored profile and its version code
unchanged. The advanced JSON remains available for correction.

The API decoder preserves the distinction between list containers and JSON objects.
An empty object or an object with numeric keys cannot substitute for `items` or
`children`, even though PHP's usual associative JSON decoding would make it look
like a list.

## Editor workflow

- Add a destination or group at the top level. A group also offers direct child
  destination and subgroup buttons, with the third-level limit enforced.
- Select a parent with **In Gruppe**. The list shows each group's full parent path
  and excludes the node itself, its descendants and parents that exceed the depth
  limit. Moving a group moves all its descendants with it.
- Use up/down buttons or arrow keys on the drag handle to reorder siblings.
  Desktop drag/drop can move a subtree before or after another compatible row.
- Use **Gruppe auflösen** to replace a group with its children at the same position.
  Child order, group IDs, destinations and icons are retained.
- Configure **Beim Start eingeklappt** and normal/active icons on group headers.
  Group IDs are generated internally and remain stable when labels or parents change.

The editor shows shallowly indented rows with parent paths so controls remain
usable on a narrow phone. Tab badges follow destination order after every move.
Each visual change feeds the existing single JSON input/autosave path. Merely
hydrating a saved profile does not save it again. Repeated `input`/`change` events
for unchanged advanced JSON do not recreate rows or cancel an in-progress icon upload.

Pending PNG uploads follow the original node through moves and group dissolution.
Removing that node, replacing the draft or switching profiles invalidates the old
upload callback so it cannot overwrite a later choice.

## Preview and Android behavior

Group headers toggle their children and never navigate to a URL. Rows are indented
12 CSS pixels per group ancestor in the preview, matching 12 dp in the native
sidebar. Headers retain their labels and icons when collapsed. Empty groups stay
visible. If there are no link destinations anywhere, a Home link is added after
the sidebar groups and is used as the only tab.

Each group begins with its configured collapse state. On first navigation and a
new exact URL, all groups containing the active destination open. Selection compares
resolved URLs while ignoring the fragment, so the active link and its ancestors
share the configured selected colors/icon state. A fragment-only URL change also
reveals the active ancestors.

Manual collapse survives updates for the same exact URL, including reload and
drawer close/reopen. In the preview it also survives label, icon and color changes,
reordering and adding unrelated siblings. New groups, groups with a changed
collapse default and groups that gain the current destination reveal that active
destination. Other groups retain their manual state by ID. Changing profiles or
the start URL resets preview state. Native expansion state belongs to the current
controller and resets when the Activity/controller is recreated; it is not stored
as a profile edit or written to persistent app storage.

The native header is a focusable button with expand/collapse accessibility actions
and an announced state. The preview uses `aria-expanded` and `aria-controls`.
The native parser rejects malformed trees atomically, leaving the Home fallback,
and guards JSON size/depth before Android's parser. Invalid native icon references
retain the existing label/normal-icon fallback behavior.

The simulator tracks navigation initiated by its own controls. It does not inspect
cross-origin iframe history or establish Android rendering/accessibility behavior.

## Compiler and compatibility

The worker preserves the tree and recursively compiles icon fields on every link
and group. Shared PNGs are deduplicated across all 48 possible icon fields and
written as bundled assets with short `asset:quantum_nav_icons/<sha256>.png`
references. Group labels and JSON escapes reach generated Java constants intact.
All structural and capability checks run before generated icon assets are changed.

| Profile | Required wrapper source |
|---|---|
| Flat menu without icons | Previous native-navigation runtime |
| Flat menu with icons | beta10 or newer, `NativeNavigationIcons.java` present |
| Any group, without icons | beta11 or newer, `NativeNavigationGroups.java` present |
| Any group with icons | Both group and icon modules present |

An incompatible wrapper ref fails with an explicit update message. The default
source remains `compat/android-6-api23`. Integrate the companion beta11 change into
that branch before building grouped profiles. The separate wrapper `main`
integration is outside this tranche.

Companion implementation: [Quantum Mobile Wrapper PR #27](https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper/pull/27).

PHP's request ceiling is 12 MiB, aligned with nginx. A fully populated profile
with 48 icons at 64 KiB each, a 3 MiB custom splash and a 600 KiB launcher image
fits within this budget. The existing image contracts and splash behavior are
unchanged.

## Local validation

Run the Builder checks from the repository root:

```bash
node --test tests/test_navigation_model.js tests/test_navigation_icons.js
node tests/test_navigation_ui.cjs
QB_NAVIGATION_EDGE_CASES=1 node tests/test_navigation_ui.cjs
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_groups.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_icons.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_profile_versioning.php
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The browser check needs Playwright and Chromium. Use `QB_BROWSER_EXECUTABLE` for
an existing Chromium binary and `QB_SCREENSHOT_DIR` to capture screenshots. PHP
checks use real PDO SQLite and need ctype and zlib. No GitHub Actions is required.

Verified locally on 2026-10-20:

- 19 JavaScript model/icon tests: 14 navigation cases and five icon cases, covering
  recursive bounds, exact IDs, validation paths, trusted URLs and legacy compatibility.
- PHP/SQLite group persistence, 91 invalid save cases and eight invalid raw JSON
  request cases; every failed update leaves the previous profile intact. The real
  request decoder also saves the complete 9,237,423-byte maximum profile.
- Existing PHP icon and versioning regressions.
- Full browser regression against the actual frontend at 1440/390/360px, covering
  editing without JSON, subtree moves/dissolution, upload races, hydration/autosave,
  active ancestors, empty menus and mobile controls at the 24-node limit. The
  resulting phone and desktop screenshots were also visually inspected.
- Targeted browser checks against the final simulator: strict IDs with terminal
  line breaks, manual collapse through unrelated additions/removal/reorder, and
  automatic reveal when moving the current destination into another group.
- 28 Python compiler tests, including group/icon capability checks before asset
  changes, recursive PNG deduplication, all 48 icon fields and escaped Java strings.
- Companion Android API 23 compilation of 20 Java source files, 35 navigation JUnit
  tests and AAPT2 compilation of 20 icon resources. Fifteen parser/group tests also
  pass with Android 6's actual `org.json` implementation; these are part of the 35.
- End-to-end request decoding and PHP/SQLite save through worker-generated,
  compiled `AppConfig.java` to the native parser and group state. The fixture has
  three group levels, eight destinations, two SHA-256-verified shared PNGs and
  labels with quotes, backslashes and emoji. The first five destinations, deep
  active icons, active ancestors, same-URL collapse and fragment reopening match.

Full APK assembly, Android lint and device rendering are not established by these
focused local checks.

Remaining native acceptance: install a generated grouped APK on Android 6 and a
current Android version; inspect three-level indentation, long labels/system font
scaling, mixed normal/active icons, keyboard/TalkBack controls, collapse across
navigation and Activity recreation, plus offline access to bundled icons.

The next implementation block is independent menu sets and URL-based selection/
visibility rules, followed by the recorded typed-action and styling work in
[MEDIAN_PARITY_ROADMAP.md](MEDIAN_PARITY_ROADMAP.md).
