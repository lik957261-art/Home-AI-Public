# AI Operations Control Plane

Last updated: 2026-06-25.

## Purpose

The AI Operations Control Plane reduces error and latency as Home AI, plugin
workspaces, Gateway profiles, production deployment, and visual harnesses grow.
It does not replace module contracts or tests. It turns those contracts into
bounded machine-readable work packets, resource leases, required checks,
evidence records, and incident cassettes so agent threads do less guessing.

## Scope

The control plane owns two surfaces:

- repository/operator tooling for task intake, lanes, evidence, and incident
  cassettes;
- runtime diagnostic intake for bounded user-visible bug reports.

The repository/operator tooling owns six functions:

1. task intake and context-pack generation;
2. visual debug lane allocation;
3. required-check selection from changed files and task text;
4. root-cause and fallback-governance projection for H1/H2 or incident work;
5. evidence ledger append/list/verification;
6. incident cassette creation and listing.

The Autonomous Delivery Loop is a higher-level coordination contract layered on
top of AI Ops. It owns intent decomposition, user-decision gates, task slicing,
and closure sequencing. AI Ops remains the source for required docs, harness
selection, evidence ledger records, incident cassettes, and visual/debug lane
allocation. The loop must call into these bounded surfaces instead of inventing
parallel check or evidence policy.
Current loop integration stores the AI Ops context pack as bounded slice
metadata, includes selected docs/checks in dispatched task-card bodies, records
redacted return evidence metadata, and projects check/evidence summaries into
the final Owner report.

The diagnostic intake runtime is service-backed and route-module backed. Runtime
diagnostics enter a platform inbox first. Eligible H1/H2 diagnostic cases can
then be converted into deterministic remediation plans under
`docs/PLATFORM_CONTRACTS/diagnostic-remediation-loop-contract.md`. The plan may
create an Owner-only system notification when it has a resolved owning
workspace, bounded evidence, return-card requirements, and no privacy or
high-risk approval blocker. Strict Home AI self-check/log-collection
diagnostics may auto-dispatch Codex task cards after the remediation plan is
rebuilt and passes the same privacy, target, severity, confidence, and
high-risk gates. User demand, feature/capability-gap, plugin conversation
repair requests, embedded plugin reports, and other request-like cases remain
Owner-gated; Owner must explicitly trigger dispatch from the notification or
diagnostic case action. AI Ops does not directly edit code or deploy
production.

Home AI Self-Improving Loop is layered on top of AI Ops. It is implemented
in `adapters/home-ai-self-improving-loop-service.js` and
`scripts/homeai-self-improving-loop.js`. The loop owns the maintained
self-check signal matrix, converts bounded observations into diagnostic event
payloads, can submit those metadata-only events to AI Ops intake, and creates
daily audit request cards for the dedicated audit threads. It does not perform
deep audits locally, restart services as closure, or modify code. Once a
self-check event is submitted, the AI Ops remediation workflow may
auto-dispatch the resulting repair task card only through the strict
self-check diagnostic gate; daily audit request cards remain request-only.

## Core Commands

Entrypoint:

```bash
node scripts/ai-ops-control-plane.js <command> --json
```

Task intake:

```bash
node scripts/ai-ops-control-plane.js intake \
  --task "fix Codex mobile bottom safe area" \
  --changed-file public/app-embedded-plugin-ui.js \
  --json
```

Required checks:

```bash
node scripts/ai-ops-control-plane.js required-checks \
  --changed-file adapters/hermes-plugin-service.js \
  --changed-file tests/hermes-plugin-service.test.js \
  --json
```

Visual lane allocation:

```bash
node scripts/ai-ops-control-plane.js lane allocate \
  --plugin-id codex-mobile \
  --requester codex-thread-019 \
  --state-file "$HOME/.homeai-qa/ai-ops-lanes.json" \
  --json
```

Evidence ledger:

```bash
node scripts/ai-ops-control-plane.js evidence append \
  --kind test \
  --status passed \
  --command "node tests/ai-operations-control-plane-service.test.js" \
  --ledger "$HOME/.homeai-qa/evidence-ledger.jsonl" \
  --json
```

Incident cassette:

