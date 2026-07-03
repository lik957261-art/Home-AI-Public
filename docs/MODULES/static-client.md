# Module: Static Client And Cache

## Responsibility

The static client owns PWA UI, client routing, service worker cache behavior, and mobile visual state.

## Core Files

- `public/index.html`
- `public/service-worker.js`
- `public/directory-viewer.html`
- `public/styles.css`
- `public/app-*.js`
- `tests/task-list-ui.test.js`
- focused UI tests such as `tests/app-learning-growth-ui.test.js`

Owner-only operational UI follows the same static shell rules. The first
System Console MVP lives in `public/app-owner-system-console-ui.js`, is loaded
through `public/index.html` and `public/service-worker.js`, and is covered by
`tests/owner-system-console-ui.test.js` plus `tests/task-list-ui.test.js`.
Its Owner-visible copy defaults to Chinese while stable operator terms such as
`Gateway`, `Plugin`, `Runtime`, `SLO`, and `Canary` may remain English. Owner
reachability is also part of the shell contract: Settings may expose an
explicit button, and the existing global three-finger long-press feedback menu
must show an Owner-only `系统控制台` action when the current session is Owner.
The three-finger gesture remains the feedback-menu gesture; do not add a
separate competing bottom-navigation long-press route for the console.

## Frontend Build Direction

The existing primary PWA shell remains the stable ordered `public/app-*.js`
runtime and should not be migrated to Vite in one broad change. New independent
frontend capabilities should default to Vite-built islands when they are not
tightly coupled to chat, Composer, event streaming, plugin iframe hosting,
service-worker registration, or global navigation. The central rule lives in
`docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md` under
`Frontend Build Boundary`; Vite-built output must still obey this module's
static version, service-worker cache, deployment, and harness rules.

The first production Vite cutover is a transitional bootstrap, not the final
full-shell replacement. The Home AI listener still serves the classic
`public/index.html` business shell, and Vite mode injects only the built
production bootstrap module at
`public/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js`.
That module installs bounded Vite readback state and the focus lifecycle guard
while preserving the classic runtime. Shell selection is owned by
`adapters/mobile-http-runtime-service.js`, `mobile-server-runtime.js`, and
`config/home-ai-shell-mode.json`. Production reads the runtime config root
first, then falls back to the app-local config file so deploys do not depend on
hand-editing a private data config path. If the config/env/request mode is
missing or invalid, the server fails closed to `classic`; rollback is changing
the mode back to `classic` and restarting Home AI.

The Owner System Console Vite migration pilot remains an island boundary:
`npm run build:vite` builds the island from
`src/vite-islands/owner-system-console/` into `public/vite-islands/`, and the
manual built preview page is `public/vite-preview/owner-system-console.html`.
For source development, `npm run dev:vite` serves the island at
`/vite-owner-system-console-preview/`. Island preview pages must not be treated
as a replacement for the production shell unless a separate source-change
contract and production readback prove that specific boundary.

The full primary-shell migration target is
`docs/IMPLEMENTATION_NOTES/vite-full-frontend-migration-target.md`. It is a
development-environment objective only: it may build and validate a Vite app
preview, but it does not authorize changing production `/` away from the
classic shell.

The current full-app Vite preview host lives in `src/vite-app/`, builds to
`public/vite-islands/home-ai-app-preview/`, and can be opened after
`npm run build:vite` at `public/vite-preview/home-ai-app.html`. During
`npm run dev:vite`, it is served at `/vite-app-preview/`. This page is not
referenced by `public/index.html` or `public/service-worker.js`.

The production bootstrap entry lives at
`src/vite-app/production-bootstrap.mjs`. It is a separate Vite build input from
the development full-app preview and must not import preview-only API mocks or
replace the classic global facade. It exposes bounded status through
`window.HomeAiViteProduction.status()` for production readback and keeps
`window.HomeAiRuntimeFacade` owned by the classic shell until later ESM slices
take over the corresponding workflows.

The Vite migration runtime facade lives at
`src/vite-app/runtime/home-ai-runtime-facade.mjs`. It is the explicit import
boundary for Vite modules that need API, auth/access-key, event, feedback,
route, diagnostic transport, dedupe state, or native-shell bridge access.
During the migration it may be attached as
`window.HomeAiRuntimeFacade` for classic compatibility, but new code must not
create new unmanaged `window.state` or boot-order globals. The focused guard is
`tests/vite-runtime-facade.test.js`.

The classic static shell also loads `public/app-runtime-facade-ui.js` after
`app-api-client.js`. That bootstrap attaches a minimal `HomeAiRuntimeFacade`
for ordered static-script consumers before Owner Console and AI Ops modules
run. It owns temporary classic-shell `fetch`, `localStorage`, and cookie access
for diagnostic keepalive delivery, dedupe state, access-key cookie sync, and
`HermesAppApiClient` delegation until the full shell imports the ESM facade
directly.

The Owner System Console is the first runtime-facade consumer in the migration:
the Vite island uses `runtime.api` / `runtime.events` / `runtime.state`, and the
classic `public/app-owner-system-console-ui.js` module optionally uses
`window.HomeAiRuntimeFacade.api` when that compatibility facade is present. If
the facade is absent, the classic module must continue to use the existing
static-shell `api()` helper and preserve the Owner-only gate. Its view-mode
activation uses `runtime.route.setViewMode()` / `runtime.route.getViewMode()`;
the ESM facade and classic bootstrap own the temporary
`localStorage.hermesWebViewMode` browser boundary, not the Owner Console
module. The Owner Console Vite island's pure rendering/error model lives in
`src/vite-islands/owner-system-console/model.mjs`; that model owns bounded
Chinese UI copy, status labels, HTML escaping, and non-Owner permission error
rendering while `main.mjs` stays as runtime/DOM glue.

During local Vite development only, `vite.config.js` serves metadata-only mock
responses for selected Vite preview API paths through
`adapters/vite-dev-preview-api-mock-service.js`. This keeps
`/vite-owner-system-console-preview/` and `/vite-navigation-shell-preview/`
console-clean without a running Home AI backend. The mock response is marked
with `X-HomeAI-Vite-Dev-Mock` and must not be used as production Owner
permission/readback evidence or wired into `server.js`.

AI Ops diagnostic feedback is the second runtime-facade consumer in the
migration. The classic `public/app-ai-ops-diagnostics-ui.js` module prefers the
facade for diagnostic API submission, event fanout, state projection, and
feedback status/toast events. It keeps classic fallback behavior while the
ordered shell remains active. Its client-layout diagnostic keepalive transport
now goes through `runtime.diagnostics.sendClientLayoutDiagnostic`, and plugin
conversation repair request dedupe now goes through `runtime.dedupe`; the AI
Ops module no longer owns direct `fetch` or `localStorage` for those paths.

Host Voice Input is now also a runtime-facade consumer in the migration. The
classic `public/app-voice-input-ui.js` module uses
`window.HomeAiRuntimeFacade.native` for native voice-shell detection, native
bridge availability, `homeAI` native message posting, remembered microphone
grant/status-panel storage, request ids, and native callback registration. The
voice module must not directly own `localStorage`,
`window.webkit.messageHandlers.homeAI.postMessage`,
`window.HomeAINativeVoiceInputCapability`, or
`window.HomeAINativeVoiceInput` for those boundaries. Its remaining direct
`AudioContext` selection is an explicit temporary audio-capture boundary until
voice recording is moved behind an imported Vite adapter.

The development-only Vite Voice Input status island lives in
`src/vite-islands/voice-input-status/`, with dev route
`/vite-voice-input-status-preview/` and built preview page
`public/vite-preview/voice-input-status.html`. Its model module owns bounded
Chinese status labels, pending-gesture guard timing, cancelability, terminal
auto-hide timing, duration formatting, and native-status normalization. This is
not a full voice runtime replacement: it does not call microphone APIs, start
`MediaRecorder`, write Composer text, or change the production classic voice
module. It is a Phase 5 preparation boundary so future voice runtime migration
can import a pure status model instead of copying classic-shell state rules.
The same island now imports
`src/vite-islands/voice-input-status/session-controller.mjs`, which owns pure
begin-press, short-press cancel, long-press threshold, release-to-stop, pending
guard timeout, native terminal status, and terminal auto-hide transitions with
injected timers. The preview exposes `开始长按`, `达到阈值`, `松手`,
`pending 超时`, and `自动隐藏` controls so the stale pre-recording pending
state can be tested locally without microphone, ASR, or production shell IO.
The voice island now also imports
`src/vite-islands/voice-input-status/audio-capture-adapter.mjs`, a browser
global-free ESM adapter for injected microphone capability checks, recorder
session wrapping, held-stream cleanup, PCM16 downsampling, base64 conversion,
and streaming chunk buffer policy. The dev preview renders only fixture
readiness for this adapter and never asks for microphone permission. Production
recording remains owned by `public/app-voice-input-ui.js` until a later
voice-runtime slice explicitly wires this adapter into the classic fallback or
full Vite shell and passes live local voice harnesses.

