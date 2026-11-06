# Android 17 / API 37 compatibility

Quantum Builder 0.1.0-alpha16 adds support for Android 17 (API 37).

## Profile and build behavior

- New app profiles default to minSdk 23 and targetSdk 37.
- Existing profiles retain their saved targetSdk (including API 36).
- Minimum and target SDKs can be selected from API 23 through API 37.
- The worker installs SDK platforms 36 and 37, plus Build Tools 36.0.0
  and 37.0.0, retaining the Android 16 build environment.
- During compilation the worker raises a checked-out wrapper's compileSdk
  to the requested targetSdk only if the wrapper is lower. It never lowers
  compileSdk. The Android 6 compatibility branch uses AGP 9.4.0 and Gradle 9.6.0.
- Generated APKs and AABs use the profile's specified targetSdk.
- The Android worker integration check verifies the generated APK target SDK
  and the generated Gradle file. Its Android 16 emulator smoke test verifies
  backwards compatibility only, not Android 17 runtime behavior.

## Android 17 runtime review before production

Setting targetSdk to 37 opts into Android 17 behavior changes:

- Local network access is restricted for target 37 applications.
  Apps accessing LAN devices need a deliberate ACCESS_LOCAL_NETWORK runtime
  permission flow (or a system-mediated alternative). The builder does not
  currently offer such a toggle or request flow. Keep affected apps at
  target 36 until the permission path is implemented and tested.
- On larger displays, Android 17 changes how some orientation and resizability
  restrictions work. Check tablet layouts and Samsung DeX use cases.
- Review WebView user-agent assumptions, cookies, downloads, deep links, native
  navigation, media, and process lifecycle behavior.
- Device and Android 17 emulator acceptance tests are still outstanding.
  An API 37 build is not proof of runtime compatibility.

References:
- https://developer.android.com/about/versions/17/setup-sdk
- https://developer.android.com/about/versions/17/behavior-changes-17
- https://developer.android.com/privacy-and-security/local-network-permission
- https://developer.android.com/build/releases/agp-9-4-0-release-notes
