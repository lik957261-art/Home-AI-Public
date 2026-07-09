# Full Home AI Frontend Vite Migration Target

## Objective

Migrate the Home AI primary frontend from the ordered static
`public/index.html` plus `public/app-*.js` shell into a Vite-built frontend in
small, reversible stages. All implementation and validation for this target is
development-environment only. Production deployment and production default-shell
cutover are explicitly out of scope until the development target is completed
and reviewed.
Production deployment and production default-shell cutover are explicitly out
of scope for the development readiness check. Owner review is required before a
separate production cutover target can be written or executed.

## Non-Goals

- Do not replace production `/` with a Vite shell in this target.
- Do not remove the classic `public/index.html` boot path while migration is in
  progress.
- Do not run `deploy:macos --execute` or any production deployment command for
  this target.
- Do not migrate backend routes, Gateway behavior, plugin service contracts, or
  Owner permission semantics unless they are required to expose stable frontend
  APIs.
- Do not hide runtime gaps behind silent fallbacks. Any compatibility bridge
  must emit bounded evidence.

## Success Criteria

The development migration target is complete when:

- a Vite-built Home AI app preview can run the full primary shell in local
  development without using the classic ordered script chain;
- the production runtime shell remains Vite-only; local development can use
  source history and local preview routes for comparison, not a Classic runtime
  fallback;
- `config/home-ai-shell-mode.json` remains `vite` with the approved production
  cutover version, and `npm run check:vite-readiness` fails if the config asks
  for Classic or omits the cutover version;
- chat navigation, Composer, SSE/event streaming, task/topic views, Owner
  System Console, feedback menu, voice input, document preview, file delivery,
  plugin iframe hosting, PWA update flow, and iOS native shell bridge scenarios
  pass focused local harnesses;
- plugin iframe hosting includes a Vite-side resident iframe lifecycle model
  that preserves already loaded iframes on token-only refreshes, preserves
  visible/loaded iframes during navigation-health timeout checks, and recovers
  only still-loading timed-out iframes in development harnesses;
- the Vite app does not reach into unmanaged global shell state except through
  documented compatibility adapters that have removal tickets;
- static cache/version behavior is test-covered for Vite preview assets and the
  Vite-only production root shell;
- rollback for production shell mistakes is source/deploy rollback through Git
  history and deployment backups, not a same-runtime Classic switch;
- a separate production cutover proposal can be generated with concrete
  readback and rollback evidence.
- a separate production cutover source-change contract can be validated with
  `npm run validate:vite-cutover-source` before any production deploy-lane
  card is sent.
- the final objective state can be audited with `npm run audit:vite-goal`,
  which must stay `goal_incomplete` until bounded development acceptance,
  Owner approval, source-change validation, and production readback evidence
  are all supplied.
- a source-only development acceptance packet can be generated with
  `npm run packet:vite-dev`; the packet must include scope, migrated
  development surfaces, remaining production surfaces, an Audit Packet, a
  Delta Matrix, validation summary, and risk register.
- the source-only development target can be audited with
  `npm run audit:vite-dev-goal`; this proves the development migration target
  only and must not be treated as production cutover approval or production
  readback evidence.
- source-only browser user-journey smoke can be run with
  `npm run smoke:vite-dev-user-journeys`; it must cover Composer send,
  file/camera attachment without main-frame refresh, server-file attachment,
  native/system share attachment, Codex iframe rendering, Owner System Console,
  PDF/PPTX document preview policy, and voice pending cancel in the Vite dev
  preview.
- Dialog Sheet confirm/prompt/message behavior has an ESM island with a Vite
  dev preview and focused model/runtime harness coverage before any production
  dialog owner is replaced.
- Toast/status feedback behavior has an ESM island with a Vite dev preview and
  focused model/runtime harness coverage before any production PWA toast owner
  is replaced.
- PWA/Web Push status behavior has an ESM island with a Vite dev preview and
  focused capability/button-plan harness coverage before any production
  Service Worker, install, or push owner is replaced.

## Migration Principles

- Keep legacy compatibility owners test-covered until Vite parity is
  demonstrated.
- Prefer ES modules and explicit imports over broad globals.
- Move shared frontend state behind a typed or documented client runtime facade
  before bundling modules.
- Keep Home AI APIs as the integration boundary; frontend modules should not
  bypass service/route contracts.
- Treat iOS WebView behavior as a first-class acceptance surface, especially
  focus lifecycle, keyboard, audio recording, upload, preview, and safe-area
  behavior.
- Preserve Owner-only permission behavior exactly. A Vite route must fail closed
  with bounded UI when access is missing.
- Keep all phase outputs inspectable through local dev URLs and focused tests.

## Post-Cutover ESM Completion Plan

The production Vite cutover is currently a transitional bootstrap. It proves
that production can select and read back a Vite-built bootstrap while preserving
the classic business shell. It does not complete the ESM migration of chat,
Composer, task/topic navigation, plugin iframe hosting, document preview,
voice recording, attachments, PWA cache/update, or Service Worker behavior.

The next ESM work should proceed in small replacement slices. Each slice must
have an importable module, a classic compatibility adapter, focused tests, a
Vite preview or fixture harness when visual/user-flow behavior is involved,
and a rollback path that leaves the previous classic owner intact until the
slice is proven.

### Stage A - Stabilize Post-Cutover Operations

Goal: make the current Vite-only production shell state easy to verify and roll
back through source/deploy recovery.

Tasks:

- Keep `config/home-ai-shell-mode.json` as the explicit Vite-only shell config.
- Use `npm run check:vite-production` for post-cutover status checks.
- Keep `npm run check:vite-readiness` as the development-target gate for future
  ESM slices, not as a production health check.
- Preserve Classic request probes such as `?homeAiShellMode=classic` only to
  verify that they are ignored. Document source/deploy rollback through
  Git/source history and deployment backups.

Acceptance:

- `npm run check:vite-production -- --base <home-ai-origin> --require-ok`
  passes in production or staging.
- The classic request override returns no production Vite bootstrap.
- The status command reports `productionWrites=false` and
  `deployExecuted=false`.

### Stage B - ESM Ownership Inventory And Allowlist Burn-Down

Goal: turn remaining classic globals into a tracked migration backlog.

Tasks:

- Regenerate and update the static client boot inventory.
- Generate the staged ESM backlog:

  ```sh
  npm run plan:vite-esm -- --write
  ```

  This writes `docs/IMPLEMENTATION_NOTES/vite-esm-migration-backlog.md` from
  the current boot inventory and Vite global-usage audit. The backlog is
  source-only evidence; it reports `productionWrites=false` and
  `deployExecuted=false`.
- Expand `scripts/vite-global-usage-audit.js` to cover each classic module as
  it enters migration scope.
- Assign every remaining `window.*`, `localStorage`, direct `fetch`,
  `document.cookie`, native bridge, Service Worker, and file input boundary to
  either the runtime facade or a specific module migration ticket.
- Fail new unmanaged globals unless an explicit temporary owner is documented.

Acceptance:

- `node tests/vite-esm-migration-backlog.test.js` passes.
- The generated backlog script count and script-order hash match
  `docs/IMPLEMENTATION_NOTES/static-client-boot-inventory.md`.
- Stage C candidates are limited to explicit low-risk adapter files; broad
  Stage D workflow files must not be pulled into Stage C only because they
  contain confirm/delete/status function names.

Suggested order:

1. Composer send/input controller.
2. Attachment selection and upload controller.
3. Task/topic route and cached root renderer.
4. Chat thread readback and message list renderer.
5. SSE/run-status event projection.
6. Plugin host iframe lifecycle adapter.
7. Document/file preview adapter.
8. Voice session and audio capture adapter.
9. PWA install/update and Service Worker cache policy.

### Stage C - Low-Risk Production Adapter Replacements

Goal: replace isolated ordered-shell surfaces with imported ESM modules while
keeping the production compatibility document as the host.

Candidate first replacements:

