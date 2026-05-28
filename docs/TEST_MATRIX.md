# Hermes Mobile Test Matrix

Last updated: 2026-05-28.

Use this matrix to pick focused tests before broader gates. Always add syntax checks for touched JS/Python/PowerShell files.

## Full Gates

- Broad product gate: `npm.cmd run productization:check`
- Standard test gate: `npm test`
- Architecture boundary: `node tests\architecture-refactor-boundary.test.js`
- Privacy scan: `node scripts\privacy-scan.js --all-files`
- Diff hygiene: `git diff --check`

Use full gates before public release, broad shared-service/runtime changes, permission/security/persistence changes, or when requested.

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

H1 includes Growth learning cards, Action Inbox passive notifications,
Automation/Cron execution, Gateway toolset selection/run telemetry,
cross-shell production operations, Web Push click routing,
permission/workspace boundaries, and Public Export/Release.

Gateway Pool startup/provisioning harnesses must cover stable manifest
profile/port mapping. `start-low-gateways.sh` and `configure-low-gateways.sh`
must consume explicit `gateway-pool-manifest.json` `profile`/`port` pairs for
`lowgw*` and `grokgw*`, and workspace provisioning must append new personal
`lowgwN` entries after existing low/Grok workers without moving `grokgw1`.
Deleting a workspace must not silently delete profile-local Gateway state;
profile retirement needs an explicit backup/cleanup flow. Focused checks:
`node tests\startup-scripts.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`, and
`node tests\cross-shell-command-harness.test.js`.

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
contract. Do not hard-prune callable toolsets before a first-round model
selection. A first round may use a compact capability catalog, and the
execution round may expand only the selected authorized toolsets, but the
model must have an explicit escalation path for additional authorized toolsets.
The harness must cover selected narrow execution, allowed escalation, denied
blocked-toolset escalation, invalid selection fallback, and telemetry for
model-selection start/end, tool-call start/end, and final-message start/end.
Selector failure is explicitly recoverable: timeout, invalid JSON, missing
runner, or unauthorized selections must fall back to the originally authorized
toolset list. Permission and toolset choice must share the same model-side
preflight. The selector should use a ChatGPT low-cost model, a bounded timeout
large enough for reliable completion, and best-effort cancellation when a
selector run id is known. Do not add local natural-language permission routing
before the model. If the model-side preflight returns a
`HERMES_PERMISSION_APPROVAL_REQUIRED`-style decision, execution must not start
until Owner approval.

Product-specific MCP capabilities are part of the same H1 contract. Wardrobe
ingestion/recommendation/writeback tests must assert that authorized
wardrobe-capable runs keep `wardrobe` in the model-selection catalog and can
select `wardrobe` with `vision`/`file` for image-backed writeback and readback
verification. A run that has a wardrobe-capable Gateway profile but lacks
`wardrobe` in `access_policy_context.allowed_toolsets` should be treated as a
Mobile policy/routing regression, not as a missing Gateway MCP.
Wardrobe-bound directory projects must first add `wardrobe` in the access
policy catalog; selector routing alone is insufficient because it cannot grant
toolsets absent from `allowed_toolsets`.
If a topic is already bound to a wardrobe/closet directory, every AI run in
that topic must keep authorized `wardrobe`, `vision`, and `file` in the
suggested model-selection catalog by default, even when the latest message is
semantically light. This is still a policy-bounded suggestion: the router must
not grant toolsets that the run policy did not already authorize.
The execution policy must also preserve the wardrobe companion set after
model-first narrowing. If the suggested set contains authorized
`wardrobe`, `vision`, and `file`, a selector result of `wardrobe,file` must
still execute with `wardrobe,vision,file`; otherwise the main run will be forced
into an avoidable `HERMES_TOOLSET_ESCALATION_REQUIRED` loop.
The common web companion set follows the same rule: `web`, `search`, and
`browser` should be suggested, retained, and escalation-retried together when
authorized, while the negative harness must prove `browser` is not granted if
the run policy did not authorize it.

The selector is an internal JSON-only preflight. Tests must assert that selector
requests disable tool calls, that live selector probes do not contain tool-role
messages, and that repeated JSON candidates from streamed Responses events are
parsed as a valid final decision rather than `invalid_json`. Tens-of-seconds
latency is acceptable if the selector reliably returns; latency/cost claims must
verify the actual Gateway session or worker log model instead of trusting only
the request body's `model` field. A successful model-first selector decision must
also suppress a second permission-classifier pass before execution: the main
execution prompt must not ask the model to load the permission-boundary Skill
again or call `skill_view` for
`productivity/hermes-mobile-permission-boundary-check`, and UI status rows should
describe permission/toolset selection as one combined preflight.

