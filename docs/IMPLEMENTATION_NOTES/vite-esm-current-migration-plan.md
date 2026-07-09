# Vite ESM Current Migration Plan

## Status

This plan reflects the current source state after the 2026-07-06 production
cutover and Stage E ESM closure. It supersedes older informal migration
sequencing notes, but it does not replace the generated backlog at
`docs/IMPLEMENTATION_NOTES/vite-esm-migration-backlog.md`.

Current evidence:

- Home AI production cutover to the Vite bootstrap is deployed and read back:
  production `/` selects `X-HomeAI-Shell-Mode=vite`; Classic request probes
  such as `?homeAiShellMode=classic` are ignored under the Vite-only policy.
- `npm run --silent verify:vite-dev` passed 16/16 development acceptance steps
  before the cutover.
- `npm run --silent validate:vite-cutover-readback -- --readback-json <file>
  --require-ok` passed in the deploy lane with required readback ids `12/12`.
- `npm run --silent plan:vite-esm -- --json` reports 102 static-client script
  entries and 102 completed adapter slices, with no pending entries.

The current state means the generated classic-script ESM adapter backlog is
closed. It does not mean every classic DOM mount has been deleted; the
production bootstrap still preserves the classic business runtime while Stage E
startup/cache/viewport decisions are owned by Vite-built ESM plans.

## Non-Negotiable Boundary

Production cutover required the Owner's exact approval text:

```text
批准 Home AI Vite 生产切换：允许创建生产 cutover 改动，并通过 Mac central deploy lane 部署和读回。
```

That approval was provided and the cutover was deployed through the Mac central
deploy lane. Future production shell/cache changes still require the same
bounded source validation, deploy-lane routing, production readback, and
source/deploy rollback evidence. Do not bypass Classic override rejection
validation or the cutover readback validator when changing shell startup
behavior.

## Current Completed Surface

The completed ESM surface is broad but still adapter-based. The important
completed groups are:

- Vite app preview host and runtime facade;
- runtime state event bus;
- Owner System Console, AI Ops feedback, PWA push status, dialog sheet, toast
  status, document preview, navigation shell, message action panel, plugin host,
  chat runtime, voice input status, and related model islands;
- many classic adapters now import pure ESM model/controller slices from
  `public/vite-islands/...` while the production boot chain remains classic;
- `public/app-automation-controller-ui.js` now delegates request/cache/status
  planning to `src/vite-islands/automation-controller/model.mjs`;
- `public/app-kanban-core-ui.js` now delegates kanban card type, permission,
  cache/status, and result-text planning to
  `src/vite-islands/navigation-shell/kanban-todo-core-model.mjs`;
- `public/app-action-inbox-ui.js` now delegates label/filter/deep-link,
  deliverable, request-classification, and task-card diagnostic planning to
  `src/vite-islands/navigation-shell/action-inbox-model.mjs`.
- `public/app-learning-growth-controller.js` now delegates learner scope,
  request params, reset-state patches, and learning payload planning to
  `src/vite-islands/navigation-shell/learning-growth-controller-model.mjs`.
- `public/app-kanban-card-actions-ui.js` now delegates action request, todo
  creation payload, learning-growth progress, and feedback-message planning to
  `src/vite-islands/navigation-shell/kanban-card-actions-model.mjs`.
- `public/app-runtime-facade-ui.js` now delegates pure compatibility planning
  for native-shell params, native share counts, search params, scoped storage
  keys, route snapshots, and facade snapshots to
  `src/vite-islands/navigation-shell/runtime-facade-compat-model.mjs` without
  changing synchronous classic facade initialization.
- `public/app-learning-native-growth-submission-controller.js` now delegates
  learning-growth stats, draft storage keys/payloads, structured answer
  capture, and submission/reflection completion text planning to
  `src/vite-islands/navigation-shell/learning-native-growth-submission-model.mjs`.
