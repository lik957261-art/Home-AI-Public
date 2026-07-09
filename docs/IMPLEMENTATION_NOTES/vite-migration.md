# Vite Migration Pilot

## Status

The first migration step is a development-only Vite island for the Owner System
Console preview. It does not replace `public/index.html`, does not change the
ordered `public/app-*.js` boot chain, and must not be deployed to production as
the default Home AI shell.

## Scope

- Vite is added as a dev dependency.
- `npm run build:vite` builds static island assets into
  `public/vite-islands/`.
- `npm run dev:vite` is available for local development only.
- The first island source lives under
  `src/vite-islands/owner-system-console/`.
- Vite dev server preview uses
  `src/vite-islands/owner-system-console/index.html`.
- The local preview page is
  `public/vite-preview/owner-system-console.html`.

## Boundary

The island consumes existing Owner-only Home AI APIs:

- `GET /api/owner/system-console`
- `GET /api/owner/system-console/system-status`

It uses `src/vite-app/runtime/home-ai-runtime-facade.mjs` for access-key,
client-version, API, state, and load-event boundaries. The island must not read
`localStorage` or build `X-Hermes-Web-Key` headers directly, and must not reach
into unrelated shell globals such as `state`, ordered app module functions,
Composer state, streaming state, or plugin iframe internals.

## Dev Validation Gate

Before considering any production integration, run:

```sh
npm run build:vite
npm run verify:vite-dev
npm run packet:vite-dev
node tests/vite-owner-system-console-island.test.js
node tests/static-cache-version-harness.test.js
npm run check
git diff --check
```

For UI review, serve the app locally and open:

```text
http://127.0.0.1:<port>/vite-preview/owner-system-console.html
```

For Vite source development, run `npm run dev:vite` and open:

```text
http://127.0.0.1:5173/vite-owner-system-console-preview/
```

The page requires an Owner access key in the normal browser storage or cookie
context. A non-Owner request must fail with a bounded permission message.

## Production Cutover Policy

Production cutover is out of scope for this pilot. A later target must define:

- which shell surface will reference the built island;
- whether static cache and service-worker version bumps are required;
- rollback behavior if the island fails to load;
- mobile/iOS visual evidence for the exact entry path;
- deployment and readback evidence through the central Mac deployment contract.

The app-local source shell-mode config must remain `classic` for this
development pilot. `npm run check:vite-readiness` includes a
`runtime_shell_mode_default` guard and fails if `config/home-ai-shell-mode.json`
defaults to `vite`.

