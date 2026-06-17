# Hermes Mobile Architecture Boundary

This document is a repository contract for new Hermes Mobile work.

Reusable Codex skill: `$service-first-architecture`.

## Service-First Rule

New product behavior must be implemented as a service or provider before it is wired into `server.js`.

Default locations:

```text
adapters/<domain>-service.js
tests/<domain>-service.test.js
```

`server.js` is the thin process entrypoint. It should do little more than load
the runtime composition module and preserve the deployment command surface.

## Architecture Gates

Architecture gates should measure structure and ownership, not physical line
counts. Do not use physical line-count ceilings as architecture gates for
services, route modules, frontend modules, or composition files. Line count is
too easy to satisfy by deleting blank lines, compressing helper functions, or
making dense one-line statements; those changes reduce readability without
improving the architecture.

Use structured, testable constraints instead:

- new business behavior lives in a named service/provider or focused route
  module before it is wired into an entrypoint;
- entrypoints and composition roots do not regain forbidden ownership
  regressions such as filesystem policy, Gateway lifecycle state machines,
  model prompt construction, permission policy, persistence rules, or plugin
  business logic;
- services expose stable factories or explicit public functions that can be
  tested without loading the full runtime root;
- route modules stay domain-scoped and delegate policy decisions to services;
- frontend split modules remain separately loaded and do not move back into the
  monolithic `public/app.js` state root;
- harnesses assert the specific ownership boundary, export contract, route
  wiring, or forbidden regression they care about.

Physical line counts may still be used as diagnostic metadata in refactor
planning, but they are not pass/fail gates and must not motivate one-line
compression.

`mobile-server-runtime.js` is the transitional runtime composition root while
the remaining wiring is split into smaller service and route composition
modules. It may:

- register routes and route modules;
- read authenticated request context;
- validate request shape at the boundary;
- call services/providers;
- stream or return HTTP responses;
- keep short compatibility wrappers while a larger extraction is in progress.

Route composition modules should stay domain-scoped. The main
`server-routes/mobile-api-composition.js` module owns top-level route
aggregation, service collection, and dispatcher construction only. Platform
route construction belongs in `server-routes/mobile-api-platform-composition.js`.
Domain-heavy route/service graphs, such as Directory/file/artifact/Note receipt
wiring or Growth/Learning and Kanban study wiring, belong in focused
composition modules such as `server-routes/mobile-api-directory-composition.js`
and `server-routes/mobile-api-learning-composition.js`.

`server-routes/mobile-api-directory-composition.js` is only the route
composition boundary for Directory browser, Directory mutation/share,
file/artifact read, and Note receipt routes. It may construct
`note-receipt-save-service.js` and delegate Directory/shared-directory behavior
through existing boundary services, but it must not implement Directory path
authorization, file preview/transformation, artifact persistence, shared-root
policy, or Note plugin business behavior.

`server-routes/mobile-api-platform-composition.js` is only the route composition
boundary for public setup/status, system status, Owner elevation, access-key,
runtime-config, Push, Workspace, platform-currency, Resource, and Weixin ingress
routes. It may construct `platform-currency-service.js`, but it must not own
plugin business services, thread/message runtime behavior, Directory path
authorization, Growth/Learning graphs, Todo/Automation domain behavior, or
dispatcher registration policy.

Current runtime glue that should stay out of the composition root lives in
focused adapters such as `app-route-url-service.js`,
`automation-job-filter-service.js`,
`mobile-runtime-basic-helper-service.js`,
`mobile-runtime-boot-trace-service.js`,
`mobile-runtime-access-policy-facade-service.js`,
`mobile-runtime-file-helper-service.js`,
`mobile-runtime-file-access-facade-service.js`,
`mobile-runtime-artifact-facade-service.js`,
`mobile-runtime-auth-facade-service.js`,
`mobile-runtime-backend-policy-service.js`,
`mobile-runtime-config-facade-service.js`,
`runtime-config-effective-service.js`,
`runtime-config-gateway-worker-service.js`,
`runtime-config-key-service.js`,
`runtime-config-model-service.js`,
`runtime-config-public-projection-service.js`,
`runtime-config-save-service.js`,
`mobile-runtime-environment-service.js`,
`mobile-runtime-env-value-service.js`,
`mobile-runtime-gateway-environment-service.js`,
`mobile-runtime-gateway-composition-options-service.js`,
`mobile-runtime-gateway-concurrency-service.js`,
`mobile-runtime-gateway-context-facade-service.js`,
`mobile-runtime-gateway-facade-service.js`,
`mobile-runtime-gateway-provider-service.js`,
`mobile-runtime-gateway-status-service.js`,
`gateway-runtime-composition-service.js`,
`gateway-runtime-subservice-options-service.js`,
`gateway-run-request-builder-service.js`,
`gateway-run-start-assistant-options-service.js`,
`gateway-run-start-child-service-registry-service.js`,
`gateway-run-start-event-service.js`,
`gateway-run-start-execution-phase-service.js`,
`gateway-run-start-permission-service.js`,
`gateway-run-start-plugin-probe-service.js`,
`gateway-run-start-preparation-service.js`,
`gateway-run-start-stream-handoff-service.js`,
`gateway-run-start-stream-options-service.js`,
`gateway-run-start-state-service.js`,
`gateway-run-start-target-phase-service.js`,
`gateway-run-start-target-service.js`,
`gateway-run-start-toolset-preflight-service.js`,
`gateway-run-start-toolset-selection-service.js`,
`gateway-run-start-wardrobe-gate-service.js`,
`gateway-run-content-service.js`,
`gateway-run-stream-completion-service.js`,
`gateway-run-stream-close-recovery-service.js`,
`gateway-run-stream-event-service.js`,
`gateway-run-stream-failure-service.js`,
`gateway-run-stream-first-event-service.js`,
`gateway-run-stream-liveness-service.js`,
`gateway-run-stream-liveness-timer-service.js`,
`gateway-run-stream-registry-service.js`,
`gateway-run-stream-stop-service.js`,
`mobile-runtime-group-chat-facade-service.js`,
`mobile-runtime-group-chat-attachment-service.js`,
`mobile-runtime-kanban-environment-service.js`,
`mobile-runtime-kanban-facade-service.js`,
`mobile-runtime-local-bridge-facade-service.js`,
`mobile-runtime-natural-language-gateway-service.js`,
`mobile-runtime-owner-elevation-facade-service.js`,
`mobile-runtime-path-access-service.js`,
`mobile-runtime-path-candidate-environment-service.js`,
`mobile-runtime-public-status-service.js`,
`mobile-runtime-sqlite-store-facade-service.js`,
`mobile-runtime-state-facade-service.js`,
`mobile-runtime-state-path-environment-service.js`,
`mobile-runtime-system-status-facade-service.js`,
`mobile-runtime-thread-facade-service.js`,
`mobile-runtime-thread-view-facade-service.js`,
`mobile-runtime-todo-facade-service.js`,
`mobile-runtime-weixin-facade-service.js`,
`mobile-runtime-workspace-identity-facade-service.js`,
`mobile-runtime-workspace-facade-service.js`,
`mobile-runtime-workspace-catalog-facade.js`,
`runtime-operation-error-response-service.js`, and
`mobile-runtime-http-server-service.js`. These modules keep static file
app route URL serialization, Automation job filtering, deterministic runtime primitives,
access-policy sanitize/harden composition,
auth-provider delayed delegation,
boot trace side-effect wiring, helpers and JSON store file IO,
Artifact/Markdown registration lazy delegation, backend mode policy, runtime
config facade delegation, runtime environment aggregation, shared environment
value parsing, Gateway/run environment parsing,
Gateway runner/pool/launcher/provisioning/telemetry lazy delegation, Gateway
status composition and pool-health fallback projection, Gateway run content
truncation policy, group-chat public projection/revoke policy,
group-chat attachment runtime wiring,
Kanban/reading environment parsing, Local Bridge runtime lazy delegation,
natural-language Gateway text execution,
Kanban topic/projection/plan/assessment lazy delegation, Owner elevation
grant/routing lazy delegation,
WSL/config path candidate parsing, public status projections, runtime state
normalization/persistence lazy delegation, DATA_DIR-derived state/storage path
parsing, system status lazy delegation, thread runtime composition delegation,
thread view projection lazy delegation, Todo/direct-create runtime delegation,
Weixin runtime composition delegation, workspace identity fallback delegation,
local workspace store/projection, workspace access/auth gate, access-key
operation, sender label, and principal-to-workspace lazy
delegation, workspace catalog lazy
delegation, operation error response formatting, and HTTP request/response
primitive plus process lifecycle wiring
addressable through CodeGraph without loading the full runtime root.

