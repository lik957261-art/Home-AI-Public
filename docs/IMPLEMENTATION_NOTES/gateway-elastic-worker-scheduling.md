# Gateway Elastic Worker Scheduling

Status: implemented in source as `20260531-gateway-elastic-v404` and later
production hotfixes. Maintained production now runs hybrid/on-demand mode after
the listener launch path, run-id release, and tier-scoped capacity fixes passed
focused smoke on 2026-05-31. Future Gateway startup changes must keep the
hybrid harness and production smoke gates in this document passing.

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
| Owner OpenAI/Codex | 1 | 4 | Keep one Owner-compatible ChatGPT/OpenAI-Codex worker warm. Expand up to four for concurrent Owner work. |
| Owner DeepSeek | 0 | 2 | DeepSeek profiles are provider-dedicated and stay cold until an explicit DeepSeek run. |
| Owner maintenance | 0 | 2 | High-permission `officialclean*` / `deepseekmaint*` workers are not always-on in hybrid mode. Start only for an explicit maintenance/elevation run and retire after idle TTL. |
| Non-Owner OpenAI/Codex | 0 | 2 | No always-on worker. Provision two ChatGPT/OpenAI-Codex candidate profiles, start on demand, and allow one extra concurrent worker before queueing. |
| Non-Owner DeepSeek | 0 | 1 | Provision one workspace-dedicated DeepSeek profile when DeepSeek is available. Start only for explicit DeepSeek runs. |

The maximum is an upper bound over same-provider compatible worker profiles, not
a guarantee that every provider has that many profiles. If a workspace has one
OpenAI/Codex profile and one DeepSeek profile, a normal ChatGPT run can only use
the OpenAI/Codex profile; the DeepSeek profile does not count as a second
ChatGPT slot. Workspace provisioning must create two `openai-codex` `lowgw*`
profiles and one `deepseekgw*` profile for ordinary workspaces when DeepSeek is
configured.

The workspace cap is also tier-scoped. Low-permission user workers count
against the Owner or workspace user-worker cap, while `owner-maintenance`
workers such as `officialclean*` and `deepseekmaint*` are governed by their own
maintenance routing, `ownerMaintenanceMaxWorkers`, and the global cap. Stopped
owner-maintenance workers are expected in hybrid mode, and the watchdog must not
turn that expected stopped state back into a permanent warm pool. Owner
maintenance capacity must not prevent Owner's normal low-permission work from
expanding from `lowgw1` to `lowgw2`/`lowgw3`/`lowgw4`.

Recommended first defaults:

- `HERMES_MOBILE_GATEWAY_POOL_START_MODE=hybrid`
- `HERMES_MOBILE_GATEWAY_OWNER_MIN_WARM=1`
- `HERMES_MOBILE_GATEWAY_OWNER_MAX_WORKERS=4`
- `HERMES_MOBILE_GATEWAY_OWNER_DEEPSEEK_MAX_WORKERS=2`
- `HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MIN_WARM=0`
- `HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MAX_WORKERS=2`
- `HERMES_MOBILE_GATEWAY_WORKSPACE_MIN_WARM=0`
- `HERMES_MOBILE_GATEWAY_WORKSPACE_MAX_WORKERS=2`
- `HERMES_MOBILE_GATEWAY_WORKSPACE_DEEPSEEK_MAX_WORKERS=1`
- `HERMES_MOBILE_GATEWAY_ELASTIC_MAX_WORKERS=8`
- `HERMES_MOBILE_GATEWAY_WORKER_IDLE_TTL_MINUTES=180`
- `HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS=300000`
- `HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=30000`
- `HERMES_MOBILE_GATEWAY_START_HEALTH_POLL_MS=1000`

The `HERMES_WEB_*` aliases should remain accepted for existing production
launchers until the deployment scripts are fully migrated.

When the maintained Windows listener runs under an account that cannot see the
registered WSL distro, hybrid on-demand starts must set:

- `HERMES_MOBILE_GATEWAY_START_SCHEDULED_TASK_NAME=Hermes Mobile Gateway Pool`
- `HERMES_MOBILE_GATEWAY_WORKER_ROOT=C:\ProgramData\HermesMobile\gateway-worker`

The listener then writes only action/profile metadata to
`elastic-requests\pending`, triggers the scheduled task, and waits for a bounded
result file. Raw API keys, workspace keys, auth tokens, prompts, and model
outputs must never be placed in those request or result files.

This is a recurring Windows/WSL account-boundary issue. Production validation
must use the listener-triggered Mobile API path, not only an operator-run
PowerShell command, because those can run under different Windows accounts and
see different WSL distro registrations.

On the maintained single-user production machine, the preferred fix is to run
the listener in the same caller context as the WSL/Codex owner (`GMK\xuxin`) and
disable the scheduled-task relay. The relay remains available for deployments
that intentionally keep listener and WSL owner accounts separate.

The maintained production script has a caller-context guard: a
`C:\ProgramData\HermesMobile\listener-run-in-caller-context.flag` marker or
`HERMES_MOBILE_LISTENER_RUN_IN_CALLER_CONTEXT=1` /
`HERMES_WEB_LISTENER_RUN_IN_CALLER_CONTEXT=1` forces
`scripts/start-worker-host.ps1` into caller-context mode even when an operator
runs a plain `-ReplaceExisting`. This prevents a recurrent failure where the
listener is accidentally relaunched as `GMK\HermesMobileWorker`, but
listener-triggered WSL/Gateway starts then fail while manual operator starts
still succeed.

The scheduled task principal should remain the WSL-owning Windows account, but
the listener account must be able to demand-run that task. If `schtasks.exe
/Run` fails before the request is consumed, the relay is not active even though
the operator can start the same profile manually.