Task/document preview helpers are also runtime-facade consumers in the
migration. `public/app-task-preview-helpers-ui.js` prefers
`window.HomeAiRuntimeFacade.api` for preview JSON requests and
`window.HomeAiRuntimeFacade.documentPreview.fetchBlob()` for authenticated blob
reads used by save/share/download actions. `public/app-task-preview-ui.js`
must read Markdown preview text through the helper API path instead of creating
its own authenticated `fetch`. The preview helper must also avoid direct
`localStorage.hermesWebWorkspace` access; workspace selection is read from
`runtime.state.selectedWorkspaceId`, classic `state.selectedWorkspaceId`, then
the bounded `owner` fallback. The preview UI must avoid direct
`localStorage.homeAI.nativeShell` access; native-shell return routing uses
`runtime.native.nativeShellParam()` while preserving the existing `ios` and
`android` URL/dataset fallback behavior. Directory viewer now loads
`app-api-client.js`, `app-runtime-facade-ui.js`,
`app-task-preview-helpers-ui.js`, and `app-task-preview-ui.js` in that order.
Directory viewer's inline directory load/create/upload/delete calls now use
`window.HomeAiRuntimeFacade.api`; the viewer no longer reads `hermesWebKey`,
constructs `X-Hermes-Web-Key`, or calls `fetch()` directly for directory API
operations. Its early `hermesWebTheme` read remains a narrow first-paint theme
bootstrap until the viewer is migrated to an imported Vite entry. Its
temporary `TaskDocumentPreviewUi` access is tracked as the classic preview
overlay bridge until the viewer and preview UI are imported modules. The
preview helper no longer owns a direct authenticated `fetch` fallback or
constructs `X-Hermes-Web-Key`; missing facade/API wiring must fail as a
bounded preview-not-ready state.

The development-only Vite Document Preview island lives in
`src/vite-islands/document-preview/`, with dev route
`/vite-document-preview-preview/` and built preview page
`public/vite-preview/document-preview.html`. Its pure model owns
Markdown/image/document classification, Markdown preview API routing, same
origin viewer/native URL construction, mobile in-app overlay policy, native
shell/open-in strategy selection, and PPT/PPTX native request metadata with
`kind=powerpoint`. The island is read-only fixture evidence for Markdown,
PPTX, DOCX, PDF, image, and unsupported external files. It does not download or
share files, does not call native document bridges, and does not replace the
production classic preview overlay.

The development-only Vite Plugin Host island lives in
`src/vite-islands/plugin-host/`, with dev route
`/vite-plugin-host-preview/` and built preview page
`public/vite-preview/plugin-host.html`. Its model owns bounded embedded-plugin
manifest normalization, Owner permission fail-closed state, launch-token
redaction, iframe eligibility, same-origin and mixed-content checks, manifest
freshness, and refresh evidence. The island reads sampled plugin manifests only
through `HomeAiRuntimeFacade.api` and the Vite dev mock. It does not replace
the production resident iframe host and does not bundle plugin-owned UIs into
the Home AI shell.

The AI Ops feedback menu is also the first Phase 3 low-risk Vite island. Its
source lives in `src/vite-islands/ai-ops-feedback/`, the Vite dev route is
`/vite-ai-ops-feedback-preview/`, and the built dev preview page is
`public/vite-preview/ai-ops-feedback.html`. The island uses the runtime facade
and posts only bounded diagnostic metadata; it strips unsafe route parameters
before submission and shows the Owner-only `系统控制台` action only when the
Owner capability is available. This preview is not referenced by
`public/index.html` or `public/service-worker.js`, so it does not change the
production three-finger feedback menu or static cache version by itself.

The Phase 4 navigation shell island lives in
`src/vite-islands/navigation-shell/`, with dev route
`/vite-navigation-shell-preview/` and built preview page
`public/vite-preview/navigation-shell.html`. Its model owns view-mode alias
normalization, primary-tab metadata, Owner-only console tab gating, cached
topic/task shell status, directory topic collection grouping, task-root render
signatures, and classic fallback route construction. Its compatibility adapter
selects a root thread from the runtime state snapshot, preferring the classic
`taskListThread` cache when available, without directly reading classic
`window.state`. The task/topic root HTML block is rendered by
`src/vite-islands/navigation-shell/task-topic-root-renderer.mjs` so preview
mounting and topic-root row rendering can advance independently. Row activation
is modeled by `src/vite-islands/navigation-shell/task-topic-action-model.mjs`,
which produces route patches and classic fallback hrefs for directory, regular,
and plugin topic rows. The first read-only task/topic data boundary is isolated
in `src/vite-islands/navigation-shell/task-topic-data-source.mjs`; it builds
the existing `GET /api/threads/:id?messageMode=tasks` request and loads it only
through `HomeAiRuntimeFacade.api`. It is used for both root and selected-topic
refresh, records bounded read status/source, selected `taskGroupId`, message
mode, and message count, and is triggered by topic-row activation plus browser
history restoration in the development preview. The selected-topic detail model
in `src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs`
renders only bounded role/status/text-preview and attachment/artifact/tool-call
counts from the scoped read payload. It preserves real thread-read pagination
metadata by separating total messages, loaded messages, `hasMoreBefore`, and
oldest/newest message ids, and it keeps root reads explicit instead of showing
arbitrary task messages as selected-topic detail. It is still read-only
development preview coverage and does not replace chat detail, Composer, SSE,
or message actions.
`src/vite-islands/navigation-shell/task-topic-cache-reconciliation-model.mjs`
keeps the root task/topic cache and selected-topic detail cache separate:
root reads update `taskListThread` plus `taskListRootCache`, while selected
topic reads update `taskTopicSelectedThread` plus
`taskTopicSelectedCache` and must not overwrite the root topic list. Browser
back to the task root clears the selected-topic detail cache so stale message
payloads are not replayed as the root shell.
`tests/vite-navigation-thread-view-payload-compat.test.js` ties this boundary
to the backend `thread-view-service` `compactThreadWithMessagePage()` payload,
so the Vite model is not validated only against the local dev mock.
In Vite dev server mode,
`adapters/vite-dev-preview-api-mock-service.js` returns a metadata-only
`thread_vite_navigation_preview` fixture so `/vite-navigation-shell-preview/`
can validate the path without a running backend. That mock must not be wired
into `server.js` and is not production permission or readback evidence.
Development-preview URL/history synchronization is isolated in
`src/vite-islands/navigation-shell/route-sync-model.mjs`; it accepts only
bounded non-secret query parameters, updates the Vite preview URL through the
runtime facade route bridge, and is not production route evidence. This is not
the production navigation replacement:
`public/app-automation-ui.js`,
`public/app-wire-start-ui.js`, and `public/app-thread-list-ui.js` remain the
classic navigation/render owners until later parity slices move cached
topic/task rendering and selected-view refresh into imported modules.

The first Phase 5 message-action slice lives in
`src/vite-islands/message-action-panel/`, with dev route
`/vite-message-action-panel-preview/` and built preview page
`public/vite-preview/message-action-panel.html`. It is a read-only projection
for Usage/footer message actions. The initial model covers Wardrobe
`outfit_wear_intent` action metadata and diagnostics from the same public
message fields used by `public/app-message-actions-ui.js`, including ready,
stored/readback-verified, confirmation, error, expired, and missing-intent
states. It renders Chinese labels such as `入库`, `已入库 #... · 已验证`, and
`需重新生成`, but it does not execute MCP tools, call the
plugin-conversation action route, or replace the classic message footer.
Production execution and confirmation remain classic until a later Phase 5
cutover slice adds live send/confirm/error/readback harness coverage.

