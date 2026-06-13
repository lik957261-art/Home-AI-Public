# Host Voice Input Capability

Status: MVP and Phase 2 host foundation implemented in Home AI. The current
implementation includes host send-button long press, ASR provider routing,
privacy-bounded correction learning, native Home AI draft insertion, and the
embedded-plugin `voice_input.*` bridge. Plugin-side adoption remains opt-in and
must not alter standalone plugin behavior.

## Summary

Home AI voice input is a host-level global composer capability. It covers
ordinary Home AI chat, plugin-bound topic chat, Home AI native form composers,
and embedded plugin composers that opt in through the plugin bridge. It is not
a normal plugin iframe and not a system input method. The Home AI host owns
microphone permission, the recording gesture, transcription/editing UI, ASR
dispatch, correction learning, privacy policy, and text insertion orchestration.

Native Home AI composers receive confirmed text through host draft APIs or a
host composer registry that maps a submit/action button to its writable draft
textarea. Embedded plugin iframes receive confirmed text through a bounded
bridge. In both cases the destination surface only declares whether the active
composer is writable and which draft actions are supported.

The host-native implementation covers the ordinary Home AI chat composer,
Kanban/todo creation, Automation create/edit prompts, todo comment/revision
panels, and Growth teaching quick-check submission. Codex Mobile remains the
first external plugin bridge target because it already has durable draft state
and an explicit send flow. ChatGPT Pro, Note, Email, Growth, and other embedded
plugins can adopt the same injection protocol after their composer surfaces
expose capability state and submit/result events.

Codex Mobile standalone must remain out of scope. The Home AI host may expose
`voice_input.*` bridge messages to an embedded Codex Mobile iframe, but it must
not change the standalone Codex Mobile app's composer behavior, launch path,
offline behavior, or default send-button gesture. Any future Codex-side code
must be gated behind Home AI embedded-plugin context detection and the explicit
bridge capability handshake.

## Product Boundary

Voice input belongs to the Home AI host layer for these reasons:

- Recording permission must be requested by the top-level Home AI origin so
  iOS/PWA permission prompts, focus, and keyboard state are not duplicated
  inside each plugin iframe.
- ASR inference is a shared local-runtime concern. Each plugin should not carry
  a separate Whisper/FunASR process, upload route, retry policy, privacy policy,
  or correction store.
- User correction learning is personal and cross-plugin. The correction store
  must resolve actor, effective workspace, plugin id, thread id, language, and
  privacy policy before storing or applying replacements.
- Text should enter native Home AI composers through host draft APIs and
  embedded plugins through an explicit bridge protocol, not through keyboard
  simulation. This avoids the iOS/iPadOS/PWA failure mode where third-party
  input methods or simulated keystrokes cause black screens, focus drift,
  keyboard obstruction, iframe scroll jumps, or stale composer state.
- Composer owners remain the source of truth for their own draft and submit
  state. Home AI must not inspect plugin DOM or call plugin-local JavaScript
  functions.

The feature is eligible whenever the active Home AI surface has a writable
composer: ordinary chat, plugin-bound topic chat, a registered native Home AI
form composer, or an embedded plugin composer that reports bridge capability.
It remains disabled on non-composer surfaces, fullscreen previews, unwritable
composers, missing microphone permission, or missing ASR backend. It must not
appear outside Home AI or behave as a global OS input method.

## MVP

The first phase should implement the smallest complete loop:

1. Reuse the active composer send button as the primary voice entry.
2. Preserve existing tap-to-send behavior. A long press on the send button
   starts recording after a bounded threshold; releasing the button finalizes
   the recording and starts transcription.
3. If the user releases while the browser microphone permission prompt is still
   pending, treat the gesture as cancelled and do not start a short recording.
4. Record a short clip through `navigator.mediaDevices.getUserMedia()` and
   `MediaRecorder` from the top-level Home AI page.
5. Enforce an initial clip length of 3-30 seconds. Clips that are too short
   close silently because the user did not produce usable input; long clips or
   backend failures still fail with a visible, non-destructive diagnostic.
6. Upload the audio blob to a Home AI API route that delegates to a service,
   not to `server.js` business logic.
7. Run local ASR through a configured backend such as Whisper Large V3 Turbo,
   FunASR, or a future provider.
8. Insert the transcript automatically into the active composer by host draft
   API for native Home AI composers or by plugin injection protocol for
   embedded plugin composers.
9. Let ordinary composer editing express user intent: sending unchanged text
   means accept; editing then sending means use the edited final text for
   correction learning; deleting or never sending means discard.
10. If the composer owner later reports the final submitted text for the same
    voice session, extract conservative correction candidates. If it does not,
    keep only the generic sent-text phrasebook evidence from successful sends.
