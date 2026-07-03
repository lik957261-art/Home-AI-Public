# Module: Home AI Self-Improving Loop

## Responsibility

Home AI Self-Improving Loop turns recurring runtime, plugin, Gateway,
deployment, and native-shell failures into bounded evidence and repair work.
It is a monitoring and routing layer, not an auto-fixer.

The loop must:

- define the maintained self-check signal matrix;
- define the 3A Runtime SLO model that groups maintained signals by
  Availability, Accuracy, and Autonomy;
- collect bounded production observations from approved smoke/audit scripts;
- normalize bounded observations into AI Ops diagnostic event payloads;
- generate daily audit request cards for the dedicated audit threads;
- keep scheduled automation request-only;
- route self-check/log-collection diagnostics through AI Ops, where strict
  self-check cases may auto-dispatch task cards after eligibility gates pass;
- keep user demand, feature/capability-gap, plugin conversation repair
  requests, embedded plugin reports, high-risk cases, and audit requests
  Owner-gated;
- reject silent fallback, broad restart, or symptom suppression as closure.

## Core Files

- `adapters/home-ai-self-improving-loop-service.js`
- `adapters/home-ai-runtime-slo-service.js`
- `adapters/home-ai-install-upgrade-canary-service.js`
- `adapters/self-check-diagnostic-submit-smoke-service.js`
- `adapters/self-improving-runtime-health-observation-service.js`
- `scripts/homeai-self-improving-loop.js`
- `scripts/self-check-diagnostic-submit-smoke.js`
- `scripts/homeai-self-improving-loop-cron.sh`
- `scripts/homeai-install-upgrade-canary.js`
- `tests/home-ai-runtime-slo-service.test.js`
- `tests/home-ai-install-upgrade-canary-service.test.js`
- `tests/home-ai-self-improving-loop-service.test.js`
- `tests/self-check-diagnostic-submit-smoke-service.test.js`
- `tests/self-check-diagnostic-submit-smoke-script.test.js`
- `tests/self-improving-runtime-health-observation-service.test.js`
- `tests/homeai-self-improving-loop-script.test.js`
- `tests/homeai-install-upgrade-canary-script.test.js`
- `docs/MODULES/ai-operations-control-plane.md`
- `docs/PLATFORM_CONTRACTS/diagnostic-remediation-loop-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/MODULES/automation.md`

## Signal Matrix

The maintained matrix version is currently
`20260701-self-improving-loop-v13`.

The current required signals are:

| Signal | Owner | Purpose |
| --- | --- | --- |
| `system_resource_health` | Home AI platform | Owner Console CPU, memory, disk, uptime, and bounded resident service health enters Runtime SLO and diagnostic routing. |
| `gateway_profile_health` | Home AI Gateway | Production Gateway worker/profile status and worker policy health. |
| `mcp_schema_closure` | Home AI Gateway/toolset | Plugin service schema, selected Gateway profile schema, and dispatcher registry agreement. |
| `deploy_lane_liveness` | Home AI platform | Live configured Home AI deploy lane pool discovery for routine plugin deployments. |
| `task_card_dispatch` | Home AI platform | Owner-gated real task-card dispatch and legacy `t_*` repair-card prevention. |
| `plugin_proxy_latency` | Home AI plugin host | Host proxy latency gap and route-kind timing for embedded plugin requests. |
| `composer_runtime_feedback` | Home AI static client | Terminal receipt gaps, duplicate local/server user echoes, stuck terminal active runs, and receipt scroll-protection bypasses. |
| `media_preview_health` | Home AI media preview / native shell | PDF, Word, PPT, and generated-image preview/open/share fallback health. |
| `gateway_document_tool_capability` | Home AI Gateway/toolset | Low-permission Gateway PDF, Word, PowerPoint, audio, and archive file-tool availability. |
| `plugin_deploy_contract_closure` | Home AI platform / deploy lane pool | Routine plugin deploy cards are request-shaped, route to the configured deploy lane pool, and close with production readback. |
| `plugin_proxy_workspace_boundary` | Home AI plugin host | Write-capable plugin proxy calls carry explicit effective workspace and missing workspace fails closed. |
| `native_bridge_capability` | Native shell / Home AI bridge | Web/native capability agreement for document, notification, workspace, and open-in bridges. |
| `notification_delivery` | Home AI notifications | Owner notification delivery, dedupe, and failed-delivery visibility. |
| `plugin_manifest_health` | Home AI plugin host / plugin owner | Manifest version, availability, action exposure, and workspace isolation. |
| `plugin_action_metadata_health` | Home AI plugin host | Executable plugin intent metadata is attached, projected, rendered, and executed through deterministic action bridges without a model turn. |
| `audit_thread_liveness` | Home AI platform | Dedicated audit thread discovery for scheduled request cards. |
| `automation_cron_health` | Home AI Automation | Canonical scheduler store, skills, runtime scripts, and recent job status. |
| `production_self_diagnostics` | Home AI platform | Production diagnostic inventory, source harness, and doc coverage health. |
| `public_upgrade_rehearsal` | Home AI deployment | Published public repository target-side upgrade rehearsal closure. |
| `install_upgrade_canary` | Home AI deployment | Aggregate source-safe fresh-install, public-upgrade, plugin-provisioning, and Runtime SLO canary closure. |
| `runtime_slo_coverage` | Home AI platform | Runtime SLO coverage and repair-routing audit for every maintained self-check signal. |

