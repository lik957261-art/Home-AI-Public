# Autonomous Delivery Loop Implementation

Status: Phase 2 implemented for deterministic intent intake, persisted
coordinator ledger, Owner Action Inbox start request, manual non-high-risk
task-card dispatch, verification, repair, and Owner-gated deployment/readback
coordination, per-slice AI Ops required-check/evidence projection, plus
evidence-ledger verification, hash-only artifact pointers, and Owner-visible
final report projection after closure.

## Objective

Autonomous Delivery Loop turns user requests into a tracked delivery workflow
where Home AI asks for only necessary user decisions and otherwise coordinates
work through owning threads, validation, deployment, audit, repair, and final
closure.

The platform contract is
`docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md`.

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

- `adapters/autonomous-delivery-coordinator-service.js`
- `server-routes/autonomous-delivery-api-routes.js`
- focused SQLite helpers in `adapters/mobile-sqlite-store.js`
- Action Inbox create/start/verification surface in
  `public/app-action-inbox-ui.js`
- API composition in `server-routes/mobile-api-composition.js`
- dispatcher registration in `server-routes/mobile-api-dispatcher.js`
- route inventory entries in `adapters/api-route-inventory.js`
- `tests/autonomous-delivery-coordinator-service.test.js`
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

Owner start behavior:

- creation through `POST /api/autonomous-delivery/cases` or the Action Inbox
  `新建交付 Loop` form stores the case/slices and opens an Action Inbox item
  with `sourceType=autonomous_delivery`;
- the Inbox row exposes `开始执行` or `确认并开始`;
- Owner may attach an optional prompt before dispatch;
- the coordinator records `dispatching`, `dispatched`, and terminal return
  states per slice;
- each implementation, verification, deployment/readback, and repair slice
  stores a bounded `aiOps` projection generated through the AI Operations
  Control Plane. The projection includes harness class, selected modules,
  required docs, required checks, root-cause/fallback governance, visual/deploy
  gates, and blocked-if reasons;
- task cards include the selected AI Ops required docs/checks so target threads
  can return evidence against them;
- return state can be recorded by explicit `caseId`/`sliceId` or by the
  original dispatched `taskCardId`, so a future Codex Mobile return observer can
  update the ledger without manually resolving slice ids;
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
reasoning effort must be at least `medium`; `low` is not a valid default for
durable Worker, audit, deployment, or repair cards. If a Worker finds
overlapping edits, missing prerequisite commits, or shared-file contention, it
must return `blocked` or
`partially_completed` with bounded evidence instead of overwriting local work.
The main thread may also dispatch bounded assistance that did not originate as a
task card, provided the target thread/workspace is visible, the work has a clear
return contract, and the main thread remains responsible for sequencing and
merge decisions.

Operational dispatch rules:

- use the main thread inline for small Home AI-owned changes where the touched
  files are already in the current workspace, validation is local, and no
  independent terminal return is needed;
- when the coordinator dispatches a Home AI-owned implementation slice through
  Codex Mobile task-card transport, it marks the card as
  `cardKind=home_ai_worker`. The task-card service then selects a live
  `Home AI Worker Lane A/B/C` implementation lane through its Worker-lane
  load selector. Ordinary inbound cards that only target the `Home AI` prefix
  still land on the main Home AI implementation thread as the intake and
  scheduling surface;
- dispatch to a Worker when the slice belongs to another workspace, needs a
  dedicated audit/deploy lane, may run for a long time, or can return bounded
  evidence independently;
- do not dispatch service-user or private production readback to a normal
  Worker lane unless that lane explicitly exposes the needed non-interactive
  capability. `hermes-host` data-tree reads/writes, sudo-gated install phases,
  clean-target mutation, and operator service-user execution belong in a
  deploy/service lane or must return blocked as a capability gap;
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
node --check adapters/autonomous-delivery-coordinator-service.js
node --check scripts/autonomous-delivery-loop.js
node --check server-routes/autonomous-delivery-api-routes.js
node tests/autonomous-delivery-intake-service.test.js
node tests/autonomous-delivery-coordinator-service.test.js
node tests/autonomous-delivery-api-routes.test.js
node tests/ai-operations-control-plane-service.test.js
node tests/app-action-inbox-ui.test.js
node tests/api-route-inventory.test.js
node tests/mobile-api-dispatcher.test.js
node tests/architecture-code-test-harness-map.test.js
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
