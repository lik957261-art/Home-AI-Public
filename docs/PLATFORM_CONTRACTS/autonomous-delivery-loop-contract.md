# Autonomous Delivery Loop Contract

Contract version: `20260626-v2`.

## Purpose

Autonomous Delivery Loop is the long-term Home AI work mode for turning a user
intent into delivered, verified, and closed work with minimal user intervention.
Product Reality audits are one quality lane inside this loop, not the whole
system.

The loop exists to reduce repeated user steering during engineering work. Home
AI should ask the user for only the decisions that require human product
judgment or high-risk authorization, then coordinate planning, implementation,
validation, deployment, audit, repair, and closure through task cards and
bounded evidence.

## User Intervention Boundary

The user should normally intervene only for:

- requirement definition: objective, explicit non-goals, success criteria, and
  personal preference;
- visible product or UI decisions: screen behavior, copy, interaction, visual
  direction, and user-facing tradeoffs;
- high-risk authorization: production deployment, irreversible data mutation,
  secret handling, physical device control, external payment/provider actions,
  or any operation that can create real-world side effects.

Everything else should be handled by the loop:

- decomposition into bounded work items;
- routing to owning workspaces or audit threads;
- implementation and focused validation;
- deployment through the central deployment contract;
- independent verification and Product Reality audit when required;
- repair loops until terminal closure or a real blocker is reached;
- final summary with evidence and residual risk.

## Loop Phases

1. `intent_intake`: normalize the user's request into structured objective,
   scope, target workspaces, risk, user-decision gates, and candidate work
   slices.
2. `decision_gate`: ask only the missing requirement, UI/product, or high-risk
   authorization questions. Do not ask implementation questions that the agent
   can resolve from docs/source.
3. `work_breakdown`: split work into implementation, UI, test, deploy,
   audit/verification, and documentation slices.
4. `implementation`: owning workspaces implement their slices and return real
   task-card results.
5. `verification`: run source tests, host-path checks, production readback, and
   visual evidence where required.
6. `deployment`: use the central macOS deployment contract or the owning plugin
   deploy flow. Never write production trees directly.
7. `audit_closure`: use dedicated read-only audit threads when the work needs
   Product Reality, platform, security, or cross-workspace verification.
8. `final_report`: return a concise result with changed files, commits,
   validation, deployment state, residual risk, and privacy confirmation.

## Intent Intake Contract

The first implemented step is `intent_intake`. It must be deterministic,
bounded, and safe to run before any mutation.

Input:

- natural-language user request;
- optional known target workspace ids;
- optional explicit approval flags for high-risk classes.

Output:

- stable intent id;
- objective summary;
- mode: `delivery`, `audit`, `research`, or `deployment`;
- risk: `low`, `medium`, or `high`;
- target workspaces and paths;
- user decision gate with missing decisions;
- autonomy policy: whether the loop may auto-plan, auto-dispatch,
  auto-implement, or auto-deploy;
- ordered phases;
- bounded task slices;
- privacy boundary and stop conditions.

The intake step must not:

- create task cards;
- deploy;
- edit source;
- read private payloads;
- infer raw secrets;
- start high-risk physical/device or data operations.

## Coordinator Ledger Contract

The first persisted coordinator implementation stores bounded delivery metadata
in the Home AI SQLite store:

- one delivery case row per normalized user objective;
- one slice row per candidate work item;
- one event row per case/slice lifecycle transition.

The ledger is the execution state of record. Action Inbox rows are Owner
attention projections only and must not become the canonical execution state.

Case creation may be triggered by the Action Inbox `新建交付 Loop` form or by
the workspace-scoped case API. It may create an Owner Action Inbox start item,
but must not dispatch task cards automatically. Dispatch starts only after an
Owner action on the Inbox item or an equivalent Owner-only API call.

Manual start rules:

- only Owner may start a case;
- required decision gates must be explicitly confirmed;
- high-risk cases must not dispatch automatically or through the Phase 2
  non-high-risk start path;
- non-high-risk implementation/research slices may be dispatched to known
  owning Home AI/plugin workspaces;
- deployment, audit/verification, and user-visible decision slices remain
  explicit Owner-gated follow-up states and must not auto-dispatch;