Each signal defines:

- owning layer;
- expected invariant;
- failure threshold;
- bounded evidence fields;
- closure readbacks required before a repair is accepted as closed;
- focused checks.

## 3A Runtime SLO Model

The maintained Runtime SLO model version is currently
`20260701-runtime-slo-v4`.

The model is generated from the signal matrix by
`adapters/home-ai-runtime-slo-service.js`; it does not duplicate signal
definitions. Every current matrix signal must map to exactly one 3A dimension:

| Dimension | Signals |
| --- | --- |
| Availability | `system_resource_health`, `gateway_profile_health`, `deploy_lane_liveness`, `plugin_proxy_latency`, `media_preview_health`, `native_bridge_capability`, `notification_delivery` |
| Accuracy | `mcp_schema_closure`, `composer_runtime_feedback`, `gateway_document_tool_capability`, `plugin_proxy_workspace_boundary`, `plugin_manifest_health`, `plugin_action_metadata_health` |
| Autonomy | `task_card_dispatch`, `plugin_deploy_contract_closure`, `audit_thread_liveness`, `automation_cron_health`, `production_self_diagnostics`, `public_upgrade_rehearsal`, `install_upgrade_canary`, `runtime_slo_coverage` |

Each generated SLO carries:

- signal id and 3A dimension;
- owner, source, expected invariant, and failure threshold;
- bounded evidence fields;
- required closure readbacks;
- focused checks;
- self-check diagnostic category;
- repair routing policy, including strict self-check auto-dispatch eligibility
  and Owner gating for feature/capability requests.

The audit fails closed when a signal is unmapped, duplicated, lacks bounded
evidence, lacks closure readbacks, lacks focused checks, or lacks repair
routing. This makes new self-check signals visible before they can become
unowned telemetry.

Signals may produce AI Ops diagnostic event payloads, but they must not include
raw URLs, file paths, keys, cookies, launch tokens, payload bodies,
screenshots, database rows, full prompts, or long logs.

Production observation runs also build a bounded Owner Console 3A evidence
summary through `adapters/owner-3a-quality-evidence-service.js`. The cron
wrapper passes `--quality-evidence-output` by default and writes the summary to
`data/hermes-home/self-improving-loop/owner-3a-quality-evidence.json`. This
summary contains install/upgrade canary phase counts, clean-target canary
metadata derived from executed temporary-root install/upgrade steps, Wardrobe
reference plugin-action closure counts, and the v2 deterministic-action
generalization aggregate counts/classes. It does not contain raw logs, paths,
provider payloads, thread bodies, or private plugin data. Owner Console reads
the summary instead of executing slow canaries on page load.

## CLI

Print the maintained matrix:

```bash
node scripts/homeai-self-improving-loop.js --matrix --json
```

Print the maintained 3A Runtime SLO model:

```bash
node scripts/homeai-self-improving-loop.js --runtime-slo-model --json
```

Audit 3A Runtime SLO coverage and repair routing:

```bash
node scripts/homeai-self-improving-loop.js --runtime-slo-audit --json
```

Production collection runs this audit by default and converts any failed audit
into a `runtime_slo_coverage` observation. Replay tests can inject the same
payload with `--runtime-slo-audit-json <json>` or skip the collector with
`--skip-runtime-slo-audit`.

