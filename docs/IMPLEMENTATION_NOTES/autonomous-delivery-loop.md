# Autonomous Delivery Loop Implementation

Status: Phase 2 implemented for deterministic intent intake, persisted
coordinator ledger, Owner Action Inbox start request, manual non-high-risk
task-card dispatch, verification, repair, and Owner-gated deployment/readback
coordination, per-slice AI Ops required-check/evidence projection,
case-ledger idempotency, Worker/deploy lane scheduling policy, return-card
Watchdog projection, routing-decision gate evidence before Worker dispatch,
source-side main-thread routing preflight Harness, evidence-ledger
verification, central deploy-governance metadata aggregation, hash-only artifact pointers, and Owner-visible
final report projection after closure.

## Objective

Autonomous Delivery Loop turns user requests into a tracked delivery workflow
where Home AI asks for only necessary user decisions and otherwise coordinates
work through owning threads, validation, deployment, audit, repair, and final
closure.

The platform contract is
`docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md`.

Loop Engineering is the role-loop implementation plan for repeated
requirements -> implementation -> product audit workflows. See
`docs/IMPLEMENTATION_NOTES/loop-engineering.md`. Long-term `@loop` triggering
and generic role orchestration belong to Codex Mobile. Home AI uses this
Autonomous Delivery substrate as the Home AI domain adapter, status/evidence
projection, and platform capability surface; it must not introduce a separate
plugin-loop database or scheduler thread.

For source-main-thread `@loop`, the source thread owns requirements analysis
locally. This covers Xcode main-thread Loop requests for native-shell work,
plugin main-thread Loop requests for plugin work, and Home AI main-thread Loop
requests for Home AI-owned work. Codex Mobile must not dispatch a same-thread
requirements task card; it should store that role as local Loop state and route
only implementation, audit, repair, or deploy/readback task cards whose
selected target thread differs from the source thread. If role lanes cannot be
selected or provisioned safely, the Loop remains blocked with bounded routing
metadata.

## Phase 1: Intent Intake

Phase 1 implements the first safe step only. It normalizes the user's request
into a structured delivery intent without mutating source, production, runtime
stores, plugins, databases, or task-card state.

Implementation files:

- `adapters/autonomous-delivery-intake-service.js`
- `scripts/autonomous-delivery-loop.js`
- `tests/autonomous-delivery-intake-service.test.js`

CLI:

```bash
node scripts/autonomous-delivery-loop.js intake \
  --text "repair Finance report UI and deploy" \
  --json
```

The output includes:

- `objective`: bounded normalized user request;
- `mode`: `delivery`, `audit`, `research`, or `deployment`;
- `risk`: `low`, `medium`, or `high`;
- `targetWorkspaces`: detected Home AI or plugin workspace ids and paths;
- `userDecisionGate`: missing requirement, UI/product, or high-risk approvals;
- `autonomyPolicy`: what the loop may continue automatically;
- `phases`: ordered loop phases;
- `taskSlices`: candidate work items and owner layers;
- `privacyBoundary`: data that may or may not be stored;
- `blockedIf`: precise missing-decision blockers.

## Classification Rules

Phase 1 intentionally uses bounded deterministic classification, not a hidden
model call:

- audit wording routes to `audit`;
- feasibility/research wording routes to `research` unless implementation or
  deployment is also requested;
- deploy/production wording routes to `deployment` when no implementation work
  is requested;
- otherwise the request routes to `delivery`;
- UI, copy, visual, layout, and interaction wording opens a
  `ui_product_decision` gate only for delivery/implementation work. Audit and
  research requests may discuss UX without requiring a user decision before
  dispatch;
- deployment, data migration, device control, secrets, and production wording
  raise high-risk gates;
- known plugin names map to target workspaces; otherwise the default workspace
  is Home AI.

Deterministic intake is not expected to fully understand detailed product
requirements. It only decides the first coordinator state and stop conditions.
Later phases may use product docs, task cards, models, audits, and UI reviews
to deepen the work.

## Phase 2: Coordinator Ledger And Manual Start

Phase 2 persists delivery cases as bounded metadata and creates an Owner Action
Inbox item instead of dispatching work automatically. The Owner must tap the
Inbox action to start the case. At start time the coordinator dispatches only
non-high-risk implementation/research slices to known Home AI/plugin workspaces
through the existing Codex Mobile task-card transport. High-risk cases remain
manual-only.

Implementation files:

- `adapters/autonomous-delivery-case-ledger-service.js`
- `adapters/autonomous-delivery-coordinator-service.js`
- `adapters/autonomous-delivery-routing-decision-service.js`
- `adapters/main-thread-routing-preflight-service.js`
- `adapters/central-deploy-governance-service.js`
- `adapters/task-card-dispatch-idempotency-service.js`
- `adapters/worker-lane-scheduler-service.js`
- `adapters/return-watchdog-service.js`
- `adapters/source-return-integration-watchdog-service.js`
- `adapters/source-return-follow-up-action-service.js`
- `server-routes/autonomous-delivery-api-routes.js`
- focused SQLite helpers in `adapters/mobile-sqlite-store.js`
- Action Inbox create/start/verification surface in
  `public/app-action-inbox-ui.js`
