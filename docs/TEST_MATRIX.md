# Hermes Mobile Test Matrix

Last updated: 2026-06-08.

Use this matrix to pick focused tests before broader gates. Always add syntax checks for touched JS/Python/PowerShell files.

## Full Gates

- Broad product gate: `npm.cmd run productization:check`
- Standard local test gate: `npm test`
- Install/deploy lane gate: `npm run test:install-lane`
- Legacy aggregate gate when a single process must run both lanes:
  `npm run test:all`
- Architecture boundary: `node tests\architecture-refactor-boundary.test.js`
- Privacy scan: `node scripts\privacy-scan.js --all-files`
- Diff hygiene: `git diff --check`
- Engineering governance: `node scripts\engineering-governance-check.js`
- Fallback governance: `node scripts\fallback-governance-check.js --json`

`npm test` is the normal local development gate. It excludes install, upgrade,
production-smoke, and deployment-lane tests that are not appropriate for every
developer machine. Run `npm run test:install-lane` from an install/deploy lane,
release lane, or explicit operator validation context. `npm run
productization:check` runs both lanes in order.

For long-running 3A work, prefer module-sized batches: run focused checks while
building a coherent module, then run `npm test` once for that module before
commit/deploy. Do not run the install/deploy lane gate from an ordinary local
implementation thread unless the current task explicitly owns install,
upgrade, production-smoke, or deploy-lane validation.

Use full gates before public release, broad shared-service/runtime changes, permission/security/persistence changes, or when requested.

## Vite Frontend Development Gate

The Vite full-frontend migration is a development-environment target until
Owner review approves a separate production cutover plan. Ordinary local
implementation threads should run the source/readiness and focused Vite gates,
not install/deploy lane tests:

```bash
npm run build:vite
node tests/mobile-http-runtime-service.test.js
node tests/vite-production-bootstrap.test.js
npm run validate:vite-cutover-source -- --contract-json docs/IMPLEMENTATION_NOTES/vite-production-cutover-source-contract.json --require-ok
npm run check:vite-cache-policy
node tests/vite-preview-cache-policy-check.test.js
npm run verify:vite-dev
npm run audit:vite-dev-goal
npm run check:vite-readiness
node tests/vite-owner-review-report.test.js
npm run review:vite-cutover
node tests/vite-development-readiness-check.test.js
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
node tests/vite-production-status-check.test.js
node tests/vite-esm-migration-backlog.test.js
node tests/vite-dev-preview-routes-smoke.test.js
npm run audit:vite-globals -- --json
node tests/vite-global-usage-audit.test.js
node tests/vite-runtime-state-event-bus.test.js
node tests/vite-dev-real-backend-parity-smoke.test.js
node tests/vite-chat-runtime-island.test.js
node tests/vite-chat-attachment-file-input-controller.test.js
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
node tests/embedded-plugin-refresh-harness.test.js
node tests/app-embedded-plugin-ui.test.js
node tests/vite-pwa-push-status-island.test.js
node tests/vite-toast-status-island.test.js
node tests/vite-classic-voice-input-adapter.test.js
node tests/vite-voice-input-session-controller.test.js
node tests/vite-voice-audio-capture-adapter.test.js
node tests/vite-voice-input-status-island.test.js
node tests/vite-voice-learning-model.test.js
node tests/vite-classic-voice-learning-adapter.test.js
node tests/vite-wardrobe-model.test.js
node tests/vite-classic-wardrobe-adapter.test.js
node tests/vite-platform-model.test.js
node tests/vite-classic-platform-adapter.test.js
node tests/vite-access-key-manager-model.test.js
node tests/vite-classic-access-key-manager-adapter.test.js
git diff --check
```

`node tests/mobile-http-runtime-service.test.js` covers the server-side
Vite-only shell boundary, including Vite bootstrap injection, ignored Classic
request/runtime/config overrides, and compression-cache stability for app-shell
responses.

`node tests/vite-production-bootstrap.test.js` covers the dedicated Vite
production bootstrap entry, verifies that it preserves the classic runtime
facade, installs the focus lifecycle guard, exposes bounded
`HomeAiViteProduction` readback, and produces the built
`public/vite-islands/home-ai-production-bootstrap/` artifact after
`npm run build:vite`.

`node tests/vite-runtime-state-event-bus.test.js` covers the importable Vite
runtime state and event bus boundary. It verifies direct and wildcard
subscribers, bounded recent-event snapshots, handler failure isolation,
state patch/update/replace events, and legacy alias compatibility for the
runtime facade. This is the source-only ESM boundary for cross-module state and
event coordination; it does not replace the classic production `window.state`
owners by itself.

`node tests/vite-plugin-host-model.test.js` now also covers the Vite-side
resident iframe lifecycle policy: volatile launch/session parameters are
stripped from stable entry signatures, loaded resident iframes are preserved
across token-only refreshes, `navigation_health_timeout` preserves visible or
loaded iframes, and only still-loading timed-out iframes are recovered.
`node tests/vite-plugin-host-island.test.js` verifies that the preview exposes
the bounded lifecycle scenarios, while `node tests/embedded-plugin-refresh-harness.test.js`
and `node tests/app-embedded-plugin-ui.test.js` remain the classic production
host regression checks.

`npm run validate:vite-cutover-source -- --contract-json
docs/IMPLEMENTATION_NOTES/vite-production-cutover-source-contract.json
--require-ok` is the source-change contract gate for the transitional
production bootstrap. It proves the switch, rollback path, fail-closed default,
dev-mock exclusion, bounded production-readback requirement, and deploy-lane
boundary before production execution.

`npm run check:vite-readiness` is source-only and verifies preview routes,
source modules, focused tests, docs, built preview artifacts, and that the
classic production shell has not been switched to Vite. It does not authorize
`deploy:macos --execute`, Service Worker production cache migration, clean
target install/upgrade canaries, or production readback claims.

`npm run verify:vite-dev` is the source-only development acceptance report. It
runs the Vite build, global audit, mobile Playwright preview-route smoke, real
local backend parity smoke, readiness gate, Owner review report, blocked
cutover preflight, blocked handoff packet, repository static check, local full
test gate, readback validator contract, and diff hygiene check. The local full
test gate still skips install/deploy lane tests.
It clears the cutover approval environment for the run and must keep
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`. When it passes, the
`ownerApprovalRequest` field should be `ready_to_request_owner_approval` and
should include the exact Owner approval text for the next boundary without
creating a production source change, deployment, or Worker card.

`npm run audit:vite-dev-goal` is the source-only development goal completion
audit. It consumes or generates the Vite development acceptance packet and
verifies the development target only: migrated development surfaces, remaining
production surfaces, Audit Packet / Delta Matrix, browser/user-journey command
coverage, source-only privacy boundary, and the future production cutover
approval sequence. It must not be used as production cutover approval or
production readback evidence.

`npm run review:vite-cutover` is the source-only Owner review report. It
combines readiness and cutover preflight evidence into a bounded payload, keeps
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`, and is not an approval record. Its
`requiredProductionReadback` field must stay structured and include shell mode,
Service Worker/cache version, Vite assets, Owner Console permission, Plugin
Host proxy, Markdown/PPTX delivery, voice pending cancel, chat/SSE/task-topic,
Wardrobe Usage action, and rollback evidence.

`npm run plan:vite-cutover` is also source-only. It fails closed without the
exact Owner approval text from
`docs/IMPLEMENTATION_NOTES/vite-production-cutover-review.md`; with that text
it returns only a plan to create a separate fail-closed cutover source change,
not permission to deploy from an ordinary implementation thread.

`npm run packet:vite-cutover` is the source-only handoff packet gate. It does
not send a Worker card or execute deployment. With exact Owner approval it can
produce only a non-sendable deploy-lane draft until the separate cutover source
change exists and passes validation.
The draft must expose the Home AI deploy lane pool, a
`cutover_source_change_validated` pre-send gate, and a required post-deploy
`validate:vite-cutover-readback` command.

For Stage D task artifact helper ESM adapter work, run:

```bash
node tests/vite-task-artifact-helper-model.test.js
node tests/vite-classic-task-artifact-helper-adapter.test.js
node tests/task-artifact-helpers.test.js
node tests/task-list-ui.test.js
```

These checks cover the browser-global-free task artifact helper model, the
classic UMD dynamic import adapter, artifact kind/display/rank planning,
latest document selection, markdown twin filtering, and fallback compatibility
for task-group helper exports.

For Stage D sidebar back-navigation ESM adapter work, run:

```bash
node tests/vite-sidebar-back-navigation-model.test.js
node tests/vite-classic-sidebar-back-navigation-adapter.test.js
node tests/app-embedded-plugin-ui.test.js
node tests/app-wardrobe-ui.test.js
node tests/music-plugin-back-swipe-harness.test.js
node tests/movie-plugin-back-swipe-harness.test.js
node tests/task-list-ui.test.js
```

These checks cover the browser-global-free back target planner, plugin
inner/outer back priority, plugin-context outer suppression, native-back query
planning, classic dynamic import behavior, and fallback compatibility for
existing sidebar gesture/native-back handlers.

For Stage D route snapshot ESM adapter work, run:

```bash
node tests/vite-route-snapshot-model.test.js
node tests/vite-classic-route-snapshot-adapter.test.js
node tests/same-window-navigation-harness.test.js
node tests/task-list-ui.test.js
```

These checks cover the browser-global-free route snapshot model, bounded
return-route parameter encoding/decoding, explicit launch-target detection,
classic dynamic import behavior, and same-window route snapshot compatibility.

For plugin Dock context-switch gesture work, run:

```bash
node tests/vite-plugin-topic-navigation-model.test.js
node tests/vite-plugin-context-switch-model.test.js
node tests/app-plugin-topics-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
```

These checks cover the browser-global-free plugin topic route/claim/root
visibility model, app/topic switch target projection, downward-gesture
thresholds, classic Dock handle adapter, drawer fallback labels,
pinned-bottom-tab preservation, and static cache version alignment.

For Stage D upload/sidebar attachment ESM adapter work, run:

```bash
node tests/vite-upload-sidebar-model.test.js
node tests/vite-chat-attachment-model.test.js
node tests/vite-chat-server-file-attachment-client.test.js
node tests/vite-chat-native-share-intake-client.test.js
node tests/server-file-attachment-ui.test.js
node tests/camera-attachment-preview-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
```

These checks cover the browser-global-free upload/sidebar projection model,
Owner-only attach-menu planning, native-share normalization/deduping, intake
panel labels/actions, server-file request planning, classic server-file UI
Owner gates, camera/photo attachment foreground-refresh suppression, pending
image preview non-navigation, non-cropping thumbnail/orientation CSS, explicit
remove-button isolation, and static cache version alignment.

For Stage D navigation/search ESM adapter work, run:

```bash
node tests/vite-navigation-search-model.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free navigation-search model, classic
single-window mode compatibility, chat-search availability, match-id planning,
committed-query/move-index planning, status/prev-next projection, and static
cache version alignment.

For Stage D task/document preview ESM adapter work, run:

```bash
node tests/vite-document-preview-model.test.js
node tests/vite-directory-automation-model.test.js
node tests/vite-classic-directory-automation-adapter.test.js
node tests/vite-rich-text-directory-model.test.js
node tests/vite-classic-rich-text-directory-adapter.test.js
node tests/vite-shared-directory-model.test.js
node tests/vite-classic-shared-directory-adapter.test.js
node tests/vite-tts-profile-model.test.js
node tests/vite-classic-tts-profile-adapter.test.js
node tests/vite-task-preview-helpers-model.test.js
node tests/vite-classic-task-preview-adapter.test.js
node tests/task-preview-helpers-runtime-facade.test.js
node tests/task-list-ui.test.js
node tests/directory-plugin-navigation-ui.test.js
node tests/directory-delete-ui.test.js
node tests/rich-text-inline-image-ui.test.js
node tests/streaming-receipt-preview-ui.test.js
node tests/directory-route-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free document-preview and task-preview
helper models, classic task-preview dynamic import adapter,
Markdown/image/document classification, same-origin preview route planning,
native bridge/open-in request projection, directory route/boundary/attachment/
breadcrumb/entry projection, runtime-facade preview helper boundary, and static
cache version alignment.

For Stage D group-topic ESM adapter work, run:

```bash
node tests/vite-group-topic-model.test.js
node tests/vite-classic-group-topic-adapter.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free group-topic model, classic dynamic
import adapter, group-chat member overlay projection, group-chat save request
planning, thread-list query parameter planning, case-topic refresh request
planning, Kanban topic-card snapshot schedule/request planning, and static
cache version alignment.

For Stage D todo-detail ESM adapter work, run:

```bash
node tests/vite-todo-detail-model.test.js
node tests/vite-classic-todo-detail-adapter.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free todo-detail view model, classic
dynamic import adapter, metadata row planning, generic comment/revision/card
management decisions, specialized Kanban card fallback rendering, and static
cache version alignment.

For Stage D learning-growth-task ESM adapter work, run:

```bash
node tests/vite-learning-growth-task-model.test.js
node tests/vite-classic-learning-growth-task-adapter.test.js
node tests/app-learning-growth-task-ui.test.js
node tests/app-learning-growth-ui.test.js
node tests/app-learning-program-ui.test.js
node tests/app-learning-native-growth-submission-controller.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free learning-growth task model, classic
dynamic import adapter, submission guard/validation planning, feedback/outcome
projection, teaching-card state, and static cache version alignment.

For Stage D kanban-todo-core ESM adapter work, run:

```bash
node tests/vite-kanban-todo-core-model.test.js
node tests/vite-classic-kanban-todo-core-adapter.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free Kanban todo core model, classic
dynamic import adapter, title/due/assignee planning, due input value projection,
story-tree fallback ownership, and static cache version alignment.

For Stage D message-actions ESM adapter work, run:

```bash
node tests/vite-message-actions-model.test.js
node tests/vite-classic-message-actions-adapter.test.js
node tests/wardrobe-outfit-wear-intent-ui.test.js
node tests/message-scroll-button-visibility.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free message-actions model, classic
dynamic import adapter, message footer action projection, long-reply scroll
eligibility, Wardrobe outfit-wear request/confirmation planning, existing
Wardrobe action execution compatibility, and static cache version alignment.

For Stage D thread-state ESM adapter work, run:

```bash
node tests/vite-thread-state-model.test.js
node tests/vite-classic-thread-state-adapter.test.js
node tests/thread-state-ui-behavior.test.js
node tests/group-chat-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free thread-state model, classic dynamic
import adapter, single-window request freshness and body planning, surface
cache keys, pending/error shell projection, unchanged-refresh render-skip
planning, bounded group-chat storage planning, existing thread-state behavior,
and static cache version alignment.

For Stage D thread-message ESM adapter work, run:

```bash
node tests/vite-thread-message-model.test.js
node tests/vite-classic-thread-message-adapter.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free thread-message model, classic
dynamic import adapter, create/select/open-project-task request planning,
Composer visibility and placeholder projection, existing task-list shell
coverage, and static cache version alignment.

For Stage D thread-directory ESM adapter work, run:

```bash
node tests/vite-thread-directory-model.test.js
node tests/vite-classic-thread-directory-adapter.test.js
node tests/directory-route-ui.test.js
node tests/thread-state-ui-behavior.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free thread-directory model, classic
dynamic import adapter, directory alias/filter planning, legacy route
resolution behavior, existing thread-state behavior, and static cache version
alignment.

For Stage D chat-scope ESM adapter work, run:

```bash
node tests/vite-chat-scope-model.test.js
node tests/vite-classic-chat-scope-adapter.test.js
node tests/group-chat-ui.test.js
node tests/thread-state-ui-behavior.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free chat-scope model, classic dynamic
import adapter, group/private scope decisions, read marker planning, unread
projection, member label/mention projection, existing group-chat shell
coverage, and static cache version alignment.

For Stage D run-progress ESM adapter work, run:

```bash
node tests/vite-run-progress-model.test.js
node tests/vite-classic-run-progress-adapter.test.js
node tests/run-progress-ui-behavior.test.js
node tests/thread-state-ui-behavior.test.js
node tests/current-thread-refresh-scheduling.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free run-progress model, classic dynamic
import adapter, run id/message selection, event normalization and compaction,
panel event-window planning, existing run-progress behavior, adjacent
thread-state/current-thread refresh behavior, and static cache version
alignment.

For Stage D thread-list ESM adapter work, run:

```bash
node tests/vite-thread-list-model.test.js
node tests/vite-classic-thread-list-adapter.test.js
node tests/task-list-ui.test.js
node tests/run-progress-ui-behavior.test.js
node tests/thread-state-ui-behavior.test.js
node tests/message-scroll-button-visibility.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free thread-list model, classic dynamic
import adapter, sidebar card/header/pager/signature planning, task pending
message and directory-topic render signatures, adjacent run-progress/thread
state behavior, message scroll affordances, and static cache version alignment.

For Stage D thread-card-message ESM adapter work, run:

```bash
node tests/vite-thread-card-message-model.test.js
node tests/vite-classic-thread-card-message-adapter.test.js
node tests/task-list-ui.test.js
node tests/message-scroll-button-visibility.test.js
node tests/group-chat-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free thread-card-message model, classic
dynamic import adapter, task-card/message-card projection, quote/revoke and
quoted-reply planning, existing task-list/group-chat behavior, message scroll
affordances, and static cache version alignment.

For Stage D message-usage ESM adapter work, run:

```bash
node tests/vite-message-usage-model.test.js
node tests/vite-classic-message-usage-adapter.test.js
node tests/task-list-ui.test.js
node tests/message-scroll-button-visibility.test.js
node tests/vite-thread-card-message-model.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free message-usage model, classic
dynamic import adapter, token/cost/model/provider/reasoning and API-call row
planning, existing task-list and message-card behavior, message scroll
affordances, and static cache version alignment.

For Stage D message-skill ESM adapter work, run:

```bash
node tests/vite-message-skill-model.test.js
node tests/vite-classic-message-skill-adapter.test.js
node tests/task-list-ui.test.js
node tests/message-scroll-button-visibility.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free message-skill model, classic
dynamic import adapter, skill object/path normalization, direct and run-event
skill/tool projection, classic-owned HTML/footer popup behavior, message
scroll affordances, and static cache version alignment.

For Stage D long-message ESM adapter work, run:

```bash
node tests/vite-long-message-model.test.js
node tests/vite-classic-long-message-adapter.test.js
node tests/message-scroll-button-visibility.test.js
node tests/streaming-receipt-preview-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free long-message model, classic dynamic
import adapter, assistant active/expanded preview decisions, preview/toggle
planning, DOM-owned expand/collapse state mutation, streaming receipt
compatibility, message scroll affordances, and static cache version alignment.

For Stage D event-stream ESM adapter work, run:

```bash
node tests/vite-chat-event-source-client.test.js
node tests/vite-classic-event-stream-adapter.test.js
node tests/vite-chat-event-stream-adapter.test.js
node tests/vite-chat-runtime-island.test.js
node tests/composer-module-boundary.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free live EventSource client, classic
dynamic import adapter, `/api/events` URL planning, frame parsing, reconnect
status planning, classic-owned `EventSource` construction and `applyEvent`
handoff, chat runtime adapter compatibility, Composer boundary ownership, and
static cache version alignment.

For Stage D embedded-plugin ESM adapter work, run:

```bash
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
node tests/embedded-plugin-refresh-harness.test.js
node tests/app-embedded-plugin-ui.test.js
node tests/embedded-plugin-viewport-stability.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free plugin-host model, classic dynamic
import adapter, stable iframe entry signatures, volatile launch/session/token
stripping, manifest launch-context freshness, resident shell context matching,
classic-owned iframe DOM/postMessage/runtime state, viewport stability, and
static cache version alignment.

For Stage D plugin-admin ESM adapter work, run:

```bash
node tests/vite-plugin-admin-model.test.js
node tests/vite-classic-plugin-admin-adapter.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free plugin-admin model, classic dynamic
import adapter, workspace row projection, manager-card view state, Owner-gate
planning, grant/revoke request planning, classic-owned API/overlay/event/state
side effects, and static cache version alignment.

For Stage D Markdown renderer ESM adapter work, run:

```bash
node tests/vite-markdown-renderer-model.test.js
node tests/vite-classic-markdown-renderer-adapter.test.js
node tests/markdown-renderer-client.test.js
node tests/markdown-renderer.test.js
node tests/markdown-delivery-ui.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/static-client-boot-inventory.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free Markdown renderer model, classic
dynamic import/fallback adapter, CommonJS and `window.HermesMarkdownRenderer`
compatibility, server/client renderer parity, viewer-page renderer loading, and
static cache version alignment.

`npm run request:vite-cutover-approval` is the source-only Owner approval
request gate. It confirms development acceptance, Owner review readiness, and
the blocked handoff-packet boundary, then emits the exact approval text without
creating a production source change, Worker card, or deployment.

`npm run audit:vite-goal` is the source-only final-state audit. It must report
`goal_incomplete` before bounded evidence proves development acceptance, exact
Owner approval, source-change validation, deploy-lane packet state, and
production readback. It performs no deploy and sends no task card.

`npm run validate:vite-cutover-source` is the source-only cutover source-change
validator. Current default mode must stay blocked with
`cutover_source_change_not_created`; after exact Owner approval, a separate
cutover source-change contract JSON must pass with `--require-ok` before any
production deploy-lane card is sent.

`npm run validate:vite-cutover-readback` is the source-only post-deploy
readback validator. It must pass on the deploy-lane JSON return before the Vite
production cutover can be considered closed; it does not itself connect to
production or execute deployment.

After production is already switched to the transitional Vite bootstrap, use
the read-only status command instead of the development readiness gate:

```bash
npm run check:vite-production -- --base http://127.0.0.1:8797 \
  --readback-json /tmp/home-ai-vite-production-readback-b5b62ed2.json \
  --require-ok
node tests/vite-production-status-check.test.js
```

This verifies the live Vite shell selection, ignored Classic override, Vite
manifest/bootstrap reachability, public config, Owner Console unauthenticated
denial, and optional bounded deploy readback. It reports no production writes
and performs no deployment. `npm run check:vite-readiness` remains the
development-target gate and also enforces the source Vite-only cutover config.

For the ESM generation phase, regenerate and verify the staged migration
backlog:

```bash
npm run plan:vite-esm -- --write
node tests/vite-esm-migration-backlog.test.js
```

The backlog is source-only. It consumes the static boot inventory and Vite
global usage audit, then writes
`docs/IMPLEMENTATION_NOTES/vite-esm-migration-backlog.md`. It must keep
`productionWrites=false` and `deployExecuted=false`, and it must classify
low-risk adapter candidates separately from core workflow replacements.

For Stage D Composer draft ESM adapter work, run:

```bash
node tests/vite-chat-composer-draft-model.test.js
node tests/vite-chat-classic-composer-draft-adapter.test.js
node tests/vite-focus-lifecycle-guard.test.js
node tests/keyboard-focus-guard-ui.test.js
node tests/native-composer-longpress-paste-behavior.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free draft model, the classic dynamic
import adapter, stale editable focus projection, native iOS non-editable touch
blur behavior, native-shell focused textarea long-press paste blur/refocus
preservation, and preservation of Composer module ownership boundaries.

For Stage D Composer send-pipeline ESM adapter work, run:

```bash
node tests/vite-chat-composer-send-pipeline-model.test.js
node tests/vite-chat-classic-send-pipeline-adapter.test.js
node tests/composer-send-pending-feedback.test.js
node tests/vite-chat-composer-controller.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free send-pipeline model, the classic
dynamic import adapter, request/elevation body parity, pending-send feedback,
Composer controller compatibility, and preservation of Composer module
ownership boundaries.

For Stage D Composer native-environment ESM adapter work, run:

```bash
node tests/vite-chat-composer-native-environment-model.test.js
node tests/vite-chat-classic-native-environment-adapter.test.js
node tests/native-environment-context-ui.test.js
node tests/composer-send-pending-feedback.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free native environment model, the
classic dynamic import adapter, bridge availability/request planning, bounded
snapshot upload body planning, send-pipeline consumption of the native context
helpers, and preservation of Composer module ownership boundaries.

For Stage D Composer context ESM adapter work, run:

```bash
node tests/vite-chat-composer-context-model.test.js
node tests/vite-chat-classic-composer-context-adapter.test.js
node tests/composer-active-state-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer context model, the classic
dynamic import adapter, active run/count projection, context-chip planning,
visibility decisions, and preservation of Composer module ownership boundaries.

For Stage D Composer current-thread refresh ESM adapter work, run:

```bash
node tests/vite-chat-composer-current-thread-refresh-model.test.js
node tests/vite-chat-classic-current-thread-refresh-adapter.test.js
node tests/current-thread-refresh-scheduling.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free current-thread refresh model, the
classic dynamic import adapter, route snapshot/match guards, pending summary
refresh decisions, refresh timer planning, and preservation of Composer module
ownership boundaries.

For Stage D Composer render-scheduler ESM adapter work, run:

```bash
node tests/vite-chat-composer-render-scheduler-model.test.js
node tests/vite-chat-classic-render-scheduler-adapter.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free render-scheduler model, the classic
dynamic import adapter, render-scheduled guards, user-scroll protection,
bottom-stick and preserved-offset planning, stale-route frame blocking, and
preservation of Composer module ownership boundaries.

For Stage D Composer viewport ESM adapter work, run:

```bash
node tests/vite-chat-composer-viewport-model.test.js
node tests/vite-chat-classic-composer-viewport-adapter.test.js
node tests/viewport-scroll-ui.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer viewport model, the classic
dynamic import adapter, terminal receipt bottom-stick decisions, send-time
viewport lock windows, user-scroll protection, and preservation of Composer
module ownership boundaries.

For Stage D Composer self-check ESM adapter work, run:

```bash
node tests/vite-chat-composer-self-check-model.test.js
node tests/vite-chat-classic-composer-self-check-adapter.test.js
node tests/composer-self-check-ui.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer self-check model, the
classic dynamic import adapter, bounded diagnostic payload/report-key planning,
terminal receipt/run/duplicate issue planning, protected-scroll bypass
reporting, and preservation of Composer module ownership boundaries.

For Stage D Composer model-selection ESM adapter work, run:

```bash
node tests/vite-chat-composer-model-selection-model.test.js
node tests/vite-chat-classic-composer-model-selection-adapter.test.js
node tests/composer-ai-mention-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer model-selection model, the
classic dynamic import adapter, assistant/default model projection, AI mention
parsing, reasoning alias mapping, selected model/provider derivation, and
preservation of Composer module ownership boundaries.

For Stage D Composer message-invalidation ESM adapter work, run:

```bash
node tests/vite-chat-composer-message-invalidation-model.test.js
node tests/vite-chat-classic-composer-message-invalidation-adapter.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer message-invalidation
model, the classic dynamic import adapter, terminal/active message
classification, terminal receipt refresh planning, protected-scroll bypass
projection, stream-patch versus full-render invalidation decisions, and
preservation of Composer module ownership boundaries.

For Stage D Composer event-state ESM adapter work, run:

```bash
node tests/vite-chat-composer-event-state-model.test.js
node tests/vite-chat-classic-composer-event-state-adapter.test.js
node tests/thread-state-ui-behavior.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer event-state model, the
classic dynamic import adapter, thread selection and summary upsert planning,
current-message upsert planning, cached chat-scope target planning, and
preservation of Composer module ownership boundaries.

For Stage D Composer source ESM adapter work, run:

```bash
node tests/vite-chat-composer-source-model.test.js
node tests/vite-chat-classic-composer-source-adapter.test.js
node tests/composer-ai-mention-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer source model, the classic
dynamic import adapter, manual and auto source selection, source-toggle control
projection, preservation of the current null search-source body contract, and
Composer module ownership boundaries.

For Stage D Composer draft-thread ESM adapter work, run:

```bash
node tests/vite-chat-composer-draft-thread-model.test.js
node tests/vite-chat-classic-draft-thread-adapter.test.js
node tests/composer-module-boundary.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free draft-thread model, the classic
dynamic import adapter, draft detection, deterministic draft thread planning,
materialize request-body projection, shared-project detection, and Composer
module ownership boundaries.

For Stage D Composer refresh-scheduler ESM adapter work, run:

```bash
node tests/vite-chat-composer-refresh-scheduler-model.test.js
node tests/vite-chat-classic-composer-refresh-scheduler-adapter.test.js
node tests/composer-refresh-scheduler.test.js
node tests/current-thread-refresh-scheduling.test.js
node tests/composer-module-boundary.test.js
node tests/vite-esm-migration-backlog.test.js
```

These checks cover the browser-global-free refresh-scheduler model, the classic
dynamic import adapter, refresh delay normalization, timer due-at calculation,
scheduled/pending refresh retention, bounded pending-delay projection, and the
existing current-thread refresh scheduling harness.

For Stage D Composer streaming-message ESM adapter work, run:

```bash
node tests/vite-chat-composer-streaming-message-model.test.js
node tests/vite-chat-classic-streaming-message-adapter.test.js
node tests/streaming-receipt-preview-ui.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-event-contract.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free streaming-message model, the classic
dynamic import adapter, live-buffer truncation, scoped delta application,
visible streaming receipt patching, render throttle planning, bottom-stick
policy, and preservation of Composer event/module ownership boundaries.

For Stage D Composer editor ESM adapter work, run:

```bash
node tests/vite-chat-composer-editor-model.test.js
node tests/vite-chat-classic-composer-editor-adapter.test.js
node tests/composer-send-pending-feedback.test.js
node tests/composer-ai-mention-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer-editor model, the classic
dynamic import adapter, request-size limits, send-after-composition fallback,
paste/caret/height planning, mention/search/send keydown planning, and
preservation of Composer module ownership boundaries.

For Stage D Composer shell ESM adapter work, run:

```bash
node tests/vite-chat-composer-shell-model.test.js
node tests/vite-chat-classic-composer-shell-adapter.test.js
node tests/voice-input-ui.test.js
node tests/mobile-bottom-region-layout.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer shell model, the classic
dynamic import adapter, sidebar-back planning, single-window/view predicates,
send/search/stop button view planning, voice-input label compatibility, mobile
bottom composer layout, and preservation of Composer module ownership
boundaries.

For Stage D Composer events ESM adapter work, run:

```bash
node tests/vite-chat-composer-events-model.test.js
node tests/vite-chat-classic-events-composer-adapter.test.js
node tests/composer-event-contract.test.js
node tests/thread-state-ui-behavior.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer-events model, the classic
dynamic import adapter, event type classification, todos refresh planning,
terminal thread-update refresh planning, task/message event projection, and
preservation of Composer event/module ownership boundaries.

For Stage D Composer send UI ESM adapter work, run:

```bash
node tests/vite-chat-composer-send-ui-model.test.js
node tests/vite-chat-classic-composer-send-ui-adapter.test.js
node tests/composer-send-pending-feedback.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer-send-ui model, the classic
dynamic import adapter, send-result route/task-group/reset planning, Owner
elevation availability/copy/tag cleanup, group mention token/filter/insertion
planning, pending-send feedback compatibility, and preservation of Composer
module ownership boundaries.

For Stage D Composer pending-send ESM adapter work, run:

```bash
node tests/vite-chat-composer-model.test.js
node tests/vite-chat-classic-composer-pending-send-adapter.test.js
node tests/composer-send-pending-feedback.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free composer model, the classic dynamic
import adapter, optimistic local user/assistant planning, rollback compatibility,
viewport timing policy, and preservation of Composer module ownership
boundaries.

For Stage D Kanban Composer actions ESM adapter work, run:

```bash
node tests/vite-kanban-composer-actions-model.test.js
node tests/vite-kanban-classic-composer-actions-adapter.test.js
node tests/task-list-ui.test.js
node tests/composer-module-boundary.test.js
```

These checks cover the browser-global-free Kanban Composer actions model, the
classic dynamic import adapter, bounded local message/document/plan projection,
batch request planning, and preservation of Kanban/Composer module ownership
boundaries.

## Home AI TTS

Changes to local TTS synthesis, workspace TTS Profiles, TTS asset persistence,
Music demo narration batch generation, or Roon watched-folder output must run:

```bash
node tests/home-ai-tts-service.test.js
node tests/home-ai-tts-api-routes.test.js
node tests/mobile-api-dispatcher.test.js
node tests/task-list-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/architecture-refactor-boundary.test.js
```

When the provider implementation changes from the macOS fallback to MeloTTS,
CosyVoice, Piper, or another model runtime, add a local smoke that generates a
short Chinese/English mixed narration file without printing raw user scripts,
secrets, or long logs.

## Growth Host Residual Boundary

Growth business behavior is plugin-owned. Host changes that touch Growth
provisioning, plugin launch/proxy/facade, legacy Growth URL compatibility,
Growth Web Push/Action Inbox routing, or any remaining `learning-*`,
`growth-*`, `study-*`, or `assessment-*` host files must run:

```bash
node scripts/growth-host-residual-boundary-check.js --json
node tests/growth-host-residual-boundary-check.test.js
node tests/growth-plugin-provisioning-service.test.js
node tests/growth-plugin-facade-service.test.js
node tests/growth-plugin-facade-api-routes.test.js
```

The host residual count may go down as legacy code is deleted or migrated to
`/Users/example/path`, but it must not go up.
New learner-program, card-authoring, submission/evaluation/reflection, mastery,
or Growth UI behavior belongs in the Growth plugin workspace, not in the host.

## Engineering Governance Gate

Changes to CI, deployment behavior, production diagnostics, public release
behavior, or productization rules must run:

```bash
node scripts/engineering-governance-check.js --json
node scripts/fallback-governance-check.js --json
node scripts/public-install-preflight.js --source-only --json
node scripts/homeai-install-upgrade-canary.js --json
node scripts/plugin-provisioning-coverage-audit.js
node scripts/macos-install-phase-coverage-audit.js
node scripts/macos-fresh-install-rehearsal.js
node scripts/macos-first-start-preflight.js --source-only --json
node scripts/macos-install-verification-classification.js
node scripts/macos-install-operator-closure-checklist.js
node scripts/grok-xai-oauth-closure-checklist.js
node scripts/windows-dev-services-boundary-checklist.js
node scripts/macos-workspace-file-broker-boundary-checklist.js
node tests/codex-mobile-recovery-service.test.js
node tests/codex-mobile-recovery-api-routes.test.js
node scripts/macos-web-push-production-audit.js --source-check --json
node scripts/macos-web-push-production-audit.js --root <mac-root> --public-origin <external-origin> --require-public-origin --require-active-external-subscription --json
node scripts/production-self-diagnostics.js
node scripts/production-self-diagnostics-coverage-audit.js
node scripts/productization-acceptance-matrix.js --verify-docs
node tests/public-install-preflight.test.js
node tests/install-macos-production.test.js
node tests/macos-first-start-preflight.test.js
node tests/macos-install-verification-classification.test.js
node tests/macos-install-operator-closure-checklist.test.js
node tests/grok-xai-oauth-closure-checklist.test.js
node tests/windows-dev-services-boundary-checklist.test.js
node tests/macos-workspace-file-broker-boundary-checklist.test.js
node tests/macos-web-push-production-audit.test.js
node tests/codex-mobile-recovery-service.test.js
node tests/codex-mobile-recovery-api-routes.test.js
node tests/plugin-provisioning-coverage-audit.test.js
node tests/engineering-governance-check.test.js
node tests/fallback-governance-check.test.js
node tests/production-self-diagnostics.test.js
node tests/productization-acceptance-matrix.test.js
```

The gate enforces three repository-level requirements:

- CI-enforced constraints remain connected through `npm run productization:check`;
- fallback governance remains wired through `fallback-governance-check.js`,
  `fallback-governance-check.test.js`, the fallback registry, and AI Ops intake;
- public install metadata remains checked by `public-install-preflight.js`;
- production self-diagnostics remain documented and discoverable;
- the Productization Acceptance Matrix in
  `docs/IMPLEMENTATION_NOTES/engineering-governance-gates.md` remains part of
  the test and documentation routing.

`node scripts/public-install-preflight.js --markdown` prints the maintained
public install preflight report for the current host. `node
scripts/install-macos-production.sh --json` prints the phase-based macOS
installer plan, and `--execute --phase <id>` is limited to read-only phases
until privileged phases have rollback tests. `node
scripts/macos-install-phase-coverage-audit.js` verifies that installer phase
definitions, command generation, execution dispatch, executable allowlist,
docs, and install tests stay synchronized. `node
scripts/macos-fresh-install-rehearsal.js` executes the source-only no-sudo
fresh-install staging phases in a temporary root and verifies the key install
artifacts are written. `node
scripts/macos-install-verification-classification.js` classifies every macOS
install phase as `source_check`, `source_rehearsed`, `external_input`,
`privileged_apply`, or `live_runtime`, proving which phases are already covered
by source-only rehearsal and which still require operator input, sudo apply, or
live production checks. `node
scripts/macos-install-operator-closure-checklist.js` turns those non-source-only
classes into bounded operator closure commands, required evidence, operator
inputs, and risk boundaries. `node
scripts/production-self-diagnostics-coverage-audit.js` verifies that the
production diagnostic inventory stays synchronized across script entries,
source harnesses linked to diagnostic script names or ids, bounded command
templates with deployment-specific paths parameterized, and durable docs. `node
scripts/production-self-diagnostics.js --markdown` prints the maintained
production diagnostic checklist with command templates. `node
scripts/productization-acceptance-matrix.js --markdown` prints the acceptance
matrix template for implementation notes, pull requests, or handoffs.

## Runtime Boundary Closure Gate

Changes that cross Gateway run events, message projection, deterministic plugin
message actions, or fallback registration must keep the central runtime
boundary contract synchronized:

```bash
node tests/home-ai-runtime-boundary-contract.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node tests/gateway-run-output-event-service.test.js
node tests/gateway-run-event-service.test.js
node tests/thread-view-service.test.js
node tests/wardrobe-outfit-wear-intent-action-service.test.js
node tests/plugin-action-metadata-closure-service.test.js
node tests/plugin-action-metadata-closure-smoke.test.js
node tests/plugin-conversation-action-api-routes.test.js
node scripts/plugin-action-metadata-closure-smoke.js --json
node scripts/fallback-governance-check.js --json
git diff --check
```

The guard verifies the Run Pipeline Boundary, Message Projection Boundary,
Plugin Action Bridge Boundary, and Fallback Registry Boundary are linked from
the docs index, architecture boundary, architecture-code-test-harness map, test
matrix, current Wardrobe deterministic action implementation, source-side
action metadata closure smoke, and active fallback registry.

## Composer Event And Receipt Gate

Changes to Composer event fanout, current-thread refresh, terminal receipt
visibility, user-scroll protection, or Composer self-checks must keep
`docs/IMPLEMENTATION_NOTES/composer-event-contract.md` synchronized and run:

```bash
node tests/composer-event-contract.test.js
node tests/composer-module-boundary.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-refresh-scheduler.test.js
node tests/composer-self-check-ui.test.js
node tests/current-thread-refresh-scheduling.test.js
node tests/thread-state-ui-behavior.test.js
node tests/run-progress-ui-behavior.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
git diff --check
```

The harness must prove that a terminal summary can trigger a delayed detail
refresh, the refreshed terminal receipt metadata becomes visible, and protected
user scroll prevents forced bottom scrolling.

Use the matrix for every product-facing change: Owner behavior, non-Owner
behavior, public fresh install, public update, migration/restore,
backup/rollback, permission boundaries, UI/PWA cache behavior, and production
self-diagnostic coverage. Mark non-applicable dimensions explicitly instead of
silently omitting them.

## Plugin Capability Closure Gate

Changes to plugin capabilities that cross manifest/MCP schema, Home AI
profile/schema sync, Gateway callable registry, plugin conversation surfaces,
UI/action metadata, production smoke, or task-card return closure must keep
`docs/PLATFORM_CONTRACTS/plugin-capability-closure-contract.md` synchronized
and run:

```bash
node tests/plugin-capability-closure-smoke.test.js
node tests/plugin-action-metadata-closure-service.test.js
node tests/plugin-action-metadata-closure-smoke.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node scripts/plugin-action-metadata-closure-smoke.js --json
git diff --check
```

For source-only closure evidence, run:

```bash
node scripts/plugin-capability-closure-smoke.js --source-only
```

MCP callable/schema changes must additionally run:

```bash
node tests/mcp-tool-upgrade-closure-harness.test.js
node tests/gateway-run-instruction-service.test.js
```

Deterministic message-action capabilities must additionally run the relevant
run-output, projection, action-route, and UI tests, such as:

```bash
node tests/gateway-run-output-event-service.test.js
node tests/thread-view-service.test.js
node tests/plugin-conversation-action-api-routes.test.js
node tests/task-list-ui.test.js
```

The Productization Acceptance Matrix dimensions are:

- `owner-workspace`: Owner workspace behavior;
- `non-owner-workspace`: Non-Owner workspace behavior;
- `public-fresh-install`: Public fresh install behavior;
- `public-update`: Public update behavior;
- `migration-restore`: Migration or restore behavior;
- `backup-rollback`: Backup and rollback path;
- `permission-boundary`: Permission boundary;
- `ui-pwa-cache`: UI, PWA, and cache behavior;
- `production-self-diagnostic`: Production self-diagnostic coverage.

Accepted `production-self-diagnostic` evidence ids are:
`status-smoke`, `profile-audit`, `grok-xai-oauth-metadata`,
`grok-xai-oauth-closure`, `windows-dev-services-boundary`,
`workspace-file-broker-boundary`, `deployment-drift-gate`,
`first-start-preflight`, `macos-install-phase-coverage`,
`macos-fresh-install-rehearsal`,
`macos-install-verification-classification`,
`macos-install-operator-closure`,
`production-self-diagnostics-coverage`, `self-improving-loop`, `public-upgrade-rehearsal`,
`production-drift-reconcile`,
`production-drift-watchdog`, `web-push-production-audit`,
`worker-filesystem-access`, `workspace-target-acl`, `gateway-manifest-toolset`,
`gateway-document-file-tools-schema`, `plugin-directory`,
`bound-directory-preview`, `automation-cron`, `automation-cron-launchd`, `plugin-workspace-audit`,
`plugin-provisioning-coverage`, and `production-closure`.

## AI Operations Control Plane Gate

For H1/H2 changes, multi-plugin changes, visual harness work, production
deployment work, or incident follow-up, generate a control-plane context pack
and required-check plan before broad source exploration:

```powershell
node scripts\ai-ops-control-plane.js intake --task "<short task>" --json
node scripts\ai-ops-control-plane.js required-checks --changed-file <path> --json
```

Changes to the control plane itself must run:

```powershell
node tests\ai-operations-control-plane-service.test.js
node tests\ai-ops-control-plane-cli.test.js
node tests\ai-ops-diagnostic-intake-service.test.js
node tests\ai-ops-diagnostic-remediation-service.test.js
node tests\ai-ops-diagnostic-remediation-workflow-service.test.js
node tests\task-card-dispatch-result-service.test.js
node tests\ai-ops-diagnostic-api-routes.test.js
node tests\ai-ops-diagnostic-feedback-ui.test.js
node tests\plugin-conversation-action-bridge-service.test.js
node tests\plugin-conversation-action-api-routes.test.js
node tests\codex-thread-task-card-service.test.js
node tests\app-action-inbox-ui.test.js
node tests\api-route-inventory.test.js
node tests\mobile-api-dispatcher.test.js
node tests\task-list-ui.test.js
node tests\static-cache-version-harness.test.js
node tests\fallback-governance-check.test.js
node tests\architecture-code-test-harness-map.test.js
node tests\architecture-refactor-boundary.test.js
node --check adapters\ai-operations-control-plane-service.js
node --check adapters\ai-ops-diagnostic-intake-service.js
node --check adapters\ai-ops-diagnostic-remediation-service.js
node --check adapters\ai-ops-diagnostic-remediation-workflow-service.js
node --check adapters\plugin-conversation-action-bridge-service.js
node --check server-routes\ai-ops-diagnostic-api-routes.js
node --check server-routes\plugin-conversation-action-api-routes.js
node --check public\app-ai-ops-diagnostics-ui.js
node --check scripts\ai-ops-control-plane.js
node --check scripts\fallback-governance-check.js
node scripts\fallback-governance-check.js --json
git diff --check
```

Owner System Console changes must run the service, resource, route, and static
UI checks together because the console is an Owner-only operational surface.
Quality evidence changes must prove that executed clean-target canary steps can
close `clean_target_live_canary`, while aggregated canary summaries without
step evidence cannot:

```powershell
node --check adapters\owner-3a-quality-evidence-service.js
node --check adapters\owner-3a-quality-program-service.js
node --check adapters\owner-system-console-service.js
node --check adapters\system-resource-status-service.js
node --check server-routes\owner-system-console-api-routes.js
node --check public\app-owner-system-console-ui.js
node tests\owner-3a-quality-evidence-service.test.js
node tests\owner-3a-quality-program-service.test.js
node tests\owner-system-console-service.test.js
node tests\system-resource-status-service.test.js
node tests\owner-system-console-api-routes.test.js
node tests\owner-system-console-ui.test.js
node tests\mobile-api-platform-composition.test.js
node tests\mobile-api-dispatcher.test.js
node tests\task-list-ui.test.js
node tests\architecture-refactor-boundary.test.js
node tests\architecture-code-test-harness-map.test.js
node scripts\fallback-governance-check.js --json
git diff --check
```

Autonomous Delivery Loop dispatch, Worker scheduling, duplicate suppression,
return-card Watchdog, routing-decision gate, or Owner Console delivery-loop
visibility changes must run the focused coordinator, routing-decision,
idempotency, scheduler, Watchdog, task-card, and console Harness together. This
gate is source-safe and does not execute install or production deploy lane
tests. Thread routing changes must prove special thread purposes are enforced:
implementation cards cannot fall back to
same-workspace Public PR/deploy/audit/task-intake threads, deploy cards route
only to deploy lanes, audit cards route only to audit lanes, plugin-domain
natural-language normal-card requests route to the plugin main/source thread as
requirements analysis, explicit plugin Loop-card requests route to plugin
source-owned Loop requirements, and missing role lanes fail closed instead of
dispatching a best-effort card. Lifecycle-required slices must prove Home AI
calls Codex Mobile `/api/at-loop/thread-lifecycle`, stores only bounded
resolution metadata, dispatches to the returned exact thread id, and records
`dispatchStatus=failed` without sending a task card when lifecycle resolution
fails:

Return-driven continuation changes must prove terminal Worker/plugin/deploy/
audit returns are integrated as scheduler events before any final user-facing
receipt. The source scheduler must record or apply a bounded
`return_continuation_decision` with `original_objective_satisfied`,
`continuation_required`, `next_action_type`, target role/workspace/thread,
source/return/workflow ids, and either `continuation_dispatch_card_id` or
`blocked_reason`. Fixtures must cover at least: `completed` with no remaining
evidence closes only when the original objective is satisfied; source-fix-ready
returns dispatch deploy/readback or record a deployment blocker;
Worker-now-available returns dispatch the next Worker instead of replying
"can dispatch now"; redirected returns route to the owning lane; missing
Harness/readback returns dispatch verification; illegal next actions record
`blocked_missing_continuation_dispatch`:

Central deploy governance changes must prove Worker-origin Deploy Lane cards
are blocked unless a complete emergency override is present, central
coordinator Deploy Lane cards are allowed, Worker return `deployRequest`
metadata is accepted without becoming deploy authorization, divergent deploy
refs are marked integration-required, and plugin source/main direct
central-governance Worker implementation cards fail closed.

Source return follow-up action changes must prove terminal returns with
`completed + deploy_needed=true` create a bounded `pendingSourceAction`,
ordinary completed returns without follow-up do not, structured
`deployRequest.needed=true` wins over text markers, pending actions can be
resolved by central Deploy Lane dispatch or marked `blocked`/`dismissed` with
reasons, terminal receipts remain terminal/non-active, and deploy-needed
actions feed central deploy aggregation instead of authorizing direct deploy:

Source return integration changes must also prove every terminal return creates
a bounded `sourceActivation` receipt, including returns whose source thread is
reported as `completed` or `resting`; follow-up returns keep
`sourceActivation.status=pending_source_action`; stale integrations mark
`return_projection_missing_after_terminal_return`; and duplicate terminal
returns do not duplicate pending source actions or Owner-visible prompts:

```powershell
node --check adapters\autonomous-delivery-case-ledger-service.js
node --check adapters\autonomous-delivery-coordinator-service.js
node --check adapters\autonomous-delivery-routing-decision-service.js
node --check adapters\main-thread-routing-preflight-service.js
node --check adapters\central-deploy-governance-service.js
node --check adapters\task-card-dispatch-idempotency-service.js
node --check adapters\worker-lane-scheduler-service.js
node --check adapters\return-watchdog-service.js
node --check adapters\source-return-integration-watchdog-service.js
node --check adapters\source-return-follow-up-action-service.js
node --check adapters\codex-thread-task-card-service.js
node --check adapters\codex-mobile-at-loop-status-service.js
node --check adapters\owner-system-console-service.js
node --check server-routes\autonomous-delivery-api-routes.js
node --check server-routes\owner-system-console-api-routes.js
node --check public\app-owner-system-console-ui.js
node --check scripts\main-thread-routing-preflight.js
node --check scripts\worker-handoff-lifecycle-check.js
node tests\autonomous-delivery-case-ledger-service.test.js
node tests\autonomous-delivery-coordinator-service.test.js
node tests\autonomous-delivery-routing-decision-service.test.js
node tests\main-thread-routing-preflight-service.test.js
node tests\central-deploy-governance-service.test.js
node tests\deploy-upgrade-lane-closure-service.test.js
node tests\task-card-dispatch-idempotency-service.test.js
node tests\worker-lane-scheduler-service.test.js
node tests\return-watchdog-service.test.js
node tests\source-return-integration-watchdog-service.test.js
node tests\source-return-follow-up-action-service.test.js
node tests\autonomous-delivery-api-routes.test.js
node tests\codex-thread-task-card-service.test.js
node tests\codex-mobile-at-loop-status-service.test.js
node tests\owner-system-console-service.test.js
node tests\owner-system-console-api-routes.test.js
node tests\owner-system-console-ui.test.js
node tests\home-ai-self-improving-loop-service.test.js
node tests\architecture-code-test-harness-map.test.js
node tests\architecture-refactor-boundary.test.js
node tests\autonomous-delivery-task-card-triage-doc.test.js
node tests\worker-handoff-lifecycle-check.test.js
node scripts\worker-handoff-lifecycle-check.js --json
node scripts\fallback-governance-check.js --json
git diff --check
```

Loop Engineering requirements/implementation/audit role-loop changes build on
the Autonomous Delivery gate above. Documentation-only changes to the loop
contract or implementation plan must at minimum run:

```powershell
node tests\architecture-code-test-harness-map.test.js
node tests\autonomous-delivery-task-card-triage-doc.test.js
node tests\worker-handoff-lifecycle-check.test.js
node scripts\worker-handoff-lifecycle-check.js --json
git diff --check
```

Plugin main-thread Worker/preflight contract changes also affect plugin-local
pointer files and AGENTS.md guidance. They must prove the central routing
preflight classifies plugin-main source work as `plugin_worker`, rejects
forbidden Worker fallbacks, requires `terminalReturnLanguageZhCn` for Worker
cards, requires per-task-card heartbeat fields
(`taskCardHeartbeatRequired`, `taskCardWatchdogTimeoutMs`,
`taskCardWatchdogBatchLimit`, and `taskCardWatchdogMaxAutoResume`), and that the
platform pointer checker requires the plugin main preflight command, plugin
Worker dispatch policy, and plugin Worker pool lifecycle policy for the current
contract version. The lifecycle policy must cover resolve-before-create, stable
Worker pool reuse, busy/available lease state, per-task-card heartbeat,
`1800000ms` task-card Watchdog timeout, batch limit `8`, max auto-resume `1`,
task-title sprawl rejection, bounded create reasons, and Chinese terminal
receipts. Home AI coordinator coverage must also prove plugin implementation
slices use `cardKind=plugin_worker`, forward plugin worker lifecycle metadata,
reduce multiple compatible plugin Worker candidates to one exact target before
dispatch, and return `pool_exhausted` rather than `target_ambiguous` when all
compatible lanes are busy:

```powershell
node --check adapters\main-thread-routing-preflight-service.js
node --check adapters\autonomous-delivery-routing-decision-service.js
node --check scripts\main-thread-routing-preflight.js
node --check scripts\plugin-workspace-platform-contract-check.js
node --check adapters\worker-lane-scheduler-service.js
node --check tests\main-thread-routing-preflight-service.test.js
node --check tests\autonomous-delivery-routing-decision-service.test.js
node --check tests\autonomous-delivery-coordinator-service.test.js
node --check tests\codex-thread-task-card-service.test.js
node --check tests\plugin-workspace-platform-contract-check.test.js
node --check tests\worker-lane-scheduler-service.test.js
node tests\main-thread-routing-preflight-service.test.js
node tests\autonomous-delivery-routing-decision-service.test.js
node tests\autonomous-delivery-coordinator-service.test.js
node tests\codex-thread-task-card-service.test.js
node tests\plugin-workspace-platform-contract-check.test.js
node tests\worker-lane-scheduler-service.test.js
node tests\architecture-refactor-boundary.test.js
node scripts\fallback-governance-check.js --changed-file docs\PLATFORM_CONTRACTS\autonomous-delivery-loop-contract.md --changed-file docs\PLATFORM_CONTRACTS\worker-pool-lifecycle-contract.md --changed-file docs\PLATFORM_CONTRACTS\plugin-workspace-platform-contract.md --changed-file scripts\plugin-workspace-platform-contract-check.js --changed-file adapters\main-thread-routing-preflight-service.js --changed-file adapters\autonomous-delivery-routing-decision-service.js --changed-file adapters\worker-lane-scheduler-service.js --json
git diff --check
```

Generic `@loop` trigger parsing, Loop task runtime, iteration routing,
cross-thread role-card creation, and return-card correlation are Codex Mobile
runtime behavior. Implement those in the Codex Mobile workspace and run the
Codex Mobile Loop/task-card test suite there. Home AI tests cover only the
Home AI domain adapter, Owner Console/Action Inbox projection, platform
repair/deploy routing, thread-purpose guard, and Autonomous Delivery
compatibility projection.

When Loop Engineering code is added or changed, run the focused planner,
coordinator, dispatch, Watchdog, audit-routing, and Owner Console Harnesses
together:

```powershell
node --check adapters\loop-engineering-plan-service.js
node --check adapters\codex-mobile-at-loop-status-service.js
node tests\loop-engineering-plan-service.test.js
node tests\codex-mobile-at-loop-status-service.test.js
node tests\autonomous-delivery-coordinator-service.test.js
node tests\task-card-dispatch-idempotency-service.test.js
node tests\worker-lane-scheduler-service.test.js
node tests\return-watchdog-service.test.js
node tests\autonomous-delivery-api-routes.test.js
node tests\codex-thread-task-card-service.test.js
node tests\owner-system-console-service.test.js
node tests\owner-system-console-api-routes.test.js
node tests\owner-system-console-ui.test.js
node tests\app-action-inbox-ui.test.js
node tests\architecture-code-test-harness-map.test.js
node tests\architecture-refactor-boundary.test.js
node scripts\fallback-governance-check.js --json
git diff --check
```

Loop Engineering product-audit closure is not complete until the audit role
returns `passed` and the case has bounded source tests, Harness evidence,
deployment/readback evidence when applicable, privacy confirmation, and
terminal return-card evidence. Failed audit verdicts route back to requirements
or implementation; they must not be treated as ordinary completed returns.

Runtime diagnostic intake changes must additionally prove:

- workspace-authenticated event submission and Owner-only case/event/state
  routes;
- persisted diagnostic rows contain bounded metadata, hashed thread ids, and no
  raw secrets or private content;
- static shell cache version and service-worker lists include
  `app-ai-ops-diagnostics-ui.js`;
- the hidden client trigger does not occupy the native shell two-finger long
  press gesture; the default web trigger is three-finger long press, while the
  native shell can open the same sheet with `homeai:open-diagnostic-feedback`;
- embedded plugin automatic reports use `homeai.diagnostic.report`, are accepted
  only from a current plugin iframe, submit through the same diagnostic intake
  route, and redact raw titles, URLs, file paths, provider payloads, cookies,
  launch tokens, screenshots, and long logs.
- trusted plugin reports preserve safe `counts`, safe `context`, and whitelisted
  `breadcrumbs[].fields` through diagnostic intake storage while unsafe
  body/text/prompt/task-content/token/cookie/path/url/provider fields are
  stripped or redacted.
- plugin report case grouping uses only sanitized error class plus bounded
  resource hashes such as `context.item_hash` or breadcrumb `fields.item_hash`;
  different Music playback item hashes create separate cases and Owner
  notifications, while repeated failures for the same item hash roll up.

Diagnostic remediation loop changes must additionally prove:

- H1/H2 high-confidence cases generate an Owner-only Action Inbox notification,
  even when the diagnostic came from a non-Owner workspace;
- diagnostic submission never auto-dispatches Codex task cards;
- Owner-triggered dispatch re-reads the bounded case/events, rebuilds the
  remediation plan, sends the card through the Codex task-card interface, and
  records the case transition to `card_sent`;
- Owner-triggered dispatch must not mark a case `card_sent`, complete its
  approval row, or send a duplicate approval push unless task-card transport
  returns at least one concrete task-card id;
- plugin-runtime errors route to the owning plugin workspace, while Gateway,
  toolset, MCP/schema, host proxy, permission, manifest, static cache, and
  embedded-shell errors route to Home AI ownership;
- privacy-unsafe, low-confidence, low-severity, terminal, unknown-target, or
  high-risk physical/device-control cases remain blocked and produce no
  automatic notification/dispatch side effect.

Plugin conversation repair-request changes must additionally prove:

- request creation is workspace-authenticated but creates an Owner-only Action
  Inbox approval item;
- ordinary plugin capability-gap request creation does not auto-dispatch a
  Codex task card;
- bounded low-risk Codex Mobile thread/routing mismatch requests auto-dispatch
  exactly one Codex task card through the same task-card service without an
  Owner prompt, complete the Inbox item only after a concrete task-card id is
  returned, and return the prior task-card id for duplicate equivalent
  requests;
- Codex Mobile thread/routing mismatch requests containing production deploy,
  secret/key/token, database/data import, physical-device, Finance transaction,
  Wardrobe private-data, or similar high-risk wording remain Owner-gated;
- target thread/workspace comes from the central plugin target map, not from
  arbitrary request body fields;
- Owner-triggered dispatch can attach an optional Owner prompt and appends it
  to the task card under `Owner Additional Prompt`;
- Owner-triggered dispatch keeps the approval item open and returns a bounded
  failure when task-card transport fails or returns no concrete task-card id;
- plugin-topic repair cards preserve coordinator return routing: explicit
  `replyToThreadId` wins, Home-AI-owned repair cards created from
  `Home AI Task Intake` resolve the current `Home AI` coordinator thread before
  card creation, and host-owned redirects/terminal returns do not fall back to
  Task Intake unless the request truly originated there;
- auto-dispatch failure also keeps the approval item open and does not send an
  Owner prompt notification, complete the row, or manufacture a task-card id;
- an equivalent request after successful dispatch keeps the terminal approval
  terminal, does not send a second task card, and does not send another Web Push;
- non-Owner workspaces cannot dispatch cards or attach Owner prompts;
- the Action Inbox UI exposes `发修复卡`, `稍后`, and `删除` for
  `sourceType=plugin_conversation` repair requests;
- host-side assistant replies can append hidden
  `homeai-plugin-conversation-action` JSON metadata that is stripped from
  display, deduped, and forwarded to `/api/plugin-conversation/actions` as an
  Owner approval item without inventing `t_*`, `ainb_*`, or `ttc_*` ids;
- request bodies, Inbox rows, push payloads, and task cards stay bounded and do
  not include raw plugin records, health records, financial rows, mailbox
  bodies, wardrobe images, provider payloads, screenshots, launch tokens,
  cookies, raw transcripts, or long logs.

When the control plane is used for production closure, append an evidence
ledger entry for every focused test, aggregate test, deployment, and production
smoke. Incident work should create an incident cassette instead of storing raw
logs or long private context in handoff.