The current Phase 5 development slice adds that first parity harness for the
Wardrobe action without changing production ownership. The island now includes
`src/vite-islands/message-action-panel/action-client.mjs`, which builds the
same plugin-conversation action request body as the classic bridge and calls it
only through `HomeAiRuntimeFacade.api`. During `npm run dev:vite`, the Vite
middleware handles `POST
/api/plugin-conversation/actions/wardrobe/outfit-wear-intent` with a
metadata-only mock: `create_only` returns `needs_confirmation`, and the
follow-up `replace` request returns `stored` with `readbackVerified=true`.
The mock does not call Wardrobe MCP and must not be used as production
readback evidence. `npm run build:vite` emits a `built read-only` static
preview so opening `public/vite-preview/message-action-panel.html` cannot
accidentally call the real action route. The production action owner remains
`public/app-message-actions-ui.js` until a later cutover moves live action
execution, Composer, and SSE into the Vite shell.

The current Phase 5 chat runtime slice lives in
`src/vite-islands/chat-runtime/`, with dev route
`/vite-chat-runtime-preview/` and built preview page
`public/vite-preview/chat-runtime.html`. Its model covers bounded
`message.delta` patching, terminal assistant message refresh requests,
`thread.updated` terminal-summary refresh, run-event projection,
scope-mismatch diagnostics, streaming-buffer truncation, and user-scroll
protection. Its adapter parses MessageEvent-style `data` frames, classifies
chat versus non-chat events, delegates recognized chat events into the model,
and records bounded diagnostics for invalid JSON or unrelated events. The
preview now also includes `live-event-source-client.mjs`, which builds the
classic-compatible `/api/events` URL and owns injected EventSource lifecycle
status. The preview keeps a fake injected EventSource to validate deterministic
open/message/reconnect/close and adapter handoff, and now also exposes a
runtime-facade EventSource creation path for development verification.
`HomeAiRuntimeFacade.eventStream` owns browser EventSource construction in both
the ESM facade and the classic compatibility facade; the chat island must not
instantiate `EventSource` directly. This does not send Composer messages, write
attachments, or replace `public/app-event-stream-ui.js` and the classic
Composer modules. Production streaming remains classic until real transport
behavior and Composer parity are validated in a later development slice.

The Vite dev server now provides bounded SSE evidence for that runtime-facade
path at `/api/events?clientVersion=20260702-vite-chat-runtime-dev-v1`. The
HTTP/SSE glue lives in `vite.config.js`; the fixture frame shape lives in
`adapters/vite-dev-preview-api-mock-service.js`. The endpoint returns
`text/event-stream` chat runtime frames for the preview thread only, does not
echo access keys, and does not proxy or read production event traffic. The
event stream adapter accepts browser-native `MessageEvent.data` prototype
accessors as well as plain test objects, so local fake EventSource and real
browser EventSource evidence exercise the same parser. This is still
development-only and must not be used as production SSE cutover evidence.

The chat runtime island has now entered the Composer/Chat detail ESM
encapsulation stage for development only. `chat-detail-model.mjs` owns bounded
message-row projection, task-group filtering, and usage/action flags.
`composer-model.mjs` owns pure Composer action state and optimistic local-send
row planning. `/vite-chat-runtime-preview/` exposes a `Composer ESM` strip that
can simulate and clear local pending rows, but it must not call Home AI APIs,
submit real Composer messages, upload attachments, or replace classic
Composer/send/cancel modules until a later parity slice proves real runtime
behavior.

The current development-only boundary includes
`src/vite-islands/chat-runtime/composer-api-client.mjs` and
`src/vite-islands/chat-runtime/composer-controller.mjs`. The API client
constructs the classic Composer send and interrupt requests for
`POST /api/threads/:threadId/messages` and
`POST /api/threads/:threadId/interrupt`, but executes them only through
`HomeAiRuntimeFacade.api`. The controller composes that API client with the
pure Composer model and owns dev-preview send/interrupt state transitions:
optimistic rows, status projection, result thread merge, attachment
consumption, token cleanup, and failure rollback. `vite.config.js` maps those
requests to the Vite dev mock only for `thread_vite_chat_runtime_preview`. The
built static preview page must keep the dev-mock send/stop controls disabled
and must not emit real thread message or interrupt requests.
`tests/vite-chat-composer-backend-contract.test.js` now backs this with a
source-only contract harness against the real thread message create route and
thread interrupt route, using injected fetch plus an in-memory disposable
thread. That test proves route payload/header/readback alignment without
starting production, without touching Owner data, and without replacing the
remaining required live backend/SSE, upload, voice, focus, native-shell, and
Owner acceptance evidence. `tests/vite-chat-composer-controller.test.js`
guards the controller as browser-global-free and verifies success, blocked
send, rollback, interrupt, and deduplicated readback merge behavior.

The chat runtime now also has a development-only thread readback controller:
`src/vite-islands/chat-runtime/thread-readback-controller.mjs`. It builds the
classic `GET /api/threads/:threadId` readback request through injected
`HomeAiRuntimeFacade.api`, consumes terminal-event `refreshRequests`, replaces
the chat runtime thread with bounded readback state, clears the refresh queue
after success, and records bounded diagnostics on failure. The source dev
route exposes a `回读线程` control; the built static preview keeps real
readback disabled by the same source-route guard used for dev-mock send/stop.
`adapters/vite-dev-preview-api-mock-service.js` serves a metadata-only
readback payload for `thread_vite_chat_runtime_preview`, while the local
backend proxy can forward the same thread-read route to an isolated local
Home AI backend. `tests/vite-chat-thread-readback-controller.test.js` guards
the controller boundary and readback state merge.

For local development only, Vite can now proxy bounded chat runtime parity
routes to a real local Home AI dev server. The proxy is off by default and
requires both `HOMEAI_VITE_DEV_BACKEND_PROXY=1` and
`HOMEAI_VITE_DEV_BACKEND_BASE=http://127.0.0.1:<port>`. It is implemented in
`adapters/vite-dev-backend-proxy-service.js` and wired in `vite.config.js`
before the dev mocks. Eligible routes are `/api/events`, thread read,
Composer send/interrupt, upload, and server-file attachment. If proxy mode is
requested without a valid backend base URL, those routes return bounded `502`
JSON instead of silently using mock evidence. The proxy is development-only,
must not be wired into `server.js`, and is not production cutover evidence.
Focused coverage lives in `tests/vite-dev-backend-proxy-service.test.js`,
`tests/vite-dev-backend-proxy-integration.test.js`, and
`tests/vite-dev-real-backend-parity-smoke.test.js`. The real-backend smoke
uses a temporary data dir, a temporary Gateway Pool manifest, and a local fake
Gateway worker. It verifies real SSE snapshot delivery through Vite, no-Gateway
group-chat `plain` message persistence, AI Composer send through the real
Gateway runner path, and interrupt through the real active-stream stop path.
The fake Gateway fixture implements only bounded local `/health`,
`/health/detailed`, `/v1/capabilities`, `/v1/responses`, and `/v1/runs/:id/stop`
protocol behavior. It must not be treated as production Gateway, provider, or
model-quality evidence.

The chat runtime island now also owns a development-only attachment/upload
state boundary in `src/vite-islands/chat-runtime/attachment-model.mjs` and
`src/vite-islands/chat-runtime/attachment-upload-client.mjs`. The model
normalizes pending artifacts, server-file attachment metadata, native share
intake, upload request shape, bounded Composer artifact payloads, basename-only
display labels, and remove/clear transforms without browser globals or direct
network/file IO. The upload client accepts an injected
`HomeAiRuntimeFacade.api` client and an injected file reader, then builds the
classic `/api/threads/:threadId/uploads` request without owning `FileReader`,
DOM state, auth headers, storage, or transport. `/vite-chat-runtime-preview/`
renders an `附件 ESM` strip with metadata-only fixture controls for system file
upload, server-file attachment, and native share, plus a development-only file
picker that reads a local fixture in the preview glue layer and sends it to the
Vite dev mock. Attachment-only Composer sends are valid in the model and can
be sent to the Vite dev mock on the source dev route; successful dev-mock send
consumes pending artifacts. Production attachments remain owned by
`public/app-composer-attachments-ui.js` and `public/app-upload-sidebar-ui.js`
until a later slice adds production upload route cutover, server-file attach,
native share bridge, and Owner acceptance evidence under the Vite shell.

`tests/vite-chat-attachment-upload-backend-contract.test.js` now exercises the
Vite upload client against the real
`server-routes/thread-read-upload-api-routes.js` upload route through an
injected runtime API, in-memory disposable thread, and injected route
dependencies. It proves bounded source-level parity for request shape,
basename sanitization, artifact registration/readback, backend rejection
propagation, and no raw base64 echo in artifact payloads. It remains
development/source contract evidence only and does not replace the classic
attachment UI, use Owner files, or authorize production Vite cutover.

