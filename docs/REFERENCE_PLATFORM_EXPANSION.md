# Quantum Builder: Additional Platform References

Updated: **2026-10-20**. Scope added by the user: **MobiLoud, Twinr and CatDoes**,
alongside the existing Median reference. This is Quantum Builder work.

The [delivery roadmap](MEDIAN_PARITY_ROADMAP.md) remains the implementation order.
The [functional matrix](FUNCTIONAL_PARITY.md) records implementation status.
The existing Median inventory of 63 named integrations remains a Median-specific
inventory; it is not a count of the combined scope or completed features.

## How the references extend the product

| Reference | Main comparison scope | Quantum direction |
|---|---|---|
| Median | Native wrapper controls, bridge, plugins, management and distribution | Complete the existing wrapper and plugin roadmap |
| MobiLoud | Website and commerce continuity, customer identity, adoption and managed launch workflows | Preserve complete website journeys and add their native and operational support |
| Twinr | Configurable wrapper, native screen composition, data binding, engagement and analytics | Add visual native pages and an integrated campaign/data workflow |
| CatDoes | AI-assisted creation of mobile apps and websites, backend, source editing and delivery | Add an explicit generated-application project mode alongside the wrapper engine |

The rows below record **additional acceptance scope, currently `PLANNED`**.
An overlap with an existing feature does not reset that feature's status or make
the larger requirement complete. The existing alpha12 navigation editor remains
`BUILDER`; its implementation does not establish native-page or AI-generation support.
Reference capabilities and proposed Quantum behavior occupy separate columns.

Quantum keeps its own implementation and product identity. Provider-specific
accounts, SDKs and hardware are dependencies; vendor pricing tiers are not Quantum
feature gates. The brighter redesign still follows the functional phase. Splash
and the accepted attribution behavior remain complete; first-run onboarding is a
separate application workflow.

The AI access decision is **API-only**: configure endpoint, key and model. Quantum
does not add local model installation or synchronization. Provider-neutral wording
and the inspected CoreUI reuse points are in
[AI_API_INTEGRATION.md](AI_API_INTEGRATION.md).

## MobiLoud inventory

| ID | Public reference evidence | Additional Quantum acceptance target | Phase |
|---|---|---|---|
| ML-01 | Website-backed apps retain web content, checkout and integrations [M1] | Compatibility fixtures for account, cart, checkout, subscriptions, loyalty, uploads and external return URLs; distinguish web reuse from native adapters | 3, 4 |
| ML-02 | Configurable tabs/icons/settings and background refresh of inactive tabs [M2] | Per-tab lifecycle, retained state and targeted invalidation without moving the active page | 1, 2 |
| ML-03 | Persistent first-launch HTML welcome screen with native prompt actions [M3] | An onboarding editor, completion state, reset behavior and platform-specific permission timing | 3 |
| ML-04 | App-specific elements/pages, CSS injection and URL matching [M4] | App-context helpers, page/platform override rules and mobile preview of app-only content | 3 |
| ML-05 | Cookie-based login detection and native login/logout functions [M5] | Separate login-gate presentation from server authentication; verify session restoration, expiry, logout and provider return handling | 2, 4 |
| ML-06 | OneSignal external identity/tags and Klaviyo profile functions [M6] | Associate and clear provider identities, merge profiles deliberately, update attributes and test notification routing across account changes | 4 |
| ML-07 | Shopify app-exclusive offers/products, loyalty and customer identity; BigCommerce identification [M7] | Named commerce adapters with app-only eligibility, customer mapping, cart synchronization and provider-specific setup | 4 |
| ML-08 | Firebase/GA/GTM and attribution query injection [M8] | App/web event distinction, campaign attribution, query preservation and route exclusions | 4, 5 |
| ML-09 | QR install widget, banners, popups and device-aware download redirects [M9] | Generate website companion widgets, install links and QR assets with previews and configurable display rules | 5 |
| ML-10 | Native functions include haptics, settings and prompt actions [M10] | Typed bridge actions with supported-platform discovery and useful failure results | 2, 4 |
| ML-11 | Team-managed preview, testing, store submission and maintenance [M11] | Release tasks, screenshots/metadata, tester evidence, store feedback and OS/SDK maintenance records | 5, 6 |
| ML-12 | Customer developer accounts and migration from an existing app listing [M11] | Preserve package/bundle identity and signing continuity during supported migrations; record ownership and export requirements explicitly | 5, 6 |

