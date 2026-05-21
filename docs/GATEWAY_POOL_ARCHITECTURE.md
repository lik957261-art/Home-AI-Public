# Gateway Pool Architecture

Hermes Mobile must preserve official Hermes agent behavior while moving product scheduling out of customized Hermes source.

## Decision

The product runtime target is Hermes Mobile over one or more official Hermes Gateway processes:

```text
Browser / PWA
    |
Hermes Mobile server
    |  Gateway Pool scheduler
Official Hermes Gateway profile A / profile B / ...
    |
Official Hermes agent runtime, tools, skills, memory, sessions, artifacts
```

Single Gateway remains the minimal install and fallback path. It is not the long-term production ceiling.

External chat bridges use the same Mobile scheduler:

```text
Weixin / iLink poller sidecar
    |
Hermes Mobile ingress queue and workspace router
    |  Gateway Pool scheduler
Official Hermes Gateway profile A / profile B / ...
    |
Hermes Mobile outbound delivery queue
    |
Weixin / iLink sender sidecar
```

Only one poller may own a Weixin account at a time. For cutover, disable that
account in any Hermes-native Gateway poller before enabling the Mobile sidecar.
This prevents cursor races, duplicate deliveries, and messages being consumed
before Mobile can route them.

## Why Pool Scheduling Belongs In Hermes Mobile

Deployments can use multiple Gateway profiles for parallel work. That mechanism can be reused without keeping product behavior patched into Hermes native code.

Hermes Mobile owns:

- User-facing queueing and concurrency policy.
- Workspace/account permissions before a run is created.
- Web Push, deep links, previews, and mobile state.
- The mapping from a Hermes Mobile run to the Gateway that owns it.

Official Hermes owns:

- Model execution.
- Agent loop semantics.
- Tool routing and tool execution.
- Skill discovery, creation, and update.
- Memory, context, compression, and session internals.
- Native run ids, run events, usage, and artifacts.

Hermes Mobile must not call Codex/OpenAI directly for user tasks and must not reimplement Hermes agent semantics.

## Worker Profile Compatibility

Gateway Pool mode expects a manifest such as:

```json
{
  "enabled": true,
  "version": 1,
  "workers": [
    {
      "name": "lowgw1",
      "profile": "lowgw1",
      "host": "127.0.0.1",
      "port": 18751,
      "api_key": "stored-outside-repo",
      "enabled": true,
      "securityLevel": "user",
      "allowedWorkspaceIds": ["*"],
      "skillProfile": "workspace:owner",
      "skillWorkspaceIds": ["owner"],
      "telemetryStateDbPath": "/var/lib/hermes-gateway/profiles/lowgw1/state.db",
      "telemetryResponseStoreDbPath": "/var/lib/hermes-gateway/profiles/lowgw1/response_store.db"
    },
    {
      "name": "maintenance1",
      "profile": "officialclean1",
      "host": "127.0.0.1",
      "port": 18651,
      "api_key": "stored-outside-repo",
      "enabled": true,
      "securityLevel": "owner-maintenance",
      "allowMaintenance": true
    }
  ]
}
```

Each worker should run an official Hermes Gateway process for its profile. Worker profiles may share official Hermes skills/memories through deployment-supported links or shared storage. When deployments need account-level Skill isolation, use `skillProfile` plus `skillWorkspaceIds` in the manifest and point that worker profile at the corresponding official Hermes Skill store. Hermes Mobile does not edit those stores directly; it only submits Gateway runs.

Workers that declare the same `skillProfile` must resolve their profile `skills`
directory to the same writable Skill store. This is required for Skill creation
and updates to be consistent across low-privilege and maintenance Gateways. For
example, an Owner run may create a Skill through a low-privilege `owner-full`
worker and later use that Skill through an Owner maintenance worker; both
profiles must see the same filesystem store. The helper
`scripts/link-skill-profile-store.js` can merge existing profile Skill
directories, back them up, and replace them with links to a shared store without
modifying official Hermes Gateway source.

