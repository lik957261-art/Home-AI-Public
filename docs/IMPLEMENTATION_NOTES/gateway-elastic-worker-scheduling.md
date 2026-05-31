# Gateway Elastic Worker Scheduling

Status: implemented in source as `20260531-gateway-elastic-v404` and deployed
to the maintained production app in eager mode. Production hybrid/on-demand
mode was probed and rolled back on 2026-05-31 because listener-triggered
non-Owner cold start still failed with `gateway_pool_script_failed`; keep
production eager until that path passes a real Mobile API cold-start smoke.

## Classification

This is an H1 Gateway workflow change because it alters worker startup, profile
routing, queueing, run telemetry, status projection, and production startup
behavior. The source implementation must keep the workflow harness scenarios in
`docs/IMPLEMENTATION_NOTES/harness-required-matrix.md` and
`docs/TEST_MATRIX.md` passing before any production switch to hybrid mode.

## Problem

The current maintained deployment can eagerly start a large fixed Gateway Pool
at boot. That has three practical problems:

- Idle resource cost is high when most profiles are not being used.
- A normal workspace can still queue behind one worker even while other
  prestarted workers sit idle for unrelated profiles.
- Provider/profile switching, such as ChatGPT to DeepSeek, multiplies the
  number of workers that must stay warm if every profile is prestarted.

Eager startup also amplifies process-launch defects. A bug that opens visible
PowerShell or terminal windows is much more damaging when startup or watchdog
logic fans out across many workers.

## Target Model

Hermes Mobile now supports moving from an eager fixed pool to a hybrid elastic
pool. The scheduler keeps a small warm baseline, starts compatible workers on
demand, reuses them while warm, and retires idle workers after a bounded time.

Initial policy:

| Actor class | Minimum warm workers | Maximum workers | Notes |
| --- | ---: | ---: | --- |
| Owner | 1 | 4 | Keep one Owner-compatible interactive worker warm. Expand up to four for concurrent Owner work or provider/profile switching. |
| Non-Owner workspace | 0 | 2 | No always-on worker. Start on demand and allow one extra concurrent worker before queueing. |

Recommended first defaults:

- `HERMES_MOBILE_GATEWAY_POOL_START_MODE=hybrid`
- `HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM=1`
- `HERMES_MOBILE_GATEWAY_OWNER_MAX_WORKERS=4`
- `HERMES_MOBILE_GATEWAY_WORKSPACE_MIN_WARM=0`
- `HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS=2`
- `HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS=8`
- `HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES=180`
- `HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS=90000`

The `HERMES_WEB_*` aliases should remain accepted for existing production
launchers until the deployment scripts are fully migrated.

## Source Implementation

The v404 source implementation adds these boundaries:

- `adapters/gateway-elastic-worker-scheduler.js`: compatibility key, lifecycle
  state, per-workspace caps, global cap queueing, idle retirement, and bounded
  scheduler events.
- `adapters/gateway-worker-profile-launch-service.js`: hidden PowerShell launch
  wrapper for single-profile start/stop through `scripts/start-gateway-pool.ps1`.
- `adapters/gateway-pool-provider.js`: hybrid mode worker choice, warm worker
  discovery, on-demand launch, and status projection.
- `adapters/gateway-run-start-service.js` and
  `adapters/gateway-runtime-composition-service.js`: scheduler events enter the
  run-progress timeline and run completion releases assigned workers.
- `adapters/gateway-status-projection.js`: configured/stopped elastic workers
  are expected state while failed expected-running workers still degrade status.
- `scripts/start-gateway-pool.ps1`, `scripts/start-low-gateways-child.ps1`, and
  `scripts/start-low-gateways.sh`: hybrid startup and single-profile
  `-StartProfiles` / `-StopProfiles` operations.
- `public/app-run-progress-ui.js` and `public/app-platform-status-ui.js`: model
  status and Gateway Pool status show queued, starting, reused, failed, running,
  and stopped states from bounded metadata.

