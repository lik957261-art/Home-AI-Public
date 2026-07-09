# Autonomous Delivery Loop Contract

Contract version: `20260626-v2`.

## Purpose

Autonomous Delivery Loop is the long-term Home AI work mode for turning a user
intent into delivered, verified, and closed work with minimal user intervention.
Product Reality audits are one quality lane inside this loop, not the whole
system.

Loop Engineering is an upper-layer product-engineering pattern that uses this
contract as the Home AI domain adapter and projection substrate. Its
requirements-analysis, implementation, and product-audit role cycles are
documented in `docs/IMPLEMENTATION_NOTES/loop-engineering.md`. Long-term
`@loop` triggering and cross-thread role orchestration belong to Codex Mobile's
Loop runtime. Home AI must reuse or project that runtime through this
coordinator ledger, dispatch idempotency, Worker/deploy lane routing, return
Watchdog, and Owner-visible closure model instead of creating a parallel
plugin-loop scheduler or state store.

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

## Harness-Aware Closure Rule

The coordinator owns Harness requirement enforcement across implementation,
verification, repair, and return-card merge. When a slice is marked
`harness_required`, or when the Owner reports the same user-visible state
synchronization symptom after a completed or partially completed repair, the
coordinator must carry that requirement into the next task card and into the
closure ledger.

The coordinator must not close a Worker, deploy, plugin, audit, or diagnostic
return as `completed` while the required real workflow Harness evidence is
missing. It may accept only one of these terminal states:

- `completed` with bounded failing-then-passing Harness evidence from the real
  entry path;
- `partially_completed` with the remaining Harness/readback gap named exactly;
- `blocked_missing_repro_harness` when the required Harness cannot be run in
  the available lane;
- a delegated visual/readback task whose terminal return answers the missing
  requirement before final closure.

For these escalated cases, code inspection, logs, screenshots without bounded
state, and unit tests are hypothesis evidence only. Return cards should include
bounded machine-readable fields such as counts, ids or hashes, active
workspace/thread, visible DOM row counts, durable/pending counts, session or
status codes, client version/build id, and timing buckets, and must not include
raw messages, raw keys, cookies, launch tokens, endpoint bodies, database rows,
private screenshots, private thread bodies, or long logs.

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

## Thread And Dispatch Governance

The ordinary Home AI implementation thread is the coordinator for Home AI-owned
delivery work. It keeps the current objective, chooses work boundaries,
dispatches bounded slices, and merges returned evidence into the coordinator
ledger and workspace handoff. It must not be replaced by an ad hoc scheduler
thread unless a future platform contract explicitly moves that responsibility.

### Inbound Task-Card First-Step Triage

When the Home AI implementation thread receives an inbound cross-thread task
card, the first operational step is classification, not implementation. The
coordinator must inspect the card metadata and bounded body for:

- source thread/workspace, source task-card id, workflow id, and requested
  reasoning effort;
- owning layer: Home AI platform, plugin workspace, native shell, audit,
  deployment/readback, or production service lane;
- requested side effects: source edit, test-only validation, production config
  install, deploy/restart, private service-user readback, data mutation, device
  control, or audit closure;
- available specialized lanes, including plugin-specific deploy lanes such as
  `Movie Deploy Lane` or `Codex Mobile Deploy Lane`;
- whether the main thread already has uncommitted overlapping source edits.

The coordinator may work inline only when the slice is Home AI-owned, has a
small non-overlapping source write set, does not require production
service-user authority, and can be fully validated from this workspace. If the
card asks for production installation, deployment/readback, private
`hermes-host` execution/readback, plugin-owned mutation, native-shell mutation,
or independent audit, the coordinator must dispatch a bounded Worker/deploy/audit
card before performing that slice. It may still prepare and commit a Home
AI-owned source-contract slice first when that source slice is a prerequisite,
but production execution and independent readback must be delegated.

The triage result is itself part of closure evidence. It should be recorded in
the task-card body sent to the Worker or, if no legal lane exists, in a
`blocked`/`redirected` return with bounded routing metadata. Relying on Owner
reminders to trigger Worker dispatch is a contract violation.

### Return-Driven Continuation Rule

A terminal Worker, plugin-source, deploy, audit, or diagnostic return card is a
source-scheduler event before it is a user-facing receipt. The source/main
thread must merge the return into the coordinator ledger and immediately make a
bounded `return_continuation_decision` before sending any ordinary final
message.

The decision must preserve these bounded fields when available:

- `original_objective_satisfied`: whether the user's original objective is now
  fully satisfied;
- `continuation_required`: whether another dispatch, deploy/readback,
  verification, owner-routing, or blocker record is required;