The server-file attachment path now has a parallel Vite ESM client at
`src/vite-islands/chat-runtime/attachment-server-file-client.mjs`. It keeps
server-file attachment behind injected `HomeAiRuntimeFacade.api`, never reads
or re-uploads bytes, never constructs `dataBase64`, and normalizes artifacts as
`server_file`. The classic production UI exposes this server-file selection only
to Owner sessions, and the backend route rejects non-Owner callers before file
path resolution; ordinary workspace users should use system file upload until a
workspace-isolated server-share root is productized. The Vite dev mock handles
`/api/threads/:threadId/server-file-attachments` for
`thread_vite_chat_runtime_preview` only, returning bounded artifact metadata
without source path echo. `tests/vite-chat-server-file-attachment-client.test.js`
and `tests/vite-chat-server-file-attachment-backend-contract.test.js` cover the
pure client and real route contract. Production remains classic until live
native iOS shell smoke, authenticated backend parity, cutover planning, and
Owner acceptance evidence are completed under the Vite shell.

The native-share bridge now has a development-only Vite ESM intake client at
`src/vite-islands/chat-runtime/attachment-native-share-client.mjs`. The runtime
facade owns `HomeAINativeShare` callback registration through
`registerNativeShareCallbacks()` and consumes `__homeAIPendingNativeShare` with
bounded count-only events. The chat runtime preview installs the receiver,
accepts `HomeAINativeShare.receive({ files })`, dedupes workspace/path pairs,
and converts attached rows to `native_share` artifacts. The client does not
read browser globals, storage, transport, `FileReader`, or Owner files; it only
uses injected `runtime.native`, state readers/writers, and the shared
attachment model. This is local development evidence and does not authorize a
production shell or Service Worker cutover.

The current Phase 5 focus lifecycle guard slice lives at
`src/vite-app/runtime/focus-lifecycle-guard.mjs`. It is injected and
browser-global free, and it mirrors the classic stale-editable policy from
`public/app-composer-draft-ui.js`: stale hidden, detached, disabled, inert,
zero-rect, or invisible active editables blur on lifecycle checks; ordinary
PWA non-editable touches preserve a visible Composer focus; explicit iOS
native-shell non-editable touches outside the active editable force a blur.
`/vite-chat-runtime-preview/` installs this guard and shows a `Focus guard`
status row plus a `清理焦点` manual cleanup button. This is local Vite
development evidence only. Production still uses the classic Web guard and
must keep native iOS defensive keyboard-focus protection until a future
full-shell cutover is separately approved.

Phase 2 global usage is now guarded by
`scripts/vite-global-usage-audit.js` and
`tests/vite-global-usage-audit.test.js`. Any classic module added to the Vite
runtime-facade migration target set must either remove direct unmanaged
`window.*` / `globalThis.*` / storage / fetch usage or register a narrow
allowlist entry with an owner, reason, and removal trigger. The current audited
classic modules are `public/app-runtime-facade-ui.js`,
`public/app-owner-system-console-ui.js`, and
`public/app-ai-ops-diagnostics-ui.js`. The Owner Console view-mode write has
already moved behind the runtime facade route/state bridge; new classic
consumers must follow the same pattern instead of adding direct storage or
transport ownership. `public/app-voice-input-ui.js`,
`public/app-task-preview-helpers-ui.js`, `public/app-task-preview-ui.js`, and
`public/directory-viewer.html` are also in the audited target set for the
runtime-facade migration slices.