For plugin workspace contract or pointer changes, the platform checker must
also pass after the pointer files are updated:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --json
node tests\plugin-workspace-platform-contract-check.test.js
```

The checker enforces `ai_ops_control_plane_command`,
`ai_ops_required_flow`, and `ai_ops_evidence_ledger` in every included plugin
pointer. A plugin thread that starts H1/H2, deployment, visual-debug,
MCP/schema, plugin-provisioning, or cross-module work without the control-plane
intake packet is outside the platform contract.

For Home AI native iOS shell pointer or platform-management changes, also run:

```bash
node scripts/plugin-workspace-platform-contract-check.js --target home-ai-native-ios --json
```

The native shell is checked as `platform_management_status=managed_native_client`,
not as a Dock plugin, LaunchDaemon service, MCP provider, or loopback manifest
plugin.

For plugin manifest load recovery, restart label resolution, or local plugin
cold-restart behavior, run:

```bash
node tests/plugin-launch-recovery-service.test.js
node tests/codex-mobile-recovery-service.test.js
node tests/codex-mobile-recovery-api-routes.test.js
node tests/hermes-plugin-service.test.js
node tests/hermes-plugin-api-routes.test.js
node tests/macos-production-deploy-script.test.js
node tests/production-status-smoke-harness.test.js
node tests/architecture-refactor-boundary.test.js
```

Coverage must prove recoverable local manifest failures can request exactly one
bounded restart and retry, while external manifests, workspace authorization
failures, and non-`com.hermesmobile.plugin.*` labels do not trigger restart.

For native iOS/APNs notification registration, device persistence, APNs fanout,
or the Web Push to native notification bridge, run:

```bash
node --check adapters/native-notification-service.js
node --check adapters/web-push-native-channel-service.js
node --check server-routes/native-device-api-routes.js
node tests/native-notification-service.test.js
node tests/native-device-api-routes.test.js
node tests/mobile-sqlite-store.test.js
node tests/web-push-delivery-service.test.js
node tests/mobile-api-platform-composition.test.js
node tests/mobile-api-dispatcher.test.js
node tests/api-route-inventory.test.js
node tests/architecture-refactor-boundary.test.js
```

Coverage must prove `X-Hermes-Web-Key` scoped registration, workspace spoof
rejection, idempotent `workspace+platform+provider+tokenHash` upsert, no raw
token exposure in API responses, sandbox/production APNs routing, invalid-token
disable behavior, forwarding of the native shell's app bundle/version/build,
`environment`, and `source=home_ai_native` fields, and that Web Push
subscriptions remain separate from native APNs devices. The native shell
currently receives `deepLink` in APNs payloads but does not route the `WKWebView`
on notification tap; tests should not claim tap-to-route completion until the
native bridge is implemented.

For native secure secret clipboard handoff server-side changes, run:

```bash
node --check adapters/native-secure-secret-broker-service.js
node --check server-routes/native-secure-secret-api-routes.js
node --check server-routes/mobile-api-composition.js
node --check server-routes/mobile-api-dispatcher.js
node tests/native-secure-secret-broker-service.test.js
node tests/native-secure-secret-api-routes.test.js
node tests/mobile-api-dispatcher.test.js
node tests/api-route-inventory.test.js
node tests/architecture-refactor-boundary.test.js
```

Coverage must prove native requests are authenticated only with
`X-Hermes-Web-Key`, workspace/actor come from auth context rather than request
body overrides, audit read-only keys are denied, create responses expose only
`secretRef` plus bounded metadata, resolve is workspace/target/purpose scoped,
expired/used-up refs fail closed, and no raw secret appears in normal response
metadata. iOS shell changes still require the native Xcode checks documented in
the Native iOS shell row.

For native iOS shell version policy server-side changes, run:

```bash
node --check adapters/native-ios-shell-version-policy-service.js
node --check server-routes/native-ios-shell-api-routes.js
node --check server-routes/mobile-api-platform-composition.js
node --check server-routes/mobile-api-composition.js
node --check server-routes/mobile-api-dispatcher.js
node tests/native-ios-shell-version-policy-service.test.js
node tests/native-ios-shell-api-routes.test.js
node tests/mobile-api-platform-composition.test.js
node tests/mobile-api-dispatcher.test.js
node tests/api-route-inventory.test.js
node tests/architecture-refactor-boundary.test.js
```

Coverage must prove the endpoint is public-safe and pre-auth, current Build 35
is not locked out by default, older builds require update only after an
explicit minimum-build bump, malformed build numbers fail closed with bounded
metadata, and the returned TestFlight URL is constrained to
`https://testflight.apple.com/join/<code>`.

For native environment context snapshot and Gateway `current_environment` tool
changes, run:

```bash
node --check adapters/current-environment-context-service.js
node --check server-routes/native-environment-context-api-routes.js
node --check public/app-event-stream-ui.js
python3 -m py_compile gateway-plugins/hermes-mobile-current-environment/__init__.py
node tests/current-environment-context-service.test.js
node tests/native-environment-context-api-routes.test.js
node tests/native-environment-context-ui.test.js
node tests/mobile-api-platform-composition.test.js
node tests/mobile-api-dispatcher.test.js
node tests/api-route-inventory.test.js
node tests/startup-scripts.test.js
node tests/architecture-refactor-boundary.test.js
```

Coverage must prove workspace-clamped snapshot upsert, TTL expiry, compact
normalization without full forecast arrays, native-shell best-effort snapshot
refresh before send, bridge-host readback, and low Gateway profile exposure of
the `current_environment` plugin/toolset.

For plugin workspace audit creation, manual Product Reality trigger, runner report
language, or Action Inbox audit entry changes, run:

```bash
node tests/plugin-workspace-audit-service.test.js
node tests/deep-product-reality-batch-ledger-service.test.js
node tests/plugin-workspace-audit-runner.test.js
node tests/automation-api-routes.test.js
node tests/cron-dispatcher-plugin-audit-harness.test.js
node tests/app-action-inbox-ui.test.js
node tests/static-cache-version-harness.test.js
```

## Harness Requirement Gate

Before implementing non-trivial workflow changes, classify the change with
`docs\IMPLEMENTATION_NOTES\harness-required-matrix.md`.

- H1 flows require a workflow harness or a new harness scenario before the
  change is complete.
- H2 flows require contract/projection coverage for navigation, scroll,
  routing, cache, or visible status behavior.
- H3 changes may use focused syntax/unit/UI tests only when they do not alter
  state, async behavior, permissions, routing, release artifacts, navigation,
  scroll, or service-worker behavior.

For all Hermes Mobile mobile/PWA function, UI, navigation, cache,
service-worker, Web Push, file preview, and embedded-plugin validation, the
primary smoke path is the installed home-screen PWA icon in the emulator or
target device. Browser address-bar navigation is not a valid substitute; it is
browser-mode evidence only and may intentionally show the browser-shell guard
page.
User-visible state synchronization repairs that involve optimistic UI,
submitted echo, durable projection, thread/detail refresh, message ordering,
SSE/EventSource, session replay, iframe/plugin boot, static cache/client
versioning, PWA/native-shell differences, file/camera/picker flows, or visible
rows that disappear, duplicate, reorder, or show incorrect state must follow
the repeated-failure rule in
`docs\IMPLEMENTATION_NOTES\harness-required-matrix.md`. The first low-risk
repair may use focused tests only if the return states whether a real workflow
Harness ran. Once the Owner reports the same symptom after a completed or
partially completed repair, the next repair is `harness_required`; after a
second failed closure, a `completed` return must include failing-then-passing
real workflow Harness evidence. Otherwise return `blocked_missing_repro_harness`
or `partially_completed` with the exact missing Harness path. Evidence must be
bounded machine-readable state such as counts, ids/hashes, active
workspace/thread, durable/pending counts, visible DOM row counts,
session/status codes, client version/build id, and timing buckets, never raw
messages, keys, cookies, launch tokens, endpoint bodies, database rows, private
screenshots, or long logs.
Static-client cache fixes must prove both sides of the version contract:
unauthenticated `/api/client-version?clientVersion=<new-version>` returns
`refreshRequired=false`, the previous deployed static version returns
`refreshRequired=true`, and cache-sensitive JavaScript changes use a new
`?v=<client-version>` query string. If a production sync missed a script and the
same version was already exposed, the corrective deploy must bump the static
version again. Focused checks: `node tests\task-list-ui.test.js` and
`node tests\static-cache-version-harness.test.js`. Composer module-boundary,
current-thread refresh, event fanout, streaming, model/mention, editor, mobile
viewport, Composer self-check, native environment, attachment, pending-send, or send changes also run
`node tests\composer-module-boundary.test.js`,
`node tests\composer-refresh-scheduler.test.js`,
`node tests\current-thread-refresh-scheduling.test.js`, and
`node tests\composer-message-invalidation-ui.test.js`. Composer self-check
changes also run `node tests\composer-self-check-ui.test.js`,
`node tests\self-improving-runtime-health-observation-service.test.js`, and
`node tests\home-ai-self-improving-loop-service.test.js`. Self-improving loop
signal, Runtime SLO, diagnostic closure, or production observation changes also
run `node tests\home-ai-runtime-slo-service.test.js`,
`node tests\home-ai-self-improving-loop-service.test.js`,
`node tests\homeai-self-improving-loop-script.test.js`, and
`node scripts\homeai-self-improving-loop.js --runtime-slo-audit --json`.
When production observation changes touch Owner Console system resources, also
run `node tests\system-resource-status-service.test.js` and
`node tests\owner-system-console-service.test.js`.
When production observation changes touch plugin deterministic-action health,
also run `node tests\plugin-action-metadata-closure-service.test.js`,
`node tests\plugin-action-metadata-closure-smoke.test.js`, and
`node scripts\plugin-action-metadata-closure-smoke.js --json`. The default
smoke is the aggregate multi-family closure; use
`--action wardrobe-outfit-wear-intent` only when verifying the single Wardrobe
reference path.
Diagnostic submit-closure changes also run
`node tests\self-check-diagnostic-submit-smoke-service.test.js`,
`node tests\self-check-diagnostic-submit-smoke-script.test.js`, and
`node scripts\self-check-diagnostic-submit-smoke.js --json`. Send pipeline changes
also run `node tests\composer-send-pending-feedback.test.js`; native environment
context changes run `node tests\native-environment-context-ui.test.js`; file
attachment ownership changes run `node tests\server-file-attachment-ui.test.js`.
Together these prove the pure policy modules, event-layer wrapper, message
projection invalidation path, duplicate-send lock, optimistic rollback,
attachment upload, self-check auto-dispatch eligibility, and earliest-due terminal receipt refresh behavior preserve
user scroll protection.
Production UI/static deploys must also prove the real client loaded the new
version after refresh, not only that source files contain the version string.
The minimum accepted evidence is a browser/Playwright or installed-PWA read of
`document.documentElement.dataset.clientVersion` matching `<new-version>` after a
reload, plus the `/api/client-version` old/new smoke above. If the loaded client
still reports the old version after a kill/reopen or reload, the deploy is not
complete and the corrective deploy must issue another static version.
Authenticated mobile navigation and tab-switch changes must also run the
cross-surface flow harness:
`node scripts\authenticated-navigation-flow-smoke.js --url http://127.0.0.1:8797 --access-key-path <file> --workspace-id owner --viewport 390x844 --json`.
The checked source contract is
`node tests\authenticated-navigation-flow-smoke-harness.test.js`. Run a second
wider touch-tablet viewport when the change can affect tablet shell layout. The
output must include active nav, visible surface, bottom-nav bounds, composer
bounds, composer/nav overlap, viewport metrics, horizontal overflow, layout
stability, long-task summary, navigation timing, tab-switch timing, and stale
cached surface warnings without printing the key or raw key path.
Before any production API smoke, the harness must first prove the target origin
is Hermes Mobile, not another local service on a reused port. The identity proof
must use the exact origin that will be smoked and must verify a Hermes-specific
app-shell or public-config marker such as `Hermes Mobile`, the expected
`data-client-version`, or `/api/public-config` fields belonging to Hermes. If
the proof fails, stop and report `production_origin_identity_mismatch`; do not
continue by trying common ports such as `8787`, `8999`, or a first listening
Node process. This check is required before `/api/client-version`,
`/api/status?detail=1`, Playwright, Android/CDP, or plugin proxy smokes.
Authenticated production status smokes must use
`node scripts\production-status-smoke.js --access-key-file <file>` or an
equivalent checked harness. The only API header for file-backed Access Key
smokes is `X-Hermes-Web-Key`; `X-Hermes-Access-Key` is a negative
wrong-header case and must not be used as the authenticated path.
The smoke output must include bounded header-name evidence such as
`authHeader=X-Hermes-Web-Key` and `wrongAuthHeader=X-Hermes-Access-Key`
without printing the key or raw key file path. A status probe that authenticates
with `X-Hermes-Access-Key` is not a valid production smoke even if the key file
itself is correct.
Do not infer the auth header from the product credential label. "Access Key" is
the stored credential class, not the HTTP header. Any new production key-file
smoke must keep the positive `X-Hermes-Web-Key` probe and the
`X-Hermes-Access-Key` negative probe in the same committed harness.
`tests/production-status-smoke-harness.test.js` also scans `scripts/` and
allows `X-Hermes-Access-Key` only in the checked negative-control status smoke.
This prevents new one-off production scripts from reintroducing the wrong
header as a positive auth path.
Gateway Pool route selection must prove owner-maintenance requests fail closed
instead of selecting the `default` fallback. The focused contract is
`node tests\gateway-pool-provider.test.js`; the test must keep coverage for a
legacy `securityLevel=unspecified` fallback and for owner-maintenance manifest
missing/no-candidate cases returning bounded unavailable errors.
The checked harness must prove `/api/public-config` on the same origin before
sending the key and must fail as `production_origin_identity_mismatch` when the
target is not Home AI. Mac Gateway cold-start changes must also run
`node tests\mobile-runtime-environment-service.test.js`,
`node tests\mobile-runtime-gateway-environment-service.test.js`,
`node tests\mobile-runtime-path-candidate-environment-service.test.js`,
`node tests\mobile-runtime-state-path-environment-service.test.js`,
`node tests\mobile-runtime-kanban-environment-service.test.js`, and
`node tests\gateway-worker-profile-launch-service.test.js` to prove
`HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT` reaches
`GATEWAY_POOL_ELASTIC_CONFIG` and avoids the Windows `powershell.exe` fallback.
Gateway worker runtime setting changes must also run
`node tests\gateway-worker-runtime-settings-service.test.js`,
`node tests\runtime-config-provider.test.js`,
`node tests\runtime-config-effective-service.test.js`,
`node tests\runtime-config-gateway-worker-service.test.js`,
`node tests\runtime-config-worker-policy-contract-service.test.js`,
`node tests\runtime-config-key-service.test.js`,
`node tests\runtime-config-model-service.test.js`,
`node tests\runtime-config-public-projection-service.test.js`,
`node tests\runtime-config-save-service.test.js`,
`node tests\runtime-config-api-routes.test.js`,
`node tests\mobile-runtime-gateway-facade-service.test.js`, and
`node tests\task-list-ui.test.js`. Owner UI values are persisted non-secret
overrides on top of env defaults; saving must refresh the next Gateway pool /
profile-launcher initialization without terminating active runs. Clearing a
runtime worker field in the Owner UI must submit an empty override value so the
saved config deletes that override and the effective projection returns to the
env/default value.
Mac production cold-start smoke must also prove the launchd listener has
`HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=90000` or an intentional larger
value before treating a stopped-profile cold start as accepted.
Production status smoke must assert Owner `/api/status?detail=1`
`gatewayWorkerPolicyContract.ok=true`; otherwise the run must fail with
`production_status_smoke_gateway_worker_policy_mismatch`. This prevents saved
`gatewayWorkerSettings` from drifting away from the public projection or actual
launcher elastic environment, including warm-worker values such as
`HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM`.
Mac profile-launcher contract changes must run
`node tests\macos-gateway-profile-launcher.test.js`,
`node tests\gateway-worker-profile-launch-service.test.js`, and
`node tests\mobile-runtime-environment-service.test.js`. The launcher must
accept profile and replica start/stop arguments, owner-maintenance mode,
bounded scheduler metadata arguments, and reject owner-maintenance requests for
non-maintenance targets. Production sync must install it as executable under
`/Users/example/path`.
Windows native Gateway launcher changes must run
`node tests\windows-native-gateway-profile-launcher.test.js` and
`node tests\gateway-worker-profile-launch-service.test.js`. The launcher must
not call WSL/bash, must run the official Hermes source through the isolated
Windows venv, must rewrite WSL profile config paths into Windows-native paths,
must pass worker API keys only through environment, and must occupy the existing
manifest port instead of running a second parallel Gateway. The launch service
must ignore stdio for `.ps1` profile scripts so detached native workers cannot
hold inherited pipes open. Native `auth.json` and `auth.lock` must be ordinary
Windows files, not WSL `/mnt/c` reparse points. Live acceptance must prove
`/health`, authenticated `/v1/models`, and one actual Mobile message run on the
selected old manifest port without printing the key.
Windows native WSL-downline changes must also run
`node tests\startup-scripts.test.js`,
`node tests\bridge-command-provider.test.js`,
`node tests\cron-dispatcher-proxy-harness.test.js`, and
`node tests\static-cache-version-harness.test.js`. Production acceptance must
prove that the `Hermes Web Listener User Logon` scheduled task has no WSL
arguments, `Get-Process wsl,wslhost,wslrelay,vmmemWSL` has no running output,
ports `8001`, `8797`, and `8798` are Windows-owned, the file-backed
`production-status-smoke.js` passes with `X-Hermes-Web-Key`, and Whisper `/health` reports
`large-v3-turbo` on `cpu` / `int8`.
When Mac is the selected production host, restored Windows scheduled tasks are
development launchers only; run
`node scripts\windows-dev-services-boundary-checklist.js` when a handoff or
incident review needs to prove they were not used as Mac production rollback
evidence.
Mac production user/profile migration changes must run
`node tests\macos-production-profile-audit.test.js` and
`node tests\macos-production-drift-reconcile.test.js` locally, then the
production profile audit on the Mac with the pinned runtime. The production audit must
return `ok=true`, empty `issues`, no blocking `warnings`, active workspace keys
for registered retained users, required plugin Skill bundles, shared Response
baseline presence, and profile `skills`/`memories` links whose realpath points
at the matching `data/skill-profiles/<profileId>` store. It must also use the
effective worker user to create/delete temporary probe files under both
resolved stores and verify the materialized profile `SOUL.md` is readable and
writable. `profile_skills_temp_write_failed`,
`profile_memories_temp_write_failed`, `profile_soul_missing`,
`profile_soul_unreadable`, or `profile_soul_unwritable` are cold-start
blockers. Fresh public installs must also materialize the required keyless Skill
bundles before first run: `owner-full/skills/productivity/wardrobe-style-operations`
must contain `SKILL.md`, `references/`, and `scripts/`, and
`shared-global/skills/shared/response-grounding-baseline` must contain
`SKILL.md`. Fresh-install closure may suppress pending business plugin
authorization inventory under `--allow-provider-auth-pending`, but it must not
suppress profile filesystem or required Skill bundle failures. On macOS it must also
prove every enabled manifest worker's system LaunchDaemon is loaded; any
`launchd_service_not_loaded:<profile>` issue is a cold-start blocker. It must
also prove each enabled worker's runtime users can read the live Gateway
manifest, per-worker API-server key file, and provider key files; any
`worker_manifest_unreadable`, `worker_api_key_file_missing`,
`worker_api_key_unreadable`, or `worker_provider_key_unreadable` issue is a
cold-start blocker. It must
also compare the live profile `config.yaml` provider/model to the manifest and
template contract. Any `profile_config_provider_missing`,
`profile_config_provider_mismatch`, `profile_config_model_missing`, or
`profile_config_model_mismatch` issue is a provider-routing blocker. Home AI
deploy plans must include a focused `home-ai-production-drift-audit` gate that
fails on any non-empty production audit `issues` array. Warnings remain
advisory unless the audit promotes them into issues.
Home AI full deploys must also run the bounded
`macos-production-drift-reconcile.js` step before that gate. Its mutation
scope is a tested allowlist: unload and quarantine untracked Gateway
LaunchDaemon plists, repair shared OpenAI/Codex auth documents/symlinks and
ACLs without reading credential contents, resync packaged Gateway file-tool
plugins/env, repair listener-readable telemetry ACLs, repair supported
plugin-local binding status, and reinstall the keyless
`productivity/wardrobe-style-operations` required Skill bundle when profile
audit reports `plugin_required_skill_incomplete` or
`plugin_required_skill_unreadable`. It must not rewrite provider configs,
model settings, raw credential contents, unsupported plugin bindings, profile
directories, or user data.
Home AI full deploys must also install the periodic
`com.hermesmobile.production-drift-audit` LaunchDaemon and
`homeai-production-drift-audit-watchdog.sh`; the watchdog must emit bounded
non-secret `latest.json` / `summary.md` drift summaries and must not mutate
profile configs, auth stores, or ACLs.
It must
also reject `RunAtLoad=true` or `KeepAlive=true` on any worker that is not part
of the required warm baseline, because that launchd policy defeats Gateway idle
cooldown. It must also prove Mac Gateway usage telemetry is wired: every
enabled worker needs manifest `telemetryStateDbPath` and
`telemetryResponseStoreDbPath`, and existing DB files must be readable by the
listener user. Missing telemetry paths are issues because they make cached
input show as `Not reported`; missing DB files on never-started cold workers
are warnings until a cold-start run creates them. The checked repair harness is
`node tests\macos-gateway-telemetry-repair.test.js` plus the production command
`sudo /Users/example/path /Users/example/path --root /Users/example/path --write --grant-listener-read --json`.
Required plugin Skill bundles must also be readable by the listener user, not
only by root or the isolated worker; any
`plugin_required_skill_unreadable:<workspace>:<plugin>:<skill>` issue blocks
Mac production closure. The profile audit must also include Skill-only required
gate coverage for Owner Wardrobe outfit runs:
`owner:wardrobe:productivity/wardrobe-style-operations` is required even when
the plugin authorization table does not currently list `wardrobe` for Owner.
The bounded drift reconcile harness must cover both missing and listener-
unreadable Wardrobe required Skill repair, and it must prove unsupported plugin
Skill issue shapes fail closed rather than copying arbitrary source Skills.
The same profile audit must prove every Mac Gateway start script injects live
file-plugin roots for DOCX/Office, PDF, archive, audio, image, video, and
scoped HTTP file helpers.
Any `file_plugin_root_env_missing:<profile>:<env>` or
`file_plugin_root_missing:<profile>:<env>:<root>` issue blocks Mac production
closure, because the profile-local plugin may otherwise fall back to WSL roots
and return `file_path_outside_allowed_roots` for uploaded Word/DOCX, PDF, ZIP,
image/audio/video, or HTTP-uploaded files.
`file_plugin_root_list_delimiter_unsupported:<profile>` is also blocking:
these plugin env lists support comma, semicolon, or newline separators, not
PATH-style colon separators.
Any `mobile_bridge_env_missing:<profile>:<env>`,
`mobile_bridge_host_url_default_missing:<profile>`, or
`mobile_bridge_key_path_missing:<profile>:data/secrets/bridge-host.secret`
issue is also blocking. Those values are required for Gateway-exposed
automation tools such as `cronjob_mobile` to reach the Home AI bridge-host CRON
route instead of failing with a missing host key or writing profile-local cron.
For `openai-codex` workers, the same audit must also prove profile-local
`auth.json` and `auth.lock` are symlinks to the shared Codex auth store and
that the worker user can read/write both targets. Any `codex_auth_*` issue is a
blocking provider-auth drift. The central Mac deploy script includes this as
the focused `codex-auth-profile-audit` gate for every non-`--sync-only` plugin
deploy so MCP/profile refreshes cannot silently break Finance, Wardrobe,
Email, Health, Note, Growth, Moira, or Codex Mobile runs.
Local coverage must include
`node tests\macos-file-plugin-docx-root-smoke.test.js`. After any Mac
file-plugin root repair or user/profile migration, production must also run
`sudo /Users/example/path /Users/example/path --root /Users/example/path --profiles <profile> --json`
for the affected profile, or omit `--profiles` to test all enabled OpenAI user
profiles. The production smoke is the closure gate for uploaded Word/DOCX
`file_path_outside_allowed_roots` incidents because it imports the
profile-local `hermes-mobile-docx` plugin and extracts a synthetic DOCX from
the live uploads root.
It must not print raw Access Keys, token contents, key files, prompt bodies, or
plugin launch tokens.
Mac wardrobe/plugin-bound Gateway closure must also prove the manifest toolset
projection matches the actual Gateway profile configs. Run the checked local
contracts `node tests\macos-required-skill-preload-smoke.test.js` and
`node tests\macos-gateway-manifest-toolset-smoke.test.js`; on Mac production
run:
`sudo /Users/example/path /Users/example/path --root /Users/example/path --json`
and
`sudo /Users/example/path /Users/example/path --root /Users/example/path --json`.
The manifest smoke needs root read access on production because it compares
manifest rows with profile configs owned by multiple `hm-*` users; lower
privilege runs may report `config_path_unreadable` and are diagnostic only.
The first smoke catches listener-side required Skill ACL/preload failures such
as `required_skill_missing`; the second catches stale manifest `toolsets` that
would become `gateway_toolset_missing` even when the underlying
`config.yaml` has the plugin MCP.
Mac MCP callable schema evidence must use the real production manifest and
native agent schema probe, for example
`node scripts\gateway-tool-schema-smoke.js --manifest /Users/example/path --profile <profile> --schema-only --agent-schema-mode native --runtime-source /Users/example/path --runtime-overrides /Users/example/path --runtime-python /Users/example/path`. Do not treat a Windows-only WSL schema probe as Mac production evidence.
PDF/Office document-file tool drift has a lower-level production check that
must pass even if provider auth or full agent startup is broken:
`node scripts\gateway-tool-schema-smoke.js --manifest /Users/example/path --profile <profile> --profile-plugin-schema-only --profile-plugin-filter hermes-mobile-docx,hermes-mobile-pptx,hermes-mobile-pdf,hermes-mobile-audio,hermes-mobile-archive --runtime-python /Users/example/path --require docx_create,docx_extract_text,office_extract_text,pptx_create,pptx_validate,pdf_create,pdf_extract_text,pdf_render_pages,audio_transcribe,archive_list,archive_extract_safe`.
It validates the profile `config.yaml` plus profile-local plugin schemas and
does not replace the full native agent schema probe for platform/MCP coverage.
For Mac named profiles such as `hm-owner-openai-1`, the schema probe must also
require the standard profile-local base tools `http_request`, `weather`,
`mobile_web_search`, `mobile_web_extract`, `image_generate`,
`chatgpt_image_edit`, `chatgpt_image_erase`, `docx_extract_text`,
`office_extract_text`, `pptx_create`, `pptx_validate`, `pdf_extract_text`, `pdf_render_pages`,
`audio_transcribe`, `archive_list`, and `archive_extract_safe`. A manifest
`toolsets` list is insufficient if the
profile-local `gateway-plugins/hermes-mobile-*` directories were not copied.
Provider-specific Mac production smokes should use the checked Gateway Pool
smoke instead of one-off message scripts. Examples:
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model deepseek-chat --provider deepseek --expected-profile deepseekgw1` (hybrid cold-pool workers may start from configured/not-yet-healthy state),
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model grok-4.3 --provider xai-oauth --expected-profile grokgw1`,
and
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model deepseek-chat --provider deepseek --maintenance --expected-profile deepseekmaint1`.
The harness must request one-shot Owner elevation for maintenance runs, pass
the token only in the message body, and never print the key, token, prompt, or
full thread body.
Mac production closure must use the checked aggregate harness after deployment,
migration, Gateway/Profile repair, plugin provisioning,
ACL repair, or before declaring production closed:
`sudo <root>/runtime/node-current/bin/node <root>/app/scripts/macos-production-closure-validation.js --root <root> --json`.
The aggregate harness must prove the served `clientVersion` matches the live
app shell version by passing `--expected-version` to every checked
`production-status-smoke.js` call; a source/app/served version mismatch is a
production closure failure.
After Windows/WSL-to-Mac data migration, also run the directory path migration
repair dry-run:
`sudo <root>/runtime/node-current/bin/node <root>/app/scripts/macos-directory-path-migration-repair.js --root <root> --json`.
The local checked harness is
`node tests\macos-directory-path-migration-repair.test.js`. The dry-run must
show `changed=false` after repair before directory-topic chip or artifact-card
404s are treated as ACL bugs.
If Mac metadata has rootless drive paths such as
`<root>/data/drive/<top>/...`, run the enhanced
`--repair-rootless-drive` mode and then run:
`sudo <root>/runtime/node-current/bin/node <root>/app/scripts/macos-bound-directory-preview-smoke.js --root <root> --all-workspaces --json`.
For directory chip failures or Windows-origin topic bindings, also run the same
smoke with `--simulate-ui-route` so it validates the static client's
`projectId/subprojectId/path` resolution through `/api/projects`, not only the
saved physical path. Add `--use-bound-thread-context` for user-clicked chip
closures so each persisted binding is previewed with its own message thread
instead of only a fresh single-window thread.
That smoke must return `ok=true` for the current non-chat topic/plugin binding
surface in every active workspace with current bound-directory metadata.
Unknown/decommissioned workspaces may be reported as `skipped:
unknown-workspace`; active workspaces must not be skipped. Use `--include-chat`
only for historical stale-reference cleanup. The
local checked harness is
`node tests\macos-bound-directory-preview-smoke-harness.test.js`. Production
write repairs must stop the listener before the SQLite transaction, use
`--reset-state-snapshot`, then start it again before the final dry-run and
bound-directory smoke, so stale in-memory runtime state or a newer `state.json`
snapshot cannot overwrite repaired metadata.
Source changes to this closure contract must run
`node tests\macos-production-closure-validation-harness.test.js`,
`node tests\macos-plugin-directory-production-smoke-harness.test.js`,
`node tests\macos-bound-directory-preview-smoke-harness.test.js`, and
`node tests\macos-wardrobe-binding-production-smoke-harness.test.js`. The
aggregate harness composes the checked status, profile audit, ACL, plugin
delivery-directory creation/preview, Wardrobe binding/proxy content, native MCP
schema, DeepSeek user/maintenance, Owner/OpenAI concurrent
product-route, and final-status smokes. The plugin directory smoke catches Mac workspace catalog
paths that still point at Windows/WSL drive prefixes and macOS ownership/ACL
failures before plugin-topic users see `插件目录暂不可用`. Grok/xAI manual OAuth
is a documented deferred follow-up outside the default closure gate.
The required PWA smoke sequence is:

1. Verify an Android emulator or target device is connected with `adb devices`.
2. Confirm a home-screen `Hermes` PWA shortcut exists. If it does not, open the
   Hermes HTTPS URL in Chrome only to use Chrome's `Install app` flow, then
   return to the launcher.
3. Start the app by tapping the launcher `Hermes` icon. Do not start the smoke
   by `adb am start ... -d <Hermes URL>` or by pasting the URL into the Chrome
   address bar.
4. Capture evidence from the standalone PWA shell:
   - screenshot without browser address bar;
   - visible client version or DevTools state showing the expected version;
   - loaded workspace list or current workspace content;
   - relevant bottom tab/plugin/file-preview/navigation state.
5. If direct Chrome URL launch shows `mode=browser` or the browser-shell guard,
   record it only as a guard-page diagnostic. It is not a failing PWA smoke and
   it is not passing functional evidence.

For emulator automation, use UI-tree coordinates only to install or tap the PWA
shortcut, then validate the rendered Hermes state with screenshot evidence and,
when needed, Chrome DevTools attached to the PWA WebView. UIAutomator may return
only a generic WebView node for rendered web content, so an empty accessibility
tree alone is not proof that Hermes failed to load.

Mac-side iOS Simulator gesture diagnostics may use Appium/XCUITest after the
Mac QA toolchain is installed. Start the local server with
`bash scripts/macos-ios-appium-start.sh` on the Mac and run
`node scripts/macos-ios-appium-smoke.js` for a bounded direct-control smoke.
Keep Appium at `--log-level warn` or quieter before any script enters Home AI
credentials, because verbose WebDriver logs can include request bodies. The
checked guard is `node tests\macos-ios-appium-smoke-harness.test.js`.

All Hermes Mobile UI changes require visual verification evidence before they
are treated as done. At minimum, run a Playwright mobile viewport check that
captures a screenshot and records relevant bounding rectangles for the changed
surface, including overlap-sensitive elements such as bottom navigation,
composers, fixed panels, popups, plugin docks, and scroll containers. When an
Android emulator or target device is available, also run the installed-PWA
smoke path above. Static DOM/unit assertions are necessary but not sufficient
for visual layout changes.
Before any UI-affecting change deploys to production, it must also pass the
central metadata gate:

```bash
node scripts/ui-visual-local-validation-check.js \
  --changed-file <ui-file> \
  --evidence-file <ui-visual-evidence.json> \
  --json