The comprehensive development-only migration target is documented in
`docs/IMPLEMENTATION_NOTES/vite-full-frontend-migration-target.md`. It must be
completed and reviewed before any production cutover target is created.
The Owner review package for that later boundary is
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`; it is not an
approval record and does not authorize deployment by itself.

The maintained one-command development acceptance report is
`npm run verify:vite-dev`. It exercises the source-only Vite build, global
audit, mobile preview-route smoke, real local backend parity smoke, readiness,
Owner review, blocked cutover preflight, blocked handoff packet, repository
static check, readback validator contract, local full test gate, and diff
hygiene check without authorizing production writes or deployment. The local
full test gate still skips install/deploy lane tests.
The maintained development audit packet is `npm run packet:vite-dev`. It wraps
the acceptance report in a bounded Audit Packet / Delta Matrix with migrated
development surfaces, remaining production surfaces, validation summary, and
risk register. It is source-only and does not authorize production deployment.
The maintained source-only user-journey smoke is
`npm run smoke:vite-dev-user-journeys`. It drives Composer send, file/camera
attachment without main-frame refresh, server-file attachment, native/system
share attachment, Codex iframe rendering, Owner Console refresh, PDF/PPTX
document preview policy, and voice pending cancel through the Vite preview UI
using only dev mock metadata.
The source-only handoff packet command is `npm run packet:vite-cutover`; it is
a bounded draft generator for after Owner approval and must not send a deploy
card or execute deployment.
When `npm run verify:vite-dev` passes, its `ownerApprovalRequest` field records
`ready_to_request_owner_approval` and the exact approval text for the next
boundary. That field remains source-only and does not create production writes,
deployment, or a deploy-lane card. The maintained command for producing the
single approval request package is `npm run request:vite-cutover-approval`.
The post-deploy bounded readback validator is
`npm run validate:vite-cutover-readback -- --readback-json <deploy-readback.json>`.

## Full App Preview Host

Phase 1 of the full migration target adds a local Vite app preview host:

- source dev page: `src/vite-app/index.html`, served by Vite dev middleware;
- source entry: `src/vite-app/main.mjs`;
- dev server route: `/vite-app-preview/`;
- built preview page: `public/vite-preview/home-ai-app.html`;
- built artifact:
  `public/vite-islands/home-ai-app-preview/home-ai-app-preview.js`.

This host is only a development preview boundary. It does not load the classic
`public/index.html` ordered script chain and does not authorize production `/`
to move away from the classic shell.

## Runtime Facade

Phase 2 adds the first explicit frontend runtime facade:
`src/vite-app/runtime/home-ai-runtime-facade.mjs`.

The facade is importable from Vite code and exposes bounded interfaces for:

- access-key storage and `hermes_web_key` cookie sync;
- API calls with `X-Hermes-Web-Key` and
  `X-Hermes-Web-Client-Version` headers;
- small app-state snapshots and event fanout;
- feedback/status events;
- client-layout diagnostic keepalive transport;
- namespaced dedupe storage;
- route push/replace/current-state helpers;
- native-shell capability detection for bridge, voice, and share support;
- document-preview URL normalization and authenticated blob fetches for
  download/share paths.

The full app preview imports this facade and attaches it to
`window.HomeAiRuntimeFacade` as a documented classic compatibility point. Do
not add new unmanaged `window.state` or broad boot-order globals for migrated
Vite modules. Classic modules may adopt the facade in focused slices while the
production shell remains `public/index.html`.

The Owner System Console is the first Phase 2 consumer on both sides of the
boundary:

- `src/vite-islands/owner-system-console/main.mjs` imports the facade and uses
  `runtime.api`, `runtime.events`, and `runtime.state`.
- Pure Vite island rendering and error normalization live in
  `src/vite-islands/owner-system-console/model.mjs`. The model owns bounded
  Chinese UI text, status labels, HTML escaping, and the non-Owner
  `需要 Owner 权限或重新登录。` error state; `main.mjs` remains DOM/runtime glue.
- `public/app-owner-system-console-ui.js` optionally uses
  `window.HomeAiRuntimeFacade.api` when present, while preserving the existing
  classic `api()` fallback and Owner-only gate.

AI Ops diagnostic feedback is the second Phase 2 classic consumer:

- `public/app-ai-ops-diagnostics-ui.js` prefers the runtime facade for
  diagnostic API submission, event fanout, state projection, and feedback
  status/toast events.
- It keeps existing classic fallback behavior when the facade is absent.
- Plugin diagnostic transport keepalive delivery now goes through
  `runtime.diagnostics.sendClientLayoutDiagnostic`.
- Plugin conversation action dedupe state now goes through `runtime.dedupe`.
- The classic shell loads `public/app-runtime-facade-ui.js` after
  `app-api-client.js` so migrated classic consumers have a facade boundary
  before Owner Console and AI Ops modules run.

Host Voice Input is the next Phase 2 classic consumer:

- `public/app-voice-input-ui.js` consumes `window.HomeAiRuntimeFacade.native`
  for native-shell detection, voice bridge availability, `homeAI` native
  message posting, microphone-grant/status-panel storage, request ids, and
  native callback registration.
- The voice UI no longer owns direct `localStorage`, direct
  `window.webkit.messageHandlers.homeAI.postMessage`, or direct
  `window.HomeAINativeVoiceInput*` access for those boundaries.
- `AudioContext` remains in the classic voice file as the explicit browser
  audio-capture boundary until the production recording path adopts the
  imported voice capture adapter.
- The imported voice capture adapter now exists at
  `src/vite-islands/voice-input-status/audio-capture-adapter.mjs`. It is
  browser-global-free and accepts microphone devices, recorder constructors,
  and audio context constructors as injected dependencies. It owns readiness
  projection, preferred MIME selection, held-stream cleanup, injected recorder
  session wrapping, PCM16 downsampling, base64 conversion, and streaming chunk
  buffer policy. The current dev preview imports it only for fixture readiness;
  production capture still remains in `public/app-voice-input-ui.js` until a
  later live local voice harness wires this adapter into the recording path.

Task/document preview is now another Phase 2 classic consumer:

- `public/app-task-preview-helpers-ui.js` prefers
  `window.HomeAiRuntimeFacade.api` for preview JSON requests and
  `window.HomeAiRuntimeFacade.documentPreview.fetchBlob()` for authenticated
  blob reads used by save/share/download actions.
- `public/app-task-preview-ui.js` reads Markdown preview text through the
  helper API path instead of constructing its own authenticated `fetch`.
- `public/app-task-preview-helpers-ui.js` no longer reads
  `localStorage.hermesWebWorkspace`; workspace selection comes from
  `runtime.state.selectedWorkspaceId`, classic `state.selectedWorkspaceId`, or
  the bounded `owner` fallback.
- `public/app-task-preview-ui.js` no longer reads
  `localStorage.homeAI.nativeShell`; document-preview native-shell return
  routing uses `runtime.native.nativeShellParam()` and keeps the existing
  `ios`/`android` URL and dataset fallback behavior.
- `public/directory-viewer.html` loads `app-api-client.js`,
  `app-runtime-facade-ui.js`, `app-task-preview-helpers-ui.js`, and
  `app-task-preview-ui.js` in that order before its inline viewer script.
- Directory viewer's inline directory load/create/upload/delete calls use
  `window.HomeAiRuntimeFacade.api`; the viewer no longer reads
  `hermesWebKey`, constructs `X-Hermes-Web-Key`, or calls `fetch()` directly
  for directory API operations.
- Its early `hermesWebTheme` read remains a narrow first-paint theme bootstrap
  until the viewer becomes an imported Vite entry.
- Its temporary `TaskDocumentPreviewUi` access is registered as the classic
  preview overlay bridge until directory viewer and task preview UI become
  imported modules.
- The classic runtime-facade bootstrap creates `facade.api` from
  `HermesAppApiClient.createApiClient()` when an independent entrypoint does
  not provide the main shell's `window.api`.
- The previous `document-preview-classic-fallback-fetch` audit allowlist has
  been removed. Missing runtime facade/API wiring now fails with a bounded
  preview-not-ready error instead of reconstructing auth headers in the helper.

The next development-only document preview boundary is
`src/vite-islands/document-preview/`:

- `model.mjs` is browser-global free and owns Markdown/image/document
  classification, Markdown preview API URL routing, same-origin viewer/native
  URL construction, mobile in-app overlay decisions, native shell/open-in
  strategy selection, and PowerPoint-compatible `kind=powerpoint` request
  metadata for PPT/PPTX files.
- `main.mjs` renders a read-only fixture preview for Markdown, PPTX, DOCX,
  PDF, image, and unsupported external links at
  `/vite-document-preview-preview/` and
  `public/vite-preview/document-preview.html`.
- The island does not fetch preview blobs, call native document bridges,
  download/share files, or replace `public/app-task-preview-ui.js`. Production
  Markdown/PPTX/file-delivery closure still requires later live local harnesses
  and Owner review before cutover.

## Dev Preview API Mock

The Vite dev server owns metadata-only mocks for selected Vite preview API
paths:

- `/api/owner/system-console`
- `/api/owner/system-console/system-status`
- `/api/threads/thread_vite_navigation_preview`
- `/api/hermes-plugins/<id>/manifest?workspaceId=owner` for the sampled
  Plugin Host preview ids only

The mock is implemented in `adapters/vite-dev-preview-api-mock-service.js` and
is wired only through `vite.config.js` dev middleware. It exists so
`/vite-owner-system-console-preview/`, `/vite-navigation-shell-preview/`, and
`/vite-plugin-host-preview/` can render without local backend API `404` console
errors while frontend migration work is still development-only.

The mock payload carries `source=vite_dev_preview_mock` and
`X-HomeAI-Vite-Dev-Mock`. It must not be wired into `server.js`, must not be
used as Owner permission or task/topic readback evidence, and must be replaced
by real Home AI API readback before any production cutover proposal.

## Plugin Host Island

Phase 6 now has a development-only Plugin Host island:

- source: `src/vite-islands/plugin-host/`;
- dev route: `/vite-plugin-host-preview/`;
- built preview page: `public/vite-preview/plugin-host.html`;
- built artifact: `public/vite-islands/plugin-host/plugin-host.js`;
- preview hook: `window.HomeAIVitePluginHostPreview`.

The pure model in `model.mjs` owns bounded plugin manifest normalization,
Owner/non-Owner fail-closed state, iframe eligibility, same-origin and
mixed-content blocking, manifest freshness, refresh evidence, and launch-token
redaction. The DOM entry in `main.mjs` uses `HomeAiRuntimeFacade.api` for
manifest reads and keeps browser auth/storage access inside the runtime
facade. It must not expose raw launch tokens, cookies, plugin workspace keys,
or upstream plugin payloads.

The same model also owns the development-only iframe lifecycle decision for
resident plugin hosts. It strips volatile launch/session/token query
parameters before comparing stable entry signatures, preserves already loaded
iframes on token-only refreshes, preserves visible or loaded iframes during
`navigation_health_timeout`, and recovers only when the iframe is still
loading beyond the configured health timeout. The preview exposes bounded
fixture controls for token refresh, loaded timeout, loading timeout, and entry
change so this policy can be audited without real plugin launch tokens.

This island is local-development evidence for the host side of embedded plugin
rendering only. It does not migrate plugin-owned UIs into the Home AI bundle,
does not replace the production resident iframe host, and does not prove
production plugin launch/readback.

## Dev Backend Proxy Parity

The Vite dev server can proxy bounded chat runtime parity routes to an
isolated local `server.js` when both of these variables are set:

- `HOMEAI_VITE_DEV_BACKEND_PROXY=1`
- `HOMEAI_VITE_DEV_BACKEND_BASE=http://127.0.0.1:<port>`

