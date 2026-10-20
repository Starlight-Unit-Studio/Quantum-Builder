# Quantum Builder Functional Parity Matrix

Updated for Builder **0.1.0-alpha15**. The complete dated reference inventory and
dependency order are retained in [MEDIAN_PARITY_ROADMAP.md](MEDIAN_PARITY_ROADMAP.md).
The approved brighter Builder direction is retained separately in
[QUANTUM_ENTERPRISE_DESIGN.md](QUANTUM_ENTERPRISE_DESIGN.md).

## Goal

Quantum Builder targets the combined capability and workflow scope recorded for
Median, MobiLoud, Twinr and CatDoes. Wrapper/native-screen capabilities and generated
application projects retain separate engines and acceptance criteria. Quantum owns
its codebase, runtime architecture and product identity, with the brighter
Enterprise design planned after the functional phase.

The dated evidence, reference IDs and additional acceptance scope are in
[REFERENCE_PLATFORM_EXPANSION.md](REFERENCE_PLATFORM_EXPANSION.md).

This is a capability/workflow target only. We do not copy proprietary source code, assets or a pixel-identical UI.

Status legend:

- `RUNTIME` - works in generated wrapper/runtime
- `PROFILE` - stored/configurable in Builder, runtime wiring still incomplete
- `BUILDER` - Builder-side feature works
- `IMPLEMENTED_PENDING_QA` - code and local checks exist; native device acceptance is open
- `PLANNED` - not implemented yet
- `IOS-LATER` - intentionally deferred until the iOS engine exists

## Simulator

- Android Phone preview - `BUILDER`
- Android Tablet preview - `BUILDER`
- Zoom 0-100% - `BUILDER`
- Mute / sound control - `BUILDER`
- Home - `BUILDER`
- Reload - `BUILDER`
- Portrait / landscape rotate - `BUILDER`
- Persist simulator preferences - `BUILDER`
- iPhone preview - `IOS-LATER`
- iPad preview - `IOS-LATER`
- Simulator setting panel - `PLANNED`
- Device presets / resolutions - `PLANNED`
- Live rendering of current native navigation overlays - `BUILDER` (approximate
  browser presentation of Top Bar, Sidebar, Bottom Tabs and Contextual Toolbar)
- Simulator-owned route history and current-route reload - `BUILDER`
- Normal/active built-in and custom PNG navigation icons - `BUILDER`
- Nested sidebar groups, initial/manual collapse and active ancestor preview - `BUILDER`

## Overview

- App name - `RUNTIME`
- Website URL - `RUNTIME`
- App description - `PROFILE`
- Trusted domain - `RUNTIME`
- Wrapper runtime ref - `BUILDER`
- Private management/share link - `PLANNED`
- Public share link - `PLANNED`
- App access/member assignment - `PLANNED`

## Branding

- Primary/accent colors - `PROFILE`
- Status bar color - `RUNTIME`
- Android system navigation bar color - `RUNTIME`
- Splash background - `RUNTIME`
- App icon upload - `RUNTIME`
- Adaptive Android icon generation - `PLANNED`
- Splash image upload - `RUNTIME`
- Post-custom-splash STU attribution banner - `RUNTIME`
- Light/dark splash variants - `PLANNED`
- Light/dark theme colors - `PLANNED`
- Status bar text appearance - `RUNTIME`
- Image crop/preview tooling - `PLANNED`
- iOS branding variants - `IOS-LATER`

## Interface

- Dark mode setting - `RUNTIME`
- Orientation - `RUNTIME`
- Keep screen on - `RUNTIME`
- Immersive fullscreen - `RUNTIME`
- Native page transitions - `RUNTIME`
- Pull-to-refresh - `RUNTIME`
- Pinch-to-zoom - `RUNTIME`
- Android font scaling - `RUNTIME`
- Swipe navigation gestures - `PLANNED`
- Transition alpha/transparency - `PLANNED`
- Loading spinner styling - `RUNTIME`
- Pull-to-refresh styling - `PLANNED`
- Maximum windows - `PLANNED`
- Viewport/page-width scaling - `PLANNED`
- Native localization / Accept-Language configuration - `PLANNED`
- Offline page editor - `PLANNED`
- Offline connection timeout - `PLANNED`
- Offline page upload - `PLANNED`
- Offline page update from URL - `PLANNED`
- iOS accessibility/dynamic type - `IOS-LATER`
- iOS-only visual effects - `IOS-LATER`

## Native Navigation

### Top Navigation Bar

