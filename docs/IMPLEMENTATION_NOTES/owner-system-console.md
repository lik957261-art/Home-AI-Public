# Owner System Console

## Purpose

Owner System Console is an Owner-only, read-only operational surface for Home AI.
It answers the first 30 seconds of platform triage:

- current 3A status: Availability, Accuracy, and Autonomy;
- current host and runtime pressure;
- bounded evidence behind degraded states;
- owning layer and next recommended action;
- whether the next action is observe, run a check, dispatch a task card,
  deploy, restart, or requires explicit Owner confirmation.

The console is not a public settings page, a log browser, or an action executor
in the MVP.

## MVP Boundary

The first implementation is read-only.

Allowed:

- collect bounded CPU, memory, disk, uptime, service, Gateway, and plugin health
  metadata;
- collect bounded Autonomous Delivery dispatch-control metadata for failed,
  deferred-conflict, dispatching, and sent slices;
- compute a bounded 3A quality-program snapshot from existing SLO, resource,
  dispatch, and explicit canary/action evidence;
- expose Owner-only read APIs;
- render an Owner-only static UI entry;
- show status, evidence counts, thresholds, and recommended actions.

Not allowed in MVP:

- restart, deploy, repair, mutate runtime config, or enqueue task cards from the
  console UI;
- expose command lines, raw logs, raw file paths, secrets, access keys, OAuth
  tokens, cookies, provider payloads, private DB rows, prompts, or screenshots;
- make the console available to non-Owner workspaces.

## Backend Shape

`adapters/system-resource-status-service.js` owns resource collection and
threshold classification. It emits bounded normalized signals:

```text
signalId
category
status
severity
summary
boundedEvidence
lastCheckedAt
source
recommendedAction
actionRequiresOwnerConfirmation
```

`adapters/owner-system-console-service.js` owns console aggregation:

- normalizes resource signals;
- builds 3A dimensions from resource status and the Runtime SLO model;
- folds Autonomous Delivery dispatch-control state into the Autonomy dimension;
- folds Autonomous Delivery loop health into the Autonomy dimension, including
  bounded case counts, waiting-return counts, stale Watchdog rows, duplicate
  suppression counts, and recent case summaries;
- attaches a read-only 3A quality-program snapshot;
- extracts critical signals;
- publishes page readiness for the future console sections;
- keeps `policy.readOnlyMvp=true` and `policy.actionExecutionEnabled=false`.

The service constructs a default read-only
`adapters/system-resource-status-service.js` collector when a caller does not
inject `collectSystemStatus` or `systemResourceStatusService`. Production
composition still injects the collector explicitly so paths, data roots,
thresholds, launchd labels, and command runners remain deployment-owned. Tests
or constrained harnesses that need the previous "collector not configured"
state must pass `disableDefaultSystemResourceStatusService=true`; otherwise the
direct service path should expose bounded CPU, memory, disk, launchd, and
uptime evidence instead of reporting `unknown` by default.

`adapters/owner-3a-quality-program-service.js` owns the quality-program
snapshot. It tracks the five long-running 3A workstreams:

- Runtime SLO and Diagnostic Closure;
- Fresh Install and Upgrade Canary;
- Gateway Output to Message Action Contract;
- Self-Improving Loop Closure;
- Architecture Governance Hardening.

The snapshot is not a completion claim. It computes bounded workstream
requirements and current gaps from already-available evidence. If generalized
deterministic-action evidence is not provided, that requirement remains
`partial` instead of being silently marked complete. Generalized evidence
closes only when the maintained plugin action metadata aggregate proves
multiple action families and action classes.

`adapters/owner-3a-quality-evidence-service.js` owns the bounded evidence
ingest for that snapshot. It reads metadata-only evidence produced by the daily
self-improving loop from:

```text
<HERMES_WEB_DATA_DIR>/hermes-home/self-improving-loop/owner-3a-quality-evidence.json
```