Production collection also runs the plugin action metadata closure by default:

```bash
node scripts/plugin-action-metadata-closure-smoke.js --json
```

That smoke emits a metadata-only multi-family report. It exercises:

- the Wardrobe `outfit_wear_intent` reference path from Gateway function output
  through message metadata, thread projection, diagnostic projection,
  deterministic MCP bridge execution, confirmation, explicit action state
  readback, state persistence, and the no-model-run boundary;
- the Home AI plugin-conversation repair request path from Gateway output
  comment parsing through Action Inbox projection, Owner push de-duplication,
  deterministic task-card dispatch, and the no-model-run boundary;
- a Finance manifest route action from host manifest normalization through
  plugin-route projection and route snapshot readback.

The collector converts the bounded aggregate result into
`plugin_action_metadata_health`. Owner 3A evidence treats the Wardrobe family as
the reference action contract and requires at least one additional action family
and a second action class before `deterministic_action_generalization` can close.
Tests can replay the same payload with
`--plugin-action-metadata-closure-json <json>` or skip it with
`--skip-plugin-action-metadata-closure`.

Production collection also runs first-class daily focus collectors for:

- `mcp_schema_closure`: source-safe MCP/toolset closure smoke;
- `deploy_lane_liveness`, `task_card_dispatch`, and
  `audit_thread_liveness`: Codex Mobile thread/deploy-lane discovery in
  dry-run/read-only mode. Production scripts run from the installed app root,
  but these Codex task-card targets are implementation-workspace threads; the
  collector therefore tries an explicit `--thread-cwd`, environment-provided
  source app root, the current app root, and the canonical implementation app
  cwd before classifying a lane or audit thread as missing;
- `plugin_manifest_health` and `plugin_proxy_latency`: authenticated Home AI
  host manifest/proxy probes for the current product-facing plugin set;
- `gateway_document_tool_capability`: Gateway file-tool schema smoke when the
  production Gateway manifest is readable, otherwise an explicit source-context
  skipped row instead of a silent coverage hole;
  Mac production collection passes root-derived Hermes Agent runtime source,
  overrides, and Python paths into `gateway-tool-schema-smoke.js` so the
  collector does not fall back to legacy WSL `/opt/hermes-gateway-runtime/*`
  defaults;
- `plugin_deploy_contract_closure`: source-safe deploy-lane contract smoke for
  routine plugin deployment request shape, terminal-receipt rejection, and
  deploy-lane lock/readback metadata;
- `plugin_proxy_workspace_boundary`: source-safe proxy workspace-boundary smoke
  proving write-capable plugin proxy calls fail closed without an explicit
  workspace and propagate bounded workspace/actor headers when present;
- `composer_runtime_feedback` and `media_preview_health`: browser/runtime UI
  telemetry when supplied by the client or an explicit non-diagnostic skipped
  row when no live browser runtime is attached;
- `notification_delivery`: Web Push production audit, using runtime public
  status when the audit user cannot read the private VAPID key file;
- `native_bridge_capability`: explicit skipped, non-diagnostic observation
  when no native shell/device runtime is attached to the collector.

These focus signals must not silently remain `not_collected` in daily
production collection. A collector may be skipped only by an explicit
`--skip-*` flag, by replay input in tests, or by a bounded non-diagnostic
runtime absence such as `native_bridge_runtime_not_attached`. Source-side dry
runs may classify protected production-boundary probes as skipped; scheduled
production runs should collect live evidence or emit an eligible failed
observation.

The install/upgrade canary is intentionally lane-sensitive. Local development
and narrow replay runs may pass `--skip-install-upgrade-canary`; the collector
must then emit an explicit non-diagnostic `install_upgrade_canary` skipped
observation with `install_upgrade_canary_skipped_by_option` instead of leaving
the signal `not_collected`. Install/deploy lanes and productization gates
should run the canary rather than using this skip.

Production collection also collects Owner Console system resource status by
default through `adapters/system-resource-status-service.js`. The collector
converts CPU, memory, disk, and bounded resident service pressure into
`system_resource_health`. Tests can replay a bounded snapshot with
`--system-resource-status-json <json>` or skip this collector with
`--skip-system-resource-status`. Degraded resource status is an H1 diagnostic
event. A single warning status remains observed bounded evidence and does not
auto-dispatch a repair card; repeated warning pressure should be promoted by a
separate history-aware collector before it becomes diagnostic. Unknown status
fails in scheduled production collection, while source-side protected-boundary
unknowns may be classified as explicit non-diagnostic skips. None of these
paths may use an automatic restart as closure.