11. The service rejects likely no-speech hallucinations before composer
    insertion. Very short clips that produce long text, repeated filler
    characters, or common media-subscription boilerplate are recorded only as
    bounded reject audit metadata and must not enter drafts, correction
    learning, or user-visible sent content.

MVP must not require arbitrary long recordings, background recording, global OS
microphone shortcuts, system input-method integration, a separate microphone
launcher, auto-send, or per-plugin ASR code. Realtime partial text is allowed
only through the Home AI host-owned streaming path, with whole-clip ASR as a
fallback when streaming is unavailable or fails.

## User Experience

The host overlay is a Home AI shell surface:

- entry: long press on the active composer send button. Normal tap keeps its
  existing send behavior. Long press starts recording; release finalizes the
  clip and starts ASR transcription;
- stop state: when the main composer button is showing `Stop`, voice input is
  unavailable. A normal tap still stops the active turn, but a long press must
  suppress text selection and cancel the resulting click so an attempted voice
  gesture does not accidentally interrupt the active turn;
- active recording: the send button becomes a pressed recording affordance with
  a compact timer/status. It must suppress native text selection, callouts, and
  context menus for the gesture target. On iOS/PWA this suppression must be
  enforced at document capture level while recording or while the long-press
  timer is active, not only through button-level CSS;
- cancellation: an explicit cancel affordance or pointer cancellation may
  discard the clip. If permission is still pending when the user releases the
  send button, the host cancels silently and must not create a too-short
  recording failure;
- suppression: unavailable when fullscreen preview, unsupported composer state,
  in-flight send, unwritable draft, missing microphone permission, or disabled
  ASR backend is active;
- recording states: idle, requesting permission, recording, paused,
  finalizing, transcribing, editable transcript, inserting, inserted, failed;
- realtime text: when the configured provider exposes streaming, the host may
  write provisional partial text into the active native or embedded plugin
  composer while the user is still holding the send button. The host/plugin
  pair must stop overwriting if the user edits the composer during recording,
  and final insertion must replace the provisional text with the final
  corrected transcript instead of appending a duplicate;
- visible controls after release: no insert/replace/discard decision is shown
  for the native host composer path. The transcript is automatically inserted
  into the composer, where normal editing and final send determine whether the
  text is accepted, edited, or discarded;
- default insertion mode: append to current draft. Replace and direct submit
  are not exposed in the host native MVP. Embedded plugins may still implement
  append/replace bridge actions when their own UI requires them;
- correction feedback: when corrections are applied, show a light host notice
  such as `Applied 2 personal corrections`, with undo and manage actions.

Design posture:

- density: compact;
- motion: micro-feedback only;
- status criticality: medium while recording/transcribing, high when
  permission, privacy, or injection errors occur;
- visual style: calm Home AI control-panel language, no decorative assistant
  animation or marketing-style voice panel.

The overlay should never depend on plugin iframe layout for placement. It must
respect safe areas, the measured Home AI bottom stack, active keyboard metrics,
and plugin fullscreen preview state.

Microphone permission timing:

- Home AI must not request first-time microphone permission on app boot, app
  open, deployment, service worker refresh, or composer discovery.
- The browser/system permission prompt is only allowed after a user performs
  the voice-entry gesture and the host is about to call
  `navigator.mediaDevices.getUserMedia({ audio: true })`.
- After permission is granted, the same browser/PWA origin should reuse that
  grant. Repeated system prompts usually mean the origin changed, the PWA was
  reinstalled, site permissions were cleared, the browser is configured to ask
  every time, or the host is accidentally creating a new recording request.
- The visible `requesting` status is a local Home AI state and must not be
  interpreted as a fresh system permission prompt unless the browser displays
  its native permission UI.
- After Home AI has successfully opened the microphone once for the current
  origin, later recording attempts should treat phone calls, video calls, and
  other voice input methods as audio-session interruptions rather than as a
  reason to reacquire audio focus immediately. The client may remember that
  permission was previously granted, but it must release the real microphone
  stream after each recording attempt so third-party input methods can use the
  microphone. The stream may be rebuilt only after the next explicit
  voice-entry gesture when permission is already granted or remembered. Home AI
  must not rebuild or re-acquire the microphone on foreground restore, window
  focus, page show, route changes, or timer checks, because that can steal audio
  focus back from third-party input methods such as system keyboards or
  dictation tools. Remembered permission is not background transcription and
  must not upload or persist audio unless an explicit recording gesture starts a
  `MediaRecorder`.
- When the composer send button is in Stop mode during an active turn, short
  tap remains the interrupt action. Long-press is reserved for voice input:
  the host must suppress text selection and the follow-up click, start voice
  recording after the long-press threshold, and stop/transcribe on release
  without interrupting the current turn.