MobiLoud's broad website-compatibility promises require actual compatibility tests
in Quantum. Its cookie-detection article explicitly treats detection as a UI signal,
not credential validation. Managed launch and maintenance are service processes,
so their Quantum counterparts need workflow evidence rather than a native toggle.
Source-code portability is a Quantum requirement; publishing under the customer's
store account alone does not establish it.

### MobiLoud sources

- [M1] [Website feature continuity](https://www.mobiloud.com/features/retain-website-features/),
  [platform and stack coverage](https://www.mobiloud.com/use-cases/).
- [M2] [Tab configuration](https://www.mobiloud.com/docs/menu/),
  [background tab refresh](https://www.mobiloud.com/docs/tab-refresh-in-background/).
- [M3] [Welcome screen](https://www.mobiloud.com/docs/welcome-screen/).
- [M4] [CSS injection tool](https://www.mobiloud.com/docs/css-injection-tool/),
  [customization and website integration index](https://www.mobiloud.com/docs/).
- [M5] [Cookie-based login](https://www.mobiloud.com/docs/cookie-based-login/),
  [login and native-function index](https://www.mobiloud.com/docs/).
- [M6] [Klaviyo native functions](https://www.mobiloud.com/docs/klaviyo-native-functions/),
  [OneSignal and Klaviyo documentation](https://www.mobiloud.com/docs/).
- [M7] [App-exclusive discounts](https://www.mobiloud.com/docs/app-exclusive-discounts/),
  [Shopify and BigCommerce documentation](https://www.mobiloud.com/docs/).
- [M8] [UTM injection](https://www.mobiloud.com/docs/utm-injection-for-google-analytics/),
  [analytics documentation](https://www.mobiloud.com/docs/).
- [M9] [QR widget](https://www.mobiloud.com/docs/qr-widget/),
  [widget catalogue](https://www.mobiloud.com/docs/).
- [M10] [Haptic feedback](https://www.mobiloud.com/docs/haptic-feedback/),
  [native-function documentation](https://www.mobiloud.com/docs/).
- [M11] [Delivery workflow](https://www.mobiloud.com/how-it-works/),
  [FAQ](https://www.mobiloud.com/faqs/), [publishing documentation](https://www.mobiloud.com/docs/).

## Twinr inventory

| ID | Public reference evidence | Additional Quantum acceptance target | Phase |
|---|---|---|---|
| TW-01 | Visual native screens and reusable display components [T1] | Versioned native-screen schema/editor: text, buttons, images, spacers, dividers, banners, lists, products, settings, video, countdown and search | 3 |
| TW-02 | REST definitions, request testing, response preview and field mapping [T2] | Reusable data sources with loading, empty, error and retry states; authenticated requests and protected server credentials | 2, 3 |
| TW-03 | Component targeting by OS, device class and user state [T3] | Explicit display rules with a preview for guest/member, phone/tablet and each supported platform | 1, 3 |
| TW-04 | Navigation icons, per-tab rules and native actions including element selectors [T4] | Rule precedence, typed actions and page-element targeting; handle missing elements without leaving controls inert | 1, 2 |
| TW-05 | Tab reload settings and element-driven page refresh [T5] | Cross-screen invalidation for cart/wishlist and other state changes, including background and restored tabs | 1, 2 |
| TW-06 | Onboarding, offline display, CSS/JS, login and cache settings [T6] | Complete web-context configuration; keep offline fallback, cached pages and synchronized offline data as distinct behaviors | 3 |
| TW-07 | Language/activity/page-visit segments with ALL/ANY rules [T7] | Versioned audience definitions and deterministic segment evaluation shared by campaigns and analytics | 4 |
| TW-08 | Scheduled/event-based push and user-specific delivery [T8] | Campaign lifecycle, recipient targeting, provider token mapping, event ingestion, scheduling and delivery diagnostics | 4 |
| TW-09 | In-app popup/banner/sheet/fullscreen messages with visual/HTML editing [T9] | A separate in-app message service with schedule, audience, preview, dismissal and measurable interactions | 4 |
| TW-10 | Native notification history and unread indicators [T10] | Persistent inbox/read state and safe deep-link routing with native-device acceptance | 4 |
| TW-11 | Acquisition, retention, revenue and campaign analytics [T11] | Event schemas, attribution, aggregate views and meaningful empty/error states | 4, 5 |
| TW-12 | Firebase, AdMob, Google Sign-In, Shopify, WooCommerce and Sharetribe integrations [T12] | Track each adapter independently; include marketplace inbox events and verified login identity | 4 |
| TW-13 | Website install widgets, Magic Link and QR delivery [T13] | Share one adoption toolkit with ML-09; support same-phone links and desktop fallback | 5 |
| TW-14 | Organization/app configuration management, templates, version copying and preview [T14] | Reusable configuration presets, explicit versions, scoped roles and a native preview distribution workflow | 5 |
| TW-15 | Android artifacts, iOS/TestFlight and configuration updates without some rebuilds [T15] | Separate web changes, remote configuration, assets and native binary releases; define compatibility, rollout, rollback and rebuild requirements | 5, 6 |
| TW-16 | Bridge storage/share/device operations, scanning, review and forced updates [T16] | Extend the shared plugin contract and add deliberate update prompts, account-deletion actions and local-storage APIs | 2, 4 |
| TW-17 | Store listing and screenshot assistance [T17] | Editable localized descriptions and screenshot composition using actual application views | 5 |

Keep named web technology compatibility separate from native adapters. Twinr's
plugin overview mentions PrestaShop without the same setup detail found for the
listed commerce adapters; retain it as a verification item. Its notification inbox
requires a built Android app or TestFlight for acceptance, not only its preview app.
Some source pages disagree about campaign precedence and cache details; Quantum
must define and test one consistent contract. This inventory does not infer source
export from APK/AAB/IPA downloads.

### Twinr sources

- [T1] [Native-screen overview](https://twinr.dev/features/native-screen/),
  [component index](https://help.twinr.dev/native-screen).
- [T2] [REST overview](https://help.twinr.dev/rest-api-integration/overview),
  [configuration](https://help.twinr.dev/rest-api-integration/rest-api-configuration),
  [response mapping](https://help.twinr.dev/rest-api-integration/using-rest-api-in-native-screens).
- [T3] [Component targeting and layout](https://help.twinr.dev/native-screen/banner-element/banner-element-with-background-image).
- [T4] [Build catalogue](https://twinr.dev/features/build/),
  [tab configuration](https://help.twinr.dev/screen-customization/tab-bar),
  [per-tab URL rules](https://help.twinr.dev/screen-customization/tab-bar/tab-screen-external-url-handling).
- [T5] [Page refresh](https://help.twinr.dev/screen-customization/page-refresh).
- [T6] [Configuration index](https://help.twinr.dev/),
  [cache policy](https://help.twinr.dev/extensions/cache-policy),
  [login configuration](https://help.twinr.dev/screen-customization/login/login-page).
- [T7] [Segments](https://help.twinr.dev/segmentation/create-segment).
- [T8] [Engagement catalogue](https://twinr.dev/features/engage/),
  [personalized push](https://help.twinr.dev/integrations/personalized-push-notification).
- [T9] [In-app messages](https://help.twinr.dev/engage/in-app-message).
- [T10] [Native notification screen](https://help.twinr.dev/integrations/native-notification-screen).
- [T11] [Analytics](https://help.twinr.dev/app-analytics/overview),
  [acquisition, revenue and campaign feature scope](https://twinr.dev/features/).
- [T12] [Plugin overview](https://help.twinr.dev/plugins/overview),
  [native integrations](https://help.twinr.dev/integrations/overview),
  [Sharetribe](https://help.twinr.dev/plugins/sharetribe),
  [Google Sign-In](https://help.twinr.dev/extensions/google-sign-in).
- [T13] [App marketing widgets](https://help.twinr.dev/app-marketing-widget/overview).
- [T14] [Organizations](https://help.twinr.dev/organization/create-organization),
  [configuration versions](https://help.twinr.dev/app-configuration/add-new-configuration).
- [T15] [Android downloads](https://help.twinr.dev/publish-apps/publishing-to-the-google-play-store/get-android-build-file),
  [build FAQ](https://help.twinr.dev/faqs/build-apk-and-ipa),
  [publishing FAQ](https://help.twinr.dev/faqs/publishing-app).
- [T16] [Bridge and extension index](https://help.twinr.dev/),
  [native datastore](https://help.twinr.dev/js-bridge/native-datastore),
  [scanner](https://help.twinr.dev/extensions/barcode-qr-scanner),
  [review prompts](https://help.twinr.dev/extensions/app-review).
- [T17] [Store listing and screenshot tools](https://aso.twinr.dev/).

## CatDoes inventory

CatDoes documents native application generation using React Native Expo and web
generation using React/Vite/Tailwind. These are reference outputs, not a decision
to replace Quantum's Android wrapper or adopt a specific generator framework.
Website-to-app generation is a source/design snapshot workflow; it does not imply
continuous synchronization with the original website. [C1, C2]

| ID | Public reference evidence | Additional Quantum acceptance target | Phase |
|---|---|---|---|
| CD-01 | Conversational planning and a cloud Compose agent with subagents [C3] | API-backed generation jobs with a reviewable specification, visible work progress, cancellation, recovery and reconnectable sessions | 7 |
| CD-02 | URL-based website analysis and GitHub project import [C2, C4] | Select URL or repository input, review extracted screens/assets, preserve source provenance and expose inaccessible content | 7 |
| CD-03 | Mobile, web and multiple applications in one project [C1] | Separate wrapper/generated project types and per-target build/preview adapters; keep one project capable of multiple application folders | 7 |
| CD-04 | File browsing/editing, file references and screenshot feedback [C5] | Phone-usable source editing, targeted file context and image annotations tied to a revision | 7 |
| CD-05 | Browser/device previews, size presets and same-phone Expo Go opening [C6] | Preview adapters, direct device links, QR sharing, reconnect, logs and clearly scoped native support | 5, 7 |
| CD-06 | Automatic project checkpoints and restoration [C7] | Restore source/configuration with a visible recovery point; specify database and release restoration independently | 7 |
| CD-07 | GitHub history, push/pull, branch selection, conflicts and synchronization state [C4] | Repository round trips with reviewable diffs, safe conflict recovery and explicit selected branch | 7 |
| CD-08 | Managed app backend and existing Supabase/Firebase support [C8] | Optional app database/auth/storage/functions/realtime services plus external-backend adapters, separate from Builder's own management data | 7 |
| CD-09 | Build profiles, platform-specific delivery, credential input, missing-key checks and an optional store-readiness report [C9] | Validate required configuration and produce actionable release findings; share signing/artifact infrastructure where compatible | 5, 6, 7 |
| CD-10 | Web deployments, custom domains and explicit redeployment [C9, C10] | Versioned generated-web releases, verified domains, usable artifact URLs and separate preview/production state | 7 |
| CD-11 | Error capture/grouping, stack traces, environment filters and guided debugging [C11] | Application diagnostics feeding reproducible repair jobs, redacted evidence and reviewable changes | 7 |
| CD-12 | Standard source export and code ownership [C1] | Complete generated-project export with lockfiles, migrations, assets, build instructions and an independently reproducible build | 7 |

The current backend reference is CatDoes Cloud; Supabase is an optional external
backend. Importing code and connecting ongoing GitHub synchronization are separate
operations in its documentation. Android deployment docs describe building and
downloading before publishing, while iOS includes agent-assisted submission; broad
product copy is not proof of automatic Google Play upload. CatDoes-specific OTA
channels and public source for the complete platform were not established by the
reviewed documentation. Generated source ownership is documented separately.
A new generation engine also needs its own platform/API compatibility matrix;
the wrapper's supported Android versions do not automatically transfer to it.

### CatDoes sources

- [C1] [Tech stack, multiple apps and export](https://docs.catdoes.com/features/tech-stack).
- [C2] [Website conversion](https://docs.catdoes.com/features/lovable),
  [existing application conversion](https://docs.catdoes.com/features/base44).
- [C3] [Build product and Compose agent](https://catdoes.com/build),
  [conversational plan mode](https://docs.catdoes.com/features/plan-mode).
- [C4] [GitHub import](https://docs.catdoes.com/features/import-from-github),
  [GitHub synchronization](https://docs.catdoes.com/features/github-integration).
- [C5] [Files](https://docs.catdoes.com/features/files),
  [mobile editing and screenshot feedback changelog](https://catdoes.com/changelog).
- [C6] [Live preview](https://docs.catdoes.com/features/live-preview).
- [C7] [Checkpoints](https://docs.catdoes.com/features/checkpoints).
- [C8] [CatDoes Cloud](https://docs.catdoes.com/catdoes-cloud),
  [backend services](https://catdoes.com/build).
- [C9] [Deployment](https://docs.catdoes.com/features/deployment).
- [C10] [Custom domains](https://docs.catdoes.com/features/custom-domain).
- [C11] [Watch](https://docs.catdoes.com/features/watch),
  [Debug Mode](https://docs.catdoes.com/features/debug-mode).

## Shared implementation contracts

These are Quantum design requirements derived from the comparison, not claims
about the vendors' internal implementation.

1. **One capability registry.** Merge overlapping requirements from all four
   references into the same module; retain reference IDs and platform status.
2. **Screen and data contracts.** Model web/native screens, navigation state,
   component trees, data bindings and action results explicitly. A browser-rendered
   component cannot establish that its Android/iOS renderer works.
3. **Identity and engagement.** Connect accounts, devices, permission choices,
   provider tokens, events, segments and campaigns without conflating web login
   detection with authenticated user identity.
4. **Defined update classes.** Distinguish live website changes, downloaded assets,
   remote configuration, generated source changes and store binaries. Each class
   needs version compatibility, failure behavior and an appropriate rollback path.
5. **Independent generated projects.** Keep source, dependencies, migrations and
   output provenance. Checkpoint restore, data restore and release rollback are
   distinct operations. A generated-project export must remain buildable separately.
6. **Complete mobile workflow.** Accept the features from a phone: configuration,
   page composition, source feedback, direct device preview, builds and downloads.
   A QR code alone is insufficient when the same phone is the only device.
7. **API-only model access.** Use the configured external connection for inference.
   Keep project execution, builds and application backends separate from model
   hosting. A local inference installation or model-sync script is outside scope.

## Next implementation and review

Continue the current navigation block with icons, menu groups, independent menu
sets, visibility rules and typed actions. Extend its design now to accommodate
tab invalidation and web/native page destinations, while implementing native
composition, engagement and application generation in their recorded phases.

For each delivered item, record supported platforms, configuration, actual runtime
behavior, failure cases and acceptance evidence in the functional matrix. This
documentation update adds scope; it does not promote new features to `BUILDER` or
`RUNTIME`, change the application version, or require an Android build.

Review entry points for future additions: [MobiLoud documentation](https://www.mobiloud.com/docs/),
[Twinr documentation](https://help.twinr.dev/),
[CatDoes documentation index](https://docs.catdoes.com/llms.txt).