Owner maintenance workers for the same operator should also resolve their
profile `memories` directory to the same Owner memory store when the deployment
needs shared long-term user preferences across direct/maintenance Gateways.
Hermes Mobile's Windows Gateway Pool starter links `officialclean*` profile
`memories` directories to the Owner root `~/.hermes/memories` by default, with
`HERMES_MOBILE_OWNER_MAINTENANCE_SHARED_MEMORY_MODE=profile-local` available as
an opt-out. Only `memories` is shared this way. `state.db`,
`response_store.db`, `config.yaml`, logs, plugins, and profile directories
remain profile-local because they contain session/runtime state and can be
unsafe to share across concurrent Gateway processes.
When converting an existing owner-maintenance profile-local `memories`
directory, the starter copies and backs up only top-level Markdown memory files
(`*.md`) into the shared Owner memory store. Non-Markdown files are not merged
into shared memory; if they prevent replacing the directory with a symlink, the
starter leaves that profile-local directory in place and logs the condition.
Empty `*.md.lock` files from previous built-in memory writes are discarded
during this conversion because they contain no memory content and should not
keep an otherwise migrated profile on a profile-local memory directory.

Low-privilege `securityLevel=user` workers must also expose an ordinary-user
`api_server` platform toolset. This is not a tiny whitelist: public web/search,
scoped HTTP, weather, isolated browser automation, in-scope files, vision,
video, image generation/editing, messaging, TTS, profile-local Skills, Todo,
Kanban, Cron, memory, session search, and clarification are ordinary
low-permission capabilities when the target stays inside the current account,
workspace, and allowed roots. Manifest labels decide which worker may be
selected, but labels alone are not a capability boundary. A user worker profile
must explicitly omit developer/system/cross-boundary toolsets such as
`terminal`, `process`, `code_execution`, `delegation`, `git`, `source`,
`codex`, `computer_use`, `homeassistant`, RL/MOA fanout, and broad MCP
exposure. Owner-maintenance profiles may retain those toolsets, but only
workers labeled `securityLevel=owner-maintenance` and selected through an
explicit Owner elevation path should use them.

The low-privilege `skills` toolset is allowed only for the current
account/workspace's profile-local Skill store selected by `skillProfile`. It is
not permission to write the shared/global Skill store, the Owner full Skill
store, or another account's Skill store.

## Scheduler Contract

The scheduler:

- Reads `HERMES_WEB_GATEWAY_POOL_MANIFEST`, or deployment-default manifest candidates, when pool mode is enabled or auto.
- Filters disabled workers.
- Honors exact hints such as `worker_profile`, `worker_profiles`, `worker_name`, and `worker_names`.
- Honors optional preferred hints such as `preferred_worker_profiles` and `preferred_worker_names`.
- Honors optional `provider`, `worker_tags`, `securityLevel`, `allowedWorkspaceIds`, and `allowMaintenance` filters.
- Honors optional Skill profile routing hints. In `auto` mode, legacy manifests without `skillProfile` / `skillWorkspaceIds` keep old worker selection; once a manifest declares Skill routing fields, ordinary user runs must match the current `actorWorkspaceId` through `skillWorkspaceIds`. In `on` mode, missing Skill routing fields fail closed for ordinary user runs.
- Health checks `/health` with the worker's API key.
- Picks healthy workers round-robin.
- For ordinary user runs, requires a healthy `securityLevel=user` worker and fails closed with `503` if none is available.
- For explicit Owner maintenance runs, may select `securityLevel=owner-maintenance` workers only when the request is marked as maintenance and the deployment enables Owner maintenance routing.
- Falls back to the configured default Gateway only for non-user fallback paths. Owner-maintenance workers must not be used as ordinary user-run fallback.

Shared/system Skill writes are treated as an Owner elevation case, not as
ordinary user routing. If an Owner is currently using a low-privilege Gateway
and asks to create, update, or publish a Skill for all users/workspaces, Hermes
Mobile returns an elevation-required response. After the Owner explicitly
approves, only that one run is marked as maintenance and routed to an
`owner-maintenance` worker. If the run is already in Owner maintenance mode, no
second approval is required.

The worker API key is read from the manifest for requests only. It must not be written to messages, SQLite rows, state snapshots, browser payloads, logs, or docs.

## Concurrency Contract

Hermes Mobile owns product-level concurrency before a Gateway run is created.

- `HERMES_WEB_MAX_ACTIVE_RUNS` limits active model runs globally.
- `HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE` limits active model runs for one workspace/account.
- `0` means unlimited for that dimension.
- Single-window chat still keeps its serial per-chat queue. Messages queued behind an already-running chat turn do not count as active until they start.
- If a limit is reached, Hermes Mobile rejects the new model request with `429` before appending user/assistant messages. This avoids creating invisible backlog rows that block later work.
- Queued chat turns are checked again when they are promoted to active runs.