CPU status must include bounded process attribution when available. The
resource collector may include top process PID, sanitized executable label, and
CPU percentage, but it must not include command-line arguments, raw filesystem
paths, environment variables, keys, tokens, or launch arguments. Self-check
diagnostic metadata for `system_resource_health` must keep attribution
availability, top process count, top process labels, and top process total
percentage so CPU pressure repair cards can distinguish Home AI-owned pressure,
Codex-owned pressure, OS indexing, and unrelated local workloads.

On macOS, memory status is pressure-aware. The resource collector may preserve
raw resident memory percentage as bounded metadata, but status classification
must prefer `memory_pressure` available/free percentage when present so
reclaimable file cache or compressed memory does not create a false H1
`system_resource_health` degradation while swap and pressure remain healthy.
Diagnostic metadata for `system_resource_health` must include the selected
memory percentage source, resident percentage, pressure free percentage, and
pressure status so repair cards can distinguish real pressure from resident
memory/cache accounting.

Evaluate bounded observations:

```bash
node scripts/homeai-self-improving-loop.js \
  --observations-file observations.json \
  --json
```

Audit recent incident coverage and closure readback requirements:

```bash
node scripts/homeai-self-improving-loop.js --coverage-audit --json
```

Coverage audit compares the maintained signal matrix with recent incident
classes that have already occurred in production or plugin workflows:

- Codex Mobile host/proxy latency gaps;
- generated image, PDF, Word, and PPT preview/open failures;
- plugin MCP schema/dispatcher mismatches;
- low-permission Gateway document-tool capability gaps;
- plugin deploy lane/auth regressions, including receipt-shaped deployment
  cards;
- plugin proxy workspace propagation regressions;
- task-card routing and duplicate-notification regressions.
- Composer terminal receipt, pending echo, and scroll-protection regressions.
- Plugin deterministic action metadata drops before message rendering.

The audit is closed only when every incident class has at least one maintained
signal, required bounded evidence fields, and machine-readable closure
readbacks. It is a source-side harness and must not read private logs or submit
diagnostics by itself.

Collect bounded production observations from maintained source scripts:

```bash
node scripts/homeai-self-improving-loop.js \
  --collect-production-observations \
  --access-key-file <owner-web-key-file> \
  --expected-version <client-version> \
  --collector-context production \
  --json
```

The production collection output includes
`productionCollection.signalReport`. The report lists every maintained signal
from the current matrix, not only the observations collected in that run. A row
with `status=not_collected` means the collector did not receive evidence for
that signal in the current run; it is coverage context, not a failure by
itself. For required daily focus signals, `not_collected` is not an acceptable
scheduled-production steady state; the collector must either emit a live row,
an explicit skipped non-diagnostic row with a bounded reason, or a failed
diagnostic-eligible row. A row with `status=failed` still feeds the normal self-check
diagnostic path and must answer the signal's closure readbacks before the case
can close.

Submit generated self-check diagnostic events to AI Ops intake:

```bash
node scripts/homeai-self-improving-loop.js \
  --collect-production-observations \
  --access-key-file <owner-web-key-file> \
  --expected-version <client-version> \
  --collector-context production \
  --submit-diagnostics \
  --json
```

When `--submit-diagnostics` is enabled, the JSON output includes
`diagnosticSubmitClosure`. This closure report is bounded metadata only and
must list, for every submitted event:

- the signal id;
- accepted `case_id` and `event_id`;
- Owner notification or self-check auto-dispatch state;
- any `task_card_id` returned by AI Ops;
- the signal's required closure readbacks.

The report is not considered closed if an accepted submit lacks a case id, an
event id, or closure readbacks. This keeps scheduled self-check submissions
auditable without reading private case bodies or task-card text.

Source-safe submit closure smoke:

```bash
node scripts/self-check-diagnostic-submit-smoke.js --json
```

This smoke uses a temporary AI Ops diagnostic store plus fake Codex task-card
and Owner Action Inbox services. It does not use an Owner key, does not send a
real task card, and does not create a real notification. It proves three closure
branches:

- an H2 `home-ai-self-check` signal creates a diagnostic case/event and
  auto-dispatches through the self-check remediation path;