- Home AI cannot auto-click, hide, or bypass the browser/system microphone
  prompt. If iOS/PWA, Safari, site settings, reinstall, or another app revokes
  or interrupts the origin's microphone grant, Home AI should rebuild the
  stream only on the next explicit voice-entry gesture, show `preparing
  microphone` instead of `requesting permission` when permission is already
  granted or remembered, and only show a permission diagnostic when the browser
  reports `denied` or `NotAllowedError`.
- Recording must have a visible microphone affordance. While active recording
  is in progress the host overlay shows a pulsing microphone indicator plus
  elapsed time, so users can distinguish a live recording from permission
  preparation or transcription.
- The keyboard-safe composer layout must not reuse normal bottom navigation or
  plugin navigation offsets while `keyboard-viewport-active` is set. In plugin
  topic detail mode, the fixed composer should anchor to the active visual
  viewport bottom so the native keyboard does not lift it by the hidden bottom
  stack height.

## Service Architecture

Implementation should follow the service-first rule:

- `adapters/voice-input-service.js`
  - owns session creation, actor/workspace/plugin/thread scoping, audio limits,
    ASR provider dispatch, correction application, audit metadata, and privacy
    retention decisions;
- `adapters/voice-input-asr-provider.js`
  - defines the backend interface and provider registry;
- `adapters/voice-input-correction-service.js`
  - owns diff extraction, candidate scoring, scope resolution, application,
    phrasebook seed/learning, undo/disable, and cleanup;
- `server-routes/voice-input-api-routes.js`
  - owns upload/transcribe/correction API glue and calls services;
- `public/app-voice-input-ui.js`
  - owns the composer send-button long-press gesture, host overlay, recorder
    state, host draft insertion, postMessage protocol, and visible status;
- `tests/voice-input-*.test.js`
  - own focused service, route, and UI bridge coverage.

`server.js` should only register the route module and wire dependencies.

## Phrasebook Learning Sources

Home AI voice input correction uses three bounded learning sources:

1. `system_seed`
   - Home AI preloads workspace-safe vocabulary from platform concepts,
     plugin ids, plugin display names, common toolset names, and local product
     terms such as `Home AI`, `Codex`, `Codex Mobile`, `MCP`, `Gateway`,
     `handoff`, `Growth`, `Email`, `Note`, `Wardrobe`, `Finance`, `衣橱`,
     `记账`, `目录`, `话题`, and `交付文件`.
   - System seed entries may include explicit aliases such as lowercase English
     variants. They are active immediately because they are product vocabulary,
     not inferred private content.
   - Seed entries are public-deployable defaults and must not include private
     paths, access keys, personal secrets, or one-user-only phrases.

2. `sent_text`
   - After a composer send succeeds, Home AI may submit the final sent text to
     the voice learning service, regardless of whether the source was Home AI
     voice input, the system keyboard, a third-party input method, paste, or
     manual typing.
   - Users can also open `语音学习` from the chat top-more menu. This switches
     the current chat surface into a local learning mode: the normal bottom
     composer stays in place, but Send calls `/api/voice-input/learn-sent-text`
     with `receiptMode: "phrasebook"` and must not call
     `/api/threads/:id/messages`, create a chat message, start Gateway, or send
     the content to a model. The conversation area renders the server learning
     receipt as a local assistant-style response.
   - The server-side thread message commit path is the browser learning hook:
     once the user message is accepted into the thread, it records bounded
     sent-text evidence through `voiceInputService.learnSentText`. Browser
     clients must not also call `/api/voice-input/learn-sent-text` after send,
     because duplicate client/server evidence inflates phrase support counts.
     The route remains available for compatibility tests and non-thread
     integration surfaces that cannot pass through the thread commit service.
   - Home AI must not observe keystrokes, read the third-party input method, or
     collect text from other apps. It only sees the final text that the user
     has already placed into a Home AI composer and successfully sent.
   - The service extracts short candidate terms and immediately discards the
     full sent text. Long-term state stores only bounded phrase entries,
     support counts, scope, source type, and timestamps.
   - Active phrasebook entries are passed to the ASR provider as bounded
     hotword-style `initial_prompt` hints for the current actor/workspace
     scope. This helps short personal names during decoding. It does not
     blindly rewrite arbitrary post-ASR text; wrong-to-right substitutions
     still require alias or correction evidence.
   - Extremely short CJK audio, especially two-character personal names, can
     still be decoded as a common homophone even when the active phrasebook term
     is present in the ASR prompt. The correction layer may rescue only exact
     whole-transcript short aliases, such as a two-character homophone plus
     trailing punctuation. It must not globally replace that alias inside a
     longer sentence, because normal phrases such as "无凭无据" would otherwise
     be corrupted.
   - Sent-text entries are phrasebook candidates. They do not create automatic
     `from -> to` replacement rules by themselves. They can bias later ASR
     correction, capitalization normalization, and suggestion ranking after
     repeated support.

