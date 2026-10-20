# Quantum Builder: Platform Functional Parity Roadmap

Updated: **2026-10-20**. Public reference inventory reviewed on the same date.

This document records scope, dependency order and the current handoff. The detailed
feature lists remain in [FEATURE_MATRIX.md](FEATURE_MATRIX.md) and
[FUNCTIONAL_PARITY.md](FUNCTIONAL_PARITY.md). A capability is complete only within
its stated platform and tested scope; a saved profile field is not native support.

The reference scope now includes **Median, MobiLoud, Twinr and CatDoes**. The three
additional platforms were requested on 2026-10-20. Their source-backed inventory
and Quantum acceptance targets are in
[REFERENCE_PLATFORM_EXPANSION.md](REFERENCE_PLATFORM_EXPANSION.md). This filename
is retained so existing links and handoffs continue to work.

## Binding product decisions

- The 2026-09-18 agreement sets **functional parity first, then the brighter
  Quantum Enterprise redesign**. The user reaffirmed the full scope and brighter
  design direction on 2026-10-20. The design direction is retained
  in [QUANTUM_ENTERPRISE_DESIGN.md](QUANTUM_ENTERPRISE_DESIGN.md).
- The four platforms are references for capabilities and workflows. Quantum owns its code,
  profile contracts, runtime modules and visual identity.
- The custom splash and STU attribution work is **closed**. The user confirmed
  completion on 2026-10-20; an old device-test note must not reopen this work or
  block the remaining roadmap.
- The complete publicly documented scope is retained, including advanced plugins,
  management and deployment. No artificial Quantum product-tier locks are planned.
- Android remains the active engine. iOS stays a separate planned engine, with
  explicit platform status rather than an implied Android equivalent.
- CatDoes adds a planned generated-application mode. It is a separate project
  capability alongside the existing website-wrapper workflow; framework selection
  remains an implementation decision. All newly added scope remains `PLANNED`.
- AI model access is **API-only**, as finalized on 2026-10-20: endpoint, API key
  and model identifier. Quantum installs no inference service or model weights
  and runs no model-sync daemon. Product copy remains provider-neutral. See
  [AI_API_INTEGRATION.md](AI_API_INTEGRATION.md) for the connection and CoreUI reuse plan.

## Recorded baseline and current tranche

| Component | Baseline |
|---|---|
| Quantum Builder | `0.1.0-alpha13`, `main`, `8cfb6cfa038738c02a1603c4c49185609261960b`; icon PR #25 merged |
| Quantum Mobile Wrapper | `0.1.0-beta10`, `compat/android-6-api23`, `21313664e996d2fc7805948e6d17f84dac58709d`; icon PR #26 merged |
| Current alpha14 candidate | Sidebar groups, nesting and collapse across editor, persistence, preview and compiler; companion beta11 native code is **IMPLEMENTED_PENDING_QA** |