The development readiness gate is
`scripts/vite-development-readiness-check.js`; run it as
`npm run check:vite-readiness` after `npm run build:vite`, then run
`node tests/vite-dev-preview-routes-smoke.test.js` for a mobile Playwright
smoke of all Vite preview routes. This is a development-environment objective
only and does not authorize changing production `/` away from the classic shell.
The gate verifies required Vite preview routes, source modules, focused tests,
documentation boundaries, built preview artifacts, and the rule that
`public/index.html` and
`public/service-worker.js` must not reference `/vite-preview/`,
`/vite-islands/`, or `/vite-*-preview/` routes before a separate Owner-approved
production cutover target exists.
`npm run verify:vite-dev` is the maintained source-only development acceptance
report. It runs the Vite build, global audit, mobile Playwright preview-route
smoke, real local backend parity smoke, readiness gate, Owner review report,
blocked cutover preflight, blocked handoff packet, repository static check,
readback validator contract, local full test gate, and diff hygiene check. The
local full test gate still skips install/deploy lane tests. It clears the
cutover approval environment for the run and must report
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`. A passing report also includes
`ownerApprovalRequest.status=ready_to_request_owner_approval` with the exact
Owner approval text for the next boundary, while still creating no production
source change, deployment, or Worker card.
The Owner review package for that later boundary is
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`; it is not a
deployment receipt or approval record.
`npm run review:vite-cutover` is the maintained source-only Owner review
report. It composes readiness and cutover preflight evidence, records
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`, and must not be treated as a deploy-lane
request.
The source-only cutover preflight is `npm run plan:vite-cutover`. It must
report `productionWrites=false` and `deployExecuted=false`; without the exact
Owner approval text from the review package it must fail closed with
`owner_approval_required`.
`npm run packet:vite-cutover` is the maintained source-only handoff packet for
the post-approval boundary. It creates no task card, performs no production
writes, and with exact Owner approval still outputs only a non-sendable
deploy-lane draft until the separate fail-closed cutover source change exists
and passes validation.
The draft targets the Home AI deploy lane pool and must not be converted into a
real card until the source-change validator passes with a bounded contract JSON.
`npm run request:vite-cutover-approval` is the maintained source-only Owner
approval request package. It runs/collects the development acceptance evidence,
confirms Owner review readiness and the blocked handoff-packet boundary, and
emits the exact approval text without creating a production source change,
Worker card, or deployment.
`npm run audit:vite-goal` is the maintained source-only goal-state audit. It
requires bounded development acceptance, cutover source-change, and production
readback evidence before it can report `goal_complete_verified`; default mode
must report `goal_incomplete` before Owner approval and production readback.
`npm run validate:vite-cutover-source` is the maintained source-only validator
for the future production cutover source-change contract. Default current-repo
mode remains blocked until the separate cutover source change exists. After
exact Owner approval, it must pass with `--contract-json <file> --require-ok`
before a deploy-lane card is sent.
`npm run validate:vite-cutover-readback` is the maintained source-only
post-deploy readback validator. It accepts a bounded deploy-lane JSON payload
through `--readback-json`, verifies every required Vite cutover readback id,
requires privacy confirmation, and performs no production connection or
deployment.

## Version Rule

Any client-visible static change must bump the static version consistently in:

- `public/index.html`
- `public/service-worker.js`
- `public/directory-viewer.html`
- `tests/task-list-ui.test.js`

After deployment, verify:

- `/api/status?detail=1`
- unauthenticated `/api/client-version?clientVersion=<new-version>`

If a cache-sensitive static file was missed during a production sync and is
then copied under the same `?v=<client-version>` URL, bump the client version
again before considering the hotfix deployed. Installed PWA clients can keep
the old JavaScript under the old query string and will not see a refresh prompt
when the server version has not changed.

PWA install metadata changes, including the installed app name, short name, or
manifest display fields, must publish a new fingerprinted manifest file and
update `public/index.html`, `public/service-worker.js`, and
`tests/task-list-ui.test.js` to reference it. Do not rely on mutating an older
dated manifest file in place, because browser install flows can keep a cached
manifest for the old URL.

## Deployment

Static-only changes:

- backup changed production files
- sync changed static/test files
- run focused production checks
- do not restart listener or Gateway Pool

Server/route changes:

- listener restart is required

## Static Resource Performance

The listener serves `index.html` and `service-worker.js` with `no-cache` so the
PWA can discover new client versions and Service Worker updates. Versioned
static assets referenced with `?v=<client-version>`, and fingerprinted static
files such as dated manifests/icons, should be cacheable with a long immutable
cache lifetime because a version bump changes the URL.

Text static assets such as JavaScript, CSS, HTML, JSON, SVG, and web manifests
should be returned compressed when the browser advertises `br` or `gzip`.
Mobile/PWA load checks should inspect:

- HTML response time.
- Number of JS/CSS assets in the first page.
- `Cache-Control` for versioned JS/CSS.
- `Content-Encoding` for large JS/CSS.
- Service Worker update behavior after a client version bump.

When diagnosing account-specific startup slowness, the client records a bounded
startup performance summary in `localStorage.hermesStartupPerfLast` and logs
`[Hermes startup]` entries to the browser console. The log contains stage
names, durations, selected workspace/view ids, message counts, and page totals
only; it must not include message bodies, access keys, cookies, push endpoints,
or plugin tokens.

Gateway plugin/schema/profile changes:

- Gateway Pool restart is required

## Composer Send Guard

The primary `sendMessage()` path must hold a generic
`state.composerSendInFlight` lock from just before request-body construction
until the request finishes. Button disabling remains only a UI affordance: it
does not protect against near-simultaneous native shell, voice, keyboard, or
iframe-triggered activations that enter the function before DOM state updates
settle. Surface-specific guards such as `directoryTopicDraftSendInFlight` may
add stricter behavior, but they do not replace the generic composer lock.
Successful sends must also re-clear the composer after result handling when the
current text is empty or still matches the sent text. This protects iOS/PWA and
embedded-plugin sessions from late input/composition events that can restore the
old value after the initial clear, while preserving a different draft the user
typed during the in-flight request.

## Composer Runtime Modules

Composer and conversation event-stream behavior remains part of the ordered
static shell, but deterministic policy must stay in focused modules instead of
returning to large catch-all entrypoints.

The event/receipt protocol is defined in
`docs/IMPLEMENTATION_NOTES/composer-event-contract.md`. Changes to Composer
events, terminal receipts, current-thread refresh, scroll protection, or
Composer self-checks must update that contract and run
`node tests/composer-event-contract.test.js`.

Current ordered Composer-adjacent modules:

- `public/app-chat-composer-ui.js`: composer shell/action button and shared
  view helpers.
- `public/app-chat-scope-ui.js`: group-chat/chat-scope membership, read-state,
  and unread helpers.
- `public/app-composer-source-ui.js`: local/search source mode selection.
- `public/app-composer-model-ui.js`: model/AI mention parsing and selected
  model/provider derivation.
- `public/app-composer-editor-ui.js`: text extraction, caret management,
  composition fallback, paste handling, autosize, and key handling.
- `public/app-composer-draft-ui.js`: composer focus suppression, foreground /
  background draft handling, pending-thread foreground refresh, focus replay,
  and draft-existence checks.
- `public/app-mobile-layout-ui.js`: mobile viewport, keyboard, bottom-nav,
  plugin-context viewport reservation, and client layout diagnostics. This is
  intentionally outside the Composer namespace because other host/plugin
  surfaces depend on the same viewport behavior.
- `public/app-composer-context-ui.js`: compact composer context-chip rendering
  only.
- `public/app-composer-refresh-scheduler.js`: pure current-thread refresh
  scheduling policy.
- `public/app-composer-current-thread-refresh-ui.js`: route snapshotting,
  current-thread refresh API orchestration, and topic-root refresh scheduling.
- `public/app-composer-render-scheduler-ui.js`: current-thread render
  coalescing.
- `public/app-composer-streaming-message-ui.js`: bounded streaming assistant
  content updates.
- `public/app-composer-viewport-ui.js`: Composer-specific bottom-follow
  decisions, terminal receipt stick-to-bottom policy, and send-time bottom lock.
  It must honor the five-second user-scroll protection window.
- `public/app-composer-self-check-ui.js`: metadata-only Composer runtime
  self-check reporting for terminal receipt gaps, stale active-run state,
  duplicate local/server user echoes, and protected-scroll bypass. It submits
  only `home-ai-self-check` / `self_check_signal_failed` diagnostics so the AI
  Ops self-check remediation gate can auto-dispatch repair cards; it must not
  include message bodies, prompts, attachment contents, raw URLs, cookies, or
  access keys.
- `public/app-composer-message-invalidation-ui.js`: deterministic message
  projection invalidation. Active assistant messages patch the visible
  streaming receipt in place; terminal assistant messages also queue an
  immediate current-thread receipt refresh so Usage/Skill/action footer state is
  not stranded until route re-entry. The refresh must respect the five-second
  user-scroll protection window, must not force the conversation back to the
  bottom after an intentional scroll, and schedules the bounded Composer
  self-check after terminal assistant messages.
- `public/app-composer-event-state-ui.js`: event-driven thread summary,
  current-thread message, and chat-scope cache upsert helpers.
- `public/app-events-composer-ui.js`: event fanout only.
- `public/app-event-stream-ui.js`: EventSource connection glue only.
- `public/app-composer-send-ui.js`: send-result routing, Owner elevation policy,
  and group mention menu helpers.
- `public/app-composer-native-environment-ui.js`: native iOS environment
  snapshot bridge, bounded refresh, and send-time environment context lookup.
- `public/app-composer-pending-send-ui.js`: local optimistic user/assistant
  pending message projection and rollback.
- `public/app-composer-send-pipeline-ui.js`: one-message send orchestration:
  preflight, request body assembly, duplicate-send lock, native context attach,
  API POST, result handling, elevated retry, and final cleanup.
- `public/app-composer-attachments-ui.js`: system file upload to pending
  artifacts. Server-file attachment references remain in the upload/sidebar
  module and must not re-upload bytes.
- `public/app-share-image-ui.js`: reply and Growth-card image rendering plus
  share delivery. In Android/iOS native shells, generated PNG shares should
  prefer `HomeAINativeShareCapability.outboundShare` /
  `HomeAINativeShare.share()` before Web Share, clipboard, or download
  fallback. The native request may include only bounded share metadata and the
  generated image bytes; it must not include access keys, cookies, launch
  tokens, raw local paths, provider payloads, or message/thread logs.

`tests/composer-module-boundary.test.js` locks these boundaries. Future
Composer work should extend the focused module that owns the behavior, or add a
new small ordered `public/app-composer-*.js` module with a matching boundary
test. Do not put mobile viewport/layout logic back into Composer context, do
not put streaming/render/refresh policy back into the event fanout module, and
do not put send, upload, native environment, optimistic pending-message, or
self-check diagnostic policy back into `public/app-event-stream-ui.js`.

## Constraints

- Mobile UI must preserve the OS status bar, safe areas, bottom navigation, stable action icons, and readable compact panels.
- The Home AI host shell is mobile-first at every viewport width. Wide
  screens, tablets in landscape, desktop browser windows, and native-shell
  WebViews must keep the same single-column content area and bottom navigation
  used in portrait. They must not switch to a permanent left navigation sidebar
  or a split primary layout. The sidebar remains an on-demand overlay surface.
- Mobile bottom navigation must keep a fixed visual container height. Do not
  add `env(safe-area-inset-bottom)` to `--mobile-bottom-nav-height` or
  `--plugin-context-bottom-nav-height`. iOS reports safe-area values per
  browser/PWA/origin context, so two deployments on the same physical phone can
  expose different values. Native tab bars remain stable because the bar height
  is fixed and the safe area is handled as background or internal spacing, not
  as a layout-height multiplier.
- Primary navigation transitions must not publish an intermediate bottom-nav
  state that hides pinned plugin tabs. `updateNavigationControls()` should keep
  `pinnedPluginBottomTabIds()` visible while recomputing hidden tabs, and
  plugin availability refreshers must treat pinned bottom buttons as retained
  chrome, not only plugin-context buttons. Chat navigation also pre-applies the
  Composer shell before the deferred `loadSelectedView()` pass so the input
  frame does not disappear during the first transition frame. That Composer
  pre-shell must configure the attach button, editor, action button, labels, and
  disabled/locked state before revealing the Composer element, so the plus
  button and input frame appear as one unit rather than in separate visible
  refresh steps. If a same-workspace single-window chat thread is already
  available in the data-level chat cache, the chat navigation shell should
  render that cached thread in the same frame before scheduling the network
  refresh. This keeps old topic-list content from being displayed inside the
  chat chrome while still avoiding `#conversation` DOM parking/restoration.
  If that cache is unavailable, the navigation shell must still replace the
  previous surface with a compact Chat pending shell in the same frame; showing
  the Composer while leaving old topic cards above it is not allowed. The Chat
  pending shell must have a bounded recovery watchdog: if a cold-start or stale
  `/api/single-window` response leaves `正在载入聊天...` visible without rendered
  messages, the client should retry the single-window load after the original
  request is no longer in flight instead of requiring a tab switch. API request
  timeouts must not rely only on `AbortController`; the client-side API wrapper
  must also reject from a Promise-level timeout so Android WebView cannot keep a
  hung fetch marked as in-flight forever.
  The watchdog should replay the current chat-scope cache before performing a
  network retry, and `/api/single-window` failures must replace the pending
  shell with a bounded failure/retry state when no cached chat can be rendered.
  Non-chat task/topic render paths must clear Chat-only render signatures so a
  task detail with message nodes cannot be mistaken for an already rendered
  Chat surface.
  When the follow-up `/api/single-window` response has the same visible chat
  render signature as the cached shell, the client should update lightweight
  chrome only and skip replacing `#conversation.innerHTML`; raw `updatedAt`
  drift alone is not enough to repaint the whole message list. Chat messages
  that contain rendered images rely on this rule: no-op chat refreshes must
  preserve existing `<img>` nodes so protected or proxied image hydration does
  not recreate visible image surfaces and trigger full-page flashing.