This proxy is implemented in `adapters/vite-dev-backend-proxy-service.js` and
`vite.config.js`; it is off by default, development-only, and must not be wired
into production `server.js`.

`tests/vite-dev-real-backend-parity-smoke.test.js` now starts:

- a temporary Home AI data dir and isolated `server.js`;
- a temporary Gateway Pool manifest;
- a local fake Gateway worker implementing bounded `/health`,
  `/health/detailed`, `/v1/capabilities`, `/v1/responses`, and
  `/v1/runs/:id/stop` behavior;
- a Vite dev server with backend proxy enabled.

The smoke verifies a real SSE snapshot through Vite, group-chat `plain` message
persistence without touching Gateway, AI Composer send through the real Gateway
runner path, and interrupt through the real active-stream stop path. The fake
Gateway fixture is only transport/protocol evidence; it is not provider,
model-quality, production Gateway, or production cutover evidence.

Focused validation:

```sh
node tests/vite-runtime-facade.test.js
node tests/vite-owner-system-console-island.test.js
node tests/vite-owner-system-console-model.test.js
node tests/vite-dev-preview-api-mock-service.test.js
node tests/owner-system-console-ui.test.js
node tests/ai-ops-diagnostic-feedback-ui.test.js
node tests/app-runtime-facade-ui.test.js
node tests/voice-input-ui.test.js
node tests/task-preview-helpers-runtime-facade.test.js
node tests/document-preview-device-policy.test.js
node tests/vite-voice-audio-capture-adapter.test.js
node tests/vite-voice-input-status-island.test.js
node tests/voice-input-ui.test.js
npm run build:vite
node tests/vite-app-preview-host.test.js
```

## AI Ops Feedback Menu Island

Phase 3 starts with a development-only Vite island for the AI Ops feedback menu:

- source entry: `src/vite-islands/ai-ops-feedback/main.mjs`;
- pure model helpers: `src/vite-islands/ai-ops-feedback/model.mjs`;
- dev source page: `src/vite-islands/ai-ops-feedback/index.html`;
- dev server route: `/vite-ai-ops-feedback-preview/`;
- built preview page: `public/vite-preview/ai-ops-feedback.html`;
- built artifact:
  `public/vite-islands/ai-ops-feedback/ai-ops-feedback.js`;
- guard test: `tests/vite-ai-ops-feedback-island.test.js`.

The island mirrors the feedback-menu contract without replacing the production
classic menu. It uses `HomeAiRuntimeFacade` / `createHomeAiRuntimeFacade` for
API calls, state, event fanout, route reads, feedback status, and native
capability metadata. It does not read `localStorage`, build Home AI auth
headers, call `fetch()` directly, or reach into `window.state`.

The payload builder posts bounded diagnostic metadata to
`/api/v1/home-ai/diagnostics/events`. It strips unsafe route parameters such as
launch tokens and exposes the `系统控制台` shortcut only when the preview state is
Owner and the shell has `openOwnerSystemConsoleSurface`. Production
`public/index.html` and `public/service-worker.js` must not reference this
island until a separate production cutover target is approved.

Focused validation:

```sh
npm run build:vite
node tests/vite-ai-ops-feedback-island.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
node tests/vite-app-preview-host.test.js
```

## Voice Input Status Island

Phase 5 has a development-only status/model slice before the full voice
runtime migration:

- source entry: `src/vite-islands/voice-input-status/main.mjs`;
- pure model helpers: `src/vite-islands/voice-input-status/model.mjs`;
- pure session controller:
  `src/vite-islands/voice-input-status/session-controller.mjs`;
- pure audio capture adapter:
  `src/vite-islands/voice-input-status/audio-capture-adapter.mjs`;
- dev source page: `src/vite-islands/voice-input-status/index.html`;
- dev server route: `/vite-voice-input-status-preview/`;
- built preview page: `public/vite-preview/voice-input-status.html`;
- built artifact:
  `public/vite-islands/voice-input-status/voice-input-status.js`;
- guard test: `tests/vite-voice-input-status-island.test.js`.
- session controller guard test:
  `tests/vite-voice-input-session-controller.test.js`.
- audio capture adapter guard test:
  `tests/vite-voice-audio-capture-adapter.test.js`.

The island previews the long-press voice status panel, cancel affordance,
pending guard, terminal auto-hide, and native status normalization. It uses the
runtime facade for state/event projection. It does not call microphone APIs,
construct Home AI auth headers, use `fetch()`, write Composer text, or replace
the production classic voice module.

The session controller is the first Vite voice runtime lifecycle boundary. It
models begin-press, release-before-threshold cancellation, long-press threshold,
release-to-stop, explicit cancel, pending guard timeout, native status
projection, and terminal auto-hide as pure state/effect transitions. Timer
functions are injected by the preview, so the module does not touch
`window`, `globalThis`, storage, `fetch`, `MediaRecorder`, microphone APIs, or
ASR transport. `/vite-voice-input-status-preview/` exposes development-only
controls for `开始长按`, `达到阈值`, `松手`, `pending 超时`, and `自动隐藏` so
the stale "waiting for long press" failure mode can be exercised locally before
real microphone capture moves behind an imported adapter.