- `next_action_type`: one of `none`, `dispatch_worker`,
  `dispatch_deploy_readback`, `dispatch_verification_harness`,
  `route_owner`, `ask_owner`, or `blocked`;
- `next_target_role`: role such as `home_ai_worker`, `plugin_worker`,
  `deploy_lane`, `audit_lane`, or `plugin_main`;
- `next_target_workspace` and `next_target_thread_id` when a target is known;
- `source_task_card_id`, `return_card_id`, and `workflow_id` for correlation;
- `continuation_dispatch_card_id` after a follow-up card is created;
- `blocked_reason` when no legal next action can be dispatched.

The coordinator may stop only when
`original_objective_satisfied=true`, `continuation_required=false`, all
required Harness/deploy/readback evidence has been answered, and no return
field or bounded summary names a pending next action. Otherwise it must execute
one of the following dispositions:

- `dispatch_worker`: create the required Worker card immediately when the
  return says a capability is now available, a blocker was repaired, or "now it
  can be dispatched"; do not reply only that dispatch is possible;
- `dispatch_deploy_readback`: create or confirm the deploy/readback card when
  source work is complete but production activation/readback is pending;
- `dispatch_verification_harness`: create the missing Harness or audit/readback
  card when required evidence is still unanswered;
- `route_owner`: send the card to the owning thread/lane when the return is
  `redirected` or the owning layer changed;
- `ask_owner`: ask only for an unresolved product decision, high-risk
  authorization, or other human decision gate that cannot be inferred from
  docs/source;
- `blocked`: record or return `blocked_missing_continuation_dispatch` with the
  exact missing lane, capability, permission, conflict, or evidence when a
  required next action cannot legally be sent.

Status alone is not enough to close. A `completed` return can still require
deployment, readback, or verification. A `partially_completed` return with a
source fix ready, deploy pending, Worker available, or ownership redirect must
advance to the named next action. A `redirected` return must be routed to the
owning layer unless the route is illegal. A `blocked` return that names a
repairable scheduling or lane-discovery defect must lead to a scheduling repair
or a bounded blocker, not an ordinary summary. A source thread that answers
"now a Worker can be dispatched" without dispatching it, or without recording
`blocked_missing_continuation_dispatch`, violates this contract.

Terminal receipts that contain structured follow-up metadata or bounded legacy
markers must also create a source-visible pending action. The recognized
signals include `deployRequest.needed=true`, `followUpRequest.needed=true`,
`deploy_needed=true`, `deploy_requested`, `follow_up_required`,
`blocked_by_deploy_readback`, `public_sync_required`, `pr_close_required`, and
`central_action_required`. The pending action is stored as bounded metadata,
not as a raw return body. It must include source task-card id, return-card id,
workflow id, action type, target/ref when available, required readback count,
issue code, creation time, and status. The coordinator must resolve the action
by dispatching/merging the central deploy or verification request, block it
with a reason, or dismiss it with an explicit reason. A pending action does not
make the terminal receipt active again and must not be implemented by pushing
the long return card to the latest active turn.

### Central Deploy Governance Rule

Home AI ordinary main/coordinator is the owner of production deployment
governance for Home AI and Home AI-managed plugin deploys. Worker, audit,
repair, loop, and plugin source/main threads may report that deployment is
needed, but they must return bounded `deployRequest` metadata to the source
coordinator instead of creating production Deploy Lane cards directly.

The coordinator owns collecting terminal Worker return `deployRequest`
metadata, combining deploy requests for the same repository/plugin/workspace,
checking whether source refs are unified or divergent, confirming the deploy
source is clean, comparing requested source/cache/build state against
production readback when available, selecting the canonical deploy candidate,
and creating the single Deploy Lane card. If refs are dirty, divergent, or
superseded, the coordinator must record `blocked`, `superseded`, or
`integration_required` instead of deploying a rollback or split ref.

Worker return metadata should use this bounded machine-readable shape:

```json
{
  "deployRequest": {
    "needed": true,
    "requestedByRole": "plugin_worker | home_ai_worker | repair_worker | audit_worker | loop_worker",
    "sourceWorkspace": "/bounded/path/or/id",
    "target": "home-ai | plugin:<plugin-id>",
    "sourceRef": "commit-or-ref",
    "baseRef": "optional-previous-live-ref",
    "changedFiles": ["bounded/file.js"],
    "validationSummary": ["bounded test names"],
    "requiredReadback": ["bounded readback checks"],
    "risk": "low|medium|high",
    "issueCodes": [],
    "requiresCentralIntegration": false,
    "supersedesDeployRefs": [],
    "dirtyState": { "dirty": false, "files": [] }
  }
}
```