- Plugin topic chat entry must render eligible cached topic messages without
  waiting for the background `/api/single-window` refresh. The
  `正在打开话题...` shell must not depend on an exact primary navigation sequence
  after the route has already settled; route currentness is the visible
  `viewMode`, plugin topic group id, and plugin context plugin id. Topic open
  buttons should also stop click propagation so parent topic cards or cleanup
  handlers cannot cancel the cached render path. If the shell remains visible
  without rendered messages, a bounded fallback render should replay the cached
  topic thread instead of requiring an app kill or another tab switch.
- Returning from any bottom plugin or capability entry to the Topics root must
  go through the primary navigation topic-root helper. That path must hide
  active embedded/plugin host layers, clear temporary plugin context state, and
  render the cached topic root shell before the deferred selected-view refresh.
  Direct `loadSelectedView()` calls from bottom plugin/capability handlers are
  not allowed because stale plugin host classes can keep covering the topic
  list.
- Bottom plugin tab transitions must render the plugin navigation shell in the
  same frame as the view-mode change. The shell should clear `#conversation`
  and show the plugin host/loading surface before `loadSelectedView()` performs
  manifest or iframe work; old topic cards must not remain visible while a
  plugin page such as Finance is loading. This first-frame clearing rule only
  applies when entering a plugin from a non-plugin surface. Plugin-to-plugin
  switches must not run that clearing shell; otherwise the old plugin host and
  target plugin render create a visible double transition.
- Main `#conversation` DOM node parking/restoration is disabled. The attempted
  Chat/Topics root DOM cache could restore stale DOM into another primary tab
  after rapid navigation. Primary navigation may keep stable outer chrome, but
  each primary surface must render its own conversation content through the
  normal selected-view path until a dedicated lifecycle model and visual harness
  cover rapid multi-tab switching.
- If the mobile bottom navigation is visually lowered with
  `--mobile-bottom-nav-visual-drop`, any Dock or fixed surface above it must use
  the runtime measured visible top offset, not the full bottom-nav height. This
  keeps the global plugin Dock adjacent to the visible nav after the nav is
  dropped below the viewport edge.
- On top-level plugin App pages where the primary Home AI bottom navigation is
  hidden, the global plugin Dock must use the host comfort inset as its runtime
  bottom anchor. It must not fall back to the normal bottom-nav height, because
  that places the collapsed handle too high on plugin pages.
- The global plugin Dock may overlap the bottom nav by the controlled
  `--topic-plugin-dock-nav-overlap: 1px` bridge and should keep its bottom
  padding at `0` so translucent page background cannot show through between
  the plugin buttons and the tab bar.
- Bottom safe-area may only contribute a small internal content buffer through
  `--mobile-bottom-nav-content-safe-area`. Topic docks, plugin context bars,
  composer offsets, and runtime bottom-nav measurements must be based on the
  fixed bar height plus measured bounds, not a raw safe-area-expanded CSS
  height. Font-size preferences must not increase the bottom nav container
  height beyond `--mobile-bottom-nav-height`.
- The visual vertical position of the primary mobile bottom nav is owned by
  `updateMobileBottomNavReservation()`, not only by CSS. If the nav needs to
  move up or down, update the runtime `comfortInset`, the matching
  `--mobile-bottom-nav-comfort-inset` fallback, and `task-list-ui.test.js`
  together. Changing only `.bottom-nav` CSS can be masked by runtime
  `--mobile-bottom-nav-bottom-runtime` after the first layout measurement.
  The bottom navigation container uses one shared host comfort inset
  (`--mobile-bottom-nav-comfort-inset: 18px` as of
  `20260609-dock-back-swipe-stability-v661`) so newly installed iOS PWAs are not
  visually flush with the viewport edge. Tab content should not be lifted by
  default (`--mobile-bottom-nav-visual-lift: 0px` as of
  `20260609-bottom-surface-visible-v652`); any future small visual lift must
  stay inside the tab content transform, not in a bottom offset that moves the
  entire Dock/nav stack. Runtime bottom overflow is diagnostic-only by default:
  `--mobile-bottom-nav-overflow-clamp: 0px` prevents iOS standalone PWA
  viewport-coordinate mismatches from becoming a large bottom offset that lifts
  the full Dock/nav stack.
  Runtime bottom underflow is separate from overflow: if a fixed bottom nav
  reports `rect.bottom` above the layout viewport on an iOS standalone PWA
  cold/re-login path, `updateMobileBottomNavReservation()` may apply the bounded
  `--mobile-bottom-nav-underflow-clamp` correction. The normal host comfort
  inset is not underflow: diagnostics record `navBottomGapRaw`, and
  `navBottomUnderflowRaw` is only `max(0, navBottomGapRaw - comfortInset)`.
  This prevents the runtime from alternating between the intended host inset
  and 0px on repeated layout measurements.
  Standalone/fullscreen PWA surface underflow is diagnostic-only for host
  chrome as of `20260609-bottom-surface-visible-v652`: if the measured `100lvh`
  surface is taller than the layout viewport and the safe-area probe exposes a
  positive top inset, `updateMobileBottomNavReservation()` records the measured
  `100lvh - rect.bottom` delta as `surfaceUnderflowRaw` /
  `surfaceUnderflowCandidate`. It must not apply that delta as a negative
  bottom offset for the primary fixed nav, because iOS can clip or hide tab
  content once the fixed bar is placed outside the layout viewport. Global Dock
  and composer offsets must stay derived from the visible fixed nav position.
  Underflow correction may only run against a laid-out nav rect with positive
  width, height, and bottom coordinate; collapsed early-start rects such as
  `0/0/0` must leave the runtime bottom offset at the comfort inset instead of
  writing a negative correction.
  Chat composer context rows must bridge into the input row with the same
  opaque `var(--ui-chrome)` background as the composer. A transparent gap
  between context chips and the input row is a failing mobile bottom-region
  state because page content can show through during PWA viewport settles.
  When measuring fixed bottom chrome, compare `getBoundingClientRect()` against
  the layout viewport (`window.innerHeight` / `documentElement.clientHeight`),
  not `visualViewport.height`. iOS standalone PWA can report a shorter visual
  viewport because of safe-area/status chrome; using it as the primary bottom
  boundary can falsely detect bottom overflow and push the whole bottom stack
  upward by far more than the intended visual lift.
- All viewport widths use the same mobile shell as phone portrait:
  a single-column app, bottom navigation, and an overlay sidebar. Do not let
  iPad-like landscape, wide tablet, or desktop-sized browser layouts fall back
  to a fixed left sidebar or hide the primary bottom navigation.
- The mobile shell rule does not mean all embedded previews should be forced
  into phone projection. PDF, Word/DOC/DOCX, and PowerPoint/PPT/PPTX preview
  links must use the native document bridge first when the iOS or Android shell
  advertises it, and the `pdf-viewer.html` / `file-viewer.html` documents must
  retry that same bridge on load after `nativeShell=ios` or
  `nativeShell=android` is propagated into the viewer URL. Web/PDF.js/Markdown
  structure preview is the fallback only when the native bridge is absent,
  delayed past the bounded wait, or returns a bounded failure.
- DOCX mobile/adapted preview is a lightweight Markdown structure preview, not
  a full Word layout renderer. It must render on an Office-style light document
  canvas when the native bridge is unavailable, preserve extracted whitespace
  such as DOCX tab stops, and convert basic DOCX tables into Markdown tables so
  the existing mobile table/card renderer can preserve row/column
  relationships. In Android/iOS shells, native Word preview is the preferred
  layout path.