- Owner may attach an additional bounded prompt to the dispatched task card.

The start path must record dispatch status before and after task-card transport
and must leave a bounded failure status if no dispatchable slice exists.
Each slice must carry a bounded AI Ops projection generated from the slice
objective, owner layer, target workspace, and stage. The projection may include
`harnessClass`, modules, required docs, required checks, root-cause/fallback
governance fields, visual lane requirements, deployment-plan requirements, and
blocked-if reasons. It must not store raw secrets, private payloads, full
prompts, raw task-card bodies, screenshots, database rows, or long logs.
Task-card bodies should expose the selected required docs/checks so the target
thread can return evidence against them.
Return cards may include an AI Ops evidence ledger path, required evidence
kind/status expectations, commit prefix, and artifact/evidence pointers in
bounded metadata. Home AI verifies the ledger locally through the AI Operations
Control Plane and stores only the pass/fail result, record count, bounded
issues, and hash labels such as `evidence-ledger:<hash>` or
`artifact:<hash>`. Raw local paths, URLs, screenshots, private filenames,
tokens, prompts, task-card bodies, provider payloads, and long logs must not be
persisted in the coordinator ledger or final report.
The coordinator must retain the original dispatched task-card id as a return
correlation key. Terminal return-card state may be recorded by direct slice id
or by this task-card id, so a Codex Mobile return observer can update the
ledger without requiring manual case/slice lookup.
The preferred observer integration is a bounded return-card event intake that
accepts the original dispatched task-card id, the return-card id, terminal
status, short summary, and safe thread/workflow metadata only.
When a completed return does not require production deployment/readback, the
coordinator may move the case to `verification_waiting` and create an Owner
Action Inbox review projection. That Inbox row is only a decision/attention
surface for verification or audit next steps; it must not automatically run
verification or dispatch new cards.

Deployment/readback rules:

- completed implementation or repair returns may explicitly declare that
  runtime or production behavior changed and deployment/readback is still
  required;
- such returns must move the case to `deployment_waiting` and create an Owner
  Action Inbox projection with
  `notificationType=autonomous_delivery.deploy_readback_required`;
- only Owner may start deployment/readback from that projection or equivalent
  Owner-only API call;
- starting deployment/readback creates a separate `deployment_owner` slice and
  routes one task card to the dedicated `Home AI Deploy` Codex thread. Plugin
  implementation threads prepare source, tests, commit/push when applicable,
  deploy plan, and bounded readback expectations, but they do not receive sudo
  password-file paths and do not execute production deployment directly. The
  coordinator stores the deployment task-card id, completes the Inbox item, and
  moves the case to `deployment_dispatched`;
- deployment/readback task cards must use the established central/plugin
  deploy contract and return bounded production readback evidence;
- completed deployment/readback returns annotate the original implementation
  or repair slice with deployment evidence, then move the case to
  `verification_waiting` and create the Owner verification projection;
- failed deployment/readback returns reopen an Owner deployment/readback
  projection instead of auto-retrying or mutating production.

Owner-triggered verification rules:

- only Owner may start verification from the review projection or equivalent
  Owner-only API call;
- starting verification creates a separate verification slice in the ledger
  instead of overwriting the implementation slice;
- plugin/workspace implementation slices route verification cards to the
  central `Plugin Workspace Audit` thread;
- Home AI-owned slices route verification cards to the central
  `Home AI Platform Audit` thread;
- the verification slice stores its own task-card id so terminal verification
  return cards can be correlated through the same task-card-id return intake;
- verification start may include a bounded Owner prompt;
- verification start must not auto-dispatch repair cards, deploy, or mutate
  production outside the target verification thread's return contract.

Verification return and closure rules:

- terminal verification return cards must update the verification slice by the
  original verification task-card id;
- a completed verification return must not create another verification request
  for the verification slice itself;
- when all implementation/research slices are completed and independently
  verified, the coordinator may mark the planned closure verification slice
  completed and move the case to `verified_waiting`;
- `verified_waiting` creates an Owner Action Inbox closure projection with
  `notificationType=autonomous_delivery.closure_required`;
- only Owner may close a `verified_waiting` case through the closure projection
  or equivalent Owner-only API call;