- Owner System Console renderer.
- Toast/status feedback renderer.
- Dialog sheet/prompt/confirm renderer.
- AI Ops feedback menu and Owner console shortcut.
- PWA/Web Push status button model.

Acceptance per replacement:

- The production compatibility adapter imports or delegates to the same ESM
  model used by the Vite preview.
- Focused compatibility UI tests and island tests both pass.
- Non-Owner and unauthenticated paths fail closed with bounded UI.
- Static cache version and Service Worker behavior are unchanged unless the
  slice explicitly owns a cache change.

### Stage D - Core Workflow ESM Modules

Goal: migrate primary user workflows behind importable controllers while the
production compatibility document still provides the container.

Priority order:

1. Attachment/camera/file selection because it has recent iOS refresh
   regressions and clear controller boundaries.
2. Composer send and run-status projection.
3. Task/topic navigation and cached root rendering.
4. Chat message list/readback.
5. Plugin host resident iframe lifecycle.
6. Document/file preview and native bridge strategy.
7. Voice recording lifecycle.

Acceptance per workflow:

- The ESM controller owns business state transitions; the classic adapter only
  mounts DOM and forwards events.
- The workflow passes both source-only model tests and at least one DOM/browser
  harness for mobile viewport behavior when applicable.
- Existing production readback or smoke coverage remains valid.
- Rollback is disabling that adapter/import, not reverting unrelated source.

### Stage E - Full Vite Shell Replacement

Goal: replace the classic ordered script chain as the production business shell.

Entry criteria:

- All core workflows above have ESM controllers and classic adapters with
  green harness coverage.
- `public/index.html` ordered script dependencies are reduced to bootstrap,
  compatibility shims, or removed.
- Service Worker and static-cache policy explicitly cover the Vite shell,
  hashed assets, rollback cache, and update prompt behavior.
- PWA/iOS native shell scenarios pass local and production/staging readback:
  keyboard focus, camera/file upload without main-frame refresh, system share,
  document preview/open-in, voice pending cancel, plugin iframe persistence,
  Codex embed, Owner Console, and chat/SSE.

Exit criteria:

- A new source-change contract proves the full Vite shell, not only the
  transitional bootstrap.
- Central Mac deploy/readback verifies the Vite business shell in production.
- No same-runtime Classic fallback remains reachable; recovery uses the
  source/deploy rollback plan.

## Phase 0 - Inventory And Dependency Graph

Goal: make the existing frontend boot graph explicit before moving files.

Tasks:

- Generate an ordered inventory of `public/index.html` script tags, global
  symbols produced/consumed by each `public/app-*.js` file, and DOM roots owned
  by each module.
- Classify modules into groups:
  - foundation: platform helpers, API client, state, DOM helpers;
  - runtime: SSE, run lifecycle, startup, cache, navigation;
  - surfaces: chat, topics, tasks, Owner console, diagnostics, settings;
  - input: Composer, voice, attachments, keyboard/focus guards;
  - plugin host: embedded plugin iframe, bridge, manifest, launch recovery;
  - viewers: directory viewer, document preview, Markdown/PPTX/file delivery;
  - PWA/native: service worker, install/update prompt, iOS native bridge.
- Identify browser globals that must become imports or runtime-facade fields.
- Record any non-module-safe side effects during import.

Acceptance:

- Add a generated or hand-maintained inventory document under
  `docs/IMPLEMENTATION_NOTES/`.
- Add a focused test that fails if `public/index.html` script ordering changes
  without updating the inventory.
- No runtime behavior changes.

Implementation artifacts:

- Inventory generator: `scripts/static-client-boot-inventory.js`.
- Inventory document: `docs/IMPLEMENTATION_NOTES/static-client-boot-inventory.md`.
- Guard test: `tests/static-client-boot-inventory.test.js`.
- Regenerate with `npm run inventory:static-client`.

Suggested validation:

```sh
node tests/static-client-boot-inventory.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
npm run check
git diff --check
```

## Phase 1 - Vite App Preview Host

Goal: create a full-app Vite preview host that can run locally next to the
Vite-only production root shell.

Tasks:

- Add a Vite entry under `src/vite-app/` for the full Home AI shell preview.
- Add a dev-only preview HTML route, for example
  `src/vite-app/index.html`, and a built preview page under `public/` only if
  needed for static server validation.
- Keep the production root shell Vite-only while using preview routes for local
  development.
- Add a route or static path that makes the preview easy to open in local
  development without changing production `/`.
- Add build metadata for preview artifacts: build id, source ref if available,
  asset manifest path, and Vite-only shell state.

Acceptance:

- `npm run dev:vite` opens a Vite app preview.
- `npm run build:vite` emits deterministic preview assets.
- The production root shell remains Vite-only and is not imported by the Vite
  preview as raw ordered script tags.
- Preview failure shows a bounded error state instead of a blank page.

Implementation artifacts:

- Source preview page: `src/vite-app/index.html`, served at
  `/vite-app-preview/` by Vite dev middleware.
- Source preview entry: `src/vite-app/main.mjs`.
- Dev server route: `/vite-app-preview/`.
- Built preview page: `public/vite-preview/home-ai-app.html`.
- Built preview artifact:
  `public/vite-islands/home-ai-app-preview/home-ai-app-preview.js`.
- Guard test: `tests/vite-app-preview-host.test.js`.

Suggested validation:

```sh
npm run build:vite
node tests/vite-app-preview-host.test.js
node tests/vite-owner-system-console-island.test.js
node tests/vite-development-acceptance-packet.test.js
node tests/static-cache-version-harness.test.js
npm run check
git diff --check
```

## Phase 2 - Runtime Facade And Global State Reduction

Goal: create explicit module boundaries before moving high-risk UI.

Tasks:

- Introduce a frontend runtime facade for API client, auth/access-key handling,
  app state, event bus, toast/feedback, route state, and native bridge calls.
- Refactor low-risk modules to consume the facade while still running in the
  production compatibility document.
- Add tests that prove the facade works in both compatibility and Vite preview
  modes.
- Track remaining global reads/writes with an allowlist and owner.

Acceptance:

- No new module may introduce unmanaged `window.state`, cross-file globals, or
  implicit boot-order requirements without an explicit allowlist entry.
- The facade can be imported by Vite code and attached for classic compatibility.
- Existing Owner/non-Owner permission behavior is unchanged.

Implementation artifacts:

- Runtime facade source:
  `src/vite-app/runtime/home-ai-runtime-facade.mjs`.
- Runtime state/event bus source:
  `src/vite-app/runtime/runtime-state-event-bus.mjs`.
- Global usage audit:
  `scripts/vite-global-usage-audit.js`.
- Global usage audit test:
  `tests/vite-global-usage-audit.test.js`.
- The facade owns explicit browser/runtime integration points for:
  access-key storage and cookie sync, API requests, client-version headers,
  state snapshots, event fanout, feedback/status events, route changes, and
  bounded native-shell capability detection.
- The Vite app preview imports the facade from `src/vite-app/main.mjs` and
  attaches it as `window.HomeAiRuntimeFacade` for classic-shell compatibility.
  This is the only Phase 2 compatibility global introduced by the Vite
  migration.
- Guard test: `tests/vite-runtime-facade.test.js`.
- State/event bus guard test:
  `tests/vite-runtime-state-event-bus.test.js`.

Current compatibility allowlist:

- `window.HomeAiRuntimeFacade`: temporary classic/Vite bridge owned by the
  Static Client Vite migration. It must not be used to create a parallel
  unmanaged `window.state` object.
- `window.HomeAIViteAppPreview`: development preview host control hook owned by
  the Vite preview. It is not loaded by production `public/index.html`.
- `window.HomeAIViteOwnerSystemConsolePreview`: development preview control
  hook for the Owner System Console island.
- `window.HomeAIViteAiOpsFeedbackPreview`: development preview control hook for
  the AI Ops feedback menu island.
- `window.HomeAIViteToastStatusPreview`: development preview control hook for
  the Toast / Status feedback island.
- `window.HomeAIVitePwaPushStatusPreview`: development preview control hook for
  the PWA / Web Push status island.