- `public/app-kanban-learning-panel-ui.js` now delegates learning-growth label
  and submission-text planning, answer draft key/fingerprint/answer
  normalization, and learning-guidance key/payload/answer planning to
  `src/vite-islands/navigation-shell/kanban-learning-panel-model.mjs`.
- `public/app-automation-ui.js` now delegates view-mode flags, search
  placeholders, new-thread control state, legacy view redirects, and automation
  route load options to
  `src/vite-islands/navigation-shell/automation-view-model.mjs`.
- `public/app-kanban-actions-ui.js` now delegates pure event state planning for
  composer draft storage, composer mode switches, document removal, Kanban tab
  selection, story expansion, quiz/exam answer patches, and quiz/exam step
  navigation to `src/vite-islands/navigation-shell/kanban-actions-model.mjs`.
- `public/app-workspace-admin-ui.js` now delegates Workspace access display
  rows, binding chips, runtime model/family/reasoning option plans, Gateway
  Worker input values, and MoA preset text planning to
  `src/vite-islands/navigation-shell/workspace-admin-model.mjs`.
- `public/app-kanban-study-actions-ui.js` now delegates reading submission
  feedback/request payloads, reading quiz completion/result planning, and
  assessment exam/result planning to
  `src/vite-islands/navigation-shell/kanban-study-actions-model.mjs`.
- `public/app.js` now delegates initial preference validation, Kanban composer
  mode/reasoning/max-parallel planning, default Kanban study/assessment drafts,
  programming assessment conversion, workspace id list parsing, and binding
  preview text planning to
  `src/vite-islands/navigation-shell/app-bootstrap-model.mjs` while retaining
  classic startup order, state ownership, localStorage access, DOM rendering,
  and production shell ownership.
- `public/app-kanban-render-ui.js` now delegates Kanban composer message,
  plan-draft card/dependency/status, reasoning option, multi-agent control,
  composer progress, and composer mode text planning to
  `src/vite-islands/navigation-shell/kanban-render-model.mjs` while retaining
  DOM rendering, escaping, focus restoration, timers, and classic state
  ownership.
- `public/app-learning-growth-ai-controller.js` now delegates learner request
  body/scope keys, AI recommendation request bodies, latest-summary params and
  normalization, friendly error text, progress timer plans, recommendation
  lookup, and draft request bodies to
  `src/vite-islands/navigation-shell/learning-growth-ai-model.mjs` while
  retaining API calls, timers, state mutation, rendering, and event binding.
- `public/app-automation-actions-ui.js` now reuses the Automation controller
  ESM owner and delegates create/edit/pause/delete/update state and request
  planning to `src/vite-islands/automation-controller/model.mjs` while
  retaining DOM form reads, API calls, button disabled state, rendering, and
  automation reload side effects.
- `public/app-kanban-story-core-ui.js` now delegates story case
  expand/toggle/render state, swipe state, detail-load queue/timer planning,
  assessment config cleanup, and assessment template display text to
  `src/vite-islands/navigation-shell/kanban-story-core-model.mjs` while
  retaining HTML rendering, escaping, helper calls, state mutation, timers, and
  detail API side effects.
- `public/app-shell-ui.js` now delegates single-window task-group detection,
  numeric clamping, config-list normalization, workspace default request/patch
  planning, elapsed-duration labels, and message timestamp labels to
  `src/vite-islands/navigation-shell/app-shell-model.mjs` while retaining DOM
  queries, API calls, timers, HTML escaping, TaskArtifactHelpers wrappers, and
  classic global publication.
- `public/app-kanban-list-ui.js` now delegates Kanban tab counts, card view
  models, output de-duplication/filtering, auto-detail-load eligibility,
  process rows, and detail report state to
  `src/vite-islands/navigation-shell/kanban-list-model.mjs` while retaining
  HTML rendering, escaping, cover image fetch/object URL handling, state reads,
  and classic helper calls.
- `public/app-learning-reading-ui.js` now delegates reading labels, next-card
  selection, workflow state, quiz state, recorder controls, and submission
  panel state to
  `src/vite-islands/navigation-shell/learning-reading-model.mjs` while
  retaining HTML rendering, escaping, injected learning guidance/review blocks,
  recorder playback markup, and classic UMD publication.
