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

## Why Pool Scheduling Belongs In Hermes Mobile

Existing private production already uses multiple Gateway profiles for parallel work. That mechanism can be reused without keeping product behavior patched into Hermes native code.

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
      "name": "worker1",
      "profile": "worker1",
      "host": "127.0.0.1",
      "port": 8651,
      "api_key": "stored-outside-repo",
      "enabled": true
    }
  ]
}
```

Each worker should run an official Hermes Gateway process for its profile. Worker profiles may share official Hermes skills/memories through deployment-supported links or shared storage. Hermes Mobile does not edit those stores directly; it only submits Gateway runs.

## Scheduler Contract

The scheduler:

- Reads `HERMES_WEB_GATEWAY_POOL_MANIFEST`, or deployment-default manifest candidates, when pool mode is enabled or auto.
- Filters disabled workers.
- Honors exact hints such as `worker_profile`, `worker_profiles`, `worker_name`, and `worker_names`.
- Honors optional preferred hints such as `preferred_worker_profiles` and `preferred_worker_names`.
- Honors optional `provider` and `worker_tags` filters.
- Health checks `/health` with the worker's API key.
- Picks healthy workers round-robin.
- Falls back to the configured default Gateway when the manifest is missing, disabled, has no matching worker, or has no healthy worker.

The worker API key is read from the manifest for requests only. It must not be written to messages, SQLite rows, state snapshots, browser payloads, logs, or docs.

## Run Routing

Every started Hermes Mobile assistant message stores non-secret routing metadata:

- `gatewayUrl`
- `gatewayName`
- `gatewayProfile`
- `gatewaySource`

The API key is resolved in memory from the manifest by `gatewayUrl` whenever Hermes Mobile needs to stream, stop, or check the run.

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

Official Hermes should remain clean enough to upgrade directly from upstream. If Hermes needs a missing public field, Hermes Mobile should handle compatibility locally and track the desired upstream contract separately instead of patching private product behavior into Gateway source.

## Configuration

- `HERMES_WEB_GATEWAY_POOL_ENABLED=auto|true|false`
- `HERMES_WEB_GATEWAY_POOL_MANIFEST=<path-to-worker-pool.json>`
- `HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS=5000`
- `HERMES_WEB_HERMES_API_BASE=<fallback-gateway-url>`
- `HERMES_WEB_HERMES_API_KEY_PATH=<fallback-gateway-api-key-file>`

In `auto` mode, Hermes Mobile uses the pool only when a manifest exists and declares enabled workers.

## Acceptance Tests

Before treating Gateway Pool mode as production-ready, validate:

- A normal chat/task run selects a worker and streams to completion.
- The persisted message records the worker URL/profile but not the API key.
- Stop/cancel calls the same worker that created the run.
- Liveness checks call the same worker that created the run.
- Missing/disabled/unhealthy worker manifest falls back to the configured default Gateway.
- A task that uses an existing Skill still uses official Hermes behavior.
- A task that creates or updates a Skill writes through official Hermes behavior.
- Usage, events, and artifacts are preserved through the GatewayRunner boundary.