- API composition in `server-routes/mobile-api-composition.js`
- dispatcher registration in `server-routes/mobile-api-dispatcher.js`
- route inventory entries in `adapters/api-route-inventory.js`
- `scripts/main-thread-routing-preflight.js`
- `tests/autonomous-delivery-case-ledger-service.test.js`
- `tests/autonomous-delivery-coordinator-service.test.js`
- `tests/autonomous-delivery-routing-decision-service.test.js`
- `tests/main-thread-routing-preflight-service.test.js`
- `tests/central-deploy-governance-service.test.js`
- `tests/task-card-dispatch-idempotency-service.test.js`
- `tests/worker-lane-scheduler-service.test.js`
- `tests/return-watchdog-service.test.js`
- `tests/source-return-integration-watchdog-service.test.js`
- `tests/source-return-follow-up-action-service.test.js`
- `tests/autonomous-delivery-api-routes.test.js`
- `tests/app-action-inbox-ui.test.js`

Persisted tables:

- `autonomous_delivery_cases`
- `autonomous_delivery_slices`
- `autonomous_delivery_events`

API routes:

- `GET /api/autonomous-delivery/cases`
- `POST /api/autonomous-delivery/cases`
- `GET /api/autonomous-delivery/cases/:caseId`
- `POST /api/autonomous-delivery/cases/:caseId/start`
- `POST /api/autonomous-delivery/cases/:caseId/slices/:sliceId/return`
- `POST /api/autonomous-delivery/cases/:caseId/slices/:sliceId/verification/start`
- `POST /api/autonomous-delivery/cases/:caseId/slices/:sliceId/deployment/start`
- `POST /api/autonomous-delivery/cases/:caseId/slices/:sliceId/repair/start`
- `POST /api/autonomous-delivery/cases/:caseId/close`
- `POST /api/autonomous-delivery/task-cards/:taskCardId/return`
- `POST /api/autonomous-delivery/return-card-events`
- `GET /api/autonomous-delivery/source-return-integrations`
- `POST /api/autonomous-delivery/source-return-integrations`

Owner start behavior:

- creation through `POST /api/autonomous-delivery/cases` or the Action Inbox
  `新建交付 Loop` form stores the case/slices and opens an Action Inbox item
  with `sourceType=autonomous_delivery`;
- case creation derives a stable `idempotencyRef` from source request id,
  diagnostic case id, workflow id, task-card id, event hash, source signature,
  or a bounded fallback signature. If an equivalent open case already exists,
  the coordinator records `case_duplicate_observed`, stores bounded duplicate
  evidence, and returns the existing case without creating another Owner
  approval row, task-card request, or Web Push notification;
- the Inbox row exposes `开始执行` or `确认并开始`;
- Owner may attach an optional prompt before dispatch;
- the coordinator records `dispatching`, `dispatched`, and terminal return
  states per slice;
- each implementation, verification, deployment/readback, and repair slice
  stores a bounded `aiOps` projection generated through the AI Operations
  Control Plane. The projection includes harness class, selected modules,
  required docs, required checks, root-cause/fallback governance, visual/deploy
  gates, and blocked-if reasons;
- each started implementation/research slice also stores a bounded
  `routingDecision` projection before task-card transport is attempted. The
  decision records `delegate_worker`, `delegate_worker_loop`,
  `delegate_plugin_requirements`, `delegate_plugin_loop`,
  `delegate_deploy_lane`, `delegate_audit_lane`, or `blocked_or_redirected`,
  the target role/card kind, Codex Mobile thread-lifecycle requirement,
  heartbeat requirement, conflict rule, and bounded reasons. Task-card bodies
  include the same compact decision block so target Workers understand why they
  received the slice. This is the Harness-backed guard that prevents Home AI
  main thread from doing non-trivial work inline without a recorded routing
  decision;
- when `routingDecision.codexMobileThreadLifecycle.required=true`, the
  coordinator calls Codex Mobile's `/api/at-loop/thread-lifecycle` before
  task-card dispatch. Home AI maps Worker/Loop requirements into a bounded
  `resolve` request and stores only safe lifecycle metadata: action, role,
  workspace cwd, error code, and resolved thread id/title/cwd/status/purpose.
  If the lifecycle result is missing, unavailable, or non-deliverable, the
  slice becomes `dispatchStatus=failed` and no task card is sent. Successful
  lifecycle resolution sets the exact target thread id on the task card so
  dynamic Worker lanes and compact Loop lanes do not depend on stale titles;
- task cards include the selected AI Ops required docs/checks so target threads
  can return evidence against them;