`deployRequest` is metadata only. It is not production authorization and must
be projected as `deployAuthorized=false` until Home AI main/coordinator creates
the Deploy Lane request. The deploy governance service may aggregate requests
into one deploy candidate only when the target/source graph is consistent.
Divergent source refs or dirty sources must produce bounded issue codes such as
`deploy_request_requires_integration`, `deploy_request_source_ref_divergent`,
or `deploy_request_dirty_source`.

Deploy Lane cards must include source role metadata. Allowed dispatch source
roles are `home_ai_main`, `owner_main`, `central_deploy_coordinator`, and
`explicit_deploy_orchestrator`. Worker-origin roles such as `plugin_worker`,
`home_ai_worker`, `repair_worker`, `audit_worker`, `loop_worker`, and
`plugin_source_thread` are rejected by default with
`deploy_card_requires_central_coordinator`,
`worker_direct_deploy_forbidden`, or `deploy_source_role_not_authorized`.

Emergency direct dispatch is allowed only when it carries an explicit,
auditable central override: `centralOverride=true`, a bounded `overrideReason`,
`ownerApprovalRef` or `centralCoordinatorRef`, clean `dirtyState`, `sourceRef`,
validation summary, and required readback. Deploy Lane readback must report the
override metadata without secrets or raw private payloads.

Central contract/platform governance implementation cards must also start from
Home AI main/coordinator design. Plugin source/main threads must not directly
send Home AI Worker implementation cards for central deployment governance,
cross-plugin platform contracts, shared task-card routing policy, Worker lane
policy, or deploy/visual contract governance. A Worker receiving such a card
must return `redirected` or `superseded` with issue codes such as
`central_contract_work_requires_main_thread_design` or
`platform_governance_card_must_start_from_home_ai_main`. The known incorrect
route `ttc_5c9dd2b26327404d00` was superseded by `ttc_19e32e2eac58dbd250`
and is the regression fixture for this rule.

### Main-Thread Routing Preflight Gate

Before the ordinary Home AI implementation thread starts non-trivial source
repair or implementation work, it must produce a bounded routing preflight
decision. The executable source-side Harness is:

```bash
node scripts/main-thread-routing-preflight.js --task "<task>" --changed-file <path> --mode classify
```

The decision classification is one of:

- `inline`: allowed only for small coordinator-only work, simple status or
  answer tasks, final merge/verification after a Worker return, or work that
  cannot safely be delegated;
- `worker`: independent Home AI source/module repair or implementation that
  should be dispatched to a Home AI Worker lane with terminal return evidence;
- `plugin_main`: explicit normal-card plugin-domain requirements work that
  belongs to the plugin main/source thread;
- `plugin_loop`: explicit plugin Loop-card requests that belong to the plugin
  source requirements role and Codex Mobile Loop runtime;
- `deploy_lane`: routine plugin deployment, restart, production install, or
  production readback work;
- `blocked`: no legal Worker/plugin/deploy/lifecycle target is available, the
  task is missing, or the gate cannot safely classify a required lane.

`blocked` is not a normal escape hatch for scheduler ambiguity. Target-thread
ambiguity, multiple same-workspace candidates, stale Worker titles, missing
role metadata that can be inferred from lifecycle state, and missing Worker
capacity are routing defects or lifecycle repair inputs. The coordinator must
first resolve or ensure the role-compatible lane, deterministically choose a
single available compatible candidate, create/route a bounded lifecycle repair
card, or queue/record `pool_exhausted` with exact metadata. It may surface an
Owner-visible blocker only when the remaining decision requires Owner approval,
high-risk authorization, product judgment, privacy escalation, or a genuinely
missing platform capability.

For enforcement-style local checks, use:

```bash
node scripts/main-thread-routing-preflight.js --task "<task>" --changed-file <path> --mode enforce
```

In `enforce` mode, non-inline classifications fail closed unless an existing
bounded routing decision is explicitly supplied to the caller with a
role-compatible target thread. A recorded decision whose target is the source
thread itself, `Task Intake`, a deploy lane, an audit thread, a Public PR
thread, or any other role-incompatible special-purpose thread must fail closed
with bounded routing metadata. This gate is an executable source-side preflight
and regression Harness for Codex turns and operator scripts. It does not claim
to intercept every model command at runtime unless a future Codex Mobile or
Home AI runtime hook invokes it before command execution.

Plugin main/source threads must run the same executable preflight before
non-trivial plugin implementation, investigation, review, or Harness work. The
plugin-main invocation is:

```bash
node /Users/example/path --source-thread-role plugin_main --task "<task>" --changed-file <path> --mode classify
```

