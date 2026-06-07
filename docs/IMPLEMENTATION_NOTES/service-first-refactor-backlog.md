# Service-First Refactor Backlog

Last updated: 2026-06-08.

## Purpose

This backlog records the remaining high-impact service-first work that should
be completed after the current Mac/mobile stabilization cycle. The goal is not
to reduce line counts by compressing code into fewer physical lines. The goal is
to reduce context size per change, keep business logic in named services, and
make harness selection obvious from module ownership.

Line count is only a weak proxy. A successful refactor should:

- move business rules out of large composition files;
- keep route/controller files as HTTP glue;
- add focused service/provider tests;
- update the architecture-code-test-harness map;
- make future CodeGraph exploration return small, named service bodies instead
  of broad entrypoint context;
- avoid one-line compression that preserves the same cognitive/context load.

## Current Priority Areas

### Mobile runtime composition

`mobile-server-runtime.js` is still the largest runtime compositor. It should
continue to shrink by extracting service/provider ownership, not by collapsing
statements. Priority extraction areas:

- completed 2026-06-07: runtime state normalization/persistence duplicate
  wrappers were removed from `mobile-server-runtime.js`; state ownership now
  stays in `adapters/mobile-runtime-state-facade-service.js`, with architecture
  tests preventing the wrapper functions from returning;
- completed 2026-06-07: low-risk auth setup, Web Push VAPID, and external
  integration provider wrappers were converted to runtime delegates, lowering
  the runtime top-level function count without changing provider ownership;
- completed 2026-06-08: deterministic path comparison helpers were extracted
  to `adapters/path-boundary-service.js` and reused by runtime composition,
  path policy, project discovery, and shared-directory providers. Authorization
  decisions remain in their owning providers.
- completed 2026-06-08: runtime path access wrappers were extracted to
  `adapters/mobile-runtime-path-access-service.js`, keeping filesystem mount,
  protected-path filtering, global allowed roots, and thread path-policy
  delegation out of `mobile-server-runtime.js` while preserving lazy runtime
  dependency wiring.
- completed 2026-06-08: runtime text/id helper ownership moved into
  `adapters/mobile-runtime-basic-helper-service.js`. `compactText` and
  `makePublicTaskId` now have focused service coverage, while runtime keeps
  only service wiring and call sites.
- completed 2026-06-08: Weixin user-facing run-error projection now delegates
  through `adapters/mobile-runtime-weixin-facade-service.js` to the existing
  Weixin runtime composition service instead of being duplicated in
  `mobile-server-runtime.js`.
- completed 2026-06-08: `searchableText` moved into
  `adapters/mobile-runtime-basic-helper-service.js`, and artifact path recovery
  from visible message content moved into
  `adapters/mobile-runtime-artifact-facade-service.js`.
- completed 2026-06-08: Directory-thread request fallback moved into
  `adapters/mobile-runtime-file-access-facade-service.js`. Runtime now injects
  auth/thread lookup dependencies and route composition receives a facade
  delegate instead of top-level Directory browser fallback functions.
- completed 2026-06-08: lazy SQLite service-store construction moved into
  `adapters/mobile-runtime-sqlite-store-facade-service.js`. Runtime now passes a
  tested `mobileSqliteStore` delegate into persistence, Kanban, Action Inbox,
  and topic-context services instead of keeping a top-level SQLite singleton.
- completed 2026-06-08: `chatGroupMemberWorkspaceIds` moved into
  `adapters/mobile-runtime-state-facade-service.js`, keeping chat-group member
  projection with state normalization instead of as a runtime top-level helper.
- completed 2026-06-08: delayed auth-provider delegates moved into
  `adapters/mobile-runtime-auth-facade-service.js`. Runtime keeps
  `authenticateRequest`, `authCanAccessWorkspace`, and `isOwnerAuth` as service
  delegates without top-level auth-provider wrapper functions.