- `public/app-learning-growth-teaching-controller.js` now delegates teaching
  step validation, draft patching, selected task lookup, teaching-check request
  planning, experience-signal guards, and stage-assessment challenge request
  planning to
  `src/vite-islands/navigation-shell/teaching-controller-model.mjs` while
  retaining DOM event binding, API execution, toast feedback, render refreshes,
  and classic global publication.
- `public/app-kanban-recorder-ui.js` now delegates recorder extension/filename
  planning, elapsed-duration labels, permission error text, recorder status
  text, finish/error patches, and submitted-recording cleanup checks to
  `src/vite-islands/navigation-shell/kanban-recorder-model.mjs` while retaining
  MediaRecorder access, microphone stream handling, Blob/File construction,
  object URL cleanup, DOM status updates, timers, API submission, and render
  refreshes.
- `public/app-kanban-story-helpers.js` now delegates pure story helper plans
  including compact text, timestamps, status normalization, parsed plan
  descriptions, case info, story keys, status summaries, and archive
  conclusions to
  `src/vite-islands/navigation-shell/kanban-story-helpers-model.mjs` while
  retaining UMD/CommonJS compatibility and synchronous fallback helper exports.
- `public/app-learning-program-ui.js` now delegates pure learning program
  status, reward, draft, source-reference, focus, learner-facts, and percentage
  plans to `src/vite-islands/navigation-shell/learning-program-model.mjs` while
  retaining HTML rendering, native growth submission rendering, UMD/CommonJS
  compatibility, and synchronous fallback helpers.
- `public/app-api-client.js` now delegates pure header normalization, request
  option planning, client-version response projection, HTTP error projection,
  and timeout error projection to
  `src/vite-islands/navigation-shell/api-client-model.mjs` while retaining
  fetch execution, Access Key cookie sync, response body parsing,
  AbortController/timer ownership, 401 callbacks, UMD/CommonJS compatibility,
  and synchronous fallback helpers.
- `public/app-learning-growth-reward-controller.js` now delegates pure reward
  series id normalization, max-coin validation, status text, and PATCH request
  planning to
  `src/vite-islands/navigation-shell/learning-growth-reward-controller-model.mjs`
  while retaining DOM event binding, API execution, feedback node updates,
  learning coin refreshes, and classic global publication.
- `public/app-learning-growth-settings-controller.js` now delegates pure
  settings-task open/close state patches and mobile swipe-back decision plans
  to
  `src/vite-islands/navigation-shell/learning-growth-settings-controller-model.mjs`
  while retaining DOM event binding, class/style updates, render refreshes,
  `isMobileLayout()` integration, and classic global publication.
- `public/app-learning-coins-ui.js` now delegates pure coins/reward view-model
  planning, including coin and RMB labels, reward cards, ledger/redemption rows,
  daily bars, reward progress, growth summary, and subsystem shell labels, to
  `src/vite-islands/navigation-shell/learning-coins-model.mjs` while retaining
  HTML rendering, escaping, time formatting injection, state reads, and
  CommonJS/UMD compatibility.
- `public/app-learning-growth-ui.js` now delegates pure growth dashboard
  planning, including status labels, task counts, coin averages, board lane/card
  plans, owner summary metrics, mastery labels, reward task series, and top
  summary metrics, to `src/vite-islands/navigation-shell/learning-growth-model.mjs`
  while retaining HTML rendering, escaping, injected Program/Coins UI calls,
  state reads, history/task focus routing, and CommonJS/UMD compatibility.
- `public/app-learning-growth-reflection-ui.js` now delegates pure reflection
  feedback, status, and recorder control planning to
  `src/vite-islands/navigation-shell/learning-growth-reflection-model.mjs`
  while retaining HTML rendering, escaping, recorder state reads, classic helper
  calls, and CommonJS/UMD compatibility.

The current generated backlog is the authoritative per-file inventory. This plan
uses that backlog for sequencing and acceptance expectations.