```

The deployment script includes the same check and fails `--execute` with
`ui_visual_local_validation_required` when UI changed files or visible UI
impact lack passed local test evidence and passed visual evidence. Focused
maintenance for this gate must run
`node tests\ui-visual-local-validation-service.test.js` and
`node tests\macos-production-deploy-script.test.js`.
Plugin visual signoff must use Home AI's central visual QA entrypoints,
central target/device/browser configuration, and the checked command or
delegated visual/readback lane named in the task card. Plugin-local
Playwright/Appium setup, private key-path conventions, viewport defaults, or
coordinate scripts are diagnostic only unless they are exposed as a
central-compatible plugin harness and accepted by `npm run visual:central`.
Use `--delegate-local` to discover/run `visual:central-compatible` or
`visual:plugin`, and `--verify-evidence <json-file>` to validate bounded JSON
from a plugin harness. The broker must reject missing scripts as
`plugin_visual_harness_missing` and malformed or privacy-unsafe evidence as
`plugin_visual_evidence_invalid`. If the central visual interface is
unavailable, return
`blocked_central_visual_harness_unavailable` or delegate the missing Home AI
visual/readback task. The plugin-facing command is
`npm run visual:central -- --surface embedded-plugin --plugin-id <plugin-id> --scenario embedded-plugin-shell --json`;
add `--execute` only when the selected central or compatible plugin Harness
should run. Plugin return cards must separate source/static validation,
central-compatible plugin-local evidence, and real central visual signoff.
Topic root UI changes must assert that the root topic entry page has no active
composer, including after Chat->Topics tab switching or route restore paths that
call generic composer enable helpers. `node tests\task-list-ui.test.js` is the
focused DOM contract, and visual smoke must include composer bounds or absence
on the topic root plus normal composer visibility inside a topic detail.
Directory-bound topic Composer autosize regressions, especially long input that
is later shortened, must run the central browser-mobile scenario:
`npm run visual:central -- --surface browser-mobile --scenario directory-topic-composer-long-input-shrink --base-url http://127.0.0.1:8797 --viewport 390x844 --execute --json`.
The accepted evidence must include bounded editor/composer dimensions before
long input, after long input, after shortening, after clearing, and after blur,
plus composer/bottom-nav overlap status.
Composer server-file attachment changes must prove both sides of the boundary:
`node tests\thread-read-upload-api-routes.test.js` for the authenticated
Directory-resolved artifact route, and
`node tests\server-file-attachment-ui.test.js` for the add-file menu,
Directory picker state, and no `dataBase64` re-upload in the server-file path.
For Mac production frontend incidents where the live app already has no local
Playwright dependency, use the shared production QA install instead of adding
Playwright to the live app package:

```bash
cd /Users/example/path
export NODE_PATH=/Users/example/path
/Users/example/path \
  scripts/playwright-visual-smoke.js \
  --url <tailnet-https-origin>/?_hmv=<smoke-id> \
  --access-key-path <owner-web-key-file> \
  --view learning \
  --workspace-id owner \
  --screenshot /tmp/<smoke-id>.png
```

Run this as `hermes-host` for production-owned key files and browser cache
access. This is browser-mode evidence; if an iPhone installed PWA still fails
while the Mac HTTP/HTTPS Playwright smoke passes, the next check is the
device-side PWA cache/service-worker and exact workspace/view state.

As of 2026-06-02, an ADB-connected Android 13 e-ink target device is available
for Hermes Mobile mobile UI validation. For any UI/navigation/gesture/layout
change whose acceptance does not depend on exact color fidelity, this real
device smoke is required, not optional. Use it to verify tap targets, scroll,
right-swipe back behavior, bottom navigation, composer placement, fixed panels,
PWA refresh, and plugin iframe/tab transitions. Because the device renders as
black/white or grayscale, color, saturation, and brand-icon color decisions must
still be checked with Playwright/Chrome or a normal color phone.
Android browser/PWA edge-back checks are only best-effort fallback coverage.
Repeated system/right-edge Back gestures on primary pages must not exit to the
Android launcher and must not reload the Home AI workspace, but final acceptance
for that invariant requires the native Android shell Back/Predictive Back
callback path documented in `docs/MODULES/native-android-shell.md`. Page
secondary surfaces should still navigate inward through the existing
`backSwipeTarget()` contract when the native shell forwards a bounded Web back
request. Cold-start source coverage must prove the early `index.html` Android
back guard is installed before the app bundle and that the app-level guard
adopts it without creating a new route load.
Do not run this Android shell work from the iOS Xcode workspace
`/Users/example/path AI`; that path is only the native iOS shell. Android
shell implementation uses the native Android workspace
`/Users/example/path`.
Focused source check:
`node tests\music-plugin-back-swipe-harness.test.js`.
Android shell source/build checks:
`cd /Users/example/path && node scripts/android-shell-contract-check.js`
and
`cd /Users/example/path && source scripts/android-env.sh && gradle --no-daemon assembleDebug`.
Real-device Back smoke:
`cd /Users/example/path && ANDROID_SERIAL=<serial> HOMEAI_ANDROID_URL=http://<host>:8797 scripts/android-device-back-smoke.sh`.
The 2026-06-21 production validation on device `e0cd9d2b` additionally logged
into owner production at `http://192.168.10.110:8797/`, confirmed client version
`20260621-native-back-bridge-v895`, opened a real topic detail page, sent one
Android system Back event, and verified the shell stayed in
`app.homeai.android/.MainActivity` while the Web layer returned to the root
Topics surface.

Android Access Key setup for smoke must not use `adb input text` for Access Key
entry. Access Keys may include characters that ADB text injection or the active
IME can transform, which creates false login failures. Use the CDP-backed
harness `node scripts\android-pwa-plugin-dock-smoke.js --access-key-path <path>
--expect-version <version> --screenshot <file>` for plugin Dock visual checks:
it launches Chrome over ADB, forwards `chrome_devtools_remote`, writes the key
into same-origin `localStorage` and the `hermes_web_key` cookie without printing
the key, reloads the app, and verifies the Dock has one horizontally scrollable
row.

Startup harnesses must also verify that workspace/project bootstrap failures do
not reveal a half-initialized shell with an empty workspace selector. The client
should retry bounded startup loading and then show an explicit recovery/retry
surface.
Static startup recovery must also cover stalled PWA/client-version updates: the
boot splash performs at most one session-scoped soft reload for a client
version, exposes retry/reset controls after a bounded wait, and the reset page
uses timeout-wrapped cache clear / hard-reset Service Worker unregister so the
recovery screen itself cannot hang indefinitely.
For client-version mismatches, automatic recovery must route through the bounded
reset page for the target version, preserve Access Key/theme/font preferences,
clear static caches, refresh Service Worker registrations, and reopen the app
with a cache-busting query. The Service Worker must serve app-shell requests
(`/`, `/index.html`, and `/hermes-mobile/`) network-first with `cache:
"no-store"` so kill/reopen cannot keep showing a stale shell.

NAS static production deploy is a cross-shell production operation. The source
harness must keep `scripts/deploy-nas-static-assets.ps1` on the safe transport
path that worked against the maintained Synology host: health check first,
abort on active runs, backup both NAS `app` and `source`, package local files as
tar, base64 the archive before SSH transport, decode/extract on NAS, compare
SHA-256 in both destinations, use the pinned NAS runtime Node path for checks,
and smoke both `/api/client-version` and the public origin HTML. `scp`, `sftp`,
and raw PowerShell binary tar pipes are failing cases for this maintained NAS
flow. Focused check: `node tests\nas-static-deploy-harness.test.js`.

NAS full-source production deploy is required when the current version changed
more than the narrow shell/cache files, or when NAS has drifted behind local
production. `scripts/deploy-nas-tracked-source.ps1` must package only
Git-tracked source files with `git archive`, back up overwritten NAS `app` and
`source` files, run pinned-runtime checks, and run a first-start preflight. The
preflight must fail when app/source/served client versions disagree, when
Gateway Pool is disabled, when NAS is not in `hybrid` Gateway mode, or when no
healthy `securityLevel=user` worker is available. A single `nas-local-codex`
wildcard worker is allowed as a bootstrap
bridge only with an explicit warning; it must not be treated as equivalent to
the maintained Windows hybrid/Owner-warm Gateway Pool. The same preflight must
fail Finance partial provisioning: a workspace with
`.hermes-finance/access-key.txt` but no sibling `.hermes-finance/config.json`
must report `nas_finance_config_missing:<workspaceId>` instead of being treated
as an active plugin/MCP binding. Focused check:
`node tests\nas-deploy-harness.test.js`.
The deploy harness must also sync runtime config launchers outside the tracked
app tree, including refreshing `config/start-nas-gateway-pool.sh` from
`app/scripts/start-nas-gateway-pool.sh`, before Gateway profile restart or
smoke. Otherwise new MCP registrations can be present in source but absent from
live generated profiles.
The same NAS version smoke must call `/api/owner-elevation` with Owner auth and
fail if `ownerElevation.available` is false. The maintained NAS launcher must
set `HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS=1` in
`config/hermes-mobile.env`, not after the `exec node server.js` line in
`config/start-hermes-mobile.sh`.
The same NAS deploy/preflight harness must verify runtime model parity across
all execution entrances: generated OpenAI/Codex Gateway profiles, NAS
`$HERMES_HOME/config.yaml`, NAS `.env`, and official CRON dispatcher startup
must not retain stale models such as `gpt-5.3-codex`. The maintained user-run
default is `gpt-5.5` with `medium` reasoning. Permission-only model preflight
is separate and defaults off; unless explicitly overridden for diagnostics,
ordinary runs must not spend an extra selector call before execution.
The official CRON dispatcher startup check must also prove model jobs are
proxied before official `cron.scheduler.run_job()` starts. The dispatcher must
inject `HERMES_MOBILE_CRON_MODEL_PROXY_URL` or the standard proxy variables
into `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY`, and a missing or unreachable
proxy must mark the job failed with `cron_model_proxy_*` instead of entering
the official model path and timing out. Pure `no_agent` script jobs remain
allowed without a model proxy. Focused check:
`node tests\cron-dispatcher-proxy-harness.test.js`.
Both NAS deploy scripts must use the fixed cross-shell transport: local tar to
base64 text, SSH text upload, NAS-side Python decode, extraction to both
`app` and `source`, and pinned NAS Node checks. They must not depend on
`scp`/`sftp`, raw PowerShell binary tar pipes, or ad-hoc inline Bash embedded
inside PowerShell. Focused check:
`node tests\cross-shell-command-harness.test.js`.
NAS listener restart is part of the same cross-shell harness. The tracked-source
deploy restart path must use the base64/remote-Python control channel, stop any
existing `node server.js` listener, wait for port `8797` to stop serving public
config, fail with `nas_listener_restart_port_still_busy` if the port remains
occupied, start only `config/start-hermes-mobile.sh`, and verify
`setupRequired=false`, `ownerKeyConfigured=true`, and `ownerKeySource=file`
after restart. Focused check: `node tests\nas-deploy-harness.test.js`.
The same harness must also cover NAS-native workspace isolation: user workers
must be single-workspace workers, worker `skills` links must point at
`data/skill-profiles/<profile>/skills`, worker `memories` links must point at a
per-workspace memory store, and `data/drive/users/<workspaceId>` directories
must not be publicly accessible. Plugin MCP registration must be
workspace-local: Wardrobe, Finance, Email, Health, Note, and future plugin toolsets may be
advertised only when the worker's target workspace has the matching
`.hermes-<plugin>` config/key directory. A worker without plugin config must not
fall back to Owner or expose a broken plugin toolset.
Mac profile materialization checks must additionally prove that Owner profiles
resolve `skills` and `memories` to `owner-full`, non-Owner profiles prefer the
single concrete `skillWorkspaceIds` store over legacy `skillProfile` aliases,
and the effective worker user can write temporary files under both stores and
read/write the materialized profile `SOUL.md`.
Public online update checks must cover both Home AI and plugin source
checkouts. The system status service test must prove Owner-only update routes,
clean-worktree fast-forward behavior, plugin rows from
`config/public-plugin-sources.json`, `updatedPlugins` reporting, and the
optional `HERMES_MOBILE_POST_UPDATE_COMMAND` / `HERMES_WEB_POST_UPDATE_COMMAND`
post-update hook with bounded output redaction.
Maintainer-side public release closure must prove
`scripts/homeai-public-release-closure.js`, `npm run release:public`, source
inventory checks, privacy-scanned export creation, public-source validation,
explicit public checkout sync, explicit public commit, and explicit public push
gating. It must reject push without a same-run public sync and commit.
Target-side public upgrade rehearsal must prove
`scripts/homeai-public-upgrade-rehearsal.js`,
`npm run rehearse:public-upgrade`, public repo clone planning, source-only
preflight, missing plugin source fail-closed behavior without
`--clone-missing-plugins`, explicit clone-gate planning, Movie
`operatorAuthenticated` preservation, present-but-non-Git source fail-closed
behavior without `--adopt-non-git-sources`, explicit source-adoption planning,
and closure-validation presence without production mutation.
Remote new-Mac public deployment smoke must prove
`scripts/homeai-public-remote-deploy-smoke.js`,
`npm run remote:public-deploy-smoke`, bounded SSH argument construction,
remote `/tmp`/`/var/tmp` root restriction, temporary Node runtime bootstrap on
new Macs without system `node`/`npm`, public repo clone, source preflight,
macOS fresh-install rehearsal, public upgrade rehearsal, install-delete-
reinstall sandbox cycle, failure-stop cleanup, and explicit gating for
production `upgrade:public --execute`.
The maintained public upgrade loop must additionally prove
`scripts/homeai-public-upgrade.js`, clean fast-forward planning/execution,
Moira/Movie source inventory, explicit clone gating for missing plugins,
explicit adoption gating for public-export or bundled non-Git source dirs,
explicit Hermes Agent update gating, changed/freshly cloned plugin deployment,
dependency install gating, missing Hermes Agent virtualenv repair through
`install-official-hermes-runtime`, profile/provider audit, and closure
validation.
The deploy/upgrade lane closure gate must additionally prove
`docs/PLATFORM_CONTRACTS/deploy-upgrade-lane-closure-contract.md`,
`adapters/deploy-upgrade-lane-closure-service.js`, and
`scripts/deploy-upgrade-lane-closure-smoke.js`: routine plugin deploy cards are
structured request cards with `cardKind=plugin_deployment` and
`pluginId=<plugin-id>`, terminal receipt-shaped cards fail closed, deploy-lane
lock records are bounded and phase-valid, and public upgrade daily smoke covers
Home AI source preflight, plugin clone/deploy closure, Hermes Agent runtime
repair gating, Provider/profile closure validation, source-adoption gating, and
temporary-root cleanup.
The install/upgrade canary must additionally prove
`adapters/home-ai-install-upgrade-canary-service.js` and
`scripts/homeai-install-upgrade-canary.js`: plan mode is non-mutating,
source-safe execute mode runs the maintained fresh-install and upgrade closure
phases, public repository clone rehearsal is gated by
`--execute-public-rehearsal`, the phase ledger covers source preflight,
Owner/key bootstrap, Home AI install, Hermes Agent runtime, Provider ingress,
plugin registration, Gateway/tool schema, plugin MCP/schema smoke, public
upgrade rehearsal, and production closure readback. Source-safe `--execute`
reports must keep `executionClass=source_safe_rehearsal`,
`closureStatus=partial`, and `cleanTargetCanary.status=not_run` unless a
dedicated install/deploy lane supplies bounded `--clean-target-readback-json`
evidence. The report must include bounded step evidence for temporary-root
fresh-install and upgrade rehearsal/execute cleanup so Owner Console can
distinguish source-safe rehearsal from an aggregate phase summary, but Owner 3A
evidence must still keep clean-target closure `partial` until the lane readback
itself is passed. It must contain only bounded phase summaries rather than raw
command logs.
Self-improving loop collector tests must also prove that
`production_rehearsal_requires_service_user` is a skipped, non-diagnostic
`install_upgrade_canary` observation in source context and remains a failed
diagnostic in production context.
Focused checks:
`npm run test:install-lane`,
`node tests\home-ai-install-upgrade-canary-service.test.js`,
`node tests\homeai-install-upgrade-canary-script.test.js`,
`node scripts\homeai-install-upgrade-canary.js --json`,
`bash -n scripts/homeai-self-improving-loop-cron.sh`,
`node tests\macos-automation-cron-audit.test.js`,
`node tests\production-self-diagnostics.test.js`,
`node tests\public-release-closure-service.test.js`,
`node tests\homeai-public-release-closure-script.test.js`,
`node tests\public-remote-deploy-smoke-service.test.js`,
`node tests\homeai-public-remote-deploy-smoke-script.test.js`,
`node tests\public-upgrade-rehearsal-service.test.js`,
`node tests\homeai-public-upgrade-rehearsal-script.test.js`,
`node tests\deploy-upgrade-lane-closure-service.test.js`,
`node tests\deploy-upgrade-lane-closure-smoke.test.js`,
`node scripts\deploy-upgrade-lane-closure-smoke.js --json`,
`node tests\public-upgrade-orchestrator-service.test.js`,
`node tests\homeai-public-upgrade-script.test.js`,
`node tests\public-plugin-sources.test.js`,
`node tests\plugin-provisioning-coverage-audit.test.js`,
`node scripts\public-install-preflight.js --source-only --json`, and
`node scripts\plugin-provisioning-coverage-audit.js`.
The same NAS harness must include an ordinary representative message smoke,
not a probe-only or content-specific shortcut. The smoke must compare the
Mobile run phase timeline with Windows/local production behavior:
`run.request_preparing` appears immediately, warm Owner runs show
`run.gateway_worker_reused` or an expected startup event before model
preflight/model output, and any `queued` state is backed by real capacity or
profile-affinity evidence. Direct Gateway `/health` timing alone is not enough.
The same smoke must treat a long pre-`run.request_preparing` gap as
listener-side setup/persistence latency. Runtime persistence tests must prove
normal message growth does not force a full state backup per message, while
message-drop refusal and explicit decreases still retain backup protection.
They must also prove the run-start fast path can skip SQLite full replacement
while writing the JSON snapshot, and that startup imports a newer JSON snapshot
back into SQLite before serving state.
Runtime-state backup harnesses must reject a design where every normal message
increase creates a full state backup or performs a forced SQLite full
replacement before run progress becomes visible. Focused check:
`node tests\runtime-state-persistence-service.test.js`.
Mac disaster-recovery backup coverage must include Home AI plus all installed
plugins, plugin-owned `data` directories, online SQLite snapshots, workspace
Skill stores, workspace Memory stores, Memory Soul files, Gateway profile Soul
files, and readable operator Hermes Agent custom Skills/Memory stores. It must
not treat the old Windows PowerShell backup script as sufficient for Mac
production, and the daily backup must exclude rebuildable runtime binaries,
logs, temp/cache, node_modules, virtualenvs, and old backup trees by default.
The real NAS publish path must use local staging plus ordinary-user NFS rsync;
sudo/root must not write directly to the Synology NFS destination because
root-squash can turn destination permission failures into rsync
`unexpected end of file` errors.
The production scheduled path is a Hermes CRON `no_agent` job and must not
depend on the sudo password file; the LaunchDaemon must provide a script
timeout long enough for full backup publication.
Focused check: `node tests\macos-disaster-backup-script.test.js`.
Workspace-local plugin toolset projection must be covered before changing
ordinary-chat or plugin-topic activation. Focused checks:
`node tests\plugin-authorized-toolset-service.test.js`,
`node tests\access-policy-provider.test.js`, and the plugin capability run
assembly tests. The service must prove complete `.hermes-*` bindings become
authorized toolsets for the effective workspace, while partial key-only
bindings do not.
Gateway profile template materialization is an H1 Gateway workflow change. The
focused implementation harness must prove canonical template generation,
same-template toolset/MCP equality, no cross-tier slot reuse, stopped-slot
materialization before startup, warm reuse when the template key matches, cold
start to health, first text delta timing, terminal release, idle stop, and
`/api/status?detail=1` projection without exposing raw config bodies or secrets.
Phase 1 focused checks are
`node tests\gateway-profile-template-sync.test.js`,
`node tests\startup-scripts.test.js`, `bash -n scripts/start-low-gateways.sh`,
and a production verifier run against
`C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles`.
Phase 2 production smoke must also prove a selected stopped profile start logs
`lowgw-configure-template-peers` with the requested profile and the expanded
same-template peer group, then leaves the requested profile startable and the
baseline warm worker restorable.
Phase 3 focused checks add
`node tests\gateway-profile-template-builder.test.js` and a production builder
run such as
`node scripts\build-gateway-profile-template.js --manifest <manifest> --profiles-root <profiles> --profile lowgw10 --require-config`.
The builder must report the same selected peer group and capability hash as
`scripts\verify-gateway-profile-template-sync.js`, without printing raw config
bodies or secrets.
Phase 4 focused checks also require the builder render path:
`node scripts\build-gateway-profile-template.js --render-config-yaml --config-kind profile ...`,
`bash -n scripts/configure-low-gateways.sh`, and
`node tests\startup-scripts.test.js`. Local production validation must prove
WSL can call the builder through the effective Node path, then run a forced
configure/start smoke or an equivalent configure-only verifier to confirm the
materialized production profiles still share the expected capability hash.
Phase 5 focused checks require runtime projection and reuse-guard coverage:
`node --check adapters\gateway-profile-template-identity-service.js`,
`node tests\gateway-elastic-worker-scheduler.test.js`,
`node tests\gateway-pool-provider.test.js`,
`node tests\system-api-routes.test.js`, and
`node tests\architecture-refactor-boundary.test.js`. Status projection must show
only non-secret `templateKey`, `capabilityHash`, `capabilityStatus`,
`toolSchemaEpoch`, `materializedTemplateKey`, and
`materializedCapabilityHash`; a warm worker with a stale materialized hash must
not be reused merely because `/health` is `ok`.
For Vite Phase 5 chat attachment/file-picker work, run
`node tests/vite-chat-attachment-file-input-controller.test.js`,
`node tests/vite-chat-attachment-upload-client.test.js`,
`node tests/vite-chat-attachment-upload-backend-contract.test.js`,
`node tests/vite-chat-classic-attachment-adapter.test.js`,
`node tests/vite-share-image-model.test.js`,
`node tests/share-image-ui.test.js`,
`node tests/vite-chat-runtime-island.test.js`, and
`npm run smoke:vite-dev-user-journeys`. The file-picker controller must prove
change-event suppression, selected File snapshotting, immediate input clearing
for repeated mobile camera picks, and no direct auth/storage/transport
ownership.
Plugin capability activation and lazy MCP loading is an H1 Gateway/context
workflow change. Focused tests must prove ordinary chat receives the compact
capability catalog without full optional plugin MCP schemas or Skill bodies;
plugin-bound topics receive the current plugin required MCP/Skill bundle while
other authorized plugins remain catalog-only; lazy activation validates
workspace authorization, config/key completeness, health/schema probe, and no
Owner fallback; plugin-topic context must not self-authorize a plugin when the
effective workspace policy lacks the plugin's primary MCP/toolset, and generic
companion toolsets such as `file`, `vision`, or `skills` must not authorize the
plugin by themselves; required plugin failure blocks generic fallback with a bounded
diagnostic; optional plugin failure does not slow or fail unrelated ordinary
chat; explicit wide mode probes each authorized plugin once and reports
unavailable plugins without raw secrets. Wardrobe fixed-topic outfit workflows
are H1 completion flows: run
`node tests\wardrobe-outfit-workflow-gate-service.test.js`, `node
tests\plugin-required-skill-preload-service.test.js`, `node
tests\gateway-run-start-execution-phase-service.test.js`, `node
tests\gateway-run-start-permission-service.test.js`, `node
tests\gateway-run-start-plugin-probe-service.test.js`, `node
tests\gateway-run-start-preparation-service.test.js`, `node
tests\gateway-run-start-stream-handoff-service.test.js`, `node
tests\gateway-run-start-target-phase-service.test.js`, `node
tests\gateway-run-start-target-service.test.js`, `node
tests\gateway-run-start-toolset-preflight-service.test.js`, `node
tests\gateway-run-start-service.test.js`, `node
tests\gateway-run-stream-completion-service.test.js`, `node
tests\gateway-run-stream-close-recovery-service.test.js`, `node
tests\gateway-run-stream-event-service.test.js`, `node
tests\gateway-run-stream-failure-service.test.js`, `node
tests\gateway-run-stream-first-event-service.test.js`, `node
tests\gateway-run-stream-liveness-service.test.js`, `node
tests\gateway-run-stream-liveness-timer-service.test.js`, `node
tests\gateway-run-stream-registry-service.test.js`, `node
tests\gateway-run-stream-stop-service.test.js`, and `node
tests\gateway-run-event-service.test.js` when required Skill preload,
plugin-topic routing, Gateway start, loaded-tool evidence, or completion state
changes.
Host voice input is an H1/H2 boundary depending on scope. Service, ASR,
correction, privacy-retention, host draft insertion, or plugin injection
behavior is H1 because it can write user drafts and learn personal correction
rules. Host overlay-only layout is H2 when it does not alter persistence or
plugin submit behavior.
Realtime host voice input streaming is H1. Required coverage must prove
`/api/voice-input/stream/start|chunk|final|cancel` scope checks, chunk size
limits, provider fallback to whole-clip transcription, final text entering the
same voice-session commit path, and no duplicate composer insertion when
partial text was already written provisionally.
Required focused checks for implementation:
`node tests\voice-input-service.test.js`,
`node tests\voice-input-asr-provider.test.js`,
`node tests\voice-input-correction-service.test.js`,
`node tests\voice-input-api-routes.test.js`, and a frontend bridge test such
as `node tests\voice-input-ui.test.js`. The tests must cover ASR backend
missing/disabled state, audio duration and MIME limits, temp-file cleanup,
composer send-button tap versus long-press behavior, release-to-transcribe,
cancel-without-transcribe, no native text selection/callout on long press,
host draft auto-insertion, silent close for too-short recordings or permission
prompt release-cancel, wrong-origin postMessage rejection, stale voice session
rejection, explicit native-shell voice capability detection before using
`window.webkit.messageHandlers.homeAI`, unsupported plugin bridge
insert/replace/submit actions, over-limit
text, native-shell status panel visibility on voice-entry press before
microphone permission resolves, status projection for permission/setup,
recording, ASR, insertion, cancellation, no-speech, and failure states, no
automatic status-panel dismissal after success/failure, dismissal on explicit
Composer or Send interaction, conservative correction extraction,
structured-span exclusion,
repeated-evidence thresholds, undo/disable behavior, and no raw audio or token
material in diagnostics. Phrasebook learning must cover all three sources:
`system_seed` for product/plugin/tool vocabulary, `sent_text` for short
phrase extraction from successfully sent composer text without retaining the
full message, and `voice_diff` for strict short replacement-pair evidence.
Failed composer sends must not record `sent_text` evidence.
Voice input visual closure must add an installed-PWA scenario such as
`npm run ios:pwa:visual -- --scenario voice-input-overlay-composer --debug-url
http://127.0.0.1:19073/` and, for the first plugin bridge target,
`npm run ios:pwa:visual -- --scenario voice-input-overlay-plugin-composer
--plugin-id codex-mobile --plugin-thread-id <thread-id> --debug-url
http://127.0.0.1:19073/`. The scenarios should prove the host overlay is
outside plugin iframes, microphone permission denial and ASR-unavailable states
are visible, the overlay does not overlap Home AI bottom navigation, plugin
Dock, keyboard, or the active composer, and confirmed text reaches the native
draft or plugin draft only after the valid host/bridge acknowledgement.
Public-release closure must also run the privacy scan and productization check
so installs without a local ASR backend fail disabled instead of depending on
private Mac paths.
Active assistant streaming-receipt changes that affect visible in-progress
output must also run `node tests\run-progress-ui-behavior.test.js` and
`node tests\streaming-receipt-preview-ui.test.js`. They must prove normal text
deltas can show a bounded fixed-line in-progress receipt, while synthetic
`run.event` scheduler/model/tool status does not appear in the assistant receipt
as a fake reasoning stream. Real reasoning/thinking output requires a separate
explicit event contract before it may be rendered.
NAS Growth audio parity must cover the platform-specific transcription path:
Windows may use `scripts\transcribe-reading-audio.ps1`, while Linux/NAS must use
`scripts\transcribe-reading-audio.js` against the local Whisper large v3 Turbo
service on `127.0.0.1:8001`. The NAS deploy/runbook checks must treat a missing
8001 health endpoint as "Growth audio submission unavailable", even when stored
SQLite audio playback works. Focused checks include
`node tests\kanban-reading-workflow-service.test.js`.
NAS Grok parity must cover a manifest-derived dedicated `grokgw1`
`provider=xai-oauth` profile. The test workspace's historical `18761` worker
must remain an ordinary OpenAI/Codex worker on NAS; bridge-host must discover
the Grok URL from the manifest instead of assuming 18761. Focused checks include
`node tests\nas-deploy-harness.test.js` and
`node tests\bridge-host-grok-proxy.test.js`.
When a deployment chooses to disable or enable model permission preflight, the
NAS effective environment must be recorded explicitly and compared with the
intended local-production behavior instead of being treated as an implicit
default.

NAS-local single-worker Gateway configuration is also a production harness
surface. A NAS `nas-local-codex` style worker must prove that configured
toolsets have real callable schemas, not only configured names in
`/v1/toolsets`. The maintained smoke must verify that Hermes Mobile fallback
plugins are installed in the API-server Hermes home, listed in
`plugins.enabled`, included in `platform_toolsets.api_server`, visible through
`model_tools.get_tool_definitions(...)`, and exercised by a direct
`/v1/responses` request that emits `function_call` and
`function_call_output` for representative tools such as `web_search` and
`weather`. `browser` remains a runtime-dependency-gated toolset and requires
separate evidence that `agent-browser` plus its browser engine dependencies are
installed before treating `browser_*` as available.

Mac Studio production deployment is a separate production harness surface, not
a NAS variant. The future macOS installer/preflight must prove launchd service
generation, explicit service env/paths, Mac-native Gateway startup,
direct/proxy network-mode behavior, and OS-user workspace isolation. A passing
Mac install must show that non-Owner OS users cannot read Owner files, Skill
Store, Memory Store, or `.hermes-<plugin>/access-key.txt`; that Gateway workers
and MCP wrappers run as the effective workspace OS user; that plugin MCP
toolsets are exposed only for workspaces with matching `.hermes-<plugin>`
config/key; and that clean installs can enable plugins on demand through
provisioning instead of relying on pre-bound development data. Planned focused
checks: `node tests\macos-deploy-harness.test.js`,
`node tests\workspace-os-isolation-harness.test.js`,
`node tests\plugin-workspace-isolation-harness.test.js`, plus the existing
Gateway and CRON harnesses relevant to the touched files.

