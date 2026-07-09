# Loop Engineering Implementation Plan

Status: Home AI domain-adapter source slice is implemented. Generic `@loop`
runtime remains owned by Codex Mobile and is not enabled by this document or
Home AI adapter alone.

## Purpose

Loop Engineering is the product-engineering workflow for repeated requirements,
implementation, and independent product-audit cycles until the audit passes or
the loop reaches a bounded stop condition.

The canonical long-term runtime belongs in Codex Mobile, because `@loop`
triggering, task-card creation, return-card correlation, Worker dispatch,
iteration routing, and Watchdog behavior are Codex Mobile task-system
capabilities. Home AI must not implement a parallel task-card runtime for
plugins.

Home AI participates as a domain adapter:

- Home AI's own `@loop` cases use the Home AI main Codex thread for
  requirements/coordinator work;
- Home AI Worker lanes implement Home AI slices;
- Home AI Platform Audit independently audits Home AI product/platform results;
- Home AI platform UI may expose shortcuts and status in Owner System Console,
  but those shortcuts route into the Codex Mobile Loop runtime instead of
  executing a separate loop inside the Home AI app process;
- the existing Home AI Autonomous Delivery ledger remains the Home AI-side
  status/evidence projection and compatibility substrate until the Codex Mobile
  runtime owns the canonical loop state.

Loop Engineering must not introduce a second scheduler, independent state
store, or untracked thread convention in the Home AI platform.

## Runtime Ownership And Trigger Model

Primary trigger:

```text
Codex Mobile / Home AI main thread:
  @loop <Home AI objective>
```

This creates a Home AI Loop case in the Codex Mobile Loop runtime. The Home AI
main Codex thread owns requirements analysis and coordination for this case.

Plugin trigger:

```text
Codex Mobile / plugin source thread:
  @loop <plugin objective>
```

This creates a plugin-local Loop case. The plugin source thread owns
requirements analysis. Home AI is not the plugin product manager and should not
define plugin requirements by default.

When `@loop` is submitted from a product/source main thread itself, the
requirements role is local to that source thread. This includes plugin source
threads, the Xcode native-shell thread, and Home AI's own main implementation
thread when the requested product belongs to that thread. Codex Mobile must
represent that role as Loop state, status projection, and an in-thread
requirements prompt/action; it must not create a same-thread task card to
satisfy the role. The task-card transport invariant remains intact: any actual
task card must have `sourceThreadId !== targetThreadId`.

Home AI platform shortcut:

```text
Owner System Console / Action Inbox:
  New Loop
```

This is a convenience entrypoint only. It should send or request a Codex Mobile
Loop case targeting the relevant source thread. It may display the resulting
bounded status, but it must not run its own independent three-thread loop.

Explicit cross-target examples:

```text
@loop improve Owner System Console delivery-loop visibility
@home-ai @loop repair system self-check dispatch closure
@finance @loop recurring billing automatic posting user journey
@wardrobe @loop outfit recommendation wear-intent save action
```

If `@finance @loop` is typed in the Home AI source thread, Home AI should route
the loop request to the Finance source thread as a plugin-local Loop. It should
not perform Finance requirements analysis unless the requested work is actually
in the Home AI host/proxy/provisioning/deploy layer.

## When To Use

Use Loop Engineering for work where requirements quality and implementation
quality need independent iteration:

- product capability changes, such as Vite migration, Owner System Console,
  document delivery, voice input, file sharing, and attachment flows;
- cross-layer work that spans Web, native shell, Gateway, plugin host,
  production deploy, or plugin workspaces;
- platform reliability changes, including self-checks, task-card dispatch,
  Worker scheduling, Web Push, return-card Watchdog, and deployment readback;
- high-ambiguity UX where a feature can be technically correct but still fail
  the user journey.

Do not use the full three-role loop for small deterministic hotfixes, narrow
syntax/test fixes, or routine deploy/readback cards that already have complete
source, tests, and acceptance evidence. Those should use the ordinary focused
repair or deploy-lane path.

## Roles

### Requirements Analyst

