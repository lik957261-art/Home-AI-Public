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
`mobile-runtime-file-helper-service.js`,
`mobile-runtime-file-access-facade-service.js`,
`mobile-runtime-artifact-facade-service.js`,
`mobile-runtime-backend-policy-service.js`,
`mobile-runtime-config-facade-service.js`,
`mobile-runtime-environment-service.js`,
`mobile-runtime-env-value-service.js`,
`mobile-runtime-gateway-environment-service.js`,
`mobile-runtime-gateway-context-facade-service.js`,
`mobile-runtime-gateway-facade-service.js`,
`gateway-run-content-service.js`,
`mobile-runtime-group-chat-facade-service.js`,
`mobile-runtime-group-chat-attachment-service.js`,
`mobile-runtime-kanban-environment-service.js`,
`mobile-runtime-kanban-facade-service.js`,
`mobile-runtime-local-bridge-facade-service.js`,
`mobile-runtime-owner-elevation-facade-service.js`,
`mobile-runtime-path-candidate-environment-service.js`,
`mobile-runtime-public-status-service.js`,
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
helpers and JSON store file IO,
Artifact/Markdown registration lazy delegation, backend mode policy, runtime
config facade delegation, runtime environment aggregation, shared environment
value parsing, Gateway/run environment parsing,
Gateway runner/pool/launcher/provisioning/telemetry lazy delegation, Gateway
run content truncation policy, group-chat public projection/revoke policy,
group-chat attachment runtime wiring,
Kanban/reading environment parsing, Local Bridge runtime lazy delegation,
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
access to `file-artifact-access-service.js`, but it must not implement file
conversion, path authorization, Markdown discovery policy, artifact persistence,
or `saveState` behavior. The source Markdown search cache must remain
process-scoped, not per request.

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

`app-route-url-service.js` owns app-shell query URL serialization for Push,
Web Push, plugin notification, and other route-link producers. Runtime
composition may pass the helper into route/service wiring, but it must not carry
a duplicate `appRouteUrl` function implementation.

`automation-job-filter-service.js` owns deterministic Automation/Cron job
filtering for owner visibility and list search matching. Route composition may
use it through runtime dependencies, but `mobile-server-runtime.js` must not
carry duplicate `cronJobMatchesSearch`, `cronJobMatchesOwner`, or cron cache
clear wrapper function implementations.

`runtime-operation-error-response-service.js` owns the small Todo/Kanban
operation-error JSON response wrappers. Route composition may keep receiving
`todoErrorResponse` and `kanbanErrorResponse` delegates, but
`mobile-server-runtime.js` must not carry duplicate function implementations for
those response shapes.

`mobile-runtime-basic-helper-service.js` owns deterministic runtime primitives:
de-duplication, UNC path detection, hashing, id generation, current time
formatting, boolean query parsing, single-window mode normalization, Owner
elevation duration normalization, and response text extraction from structured
Gateway/Responses values. Runtime
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
`publicWeixinOutboundDelivery` wrapper function.

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
during refactors and must not absorb new feature logic.

Current CI guardrails:

- `server.js` must stay at or below 3,000 lines;
- top-level `function` declarations in `server.js` must stay at or below 5;
- `mobile-server-runtime.js` must stay at or below 1,455 lines while it is being split further;
- top-level `function` declarations in `mobile-server-runtime.js` must stay at or below 55;
- `app-route-url-service.js` must stay at or below 35 lines and remain a
  deterministic app-shell query URL serializer;
- `automation-job-filter-service.js` must stay at or below 45 lines and remain
  a deterministic Automation/Cron list filter, not a route or bridge execution
  module;
- `runtime-operation-error-response-service.js` must stay at or below 35 lines
  and remain a deterministic operation-error response adapter, not a route
  module or domain policy implementation;
- `mobile-runtime-basic-helper-service.js` must stay at or below 95 lines and
  remain a deterministic helper service for basic runtime primitives, not a
  route, provider, permission, or Gateway lifecycle policy module;
- `mobile-runtime-file-access-facade-service.js` must stay at or below 115
  lines and remain a facade over lazy Directory browser boundary construction,
  file/artifact resolver delegation, and file response delegation;
- `mobile-runtime-gateway-context-facade-service.js` must stay at or below 90
  lines and remain a facade over Gateway instruction, conversation-history,
  stale tool-schema claim, run-target, and usage supplementation delegates;
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
- `mobile-runtime-workspace-facade-service.js` must stay at or below 190 lines
  and remain a facade over local workspace store/projection, workspace/auth
  gate helpers, access-key delegation, sender labels, and principal mapping;
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
