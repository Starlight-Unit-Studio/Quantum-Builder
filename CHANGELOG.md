# Changelog

## 0.1.0-alpha7

Wrapper-aware public artifact downloads.

- Public Downloads is now compiled into the Android runtime instead of remaining profile-only.
- Android 10+ writes enabled downloads into the public Downloads directory.
- Android 6 through 9 request legacy storage permission when public downloads are enabled and fall back safely to app-specific storage if permission is unavailable.
- Disabled Public Downloads deliberately keeps files in app-specific external storage.
- Build artifact links now carry explicit browser/WebView download semantics.
- Documents Quantum Builder as a supported first-party Quantum Wrapper workload.
- Builder version bump refreshes cached frontend assets after update.

## 0.1.0-alpha6

Native interface controls.

- Immersive Fullscreen is now compiled into the generated Android runtime.
- Pull-to-Refresh is now a real native SwipeRefreshLayout gesture and reloads through Quantum's trusted navigation/header path.
- Pinch-to-Zoom now controls Android WebView zoom support without legacy on-screen zoom buttons.
- Font Scale now compiles to Android WebView text scaling from 50% through 200%.
- Interface values receive Builder-side validation and worker-side bounds.
- Builder version bump refreshes cached frontend assets after update.

## 0.1.0-alpha5

Runtime Web Overrides.

- Custom CSS is now compiled into generated apps and injected only into trusted app pages.
- Custom JavaScript is now compiled into generated apps and executed only on trusted app pages.
- Cookie Persistence now offers encrypted persistent sessions, website/server defaults and session-only starts.
- Legacy `default` cookie profiles migrate to persistent mode to preserve existing Quantum session behavior.
- Custom CSS and JavaScript are capped at 48 KiB each to stay safely below Android/Java constant limits.
- Builder version bump refreshes cached frontend assets after update.

## 0.1.0-alpha4

Native loading indicator controls.

- exposes per-app loading indicator mode, color, bar thickness, spinner size and overlay dimming under Interface
- compiles the selected values into the Android wrapper runtime
- preserves the existing top loading bar as the default for older profiles
- bumps the Builder version so browser assets receive a fresh cache-busting version after update

## Unreleased

Per-app native loading indicator controls.

- Adds native loading UI choices for none, top bar, bottom bar, centered spinner and fullscreen spinner.
- Adds per-profile color, bar thickness, spinner size and fullscreen overlay dimming.
- Persists the settings in the app profile and compiles them into the Android wrapper during every build.
- Keeps the existing top loading bar as the default so older profiles retain current behavior.
- Keeps loading UI independent from the mandatory STU production splash.

## 0.1.0-alpha3

Custom-header object contract hotfix.

- fixes profiles whose empty `web.custom_headers` value was hydrated as JSON `[]` even though the Builder UI requires a JSON object
- API responses now always expose `web.custom_headers` as a JSON object, including the empty `{}` case
- legacy stored empty arrays and malformed scalar header values are normalized safely instead of blocking every profile save
- new/updated profiles persist custom headers with object semantics so the Android worker receives a stable dictionary shape
- `REBUILD ALL` is no longer blocked by the unrelated Custom Headers validator on otherwise valid profiles
- regression coverage now verifies both the stored JSON shape and legacy-profile hydration

## 0.1.0-alpha2

Profile persistence and Android versioning hardening.

- app profile fields now autosave instead of depending on a manual save before navigation
- unsaved profile changes are flushed when leaving an app, logging out or closing the page when possible
- autosave avoids overwriting newer in-progress edits with an older server response
- Android version codes are now Builder-managed and cannot be overwritten by profile saves
- every queued build automatically advances the Android version code
- new profiles start at code 0 so their first queued build receives code 1
- queue responses return the newly versioned app profile to the UI immediately
- installer updates `QB_VERSION` inside an existing `.env` so browser asset cache-busting follows Builder updates

The profile UI still distinguishes runtime-connected features from stored profile features. Runtime wiring for the remaining Median-parity controls continues separately.

## 0.1.0-alpha1

Initial Quantum Builder bootstrap.

- self-hosted authenticated web control plane
- canonical Terran terminal UI foundation
- app profile persistence
- Android build queue and worker
- stable per-app signing identity
- generated signed APK and AAB from one build
- Source ZIP and SHA256SUMS output
- build history and authenticated downloads
- SSH quick installer with update-safe persistent state
- curl-pipe installer bootstrap works without requiring a TTY for Docker Compose
- interrupted first installs resume administrator bootstrap safely on the next installer run
- installer normalizes repository source permissions so unprivileged PHP/Nginx containers can read bind-mounted application files even under the secure setup umask
- preflight and stack management helpers
- PHP/Python/shell/Compose/web smoke CI
- real generated Android release integration workflow

Advanced builder controls are intentionally staged. See `docs/FEATURE_MATRIX.md` for the distinction between runtime-connected, profile-only and planned features.
