# Module: Home AI Self-Improving Loop

## Responsibility

Home AI Self-Improving Loop turns recurring runtime, plugin, Gateway,
deployment, and native-shell failures into bounded evidence and repair work.
It is a monitoring and routing layer, not an auto-fixer.

The loop must:

- define the maintained self-check signal matrix;
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
- `scripts/homeai-self-improving-loop.js`
- `tests/home-ai-self-improving-loop-service.test.js`
- `tests/homeai-self-improving-loop-script.test.js`
- `docs/MODULES/ai-operations-control-plane.md`
- `docs/PLATFORM_CONTRACTS/diagnostic-remediation-loop-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/MODULES/automation.md`

## Signal Matrix

The maintained matrix version is currently
`20260629-self-improving-loop-v5`.

The current required signals are:

| Signal | Owner | Purpose |
| --- | --- | --- |
| `gateway_profile_health` | Home AI Gateway | Production Gateway worker/profile status and worker policy health. |
| `mcp_schema_closure` | Home AI Gateway/toolset | Plugin service schema, selected Gateway profile schema, and dispatcher registry agreement. |
| `deploy_lane_liveness` | Home AI platform | Live `Home AI Deploy` lane discovery for routine plugin deployments. |
| `task_card_dispatch` | Home AI platform | Owner-gated real task-card dispatch and legacy `t_*` repair-card prevention. |
| `plugin_proxy_latency` | Home AI plugin host | Host proxy latency gap and route-kind timing for embedded plugin requests. |
| `media_preview_health` | Home AI media preview / native shell | PDF, Word, PPT, and generated-image preview/open/share fallback health. |
| `gateway_document_tool_capability` | Home AI Gateway/toolset | Low-permission Gateway PDF, Word, PowerPoint, audio, and archive file-tool availability. |
| `plugin_deploy_contract_closure` | Home AI platform / Home AI Deploy | Routine plugin deploy cards are request-shaped, route to Home AI Deploy, and close with production readback. |
| `plugin_proxy_workspace_boundary` | Home AI plugin host | Write-capable plugin proxy calls carry explicit effective workspace and missing workspace fails closed. |
| `native_bridge_capability` | Native shell / Home AI bridge | Web/native capability agreement for document, notification, workspace, and open-in bridges. |
| `notification_delivery` | Home AI notifications | Owner notification delivery, dedupe, and failed-delivery visibility. |
| `plugin_manifest_health` | Home AI plugin host / plugin owner | Manifest version, availability, action exposure, and workspace isolation. |
| `audit_thread_liveness` | Home AI platform | Dedicated audit thread discovery for scheduled request cards. |
| `automation_cron_health` | Home AI Automation | Canonical scheduler store, skills, runtime scripts, and recent job status. |
| `production_self_diagnostics` | Home AI platform | Production diagnostic inventory, source harness, and doc coverage health. |
| `public_upgrade_rehearsal` | Home AI deployment | Published public repository target-side upgrade rehearsal closure. |

Each signal defines:

- owning layer;
- expected invariant;
- failure threshold;
- bounded evidence fields;
- closure readbacks required before a repair is accepted as closed;
- focused checks.

Signals may produce AI Ops diagnostic event payloads, but they must not include
raw URLs, file paths, keys, cookies, launch tokens, payload bodies,
screenshots, database rows, full prompts, or long logs.

## CLI

Print the maintained matrix:

```bash
node scripts/homeai-self-improving-loop.js --matrix --json
```

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
node --check scripts/homeai-self-improving-loop.js
node scripts/homeai-self-improving-loop.js --coverage-audit --json
node tests/home-ai-self-improving-loop-service.test.js
node tests/homeai-self-improving-loop-script.test.js
node tests/codex-thread-task-card-service.test.js
node tests/production-self-diagnostics.test.js
node tests/production-self-diagnostics-coverage-audit.test.js
```

H1 closure also runs the AI Ops, task-card, architecture, fallback-governance,
deployment-plan, and diff hygiene checks selected by AI Ops intake for the
specific changed files.