- Runtime-facade-owned auth/API globals: `localStorage`, `document.cookie`,
  `fetch`, `X-Hermes-Web-Key`, and `X-Hermes-Web-Client-Version` are allowed
  only inside `src/vite-app/runtime/home-ai-runtime-facade.mjs`.
- Compatibility runtime-facade bootstrap browser boundary: `fetch`, `localStorage`,
  `X-Hermes-Web-Key`, and `document.cookie` are allowed only inside
  `public/app-runtime-facade-ui.js` while the production ordered shell still
  loads ordered static scripts. This bootstrap attaches
  `window.HomeAiRuntimeFacade` before migrated compatibility consumers run, so those
  consumers do not own direct browser storage or keepalive transport calls.
- Classic Owner Console view-mode persistence now goes through
  `runtime.route.setViewMode()` / `runtime.route.getViewMode()`. The ESM
  facade and classic bootstrap own the temporary `hermesWebViewMode` storage
  boundary; `public/app-owner-system-console-ui.js` must not access
  `localStorage` directly.
- Vite preview static manifest fetch: direct `fetch()` is allowed only in
  `src/vite-app/main.mjs` for static Vite manifest metadata.
- Classic API client compatibility: `HermesAppApiClient` is allowed only inside
  the ESM runtime facade and the classic runtime-facade bootstrap while the
  classic API client factory is still the bridge.
- Native shell capability detection: `HomeAINativeBridge`,
  `HermesNativeBridge`, `HomeAINativeVoice`, `HomeAIVoiceInput`,
  `HomeAINativeVoiceInput`, `HomeAINativeVoiceInputCapability`,
  `HomeAINativeShareCapability`, `HomeAINativeShare`, and `webkit` are allowed
  only inside the runtime facade. The same allowlist covers the classic
  bootstrap facade while `public/index.html` remains the production shell.
- Voice audio capture selection: `AudioContext` is allowed only in
  `public/app-voice-input-ui.js` until voice recording moves behind an imported
  Vite voice/audio capture adapter.
- Document preview entrypoints must load `app-api-client.js` and
  `app-runtime-facade-ui.js` before `app-task-preview-helpers-ui.js`. The
  helper no longer owns a direct authenticated `fetch` fallback or its own
  `X-Hermes-Web-Key` header construction; missing facade/API wiring must fail
  visibly instead of silently recreating the auth boundary.
- Vite dev preview API mocks may exist only inside the Vite dev server. They
  must return metadata-only fixture payloads with an explicit mock marker, must
  not be wired into `server.js`, and must not be treated as production Owner
  permission/readback evidence.

Current status:

- Phase 2 has the facade and preview-host wiring in place.
- The Owner System Console Vite island now consumes the runtime facade for
  API/auth/client-version access and publishes bounded load state through the
  facade event/state surfaces. Its pure rendering/error model lives in
  `src/vite-islands/owner-system-console/model.mjs`, which owns bounded
  Chinese UI text, status labels, HTML escaping, and non-Owner permission
  errors while `main.mjs` stays limited to runtime and DOM glue.
- The classic `public/app-owner-system-console-ui.js` module now optionally
  consumes `window.HomeAiRuntimeFacade.api` when the compatibility facade is
  present, while preserving the existing classic `api()` fallback and Owner
  permission gate.
- The classic `public/app-ai-ops-diagnostics-ui.js` module is the second Phase
  2 consumer. It uses the runtime facade for diagnostic API submission,
  event/state projection, bounded feedback/status events, plugin diagnostic
  transport, and plugin conversation action dedupe state. The direct
  keepalive-fetch and localStorage dedupe compatibility items were moved into
  the runtime-facade boundary.
- Host Voice Input is now the next Phase 2 classic consumer. The runtime facade
  owns native voice-shell detection, `homeAI` native bridge posting, remembered
  microphone grant/status-panel storage, request ids, and native callback
  registration. `public/app-voice-input-ui.js` consumes
  `window.HomeAiRuntimeFacade.native` for those boundaries and must not own
  direct `localStorage`, `window.webkit.messageHandlers.homeAI.postMessage`,
  `window.HomeAINativeVoiceInputCapability`, or
  `window.HomeAINativeVoiceInput` access.
- A development-only Voice Input status island now exists as an early Phase 5
  boundary slice. `src/vite-islands/voice-input-status/model.mjs` owns the
  pure status label/detail/cancelability, pending guard, terminal auto-hide,
  and native-status normalization rules.
  `src/vite-islands/voice-input-status/session-controller.mjs` owns the next
  pure lifecycle layer: begin press, short-press cancel, long-press threshold,
  release-to-stop, pending guard timeout, native terminal status, and terminal
  auto-hide effects. `main.mjs` renders a preview-only state panel through the
  runtime facade, without microphone capture, `MediaRecorder`, authenticated
  fetch, Composer writes, or production shell references.
- Task/document preview helpers are now another Phase 2 classic consumer. The
  runtime facade owns authenticated document preview blob fetches through
  `documentPreview.fetchBlob()`, and the preview helper uses `runtime.api` for
  preview JSON requests when available. Markdown preview overlay text now flows
  through that helper API path instead of constructing a second authenticated
  fetch in `public/app-task-preview-ui.js`.
- A development-only Document Preview island now exists at
  `src/vite-islands/document-preview/`. Its pure
  `model.mjs` owns Markdown/image/document classification, Markdown preview API
  routing, PDF/Word/PPTX/spreadsheet/text kind normalization, same-origin
  viewer/native URL construction, mobile in-app overlay policy, and native
  document request metadata such as `kind=powerpoint` for PPTX. `main.mjs`
  renders bounded fixture evidence for Markdown, PPTX, DOCX, PDF, image, and
  unsupported external files at `/vite-document-preview-preview/` and
  `public/vite-preview/document-preview.html`. This is read-only development
  evidence; it does not fetch blobs, call native bridges, download/share files,
  or replace the production classic `TaskDocumentPreviewUi` overlay.
- Task/document preview also routes the remaining workspace/native-shell
  browser state through the facade. `public/app-task-preview-helpers-ui.js`
  must not read `localStorage.hermesWebWorkspace`; it uses
  `runtime.state.selectedWorkspaceId`, classic `state.selectedWorkspaceId`,
  then the bounded `owner` fallback. `public/app-task-preview-ui.js` must not
  read `localStorage.homeAI.nativeShell`; it uses
  `runtime.native.nativeShellParam()` and preserves the existing
  `ios`/`android` URL and dataset fallback behavior for document-preview return
  paths.
- The directory viewer is now wired into the same preview entry boundary: it
  loads the classic API client, runtime facade, preview helper, and preview UI
  in that order before its inline directory logic runs.
- The classic runtime-facade bootstrap can create `facade.api` from
  `HermesAppApiClient.createApiClient()` when an independent entrypoint does
  not provide the main shell's `window.api`.
- Directory viewer's own directory load/create/upload/delete calls now use
  `HomeAiRuntimeFacade.api` instead of constructing `X-Hermes-Web-Key` or
  calling `fetch()` directly. Its early `hermesWebTheme` read remains as a
  narrow first-paint theme bootstrap and is tracked by the global usage audit.
  Its temporary `TaskDocumentPreviewUi` access is also audited as the classic
  preview overlay bridge until both viewer and preview UI are imported modules.
- Vite preview routes have dev-only API mocks for
  `/api/owner/system-console` and
  `/api/owner/system-console/system-status`, plus
  `/api/threads/thread_vite_navigation_preview` for the navigation shell's
  read-only thread preview. They are implemented through
  `adapters/vite-dev-preview-api-mock-service.js` and Vite middleware only.
  The mocks exist so local preview pages can be console-clean without a running
  Home AI backend; they return bounded fixture status/data and are not
  production permission or readback evidence.