The default environment remains `eager` unless
`HERMES_MOBILE_GATEWAY_POOL_START_MODE=hybrid` or its `HERMES_WEB_*` alias is
set in the launcher. Switching production to hybrid requires backup, script
sync, listener restart, status smoke, and a real run smoke. The Gateway Pool
itself does not need a full restart merely because the listener starts issuing
on-demand single-profile operations.

## Worker Compatibility Key

A running worker can only be reused when it is compatible with the requested
run. The compatibility key must include at least:

- workspace id / actor class;
- profile id;
- provider family, such as OpenAI/Codex, DeepSeek, Grok/XAI;
- permission tier, such as low-permission versus Owner maintenance;
- effective enabled toolset set and schema epoch;
- MCP/plugin workspace binding, such as Wardrobe or future plugin-owned MCP
  servers;
- manifest `profile` / `port` / `api_key` identity.

Do not reuse a worker merely because it is healthy. A healthy but mismatched
worker can expose the wrong callable schema, wrong provider, or wrong
workspace-bound MCP key.

Owner maintenance workers remain a separate permission tier unless a future
implementation explicitly proves they can be collapsed into the Owner
interactive pool. A high-permission Owner maintenance worker must never be
shared with ordinary non-Owner runs.

## Lifecycle States

The scheduler should project worker state without treating stopped on-demand
workers as failures:

- `configured`: profile exists in the manifest but no process is running.
- `starting`: a process launch is in progress.
- `warm`: process is healthy and ready, with no active run.
- `busy`: one or more active runs are assigned.
- `idle`: process is warm after a completed run and has an idle retirement
  deadline.
- `idle_stopping`: idle TTL expired and stop is in progress.
- `failed`: last launch or health check failed with a bounded diagnostic.
- `retired`: profile was intentionally retired or removed from active service.

`/api/status?detail=1` should distinguish `configured` and `stopped` elastic
workers from unhealthy workers. In hybrid mode, "not running because no run
needs it" is expected state, not degraded health.

## Scheduling Algorithm

1. Normalize the run target from request, route, workspace policy, provider
   selection, toolset policy, and permission tier.
2. Search for a compatible `warm`, `idle`, or already-running configured worker
   with spare execution capacity.
3. If found, assign the run and emit a bounded status event such as
   `run.gateway_worker_reused`.
4. If none is found, check the workspace actor cap and the global elastic cap.
5. If caps allow, start the best matching profile from
   `gateway-pool-manifest.json`, mark it `starting`, and emit
   `run.gateway_worker_starting`.
6. If caps are exhausted, queue the run and emit `run.gateway_worker_queued`
   with reason `workspace_capacity`, `global_capacity`, or `profile_affinity`.
7. When a run reaches terminal state, update the worker to `warm` or `idle` and
   schedule idle retirement.
8. The reaper stops only workers whose idle TTL has expired and which have no
   active run, no protected maintenance operation, and no startup/recovery
   action in progress.

Provider selection is user intent. If a user selects DeepSeek and no compatible
DeepSeek worker can be started, the run should fail or queue with a clear
diagnostic. It must not silently fall back to OpenAI/Codex, Grok, or another
provider to reuse an available process.

## Status And UI Projection

The model status / run-progress surface should show the scheduler state in
plain bounded language. The payload should use stable reason codes that the
frontend can localize, for example:

- `worker_reused`
- `worker_starting`
- `queued_workspace_capacity`
- `queued_global_capacity`
- `warm_reusable_until`
- `idle_retirement_countdown`
- `start_failed_profile_missing`
- `start_failed_port_busy`
- `start_failed_auth_check`

The status payload should include only non-secret metadata:

- `workerId`, `profileId`, `provider`, `workspaceId`, `permissionTier`;
- `state`, `activeRunCount`, `queueDepth`;
- `warmUntil`, `idleSince`, `idleExpiresAt`;
- `lastStartDurationMs`, `lastFailureCode`, `lastFailureAt`.