3. `voice_diff`
   - Voice input keeps the stricter existing path:
     `raw ASR transcript -> final submitted text`.
   - Only short safe replacement pairs are extracted. Structured spans such as
     URLs, file paths, command lines, dates, amounts, code, and secrets remain
     excluded from automatic learning.
   - Repeated support is required before a replacement can auto-apply.

Scope and privacy rules:

- Phrasebook entries are scoped by actor, workspace, surface type, optional
  plugin id, optional thread id, and language.
- Workspace-level seed terms should be available across the workspace; user
  inferred terms stay actor/workspace scoped.
- Learned phrasebook terms, correction pairs, and bounded audit metadata are
  durable server data. In SQLite runtime mode they must be stored in
  `data/hermes-mobile.sqlite3` tables `voice_input_phrasebook`,
  `voice_input_corrections`, and `voice_input_audit`, not only in the
  compatibility `state.json` snapshot.
- The Mac daily disaster backup must include those tables through the existing
  online SQLite snapshot of `data/hermes-mobile.sqlite3`.
- Raw audio is not persisted by default. Full sent text and full transcripts
  are not persisted as long-term learning state.
- The service stores audit metadata such as text length, extracted count,
  source type, and scope. It must not store raw secrets, full private messages,
  or long text logs.
- Users must be able to disable a learned correction or phrasebook entry in
  later management UI. Disabled entries must not apply.

Application behavior:

- Replacement-pair corrections from `voice_diff` remain the only source of
  high-impact automatic text substitution.
- Phrasebook entries can normalize exact English/case variants such as
  `home ai` -> `Home AI` and can provide future ASR backend bias lists.
- Active system or repeatedly learned single-token Latin phrasebook entries may
  use a bounded fuzzy spelling rescue for ASR near-misses. The rule is
  intentionally narrow: same length, same first and last character, edit
  distance one, clear word boundary, no structured spans, and either a
  `system_seed` term or support count 3+. This covers product/tool names such
  as `Cotex` -> `Codex` without turning the phrasebook into broad English
  autocorrect.
- CJK phrasebook aliases are limited to exact short whole-transcript rescue
  rules. They are not used as general find-and-replace rules in longer text.
- Low-confidence learned phrasebook entries should be suggestions or bias
  signals until repeated support promotes them.

## ASR Backend Abstraction

The ASR provider interface should be replaceable:

```js
async function transcribeAudio({
  audioPath,
  mimeType,
  durationMs,
  localeHint,
  actorId,
  workspaceId,
  surfaceType,
  pluginId,
  threadId,
  composerId,
  requestId,
}) {
  return {
    text: "",
    language: "zh",
    confidence: 0.0,
    segments: [],
    backend: "funasr-local",
    durationMs: 0,
  };
}
```

Initial providers:

- `funasr-local`: calls a local FunASR service or command. The Mac production
  default is an OpenAI-style FunASR endpoint at
  `http://127.0.0.1:8002/v1/audio/transcriptions`; the provider auto-selects
  multipart upload protocol for `/v1/audio/transcriptions` URLs.
- `whisper-local` / `whisper-large-v3-turbo`: calls a local Whisper Large V3
  Turbo service or command, kept as a comparison and fallback candidate.
- `disabled`: returns a bounded unavailable diagnostic for public installs
  without an ASR backend.

The multi-engine comparison rollout is tracked separately in
`docs/IMPLEMENTATION_NOTES/voice-input-asr-benchmark-plan.md`. The durable
boundary is that ordinary composer insertion keeps one configured default ASR
backend, while voice-learning/training mode may request bounded comparison
results from multiple local engines for diagnostics and correction learning.
Pinyin/homophone correction is a required post-ASR layer and must apply
consistently to every engine result.

The implemented pinyin/homophone layer is owned by
`adapters/voice-input-correction-service.js`. It computes pinyin keys from the
active phrasebook and compares them with same-length CJK spans in the ASR
transcript. It only auto-applies exact pinyin matches for short active
phrasebook terms, skips structured spans such as URLs, dates, amounts, file
paths, commands, and code, and blocks known high-risk phrases where a common
word or idiom would be corrupted. Repeated sent-text learning is required
before sentence-level replacements such as personal names are applied inside a
larger sentence. This keeps the feature as correction learning, not broad text
rewriting.

Default ASR engine selection is an Owner-global server setting, not a
workspace-local or device-local preference. The Settings sheet writes
`voiceInput.settings.defaultAsrBackend` through `/api/voice-input/settings`;
all workspaces, devices, plugins, and composers use that same default for
ordinary voice insertion. The deploy environment remains the fallback/default
provider configuration and exposes the available local providers.