When this returns `classification=plugin_worker`, the plugin main/source thread
must either dispatch a `plugin_worker` task card with a terminal return contract
and Chinese Owner-visible receipt, or return/record a bounded blocker naming the
missing Worker lane. It must not fall back to `Task Intake`, deploy lanes,
audit lanes, Loop lanes, the current source thread, or inline implementation
merely because the plugin workspace is already loaded. Before editing after
selecting a Worker target, the plugin thread should rerun the gate in `enforce`
mode with the bounded routing decision recorded, including the source thread
id, target thread id/title, and `target-thread-role plugin_worker`.

Worker threads are durable Codex Mobile task-card targets, not temporary helper
agents. The coordinator may use Worker threads even when the original work did
not arrive as a task card, provided the work is independently returnable and has
a bounded ownership surface. Home AI and plugin workspaces share the central
Worker pool lifecycle contract in
`docs/PLATFORM_CONTRACTS/worker-pool-lifecycle-contract.md`. Ordinary Home AI
work uses `home_ai_worker` lanes; ordinary plugin main-thread implementation,
investigation, and review work uses `plugin_worker` lanes. Plugin Loop lanes,
deploy lanes, audit lanes, Task Intake, Public PR threads, and source/current
threads are separate roles and must not be used as Worker fallbacks.
Schedulers must resolve/list the stable Worker pool before creating a new lane,
reuse compatible available lanes, mark active lanes busy, release them after
terminal return, and treat task-title Worker lanes as lifecycle sprawl unless
the Codex Mobile lifecycle owner is actively normalizing legacy names. If a
lifecycle/list operation returns multiple compatible Worker candidates, the
scheduler must not ask the model or Owner to choose a thread. It must apply the
deterministic Worker-lane selector using role, workspace cwd, plugin id,
deliverability, busy/available state, source-thread exclusion, and a stable
request/idempotency key. If every compatible lane is busy, the result is
`pool_exhausted` and must be queued, capacity-ensured, or routed to a lifecycle
repair path; it is not a `target_ambiguous` blocker. Every active
non-terminal task card must send bounded heartbeat metadata keyed by its own
task-card id; if a Worker is handling two cards, it must heartbeat both cards
independently. After `1800000ms` (30 minutes) without heartbeat for a specific
non-terminal task card, the Watchdog should activate or resume that same task
card rather than create a replacement task-title Worker. A Watchdog batch
handles at most 8 stale cards, and the same active execution lease is
automatically resumed at most once by default.

Every Worker dispatch must include:

- its own immutable task-card id when the transport returns one, plus the
  originating source request id / source task-card id / workflow id when
  present;
- exact target workspace/thread;
- allowed module, file, route, or deploy boundary;
- expected validation or production readback evidence;
- terminal return-card requirement;
- terminal return-card body and Owner-visible receipt language `zh-CN`
  (`terminalReturnLanguageZhCn`);
- per-task-card heartbeat requirement, `1800000ms` task-card Watchdog timeout,
  batch limit `8`, and max auto-resume `1`;
- requested reasoning effort, with default and effective effort no lower than
  `medium`;
- privacy boundary;
- conflict rule for overlapping edits, missing prerequisite commits, shared
  files, or unclear ownership.

When a routing decision declares a Codex Mobile thread-lifecycle requirement,
the coordinator must call the Codex Mobile lifecycle surface before creating
the task card. Home AI currently uses `/api/at-loop/thread-lifecycle` with
bounded metadata to resolve the exact deliverable thread for Home AI Worker
lanes, plugin source requirements threads, and plugin Loop source roles. A
successful lifecycle result replaces title/prefix heuristics with the returned
thread id. Plugin implementation/research slices must request
`resolve_or_ensure_plugin_worker_lane` with `role=plugin_worker`, `pluginId`,
workspace cwd, source thread id, task-card/workflow correlation, bounded
summary, and idempotency metadata so the lifecycle surface can resolve or
create the exact Worker pool lane. A lifecycle response containing multiple
candidate threads is valid only as intermediate metadata; the coordinator must
select one compatible Worker lane deterministically before dispatch. A missing,
unavailable, or non-deliverable lifecycle result must fail closed as
`dispatchStatus=failed`; the coordinator must not fall back to a best-effort
title match for lifecycle-required slices. Thread-lifecycle `ensure/create` is
not an unrestricted ad hoc Worker-thread factory. If the lifecycle surface
returns a role/Loop precondition such as `thread_lifecycle_loop_role_required`,
the coordinator must record `routing_blocked` or `dispatchStatus=failed`
rather than treating `Task Intake`, deploy lanes, audit lanes, or the current
source thread as replacement Worker targets.

### Worker Handoff Delta Lifecycle