- Enable/display mode - `RUNTIME`
- Hide with scroll - `PLANNED`
- App title - `RUNTIME`
- App image - `PLANNED`
- Light/dark colors - `PLANNED`
- Visual menu editor - `PLANNED`
- Multiple menus - `PLANNED`
- URL visibility rules - `BUILDER`; native implementation `IMPLEMENTED_PENDING_QA` (beta12)
- Advanced mode - `PLANNED`
- New-window hierarchy levels - `PLANNED`

### Sidebar Navigation

- Enable - `RUNTIME`
- App image/name - `PLANNED`
- Font/style controls - `PLANNED`
- Light/dark background/foreground/separator/highlight - `PLANNED`
- Visual label/URL menu editor - `BUILDER` (existing shared runtime menu)
- Label/link items - `RUNTIME`
- Built-in/custom PNG icon editor and normal/active preview - `BUILDER`
- Native item icons and active-state rendering - `IMPLEMENTED_PENDING_QA` (beta10)
- Visual groups, three group levels, subtree moves and group dissolution - `BUILDER`
- Recursive group persistence and compilation - `BUILDER` (beta11 group module required)
- Native grouping/collapse and active ancestors - `IMPLEMENTED_PENDING_QA` (beta11)
- Drag/drop, touch-button and keyboard ordering - `BUILDER`
- Restore defaults / clear all - `PLANNED`
- Advanced menu JSON editing - `BUILDER`
- Independent menu selection and ordered URL rules - `BUILDER`; native implementation `IMPLEMENTED_PENDING_QA` (beta12)

### Bottom Tab Bar

- Enable/default mode - `RUNTIME`
- Hide with scroll - `PLANNED`
- Light/dark styling - `PLANNED`
- Independent active/inactive tab backgrounds and borders - `PLANNED`
- Visual shared-menu editor - `BUILDER` (first five destinations in depth-first menu order)
- Independent tab menus - `BUILDER`; native implementation `IMPLEMENTED_PENDING_QA` (beta12)
- URL visibility rules - `BUILDER`; native implementation `IMPLEMENTED_PENDING_QA` (beta12)
- Text/links - `RUNTIME`
- Built-in/custom PNG icon editor and normal/active preview - `BUILDER`
- Native tab icons with configured foreground/accent colors - `IMPLEMENTED_PENDING_QA` (beta10)
- Advanced shared-menu JSON editing - `BUILDER`

The sidebar/tab icon schema, upload limits, wrapper dependency and remaining
Android acceptance are recorded in [NAVIGATION_ICONS.md](NAVIGATION_ICONS.md).
The group schema, collapse behavior, mobile editing and companion beta11 validation
are recorded in [NAVIGATION_GROUPS.md](NAVIGATION_GROUPS.md).
Independent Sidebar/Tabs menus, ordered URL rules, per-surface visibility and
beta12 acceptance are recorded in [NAVIGATION_MENUS.md](NAVIGATION_MENUS.md).
Top Bar custom menu/actions remain separately planned.

### Contextual Navigation Toolbar

- Enable - `RUNTIME`
- Built-in Back/Home/Reload/Forward actions - `RUNTIME`
- Visibility by URL paths/hosts - `BUILDER`; native implementation `IMPLEMENTED_PENDING_QA` (beta12)
- Visibility by back-button status - `PLANNED`
- Back button label/pages - `PLANNED`
- Refresh button configuration - `PLANNED`
- Forward button configuration - `PLANNED`
- Preview - `BUILDER` (simulator-owned history; embedded page history is not observable)
- iOS-first implementation - `IOS-LATER`

## Link Handling

- New-window policy - `RUNTIME`
- Deep-link scheme - `RUNTIME`
- Ordered link behavior rules - `RUNTIME`
- Internal / external / block behavior - `RUNTIME`
- In-app secondary browser window - `PLANNED`
- Domain/path match rules - `RUNTIME`
- Non-web protocol rules - `RUNTIME`
- Universal/App Links domains - `PLANNED`
- Android custom-scheme intent generation - `RUNTIME`
- Android verified App Links - `PLANNED`
- Context menu - `PLANNED`

## Permissions

- Location - `RUNTIME`
- Microphone/WebRTC audio - `RUNTIME`
- Camera/WebRTC video - `RUNTIME`
- Public downloads - `RUNTIME`
- Background audio - `PROFILE`
- JavaScript bridge allowed URLs - `PLANNED`
- Runtime permission bridge - `PLANNED`
- Download directory/fallback storage policy - `PLANNED`
- Native permission status/query API - `PLANNED`
- Open app settings bridge - `PLANNED`
- iOS tracking transparency - `IOS-LATER`
- iOS permission descriptions - `IOS-LATER`

