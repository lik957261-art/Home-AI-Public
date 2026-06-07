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
`mobile-runtime-environment-service.js`,
`mobile-runtime-env-value-service.js`,
`mobile-runtime-gateway-environment-service.js`,
`mobile-runtime-gateway-composition-options-service.js`,
`mobile-runtime-gateway-context-facade-service.js`,
`mobile-runtime-gateway-facade-service.js`,
`gateway-runtime-composition-service.js`,
`gateway-runtime-subservice-options-service.js`,
`gateway-run-request-builder-service.js`,
`gateway-run-start-event-service.js`,
`gateway-run-start-stream-options-service.js`,
`gateway-run-start-state-service.js`,
`gateway-run-content-service.js`,
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

`gateway-runtime-composition-service.js` owns the lazy composition of Gateway
queue, start, stream, event, and lifecycle services. It may hold the small
controller methods that coordinate those child services, but it must not own
the large child-service option projection.

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

`gateway-run-start-event-service.js` owns Gateway run-start telemetry event
projection: run-start event append/broadcast, scheduler event projection,
plugin capability probe events, required Skill preload events, context/gateway
preview text, model-first toolset routing previews, fallback previews, and
permission-preflight event naming. It must not mutate run lifecycle state,
choose workers, run model preflight, build Gateway request bodies, or start
streams.

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

`gateway-run-start-service.js` owns Gateway run preparation state transitions,
worker selection orchestration, optional plugin capability probing, model-first
toolset preflight orchestration, wardrobe workflow gate checkpoints, and stream
startup handoff. It must delegate deterministic request construction to
`gateway-run-request-builder-service.js` and telemetry/event projection to
`gateway-run-start-event-service.js`, and stream-start option projection to
`gateway-run-start-stream-options-service.js`. It must delegate deterministic
run-start state mutation and failed-start projection to
`gateway-run-start-state-service.js`.

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

`web-push-delivery-service.js` owns VAPID load, initialization, reload, push
status, and delivery helpers. Runtime composition may pass short delegates into
route composition, but it must not carry duplicate top-level wrapper functions
for VAPID load/init/generation/reload behavior.

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
- `gateway-runtime-composition-service.js` must stay at or below 185 lines
  and remain the lazy child-service coordinator for Gateway queue/start/
  stream/event/lifecycle services;
- `gateway-runtime-subservice-options-service.js` must stay at or below
  145 lines and remain the child-service option projection boundary, not a
  Gateway lifecycle, queue, stream, event, selector, or notification module;
- `gateway-run-request-builder-service.js` must stay at or below
  530 lines and remain deterministic Gateway run request construction, not a
  state-transition, worker-selection, model-preflight, event, or streaming
  module;
- `gateway-run-start-event-service.js` must stay at or below 215 lines and
  remain Gateway run-start telemetry/event projection, not a request-builder,
  lifecycle, selector, worker-selection, or streaming module;
- `gateway-run-start-stream-options-service.js` must stay at or below 80 lines
  and remain deterministic Gateway stream-start option projection, not a worker
  selection, model-preflight, event, or streaming module;
- `gateway-run-start-state-service.js` must stay at or below 115 lines and
  remain deterministic Gateway run-start state projection, not a request
  builder, selector, worker-selection, or streaming module;
- `gateway-run-start-service.js` must stay at or below 510 lines and remain
  Gateway run preparation orchestration, not a request-builder, event projector,
  or broad Gateway composition module;
- `mobile-runtime-gateway-facade-service.js` must stay at or below 220 lines
  and remain a runtime Gateway facade over runner/pool/launcher/provisioning,
  telemetry, run concurrency, Gateway runtime composition singleton ownership,
  and public status composition delegates;
- `gateway-run-content-service.js` must stay at or below 60 lines and remain a
  deterministic helper service for live run append and final content
  compaction, not a Gateway lifecycle or stream parser implementation;
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