- return state can be recorded by explicit `caseId`/`sliceId` or by the
  original dispatched `taskCardId`, so a future Codex Mobile return observer can
  update the ledger without manually resolving slice ids;
- every dispatched card must carry its own task-card id after transport
  creation when available, plus source task-card/request id and workflow id
  when present. The original dispatched `taskCardId` is the primary return
  correlation key; thread titles, workspace paths, and card titles are
  secondary evidence only;
- return-card Watchdog state is part of the same bounded ledger. Stale
  non-terminal dispatches become `dispatchStatus=return_stale`; this marks the
  gap visible for Owner/coordinator action but does not retry, redispatch, or
  close the slice;
- return recording can preserve structured bounded evidence metadata such as
  check records and commands run. Secret-looking command or metadata values are
  redacted before the evidence projection is stored;
- return recording can transiently verify an AI Ops evidence ledger path when a
  target thread includes it in bounded metadata. The coordinator stores only
  pass/fail state, record count, bounded issues, selected required
  kind/status/commit-prefix expectations, and hash labels. Raw paths, URLs,
  private filenames, prompts, task-card bodies, screenshots, provider payloads,
  and long logs are not persisted;
- bounded return-card event intake accepts terminal transport events with the
  original task-card id, return-card id, terminal status, short summary, and
  safe thread/workflow metadata. It does not store raw card body, prompts,
  secrets, uploads, screenshots, or long logs;
- terminal returns also create a separate bounded source integration projection
  with `sourceReturnIntegration.status=pending`. This state means the return
  receipt has arrived and the source scheduler still needs to mark an
  integration disposition after projecting it into the coordinator ledger,
  handoff, or next-step queue. The projection stores only task-card id,
  return-card id, case/slice ids, terminal status, timestamps, issue code,
  recommended action, and counts;
- every terminal return integration also carries a bounded
  `sourceActivation` receipt. This receipt is required even when the source
  thread's latest state is `completed`, `resting`, hidden, or otherwise not the
  active bottom turn. The receipt stores source-thread id/status when supplied,
  task-card/return-card ids, issue codes, and the required owner-visible
  projection action. It does not store raw task-card bodies, private thread
  bodies, prompts, logs, DB rows, screenshots, provider payloads, or endpoint
  bodies. If the integration Watchdog marks the receipt stale, the activation
  code becomes `return_projection_missing_after_terminal_return`;
- if a terminal return contains structured `deployRequest` /
  `followUpRequest` metadata, or bounded markers such as `deploy_needed=true`,
  `deploy_requested`, `follow_up_required`, `blocked_by_deploy_readback`,
  `public_sync_required`, `pr_close_required`, or
  `central_action_required`, the coordinator stores a
  `pendingSourceAction` under `sourceReturnIntegration` and in the bounded AI
  Ops return evidence. Structured metadata has priority over text markers.
  Deploy actions flow into central deploy aggregation, and central Deploy Lane
  dispatch marks the action `resolved`. Blocked or dismissed actions must carry
  a bounded reason. The terminal receipt remains terminal/non-active, while
  `sourceActivation.status=pending_source_action` keeps the source coordinator
  activated until the pending source action is resolved, blocked, or dismissed;
- return integration must be followed by a bounded
  `return_continuation_decision`. A terminal return is not a normal final
  answer until the source scheduler decides whether the original objective is
  satisfied or another dispatch/readback/verification/ownership route is
  required. When the return names a now-available Worker, fixed blocker,
  deploy/readback requirement, missing Harness, or owning-layer redirect, the
  source scheduler must either create the next task card immediately and store
  `continuation_dispatch_card_id`, or record
  `blocked_missing_continuation_dispatch` with the exact missing lane,
  capability, permission, conflict, or evidence. A plain reply that says "now
  this can be dispatched" is not an integration disposition;
- a completed implementation or repair return that does not require
  deployment/readback moves a case into `verification_waiting` and opens an
  Owner Action Inbox `itemType=review` projection with
  `notificationType=autonomous_delivery.verification_required`. This gives
  Owner a visible next-step decision point without automatically running
  verification or audit;
- a completed implementation or repair return that explicitly reports runtime
  or production-path changes without deployment/readback moves the case to
  `deployment_waiting` and opens an Owner Action Inbox review projection with
  `notificationType=autonomous_delivery.deploy_readback_required`. Owner may
  send a deployment/readback card from that projection; dispatch creates a
  separate `deployment_owner` slice and moves the case to
  `deployment_dispatched`;
- completed deployment/readback returns annotate the original implementation or
  repair slice with deployment evidence, then reopen the normal Owner
  verification projection for that original slice;
- Owner may start verification from that review projection. The coordinator
  then creates a separate verification slice, routes the verification card to
  `Plugin Workspace Audit` for plugin/workspace work or `Home AI Platform
  Audit` for Home AI-owned work, completes the review Inbox item, and stores
  the verification task-card id for later terminal return-card correlation;
