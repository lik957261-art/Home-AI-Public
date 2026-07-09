# Worker Pool Lifecycle Contract

This contract defines the central Home AI / Codex Mobile Worker pool model used
by Home AI and plugin workspaces. It is a platform contract, not a plugin-local
preference.

## Scope

Worker lanes are durable Codex Mobile task-card targets for bounded,
independently returnable work. They are distinct from:

- source/main threads, which schedule work and merge returned evidence;
- Loop role lanes, which run explicit Loop workflows;
- deploy lanes, which own deployment and production readback;
- audit lanes, which own read-only governance checks;
- Task Intake threads, which ingest work but do not execute ordinary Worker
  slices;
- Public PR threads, which own public pull-request/review work.

All Home AI and plugin main threads must use this role taxonomy when dispatching
Worker cards. A cwd match is not sufficient to prove a valid Worker target.

## Roles

The central role taxonomy is:

- `home_ai_worker`: ordinary Home AI implementation/investigation/review Worker.
- `plugin_worker`: ordinary plugin main-thread implementation/investigation/review Worker.
- `plugin_loop`: explicit plugin Loop role lane.
- `plugin_deployment`: deploy/readback lane.
- `platform_audit` / `plugin_audit`: audit lanes.
- `public_pr`: public pull-request/review lane.
- `task_intake`: intake-only lane.

Role names may be represented as thread role/purpose metadata or, during
transition, by compact title conventions. Explicit metadata is authoritative.
During transition, plugin-specific implementation roles such as
`codex_mobile_implementation` are treated as plugin implementation/Worker
roles for dispatch compatibility; they must not receive `home_ai_worker` cards.

## Lifecycle Operations

The platform Worker lifecycle surface must support metadata-only operations to:

- ensure or create a Worker lane for a role, workspace cwd, source thread, and
  bounded idempotency key;
- resolve/list Worker lanes by role, workspace, plugin id, deliverability, and
  current load;
- retire/disable a Worker lane without deleting audit history;
- mark latest Worker task state without conflating `completed` with
  non-deliverability;
- report heartbeat/progress metadata for active Worker task cards.

If the lifecycle surface cannot create or resolve a legal lane, it must fail
closed with a structured error. It must not return Task Intake, deploy, audit,
Public PR, Loop, or source/current threads as fallback Workers.

## Stable Pool Identity And Naming

Worker lanes are a reusable pool. They are not created per task title,
diagnostic id, bug summary, or source request. Thread titles and lifecycle
aliases must be stable role labels such as `Codex Mobile Worker Lane A`,
`Wardrobe Worker Lane A`, or `Home AI Worker Lane B`. The task objective,
diagnostic case id, source card id, and commit/ref belong in the task-card body
or metadata, not in the Worker lane title.

The scheduler must treat task-title Worker names as a lifecycle sprawl defect.
Examples of task-title names include titles containing a fix summary,
diagnostic case id, task-card id, incident label, or short-lived objective. A
task-title Worker may be used only as a temporary legacy target until the
lifecycle owner normalizes it. The preferred repair is rename or metadata alias
normalization that preserves thread history; deleting Worker threads to hide
sprawl is not a valid repair.

Existing task-specific Worker threads may be renamed to stable pool names by
the Codex Mobile lifecycle owner when the tool surface supports safe rename or
alias migration. If rename is not available, lifecycle metadata must mark the
thread as `needs_title_normalization`, and future dispatch must prefer a stable
pool lane.

## Resolve-Before-Create Lease Flow

Schedulers must resolve/list compatible Worker lanes before creating a new one.
The minimum routing order is:

1. resolve by role, workspace cwd, plugin id when present, and deliverability;
2. if multiple compatible lanes are returned, deterministically select exactly
   one lane by role/purpose, workspace cwd, plugin id, deliverability,
   source-thread exclusion, busy/available state, title-normalization
   preference, and a stable request/idempotency key;
3. reuse an `available` compatible lane;
4. dispatch only after marking the lane `busy` with bounded task-card metadata;
5. require heartbeat for each active task card;
6. after terminal return, mark the lane `available` or `idle` again unless an
   explicit retire/disable condition exists.

`ensure/create` is legal only when no compatible lane exists, all compatible
lanes are actively busy and the dispatch explicitly needs parallel capacity, or
the lifecycle owner has recorded a bounded precondition such as
`missing_role_lane`, `pool_exhausted`, or `no_legal_lane`. Creating a new
Worker while an available compatible lane exists must be reported as
`worker_lane_sprawl`.

Multiple compatible lanes are not an ambiguity blocker. A lifecycle response
may include a bounded candidate set, but the scheduler must reduce that set to
one legal target before creating the task card. If every compatible lane is
busy, the scheduler records `pool_exhausted` and either queues the task, ensures
bounded extra capacity, or dispatches a lifecycle repair/capacity card. It must
not surface a generic "multiple selectable threads" or ask the Owner/model to
choose among equivalent Worker lanes.