Configuration must be public-deployable:

- `HERMES_MOBILE_VOICE_INPUT_ENABLED`;
- `HERMES_MOBILE_VOICE_INPUT_ASR_BACKEND`;
- `HERMES_MOBILE_VOICE_INPUT_ASR_PROTOCOL`;
- `HERMES_MOBILE_VOICE_INPUT_ASR_URL` or command/path equivalents;
- `HERMES_MOBILE_VOICE_INPUT_STREAMING_ENABLED`;
- `HERMES_MOBILE_VOICE_INPUT_STREAMING_URL`;
- `HERMES_MOBILE_VOICE_INPUT_STREAMING_SAMPLE_RATE`;
- `HERMES_MOBILE_VOICE_INPUT_STREAMING_TIMEOUT_MS`;
- `HERMES_MOBILE_VOICE_INPUT_LANGUAGE`;
- `HERMES_MOBILE_VOICE_INPUT_TASK`;
- `HERMES_MOBILE_VOICE_INPUT_INITIAL_PROMPT`;
- `HERMES_MOBILE_VOICE_INPUT_CONDITION_ON_PREVIOUS_TEXT`;
- `HERMES_MOBILE_VOICE_INPUT_VAD_FILTER`;
- `HERMES_MOBILE_VOICE_INPUT_MAX_SECONDS`;
- `HERMES_MOBILE_VOICE_INPUT_AUDIO_RETENTION_SECONDS`;
- `HERMES_MOBILE_VOICE_INPUT_DEBUG_AUDIO_RETENTION_SECONDS`.

For FunASR local streaming, the browser sends mono PCM16 chunks through Home AI
HTTP routes under `/api/voice-input/stream/*`; the browser must not connect
directly to `127.0.0.1:8002` because iOS/PWA clients run on a different
device. Home AI proxies the chunks to the local FunASR service's
`/v1/audio/transcriptions/stream/start|chunk|final|cancel` endpoints. Partial
results use `paraformer-zh-streaming` for low-latency feedback, while final
results are re-run through the offline FunASR model with punctuation so the
existing correction and learning pipeline receives the highest-quality text.
The browser should aggregate captured mono PCM16 audio to roughly 300 ms before
each chunk request so the host avoids high-frequency tiny HTTP calls while still
showing near-realtime provisional text. The default local FunASR streaming
window is `FUNASR_STREAMING_CHUNK_SIZE=0,5,2`, which targets lower partial
latency than the older `0,10,5` setting. This is an installer/runtime default,
not a private production-only mutation; deployments may override the variable
when a different ASR backend needs a different streaming cadence.

A fresh public deployment with no ASR backend must show the voice input as
disabled/unavailable with an installer hint. It must not depend on the
maintainer's private Mac Studio paths.

Mac production closure:

- `services/whisper-large-v3-turbo/` contains the public-safe FastAPI service
  skeleton and requirements for a local faster-whisper large-v3-turbo endpoint.
- `scripts/install-macos-whisper-large-v3-turbo-service.js --execute` installs
  the service as launchd label `com.hermesmobile.whisper-large-v3-turbo` under
  `/Users/hermes-host/HermesMobile/services/whisper-large-v3-turbo`.
- On Apple Silicon Mac production, `WHISPER_ENGINE=auto` prefers
  `mlx-whisper` with the offline local MLX model directory
  `models/mlx-community-whisper-large-v3-turbo` when it contains
  `weights.safetensors`. This is the primary local large-v3-turbo path for
  short Home AI voice input latency. The MLX files are `config.json`,
  `configuration.json`, and `weights.safetensors`.
- The service first checks the offline local model directory
  `models/mobiuslabsgmbh-faster-whisper-large-v3-turbo` under the service root.
  When that directory contains `model.bin`, the service can load it directly as
  a CTranslate2/faster-whisper fallback and does not need HuggingFace cache
  resolution at request time. The required faster-whisper CTranslate2 files are
  `config.json`,
  `preprocessor_config.json`, `tokenizer.json`, `vocabulary.json`, and
  `model.bin`; on the maintained Mac production host they can be prefetched
  from ModelScope when HuggingFace TLS/API access is unreliable.
- `scripts/deploy-macos-production.js --target home-ai --execute` preserves the
  existing listener plist and patches only the voice-input ASR environment
  variables so the Home AI listener points at the local 8001 endpoint.
- The Home AI voice-input provider and the local Whisper service default to
  `language=zh`, `task=transcribe`, `condition_on_previous_text=true`,
  `vad_filter=false`, `beam_size=5`, and a Chinese initial prompt asking for
  simplified Chinese with appropriate Chinese punctuation. These defaults are
  intended for the Home AI composer voice-entry path, whose primary real-world
  usage is short Mandarin dictation. Deployments can override them with the
  environment variables above when a different locale or VAD policy is needed.