- verification, deployment/readback, and repair start paths complete their
  Owner review Inbox item only after Codex Mobile task-card transport returns a
  concrete task-card id. A thrown transport exception, routing failure, or
  response with no card id keeps the case in the waiting state, marks the new
  follow-up slice `blocked` with `dispatchStatus=failed`, stores bounded
  `dispatchFailure` metadata, appends the matching `*_dispatch_failed` event,
  and leaves the Owner review item open for retry or rerouting;
- verification, deployment/readback, and repair starts accept bounded Owner
  prompts, but none of those lanes auto-dispatch cards or mutate production
  without Owner action;
- terminal verification return cards are recorded against the verification
  slice by task-card id. A completed verification return moves the case to
  `verified_waiting` only after the implementation/research slices are
  completed and verified. It also creates an Owner Action Inbox closure
  projection with `notificationType=autonomous_delivery.closure_required`;
- failed verification return cards (`blocked`, `redirected`, `rejected`, or
  `partially_completed`) move the case to `repair_waiting` and create an Owner
  Action Inbox repair projection with
  `notificationType=autonomous_delivery.repair_required`. Owner can then send
  a repair card back to the original implementation workspace; dispatch creates
  a separate repair slice and moves the case to `repair_dispatched`;
- Owner closure is a separate action. `POST
  /api/autonomous-delivery/cases/:caseId/close` only closes a
  `verified_waiting` case, records `completed`/`closed_at` in the ledger, and
  creates a bounded Owner Action Inbox final report projection with
  `notificationType=autonomous_delivery.final_report_ready`. That report
  includes slice status, task/return ids, AI Ops required-check summaries, and
  bounded evidence counts plus evidence-ledger verification and hash-only
  artifact pointer counts when available;
- verification returns do not recursively create another verification request
  for the verification slice itself;
- repeated UI/API start failures use the Action Inbox diagnostic channel after
  the existing threshold;
- creation never auto-dispatches task cards.

## Main Thread Scheduling And Worker Use

The ordinary Home AI implementation thread remains the scheduling authority for
Home AI-owned delivery. It should keep the current objective, split work into
bounded slices, decide which slices can run elsewhere, and merge returned
evidence back into the handoff and delivery ledger. A separate "scheduler"
thread is not required for ordinary Home AI delivery; the implementation
thread is the central scheduler unless a future contract explicitly moves that
role.

Use Worker threads for durable, independently returnable work:

- plugin-owned implementation or repair in a plugin workspace;
- routine deployment/readback in a configured deploy lane;
- independent platform/plugin audit in the dedicated audit threads;
- long-running bounded probes whose output can be summarized without exposing
  private payloads;
- modules with disjoint write sets and clear acceptance evidence.

Each Worker dispatch should include the target workspace/thread, allowed module
or file boundary, expected checks, return-card requirement, privacy boundary,
requested reasoning effort, and a conflict rule. The effective task-card
reasoning effort is normalized by
`adapters/task-card-dispatch-idempotency-service.js` and must be at least
`medium`; `low` is not a valid default for durable Worker, audit, deployment,
or repair cards. H2/high-risk work is raised to at least `high`, and H1/critical
work is raised to `xhigh`. If a Worker finds
overlapping edits, missing prerequisite commits, or shared-file contention, it
must return `blocked` or
`partially_completed` with bounded evidence instead of overwriting local work.

Inbound cross-thread task cards use a first-step triage pass before any source
or production mutation. The coordinator classifies the card by source
workspace/thread, requested side effects, owning layer, production authority,
specialized lane availability, and local write-set overlap. The expected
outcome is one of:

- `inline_home_ai_source`: small Home AI-owned source/test/doc slice, no
  production service-user authority, no independent deploy/readback required;
- `source_then_delegate`: Home AI source-contract change is needed first, but
  production install/deploy/readback must be sent to a deploy/service lane;
- `delegate_worker`: plugin/native/independent module work belongs to another
  implementation thread or Worker lane;
- `delegate_deploy_lane`: routine production deploy, config install, restart,
  or bounded production readback belongs to a deploy lane, preferably the
  plugin-specific lane when one exists;
- `delegate_audit_lane`: verification or closure belongs to the platform or
  plugin audit thread;
- `blocked_or_redirected`: no legal lane/capability is visible, or dispatch
  would target a wrong-purpose thread.

This triage prevents the main thread from treating every incoming card as local
implementation work. It is also the place to enforce plugin-specific deploy
lanes: Movie production install/readback routes to `Movie Deploy Lane` when
available; Codex Mobile production deploy routes to `Codex Mobile Deploy Lane`
when available; other routine plugin deploys use the shared deploy pool. If the
main thread performs a prerequisite source slice before delegation, that source
slice must be committed and the Worker card must name the commit/ref, expected
command, readback fields, privacy boundary, conflict rule, and return task-card
requirement.

The main thread may also dispatch bounded assistance that did not originate as a
task card, provided the target thread/workspace is visible, the work has a clear
return contract, and the main thread remains responsible for sequencing and
merge decisions.

