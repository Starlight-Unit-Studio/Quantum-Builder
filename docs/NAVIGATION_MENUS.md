# Independent navigation menus and URL rules

Builder **0.1.0-alpha15**, companion Wrapper **0.1.0-beta12**.

Sidebar and Bottom Tabs can select separate menus. Ordered URL rules can change
either menu and show or hide Top Bar, Sidebar, Bottom Tabs and Contextual Toolbar.
The rule changes presentation in the existing WebView; it does not navigate,
reload a page or create per-tab browsing sessions.

## Editing workflow

The existing menu remains **Standardmenü**. **Menü hinzufügen** creates an
additional menu with a stable ID and an editable name. Select which menu to edit,
then use its existing link/group/icon controls and advanced JSON. Each menu keeps
its own draft and pending image uploads when switching between editors.

Choose the default Sidebar and Bottom Tabs menus separately. The four visibility
switches at the top now describe the default for pages without an overriding
rule. A rule can explicitly show a surface whose default is off.

Each URL rule has a path, exact/prefix matching, an optional exact domain, two menu
overrides and a three-way choice for each surface: use the default, show or hide.
Move rules with the up/down buttons. The first matching rule decides all its
overrides; unspecified values come from profile defaults, never from later rules.

An additional menu cannot be removed while a default selection or URL rule refers
to it. The editor identifies those references so they can be reassigned first.
The Standard menu cannot be removed. Invalid advanced JSON remains editable and
blocks saving/build queueing, including invalid drafts in an inactive menu editor.
The preview retains the last valid navigation for the same app and trusted context.

## Profile contract

The existing `navigation.items` tree has reserved menu ID `default`. Old profiles
need no migration. The extension is:

```json
{
  "items": [{"label":"Home","url":"/","icon":"home"}],
  "menus": [
    {
      "id":"shop",
      "label":"Shop",
      "items":[
        {"label":"Products","url":"/shop","icon":"grid"},
        {"label":"Basket","url":"/shop/basket","icon":"cart"}
      ]
    }
  ],
  "sidebar_menu":"default",
  "bottom_tabs_menu":"shop",
  "rules":[
    {
      "match":"exact",
      "path":"/shop/checkout",
      "visibility":{"bottom_tabs":false,"contextual_toolbar":false}
    },
    {
      "match":"prefix",
      "path":"/shop",
      "sidebar_menu":"shop",
      "visibility":{"bottom_tabs":true}
    }
  ]
}
```

The existing title, colors and four visibility booleans remain alongside these
fields. The editor's **Menüs und URL-Regeln** JSON field contains only `menus`,
`sidebar_menu`, `bottom_tabs_menu` and `rules`; each menu's items also have their
own advanced editor. Saving stores the complete profile.

| Field or limit | Contract |
|---|---|
| `menus` | Array of at most three additional definitions, four menus including Standard |
| Menu definition | Exactly `id`, `label`, `items`; items must be an array, empty is valid |
| Menu ID | Unique `[a-z][a-z0-9_-]{0,39}`, never trimmed; `default` is reserved |
| Menu name | Trimmed text, 1 to 80 UTF-8 bytes; changing it preserves the ID |
| Default menu references | `sidebar_menu` and `bottom_tabs_menu`, each defaulting to `default` |
| Per-menu structure | At most 12 links, 12 groups, three group ancestors; existing icon schema |
| Whole-profile structure | At most 24 link/group nodes across all menus, at most 48 icon fields |
| Group identity | Unique within each menu; the same group ID in another menu is independent |
| `rules` | Array of at most 16 ordered rule objects; omission means no rules |
| Rule matcher | Required `match`: `exact` or `prefix`; required `path` |
| Optional rule `host` | Exact ASCII DNS name, lowercase normalized, inside the trusted domain |
| Rule outputs | Optional `sidebar_menu`, `bottom_tabs_menu`, `visibility`; at least one output required |
| `visibility` | Nonempty object containing only the four named surfaces, with strict boolean values |

Unknown menu references are rejected even for hidden surfaces. Menu definitions,
rules and visibility reject unknown fields. Explicit null/wrong container types
are invalid. The API retains JSON array/object distinctions before PHP validation;
numeric-key objects cannot masquerade as menu or rule lists. Failed saves leave
the stored data, timestamps and version code unchanged.

## URL matching

Rules match only valid HTTPS locations within the app's trusted domain. An omitted
host filter accepts any trusted subdomain; a provided host matches exactly, with
case ignored and without an implicit subdomain wildcard. Ports do not participate
in the host comparison. The rule host cannot contain a port, scheme or wildcard.

Paths start with a single `/` and contain at most 2,048 ASCII bytes. Use percent
encoding for non-ASCII characters. Queries and fragments are not allowed in the
rule path and are ignored when matching the current page. Spaces, backslashes and
malformed percent escapes are rejected.

Matching uses the raw, case-sensitive path received from the current URL. It does
not decode `%2F`, normalize percent-escape case or rewrite dot segments. This keeps
the browser's rule evaluation aligned with Android `URI.getRawPath()`; a browser
may already have normalized a URL before reporting it as the current page.