`mobile-runtime-artifact-facade-service.js` is only a runtime wiring facade. It
may lazy-create `artifact-text-registration-service.js` and delegate upload
access to `file-artifact-access-service.js`. It may own bounded artifact path
recovery from already-visible message content for resolver fallback, but it
must not implement file conversion, path authorization, Markdown discovery
policy, artifact persistence, or `saveState` behavior. The source Markdown
search cache must remain process-scoped, not per request.

`mobile-runtime-thread-view-facade-service.js` is only a runtime wiring facade
over `thread-view-service.js` plus bounded thread event append/preview
retention. It must not implement message filtering, message pagination,
task-group projection, external-delivery projection, or public thread shape
rules; those stay in `thread-view-service.js`.

`mobile-runtime-todo-facade-service.js` is only a runtime wiring facade for
workspace-principal lookup, Todo assignee projection, and direct Todo/Kanban
create parsing delegates. It must not implement Todo persistence, Kanban card
creation, Local Bridge execution, or Gateway/tool routing; those stay in their
own providers and route/runtime services.

`gateway-run-content-service.js` owns deterministic Gateway run content
truncation helpers for live streaming append and final full-content compaction.
`mobile-server-runtime.js` may wire those helpers into Gateway runtime
composition and state normalization, but it must not carry duplicate
`appendBounded`, `compactFullContent`, or SSE frame parsing implementations.

`gateway-run-stream-completion-service.js` owns Gateway stream reader completion
handoff: mapping aborted streams with a stored failure reason to failed
thread/message state, mapping aborted streams without a stored reason to
cancelled state, ignoring streams that already observed a terminal Gateway
event, and delegating non-terminal stream closure to the close-recovery service.
It must not read response streams, parse Gateway events, own active stream
storage, schedule timers, stop remote runs, or mutate Gateway targets.

`gateway-run-stream-event-service.js` owns deterministic Gateway stream event
projection helpers: event/run id extraction, terminal-event detection,
output-message text detection, stream event preview formatting, tool-call name
projection, and Web-search tool budget counting/abort projection. It must not
read response streams, own active stream storage, check liveness, call Gateway
runner APIs, or mark thread/message terminal state.

`gateway-run-stream-close-recovery-service.js` owns the stream-closed-without-
terminal recovery projection: choosing between synthetic `response.completed`
after model output has arrived and cancellation when no usable model output
arrived. It must not read response streams, own active stream storage, check
liveness, stop remote runs, or mutate Gateway targets.

`gateway-run-stream-first-event-service.js` owns first Gateway stream event
timer projection: scheduling and clearing the first-event warning timer,
emitting `run.model_first_byte_retrying`, incrementing warning attempts, and
rescheduling until the first Gateway event or a failure arrives. It must not
read response streams, parse Gateway events, own active stream storage, stop
remote runs, or mutate terminal thread/message state.

`gateway-run-stream-failure-service.js` owns Gateway stream reader failure
projection: emitting `run.stream_failed` with the user-facing Gateway error
preview, mapping aborted streams with a stored failure reason to failed
thread/message state, mapping user-stop-marked aborted streams to cancelled
state, mapping untracked aborted streams to failed state, and mapping ordinary
reader errors to failed state. It must not
read response streams, parse Gateway events, own active stream storage, check
liveness, stop remote runs, or mutate Gateway targets.

`gateway-run-stream-liveness-service.js` owns Gateway active-run liveness
checking: start-timeout detection before a real run id exists, delayed liveness
check suppression after recent events, Gateway `checkRun` execution, timeout
signal creation, lifecycle decision application, liveness warning/stale event
projection, miss counter mutation, and failed-abort handoff. It must not own
active stream storage, read response streams, parse Gateway events, stop remote
runs, or mark thread/message terminal state.

`gateway-run-stream-liveness-timer-service.js` owns Gateway stream liveness
timer lifecycle: reading the liveness interval setting, scheduling the periodic
active-run liveness check, logging rejected checks, applying the minimum timer
interval, unrefing timers, and clearing stored timer handles during stream
cleanup. It must not check Gateway liveness itself, read response streams, parse
Gateway events, own active stream storage, stop remote runs, or mutate
thread/message terminal state.

`gateway-run-stream-registry-service.js` owns the active Gateway stream
registry: public run id lookup, real run id aliases, Gateway target/url lookup
from active streams or the pool fallback, alias cleanup, active stream count,
and idempotent failed-abort flagging. It must not read response streams, parse
Gateway events, emit Hermes run events, perform liveness checks, stop remote
runs, or mark thread/message terminal state.

`gateway-run-stream-stop-service.js` owns Gateway stream stop projection:
deduping requested run ids, aborting local active streams, stopping remote
Gateway runs through the selected runner, stop timeout projection, and 404-as-
already-stopped handling. It must not read response streams, parse Gateway
events, emit Hermes run events, check liveness, or mutate terminal thread/message
state.

`gateway-run-stream-state-service.js` owns deterministic response stream state
initialization: controller/thread/message binding, Gateway worker metadata,
default runner URL fallback, initial timestamps, timer slots, liveness counters,
first-output markers, timeout overrides, Web-search budget limit, and per-stream
tool budget counter allocation. It must not register active streams, start
readers, schedule timers, parse events, emit telemetry, stop runs, or mark
thread/message terminal state.

`gateway-run-stream-service.js` owns Gateway response stream orchestration:
event reading, stream telemetry projection, liveness scheduling handoff,
tool-budget event handoff, and terminal failure/cancel/completion handoff. It
must delegate active-stream registry,
run-id aliasing, Gateway target/url lookup, alias cleanup, and failed-abort
flagging to `gateway-run-stream-registry-service.js`. It must delegate
deterministic event parsing, terminal-event detection, output-text detection,
preview formatting, and Web-search tool budget counting/abort projection to
`gateway-run-stream-event-service.js`. It must delegate active-run liveness
checking to `gateway-run-stream-liveness-service.js`. It must delegate
stream-closed-without-terminal recovery to
`gateway-run-stream-close-recovery-service.js`. It must delegate remote/local
run stop handling to `gateway-run-stream-stop-service.js`. It must delegate
first-event warning timer scheduling and clearing to
`gateway-run-stream-first-event-service.js`. It must delegate stream reader
failure projection to `gateway-run-stream-failure-service.js`. It must delegate
liveness interval scheduling and clearing to
`gateway-run-stream-liveness-timer-service.js`. It must delegate reader
completion/abort terminal handoff to
`gateway-run-stream-completion-service.js`. It must delegate deterministic
stream-state initialization to `gateway-run-stream-state-service.js`.

`mobile-runtime-gateway-context-facade-service.js` owns stale tool-availability
claim detection delegates for HTTP, image, DOCX, and audio tool schemas. Weixin
runtime wiring may receive delayed delegates to this facade, but
`mobile-server-runtime.js` must not define duplicate
`isStaleHttpToolAvailabilityClaim` or `isStaleImageToolAvailabilityClaim`
wrapper functions.

`mobile-runtime-gateway-composition-options-service.js` owns the runtime
dependency-to-option projection for `gateway-runtime-composition-service.js`.
It may map delayed runtime delegates, service facades, and stable runtime
constants into run-start, run-stream, run-event, queue, selector, notification,
and topic-compaction options. It must not implement Gateway run lifecycle,
queue mutation, stream parsing, model preflight decisions, or notification
delivery behavior.

`runtime-config-effective-service.js` owns runtime-config default/effective
value resolution for Hermes Gateway URL, Web Push subject, and Web Push VAPID
path: option-function fallback, trailing-slash trimming, path resolution, and
`load()` fallback when no config is passed. `runtime-config-provider.js` keeps
persisted config load/write and must not inline effective/default value helper
functions.

`runtime-config-gateway-worker-service.js` owns runtime-config Gateway worker
setting composition: injected base elastic env config normalization, persisted
Gateway worker override application, elastic scheduler config projection, public
effective/override/definition projection, and `load()` fallback when no config
is passed. `runtime-config-provider.js` keeps persisted config load/write and
must not inline worker setting-to-elastic or public worker setting projection.