## Task-Card Heartbeat And Watchdog Recovery

Every active Worker task card must send bounded heartbeat metadata while it is
working. The heartbeat belongs to the task card, not to the Worker lane. If a
Worker has two active task cards, it must heartbeat both task-card ids
independently. The default task-card heartbeat Watchdog timeout is `1800000ms`
(30 minutes). A Watchdog batch processes at most 8 stale cards, and each active
execution lease is automatically resumed at most once by default. When no
heartbeat is observed for a specific non-terminal task card before the timeout,
the Watchdog must attempt a bounded activation or resume for that same task
card on the same Worker lane instead of creating a new task-title Worker.

The Watchdog recovery must preserve the original task-card id, source thread
id, target Worker lane id, workflow id when present, and privacy boundary. It
must not include raw task bodies, private thread contents, endpoint bodies, or
long logs in the activation message. If the same Worker repeatedly misses
task-card heartbeats, the lane may be marked `needs_attention` or
`temporarily_unavailable` and the scheduler may use another compatible stable
pool lane for future cards. That escalation is a lifecycle state transition,
not permission to create per-task Worker threads.

## Dispatch Rules

Before dispatching a Worker card, the scheduler must validate:

- source thread id and target thread id differ;
- target role/purpose matches the requested dispatch kind;
- target is deliverable and not archived, hidden, deleted, closed, or terminal;
- target workspace/plugin matches the requested boundary when such metadata is
  available;
- the dispatch includes expected validation/readback, terminal return
  requirement, reasoning effort, privacy boundary, and conflict rule.
- the dispatch requires the Worker terminal return-card body and Owner-visible
  receipt to be written in Chinese (`zh-CN`). Bounded machine fields, code
  identifiers, command names, file paths, commit ids, and issue codes may stay
  in their original language.
- the dispatch requires per-task-card heartbeat, a task-card Watchdog timeout of
  `1800000ms`, batch limit `8`, and maximum auto-resume count `1` unless a
  stricter local contract is explicitly supplied.

`status=completed` is a latest-turn state and remains deliverable unless an
explicit non-deliverable lifecycle marker is present.

## Plugin Main Threads

Plugin main/source threads are schedulers for their plugin workspace. They may
analyze requirements and dispatch bounded plugin Worker cards, but they should
not silently perform long-running or independently returnable work inline when a
`plugin_worker` lane is required and available.

Plugin Loop lanes are not ordinary plugin Worker lanes. A plugin Loop lane may
receive only explicit Loop role work. Ordinary plugin implementation cards must
target `plugin_worker` lanes.

## Required Failure Modes

The lifecycle or scheduler must fail closed for:

- missing target thread id/title after lifecycle resolution;
- self-target dispatch;
- role/purpose mismatch;
- archived/hidden/deleted/closed/non-deliverable target;
- lifecycle precondition failures such as missing role or unsupported Loop
  context;
- duplicate ensure requests that cannot be reconciled through idempotency.
- task-title Worker creation when a stable available lane exists;
- terminal Worker return cards whose Owner-visible receipt is not Chinese.
- missing task-card heartbeat/watchdog metadata on Worker task cards.

The lifecycle or scheduler must not fail closed solely because more than one
compatible Worker lane exists. That condition must be handled by deterministic
selection, lane lease state, or the structured `pool_exhausted` /
`missing_role_lane` / `no_legal_lane` create reasons above.

## Validation

Source validation must include focused tests proving:

- Home AI Worker targets reject Task Intake, deploy, audit, Public PR, and
  source-thread fallbacks;
- plugin Worker targets reject plugin Loop lanes and deploy lanes;
- completed-but-deliverable Worker lanes remain eligible;
- retired/archived/hidden Worker lanes are excluded;
- duplicate ensure requests are idempotent when the lifecycle surface supports
  lane creation;
- Worker task-card heartbeat/status readback is metadata-only.
- multiple compatible plugin Worker lanes are reduced to exactly one target
  before dispatch, and busy pools produce `pool_exhausted` rather than
  `target_ambiguous`;
- plugin and Home AI Worker card requirements include Chinese terminal receipt
  language, stable Worker pool reuse, resolve-before-create, busy/available
  lease state, per-task-card heartbeat, `1800000ms` task-card Watchdog
  recovery, batch limit `8`, max auto-resume `1`, and sprawl rejection.

## Privacy

Lifecycle and Worker-pool evidence must not include raw task bodies, private
thread contents, endpoint bodies, database rows, screenshots, cookies, launch
tokens, access keys, local operator secret paths, or long logs.