or from `HERMES_OWNER_3A_QUALITY_EVIDENCE_FILE` /
`HERMES_SELF_LOOP_QUALITY_EVIDENCE_OUTPUT` when explicitly configured. The
production mobile API composition injects the configured Home AI `DATA_DIR` as
`HERMES_WEB_DATA_DIR` for this service when no explicit evidence-file override
is present, so the Owner Console reads the same production evidence file that
the self-improving loop and deploy seed path maintain. The
evidence service does not execute canaries on page load. It only normalizes
already-produced reports. Install/upgrade canary evidence closes
`clean_target_live_canary` only when an executed report includes dedicated
install/deploy-lane `cleanTargetCanary.status=passed` readback with
`noCompletionClaim=false` and a complete readback shape: bounded lane id,
evidence version, passed fresh-install and public-upgrade clean-target phases,
temporary root cleanup, and production/readback evidence. Source-safe execute
steps proving temporary-root fresh-install and public-upgrade rehearsal cleanup
remain rehearsal evidence and do not close clean-target install/upgrade by
themselves. Aggregated canary summaries without step evidence also do not close
the clean-target requirement.
Plan-only canary reports remain `partial` evidence and must not close the
observed install/upgrade canary row or emit an install-failure diagnostic event.
Explicitly skipped canary reports, such as ordinary implementation-thread runs
using `--skip-install-upgrade-canary`, are also `partial` evidence. They keep
`policy.noCompletionClaim=true` and must not mark `clean_target_live_canary` as
`degraded`; only an executed canary with concrete failed phases or failed
clean-target readback may degrade the row.
`cleanTargetEnvironment` is displayed only as release-readiness context:
`blocked` explains missing isolated target/fixture, readback file, or operator
gates, while `ready` still requires subsequent passed `cleanTargetCanary`
evidence before the requirement can close. The readiness summary redacts
clean-target, fixture, and readback file paths to basename/hash metadata and
requires absolute path declarations for lane readiness. The 3A quality-program
snapshot surfaces `cleanTargetEnvironment.status=blocked` as a warning
`clean_target_live_canary` requirement under 发布闭环待补. It must not set the
day-to-day Owner Console `overallStatus=blocked` unless an executed canary has
actually failed or a current production runtime is degraded.
The program snapshot accepts this readiness state from either the dedicated
`cleanTargetCanary` evidence row or the aggregate `installUpgradeCanary` row,
because older collectors and lane receipts may only carry the aggregate shape.
Explicit skipped canaries remain `partial`, because they prove only that
lane-scoped evidence was intentionally not collected. Wardrobe plugin-action
metadata closure remains the reference action evidence. Generalized deterministic-action
coverage closes only from the multi-family aggregate summary, and the Owner
Program requirement exposes bounded aggregate counts/classes instead of raw
plugin payloads.

Autonomous Delivery dispatch-control state comes from
`adapters/autonomous-delivery-coordinator-service.js` through
`dispatchControlSummary()`. The summary is read-only and bounded: it may expose
case ids, slice ids, slice keys, target workspace ids, task-card ids,
dispatch-status values, failure/conflict codes, and counts. It must not expose
task-card bodies, thread bodies, prompts, logs, raw file paths, or private
workspace data. The console may recommend opening Action Inbox for retry or
review, but retry/resolve remains owned by the existing Action Inbox and
Autonomous Delivery coordinator actions.

Autonomous Delivery loop health comes from the same coordinator through
`deliveryLoopStatusSummary()`. The Owner Console renders it as a read-only
delivery-loop section next to dispatch control. It may expose case ids,
bounded titles, status buckets, stale return-card counts, duplicate-suppressed
counts, and aggregate open/blocked/verified counts. It must not expose task-card
bodies, return-card bodies, prompts, raw evidence ledger paths, private
filesystem paths, launch tokens, worker logs, or private plugin payloads.