`runtime-config-model-service.js` owns the runtime-config model catalog and
model selection normalization: frozen catalog entries, default model selection,
public model option/family projection, provider/model id construction, and
reasoning-effort validation. `runtime-config-provider.js` keeps persistence and
service wiring only and must not inline model catalog or selection helper
functions.

`runtime-config-public-projection-service.js` owns runtime-config public
projection for Owner settings: Gateway URL/key status metadata, model catalog
fields, Gateway worker runtime settings projection, Web Push status metadata,
and update metadata. `runtime-config-provider.js` remains the persistence,
validation, Gateway worker service delegation, effective-service delegation,
model-service delegation, and key-service delegation provider; it must not
inline public projection object construction.

`runtime-config-key-service.js` owns runtime-config API key discovery and
status projection: direct environment variables, configured key files,
configured env files, file parsing compatibility, unreadable file fallback, and
non-secret source metadata. `runtime-config-provider.js` keeps the persisted
`hermesApiKeyPath` value and injected default path/env-file lists but must not
inline `API_SERVER_KEY` / `HERMES_API_KEY` scanning loops or key-file parsing.

`runtime-config-save-service.js` owns runtime-config save input normalization
and next-config payload construction: camel/snake field fallback, strict Gateway
worker setting merge, model selection normalization, Gateway URL/Web Push
subject validation handoff, and update metadata. `runtime-config-provider.js`
keeps load/write persistence and key-service delegation and must not inline save input
normalization.

`mobile-runtime-gateway-concurrency-service.js` owns runtime Gateway
concurrency projection: current active-run snapshot, per-workspace limit-error
projection, and bounded capacity assertion errors. It must not define
concurrency policy, mutate thread state, choose workers, start streams, or
handle permission decisions.

`mobile-runtime-gateway-provider-service.js` owns runtime Gateway provider
lifecycle wiring: lazy single-runner, Gateway pool, profile launcher, workspace
provisioning, usage telemetry, run target selection, run target release/replace
delegates, and status-service construction. It must not own Gateway runtime
composition, Gateway status fallback projection, run-start lifecycle
transitions, permission decisions, toolset selection, or concurrency policy.

`mobile-runtime-gateway-status-service.js` owns Gateway status composition:
single-runner status read, Gateway Pool status attachment, bounded pool-status
failure projection, and pool-health fallback that marks Gateway status ok when
the single runner is unavailable but the pool is healthy. It must not construct
Gateway runners, Gateway Pool, profile launchers, workspace provisioning,
telemetry providers, runtime composition, run-start lifecycle, or concurrency
policy.

`gateway-runtime-composition-service.js` owns the public Gateway runtime
facade over queue, start, stream, event, and lifecycle services. It may hold the
small controller methods that coordinate those child services and the
run-target release/replace glue, but it must not own child-service factory
imports, lazy child-service singleton construction, or the large child-service
option projection.

`gateway-runtime-child-service-registry-service.js` owns lazy child-service
construction for Gateway queue, start, stream, event, and lifecycle services:
default child-service factories, lifecycle service creation, subservice option
service creation, controller handoff, and singleton reuse. It must not expose
the public Gateway runtime facade, mutate active run targets, implement queue
policy, parse streams, handle events, or define child-service option fields.

`gateway-runtime-subservice-options-service.js` owns the deterministic
dependency-to-option projection from the Gateway runtime composition dependency
bag into the queue, start, stream, and event child-service constructors. It
must not implement Gateway lifecycle transitions, queue mutation, stream
parsing, event handling, toolset selection, or notification delivery.

`gateway-run-request-builder-service.js` owns deterministic Gateway run request
construction: actor workspace resolution, policy-thread projection, task
directory and project selection, plugin-topic requirements, required Skill
preload metadata, model-first toolset companion expansion, plugin capability
context application, conversation history/instruction body construction, and
Gateway routing metadata. It must not mutate thread/message state, choose a
Gateway worker, run model preflight, emit/broadcast run events, or start a
stream.

`gateway-run-start-assistant-options-service.js` owns deterministic assistant
run-options projection for Gateway start handoff: access policy context,
Gateway conversation id, tool schema epoch, required Skill preload metadata,
loaded Skill chip entries, plugin capability catalog/probe metadata, toolset
routing metadata, search source fields, and wardrobe workflow gate metadata.
It must not build Gateway requests, choose workers, run model preflight,
mutate thread run state, emit events, or start streams.

`gateway-run-start-event-service.js` owns Gateway run-start telemetry event
projection: run-start event append/broadcast, scheduler event projection,
plugin capability probe events, required Skill preload events, context/gateway
preview text, model-first toolset routing previews, fallback previews, and
permission-preflight event naming. It must not mutate run lifecycle state,
choose workers, run model preflight, build Gateway request bodies, or start
streams.

`gateway-run-start-execution-phase-service.js` owns the run-start execution
phase after target selection and plugin capability probing: stream option
projection handoff, model-first toolset preflight invocation, permission
terminal handoff, preflight request/run-options refresh, and final stream
handoff invocation. It must not choose workers, build the initial request,
define selector/toolset policy, define stream-start state mutation, parse
streams, or mutate queues.

`gateway-run-start-permission-service.js` owns the terminal projection for a
model-side permission/elevation request during run start: assistant message
elevation metadata, `run.permission_required` event projection, active-run
release, idle thread status, state save handoff, message update broadcast, and
the `needs_elevation` start response. It must not choose workers, build Gateway
requests, run selector models, mutate toolsets, or start streams.

`gateway-run-start-plugin-probe-service.js` owns plugin capability probe
execution during run start: fallback probe service creation, optional probe
execution, probe-result run-options projection, request rebuild after probe
evidence, Wardrobe gate metadata refresh, plugin capability event projection,
and delayed `run.context_ready` projection. It must not choose workers, define
plugin activation policy, build the initial request, run model preflight, mutate
queues, or start streams.

`gateway-run-start-preparation-service.js` owns the initial Gateway run-start
preparation handoff: actor workspace resolution, concurrency-capacity assertion,
public task id creation, preparing-state publication, first state-save/message
broadcast handoff, `run.request_preparing` telemetry, initial request build
handoff, `pre_gateway` Wardrobe checkpoint, assistant run-options projection,
required Skill preload event projection, and failed-gate terminal handoff. It
must not choose workers, define access/toolset policy, run plugin probes, run
model preflight, mutate queues after worker selection, or start streams.

`gateway-run-start-stream-handoff-service.js` owns the final Gateway stream-start
handoff after target selection, plugin capability probing, and model-first
toolset preflight have finished: the final `pre_stream` Wardrobe checkpoint,
assistant run-options refresh, final Wardrobe metadata projection,
`run.request_sent` telemetry event, enabled-toolset normalization, state-save
handoff, `streamResponse` invocation, and the public `started` response shape.
It must not choose workers, define toolset policy, build the initial request,
run model preflight, mutate queues, or own stream parsing/liveness behavior.

`gateway-run-start-stream-options-service.js` owns deterministic stream-start
option projection for Gateway start handoff: Gateway target metadata, Web/search
max-call caps, explicit search cap selection, and ChatGPT Pro long-wait timeout
fields. It must not choose workers, mutate request/thread state, run model
preflight, emit events, or start streams.

`gateway-run-start-state-service.js` owns deterministic Gateway run-start state
projection helpers: active-run publication, preparing/started assistant and
thread state mutation, compact message-update broadcast, and failed-start
projection. It must not choose workers, build Gateway requests, run model
preflight, emit run-start telemetry events, or start streams.

`gateway-run-start-target-phase-service.js` owns target-selected phase
orchestration during run start: worker target selection handoff, the
`gateway_selected` Wardrobe checkpoint, target start projection, context-ready
event projection, plugin capability probe invocation, request/run-options
handoff after probing, and failed-gate terminal handoff. It must not build the
initial request, define worker selection policy, define plugin activation
policy, run model-first toolset preflight, mutate queues, or start streams.

`gateway-run-start-target-service.js` owns deterministic Gateway target
selection handoff and post-selection projection: passing scheduler events back
to run-start telemetry, applying started-state target metadata to the assistant
message, deciding whether plugin capability probing should delay the
`run.context_ready` event, and projecting context-ready/gateway-selected start
events. It must not build Gateway requests, evaluate Wardrobe workflow gates,
select toolsets, run model preflight, mutate queues, or start streams.