- an H1 `system_resource_health` degradation creates a diagnostic case/event
  and auto-dispatches through the same self-check remediation path;
- a feature/capability style diagnostic remains Owner-gated and creates only an
  Owner notification candidate, not an automatic task card.

The smoke output is bounded metadata only and includes the
`diagnosticSubmitClosure` report for the self-check event.

`--collector-context` controls how protected production read failures are
classified. Scheduled/production runs should pass `production`; if the cron
audit cannot read the production cron store, Skill store, or installed runtime
scripts in that context, the loop emits an eligible `automation_cron_health`
diagnostic. Source/manual runs use `auto` by default, which resolves to
`source` for non-production users. In source context, an all-`EACCES`
production cron audit is recorded as a skipped, non-diagnostic observation so a
manual dry run does not misclassify local operator permissions as a broken
production scheduler.

The production collector also runs the public upgrade rehearsal by default:

```bash
node scripts/homeai-public-upgrade-rehearsal.js --execute --json
```

This clones the published public Home AI repository into a temporary directory
and runs target-side upgrade plans only. It does not execute `upgrade:public`
production mutation. A failed clone, failed source preflight, missing-source
fail-closed regression, missing clone/deploy plan action, missing closure
validation, or missing Movie `operatorAuthenticated` marker becomes a bounded
`public_upgrade_rehearsal` self-check diagnostic. Use
`--skip-public-upgrade-rehearsal` only for a deliberately offline local dry run.

The production collector also runs the source-safe install/upgrade canary by
default:

```bash
node scripts/homeai-install-upgrade-canary.js --execute --json
```

This collector phase does not perform production writes, sudo operations,
service restarts, or public repository clones. It becomes an
`install_upgrade_canary` diagnostic if any required fresh-install,
public-upgrade, plugin-provisioning, or Runtime SLO canary phase fails. Use
`--skip-install-upgrade-canary` only for deliberately narrow replay tests.

Production scheduling uses the installed wrapper:

```bash
/Users/example/path
```

The central Home AI deploy copies this wrapper from
`scripts/homeai-self-improving-loop-cron.sh` into the CRON script store, and
`macos-automation-cron-audit.js --strict-source` verifies it remains
executable and source-synchronized. Fresh install and central production deploy
also upsert the canonical `homeai_self_improving_loop` CRON job as a
`no_agent` script job bound to `homeai-self-improving-loop-cron.sh`; the
wrapper alone is not considered scheduled closure. The wrapper runs the
production collector with `--collector-context production`, posts bounded
diagnostics to AI Ops when enabled, and may send audit request cards for the
dedicated audit lanes. It uses `--diagnostic-issues-nonfatal` so a successfully
collected self-check signal failure is recorded in the JSON payload and
submitted/read back through the diagnostic path without marking the CRON job
itself failed. Wrapper exit failure is reserved for script/runtime,
evidence-write, diagnostic-submit, or task-card dispatch failures. This avoids
self-referential `automation_cron_health` loops where the previous scheduled
self-check failure becomes the next automation diagnostic. It prints only
bounded counts and status fields to CRON logs. When the Owner key file exists,
the wrapper passes it to read-only status, plugin, and notification probes even
if diagnostic submission and audit-card dispatch are disabled for a
no-side-effect readback. The key file is mandatory only when submission or
dispatch is enabled.

For manual or scheduled install/upgrade closure, use the install/upgrade
canary aggregator:

```bash
npm run canary:install-upgrade -- --json
npm run canary:install-upgrade -- --execute --json
```

Default mode is plan-only. `--execute` runs the local source-safe canary phases:
public install source preflight, macOS install phase coverage, fresh-install
rehearsal, verification classification, operator closure checklist,
deploy/upgrade lane closure smoke, public-upgrade rehearsal plan,
plugin-provisioning coverage, and Runtime SLO audit. It does not perform
production writes, sudo operations, service restarts, or public repository
clones. Add `--execute-public-rehearsal` only when the operator wants the
canary to run the public repository clone rehearsal inside a temporary root.
This local/source execution class is a rehearsal, not a clean-install
completion claim. Its report must keep `closureStatus=partial` and
`cleanTargetCanary.status=not_run` unless a dedicated install/deploy lane
attaches bounded clean-target readback with
`--clean-target-readback-json <json>`.
The report's `cleanTargetEnvironment` field is a readiness preflight for deploy
lanes only. `blocked` means the lane is missing an isolated target/root,
safe fixture declaration, readback file, or operator apply gates. `ready`
permits a lane to run the clean-target contract, but it is still not closure
until the lane returns passed `cleanTargetCanary` evidence. The
`install_upgrade_canary` observation must not report `ok` from source-safe
rehearsal alone; without closed clean-target readback it reports a bounded
non-diagnostic skipped observation so the Owner Console keeps the residual
visible without manufacturing local install-failure incidents.