The audio capture adapter is the next pure ESM voice runtime boundary. It
models injected microphone readiness, preferred recorder MIME selection,
held-stream cleanup, injected recorder-session wrapping, PCM16 downsampling,
base64 conversion, and streaming chunk thresholds without directly touching
browser globals. The preview uses fixture capabilities only and must not prompt
for microphone access.

Focused validation:

```sh
npm run build:vite
node tests/vite-voice-audio-capture-adapter.test.js
node tests/vite-voice-input-session-controller.test.js
node tests/vite-voice-input-status-island.test.js
node tests/voice-input-ui.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
node tests/vite-app-preview-host.test.js
```

## Navigation Shell Island

Phase 4 starts with a development-only navigation shell island before the
classic primary navigation frame is replaced:

- source entry: `src/vite-islands/navigation-shell/main.mjs`;
- pure model helpers: `src/vite-islands/navigation-shell/model.mjs`;
- task/topic shell model:
  `src/vite-islands/navigation-shell/task-topic-shell-model.mjs`;
- task/topic compatibility adapter:
  `src/vite-islands/navigation-shell/task-topic-compatibility-adapter.mjs`;
- task/topic root renderer:
  `src/vite-islands/navigation-shell/task-topic-root-renderer.mjs`;
- task/topic action model:
  `src/vite-islands/navigation-shell/task-topic-action-model.mjs`;
- task/topic read-only data source:
  `src/vite-islands/navigation-shell/task-topic-data-source.mjs`;
- selected topic detail preview model:
  `src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs`;
- development-preview route sync model:
  `src/vite-islands/navigation-shell/route-sync-model.mjs`;
- dev source page: `src/vite-islands/navigation-shell/index.html`;
- dev server route: `/vite-navigation-shell-preview/`;
- built preview page: `public/vite-preview/navigation-shell.html`;
- built artifact:
  `public/vite-islands/navigation-shell/navigation-shell.js`;
- guard test: `tests/vite-navigation-shell-island.test.js`.

The island models primary tabs, view-mode normalization, Owner-only console
tab availability, cached topic/task shell status, directory topic collection
grouping, task-root render signatures, imported task/topic root HTML rendering,
classic `taskListThread` cache compatibility, row-level topic action models,
development-preview URL/history synchronization, a first read-only thread data
boundary for root and selected-topic refresh, and a classic fallback URL for
the same route. It uses the runtime
facade for preview state, route updates, history push/replace, API calls, and
event fanout. The compatibility adapter consumes the runtime state snapshot
provided to the Vite model; it must not read classic `window.state` directly.
The row action model maps directory, regular, and plugin topic rows to bounded
route patches and classic fallback hrefs; the development preview applies those
patches to runtime state and Vite preview URL/history only. The data source
calls the existing read-only `GET /api/threads/:id?messageMode=tasks` boundary
through `runtime.api` and records bounded status/source evidence in the preview
state, including selected `taskGroupId`, message mode, and bounded message
count. Topic-row activation and browser history restoration both trigger the
same scoped read path instead of relying only on stale fixture state. The
selected-topic model renders only bounded role/status/message-preview and
attachment/artifact/tool-call counts from that scoped payload; it is a
read-only development preview that preserves the real thread-read distinction
between total messages, loaded messages, `hasMoreBefore`, and oldest/newest
message ids. The cache reconciliation model keeps root and selected-topic
readbacks separated: root reads update `taskListThread`/`taskListRootCache`,
while selected-topic reads update
`taskTopicSelectedThread`/`taskTopicSelectedCache` without overwriting the
root topic list. Browser back to the task root clears the selected-topic cache.
Root reads stay explicit and do not render arbitrary task messages as
selected-topic detail. It does not migrate chat detail, Composer, SSE, or
message actions. During
local Vite development, the Vite dev server serves a metadata-only mock for
`thread_vite_navigation_preview`; that mock is not production readback or
permission evidence. The route sync model parses only bounded
non-secret query parameters and strips unrelated values. The island does not
construct Home AI auth headers, call `fetch()` directly, read browser storage
directly, or replace
`app-automation-ui.js` / `app-wire-start-ui.js` / `app-thread-list-ui.js` in
the production shell.

Focused validation:

```sh
npm run build:vite
node tests/vite-navigation-shell-island.test.js
node tests/vite-navigation-thread-view-payload-compat.test.js
node tests/vite-navigation-route-sync-model.test.js
node tests/vite-task-topic-cache-reconciliation-model.test.js
node tests/vite-task-topic-data-source.test.js
node tests/vite-task-topic-selected-view-model.test.js
node tests/vite-task-topic-compatibility-adapter.test.js
node tests/vite-task-topic-action-model.test.js
node tests/vite-task-topic-shell-model.test.js
node tests/vite-task-topic-root-renderer.test.js
node tests/task-list-ui.test.js
node tests/same-window-navigation-harness.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
node tests/vite-app-preview-host.test.js
```

## Message Action Panel Island

Phase 5 starts with a Vite island for the message Usage/footer action area
before Composer, SSE, or send/cancel behavior moves. The first slice was
read-only; the current slice adds dev-server mock execution parity while built
static artifacts remain read-only:

- action client:
  `src/vite-islands/message-action-panel/action-client.mjs`;
- source entry: `src/vite-islands/message-action-panel/main.mjs`;
- pure model helpers: `src/vite-islands/message-action-panel/model.mjs`;
- dev source page: `src/vite-islands/message-action-panel/index.html`;
- dev server route: `/vite-message-action-panel-preview/`;
- built preview page: `public/vite-preview/message-action-panel.html`;
- built artifact:
  `public/vite-islands/message-action-panel/message-action-panel.js`;
- guard tests:
  `tests/vite-message-action-panel-action-client.test.js`,
  `tests/vite-message-action-panel-model.test.js` and
  `tests/vite-message-action-panel-island.test.js`.

This island projects bounded message action metadata only. The first supported
action is Wardrobe `outfit_wear_intent`, using the same compatibility metadata
locations and Chinese labels as the classic renderer (`入库`,
`已入库 #... · 已验证`, `需重新生成`). The preview renders ready, stored, and
diagnostic-only states near a Usage chip.