Worker-local handoff deltas are not the main workspace handoff. The ordinary
Home AI implementation thread owns `.agent-context/HANDOFF.md` as the
coordinator ledger. A Worker may write a separate durable delta only when that
delta is needed for merge, recovery, or audit, and it must use:

```text
.agent-context/worker-handoffs/active/<taskCardId>.md
```

An active Worker handoff delta must contain only bounded merge metadata and
must include these fields:

- `taskCardId`;
- `sourceThreadId`;
- `targetThreadId`;
- `status`;
- `mergeDisposition`, one of `pending`, `merged`, `archived`, or
  `discardable`;
- `expiresAfter`.

While a delta remains in `active`, `mergeDisposition` must be `pending`. The
Worker's terminal return card is the merge entry point: the coordinator reads
the return, optionally reads the bounded delta, merges only durable facts into
the main handoff or coordinator ledger, then archives or discards the delta.
Merged durable deltas move to
`.agent-context/worker-handoffs/archive/YYYY-MM-DD/<taskCardId>.md`; deltas
with no durable value may be deleted after the return is processed. A
`merged`, `archived`, or `discardable` delta must not remain under `active`.

Codex Mobile thread lifecycle events such as `achieved` and `superseded` must
drive the same cleanup path when a Worker lane is closed. Thread compaction or
latest-turn `completed` status is not a cleanup signal by itself. If Codex
Mobile cannot report lifecycle state, Home AI keeps the delta active only until
`expiresAfter`; after that the Harness must flag the stale active delta.

The Worker handoff lifecycle is checked by:

```bash
node scripts/worker-handoff-lifecycle-check.js --json
```

The check is read-only. It reports bounded issue codes for missing fields,
expired active deltas, non-pending deltas left active, and invalid lifecycle
metadata. It must not print Worker bodies, raw logs, private payloads, secrets,
launch tokens, endpoint bodies, or long diffs.

Worker lanes must not receive tasks that require private production
service-user authority unless that lane explicitly exposes the required
non-interactive capability. In particular, work that needs `hermes-host`
execution/readback, private Home AI data-tree traversal, sudo-gated install
phases, or operator clean-target mutation must route to a deploy/service lane
or return `blocked` with bounded capability evidence. A normal Worker returning
`Permission denied` for a private production path is a scheduling/capability
boundary, not proof that the product runtime write path is broken.

Thread role is part of the dispatch contract. The router must classify
special-purpose threads such as `* Public PR`, `* Deploy Lane`, `* Audit`,
`* Task Intake`, and `* Worker Lane` before sending a task card. Workspace/cwd
matches are not sufficient. A task-card kind that does not match the target
thread purpose must fail closed with bounded routing metadata. In particular,
implementation cards must not fall back from a missing Worker lane to another
thread in the same workspace, and Public PR threads must not receive
implementation, audit, deploy, or repair work.

Thread run status is not the same as dispatch eligibility. A discovered thread
with `status=completed` may simply mean its latest turn completed; it must not
be treated as archived, terminal, or unavailable for task-card delivery by that
field alone. Dispatch eligibility must be decided from explicit archive or
terminal markers, target role/purpose, card-kind compatibility, visibility, and
task-card transport acceptance or rejection. If the router is unsure, it should
try the exact role-matched thread id first or return bounded routing evidence;
it must not skip a role-matched implementation thread only because its latest
turn status is `completed`.

Worker and deploy lane discovery must also honor explicit non-deliverability
metadata. Threads marked `archived`, `deleted`, `closed`, `hidden`,
`visible=false`, `deliverable=false`, or `canReceiveTaskCards=false` are not
eligible task-card targets even if their title and cwd match. A lane rejected by
task-card transport with an archived/deleted/hidden target error must be
recorded as lane-unavailable routing evidence and must not be retried as the
same target in a tight loop.

Loop Engineering does not weaken the cross-thread task-card invariant. When a
Loop is triggered from a thread that already owns the current role, such as
Xcode main-thread `@loop` for native-shell requirements or plugin-main-thread
`@loop` for plugin requirements, that role must be tracked as local Loop state
or a source-thread prompt/action. It must not be implemented by sending a task
card from the thread to itself. Actual task cards still require
`sourceThreadId !== targetThreadId`. A same-thread role owner is therefore a
role-state condition, not a reason to bypass task-card transport guards.

Codex Mobile owns `@loop` runtime thread selection and, where supported,
role-thread provisioning. Home AI supplies domain routing policy and Owner
Console projection. For non-Home-AI source Loops, Home AI must not become the
requirements analyst by default; Codex Mobile should select or create
implementation/audit lanes with explicit purpose metadata, or fail closed with
bounded routing evidence when safe lane selection/provisioning is unavailable.