- Vite preview routes can also be run against an isolated local Home AI backend
  with `HOMEAI_VITE_DEV_BACKEND_PROXY=1` and
  `HOMEAI_VITE_DEV_BACKEND_BASE=http://127.0.0.1:<port>`. The real-backend
  parity smoke uses a temporary data dir, temporary Gateway Pool manifest, and
  local fake Gateway worker to verify real SSE, no-Gateway group-chat `plain`
  send, AI Composer send through the real Gateway runner, and interrupt through
  the real active-stream stop path. This remains development-only transport
  evidence and does not authorize production shell cutover.
- `scripts/vite-global-usage-audit.js --json` reports the tracked global
  occurrences, their allowlist owners, and any unmanaged findings. The current
  audited target set is `src/vite-app/`, `src/vite-islands/`,
  `public/app-runtime-facade-ui.js`,
  `public/app-owner-system-console-ui.js`,
  `public/app-ai-ops-diagnostics-ui.js`,
  `public/app-voice-input-ui.js`,
  `public/app-task-preview-helpers-ui.js`, and
  `public/app-task-preview-ui.js`, and
  `public/directory-viewer.html`.
- Remaining Phase 2 work is to keep expanding the audited target set as
  additional classic modules adopt the facade and to continue reducing
  classic-shell browser globals to the runtime-facade boundary.
- Phase 3 has started with the AI Ops feedback menu as the first low-risk Vite
  island surface. This does not replace the classic three-finger feedback menu
  in production; it gives the migration a dev-only, facade-backed version of
  the same feedback/menu/Owner-console-shortcut contract.

Suggested validation:

```sh
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
node tests/vite-runtime-facade.test.js
node tests/vite-owner-system-console-island.test.js
node tests/vite-owner-system-console-model.test.js
node tests/vite-dev-preview-api-mock-service.test.js
node tests/vite-voice-input-status-island.test.js
node tests/ai-ops-diagnostic-feedback-ui.test.js
node tests/voice-input-ui.test.js
node tests/task-list-ui.test.js
node tests/owner-system-console-ui.test.js
npm run build:vite
npm run check
git diff --check
```

## Phase 3 - Low-Risk Surface Migration

Goal: move isolated UI surfaces into Vite-owned modules before migrating the
core chat runtime.

Candidate surfaces:

- Owner System Console.
- AI Ops Diagnostics panels.
- Settings subpanels that do not own Composer or streaming state.
- Feedback menu rendering and Owner-only console shortcut.
- Toast/status feedback rendering.
- Static utility panels with API-only data dependencies.

Tasks:

- Move each surface into `src/` modules with explicit imports.
- Keep a classic adapter that mounts the migrated surface in the existing shell.
- Add Vite preview coverage for each surface.
- Keep user-facing copy Chinese for Owner-facing surfaces.

Acceptance:

- Each migrated surface runs in both the compatibility adapter and Vite preview.
- No migrated surface relies on implicit script order.
- Non-Owner access is denied with bounded UI where applicable.

Current implementation artifacts:

- AI Ops feedback menu island:
  `src/vite-islands/ai-ops-feedback/main.mjs`,
  `src/vite-islands/ai-ops-feedback/model.mjs`,
  `src/vite-islands/ai-ops-feedback/style.css`, and
  `src/vite-islands/ai-ops-feedback/index.html`.
- Dev server route: `/vite-ai-ops-feedback-preview/`.
- Built preview page: `public/vite-preview/ai-ops-feedback.html`.
- Built artifact:
  `public/vite-islands/ai-ops-feedback/ai-ops-feedback.js`.
- Guard test: `tests/vite-ai-ops-feedback-island.test.js`.
- Voice input status island:
  `src/vite-islands/voice-input-status/main.mjs`,
  `src/vite-islands/voice-input-status/model.mjs`,
  `src/vite-islands/voice-input-status/audio-capture-adapter.mjs`,
  `src/vite-islands/voice-input-status/session-controller.mjs`,
  `src/vite-islands/voice-input-status/style.css`, and
  `src/vite-islands/voice-input-status/index.html`.
- Voice status dev server route: `/vite-voice-input-status-preview/`.
- Voice status built preview page:
  `public/vite-preview/voice-input-status.html`.
- Voice status built artifact:
  `public/vite-islands/voice-input-status/voice-input-status.js`.
- Voice status guard test:
  `tests/vite-voice-input-status-island.test.js`.
- Voice session controller guard test:
  `tests/vite-voice-input-session-controller.test.js`.
- Voice audio capture adapter guard test:
  `tests/vite-voice-audio-capture-adapter.test.js`.

The island uses the runtime facade for API submission, state, event fanout,
route inspection, feedback status, and native capability metadata. It builds a
bounded diagnostic payload for `/api/v1/home-ai/diagnostics/events`, strips
unsafe route parameters such as launch tokens, and exposes the Owner System
Console shortcut only when the preview state is Owner and the shell capability
exists. It is development-only and is not referenced by production
`public/index.html` or `public/service-worker.js`.

Suggested validation:

```sh
npm run build:vite
node tests/vite-ai-ops-feedback-island.test.js
node tests/vite-voice-audio-capture-adapter.test.js
node tests/vite-voice-input-session-controller.test.js
node tests/vite-voice-input-status-island.test.js
node tests/owner-system-console-ui.test.js
node tests/ai-ops-diagnostic-feedback-ui.test.js
node tests/voice-input-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
git diff --check
```

## Phase 4 - Navigation, Topics, Tasks, And Cache Shell

Goal: migrate the primary navigation frame without changing the core chat
Composer or streaming transport yet.

Tasks:

- Move primary tabs, route selection, Topics root, task list, and cached shell
  rendering into Vite modules.
- Keep chat detail rendering behind a compatibility mount until Phase 5.
- Preserve cached-render behavior for topic roots and task lists.
- Add compatibility route patches that can re-open the same route through the
  production root shell during development.

Acceptance:

- Tab switching, Topics root, directory-bound topics, task lists, and cached
  surface recovery match classic behavior.
- Back/forward browser navigation and iOS shell navigation remain stable.
- No duplicate render of cached task lists or topic root shells.

Current implementation artifacts:

- Navigation shell island:
  `src/vite-islands/navigation-shell/main.mjs`,
  `src/vite-islands/navigation-shell/model.mjs`,
  `src/vite-islands/navigation-shell/task-topic-shell-model.mjs`,
  `src/vite-islands/navigation-shell/task-topic-compatibility-adapter.mjs`,
  `src/vite-islands/navigation-shell/task-topic-root-renderer.mjs`,
  `src/vite-islands/navigation-shell/task-topic-action-model.mjs`,
  `src/vite-islands/navigation-shell/task-topic-cache-reconciliation-model.mjs`,
  `src/vite-islands/navigation-shell/task-topic-data-source.mjs`,
  `src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs`,
  `src/vite-islands/navigation-shell/route-sync-model.mjs`,
  `src/vite-islands/navigation-shell/style.css`, and
  `src/vite-islands/navigation-shell/index.html`.
- Navigation shell dev server route: `/vite-navigation-shell-preview/`.
- Navigation shell built preview page:
  `public/vite-preview/navigation-shell.html`.
- Navigation shell built artifact:
  `public/vite-islands/navigation-shell/navigation-shell.js`.
- Navigation shell guard test:
  `tests/vite-navigation-shell-island.test.js`.