`gateway-run-start-toolset-preflight-service.js` owns model-first toolset
preflight execution and projection during run start: forced selection replay,
selector start/failure/success event projection, selected-toolset request
rebuild, fallback to authorized toolsets, Wardrobe gate metadata refresh, and
handoff to the permission/elevation terminal projection. It must not choose
workers, define toolset policy, build the initial request, mutate run queue
state, or start streams.

`gateway-run-start-toolset-selection-service.js` owns deterministic run-start
request mutation around model-first toolset selection: restoring authorized
toolsets after selector fallback and inserting bounded toolset-escalation
instructions after a successful selection. It must not choose workers, call the
selector model, decide permissions, define toolset policy, emit events, or start
streams.

`gateway-run-start-wardrobe-gate-service.js` owns deterministic run-start
integration with the Wardrobe workflow gate: stage evaluation, idempotent
instruction insertion, failed-gate event projection, and failed-start handoff.
It must not define Wardrobe product rules, choose workers, select toolsets, run
model preflight, mutate ordinary run state, or start streams.

`gateway-run-start-child-service-registry-service.js` owns Gateway run-start
child-service wiring: option normalization, default factory selection, request
builder construction, and run-start event/state/assistant-option/Wardrobe/
toolset/target/permission/plugin-probe/stream-handoff/execution/preparation
service construction. It also owns the public helper delegation needed by
`gateway-run-start-service.js`. It must not execute run phases, choose workers,
run model preflight, mutate lifecycle state, emit events, or start streams.

`gateway-run-start-service.js` owns only Gateway run-start phase orchestration:
initial preparation, target-selected phase, and execution phase in order. It
passes refreshed run options and request state between those phases, returns
terminal preparation/target results, and exposes the compatibility helper
facade. It must delegate child-service construction, default dependencies, and
option normalization to `gateway-run-start-child-service-registry-service.js`.
It must not directly construct run-start child services, choose workers, run
model preflight, mutate lifecycle state, emit events, or start streams.

`gateway-run-queue-projection-service.js` owns deterministic queued-run
projection: single-window mode normalization, queued instruction text,
queued run-options merge, queued assistant message construction, and queued
conversation-history compaction handoff. It must not start Gateway runs,
schedule queued work, mutate active run ids, mark terminal thread/message
state, save runtime state, or broadcast events.

`gateway-run-queue-service.js` owns single-window queued-run scheduling and
active-run lifecycle handoff. It must delegate queued run-options projection,
queued assistant message creation, queued instruction text, and queued history
compaction to `gateway-run-queue-projection-service.js`. It must not inline
queued prompt text, single-window mode normalization, queued message factory
defaults, or conversation compaction policy.

`gateway-run-terminal-state-service.js` owns deterministic failed, cancelled,
and detached active-run terminal projection: terminal target lookup, terminal
status guards, user-facing error shaping, streaming save-timer clearing,
failed/cancelled message and thread mutation, external delivery enqueue for
failures, active-run removal, terminal topic-compaction handoff, state save,
broadcast, terminal notification, queued follow-up scheduling, and detached
active-run reconciliation. It must not parse Gateway events, handle completed
output text, evaluate Wardrobe completion, perform toolset escalation retry,
read streams, manage active-stream aliases, select workers, or issue remote
stop requests.

`gateway-run-evidence-service.js` owns deterministic run evidence parsing:
Skill reference normalization, loaded-Skill extraction from run events and
completed responses, loaded-tool extraction from run events, output items, and
completed responses, output item tool/call-id/function-name summaries, previous
function-call lookup for `function_call_output`, and message output text
extraction. It must keep raw tool arguments, raw tool output, private response
text, secrets, and full file payloads out of event previews. It must not mutate
threads/messages, broadcast, save runtime state, schedule queued work, parse
Gateway terminal state, or decide toolset escalation.

`gateway-run-toolset-escalation-service.js` owns deterministic model-first
toolset escalation projection helpers: escalation marker parsing, selected and
omitted authorized toolset extraction from run options/policy metadata,
retryable and blocked toolset derivation, user-facing insufficient-toolset
message construction, marker sanitization, common web companion expansion, and
the user-message lookup used for retry. It must not start a retry run, mutate
assistant messages, add thread events, broadcast, save runtime state, notify
users, parse run evidence, or decide the original model-first selector result.

`gateway-run-toolset-escalation-retry-service.js` owns execution-round toolset
escalation retry state: retry-cap enforcement, retry run-option projection,
assistant-message reset to `queued`, `run.toolset_escalation_retrying` event
projection, retry start scheduling, and rejected-retry failure projection. It
may import deterministic helper functions from
`gateway-run-toolset-escalation-service.js`, but must receive side effects
through dependencies: event append, state save, broadcast, terminal
notification, clock, scheduler, and `startToolsetEscalationRun`.

`gateway-run-completion-service.js` owns completed-run projection after a
Gateway `run.completed` or `response.completed` event has already been routed:
completed output extraction, model/provider/reasoning usage metadata backfill,
loaded Skill/tool evidence backfill from run events and completed responses,
toolset-escalation-required event projection before retry, permission approval
marker projection, Wardrobe outfit completion advisory handoff, successful
terminal `done` mutation, artifact registration handoff, terminal delivery,
topic compaction, completed broadcast, terminal notification, and queued
follow-up scheduling. It must receive side effects through dependencies and
must not parse arbitrary Gateway events, read response streams, manage active
stream aliases, select workers, start original runs, or own deterministic
toolset marker parsing.

`gateway-run-delta-event-service.js` owns in-run text-delta projection:
bounded delta append, first-feedback and updated timestamps, message/thread
mutation, streaming state-save scheduling, visible delta broadcast, and
model-first toolset escalation marker sanitization for partial deltas. It must
not parse arbitrary Gateway events, manage active-stream aliases, append thread
run events, mutate terminal state, schedule queued runs, select workers, or own
completed-run projection.

`gateway-run-response-created-service.js` owns response-created alias
projection: mapping the public run id to the real response id, updating the
active-stream alias map, preserving the first original run id, replacing the
thread active-run id, saving state, and broadcasting the updated assistant
message. It must not parse arbitrary Gateway events, mutate terminal state,
append thread events, process output text, select workers, or schedule queued
runs.

`gateway-run-output-event-service.js` owns in-run output event projection:
message output text updates, output item run events, loaded Skill/tool evidence
updates for output items, `function_call_output` readable summaries,
`run.final_message_started`, and `run.final_message_done`. It must keep raw
tool arguments, raw tool output, and final response text out of event previews.
It must not parse arbitrary Gateway events, manage active-stream aliases, mutate
terminal state, schedule queued runs, select workers, or own completed-run
projection.

`gateway-run-streaming-save-service.js` owns throttled streaming state-save
lifecycle: immediate save when throttling is disabled, pending-save coalescing,
timer scheduling, timer clearing, optional timer `unref`, and bounded logging
when the deferred save fails. It must not mutate threads/messages, parse
Gateway events, broadcast, compact topics, schedule queued runs, or own
terminal state.

`gateway-run-lifecycle-service.js` owns Gateway lifecycle event taxonomy and
phase contract: preparation, target selection, plugin capability probing,
model-first preflight, stream handoff, stream evidence, stream liveness,
stream recovery, terminal projection, and toolset escalation. It also owns
event-name normalization, run-id extraction, terminal status mapping, event
phase classification, stable/branch event lists, source-file coverage checks,
active-run id set helpers, queued-run decisions, and liveness decisions. It
must remain pure deterministic lifecycle policy and must not mutate
threads/messages, broadcast, save state, schedule workers, or call Gateway
runner APIs.

`gateway-run-event-service.js` owns Gateway event parsing and ordinary in-run
event persistence: run id resolution, lifecycle-classified event dispatch,
target lookup, and ordinary non-terminal event append/broadcast.
It must delegate completed-run projection to `gateway-run-completion-service.js`,
text-delta projection to `gateway-run-delta-event-service.js`,
response-created alias projection to
`gateway-run-response-created-service.js`,
output-item/final-message projection to
`gateway-run-output-event-service.js`,
streaming state-save lifecycle to `gateway-run-streaming-save-service.js`,
Skill/tool evidence parsing and toolset marker parsing/sanitization through the
delta/output/completion projection services that call
`gateway-run-toolset-escalation-service.js`, toolset escalation retry execution
to `gateway-run-toolset-escalation-retry-service.js`, and failed/cancelled
terminal state plus detached active-run reconciliation to
`gateway-run-terminal-state-service.js`.