Dynamic Worker pool policy:

- `Home AI Worker Lane A/B/C` are seed lanes, not the upper bound of the
  Worker pool.
- When a Home AI-owned slice is independently returnable and no compatible
  Worker lane is visible or idle enough, the coordinator should ask Codex
  Mobile to ensure or create a role lane instead of doing the work inline only
  because the static lanes are busy.
- A complex independent slice may be dispatched as a `worker_loop` slice. In
  that case the selected Worker becomes the requirements-analysis owner for a
  nested Loop and Codex Mobile creates or selects separate implementation and
  audit role lanes for that nested Loop.
- Worker creation is still bounded by role/workspace/purpose metadata, task-card
  transport acceptance, and privacy/authority constraints. Normal Workers do
  not gain service-user, production deploy, or private data-tree authority just
  because they were dynamically created.

Worker handoff delta lifecycle:

- `.agent-context/HANDOFF.md` remains the main Home AI coordinator handoff.
  Worker threads do not update it by default because their local status should
  not become implicit main-thread context.
- A Worker that needs durable merge/recovery context writes a bounded delta to
  `.agent-context/worker-handoffs/active/<taskCardId>.md`. The delta includes
  `taskCardId`, `sourceThreadId`, `targetThreadId`, `status`,
  `mergeDisposition`, and `expiresAfter`, plus a short bounded summary. It must
  not contain raw logs, raw diffs, private payloads, endpoint bodies, secrets,
  launch tokens, or long task bodies.
- `mergeDisposition=pending` is the only valid active-state disposition. The
  terminal return card is still the authoritative Worker result. The main
  thread reads the return card first, reads the delta only if needed, and then
  merges durable facts into `.agent-context/HANDOFF.md` or the coordinator
  ledger.
- After merge, durable deltas move to
  `.agent-context/worker-handoffs/archive/YYYY-MM-DD/<taskCardId>.md`.
  No-value deltas may be deleted instead of archived by marking them
  `discardable` during the merge decision and removing them from `active`.
- Codex Mobile thread lifecycle events such as `achieved` or `superseded`
  should trigger the same cleanup. Latest-turn `completed` is not a lifecycle
  cleanup signal. It means the last turn finished, not that the Worker lane or
  task-card lifecycle is closed.
- `scripts/worker-handoff-lifecycle-check.js --json` is the source Harness for
  this contract. It passes when no active directory exists, or when every active
  delta is pending and unexpired. It fails if active deltas are missing required
  fields, have invalid metadata, are expired, or are already
  `merged`/`archived`/`discardable` but still active.
- Explicit exceptions are rare: a Worker may update the main handoff only when
  it is acting as the Home AI coordinator thread, when the task card explicitly
  asks it to update that file as the owned artifact, or when a deploy/data
  repair card must write a global status note after a terminal return. Even in
  those cases it must reread the latest handoff and merge, not overwrite.

Plugin-domain natural-language routing:

- When the Owner discusses a plugin-domain requirement in the Home AI main
  thread and explicitly asks for a normal card to the plugin main/source thread,
  Home AI records `delegate_plugin_requirements` and sends a
  `cardKind=plugin_requirements` task card to that plugin source thread for
  requirements/design analysis.
- When the Owner explicitly asks for a plugin Loop card, Home AI records
  `delegate_plugin_loop`, sends a `cardKind=plugin_loop` source-thread request,
  and requires Codex Mobile to start or ensure the plugin-source Loop lifecycle.
  The plugin main/source thread owns the requirements role; implementation and
  audit must not be collapsed into the Home AI main thread or the first
  implementation lane.
- Home AI must not infer plugin Loop mode from ordinary plugin discussion. The
  Owner's natural language must clearly request Loop/cycle/three-role handling;
  otherwise plugin-main-thread requirements analysis is the stronger default
  than direct implementation.

Codex Mobile thread lifecycle dependency:

- Home AI depends on Codex Mobile for thread listing, lane resolution,
  lane ensure/create, lane achieved/superseded metadata, and compaction-aware
  registry refresh.
- Home AI must not infer deliverability from title or `status=completed`.
  `completed` is latest-turn status only; archive, hidden, non-deliverable, and
  achieved/superseded are explicit metadata states.
- Thread titles are display labels. Dynamic Worker and Loop role lanes must use
  compact titles and put full objectives in task-card/Loop metadata instead.
  Examples: `Movie Loop Implement`, `Movie Loop Audit`, `Home AI Worker 07-04a`.

Operational dispatch rules:

- before reading or editing implementation files for non-trivial Home AI work,
  the main implementation thread must run or apply the equivalent of
  `node scripts/main-thread-routing-preflight.js --task "<task>" --changed-file <path> --mode classify`
  to create a bounded source-side preflight decision. The smaller preflight
  classification is `inline`, `worker`, `plugin_main`, `plugin_loop`,
  `deploy_lane`, or `blocked`. `inline` is reserved for simple status/answer,
  coordinator-only, final merge/verification after Worker return, or explicitly
  non-delegable work. Independent source/module changes classify as `worker`
  unless plugin/deploy/Loop routing is explicitly stronger. If no Worker or
  lifecycle target is available, the preflight must classify `blocked` with a
  reason such as `worker_required_target_unavailable`; it must not fall back to
  inline;
- `node scripts/main-thread-routing-preflight.js --task "<task>" --changed-file <path> --mode enforce`
  is a local Harness/enforcement form: non-inline work fails closed unless the
  caller records a bounded routing decision with a role-compatible target
  thread. The command accepts target metadata such as `--source-thread-id`,
  `--target-thread-id`, and `--target-thread-title`; `Task Intake`, deploy
  lanes, audit threads, Public PR threads, and the source thread itself fail
  closed for ordinary `home_ai_worker` cards. This remains source-side/advisory
  for local Codex turns and scripts. It is not a runtime command-interception
  hook unless a future runtime explicitly invokes it before model/tool
  execution;
- use the main thread inline for small Home AI-owned changes where the touched
  files are already in the current workspace, validation is local, and no
  independent terminal return is needed;
- before inline implementation of a non-trivial task, record a routing decision
  explaining why the work is not independently dispatched. This decision is
  closure evidence and should be covered by Harness tests for H1/H2, Loop, and
  long-running work classes;
- Home AI and plugin main/source threads share the central Worker pool contract
  in `docs/PLATFORM_CONTRACTS/worker-pool-lifecycle-contract.md`. Home AI
  implementation slices use `home_ai_worker`; ordinary plugin main-thread
  implementation, investigation, and review slices use `plugin_worker`. Plugin
  Loop lanes remain explicit `plugin_loop` role lanes and must not be selected
  for ordinary plugin Worker dispatch;
- plugin implementation/research slices set `cardKind=plugin_worker` and
  require Codex Mobile lifecycle action `resolve_or_ensure_plugin_worker_lane`.
  The request carries `pluginId`, workspace cwd, source thread id, bounded
  summary, and idempotency metadata. If lifecycle returns several compatible
  candidates, `adapters/worker-lane-scheduler-service.js` selects one stable
  available lane deterministically. The coordinator must never surface
  multiple same-workspace Worker choices as an Owner/model blocker;
- when the coordinator dispatches a Home AI-owned implementation slice through
  Codex Mobile task-card transport, it marks the card as
  `cardKind=home_ai_worker`. The task-card service then selects a live
  `Home AI Worker Lane A/B/C` implementation lane through its Worker-lane
  load selector. `adapters/worker-lane-scheduler-service.js` owns the shared
  route policy so the coordinator and task-card service do not drift. Ordinary
  inbound cards that only target the `Home AI` prefix still land on the main
  Home AI implementation thread as the intake and scheduling surface;
- Worker and deploy lane selectors use explicit dispatchability metadata before
  load balancing. `status=completed` remains dispatchable because it can mean
  only that the latest turn completed. Threads marked archived, deleted,
  closed, hidden, `visible=false`, `deliverable=false`, or
  `canReceiveTaskCards=false` are excluded even if title and cwd match. If
  task-card transport later rejects a target as archived or unavailable, that
  is a lane-discovery defect to record and route around, not a reason to retry
  the same target repeatedly;
- classify target-thread purpose before dispatch. The scheduler recognizes
  Public PR, deploy, audit, task-intake, plugin-loop, plugin-worker,
  implementation-worker, and general threads. A special-purpose thread may
  receive only matching card kinds.
  `adapters/codex-thread-task-card-service.js` enforces this even for explicit
  target thread ids when a target title is supplied, and it refuses generic
  workspace fallback when an implementation card cannot find a legal Worker
  lane. This prevents `cwd` matches from sending implementation work to
  `Codex Mobile Public PR` or other special-purpose threads;
- do not treat a discovered thread's `status=completed` field as a terminal or
  non-deliverable state. In Codex Mobile thread discovery this can mean only
  that the latest turn completed. Eligibility must come from explicit archived
  or terminal markers, thread role/purpose, card-kind compatibility, visibility,
  and actual task-card transport acceptance or rejection. A role-matched
  implementation thread should be tried by exact thread id unless it is
  archived, hidden, role-incompatible, or rejects transport;
- dispatch to a Worker when the slice belongs to another workspace, needs a
  dedicated audit/deploy lane, may run for a long time, or can return bounded
  evidence independently;
- do not treat Codex Mobile thread-lifecycle `ensure/create` as a generic ad hoc
  Worker creation API. If lifecycle resolution returns a precondition such as
  `thread_lifecycle_loop_role_required`, record `routing_blocked` or
  `dispatchStatus=failed`; do not fall back to `Home AI Task Intake`, a deploy
  lane, an audit lane, or the current source thread just because the workspace
  path matches. A lifecycle response with multiple compatible Worker candidates
  is not a precondition failure; reduce it through the deterministic Worker
  selector. If all compatible lanes are busy, record `pool_exhausted` and route
  to queue/capacity/lifecycle repair instead of returning a generic ambiguity
  block;