- Top-level PWA shell changes must keep time, battery, and Wi-Fi indicators
  visible on mobile; browser-shell guards and full-viewport overlays need
  explicit status-bar/safe-area checks. The installed iOS PWA shell should use
  opaque status-bar modes (`default` for light/system-light, `black` for dark),
  not `black-translucent`: in dark standalone PWA runs, WebKit can report
  `100vh`/`100lvh` as the full physical screen while `100dvh`, `innerHeight`,
  fixed bottom chrome, and the document root are shortened by the top safe-area
  inset. Using a translucent status bar makes the bottom nav appear lifted and
  can push plugin iframe tops under the status area. The app already paints
  status-bar background through safe-area CSS when the inset is exposed, so it
  does not need transparent status-bar content.
- The initial inline boot splash is part of the mobile shell contract. On iOS
  installed PWA cold start, `100dvh` can be reported before WebKit settles the
  standalone viewport, so the mobile boot splash must start below the safe area
  instead of relying only on centered `100dvh` placement. This protects the
  first frame before app modules can run viewport-settle JavaScript.
- Embedded plugin host pages hide the normal Home AI topbar, so the iframe host
  `.main` must use the mobile status-bar safe-area top inset instead of raw
  `top: 0`. The iframe bottom reservation must be derived from the visible Home
  AI bottom stack, not a fixed plugin-context footer height. Embedded hosts such
  as Codex, Note, and Wardrobe should reserve the top safe-area through `.main`
  padding rather than a device-specific bottom offset. If a temporary
  chrome-free preview hides Home AI bottom chrome, the host publishes the shared
  bottom comfort inset through
  `hermes.plugin.viewport.footer.safeAreaBottom` so the plugin iframe can pad
  its own composer without a visible host footer.
- `POST /api/client-layout-diagnostics` is the bounded real-device layout
  diagnostic channel for temporary PWA debugging. It stores sanitized viewport,
  CSS variable, and element-rect snapshots in
  `<data>/diagnostics/client-layout.jsonl`; `GET /api/client-layout-diagnostics`
  requires a valid Home AI key and returns recent sanitized entries. Do not log
  access keys, cookies, message text, thread content, or raw plugin content.
  Production clients keep this channel sparse by default: at most eight layout
  diagnostic sends per page session, no more than once every 30 seconds, unless
  `layoutDebug=1`, `clientLayoutDiagnostics=1`,
  `localStorage.hermesLayoutDebug=1`, or
  `localStorage.hermesClientLayoutDiagnostics=1` explicitly enables verbose
  diagnostics for a debug session. The server truncates the JSONL file when it
  exceeds the configured bounded size so temporary layout debugging cannot
  become an unbounded runtime log.
  The diagnostic payload may include non-secret PWA chrome state such as the
  current `apple-mobile-web-app-status-bar-style`, theme mode, root/app class
  lists, numeric safe-area probe values, and measured `100vh` / `100dvh` /
  `100lvh` / `100svh` heights so real iOS viewport behavior can be debugged
  without hard-coding a device-specific correction.
- The settings sheet owns device-local display preferences. Theme mode is a
  three-state client preference: `system`, `light`, or `dark`. The shell must
  set `data-theme` before loading CSS to avoid first-paint flashes, update
  `theme-color` / `apple-mobile-web-app-status-bar-style`, and listen for system
  color-scheme changes only while the selected mode is `system`.
- Embedded-plugin launches must pass the current device-local theme and font
  size as sanitized appearance metadata. Hermes `standard` maps to plugin
  `default`; the plugin iframe should not be initialized until the launch entry
  carries the matching `pluginTheme` and `pluginFontSize` query values.
- Embedded-plugin launch manifest caches must include the sanitized appearance
  key, not only the workspace id. If a user changes theme or font size, the next
  plugin entry must request a fresh launch token instead of reusing an older
  `system/default` manifest.
- Static hotfixes that touch cache-sensitive client assets, including
  `public/app-*.js`, `public/styles.css`, `public/index.html`,
  `public/service-worker.js`, or viewer HTML files, must bump the
  client/cache version in the same change before deployment. Deploying changed
  JavaScript under an unchanged `?v=<client-version>` URL can leave installed
  PWA/service-worker clients on the old script even when the production file has
  been copied.
- When the app detects a server/client version mismatch during startup, status
  refresh, foreground, focus, push, or timer checks, it must show the refresh
  notice and must not automatically reset or reload the client. The user-visible
  refresh action navigates to the current app URL with `resetClient=1` and
  `targetVersion=<server-version>`; the inline app-shell reset clears bounded
  static caches, unregisters Service Workers for explicit hard refresh,
  preserves the stored Access Key/theme/font preferences plus the
  `hermesPluginTopicUsage`, `hermesPluginTopicOrder`, and
  `hermesPinnedPluginBottomTabs` local caches, including their
  workspace-suffixed variants, and
  returns to the app with a cache-busting query. Manual update recovery must not navigate to
  `/client-reset.html`, because mobile PWA clients can open that page in a
  browser wrapper.
- The Service Worker must treat app-shell requests (`/`, `/index.html`, and
  `/hermes-mobile/`) as network-first with `cache: "no-store"`. Killing and
  reopening the PWA after a version bump must not replay an old cached app shell
  before checking the network.
- The boot splash must not leave a user on an endless animated progress bar. If
  startup has not completed after the short watchdog window, the shell may run
  one session-scoped soft reload for the current client version; if startup
  still has not completed, retry/reset controls must become visible. The
  non-hard reset path may clear bounded static caches but must preserve the
  stored Access Key, theme, font preferences, and plugin-topic preference
  caches. Service Worker unregister is reserved for explicit hard reset and
  must also be bounded by a timeout.
- The app shell stores a bounded `hermesWebRouteSnapshot` with route ids and
  scroll position on background, foreground, internal route opens, and throttled
  conversation scroll. If iOS/PWA or the browser process reloads the app without
  an explicit URL route, startup should restore that snapshot before falling
  back to the default launch view. Explicit notification/deep-link URL
  parameters must continue to take precedence over the stored snapshot.
- On Windows, do not rewrite static/test files containing Chinese text through
  PowerShell `Get-Content -Raw` plus `Set-Content` / `WriteAllText` unless the
  command explicitly preserves UTF-8 from a known UTF-8 source. Prefer
  `apply_patch` for targeted edits or a Node-based byte/UTF-8 script for
  mechanical version replacement. This prevents mojibake in UI strings and test
  regexes.
- Theme changes must be verified against real app surfaces, not only root token
  strings. At minimum, check sidebar/top bar, composer, user and assistant
  messages, topic cards, Action Inbox rows and deliverable tags, Growth warning
  or danger cards, and the settings/access-key sheet in light, dark, and system
  mode. A dark-mode fix is incomplete if any of those surfaces still uses a
  hard-coded pale background with low-contrast foreground text.
- Visual smoke checks should capture both screenshots and bounding rectangles
  for the changed fixed/sticky surfaces. `scripts/playwright-visual-smoke.js`
  records viewport metrics, key shell rectangles, horizontal overflow, bottom
  navigation bounds, and composer/bottom-nav overlap. Browser-mode visual smoke
  is useful for mechanical layout evidence, but installed-PWA behavior still
  requires the PWA/device harness when the issue is PWA-specific.
- Authenticated visual smoke should pass the Access Key by file path only:
  `--access-key-path <path>` or `HERMES_VISUAL_SMOKE_ACCESS_KEY_PATH`. The
  harness injects `localStorage.hermesWebKey` and the `hermes_web_key` cookie
  before app startup, may set `--workspace-id` and `--view`, and reports only
  bounded auth/layout state. It must not print the key or raw local key file
  contents.
- The same harness records navigation timing, Chromium long-task entries, and
  the bounded `localStorage.hermesStartupPerfLast` summary when present. Long
  tasks above `--long-task-warn-ms` default to warnings; set
  `HERMES_VISUAL_SMOKE_FAIL_ON_LONG_TASK=1` only for a calibrated performance
  gate after measuring normal local production variance.