- completed 2026-06-08: startup boot tracing moved into
  `adapters/mobile-runtime-boot-trace-service.js`. Runtime keeps only a
  delegate while the service owns best-effort trace file writes through injected
  filesystem/path/process/clock dependencies.
- completed 2026-06-08: natural-language Gateway text execution moved into
  `adapters/mobile-runtime-natural-language-gateway-service.js`. Runtime keeps
  delegates for `extractJsonObject`, `hermesModelText`,
  `normalizeAutomationDraft`, and `interpretAutomationNaturalLanguage`, while
  the service owns Gateway target selection, streamed text aggregation, timeout
  flooring, and target release semantics.
- completed 2026-06-08: runtime access-policy sanitize/harden composition moved
  into `adapters/mobile-runtime-access-policy-facade-service.js`. Policy field
  rules remain in `access-policy-provider.js`; protected-path and toolset
  hardening rules remain in `security-boundary-provider.js`.
- completed 2026-06-08: Gateway status composition moved into
  `adapters/mobile-runtime-gateway-facade-service.js`. Runtime now delegates
  `getHermesStatus`, while the facade owns single-runner status, pool status
  attachment, and healthy-pool fallback projection.
- completed 2026-06-08: Automation/Cron list and authorized output/deliverable
  wrappers were reduced to provider delegates. `mobile-server-runtime.js` now
  has no async top-level function declarations; Automation behavior remains in
  `adapters/automation-provider.js`.
- completed 2026-06-08: runtime thread state access now instantiates
  `createRuntimeStateThreadService` directly after state facade setup and keeps
  `getRuntimeStateThreadService` as a compatibility delegate instead of a lazy
  top-level factory function.
- completed 2026-06-08: Single Window thread runtime now instantiates
  `createSingleWindowThreadService` directly once workspace catalog/display
  dependencies are ready and keeps `getSingleWindowThreadService` as a
  compatibility delegate instead of a lazy top-level factory function.
- completed 2026-06-08: semantic directory attachment runtime now instantiates
  `createSemanticDirectoryAttachmentService` directly once workspace
  catalog/display dependencies are ready and keeps
  `getSemanticDirectoryAttachmentService` as a compatibility delegate instead
  of a lazy top-level factory function.
- completed 2026-06-08: workspace catalog service singleton construction moved
  into `adapters/mobile-runtime-workspace-catalog-facade.js`. The runtime root
  now injects the `createRuntimeWorkspaceCatalogService` factory and dependency
  package into the facade, uses facade delegates for catalog methods and dynamic
  project cache clearing, and no longer defines a top-level
  `getRuntimeWorkspaceCatalogService` factory.
- completed 2026-06-08: Path Access provider resolution now lives inside
  `adapters/mobile-runtime-path-access-service.js`. The service accepts provider
  getter dependencies so startup-order cycles stay inside the service boundary,
  and `mobile-server-runtime.js` no longer defines a top-level
  `getMobileRuntimePathAccessService` factory.
- completed 2026-06-08: Gateway runtime composition singleton ownership moved
  into `adapters/mobile-runtime-gateway-facade-service.js`. The runtime root no
  longer defines any top-level `function` declarations; the Gateway dependency
  package is intentionally kept readable instead of re-compressed into a few
  dense lines. The next Gateway split should reduce that dependency package by
  moving run-start, run-event, and queue wiring into smaller option/facade
  modules.
- completed 2026-06-08: Gateway runtime dependency-to-option projection moved
  into `adapters/mobile-runtime-gateway-composition-options-service.js`. Runtime
  now groups stable `runtimeEnv` constants, delayed delegates, runtime values,
  and service facades, while selector, Skill preload, plugin capability,
  directory attachment, notification, and topic-compaction option wrappers live
  in a focused service with its own tests and architecture budget.