`app-route-url-service.js` owns app-shell query URL serialization for Push,
Web Push, plugin notification, and other route-link producers. Runtime
composition may pass the helper into route/service wiring, but it must not carry
a duplicate `appRouteUrl` function implementation.

`automation-job-filter-service.js` owns deterministic Automation/Cron job
filtering for owner visibility and list search matching. Route composition may
use it through runtime dependencies, but `mobile-server-runtime.js` must not
carry duplicate `cronJobMatchesSearch`, `cronJobMatchesOwner`, or cron cache
clear wrapper function implementations.

`mobile-runtime-local-bridge-facade-service.js` owns Local Bridge lazy runtime
delegation for Todo, Cron, Directory, and local process execution. Runtime
composition may provide early delayed delegates for startup-order reasons, but
`mobile-server-runtime.js` must not define duplicate `runDirectoryBridge` or
`runProcessText` wrapper functions.

`runtime-operation-error-response-service.js` owns the small Todo/Kanban
operation-error JSON response wrappers. Route composition may keep receiving
`todoErrorResponse` and `kanbanErrorResponse` delegates, but
`mobile-server-runtime.js` must not carry duplicate function implementations for
those response shapes.

`mobile-runtime-auth-facade-service.js` owns delayed runtime delegation to
`auth-provider.js` for `authenticateRequest`, `authCanAccessWorkspace`, and
`isOwnerAuth`. Runtime composition may pass these delegates before
`authProvider` is materialized, but it must not carry duplicate top-level
auth-provider wrapper functions.

`path-boundary-service.js` owns deterministic path comparison primitives used
by Directory, shared-root, project-discovery, and runtime composition code:
boundary normalization, comparable path keys, root containment checks, and
relative child checks. Runtime composition and provider modules may configure
options such as slash-first comparison or WSL mount conversion, but they must
not carry duplicate `comparablePath`, `pathInsideAnyRoot`,
`pathRelativePartsUnderRoot`, or `pathDirectChildOfRoot` implementations.

`mobile-runtime-path-access-service.js` owns the runtime path-access facade over
filesystem mount normalization, security-boundary filtering, global allowed-root
checks, and thread path-policy checks. It may resolve filesystem, path-policy,
and security-boundary providers through injected getters to break runtime
startup-order cycles. `mobile-server-runtime.js` may keep delegate constants
such as `normalizeLocalPath`, `windowsPathToWsl`, and
`isPathAllowedForThread` for dependency wiring, but it must not carry duplicate
top-level implementations of path normalization, allowed-root filtering,
global path authorization, thread directory-browser authorization, or a
top-level path-access service factory.

`mobile-runtime-state-facade-service.js` owns runtime state normalization,
chat-group member projection, and persistence lazy delegation. Runtime
composition may bind facade methods as readable delegates, including the
`saveState(next = state, options = {})` runtime default that depends on the
mutable in-memory `state`, but it must not carry duplicate top-level wrapper
functions for `ensureDataDir`, `defaultState`, `loadState`, `normalizeState`,
push normalization helpers, `pushSubscriptionScopeSignature`,
`normalizeChatGroup`, `chatGroupMemberWorkspaceIds`, or `saveState`.

`mobile-runtime-sqlite-store-facade-service.js` owns lazy SQLite service-store
factory construction, migration-on-first-use, and singleton reuse. Runtime
composition may pass the resulting `mobileSqliteStore` delegate into persistence,
Kanban, Action Inbox, and topic-context services, but it must not keep its own
SQLite store singleton or top-level `mobileSqliteStore` implementation.

`web-push-delivery-service.js` owns Todo, Automation, Growth, and group-chat
notification workflow orchestration, Action Inbox source upsert orchestration,
and background Web Push dispatchers. Runtime composition may pass short
delegates into route composition, but it must not carry duplicate top-level
wrapper functions for VAPID load/init/generation/reload behavior.

`web-push-automation-projection-service.js` owns deterministic Automation Web
Push projection: Automation owner principal selection, title/body shaping,
deliverable freshness filtering, deliverable source references, scheduled-Todo
detection, push signatures, mark signatures, recent-initial suppression checks,
Automation detail URLs, notification payload projection, and state mark
projection. `web-push-delivery-service.js` may use it while scanning jobs,
upserting Action Inbox items, sending Web Push, and saving state, but it must
not reintroduce inline Automation deliverable/signature/payload helpers.

`web-push-vapid-service.js` owns Web Push VAPID lifecycle: environment-key
fallback, runtime-config path/subject lookup, file load, best-effort key
generation/persistence, `webpush.setVapidDetails` initialization, explicit
Owner-triggered VAPID generation/overwrite guards, and current non-secret config
projection for callers. `web-push-delivery-service.js` may delegate public
methods to it, but it must not reintroduce inline VAPID file or environment key
handling.

`web-push-send-service.js` owns Web Push public status projection, active
principal projection, subscription removal by endpoint, subscription target
filtering, actual `webpush.sendNotification` calls, per-subscription
success/failure/removal state mutation, skipped subscription accounting, and
bounded push-delivery summary insertion. `web-push-delivery-service.js` may
delegate to it, but it must not reintroduce inline send loops or subscription
collection projection.

`web-push-delivery-normalization-service.js` owns deterministic Web Push record
normalization and projection: delivery/receipt/subscription normalization,
subscription scope signatures, principal/workspace subscription scoping,
authorized recipient workspace fan-out for notification surfaces, stored
client-context normalization, iOS/mobile PWA standalone subscription gates, and
deployment-origin skip reasons. `web-push-delivery-service.js` may construct
and delegate to this service, but it must not reintroduce inline subscription
scope or client-context gate implementations.

`external-integration-provider.js` owns owner external interface bindings and
owner external access-policy projection. Runtime composition may bind those
delegates for workspace binding projection, but it must not carry duplicate
top-level wrapper functions for those provider methods.

`mobile-runtime-basic-helper-service.js` owns deterministic runtime primitives:
de-duplication, UNC path detection, hashing, id generation, current time
formatting, boolean query parsing, single-window mode normalization, Owner
elevation duration normalization, bounded text compaction, searchable text
normalization, public task id formatting, and response text extraction from
structured Gateway/Responses values. Runtime
composition may wire these helpers into services, but it must not carry
duplicate helper implementations or add permission, route, provider, Gateway
lifecycle, or workspace policy to this service.

`mobile-runtime-workspace-identity-facade-service.js` owns the runtime
workspace identity fallback layer for `workspaceLabel`,
`senderInfoForWorkspace`, and `workspaceIdForPrincipal`. It may delegate to the
fully initialized workspace facade when available, and otherwise use bounded
catalog/principal fallbacks needed during earlier runtime wiring. The runtime
composition root must not carry duplicate function implementations for those
identity helpers.

`workspace-onboarding-service.js` owns family workspace onboarding
orchestration: dry-run plan projection, apply step ordering, bounded status
projection, Home AI workspace record/key delegation, Gateway provisioning
delegation, selected plugin grant delegation, and the macOS privileged executor
injection boundary. `workspace-onboarding-api-routes.js` is only Owner-auth HTTP
glue. `server.js` and `mobile-server-runtime.js` must not implement workspace
onboarding state machines or arbitrary sudo/shell execution.

`workspace-system-provisioning-executor-service.js` owns the concrete
restricted macOS workspace system actions behind that injection boundary. It may
create `hm-*` users, private roots, ACL repairs, target Gateway profile files,
manifest `osUser`/`launchdLabel`/telemetry metadata, cold LaunchDaemon plists,
worker-local plugin binding mirrors, and focused smoke invocations. Before
rendering a Gateway profile, it may mirror complete data-drive
`.hermes-<plugin>` binding directories into the target
`/Users/<hm-user>/HermesWorkspace` root, but incomplete bindings must be
ignored and must not expose an MCP toolset. It must keep action names
allowlisted, validate all workspace/user/profile/label/path inputs, invoke
external commands through fixed command paths and argument arrays, and return
bounded diagnostics only. It must not expose a generic shell/sudo endpoint or
return raw keys, OAuth tokens, cookies, plugin access keys, profile config
bodies, prompts, or full logs.

