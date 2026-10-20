# Quantum Builder Feature Matrix

Current Builder: **0.1.0-alpha12**. The full dated scope and delivery sequence are
in [MEDIAN_PARITY_ROADMAP.md](MEDIAN_PARITY_ROADMAP.md); the brighter design is in
[QUANTUM_ENTERPRISE_DESIGN.md](QUANTUM_ENTERPRISE_DESIGN.md).
MobiLoud, Twinr and CatDoes extend the reference scope in
[REFERENCE_PLATFORM_EXPANSION.md](REFERENCE_PLATFORM_EXPANSION.md).

Legend:

- **Runtime**: stored and compiled into the generated Android app now
- **Profile**: stored in the app profile/UI, native compiler connection is still being added
- **Planned**: not implemented in the current version
- **Builder**: implemented in the web editor/preview; native behavior retains its
  separately stated runtime scope

| Area | Feature | Current status |
|---|---|---|
| Overview | App name | Runtime |
| Overview | HTTPS start URL | Runtime |
| Overview | Description | Profile |
| Identity | Android package ID | Runtime |
| Identity | Version name | Runtime |
| Identity | Version code | Runtime |
| Android | Minimum SDK 23-36 | Runtime |
| Android | Target SDK up to 36 | Runtime |
| Android | Persistent per-app signing identity | Runtime |
| Build | One build -> APK + AAB + Source + SHA256 | Runtime |
| Build | Build history | Runtime |
| Build | Authenticated downloads | Runtime |
| Branding | Primary/accent colors | Profile |
| Branding | Status/navigation bar colors | Runtime |
| Branding | Splash background | Runtime |
| Branding | Per-app launcher icon upload | Runtime |
| Branding | Custom splash image upload | Runtime |
| Branding | Post-custom-splash STU attribution banner | Runtime |
| Branding | Splash crop/editor | Planned |
| Interface | Dark/light/auto mode | Runtime |
| Interface | Portrait/landscape | Runtime |
| Interface | Keep screen on | Runtime |
| Interface | Immersive fullscreen switch | Runtime |
| Interface | Page transitions | Runtime |
| Interface | Pull-to-refresh | Runtime |
| Interface | Pinch-to-zoom | Runtime |
| Interface | Font scaling | Runtime |
| Interface | Native loading indicator styles / color / size | Runtime |
| Interface | Viewport width/scale | Planned |
| Interface | Maximum windows | Planned |
| Interface | Localization selection | Planned |
| Interface | Custom offline page | Planned |
| Navigation | Top bar enable | Runtime |
| Navigation | Sidebar enable | Runtime |
| Navigation | Bottom tabs enable | Runtime |
| Navigation | Contextual toolbar enable | Runtime |
| Navigation | Shared ordered menu JSON | Runtime |
| Navigation | Visual shared-menu editor, touch/keyboard ordering and drag/drop | Builder |
| Navigation | Advanced shared-menu JSON editing with draft validation | Builder |
| Simulator | Top bar, sidebar, bottom tabs and contextual toolbar preview | Builder |
| Simulator | Preview-owned navigation history and current-route reload | Builder |
| Navigation | Page visibility rules | Planned |
| Navigation | Retained tab state and background invalidation/refresh | Planned |
| Native Screens | Visual component editor and native renderers | Planned |
| Native Screens | REST data sources and response-to-component mapping | Planned |
| Onboarding | First-run content, completion and permission timing | Planned |
| Links | New-window behavior | Runtime |
| Links | Deep-link scheme | Runtime |
| Links | Ordered URL rule engine | Runtime |
| Links | Universal/App Links | Planned |
| Links | Context menu | Planned |
| Permissions | Location permission | Runtime |
| Permissions | Microphone permission | Runtime |
| Permissions | Camera permission | Runtime |
| Permissions | Public downloads mode | Runtime |
| Permissions | Background audio flag | Profile |
| Web Overrides | Trusted domain | Runtime |
| Web Overrides | User-Agent suffix | Runtime |
| Web Overrides | Custom headers | Runtime for wrapper/native HTTP paths |
| Web Overrides | Custom CSS | Runtime |
| Web Overrides | Custom JavaScript | Runtime |
| Web Overrides | Cookie persistence mode | Runtime |
| Plugins | Quantum NMP selection | Profile; module already exists in wrapper |
| Plugins | Quantum Asset Store selection | Runtime |
| Plugins | Native Asset Downloader manifest startup sync | Runtime |
| Plugins | Share | Profile |
| Plugins | Haptics | Profile |
| Plugins | Biometrics | Profile |
| Plugins | QR/Barcode | Profile |
| Plugins | Firebase Cloud Messaging | Profile |
| Plugins | Full plugin library | Planned |
| Engagement | Provider identity lifecycle and audience segments | Planned |
| Engagement | Scheduled/event push and in-app message campaigns | Planned |
| Engagement | Native notification inbox and read state | Planned |
| Commerce | App-only offers, loyalty, cart and marketplace adapters | Planned |
| Analytics | Acquisition, retention, revenue and campaign reporting | Planned |
| Management | Members/access roles | Planned |
| Management | Test devices/testers | Planned |
| Deployment | Google Play upload | Planned |
| Deployment | Previous signed releases | Runtime build history |
| Deployment | Native device-preview links and install/promotional widgets | Planned |
| Deployment | Remote configuration rollout and rollback | Planned |
| Generation | AI-assisted web/mobile application projects | Planned |
| Generation | Mobile source editor, GitHub round trips and checkpoints | Planned |
| Generation | Application backend adapters and error-repair workflow | Planned |
| Generation | Independent source export and generated-web deployment | Planned |
| Platforms | Android | Active |
| Platforms | iOS | Planned, separate native build engine |

## Development rule

A field shown as **Profile** is not advertised as an active native capability until the corresponding wrapper/compiler integration exists and passes a real-device or emulator test. This prevents the web panel from becoming a decorative configuration UI whose switches do nothing.

## Reference scope

Median, MobiLoud and Twinr inform wrapper, native-screen, engagement and operational
capabilities. CatDoes adds a distinct generated-application workflow. Shared
features use one Quantum implementation and retain explicit platform status.
The current Terran interface precedes the planned brighter Quantum Enterprise design.