- completed 2026-06-08: Gateway runtime child-service option projection moved
  into `adapters/gateway-runtime-subservice-options-service.js`.
  `gateway-runtime-composition-service.js` now remains the lazy child-service
  coordinator for queue/start/stream/event/lifecycle services, while the
  deterministic queue/start/stream/event constructor option mapping has focused
  coverage and architecture budgets.
- completed 2026-06-08: Gateway run request construction moved into
  `adapters/gateway-run-request-builder-service.js`. The start service now
  delegates actor workspace resolution, policy-thread projection, plugin-topic
  requirements, required Skill preload metadata, toolset companion expansion,
  conversation body construction, and Gateway routing metadata to a focused
  deterministic builder with its own coverage and architecture budgets.
- completed 2026-06-08: Gateway run-start event projection moved into
  `adapters/gateway-run-start-event-service.js`. The start service now
  delegates run-start event append/broadcast, scheduler event projection,
  plugin capability probe events, required Skill preload events,
  context/gateway preview text, model-first toolset routing previews, fallback
  previews, and permission-preflight event naming to a focused projection
  service with its own tests and architecture budget.
- completed 2026-06-08: Gateway run-start stream option projection moved into
  `adapters/gateway-run-start-stream-options-service.js`. The start service now
  delegates Gateway target metadata projection, Web/search max-call caps,
  explicit search cap selection, and ChatGPT Pro long-wait timeout fields to a
  focused deterministic service with its own tests and architecture budget.
- completed 2026-06-08: Gateway run-start state projection moved into
  `adapters/gateway-run-start-state-service.js`. The start service now
  delegates active-run publication, preparing/started assistant and thread
  state mutation, compact message-update broadcast, and failed-start projection
  to a focused deterministic state service with its own tests and architecture
  budget.
- completed 2026-06-08: Gateway run-start assistant run-options projection
  moved into `adapters/gateway-run-start-assistant-options-service.js`. The
  start service now delegates access policy context, Gateway conversation id,
  tool schema epoch, required Skill preload metadata, loaded Skill chip entries,
  plugin capability catalog/probe metadata, toolset routing metadata, search
  source fields, and wardrobe workflow gate metadata to a focused deterministic
  service with its own tests and architecture budget.
- completed 2026-06-08: Gateway run-start Wardrobe workflow gate integration
  moved into `adapters/gateway-run-start-wardrobe-gate-service.js`. The start
  service now delegates gate stage evaluation, idempotent instruction insertion,
  failed-gate event projection, and failed-start handoff while leaving Wardrobe
  product rules in `adapters/wardrobe-outfit-workflow-gate-service.js`.
- completed 2026-06-08: Gateway run-start toolset-selection request mutation
  moved into `adapters/gateway-run-start-toolset-selection-service.js`. The
  start service now delegates selector fallback restoration and bounded
  escalation-instruction insertion while leaving model selection decisions in
  `adapters/gateway-run-model-toolset-selection-service.js`.
- completed 2026-06-08: Gateway run-start target selection and post-selection
  projection moved into `adapters/gateway-run-start-target-service.js`. The
  start service now delegates scheduler event handoff, started-state target
  metadata projection, context-ready/gateway-selected event projection, and
  plugin capability probe precondition checks while retaining overall run
  preparation orchestration.
- completed 2026-06-08: Gateway run-start model permission/elevation terminal
  projection moved into `adapters/gateway-run-start-permission-service.js`. The
  start service now delegates assistant elevation metadata, active-run release,
  `run.permission_required` event projection, state save handoff, message
  broadcast, and the `needs_elevation` start response while retaining selector
  orchestration.
- completed 2026-06-08: Gateway run-start plugin capability probe
  execution/projection moved into
  `adapters/gateway-run-start-plugin-probe-service.js`. The start service now
  delegates fallback probe service creation, optional probe execution, probe
  result run-options projection, request rebuild after probe evidence, Wardrobe
  metadata refresh, plugin capability event projection, and delayed
  `run.context_ready` projection while retaining overall run preparation
  orchestration.