Loop Engineering runtime status is separate from the Home AI compatibility
ledger. Codex Mobile owns the canonical `@loop` runtime, while Home AI consumes
only a bounded read-only status projection through
`adapters/codex-mobile-at-loop-status-service.js`. Production composition
queries `HOMEAI_CODEX_MOBILE_AT_LOOP_STATUS_URL` or the default local Codex
Mobile status endpoint (`http://127.0.0.1:8787/api/at-loop/status`) with a
short timeout, then normalizes the result through
`adapters/loop-engineering-plan-service.js`. If Codex Mobile is unreachable,
times out, returns an HTTP failure, or reports only stale/rejected/projection
rows, the day-to-day console shows `Loop Engineering runtime` as warning or
unknown with bounded advisory counts. It becomes blocked only when the
projection includes current active blocked evidence, such as an active blocked
loop item or an explicit active-blocked policy flag. The console does not retry,
dispatch, close, or repair work from the page. The status projection may expose
loop ids, target ids, role names, iteration counts, aggregate
open/blocked/waiting-return counts, advisory blocked counts, and next-route
codes. It must not expose raw thread bodies, task-card bodies, prompts, endpoint
bodies, launch tokens, cookies, access keys, raw filesystem paths, or plugin
private payloads.

The same resource snapshot is also consumed by the Home AI Self-Improving Loop
production collector. `scripts/homeai-self-improving-loop.js
--collect-production-observations` collects this service by default, converts it
to the maintained `system_resource_health` signal, and lets AI Ops diagnostic
intake route degraded or unknown production failures through the normal
self-check repair gate. Single warning states remain visible evidence in the
console and self-check report; they should not create repair cards until a
history-aware collector proves repeated pressure. The console remains
read-only; the automation path creates evidence and repair cards, not restarts
or UI-side fixes.

CPU pressure evidence is attribution-aware. The resource snapshot may include
top process PID, sanitized executable label, and CPU percentage from bounded
process sampling. It must never include command-line arguments, raw paths,
environment variables, keys, tokens, launch arguments, or provider payloads.
The self-improving-loop observation must keep attribution availability, top
process count, labels, and total percentage as bounded diagnostic metadata.

Codex Mobile runtime pressure is collected as a first-class bounded section
because global host CPU can remain low while a single Codex Mobile listener,
app-server, app-server mux, or MCP process is consuming high CPU/RSS. The
collector classifies only known Codex Mobile roles and emits sanitized role
labels, PID, CPU percentage, RSS bytes, elapsed time, total CPU/RSS, and
bounded log file metadata. Log evidence is limited to basename, byte size, and
growth rate between in-memory samples. The console must not expose raw command
lines, full log paths, key-file arguments, launch tokens, endpoint bodies, task
card bodies, thread bodies, or log contents. Fresh heartbeat/watchdog ownership
remains in Codex Mobile; Home AI only projects pressure evidence and
recommended next checks.

Codex Mobile RSS-only pressure is bounded by host memory health. If macOS
`memory_pressure` and swap remain healthy, high resident RSS from known Codex
Mobile roles is visible as warning evidence instead of a degraded H1
self-check. High CPU, degraded log size/growth, or unhealthy host memory
pressure still remain degraded and diagnostic-eligible.
RSS-only warning evidence in this healthy-host case is marked
`advisoryOnly=true`: the System Status / Codex Mobile Runtime panel keeps the
bounded process and RSS evidence visible, but the day-to-day overview rollup and
critical-signal list do not treat it as an active system warning. CPU warning,
log warning/degradation, unhealthy host memory pressure, and all degraded
Codex Mobile runtime states still participate in the overview rollup.

On macOS, memory status is pressure-aware. The resource snapshot preserves raw
resident memory percentage as bounded evidence, but classification must prefer
`memory_pressure` available/free percentage when present so reclaimable file
cache or compressed memory does not create a false degraded state while swap
and pressure remain healthy. The self-improving-loop observation derived from
this snapshot must keep the memory percentage source, resident percentage,
pressure free percentage, and pressure status as bounded diagnostic metadata.

`server-routes/owner-system-console-api-routes.js` exposes:

- `GET /api/owner/system-console`
- `GET /api/owner/system-console/system-status`

Both routes must call `requireOwner` before collecting or returning payloads.

## Frontend Shape

`public/app-owner-system-console-ui.js` is an ordered static-shell module.
The system-status tab renders a dedicated `Codex Mobile Runtime` panel when
the resource snapshot includes `codexMobile.available=true`. The panel shows
aggregate CPU/RSS, log size/growth, and sanitized role rows so the Owner can
distinguish listener/app-server pressure from low global CPU. The same shape is
implemented in the Vite owner-console model to keep preview/island and classic
static-shell rendering aligned.
It may render only when `state.auth.isOwner` is true. Non-Owner users see an
unavailable panel and no API request is made.