`workspace-system-provisioning-helper-client-service.js` is only the
listener-side local Unix socket client for that boundary. The root helper script
`scripts/workspace-system-provisioning-helper.js` may run as a macOS
LaunchDaemon and delegate to the same restricted executor, but it must expose
only `/health` and `/run-step` over the local socket and must not add any
browser-facing route, remote network listener, arbitrary shell command, or raw
sudo bridge.

`mobile-runtime-kanban-facade-service.js` is only a runtime wiring facade for
Kanban public projections, case-topic wiring, plan-card creation, assessment
workflow construction, shared-card access checks, and Kanban cache/maintenance
delegates. It may lazy-create the underlying Kanban projection/topic/plan and
assessment workflow services, but it must not implement Kanban persistence,
card mutation, reading artifact generation, study/assessment business rules,
or HTTP route behavior. Those stay in the Kanban providers, learning route
composition, and focused domain services.

Weixin outbound delivery projection belongs in
`mobile-runtime-weixin-facade-service.js` and
`weixin-runtime-composition-service.js`. Thread-view runtime wiring may receive
a delegate, but `mobile-server-runtime.js` must not define a duplicate
`publicWeixinOutboundDelivery` or `userFacingWeixinRunError` wrapper function.

`server.js` and `mobile-server-runtime.js` must not own new business behavior such as:

- workflow state machines;
- natural-language interpretation;
- Kanban/story/study/assessment planning;
- Weixin ingress/outbound queue policy;
- file, Markdown, PDF, DOCX, audio, or image transformation;
- Gateway run lifecycle policy;
- runtime state migration or persistence policy;
- permission, sharing, or cross-workspace authorization policy.

## Service Contract

A service should accept plain input objects and return plain result objects. Side effects such as filesystem writes, SQLite operations, Gateway calls, Weixin delivery, Web Push, and child processes should be passed in through explicit dependencies when practical.

Required baseline for new business services:

- an exported `create<Domain>Service(...)` factory or named pure helpers;
- focused tests in `tests/<domain>-service.test.js`;
- route tests only for HTTP boundary behavior;
- no raw secrets, tokens, push endpoints, child study contents, exam answers, or full user messages in fixtures or logs.

## Server Budget

`server.js` must stay thin, and `mobile-server-runtime.js` must trend downward
during refactors and must not absorb new feature logic. Temporary line-budget
increases are allowed only when they remove dense compressed runtime code or
top-level factories and the next split target is documented.

Current CI guardrails:

- `server.js` must stay at or below 3,000 lines;
- top-level `function` declarations in `server.js` must stay at or below 5;
- `mobile-server-runtime.js` must stay at or below 1,310 lines while it is being split further;
- top-level `function` declarations in `mobile-server-runtime.js` must stay at 0;
- async top-level `function` declarations in `mobile-server-runtime.js` must stay at 0;
- `app-route-url-service.js` must stay at or below 35 lines and remain a
  deterministic app-shell query URL serializer;
- `path-boundary-service.js` must stay at or below 65 lines and remain a
  deterministic path comparison helper, not a path authorization or filesystem
  mutation policy module;
- `mobile-runtime-path-access-service.js` must stay at or below 80 lines and
  remain a runtime facade over filesystem mount, security boundary, and path
  policy providers, not a new path-policy engine;
- `automation-job-filter-service.js` must stay at or below 45 lines and remain
  a deterministic Automation/Cron list filter, not a route or bridge execution
  module;
- `runtime-operation-error-response-service.js` must stay at or below 35 lines
  and remain a deterministic operation-error response adapter, not a route
  module or domain policy implementation;
- `mobile-runtime-access-policy-facade-service.js` must stay at or below 35
  lines and remain a runtime facade over `access-policy-provider.js` sanitizing
  plus `security-boundary-provider.js` hardening. It must not own policy field
  rules, protected-path rules, or permission prompt construction.
- `mobile-runtime-auth-facade-service.js` must stay at or below 40 lines and
  remain a delayed auth-provider delegation facade, not an auth policy or key
  storage implementation;
- `mobile-runtime-boot-trace-service.js` must stay at or below 35 lines and
  remain a best-effort startup trace side-effect adapter, not a logging,
  telemetry, or runtime lifecycle module;
- `mobile-runtime-natural-language-gateway-service.js` must stay at or below 70
  lines and remain a runtime facade for model-text Gateway target
  selection, stream text aggregation, and target release semantics. Natural
  language draft schema/prompt rules stay in `natural-language-draft-service.js`.
- `mobile-runtime-basic-helper-service.js` must stay at or below 120 lines and
  remain a deterministic helper service for basic runtime primitives, not a
  route, provider, permission, or Gateway lifecycle policy module;
- `mobile-runtime-file-access-facade-service.js` must stay at or below 140
  lines and remain a facade over lazy Directory browser boundary construction,
  file/artifact resolver delegation, file response delegation, and bounded
  Directory-thread request fallback wiring;
- `runtime-config-provider.js` must stay at or below 190 lines and remain a
  persistence, validation, Gateway worker service delegation, effective-service
  delegation, model-service delegation, and key-service delegation provider,
  not a public projection object builder, save input-normalization module,
  effective value helper module, Gateway worker setting projection module,
  model catalog/selection module, or API key file/env-file parser;
- `runtime-config-effective-service.js` must stay at or below 65 lines and
  remain runtime-config default/effective value resolution, not a persistence,
  public projection, key discovery, save normalization, or route module;
- `runtime-config-gateway-worker-service.js` must stay at or below 60 lines and
  remain runtime-config Gateway worker setting composition, not a scheduler,
  persistence, public projection, save normalization, or route module;
- `runtime-config-worker-policy-contract-service.js` must stay at or below 135
  lines and remain pure runtime worker-policy contract verification: saved
  overrides, public projection, effective scheduler values, and launcher
  elastic environment parity. It must not persist config, build public API
  responses, mutate Gateway pools, launch workers, or read secrets;
- `runtime-config-key-service.js` must stay at or below 115 lines and remain
  runtime-config API key discovery and non-secret status projection, not a
  persistence, public projection, save normalization, or route module;
- `runtime-config-model-service.js` must stay at or below 110 lines and remain
  runtime-config model catalog and selection normalization, not a persistence,
  public projection, worker setting, key lookup, save normalization, or route
  module;
- `runtime-config-public-projection-service.js` must stay at or below 75
  lines and remain runtime-config public projection, not a persistence,
  validation, key lookup, or route module;
- `runtime-config-save-service.js` must stay at or below 65 lines and remain
  runtime-config save input normalization and next-config payload construction,
  not a persistence, key lookup, public projection, or route module;
- `mobile-runtime-sqlite-store-facade-service.js` must stay at or below 35
  lines and remain a lazy SQLite store factory/migration facade, not a schema,
  repository, or persistence policy module;
- `mobile-runtime-state-facade-service.js` must stay at or below 155 lines and
  remain a facade over state normalization, chat-group member projection, and
  persistence delegation, not a runtime route or Gateway policy module;
- `mobile-runtime-gateway-context-facade-service.js` must stay at or below 90
  lines and remain a facade over Gateway instruction, conversation-history,
  stale tool-schema claim, run-target, and usage supplementation delegates;
- `mobile-runtime-gateway-composition-options-service.js` must stay at or
  below 130 lines and remain a dependency-to-option projection for
  `gateway-runtime-composition-service.js`, not a Gateway lifecycle, queue,
  stream, selector, or notification implementation;
- `gateway-runtime-composition-service.js` must stay at or below 160 lines
  and remain the public facade/controller glue for Gateway queue/start/
  stream/event/lifecycle services, not a child-service factory registry;
- `gateway-runtime-child-service-registry-service.js` must stay at or below
  105 lines and remain the lazy child-service registry, not a public Gateway
  runtime facade, child-service option projector, queue policy, stream parser,
  or event handler;
- `gateway-runtime-subservice-options-service.js` must stay at or below
  145 lines and remain the child-service option projection boundary, not a
  Gateway lifecycle, queue, stream, event, selector, or notification module;
- `gateway-run-request-builder-service.js` must stay at or below
  530 lines and remain deterministic Gateway run request construction, not a
  state-transition, worker-selection, model-preflight, event, or streaming
  module;
- `gateway-run-start-assistant-options-service.js` must stay at or below 70
  lines and remain deterministic assistant run-options projection, not a
  request-builder, selector, worker-selection, event, or streaming module;