The requirements-analysis thread owns product clarification, not code.

Responsibilities:

- normalize the Owner request into a concrete objective, non-goals, target
  surfaces, constraints, and success criteria;
- identify privacy boundaries, production risk, and required Owner decisions;
- define acceptance criteria in user-observable terms;
- select required docs, Harness class, focused tests, and production/readback
  gates;
- decide whether implementation can run inline or should be split across
  Worker/plugin/deploy/audit lanes;
- return a bounded requirements packet.

It must not edit implementation files, deploy, mutate production data, or mark
the loop complete.

Role ownership by target:

- `target=home-ai`: Home AI main Codex thread is Requirements Analyst and
  coordinator.
- `target=<plugin>` from the plugin source thread: that plugin source thread
  is Requirements Analyst.
- `target=<plugin>` from Home AI or another thread: Codex Mobile routes a
  requirements card to the plugin source thread first; Home AI remains only the
  transport/status coordinator unless the requirements packet identifies a
  Home AI-owned platform layer.

### Implementer

The implementation thread owns code and focused validation for the accepted
requirements packet.

Responsibilities:

- implement only the accepted scope;
- keep business logic in services/providers and HTTP wiring in route modules;
- update docs and Harnesses that move with the changed behavior;
- run focused tests and the required project gates for the touched surface;
- return changed files, commit if any, validation, deployment need, residual
  risk, and privacy confirmation.

It must not redefine the product requirements. If the requirements are wrong,
unsafe, or incomplete, it returns `blocked_requirements_gap` or
`partially_completed` with bounded evidence.

### Product Auditor

The product-audit thread is the independent quality gate.

Responsibilities:

- compare the delivered result against the requirements packet and durable
  product/architecture contracts;
- verify the actual user journey, not only source diffs;
- inspect UX/failure states, privacy behavior, Harness coverage, and
  deployment/readback evidence when applicable;
- return a terminal audit verdict.

It must not repair the code while operating as auditor. On failure, it returns
the defect class and routes the next iteration to the requirements analyst
unless the failure is a narrow implementation bug that already has complete
requirements and a precise repair surface.

### Audit Packet And Delta Matrix

The audit role receives a structured Audit Packet. It must not treat the
implementation thread's `.agent-context/HANDOFF.md` as inherited context or
proof. A named handoff may be inspected only when the audit target is handoff
quality itself, and must then be labeled as target evidence.

Required Audit Packet sections:

- `requirements_packet`: objective, non-goals, acceptance criteria,
  user-visible success, privacy boundary, and risk gates from the requirements
  role;
- `design_contract_packet`: durable product/module contract, architecture
  boundary, routing policy, and Harness requirements;
- `implementation_packet`: original task-card id, commit or changed files,
  bounded diff summary, ownership claim, and residual risk from the
  implementation return;
- `validation_packet`: focused tests, Harness evidence, deployment/readback
  when applicable, and privacy confirmation;
- `privacy_packet`: excluded payload classes, redaction or non-collection
  claims, task-card privacy confirmation, and residual privacy risk.

The Product Auditor must fill a Delta Matrix before returning a terminal
verdict:

- `intent_vs_requirements`: whether requirements preserve the Owner's stated
  user intent, non-goals, and risk boundaries;
- `requirements_vs_design`: whether durable design/contracts cover the
  requirements without contradiction;
- `design_vs_implementation`: whether implementation follows the documented
  ownership, routing, architecture, and privacy contracts;
- `implementation_vs_validation`: whether tests, Harnesses, and readback prove
  changed behavior rather than only source shape;
- `user_journey_vs_acceptance`: whether the real user path satisfies
  acceptance without hidden fallback, stale state, or inaccessible controls;
- `privacy_boundary_vs_evidence`: whether audit evidence respects the stated
  privacy boundary and avoids raw private payloads.

The audit verdict is valid only when the required packet sections are present
or the auditor returns `blocked_missing_evidence` with bounded missing-field
evidence.

## State Machine

Loop Engineering is represented as an Autonomous Delivery case with a
`loopEngineering` metadata envelope.

Nominal path:

```text
intake
-> requirements_dispatched
-> requirements_returned
-> implementation_dispatched
-> implementation_returned
-> audit_dispatched
-> audit_passed
-> closed
```

Failure paths:

```text
audit_failed_requirements_gap
-> requirements_revision_dispatched
-> requirements_returned
-> implementation_dispatched
-> implementation_returned
-> audit_dispatched
```

```text
audit_failed_implementation_bug
-> implementation_repair_dispatched
-> implementation_returned
-> audit_dispatched
```

```text
audit_failed_test_gap
-> implementation_repair_dispatched
-> audit_dispatched
```

```text
blocked_owner_decision
-> owner_decision_recorded
-> requirements_revision_dispatched
```

Break condition:

- product audit returns `passed`;
- all required source tests, Harnesses, deployment/readback, privacy checks,
  and return-card evidence are present;
- the coordinator records closure in the Autonomous Delivery case ledger.

Stop conditions:

- maximum iteration count reached, default `3`;
- the same blocker repeats twice with no new evidence;
- required Owner product/risk decision is missing;
- target thread, Worker lane, deploy lane, or audit lane is unreachable after
  configured fallback routing;
- implementation and audit disagree on ownership and the coordinator cannot
  resolve it from source/docs.

In stop conditions, the case remains visible in Owner System Console as
`blocked` or `needs_owner_decision`, not silently completed.

## Audit Verdicts

Product audit returns exactly one verdict class:

- `passed`;
- `failed_requirements_gap`;
- `failed_implementation_bug`;
- `failed_test_gap`;
- `failed_privacy_boundary`;
- `failed_deployment_readback`;
- `blocked_missing_evidence`;
- `blocked_owner_decision`;
- `blocked_target_unavailable`;
- `rejected_out_of_scope`.

The verdict determines the next route. A free-form narrative is secondary.

## Thread Routing

Default routing:

- Home AI requirements analysis: Home AI main Codex thread;
- plugin requirements analysis: the plugin source thread where `@loop` was
  triggered, or the plugin source thread selected by an explicit
  `@plugin @loop` route;
- implementation: owning workspace thread, plugin thread, or Home AI Worker
  lane with disjoint write boundaries;
- product audit: `Home AI Platform Audit` for Home AI-owned surfaces,
  `Plugin Workspace Audit` for plugin-owned surfaces, or a dedicated visual /
  product audit lane when the contract defines one;
- deployment/readback: configured deploy lane pool, with plugin-specific lanes
  preferred for Codex Mobile and Movie.

Source-thread ownership rule:

- if the source thread is already the role owner for `requirements`, for
  example Xcode main thread for native-shell requirements or a plugin main
  thread for plugin requirements, the Loop runtime records that role as
  `source_thread_local_role` and does not dispatch a task card for it;
- if the source thread is not the requirements owner, Codex Mobile may dispatch
  a role-matched task card to the requirements owner thread;
- implementation, audit, repair, and deploy/readback roles still use task
  cards only when the selected target thread differs from the source thread;
- a blocked existing Loop must be surfaced as `ok=false` with the bounded
  blocker, not as a successful duplicate-suppressed no-op.

Codex Mobile owns role-lane selection and provisioning because it owns the
thread list, task-card transport, return-card correlation, and Loop runtime.
Home AI supplies domain policy and status projection. For non-Home-AI source
loops, Home AI must not create requirements threads or become the requirements
analyst by default. Codex Mobile may create implementation or audit role
threads only when it has an explicit thread-create capability that can stamp
bounded role metadata, workspace, purpose, and source-loop correlation. Until
that capability is available, it should select existing compatible lanes or
fail closed with bounded routing metadata.

Codex Mobile must expose a stable thread lifecycle surface for Loop use:

- `list`/`resolve`: discover role-compatible lanes by workspace, cwd, role,
  purpose, and deliverability metadata;
- `ensure`/`create`: create a missing implementation, audit, repair, or
  requirements lane when the source thread is not already the role owner;
- `achieve` or `mark_role_complete`: mark a role lane achieved/superseded after
  Loop closure without treating latest-turn `completed` as non-deliverable;