```bash
node scripts/ai-ops-control-plane.js incident create \
  --symptom "plugin MCP missing after grant" \
  --workspace-id weixin_stephen \
  --plugin-id finance \
  --issue-code gateway_profile_binding_missing \
  --dir "$HOME/.homeai-qa/incidents" \
  --json
```

Diagnostic remediation plan:

```bash
node scripts/ai-ops-control-plane.js remediation plan \
  --case-json @case.json \
  --events-json @events.json \
  --json
```

## Task Intake Contract

Task intake produces a bounded context pack with:

- `harnessClass`: `H1`, `H2`, or `H3`;
- `modules`: durable module names inferred from task text and changed files;
- `requiredDocs`: canonical docs to read before editing;
- `allowedBoundaries`: code areas that should own the work;
- `requiredChecks`: focused tests, scripts, and visual harnesses to run;
- `rootCauseGovernance`: required diagnosis fields, mitigation versus closure
  classification, fallback registry path, and fallback governance check command;
- `visualLane`: whether a dedicated Simulator/Appium lane is required;
- `deployment`: expected deployment target/surface when deployment is in scope;
- `blockedIf`: conditions that make the result invalid.

Intake output is advisory but strict enough for handoff: an agent must explain
why it skips a required doc, lane, governance field, or check.
Autonomous Delivery Loop persists only this bounded projection per slice; it
does not copy raw prompts, task bodies, screenshots, private records, database
rows, secrets, tokens, cookies, or long logs into the delivery ledger.

## Visual Lane Contract

Each visual debug lane has:

- lane id;
- live debug URL/port;
- Simulator UDID when allocated;
- Appium port;
- WDA local port;
- MJPEG port;
- owner/requester;
- lease id;
- lease expiry;
- launch commands and health-check commands.

The allocator must not share a lane between active plugin threads. If no free
lane exists, it returns `lane_unavailable` with the active leases and recovery
commands rather than silently reusing the default Simulator.

## Required-Check Contract

Required checks combine:

- changed-file pattern rules;
- task-text keywords;
- static client cache/version gates;
- plugin platform contract gates;
- root-cause and fallback governance gates;
- visual lane gates;
- production deploy gates.

The selector intentionally over-selects focused checks when a path crosses a
runtime boundary. Broad gates such as `npm test` remain aggregate closure
checks, not replacements for focused evidence.
The Autonomous Delivery Loop uses the same selector for implementation,
verification, deployment/readback, and repair slices. Target threads must treat
the projected checks as the minimum evidence contract for their return card or
include a bounded reason why a selected check did not apply.
When a return card includes an AI Ops evidence ledger path or artifact pointer,
the Autonomous Delivery coordinator verifies the ledger locally and stores only
pass/fail status, record count, bounded issues, and hash-only labels in the
delivery ledger/final report. Raw paths, URLs, private filenames, screenshots,
prompts, task-card bodies, provider payloads, and long logs are not persisted
by the coordinator projection.

For H1/H2 work, production-affecting work, incident follow-up, or task text that
mentions bug fixing, deployment, failure, fallback, or root cause, the selector
adds `node scripts/fallback-governance-check.js --json` or the same command
with `--changed-file` arguments. The task is blocked until the result is
classified as `mitigation` or `closure`, and any new or extended fallback is
removed or registered in `docs/IMPLEMENTATION_NOTES/fallback-registry.md`.

## Evidence Ledger Contract

Evidence records are append-only JSONL entries. Required fields:

- `id`;
- `timestamp`;
- `kind`: `analysis`, `test`, `visual`, `deploy`, `production_smoke`,
  `incident`, or `handoff`;
- `status`: `passed`, `failed`, `blocked`, or `info`;
- `summary`;
- `command` when command-backed;
- `commit` when available;
- `artifactPaths`;
- bounded `metadata`.

The ledger must redact secret-looking values and must not store raw access
keys, passwords, cookies, launch tokens, OAuth tokens, push endpoints, or long
private user content.
Downstream consumers that reference ledger files should hash or label artifact
paths before storing them in user-visible reports.

## Incident Cassette Contract

An incident cassette is a redacted replay seed, not a full log dump. It stores:

- symptom;
- issue code;
- workspace id;
- plugin id;
- route/view/surface;
- client version;
- selected Gateway/profile/toolset summary;
- relevant artifact paths;
- reproduction steps;
- expected checks;
- privacy and redaction notes.