Run status harnesses must cover no-first-byte visibility. If the execution
stream receives no Gateway event after the configured warning window, the
system may store a diagnostic warning event without refreshing the real Gateway
`lastEventAt` used by liveness/stale decisions. Harness coverage should assert
visible first-stream-event, first-text-output, liveness stale, and stream-failed
statuses. Run-progress UI must not render `run.liveness_warning` as a visible
row; only stale/start-timeout/stream-failed states should consume visible
status space.
Stream-closed-without-terminal coverage is required: if streamed text already
arrived, Mobile must emit `run.stream_closed_without_terminal`, synthesize
completion from the accumulated content, and avoid failed Web Push / failed
external delivery. If no model output arrived, Mobile should release the queue
without showing the raw `Hermes stream ended without a terminal completion
event` string.
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
Long-reply jump control harnesses must cover terminal DOM replacement and
historical scrolling: arrow visibility recalculation must resolve the current
conversation/message node when the queued callback executes, fall back from a
detached pre-terminal node to the live conversation, and run a short delayed
settle pass after final markdown/layout replacement. The eligibility check must
also cover one-screen overflow by measured rendered height and viewport
geometry, not by the 6000-character rich-render threshold. If a reply footer is
visible, the up/start arrow must stay inline beside the Usage/Skill/status chips;
floating is only allowed while the footer is outside the viewport. Viewport
harnesses must also cover orientation recovery: after landscape/portrait changes,
the client must clear stale keyboard viewport state when the composer is no
longer actually focused, clear temporary conversation scroll-layer reset state,
recompute bottom navigation reservation, and recalculate long-reply arrows.

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
Foreground restore tests must also assert `handleAppForegrounded()` reapplies
the saved theme preference before refresh/render work, so a light-mode user does
not briefly see a dark-mode repaint when returning to the PWA.

Growth card detail/share UI tests must cover the H2 projection contract:
teaching-card and formal-card details render a `data-learning-growth-card-share`
control, use the local image-share pipeline with Web Share file payloads plus
clipboard/download fallback, and keep the detail page as a single-column
reading shell rather than nested table-like card grids. Assertions should cover
`app-learning-growth-task-ui`, `app-learning-program-ui`, `app-share-image-ui`,
and CSS rules that prevent card detail sections and structured questions from
compressing mobile text width.

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

Toolset escalation and retry harnesses must assert that
`HERMES_TOOLSET_ESCALATION_REQUIRED` is stripped from visible chat content,
stored as bounded `toolsetEscalationRequired` metadata, and projected as
`run.toolset_escalation_required`. When the requested toolsets are omitted but
authorized, the same assistant message must automatically retry with the
previous selected toolsets plus the requested toolsets, skip a second selector
pass, emit `run.toolset_escalation_retrying`, and avoid terminal delivery until
that retry finishes. A later manual retry/rerun message should also reuse
recent task context or stored escalation metadata to suggest the needed
authorized toolsets instead of treating retry as a plain probe, including when
the relevant task context is in the same `taskGroupId` but no longer in the
global message tail.
Streaming-delta tests must also cover marker suppression before completion so
the raw escalation marker cannot appear briefly in the visible receipt while the
retry is being prepared.

Run tool-budget harnesses must prevent both extremes: runaway Web search loops
must abort when the configured cap is exceeded, but the default cap must not
kill an ordinary user-requested news/search run on the third search call. The
instruction harness must also assert that web/search-enabled runs tell the model
the configured Web-search budget before tool use.

Explicit user-requested web/X search uses the higher explicit-search budget and
quality-first instruction. Harness coverage must assert that explicit
`web_search` / `x_search` runs tell the model to prioritize source quality,
meaningful coverage, and verifiable evidence over small time/token savings,
while ordinary incidental web-enabled runs keep the normal cap.

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
operation has started. UI fallback tests must assert unnamed function events are
omitted instead of rendering generic labels such as `Function` or duplicated
labels such as `Function Function`.
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
frontend scroll target consumption after chat/topic messages render.

