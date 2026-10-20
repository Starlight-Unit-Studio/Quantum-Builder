# Quantum Builder: AI API Connection

Decision date: **2026-10-20**. Status: **APPROVED_DIRECTION / IMPLEMENTATION_PLANNED**.

## Product decision

Quantum Builder connects its planned AI features to a compatible external API.
The user supplies an API address, an API key and a model identifier. Quantum does
not install or run inference services, download model weights, manage GPUs, or
maintain a background cloud-model synchronization script.

The public description stays provider-neutral. It contains no recommendation of
a particular AI service, free-tier claim, quota promise or provider registration
instructions. This incorporates the user's final clarification on 2026-10-20.

This decision constrains the generated-application phase in
[MEDIAN_PARITY_ROADMAP.md](MEDIAN_PARITY_ROADMAP.md). App-generation jobs, source
editing and build workers remain planned Quantum capabilities; model inference is
performed by the selected API. Running an application build is separate from
hosting its AI model.

## Small connection surface

| Setting | Intended behavior |
|---|---|
| API address | Explicit HTTPS base URL of the compatible provider |
| API key | Enter or replace the server-side credential; the UI shows whether a key is configured |
| Model | Enter the provider's model identifier directly |

Use an OpenAI-compatible Chat Completions adapter as the initial protocol. The
settings must describe the supported protocol accurately; accepting a URL does
not imply compatibility with every provider API.

Provide a deliberate **Test connection** action with a small inference request.
Saving settings alone must not start a generation job. A connection is usable only
after the selected endpoint, credential and model actually work together.

Manual model entry is sufficient for the initial connection. A provider model
list may be added later as an optional user-triggered API request where supported.
It must not require a local model catalogue or prevent saving an otherwise valid
manual model ID. No periodic model synchronization is part of this decision.

## Backend contract

- Make provider requests from the Builder backend or its job worker. Keep API keys
  out of browser responses, logs, generated app profiles, APK/AAB files and source
  exports. Adapt secret storage to Quantum's own server configuration.
- Normalize transport, authentication, unavailable-model, quota/rate-limit, timeout
  and provider errors into actionable connection/job results.
- Preserve the selected provider/model on failure. Report the error instead of
  falling back to a local model or another provider.
- Implement request and response mapping for the selected protocol, including
  proper stream framing when streaming is introduced. Do not interpret one
  provider's response format as another protocol.
- Keep generated-project files and job progress independent of the provider
  connection. Capability-dependent operations must use what the selected API and
  model actually support.
- Scope any retries and cancellation so a failed job does not create an unbounded
  sequence of external requests. Allow the user to correct settings and retry.

## Reusing CoreUI code

Inspected source: [`Starlight-Unit-Studio/coreui` at
`62f8b38f2ea6fcdf484845e2ff9a405f8648341a`](https://github.com/Starlight-Unit-Studio/coreui/tree/62f8b38f2ea6fcdf484845e2ff9a405f8648341a).

| Existing source | Reusable part | Adaptation required |
|---|---|---|
| [api/ai_settings.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/ai_settings.php) | Normalized provider settings and connection metadata | The external adapter is reserved; implement the actual Quantum dispatch path |
| [api/admin.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/admin.php) and [api/user_settings.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/user_settings.php) | Authorized settings writes, validation and structured errors | Use Quantum authentication/storage and allow manual remote model identifiers |
| [api/config.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/config.php) | Server-side external API key configuration | Keep the secret server-side in Quantum's configuration system |
| [api/model_catalog.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/model_catalog.php) and [js/settings.js](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/js/settings.js) | Optional list normalization and selected-model preservation | Replace service-specific catalogue coupling; list discovery remains optional |
| [api/chat.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/chat.php) and [api/console_stream.php](https://github.com/Starlight-Unit-Studio/coreui/blob/62f8b38f2ea6fcdf484845e2ff9a405f8648341a/api/console_stream.php) | HTTP error handling and incremental buffering patterns | Add remote authentication and the chosen protocol; remove Ember-specific coupling |

At that commit, `coreui_ai_external_capability()` returns `configured: false` and
`status: adapter_reserved`; normalization can force an external selection back to
local mode. The catalogue derives `/api/tags` from the operator-configured chat URL,
which defaults to a local service. Those behaviors must not become Quantum's
external connection contract.

The reusable code is groundwork, not a completed generic remote adapter. Extract
small appropriate parts and retain their provenance. Do not transplant the CoreUI
installer, local model lifecycle, host tuning, memory system or entire chat/stream
endpoints. This review changes no CoreUI files.

## Implementation acceptance

The connection remains `PLANNED` until these behaviors are implemented and checked:

1. An operator can save endpoint/key/model and execute a real connection check.
2. An environment with no local inference service can complete a supported request.
3. Manual model IDs work without local or remote catalogue availability.
4. Invalid credentials, missing models, exhausted quota and interrupted requests
   produce useful errors without silent provider changes.
5. The API key is not exposed through frontend reads or generated artifacts.
6. The selected adapter's response/stream behavior is covered by focused fixtures,
   followed by an explicitly initiated provider check when credentials are available.

No provider credentials were used and no live inference call was made during this
design/code review. The existing alpha12 application code is unchanged by this
documentation update.

## Provider-neutral description

The following wording describes the planned connection and may be used as current
product copy when the feature is implemented:

> Quantum Builder verbindet seine KI-Funktionen mit einer kompatiblen API deiner
> Wahl. Hinterlege dafür die API-Adresse, deinen API-Schlüssel und das gewünschte
> Modell. Die Modellausführung übernimmt der angebundene Dienst.
