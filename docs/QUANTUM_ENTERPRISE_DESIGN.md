# Quantum Enterprise Design Direction

Updated: **2026-10-20**. Status: **APPROVED_DIRECTION / IMPLEMENTATION_PLANNED**.

## Decision and sequence

The direction agreed on 2026-09-18 and reaffirmed by the user on 2026-10-20 is a
brighter Quantum Builder with enterprise information hierarchy and recognizable
Starlight Unit Studios identity. The existing dark terminal appearance must no
longer dominate the workspace.

The sequence remains **functional parity first, then the Quantum Enterprise
redesign**. See [MEDIAN_PARITY_ROADMAP.md](MEDIAN_PARITY_ROADMAP.md). Functional
editor improvements may ship earlier while the full visual redesign stays planned.
The functional roadmap now also includes the requested MobiLoud, Twinr and CatDoes
references; their [additional scope](REFERENCE_PLATFORM_EXPANSION.md) must fit the
same readable, phone-usable information architecture as those capabilities ship.

CoreUI-like brightness is a reference for the direction, not a requirement to copy
CoreUI. Quantum Builder keeps its own interface and product identity. This work is
limited to Quantum Builder; it does not modify the CoreUI repository.

The direction is approved. **The exact palette, measurements and component choices
below are an implementation proposal, not a historically approved mockup.**

## Intended experience

App management should read as a working application: clear app identity, visible
save/build state, understandable settings and direct access to the next action.
Light surfaces and dark readable text carry the content. Cyan and restrained amber
retain the STU character without making every panel resemble a terminal.

Keep the accepted Quantum Builder logo and existing branding assets. No logo,
splashscreen or attribution image replacement is part of this specification.
Generated-app branding and the Builder's own theme are separate settings.

## Proposed design tokens

These values are starting specifications to validate in the implementation.

| Token | Proposed value | Purpose |
|---|---|---|
| Canvas | `#F4F7FB` | Light workspace background |
| Surface | `#FFFFFF` | Forms, cards and dialogs |
| Subtle surface | `#EAF0F7` | Group headers and inactive controls |
| Primary text | `#172B43` | Titles and body copy |
| Secondary text | `#50647D` | Labels and supporting information |
| Border | `#CFDAE8` | Quiet component boundaries |
| Primary action | `#086B88` | Cyan/teal action and focus identity |
| Active surface | `#DDF2F7` | Selected navigation and controls |
| Accent | `#A56308` | Restrained amber highlights |
| Success | `#176B46` | Completed/saved states |
| Danger | `#B42332` | Destructive actions and errors |

Validate text/control contrast in context. Color must never be the sole status
indicator. Use consistent focus rings, restrained shadows and a small spacing
scale rather than glowing frames, dense gradients or decoration around every row.
Monospaced text belongs to package identifiers, versions, logs and code fields.

## Information architecture

| Area | Responsibility |
|---|---|
| Global navigation | Apps, builds, members, system state and settings when implemented |
| App context header | App name, environment, platform and current save/build state |
| App section navigation | Overview, Branding, Interface, Navigation, Links, Permissions, Web Overrides, Plugins, Build & Deploy |
| Main editor | One understandable configuration group at a time, with related help |
| Preview | Optional responsive preview with explicit controls and adequate editor space |
| Build view | Queue/progress, meaningful failure detail and actual output downloads |

Do not add inactive global pages merely to resemble the final architecture. Add
navigation entries with the corresponding working capability. Advanced raw
configuration remains available without becoming the normal mobile editing path.

Reference workflow inventory reviewed on 2026-10-20:
[Median App Studio](https://docs.median.co/docs/app-studio),
[App Studio Accounts](https://docs.median.co/docs/app-studio-accounts),
[Native Navigation](https://docs.median.co/docs/native-navigation-overview).
The layout and tokens in this document are Quantum's proposed design.

## Mobile behavior

- Make the complete workflow usable from a phone: app configuration, asset upload,
  menu editing, build queue and artifact download.
- Use a compact app header and an accessible section selector. Preview can become
  a separate view or collapsible region instead of shrinking the editor.
- Give reorder operations touch-friendly controls in addition to drag gestures.
- Keep key actions reachable without covering fields or the system keyboard.
- Let long names and validation messages wrap; prevent horizontal page overflow.
- Preserve position, unsaved input, autosave ordering and predictable back behavior
  when switching sections or preview modes.

## Components and state

- Use plain field labels, short explanations and errors next to the relevant field.
- Prefer grouped settings and explicit dependencies over dense switch walls.
- Show save/build state with text and an icon. Distinguish queued, building, failed
  and ready states using their actual backend state.
- Keep native feature availability and provider setup clear. A saved option must
  not visually imply that an unimplemented native module is active.
- Keep account/provider credentials out of status summaries, logs and preview UI.
- Preserve keyboard access, visible focus, reduced-motion behavior and readable
  zoomed layouts alongside touch operation.

## Implementation stages after functional parity

1. Introduce tokens and shared components without changing profile/API contracts.
2. Apply the lighter shell, app list and navigation hierarchy.
3. Restyle editors and preview layout, including mobile section switching.
4. Apply the system to build history, downloads, management and settings pages.
5. Verify the completed workflows on narrow and wide viewports, keyboard/touch,
   loading/error states and long content; record actual results in the release.

Acceptance depends on readable light surfaces, retained STU identity, complete
mobile operation and preserved functionality. A palette swap alone does not
complete the redesign, and this planned design is not evidence that it has shipped.
