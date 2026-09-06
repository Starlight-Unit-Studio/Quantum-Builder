# Quantum Builder Architecture

## Responsibility boundaries

Quantum Builder is intentionally split into modules so the web panel does not become a second Android runtime and the Android runtime does not become a server control plane.

### Web control plane

Responsibilities:

- administrator authentication
- app-profile CRUD
- validation of human configuration
- queueing builds
- build status/history
- authenticated artifact delivery

The web control plane does not run Gradle and does not expose signing credentials to the browser.

### Persistent data store

Alpha1 uses SQLite because Quantum Builder is a single-host Studio tool and the data model is small. SQLite runs in WAL mode with foreign keys enabled.

Tables:

- `users`
- `apps`
- `builds`

Persistent binary state is stored below `var/`:

```text
var/
├── quantum-builder.sqlite
├── builds/<build-id>/
├── signing/<app-uuid>/
├── work/
└── gradle-cache/
```

`signing/` is worker-owned. App signing keys are not available as browser downloads and are excluded from Source ZIPs.

### Android build worker

The worker owns all native build work:

1. atomically claims one queued job
2. checks out the configured Quantum Mobile Wrapper ref into a fresh work directory
3. validates/compiles the app profile into that checkout
4. resolves or creates the app's persistent signing identity
5. runs Gradle lint and tests
6. produces signed APK and AAB
7. produces a source archive without signing material
8. creates SHA256 checksums
9. publishes build metadata and marks the job complete

One app may have only one queued/building job at a time in alpha1.

### Quantum Mobile Wrapper

The wrapper remains a separate repository and separate responsibility. Builder changes should not duplicate WebView runtime logic.

Current builder compiler edits the wrapper's existing configuration surfaces. Over time those hard-coded configuration points should migrate into a stable generated profile contract so the builder can configure modules without brittle source rewriting.

The long-term runtime boundary is:

```text
Quantum Wrapper Core
├── WebRuntime
├── NavigationRuntime
├── PermissionRuntime
├── LinkRuntime
├── WebOverrideRuntime
├── PluginRuntime
├── QuantumNMP
└── QuantumAssetStore
       ^
       |
 generated Quantum App Profile
```

## Build reproducibility

A Quantum build has one build ID and produces all downloadable artifacts from the same generated source tree and signing identity:

```text
Build #N
├── app-release.apk
├── app-release.aab
├── source.zip
├── SHA256SUMS
├── build.json
└── build.log
```

The UI does not run separate APK and AAB build configurations.

## Update identity

Android update continuity requires:

- unchanged application/package ID
- unchanged signing identity
- increasing `versionCode`

Quantum Builder therefore creates one signing identity per app UUID and reuses it for every later build of that app. Changing the package ID creates a different Android application identity even if the signing key is unchanged.

## Installer model

The Studio installer uses `/opt/quantum-builder` as the code location and preserves:

- `.env`
- `var/`

Updates replace version-controlled code but leave persistent data untouched. A preflight checks Compose validity, running services, HTTP health, Android SDK 36 and runtime version consistency.

## Network model

Default bind:

`127.0.0.1:8787`

Production deployments should put an HTTPS reverse proxy in front of the loopback listener. The builder itself should not be exposed directly on an unencrypted public port.

Generated mobile apps still require HTTPS start URLs.