When the Owner discusses a plugin-domain requirement inside the Home AI main
thread, Home AI acts only as the source thread and scheduler. Natural-language
requests that explicitly ask to send a normal card to the plugin main/source
thread must route as plugin requirements analysis, not direct implementation.
Natural-language requests that explicitly ask for a plugin Loop card must route
to the plugin main/source thread as the requirements owner and then rely on the
Codex Mobile Loop runtime for implementation and audit roles. The Owner's
wording distinguishes the two modes; Home AI must not infer a plugin Loop from
ordinary plugin discussion without an explicit Loop/cycle/three-role request.

Codex Mobile is also the owner of thread lifecycle capabilities needed by this
contract. Home AI may request or consume these capabilities, but must not keep
a parallel thread registry:

- list visible task-card-capable threads with explicit `role`, `purpose`,
  `workspace`, `cwd`, `deliverable`, `archived`, `hidden`, and
  `canReceiveTaskCards` metadata;
- resolve a lane by role/workspace/purpose, not by title substring alone;
- ensure or create a role lane when no suitable lane exists and the caller is
  authorized to create one;
- mark a role lane achieved/superseded when a Loop role is closed, without
  confusing that state with "latest turn completed";
- refresh or redirect lane metadata after Codex compaction/continuation so
  current visible threads do not remain classified as archived or stale.

Thread `status=completed` remains only latest-turn status. It must not be used
as an achieved, archived, or non-deliverable marker. Achieved/superseded state
needs explicit lifecycle metadata that routing can distinguish from latest-turn
completion.

Loop and Worker lane names must be compact display labels. They must not embed
the full objective, long task-card title, acceptance criteria, or serialized
role packet. Full objective text belongs in task-card body, Loop status, and
bounded metadata, not the thread title. Recommended display patterns are:

- `<Workspace> Loop Requirements` for a dedicated requirements lane, when the
  source thread is not already the requirements owner;
- `<Workspace> Loop Implement`;
- `<Workspace> Loop Audit`;
- `<Workspace> Loop Repair`;
- `Home AI Worker <short-seq>` for dynamic Home AI implementation lanes.

When multiple lanes with the same role are needed, append a short stable suffix
such as `07-04a` or a short loop id prefix. Do not use the raw user objective
as the title. Role, objective summary, loop id, source task-card id, and target
workspace must be carried in metadata and the task-card correlation block.

Loop audit and verification cards must include a structured Audit Packet rather
than a raw implementation handoff. The packet must contain bounded
requirements, design/contract, implementation return, validation/readback, and
privacy sections, plus a Delta Matrix that compares:

- Owner intent against requirements;
- requirements against design/contracts;
- design/contracts against implementation;
- implementation against tests, Harnesses, and readback;
- user journey against acceptance criteria;
- privacy boundary against evidence collected.

Dedicated audit threads may use this packet as input, but they still must not
read `.agent-context/HANDOFF.md` or implementation lineage handoffs as inherited
context. A named handoff may be read only when handoff quality is the audit
target itself. Missing packet sections must be surfaced as bounded evidence,
not silently replaced by raw handoff context.

If a Worker hits a conflict, missing prerequisite, routing error, or ownership
ambiguity, it must return `blocked`, `redirected`, or `partially_completed`
with bounded evidence instead of overwriting local work or silently continuing.
The coordinator decides whether to merge, reroute, sequence, use another live
lane, or ask Owner for a product or risk decision.

Plugin-topic repair cards that are technically created from `Home AI Task
Intake` must still carry the original coordinator return target when available.
`replyToThreadId` is authoritative; when only the coordinator prefix is known,
the sender must resolve it before creating the Codex Mobile task card. Terminal
returns and host-owned redirects use that reply target, not Task Intake. Task
Intake remains valid only for requests that truly originate there and have no
coordinator reply metadata.

Deploy lanes are a pool, not a single hard-coded thread. Routine plugin
deployment/readback should go to a live non-terminal deploy lane selected from
the configured deploy lane pool, such as `Home AI Deploy`, `Home AI Deploy
Lane A`, `Home AI Deploy Lane B`, `Home AI Deploy Lane C`,
`Codex Mobile Deploy Lane`, or `Movie Deploy Lane`. Plugin-specific deploy
lanes take precedence when discoverable: Codex Mobile plugin deployments route
to `Codex Mobile Deploy Lane`, and Movie plugin deployments route to
`Movie Deploy Lane`. If the dedicated lane is stuck, archived, hidden,
terminal, or reports a transport error, the coordinator must fall back to
another valid shared deploy lane or repair lane discovery before declaring the
deployment blocked. Plugin implementation threads prepare source, tests,
commits, deploy plans, restart labels, health URLs, and bounded readback
expectations; they must not receive sudo password-file paths or execute
production deployment directly.