- `gateway-run-start-event-service.js` must stay at or below 215 lines and
  remain Gateway run-start telemetry/event projection, not a request-builder,
  lifecycle, selector, worker-selection, or streaming module;
- `gateway-run-start-execution-phase-service.js` must stay at or below 55
  lines and remain preflight-to-stream handoff orchestration, not a selector
  policy, worker-selection, queue, or stream parser module;
- `gateway-run-start-permission-service.js` must stay at or below 70 lines and
  remain model-side permission/elevation terminal projection, not a
  request-builder, selector, toolset, worker-selection, or streaming module;
- `gateway-run-start-plugin-probe-service.js` must stay at or below 75 lines
  and remain plugin capability probe execution/projection, not a plugin policy,
  worker-selection, initial request-builder, selector, queue, or streaming
  module;
- `gateway-run-start-preparation-service.js` must stay at or below 70 lines and
  remain initial run-start preparation handoff, not a worker-selection,
  plugin-probe, selector, queue, or streaming module;
- `gateway-run-start-stream-handoff-service.js` must stay at or below 75 lines
  and remain final Gateway stream-start handoff, not a worker-selection,
  initial request-builder, selector, queue, or stream parser module;
- `gateway-run-start-stream-options-service.js` must stay at or below 80 lines
  and remain deterministic Gateway stream-start option projection, not a worker
  selection, model-preflight, event, or streaming module;
- `gateway-run-start-state-service.js` must stay at or below 115 lines and
  remain deterministic Gateway run-start state projection, not a request
  builder, selector, worker-selection, or streaming module;
- `gateway-run-start-target-phase-service.js` must stay at or below 85 lines
  and remain target-selected phase orchestration, not an initial request-builder,
  selector, plugin policy, queue, or streaming module;
- `gateway-run-start-target-service.js` must stay at or below 95 lines and
  remain Gateway target selection handoff and post-selection projection, not a
  request-builder, selector, Wardrobe gate, queue, or streaming module;
- `gateway-run-start-toolset-preflight-service.js` must stay at or below 155
  lines and remain model-first toolset preflight execution/projection, not a
  worker-selection, initial request-builder, queue, or streaming module;
- `gateway-run-start-toolset-selection-service.js` must stay at or below 95
  lines and remain deterministic toolset-selection request mutation, not a
  selector, permission decision, worker-selection, or streaming module;
- `gateway-run-start-wardrobe-gate-service.js` must stay at or below 85 lines
  and remain deterministic Wardrobe workflow gate integration, not a Wardrobe
  product-rule, selector, worker-selection, or streaming module;
- `gateway-run-start-child-service-registry-service.js` must stay at or below 260
  lines and remain Gateway run-start child-service wiring, not a run-phase
  executor, worker-selection, model-preflight, event, or streaming module;
- `gateway-run-start-service.js` must stay at or below 75 lines and remain
  Gateway run-start phase orchestration, not a child-service registry,
  request-builder, event projector, or broad Gateway composition module;
- `gateway-run-queue-projection-service.js` must stay at or below 100 lines
  and remain queued-run projection, not queue scheduling, active-run lifecycle,
  terminal failure handling, state persistence, or event broadcasting;
- `gateway-run-queue-service.js` must stay at or below 180 lines and remain
  queued-run scheduling plus active-run lifecycle handoff, not queued prompt
  text, queued assistant factory, history compaction policy, or broad Gateway
  composition;
- `gateway-run-terminal-state-service.js` must stay at or below 180 lines and
  remain failed/cancelled/detached terminal projection, not event parsing,
  completed output projection, stream handling, remote stop, or worker
  selection;
- `gateway-run-completion-service.js` must stay at or below 270 lines and
  remain completed-run projection, output/usage backfill, permission marker
  projection, toolset-escalation-required retry handoff, Wardrobe completion
  gate failure handoff, artifact registration handoff, terminal delivery,
  completed broadcast, and queued follow-up scheduling, not arbitrary Gateway
  event parsing, stream handling, active-stream alias management, worker
  selection, or original run start orchestration;
- `gateway-run-delta-event-service.js` must stay at or below 85 lines and
  remain text-delta projection only, not arbitrary event parsing,
  active-stream alias management, run-event append, terminal state, queue
  scheduling, worker selection, or completed-run projection;
- `gateway-run-output-event-service.js` must stay at or below 160 lines and
  remain output-item/final-message projection only, not arbitrary event parsing,
  active-stream alias management, terminal mutation, queue scheduling, worker
  selection, or completed-run projection;
- `gateway-run-response-created-service.js` must stay at or below 45 lines and
  remain response-created run-id alias projection only, not arbitrary event
  parsing, output projection, terminal mutation, queue scheduling, or worker
  selection;
- `gateway-run-streaming-save-service.js` must stay at or below 55 lines and
  remain streaming save timer/pending lifecycle only, not event parsing,
  message mutation, broadcasting, terminal state, queue scheduling, or worker
  selection;
- `gateway-run-evidence-service.js` must stay at or below 310 lines and remain
  Skill/tool/output-item evidence parsing and bounded preview construction, not
  event broadcasting, terminal mutation, state persistence, queue scheduling, or
  toolset escalation;
- `gateway-run-toolset-escalation-service.js` must stay at or below 195 lines
  and remain deterministic toolset escalation marker parsing, sanitization,
  route metadata projection, common web companion expansion, and retry
  user-message lookup, not retry execution, event broadcasting, terminal
  mutation, state persistence, or selector execution;
- `gateway-run-toolset-escalation-retry-service.js` must stay at or below 175
  lines and remain execution-round retry projection only: retry cap, expanded
  retry run-options, queued assistant reset, retry event projection, retry start
  scheduling, and rejected-retry failure projection, not marker parsing,
  original selector decisions, run completion, Wardrobe validation, or stream
  lifecycle;
- `gateway-run-lifecycle-service.js` must remain pure deterministic lifecycle
  policy: lifecycle phase contract, stable/branch event lists, source-file
  coverage checks, event-name normalization, run-id extraction, event phase
  classification, terminal status mapping, active-run id helpers, queued-run
  decisions, and liveness decisions. It must not mutate threads/messages,
  broadcast, save state, schedule workers, or call Gateway runner APIs;
- `gateway-run-event-service.js` must stay at or below 360 lines and remain
  event parsing/projection plus ordinary event persistence while using
  `gateway-run-lifecycle-service.js` for event phase classification and delegating
  completed-run projection, text-delta projection, response-created alias
  projection, output-item/final-message projection, streaming state-save
  lifecycle, Skill/tool evidence parsing, deterministic toolset escalation
  helper logic, toolset retry execution, and failed/cancelled/detached terminal
  projection;
- `mobile-runtime-gateway-facade-service.js` must stay at or below 125 lines
  and remain a runtime Gateway facade over provider lifecycle, run concurrency,
  and Gateway runtime composition singleton ownership delegates;
- `mobile-runtime-gateway-concurrency-service.js` must stay at or below 60
  lines and remain runtime Gateway concurrency projection, not a concurrency
  policy, worker-selection, permission, or streaming module;
- `mobile-runtime-gateway-provider-service.js` must stay at or below 165
  lines and remain runtime Gateway provider lifecycle wiring, not a Gateway
  status fallback, runtime composition, run-start lifecycle, selector,
  permission, or concurrency-policy module;
- `mobile-runtime-gateway-status-service.js` must stay at or below 50 lines
  and remain Gateway status composition and pool-health fallback projection,
  not a provider factory, runtime composition, run-start lifecycle, selector,
  permission, or concurrency-policy module;
- `gateway-run-content-service.js` must stay at or below 60 lines and remain a
  deterministic helper service for live run append and final content
  compaction, not a Gateway lifecycle or stream parser implementation;
- `gateway-run-stream-completion-service.js` must stay at or below 55 lines and
  remain stream reader completion/abort handoff, not stream parsing,
  active-stream storage, timer scheduling, remote stop, or Gateway target
  mutation;
- `gateway-run-stream-close-recovery-service.js` must stay at or below 70
  lines and remain stream-closed-without-terminal recovery projection, not
  stream parsing, active-stream storage, liveness checking, remote stop, or
  Gateway target mutation;
- `gateway-run-stream-event-service.js` must stay at or below 145 lines and
  remain deterministic stream event projection and tool-budget accounting, not
  active-stream storage, liveness checking, Gateway runner I/O, or lifecycle
  mutation;
