# Diagnostic Remediation Loop Contract

Contract version: `20260625-v1`.

## Purpose

Home AI must be able to turn user-reported runtime failures into bounded,
auditable repair work with minimal user intervention. This contract covers
Home AI host surfaces and embedded plugins.

Examples:

- Wardrobe retries an outfit operation three times and fails.
- Health opens through Home AI but the Gateway/toolset path fails.
- A plugin reports missing MCP tools, schema drift, host-proxy failure, launch
  failure, or repeated save/render errors.

The loop must not be a black-box auto-fixer. It must preserve ownership,
privacy, task-card return requirements, deployment discipline, and independent
closure evidence.

## Relationship To Existing Contracts

This contract layers on top of:

- `docs/MODULES/ai-operations-control-plane.md`
- `docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md`
- `docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md`
- `docs/PLATFORM_CONTRACTS/fallback-governance-contract.md`
- `docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`

AI Operations owns diagnostic capture, evidence bounding, remediation planning,
and evidence ledger records. The owning Home AI or plugin workspace owns code
repair, validation, deployment, and return-card closure.

## Loop Stages

1. `runtime_diagnostic_capture`
   - User or plugin submits a bounded diagnostic event.
   - Accepted sources are Home AI client feedback, trusted embedded plugin
     `postMessage`, host/proxy diagnostics, Gateway/toolset status, and
     bounded service error summaries.
   - Home AI Self-Improving Loop may submit metadata-only self-check events
     derived from the maintained signal matrix. These events are normal AI Ops
     diagnostic inputs. Eligible self-check/log-collection cases may bypass
     Owner approval and dispatch a task card automatically after the
     remediation plan is rebuilt and all privacy, target, severity, confidence,
     and high-risk gates pass.
2. `case_deduplication`
   - AI Ops rolls matching events into a diagnostic case by workspace, plugin,
     route, diagnostic type, category, build id, and hashed thread context.
3. `remediation_candidate`
   - H1/H2 cases with confidence at or above `0.7`, or explicitly marked
     `card_candidate`, may become remediation candidates.
4. `remediation_plan`
   - AI Ops builds a deterministic plan that names owning layer, target
     workspace/thread, evidence packet, blocked reasons, and task-card payload.
5. `task_card_dispatch`
   - Current policy is split by source. Strict Home AI self-check diagnostics
     may directly send a Codex Mobile task card after eligibility checks pass.
     User demand, feature/capability-gap, plugin conversation repair requests,
     embedded plugin automatic reports, and other product/request-like cases
     remain Owner-gated: the system may create an Owner-only notification for
     an eligible plan, but it must not send the task card until Owner
     explicitly triggers dispatch.
   - The Owner dispatch UI must immediately show a sending state, disable the
     active send action, and then show bounded success or failure feedback. A
     failed dispatch must not look like a no-op.
6. `implementation_return`
   - The target workspace must return a real card with completed, blocked,
     redirected, rejected, or partially completed status.
7. `verification_and_deploy_closure`
   - Source tests, host-path checks, deployment readback, Product Reality audit,
     or visual evidence run as required by the case and repair surface.
8. `case_closure`
   - AI Ops records closure or residual blockers in the diagnostic case and
     evidence ledger.

## Evidence Boundary

Diagnostic evidence may include:

- case id, event ids, event hashes, and event counts;
- plugin id, workspace id, source surface, route with safe query keys only;
- client build id, plugin build/version, host proxy status, manifest metadata;
- bounded error codes, status codes, retry counts, duration buckets;
- DOM counts and booleans, not DOM text or private field values;
- Gateway profile/toolset summary and missing-tool names when not secret;
- launchd/service status, port ownership, process identity, and health URL
  status when production repair is in scope;
- file paths to local artifacts that are already privacy-reviewed.

Diagnostic evidence must not include:

- raw secrets, access keys, cookies, OAuth tokens, launch tokens, bearer values;
- email bodies, health records, financial transaction contents, learner
  submissions, wardrobe images, private music/library payloads, chart/profile
  rows, provider payloads, raw database rows, attachment bytes, screenshots
  with private data, full prompts, completions, or long logs;
- raw thread ids or turn ids. Store salted hashes only.

If a diagnostic event contains unsafe privacy markers, the plan must be blocked
with `unsafe_privacy_markers` until a bounded reproduction is available.

## Embedded Plugin Automatic Report Protocol

Embedded plugins may report product-blocking runtime failures without opening
the manual feedback sheet. The plugin must post a bounded message to the Home AI
parent frame:

```js
window.parent.postMessage({
  type: "homeai.diagnostic.report",
  version: 1,
  pluginId: "music",
  category: "music_playback_failed",
  diagnostic_type: "playback_failed",
  severity_hint: "H2",
  evidence_confidence: 0.8,
  error_code: "music_album_playback_failed",
  duration_bucket: "3_10s",
  counts: { retry_count: 3 },
  context: {
    pluginId: "music",
    sourceSurface: "embedded-plugin",
    route: location.pathname + location.search,
    workspaceId: "owner"
  },
  breadcrumbs: [{
    kind: "music_playback",
    code: "album_click",
    status: "failed",
    duration_bucket: "3_10s",
    fields: {
      item_kind: "album",
      item_hash: "sha256-prefix-only",
      retry_count: 3
    }
  }]
}, "*");
```