The next development-only slice adds the first action-execution parity path for
the same Wardrobe action. When served by `npm run dev:vite`, the island calls
the Vite dev mock through `HomeAiRuntimeFacade.api` and exercises the same
request body contract as the classic bridge: first `create_only`, then
`replace` after a `needs_confirmation` readback. The dev mock returns bounded
fixture metadata and never calls Wardrobe MCP. The built preview remains
read-only (`built read-only`) so static artifacts cannot accidentally call the
real plugin-conversation action route. Production
`public/app-message-actions-ui.js` remains unchanged as the real execution
owner until a later Phase 5 slice migrates live action execution and the wider
Composer/SSE runtime.

Focused validation:

```sh
npm run build:vite
node tests/vite-message-action-panel-action-client.test.js
node tests/vite-message-action-panel-model.test.js
node tests/vite-message-action-panel-island.test.js
node tests/vite-dev-preview-api-mock-service.test.js
node tests/wardrobe-outfit-wear-intent-ui.test.js
node tests/wardrobe-outfit-wear-intent-action-service.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## Dialog Sheet Island

This development-only slice adds a Vite Dialog Sheet island before production
dialog ownership moves. It models Home AI-style confirm, prompt, and message
sheets as ESM state instead of browser-native dialogs:

- source entry: `src/vite-islands/dialog-sheet/main.mjs`;
- pure model: `src/vite-islands/dialog-sheet/model.mjs`;
- dev source page: `src/vite-islands/dialog-sheet/index.html`;
- dev server route: `/vite-dialog-sheet-preview/`;
- built preview page: `public/vite-preview/dialog-sheet.html`;
- built artifact: `public/vite-islands/dialog-sheet/dialog-sheet.js`;
- guard test: `tests/vite-dialog-sheet-island.test.js`.

The model owns dialog kind normalization, prompt value state, button plans,
cancelability, and close results. The preview imports
`HomeAiRuntimeFacade`, records bounded development state/events, and exposes
`window.HomeAIViteDialogSheetPreview` only as a local harness hook. It must not
call `alert`, `confirm`, or `prompt`, must not depend on launch tokens or
private payloads, and must not replace classic production dialog owners until a
separate production cutover has Owner approval and focused dialog-flow
acceptance evidence.

Focused validation:

```sh
npm run build:vite
node tests/vite-dialog-sheet-island.test.js
node tests/vite-app-preview-host.test.js
node tests/vite-dev-preview-routes-smoke.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## Toast / Status Island

This development-only slice adds a Vite Toast / Status island for the static
client feedback channel before production toast ownership moves. It models the
classic `showPushToast()` / `setPushProgress()` behavior as importable ESM
state and drives it through `HomeAiRuntimeFacade.feedback`:

- source entry: `src/vite-islands/toast-status/main.mjs`;
- pure model: `src/vite-islands/toast-status/model.mjs`;
- dev source page: `src/vite-islands/toast-status/index.html`;
- dev server route: `/vite-toast-status-preview/`;
- built preview page: `public/vite-preview/toast-status.html`;
- built artifact: `public/vite-islands/toast-status/toast-status.js`;
- guard test: `tests/vite-toast-status-island.test.js`.

The model owns tone normalization, bounded display duration, actionable toast
metadata, dismissal, action-click recording, and status state. The preview
records bounded runtime state/events and exposes
`window.HomeAIViteToastStatusPreview` only as a local harness hook. It must not
call browser-native dialogs, must not fetch authenticated APIs, must not read or
store access keys, and must not replace the classic production PWA toast until a
separate production cutover has Owner approval and focused feedback-flow
acceptance evidence.

Focused validation:

```sh
npm run build:vite
node tests/vite-toast-status-island.test.js
node tests/vite-app-preview-host.test.js
node tests/vite-dev-preview-routes-smoke.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## Chat Runtime Event Model Island

Phase 5 now has a development-only chat runtime event model and injected live
SSE/EventSource client slice before Composer send/cancel or full chat detail
rendering moves:

- source entry: `src/vite-islands/chat-runtime/main.mjs`;
- focus lifecycle guard:
  `src/vite-app/runtime/focus-lifecycle-guard.mjs`;
- composer API client:
  `src/vite-islands/chat-runtime/composer-api-client.mjs`;
- composer controller:
  `src/vite-islands/chat-runtime/composer-controller.mjs`;
- thread readback controller:
  `src/vite-islands/chat-runtime/thread-readback-controller.mjs`;
- chat detail model:
  `src/vite-islands/chat-runtime/chat-detail-model.mjs`;
- composer model:
  `src/vite-islands/chat-runtime/composer-model.mjs`;
- event-stream adapter:
  `src/vite-islands/chat-runtime/event-stream-adapter.mjs`;
- injected live EventSource client:
  `src/vite-islands/chat-runtime/live-event-source-client.mjs`;
- pure model helpers: `src/vite-islands/chat-runtime/model.mjs`;
- dev source page: `src/vite-islands/chat-runtime/index.html`;
- dev server route: `/vite-chat-runtime-preview/`;
- built preview page: `public/vite-preview/chat-runtime.html`;
- built artifact: `public/vite-islands/chat-runtime/chat-runtime.js`;
- guard tests:
  `tests/vite-chat-composer-api-client.test.js`,
  `tests/vite-chat-composer-backend-contract.test.js`,
  `tests/vite-chat-composer-controller.test.js`,
  `tests/vite-chat-composer-model.test.js`,
  `tests/vite-chat-detail-model.test.js`,
  `tests/vite-chat-thread-readback-controller.test.js`,
  `tests/vite-chat-event-source-client.test.js`,
  `tests/vite-chat-event-stream-adapter.test.js`,
  `tests/vite-focus-lifecycle-guard.test.js`,
  `tests/vite-chat-runtime-model.test.js` and
  `tests/vite-chat-runtime-island.test.js`.

The model mirrors the classic Composer/event contract at the data level:
`message.delta` patches visible assistant content in place without scheduling a
full refresh, terminal assistant messages request bounded thread refresh,
`thread.updated` terminal summaries request a delayed refresh, and
user-scroll protection prevents forced bottom stick. It also records bounded
diagnostics for scope mismatches and truncates live streaming buffers. The dev
preview drives fixture events through `HomeAiRuntimeFacade.state` and
`HomeAiRuntimeFacade.events`. The adapter parses MessageEvent-style `data`
frames, classifies chat versus non-chat event payloads, delegates recognized
chat events into the model, and records bounded diagnostics for invalid JSON,
invalid payloads, `client.version`, and unrelated event types. The live client
constructs the classic-compatible `/api/events` URL and owns injected
EventSource lifecycle status. The preview keeps a fake injected EventSource
for deterministic open/message/reconnect/close checks, and also exposes a
runtime-facade EventSource path for development verification. The ESM runtime
facade and classic compatibility facade both expose
`eventStream.createEventSource()`, making browser EventSource construction a
documented facade boundary instead of chat-island logic. This slice does not
send Composer messages, call `fetch()` from the island, or replace
`public/app-event-stream-ui.js`.

The next development-only transport slice adds a Vite dev server SSE endpoint
for the same runtime-facade path:
`/api/events?clientVersion=20260702-vite-chat-runtime-dev-v1`. The endpoint is
served by `vite.config.js` as HTTP/SSE glue, while bounded frame payloads live
in `adapters/vite-dev-preview-api-mock-service.js`. It returns
`text/event-stream` frames for the chat runtime preview thread only, does not
echo access keys, and does not proxy production event traffic. The event stream
adapter now accepts real browser `MessageEvent.data` prototype accessors in
addition to plain object test fixtures, closing the gap between fake injected
EventSource tests and browser-native EventSource behavior. This still remains
local development evidence; authenticated production SSE cutover requires a
separate Owner-approved parity pass.

The next Phase 5 slice has entered ESM encapsulation for chat detail and
Composer state while keeping real send/cancel in the classic shell. The pure
`chat-detail-model.mjs` projects bounded message rows and task-group-scoped
detail state without browser globals. The pure `composer-model.mjs` models
send/stop/search action state, pending artifact counts, and optimistic local
send row planning. The Vite preview exposes a `Composer ESM` control strip that
can simulate and clear local pending rows for development evidence only. It
does not call Home AI APIs, submit real Composer messages, upload attachments,
or replace production Composer modules.

The Composer API client boundary is now also explicit in ESM:
`composer-api-client.mjs` builds and sends the classic
`POST /api/threads/:threadId/messages` and
`POST /api/threads/:threadId/interrupt` requests only through an injected
`HomeAiRuntimeFacade.api` function. The module does not own browser globals,
direct `fetch()`, access-key headers, cookies, or storage. During
`npm run dev:vite`, `vite.config.js` routes those calls to
`adapters/vite-dev-preview-api-mock-service.js` for
`thread_vite_chat_runtime_preview` only. The built static preview disables the
dev-mock send/stop buttons and must not emit real `/api/threads/...` requests.
`composer-controller.mjs` is the next ESM encapsulation boundary. It composes
the pure Composer model with the injected API client and owns the dev-preview
send/interrupt state machine: optimistic row apply, status projection, API
result merge, attachment consumption, optimistic token cleanup, and failure
rollback. It is browser-global-free, has no direct transport/auth/storage
boundary, and is covered by `tests/vite-chat-composer-controller.test.js`.
`src/vite-islands/chat-runtime/main.mjs` now uses this controller for the
`/vite-chat-runtime-preview/` dev-mock send/stop controls while remaining DOM
and runtime-facade glue.
`thread-readback-controller.mjs` is the follow-up ESM boundary for terminal
event refresh. It builds the classic `GET /api/threads/:threadId` readback
request through injected `HomeAiRuntimeFacade.api`, consumes the model's
`refreshRequests`, replaces the thread with bounded readback state, clears the
refresh queue after success, and records bounded diagnostics on failure. The
source dev route exposes a `回读线程` control; the built static preview keeps
that control disabled by the existing source-route guard. `vite.config.js`
serves a metadata-only chat runtime thread readback mock for
`thread_vite_chat_runtime_preview`, and the backend proxy allows the same
thread-read route for isolated real-backend parity checks.
The source-only backend contract harness
`tests/vite-chat-composer-backend-contract.test.js` validates the same ESM
client through `HomeAiRuntimeFacade.api` against the real thread message create
route/service and thread interrupt route, using an in-memory disposable thread.
It proves access-key/client-version propagation, run/interrupt readback, and
fail-closed missing-auth behavior without production IO. It is not a live
backend/SSE smoke and does not authorize production cutover.

The next development-only backend parity slice adds an explicit opt-in Vite
dev backend proxy before the dev mocks. It is disabled by default. To route
bounded chat runtime parity requests to a local Home AI dev server, run Vite
with:

```sh
HOMEAI_VITE_DEV_BACKEND_PROXY=1 \
HOMEAI_VITE_DEV_BACKEND_BASE=http://127.0.0.1:<home-ai-dev-port> \
npm run dev:vite
```

Only these routes are eligible for proxying:

- `GET /api/events`
- `GET /api/threads/:threadId`
- `POST /api/threads/:threadId/messages`
- `POST /api/threads/:threadId/interrupt`
- `POST /api/threads/:threadId/uploads`
- `POST /api/threads/:threadId/server-file-attachments`

If proxy mode is requested without a valid `http` or `https` backend base URL,
those routes return a bounded `502` JSON response with
`source=vite_dev_backend_proxy` instead of silently falling back to the mock.
The proxy strips hop-by-hop request headers and marks responses with
`X-HomeAI-Vite-Dev-Backend-Proxy`. It must not be enabled for production or
used as production readback evidence.

Focused proxy coverage now includes:

- `tests/vite-dev-backend-proxy-service.test.js` for route selection,
  fail-closed config, header sanitization, and Vite middleware order;
- `tests/vite-dev-backend-proxy-integration.test.js` for a real Vite dev
  server forwarding SSE and Composer POST requests to a local fake Home AI
  backend before mocks;
- `tests/vite-dev-real-backend-parity-smoke.test.js` for a real isolated
  `server.js` started with temporary `HERMES_WEB_DATA_DIR`, Vite proxy
  forwarding authenticated SSE snapshot traffic, and a no-Gateway
  group-chat `plain` message write/readback through the real message endpoint.

The real-backend smoke now starts a local fake Gateway worker and temporary
Gateway Pool manifest in the same process. It verifies AI Composer send through
the real Gateway runner path, request authorization/body projection to the fake
Gateway, streaming partial output persistence, and interrupt through the real
active-stream stop path. The fake Gateway is a bounded protocol fixture only;
it is not production Gateway, provider, model-quality, or Owner-data evidence.

Attachment/upload state now has a development-only ESM boundary:
`src/vite-islands/chat-runtime/attachment-model.mjs` and
`src/vite-islands/chat-runtime/attachment-upload-client.mjs`. The model
normalizes pending artifacts, native share intake, server-file attachment
metadata, upload request shape, bounded Composer artifact payloads, Chinese
status summaries, and remove/clear transforms without browser globals,
storage, direct `fetch()`, or local file reads. The upload client accepts an
injected `HomeAiRuntimeFacade.api` client plus an injected file reader and
builds the classic `/api/threads/:threadId/uploads` request without owning
`FileReader`, DOM state, auth headers, or transport. The file/camera selection
boundary now lives in
`src/vite-islands/chat-runtime/attachment-file-input-controller.mjs`; it owns
change-event suppression, selected File snapshotting, immediate `input.value`
clearing for repeated mobile camera picks, and bounded selection evidence. It
does not own browser globals, auth, transport, storage, or file bytes.
`/vite-chat-runtime-preview/`
renders an `附件 ESM` strip with metadata-only fixture controls for system
uploads, server files, and native share. It also includes a development-only
file picker whose preview glue layer reads a local fixture and sends it to the
Vite dev mock for `thread_vite_chat_runtime_preview`; the mock returns bounded
artifact metadata and does not echo file bytes. Attachment-only Composer sends
are valid in the model and can be sent to the Vite dev mock on the source dev
route; successful dev-mock send consumes the pending artifacts. This still does
not call the production upload route from a static artifact, use Owner private
files, or replace the classic attachment modules.

`tests/vite-chat-attachment-upload-backend-contract.test.js` adds source-only
route contract coverage for the same upload client against the real
`server-routes/thread-read-upload-api-routes.js` route, with an in-memory
disposable thread and injected route dependencies. It verifies request shape,
basename sanitization, artifact registration/readback, backend rejection
propagation, and no raw base64 in the returned artifact payload. This is
stronger than the Vite dev mock, but it is not a production upload cutover,
Owner-file, live browser, or native-share proof.

Server-file attachment now has the same ESM boundary pattern. The source lives
in `src/vite-islands/chat-runtime/attachment-server-file-client.mjs`; it calls
the classic `/api/threads/:threadId/server-file-attachments` route only through
an injected runtime API, does not read bytes, does not build `dataBase64`, and
normalizes returned artifacts as `server_file`. The Vite dev mock supports
that route for the chat runtime preview thread only and returns bounded
metadata without echoing source paths. Focused coverage lives in
`tests/vite-chat-server-file-attachment-client.test.js` and
`tests/vite-chat-server-file-attachment-backend-contract.test.js`.

Native share intake now follows the same injected boundary. The runtime facade
owns the only global native-share receiver registration through
`registerNativeShareCallbacks()`, including bounded pending-share consumption
from `__homeAIPendingNativeShare` without echoing file paths in facade events.
The chat runtime island consumes that bridge through
`src/vite-islands/chat-runtime/attachment-native-share-client.mjs`, which is
browser-global-free and only receives an injected `runtime.native` adapter plus
state setters. `/vite-chat-runtime-preview/` registers the receiver on mount,
accepts `HomeAINativeShare.receive({ files })`, dedupes by workspace/path, and
converts attached rows to `native_share` artifacts. This is development bridge
evidence only: production still uses the classic upload/sidebar native-share
path until authenticated shell parity, native iOS smoke, cutover planning, and
Owner acceptance are complete.

The focus lifecycle guard has also moved into an ESM boundary for
development-only validation. `src/vite-app/runtime/focus-lifecycle-guard.mjs`
owns injected stale-editable detection and blur decisions for the future Vite
shell. It accepts document/root/composer/native-shell inputs explicitly and
does not read browser globals, storage, or transport APIs directly. The module
matches the classic Web guard policy: stale hidden, detached, disabled,
invisible, inert, or zero-rect active editables blur on lifecycle checks;
ordinary PWA non-editable touches keep a visible Composer focus; and explicit
iOS native-shell non-editable touches outside the active editable force a blur
to avoid stuck `WKWebView` keyboard state. `/vite-chat-runtime-preview/`
installs this guard, exposes a `Focus guard` status row, and provides a
`清理焦点` manual cleanup button for local smoke testing. Production still
uses `public/app-composer-draft-ui.js`; the native iOS shell guard remains a
required defensive layer until a separately approved Vite shell cutover proves
the full Web/native focus lifecycle.

Focused validation:

```sh
npm run build:vite
node tests/vite-chat-composer-api-client.test.js
node tests/vite-chat-composer-backend-contract.test.js
node tests/vite-chat-composer-controller.test.js
node tests/vite-chat-thread-readback-controller.test.js
node tests/vite-chat-attachment-model.test.js
node tests/vite-chat-attachment-upload-client.test.js
node tests/vite-chat-attachment-upload-backend-contract.test.js
node tests/vite-chat-server-file-attachment-client.test.js
node tests/vite-chat-server-file-attachment-backend-contract.test.js
node tests/vite-chat-native-share-intake-client.test.js
node tests/vite-chat-composer-model.test.js
node tests/vite-chat-detail-model.test.js
node tests/vite-chat-event-source-client.test.js
node tests/vite-chat-event-stream-adapter.test.js
node tests/vite-focus-lifecycle-guard.test.js
node tests/vite-chat-runtime-model.test.js
node tests/vite-chat-runtime-island.test.js
node tests/vite-runtime-facade.test.js
node tests/app-runtime-facade-ui.test.js
node tests/composer-event-contract.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-refresh-scheduler.test.js
node tests/run-progress-ui-behavior.test.js
node tests/run-liveness.test.js
node tests/message-scroll-button-visibility.test.js
node tests/keyboard-focus-guard-ui.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## Global Usage Audit