Incident cassette files are safe to attach to future dev runs because they keep
only bounded identifiers and evidence pointers.

## Diagnostic Intake Contract

Runtime diagnostic intake is for small maintenance bugs where the current UI
state and bounded evidence are more useful than a user-authored screenshot and
manual explanation. It is implemented as a Home AI platform service, not as
plugin-local model logic.

Self-check diagnostics use the same intake boundary. The maintained signal
matrix version `20260628-self-improving-loop-v3` covers Gateway profile health,
MCP/schema closure, deploy lane liveness, task-card dispatch, plugin proxy
latency, native bridge capability, notification delivery, plugin manifest
health, audit-thread liveness, Automation cron health, and production
self-diagnostic inventory health. Current production collectors read bounded
outputs from `production-status-smoke.js`, `macos-automation-cron-audit.js`,
and `production-self-diagnostics.js`. Each self-check event must include only
bounded metadata such as signal id, owner, route kind, error code, duration
bucket, counts, build id, and short hashes. It must not include raw URLs, paths,
keys, cookies, launch tokens, screenshots, payload bodies, database rows, full
prompts, or long logs.

The default hidden client trigger is a three-finger long press. The two-finger
long press remains reserved for native shell settings. The same Home AI sheet is
also available from embedded plugin surfaces: same-origin plugin iframes are
bound by the host, and cross-origin plugins may request it by posting a bounded
`homeai.diagnostic.open` message to the parent. Plugin requests may include only
safe context fields such as `pluginId`, `route`, `workspaceId`, and
`sourceSurface`; they must not include plugin content, screenshots, images,
cookies, launch tokens, provider payloads, or long logs.

Embedded plugins may also post `homeai.diagnostic.report` for automatic
metadata-only diagnostics when a product-blocking failure is already known, such
as retry-exhausted playback, save, toolset, Gateway, or host-proxy failures. The
host accepts the report only from a registered plugin iframe, strips route query
strings to safe keys, whitelists bounded fields, and submits the event through
the same diagnostic intake route. These automatic reports may create Owner
notifications when the remediation gate passes, but task-card dispatch remains
Owner-triggered.

Trusted plugin reports may include bounded `counts`, `context`, and
`breadcrumbs[].fields`. Home AI preserves only whitelisted numeric/boolean count
fields and safe context fields such as action, surface, route kind, read/render
mode, source kind, build/cache id, short hashes, and embedded/PWA flags. Raw
body/text/prompt/task content, URLs with private query state, local paths,
filenames that identify private media, cookies, launch tokens, access keys,
OAuth tokens, provider payloads, screenshots, uploads, database rows, and long
logs are rejected or redacted before intake storage. This field contract is
plugin-generic; it must not be implemented as a Codex-only special case.

The host also mirrors plugin-report transport state into the existing
`/api/client-layout-diagnostics` log with bounded records such as
`received`, `rejected_no_frame`, `submit_started`, `submit_ok`, and
`submit_failed`. These transport records are delivery diagnostics only: they do
not create remediation cases, do not replace `diagnostics/events`, and must not
include raw media titles, prompts, task bodies, file paths, provider payloads,
tokens, cookies, screenshots, or long logs. Their purpose is to distinguish
whether a real plugin incident failed before `postMessage`, during iframe source
matching, during authenticated intake submission, or after case creation.

Routes:

```http
POST /api/v1/home-ai/diagnostics/events
GET  /api/v1/home-ai/diagnostics/cases
GET  /api/v1/home-ai/diagnostics/cases/:case_id
GET  /api/v1/home-ai/diagnostics/events?case_id=...
POST /api/v1/home-ai/diagnostics/cases/:case_id/state
POST /api/v1/home-ai/diagnostics/cases/:case_id/task-card
```

Auth boundary:

- event submission requires workspace access for the submitted workspace;
- case/event listing, state changes, and task-card dispatch require Owner
  access;
- the route group is registered in the authenticated mobile API dispatcher and
  the central route inventory.

Persisted data:

- SQLite database under `data/ai-ops/diagnostics/diagnostics.sqlite` by
  default;
- override path: `HOMEAI_AI_OPS_DIAGNOSTIC_DB_PATH`;
- cases, events, and state transitions are stored separately;
- events are deduplicated into cases by workspace, plugin, diagnostic type,
  route, and hashed thread/turn identifiers.