H1 includes Growth learning cards, Action Inbox passive notifications,
Automation/Cron execution, Gateway toolset selection/run telemetry,
Gateway elastic worker scheduling, cross-shell production operations, Web Push
click routing, permission/workspace boundaries, and Public Export/Release.

Directory topic collections are H1 when they change persistence, workspace
isolation, directory ACL, context assembly, default-topic selection, or
topic-open routing. They are H2 only for display-only card/list projection. The
harness must prove that one directory can collect multiple topics, one default
topic is enforced per directory, changing the default does not delete secondary
topics, Owner workspace switching does not fall back to Owner's directory or
topics, and context assembly includes only cleaned/selected/bounded files.
Focused checks should include
`node tests\directory-topic-binding-service.test.js`,
`node tests\directory-topic-context-service.test.js`,
`node tests\directory-topic-api-routes.test.js`, and
`node tests\task-list-ui.test.js` when implemented.

Static v446 directory-topic card projection is H2 display-only. Required
coverage for that increment:

- `public/app-directory-topics-ui.js` is loaded by `index.html`, cached by the
  service worker, and included in the app-shell harness.
- Directory-topic collections are derived from existing bound directory routes.
- Groups displayed inside directory-topic collection cards are removed from the
  regular topic grid to avoid duplicate entries.
- Plugin fixed topics such as `plugin:wardrobe`, `plugin:finance`,
  `plugin:email`, `plugin:health`, `plugin:note`, and `plugin:moira` must not
  be included in directory-topic collection cards.
- The current Dock projection keeps the Directory capability in the global
  plugin Dock with the external plugin icons. It has no permanent chat/file
  mini actions beside the icon; Directory quick actions live in the
  long-press/context menu and may appear in the Dock `常用` action menu. The
  standalone Capability page is retired.
- Mobile Dock visual evidence must open that Dock menu through the touch
  long-press harness path and report `pluginDrawerMenuGesture=touch-longpress`;
  the legacy `capabilityMenuGesture` field remains only a compatibility alias.
  Desktop `contextmenu` evidence alone is not enough for iOS/PWA regressions.
- Directory-bound cards render a directory header with the scaled-down Dock
  Directory icon on the left and the directory display name/topic count beside
  it. They must not render raw directory paths, generic bound-directory prompt
  text, visible default badges, or a second right-side directory icon. Bound
  child topics render below as an indented list so the parent directory
  relationship is visible.
- The Directory Dock icon must use the Dock-consistent plugin-app folder visual.
  Directory-bound topic cards use the same visual language at a smaller size,
  while child topic chips keep the smaller topic/chat icon.
- Opening the Directory special application card must reset to the Directory
  root list, not reuse the sidebar/current-directory entry. Shared directory
  roots must be included in the public project projection that backs that root
  list.
- Plugin and Directory topic cards must avoid nested framed panels. The outer
  card is the visible surface; internal app/topic buttons remain transparent,
  labels are compact, and mini actions are visually smaller than the app icon.
- Returning from a topic detail through top back or right-swipe must restore
  the topic-list scroll position captured before entering that detail.
- The card exposes icon actions for bound directory and secondary topic chips.
- Secondary topic chips must show a short readable topic name and not only a
  repeated icon. Manual topic titles take priority over first-message fallback
  names.
- Mobile topic-list scrolling must keep native vertical pan behavior; touch
  guards may not call `preventDefault()` while `.thread-list` can scroll in the
  gesture direction.
- Directory-topic deferred aggregation must not replace the topic-list DOM
  while scroll feedback, task-card swipe, or sidebar swipe state is active.
  Scroll feedback must measure the actual scroll target (`.thread-list` when it
  is the nested scroller) before deciding whether to block boundary over-scroll,
  and the sidebar right-swipe guard must let vertical task-list panning stay
  native.
- Static cache version harness proves `20260601-directory-topic-names-v446`
  reaches every shell resource that changed.

Gateway Pool startup/provisioning harnesses must cover stable manifest
profile/port mapping. `start-low-gateways.sh` and `configure-low-gateways.sh`
must consume explicit `gateway-pool-manifest.json` `profile`/`port` pairs for
`lowgw*`, `grokgw*`, and `deepseekgw*`. Workspace provisioning must append new
personal `lowgwN` entries after existing low/Grok/DeepSeek workers without
moving `grokgw1`, and ordinary workspaces must get two OpenAI/Codex `lowgw*`
candidates plus one workspace-dedicated `deepseekgw*` candidate when DeepSeek is
available. Deleting a workspace must not silently delete profile-local Gateway
state; profile retirement needs an explicit backup/cleanup flow. Focused checks:
`node tests\startup-scripts.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
Gateway Pool startup/provisioning harnesses must also cover per-worker
API-server-key binding. Startup scripts must read the selected worker's own
manifest `api_key` by `profile` and pass that key to the worker process; using
the first manifest key or one class-wide key is a failing case because workers
can stay healthy while rejecting Mobile `/v1/responses` calls with
`401 invalid_api_key`. Gateway profile/schema deployments must sync source
scripts into the production worker root before restart and then run live schema
smoke with the same manifest key Mobile uses for the selected worker.
For legacy WSL-backed Windows deployments only, Windows-to-WSL plugin MCP
environment is part of the same startup harness.
`start-low-gateways-child.ps1` must pass Finance MCP env such as
`HERMES_MOBILE_FINANCE_MCP_API_BASE_URL`, wrapper path, Python path, and user
drive root into `wsl.exe -- env ... configure-low-gateways.sh`; otherwise a
Windows-local Finance service can silently regenerate WSL profiles with
`http://127.0.0.1:8791`, which is WSL loopback and hides `mcp_finance_*` even
though Finance UI launch works. The fallback must resolve a Windows LAN address
for Finance, not a WSL NAT gateway such as `172.*`, because Finance may reject
that as `finance_mcp_dispatch_loopback_only`. Focused check:
`node tests\startup-scripts.test.js`.
Live plugin MCP smoke must target the exact selected Low Gateway profile, not a
generic or first healthy worker. A failure from `lowgw2` is only cleared by
schema evidence from `lowgw2` itself, for example
`node scripts\gateway-tool-schema-smoke.js --profile lowgw2 --schema-only --require mcp_finance_list_ledgers`,
plus direct wrapper evidence when the plugin service rejects WSL-origin calls.
Finance service startup must keep `FINANCE_MCP_PORT=8791` together with
`FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES` or `FINANCE_MCP_TRUSTED_GATEWAY_CIDRS`;
starting Finance without the port env can fall back to `8787`, while starting
without the trusted env keeps the UI healthy but hides the MCP schema behind
`finance_mcp_dispatch_loopback_only`.

Kanban-backed Todo board provisioning is part of the same H1 process-safety
harness. `ensureBoard()` must be single-flight per board, failed board creation
must use a bounded retry cooldown, and Windows bridge command timeouts must
terminate the full PowerShell/WSL child process tree. The Windows Kanban
wrapper must resolve the production WSL distro from explicit args or
`HERMES_*` environment values and support maintained caller-context execution
instead of silently defaulting to a retired `HermesGatewayWorker` distro.
Focused checks: `node tests\kanban-provider.test.js`,
`node tests\startup-scripts.test.js`, and `node tests\task-list-ui.test.js`.

OpenAI/Codex shared-auth harnesses must cover runtime-overlay protection for
symlink-preserving atomic writes that cross WSL ext4 and Windows-mounted
storage, including the `hermes_cli.auth` module's direct imported reference.
The static guard is `node tests\startup-scripts.test.js`; live repair
validation should use `/opt/hermes-gateway-runtime/bin/hermes auth list` with
`HOME=/home/hermes` and `HERMES_HOME=/home/hermes/.hermes`, then
`C:\ProgramData\HermesMobile\gateway-worker\check-worker-codex-auth.ps1`, with
no raw tokens or refresh tokens printed.
On macOS, Codex Mobile launchd generation must also prove that active-profile
`CODEX_HOME` is used instead of the Desktop/default `.codex` home; focused
checks include `node tests\plugin-launchd-service-installers.test.js`,
`node tests\install-macos-production.test.js`, and
`node tests\macos-production-deploy-script.test.js`. One-time shared-auth
token import from the active Codex Home is covered by
`node tests\sync-openai-codex-shared-auth-from-codex-home.test.js`; live
closure still requires a bounded Gateway OpenAI/Codex smoke because ACL audits
cannot prove refresh-token freshness.