| Rule path and mode | Matches | Does not match |
|---|---|---|
| `/shop`, prefix | `/shop`, `/shop/`, `/shop/item` | `/shopping`, `/Shop` |
| `/shop/`, prefix | `/shop/`, `/shop/item` | `/shop` |
| `/shop`, exact | `/shop?sort=name#top` | `/shop/`, `/shop/item` |
| `/`, prefix | Every trusted HTTPS path | Untrusted hosts or non-HTTPS URLs |
| `/a%2Fb`, exact | `/a%2Fb` | `/a/b`, `/a%2fb` |

Invalid/untrusted locations use the default presentation and never gain any
navigation permission. Presentation rules do not change the separate trusted URL
loader or the existing internal/external/block link rules.

## Preview and Android behavior

Sidebar displays its selected menu's full tree. Tabs use the first five depth-first
destinations of their independently selected menu. Empty menus receive their own
Home fallback. Groups remain Sidebar headers and do not consume tab positions.

Changing a menu or its visibility does not reload the current page or add history.
Hidden bars release their layout space. Hiding Sidebar or changing its selected
menu closes the drawer; tabs-only changes preserve it. A visible
Sidebar keeps a launcher when Top Bar is hidden. Group expansion is scoped to the
menu ID and retained in the current preview/controller. New URLs reveal active
ancestors, including in a menu that was temporarily inactive. Same-URL updates
preserve manual collapse. Activity recreation resets native expansion state.

Android receives presentation updates for page starts, visited-history changes and
completed page loads. Thus reported WebView history changes also re-evaluate the
rules. The browser simulator observes navigation from its own controls; it cannot
read page changes inside a foreign iframe. Actual device rendering and WebView
callback behavior remain part of the Android acceptance matrix.

## Compilation and compatibility

`NATIVE_NAVIGATION_ITEMS_JSON` retains the compiled Standard menu.
`NATIVE_NAVIGATION_PROFILE_JSON` contains the compiled additional menus, default
references and rules. No extension is represented by `{}`.

The worker validates every tree, reference, rule, icon and capability before
writing or removing generated assets. PNGs are deduplicated across all menus.
The aggregate 24-node limit keeps the existing 48-icon request budget and 12 MiB
HTTP limit intact. Each generated Java string must fit 65,535 modified-UTF-8 bytes;
very long combined menu URLs/rule paths can exceed that limit and fail compilation
before any asset changes. Shortening those paths resolves this bounded build error.

| Profile capability | Required wrapper source |
|---|---|
| Existing Standard-only navigation | Previous navigation runtime |
| Any icon | `NativeNavigationIcons.java`, beta10 or newer |
| Any group | `NativeNavigationGroups.java`, beta11 or newer |
| Additional menus or URL rules | `NativeNavigationMenus.java` and the profile constant, beta12 or newer |

The Builder's wrapper source remains `compat/android-6-api23`. Merge the companion
beta12 runtime before building an extended profile. Existing profiles retain their
earlier wrapper compatibility. The native parser discards a malformed extension
atomically and falls back to the validated Standard menu and default visibility;
malformed Standard items retain the existing empty-menu/Home behavior.

## Validation and remaining acceptance

Repository checks:

```bash
node --test tests/test_navigation_model.js tests/test_navigation_icons.js tests/test_navigation_menus.js
node tests/test_navigation_ui.cjs
QB_NAVIGATION_EDGE_CASES=1 node tests/test_navigation_ui.cjs
node tests/test_navigation_menus_ui.cjs
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_menus.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_groups.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_navigation_icons.php
php -d zend.assertions=1 -d assert.exception=1 tests/test_profile_versioning.php
python3 -m unittest discover -s tests -p 'test*.py' -v
```

Browser checks use the actual frontend with isolated API and website fixtures.
Set `QB_BROWSER_EXECUTABLE` for an installed Chromium binary and optionally
`QB_SCREENSHOT_DIR` for screenshots. PHP needs PDO SQLite and ctype. The companion
native record is [NATIVE_NAVIGATION_MENUS.md](https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper/blob/compat/android-6-api23/docs/NATIVE_NAVIGATION_MENUS.md).

Recorded local evidence on 2026-10-20:

- 30 JS model/icon cases, including 11 independent-menu/rule cases.
- Existing full and group-edge browser checks, plus the new complete menu/rule
  workflow at 1440, 390 and 360 pixels with 44-pixel new controls.
- PHP menu tests: 120 atomic invalid-save cases and 13 raw JSON container cases;
  earlier group, icon and versioning checks also pass.
- 35 Python worker tests, including shared PNGs, compatibility, escaping and both
  modified-UTF8 constant limits before any asset writes.
- 52 native navigation JUnit cases; 22 navigation-related sources compile against
  API23, and all 20 original navigation vectors compile with AAPT2.
- All 40 production Java sources compile together against the official SDK36 and
  existing AndroidX dependencies; only generated R/BuildConfig are stubbed. A
  focused callback harness verifies dispatch without instantiating a real WebView.
- A real request/SQLite fixture passes through the worker and both actually
  compiled Java constants. JS and native selection agree on 92 URL cases, with
  three menus, eight rules, two content-verified shared PNGs, escaped Unicode
  labels, first-five tab ordering and menu-scoped expansion.

Full Gradle lint/APK assembly, installation, Android 6/current-device rendering,
large-font layout and TalkBack acceptance remain open. Local browser checks and
API23 source compilation do not establish those results. No GitHub Actions is
needed or used for this tranche's verification.

The next navigation block is page-specific titles/images, search and typed actions.
Per-tab browsing sessions, invalidation, scroll rules, styling and native screen
destinations remain separately planned in the roadmap.
