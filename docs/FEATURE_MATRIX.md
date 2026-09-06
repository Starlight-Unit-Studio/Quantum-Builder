# Quantum Builder Feature Matrix

Legend:

- **Runtime**: stored and compiled into the generated Android app now
- **Profile**: stored in the app profile/UI, native compiler connection is still being added
- **Planned**: intentionally not implemented in alpha1

| Area | Feature | Alpha1 |
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
| Branding | Status/navigation bar colors | Profile |
| Branding | Splash background | Profile |
| Branding | Icon upload / adaptive icon generator | Planned |
| Branding | Splash image upload/editor | Planned |
| Interface | Dark/light/auto mode | Profile |
| Interface | Portrait/landscape | Runtime |
| Interface | Keep screen on | Runtime |
| Interface | Immersive fullscreen switch | Profile |
| Interface | Page transitions | Profile |
| Interface | Pull-to-refresh | Profile |
| Interface | Pinch-to-zoom | Profile |
| Interface | Font scaling | Profile |
| Interface | Viewport width/scale | Planned |
| Interface | Maximum windows | Planned |
| Interface | Localization selection | Planned |
| Interface | Custom offline page | Planned |
| Navigation | Top bar enable | Profile |
| Navigation | Sidebar enable | Profile |
| Navigation | Bottom tabs enable | Profile |
| Navigation | Contextual toolbar enable | Profile |
| Navigation | Visual menu editors | Planned |
| Navigation | Page visibility rules | Planned |
| Links | New-window behavior | Profile |
| Links | Deep-link scheme | Profile |
| Links | Ordered URL rule engine | Planned |
| Links | Universal/App Links | Planned |
| Links | Context menu | Planned |
| Permissions | Location permission | Runtime |
| Permissions | Microphone permission | Runtime |
| Permissions | Camera permission | Runtime |
| Permissions | Public downloads mode | Profile |
| Permissions | Background audio flag | Profile |
| Web Overrides | Trusted domain | Runtime |
| Web Overrides | User-Agent suffix | Runtime |
| Web Overrides | Custom headers | Profile |
| Web Overrides | Custom CSS | Profile |
| Web Overrides | Custom JavaScript | Profile |
| Web Overrides | Cookie persistence mode | Profile |
| Plugins | Quantum NMP selection | Profile; module already exists in wrapper |
| Plugins | Quantum Asset Store selection | Profile; module already exists in wrapper |
| Plugins | Share | Profile |
| Plugins | Haptics | Profile |
| Plugins | Biometrics | Profile |
| Plugins | QR/Barcode | Profile |
| Plugins | Firebase Cloud Messaging | Profile |
| Plugins | Full plugin library | Planned |
| Management | Members/access roles | Planned |
| Management | Test devices/testers | Planned |
| Deployment | Google Play upload | Planned |
| Deployment | Previous signed releases | Runtime build history |
| Platforms | Android | Active |
| Platforms | iOS | Planned, separate native build engine |

## Development rule

A field shown as **Profile** is not advertised as an active native capability until the corresponding wrapper/compiler integration exists and passes a real-device or emulator test. This prevents the web panel from becoming a decorative configuration UI whose switches do nothing.

## Reference scope

Median's control panel is used as a feature inventory and workflow reference. Quantum Builder uses its own data model, implementation, plugin architecture and Terran terminal interface.