- `refresh`: update thread registry rows after Codex compaction/continuation,
  preserving current visible lane ids and redirecting superseded ones.

Thread titles are not the routing contract. Loop-generated lane names must stay
short and stable:

- source-main-thread requirements normally reuse the source thread title;
- dedicated requirements lane: `<Workspace> Loop Requirements`;
- implementation lane: `<Workspace> Loop Implement`;
- product-audit lane: `<Workspace> Loop Audit`;
- repair lane: `<Workspace> Loop Repair`.

Append only a short stable suffix when needed, for example `07-04a` or a short
loop-id prefix. Do not include the full objective or acceptance criteria in the
thread title. Put long summaries in task-card body, Loop status, and bounded
metadata.

Thread discovery status must be interpreted conservatively. A Codex Mobile
thread row with `status=completed` is not proof that the thread is terminal or
unsuitable for delivery; it can mean the most recent turn completed. Loop
routing must not skip an otherwise role-matched implementation, audit, or
deploy thread because of `completed` alone. Use explicit archive/terminal
markers, role/purpose classification, card-kind compatibility, visibility, and
transport acceptance/rejection as the dispatch evidence.

The coordinator must include:

- correlation ids: original `taskCardId` after transport creation when known,
  source task-card/request id, source thread id, workflow id, loop id, role
  slice id, and target role;
- exact target workspace/thread;
- `triggerSurface`: `codex_mobile_thread`, `home_ai_platform_shortcut`, or
  `task_card_continuation`;
- `runtimeOwner`: normally `codex_mobile_loop`;
- `domainAdapter`: `home_ai`, plugin id, or `none`;
- role: `requirements`, `implementation`, `product_audit`, `deploy_readback`,
  or `repair`;
- accepted input packet or bounded audit failure packet;
- allowed files/modules/deploy boundary;
- required validation/readback;
- requested reasoning effort no lower than `medium`, with H1/H2 raised by the
  existing dispatch-idempotency service;
- terminal return-card requirement;
- privacy boundary;
- conflict rule.

Correlation rule:

- task-card id is the primary key for return routing and Watchdog correlation;
- every generated role card should include a compact "Correlation" block in
  the body and structured metadata when the transport supports it;
- every return card must name the original task-card id it is closing;
- title, thread title, workspace path, and source-thread id are useful evidence
  but must not be the only return-routing key.

## Ledger Model

The first implementation should extend the existing Autonomous Delivery case
metadata rather than creating new tables.

Suggested bounded fields:

```json
{
  "loopEngineering": {
    "enabled": true,
    "runtimeOwner": "codex_mobile_loop",
    "domainAdapter": "home_ai",
    "triggerSurface": "codex_mobile_thread",
    "sourceThreadRole": "home_ai_main",
    "loopType": "product_capability",
    "iteration": 1,
    "maxIterations": 3,
    "roles": ["requirements", "implementation", "product_audit"],
    "currentRole": "product_audit",
    "lastAuditVerdict": "failed_requirements_gap",
    "nextRoute": "requirements_revision",
    "breakCondition": "audit_passed_with_required_evidence"
  }
}
```

Allowed `loopType` values:

- `product_capability`;
- `platform_reliability`;
- `visual_ux`;
- `deployment_readback`;
- `cross_workspace_integration`.

The ledger stores bounded metadata only. It must not store full prompts,
private user records, raw task-card bodies, screenshots with private content,
raw logs, launch tokens, cookies, provider payloads, or database rows.

## Implementation Phases

### Phase 1: Documentation And Harness Contract

Status: this document.

Deliverables:

- define role boundaries, state machine, verdict classes, routing, and Harness
  gates;
- link this plan from the docs index and architecture-code-test-Harness map;
- add test-map coverage so Loop Engineering cannot drift away from
  Autonomous Delivery and Product Reality audit docs.

### Phase 2: Codex Mobile AT Loop Runtime

Owning workspace:
`/Users/example/path`.

Add the generic Loop runtime to Codex Mobile:

- parse explicit `@loop` and `@plugin @loop` task triggers;
- create a stable `loopId` and role slices;
- keep iteration, break condition, terminal return correlation, and duplicate
  suppression state;
- represent source-thread-owned requirements as local Loop state instead of a
  same-thread task card;
- create implementation, product-audit, repair, and deploy/readback task cards
  through the existing task-card channel only when source and target threads
  differ;
- select target threads by role as well as workspace. Loop runtime dispatch
  must never treat a same-workspace `Public PR`, deploy, audit, task-intake, or
  other special-purpose thread as a generic implementation target. Missing role
  lanes are blocked routing evidence, not permission to fall back to any thread
  with the same `cwd`;
- accept terminal return cards and audit verdicts;
- run Watchdog classification for missing role returns;
- expose bounded Loop status through Codex Mobile API/MCP for source threads
  and platform adapters.

Suggested Codex Mobile tests:

- `test/loop-task-runtime.test.js`;
- `test/at-loop-trigger-parser.test.js`;
- `test/thread-task-card-loop-routing-service.test.js`;
- existing task-card dispatch/return and notification idempotency tests.

### Phase 3: Home AI Domain Adapter

Add a focused service, tentatively
`adapters/loop-engineering-plan-service.js`, that accepts a Home AI Loop
request or Codex Mobile Loop status projection and returns:

- `loopType`;
- required roles;
- initial dispatch order;
- Home AI role routing: main thread requirements, Home AI Worker
  implementation, Home AI Platform Audit product audit;
- Harness class;
- required docs/tests/readback;
- maximum iterations;
- stop conditions;
- privacy boundary.

Focused test:

- `tests/loop-engineering-plan-service.test.js`.

Status: first source slice implemented in Home AI. The service parses Home AI
and plugin `@loop` triggers, builds bounded role-routing plans, maps audit
verdicts to deterministic next routes, and projects Codex Mobile runtime
availability into an Owner-visible bounded status. It does not create task
cards, persist canonical Loop state, or execute the Loop runtime.

The Owner Console integration consumes Codex Mobile's bounded at-loop status
surface through `adapters/codex-mobile-at-loop-status-service.js`. The collector
normalizes Codex `/api/at-loop/status` counts and loop items into the Home AI
`loopEngineeringStatus` projection. Transport failures are displayed as blocked
runtime status with bounded error codes; Home AI still does not retry or
redispatch Loop work from the console.

### Phase 4: Home AI Coordinator Projection

Extend `autonomous-delivery-coordinator-service` to:

- project Codex Mobile Loop state into the Home AI Autonomous Delivery ledger
  for Home AI-owned cases;
- create Home AI role slices from the planner only for Home AI-owned loops or
  platform shortcut requests;
- correlate role returns by task-card id, loop id, and slice id;
- record audit verdicts as bounded events;
- choose the next route from verdict class;
- suppress duplicate role dispatch for the same iteration;
- expose loop status in the existing `deliveryLoopStatusSummary()`.

Focused tests:

- `tests/autonomous-delivery-coordinator-service.test.js`;
- `tests/task-card-dispatch-idempotency-service.test.js`;
- `tests/return-watchdog-service.test.js`.

### Phase 5: Owner Console And Action Inbox Projection

Expose bounded loop state:

- runtime owner;
- domain adapter;
- trigger surface;
- loop type;
- current role;
- iteration/max iterations;
- last audit verdict;
- next route;
- blocked reason;
- duplicate-suppressed count;
- waiting-return count.

Focused tests:

- `tests/owner-system-console-service.test.js`;
- `tests/owner-system-console-api-routes.test.js`;
- `tests/owner-system-console-ui.test.js`;
- `tests/app-action-inbox-ui.test.js` when Owner actions change.

### Phase 6: Product Audit Integration

Update audit-card templates so the Product Auditor receives the requirements
packet, implementation return, changed files, validation, deployment/readback
state, and privacy boundary. The card must carry the Audit Packet and Delta
Matrix contract above. Do not attach raw handoffs as audit context; include
only bounded packet sections and references to changed files, commits, task-card
ids, Harness commands, deploy/readback evidence, and privacy boundaries.