The host must accept this report only when `event.source` is the content window
of a current embedded plugin iframe. The host then sanitizes the report and
submits it through `POST /api/v1/home-ai/diagnostics/events`; plugin reports do
not bypass Owner gating and do not directly dispatch task cards.

Plugins must keep automatic reports metadata-only. Allowed fields are bounded
enums, error codes, status codes, retry counts, duration buckets, plugin build
keys, and hashed item/collection identifiers. Reports must not include album or
track titles, media URLs, file paths, raw library ids, provider payloads,
screenshots, cookies, launch tokens, OAuth tokens, or long logs.

## Home AI Self-Check Signal Protocol

Home AI Self-Improving Loop defines the maintained host/platform signal
matrix in `docs/MODULES/self-improving-loop.md` and
`adapters/home-ai-self-improving-loop-service.js`.

Self-check signal failures are normalized into ordinary AI Ops diagnostic event
payloads with:

- `plugin_id=home-ai`;
- `source_surface=home-ai-self-check`;
- `diagnostic_type=self_check_signal_failed`;
- `category=self_check_<signal-domain>`;
- `error_code` as a bounded machine-readable failure code;
- `duration_bucket`, `counts`, and `context` limited to signal metadata;
- breadcrumbs containing only signal id/hash, source, route kind, counts, and
  short bounded status fields.

The current required signals are:

- `gateway_profile_health`;
- `mcp_schema_closure`;
- `deploy_lane_liveness`;
- `task_card_dispatch`;
- `plugin_proxy_latency`;
- `media_preview_health`;
- `gateway_document_tool_capability`;
- `plugin_deploy_contract_closure`;
- `plugin_proxy_workspace_boundary`;
- `native_bridge_capability`;
- `notification_delivery`;
- `plugin_manifest_health`;
- `audit_thread_liveness`;
- `automation_cron_health`;
- `production_self_diagnostics`.

Current production collectors may read bounded JSON from
`production-status-smoke.js`, `macos-automation-cron-audit.js`, and
`production-self-diagnostics.js`, then submit only the normalized event payload
through `POST /api/v1/home-ai/diagnostics/events`.

Self-check events may also carry `context.closure_readbacks`, a bounded list of
machine-readable readback requirements such as selected Gateway schema,
dispatcher registry probe, proxy timing split, protected media route probe,
native bridge result, production manifest readback, or return-card receipt
state. Remediation task cards should preserve this list, and closure should
fail or remain partially completed when the return card does not answer the
required readbacks.

Self-check diagnostics are discovery and routing evidence only. They may
auto-dispatch implementation task cards only when all of these are true:

- `plugin_id=home-ai`;
- `source_surface=home-ai-self-check`;
- `diagnostic_type=self_check_signal_failed`;
- `category` starts with `self_check_`;
- the remediation plan is otherwise eligible, target-resolved, metadata-only,
  and not high-risk.

They must not mutate production state, restart services, rotate credentials, or
perform deep audits in the diagnostic intake process itself. High-risk
self-check cases remain blocked for Owner approval.

Severity rules:

- single transient failures should remain local, H3, or unreported;
- retry-exhausted or repeated product-blocking failures may report H2 with
  confidence at or above `0.7`;
- high-risk device-control failures may notify Owner but must not auto-dispatch
  or trigger real hardware actions.

Music is the first pilot: album, collection, and favorite playback failures
after retry exhaustion should report `plugin_id=music`,
`category=music_playback_failed`, `diagnostic_type=playback_failed`, bounded
retry/error metadata, and anonymous item hashes only.

For plugin diagnostics, Home AI case grouping may include only sanitized
metadata-safe resource identity such as `context.item_hash` or the latest
breadcrumb `fields.item_hash`. The resource hash is a case dedupe dimension
together with the error class, so the same item and same error roll up, while a
different item hash can create a separate case and Owner notification even when
the route, plugin, category, and previous case status are the same. Raw titles,
raw ids, URLs, paths, provider payloads, or logs must never be used as dedupe
material.

## Routing Rules

Route by owning layer, not by where the symptom appeared.

Plugin workspace targets:

- plugin iframe UI, plugin API, plugin local persistence, plugin action routes,
  plugin embedded layout, plugin source/deploy mismatch, and plugin-owned
  product behavior go to that plugin's implementation thread.

Home AI targets:

- Gateway/toolset/MCP profile selection failures;
- host same-origin proxy, manifest, launch, workspace authorization,
  provisioning, plugin Dock/topic routing, static cache, and embedded shell
  failures;
- central deployment script, LaunchDaemon installer, shared GitHub SSA, visual
  lane, or platform contract failures.

Examples:

- `plugin_id=wardrobe`, `category=retry_exhausted` routes to Wardrobe unless
  bounded evidence says the failure is host proxy, workspace grant, or Gateway
  selection.
- `plugin_id=health`, `category=gateway_failure` routes to Home AI
  Gateway/toolset ownership unless bounded evidence says the Health plugin
  returned the failing contract response.
- `plugin_id=movie`, `category=physical_device_control` must stop for Owner
  approval before any action that could affect real hardware.

## Owner Notification And Dispatch Eligibility

Current policy:

- Home AI self-check/log-collection diagnostics may automatically dispatch a
  Codex task card when the strict self-check source/type/category gate and all
  remediation eligibility gates pass;
- automatic Owner notification is allowed for other eligible remediation plans;
- automatic Codex task-card dispatch is not allowed for user demand,
  feature/capability-gap, plugin conversation repair-request, embedded plugin
  automatic-report, high-risk, privacy-unsafe, low-confidence, or unknown-target
  cases;
- Owner can trigger task-card dispatch from the Owner-only notification or
  diagnostic case action for Owner-gated cases.

A remediation plan may create an Owner-only notification only when all are true:

- severity is H1 or H2;
- confidence is at least `0.7` or the case is already `card_candidate`;
- the owning workspace/thread can be resolved;
- evidence packet contains no unsafe privacy markers;
- the case is not `card_sent`, `closed`, `suppressed`, or `expired`;
- the work does not require physical device control, destructive data mutation,
  secret rotation, payment/provider action, or other explicit high-risk
  approval;
- the task card can require a return card and bounded validation.

Owner-triggered and self-check automatic dispatch must re-read the case/events,
rebuild the plan, and re-check the same gate before calling the Codex Mobile
task-card interface.
If the case is already `card_sent`, dispatch is idempotent: the UI should mark
the Owner notification handled and show that a remediation card has already
been sent rather than sending another card or reopening the same notification.

If the Owner-triggered dispatch path fails repeatedly for the same Action Inbox
item/action, the Home AI client must submit a bounded Home-AI-owned diagnostic
event such as `category=action_inbox_diagnostic_task_card_failed` or
`category=action_inbox_plugin_conversation_task_card_failed`. The event may
include safe counts, action/source type, target plugin id, diagnostic case id,
HTTP status code, and bounded error code. It must not include raw task-card
bodies, private prompts, thread contents, cookies, launch tokens, raw keys, or
long logs. That diagnostic routes to Home AI platform ownership; it is not a
plugin-owned repair.

Otherwise the case must remain in the Owner-visible AI Ops inbox or diagnostic
case list with a blocked reason such as:

```text
severity_below_h2
confidence_below_0_7
target_workspace_unknown
unsafe_privacy_markers
requires_owner_approval_high_risk
case_terminal_status
```

## Task-Card Requirements

Every generated remediation task card must include:

- diagnostic case id;
- owning layer hypothesis;
- target workspace;
- bounded evidence packet;
- required root-cause fields;
- allowed log/evidence boundary;
- focused validation requirements;
- deployment/readback requirement when runtime behavior changes;
- return-card requirement;
- privacy confirmation requirement.

The card must not include raw logs or private payloads. It must ask the target
thread to inspect local logs only as needed and summarize bounded evidence in
its return.

## Deployment And Closure

Implementation threads may deploy only through the existing deployment contract:

- plugin-owned runtime changes use `deploy:macos -- --plugin <plugin-id>` when
  the central script supports that target;
- Home AI host/runtime changes use the Home AI deploy path;
- direct production tree edits are not closure;
- deployment-only residuals stay with the plugin if the central deploy script
  can complete them;
- Home AI receives task cards only for platform-owned blockers.

Closure requires:

- source commit and focused tests;
- fallback governance classification for H1/H2;
- production/user-path readback when runtime behavior changed;
- return card with final status and residual risk;
- diagnostic case state update and evidence ledger entry.

## Current Implementation Surface

The executable surfaces are remediation planning, Owner notification, and
Owner-triggered dispatch:

```bash
node scripts/ai-ops-control-plane.js remediation plan \
  --case-json @case.json \
  --events-json @events.json \
  --json
```

The planning service is:

```text
adapters/ai-ops-diagnostic-remediation-service.js
```

The Owner-gated workflow service is:

```text
adapters/ai-ops-diagnostic-remediation-workflow-service.js
```

The planner produces a Codex Mobile task-card payload but does not mutate
source, deploy, or dispatch by itself. Diagnostic event ingestion may upsert an
Owner-only Action Inbox item for `ready_to_dispatch` plans. The Owner-only API
`POST /api/v1/home-ai/diagnostics/cases/:case_id/task-card` re-plans and then
calls the Codex Mobile task-card interface. Successful dispatch records the
diagnostic case transition to `card_sent`.

## Privacy

The diagnostic remediation loop is metadata-first. It must never store or send
raw secrets, private user content, provider payloads, screenshots with private
data, database rows, full prompts, or long logs. When in doubt, route a bounded
task card asking the owner to reproduce locally rather than exporting private
data from the user's current session.