For secondary-page return bugs, the harness must also cover async race
conditions: a late response from the page being left must not repaint that page
after the return target has already been restored.
Topic-list harnesses must cover retired Kanban case-topic cleanup: after the
Kanban card snapshot confirms a bound case id is missing or fully archived, that
old case-topic group must not remain visible in the root topic list. The same
filter must apply to first-party topic groups and shared case-topic groups.

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
| API registry/dispatcher | `node tests\api-route-registry.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js` |
| Multi-user/task platform | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\conversation-history-service.test.js`, `node tests\action-inbox-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Auth/workspace/access keys | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\workspace-public-projection-service.test.js` |
| Gateway run lifecycle | `node tests\gateway-run-model-toolset-selection-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\gateway-run-stream-service.test.js`, `node tests\gateway-run-lifecycle-service.test.js`, `node tests\gateway-run-queue-service.test.js`, `node tests\run-liveness.test.js`, `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js` |
| Chat context/compaction | `node tests\conversation-history-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\topic-context-compaction-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\mobile-sqlite-store.test.js` |
| Gateway Pool/scripts | `node tests\gateway-pool-provider.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\cross-shell-command-harness.test.js`, `node tests\hermes-mobile-image-plugin.test.js` |
| ChatGPT Pro | `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\owner-elevation-routing-service.test.js`, `node tests\thread-message-create-service.test.js` |
| Grok/model routing | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js` |
| Web Push | `node tests\web-push-delivery-service.test.js`, `node tests\push-api-routes.test.js`, `node tests\task-list-ui.test.js`, `node tests\same-window-navigation-harness.test.js` |
| Static client/UI shell | `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js`, `node tests\keyboard-viewport-ui.test.js`, `node tests\viewport-scroll-ui.test.js`, `node tests\same-window-navigation-harness.test.js` |
| Action Inbox | `node tests\action-inbox-service.test.js`, `node tests\action-inbox-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\task-list-ui.test.js`, `node tests\web-push-delivery-service.test.js` |
| Directory/files/artifacts | `node tests\directory-browser-api-routes.test.js`, `node tests\directory-mutation-api-routes.test.js`, `node tests\directory-share-api-routes.test.js`, `node tests\file-artifact-api-routes.test.js`, `node tests\file-artifact-access-service.test.js` |
| Skill permissions/details | `node tests\skill-detail-provider.test.js`, `node tests\skill-analysis-service.test.js`, `node tests\resource-api-routes.test.js`, `node tests\link-skill-profile-store.test.js` |
| Automation/Cron | `node tests\automation-api-routes.test.js`, `node tests\automation-provider.test.js`, `node tests\cron-bridge.test.js`, `node tests\local-automation-bridge-service.test.js` |
| Weixin ingress/delivery | `node tests\weixin-api-routes.test.js`, `node tests\weixin-ingress-event-service.test.js`, `node tests\weixin-ingress-provider.test.js`, `node tests\weixin-outbound-delivery-service.test.js`, `node tests\weixin-runtime-composition-service.test.js` |
| Group chat | `node tests\single-window-group-chat-api-routes.test.js`, `node tests\group-chat-ui.test.js`, `node tests\group-chat-shared-attachment-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Runtime SQLite/state | `node tests\mobile-sqlite-store.test.js`, `node tests\runtime-state-repository.test.js`, `node tests\runtime-state-store-service.test.js`, `node tests\runtime-state-persistence-service.test.js`, `node tests\runtime-state-normalization-service.test.js` |
| Growth board/program/task | `node tests\learning-program-api-routes.test.js`, `node tests\learning-program-service.test.js`, `node tests\learning-program-publish-service.test.js`, `node tests\learning-program-repository.test.js`, `node tests\learning-growth-jit-task-service.test.js`, `node tests\learning-growth-service.test.js`, `node tests\learning-growth-board-projection-service.test.js`, `node tests\learning-growth-teaching-card-services.test.js`, `node tests\learning-growth-card-api-routes.test.js` |
| Growth submissions/evaluation queue | `node tests\learning-growth-submission-service.test.js`, `node tests\learning-growth-task-evaluation-service.test.js`, `node tests\learning-growth-task-interaction-state-service.test.js`, `node tests\learning-growth-task-feedback-service.test.js` |
| Growth mastery/evergreen | `node tests\learning-growth-mastery-profile-service.test.js`, `node tests\learning-growth-mastery-repository.test.js`, `node tests\learning-growth-next-card-strategy-service.test.js`, `node tests\learning-growth-sequence-service.test.js` |
| Growth frontend | `node tests\app-learning-growth-ui.test.js`, `node tests\app-learning-growth-task-ui.test.js`, `node tests\app-learning-program-ui.test.js`, `node tests\app-learning-native-growth-submission-controller.test.js`, `node tests\task-list-ui.test.js` |
| Learning rewards/coins | `node tests\learning-reward-settlement-service.test.js`, `node tests\learning-coin-service.test.js`, `node tests\learning-coin-api-routes.test.js` |
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

## Production Verification Tiers

- Static-only change: sync static/test files, run syntax/focused UI tests in production app directory, smoke `/api/client-version`.
- Listener code change: check `/api/status?detail=1` first, backup, sync, run focused tests, listener-only restart, smoke status.
- Gateway plugin/profile/schema/startup change: backup, sync, run focused checks, restart Gateway Pool, smoke worker health. ChatGPT Image 2 plugin changes must also run `node tests\hermes-mobile-image-plugin.test.js` and a bounded direct low Gateway `chatgpt_image_edit` smoke.
- Data repair: backup data first, apply bounded repair, verify metadata/API results, avoid restart unless runtime memory could overwrite the repair.