Privacy boundary:

- raw screenshots, image bytes, chat bodies, prompts, completions, provider
  payloads, cookies, access keys, launch tokens, and long logs are not accepted;
- thread and turn ids are stored only as salted hashes;
- route query strings are reduced to allowed keys such as `view`, `pluginId`,
  `pluginRoute`, and `workspaceId`;
- evidence is limited to counts, booleans, duration buckets, bounded error
  codes, client build id, plugin id, and user-entered short note.

Routing states:

```text
inbox_waiting
card_candidate
card_sent
remediation_waiting
verification_waiting
closed
suppressed
expired
reopened
```

H1/H2 diagnostics with sufficient confidence become `card_candidate`; all
other diagnostics remain `inbox_waiting`. A remediation plan with
`ready_to_dispatch` may auto-dispatch only when it matches the strict Home AI
self-check gate (`plugin_id=home-ai`, `source_surface=home-ai-self-check`,
`diagnostic_type=self_check_signal_failed`, and `category=self_check_*`). Other
eligible plans create an Owner-only Action Inbox notification and remain
Owner-triggered. Lower-confidence, privacy-unsafe, unknown-target, or high-risk
cases remain in the Owner-visible AI Ops inbox or diagnostic case list without
dispatch side effects.

Runtime diagnostics can be routed into remediation only as bounded evidence.
The remediation planner must never export raw screenshots, logs, plugin
payloads, health records, email bodies, financial rows, wardrobe images,
provider responses, cookies, access keys, OAuth tokens, launch tokens, or full
prompts into a task card. The owning implementation thread may inspect local
logs inside its workspace or production boundary, but its return card must
summarize only bounded evidence.

## Plugin Conversation Action Bridge

The plugin conversation window is a Home AI host conversation surface, not the
embedded plugin iframe and not a plugin-owned Codex MCP runtime. When that host
conversation identifies a plugin-owned capability gap or repair request, it
must use the plugin conversation action bridge instead of pretending that the
conversation can directly call the plugin implementation thread.

The bridge accepts a bounded structured request and creates an Owner-only Action
Inbox approval item. It does not automatically send a Codex task card. Owner
approval is the dispatch boundary. At approval time, Owner may attach an
additional prompt; the bridge appends that prompt to the task-card body under
`Owner Additional Prompt` and then sends the card through the central Codex
task-card service.

Routes:

```http
POST /api/plugin-conversation/actions
POST /api/plugin-conversation/actions/:item_id/task-card
```

Auth boundary:

- request creation requires workspace access for the current conversation
  workspace and always notifies Owner;
- task-card dispatch requires Owner access;
- non-Owner requests can create Owner-visible approvals but cannot dispatch,
  choose arbitrary target workspaces, or attach Owner prompts;
- the route group is registered in the authenticated mobile API dispatcher and
  the central route inventory.

Payload boundary:

- accepted fields are bounded summaries, request type, plugin id, suggested
  change, acceptance notes, and compact evidence;
- the host resolves plugin id to the canonical plugin implementation thread and
  workspace using the central target map;
- raw plugin records, health records, financial rows, mailbox bodies, wardrobe
  images, raw conversation transcripts, provider payloads, cookies, access keys,
  launch tokens, screenshots, and long logs must not be copied into the
  request, Inbox item, push payload, or task card.

Client trigger:

- the Home AI web client exposes a hidden diagnostic feedback sheet;
- default hidden gesture is three-finger long press so it does not conflict with
  the native shell two-finger long-press menu;
- native shells or internal tools may open the same sheet by dispatching
  `homeai:open-diagnostic-feedback`;
- embedded plugins may submit a bounded automatic report with
  `homeai.diagnostic.report`; they must use hashes for private item ids and must
  not include raw titles, URLs, file paths, provider payloads, screenshots,
  cookies, launch tokens, or long logs.
- plugin conversation surfaces may submit a bounded repair request with
  `homeai.plugin_conversation.action` or
  `homeai.pluginConversation.action`. The Home AI client forwards the request to
  `POST /api/plugin-conversation/actions`, which creates an Owner Action Inbox
  approval item. This is not an auto-dispatch path; Owner must still click
  `发修复卡` and may attach an Owner prompt before task-card dispatch.