- completed 2026-06-08: Gateway run-start initial preparation handoff moved
  into `adapters/gateway-run-start-preparation-service.js`. The start service
  now delegates actor workspace resolution, concurrency assertion, task id
  creation, preparing-state publication, first state-save/message broadcast,
  `run.request_preparing` telemetry, initial request build handoff,
  `pre_gateway` Wardrobe checkpoint, required Skill preload event projection,
  and failed-gate terminal handoff while retaining later worker/probe/preflight
  orchestration.
- completed 2026-06-08: Gateway run-start target-selected phase orchestration
  moved into `adapters/gateway-run-start-target-phase-service.js`. The start
  service now delegates target selection handoff, the `gateway_selected`
  Wardrobe checkpoint, target start projection, context-ready event projection,
  plugin capability probe invocation, request/run-options refresh after probe
  evidence, and failed-gate terminal handoff while retaining model-first
  preflight and final stream orchestration.
- completed 2026-06-08: Gateway run-start execution-phase orchestration moved
  into `adapters/gateway-run-start-execution-phase-service.js`. The start
  service now delegates stream option projection, model-first toolset preflight
  invocation, permission terminal handoff, preflight request/run-options refresh,
  and final stream handoff invocation while retaining top-level phase ordering.
- completed 2026-06-08: Gateway run-start model-first toolset preflight
  execution/projection moved into
  `adapters/gateway-run-start-toolset-preflight-service.js`. The start service
  now delegates forced selection replay, selector event projection, selected
  request rebuild, authorized-toolset fallback, Wardrobe metadata refresh, and
  permission/elevation terminal handoff while retaining overall run preparation
  orchestration.
- completed 2026-06-08: Gateway run-start final stream handoff moved into
  `adapters/gateway-run-start-stream-handoff-service.js`. The start service now
  delegates the final `pre_stream` Wardrobe checkpoint, assistant run-options
  refresh, `run.request_sent` telemetry, enabled-toolset normalization,
  state-save handoff, `streamResponse` invocation, and the public `started`
  response shape while retaining overall run preparation orchestration.
- completed 2026-06-08: Gateway run active-stream registry moved into
  `adapters/gateway-run-stream-registry-service.js`. The stream service now
  delegates public/real run-id aliasing, active stream lookup/count, Gateway
  target/url lookup, alias cleanup, and failed-abort flagging while retaining
  response stream reading, liveness checks, event projection, and terminal
  stream recovery.
- completed 2026-06-08: Gateway run stream event projection moved into
  `adapters/gateway-run-stream-event-service.js`. The stream service now
  delegates event/run id extraction, terminal-event detection, output-message
  text detection, preview formatting, tool-call name projection, and Web-search
  tool budget counting/abort projection while retaining response stream
  orchestration and liveness behavior.
- completed 2026-06-08: Gateway run stream liveness checking moved into
  `adapters/gateway-run-stream-liveness-service.js`. The stream service now
  delegates start-timeout detection, delayed liveness-check suppression, Gateway
  `checkRun`, timeout signal creation, lifecycle decision application,
  warning/stale event projection, miss counter mutation, and failed-abort
  handoff while retaining liveness timer scheduling and response stream
  orchestration.
- completed 2026-06-08: Runtime Gateway concurrency projection moved into
  `adapters/mobile-runtime-gateway-concurrency-service.js`. The Gateway facade
  now delegates active-run snapshot, per-workspace limit-error projection, and
  capacity assertion error shaping while leaving concurrency policy in the
  existing injected `runConcurrencyPolicy`.
- completed 2026-06-08: Runtime Gateway provider lifecycle wiring moved into
  `adapters/mobile-runtime-gateway-provider-service.js`. The Gateway facade now
  delegates single-runner, Gateway pool, profile launcher, workspace
  provisioning, usage telemetry, status fallback projection, and run target
  release/replace behavior while retaining Gateway runtime composition singleton
  ownership.