Duplicate task-card requests, duplicate Owner approval prompts, and duplicate
Web Push notifications for the same source request are platform defects, not
normal Owner workflow. The coordinator and notification producers must use
stable idempotency keys derived from source request id, diagnostic case id,
delivery case/slice id, workflow id, task-card id, or a bounded source
signature. Owner should need to approve at most one equivalent request. If a
duplicate is observed, the first equivalent approval/dispatch is authoritative;
later equivalents should be suppressed, marked duplicate, or recorded as
bounded defect evidence without re-notifying Owner.

The case ledger must expose duplicate suppression as bounded state, not as
silent loss. `autonomous-delivery-case-ledger-service` owns stable case identity
and duplicate-suppression projection; `task-card-dispatch-idempotency-service`
owns dispatch/request idempotency metadata, reasoning-effort floors, and
permission-boundary classification; `worker-lane-scheduler-service` owns
Worker/deploy lane selection policy; and `return-watchdog-service` owns stale
return-card candidate classification. `source-return-integration-watchdog-service`
owns terminal return-receipt integration classification after a return card has
arrived but before the source scheduler has recorded an integration
disposition. The coordinator persists the resulting state in SQLite and remains
the write authority for case/slice/event rows.

Sub-agents are temporary helpers inside the current turn. They have no durable
task-card lifecycle, no source-thread return contract, no deployment authority,
and no independent workspace ownership. Use sub-agents only for bounded
analysis or review that the coordinator can fully inspect. Use Worker threads
for cross-workspace mutation, deployment/readback, Owner-gated actions, or any
work requiring a terminal return card.

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
The task-card id is not optional routing decoration. Every task card body should
include a compact correlation block naming its `taskCardId` after creation when
known, source task-card/request id, source thread id, workflow id, target role,
and target workspace/thread. Every return card must include the original
task-card id and should use that id as the primary return key; titles, thread
names, and workspace paths are secondary evidence only.
The preferred observer integration is a bounded return-card event intake that
accepts the original dispatched task-card id, the return-card id, terminal
status, short summary, and safe thread/workflow metadata only.
The coordinator must also expose a bounded Owner-only return-card Watchdog.
The Watchdog identifies dispatched task cards that have no terminal return
after the configured stale window and may mark those slices as
`dispatchStatus=return_stale` with a bounded `return_card_watchdog_stale`
event. It must not retry, redispatch, complete, or reject the work by itself.
Late terminal returns must still be accepted by original task-card id.

The coordinator must also expose a separate bounded Owner-only source
return-receipt integration Watchdog for terminal returns that have already
arrived. This source integration state is not part of the missing-return SLA
path and must not change `return-watchdog` candidate behavior. It tracks only
bounded metadata such as case/slice ids, original task-card id, return-card id,
terminal status, timestamps, issue code, recommended action, and counts. It
may mark stale pending integrations so the Owner/source scheduler can project
the returned evidence into the coordinator ledger, handoff, or next-step queue,
but it must not retry work, redispatch cards, or fabricate closure.

Every terminal return integration must also include a bounded
`sourceActivation` receipt. This is the fail-closed source-thread activation
contract: if the source thread is `active`, `resting`, `completed`, hidden by
latest-turn state, or otherwise not visibly on the returned card, the central
source layer must still retain an owner-visible activation marker or pending
source action. Ordinary completed returns use
`source_thread_activation_required_for_return`; stale unprojected receipts use
`return_projection_missing_after_terminal_return`; follow-up returns use
`pending_source_action_required` alongside the specific pending action issue
code. The activation receipt is bounded metadata only and must not persist raw
task bodies, private thread bodies, endpoint bodies, logs, DB rows, screenshots,
provider payloads, cookies, launch tokens, or secrets.

When a terminal return names a follow-up action, the same integration record
must carry a `pendingSourceAction` projection. `deploy` actions feed the
central deploy request aggregator and are resolved only when the central
coordinator dispatches or supersedes the Deploy Lane card. `blocked` and
`dismissed` dispositions require an explicit bounded reason. The same record's
`sourceActivation.status` must be `pending_source_action` until the action is
resolved, blocked, or dismissed. The source integration Watchdog may surface
stale pending actions, but it must preserve terminal receipt ordering and never
convert the receipt into an active bottom turn.