The status API exposes only counts and limits, not prompts, secrets, or worker API keys. Owner UI surfaces the Gateway Pool health and concurrency summary in the account/runtime panel. Workspace-scoped users do not receive manifest paths, worker URLs, catalog file paths, or reasoning-source file paths.

## Run Routing

Every started Hermes Mobile assistant message stores non-secret routing metadata:

- `gatewayUrl`
- `gatewayName`
- `gatewayProfile`
- `gatewaySource`

The browser receives only non-secret worker labels/profile/source for diagnostics. The API key is resolved in memory from the manifest by `gatewayUrl` whenever Hermes Mobile needs to stream, stop, or check the run.

Hermes Mobile must use the same Gateway for:

- `/v1/responses` stream creation.
- Streaming event reads.
- `/v1/runs/<id>/stop`.
- `/v1/runs/<id>` liveness checks.

This prevents a run created on one worker from being stopped or probed through another worker.

## Failure And Fallback

Pool fallback is allowed only before a run is created. After a run is created, that run must stay bound to its owning Gateway.

If a listener restart detaches an active stream, Hermes Mobile should mark the Web message stale/failed rather than guessing another Gateway. If the persisted `gatewayUrl` still maps to a manifest worker, stop/liveness operations may use the manifest key; otherwise the run is treated as detached.

## Clean Official Hermes Policy

Custom deployment behavior should move into Hermes Mobile adapters and services:

- Todo service.
- Automation service.
- Workspace/account policy.
- Web Push routing.
- Preview/artifact authorization.

Official Hermes should remain clean enough to upgrade directly from upstream. If Hermes needs a missing public field, Hermes Mobile should handle compatibility locally and track the desired upstream contract separately instead of patching product behavior into Gateway source.

## Configuration

- `HERMES_WEB_GATEWAY_POOL_ENABLED=auto|true|false`
- `HERMES_WEB_GATEWAY_POOL_MANIFEST=<path-to-worker-pool.json>`
- `HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS=5000`
- `HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING=auto|on|off`
- `HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED=auto|true|false`
- `HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS=<read-only-profile-root-list>`
- `HERMES_WEB_MAX_ACTIVE_RUNS=<global-active-run-limit-or-0>`
- `HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE=<per-workspace-active-run-limit-or-0>`
- `HERMES_WEB_HERMES_API_BASE=<fallback-gateway-url>`
- `HERMES_WEB_HERMES_API_KEY_PATH=<fallback-gateway-api-key-file>`

In `auto` mode, Hermes Mobile uses the pool only when a manifest exists and declares enabled workers.
If a Gateway response omits cached-token or cost fields, Hermes Mobile may
read official Hermes profile `response_store.db` and `state.db` files through
the telemetry profile root to recover session-level cached tokens, API call
count, and cost status. This is a read-only compatibility adapter; it does not
patch Gateway source or reconstruct per-call routing details.
For process-isolated workers whose profile DBs live outside the default
profile root, set per-worker `telemetryStateDbPath` and
`telemetryResponseStoreDbPath` in the deployment manifest. These paths are
deployment configuration and must not contain secrets or be committed with
local machine paths in a public release.

User-run safety depends on the manifest. At least one healthy `securityLevel=user`
worker is required for chat/tasks. Workers that can read operator source,
deployment config, or broad Hermes home state should be labeled
`owner-maintenance` and kept out of normal scheduling.

## Acceptance Tests

Before treating Gateway Pool mode as production-ready, validate:

- A normal chat/task run selects a worker and streams to completion.
- The persisted message records the worker URL/profile but not the API key.
- Stop/cancel calls the same worker that created the run.
- Liveness checks call the same worker that created the run.
- Missing/disabled/unhealthy worker manifest falls back to the configured default Gateway.
- Product-level active-run limits reject excess new work before run creation.
- A Weixin sidecar event is accepted once, deduplicated by event id, routed to the correct workspace, scheduled through the same Gateway Pool, and surfaced as a pending outbound delivery after the run reaches a terminal state.
- A task that uses an existing Skill still uses official Hermes behavior.
- A task that creates or updates a Skill writes through official Hermes behavior.
- Usage, events, and artifacts are preserved through the GatewayRunner boundary.