- `gateway-run-stream-failure-service.js` must stay at or below 60 lines and
  remain stream reader failure projection, not stream parsing, active-stream
  storage, liveness checking, remote stop, or Gateway target mutation;
- `gateway-run-stream-first-event-service.js` must stay at or below 75 lines
  and remain first Gateway stream event warning timer projection, not stream
  parsing, active-stream storage, liveness checking, or lifecycle mutation;
- `gateway-run-stream-liveness-service.js` must stay at or below 115 lines and
  remain active-run liveness checking, not stream parsing, active-stream
  storage, remote stop, or terminal thread/message mutation;
- `gateway-run-stream-liveness-timer-service.js` must stay at or below 55
  lines and remain liveness timer scheduling/cleanup, not active-run liveness
  checking, stream parsing, active-stream storage, remote stop, or terminal
  thread/message mutation;
- `gateway-run-stream-registry-service.js` must stay at or below 115 lines and
  remain an active-stream registry and alias/target lookup service, not a
  stream parser, liveness checker, event projector, or lifecycle module;
- `gateway-run-stream-state-service.js` must stay at or below 60 lines and
  remain deterministic stream-state initialization only, not active-stream
  registration, stream parsing, timer scheduling, event projection, remote stop,
  or terminal lifecycle mutation;
- `gateway-run-stream-stop-service.js` must stay at or below 85 lines and
  remain remote/local stream stop projection, not stream parsing, active-stream
  storage, event projection, liveness checking, or lifecycle mutation;
- `gateway-run-stream-service.js` must stay at or below 275 lines and remain
  Gateway stream orchestration, not an active-stream registry or broad Gateway
  runtime composition module;
- `mobile-runtime-group-chat-facade-service.js` must stay at or below 95 lines
  and remain a facade over group chat public projection, revoke authorization,
  paired assistant lookup, and revoke payload mutation;
- `mobile-runtime-workspace-identity-facade-service.js` must stay at or below
  65 lines and remain a runtime identity fallback/delegation facade, not a
  local workspace store or access-key policy implementation;
- `mobile-runtime-artifact-facade-service.js` must stay at or below 140 lines
  and remain a facade over `file-artifact-access-service.js` and
  `artifact-text-registration-service.js`;
- `mobile-runtime-thread-view-facade-service.js` must stay at or below 140
  lines and remain a facade over `thread-view-service.js`;
- `mobile-runtime-todo-facade-service.js` must stay at or below 120 lines and
  remain a facade over `direct-kanban-create-service.js` plus workspace catalog
  lookup delegates;
- `mobile-runtime-kanban-facade-service.js` must stay at or below 380 lines and
  remain a facade over existing Kanban projection/topic/plan/assessment
  services plus cache/maintenance delegates;
- `mobile-runtime-weixin-facade-service.js` must stay at or below 115 lines and
  remain a facade over Weixin runtime composition, not an ingress/outbound
  delivery implementation;
- `mobile-runtime-workspace-facade-service.js` must stay at or below 190 lines
  and remain a facade over local workspace store/projection, workspace/auth
  gate helpers, access-key delegation, sender labels, and principal mapping;
- `mobile-runtime-workspace-catalog-facade.js` must stay at or below 105 lines
  and remain a lazy runtime facade over `runtime-workspace-catalog-service.js`
  plus project-discovery de-duplication. It may own catalog service singleton
  creation from injected dependencies, but it must not own catalog loading,
  access-policy merge rules, shared-directory projection, or project discovery
  behavior;
- `mobile-api-composition.js` must stay at or below 410 lines and remain the
  top-level API aggregator, service collector, and dispatcher constructor, not
  a domain service graph;
- `mobile-api-platform-composition.js` must stay at or below 210 lines and
  remain the public/system/Owner/access-key/runtime-config/Push/Workspace/
  platform-currency/Resource/Weixin route composition boundary;
- `mobile-api-directory-composition.js` must stay at or below 150 lines and
  remain the Directory/file/artifact/Note receipt route wiring boundary;
- `mobile-api-learning-composition.js` must stay at or below 350 lines and
  remain the Growth/Learning route/service wiring boundary;
- `mobile-runtime-environment-service.js` must stay at or below 380 lines and
  remain an environment aggregation adapter, not a place for new config groups;
- `mobile-runtime-gateway-environment-service.js` must stay at or below 130 lines;
- `mobile-runtime-path-candidate-environment-service.js` must stay at or below 150 lines;
- `mobile-runtime-state-path-environment-service.js` must stay at or below 90 lines;
- `mobile-runtime-kanban-environment-service.js` must stay at or below 100 lines;
- `mobile-runtime-env-value-service.js` must stay at or below 40 lines;
- `web-push-delivery-service.js` must stay at or below 1,080 lines and retain
  notification workflow orchestration, Inbox source upserts, and background
  dispatch orchestration rather than deterministic subscription normalization
  policy, inline push-send loops, VAPID file/env key lifecycle, or Automation
  projection helpers;
- `web-push-automation-projection-service.js` must stay at or below 320 lines
  and own Automation Web Push deliverable filtering, signatures, routes,
  payloads, and mark projection;
- `web-push-delivery-normalization-service.js` must stay at or below 285 lines
  and own deterministic Web Push normalization, subscription scoping,
  client-context gates, and deployment-origin skip reasons;
- `web-push-send-service.js` must stay at or below 150 lines and own Web Push
  public status, active-principal projection, subscription removal, target
  filtering, actual push sends, skipped-subscription accounting, and delivery
  summary insertion;
- `web-push-vapid-service.js` must stay at or below 130 lines and own Web Push
  VAPID env/file/runtime-config lookup, generation guards, initialization, and
  current config projection;
- if a feature would exceed either budget, extract route modules and services first.

These budgets are intentionally temporary ceilings. Lower them after each
successful extraction round.

Line budgets are coarse architecture guardrails, not minification targets. They
must not be satisfied by formatting compression, single-line helper bodies,
hidden dense expressions, or moving unrelated logic into existing helper
modules. The goal is smaller CodeGraph-addressable responsibility boundaries
and smaller context entry points, not merely fewer physical lines. If a readable
service needs a few more lines after a structurally correct extraction, raise
that service's local budget deliberately and document why instead of compressing
the implementation.

## Frontend Boundary

`public/app.js` is also a transitional UI shell. It should keep shared client
state, constants, and bootstrap references only. Feature UI should move
reusable rendering, view-model derivation, deterministic client state
projection, controller glue, and page-specific event wiring into focused
`public/app-<domain>.js` helpers before it is wired back into the shell.

Current CI guardrails:

- `public/app.js` must stay at or below 10,000 lines;
- top-level `function` declarations in `public/app.js` must stay at or below 120;
- extracted front-end runtime modules must stay at or below 1,000 lines each;
- front-end helper modules should expose stable `window.Hermes<Domain>` helpers
  and have focused tests under `tests/app-<domain>.test.js`.
- front-end runtime split modules loaded by `index.html` must remain cohesive by
  platform area and must not become a single replacement monolith for `app.js`.

These front-end budgets are also ceilings, not targets. Lower them after each
successful UI extraction round.

## Product Module Boundary

Hermes Mobile is the platform layer for workspace, Chat, topic, Action Inbox,
file delivery, Gateway Pool, Web Push, and access-control capabilities. Official
Hermes Kanban may be used for legacy compatibility or official-agent workflows,
but new Hermes Mobile user-participation behavior should use local product
services instead of making official Kanban the primary mobile state store. Vertical
products such as the Fanfan learning/growth system must use those platform
capabilities through focused services and API contracts instead of copying the
platform or growing `public/app.js` into a second product shell.

The current learning-system architecture decision is tracked in:

```text
docs/FANFAN_LEARNING_SYSTEM_ARCHITECTURE.zh-CN.md
```

## Route Modules

New route groups should live in `server-routes/<domain>-api-routes.js` when they involve more than a trivial endpoint. Route modules should receive dependencies from the runtime composition layer and delegate business decisions to adapters/services.

## Review Checklist

Before committing a new feature or non-trivial bug fix:

- identify the owning service/provider;
- add or update the service test;
- keep `server.js` as a thin entrypoint and runtime composition as glue only;
- run `node tests/architecture-refactor-boundary.test.js`;
- run the focused service/route tests touched by the change;
- run `npm.cmd run productization:check` before production or push.