## Web Overrides

- User-agent suffix - `RUNTIME`
- Custom HTTP headers - `RUNTIME`
- Custom CSS - `RUNTIME`
- Custom JavaScript - `RUNTIME`
- Cookie persistence mode - `RUNTIME`
- Complete user-agent replacement - `PLANNED`
- Android/iOS-specific CSS - `PLANNED`
- Android/iOS-specific JavaScript - `PLANNED`
- Bridge framework/NPM mode - `PLANNED`
- Header device variables - `PLANNED`
- Per-domain/per-path injection rules - `PLANNED`

## Native Plugins

Current Quantum-native modules:

- Quantum Native Media Player - `RUNTIME` for existing playback; Builder
  enable/disable compilation and full playlist/background/media-session parity remain open
- Quantum Asset Store - `RUNTIME`

Profiles already exposed:

- Share - `PROFILE`
- Haptics - `PROFILE`
- Biometrics - `PROFILE`
- QR/Barcode - `PROFILE`
- Firebase Cloud Messaging - `PROFILE`

Plugin parity targets observed in reference builder:

- OneSignal - `PLANNED`
- Firebase Cloud Messaging - `PROFILE`
- Social Login - `PLANNED`
- QR/Barcode Scanner - `PROFILE`
- Firebase Analytics - `PLANNED`
- App Review - `PLANNED`
- Share into app - `PLANNED`
- Native Datastore - `PLANNED`
- Haptics - `PROFILE`
- AdMob Native Ads - `PLANNED`
- Meta App Events - `PLANNED`
- Face ID / Touch ID / Android Biometric - `PROFILE`
- Background Location - `PLANNED`
- Health Bridge - `PLANNED`
- Firebase Crashlytics - `PLANNED`
- RevenueCat - `PLANNED`
- Background Audio - `PLANNED`
- Native Media Player - `RUNTIME`
- Native Contacts - `PLANNED`
- Calendar - `PLANNED`
- Offline Downloads - `PLANNED`
- In-App Purchases - `PLANNED`
- Document Scanner - `PLANNED`
- Branch.io - `PLANNED`
- Zoom Video - `PLANNED`
- Adjust - `PLANNED`
- AppsFlyer - `PLANNED`
- NFC Tag Scanner - `PLANNED`
- Web Screenshot - `PLANNED`
- Braze - `PLANNED`
- Cordial - `PLANNED`
- Intercom - `PLANNED`
- Iterable - `PLANNED`
- Klaviyo - `PLANNED`
- Passkey/WebAuthn Android - `PLANNED`
- Bloomreach - `PLANNED`
- Clerk - `PLANNED`
- JWPlayer - `PLANNED`
- Jailbreak/Root Detection - `PLANNED`
- Auth0 - `PLANNED`
- AgeSafety - `PLANNED`
- Customer.io - `PLANNED`
- Moxo - `PLANNED`
- Twilio - `PLANNED`
- Kaltura Media Player - `PLANNED`
- iBeacon - `IOS-LATER`
- Scandit QR/Barcode - `PLANNED`
- Microsoft Intune - `PLANNED`
- Enterprise Security - `PLANNED`
- Secure Modal (Apple Pay) - `IOS-LATER`
- Reader Modal (External Link Account) - `IOS-LATER`
- Card.io - `PLANNED`
- Shopify - `PLANNED`
- Intent Edge - `PLANNED`
- Sendbird - `PLANNED`
- IBM Cloud - `PLANNED`
- Optimizely - `PLANNED`
- MoEngage - `PLANNED`
- Salesforce Marketing Cloud - `PLANNED`
- Microsoft Dynamics 365 - `PLANNED`
- Xtremepush - `PLANNED`
- Master Lock - `PLANNED`
- Social Share - `PLANNED`

Third-party plugins may require the user's own provider account, credentials or paid provider plan. Quantum Builder itself should not introduce artificial product-tier locks around integrations.

## Build & Deploy

- Package ID - `RUNTIME`
- Version name/code - `RUNTIME`
- minSdk/targetSdk - `RUNTIME`
- Persistent per-app signing identity - `RUNTIME`
- Rebuild All - `RUNTIME`
- APK output - `RUNTIME`
- AAB output - `RUNTIME`
- Source ZIP output - `RUNTIME`
- SHA256SUMS output - `RUNTIME`
- Previous builds - `RUNTIME`
- Build status/history - `RUNTIME`
- Signing profile management UI - `PLANNED`
- Keystore backup/export workflow - `PLANNED`
- Play upload/deployment integration - `PLANNED`
- Test-track deployment - `PLANNED`
- Release notes/store metadata - `PLANNED`
- iOS IPA/TestFlight/App Store Connect - `IOS-LATER`