Phase 2 now has a source-level unmanaged-global guard:
`scripts/vite-global-usage-audit.js`.

The Vite runtime facade now imports its state and event primitives from
`src/vite-app/runtime/runtime-state-event-bus.mjs`. That module is the
source-only ESM boundary for cross-module state and event coordination:
direct and wildcard subscribers, bounded recent-event snapshots, handler
failure isolation, and state patch/update/replace events. The compatibility
exports remain available through `home-ai-runtime-facade.mjs` so existing Vite
islands keep the same `runtime.events` and `runtime.state` API while future
slices can import the state/event boundary directly.

The audit scans the Vite source roots and any classic modules that have joined
the runtime-facade migration. The current target set is:

- `src/vite-app/`
- `src/vite-islands/`
- `public/app-runtime-facade-ui.js`
- `public/app-ai-ops-diagnostics-ui.js`
- `public/app-owner-system-console-ui.js`
- `public/app-voice-input-ui.js`
- `public/app-task-preview-helpers-ui.js`
- `public/app-task-preview-ui.js`
- `public/directory-viewer.html`

The allowlist is intentionally stored in the script with an owner, reason, and
removal trigger for each entry. It currently permits only these compatibility
categories:

- the single `HomeAiRuntimeFacade` classic/Vite bridge;
- AI Ops diagnostic feedback classic global export while it remains a static
  script module;
