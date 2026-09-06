# Changelog

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