Canary version `20260702-install-upgrade-canary-v3` reports a stage ledger in
addition to phase pass/fail status. The required stages are
`source_preflight`, `owner_key_bootstrap`, `home_ai_install`,
`hermes_agent_runtime`, `provider_ingress`, `plugin_registration`,
`gateway_profile_tool_schema`, `plugin_mcp_schema_smoke`,
`public_upgrade_rehearsal`, and `production_closure_readback`. Every phase must
declare its owner layer, covered stage ids, bounded evidence keys, closure
readbacks, required checks, and metadata-only privacy boundary. Missing stage
coverage or incomplete phase contracts fail the canary and become bounded
`install_upgrade_canary` diagnostic evidence rather than an implicit manual
follow-up.

Clean-target install/upgrade closure is lane-only. A valid completion readback
must come from an install/deploy lane or equivalent operator validation context
that can prove temporary-root cleanup, privileged install/apply boundaries when
used, and final production/listener readback without printing raw secrets or
private payloads. Ordinary implementation threads and developer machines should
not run install-lane gates just to make this row green; they may run plan mode
or source-safe rehearsal and must report the remaining clean-target gap as
`partial`.
When the canary is explicitly skipped by option, Owner 3A evidence must also
remain `partial`, not `degraded`. A skipped canary is absence of lane-scoped
evidence, not a failed clean-target install. Degradation is reserved for
executed canary phases, production collectors, or clean-target readbacks that
return bounded failure evidence.

When the canary is run from the deployed production app root
`/Users/example/path`, source-safe execution must run under the
production service user `hermes-host`, such as through the installed scheduled
collector. Running the same production-root rehearsal as the desktop/operator
user can hit the production ACL boundary and fails closed with
`production_rehearsal_requires_service_user`; use the development source tree
for manual operator canary runs unless the command is intentionally executed in
the production service-user context. The self-improving loop maps that explicit
service-user boundary to a skipped, non-diagnostic `install_upgrade_canary`
observation only when `--collector-context source` is in effect. The same
payload remains a failed diagnostic in scheduled/production collector context.

The same production observation path accepts bounded replay payloads for
runtime health collectors. These options are intended for scheduled collectors,
plugin/browser runtime self-check summaries, and incident replay, not for raw
log ingestion:

```bash
node scripts/homeai-self-improving-loop.js \
  --collect-production-observations \
  --skip-status-smoke \
  --skip-cron-audit \
  --skip-production-diagnostics \
  --skip-public-upgrade-rehearsal \
  --plugin-proxy-latency-json '{"pluginId":"codex-mobile-web","routeKind":"thread-detail","samples":[{"clientElapsedMs":5200,"upstreamMs":120}]}' \
  --gateway-capability-availability-json '{"workspaceId":"owner","profile":"low_gateway","requiredTools":["pdf_create","pptx_create"],"missingTools":[]}' \
  --ui-runtime-health-json '{"composer":{"ok":true},"mediaPreview":{"ok":true},"nativeBridge":{"ok":true},"pluginActions":{"ok":true,"pluginId":"wardrobe","actionKind":"wardrobeOutfitWearIntent"}}' \
  --json
```

`adapters/self-improving-runtime-health-observation-service.js` converts these
payloads into metadata-only observations for:

- `plugin_proxy_latency`;
- `gateway_document_tool_capability`;
- `composer_runtime_feedback`;
- `media_preview_health`;
- `native_bridge_capability`;
- `plugin_action_metadata_health`.

This is the Phase 5 collector boundary. It deliberately stores latency buckets,
counts, plugin/action ids, and safe state labels only. Raw URLs, paths, message
text, file names, image bytes, payload bodies, and private provider data must
not be passed to these replay options.

Build daily audit request cards without sending them:

```bash
node scripts/homeai-self-improving-loop.js \
  --create-audit-cards \
  --audit-scope all \
  --json
```