The current Phase 4 slice is a development preview boundary only. It models
view-mode aliases, primary-tab selection, Owner-only console tab gating,
cached topic/task shell status, directory topic collection grouping, task-root
render signatures, imported task/topic root HTML rendering, classic
`taskListThread` cache compatibility, row-level topic action models,
development-preview URL/history synchronization, and a first read-only thread
data boundary for root and selected-topic refresh.
The compatibility adapter consumes the runtime state snapshot provided to the
Vite model; it must not read classic `window.state` directly. The row action
model maps directory, regular, and plugin topic rows to bounded route patches
and compatibility hrefs; the development preview applies those patches to
runtime state and Vite preview URL/history only. The data source builds the
existing read-only `GET /api/threads/:id?messageMode=tasks` request and loads it
only through the runtime facade API bridge; it does not construct auth headers
or call `fetch()` directly. It records selected `taskGroupId`, message mode,
and bounded message count, and topic-row activation plus browser history
restoration trigger the same scoped read path. The selected-view model consumes
the scoped read payload and exposes only bounded role/status/text-preview and
attachment/artifact/tool-call counts for a development preview detail panel; it
also preserves real thread-read pagination metadata by separating total message
count, loaded message count, `hasMoreBefore`, and oldest/newest message ids.
The cache reconciliation model keeps root and selected-topic readbacks in
separate state slots: root payloads update `taskListThread` and
`taskListRootCache`, while selected-topic payloads update
`taskTopicSelectedThread` and `taskTopicSelectedCache` without overwriting the
root topic list. Browser back to the root clears the selected-topic cache
instead of replaying stale detail payloads as the root shell.
Root reads do not render arbitrary task messages as selected-topic detail; a
selected `taskGroupId` is required for message-preview rows. It does not
migrate chat detail, Composer, SSE, or message actions. During local
Vite development,
the Vite dev server serves a metadata-only `thread_vite_navigation_preview`
fixture for this boundary. That fixture is local preview support, not
production permission or readback evidence. The route sync model parses only
bounded non-secret query
parameters, strips unrelated values, and is development-preview evidence only.
It does not
replace the production navigation code in
`app-automation-ui.js`, `app-wire-start-ui.js`, or
`app-thread-list-ui.js`, and it does not migrate chat detail, Composer, or SSE.

Suggested validation:

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
node tests/thread-state-ui-behavior.test.js
node tests/viewport-scroll-ui.test.js
node tests/vite-app-preview-host.test.js
node tests/vite-global-usage-audit.test.js
git diff --check
```

## Phase 5 - Chat Runtime, SSE, Composer, Voice, And Uploads

Goal: migrate the highest-risk interactive runtime only after navigation and
facade boundaries are stable.

Tasks:

- Move chat detail rendering, message diff/patch logic, run lifecycle state,
  SSE/event streaming, Composer, attachments, voice input, and keyboard/focus
  lifecycle into Vite modules.
- Preserve current voice pending-cancel behavior and ensure stale recording
  prompts can be canceled.
- Add explicit focus cleanup when Composer or overlays close.
- Preserve upload queue behavior and document/file preview routing.
- Keep the classic chat runtime available behind a local fallback switch until
  Vite parity passes.

Current implementation artifacts:

- Message action panel island:
  `src/vite-islands/message-action-panel/action-client.mjs`,
  `src/vite-islands/message-action-panel/main.mjs`,
  `src/vite-islands/message-action-panel/model.mjs`,
  `src/vite-islands/message-action-panel/style.css`, and
  `src/vite-islands/message-action-panel/index.html`.
- Message action panel dev server route:
  `/vite-message-action-panel-preview/`.
- Message action panel built preview page:
  `public/vite-preview/message-action-panel.html`.
- Message action panel built artifact:
  `public/vite-islands/message-action-panel/message-action-panel.js`.
- Guard tests:
  `tests/vite-message-action-panel-action-client.test.js`,
  `tests/vite-message-action-panel-model.test.js` and
  `tests/vite-message-action-panel-island.test.js`.
- Chat runtime event model island:
  `src/vite-app/runtime/focus-lifecycle-guard.mjs`,
  `src/vite-islands/chat-runtime/composer-api-client.mjs`,
  `src/vite-islands/chat-runtime/chat-detail-model.mjs`,
  `src/vite-islands/chat-runtime/composer-model.mjs`,
  `src/vite-islands/chat-runtime/event-stream-adapter.mjs`,
  `src/vite-islands/chat-runtime/live-event-source-client.mjs`,
  `src/vite-islands/chat-runtime/main.mjs`,
  `src/vite-islands/chat-runtime/model.mjs`,
  `src/vite-islands/chat-runtime/style.css`, and
  `src/vite-islands/chat-runtime/index.html`.
- Chat runtime dev server route:
  `/vite-chat-runtime-preview/`.
- Chat runtime built preview page:
  `public/vite-preview/chat-runtime.html`.
- Chat runtime built artifact:
  `public/vite-islands/chat-runtime/chat-runtime.js`.
- Chat runtime guard tests:
  `tests/vite-chat-composer-api-client.test.js`,
  `tests/vite-chat-composer-backend-contract.test.js`,
  `tests/vite-chat-composer-model.test.js`,
  `tests/vite-chat-detail-model.test.js`,
  `tests/vite-chat-event-source-client.test.js`,
  `tests/vite-chat-event-stream-adapter.test.js`,
  `tests/vite-focus-lifecycle-guard.test.js`,
  `tests/vite-chat-runtime-model.test.js` and
  `tests/vite-chat-runtime-island.test.js`.

The initial Phase 5 slice migrated message action metadata projection into a
pure Vite model for the Usage/footer area, starting with Wardrobe
`outfit_wear_intent` states (`ready`, `running`, `needs_confirmation`,
`stored`, `error`, and diagnostic-only blocked states). It mirrors the classic
Chinese labels such as `入库`, `已入库 #... · 已验证`, and `需重新生成`, and
accepts the same compatibility metadata locations used by the classic
renderer.

The current development-only parity slice adds a Vite action client and Vite
dev-server mock for the Wardrobe action route. In `npm run dev:vite`, the
preview can post the same body shape as the classic bridge to
`/api/plugin-conversation/actions/wardrobe/outfit-wear-intent`, observe a
`needs_confirmation` readback, and then post the `replace` confirmation to
receive a `stored` / `readbackVerified` result. The Vite action client uses
only `HomeAiRuntimeFacade.api`; it must not own raw `fetch`, access-key
headers, browser storage, or native `confirm()`. This is not a real MCP write:
the route is handled only by the Vite dev mock. `npm run build:vite` produces a
built preview that remains read-only so a manually opened static artifact
cannot trigger the real plugin-conversation action route. The classic
`public/app-message-actions-ui.js` renderer remains the production owner until
later Phase 5 slices migrate real execution, Composer, SSE, and message
readback into the Vite shell.

The current chat runtime slice adds a pure event/message patch model plus the
first live transport boundary before moving Composer or production ownership.
The model covers `message.delta`, assistant message upsert, terminal message
refresh requests, `thread.updated` terminal summaries, bounded live-content
truncation, run-event projection, scope-mismatch diagnostics, and user-scroll
protection. The adapter parses MessageEvent-style `data` frames, classifies
chat versus non-chat events, delegates recognized chat events into the model,
and records bounded diagnostics for invalid JSON, invalid payloads,
`client.version`, and unrelated event types. The new
`live-event-source-client.mjs` constructs the classic-compatible `/api/events`
URL, owns injected EventSource lifecycle status, and hands message frames to
the adapter. The development preview keeps the fake injected EventSource for
deterministic local open/message/reconnect/close checks, and now also exposes a
runtime-facade EventSource creation path. `HomeAiRuntimeFacade.eventStream`
owns browser EventSource construction for both ESM and classic compatibility
facades, so the chat island does not directly instantiate `EventSource` or
own browser globals. The Vite dev server now also exposes a bounded
development-only `/api/events?clientVersion=20260702-vite-chat-runtime-dev-v1`
SSE endpoint for that runtime-facade path. It streams the same chat runtime
event shape from `adapters/vite-dev-preview-api-mock-service.js`, returns
`text/event-stream`, and never proxies Owner data or raw credentials. The
adapter accepts real browser `MessageEvent.data` prototype accessors as well
as plain test objects, so runtime EventSource frames and fake frames enter the
same parser. This is still development evidence only: it does not send
Composer messages, write attachments, connect to the production event stream,
or replace `public/app-event-stream-ui.js` or the classic Composer modules.
Production streaming and send/cancel behavior remain owned by the classic
ordered static shell until a later cutover slice adds full authenticated
real-transport and Composer parity evidence.

The current Composer/Chat detail ESM encapsulation slice adds pure, browser-free
models for the next migration boundary:

- `chat-detail-model.mjs` projects bounded message rows, task-group filtering,
  active/terminal/pending status tone, usage/action availability, and embedded
  composer action state.
- `composer-model.mjs` mirrors the classic send/stop/search state and
  optimistic local-send row planning. It can build/apply/clear local pending
  user and assistant rows for development preview parity.
- The chat runtime preview now includes a `Composer ESM` control strip for
  local-only simulated sends. This path appends local pending rows and can clear
  them; it does not call Home AI APIs, does not submit real Composer messages,
  does not upload attachments, and does not replace classic send/cancel
  behavior.
- `composer-api-client.mjs` now models the injected runtime-facade API boundary
  for the classic send and interrupt endpoints:
  `POST /api/threads/:threadId/messages` and
  `POST /api/threads/:threadId/interrupt`. It constructs request paths and
  JSON bodies without browser globals, direct `fetch()`, access-key headers, or
  storage.
- `composer-controller.mjs` is the next controller-level ESM boundary. It
  composes the pure Composer model with the injected API client and owns the
  dev-preview send/interrupt workflow: optimistic row apply, status projection,
  API result merge, attachment consumption, optimistic token cleanup, and
  failure rollback. It is browser-global-free and is validated independently
  from `main.mjs`.
- The Vite dev server mock now handles those Composer send/interrupt calls only
  for `thread_vite_chat_runtime_preview`. The `/vite-chat-runtime-preview/`
  source route can send to the dev mock and receive bounded thread/run
  readback. The built static preview path disables those buttons and emits no
  `/api/threads/...` requests, so a static artifact cannot trigger the real
  Composer endpoints.
- `tests/vite-chat-composer-backend-contract.test.js` now provides a
  source-only backend contract harness for the same ESM boundary. It wires
  `composer-api-client.mjs` through `HomeAiRuntimeFacade.api` into the real
  thread message create route/service and thread interrupt route, using only an
  in-memory disposable thread and injected fetch. It proves request shape,
  access-key/client-version propagation, run readback, interrupt readback, and
  fail-closed missing-auth behavior without starting a production server or
  touching Owner data. This is stronger than the Vite dev mock, but it is not a
  live backend/SSE or production cutover proof.
- `tests/vite-chat-composer-controller.test.js` covers the controller workflow:
  browser-boundary exclusion, successful optimistic send/readback merge,
  blocked empty send, API failure rollback, interrupt projection, and
  deduplicated result merge.
- `attachment-file-input-controller.mjs` owns the development file/camera input
  lifecycle before live production upload migration. It snapshots selected
  Files, stops the change event so a surrounding form cannot navigate the main
  frame, clears `input.value` immediately for repeated mobile camera picks, and
  exposes only bounded metadata/evidence to the preview. It is covered by
  `tests/vite-chat-attachment-file-input-controller.test.js`.
- `thread-readback-controller.mjs` is the terminal-event readback boundary. It
  builds the classic `GET /api/threads/:threadId` route through injected
  `HomeAiRuntimeFacade.api`, consumes the chat runtime model's
  `refreshRequests`, replaces the current thread with bounded readback state,
  clears the refresh queue after success, and records bounded diagnostics on
  failure. The `/vite-chat-runtime-preview/` source route exposes a
  `回读线程` control, while the static built preview keeps real readback
  blocked by source-route gating. `tests/vite-chat-thread-readback-controller.test.js`
  covers request construction, state merge, status projection, and API failure
  handling.
- `adapters/vite-dev-backend-proxy-service.js` adds an explicit local-dev
  proxy gate for real backend parity checks. It is off by default and requires
  both `HOMEAI_VITE_DEV_BACKEND_PROXY=1` and
  `HOMEAI_VITE_DEV_BACKEND_BASE=http://127.0.0.1:<port>`. When enabled, Vite
  proxies only the bounded chat runtime parity routes (`/api/events`,
  thread read, Composer send/interrupt, upload, and server-file attachment)
  before dev mocks. Missing or invalid backend base configuration fails closed
  with bounded `502` JSON instead of falling back to mocks.
- `tests/vite-dev-backend-proxy-integration.test.js` starts a real Vite dev
  server and local fake backend to prove proxy middleware ordering and SSE/POST
  forwarding. `tests/vite-dev-real-backend-parity-smoke.test.js` starts an
  isolated real `server.js` with temporary `HERMES_WEB_DATA_DIR`, temporary
  Gateway Pool manifest, and local fake Gateway worker. It proves the proxied
  SSE snapshot path, writes a no-Gateway group-chat `plain` message through the
  real thread message endpoint, sends an AI Composer message through the real
  Gateway runner path, and interrupts the active stream through the real stop
  path. The fake Gateway is bounded protocol evidence only; it is not
  production Gateway, provider, model-quality, or Owner-data evidence.
- Development smoke coverage verified `/vite-chat-runtime-preview/` in a
  mobile viewport: the preview starts with two fixture rows, simulated send
  adds two local pending rows, clear returns to the fixture rows, and the
  preview hook exposes composer draft/send/clear controls.

The current attachment/upload ESM boundary adds
`src/vite-islands/chat-runtime/attachment-model.mjs` and
`src/vite-islands/chat-runtime/attachment-upload-client.mjs`. The model is
browser-global-free and owns pending-artifact normalization, source labels for
system uploads/server-file attachments/native share, attachment-only Composer
send parity, server-file attachment request shape, upload request shape, native
share dedupe, basename-only display labels, bounded evidence strings, and
remove/clear transforms. The upload client is also browser-global-free: it
accepts an injected `HomeAiRuntimeFacade.api` client plus an injected file
reader and constructs the classic `/api/threads/:threadId/uploads` request
without owning `FileReader`, `fetch`, storage, auth headers, or DOM state.
During `npm run dev:vite`, `vite.config.js` routes the preview upload request
to `adapters/vite-dev-preview-api-mock-service.js` for
`thread_vite_chat_runtime_preview` only, and the mock returns bounded artifact
metadata without echoing file bytes. `/vite-chat-runtime-preview/` now shows an
`附件 ESM` strip under the Composer preview. The strip can create metadata-only
fixture artifacts for system file upload, server-file attachment, and native
share intake; it also includes a development file picker that reads a local
fixture through the preview glue layer and uploads it to the dev mock. It can
send an attachment-only message to the Vite dev mock, and successful dev-mock
send consumes the pending artifacts. This slice does not call the production
upload route from a static artifact, use Owner private files, replace
`public/app-composer-attachments-ui.js` / `public/app-upload-sidebar-ui.js`, or
cut over native share bridge ownership. Production file upload, server-file
attach, native share, and Owner acceptance evidence remain later development
work before production cutover.

`tests/vite-chat-attachment-upload-backend-contract.test.js` now validates the
Vite upload client through an injected runtime API against the real
`server-routes/thread-read-upload-api-routes.js` upload route, using an
in-memory disposable thread and injected route dependencies. It proves
basename sanitization, request body shape, bounded artifact registration,
write/readback evidence, backend rejection propagation, and that raw file
bytes/base64 are not returned in the artifact payload. This is source-only
route contract evidence: it does not use Owner files, start production, replace
the classic upload/sidebar modules, or prove live browser/native share cutover.

The next server-file attachment slice adds
`src/vite-islands/chat-runtime/attachment-server-file-client.mjs`, a pure ESM
client for the classic `/api/threads/:threadId/server-file-attachments` route.
It uses only injected `HomeAiRuntimeFacade.api`, never reads file bytes, never
constructs `dataBase64`, and normalizes returned artifacts as `server_file`
rows. The Vite dev mock now handles that route for
`thread_vite_chat_runtime_preview` only and returns bounded artifact metadata
without echoing the source path. `tests/vite-chat-server-file-attachment-client.test.js`
proves the client boundary, and
`tests/vite-chat-server-file-attachment-backend-contract.test.js` proves the
same client against the real upload route with in-memory route dependencies:
the route resolves a bounded existing server path, registers an artifact, does
not write bytes, propagates remote-file rejection, and keeps local filesystem
paths out of the normalized Vite artifact.

