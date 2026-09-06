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
- direct GitHub `curl | sudo bash` installer entrypoint
- KeyHelp / existing-host reverse-proxy detection without replacing the host webserver
- loopback-only builder runtime with `builder.starlight-unit.de` as the canonical public URL
- reverse-proxy header preservation through internal Nginx to PHP-FPM
- KeyHelp, Apache and Nginx proxy-snippet helper
- preflight and stack management helpers
- PHP/Python/shell/Compose/web smoke CI
- real generated Android release integration workflow

Advanced builder controls are intentionally staged. See `docs/FEATURE_MATRIX.md` for the distinction between runtime-connected, profile-only and planned features.