Send daily audit request cards to the dedicated audit threads:

```bash
node scripts/homeai-self-improving-loop.js \
  --create-audit-cards \
  --audit-scope all \
  --execute \
  --json
```

`--execute` uses `adapters/codex-thread-task-card-service.js` and dynamic thread
discovery. It must fail visibly if `Home AI Platform Audit` or
`Plugin Workspace Audit` is missing, ambiguous, archived, or otherwise not
discoverable. The script must not hard-code thread ids.

Self-check remediation cards use the same task-card service. `Home AI Task
Intake` is the source lane for Home-AI-owned repair cards, but it must not run
long implementation work itself. Ordinary Home AI implementation repairs target
the current main Home AI implementation thread through the `Home AI` prefix.
The main thread is the scheduler for any auxiliary `Home AI Worker Lane A/B/C`
use: it may explicitly delegate bounded subtasks only after recording the
module/file boundary, write lock, validation owner, conflict communication
path, and required return card. Feature/capability requests that remain
Owner-gated keep the same Owner approval boundary; worker lanes do not bypass
Owner approval, main-thread orchestration, or final merge/deploy closure.

## Scheduled Audit Contract

Daily scheduled audit jobs may run this script only to create bounded audit
request cards. They must not:

- perform deep Home AI or plugin audits locally;
- write findings from CRON-local analysis;
- mutate files, databases, plugin state, Gateway profiles, or production
  services;
- send repair cards directly to implementation workspaces.

The dedicated audit threads own evidence gathering, findings-first reporting,
repair-card routing, return-card tracking, and closure verification.

## Remediation Contract

Self-check failures enter the existing AI Ops remediation loop:

1. collect bounded observation metadata;
2. generate an AI Ops diagnostic event payload;
3. case dedupe and severity/confidence gating happen in AI Ops;
4. strict self-check/log-collection cases may auto-dispatch a real `ttc_*`
   task card after remediation eligibility gates pass;
5. non-self-check, feature/capability-gap, user demand, plugin conversation,
   embedded plugin report, audit, and high-risk cases remain Owner-gated;
6. owning workspace repairs root cause;
7. deployment/readback and return-card closure are recorded;
8. AI Ops case is closed or left with explicit residual blockers.

Every self-check diagnostic event carries bounded `closure_readbacks` in its
context. Repair cards should include those readbacks, and return cards should
answer them explicitly. A return card that only says code was changed, tests
passed, or deployment was attempted is not sufficient closure when the signal
requires production manifest, selected profile schema, dispatcher registry,
proxy timing, native bridge, media route, or task-card receipt readback.

The self-loop script itself must not directly call the task-card dispatch
endpoint. `--submit-diagnostics` posts bounded events only to AI Ops intake;
AI Ops then applies the strict self-check auto-dispatch gate or the Owner-gated
approval path.

## Privacy

The service and CLI are metadata-only. They may include signal ids, status,
error codes, duration buckets, counts, route kinds, plugin ids, build ids, and
short hashes.

They must not include raw secrets, access keys, cookies, OAuth tokens, launch
tokens, push endpoints, private health/finance/email/library records, raw file
paths, raw URLs, screenshots, database rows, provider payloads, full prompts,
or long logs.

## Validation

Focused source checks:

```bash
node --check adapters/home-ai-self-improving-loop-service.js
node --check adapters/self-improving-runtime-health-observation-service.js
node --check adapters/home-ai-install-upgrade-canary-service.js
node --check scripts/homeai-self-improving-loop.js
bash -n scripts/homeai-self-improving-loop-cron.sh
node --check scripts/homeai-install-upgrade-canary.js
node scripts/homeai-self-improving-loop.js --coverage-audit --json
node scripts/homeai-install-upgrade-canary.js --json
node tests/self-improving-runtime-health-observation-service.test.js
node tests/home-ai-install-upgrade-canary-service.test.js
node tests/home-ai-self-improving-loop-service.test.js
node tests/homeai-self-improving-loop-script.test.js
node tests/homeai-install-upgrade-canary-script.test.js
node tests/codex-thread-task-card-service.test.js
node tests/production-self-diagnostics.test.js
node tests/production-self-diagnostics-coverage-audit.test.js
```

H1 closure also runs the AI Ops, task-card, architecture, fallback-governance,
deployment-plan, and diff hygiene checks selected by AI Ops intake for the
specific changed files.