Owner-visible console copy should default to Chinese. Stable technical nouns
such as `Gateway`, `Plugin`, `Runtime`, `SLO`, `Canary`, and `AI Ops` may remain
English when that is the clearer operator term. Signal ids, categories,
recommended action codes, and testable machine fields remain English/stable and
must not be translated if self-check routing or diagnostic joins depend on
them. The UI layer may translate known titles, summaries, and common failure
codes for display so older cached payloads do not leak English operator copy.

The UI uses compact control-panel layout:

- overview badge;
- 3A dimension rows;
- CPU, memory, disk, and uptime metric strip;
- 3A quality-program progress and current gap strip;
- Autonomous Delivery dispatch-control strip;
- Autonomous Delivery delivery-loop strip;
- critical signal list;
- System Status table for bounded services/processes.

Owner reachability is part of the console contract. The Settings sheet may keep
an explicit `System Console` button, but it is not sufficient as the only entry.
The static shell's global three-finger long press continues to open the AI Ops
diagnostic feedback menu. That menu must show an Owner-only `系统控制台` action
when `state.auth.isOwner` is true and `openOwnerSystemConsoleSurface` is
available. The console must not add a separate competing bottom-navigation
long-press gesture; the feedback menu remains the single global three-finger
entry point.

No hero, marketing copy, raw logs, raw paths, or action buttons that mutate
runtime state are allowed in the MVP.

## 3A Quality Evidence

The 3A quality-program snapshot consumes bounded metadata from the maintained
self-improving loop evidence file. For deterministic plugin actions:

- `wardrobe_reference_action_contract` closes when the Wardrobe
  `wardrobeOutfitWearIntent` family passes the action metadata closure smoke.
- `deterministic_action_generalization` closes only when the closure report is
  a multi-family aggregate with at least two action families, at least one
  generalized family beyond Wardrobe, at least two action classes, and zero
  failed stages.
- A legacy Wardrobe-only report remains valid evidence for the reference action
  contract, but it is `partial` for generalization and keeps
  `policy.noCompletionClaim=true`.

The current source-side aggregate covers three deterministic families:
Wardrobe MCP intent action, Home AI plugin-conversation Owner task-card action,
and Finance manifest route action. All evidence is metadata-only and must not
include private plugin rows, raw prompts, provider payloads, secrets, or raw
thread bodies.

## Status Policy

Supported statuses:

- `ok`
- `warning`
- `degraded`
- `blocked`
- `stale`
- `unknown`

First-pass threshold defaults live in
`DEFAULT_SYSTEM_RESOURCE_THRESHOLDS` and must be testable. Thresholds must not
exist only as UI constants.

## Privacy Boundary

Public payloads may include:

- status values;
- rounded percentages;
- load averages;
- counts;
- launchd labels;
- latency buckets;
- bounded signal ids and categories;
- timestamps.

Public payloads must not include:

- raw secrets, keys, cookies, OAuth tokens, launch tokens, bearer values;
- command lines;
- raw file paths beyond approved bounded labels;
- logs;
- private plugin payloads;
- database rows;
- prompts/completions;
- screenshots.

## Validation

Focused checks:

```bash
node --check adapters/owner-system-console-service.js \
  adapters/owner-3a-quality-evidence-service.js \
  adapters/owner-3a-quality-program-service.js \
  adapters/system-resource-status-service.js \
  server-routes/owner-system-console-api-routes.js \
  public/app-owner-system-console-ui.js
node tests/owner-3a-quality-evidence-service.test.js
node tests/owner-3a-quality-program-service.test.js
node tests/owner-system-console-service.test.js
node tests/system-resource-status-service.test.js
node tests/autonomous-delivery-coordinator-service.test.js
node tests/owner-system-console-api-routes.test.js
node tests/owner-system-console-ui.test.js
node tests/architecture-refactor-boundary.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/task-list-ui.test.js
node scripts/fallback-governance-check.js --json
git diff --check
npm run check
```

If static UI files change, bump the static client version according to
`docs/MODULES/static-client.md` and verify production client-version readback
after deploy.