Gateway elastic worker scheduling is an H1 workflow. The source harness must
cover Owner OpenAI/Codex `minWarm=1` / `maxWorkers=4`, Owner DeepSeek
`minWarm=0` / `maxWorkers=2`, owner-maintenance `minWarm=0` / `maxWorkers=2`,
non-Owner OpenAI/Codex `minWarm=0` / `maxWorkers=2`, non-Owner DeepSeek
`minWarm=0` / `maxWorkers=1`, compatible warm-worker reuse, already-running
warm discovery, externally healthy later-candidate reuse before cold start,
bounded scheduler `decisionTrace`, profile/provider-compatible cold start, provider-scoped
workspace cap queueing, global cap queueing, idle TTL retirement, active-run
protection, bounded launch-failure diagnostics, public-to-real run id
replacement without worker-slot leakage, tier-scoped worker caps so
owner-maintenance workers do not consume the Owner low-permission user cap,
profile-specific owner-maintenance start/stop and watchdog skip in hybrid
on-demand mode,
hidden single-profile start/stop launchers, and
`/api/status?detail=1` treating configured-but-stopped workers as expected state
rather than unhealthy Gateway Pool degradation, including clearing a previously
warm worker after the process stops and `/health` no longer responds. It must
also cover externally discovered healthy on-demand workers: status
reconciliation may mark the process healthy, but non-baseline workers must enter
idle TTL countdown and required warm-baseline workers must not. It must also
cover wildcard profiles such as `grokgw1`: status reconciliation may mark the
process healthy, but must preserve the materialized template key/hash and must
not wake or reuse the worker for an incompatible request template. The
run-progress UI must
distinguish starting, reused, queued, idle-retirement, and failed states without
exposing API keys, workspace keys, plugin launch tokens, raw prompts, raw model
output, or long logs. The assistant message must receive its public `web_*` run
id before Gateway request construction and target selection start, and
`run.request_preparing`, `run.gateway_worker_queued`,
`run.gateway_worker_starting`, and permission preflight timeout/fallback events
must render in the inline run-progress panel immediately instead of waiting for
worker selection to finish. Cold-start `starting` must render as startup in the
model-status/run-progress UI rather than as queue depth; `queued` is reserved
for real capacity/profile waits. Before switching runtime scheduling to
pool-key selection, the source harness must also prove the
ProfileTemplate / WorkerReplica split: legacy aliases such as `lowgw1` and
`lowgw10` may remain as replica ids, but run compatibility must not include
legacy slot aliases, ports, API bases, raw API keys, or other process identity.
Provider, workspace, and permission tier remain hard pool boundaries. Focused
contract check: `node tests\gateway-profile-replica-model-harness.test.js`.
Composer optimistic-send coverage must also prove that a failed or timed-out
`POST /api/threads/:id/messages` clears the local pending user/assistant
messages, restores the draft text, and schedules a bounded thread refresh so a
client-only `queued` placeholder cannot masquerade as a real Gateway queue.
Focused check: `node tests\composer-send-pending-feedback.test.js`.
Before switching production from eager startup to hybrid/on-demand startup,
rerun these checks after syncing scripts into the production worker root and
then smoke `/api/status?detail=1` plus a real Owner run. Full hybrid/eager
starts and listener on-demand `-NoStopExisting`
single-profile starts must skip full reconfiguration when the selected profiles
are already configured and the non-secret configure signature is current.
Changing the manifest, generator script, plugin/schema source, runtime override
source, Skill Store mapping inputs, missing profile artifacts, or explicit
`-ForceConfigure` must run `configure-low-gateways.sh` again. Stop-only
operations must not require profile config/auth validation before killing the
selected port.
For legacy WSL-backed Windows deployments only, if the listener account cannot
see the production WSL distro, the launch service must use the configured
Windows Scheduled Task relay: write only bounded action/profile metadata to
`elastic-requests`, trigger the task, wait for the result file, and keep
failures redacted. Focused checks must assert this relay path in
`node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\startup-scripts.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
On maintained Windows-native deployments, the relay path must remain disabled
and `scripts/start-worker-host.ps1` must keep native Python/PowerShell launch
configuration in the listener context.
After a start script returns success, the scheduler must poll the selected
worker's `/health` for the configured bounded window before emitting
`health_check_failed`; a single immediate health miss is a failing harness case
because it can race the newly opened Gateway listener.
When a `run.gateway_worker_start_failed` event has
`failureCode=health_check_failed`, or a Gateway run reaches a failed terminal
state such as `run.failed`, `response.failed`, `run.stream_failed`,
`run.liveness_stale`, or `run.gateway_start_timeout`, the event path must
schedule the Gateway runtime diagnostic service. Focused checks must prove
user-requested cancelled runs do not trigger failure diagnostics, untracked
stream aborts are classified as failed instead of cancelled, the report is
written under `data/diagnostics/gateway-runtime`, raw worker/provider keys are
not serialized, and the embedded Codex repair task card is
`pending_owner_approval` with no automatic repair actions. Focused checks:
`node tests\gateway-health-diagnostic-service.test.js` and
`node tests\gateway-run-start-event-service.test.js`,
`node tests\gateway-run-terminal-state-service.test.js`,
`node tests\gateway-run-stream-stop-service.test.js`,
`node tests\gateway-run-stream-failure-service.test.js`, and
`node tests\gateway-run-stream-completion-service.test.js`.
Thread interrupt routes must also leave a bounded `run.interrupt_requested`
event before stopping local active streams so cancelled runs can be
distinguished from network failures during production incident review. Focused
check: `node tests\thread-task-api-routes.test.js`.
Production setup must also verify that the scheduled task can be demand-started
by the listener account. The task principal should remain the WSL-owning
account, but the task file/Task Scheduler ACL must grant the listener account
read/execute permission to run it; otherwise the relay request will remain
pending and the user run will fail before WSL starts.
Because this account-boundary failure has recurred, production rollout is not
complete with only an operator-run `start-gateway-pool.ps1 -StartProfiles`
success. The required live gate is a real non-Owner Mobile API cold-start smoke
from a stopped profile through the listener, followed by healthy
`/api/status?detail=1` and no manual worker start.
Focused implementation checks should include
`node tests\gateway-elastic-worker-scheduler.test.js`,
`node tests\gateway-runtime-composition-service.test.js`,
`node tests\gateway-runtime-child-service-registry-service.test.js`,
`node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\gateway-pool-provider.test.js`,
`node tests\gateway-run-start-execution-phase-service.test.js`,
`node tests\gateway-run-start-permission-service.test.js`,
`node tests\gateway-run-start-plugin-probe-service.test.js`,
`node tests\gateway-run-start-preparation-service.test.js`,
`node tests\gateway-run-start-stream-handoff-service.test.js`,
`node tests\gateway-run-start-target-phase-service.test.js`,
`node tests\gateway-run-start-target-service.test.js`,
`node tests\gateway-run-start-toolset-preflight-service.test.js`,
`node tests\gateway-run-start-service.test.js`,
`node tests\gateway-run-lifecycle-service.test.js`,
`node tests\gateway-status-projection.test.js`, `node tests\system-api-routes.test.js`,
`node tests\task-list-ui.test.js`, `node tests\startup-scripts.test.js`,
`node tests\cross-shell-command-harness.test.js`, and
`node tests\static-cache-version-harness.test.js`.

For graph-guided Growth card planning, the harness must preserve the
graph-first authoring contract. Formal model-generated cards must require a
validated `learningGraphPlan` or validated temporary graph node; prerequisites
must exist and be acyclic; stage assessments must declare graph-node coverage;
and learner difficulty feedback must update planning evidence without becoming
formal mastery failure by itself. External seed graphs must be converted into
native Hermes graph records before runtime use. Public curriculum foundation
imports must be manifest-driven, must preserve URL/status/hash provenance, and
must reject paid/restricted materials or learner-level mismatches such as using
IGCSE/A Level nodes as direct current targets for a Primary learner.

For Gateway toolset selection, the harness must preserve the model-first
contract when that selector is enabled. Do not hard-prune callable toolsets
before a first-round model selection. A first round may use a compact
capability catalog, but the execution round must preserve the full active
authorized toolset surface chosen by deterministic policy and plugin capability
activation. Selector output is recorded as `suggested_toolsets`; it must not
remove ordinary authorized user tools such as `weather`. The model-side
permission preflight is a separate switch and remains disabled by default.
The harness must cover advisory selection metadata, full-authorized execution,
allowed permission elevation, denied blocked-toolset escalation, invalid
selection fallback, and telemetry for model-selection start/end, tool-call
start/end, and final-message start/end.
Selector failure is explicitly recoverable: timeout, invalid JSON, missing
runner, or unauthorized selections must fall back to the originally authorized
toolset list. Permission and optional toolset choice must share the same
model-side preflight when both are enabled; when toolset choice is disabled,
that same preflight returns only the permission decision and execution keeps the
full active schema set. Selector failure has the same fallback rule: execution
restores the full originally active schema set, not the suggested subset. The
selector should use a ChatGPT low-cost model, a bounded
timeout of 30000ms by default, and best-effort cancellation when a selector run
id is known. Do not add local
natural-language permission routing before the model. If the model-side
preflight returns a `HERMES_PERMISSION_APPROVAL_REQUIRED`-style decision,
execution must not start until Owner approval.

Product-specific MCP capabilities are part of the same H1 contract. Wardrobe
ingestion/recommendation/writeback tests must assert that authorized
wardrobe-capable runs keep `wardrobe` in the model-selection catalog and can
select `wardrobe` with `vision`/`file` for image-backed writeback and readback
verification. A run that has a wardrobe-capable Gateway profile but lacks
`wardrobe` in `access_policy_context.allowed_toolsets` should be treated as a
Mobile policy/routing regression, not as a missing Gateway MCP.
All workspace-private plugin MCP capabilities must also prove user isolation,
not only schema presence. The harness for a plugin MCP must assert that:

- each target workspace has its own `.hermes-<plugin>/config.json` and
  `.hermes-<plugin>/access-key.txt` or plugin-owned equivalent;
- stdio MCP wrappers are compatible with the Hermes Agent MCP SDK transport,
  including newline-delimited JSON framing as used by `mcp.client.stdio`, not
  only `Content-Length` fixture clients;
- the Gateway profile's `mcp_servers.<plugin>` block points at that target
  workspace root and rejects runtime workspace override;
- an Owner session switched into a non-Owner workspace selects a profile/schema
  bound to the target workspace, not Owner's plugin directory;
- a missing target profile/schema omits the plugin MCP/toolset and returns a
  bounded diagnostic instead of falling back to Owner;
- raw workspace keys, Owner plugin keys, launch tokens, provider OAuth tokens,
  cookies, full mailbox bodies, private ledger rows, inventory dumps, or health
  records do not appear in manifests, prompts, frontend state, postMessage
  payloads, docs, logs, screenshots, or test output.

Plugin-bound application topics are H1 when they influence plugin visibility,
MCP/toolset routing, workspace switching, delivery-directory creation, or
context assembly. The harness must assert that visible topic cards use the same
effective-workspace plugin projection as the app drawer and manifest routes;
open-app, open-topic, and open-file-directory are separate actions; the
standard plugin file directory is created/resolved under the target workspace as
`插件/<plugin title>`; context uses cleaned selected directory files only; and a
plugin topic run uses the selected workspace's MCP
schema or omits the plugin toolset with a bounded diagnostic. Owner fallback to
Owner's plugin app, directory, or MCP is a failing case. Focused checks should
include `node tests\plugin-topic-binding-service.test.js`,
`node tests\plugin-topic-delivery-directory-service.test.js`,
`node tests\plugin-topic-context-service.test.js`,
`node tests\plugin-topic-api-routes.test.js`,
`node tests\gateway-run-toolset-routing-service.test.js`,
`node tests\context-assembly-service.test.js`, and
`node tests\app-plugin-topics-ui.test.js` once those tests exist.

Wardrobe callable-schema coverage must include actual-wear history writeback
through `mcp_wardrobe_wardrobe_write_history`, not only item write/search/read
and photo functions.
Wardrobe-bound directory projects must first add `wardrobe` in the access
policy catalog; selector routing alone is insufficient because it cannot grant
toolsets absent from `allowed_toolsets`.
If a topic is already bound to a wardrobe/closet directory, every AI run in
that topic must keep authorized `wardrobe`, `vision`, and `file` in the
suggested model-selection catalog by default, even when the latest message is
semantically light. This is still a policy-bounded suggestion: the router must
not grant toolsets that the run policy did not already authorize.
Wardrobe root UI harnesses must assert shared centered page title, no repeated
body hero title/directory pill, no visible disabled Stop button, and top-right
three-dot section switching for overview, watches, maintenance, wear, featured
looks, and log. Wardrobe stats tests must also cover currency-prefixed prices
such as `¥4,787` so totals and average price do not undercount. Full Wardrobe
UI parity must be tested as a future embedded-app plugin contract, not by
copying Wardrobe detail/photo/settings screens into Hermes Mobile.
Wardrobe MCP schema smoke must use a real selected Gateway worker and require
`mcp_wardrobe_wardrobe_search_items`, `mcp_wardrobe_wardrobe_get_item`,
`mcp_wardrobe_wardrobe_write_item`, `mcp_wardrobe_wardrobe_upload_photo`,
`mcp_wardrobe_wardrobe_set_primary_photo`, and
`mcp_wardrobe_wardrobe_write_history`. A policy record that says `wardrobe` is
enabled is not enough if the callable schema exposed to the model lacks those
functions. MCP registration logs are not enough either: for MCP-required
smoke, use a session schema when the runtime writes one, or run
`node scripts\gateway-tool-schema-smoke.js --profile <profile> --schema-only
--require <mcp_...>` so the harness constructs that profile's actual
`AIAgent` under the production runtime overlay. Runtime-log-only MCP evidence
is allowed only with an explicit emergency override and must not be used as
normal pass evidence. Provider selection remains user intent: if the selected
provider is OpenAI/ChatGPT, repair that OpenAI profile's schema exposure rather
than auto-routing to DeepSeek; the reverse is also true.
When model-first toolset selection is disabled, Wardrobe-intent or
wardrobe-bound-topic runs must still execute with the full active Wardrobe
required bundle plus baseline schemas selected by capability activation. The
deterministic route may record a narrower `suggested_toolsets` hint such as
`wardrobe`, `vision`, `file`, `skills`, and weather-sensitive `weather`, but
tests must assert that this hint does not prune the required plugin bundle or
force unrelated optional plugin schemas into the run.
For selector/runtime-overlay changes, standalone schema smoke is not sufficient.
The harness must also exercise the real `/v1/responses` request path and prove
that Mobile's top-level `enabled_toolsets` becomes the effective
`AIAgent.enabled_toolsets`. If that proof is unavailable during a hotfix window,
keep `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION=0` while leaving
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT=0` unless there is an
explicit diagnostic rollback; do not compensate by pruning the ordinary
authorized execution set.
Runtime configuration harnesses must also check the effective production
launcher before concluding the selector is on or off:
`C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1` is the real
toggle owner, while `%USERPROFILE%\.hermes-windows\start-hermes-mobile-production.ps1`
is only a forwarding wrapper. A selector rollout or rollback must document the
launcher value, the backup path, and a post-restart `/api/status?detail=1`
smoke. Changing the selector does not require a Gateway Pool restart by itself,
and it must not change provider routing or silently re-enable permission
preflight.
Public reverse-proxy hardening is a permission/security workflow. The harness
must cover global HTTP security headers on JSON and route-owned responses,
including `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`; query-string
Access Keys disabled by the effective production launcher; header-based Owner
auth still accepted; anonymous plugin proxy requests denied before upstream
fetch; and Codex Mobile bridge default permission mode remaining below
`full`/dangerous execution unless explicitly overridden. Production rollout
must record the launcher backup, post-restart `/api/public-config` header
smoke, query-key denial smoke, authenticated `/api/status?detail=1` smoke, and
Windows firewall state for generic Node.js Public inbound rules.
Embedded app plugin host tests must assert manifest-driven tab loading,
same-window iframe navigation, no `target=_blank` browser handoff, a short-lived
signed embed token with no raw keys in URLs, a persistent iframe host that does
not reparent launch iframes, a clean blank host during manifest/launch loading,
and postMessage back plus viewport contracts. The viewport contract must prove
the active iframe receives bounded `hermes.plugin.viewport` messages on
attach/load and host keyboard/visual-viewport changes, including viewport,
keyboard, iframe, host, and footer metrics with no raw keys, launch tokens,
cookies, route URLs, or user content. Host visual-viewport resize, scroll, and
orientation changes must schedule a short settled broadcast sequence and reset
Home AI's own page scroll while an embedded iframe is active, because iframe
input focus can pan the host page even when the Home AI composer is not focused.
Host window `scroll` must also trigger the same settle path so first-focus
document panning does not wait for a later app foreground event. The host-side
harness must also assert that
the parent `edgeSwipeZone` starts a real edge back-swipe state for plugin pages
instead of only swallowing iframe-adjacent touch events with `preventDefault()`.
Mobile bottom navigation must keep Codex as a first-level tab while collecting
Wardrobe, Finance, and Email under the centered `插件` drawer without bypassing
their manifest/workspace visibility rules; hidden legacy plugin tabs must not
consume bottom navigation hit targets.
Plugin app pages must keep the ordinary Home AI system bottom navigation
projection: `聊天`, `信息`, `话题`, plus any workspace-pinned plugin tabs. The
old three-entry plugin-context footer is retired and must not replace the
system bar. Embedded plugin iframes must hide the normal Hermes topbar/header;
plugin-specific headers belong inside the iframe. The host must reserve the
measured system bottom stack for the iframe instead of adding broad
host-owned bottom padding.
Exiting plugin context back to the topic home must clear plugin host classes,
plugin view-mode classes, scroll feedback state, and sidebar/right-swipe state
before the topic list is rendered again; otherwise directory-bound topic cards
can become non-scrollable after entering and leaving a plugin.
Route-snapshot restoration for plugin app/topic/directory routes must also
restore plugin-context identity, initialize plugin-owned `canGoBack` on
secondary plugin routes, and cover cold restart fallback from plugin context to
the ordinary topic root without exposing the generic empty thread page.
The host plugin viewport must subtract the visible system bottom stack so the
iframe starts at the host viewport top and ends above the system navigation.
Standalone `100dvh` plugin layouts must not slide under Home AI buttons. The
plugin-side UI harness must also follow
`docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`: iframe app roots use
iframe-relative `height: 100%` sizing in `embed=hermes`, plugin-owned bottom nav
or floating action bars reserve only plugin-owned footer space, and device/CDP
checks measure both the iframe/footer gap and the plugin local-nav/iframe-bottom
gap. If Finance-like plugin pages align while another plugin floats above the
footer, treat that as a plugin-side embedded layout failure unless host geometry
shows the iframe still extends under the Hermes footer. Keyboard-sensitive
plugin sheets, remark layers, and fixed form actions must respect the host
`hermes.plugin.viewport` payload for iframe/footer geometry and host-bottom
reservation in embedded mode, while native system keyboard positioning may
remain plugin-local. The
same-origin proxy harness must also cover plugin-owned JSON image paths,
including Note `/api/v1/app/attachments/<id>` URLs in note bodies and
attachment metadata; these URLs must be rewritten to
`/api/hermes-plugins/note/proxy/...` with the selected workspace id. The
harness must also assert that an empty directory-bound topic draft can be
dismissed by top-left or right-swipe back, and that switching from that empty
draft to a plugin app discards only the pending draft state instead of locking
the plugin footer. The draft recognition must be based on the pending directory
attachment itself, not on the return route still being present, and
`loadSelectedView()` must not clear `state.directoryReturnRoute` while that
draft is active. Discarding the draft must clear both `pendingTaskDirectory` and
`taskDirectoryFilter`.
Codex Mobile is Owner-only but follows the same host system bottom navigation
projection as other plugins. It may appear in the drawer when not pinned, may
be pinned into the system bottom bar, and may be removed from that bar by
long-press/context menu.
Plugin-owned full-screen image/file previews must use the embedded plugin
postMessage contract to hide the Home AI system bottom navigation and reserve zero
bottom space until the preview closes. Frontend harnesses must assert the host
accepts `previewFullscreen` / `fullscreenPreview` navigation state, hides the
bottom nav only for that fullscreen preview state, and
sets the embedded iframe viewport bottom to `0`.
Right-swipe/back from a plugin context must prefer plugin-owned navigation over
host exit: when `canGoBack=true`, the swipe target sends `hermes.plugin.back` to
the iframe, and only falls back to `plugin-context-home` after the plugin has no
secondary page to close.
These are generic plugin requirements, not Wardrobe-only behavior; new plugins
must satisfy the same host contract before being treated as production-ready.
Installed plugin visibility must also be covered: Owner sees installed plugins
by default only when the effective workspace is `owner`; when an Owner session
switches to a non-Owner workspace, ordinary plugin list/navigation/manifest
projection must simulate that target workspace. Non-Owner workspaces do not
list or launch a plugin unless there is an explicit Owner authorization signal.
A global plugin key is not enough to authorize every workspace. Plugin-manager
changes must additionally test Owner-only admin routes, grant/revoke
persistence, normal business-plugin visibility after a grant, Codex Mobile
grant denial, Codex Mobile absence during Owner-to-non-Owner workspace
switching, and the side-navigation manager being hidden from non-Owner users.
Workspace onboarding is an H1 cross-boundary workflow. Planning must be
side-effect free. Apply must refuse to create partial production state when the
macOS privileged executor is unavailable, and must use only the injected
whitelist executor for OS user, private roots, ACL, LaunchDaemon, and smoke
steps. The service must reuse `upsertLocalWorkspace`,
`rotateWorkspaceAccessKey`, `ensureWorkspaceGateway`, and
`hermesPluginService.grantWorkspace` instead of duplicating those contracts.
Focused checks include `node tests\workspace-onboarding-service.test.js`,
`node tests\workspace-system-provisioning-executor-service.test.js`,
`node tests\workspace-system-provisioning-helper-client-service.test.js`,
`node tests\workspace-system-provisioning-helper-script.test.js`,
`node tests\workspace-onboarding-api-routes.test.js`,
`node tests\mobile-api-dispatcher.test.js`,
`node tests\api-route-inventory.test.js`, and
`node tests\architecture-refactor-boundary.test.js`. After the real macOS
executor is deployed, production validation must also include
`macos-worker-filesystem-access-harness.js`,
`macos-worker-filesystem-access-harness.js --workspace-catalog-targets`,
`macos-production-profile-audit.js`,
`macos-gateway-manifest-toolset-smoke.js`, selected plugin provisioning smokes,
and wrong-header/wrong-workspace denial checks.
Finance workspace provisioning is an H1 plugin authorization workflow. Granting
Finance to a workspace, and Owner first use of the default-visible Finance
plugin, must create a workspace-local
`.hermes-finance/access-key.txt` and non-secret `.hermes-finance/config.json`,
call Finance
`POST /api/v1/hermes/plugin/users/bind` with UTF-8 workspace display name,
register `mcp_servers.finance` for the target workspace profile, expose the
`finance` toolset only when that profile/schema exists, launch Finance through
the standard Python stdio wrapper (`finance_mcp_stdio.py`) rather than a
profile-specific ad-hoc runtime, record only `active` or bounded
`provisioning_failed` status, and block non-Owner list/manifest/launch when
provisioning has failed or is still pending. Harnesses must assert the raw
workspace key is not returned in the grant result, manifest, frontend state,
URL, postMessage payload, docs, logs, or screenshots, and that Owner switching
into a non-Owner workspace cannot reach Owner's Finance user or ledger through
either iframe launch or MCP. Windows+WSL smoke must additionally prove the
Finance Python wrapper can call `tools/list` and receive `mcp_finance_*`; a
non-loopback `--api-base-url` that hits Finance's loopback-only MCP bridge and
returns `finance_mcp_dispatch_loopback_only` is a failing deployment state.
Owner profiles must be tested for the same `.hermes-finance` presence before
MCP registration; falling back to the Hermes Owner web key is not valid MCP
provisioning evidence.
Focused checks include
`node tests\finance-plugin-provisioning-service.test.js`,
`node tests\startup-scripts.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\wardrobe-plugin-navigation-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Wardrobe workspace provisioning is also an H1 plugin authorization workflow.
Granting Wardrobe to a workspace must create that Hermes user's own Wardrobe
workspace id, write workspace-local `.hermes-wardrobe/access-key.txt` and
non-secret `.hermes-wardrobe/config.json`, call Wardrobe
`POST /api/v1/hermes/plugin/workspaces` with a server-side `owners:write` or
`admin:*` registration bearer credential, install the keyless
complete `productivity/wardrobe-style-operations` Skill bundle into that user's
Skill Store, refresh the workspace Gateway profile binding, and block non-Owner
list/manifest/launch while provisioning is pending or failed. Harnesses must
assert generated target keys use Wardrobe's accepted Program API prefix, replace
invalid legacy placeholder-prefixed keys before registration, and keep the
target raw Wardrobe key present only in the server-to-server registration body
and the workspace-local key file, not in the grant result, manifest, frontend
state, iframe URL, postMessage payload, docs, logs, or screenshots. They must
also assert the target Skill Store contains the full `SKILL.md`,
`references/wardrobe-program-api.md`, at least one other reference Markdown
file, and `scripts/render_wardrobe_phone_pdf.py`; a fixture or runtime source
that lacks `references/` must fail closed instead of falling back to a short
template. The installed Skill bundle must not contain concrete Wardrobe
workspace keys, plugin launch tokens, or `Authorization: Bearer ...`
credentials. Missing/invalid registration credentials or incomplete Skill
bundles are bounded provisioning failures. Focused checks include
`node tests\wardrobe-plugin-provisioning-service.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`, and
`node tests\hermes-plugin-api-routes.test.js`.
Email workspace provisioning is an H1 plugin authorization workflow. Granting
Email to a workspace must call Email
`POST /api/v1/hermes/plugin/workspaces` with a server-side Email Owner key,
bounded workspace identity, and the target workspace root. The resulting
workspace-local `.hermes-email/config.json` and `.hermes-email/access-key.txt`
are the only long-lived launch materials Hermes should use; Email owns mailbox
credentials, local mail storage, sync cursors, and per-user account filtering.
The Email MCP harness must prove the `email` toolset and `mcp_servers.email`
are bound to the target workspace directory, reject workspace override, expose
single-prefixed Gateway callables such as `mcp_email_search_messages` and
`mcp_email_apply_mail_action`, and do not expose provider OAuth/token material
to Hermes or the model. The current Email MCP schema epoch is
`20260607-email-local-delete-mcp-v1`. Ordinary chat
must keep Email catalog-only, while explicit mailbox intent must activate
Email before the Gateway stream begins.
Harnesses must assert the raw Email Owner key, workspace key, launch token, full
mail body, attachment content, and provider credentials are not returned in the
grant result, manifest, frontend state, iframe URL, postMessage payload, docs,
logs, or screenshots. Pending or failed Email provisioning must block non-Owner
list/manifest/launch. Focused checks include
`node tests\email-plugin-provisioning-service.test.js`,
`node tests\email-mcp-wrapper.test.js`,
`node tests\gateway-profile-template-builder.test.js`,
`node tests\gateway-run-start-service.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\app-embedded-plugin-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Health workspace provisioning is the same H1 plugin authorization workflow.
Granting Health to a workspace must create workspace-local
`.hermes-health/access-key.txt`, write non-secret `.hermes-health/config.json`,
and call Health `POST /api/v1/hermes/plugin/workspaces` with a server-side
registration credential such as `HEALTHY_REGISTRATION_KEY` or the Hermes Mobile
Health owner-key env/file aliases. The registration request must include the
bare Hermes workspace id in `workspace_id`, `target_workspace_id`, and
`hermes_workspace_id`, and may send `access_key_hash`; it must not send the raw
workspace key. Health may respond with canonical `workspace_id` such as
`health:owner`; Hermes must persist that canonical id in config. Missing or
empty registration credentials, failed Health registration, key/config write
failure, or missing MCP wrapper binding must keep the grant out of `active` and
block list/manifest/launch instead of falling back to Owner. A fresh Health
manifest means installed only: Owner and non-Owner workspaces must not see
Health in ordinary plugin lists, plugin topics, launch manifests, or MCP
toolsets until explicit provisioning creates both `.hermes-health/access-key.txt`
and `.hermes-health/config.json` for that effective workspace. Health proxy
writes, including Apple Health/native sync writes, must carry an explicit
effective workspace from `workspaceId`, `workspace_id`,
`x-hermes-plugin-workspace-id`, referrer, or a single scoped proxy cookie before
Home AI injects a plugin workspace key. Owner authentication may authorize
access to another workspace, but it must not become the data workspace by
fallback; absent or ambiguous Health write workspace context must fail closed
before upstream fetch and before reading an Owner Health key. Focused checks include
`node tests\health-plugin-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`, and
`node tests\task-list-ui.test.js`.
Generic plugin provisioning states must also be covered. A plugin-manager grant
may enter `pending` only when Hermes owns an automatic provisioning service for
that plugin. Finance, Wardrobe, Email, and Health are automatic provisioning
plugins; pending or failed records for any of them must block non-Owner
list/manifest/launch.
Manual/external-binding plugins without a Hermes provisioner should store
`manual_required` and must not be blocked by the pending/failed gate solely due
to the grant record. Codex Mobile remains non-grantable. The service harness
must cover Finance auto-provisioning, Finance failure blocking, Wardrobe
auto-provisioning, Wardrobe failure blocking, Email auto-provisioning, Email
failure blocking, legacy Wardrobe pending blocking, and Codex grant denial in
`node tests\hermes-plugin-service.test.js`.
Plugin notification coverage must assert that
`POST /api/hermes-plugins/<plugin-id>/notifications` requires Hermes auth,
requires a stable `sourceId`/`eventId`, supports durable Inbox-backed events and
push-only events, sends Web Push through Hermes when requested, and never
exposes plugin keys, launch tokens, push endpoints, or raw plugin content.
The default push click target is the Inbox item when one exists; `openMode=plugin`
or push-only events click the plugin route. Codex Mobile task completion keeps
one latest Inbox record per workspace through a stable workspace-scoped dedupe
key, so a new completion overwrites that workspace's previous Codex completion
item instead of creating a growing Inbox list. Codex Web Push clicks must still
go directly to the Codex plugin route, with the Inbox id carried only as
metadata. Codex completion push must be suppressed unless the plugin event is
terminal, includes bounded final receipt detail, and carries a route anchor that
can focus the completed thread/task/turn. If a plugin supplies bounded
`detailMessage`, Action Inbox detail must render it as the long receipt; Web
Push assertions must prove the long body does not appear in the push payload and
that `openMode=plugin` payloads preserve `pluginRoute`, `pluginItemId`,
`pluginThreadId`, `pluginTaskId`, and `sourceTurnId` before generic Inbox
routing. Frontend route harnesses must also prove those route anchors are passed
into the target plugin host, including shared embedded-plugin hosts and legacy
dedicated hosts such as Wardrobe. Owner-critical plugin notification keys must
stay endpoint-scoped. Movie notification coverage must prove the
plugin-notification-only key authorizes only
`POST /api/hermes-plugins/movie/notifications` for `workspaceId=owner`, does
not become Owner auth for other Home AI routes, and is installed through the
Movie launchd installer without printing key contents or Home AI-side secret
paths. Focused checks include
`node tests\hermes-plugin-notification-auth-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`, and
`node tests\install-movie-launchd-service.test.js`.
Finance ledger join approval is an H1 plugin-to-Inbox workflow. Harnesses must
cover `finance.ledger_join_request` normalization into an Inbox `approval` item,
compact ledger/requester/role display, approve/reject actions, Finance review
contract invocation before Inbox state transition, Finance plugin refresh after
review, and privacy limits that exclude Finance tokens, Hermes workspace keys,
cookies, bank/account details, voucher bodies, push endpoints, and long logs.
Focused checks: `node tests\hermes-plugin-notification-service.test.js`,
`node tests\finance-ledger-join-approval-service.test.js`,
`node tests\action-inbox-api-routes.test.js`, and
`node tests\app-action-inbox-ui.test.js`.
Plugin projects must also carry their own harness: manifest shape, launch
exchange, frame-ancestor origin registration, `?embed=hermes` mode,
`<plugin-id>.plugin.navigation`, `hermes.plugin.back`, optional
`<plugin-id>.plugin.back_result` with `handled=false` fallback to the Hermes
outer back layer, same-iframe internal navigation, no `window.open` /
`target=_blank`, state preservation across tab switches, and installed-PWA
smoke. Hermes Mobile host tests do not replace the plugin project's own
embedded-mode tests.
The first NAS-backed registration uses
`GET /api/hermes-plugins/wardrobe/manifest` as the Mobile-side contract and
defaults the live source to
`http://127.0.0.1:8765/api/v1/hermes/plugin/manifest`, with an environment
override for later local/production source changes. Codex Mobile Web uses the
same generic route shape through `GET /api/hermes-plugins/codex-mobile/manifest`
and defaults to the local Codex plugin manifest at
`http://127.0.0.1:8787/api/v1/hermes/plugin/manifest`.
HTTPS/PWA embedded-plugin tests must assert that a raw HTTP iframe entry is
never silently rendered as a blank plugin pane. External plugins need an HTTPS
browser-facing entry or a visible diagnostic. Local/LAN plugins such as Codex
Mobile and Wardrobe may remain HTTP upstreams only when Hermes Mobile rewrites
the browser-facing entry to `/api/hermes-plugins/<plugin-id>/proxy/...` and
proxies HTML, static assets, plugin API calls, redirect headers, and session
cookies through that path. A same-origin proxied entry must not be marked
unavailable merely because the upstream plugin's `frame-ancestors` directive
does not list the Hermes origin; the browser frames the Hermes proxy URL. Direct
HTTPS/non-proxied plugin entries must still pass the frame-ancestor allow check.
Standard inserted plugin pointer checks must also reject public/NAS/tailnet
domains as default `macos_production_base_url` or `manifest_url` values. The
contract checker must prove those runtime fields are loopback, so a stale
personal domain cannot leak into iframe launch, postMessage navigation, or iOS
right-swipe/back behavior.
The test must hit the real Mobile dispatcher route
as well as the plugin route module. Same-origin proxy launch tests must prove
server-side `fetch` uses manual redirect handling, because automatic redirect
following consumes launch `302` cookies before the browser can store them. Tests
must also assert upstream cookie `Domain` is stripped and `Path` is rewritten to
the plugin proxy prefix. They must also assert Owner switching into a non-Owner
workspace cannot reuse an Owner plugin session: the proxied launch entry must
carry the effective target `workspaceId`, upstream requests must forward
`x-hermes-plugin-workspace-id` for that target, and session cookies must be
namespaced by plugin id plus workspace id. Rewritten plugin HTML, JavaScript,
CSS, and JSON resource/API URLs must also carry the effective `workspaceId` when
the URL is a static string so a browser request that omits `Referer` still lands
in the selected workspace. Codex Mobile Vite ESM imports must cover root/static
forms such as `/vite-shell/assets/...` and `assets/...`, plus relative chunk
forms such as `import("./...")` or `from "./..."`; relative chunk specifiers
must be resolved against the current proxied script path and rewritten with the
effective `workspaceId`. JavaScript template-string URLs with runtime query
fragments, such as ``/api/threads${params}`` or
``/api/auth/status?_ts=${Date.now()}``, must preserve the template expression
and only rewrite the static path prefix to the proxy; inserting `workspaceId`
inside the expression or concatenating it as `workspaceId=ownerlimit=...` is a
failing harness case.
The client auth harness must also assert that `public/app-api-client.js` syncs
the same-origin `hermes_web_key` cookie whenever it sends `X-Hermes-Web-Key`;
otherwise authenticated plugin iframes cannot navigate to the protected
same-origin proxy because iframe navigations cannot attach custom headers.
Incoming proxy requests may translate only the current plugin/workspace cookie
back to the upstream cookie name; they must drop Owner-scoped plugin cookies,
other-workspace plugin cookies, and old unscoped plugin cookies. If a request
has no workspace hint and carries multiple workspace-scoped cookies for the same
plugin, the proxy must fail closed as an ambiguous workspace instead of falling
back to Owner. This is a generic embedded-plugin harness requirement, not a
Wardrobe-only case; cover normal workspace-private plugins such as Wardrobe and
Finance, and keep Owner-only plugins such as Codex Mobile hidden when the
effective workspace is non-Owner. Harnesses must also assert stale
session cleanup: manifest responses expire known raw upstream session cookie
names plus Owner/current Hermes-scoped names, and launch-token proxy requests do
not forward any existing plugin session cookie before the upstream issues the
fresh workspace session. The same-origin proxy must also
rewrite plugin-owned image/static URLs in HTML, JavaScript, CSS, and JSON
responses so absolute upstream image URLs and root-relative `/uploads`,
`/media`, `/images`, `/assets`, and `/static` paths stay under
`/api/hermes-plugins/<plugin-id>/proxy/...`; explicit plugin resource APIs such
as `/api/uploads/file` and `/api/files/preview/content` must also be proxied.
Wardrobe JSON photo paths such as `/api/photos/<id>/content`,
`/api/outfit-photos/<id>/content`, `/api/featured-look-photos/<id>/content`,
and `/api/v1/items/<code>/photos/...` are resource URLs and must be proxied
rather than resolved against Hermes Mobile's own `/api` namespace.
JSON responses must be parsed and rewritten structurally so thread/chat prose,
code snippets, and ordinary `/api` strings are not changed. Binary image
requests through that path must be streamed with their original content type and
safe preview/download headers. `node tests\plugin-proxy-response-service.test.js`
must cover safe header preservation, binary streaming without `arrayBuffer()`,
and bounded Codex upstream-reported timing extraction.
Long-lived `text/event-stream` plugin APIs must also be streamed through the
same-origin proxy without calling full-body readers such as `text()` or
`arrayBuffer()`, so embedded EventSource clients receive the initial event and
keepalive chunks instead of timing out into reconnect fallback.
Embedded plugin upload harnesses must also cover same-origin proxy upload
compatibility: sandbox strings include `allow-forms` and `allow-modals`,
multipart `FormData` upload requests keep the original body/content type, and
Wardrobe CSS proxy output turns hidden `.upload-btn input` file controls into
transparent interactive file inputs instead of `display:none` controls.
Active embedded plugin
hosts must hide the Hermes page header so plugin content is not double-framed;
the Hermes bottom navigation must also be hidden for plugin root and secondary
pages. Deployment
smoke for this class must include the installed Android PWA launched from the
home-screen icon. Opening the same URL in the Chrome/Safari address bar is
explicitly not a valid PWA smoke, because Hermes Mobile shows a browser-shell
guard page there and it does not exercise standalone storage, service-worker,
navigation, or plugin iframe behavior. Dark-mode plugin-tab smoke must also
assert that a newly created iframe is hidden behind a theme-colored shell until
load, so Codex/Wardrobe tab entry does not flash a white browser default
surface. Wardrobe-specific host tests must cover the same loading-shell
contract even when the tab uses `.wardrobe-plugin-*` classes rather than the
generic embedded-plugin host classes. Refresh stability assertions must prove an existing iframe remains
visible while the host fetches a fresh launch URL, passive/non-forced boot
warmup refresh attempts are suppressed, explicit
`<plugin-id>.plugin.refresh_required` postMessages can recover a consumed or
invalid launch page without bypassing relaunch cooldown, and entering plugin
mode clears stale keyboard viewport metrics so the chat composer returns to its
normal bottom alignment.
Dark-mode installed-PWA resume must also assert that the pre-JS shell,
manifest `background_color`/`theme_color`, `html`/`body` background, plugin
host background, and iframe loading shell share the effective dark background.
The navigation regression path `plugin -> topic -> chat` must verify stale
`keyboard-viewport-active`, `keyboard-context-mode`, `--keyboard-*` CSS
variables, and bottom-nav reservation do not shift the composer downward.
Embedded-plugin host tests must also cover the outer return layer: entering a
plugin from a Hermes page records the source route, plugin internal
`canGoBack=true` sends `hermes.plugin.back`, and plugin root /
`back_result handled=false` restores the saved Hermes page instead of trapping
the user inside the plugin tab. Plugin root and secondary pages must hide the
Hermes bottom navigation; exiting a full-screen plugin uses the host
back/right-swipe contract and saved Hermes route restoration, not a visible
bottom-tab escape path inside the plugin surface.
If Hermes sends `hermes.plugin.back` and the plugin does not acknowledge with a
fresh navigation or back-result event inside the bounded fallback window, the
host must treat that back as unconsumed and restore the saved Hermes route when
available.
Plugin refresh coupling must be covered by the host contract: the iframe may
send `<plugin-id>.plugin.refresh_required`, Hermes must validate the plugin
entry origin, discard stale iframe/launch state, fetch a fresh manifest through
the Mobile plugin route, and preserve only bounded route hints so the active
plugin returns to its intended Codex/Wardrobe position after refresh. Wrong
origin refresh messages and payloads carrying keys, cookies, launch tokens,
raw plugin content, prompts, or local paths are failing cases.
The host must still throttle passive launch-health rebuilds so an invalid
plugin page cannot create a relaunch loop; the harness must cover same-window
explicit refresh recovery, messages sent while manifest/launch loading is
already in progress, and active-tab frame rebuild without leaking route hints
beyond bounded plugin route fields. Host-side launch-health retries must use
the same throttle, and a normal host re-render must preserve an already-mounted
iframe instead of requesting another launch token.
Embedded-plugin appearance sync is part of the launch contract. Host tests must
assert Hermes sends sanitized `appearance.theme` and `appearance.fontSize` in
Codex, Finance, and Wardrobe launch bodies, maps Hermes `standard` font size to
plugin `default`, and creates iframe entries only after the short launch path
contains matching `pluginTheme` / `pluginFontSize` query parameters. The host
must treat these as session-scoped preferences and must not leak keys, launch
tokens, local paths, raw settings dumps, or private content into appearance
metadata.
The host cache harness must also assert a manifest/launch result is reused only
when both workspace id and sanitized appearance key match. A previously fetched
`system/default` Wardrobe manifest must not satisfy a later `dark/large` launch;
the next plugin entry must fetch a new launch token and entry URL with matching
appearance query parameters. The render path must apply the same
workspace-and-appearance check before reusing an existing iframe shell, so a new
appearance-aware launch token cannot remain unconsumed while the old iframe
session stays mounted.
The same harness must require stale plugin shells to be discarded when the
workspace-and-appearance key no longer matches; `preserve_iframe_state`,
navigation metadata, and refresh warmup/cooldown paths must not preserve an old
`system/default` Wardrobe iframe after a `dark/large` launch has been requested.
Launch-token plugin harnesses must also cover plugin-side version changes. A
cached launch-token manifest must expire on a short TTL, and when a fresh
manifest/launch returns a different browser-facing iframe entry URL, the host
must rebuild the iframe shell even if the previous iframe recently posted
navigation events. Refresh-required postMessages from the still-mounted frame
origin must remain accepted so the plugin can trigger the refresh that replaces
the stale shell. Focused check: `node tests\embedded-plugin-refresh-harness.test.js`.
Plugin appearance harnesses must assert Hermes launches plugins with the
effective host theme. A host preference of `system` must be resolved via
`prefers-color-scheme` before launch, so a dark-mode PWA sends `dark` rather
than relying on each plugin to interpret `system` identically.
Plugin API route tests must also assert bounded manifest audit events capture
requested and response appearance without recording keys, launch tokens, entry
URLs, cookies, plugin content, or request bodies. This audit is the required
diagnostic path when a plugin reports receiving `system/default` while Hermes is
visibly in dark mode.
Static-client hotfixes must also run `node tests\static-cache-version-harness.test.js`.
This harness fails when cache-sensitive `public/app-*.js`, `public/styles.css`,
viewer HTML, `index.html`, or `service-worker.js` changes are present without a
client/cache version bump from `HEAD`, and it checks that the versioned app shell
uses the current embedded-plugin host script URL. Windows edits to static/test
files with Chinese text must use UTF-8-safe paths; PowerShell raw text rewrites
are not an acceptable harness path for version replacement.
Finance embedded-app registration follows the same host contract. Tests must
cover compact manifest normalization (`entry` string, top-level `launch`,
`toolsets`, `mcpServer`, `permissions`, and `embedding` events), Owner-default
visibility with non-Owner denial unless explicitly authorized, server-side
Finance launch body fields (`workspace_id`, `workspace_key`, `role`, and
optional `user_key`) without leaking raw keys into the returned manifest, and
the current Finance auth split where `user_key` is optional and must be a separate
workspace-user key, not a reused workspace key, while the workspace key is not
sent in an `Authorization: Bearer ...` header. Tests must also cover
same-origin proxy rewriting for `/finance.html`, `/manifest.webmanifest`,
`/app-finance-ui.js`, and plugin-owned `/api/finance/...` resource URLs, plus
quoted and unquoted CSS `url(...)` resources such as
`url("/assets/wacai-ledger-bg.svg")`; malformed quote stripping that causes
later rules such as `.finance-bottom-nav` to disappear from the browser CSSOM is
a failing case. Tests must also cover
negative cases where anonymous or unauthorized workspace requests are denied
before any upstream fetch. The
Finance token-error smoke must record only bounded evidence: manifest
`available`, `tokenStatus`, redacted proxy launch URL shape, launch `302`
preservation, redirect shape, `finance_hermes_session` cookie name, and a
bounded authenticated `/api/finance/overview` result.
Focused checks for this contract include
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\embedded-plugin-refresh-harness.test.js`,
`node tests\wardrobe-plugin-refresh-harness.test.js`, and
`node tests\app-embedded-plugin-ui.test.js`.
Finance MCP registration checks must also prove the real Gateway callable schema,
not only generated profile files or MCP registration logs:
`node scripts\gateway-tool-schema-smoke.js --profile <finance-capable-profile> --schema-only --require mcp_finance_list_ledgers,mcp_finance_add_transaction_attachment --require-tool-property mcp_finance_add_transaction_attachment:file_path,mcp_finance_add_transaction_attachment:upload_path`.
This smoke is required after changing Finance provisioning, MCP wrapper framing,
Gateway profile generation, WSL/NAS MCP API-base propagation, or startup scripts.
Plugin MCP schema changes must also bump the Mobile `GATEWAY_TOOL_SCHEMA_EPOCH`
and the default instruction-service `toolSchemaEpoch`. The run history for a
plugin topic must show a conversation key with the current plugin-MCP epoch; an
older Wardrobe-only epoch paired with `Enabled toolsets: finance` is a failing
state because it can reuse a cached callable schema without `mcp_finance_*`.
Finance attachment support is not accepted unless the Mobile instruction-service
Finance callable hints and current tool schema override both name
`mcp_finance_add_transaction_attachment`, the service schema includes
`finance.add_transaction_attachment:file_path` and `:upload_path`, and the
Gateway callable schema includes
`mcp_finance_add_transaction_attachment:file_path` and `:upload_path`. A plugin
service `/schemas` pass alone, or a Gateway tool-name-only pass, does not prove
the model can call the attachment tool with a server-local upload path in a live
run.
For any plugin MCP tool addition or rename, run
`node scripts\mcp-tool-upgrade-closure-smoke.js` with the plugin service schema
URL, the local service tool name, the Gateway `mcp_<server>_<tool>` callable,
any required tool properties, the new `GATEWAY_TOOL_SCHEMA_EPOCH`, and the
selected production manifest/profile. Source/service-only checks must pass
`--skip-gateway` explicitly; otherwise the harness fails closed rather than
silently skipping selected-profile schema evidence. The source guard for that
closure is
`node tests\mcp-tool-upgrade-closure-harness.test.js`.
Movie MCP v92 specifically requires the seven Gateway callables
`mcp_movie_search_sources`, `mcp_movie_recommend_sources`,
`mcp_movie_get_source_detail`, `mcp_movie_get_catalog_stats`,
`mcp_movie_record_source_interaction`, `mcp_movie_update_source_list`, and
`mcp_movie_list_source_state` in both the selected Owner profile schema and the
Movie plugin-topic dispatcher registry. The closure smoke must assert
`search_sources:source_category`, `search_sources:include_facets`,
`recommend_sources:preferred_genres`, `recommend_sources:liked_catalog_ids`,
and `update_source_list:list_name` / `:operation`; a Movie service schema pass
alone does not prove a fresh Movie plugin conversation can call the tools.
Health MCP registration follows the same rule. A passing Health integration must
prove the selected profile exposes the single-prefixed callable
`mcp_health_records_get_summary`; a double-prefixed callable such as
`mcp_health_mcp_health_records_get_summary` means the plugin wrapper returned an
already-prefixed tool name and is not a valid pass, even if the profile lists
`health` under `platform_toolsets.api_server`.
Note MCP registration follows the same selected-profile rule. A passing Note
integration must prove the selected profile exposes single-prefixed callables
such as `mcp_note_notes_search` and `mcp_note_notes_create`; a profile that
lists `note` but lacks `mcp_note_notes_*`, double-prefixes the tools, or binds
to Owner's `.hermes-note` while viewing another workspace is a failing
workspace/provisioning state.
Local Windows Note MCP validation must also include a WSL-to-Note API
reachability probe. A profile that exposes `mcp_note_notes_create` but points
the wrapper at Windows-only loopback or an unreachable LAN address is failing,
because create/update calls can time out even though schema discovery succeeds.
Switching away from a plugin tab must force-hide the plugin host and clear the
active host class even if the iframe shell record is missing, stale, or still
loading; a plugin iframe must not remain above chat/topic content after a
bottom-tab switch.
Wardrobe dashboard binding tests must cover directory ambiguity: a configured
wardrobe root with `.hermes-wardrobe/config.json` must win, child delivery
folders such as `衣橱/交付` must not steal the root, and generic outfit output
folders such as `穿搭建议` must not be treated as the deterministic dashboard
workspace.
The execution policy must also preserve the wardrobe companion set after
model-first narrowing. If the suggested set contains authorized
`wardrobe`, `vision`, and `file`, a selector result of `wardrobe,file` must
still execute with `wardrobe,vision,file`; otherwise the main run will be forced
into an avoidable `HERMES_TOOLSET_ESCALATION_REQUIRED` loop.
The same harness must cover the low-level regression where the selector returns
`clarify` alone for a wardrobe MCP task or an MCP visibility check. When the
router has already suggested authorized `wardrobe`, `vision`, `file`, and
`skills`, execution must expand back to that stack instead of starting a run
whose policy text mentions wardrobe but whose model-selected execution set
cannot expose `mcp_wardrobe_*`.
The common web companion set follows the same rule: `web`, `search`, and
`browser` should be suggested, retained, and escalation-retried together when
authorized, while the negative harness must prove `browser` is not granted if
the run policy did not authorize it.

The selector/preflight is an internal JSON-only step. Tests must assert that
preflight requests disable tool calls, that live preflight probes do not contain
tool-role messages, and that repeated JSON candidates from streamed Responses
events are parsed as a valid final decision rather than `invalid_json`.
Tens-of-seconds latency is acceptable if the preflight reliably returns;
latency/cost claims must verify the actual Gateway session or worker log model
instead of trusting only the request body's `model` field. A successful
model-first decisions must also suppress a second permission-classifier pass
before execution: the main execution prompt must not ask the model to load the
permission-boundary Skill again or call `skill_view` for
`productivity/hermes-mobile-permission-boundary-check`. Permission-only
preflight is a legacy explicit opt-in path; default run-start coverage must
assert that disabling it does not send a selector model call and does not emit
`run.permission_preflight_*` rows. If temporarily re-enabled for diagnostics,
timeout/error coverage must remain bounded by
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS`.

