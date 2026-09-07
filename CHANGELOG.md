# Changelog

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