- do not dispatch service-user or private production readback to a normal
  Worker lane unless that lane explicitly exposes the needed non-interactive
  capability. `hermes-host` data-tree reads/writes, sudo-gated install phases,
  clean-target mutation, and operator service-user execution belong in a
  deploy/service lane or must return blocked as a capability gap. Current-user
  permission failures from such lanes are classified as Worker capability
  boundaries, not product runtime defects;
- never dispatch an unbounded "help me continue" card. The card must name the
  target workspace/thread, allowed files or module, validation/readback
  evidence, terminal return-card requirement, privacy boundary, and conflict
  rule;
- if the Worker reports a stale source ref, overlapping local edits, missing
  prerequisite commits, routing failure, or unclear ownership, treat the result
  as a scheduling decision for the main thread instead of letting the Worker
  overwrite state;
- when multiple deploy lanes are configured, route routine plugin deploys to
  the first live non-terminal lane that can accept the card. Plugin-specific
  assignments take precedence: Codex Mobile deploy requests route to
  `Codex Mobile Deploy Lane`, and Movie deploy requests route to
  `Movie Deploy Lane` when those live lanes are discoverable. If one lane is
  stuck or unreachable, fall back to the shared deploy pool before declaring
  the deploy blocked. Preserve the central deploy contract and bounded
  readback expectations in every deploy card. Prefer explicit `pluginId`;
  the router may also infer known plugin targets from bounded title, summary,
  body, or workspace path metadata when older cards omit structured fields.

Duplicate dispatch or notification delivery is not normal Owner burden. When
two equivalent repair cards or Web Push notifications are created for the same
source request, approve/execute at most one and treat the duplicate as a
Home AI/Codex Mobile idempotency defect. The coordinator should key dispatch
and return intake by source request id, case/slice id, workflow id, and
task-card id where available, then record only bounded duplicate evidence.
The duplicate rule applies to plugin-topic inbox approvals, AI Ops diagnostic
repair cards, autonomous delivery repair/deploy/verification cards, and Web
Push notifications generated from those surfaces. Producers should set stable
task-card request ids and Web Push tags; consumers should record completed
dispatch events before retrying or re-notifying.

Return-card Watchdog:

- `GET /api/autonomous-delivery/return-watchdog` returns an Owner-only bounded
  summary of dispatched task cards that are still waiting for terminal return
  cards;
- `POST /api/autonomous-delivery/return-watchdog` marks stale dispatched slices
  as `dispatchStatus=return_stale` after the configured stale window, records a
  `return_card_watchdog_stale` event, and updates the Action Inbox surface;
- the Watchdog never retries, redispatches, or closes work. Its recommended
  action is Owner/coordinator inspection followed by recording a real terminal
  return card or rerouting the slice;
- return recording by original `taskCardId` still works after a stale mark, so
  a late Worker return can close the correct slice without manual case lookup.

Source return-receipt integration Watchdog:

- `GET /api/autonomous-delivery/source-return-integrations` returns an
  Owner-only bounded summary of terminal return receipts that still have a
  pending or stale source integration disposition;
- `POST /api/autonomous-delivery/source-return-integrations` marks stale
  pending integrations after the configured stale window and records a
  `source_return_integration_stale` event;
- this Watchdog complements the missing-return Watchdog. It never retries,
  redispatches, or closes work and it stores no raw return bodies, prompts,
  endpoint bodies, URLs, file paths, logs, screenshots, or private payloads.

Return-driven continuation:

- after reading any terminal Worker/plugin/deploy/audit return, the source
  scheduler must write or apply a `return_continuation_decision` before sending
  a final user-facing response;
- the decision records `original_objective_satisfied`,
  `continuation_required`, `next_action_type`, `next_target_role`,
  `next_target_workspace`, `next_target_thread_id`,
  `source_task_card_id`, `return_card_id`, `workflow_id`, and either
  `continuation_dispatch_card_id` or `blocked_reason`;
- `continuation_required=false` is valid only when the original objective is
  satisfied and all required Harness, deploy/readback, audit, and closure
  evidence has been answered;
- `next_action_type=dispatch_worker` is mandatory when a return says a Worker
  can now proceed, a blocker/capability was repaired, or another implementation
  slice is the named next step. The coordinator must create that card before
  final summary unless no legal lane exists;
- `next_action_type=dispatch_deploy_readback` is mandatory when source work is
  ready but production activation/readback is pending, subject to the normal
  Owner/high-risk deployment gate;
- `next_action_type=dispatch_verification_harness` is mandatory when required
  real workflow Harness or audit evidence is still missing;
- `next_action_type=route_owner` is mandatory for `redirected` returns with a
  valid owning layer;