Run status harnesses must cover no-first-byte visibility. If the execution
stream receives no Gateway event after the configured warning window, the
system may store a diagnostic warning event without refreshing the real Gateway
`lastEventAt` used by liveness/stale decisions. Harness coverage should assert
visible first-stream-event, first-text-output, liveness stale, and stream-failed
statuses. Run-progress UI must not render `run.liveness_warning` as a visible
row; only stale/start-timeout/stream-failed states should consume visible
status space. Light and dark theme checks must also assert the inline active
run-status panel does not collapse into a thin empty border: the panel, header,
rows, elapsed time, and at least one status row must remain visible in both
themes.
Stream-closed-without-terminal coverage is required: `node
tests\gateway-run-stream-close-recovery-service.test.js` and `node
tests\gateway-run-stream-service.test.js` must prove that if streamed text
already arrived, Mobile emits `run.stream_closed_without_terminal`, synthesizes
completion from the accumulated content, and avoids failed Web Push / failed
external delivery. If no model output arrived, Mobile should release the queue
without showing the raw `Hermes stream ended without a terminal completion
event` string.
Stream reader failure coverage is required: `node
tests\gateway-run-stream-failure-service.test.js` and `node
tests\gateway-run-stream-service.test.js` must prove that reader rejection emits
`run.stream_failed` with a user-facing preview, preserves aborted
failure-reason terminal failure, cancels aborted streams without a stored
failure reason, and marks ordinary reader errors failed.
Liveness timer coverage is required: `node
tests\gateway-run-stream-liveness-timer-service.test.js` and `node
tests\gateway-run-stream-service.test.js` must prove the liveness interval is
normalized, periodic checks are scheduled at or above the minimum interval,
timer callbacks log rejected checks, and final cleanup clears stored timer
handles.
Lifecycle contract coverage is required: `node
tests\gateway-run-lifecycle-service.test.js` must prove stable lifecycle phase
ids, stable/branch event lists, terminal event classification, queued-run
decisions, liveness decisions, and source-file ownership for every listed
event. This is a source contract; branch events are not required to appear in
every individual run.
Stream completion handoff coverage is required: `node
tests\gateway-run-stream-completion-service.test.js` and `node
tests\gateway-run-stream-service.test.js` must prove resolved readers preserve
aborted failure-reason terminal failure, cancel aborted streams without a stored
failure reason, ignore already-terminal streams, and route non-terminal closure
through the close-recovery service.
Task terminal Web Push coverage must assert duplicate terminal events are
idempotent. A second `response.completed` / `run.completed` for the same
assistant message must return a terminal-ignored result, not enqueue another
external delivery or call `notifyTaskTerminal` again; `notifyTaskTerminal`
itself must skip a duplicate send when the same task receipt tag already has a
successful push delivery.
Run-progress UI tests must also cover preflight burst stability: model-selected
and toolset-selection events should update an existing panel in place, compact
`run.toolset_selection_started` with the matching terminal result, and use only
one delayed fallback thread refresh when no target assistant message is visible.
They must not call the generic whole-thread render path for each preflight
event, because that produces visible mobile screen jitter.
Single Window topic reply and thread-merge harnesses must assert that replying
inside an open topic posts the selected `taskGroupId`, and that a locally
running message not present in an idle incoming thread is removed rather than
kept as a stale pending card.
Wardrobe routing harnesses must include weather-sensitive outfit recommendation:
a wardrobe-bound topic asking for an outfit should add authorized `weather` to
the Wardrobe companion `suggested_toolsets`. With the selector disabled or
after selector fallback, the same test must prove execution still receives the
full active Wardrobe required bundle rather than the suggested subset.
Wardrobe outfit workflow gates must be tested as H1 completion behavior, not as
prompt-only guidance. The focused tests must prove pre-stream missing Skill,
missing weather, missing Wardrobe MCP/readback, missing Markdown receipt
capability, or missing required companion toolsets fail before streaming, while
final-answer evidence gaps such as no weather call, no Markdown receipt, or no
watch decision remain advisory and must not clear the visible answer or convert
the terminal state to failed.
Long-reply jump control harnesses must cover terminal DOM replacement and
historical scrolling: arrow visibility recalculation must resolve the current
conversation/message node when the queued callback executes, fall back from a
detached pre-terminal node to the live conversation, and run a short delayed
settle pass after final markdown/layout replacement. The eligibility check must
also cover one-screen overflow by measured rendered height and viewport
geometry, not by the 6000-character rich-render threshold. If a reply footer is
visible, the up/start arrow must stay inline beside the Usage/Skill/status chips;
floating is only allowed while the footer is outside the viewport. Once content
estimation or measured layout proves a reply is long, terminal Usage/Skill/run
status footer refreshes must not clear the reply's long-scroll eligibility.
Viewport
harnesses must also cover orientation recovery: after landscape/portrait changes,
the client must clear stale keyboard viewport state when the composer is no
longer actually focused, clear temporary conversation scroll-layer reset state,
recompute bottom navigation reservation, and recalculate long-reply arrows.
Native iOS shell keyboard-focus changes must also run
`node tests/keyboard-focus-guard-ui.test.js`: the Web app must clear hidden,
detached, inert, disabled, or zero-layout focused editables, while ordinary PWA
non-editable touches preserve a visible Composer focus and iOS native-shell
non-editable touches release the active editable to prevent stale WKWebView
keyboard resurrection.

Static client UI tests must cover device-local theme settings when the settings
sheet changes: `system` / `light` / `dark` options render in the settings menu,
the selected mode is stored as `hermesWebTheme`, `index.html` applies
`data-theme` before CSS load, and the app updates mobile `theme-color` plus
`apple-mobile-web-app-status-bar-style` so the OS status bar stays readable.
Theme visual harnesses must also cover real dark-mode surfaces, not just root
variables: sidebar/top bar, composer, user and assistant messages, topic cards,
Action Inbox rows and deliverable file tags, Growth warning/danger cards, and
settings/access-key sheets. A change that adds or modifies theme tokens must
include a screenshot or browser visual smoke against those surfaces and focused
assertions that the critical CSS rules consume theme variables instead of
hard-coded pale surfaces.
The iOS PWA `dark-admin-surfaces` scenario is the required focused check for
settings/access-key, Owner Admin, Runtime Config, Plugin Admin, and group-sheet
surfaces; it must fail on pale solid backgrounds or low-contrast dark
green/brown semantic text in dark/system-dark mode.
The iOS PWA `dark-growth-surfaces` scenario is the required focused check for
Growth teaching card detail, native Growth submission, program, coin/reward,
and readiness surfaces; it must fail on pale solid backgrounds or low-contrast
dark green/brown semantic text in dark/system-dark mode.
Floating menus and inline popovers are part of this dark-mode matrix: Directory
entry menus, topic detail three-dot menus, plugin capability action menus,
usage/tool/skill details popovers, and Growth owner menus must use theme tokens
for background, text, border, and shadow. Static assertions should fail when a
menu, popover, or details panel keeps a hard-coded white/pale background.
Dark-mode contrast harnesses must also check that message markdown headings,
receipt labels, file/artifact buttons, Growth teaching badges, and file viewer
shells do not use hard-coded dark green or pale backgrounds on dark surfaces.
Green/success text in dark/system-dark mode should be treated as a contrast
risk: tests should assert success/status text resolves to off-white variables
while preserving green only as a non-text semantic cue such as background,
border, or status dot. Cover Action Inbox source/status badges, Automation
success labels, group/member action buttons, topic secondary-page header
controls and directory chips, and reading fullscreen controls.
Settings-sheet grouped controls must also have dark/system-dark selected-state
coverage: theme options, font options, and default model options need a visible
selected frame/inner outline, not only a low-contrast fill.
Standalone `file-viewer.html`, `markdown-viewer.html`, and `pdf-viewer.html`
must read the saved `hermesWebTheme` preference before paint and expose
near-black page backgrounds in dark mode.
Foreground restore tests must also assert `handleAppForegrounded()` reapplies
the saved theme preference before refresh/render work, so a light-mode user does
not briefly see a dark-mode repaint when returning to the PWA.

Mobile sidebar shell tests must assert the side navigation is full-screen at
mobile/PWA widths (`100vw`, `100dvh`, safe-area padding, no visible underlying
app strip) and remains vertically scrollable without horizontal overflow.
Gateway provider status rows inside the sidebar must wrap through a compact
name/status layout rather than fixed three-column rows, so provider labels and
`Low`/`High` availability text cannot overlap on narrow devices.

Growth card detail/share UI tests must cover the H2 projection contract:
teaching-card and formal-card details render a `data-learning-growth-card-share`
control, use the local image-share pipeline with Web Share file payloads plus
clipboard/download fallback, and keep the detail page as a single-column
reading shell rather than nested table-like card grids. Assertions should cover
`app-learning-growth-task-ui`, `app-learning-program-ui`, `app-share-image-ui`,
and CSS rules that prevent card detail sections and structured questions from
compressing mobile text width.

Image-share pipeline changes must run `node tests\share-image-ui.test.js`.
Android/iOS native-shell image share changes must prove the Web side attempts
`HomeAINativeShare.share()` before Web Share, clipboard, or download fallback
and that browser/PWA fallback behavior remains available when the bridge is not
advertised.

Action Inbox harnesses must cover the low-click delivery and Todo semantics:
Automation delivery rows with `sourceRef.latestDeliverable` must render a
direct same-window document preview file tag that reuses the Automation detail
deliverable visual pattern and does not hardcode Markdown-only wording;
scheduled Todo/reminder Automation triggers must create `itemType=todo` Inbox
occurrences; scheduled Todo Automation rows with a safe deliverable must still
render the direct document preview action; row title/main areas must open the
Automation source detail with Inbox return context; row status must render as a
compact action badge after source/type, and tapping that status badge opens a
viewport-level action sheet with complete, snooze, and delete/dismiss actions;
the default open-state action badge must render the real status label `待处理`,
not a generic `处理` command, and its visual size/weight/color must stay close to
compact metadata text rather than a filled action pill;
the list must not render a separate right-side `处理` button that duplicates the
status badge or compresses the mobile row; generic
`待办提醒` titles must be replaced by the actual Automation/reminder title in
new projections or UI fallback; partial left swipes must not complete an Inbox
item while full swipes complete it once; and the default Inbox list must sort
newest items first by update/event/create time rather than grouping older Todo
rows above newer Automation receipts. Scheduled
Todo/reminder Automation pushes must also assert same-run idempotency: after a
deliverable push is marked for a `lastRunAt`, a later scan for the same run with
no newer deliverable must not send a second no-deliverable push, create another
Inbox upsert, or downgrade the stored mark.
Manual `sourceType=manual,itemType=todo` Inbox rows are already on their source
surface. If legacy data carries `/?view=todos...` or `todoId` deep links,
projection tests must assert the detail page does not render `Open source`, row
navigation does not call the internal route helper, and back navigation never
lands in the retired official Kanban/Todo compatibility surface.
The same compact source/type/status action contract applies to the Inbox detail
secondary page, not only the root list: the detail meta row must reuse the same
status-action badge and action-sheet path instead of rendering a larger legacy
status pill or separate process button.
The Inbox visual harness must also cover adjacent row badges/actions: `来源`,
`类型`, and status-action labels in the same meta row must share height,
padding, font family, font size, font weight, line-height, and letter spacing.
The status action may show a subtle chevron and semantic color, but must not
fall back to a larger browser-default button style.
This must be asserted with the app font-size setting enabled: the generic
`:root[data-font-size] button` rule must not enlarge an inline status button
relative to adjacent span badges.

Topic/navigation harnesses must assert that a missing `currentTaskGroupId`
does not leave the app permanently on `Restoring topic...` because of unrelated
active runs in the same single-window thread. The restore placeholder is valid
only for queued/running messages belonging to the same task group or while the
current thread fetch is actually in flight.

Directory plugin topic-start harnesses must assert that opening a topic from a
folder enters a directory-bound draft detail page in place, not the ordinary
topic-list root. The draft page must keep the composer visible and enabled,
hide the normal bottom navigation, preserve the pending directory attachment,
and restore the same directory view through top-left back or right-swipe before
the first message is sent. The first message from that draft must be guarded by
a draft-local in-flight state so repeated click/Enter submits cannot create
multiple topics for the same pending directory; after success, later messages
must target the created topic group rather than creating another one.

Toolset escalation and retry harnesses must assert that
`HERMES_TOOLSET_ESCALATION_REQUIRED` is stripped from visible chat content,
stored as bounded `toolsetEscalationRequired` metadata, and projected as
`run.toolset_escalation_required`. When the requested toolsets are omitted but
authorized, the same assistant message must automatically retry with the
previous selected toolsets plus the requested toolsets, skip a second selector
pass, emit `run.toolset_escalation_retrying`, and avoid terminal delivery until
that retry finishes. If the model requests a toolset that is already selected,
the raw marker must still be stripped and recorded as a controlled
schema-mismatch escalation without starting a duplicate retry. A later manual
retry/rerun message should also reuse recent task context or stored escalation
metadata to suggest the needed authorized toolsets instead of treating retry as
a plain probe, including when the relevant task context is in the same
`taskGroupId` but no longer in the global message tail.
Streaming-delta tests must also cover marker suppression before completion so
the raw escalation marker cannot appear briefly in the visible receipt while the
retry is being prepared.

Run tool-budget harnesses must prevent both extremes: runaway Web search loops
must emit a budget warning when the configured cap is exceeded, but the cap must
not directly mark an ordinary user-requested news/search run failed. The
instruction harness must also assert that web/search-enabled runs tell the model
the configured Web-search budget before tool use and to summarize from gathered
evidence instead of opening searches beyond the cap.

Explicit user-requested web/X search uses the higher explicit-search budget and
quality-first instruction. Harness coverage must assert that explicit
`web_search` / `x_search` runs tell the model to prioritize source quality,
meaningful coverage, and verifiable evidence over small time/token savings,
while ordinary incidental web-enabled runs keep the normal cap.
`x_search` bridge-host proxy coverage must also include hybrid cold starts:
when the manifest Grok profile is configured but stopped, bridge-host checks
Grok `/health`, starts only the manifest `xai-oauth` profile, waits for health,
and then forwards the proxy request. Concurrent proxy requests must share one
start attempt. Focused checks include `node tests\bridge-host-grok-proxy.test.js`
and `node tests\startup-scripts.test.js`.

Run-progress UI behavior tests must also assert chronological downward row
ordering, public `web_...` plus response `resp_...` id merging for the same
assistant message, isolation from unrelated thread active ids so a fast task
cannot inherit another active chat run's elapsed time or events, and bottom
visibility when the inline status panel grows while the conversation is already
following the run. Function-call UI tests must also assert that object-shaped
previews and paired `callId` result events display the concrete function name
when available, and that paired Skill/function start and done events render as
one compact operation row with a status/duration label rather than adjacent
duplicate start/result rows. For `function_call` / `function_call_output`
pairs, the duration assertion must use the output/result completion timestamp
minus the original function-call start timestamp; the intermediate
`function_call.done` event must not be treated as tool execution completion.
Gateway event-service tests must also cover both `item` and `output_item`
payload shapes so function names are preserved while raw arguments and raw tool
outputs remain excluded. Once streamed text begins, run-progress UI tests must
assert the inline panel switches to compact display unless a later tool
operation has started. Streaming receipt preview tests must assert running
assistant messages render only a bounded fixed-line tail preview inside the
assistant receipt, hide overflow rather than scrolling, keep the inline status
panel height-bounded in the same message body, and return to the full receipt
renderer after terminal message update. UI fallback tests must assert unnamed
function events are omitted instead of rendering generic labels such as
`Function` or duplicated labels such as `Function Function`.
Terminal message invalidation must also prove that a final assistant message
arriving while streaming is active queues a current-thread receipt refresh in
the same page, and that the refresh requests `stickToBottom=false` while the
five-second user-scroll protection window is active.
Terminal assistant receipts must collapse completed run-progress details into a
footer tag similar to Usage/Skill; opening the tag shows historical rows from
the first retained event, remains scrollable and inside the portrait viewport,
prefers space above the tapped status chip instead of covering the lower
conversation/composer area, and terminal history must not render an ongoing
quiet/still-running row. Skill footer tests must assert no synthetic response
fallback Skill is projected when no real Skill was loaded.
The terminal run-progress history panel must not reserve a tall blank fixed
area when content is short. Mobile positioning should use content-aware
`top + max-height` with `bottom:auto`; only long histories should scroll.

For same-window navigation and browser-frame bugs, the required harness must
cover both root-mounted and prefix-mounted app-shell paths. If the issue is
reported through an external reverse-proxy/PWA URL, validation must include
that exact external entry path and the changed route-helper JavaScript from the
same origin/path; local root smoke alone is insufficient.
Web Push chat/topic receipt routing must cover terminal receipt `messageId`
projection, single-window route precedence over generic `taskGroupId`, and
frontend scroll target consumption after chat/topic messages render. Web Push
subscription and delivery tests must also cover deployment-origin scoping:
frontend `clientContext.origin`, subscribe-route server-origin forwarding,
matching-origin delivery, and skipped delivery for copied legacy subscriptions
with missing or mismatched origin when `HERMES_MOBILE_PUBLIC_ORIGIN` or
`HERMES_WEB_PUBLIC_ORIGIN` is configured.

For secondary-page return bugs, the harness must also cover async race
conditions: a late response from the page being left must not repaint that page
after the return target has already been restored.
Topic-list harnesses must cover Kanban-generated case-topic cleanup: the root
topic list must not render Kanban study/case topics even when their backing
cards still exist. Those records are source evidence for Growth/Todo/Kanban or
Inbox deep links, not ordinary root topics. The same filter must apply to
first-party topic groups carrying `kanbanCaseId`/`kanbanCaseMode` and shared
case-topic threads.

## CodeGraph-Assisted Test Selection

Use CodeGraph for structural test selection, not as a replacement for the test
matrix.

- Check index health first when structural results matter:
  - `codegraph status`
- For known backend symbols:
  - `codegraph callers <symbol>`
  - `codegraph callees <symbol>`
  - `codegraph impact <symbol>`
- For broad backend task context:
  - `codegraph context "<task>"`
- Prefer MCP CodeGraph when available. The 2026-05-26 local benchmark showed
  MCP structural calls around `12-18ms`; CLI calls were around `196-218ms`
  because of process startup.
- Keep `rg` for literal text, docs, static versions, DOM strings, and frontend
  closure functions. In the same benchmark, `codegraph affected
  public/app-learning-growth-task-ui.js -q` returned no UI tests while targeted
  `rg` found related UI test references.
- If `codegraph impact` and `rg` disagree on tests, run the union of relevant
  focused tests unless the difference is clearly unrelated.

## CodeGraph-First Read Budget

For H1/H2 changes, especially navigation, route, passive notification, Web
Push, Automation, Growth, Gateway, or workflow bugs, keep initial context
loading bounded:

- Use MCP CodeGraph first when available; CLI `codegraph` is a fallback because
  each CLI call starts a process.
- Run up to three CodeGraph structural queries before opening source files:
  `codegraph_context`, then a targeted `codegraph_search`/`codegraph_callers`
  or `codegraph_trace`/`codegraph_impact` depending on the question.
- Open no more than four source files in the first triage pass, and read only
  the symbol body or about 80-120 lines around each relevant symbol.
- For frontend closure-local functions, DOM strings, `data-*` attributes, URL
  query parameters, static versions, and tests, run one targeted `rg` pass after
  CodeGraph identifies the likely files.
- For `.agent-context/HANDOFF.md` and long docs, search headings or keywords
  first with `Select-String`/`rg`; do not read long tails by default.
- If more context is needed, state the missing fact and widen the read scope
  deliberately.

The guard test is:

- `node tests\codegraph-harness-discipline.test.js`

## Module Focused Tests