It must not expose raw API keys, workspace keys, browser cookies, OAuth tokens,
plugin launch tokens, push endpoints, raw prompts, raw model output, or long
logs.

## Production Startup

Hybrid startup should not launch every configured Gateway profile. It should:

- load and validate the manifest;
- start the Owner minimum warm worker;
- skip non-Owner workers until a run needs them;
- leave provider-specific profiles in `configured` state;
- start protected maintenance workers only when the maintenance contract
  requires them;
- publish status that shows configured-but-stopped workers as expected.

The existing eager path must remain available for rollback:

- `HERMES_MOBILE_GATEWAY_POOL_START_MODE=eager`

Rollback should not require manifest renumbering or profile deletion. It should
only switch the startup mode and restart the appropriate runtime tier.

## Implementation Phases

Phase 0: documentation and harness planning. Completed.

- This document.
- `docs/MODULES/gateway-pool.md` summary.
- Harness matrix and test matrix entries.

Phase 1: status model without behavior change. Completed in v404.

- Project current eager workers into the new lifecycle shape.
- Add status fields for warm/idle/busy/failed without changing startup.
- Add tests that prove stopped-on-demand status is not counted unhealthy.

Phase 2: scheduler service in compatibility mode. Completed in v404.

- Add a service that can choose compatible workers from the manifest.
- Keep eager startup available.
- Route new runs through the scheduler while existing warm workers are still
  prestarted.

Phase 3: on-demand start and idle retirement. Completed in v404 source.

- Start non-warm compatible workers on demand.
- Enforce Owner max 4 and non-Owner max 2.
- Add global cap queueing.
- Add idle TTL reaper that never stops active runs.

Phase 4: production hybrid startup. Source support completed in v404; production
switch is still a deployment operation.

- Change maintained production launcher to hybrid mode.
- Start Owner minimum warm worker only.
- Verify provider switching and non-Owner cold-start flows.
- Keep eager rollback documented and smoke-tested.

## Required Harness Scenarios

Minimum H1 scenarios for implementation:

- Owner startup creates exactly one compatible warm worker in hybrid mode.
- Non-Owner startup creates zero warm workers in hybrid mode.
- Owner concurrent runs expand up to four workers and then queue.
- Non-Owner concurrent runs expand up to two workers and then queue.
- A compatible warm worker is reused instead of starting a new process.
- A provider switch starts or selects a provider-compatible worker and never
  reroutes to another provider solely to reuse a process.
- The global cap queues new work after the configured limit.
- Queue events distinguish workspace cap, global cap, and profile-affinity
  waits.
- Idle TTL stops only idle workers after the configured duration.
- Active, starting, and maintenance-protected workers are not stopped by the
  reaper.
- A launch failure records a bounded diagnostic and releases or preserves the
  run queue according to terminal state.
- `/api/status?detail=1` reports configured/stopped on-demand workers without
  marking the whole Gateway Pool unhealthy.
- Startup scripts in hybrid mode do not launch the historical full fixed pool.
- Status/UI tests show starting, reused, queued, idle-retirement, and failed
  states without exposing secrets or long logs.

## Open Questions For Implementation

- Whether the first production global cap should be `8` or another number after
  measuring cold-start cost and memory consumption on the PC.
- Whether some plugin-owned MCP profiles, such as Wardrobe, need a shorter or
  longer idle TTL because startup includes plugin/session initialization.
- Production follow-up from the 2026-05-31 hybrid probe: a direct operator
  `-StartProfiles lowgw6 -NoStopExisting` run could start the profile, but the
  same profile start triggered through the Mobile listener failed and degraded
  `/api/status?detail=1`. Before enabling hybrid again, reproduce the listener
  launch path, capture bounded stdout/stderr diagnostics, and verify Owner warm
  reuse plus a non-Owner cold-start Mobile API run without manual intervention.

Resolved in v404:

- Owner warm baseline uses the low-permission Owner interactive worker tier.
  Owner-maintenance workers remain a separate protected tier.