- `next_action_type=ask_owner` is reserved for real product decisions or
  high-risk authorization, not for implementation routing that the scheduler
  can decide from source/docs;
- if a required next action cannot be sent, the scheduler records
  `blocked_missing_continuation_dispatch` instead of producing an ordinary
  "can dispatch now" receipt.

Execution-lease Watchdog:

- Codex Mobile may keep a separate execution-lease Watchdog for approved task
  cards whose target turn remains active with `resumeRequired=true`;
- that Watchdog should not be the normal progress mechanism. Target threads
  should emit bounded heartbeat/progress state while a long-running card is
  healthy;
- heartbeat freshness suppresses execution-lease recovery. Only a non-terminal
  card with stale heartbeat/progress state may be resumed or surfaced for
  recovery;
- repeated recovery for the same active card must be rate-limited and
  idempotent. A healthy Worker must not be repeatedly refreshed simply because
  it has not produced a terminal return yet.

Sub-agents are different from Worker threads. They are temporary helpers inside
the current turn and do not have a durable task-card lifecycle, source-thread
return contract, deployment authority, or independent workspace ownership.
They are appropriate for bounded analysis or review that the main thread can
fully inspect. They are not appropriate for cross-workspace mutation,
deployment/readback, Owner-gated actions, or any work that needs a terminal
return card.

Local development should run focused checks first, then `npm test` after a
module-sized change is coherent. Install, upgrade, production-smoke, and deploy
lane tests are intentionally outside the default local gate; run
`npm run test:install-lane` only from an install/deploy lane, release lane, or
explicit operator validation context.

## Relationship To Existing Systems

- Action Inbox remains the user-attention surface for approvals, reviews, and
  receipts. Phase 2 creates Owner start items, but the coordinator ledger
  remains the execution state of record.
- AI Operations Control Plane remains the source for context packs, required
  checks, visual lanes, evidence ledgers, and incident cassettes.
- Codex Mobile task cards remain the cross-thread execution and return-card
  transport.
- Product Reality Audit remains the independent read-only verification lane.
- The central macOS deployment contract remains the only production write path.

## Next Phase Direction

The next phase should add stronger automated runtime readback and user-path
evidence capture on top of the existing return-card event intake,
evidence-ledger verification, deployment/readback evidence projection,
verification closure, final report projection, and Owner-gated repair routing:

1. capture richer user-path evidence when runtime behavior changed;
2. automate bounded production readback where the central deploy contract can
   prove the runtime surface without extra Owner decisions;
3. keep routing verification failures back to the owning slice until closed or
   genuinely blocked.

The loop must not skip the existing task-card return contract. If a target
thread cannot finish, it must return `blocked`, `redirected`, `rejected`, or
`partially_completed` with exact ownership.

## Validation

Focused validation:

```bash
node --check adapters/autonomous-delivery-intake-service.js
node --check adapters/autonomous-delivery-case-ledger-service.js
node --check adapters/autonomous-delivery-coordinator-service.js
node --check adapters/autonomous-delivery-routing-decision-service.js
node --check adapters/task-card-dispatch-idempotency-service.js
node --check adapters/worker-lane-scheduler-service.js
node --check adapters/return-watchdog-service.js
node --check adapters/source-return-integration-watchdog-service.js
node --check adapters/source-return-follow-up-action-service.js
node --check scripts/autonomous-delivery-loop.js
node --check server-routes/autonomous-delivery-api-routes.js
node tests/autonomous-delivery-intake-service.test.js
node tests/autonomous-delivery-case-ledger-service.test.js
node tests/autonomous-delivery-coordinator-service.test.js
node tests/autonomous-delivery-routing-decision-service.test.js
node tests/task-card-dispatch-idempotency-service.test.js
node tests/worker-lane-scheduler-service.test.js
node tests/return-watchdog-service.test.js
node tests/source-return-integration-watchdog-service.test.js
node tests/source-return-follow-up-action-service.test.js
node tests/autonomous-delivery-api-routes.test.js
node tests/ai-operations-control-plane-service.test.js
node tests/app-action-inbox-ui.test.js
node tests/codex-thread-task-card-service.test.js
node tests/owner-system-console-service.test.js
node tests/owner-system-console-api-routes.test.js
node tests/owner-system-console-ui.test.js
node tests/home-ai-self-improving-loop-service.test.js
node tests/api-route-inventory.test.js
node tests/mobile-api-dispatcher.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
git diff --check
```

Broader changes that connect this intake to Action Inbox, Codex Mobile task
cards, or production deploy must also run the focused tests for those modules
and update this implementation note.

## Privacy Boundary

Intent intake stores only bounded request text, workspace ids, phases, risk,
decision gates, and short summaries. It must not store raw secrets, access
keys, cookies, launch tokens, OAuth tokens, private plugin payloads, financial
rows, mailbox bodies, health records, learner submissions, screenshots with
private data, full prompts, or long logs.