Execution recovery Watchdog is a last-resort mechanism, not the normal progress
driver. A target thread handling a task card should publish bounded automatic
progress/heartbeat state while work is active. The Watchdog may resume or
surface recovery only after that heartbeat is older than the configured stale
window and the card is still non-terminal, active, and marked
`resumeRequired=true`. Heartbeat freshness must suppress recovery; repeated
Watchdog resumes for the same active card must be rate-limited and idempotent
so a healthy long-running Worker is not repeatedly refreshed.
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
  routes one task card to the configured Home AI deploy lane pool. The default
  lane is `Home AI Deploy`; deployments may use additional live non-terminal
lanes such as `Home AI Deploy Lane A/B/C`, `Codex Mobile Deploy Lane`, or
`Movie Deploy Lane` when configured. Plugin-specific deploy lanes take
precedence over hash or shared-pool selection; Codex Mobile plugin deployments
route to `Codex Mobile Deploy Lane`, and Movie plugin deployments route to
`Movie Deploy Lane` when those live lanes are discoverable. Plugin
implementation threads prepare
  source, tests, commit/push when applicable, deploy plan, and bounded readback
  expectations, but they do not receive sudo password-file paths and do not
  execute production deployment directly. The coordinator stores the deployment
  task-card id, completes the Inbox item, and moves the case to
  `deployment_dispatched` only after task-card transport returns a concrete
  card id;
- if deployment/readback task-card transport throws, reports a routing or
  permission error, or returns no concrete card id, the coordinator must keep
  the case in `deployment_waiting`, mark the attempted deployment slice
  `blocked` with `dispatchStatus=failed`, retain bounded `dispatchFailure`
  evidence, and leave the Owner Inbox projection open;
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
- if verification task-card transport throws, reports a routing or permission
  error, or returns no concrete card id, the coordinator must keep the case in
  `verification_waiting`, mark the verification slice `blocked` with
  `dispatchStatus=failed`, retain bounded `dispatchFailure` evidence, and leave
  the Owner review item open.

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
  to `repair_dispatched` only after task-card transport returns a concrete card
  id;
- if repair task-card transport throws, reports a routing or permission error,
  or returns no concrete card id, the coordinator must keep the case in
  `repair_waiting`, mark the repair slice `blocked` with
  `dispatchStatus=failed`, retain bounded `dispatchFailure` evidence, and leave
  the Owner repair item open;
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

## Main Thread, Worker Thread, And Sub-Agent Rule

The Home AI implementation thread is the central scheduler for Home AI-owned
work. It owns decomposition, write-set boundaries, integration decisions,
conflict resolution, final status, and the authoritative handoff. It may route
bounded slices to Worker threads, but it must not outsource the scheduling
judgment itself.

Worker threads are durable Codex Mobile task-card continuations or dedicated
workspace threads. Use a Worker when the slice has an owning workspace or lane,
can return a terminal task card, and has a clear write-set boundary. Typical
Worker slices include plugin-owned repairs, deployment/readback lanes,
cross-workspace implementation, independent verification, and long-running
bounded probes. Before dispatch, the main thread or coordinator must specify:

- target thread/workspace and expected role;
- allowed files or module boundary;
- acceptance criteria and bounded evidence;
- validation commands or readback probes;
- privacy boundary;
- conflict protocol if the Worker discovers overlapping edits or a missing
  prerequisite.

If a Worker would edit files that overlap with active main-thread changes, or
depends on uncommitted main-thread state, the main thread must either stabilize
that state first or keep the work local. Worker returns must report changed
files, commits, checks, deployment/readback state, residual risks, and any
conflict or blocker. The main thread then integrates the return into the
ledger, handoff, and user-facing status.

Worker dispatch is also the preferred path for independent assistance that did
not originate as a task card when the target thread/workspace is visible and the
work can be bounded. The main thread must still own write-set selection,
sequencing, and final merge decisions. A Worker must not overwrite local changes
from another session; if conflict evidence appears, it returns blocked or
partially completed instead of attempting a local merge.

Duplicate task-card creation or duplicate Web Push notifications for the same
source request are platform defects, not Owner workflow. Dispatch must be
idempotent by source request id, case/slice id, workflow id, and task-card id
where available. If duplicate requests reach an Inbox or plugin topic, only one
may be approved/executed; the duplicate must be marked as a routing or
notification idempotency issue and repaired at the Home AI/Codex Mobile
dispatch boundary.

Sub-agents are transient same-turn helpers, not durable project owners. They do
not replace Codex Mobile task cards, do not own a workspace lifecycle, do not
send return cards, and must not be used to bypass workspace permissions,
deployment-lane ownership, Owner approval, or task-card routing. Use sub-agents
only for bounded read-only analysis, independent review, or small local
investigation where the main thread can inspect and integrate the result before
any commit, deployment, or return.

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