- The voice-input service does not strip punctuation from ASR output. It only
  trims and bounds transcript length before applying the conservative personal
  correction layer, so missing Chinese punctuation should be diagnosed first at
  the ASR decode parameter/service layer. If direct service transcription has
  punctuation but Home AI output does not, then inspect the correction layer and
  UI insertion path.
- If 8001 is not healthy, Home AI may report voice input configured but
  transcription can still fail with a bounded backend error; production smoke
  should therefore check both `/api/voice-input/status` and
  `http://127.0.0.1:8001/health`.

## Privacy And Retention

Default privacy policy:

- raw audio is temporary processing input only;
- raw audio is deleted immediately after successful transcription and
  correction extraction, or after a short cleanup TTL for failed jobs;
- default audio retention should be `0` after success and no more than 15
  minutes after failure;
- opt-in debug retention may keep audio for up to 24 hours under a production
  data temp directory, never under the source checkout;
- full raw audio, OAuth tokens, API keys, plugin launch tokens, browser
  cookies, full mailbox bodies, full ledger rows, and private file contents
  must not appear in docs, handoffs, logs, model prompts, postMessage
  diagnostics, or screenshots.

Persisted correction data should store only short replacement pairs and bounded
metadata:

```text
actorId
workspaceId
surfaceType
pluginId optional
threadId optional
composerId optional
language
sourceText short span
targetText short span
scope
supportCount
rejectCount
status active|suggest_only|disabled
createdAt / updatedAt / lastAppliedAt
```

Session audit should store metadata such as ids, surface type, optional plugin
id, audio duration, transcript length, correction candidate count, applied
count, backend name, status, and hashed request ids. It should not persist full
transcripts by default.

## Correction Learning

Correction learning must be conservative. The goal is to help repeated personal
terms, names, project labels, and common ASR confusions, not to rewrite user
meaning.

Rules:

- extract short replacement pairs only, normally 2-20 Chinese characters or a
  similarly small token span in other languages;
- do not learn whole paragraphs or large sentence rewrites;
- require repeated evidence before auto-apply. First and low-confidence matches
  are suggestions only;
- default thresholds:
  - support count 1-2: suggest only;
  - support count 3+ with no recent rejection: eligible for auto-apply in the
    matching scope;
  - any rejection or undo lowers the entry back to suggest-only or disabled;
- never auto-learn or auto-apply spans that look like dates, times, amounts,
  account numbers, phone numbers, URLs, email addresses, file paths, shell
  commands, command flags, code identifiers, stack traces, or quoted code
  blocks;
- avoid applying corrections inside markdown fenced code blocks or inline code;
- apply narrower scope before broader scope:
  `thread` -> `plugin-or-surface` -> `workspace` -> `global`;
- global entries should require explicit user promotion, not automatic
  promotion from one plugin or one native composer surface;
- every auto-applied correction must be reversible from the overlay and should
  expose a manage/disable path.

Correction extraction should compare:

- raw ASR transcript -> host-edited transcript for MVP;
- raw ASR transcript -> plugin-reported final submitted text when the plugin
  supports a same-session commit event.

If the final submitted text is too long, unavailable, or marked sensitive, the
service should skip learning rather than persist more content.

## Composer Text Injection Protocol

Native Home AI composers use internal host draft APIs and do not need
postMessage. The host must still validate active actor, effective workspace,
surface type, draft id, composer id, maximum text length, and current writable
state before append, replace, or optional submit.

Home AI and the active iframe communicate through bounded `postMessage` events.
All messages must validate:

- active iframe identity;
- expected plugin id;
- expected origin from the normalized manifest;
- protocol version;
- request id / voice session id;
- maximum text length;
- supported action declared by the latest capability state.

The iframe bridge exists only for embedded plugin composers. The host queries
plugin capability:

```js
{
  type: "voice_input.capability_query",
  version: 1,
  requestId: "uuid",
  pluginId: "codex-mobile"
}
```

The plugin replies:

```js
{
  type: "voice_input.capability_state",
  version: 1,
  requestId: "uuid",
  pluginId: "codex-mobile",
  composer: {
    writable: true,
    draftId: "bounded-draft-id",
    contextId: "bounded-thread-or-route-id",
    maxChars: 12000
  },
  actions: {
    insert_text: true,
    append_text: true,
    provisional_text: true,
    replace_draft: true,
    submit: false
  }
}
```

If an embedded plugin wants its own composer send button to trigger the shared
Home AI recording gesture, it may emit these embedded-only bridge requests
after capability state is available:

```js
{
  type: "voice_input.start_request",
  version: 1,
  pluginId: "codex-mobile",
  composerId: "thread-composer"
}
```

