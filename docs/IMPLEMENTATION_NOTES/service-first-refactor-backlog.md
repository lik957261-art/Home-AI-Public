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
- Gateway runtime config and worker policy composition;
- thread run preparation and Gateway lifecycle wiring;
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