The Builder uses the compatibility branch as its default wrapper source. Wrapper
`main` is a different line of development; its open integration must retain both
branches' work, including the native playlist implementation. See
[Wrapper PR #9](https://github.com/Starlight-Unit-Studio/Quantum-Mobile-Wrapper/pull/9).

The alpha11 baseline includes signed APK/AAB/source/checksum output, persistent
signing, automatic version codes, public downloads, app icons, loading controls,
theme/system bars, native navigation foundations, link rules/deep links, web
overrides, asset-store/startup-download wiring, and the completed splash lifecycle.
See the [alpha11 source](https://github.com/Starlight-Unit-Studio/Quantum-Builder/tree/c3577af04c32d961ff7fc6a1cc75e53a1aa7e6ce)
and the detailed matrices for individual boundaries.

### Alpha12 acceptance scope

Implementation status: **BUILDER**. Local integration checks passed on 2026-10-20.
This is the acceptance of the scoped editor/preview tranche, not overall parity
or a deployment claim. Alpha12 is now merged into Builder main via PR #24.

- [x] Verify visual creation, editing, ordering and deletion of shared menu items.
- [x] Verify existing profile fixtures and the advanced JSON representation remain compatible.
- [x] Verify the current runtime limits: at most 12 shared destinations, with the
  first five used by Bottom Tabs.
- [x] Verify Top Bar, Sidebar, Bottom Tabs and Contextual Toolbar preview behavior,
  colors and layout space on mobile and desktop.
- [x] Verify invalid menu input blocks saving and build queueing in the UI.
- [x] Verify autosave persists edits and preview navigation survives menu edits.

Evidence: `node --test tests/test_navigation_model.js` and
`node tests/test_navigation_ui.cjs`. The browser test renders the actual Builder
frontend with isolated API/website fixtures and checks desktop (1440px) and mobile
(390px, 360px). Its model checks cover trusted URL boundaries and runtime-compatible
relative destinations. The browser test requires Playwright; set
`QB_BROWSER_EXECUTABLE` to use an existing compatible Chromium binary and optionally
`QB_SCREENSHOT_DIR` for screenshots. No production server or Android build is used
by this tranche's browser regression, and GitHub Actions was not used for validation.

The browser simulator previews presentation and navigation configuration. It is
not an Android emulator and does not establish native plugin or OS behavior.
Multiple menus, typed custom actions and visibility rules remain later work.
Nested groups are recorded separately in the alpha14 tranche below.

### Alpha13 icon tranche

The [icon contract and validation record](NAVIGATION_ICONS.md) covers the visual
Normal/Aktiv controls, 20 built-ins, static PNG uploads, profile persistence,
selected-state preview and deduplicated compiled assets. Existing iconless menus
remain compatible. Icon-bearing builds explicitly require the beta10 wrapper module.

Builder acceptance is complete for the recorded local model, browser, PHP/SQLite
and compiler checks. Native code exists, navigation tests pass and its Java sources
compile against API 23; device rendering acceptance remains open. No GitHub Actions
run, APK installation or deployment is claimed by these local checks.

- [x] Implement and locally verify icon selection, upload, persistence and preview.
- [x] Compile PNGs to bounded bundled assets with short runtime references.
- [x] Implement normal/active native icon rendering and fallback behavior.
- [ ] Accept a generated APK on Android 6 and a current Android device/emulator.

### Alpha14 group tranche

The [group contract and validation record](NAVIGATION_GROUPS.md) covers named
groups, three group levels, collapse defaults, subtree moves, group dissolution,
recursive storage/compilation and the shared depth-first tab order. Limits apply
to the whole tree: 12 destinations, 12 groups and 24 total nodes. Group-bearing
builds require the beta11 wrapper module; flat menus retain previous compatibility.

- [x] Implement visual groups, nesting, parent selection and lossless dissolution.
- [x] Preserve the tree and both icon states through PHP storage and the compiler.
- [x] Implement grouped preview and native headers, expansion and active ancestors.
- [x] Keep the first five depth-first destinations as tabs, with an empty-menu Home fallback.
- [ ] Accept a generated grouped APK on Android 6 and a current Android device/emulator.

Local validation and its exact scope are maintained in the group record. The next
implementation block is independent menu sets and URL-based selection/visibility
rules. APK rendering remains a separate acceptance item; the browser preview and
API 23 source compilation do not establish device behavior.

## Status rules

| Status | Meaning |
|---|---|
| `BUILDER` | Working Builder functionality, with the recorded UI/API checks |
| `RUNTIME` | Compiled and implemented in the generated app, with native validation |
| `IMPLEMENTED_PENDING_QA` | Code exists in the current tranche; integration acceptance is open |
| `PROFILE` | Configuration is stored; native behavior is incomplete |
| `PLANNED` | Capability has not been implemented |
| `IOS-LATER` | Depends on the separate iOS engine |

Track provider setup and hardware requirements separately from implementation
status. Each finished capability needs its supported platform/API range,
configuration surface, runtime behavior, failure behavior and validation evidence.

## Delivery order

The order below is the implementation plan. It preserves the full destination
while delivering useful complete blocks instead of adding inactive switches.

### 1. Finish navigation and its editing workflow

- [x] Finish alpha12 integration acceptance above.
- [x] Add built-in/custom icons and active/inactive icon states; native device
  acceptance remains separately open in the alpha13 tranche above.
- [x] Add sidebar groups, nesting and collapsible sections; native device
  acceptance remains separately open in the alpha14 tranche above.
- [ ] Add independent menu sets and URL-based selection/visibility rules.
- [ ] Add page-specific titles/images, search and typed actions such as Back,
  Home, Reload, Forward and Share; preserve the trusted-navigation boundary.
- [ ] Add scroll visibility, per-surface styling and contextual-toolbar rules.
- [ ] Expand simulator controls, device presets and preview coverage alongside
  each implemented native capability.
- [ ] Add explicit per-tab state, background invalidation and refresh rules, with
  account/cart/wishlist changes as acceptance cases (ML-02, TW-05).
- [ ] Include per-tab rule precedence, screen/device/user-state targeting and
  typed page-element actions in the navigation contract (TW-03, TW-04).

Reference: [native navigation](https://docs.median.co/docs/native-navigation-overview),
[sidebar editor](https://docs.median.co/docs/sidebar-configuration),
[tab editor](https://docs.median.co/docs/tab-configuration),
[dynamic titles](https://docs.median.co/docs/dynamic-titles),
[custom icons](https://docs.median.co/docs/custom-icons).

### 2. Establish the shared bridge and plugin contract

- [ ] Replace brittle source rewriting progressively with a versioned generated
  profile contract and explicit compatibility checks.
- [ ] Define plugin identity, version, supported platforms/API levels, configuration
  schema, required permissions, build dependencies and lifecycle hooks.
- [ ] Provide capability discovery, asynchronous results, stable error codes,
  listener registration/removal and lifecycle cancellation.
- [ ] Enforce allowed origins/paths for privileged calls and typed action routing.
- [ ] Add a Quantum JavaScript client, framework/NPM integration, SPA navigation
  support and a documented ready/resume/keyboard event contract.
- [ ] Keep provider credentials and signing secrets in their appropriate server or
  worker stores; generated apps receive only the configuration they need.
- [ ] Add device/app information, clipboard, native sharing, permission status,
  permission requests and the app-settings action.
- [ ] Wire the existing Share and Haptics profiles into real native modules first;
  then connect NMP selection, biometrics, QR scanning and push configuration.
- [ ] Define web/native screen events, authenticated identity handoff, reusable
  data-source requests and page-element action results for the expanded scope.

Reference: [JavaScript Bridge](https://docs.median.co/docs/javascript-bridge),
[permissions](https://docs.median.co/docs/permissions-overview),
[native share](https://docs.median.co/docs/prompt-share-dialogue),
[plugin architecture reference](https://docs.median.co/docs/native-plugins-overview).

### 3. Complete interface, links, web controls and offline behavior

- [ ] Add runtime display brightness, richer orientation/gesture controls,
  viewport/window settings, localization and per-surface theme variants.
- [ ] Add adaptive icon generation, image editing and remaining branding variants
  without reopening the accepted factory/custom splash behavior.
- [ ] Add verified Android App Links, association-file generation/validation,
  in-app secondary browser windows and link context menus.
- [ ] Add full user-agent replacement, device header variables, platform/path
  override rules and explicit cache clearing/modes.
- [ ] Add a self-contained offline-page editor/upload, timeout, retry action,
  localized defaults and local initial-page mode.
- [ ] Add an offline file manager with progress, cancellation, deletion, opening
  and sharing; distinguish this from automatic manifest asset synchronization.
- [ ] Add native key/value storage and separately specified backup/sync behavior.
- [ ] Add a full OfflineSync application mode after the storage/update contract is
  defined, including interrupted updates and content-version compatibility.
- [ ] Add first-run onboarding with persisted completion and deliberate permission
  timing. This is distinct from the completed splash behavior (ML-03, TW-06).
- [ ] Add a native-screen component editor and renderer, including text, media,
  lists/products/settings, buttons, search and countdowns (TW-01, TW-03).
- [ ] Add REST data-source configuration, response mapping and loading/empty/error
  previews for those native screens (TW-02).
- [ ] Verify website journeys, login/session boundaries, app-specific content and
  checkout/redirect behavior alongside the native layer (ML-01, ML-04, ML-05).

Reference: [interface](https://docs.median.co/docs/app-interface-overview),
[display controls](https://docs.median.co/docs/device-screen-control),
[localization](https://docs.median.co/docs/localization),
[branding](https://docs.median.co/docs/branding-overview),
[links](https://docs.median.co/docs/link-handling-overview),
[web overrides](https://docs.median.co/docs/website-overrides-overview),
[cache controls](https://docs.median.co/docs/clear-webview-cache),
[offline page](https://docs.median.co/docs/offline-page),
[offline downloads](https://docs.median.co/docs/offline-download-manager),
[datastore](https://docs.median.co/docs/native-datastore).

### 4. Deliver native capabilities and provider adapters

- [ ] Track every named integration in the inventory below with separate Android
  and iOS status, setup requirements and supported operations.
- [ ] Complete direct OS modules: sharing in/out, haptics, biometrics, scanning,
  contacts, calendar, review prompts, storage, screenshots and device capabilities.
- [ ] Expand Quantum NMP with service-owned playback, playlists, media sessions,
  notifications, lock-screen metadata and controls where supported.
- [ ] Treat background recording separately from background playback.
- [ ] Integrate direct FCM/APNs and provider adapters, including token changes,
  notification consent, foreground/background delivery and click routing.
- [ ] Add authentication, analytics, payment, health, location, media and enterprise
  modules in dependency-sized batches.
- [ ] Provide an extension contract for customer-specific vendor SDKs and hardware.
  A generic extension mechanism does not count an unimplemented adapter as done.
- [ ] Add provider identity association/reset, profile attributes and supported
  merge behavior across login/logout and account changes (ML-06).
- [ ] Add audience segments, event/scheduled push campaigns, personalized delivery,
  in-app messages and a native notification inbox (TW-07 through TW-10).
- [ ] Add commerce and marketplace adapters for app-only offers, loyalty, cart
  synchronization and conversation events; retain Sharetribe and the additional
  provider evidence in the reference inventory (ML-07, TW-12).
- [ ] Add acquisition/retention, app revenue and campaign reporting with explicit
  event and attribution contracts (ML-08, TW-11).

Reference: [native functionality](https://docs.median.co/docs/native-functionality),
[media](https://docs.median.co/docs/media),
[push](https://docs.median.co/docs/push-notifications-overview),
[authentication](https://docs.median.co/docs/authentication),
[analytics](https://docs.median.co/docs/analytics),
[enterprise security](https://docs.median.co/docs/enterprise-plugin).

### 5. Complete management, build and distribution workflows

- [ ] Add members, organization roles and app-specific access levels.
- [ ] Add app tags/groups/pins and selective configuration import between apps.
- [ ] Add account security, 2FA and optional OIDC SSO.
- [ ] Add tester/device management, infrastructure status and global settings.
- [ ] Add signing-profile management and deliberate keystore backup/import/export.
- [ ] Add deployment-account configuration, release metadata, test tracks and
  Google Play publishing workflows with reviewable destinations.
- [ ] Add a documented build/artifact API for external CI/CD clients.
- [ ] Retain build reproducibility, source downloads and update identity throughout.
- [ ] Add reusable configuration templates/versions and same-phone native preview
  links, with QR sharing available for a second device (TW-14, CD-05).
- [ ] Add website install/promotional widgets and device-aware download links
  (ML-09, TW-13), plus editable localized store descriptions and screenshots (TW-17).
- [ ] Track release preparation, store feedback, supported migrations and OS/SDK
  maintenance as explicit operational work (ML-11, ML-12).
- [ ] Define remote configuration rollout/rollback separately from website changes,
  asset updates and binary releases; require rebuilds when native compatibility
  changes (TW-15).

Reference: [accounts](https://docs.median.co/docs/app-studio-accounts),
[multiple app instances](https://docs.median.co/docs/multiple-app-instances),
[build/download/simulators](https://docs.median.co/docs/app-studio),
[Android deployment](https://docs.median.co/docs/android-build-deployment).
Automated Google Play publishing is a Quantum workflow target; the cited Median
overview alone is not evidence of an equivalent automatic upload feature.

### 6. Add the iOS engine and complete platform-specific scope

- [ ] Build an independent iOS runtime/compiler using the shared profile contract.
- [ ] Add signing/provisioning, development/distribution IPA output, registered
  testers, App Store Connect upload and TestFlight workflows.
- [ ] Implement iOS navigation behavior, permissions descriptions, ATT,
  accessibility, branding and platform visual effects as explicit capabilities.
- [ ] Implement iOS-only integrations and cross-platform equivalents where sensible.
- [ ] Reconcile the full inventory against both engines before claiming overall
  parity; Android delivery does not silently complete iOS items.

Reference: [iOS build and deployment](https://docs.median.co/docs/ios-build-deployment).

### 7. Add generated-application projects

- [ ] Implement the small [external API connection](AI_API_INTEGRATION.md) first:
  endpoint/key/model, a real connection check and useful provider errors. Reuse
  appropriate CoreUI settings/transport pieces without its local-model lifecycle.
- [ ] Add a generated-app project type alongside the wrapper, with explicit mobile
  and web engines and support for multiple app targets in one project (CD-02, CD-03).
- [ ] Turn a prompt, website analysis or repository import into a reviewable screen
  inventory, application specification and implementation plan (CD-01, CD-02).
- [ ] Add durable API-backed AI jobs with visible progress, interruption/recovery,
  reconnectable sessions and isolated project workspaces (CD-01). Model inference
  stays with the configured API provider; project/build execution remains separate.
- [ ] Add mobile source editing, file references, screenshot feedback, browser and
  device previews with target-specific limitations (CD-04, CD-05).
- [ ] Add checkpoints, GitHub synchronization, branch/conflict workflows and complete
  source export with independently reproducible builds (CD-06, CD-07, CD-12).
- [ ] Add optional application database/auth/storage/functions/realtime services
  and external-backend adapters, separated from Builder management data (CD-08).
- [ ] Add generated-web hosting/custom-domain releases and target-specific native
  build profiles, sharing existing release infrastructure where appropriate
  (CD-09, CD-10).
- [ ] Add required-configuration checks and actionable release-readiness findings,
  with secure provider credential entry and no implied store approval (CD-09).
- [ ] Add application error monitoring and reproducible repair jobs with reviewable
  diffs; define source, data and deployed-release recovery separately (CD-11).

Evidence and implementation boundaries:
[CatDoes inventory](REFERENCE_PLATFORM_EXPANSION.md#catdoes-inventory).
This phase records a new capability track, not a replacement of the current
Android runtime or an assertion that a generator already exists.

### 8. Deliver the brighter Quantum Enterprise redesign

- [ ] Execute [the retained design specification](QUANTUM_ENTERPRISE_DESIGN.md)
  after the functional phase, preserving the completed workflows and mobile access.
- [ ] Review the final capability inventory and platform coverage before declaring
  the parity phase complete. Individual navigation tranches are only part of it.

## Named integration inventory

This section counts **Median's** named integrations. The additional platform
families and adapters are tracked in
[REFERENCE_PLATFORM_EXPANSION.md](REFERENCE_PLATFORM_EXPANSION.md), without
double-counting shared providers or claiming a combined completion percentage.

Inventory date: **2026-10-20**. The public
[Median plugin catalogue](https://median.co/plugins) contains **61 named entries**.
Names identify comparison targets; individual completion status belongs in the
detailed matrices.

| Category | Catalogue entries |
|---|---|
| Push and engagement | OneSignal; Firebase Cloud Messaging; Customer.io; Sendbird; Braze; Cordial; IBM Cloud; Intercom; Optimizely; Iterable; Klaviyo; MoEngage; Salesforce Marketing Cloud; Bloomreach; Microsoft Dynamics 365; Xtremepush |
| Authentication and protection | Social Login; Face ID/Touch ID Android Biometric; Enterprise Security; Jailbreak/Root Detection; Auth0; AgeSafety; Passkey WebAuthn (Android); Microsoft Intune; Clerk |
| Analytics | Google Firebase Analytics; Google Firebase Crashlytics; Meta App Events; Adjust; AppsFlyer; Intent Edge |
| Media and communication | Background Audio; Native Media Player; Zoom Video; Moxo; Twilio; Kaltura Media Player; Web Screenshot; JWPlayer |
| Device and local features | QR / Barcode Scanner; App Review; Share into app; Native Datastore; Background Location; Haptics; Health Bridge; Native Contacts; Document Scanner; Calendar; Offline Downloads; NFC Tag Scanner; iBeacon; Scandit QR / Barcode |
| Commerce and other integration | In-App Purchases; AdMob Native Ads; RevenueCat; Secure Modal (Apple Pay); Branch.io; Card.io; Shopify; Reader Modal (External Link Account) |

The official [integrations documentation](https://docs.median.co/docs/integrations)
also lists **Master Lock** and **Social Share**. Include these two additional entries
for **63 documented named integrations**. Social Share targets selected social-app
destinations; it is distinct from the OS share sheet and receiving shared content.
The inventory count is not a feature count or percentage of completed parity.

## Dependencies and evidence boundaries

- Vendor adapters can require accounts, configuration files, API keys, licenses or
  vendor SDKs. For example, Scandit documents a separate license requirement.
  Such requirements do not justify artificial Quantum tier restrictions.
- Platform/hardware requirements must be visible: the reference lists Calendar
  and iBeacon as iOS capabilities and the named WebAuthn entry as Android-specific.
- A browser preview cannot verify native SDK behavior. Record focused native
  evidence when promoting a module to `RUNTIME`; do not manufacture successful CI
  or device results when a test environment is unavailable.
- Keep the public snapshot dated. Private/bespoke Median implementations cannot be
  enumerated from its public website; the extension architecture covers that class
  of requirement without claiming access to private code.

Sources: [plugin prerequisites](https://docs.median.co/docs/native-plugins-overview),
[scanning](https://docs.median.co/docs/scanning),
[native functionality](https://docs.median.co/docs/native-functionality),
[authentication](https://docs.median.co/docs/authentication).