## Remaining Work

### Generated Backlog

There are no pending entries in the generated static-client ESM migration
backlog. The classic adapter ownership burn-down is complete for the generated
static-client inventory.

New classic static scripts must not be added without a matching ESM
model/controller owner and backlog completion marker. Existing classic files
may continue as thin adapters while the production bootstrap preserves the
classic business runtime.

### Stage E - Full Shell And Cache Owners

Stage E adapter ownership is now closed. These former pending files now import
Vite-built ESM plans/controllers:

1. `public/app-wire-start-ui.js` -> `shell-start-model`
2. `public/app-mobile-layout-ui.js` -> `mobile-layout-model`
3. `public/fixed-viewport.js` -> `fixed-viewport-controller`
4. `public/app-start.js` -> `shell-start-model`

These are still high-blast-radius surfaces because they own shell startup,
viewport stability, service-worker/cache interaction, and route restoration.
Future work should reduce the remaining classic DOM mounting surface in small
validated slices rather than deleting the ordered script chain in one step.

## Slice Template

Each ESM conversion slice should follow this shape:

1. Identify one classic file or tightly coupled group from the pending backlog.
2. Extract pure planning/state logic into `src/vite-islands/<surface>/...mjs`.
3. Build the matching public artifact through `npm run build:vite`.
4. Adapt the classic file to import the ESM artifact with an existing local
   pattern such as `importXModel()` / `currentXModel()`.
5. Keep DOM mutation, browser APIs, timers, and classic global publication in
   the classic adapter unless the target Vite island owns the full surface.
6. Add focused tests for the pure ESM module and for the classic adapter bridge.
7. Regenerate or verify the backlog if completion evidence changes:
   `npm run --silent plan:vite-esm -- --json`.

## Per-Slice Validation

Minimum validation for an ordinary ESM adapter slice:

```sh
npm run --silent build:vite
npm run --silent plan:vite-esm -- --json
npm run --silent check:vite-readiness
node tests/<focused-vite-model-test>.test.js
node tests/<focused-classic-adapter-test>.test.js
git diff --check
```

For high-risk workflow files, also run:

```sh
npm run --silent verify:vite-dev
npm run --silent packet:vite-dev
```

If the slice touches composer send, attachments, plugin iframes, document
preview, voice input, startup, route restoration, cache, or mobile viewport
behavior, include:

```sh
npm run --silent smoke:vite-dev-user-journeys
node tests/vite-dev-preview-routes-smoke.test.js
```

## Development Acceptance Gate

After a batch of slices, the development gate remains:

```sh
npm run --silent verify:vite-dev
npm run --silent packet:vite-dev
npm run --silent audit:vite-goal
```

Expected pre-approval state:

- `verify:vite-dev` is `ok=true`;
- `packet:vite-dev` is `ok=true`;
- `audit:vite-goal` remains `goal_incomplete` because production approval and
  readback are not present.

Do not treat the final `goal_incomplete` result as a development failure. It is
the correct fail-closed production boundary before Owner approval.

## Cutover Sequence After Owner Approval

Only after the exact Owner approval text is provided:

1. Create a separate fail-closed cutover source change.
2. Re-run planned source validation, including:
   `npm run --silent verify:vite-dev`,
   `npm run --silent validate:vite-cutover-source`, and focused shell/cache
   tests.
3. Convert the cutover handoff packet into a real deploy-lane card.
4. Deploy through the central Mac deploy lane.
5. Run bounded production readback with
   `npm run --silent validate:vite-cutover-readback -- --readback-json <file>`.
6. Keep source/deploy rollback planning explicit and tested through bounded
   metadata; do not add a same-runtime Classic fallback.

## Current Next Recommendation

The generated adapter backlog no longer has a pending source slice. The next
architecture step is a separate full-shell retirement plan: prove that the Vite
bootstrap can mount the remaining classic business runtime through imported
owners, then retire individual classic DOM adapters only when parity tests and
source/deploy rollback/readback are in place.