- Authenticated cross-surface mobile navigation must use
  `scripts/authenticated-navigation-flow-smoke.js` when the change can affect
  Chat, Inbox, Topics, plugin/topic entry, return behavior, cached surface
  reuse, bottom navigation, composer layout, tab-switch timing, horizontal
  overflow, or long-task behavior. The harness covers Chat -> Inbox -> Topics
  -> plugin/topic entry -> return, records active nav, visible surfaces,
  bottom-nav bounds, composer bounds, composer/nav overlap, viewport metrics,
  horizontal overflow, layout stability, long-task summary, navigation timing,
  tab-switch timing, and stale cached surface warnings. It accepts Access Keys
  only through `--access-key-path` or `HERMES_NAV_FLOW_ACCESS_KEY_PATH` and must
  not print the key or raw key path.
- The Topics root must render directory-bound topic collections in the first
  task-list paint when `directoryTopicCollectionsForGroups()` is available.
  Deferring the directory launcher insertion to a later animation frame causes
  visible lower-page movement on accounts with many directory-bound topics; the
  deferred render path is only a compatibility fallback for missing helpers.
- Mobile left-edge swipe guards must not own touches inside the bottom
  navigation strip. The bottom-left Chat tab is an app-level target and edge
  taps in that strip should reach the button rather than being consumed by the
  back/sidebar swipe recognizer.
- Primary navigation into the Topics root should render an eligible cached
  task-list thread inside `applyPrimaryNavigationViewShell()` before the
  deferred selected-view load. When the navigation explicitly skips task-list
  refresh, the deferred load should not re-render the same cached task list on
  the next frame. This keeps Chat -> Topics transitions from showing a stale
  Chat frame or a repeated lower-page replacement.
- The Topics root must preserve user scroll during background/SSE/API refreshes.
  While the user scrolls the task-list root, keep `state.taskListScrollTop`
  current. If a scheduled topic-root refresh or `/api/threads` refresh leaves
  the visible `taskListRootRenderSignature()` unchanged, skip
  `renderCurrentThread()` and only refresh viewport affordances; repeated
  no-op events must not reset the directory-topic list to the top.
- Directory-bound topic groups default to expanding only the most recently
  updated directory; older directories remain collapsed unless the user
  explicitly expands them.
- For mobile and tablet layout work, run at least the default phone portrait
  viewport and one explicit wider viewport with `--viewport <width>x<height>`.
  Use `--mobile` or `--desktop` only when the target shell mode needs to be
  forced; otherwise the harness keeps the mobile/touch browser context by
  default so tablet PWA-style checks do not accidentally become desktop checks.
- Dark mode should follow the mobile control-panel reference: near-black page
  background, slightly lifted charcoal cards, low-noise hairlines, high-contrast
  off-white text, and brighter low-saturation status colors. Hard-coded dark
  green text is not acceptable on dark surfaces; use the theme variables for
  headings, receipt labels, file tags, status chips, and run/tool panels.
- Floating menus, context menus, inline details popovers, and action panels must
  use theme tokens such as `--ui-menu-bg`, `--ui-sheet`, `--text`,
  `--ui-hairline-strong`, and `--shadow`. Dark/system-dark fixes are incomplete
  if a menu or popover still relies on a hard-coded white/pale background in its
  base rule and only happens to work because of a separate override.
- Settings/access-key, Owner Admin, Runtime Config, Plugin Admin, and group
  sheet surfaces are covered by the iOS PWA `dark-admin-surfaces` scenario.
  They must use theme tokens for panels, buttons, chips, code values, and
  status rows; a dark-mode pass is invalid if any sampled surface keeps a pale
  solid background or low-contrast dark green/brown text.
- Growth teaching card detail, native Growth submission, program, coin, and
  readiness surfaces are covered by the iOS PWA `dark-growth-surfaces`
  scenario. Teaching steppers, worked examples, feedback panels, action chips,
  reward/coin panels, and readiness checks must use theme tokens in both
  dark and system-dark mode; a dark-mode pass is invalid if any sampled Growth
  surface keeps a pale solid background or low-contrast dark green/brown text.
- In dark/system-dark mode, green/success semantics may remain in backgrounds,
  borders, dots, or subtle status surfaces, but text that previously used dark
  green must resolve to off-white (`--ink` / `--ui-success-ink`) unless a
  dedicated contrast check proves it remains readable. This applies to Action
  Inbox source/status badges, Automation success labels, group/member action
  buttons, topic secondary-page header controls and directory chips, and
  reading fullscreen controls.
- Settings-sheet option groups are a grouped-control surface. In dark/system-dark
  mode, active theme, font, and default-model options must use a visible
  high-contrast selected frame plus an inner outline; a subtle fill alone is not
  enough to communicate the selected option.
- Long assistant replies must keep receipt navigation available after streaming
  settles, but the UI now has only one right-side global navigation slot:
  `#conversationJumpBottom`. It shows the down/end arrow until the viewport is at
  the bottom, then switches to the up/start arrow for the current long receipt.
  The up and down arrows must never be visible at the same time, and both must
  occupy the same right-side position aligned with the command/composer origin.
  Legacy message-level `.message-scroll-button` controls are kept non-rendered
  and non-displayed; do not reintroduce inline footer/start arrows beside
  Usage/Skill/status chips. Arrow visibility recalculation must resolve the
  current DOM at execution time and include a delayed settle pass after final
  markdown/layout replacement so a stale pre-terminal message node cannot leave
  the global slot hidden. Eligibility must use the assistant message's original
  rendered height and viewport geometry: if the rendered reply cannot fit in one
  conversation screen, the global navigation slot must be available. Character
  count or rich render limits are only no-layout fallbacks. Once content
  estimation or measured layout proves a reply is long, terminal
  Usage/Skill/run-status footer refreshes must not clear that eligibility.
- Floating voice/composer overlays are live-state indicators only. They may be
  visible while voice capture/transcription or a real assistant run is active,
  but terminal states such as inserted/cancelled/no-speech/failed voice input or
  a completed assistant turn must not leave a status dot floating over the
  global receipt-navigation slot. Voice pre-recording `pending` is also bounded:
  missed pointer/touch end events, page lifecycle changes, or a stuck iOS
  WebView gesture must cancel and auto-hide instead of leaving the expanded
  status panel visible indefinitely. The expanded voice status panel must expose
  a direct `取消` control while a capture lifecycle is active.
- Active assistant replies must not stream the full growing answer directly into
  the visible receipt. While status is `queued` or `running`, the message should
  show a fixed-line streaming receipt preview with hidden overflow and keep the
  inline run-progress panel bounded in the same message body. After the assistant
  reaches a terminal state, the normal full Markdown/receipt renderer takes over.
- Assistant Markdown may render image-looking bare URLs inline, but protected
  same-origin `/api/*` images must be loaded through an authenticated client
  fetch and converted to a blob object URL before display. `/api/files/preview`
  is a JSON/text preview endpoint and must be normalized to `/api/files` before
  becoming an image source. Failed protected image loads should degrade to a
  same-window image link, not leave a broken `<img>` that is recreated on every
  thread refresh. The hydration pass must run after both normal chat renders and
  task/plugin-topic detail renders. Pending/loading placeholders should stay as
  short stable rows, not image-aspect placeholders that can create large blank
  blocks while the authenticated fetch is still pending.
- Markdown image sources must be absolute `http(s)` URLs or explicit paths that
  start with `/`, `./`, or `../`. Bare relative filenames such as
  `http1280x1280.jpg` are not stable in chat/topic messages and should remain
  text instead of being resolved against the Home AI origin.
- Music plugin receipts can include plugin-internal cover URLs under
  `/api/v1/music/...`. When such URLs appear in Home AI chat/topic Markdown,
  the static client must rewrite them to the Music same-origin proxy
  `/api/hermes-plugins/music/proxy/api/v1/music/...` with the effective
  workspace id before authenticated image hydration.
- Save-to-Note success feedback must remain a local Hermes route action. If the
  Note API returns a saved note id, the toast should be clickable/keyboard
  actionable and open the Note plugin with that id in the plugin route payload.
  The client must not hard-code deployment hostnames. Note receipt titles are a
  server-side responsibility: prefer the receipt heading, then the first
  meaningful content line, and add a short plugin prefix when a plugin context is
  available.
- Mobile orientation changes must have a deterministic viewport recovery pass:
  clear any temporary conversation scroll-layer reset, clear stale keyboard
  viewport CSS when the composer is no longer actually focused, recompute bottom
  navigation reservation, and recalculate long-message jump controls after the
  orientation settles.
- Do not expose raw local paths or sensitive metadata in normal UI.
- Do not rely on cached clients receiving changes without a version bump.