The native-share bridge slice adds
`src/vite-islands/chat-runtime/attachment-native-share-client.mjs` and extends
the Vite/classic runtime facades with `registerNativeShareCallbacks()`. The
facade remains the only owner of `HomeAINativeShare` global registration and
pending-share consumption; facade events record only callback/file counts. The
chat runtime preview installs that receiver, accepts
`HomeAINativeShare.receive({ files })`, dedupes workspace/path pairs, and
attaches them as bounded `native_share` artifacts. A local Playwright smoke
against `/vite-chat-runtime-preview/` proved receive-to-attach behavior with no
console errors. This still does not switch the production shell or retire
`public/app-upload-sidebar-ui.js`; native iOS shell smoke, authenticated
backend parity, static-cache cutover planning, and Owner acceptance remain
required before production.

The current voice runtime ESM encapsulation slice adds
`src/vite-islands/voice-input-status/audio-capture-adapter.mjs`. It is a
browser-global-free adapter for the parts of classic voice capture that must
become injected module dependencies: microphone capability/readiness,
preferred recording MIME selection, held-stream replacement cleanup,
recording-session wrapping through an injected recorder constructor, PCM16
downsampling, base64 encoding, streaming buffer thresholds, and streaming chunk
merge/take policy. The voice status preview imports this adapter and renders a
fixture-only readiness row so the Vite build includes the boundary without
requesting microphone permission. Production recording, `MediaRecorder`,
`AudioContext`, `/api/voice-input/*` calls, and Composer insertion remain
classic-owned until a later slice wires the adapter into a live local voice
harness and then a separately approved shell cutover.

The current focus lifecycle slice adds
`src/vite-app/runtime/focus-lifecycle-guard.mjs` as the first ESM keyboard
focus guard boundary. The module is fully injected and browser-global free: it
does not read `window`, `globalThis`, storage, or `fetch`, and it accepts the
document/root/composer/native-shell capabilities as explicit inputs. It mirrors
the classic stale editable contract from `public/app-composer-draft-ui.js`:
hidden, detached, disabled, inert, zero-rect, or otherwise invisible active
editables are blurred on lifecycle checks; ordinary browser/PWA non-editable
touches preserve a visible Composer focus; and explicit iOS native-shell
markers force blur of the active editable on non-editable touches outside that
editable. It also mirrors the native Composer paste window: a second
touch/long-press on the already-focused Composer textarea can recover from a
`blur` by refocusing the still-visible, enabled Composer once, while hidden,
disabled, stale, outside-window, and external-click paths remain unprotected.
`/vite-chat-runtime-preview/` installs the guard in development and
shows a `Focus guard` status plus a `清理焦点` manual cleanup control for local
smoke evidence. This is not a production ownership transfer; the classic Web
guard remains active in `public/app-composer-draft-ui.js` and the native iOS
shell should keep its defensive keyboard-focus guard until full Vite shell
cutover is separately approved.

Acceptance:

- Sending, streaming, cancel/stop, retry, attachment upload, voice long-press,
  voice cancel, document preview return, Markdown preview, and PPTX delivery
  flows pass local harnesses.
- iOS keyboard does not open from stale hidden editables after route/overlay
  changes.
- Vite preview produces no duplicate messages, stale patch fallback loops, or
  latest-turn bottom-follow regressions.

Suggested validation:

```sh
npm run build:vite
node tests/vite-chat-composer-api-client.test.js
node tests/vite-chat-composer-backend-contract.test.js
node tests/vite-chat-attachment-model.test.js
node tests/vite-chat-attachment-upload-client.test.js
node tests/vite-chat-attachment-upload-backend-contract.test.js
node tests/vite-chat-server-file-attachment-client.test.js
node tests/vite-chat-server-file-attachment-backend-contract.test.js
node tests/vite-chat-composer-model.test.js
node tests/vite-chat-detail-model.test.js
node tests/vite-chat-event-source-client.test.js
node tests/vite-chat-event-stream-adapter.test.js
node tests/vite-document-preview-model.test.js
node tests/vite-document-preview-island.test.js
node tests/vite-focus-lifecycle-guard.test.js
node tests/vite-chat-runtime-model.test.js
node tests/vite-chat-runtime-island.test.js
node tests/vite-runtime-facade.test.js
node tests/app-runtime-facade-ui.test.js
node tests/vite-message-action-panel-action-client.test.js
node tests/vite-message-action-panel-model.test.js
node tests/vite-message-action-panel-island.test.js
node tests/vite-dev-preview-api-mock-service.test.js
node tests/thread-read-upload-api-routes.test.js
node tests/run-progress-ui-behavior.test.js
node tests/run-liveness.test.js
node tests/message-scroll-button-visibility.test.js
node tests/keyboard-focus-guard-ui.test.js
node tests/voice-input-ui.test.js
node tests/markdown-delivery-ui.test.js
node tests/server-file-attachment-ui.test.js
node tests/thread-state-ui-behavior.test.js
node tests/viewport-scroll-ui.test.js
git diff --check
```

## Phase 6 - Plugin Host And Embedded Surface Migration

Goal: migrate plugin iframe hosting and bridge lifecycle without breaking
plugin-owned UI contracts.

Tasks:

- Move embedded plugin shell, manifest loading, iframe lifecycle, launch-token
  handling, plugin refresh, and bridge message routing into Vite modules.
- Preserve same-origin proxy and Owner/non-Owner plugin permission behavior.
- Run focused plugin host checks with sampled plugins.
- Keep plugin-owned frontend builds independent; do not force plugin UIs into
  the Home AI host bundle.

Acceptance:

- Embedded plugin launch, refresh, back-swipe, side-chat, manifest readback,
  bridge messages, and denied access states match classic behavior.
- Host does not expose launch tokens or raw plugin payloads in logs or UI.
- Plugin iframe lifecycle does not introduce native browser dialogs.

Current development-only slice:

- Added `src/vite-islands/plugin-host/` as a bounded Plugin Host Vite island.
- The pure model owns plugin id normalization, Owner permission fail-closed
  state, manifest freshness, launch-token detection/redaction, same-origin
  embedding checks, mixed-content blocking, and bounded iframe evidence.
- `main.mjs` uses `HomeAiRuntimeFacade.api` for manifest reads and must not
  read browser storage, construct Home AI auth headers, or expose launch tokens.
- Vite dev route `/vite-plugin-host-preview/` and built preview page
  `public/vite-preview/plugin-host.html` are development-only. They do not
  replace the classic production embedded plugin host.
- The Vite dev mock handles metadata-only
  `/api/hermes-plugins/<id>/manifest?workspaceId=owner` payloads for sampled
  plugins (`finance`, `codex-mobile`, and `movie`) so local preview can render
  without a live backend. These mock payloads are not Owner permission,
  launch-token, or production manifest readback evidence.
- Focused coverage lives in `tests/vite-plugin-host-model.test.js`,
  `tests/vite-plugin-host-island.test.js`,
  `tests/vite-dev-preview-api-mock-service.test.js`, and
  `tests/vite-dev-preview-routes-smoke.test.js`.

Suggested validation:

```sh
npm run build:vite
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
node tests/hermes-plugin-api-routes.test.js
node tests/embedded-plugin-refresh-harness.test.js
node tests/plugin-launch-recovery-service.test.js
node tests/no-browser-native-dialogs.test.js
node tests/plugin-workspace-platform-contract-check.test.js
git diff --check
```

## Phase 7 - PWA, Service Worker, Static Cache, And Native Shell Parity

Goal: make the Vite preview compatible with PWA install/update behavior and the
iOS native shell before any production proposal.

Tasks:

- Define Vite asset cache policy: hashed assets, no-cache HTML, Service Worker
  update behavior, and preview asset cleanup.
- Model Web Push/PWA status and button-plan behavior as fixture-only ESM state
  before any live notification permission, subscription, or Service Worker
  ownership moves.
- Update static cache harnesses for Vite preview without changing production
  default shell.
