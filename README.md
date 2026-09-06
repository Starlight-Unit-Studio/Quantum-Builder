# Starlight Quantum Builder

**Starlight Quantum Builder** is the self-hosted browser control plane for **Starlight Quantum Mobile Wrapper** applications.

The project turns one maintained Android wrapper runtime into reusable app profiles. Each profile owns its URL, package ID, versioning, runtime configuration, plugin selection, signing identity and build history.

The interface uses the **Terran terminal design language** from *Starlight Unit: The Game* and its mobile Admin Console. Median is used only as a feature reference for the builder workflow, not as a design source.

Current version: `0.1.0-alpha1`

## Studio quick installer

Like Ember CoreUI, Quantum Builder ships with a single-command SSH installer. It installs/updates the project under `/opt/quantum-builder`, preserves persistent builder state and runs a post-install preflight.

Canonical repository installer:

```bash
curl -fsSL https://raw.githubusercontent.com/Starlight-Unit-Studio/Quantum-Builder/main/setup.sh | sudo bash
```

The installer is designed to work directly through the curl pipe. Docker Compose bootstrap containers run without TTY allocation, while interactive questions still use `/dev/tty`. If a first installation was interrupted after `.env` was created but before an administrator account existed, running the same installer again detects that incomplete bootstrap and resumes administrator creation instead of treating it as a finished update.

On the first interactive installation the installer asks for:

- optional public domain, for example `builder.starlight-unit.de`
- administrator email address
- administrator password

For the Starlight Unit Studios production host the domain can be supplied directly while still using the repository one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/Starlight-Unit-Studio/Quantum-Builder/main/setup.sh | sudo env QB_PUBLIC_DOMAIN='builder.starlight-unit.de' bash
```

For an unattended first installation:

```bash
curl -fsSL https://raw.githubusercontent.com/Starlight-Unit-Studio/Quantum-Builder/main/setup.sh | \
  sudo env \
    QB_PUBLIC_DOMAIN='builder.example.com' \
    QB_ADMIN_EMAIL='admin@example.com' \
    QB_ADMIN_PASSWORD='replace-with-a-long-password' \
    bash
```

By default the web service binds only to `127.0.0.1:8787`. The installer deliberately does **not** replace or rewrite a host Apache/Nginx, KeyHelp-managed virtual host, or TLS configuration.

### Updates

Running the same one-liner again performs an update. The installer preserves:

- `.env` local configuration
- SQLite app/profile database
- per-app persistent Android signing identities
- build history and generated artifacts
- Gradle cache

The per-app signing identity is deliberately persistent. As long as the package ID remains unchanged and each new build uses a higher `versionCode`, later generated APKs can be installed as normal Android updates instead of requiring an uninstall.

## Production hosting and KeyHelp

Quantum Builder carries its own internal Docker web stack. It does **not** need Apache inside the project and it does not install a second public webserver when a hosting panel already owns the server frontend.

Default production topology:

```text
https://builder.starlight-unit.de
        |
        v
KeyHelp-managed host webserver + TLS
        |
        v
http://127.0.0.1:8787
        |
        v
Quantum Docker Nginx
        |
        v
PHP-FPM + SQLite control plane
        |
        v
Android build worker
```

For Starlight Unit Studios, `builder.starlight-unit.de` remains managed by KeyHelp. The Quantum installation stays under `/opt/quantum-builder`; the KeyHelp document root is not used as the application source directory.

The host reverse proxy should forward the managed HTTPS virtual host to `http://127.0.0.1:8787`. TLS certificates remain under KeyHelp control.

Apache-style proxy directives for the KeyHelp-managed virtual host:

```apache
ProxyPreserveHost On
ProxyPass        / http://127.0.0.1:8787/
ProxyPassReverse / http://127.0.0.1:8787/
```

Do not overwrite KeyHelp-generated Apache configuration directly. Add proxy directives only through the KeyHelp-supported virtual-host/domain extension mechanism for the server installation in use.

The installer prints detected host-webserver information after preflight. It is intentionally advisory and does not mutate host configuration. The same diagnostics can be shown later with:

```bash
sudo /opt/quantum-builder/scripts/stack.sh proxy-info
```

## What alpha1 already does

The first alpha establishes the real architecture rather than a static mockup:

- authenticated web panel with CSRF-protected writes
- Terran terminal UI for desktop and mobile browsers
- app profile dashboard
- app editor with sections for Overview, Branding, Interface, Native Navigation, Link Handling, Permissions, Web Overrides, Native Plugins and Build & Deploy
- SQLite persistence for users, app profiles and builds
- queued asynchronous Android build worker
- clean wrapper checkout per build
- package ID, app name, URL, version, SDK floor/target and selected runtime settings compiled into the Android project
- persistent signing key generated once per app profile
- Gradle lint, tests, signed release APK and signed AAB in one build
- Source ZIP and `SHA256SUMS` generated from the same build
- authenticated artifact downloads
- build history
- Android 6/API 23 through Android 16/API 36 profile baseline
- health endpoint and installer preflight

A build is intentionally **one operation**. `REBUILD ALL` produces the complete artifact set, then the UI lets the operator choose which artifact to download.

## Feature status

Not every Median-style configuration control is wired into the Android runtime in alpha1. The profile schema already has explicit sections for the larger system, while advanced native components are added module by module instead of turning the wrapper into a monolith.

Already compiled into alpha1 builds include identity/version fields, start URL, trusted domain, user-agent suffix, keep-screen-on, selected Android permissions and fixed portrait/landscape orientation. Quantum NMP and Quantum Asset Store already exist in the wrapper project, but full builder-driven feature enable/disable compilation is the next integration step.

See [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) for the detailed roadmap and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the component boundaries.

## Runtime architecture

```text
Browser
   |
   v
Quantum Builder Web UI
   |
   +-- Auth / CSRF
   +-- App Profiles
   +-- Build History
   |
   v
SQLite Control Plane
   |
   v
Android Build Worker
   |
   +-- clean Quantum Mobile Wrapper checkout
   +-- profile compiler
   +-- persistent per-app signing identity
   +-- lint + tests
   +-- assembleRelease + bundleRelease
   |
   v
APK + AAB + Source ZIP + SHA256SUMS
```

The web container does **not** receive Android signing passwords through the UI. Signing material stays in the persistent worker data store and is excluded from generated source archives.

## Local stack management

From `/opt/quantum-builder`:

```bash
sudo ./scripts/stack.sh status
sudo ./scripts/stack.sh logs
sudo ./scripts/stack.sh restart
sudo ./scripts/stack.sh rebuild
sudo ./scripts/stack.sh preflight
sudo ./scripts/stack.sh proxy-info
```

## Manual development start

Requirements:

- Docker Engine
- Docker Compose v2

```bash
cp .env.example .env
# Replace QB_SESSION_SECRET with a long random value.
sudo chown 82:82 var
sudo chmod 0770 var
docker compose build
docker compose run --rm -T \
  -e QB_BOOTSTRAP_ADMIN_EMAIL='admin@example.com' \
  -e QB_BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-long-password' \
  php php /app/bin/bootstrap.php
docker compose up -d
```

Open `http://127.0.0.1:8787` locally or use an HTTPS reverse proxy.

## Wrapper source

Default build source:

`Starlight-Unit-Studio/Quantum-Mobile-Wrapper`

Alpha1 defaults to the current Android 6 compatibility branch `compat/android-6-api23`. Each app profile stores its wrapper ref independently so a builder deployment can test a newer wrapper generation without silently changing existing profiles.

## Security baseline

- HTTPS start URLs are required for app profiles.
- The builder defaults to loopback-only exposure.
- Public TLS terminates at the managed host webserver/reverse proxy.
- The installer does not overwrite KeyHelp, Apache/Nginx virtual hosts or TLS files.
- Login sessions use HttpOnly, SameSite=Strict cookies.
- Mutating API calls require a session CSRF token.
- Build downloads require authentication.
- Signing identities never enter the source ZIP.
- An existing signing identity is never silently replaced if only half of its key/password pair remains.
- Build jobs use a fresh wrapper checkout and temporary working directory.
- The installer keeps local state out of Git and out of updates.

## Design source

The visual tokens are derived from the existing game/admin terminal system, including the deep navy surfaces, translucent panels, cyan system lines, amber status accents, red danger actions and technical label hierarchy. The browser UI currently loads the corresponding public font families through Google Fonts rather than copying font binaries into this repository.

## Project scope

Quantum Builder is intended to become the common app-generation control plane for Studio web systems such as:

- Starlight Unit: The Game
- internal Admin Panel
- internal Changelog
- Ember CoreUI
- Webmail
- KeyHelp Panel

Those become app profiles over one maintained runtime instead of six diverging wrapper codebases.