- host-side assistant replies in plugin conversation topics may also append one
  hidden `homeai-plugin-conversation-action` HTML comment containing exact JSON.
  The client scans only recent completed assistant messages, strips the hidden
  block from display, deduplicates submission locally, and forwards it through
  the same `POST /api/plugin-conversation/actions` bridge. The assistant must
  not claim successful submission or invent `t_*`, `ainb_*`, or `ttc_*` ids; a
  real submitted approval has an `ainb_*` id and a real Codex task card has a
  `ttc_*` id after Owner dispatch.
- accepted conversation-action evidence is limited to bounded scalar/list
  fields such as catalog key, label, aliases, status/error code, source kind, and
  counts. Raw records, health logs, private workout text, raw provider payloads,
  URLs, paths, tokens, cookies, screenshots, uploads, and full conversation
  transcripts are stripped before the request is sent to the host API.
- ordinary chat, directory-bound topic chats, and low-permission Gateway runs may
  submit a Home-AI-owned capability/platform gap by appending one hidden
  `homeai-owner-task-request` HTML comment with bounded JSON. The client submits
  it through the same Owner-gated approval bridge with `pluginId:"home-ai"` and
  default `requestType:"capability_gap"`. These requests target the Home AI app
  implementation thread/workspace, not a plugin thread, and still only create an
  Owner Action Inbox approval item. They must not claim successful submission
  unless the Host returns a real `ainb_*` id, and they must not claim Codex
  dispatch unless Owner later receives a real `ttc_*` id.
- duplicate repair-request upserts must not repeatedly notify Owner. The Action
  Inbox result marks whether the row was created, updated, or reopened; the
  bridge sends push only for a newly created approval or a true terminal-state
  reopen.

## Ownership

Primary service:

```text
adapters/ai-operations-control-plane-service.js
adapters/ai-ops-diagnostic-intake-service.js
adapters/ai-ops-diagnostic-remediation-service.js
adapters/plugin-conversation-action-bridge-service.js
adapters/autonomous-delivery-coordinator-service.js
```

Route/UI:

```text
server-routes/ai-ops-diagnostic-api-routes.js
server-routes/plugin-conversation-action-api-routes.js
server-routes/autonomous-delivery-api-routes.js
public/app-ai-ops-diagnostics-ui.js
public/app-action-inbox-ui.js
```

CLI:

```text
scripts/ai-ops-control-plane.js
```

Focused tests:

```text
tests/ai-operations-control-plane-service.test.js
tests/ai-ops-control-plane-cli.test.js
tests/ai-ops-diagnostic-intake-service.test.js
tests/ai-ops-diagnostic-remediation-service.test.js
tests/ai-ops-diagnostic-api-routes.test.js
tests/ai-ops-diagnostic-feedback-ui.test.js
tests/plugin-conversation-action-bridge-service.test.js
tests/plugin-conversation-action-api-routes.test.js
tests/autonomous-delivery-coordinator-service.test.js
tests/autonomous-delivery-api-routes.test.js
tests/app-action-inbox-ui.test.js
```

Durable implementation note:

```text
docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md
```

## Validation

Focused development validation:

```bash
node tests/ai-operations-control-plane-service.test.js
node tests/ai-ops-control-plane-cli.test.js
node tests/ai-ops-diagnostic-intake-service.test.js
node tests/ai-ops-diagnostic-remediation-service.test.js
node tests/ai-ops-diagnostic-api-routes.test.js
node tests/ai-ops-diagnostic-feedback-ui.test.js
node tests/autonomous-delivery-coordinator-service.test.js
node tests/autonomous-delivery-api-routes.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node --check adapters/ai-operations-control-plane-service.js
node --check scripts/ai-ops-control-plane.js
git diff --check
```

Aggregate closure should additionally run the repository check/test gate before
production deployment:

```bash
npm run check
npm test
```

## Deployment

The control plane is repository tooling. Deploy Home AI source, not static-only
assets, when production operators or production-launched Codex Mobile threads
need the new scripts and docs:

```bash
npm run --silent deploy:macos -- \
  --target home-ai \
  --surface full \
  --restart none \
  --reason ai-operations-control-plane \
  --execute \
  --password-file <private-local-password-file> \
  --json
```

If future API routes expose the service at runtime, deployment must use normal
Home AI restart validation instead of `--restart none`.