- Validate iOS native bridge markers, safe area, keyboard, upload, voice, and
  document preview behavior in a local PWA/debug environment.
- Define source/deploy rollback and cache-bust behavior for future shell/cache
  changes.

Acceptance:

- Classic and Vite preview cache rules are both test-covered.
- `npm run check:vite-cache-policy` passes as source-only evidence and reports
  `productionCutoverCacheReady=false` until a separate cutover change adopts
  content-fingerprinted production assets and Service Worker policy.
- Killing and reopening the PWA after a development version bump does not load
  stale incompatible assets.
- iOS native shell behavior matches classic parity for the selected scenarios.

Suggested validation:

```sh
npm run build:vite
node tests/vite-preview-cache-policy-check.test.js
npm run check:vite-cache-policy
node tests/static-cache-version-harness.test.js
node tests/mobile-bottom-region-layout.test.js
node tests/native-environment-context-ui.test.js
npm run ios:pwa:visual -- --scenario keyboard-composer
npm run ios:pwa:visual -- --scenario document-preview
git diff --check
```

## Phase 8 - Development Parity Gate

Goal: prove the Vite app is ready for a separate production cutover proposal,
without performing that cutover.

Tasks:

- Run full local syntax and focused UI gates.
- Run Playwright or equivalent local browser checks on desktop and mobile
  viewports for the Vite-only root and Vite preview.
- Run iOS/PWA visual harnesses for keyboard, Composer, plugin host, document
  preview, and voice input.
- Produce a bounded parity report with pass/fail status, residual risks,
  source/deploy rollback plan, and production cutover prerequisites.
- Produce the maintained source-only Owner review report with
  `npm run review:vite-cutover`.
- Produce the maintained source-only cutover handoff packet with
  `npm run packet:vite-cutover`; before the cutover source change exists the
  packet must remain a non-sendable draft.
- Prepare the Owner review package in
  `docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`.

Acceptance:

- All development gates pass.
- Residual issues are either fixed or explicitly accepted by Owner before a
  production proposal is written.
- No production files are changed to make Vite the default shell.
- A separate production target can be created with deploy/readback commands,
  rollback, cache invalidation, and Owner approval requirements.
- The review package states that it is not an approval record and does not
  authorize deployment by itself.

Suggested validation:

```sh
npm run build:vite
npm run check:vite-cache-policy
npm run verify:vite-dev
npm run audit:vite-dev-goal
npm run smoke:vite-dev-user-journeys
npm run check:vite-readiness
node tests/vite-owner-review-report.test.js
npm run review:vite-cutover
node tests/vite-production-cutover-preflight.test.js
npm run plan:vite-cutover
node tests/vite-production-cutover-handoff-packet.test.js
npm run packet:vite-cutover
node tests/vite-dev-preview-routes-smoke.test.js
node tests/vite-dev-user-journeys-smoke.test.js
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
npm run check
node tests/static-cache-version-harness.test.js
node tests/task-list-ui.test.js
node tests/owner-system-console-ui.test.js
node tests/ai-ops-diagnostic-feedback-ui.test.js
node tests/voice-input-ui.test.js
node tests/markdown-delivery-ui.test.js
node tests/no-browser-native-dialogs.test.js
git diff --check
```

## Development Readiness Check

`scripts/vite-development-readiness-check.js` is the source-only readiness gate
for Owner review. The maintained command is:

```sh
npm run build:vite
npm run check:vite-readiness
```

The check verifies that Vite package scripts, preview routes, backend-proxy
configuration, source modules, focused tests, documentation boundaries, and
built preview assets are present. It also verifies that `public/index.html` and
`public/service-worker.js` do not reference `/vite-preview/`,
`/vite-islands/`, or source-only `/vite-*-preview/` routes. The companion
`npm run check:vite-cache-policy` verifies preview HTML and manifest asset
readback while preserving `productionCutoverCacheReady=false`; this is expected
for the development target because current deterministic preview entry names
are not yet production content-fingerprinted cache keys.

The maintained one-command development acceptance report is:

```sh
npm run verify:vite-dev
```

It runs the Vite build, global audit, mobile Playwright preview-route smoke,
real local backend parity smoke, readiness gate, cache-policy gate, Owner review
report, blocked cutover preflight, blocked handoff packet, readback validator
contract, repository static check, local full test gate, and diff hygiene check. The
local full test gate still skips install/deploy lane tests.
It is source-only, clears the cutover approval environment for the run, and
must report `productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`. When it passes, it emits
`ownerApprovalRequest.status=ready_to_request_owner_approval` with the exact
approval text for the next boundary. That request does not create a production
source change, deploy-lane card, or deployment.

The maintained source-only development goal audit is:

```sh
npm run audit:vite-dev-goal
```

It consumes or generates the development acceptance packet and verifies only
the development objective: migrated Vite development surfaces, remaining
production boundary, Audit Packet / Delta Matrix, validation command coverage,
source-only privacy policy, and future production cutover sequence. It is not
an Owner approval record, deploy-lane packet, or production readback claim.

No production cutover is authorized by this development migration target. A
passing readiness check only means the development preview is ready for Owner
review; it does not authorize `deploy:macos --execute`, default-shell switch,
Service Worker production cache changes, or production readback claims.

The maintained source-only Owner review report is:

```sh
npm run review:vite-cutover
```

It combines the readiness check and cutover preflight, records
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`, and lists the exact Owner approval text for
the next boundary. It is not a deploy request or approval record.

The maintained source-only Owner approval request package is:

```sh
npm run request:vite-cutover-approval
```

It confirms development acceptance, Owner review readiness, and the blocked
handoff-packet boundary before emitting the exact approval text. It does not
create the production cutover source change, send a deploy-lane card, or deploy.

The maintained source-only final goal-state audit is:

```sh
npm run audit:vite-goal
```

Default mode reports `goal_incomplete`. Final closure requires running it with
bounded development acceptance, cutover source-change contract, and production
readback JSON evidence.

The maintained source-only production readback validator is:

```sh
npm run validate:vite-cutover-readback -- --readback-json <deploy-readback.json>
```

It is for the post-deploy lane return. It checks the bounded readback JSON
against every required production readback id and privacy confirmation without
connecting to production or executing deployment.

The Owner review package for the next boundary is
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`.
The source-only cutover preflight is:

```sh
npm run plan:vite-cutover
```

Without the exact Owner approval text in the review package, it must report
`owner_approval_required`. With the exact approval text, it still does not
deploy or change production; it only permits creating a separate fail-closed
production cutover source change.

The maintained source-only cutover handoff packet is:

```sh
npm run packet:vite-cutover
```

Before approval it must block with `owner_approval_required`. After exact
Owner approval it may produce a bounded deploy-lane draft, but the draft must
remain `sendable=false` and `deployCardSent=false` until the separate
fail-closed cutover source change exists and has passed the planned validation
commands.

After production deployment, the deploy-lane readback JSON must pass
`npm run validate:vite-cutover-readback -- --readback-json <deploy-readback.json> --require-ok`.

## Worker Split Guidance

The main Home AI implementation thread remains the scheduler. It may dispatch
bounded worker cards for independent slices:

- inventory and dependency graph;
- Owner/diagnostic surfaces;
- navigation/task/topic shell;
- chat/SSE/Composer/voice;
- plugin host and bridge;
- PWA/iOS visual validation.

Each worker card must include allowed file boundaries, validation commands,
privacy limits, and a terminal return-card requirement. Workers must return
`blocked` instead of overwriting overlapping frontend files.

## Production Cutover Precondition

After Phase 8 passes, use
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md` as the Owner
review package, then create a separate production cutover target only after
explicit Owner approval. That target must include:

- exact Vite-only shell serving mechanism;
- static version and Service Worker cache plan;
- production deploy/readback commands through the central Mac deployment
  contract;
- source/deploy rollback command and proof that Classic runtime fallback remains
  retired;
- Owner approval requirement;
- privacy-preserving production browser and iOS readback.

No production cutover is authorized by this development migration target.
