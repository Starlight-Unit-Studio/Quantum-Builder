# Quantum Builder Functional Parity Matrix

## Goal

Quantum Builder targets functional parity with the capabilities exposed by modern web-to-native builders such as Median while keeping its own Terran terminal design, codebase, runtime architecture and product identity.

This is a capability/workflow target only. We do not copy proprietary source code, assets or a pixel-identical UI.

Status legend:

- `RUNTIME` - works in generated wrapper/runtime
- `PROFILE` - stored/configurable in Builder, runtime wiring still incomplete
- `BUILDER` - Builder-side feature works
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
- Live rendering of native navigation overlays - `PLANNED`

## Overview

- App name - `PROFILE`
- Website URL - `PROFILE`
- App description - `PROFILE`
- Trusted domain - `PROFILE`
- Wrapper runtime ref - `PROFILE`
- Private management/share link - `PLANNED`
- Public share link - `PLANNED`
- App access/member assignment - `PLANNED`

## Branding

- Primary/accent colors - `PROFILE`
- Status bar color - `PROFILE`
- Android system navigation bar color - `PROFILE`
- Splash background - `PROFILE`
- App icon upload - `PLANNED`
- Adaptive Android icon generation - `PLANNED`
- Splash image upload - `PLANNED`
- Light/dark splash variants - `PLANNED`
- Light/dark theme colors - `PLANNED`
- Status bar text appearance - `PLANNED`
- Image crop/preview tooling - `PLANNED`
- iOS branding variants - `IOS-LATER`

## Interface

- Dark mode setting - `PROFILE`
- Orientation - `PROFILE`
- Keep screen on - `PROFILE`
- Immersive fullscreen - `PROFILE`
- Native page transitions - `PROFILE`
- Pull-to-refresh - `PROFILE`
- Pinch-to-zoom - `PROFILE`
- Android font scaling - `PROFILE`
- Swipe navigation gestures - `PLANNED`
- Transition alpha/transparency - `PLANNED`
- Loading spinner styling - `PLANNED`
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

- Enable/display mode - `PROFILE`
- Hide with scroll - `PLANNED`
- App image/title - `PLANNED`
- Light/dark colors - `PLANNED`
- Visual menu editor - `PLANNED`
- Multiple menus - `PLANNED`
- Visibility rules - `PLANNED`
- Advanced mode - `PLANNED`
- New-window hierarchy levels - `PLANNED`

### Sidebar Navigation

- Enable - `PROFILE`
- App image/name - `PLANNED`
- Font/style controls - `PLANNED`
- Light/dark background/foreground/separator/highlight - `PLANNED`
- Visual menu editor - `PLANNED`
- Icon/label/link items - `PLANNED`
- Grouping/collapsible groups - `PLANNED`
- Drag/drop ordering - `PLANNED`
- Restore defaults / clear all - `PLANNED`
- Advanced mode - `PLANNED`

### Bottom Tab Bar

- Enable/default mode - `PROFILE`
- Hide with scroll - `PLANNED`
- Light/dark styling - `PLANNED`
- Active/inactive tab colors - `PLANNED`
- Visual tab editor - `PLANNED`
- Multiple tab menus - `PLANNED`
- Visibility rules - `PLANNED`
- Icons/text/links - `PLANNED`
- Advanced mode - `PLANNED`

### Contextual Navigation Toolbar

- Enable - `PROFILE`
- Visibility by pages - `PLANNED`
- Visibility by back-button status - `PLANNED`
- Back button label/pages - `PLANNED`
- Refresh button configuration - `PLANNED`
- Forward button configuration - `PLANNED`
- Preview - `PLANNED`
- iOS-first implementation - `IOS-LATER`

## Link Handling

- New-window policy - `PROFILE`
- Deep-link scheme - `PROFILE`
- Ordered link behavior rules - `PLANNED`
- Internal / in-app browser / external behavior - `PLANNED`
- Domain/path match rules - `PLANNED`
- Non-web protocol rules - `PLANNED`
- Universal/App Links domains - `PLANNED`
- Android intent/deep-link manifest generation - `PLANNED`
- Context menu - `PLANNED`

## Permissions

- Location - `PROFILE`
- Microphone/WebRTC audio - `PROFILE`
- Camera/WebRTC video - `PROFILE`
- Public downloads - `PROFILE`
- Background audio - `PROFILE`
- JavaScript bridge allowed URLs - `PLANNED`
- Runtime permission bridge - `PLANNED`
- Download directory/fallback storage policy - `PLANNED`
- Native permission status/query API - `PLANNED`
- Open app settings bridge - `PLANNED`
- iOS tracking transparency - `IOS-LATER`
- iOS permission descriptions - `IOS-LATER`

## Web Overrides

- User-agent suffix - `PROFILE`
- Custom HTTP headers - `PROFILE`
- Custom CSS - `PROFILE`
- Custom JavaScript - `PROFILE`
- Cookie persistence mode - `PROFILE`
- Complete user-agent replacement - `PLANNED`
- Android/iOS-specific CSS - `PLANNED`
- Android/iOS-specific JavaScript - `PLANNED`
- Bridge framework/NPM mode - `PLANNED`
- Header device variables - `PLANNED`
- Per-domain/per-path injection rules - `PLANNED`

## Native Plugins

Current Quantum-native modules:

- Quantum Native Media Player - `RUNTIME`
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

Third-party plugins may require the user's own provider account, credentials or paid provider plan. Quantum Builder itself should not introduce artificial product-tier locks around integrations.

## Build & Deploy

- Package ID - `PROFILE`
- Version name/code - `PROFILE`
- minSdk/targetSdk - `PROFILE`
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

## Rule for future work

New UI switches are not considered complete merely because they can be saved. Every feature must have an explicit status and move to `RUNTIME` only after the generated application actually implements the behavior and automated or device testing covers it.