```js
{
  type: "voice_input.stop_request",
  version: 1,
  pluginId: "codex-mobile",
  composerId: "thread-composer"
}
```

`voice_input.cancel_request` discards the active host recording. These events
must be enabled only for the Home AI embedded-plugin runtime; standalone Codex
Mobile must keep its existing send-button behavior unless it explicitly opts
into the same host contract in a separate product decision.

The host injects text:

During streaming, the host may send provisional text. Plugins must treat this
as replaceable draft state for the same `voiceSessionId`, not as committed text
for learning or final-send audit:

```js
{
  type: "voice_input.provisional_text",
  version: 1,
  requestId: "uuid",
  voiceSessionId: "uuid",
  pluginId: "codex-mobile",
  composerId: "thread-composer",
  text: "partial transcript"
}
```

After release, the host sends the final text:

```js
{
  type: "voice_input.append_text",
  version: 1,
  requestId: "uuid",
  voiceSessionId: "uuid",
  pluginId: "codex-mobile",
  text: "confirmed transcript",
  source: "home_ai_voice_input"
}
```

The plugin acknowledges:

```js
{
  type: "voice_input.insert_result",
  version: 1,
  requestId: "uuid",
  voiceSessionId: "uuid",
  pluginId: "codex-mobile",
  ok: true,
  draftId: "bounded-draft-id"
}
```

If the user later sends the draft, the composer owner may report the final
submitted text for correction extraction. Embedded plugins do this through the
bridge:

```js
{
  type: "voice_input.commit_result",
  version: 1,
  voiceSessionId: "uuid",
  pluginId: "codex-mobile",
  ok: true,
  action: "submitted",
  messageId: "bounded-message-id",
  finalText: "final user submitted text"
}
```

Errors use:

```js
{
  type: "voice_input.error",
  version: 1,
  requestId: "uuid",
  voiceSessionId: "uuid",
  pluginId: "codex-mobile",
  code: "composer_not_writable",
  message: "Composer is not writable."
}
```

The protocol must not send raw audio, access keys, launch tokens, cookies,
plugin private data, local file paths, or ASR backend paths to the iframe.
Plugins should not receive the raw ASR transcript unless the user is inserting
that transcript as text.

## First Adoption Targets

The native Home AI chat composer should be the first host-owned adoption path:

- bind voice input to long press on the existing send button;
- keep normal tap-to-send behavior unchanged;
- start recording only after the long-press threshold and only when the
  composer is writable;
- release finalizes recording and starts transcription;
- insert confirmed text by updating Home AI draft state, not by simulating
  keyboard input;
- leave submit/manual send as the user's separate action in MVP.

Codex Mobile should be first because its Home AI embedded edition has:

- thread-specific composer state;
- a send flow that can report success;
- existing keyboard and side-chat visual harness requirements;
- Owner-critical visibility where high-quality voice input has immediate value.

Required Codex Mobile changes:

- emit `voice_input.capability_state` when the thread composer or side-chat
  composer becomes writable/unwritable;
- when running inside Home AI only, optionally map a composer send-button long
  press to `voice_input.start_request` / `voice_input.stop_request` so the Home
  AI host owns recording and transcription;
- implement `provisional_text`, `append_text`, and `replace_draft` by updating
  Codex Mobile draft state, not by dispatching keyboard events. `provisional_text`
  must replace only the previous provisional segment for the same
  `voiceSessionId`, and final text must restore the provisional base before
  insertion to avoid duplicate content;
- include the voice action and request id in `voice_input.insert_result` so the
  host can distinguish provisional failures from final insert acceptance;
- in active-turn `Stop` state, treat the current thread composer as a writable
  follow-up draft for voice input. The embedded bridge should temporarily
  restore composer editability, write provisional/final text to draft state,
  and persist the draft directly instead of depending on ordinary send-button
  availability or busy-state draft debounce;
- optionally implement `submit` only after draft validation and duplicate-send
  guards are proven;
- attach `voiceSessionId` metadata to a draft segment inserted by Home AI;
- emit `voice_input.commit_result` after the user sends a draft that contains
  a voice-inserted segment, including bounded final text for the same session
  when safe;
- preserve existing standalone Codex Mobile behavior. This contract applies
  only to the Home AI embedded plugin edition.

If Codex Mobile cannot safely provide final submitted text in a path, it should
acknowledge insertion but set a final-text-unavailable result. Home AI then
keeps only the successful sent-text phrasebook evidence and does not infer a
voice replacement pair for that session.

## Mobile/PWA Risks

Risks that must be covered before implementation closure:

- microphone permission prompt can steal focus or leave the PWA in a visually
  stale state;
- send-button long press can trigger native text selection, callouts, context
  menus, or accidental drag gestures if the touch target is not guarded;
