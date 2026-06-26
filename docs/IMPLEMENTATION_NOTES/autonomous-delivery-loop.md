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