Focused tests:

- `tests/codex-thread-task-card-service.test.js`;
- `tests/autonomous-delivery-api-routes.test.js`;
- Product Reality audit service tests when audit request generation changes.

### Phase 7: Plugin Loop Adapter

Do not route plugin `@loop` through Home AI requirements analysis. Codex Mobile
should route plugin loop requirements to the plugin source thread. Home AI
integration is limited to:

- platform-layer repair cards when the plugin loop identifies Home AI host,
  Gateway, proxy, provisioning, Action Inbox, Web Push, or deploy-script
  ownership;
- shared deploy/readback lane routing;
- optional bounded status summary in Owner System Console.

Focused tests live primarily in Codex Mobile and plugin workspaces. Home AI
tests should cover only platform adapter behavior and should not assert plugin
product requirements.

## Harness Requirements

Loop Engineering is H1 when it can dispatch task cards, mutate source through
Workers, require deployment, or close user-visible work. It is H2 when only
Owner Console or Action Inbox projections change.

Minimum source gates for Phase 2+:

```bash
node --check adapters/loop-engineering-plan-service.js
node tests/loop-engineering-plan-service.test.js
node tests/autonomous-delivery-coordinator-service.test.js
node tests/task-card-dispatch-idempotency-service.test.js
node tests/worker-lane-scheduler-service.test.js
node tests/return-watchdog-service.test.js
node tests/autonomous-delivery-api-routes.test.js
node tests/owner-system-console-service.test.js
node tests/owner-system-console-api-routes.test.js
node tests/owner-system-console-ui.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node scripts/fallback-governance-check.js --json
git diff --check
```

If UI copy or static client code changes, also run the static cache/version
Harness required by `docs/MODULES/static-client.md`.

If production behavior changes, deploy only through the central macOS deploy
contract and include production readback. Do not use local source tests as a
substitute for production readback.

## Example: Three-Thread Product Loop

For a Home AI capability such as "make document delivery reliable on iOS",
triggered from the Codex Mobile Home AI main thread:

1. Codex Mobile parses `@loop` and creates the Loop case.
2. Home AI main thread returns a requirements packet covering Markdown preview,
   PDF native bridge, PPTX compatibility, privacy, acceptance criteria, and
   Harness plan.
3. Home AI Worker or owning implementation thread changes the relevant Home
   AI/native/plugin surfaces and returns tests plus deploy/readback needs.
4. Home AI Platform Audit verifies the real mobile user journey. If PDF works
   but PPTX fails, the verdict is `failed_implementation_bug`; if acceptance
   did not specify a multi-workspace privacy boundary, the verdict is
   `failed_requirements_gap`.
5. Codex Mobile Loop runtime dispatches the next role based on the verdict.
6. Loop closes only after `passed` plus required evidence.

For a plugin capability such as "Finance recurring billing experience is
unreliable", triggered from the Finance source thread:

1. Codex Mobile parses `@loop` in the Finance thread and creates a plugin-local
   Loop case.
2. Finance source thread returns the requirements packet.
3. Finance implementation thread or Finance source thread implements the
   accepted packet.
4. Plugin Workspace Audit verifies the product journey.
5. Home AI is involved only if the loop identifies a Home AI host/platform,
   Gateway, provisioning, shared deploy, or permission-boundary defect.

## Non-Goals

- Do not use Loop Engineering to manufacture work for every small fix.
- Do not make Home AI the requirements analyst for plugin-local loops.
- Do not implement a second Loop runtime inside the Home AI platform app when
  Codex Mobile owns `@loop` triggering and task-card orchestration.
- Do not let the audit thread repair code while auditing.
- Do not bypass Owner approval for high-risk production, data, secret, or
  device actions.
- Do not create duplicate task-card requests for the same role/iteration.
- Do not let a requirements thread declare implementation complete.
- Do not let implementation redefine acceptance criteria without returning to
  requirements.
- Do not treat a blocked Worker permission boundary as a product runtime
  defect without service-user readback evidence.