- development-only Vite preview hooks;
- runtime-facade-owned auth/API access to storage, cookies, fetch, and Home AI
  auth/client-version headers;
- classic runtime-facade bootstrap ownership of temporary classic-shell
  fetch/storage/cookie access;
- classic runtime-facade bootstrap access to `HermesAppApiClient` while
  independent classic entrypoints need a facade-owned API client;
- Owner Console view-mode persistence through the runtime facade route/state
  bridge;
- preview-host static manifest fetch;
- classic API client factory delegation;
- native shell capability detection in the ESM and classic runtime facades;
- voice-input `AudioContext` selection while audio capture still lives in the
  classic shell;
- document-preview helper access through the runtime facade only; no direct
  authenticated fetch or `X-Hermes-Web-Key` construction is allowed in the
  preview helper.
- directory viewer's early theme bootstrap, while directory API/auth access is
  forced through the runtime facade.
- directory viewer's classic `TaskDocumentPreviewUi` bridge while preview UI is
  still a static-script global.
  classic voice module.

Any new `window.state`, unregistered custom `window.*` / `globalThis.*`
property, direct storage access, direct API fetch, direct Home AI auth header,
or native bridge global in the audited target set fails the audit unless it is
added to the allowlist with an explicit owner and removal path.

Validation:

```sh
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## PWA / Web Push Status Island

This development-only slice adds a Vite PWA / Web Push status island for Phase
7 parity work before production Service Worker, PWA install, or Web Push
ownership moves. It models the classic top-bar push button and support checks as
explicit ESM state:

- source entry: `src/vite-islands/pwa-push-status/main.mjs`;
- pure model: `src/vite-islands/pwa-push-status/model.mjs`;
- dev source page: `src/vite-islands/pwa-push-status/index.html`;
- dev server route: `/vite-pwa-push-status-preview/`;
- built preview page: `public/vite-preview/pwa-push-status.html`;
- built artifact: `public/vite-islands/pwa-push-status/pwa-push-status.js`;
- guard test: `tests/vite-pwa-push-status-island.test.js`.

The model owns Web Push capability normalization, notification-permission
state, iOS standalone/PWA-window gating, server-public-key availability,
button plan state, and bounded delivery summary formatting. The preview uses
only explicit fixture state and `HomeAiRuntimeFacade.feedback`; it must not call
`Notification.requestPermission()`, register a Service Worker, subscribe a real
PushManager, fetch push endpoints, or replace the classic production PWA push
module until a separate production cutover has Owner approval and real device
readback.

Focused validation:

```sh
npm run build:vite
node tests/vite-pwa-push-status-island.test.js
node tests/vite-app-preview-host.test.js
node tests/vite-dev-preview-routes-smoke.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
```

## Development Readiness Gate

The source-only Vite development readiness check is
`scripts/vite-development-readiness-check.js`. Run it after building preview
assets:

```sh
npm run build:vite
npm run check:vite-cache-policy
npm run check:vite-readiness
node tests/vite-development-goal-audit.test.js
npm run audit:vite-dev-goal
node tests/vite-owner-review-report.test.js
npm run review:vite-cutover
node tests/vite-production-cutover-preflight.test.js
npm run plan:vite-cutover
node tests/vite-production-cutover-handoff-packet.test.js
npm run packet:vite-cutover
node tests/vite-owner-approval-request.test.js
npm run request:vite-cutover-approval
node tests/vite-goal-state-audit.test.js
npm run audit:vite-goal
node tests/vite-cutover-source-change-validator.test.js
npm run validate:vite-cutover-source
node tests/vite-production-readback-validator.test.js
node tests/vite-dev-preview-routes-smoke.test.js
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
```

The gate verifies the Vite preview routes, local backend proxy boundary,
source modules, focused tests, docs, built preview artifacts, and the
production-shell exclusion rule, including an explicit ban on
`/vite-plugin-host-preview/` references from `public/index.html` or
`public/service-worker.js`. `npm run check:vite-cache-policy` is the focused
source-only cache-policy companion. It verifies that built preview HTML points
only at `/vite-islands/` assets, that Vite manifest assets exist, that preview
HTML does not carry runtime API/secret markers, and that the classic production
shell does not reference preview assets. It intentionally reports
`productionCutoverCacheReady=false`; deterministic non-content-fingerprinted
entry assets remain a cutover residual, not a development-target failure. The
dev-preview route smoke starts the Vite dev server and opens every preview route
in a Playwright mobile viewport, checking root rendering, console/page errors,
and horizontal overflow. A passing result is Owner review evidence for the
development target only. It is not production cutover evidence and does not
authorize deployment, Service Worker cache migration, or changing `/` away from
the classic shell.

`npm run review:vite-cutover` is the maintained Owner review report. It
combines the readiness check and cutover preflight into one source-only JSON
payload, records that production writes and deployment are false, and lists the
exact Owner approval text required before a separate cutover source change can
be created.

`npm run plan:vite-cutover` is the source-only preflight for the next boundary.
It records that production writes are disabled and fails closed without the
exact Owner approval text from
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`. With that text
it still does not deploy; it only reports that a separate fail-closed cutover
source change may be created.

`npm run packet:vite-cutover` is the source-only handoff packet for that later
boundary. It creates no task card and performs no production writes. With exact
Owner approval it produces only a non-sendable deploy-lane draft until the
separate cutover source change exists and passes validation.

`npm run request:vite-cutover-approval` is the source-only request package for
the Owner approval boundary. It verifies development acceptance, review
readiness, and the blocked handoff-packet state, then emits the exact approval
text without creating a production change, Worker card, or deployment.

`npm run audit:vite-goal` is the source-only final goal-state audit. It reports
`goal_incomplete` until bounded evidence proves development acceptance, exact
Owner approval, cutover source-change validation, deploy-lane packet state, and
production readback. It does not deploy or send task cards.

`npm run validate:vite-cutover-source` is the source-only validator for the
future cutover source-change contract. In the current unapproved repository it
must report `cutover_source_change_not_created`; after exact Owner approval it
must be run with `--contract-json <file> --require-ok` against the separate
fail-closed source change before any production deploy-lane card is sent.

`npm run validate:vite-cutover-readback` is the source-only validator for the
future deploy-lane return. It requires a bounded readback JSON and verifies
that every required production readback id is present, passed, and privacy
confirmed without executing deployment.