- normal tap-to-send can regress if the long-press threshold or pointer
  cancellation handling is too aggressive;
- recording overlay can overlap Home AI bottom navigation, plugin Dock, or a
  plugin iframe keyboard surface;
- iOS may suppress `MediaRecorder` formats or behave differently in
  standalone PWA versus browser mode;
- if the overlay opens while an iframe input is focused, the software keyboard
  may remain visible and obscure the overlay;
- postMessage ordering can race plugin navigation, iframe reload, or workspace
  switch;
- replacing a plugin draft can destroy user text if the capability state is
  stale;
- direct submit can duplicate-send if plugin-side in-flight guards are absent;
- correction learning can corrupt structured text if the extractor is too
  aggressive.

Mitigations:

- require a fresh capability query before insertion;
- default to append, not replace or submit;
- bind voice recording only after a confirmed long-press threshold and preserve
  the existing tap send path;
- suppress `user-select`, native callout, and context menu behavior on the send
  button while the long-press gesture is active;
- do not reveal the overlay on fullscreen plugin previews;
- suspend global plugin Dock gestures while the overlay is active;
- treat microphone permission denial as a normal recoverable state;
- use idempotent voice session ids and insertion request ids;
- clear pending injection on plugin iframe reload, route change, workspace
  change, or visibility loss;
- require iOS installed-PWA harness evidence for overlay geometry and
  keyboard-safe behavior.

## Test And Harness Plan

Focused source tests:

- ASR provider registry returns disabled diagnostics when backend config is
  missing;
- voice input service enforces duration, MIME, actor/workspace/surface scope,
  optional plugin scope, temp-file cleanup, and backend failure handling;
- correction service extracts only short replacement pairs and ignores
  structured spans;
- correction thresholds move from suggestion to auto-apply only after repeated
  support and no recent rejection;
- route tests reject unauthenticated uploads and oversized audio;
- native composer UI tests preserve tap-to-send, start recording on long press,
  finalize/transcribe on release, cancel without transcription when requested,
  and avoid native text selection/callouts;
- postMessage UI tests reject wrong origin, wrong plugin id, stale session id,
  unsupported action, and over-limit text.

Visual/device harness:

- add installed-PWA scenarios such as `voice-input-overlay-composer` and
  `voice-input-overlay-plugin-composer`;
- first target ordinary Home AI chat plus `codex-mobile` with a real thread id;
- assert overlay visible states, microphone permission state, host bottom-stack
  reservation, no native text selection box on send-button long press, no
  iframe/nav/composer overlap, no horizontal overflow, automatic host draft
  insertion, and stable return after automatic insert or cancellation;
- when feasible, include a real microphone-permission artifact. If the
  automation environment cannot grant microphone input, use a test audio blob
  for ASR service checks and mark the visual run as layout-only.

Full release gates:

- architecture boundary test for service-first placement;
- privacy scan;
- productization check proving public installs without a local ASR backend
  fail disabled rather than depending on private paths.

## Rollout Plan

MVP:

- host voice entry on native Home AI composer surfaces and eligible embedded
  plugin composers;
- send-button long press starts recording and release starts transcription;
- 3-30 second short clips;
- local FunASR ASR with HTTP chunk streaming when available and whole-clip
  transcription fallback when streaming is unavailable;
- automatic append insertion into Home AI chat composer and eligible native
  host composers;
- plugin bridge append/replace insertion for embedded plugins that declare
  those actions;
- learning from raw ASR -> final sent text when the voice session is submitted;
- sent-text phrasebook learning after successful composer sends;
- disabled state for missing ASR backend.

Phase 2:

- Codex Mobile `commit_result` support for final submitted text;
- half-automatic correction suggestions with undo/disable;
- workspace/plugin/thread-scoped correction management UI;
- Email/Note/Growth composer capability adoption;
- embedded plugin provisional draft replacement for realtime partial text when
  the plugin bridge can safely prove that the draft was not user-edited.

Longer term:

- broader composer adoption across all Home AI plugin and topic surfaces;
- speaker/language hints by workspace;
- user-managed global correction promotion;
- cross-device correction sync through Home AI persistence;
- admin privacy controls for retention and correction export/delete;
- optional offline model selection by device class.

## Open Product Decisions

These should be confirmed before implementation:

- exact long-press threshold, minimum clip duration, and cancel gesture for the
  send-button recording interaction;
- whether `insert-and-submit` should be disabled until after Codex Mobile
  proves idempotent send guards in production;
- whether raw audio debug retention should be completely unavailable in public
  builds or allowed behind Owner-only config;
- whether global correction entries require explicit promotion in every case;
- whether the correction management UI belongs in Owner settings first or in
  the voice overlay itself.