- closing records `completed` and `closed_at` in the coordinator ledger;
- closing creates one Owner Action Inbox final-report projection with
  `notificationType=autonomous_delivery.final_report_ready`, `itemType=delivery`,
  and a bounded markdown evidence digest;
- the final report may include case/slice ids, statuses, task-card ids,
  return-card ids, short summaries, deployment flags, event counts, AI Ops
  required-check summaries, bounded evidence projections, evidence-ledger
  verification status/record counts/issues, and hash-only artifact references,
  but must not include raw task-card bodies, full prompts, secrets, private
  payloads, raw screenshots, private filesystem paths, database rows, or long
  logs;
- closure must not auto-deploy, auto-send repair cards, or skip any remaining
  high-risk authorization gates.

Verification repair rules:

- terminal verification returns with `blocked`, `redirected`, `rejected`, or
  `partially_completed` must not automatically dispatch repair cards;
- when the failed verification return identifies a parent implementation slice,
  the coordinator moves the case to `repair_waiting` and creates an Owner
  Action Inbox repair projection with
  `notificationType=autonomous_delivery.repair_required`;
- only Owner may start repair from that projection or equivalent Owner-only API
  call;
- starting repair creates a separate repair slice routed to the original
  implementation workspace, stores the repair task-card id, and moves the case
  to `repair_dispatched`;
- repair return cards are normal implementation-slice returns and must pass
  through the same verification lane before closure;
- high-risk repair remains blocked by high-risk authorization rules and must
  not be silently dispatched.

## Decision Rules

The loop must stop and ask the user when:

- the objective is missing or contradictory;
- a visible UI/product decision is required;
- a high-risk mutation lacks explicit approval;
- physical device control is requested without explicit device-control
  approval;
- data migration, destructive repair, or bulk mutation is requested without
  explicit data-mutation approval;
- secret values or private payloads would be required in model context.

The loop must not stop merely because:

- implementation details are open but can be resolved from existing docs,
  source, and tests;
- a workspace owner must run standard tests;
- a plugin implementation thread needs to call the central deploy script;
- an audit or verification thread needs to continue a repair loop.

## Task-Card And Return-Card Rule

Every dispatched slice must have a terminal return state:

- `completed`;
- `blocked`;
- `redirected`;
- `rejected`;
- `partially_completed` with explicit residual ownership.

Local final prose is not a return card. A thread that cannot finish its slice
must return a real task card with the owning layer and blocker. The coordinator
must continue other slices and keep the ledger open until every slice reaches a
terminal state. Return recording by task-card id must still validate that the
task card belongs to an existing delivery slice before mutating the ledger.
Return event intake must be idempotent for duplicate terminal events and must
not persist raw return-card bodies, prompts, private conversation text,
screenshots, uploads, secrets, cookies, launch tokens, provider payloads, or
long logs.
If the return includes an evidence ledger path or artifact pointer, the
coordinator may use the raw value transiently for local verification, then must
discard it and persist only redacted evidence records, hash labels, required
kind/status checks, record counts, and bounded issues.

## Ownership And Audit Boundaries

- Implementation belongs to the owning Home AI or plugin workspace.
- Product Reality and platform audits belong to dedicated read-only audit
  threads.
- Deployment belongs to the existing central deploy contract unless a specific
  platform blocker prevents the owning workspace from using it.
- Action Inbox is the user-attention surface, not the execution engine.
- AI Operations Control Plane provides context packs, required checks, evidence
  ledger records, visual lanes, and incident cassettes; it does not own product
  decomposition by itself.

## Closure Standard

The loop is closed only when:

- the original objective and explicit non-goals are satisfied or intentionally
  rejected;
- user-visible product/UI decisions were honored;
- tests and required checks passed or residual gaps are explicitly accepted;
- production/user path is verified when runtime behavior changed;
- audit/verification findings have terminal repair or rejection status;
- privacy boundary is confirmed;
- the final report is concise and evidence-backed.

## Privacy

The loop stores summaries and bounded metadata only. It must not store raw
secrets, access keys, cookies, launch tokens, OAuth tokens, private plugin data,
financial rows, mailbox contents, health records, learner submissions, provider
payloads, screenshots with private data, full prompts, or long logs.