- completed 2026-06-08: Runtime config public projection moved into
  `adapters/runtime-config-public-projection-service.js`.
  `runtime-config-provider.js` now delegates Owner-visible config projection
  while retaining persistence, validation, effective-value, Gateway worker
  setting composition, and key lookup behavior.
- completed 2026-06-08: Runtime config save input normalization moved into
  `adapters/runtime-config-save-service.js`. `runtime-config-provider.js` now
  delegates next-config payload construction while retaining load/write
  persistence, effective-value projection, Gateway worker setting composition,
  and key lookup behavior.
- completed 2026-06-08: Runtime config API key discovery and status projection
  moved into `adapters/runtime-config-key-service.js`. `runtime-config-provider.js`
  now delegates direct env, key-file, env-file, unreadable file fallback, and
  non-secret source metadata handling while retaining persisted config storage
  and injected default path lists.
- completed 2026-06-08: Runtime config default/effective value resolution moved
  into `adapters/runtime-config-effective-service.js`. The provider now delegates
  Hermes Gateway URL, Web Push subject, and Web Push VAPID effective/default
  helpers while retaining persistence, validation, Gateway worker setting
  composition, and path/env list injection.
- completed 2026-06-08: Runtime config Gateway worker setting composition moved
  into `adapters/runtime-config-gateway-worker-service.js`. The provider now
  delegates base elastic env config application, persisted worker overrides,
  elastic config projection, and public worker setting projection while retaining
  persistence, validation, and service wiring.
- completed 2026-06-08: Runtime config model catalog and selection normalization
  moved into `adapters/runtime-config-model-service.js`. The provider now
  delegates default model catalog, model family/option projection, provider/model
  fallback selection, and reasoning-effort validation while retaining persisted
  config storage, validation, and service wiring.
- deeper Gateway runtime worker policy composition outside runtime config;
- thread run preparation and deeper Gateway lifecycle wiring;
- plugin/topic routing and capability activation glue;
- directory/topic binding repair and projection helpers;
- Web Push/action-inbox delivery composition;
- workspace/profile provisioning closure.

### Static client modules

The `public/app-*.js` split should continue until navigation, topic capability
hub, composer, run progress, plugin host, and Action Inbox each have focused UI
helpers with static tests. Avoid adding new long closure chains to
`public/app.js` or broad UI modules when a focused `app-<domain>-ui.js` helper
is available.

### Gateway and MCP upgrade closure

Gateway Pool, MCP schema upgrades, and plugin reference contracts must remain
service-first:

- scheduler policy stays in `gateway-elastic-worker-scheduler.js`;
- runtime worker settings stay in `gateway-worker-runtime-settings-service.js`;
- persisted runtime config stays in `runtime-config-provider.js`;
- route writes stay in `server-routes/runtime-config-api-routes.js`;
- user-facing settings stay in `public/app-workspace-admin-ui.js`;
- MCP upgrade proof stays in `scripts/mcp-tool-upgrade-closure-smoke.js`.

## Acceptance Pattern For Each Refactor

For each extracted area:

1. Identify the owning module row in
   `docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md`.
2. Add or reuse a focused `adapters/<domain>-service.js` or provider.
3. Add a focused `tests/<domain>-service.test.js` or route/UI contract test.
4. Keep `mobile-server-runtime.js` or route composition as wiring only.
5. Run `node tests\architecture-refactor-boundary.test.js`.
6. Update module docs and this backlog if the ownership boundary changes.

## Guardrails

- Do not measure success by physical line count alone.
- Do not compress multiple unrelated statements into one line to satisfy a
  line-count gate.
- Do not create a generic "misc service" just to move text out of an entrypoint.
- Do not move route/auth checks away from route modules unless a focused
  boundary service owns them.
- Do not remove harness coverage while splitting files.