After the profile startup script exits successfully, the scheduler must still
poll `/health` for a short bounded window before declaring the user run failed.
The WSL script can return just before the Mobile-side health probe observes the
new listener; a single immediate failed probe is not sufficient evidence of
startup failure.

## Source Implementation

The v404 source implementation adds these boundaries:

- `adapters/gateway-elastic-worker-scheduler.js`: compatibility key, lifecycle
  state, per-workspace caps, global cap queueing, idle retirement, and bounded
  scheduler events.
- `adapters/gateway-worker-profile-launch-service.js`: hidden PowerShell launch
  wrapper for single-profile start/stop, including profile-specific
  owner-maintenance start/stop. It can also use a scheduled-task request relay
  when the listener account cannot directly start the WSL worker.
- `adapters/gateway-pool-provider.js`: hybrid mode worker choice, warm worker
  discovery, on-demand launch, and status projection.
- `adapters/gateway-run-start-service.js` and
  `adapters/gateway-runtime-composition-service.js`: scheduler events enter the
  run-progress timeline and run completion releases assigned workers.
- `adapters/gateway-status-projection.js`: configured/stopped elastic workers
  are expected state while failed expected-running workers still degrade status.
- `scripts/start-gateway-pool.ps1`, `scripts/start-low-gateways-child.ps1`, and
  `scripts/start-low-gateways.sh`: hybrid startup, scheduled-task launch
  request processing, low-permission single-profile `-StartProfiles` /
  `-StopProfiles`, and owner-maintenance `-OwnerMaintenanceOnly
  -StartProfiles/-StopProfiles` operations.
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

Status reconciliation must also clear stale warm state. If a worker was
previously warm but a later `/health` check fails and no active run is assigned,
`/api/status?detail=1` must project it back to `configured` rather than
continuing to report a stopped process as warm.

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
7. When Gateway reports the real response/run id, replace the scheduler's
   public Mobile run id assignment with that real id. Terminal events often
   carry the real response id, so failing to mirror this alias leaks the worker
   slot and leaves later compatible runs queued.
8. When a run reaches terminal state, update the worker to `warm` or `idle` and
   schedule idle retirement.
9. The reaper stops only workers whose idle TTL has expired and which have no
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
- leave owner-maintenance profiles in `configured` state unless an explicit
  high-permission maintenance/elevation run needs one;
- publish status that shows configured-but-stopped workers as expected.

Startup should also avoid full profile reconfiguration on every restart.
`start-low-gateways.sh` maintains a non-secret configure signature for the
generator script, manifest, runtime override source, Gateway plugin sources, and
Skill Store mapping inputs. If the selected profiles already have their
telemetry directory, `config.yaml`, plugin directory, `skills` link, shared auth
link, and lock link, and the signature matches, the script skips
`configure-low-gateways.sh` for both full hybrid/eager starts and selected
profile starts. A changed manifest, changed generator, changed plugin/schema
source, changed Skill Store mapping input, missing profile artifact, or explicit
`start-gateway-pool.ps1 -ForceConfigure` must force reconfiguration. The cache
file stores only a hash, never API keys, workspace keys, OAuth tokens, prompts,
or profile config bodies.

`Hermes Mobile Maintenance Gateway Watchdog` is still valid in eager mode and
for deployments that opt into a maintenance warm baseline. In hybrid mode the
default `HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MIN_WARM=0` means the watchdog
must skip closed owner-maintenance ports instead of repairing them every five
minutes. Setting the min-warm value above zero is an explicit choice to maintain
that many high-permission workers warm.

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
- Enforce provider-scoped caps: Owner OpenAI/Codex max 4, Owner DeepSeek max 2,
  non-Owner OpenAI/Codex max 2, and non-Owner DeepSeek max 1.
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
- Owner DeepSeek starts cold on demand, expands up to two workers, and then
  queues without consuming or increasing the Owner OpenAI/Codex cap.
- Non-Owner DeepSeek starts cold on demand and queues the second concurrent
  DeepSeek run even when that workspace still has OpenAI/Codex capacity.
- Owner-maintenance warm workers do not consume the Owner low-permission user
  worker cap.
- Owner-maintenance runs start a selected `officialclean*` / `deepseekmaint*`
  profile on demand, enforce their own cap, and queue after that cap.
- Owner-maintenance idle retirement stops only the selected maintenance profile,
  and the hybrid watchdog does not restart it when min-warm is zero.
- `/api/status?detail=1` clears a previously warm worker after the underlying
  process is stopped and health no longer responds.
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
- Response-created run id replacement preserves scheduler ownership, and a
  later terminal release using the real response id frees the worker slot.
- `/api/status?detail=1` reports configured/stopped on-demand workers without
  marking the whole Gateway Pool unhealthy.
- Startup scripts in hybrid mode do not launch the historical full fixed pool.
- Startup scripts skip full low-Gateway reconfiguration when the configure
  signature is current and selected profiles are ready, but force
  reconfiguration when `-ForceConfigure` is passed or the signature inputs
  change.
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
- The root cause found after the rollback was that listener-triggered
  single-profile starts inherited the original 90-second timeout while
  `start-low-gateways.sh` still ran full low-Gateway reconfiguration before
  every selected profile start. The v405 fix must skip full configure for
  stop-only operations and for listener on-demand `-NoStopExisting` selected
  profile starts whose config/auth/profile links are already ready, keep bounded
  stdout/stderr diagnostics, and use a 300-second start timeout as a safety net
  for the first post-deploy cold start.

Resolved in v404:

- Owner warm baseline uses the low-permission Owner interactive worker tier.
  Owner-maintenance workers remain a separate protected tier.