## Organization-level Builder

- Apps - `BUILDER`
- Members - `PLANNED`
- Android test devices/testers - `PLANNED`
- System/build infrastructure status - `PLANNED`
- Access/role controls - `PLANNED`
- App-level access assignment - `PLANNED`
- Global settings - `PLANNED`
- Store/deployment accounts - `PLANNED`
- iOS testers/App Store Connect - `IOS-LATER`

## Additional platform scope

All additional items below are `PLANNED`. Their reference IDs resolve to the
additional-platform inventory. Existing features elsewhere in this matrix retain
their own status; an overlapping provider or UI control does not complete these
broader requirements.

### Native screens, navigation and website continuity

- Retained tab state, selective background refresh and cart/wishlist invalidation
  (ML-02, TW-05) - `PLANNED`
- Per-tab rule precedence, component visibility and typed page-element actions
  (TW-03, TW-04) - `PLANNED`
- Native-screen component editor and Android/iOS renderer coverage (TW-01) - `PLANNED`
- REST request configuration, response mapping and screen data states (TW-02) - `PLANNED`
- First-run onboarding, completion state and permission timing (ML-03, TW-06) - `PLANNED`
- Website journey compatibility, app-context content and verified session lifecycle
  (ML-01, ML-04, ML-05) - `PLANNED`

### Engagement, commerce and analytics

- Provider identity association/reset, attributes and merge behavior (ML-06) - `PLANNED`
- Audience segmentation and event/scheduled push campaigns (TW-07, TW-08) - `PLANNED`
- Visual/HTML in-app messages, targeting and interaction reporting (TW-09) - `PLANNED`
- Native notification inbox, read state and destinations (TW-10) - `PLANNED`
- Commerce and marketplace adapters, including app-only offers, loyalty and
  Sharetribe inbox events (ML-07, TW-12) - `PLANNED`
- Acquisition, retention, revenue and attribution-aware reporting (ML-08, TW-11) - `PLANNED`

### Delivery and operations

- Same-phone native preview links and QR sharing (TW-14, CD-05) - `PLANNED`
- Website install/promotional widgets and device-aware redirects (ML-09, TW-13) - `PLANNED`
- Configuration templates/versions, remote rollout and rollback (TW-14, TW-15) - `PLANNED`
- Store description/screenshot tooling, release tasks and OS/SDK maintenance
  (ML-11, TW-17) - `PLANNED`
- Supported app-listing migration and signing continuity workflow (ML-12) - `PLANNED`

### Generated application projects

- External API endpoint/key/model and real connection check - `PLANNED`
- Server-side credentials, provider errors and manually entered model IDs - `PLANNED`
- Prompt/website/repository inputs and editable generation plans (CD-01, CD-02) - `PLANNED`
- API-backed agent jobs, visible progress, cancellation and recovery (CD-01) - `PLANNED`
- Separate mobile/web generation engines and multi-app projects (CD-03) - `PLANNED`
- Phone-based source editing, file context and screenshot feedback (CD-04) - `PLANNED`
- Per-engine browser/device previews and logs (CD-05) - `PLANNED`
- Source/configuration checkpoints with defined restore scope (CD-06) - `PLANNED`
- GitHub import, synchronization, branch/conflict handling and source round trips
  (CD-07) - `PLANNED`
- Optional application backend and external provider adapters (CD-08) - `PLANNED`
- Target-specific build profiles and generated-web/domain deployment
  (CD-09, CD-10) - `PLANNED`
- Required-configuration checks and release-readiness findings (CD-09) - `PLANNED`
- Error monitoring and reproducible repair jobs (CD-11) - `PLANNED`
- Complete generated-source export and independent builds (CD-12) - `PLANNED`

The [AI connection decision](AI_API_INTEGRATION.md) requires external API access.
Local inference services, model downloads and periodic model synchronization are
outside scope. CoreUI reuse is limited to suitable settings and transport pieces;
its reserved external adapter is not counted as an implemented Quantum feature.

## Rule for future work

New UI switches are not considered complete merely because they can be saved. Every feature must have an explicit status and move to `RUNTIME` only after the generated application actually implements the behavior and automated or device testing covers it.