| Area | Focused Tests |
| --- | --- |
| Architecture/code/test/harness map | `node tests\architecture-code-test-harness-map.test.js`, `node tests\architecture-refactor-boundary.test.js`, `node tests\codegraph-harness-discipline.test.js` |
| Mobile runtime composition | `node tests\mobile-runtime-file-helper-service.test.js`, `node tests\mobile-runtime-artifact-facade-service.test.js`, `node tests\mobile-runtime-kanban-facade-service.test.js`, `node tests\mobile-runtime-thread-view-facade-service.test.js`, `node tests\mobile-runtime-todo-facade-service.test.js`, `node tests\mobile-runtime-workspace-catalog-facade.test.js`, `node tests\mobile-runtime-http-server-service.test.js`, `node tests\system-runtime-status-service.test.js`, `node tests\mobile-api-directory-composition.test.js`, `node tests\mobile-api-learning-composition.test.js`, `node tests\mobile-server-runtime-startup-smoke.test.js`, `node tests\mobile-http-runtime-service.test.js`, `node tests\architecture-refactor-boundary.test.js` |
| API registry/dispatcher | `node tests\api-route-registry.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js` |
| Remote Managed Workspace control plane | `node tests\remote-managed-workspace-service.test.js`, `node tests\remote-managed-workspace-api-routes.test.js`, `node tests\remote-managed-workspace-integration.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\architecture-refactor-boundary.test.js`; source changes must prove enrollment-token fail-closed behavior, outbound remote-node register/poll or bounded long-poll/ack/per-card heartbeat/terminal return, duplicate suppression/idempotency, session states (`connecting`, `connected`, `stale`, `auth_failed`, `config_invalid`, `offline`), bounded daily-summary/escalation projections, Owner-only status/dispatch, fallback ordinary polling after long-poll timeout, and no production `8787` usage in the two-port harness. |
| Note receipt save | `node tests\note-receipt-save-service.test.js`, `node tests\note-receipt-api-routes.test.js`, `node tests\note-receipt-ui.test.js`, `node tests\gateway-run-instruction-service.test.js`, `node tests\task-list-ui.test.js`, `node tests\app-embedded-plugin-ui.test.js`; receipt title changes must prove hidden `homeai-note` metadata title priority, hidden metadata stripping from the Note body, bounded hidden tag merge after the server-derived receipt tag, deterministic no-model `<source> | <YYYY-MM-DD> | <summary>` fallback formatting, plugin tag preservation, workspace-scoped Note binding lookup, bounded attachment materialization, saved-note toast open carrying a refresh nonce into the resident Note plugin iframe, duplicate workspace/thread/message saves returning the existing Note reference without a second remote create, and no local paths, private URLs, launch tokens, raw access keys, or full artifact paths in the Note payload. Gateway instruction changes must prove this is a built-in Home AI host output contract rather than a Skill requirement. |
| Multi-user/task platform | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\conversation-history-service.test.js`, `node tests\action-inbox-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Auth/workspace/access keys | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\workspace-public-projection-service.test.js`, `node tests\mobile-http-runtime-service.test.js`, `node tests\workspace-onboarding-service.test.js`, `node tests\vite-classic-platform-adapter.test.js`, `node tests\vite-classic-access-key-manager-adapter.test.js`, `node tests\vite-classic-workspace-admin-adapter.test.js`; workspace Access Key rotation must leave plugin authorization and plugin-local `.hermes-*` key/config files unchanged; workspace onboarding retry must preserve an existing Home AI workspace key; key lifecycle changes must emit metadata-only audit; browser clients must clear account-scoped volatile projections on auth/workspace boundaries while preserving the one-time generated key display only for the relogin path |
| Public reverse-proxy security | `node tests\auth-provider.test.js`, `node tests\mobile-http-runtime-service.test.js`, `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\api-route-inventory.test.js`, `node tests\architecture-refactor-boundary.test.js`, `npm.cmd run security:invariants`, `npm.cmd run privacy:scan`, production smoke: `/api/public-config` headers, query-string key denial, header-authenticated `/api/status?detail=1`, anonymous plugin proxy denial, and Windows firewall state |
| Gateway run lifecycle | `node tests\plugin-capability-probe-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\gateway-run-model-toolset-selection-service.test.js`, `node tests\gateway-run-error-message-service.test.js`, `node tests\gateway-run-start-child-service-registry-service.test.js`, `node tests\gateway-run-start-preparation-service.test.js`, `node tests\gateway-run-start-execution-phase-service.test.js`, `node tests\gateway-run-start-stream-handoff-service.test.js`, `node tests\gateway-run-start-target-phase-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-completion-service.test.js`, `node tests\gateway-run-delta-event-service.test.js`, `node tests\gateway-run-output-event-service.test.js`, `node tests\gateway-run-response-created-service.test.js`, `node tests\gateway-run-streaming-save-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\gateway-run-evidence-service.test.js`, `node tests\gateway-run-toolset-escalation-service.test.js`, `node tests\gateway-run-toolset-escalation-retry-service.test.js`, `node tests\gateway-run-stream-completion-service.test.js`, `node tests\gateway-run-stream-close-recovery-service.test.js`, `node tests\gateway-run-stream-event-service.test.js`, `node tests\gateway-run-stream-failure-service.test.js`, `node tests\gateway-run-stream-first-event-service.test.js`, `node tests\gateway-run-stream-liveness-service.test.js`, `node tests\gateway-run-stream-liveness-timer-service.test.js`, `node tests\gateway-run-stream-registry-service.test.js`, `node tests\gateway-run-stream-state-service.test.js`, `node tests\gateway-run-stream-service.test.js`, `node tests\gateway-run-stream-stop-service.test.js`, `node tests\gateway-run-lifecycle-service.test.js` for lifecycle phase/source-event contract coverage, `node tests\runtime-config-worker-policy-contract-service.test.js` for runtime worker policy save/public/launcher parity, `node tests\gateway-run-queue-projection-service.test.js`, `node tests\gateway-run-terminal-state-service.test.js`, `node tests\gateway-run-queue-service.test.js`, `node tests\run-liveness.test.js`, `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js`, `node tests\streaming-receipt-preview-ui.test.js` |
| Chat context/compaction | `node tests\conversation-history-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\chat-data-context-selector-service.test.js`, `node tests\topic-context-compaction-service.test.js`, `node tests\mobile-runtime-thread-view-facade-service.test.js`, `node tests\thread-message-create-service.test.js`, `node tests\thread-view-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\mobile-sqlite-store.test.js` |
| Gateway Pool/scripts | `node tests\mobile-runtime-environment-service.test.js`, `node tests\mobile-runtime-gateway-environment-service.test.js`, `node tests\mobile-runtime-gateway-status-service.test.js`, `node tests\mobile-runtime-path-candidate-environment-service.test.js`, `node tests\mobile-runtime-state-path-environment-service.test.js`, `node tests\mobile-runtime-kanban-environment-service.test.js`, `node tests\gateway-elastic-worker-scheduler.test.js`, `node tests\gateway-pool-provider.test.js`, `node tests\gateway-profile-template-sync.test.js`, `node tests\gateway-profile-template-builder.test.js`, `node tests\gateway-profile-replica-model-harness.test.js`, `node tests\plugin-capability-probe-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\cross-shell-command-harness.test.js`, `node tests\macos-production-profile-audit.test.js`, `node tests\macos-production-drift-reconcile.test.js`, `node tests\macos-gateway-start-script-bridge-env-repair.test.js`, `node tests\macos-file-plugin-docx-root-smoke.test.js`, `node tests\gateway-pool-production-smoke-harness.test.js`, `node tests\macos-production-closure-validation-harness.test.js`, `node tests\macos-plugin-directory-production-smoke-harness.test.js`, `node tests\macos-wardrobe-binding-production-smoke-harness.test.js`, `node tests\macos-directory-path-migration-repair.test.js`, `node tests\macos-bound-directory-preview-smoke-harness.test.js`, `node tests\hermes-mobile-image-plugin.test.js`, `node tests\hermes-mobile-archive-plugin.test.js`, `node tests\hermes-mobile-office-plugin.test.js`, `node tests\hermes-mobile-pdf-plugin.test.js`, `node tests\hermes-mobile-pptx-plugin.test.js` |

Gateway runtime override changes that touch user-facing Markdown delivery file
modes must also run `node tests\gateway-runtime-sitecustomize-file-mode.test.js`
and `python -m py_compile gateway-runtime-overrides\sitecustomize.py`.

OpenAI-Codex quota failover changes also require
`node tests\openai-codex-shared-auth-pool-service.test.js`,
`node tests\openai-codex-quota-failover-runtime-service.test.js`,
`node tests\gateway-run-quota-failover-retry-service.test.js`,
`node tests\homeai-openai-codex-auth-pool-script.test.js`,
`node tests\gateway-run-completion-service.test.js`, and
`node tests\mobile-runtime-gateway-provider-service.test.js`.
| Gateway MCP callable schema | `python -m py_compile gateway-runtime-overrides\sitecustomize.py gateway-runtime-overrides\model_tools.py`, `node scripts\probe-lowgw1-wardrobe-mcp.js`, `node tests\no-window-command-harness.test.js` |
| ChatGPT Pro | `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\owner-elevation-routing-service.test.js`, `node tests\thread-message-create-service.test.js` |
| Grok/model routing | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\grok-auth-metadata-smoke-harness.test.js`, `node tests\grok-xai-oauth-closure-checklist.test.js`; script syntax: `bash -n scripts/macos-grok-xai-reauth.sh`; production xAI OAuth triage: `node scripts\grok-auth-metadata-smoke.js --profile-auth-file <file> --shared-auth-file <file> --require-access-token --json`. On Mac production, use `bash scripts/macos-grok-xai-reauth.sh` for the manual-paste OAuth repair, then generate `node scripts\grok-xai-oauth-closure-checklist.js --markdown`, rerun metadata smoke, and finally `node scripts\gateway-pool-production-smoke.js --key-file <file> --model grok-4.3 --provider xai-oauth --expected-profile grokgw1` only after metadata shows an xAI access token is present. |
| Direct provider keys / Gateway Pool distro | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-pool-provider.test.js`, `node tests\gateway-status-projection.test.js`, `node tests\thread-message-create-service.test.js`, `node tests\startup-scripts.test.js`, production smoke: `/api/status?detail=1`, all low/owner-maintenance Gateway health ports, provider-tier status matrix, workspace-dedicated DeepSeek profile routing including Owner-only `deepseekgw99`, and process-environment evidence that target workers received the expected provider key without logging the raw key |
| Web Push | `node tests\web-push-automation-projection-service.test.js`, `node tests\web-push-vapid-service.test.js`, `node tests\web-push-delivery-normalization-service.test.js`, `node tests\web-push-send-service.test.js`, `node tests\web-push-delivery-service.test.js`, `node tests\push-api-routes.test.js`, `node tests\task-list-ui.test.js`, `node tests\same-window-navigation-harness.test.js`. Terminal task receipt pushes must prove `taskGroupId`/`messageId` are preserved through the service worker click router, notification clicks force a selected-view reload with single-window cache bypass, foreground pushes refresh only the matching open topic detail or root topic list, and a user on another function page is not auto-navigated until they click the system notification. |
| Static client/UI shell | `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js`, `node tests\keyboard-viewport-ui.test.js`, `node tests\viewport-scroll-ui.test.js`, `node tests\same-window-navigation-harness.test.js`, `node tests\central-visual-harness-broker.test.js`, `node tests\playwright-visual-smoke-harness.test.js`, `node scripts\central-visual-harness-broker.js --surface browser-mobile --json`, `node scripts\playwright-visual-smoke.js`, and for directory-bound topic Composer autosize shrink regressions `npm run visual:central -- --surface browser-mobile --scenario directory-topic-composer-long-input-shrink --viewport 390x844 --execute --json`. Host-owned mobile bottom chrome changes must also prove runtime measured bottom-stack CSS variables, adjacent Dock/bottom-nav rects, no clipping, no overlap on the target production origin, and for global Dock handle changes `npm run ios:pwa:visual -- --scenario global-plugin-dock-gesture-stability`. |
| Host voice input | Current focused checks: `node tests\voice-input-service.test.js`, `node tests\voice-input-asr-provider.test.js`, `node tests\voice-input-correction-service.test.js`, `node tests\voice-input-api-routes.test.js`, `node tests\voice-input-ui.test.js`, `node tests\architecture-refactor-boundary.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\macos-production-deploy-script.test.js`, `node tests\local-asr-service-installer.test.js`, `node tests\task-list-ui.test.js`, `node tests\static-cache-version-harness.test.js`, and `node scripts\privacy-scan.js`. Local browser smoke should verify Home AI native composer long-press, streaming partial text in the active native composer when FunASR streaming is configured, final text replacing provisional text without duplication, whole-clip fallback when streaming fails, Kanban/todo creation, Automation create/edit, todo comment/revision, Growth teaching quick-check insertion, missing-ASR visible disabled state, no native text selection/callout, no ordinary-submit side effect, and no page errors. Real-device/PWA closure still needs `npm run ios:pwa:visual -- --scenario voice-input-overlay-composer --debug-url http://127.0.0.1:19073/` and, after embedded Codex adopts the bridge, `npm run ios:pwa:visual -- --scenario voice-input-overlay-plugin-composer --plugin-id codex-mobile --plugin-thread-id <thread-id> --debug-url http://127.0.0.1:19073/`. Harness must prove host-owned microphone permission/overlay, send-button tap-vs-long-press behavior, permission prompt release-cancel, release-to-transcribe, no native text selection/callout, silent close for too-short recordings, missing-ASR disabled state, conservative correction learning after final send, wrong-origin/stale-session rejection, no keyboard simulation, host draft auto-insertion into every registered native composer, streaming HTTP chunk routes, and protocol-based draft insertion into active plugin composers. Native-shell voice work must additionally prove the shell does not show a separate transcript editor as the primary input surface, composition sessions reject stale/out-of-order partials, provisional text patches only the active Composer range, final text replaces the provisional range without duplication, and user edits inside the provisional range are not overwritten. |
| Native iOS shell | `node tests\plugin-workspace-platform-contract-check.test.js`, `node scripts\plugin-workspace-platform-contract-check.js --target home-ai-native-ios --json`, `node tests\architecture-code-test-harness-map.test.js`, and from `/Users/example/path AI`: `xcodebuild -project 'Home AI.xcodeproj' -scheme 'Home AI' -destination 'generic/platform=iOS Simulator' build`. Native APNs server-side changes also run the Native Notifications checks above. Native voice-input bridge changes also run the Host Voice Input checks plus the Xcode build. System share/receive changes must prove authenticated workspace/thread/directory/plugin target validation and no plugin credential storage in the native shell. WebView stability bridge changes must prove bounded native-to-Web health/layout events without moving product UI ownership into native code. Any native-shell compatibility change must also prove the standalone PWA/browser path without `nativeShell=ios` keeps the existing UI, navigation, composer, plugin, and permission behavior. Apple Watch and Bluetooth/BLE remain deferred and require a new product requirement plus focused validation plan before any implementation work. |
| Action Inbox | `node tests\action-inbox-service.test.js`, `node tests\action-inbox-todo-service.test.js`, `node tests\action-inbox-todo-skill-doc.test.js`, `node tests\action-inbox-api-routes.test.js`, `node tests\task-card-dispatch-result-service.test.js`, `node tests\autonomous-delivery-coordinator-service.test.js`, `node tests\autonomous-delivery-api-routes.test.js`, `node tests\owner-system-console-service.test.js`, `node tests\owner-system-console-ui.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\task-list-ui.test.js`, `node tests\web-push-delivery-service.test.js`. Manual Product Reality audit UI must prove the user action sends a central audit request card and does not present a local CRON/Automation background job as the execution path. Autonomous Delivery Loop UI must prove `新建交付 Loop` posts the Owner objective to case creation, case creation only creates an Owner start item, Owner start has visible pending/failure feedback, each slice stores bounded AI Ops required-check/evidence projection, task cards include selected checks, implementation slices targeting the same workspace are not concurrently dispatched and instead record `dispatchStatus=deferred_conflict`, task-card routing failures are recorded as `dispatchStatus=failed` instead of sent worker tasks, Owner System Console shows unresolved dispatch conflicts/failures as a read-only Autonomy signal with bounded counts/codes and no retry side effect, verification review exposes Owner-triggered `开始验证` with visible pending/failure feedback, implementation/repair returns that require production evidence expose Owner-triggered `部署读回` with visible pending/failure feedback and no local deploy side effect, failed verification returns expose Owner-triggered `发修复卡` with visible pending/failure feedback and no auto-dispatch, Owner review rows stay open when task-card transport fails or returns no concrete card id, completed verification returns create Owner-triggered `完成闭环` closure feedback instead of recursive verification requests, return metadata can trigger local AI Ops evidence-ledger verification while storing only pass/fail, record count, bounded issues, and hash-only artifact references, Owner closure creates a `查看报告` final-report row with AI Ops check/evidence summaries plus ledger verification summaries without dispatching another task card, and no task-card dispatch happens before Owner action. Legacy plugin audit projection tests remain summary-only when that diagnostic path is exercised: no full report bodies, raw diffs, executor logs, prompts, secrets, tokens, push endpoints, raw evidence ledger paths, raw artifact paths, or private filesystem paths in Inbox records. |
| Embedded plugin host / Wardrobe, Codex, Finance, Email, Health, Note, Growth, and Moira plugin tabs | `node tests\hermes-plugin-authorization-service.test.js`, `node tests\hermes-plugin-service.test.js`, `node tests\hermes-plugin-notification-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\codex-mobile-recovery-service.test.js`, `node tests\codex-mobile-recovery-api-routes.test.js`, `node tests\app-embedded-plugin-ui.test.js`, `node tests\embedded-plugin-viewport-stability.test.js`, `node tests\embedded-plugin-refresh-harness.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\app-wardrobe-ui.test.js`, `node tests\wardrobe-plugin-navigation-ui.test.js`, `node tests\wardrobe-plugin-provisioning-service.test.js`, `node tests\macos-wardrobe-binding-production-smoke-harness.test.js`, `node scripts\macos-wardrobe-binding-production-smoke.js` on Mac production after Wardrobe binding repairs, `node tests\email-plugin-provisioning-service.test.js` when Email behavior changes, `node tests\health-plugin-provisioning-service.test.js` when Health behavior changes, `node tests\note-plugin-provisioning-service.test.js` when Note behavior changes, `node tests\growth-plugin-provisioning-service.test.js` when Growth pluginization behavior changes, `node tests\moira-plugin-provisioning-service.test.js` when Moira provisioning behavior changes, `node tests\mcp-tool-upgrade-closure-harness.test.js` and `node scripts\mcp-tool-upgrade-closure-smoke.js` when plugin MCP tools change, `node tests\task-list-ui.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, Android emulator PWA smoke from the home-screen Hermes icon for embedded-plugin changes. Codex Mobile host recovery must prove `401` and healthy listeners do not execute the restart script, while listener-missing or stopped-LaunchDaemon states can list homes, dry-run, and execute a selected profile through Owner-only routes. Moira development host insertion must additionally run `npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id moira --debug-url http://127.0.0.1:19073/ --app-url "http://<mac-lan-ip>:8899/?view=moira&pluginRoute=new_chart&pluginContextNavPluginId=moira" --expected-client-version 20260612-plugin-system-nav-v717` and record the artifact/evidence id in the Moira pointer doc. First-run plugin enablement must verify Owner and one non-Owner workspace cannot project `active` until workspace-local key/config, plugin-side bind/register, required Skill/MCP setup, and manifest/launch smoke pass. Plugin-manager projection must also prove Owner records can be persisted, Owner workspace-local key/config discovery is reflected as already enabled, and failed Owner provisioning remains a retryable diagnostic instead of reverting to a plain unopened button. |
| Plugin-bound application topics | Current frontend projection: `node tests\task-list-ui.test.js`, `node tests\app-embedded-plugin-ui.test.js`, `node tests\app-plugin-topics-ui.test.js`, `node tests\static-cache-version-harness.test.js`, and `node tests\playwright-visual-smoke-harness.test.js`. Service/runtime phases: `node tests\plugin-topic-usage-service.test.js`, `node tests\plugin-topic-usage-api-routes.test.js`, `node tests\plugin-capability-probe-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-instruction-service.test.js`, `node tests\plugin-topic-binding-service.test.js`, `node tests\plugin-topic-delivery-directory-service.test.js`, `node tests\plugin-topic-context-service.test.js`, `node tests\plugin-topic-api-routes.test.js`, plus `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\directory-browser-api-routes.test.js`, and `node tests\architecture-refactor-boundary.test.js` when implementation touches services/routes/runtime. Frontend harness must cover direct app launch from the global bottom Dock, the built-in Directory icon in that Dock, the Dock `常用` quick-action card, touch long-press/context quick-action menus including explicit `换位` drag-reorder mode, bounded move controls, and `pluginDrawerMenuGesture=touch-longpress`, global Dock handle mistouch/open/close gesture stability through `global-plugin-dock-gesture-stability`, native quick-action/menu/strip/action-route gesture proof through `plugin-drawer-action-gestures`, including Chat bottom-tab and top-level plugin App surfaces, usage-backed frequent quick actions with no trailing source badges, same-action repeated usage promotion such as `wardrobe:style` moving ahead by count/recency, immediate Dock/menu redraw after local usage writes, a six-entry quick-action cap in the `常用` menu, runtime measured bottom-stack placement for the collapsed and expanded Dock states, primary bottom nav, and plugin pages where primary bottom nav remains visible, and the absence of mid-page plugin desktop icons. Usage-backed quick actions plus manual Dock/drawer `pluginOrder` and pinned bottom-tab order must be server-persisted through `/api/plugin-topic-usage` per workspace; localStorage is only a first-paint/offline cache and client reset must preserve that cache. Cold-start tests must prove server preferences preserve known plugin ids such as `codex-mobile` while manifest availability is still loading, then restore pinned bottom tabs and drawer order as soon as the plugin becomes available without another server round trip. The standalone Capability page is retired: Dock `常用` carries quick actions, the root Topics page carries plugin conversation shortcuts, Directory-bound topic collections, and ordinary topic cards, and daily app launch stays in the global bottom Dock. The same harness must cover the Directory capability with no generic mini-button stack, bottom Dock icons without nested framed panels, six visible Dock entry slots before horizontal scrolling, host primary bottom navigation with Chat, Inbox, and Topics plus optional workspace-scoped pinned plugin tabs up to six total, default launch to Topics when no saved view exists, fixed `plugin:<pluginId>` topic ids, plugin-topic detail toolbars showing only the active directory chip with no plugin-topic dropdown, automatic `插件/<plugin title>` directory creation through the directory API, returning from that directory to the topic list, restoring topic-list scroll position after topic-detail back/right-swipe, preventing plugin topic detail loads from overwriting the task-list root cache, prioritizing plugin-context home before ordinary task-detail back for plugin topic details, clearing stale plugin view-mode classes before opening the topic detail so the message composer is visible, hiding the bottom navigation on ordinary plugin-topic secondary pages, preserving ordinary system bottom navigation on plugin app pages while retaining plugin-context state for back/route restoration, and making plugin-context right-swipe/browser-back exit through the dedicated topic-root renderer without calling `openTaskList()`, `restoreTaskListThreadFromCache()`, or `loadSingleWindow()`. |
| Directory-bound topic collections | Planned: `node tests\directory-topic-binding-service.test.js`, `node tests\directory-topic-context-service.test.js`, `node tests\directory-topic-api-routes.test.js`, `node tests\directory-browser-api-routes.test.js`, `node tests\context-assembly-service.test.js`, and `node tests\task-list-ui.test.js`; current frontend projection is also covered by `node tests\app-plugin-topics-ui.test.js`, `node tests\directory-plugin-navigation-ui.test.js`, `node tests\directory-run-scope-service.test.js`, `node tests\gateway-run-request-builder-service.test.js`, and `node tests\gateway-run-instruction-service.test.js`. Harness must cover multiple topics per directory, one default topic per directory, default-topic reassignment without deleting secondary topics, explicit open-directory/open-default-topic/open-topic-picker actions, workspace isolation, cleaned/selected/bounded directory context, target-workspace Gateway/MCP scope for directory-bound runs, and exclusion of fixed plugin topics from directory collections. Frontend harness must also prove the topic list can render its first frame before directory-topic aggregation runs, that directory collections are visually attached below the Capability Entry Hub quick-action area, that only the first three most recently updated directory collections default expanded while older collections default collapsed, that manual collapse/expand overrides persist in device-local storage, that the directory header keeps the folder icon on the left with bound topic chips below, that background aggregation/API refresh preserves the user's current topic-list scroll position, that deferred directory-topic rendering waits while scroll/swipe gestures are active, that built-in Directory plugin back returns from route-root to the Directory root listing before restoring the outer route, and that task-list vertical pan is not captured by sidebar right-swipe handling, because directory route extraction may scan many existing messages on large accounts. |
| Directory/files/artifacts | `node tests\mobile-api-directory-composition.test.js`, `node tests\directory-browser-api-routes.test.js`, `node tests\directory-mutation-api-routes.test.js`, `node tests\directory-delete-ui.test.js`, `node tests\directory-share-api-routes.test.js`, `node tests\file-artifact-api-routes.test.js`, `node tests\file-artifact-access-service.test.js`, `node tests\artifact-text-registration-service.test.js`, `node tests\plugin-delivery-markdown-media-preview.test.js`, `node tests\mobile-runtime-artifact-facade-service.test.js`, `node tests\document-preview-device-policy.test.js`, `node tests\macos-directory-path-migration-repair.test.js` and `node tests\macos-bound-directory-preview-smoke-harness.test.js` after Windows/WSL-to-Mac data migration; production chip closure uses `scripts\macos-bound-directory-preview-smoke.js --all-workspaces --simulate-ui-route --json`. PDF/Word/PowerPoint preview policy must prove native-shell document bridge requests are preferred when advertised, bridge failure falls back to the embedded Home AI viewer on phone widths, desktop non-coarse surfaces keep the same-window original/native path, plugin delivery Markdown receipts cover ASCII and non-ASCII filenames without sibling/path-traversal access, and Markdown remains on the Markdown preview surface. |
| Skill permissions/details | `node tests\skill-detail-provider.test.js`, `node tests\skill-analysis-service.test.js`, `node tests\plugin-required-skill-preload-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\resource-api-routes.test.js`, `node tests\gateway-workspace-provisioning-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\link-skill-profile-store.test.js`, `node tests\macos-production-profile-audit.test.js`, `node tests\task-list-ui.test.js` |
| Automation/Cron | `node tests\automation-api-routes.test.js`, `node tests\automation-provider.test.js`, `node tests\automation-manual-trigger-ui.test.js`, `node tests\vite-automation-controller-model.test.js`, `node tests\vite-classic-automation-controller-adapter.test.js`, `node tests\vite-classic-automation-actions-adapter.test.js`, `node tests\cron-bridge.test.js`, `node tests\cron-dispatcher-proxy-harness.test.js`, `node tests\cron-dispatcher-manual-run-harness.test.js`, `node tests\local-automation-bridge-service.test.js`, `node tests\mobile-runtime-environment-service.test.js`, `node tests\macos-production-deploy-script.test.js`, `node tests\install-macos-production.test.js`, `node tests\macos-automation-cron-audit.test.js`, `node tests\plugin-daily-progress-rollup-service.test.js`, `node tests\plugin-daily-progress-rollup-api-routes.test.js`, `node tests\codex-mobile-pr-automation-scheduled-task-service.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\startup-scripts.test.js`; recurring Todo/reminder rules must be Automation-backed and create Inbox occurrences rather than independent Inbox schedules; production/NAS smoke must verify that `/api/automations?detail=summary&refresh=1` reads the configured canonical scheduler and does not silently report an empty SQLite mirror when official CRON has jobs. Product Reality audit request-card implementation must include `node tests\codex-thread-task-card-service.test.js`, `node tests\plugin-workspace-audit-service.test.js`, and `node tests\automation-api-routes.test.js`; focused checks must prove dynamic discovery of the central audit thread, no fixed audit thread ids, controlled target selection, `home-ai` routing to `Home AI Platform Audit`, plugin targets routing one card to `Plugin Workspace Audit`, no Home AI fan-out to plugin implementation threads, no manual-route calls to `automationProvider.createJob`/`mutateJob`, and no CRON cache mutation for the request-card path. Automation manual-trigger checks must prove rows/details expose `手动触发`, UI calls `POST /api/automations/:jobId/run`, lower-level API/provider routing uses `mutateJob({ action: "run" })`, pending/success/error states stay bounded, paused scheduled jobs are one-shot next-tick manual requests without schedule resume, and failures expose issue codes rather than raw logs or payloads. Plugin Daily Progress Rollup checks must prove daily/manual triggers share the platform service path, duplicate date/window triggers suppress equivalent cards, mixed returned/no_activity/missing/stale/unresolved outcomes still generate one Owner-visible report, and report privacy redaction excludes raw plugin bodies, logs, secrets, endpoint bodies, private screenshots, DB rows, provider payloads, full prompts, and long diffs. Codex Mobile PR automation checks must prove stale shared checkouts use `origin/main` or a clean source worktree instead of reporting `missing planner`, dirty shared checkout without clean source fails closed, deploy/install upsert preserves Owner-paused `codex_mobile_pr_automation_hourly` state, state is metadata-only and stable outside disposable worktrees, and the hourly job remains planner-only with no direct merge, deploy, public push, or PR close. Legacy `plugin_workspace_audit` runner tests remain diagnostic coverage only and must not be used as the maintained Product Reality audit execution path. |
| Group chat | `node tests\single-window-group-chat-api-routes.test.js`, `node tests\group-chat-ui.test.js`, `node tests\group-chat-shared-attachment-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Runtime SQLite/state | `node tests\mobile-sqlite-store.test.js`, `node tests\runtime-state-repository.test.js`, `node tests\runtime-state-store-service.test.js`, `node tests\runtime-state-persistence-service.test.js`, `node tests\runtime-state-normalization-service.test.js` |
| Growth board/program/task | `node tests\growth-plugin-facade-service.test.js`, `node tests\growth-plugin-facade-api-routes.test.js`, `node tests\mobile-api-learning-composition.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\learning-program-api-routes.test.js`, `node tests\learning-program-service.test.js`, `node tests\learning-program-publish-service.test.js`, `node tests\learning-program-repository.test.js`, `node tests\learning-growth-jit-task-service.test.js`, `node tests\learning-growth-service.test.js`, `node tests\learning-growth-board-projection-service.test.js`, `node tests\learning-growth-teaching-card-services.test.js`, `node tests\learning-growth-card-api-routes.test.js` |
| Growth submissions/evaluation queue | `node tests\mobile-api-learning-composition.test.js`, `node tests\learning-growth-submission-service.test.js`, `node tests\learning-growth-task-evaluation-service.test.js`, `node tests\learning-growth-task-interaction-state-service.test.js`, `node tests\learning-growth-task-feedback-service.test.js`; audio submission/reflection changes must also prove `learning_task_audio_blobs` persistence and authenticated playback with `node tests\learning-program-repository.test.js` and `node tests\learning-program-api-routes.test.js` |
| Growth mastery/evergreen | `node tests\learning-growth-mastery-profile-service.test.js`, `node tests\learning-growth-mastery-repository.test.js`, `node tests\learning-growth-next-card-strategy-service.test.js`, `node tests\learning-growth-sequence-service.test.js` |
| Growth frontend | `node tests\app-learning-growth-ui.test.js`, `node tests\app-learning-growth-task-ui.test.js`, `node tests\app-learning-program-ui.test.js`, `node tests\app-learning-native-growth-submission-controller.test.js`, `node tests\dark-theme-growth-surfaces-css.test.js`, `node tests\task-list-ui.test.js`; dark-mode Growth UI fixes must also run `npm run ios:pwa:visual -- --scenario dark-growth-surfaces --debug-url http://127.0.0.1:19073/` when the iOS PWA lane is available |
| Learning rewards/coins | `node tests\learning-reward-settlement-service.test.js`, `node tests\learning-coin-service.test.js`, `node tests\learning-coin-api-routes.test.js` |
| Tongbao platform currency | v399 wallet foundation: `node tests\platform-currency-service.test.js`, `node tests\platform-currency-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\api-route-inventory.test.js`, `node tests\task-list-ui.test.js`, and `node tests\architecture-refactor-boundary.test.js`; future exchange/spend/grant work must also add `node tests\platform-currency-exchange-service.test.js`, `node tests\learning-coin-service.test.js`, and `node tests\learning-coin-api-routes.test.js` |
| Public export/release | `node tests\public-export.test.js`, `node scripts\privacy-scan.js --all-files`, `npm.cmd run export:public` |

## Planned Growth Workflow Contract Gate

The workflow harness described in `docs\IMPLEMENTATION_NOTES\growth-learning-workflow-contract-harness.md` is the required next gate for non-trivial Growth card workflow work. Once implemented, Growth changes that touch submission, evaluation, reflection, queue recovery, reward settlement, or workflow projection should run:

- `node tests\learning-card-workflow-contract.test.js`
- `node tests\learning-card-workflow-recovery.test.js`
- `node tests\learning-card-workflow-reconciler.test.js`
- `node tests\learning-card-workflow-privacy.test.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\task-list-ui.test.js`

Until those harness tests exist, implementation agents must add the relevant scenario before claiming the workflow change is complete.

## Planned Growth Knowledge Graph Gate

The graph-guided planning docs in
`docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-*.md` are the required
pre-coding gate for future graph-guided Growth card authoring. Current guard:

- `node tests\learning-growth-knowledge-graph-docs.test.js`

Once graph services are implemented, Growth changes that touch graph nodes,
domain packs, seed import, card graph bindings, or graph-guided card publishing
should run:

- `node tests\learning-graph-node-service.test.js`
- `node tests\learning-graph-import-service.test.js`
- `node tests\learning-graph-plan-service.test.js`
- `node tests\learning-card-graph-binding-service.test.js`
- `node tests\learning-growth-knowledge-graph-harness.test.js`
- the relevant Growth publish/JIT/projection/UI tests from the module table.

## Family Profile Memory Gate

The household profile design in
`docs\IMPLEMENTATION_NOTES\family-profile-memory-v1.md` is the required
pre-coding gate for future family member profiles, household profile summaries,
cross-workspace profile insights, and actor-scoped profile injection into
Gateway context.

Family Profile Memory is the practical transition before full Reference /
Memory Graph event semantics. It is H1 because it crosses workspaces,
permissions, persistence, source-domain projections, Gateway context assembly,
and Owner/member visibility policy.

The repository, service, projection, insight, API route, and mobile API
dispatcher foundation is implemented. Changes that touch personal profile
snapshots, household profile records, evidence refs, profile insights,
visibility projection, source collectors, or profile context injection should
run:

- `node tests\family-profile-repository.test.js`
- `node tests\family-profile-service.test.js`
- `node tests\family-profile-projection-service.test.js`
- `node tests\family-profile-insight-service.test.js`
- `node tests\family-profile-api-routes.test.js`
- `node tests\context-assembly-service.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\architecture-refactor-boundary.test.js`

The first production-grade harness must prove:

- Owner can read complete household profile projections;
- ordinary members can read only self and explicitly shared household
  projections;
- cross-workspace generated insights default to `owner_only`;
- profile evidence refs preserve source workspace and domain without storing
  full private plugin payloads;
- repeated refresh with the same idempotency key does not duplicate records or
  insights;
- Gateway context assembly injects actor-scoped profile projections and never
  sends Owner-only household profile data to non-Owner workers.

## Planned Reference / Memory Graph Gate

The cross-plugin Reference / Memory Graph design in
`docs\IMPLEMENTATION_NOTES\reference-memory-graph-v1.md` is the required
pre-coding gate for future Note links, plugin object references, event links,
cross-plugin backlinks, and graph-backed memory recall.

The detailed harness plan is:

- `docs\IMPLEMENTATION_NOTES\reference-memory-graph-harness-plan.md`

This work is strategic P1. It should not preempt active P0 closure for Mac
production stability, mobile visual/interaction stability, and MCP/schema
deployment harnesses. It still applies immediately as an architecture
constraint: new plugin and Note features must not introduce incompatible ad-hoc
reference formats.

Reference / Memory Graph changes are H1 because they cross plugin boundaries,
permissions, persistence, idempotency, Gateway/MCP tool exposure, and production
profile selection.

Once graph services are implemented, changes that touch reference nodes, object
refs, graph edges, Note links, backlinks, event grouping, permission trimming,
or plugin reference contracts should run:

- `node tests\reference-graph-repository.test.js`
- `node tests\reference-graph-service.test.js`
- `node tests\reference-graph-permission.test.js`
- `node tests\reference-graph-idempotency.test.js`
- `node tests\reference-graph-mcp-schema-harness.test.js`
- `node tests\note-reference-link-service.test.js`
- the relevant plugin reference contract tests for Finance, Wardrobe, People,
  Email, Note, Directory, or Growth.

The first production-grade harness must prove:

- Note can link to a Finance transaction and list backlinks;
- one event can connect Note, Finance, Wardrobe, and People references;
- permission-trimmed listing does not leak restricted plugin details;
- retries with the same idempotency key do not duplicate notes, objects, events,
  or edges;
- the selected Gateway profile exposes the graph and Note link MCP tools.

## Plugin Workspace Platform Contract Gate

The cross-workspace plugin platform contract in
`docs\PLATFORM_CONTRACTS\plugin-workspace-platform-contract.md`, the mobile UI
contract in `docs\PLATFORM_CONTRACTS\plugin-mobile-ui-visual-contract.md`, the
root-cause architecture contract in
`docs\PLATFORM_CONTRACTS\root-cause-architecture-contract.md`, the fallback
governance contract in
`docs\PLATFORM_CONTRACTS\fallback-governance-contract.md`, and
the audit thread governance contract in
`docs\PLATFORM_CONTRACTS\audit-thread-governance-contract.md`, and
the rollout plan in
`docs\IMPLEMENTATION_NOTES\plugin-workspace-contract-rollout-plan.md` are the
required pre-work gate for standardizing plugin repositories.

This gate applies before changing plugin workspace docs, deployment scripts,
MCP schema upgrade flows, mobile visual harnesses, Reference Contract surfaces,
or Mac production access in Finance, Wardrobe, Note, People, Email, Directory,
Growth-adjacent plugin surfaces, or future plugins.

The gate must verify:

- plugin-local `docs\HOME_AI_PLATFORM_CONTRACT.md` or equivalent pointer exists;
- root-cause-first diagnosis and repair are preferred over local patches or
  broad fallbacks;
- new or extended fallbacks are removed or registered in
  `docs\IMPLEMENTATION_NOTES\fallback-registry.md`, and mitigation is not
  reported as closure;
- plugin-local facts are declared;
- DEV runtime prerequisites are declared before plugin MCP/service tests are
  interpreted;
- shared Mac access follows `docs\RUNBOOKS\macos-production-access.md`;
- deployment command and production smoke are declared;
- MCP service and Gateway selected-profile schema closure are declared for MCP
  plugins;
- visual harness status is declared for embedded UI plugins;
- embedded UI changes follow the shared bottom-layout, safe-area, long-press,
  blank-surface, and evidence rules in the mobile UI contract;
- Reference Contract status is declared for structured fact plugins;
- docs contain no raw-looking secrets, tokens, cookies, access keys, or private
  long payloads.

Current checker commands:

- `node tests\plugin-workspace-platform-contract-check.test.js`
- `node tests\no-browser-native-dialogs.test.js`
- `node scripts\plugin-workspace-platform-contract-check.js --json`
- `node tests\ios-pwa-visual-harness.test.js`
- `node tests\visual-polish-audit-runner.test.js`
- `npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id <plugin-id> --debug-url http://127.0.0.1:19073/`
- for embedded keyboard/composer/input-obstruction changes:
  `npm run ios:pwa:visual -- --scenario embedded-plugin-keyboard-composer --plugin-id <plugin-id> [--plugin-thread-id <thread-or-route-id>] --debug-url http://127.0.0.1:19073/`
- for Codex Mobile side-chat keyboard/input-obstruction changes:
  `npm run ios:pwa:visual -- --scenario embedded-plugin-side-chat-keyboard --plugin-id codex-mobile --plugin-thread-id <thread-id> --debug-url http://127.0.0.1:19073/`
- for plugin Dock quick-action, long-press menu, horizontal strip gesture, pinned
  tab, or manifest action route changes:
  `npm run ios:pwa:visual -- --scenario plugin-drawer-action-gestures --plugin-id finance --plugin-action-id record --debug-url http://127.0.0.1:19073/`
  (same `--debug-url` runs are serialized by the default lane lock and the live
  server debug lane lease; use `--expected-client-version <version>` for
  static-client changes and `--no-lock` only on an isolated
  Simulator/debug-server lane)
- optional Mac read-only production evidence:
  `node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`

This checker verifies the standard inserted plugin set plus the Owner-critical
Codex Mobile Web special insertion and the `home-ai-native-ios` managed native
client target, validates plugin/native-client-local
`docs\HOME_AI_PLATFORM_CONTRACT.md` pointers and handoff adoption, and performs
read-only Mac source/launchd/manifest probes when requested. Codex Mobile Web
remains outside normal workspace-grantable business plugin visibility, but it
must declare `ios_live_debug_available=yes`, declare
`ios_visual_harness_command`, use the Home AI live iOS PWA debug server for
embedded iOS reproduction loops, and close mobile UI bugs with the checked
`scripts/ios-pwa-visual-harness.js` path before final bounded visual evidence
is recorded. The native iOS shell remains outside Dock, plugin-topic, MCP,
Gateway, LaunchDaemon, and loopback manifest checks; native changes use its
Xcode build plus the platform checker target.
Plugin MCP callable changes still require `node tests\mcp-tool-upgrade-closure-harness.test.js`
and the checked `scripts\mcp-tool-upgrade-closure-smoke.js` path. Embedded UI
changes still require visual/Appium evidence under the mobile UI contract.

Moira MCP Gateway registration must additionally prove ordinary
workspace-private binding: `.hermes-moira/config.json` plus key in the target
workspace, no Owner/`weixin_wuping` credential sharing, service schema
`moira.get_chart_evidence`, `moira.get_interpretation_context`,
`moira.get_analysis_evidence_bundle`, `moira.get_rule_evidence_bundle`,
`moira.get_year_forecast_evidence`,
`moira.get_current_progression_evidence`, `moira.get_pick_day_evidence`,
`moira.get_monthly_selection_evidence`, `moira.get_transit_event_evidence`,
`moira.get_eclipse_event_evidence`, `moira.get_aspect_evidence`,
`moira.get_pick_change_position_evidence`,
`moira.get_fixed_star_change_position_evidence`,
`moira.get_rule_migration_status`, `moira.get_rule_commentary_readiness`, and
`moira.get_functional_coverage_status`,
Mobile hints for the matching `mcp_moira_*` callables, and schema epoch
`20260616-moira-rule-evidence-bundle-mcp-v1`. A `--skip-gateway` closure
smoke is source/service evidence only; production closure still requires a
selected-profile callable schema smoke after app/plugin deploy and Gateway
profile restart.

## Production Verification Tiers

- Static-only change: sync static/test files, run syntax/focused UI tests in production app directory, smoke `/api/client-version`.
- Listener code change: check `/api/status?detail=1` first, backup, sync, run focused tests, listener-only restart, smoke status.
- Gateway plugin/profile/schema/startup change: backup, sync, run focused checks, restart Gateway Pool, smoke worker health. ChatGPT Image 2 plugin changes must also run `node tests\hermes-mobile-image-plugin.test.js` and a bounded direct low Gateway `chatgpt_image_edit` smoke.
- Data repair: backup data first, apply bounded repair, verify metadata/API results, avoid restart unless runtime memory could overwrite the repair.
