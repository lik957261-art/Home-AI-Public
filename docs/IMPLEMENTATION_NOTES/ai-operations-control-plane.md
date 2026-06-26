# AI Operations Control Plane Implementation

Last updated: 2026-06-24.

## Problem Statement

Home AI has reached a point where more documentation and more tests alone do
not solve agent efficiency. The recurring failure mode is that an agent thread
starts from an under-specified task, reads too much or too little context,
selects an incomplete test set, collides with another visual debugging session,
closes a production issue without durable replay evidence, or reports a
fallback mitigation as closure.

The control plane addresses this by converting task intent and changed files
into deterministic operational artifacts:

- context packs;
- lane leases;
- check plans;
- root-cause and fallback governance fields;
- evidence records;
- incident cassettes.

## Non-Goals

- No plugin SDK in the first release.
- No plugin-local bug listener; diagnostic intake is Home AI platform-owned.
- No raw logs, secrets, or private content in control-plane artifacts.
- No replacement for existing harnesses; the control plane selects and records
  them.

## Service Design

`adapters/ai-operations-control-plane-service.js` is a pure service with
filesystem operations injected or bounded. The CLI is the repository tooling
wrapper; runtime diagnostic intake uses a separate service and route module.

Public service functions:

```text
buildTaskContextPack(input)
selectRequiredChecks(input)
buildRootCauseGovernance(input)
allocateVisualLane(input)
releaseVisualLane(input)
listVisualLanes(input)
appendEvidenceRecord(input)
listEvidenceRecords(input)
verifyEvidenceLedger(input)
createIncidentCassette(input)
listIncidentCassettes(input)
redactSensitiveValue(value)
```

All functions return JSON-serializable objects with stable `ok`, `issues`, and
`warnings` fields where relevant.

`adapters/ai-ops-diagnostic-intake-service.js` is the runtime diagnostic intake
service. It owns SQLite persistence, privacy redaction, case deduplication,
status transitions, and task-card eligibility projection. It does not call
models, modify code, or dispatch task cards directly.

`adapters/ai-ops-diagnostic-remediation-service.js` converts a bounded
diagnostic case plus bounded event summaries into a deterministic remediation
plan. It owns:

- Owner-notification and Owner-triggered dispatch eligibility;
- owning-layer classification;
- target workspace/thread selection for Home AI versus plugin repairs;
- evidence-packet construction;
- Codex Mobile task-card payload construction.

It does not mutate source, inspect raw private payloads, deploy, or send the
task card by itself.

`adapters/ai-ops-diagnostic-remediation-workflow-service.js` owns the
Owner-gated workflow around that plan:

- diagnostic event ingestion may upsert an Owner-only Action Inbox item for
  `ready_to_dispatch` plans;
- non-Owner workspace diagnostics still notify Owner only;
- Owner-triggered dispatch re-reads the case/events, rebuilds the plan, calls
  the Codex Mobile task-card interface, and records the diagnostic case state
  as `card_sent`;
- automatic task-card dispatch from diagnostic ingestion is not allowed.

Runtime API routes live in
`server-routes/ai-ops-diagnostic-api-routes.js`. The route module is registered
in the authenticated mobile API dispatcher and the central route inventory:

- `POST /api/v1/home-ai/diagnostics/events` requires workspace access and
  stores a bounded diagnostic event;
- `GET /api/v1/home-ai/diagnostics/cases` requires Owner access;
- `GET /api/v1/home-ai/diagnostics/cases/:case_id` requires Owner access;
- `GET /api/v1/home-ai/diagnostics/events?case_id=...` requires Owner access;
- `POST /api/v1/home-ai/diagnostics/cases/:case_id/state` requires Owner
  access.
- `POST /api/v1/home-ai/diagnostics/cases/:case_id/task-card` requires Owner
  access and triggers Codex task-card dispatch only after re-planning the case.

The web client integration lives in `public/app-ai-ops-diagnostics-ui.js`. It
is loaded by `public/index.html`, cached by `public/service-worker.js`, and is
normally invisible. It opens on three-finger long press, not two-finger long
press, because the native shell already owns the two-finger gesture. Native
shells and internal tools can open the same sheet with the
`homeai:open-diagnostic-feedback` event.

The client integration is platform-owned across Home AI and embedded plugins.
The host listens for trusted plugin iframe requests with
`homeai.diagnostic.open`, `homeai:open-diagnostic-feedback`, or
`hermes.diagnostic.open`; the source must match a current embedded plugin
iframe. Same-origin plugin iframes are also bound by the host with the same
three-finger long-press recognizer, so plugin-local UI does not need a
transparent overlay. Cross-origin plugins can adopt the postMessage contract.
The resulting diagnostic context is bounded to plugin id, source surface, safe
route, and workspace id before it enters the runtime intake payload.

Trusted plugin iframes can also use `homeai.diagnostic.report` for automatic
metadata-only runtime reports. This path does not open the feedback sheet. The
host verifies the iframe source, whitelists bounded report fields, strips unsafe
route query parameters, and calls `POST /api/v1/home-ai/diagnostics/events`.
The report can produce an Owner notification through the remediation workflow,
but it cannot directly send a Codex task card. Plugins must use anonymous item
or collection hashes and bounded enums only; raw titles, URLs, file paths,
provider payloads, screenshots, cookies, launch tokens, and long logs are not
accepted.

Default persistent path:

```text
data/ai-ops/diagnostics/diagnostics.sqlite
```

Override:

```text
HOMEAI_AI_OPS_DIAGNOSTIC_DB_PATH
```

Stored tables:

- `ai_ops_diagnostic_cases`
- `ai_ops_diagnostic_events`
- `ai_ops_diagnostic_state_transitions`

Diagnostic case lifecycle states:

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

H1/H2 events with confidence at or above `0.7` are promoted to
`card_candidate`. Lower-severity or weak-evidence events remain
`inbox_waiting`. A closed case that receives another matching event reopens as
`reopened`.

Remediation planning then applies the stricter Owner-notification and dispatch
gate from
`docs/PLATFORM_CONTRACTS/diagnostic-remediation-loop-contract.md`:

- H1/H2 severity;
- confidence at least `0.7` or existing `card_candidate` state;
- known owning workspace/thread;
- no unsafe privacy markers;
- no high-risk Owner-approval class such as physical device control,
  destructive data mutation, secret rotation, or payment/provider action.

Examples:

- Wardrobe `retry_exhausted` with three failed attempts routes to the Wardrobe
  plugin thread.
- Health `gateway_failure` routes to Home AI Gateway/toolset ownership unless
  bounded evidence proves the Health plugin returned the failing contract
  response.
- Movie physical projector/device actions block for Owner approval instead of
  notifying or dispatching.

The privacy boundary is enforced both client-side and service-side:

- route query parameters are reduced to safe keys;
- thread and turn ids are stored as salted hashes;
- screenshots, image bytes, chat bodies, prompts, completions, provider
  payloads, cookies, keys, bearer values, and long logs are redacted or not
  accepted;
- DOM evidence is reduced to counts and booleans;
- user note is short and must not be used as a raw content transport.

## Context-Pack Rules

The context pack classifier uses deterministic rules:

- Gateway, MCP, plugin provisioning, production deploy, runtime config,
  workspace permissions, and evidence/incident work are `H1`.
- Mobile UI, visual harness, static client, navigation, keyboard, PWA cache, or
  bottom chrome work is `H2` unless production deployment or plugin MCP is also
  involved.
- Isolated docs or deterministic helper changes are `H3`.

Changed files can raise the class:

- `server-routes/`, Gateway adapters, deployment scripts, provisioning scripts,
  and plugin authorization services raise to `H1`;
- `public/`, visual harnesses, and mobile UI docs raise to at least `H2`;
- docs-only changes remain `H3` unless the task text or file path names
  production/runtime behavior.

## Lane Allocation Rules

The lane allocator stores state in a local JSON file, defaulting to an explicit
operator-provided `--state-file`. It does not require sudo and does not start
processes by itself. It produces the commands and health checks that a thread
should use.

Default lane templates:

| Lane | Live Debug | Appium | WDA | MJPEG |
| --- | --- | --- | --- | --- |
| `ios-pwa-1` | `19073` | `4723` | `8101` | `9100` |
| `ios-pwa-2` | `19074` | `4724` | `8102` | `9101` |
| `ios-pwa-3` | `19075` | `4725` | `8103` | `9102` |

If the caller passes a Simulator UDID, the lane records it. If not, the lane is
still reserved but must be materialized by the operator or follow-up tool before
native actions run.

Leases expire after a bounded TTL. Expired leases may be reclaimed. Active
leases must not be overridden unless `--force` is explicitly passed.

## Required-Check Selection Rules

The selector maps changed files and task text to focused checks. It currently
recognizes:

- architecture/docs map;
- AI Operations Control Plane;
- visual harness and iOS PWA lane tooling;
- static client and service-worker;
- plugin platform contract;
- plugin host/topics/provisioning;
- Gateway/run/runtime config;
- deployment and production closure.

Every plan includes syntax checks for touched JavaScript files and `git diff
--check`. Deployment tasks include the central Mac deploy plan command. Static
client changes include client-version/cache harnesses. Visual changes include
the live debug and visual harness commands.

H1/H2 work, production-affecting work, incident follow-up, bug repair, fallback
work, and root-cause work also include the fallback governance check. When
changed files are known, the command includes `--changed-file` arguments so
added high-risk fallback lines are scanned against the fallback registry
annotation rule.

## Root-Cause Governance Rules

`buildRootCauseGovernance()` projects the platform contract into each H1/H2 or
incident context pack. It requires the agent to name the failing layer, owning
workspace, violated invariant, root cause or hypothesis, why the fix belongs at
that layer, and validation that proves the invariant.

The context pack must distinguish:

- `mitigation`: current function is restored but the root cause remains open;
- `closure`: the owning layer is repaired and temporary fallback behavior is
  removed or explicitly bounded.

The projected fallback policy disallows silent fallback, disallows calling a
mitigation closure, points to
`docs/PLATFORM_CONTRACTS/fallback-governance-contract.md`, and points any
registered fallback to `docs/IMPLEMENTATION_NOTES/fallback-registry.md`.

## Evidence Ledger Rules

The ledger is append-only JSONL. The service tolerates absent ledgers and
returns an empty list. Verification can require evidence kinds, statuses, or
matching commit prefixes.

Redaction:

- secret-looking keys become `[REDACTED]`;
- Bearer tokens become `Bearer [REDACTED]`;
- long values are bounded;
- file paths are allowed only as artifact pointers.

## Incident Cassette Rules

The cassette creator writes a single JSON file with a deterministic, sortable
id:

```text
incident-<timestamp>-<slug>.json
```

It stores no raw screenshots or logs. Artifact paths point to existing evidence
when available. Cassette metadata is bounded and redacted.

## CLI Design

CLI command families:

```text
intake
required-checks
lane allocate|release|list
evidence append|list|verify
incident create|list
remediation plan
```

The CLI prints JSON with `--json`; otherwise it prints a short text summary.
Unknown arguments fail closed.

## Test Strategy

Service tests cover deterministic behavior:

- task text and changed files classify to H1/H2/H3 correctly;
- context packs include the expected docs/checks/lane requirements;
- required-check selector maps changed files to commands;
- lane allocation prevents concurrent reuse and release frees the lane;
- evidence ledger redacts secrets and verifies required evidence;
- incident cassettes are bounded and redacted.
- diagnostic intake stores bounded events, hashes thread ids, deduplicates
  events into cases, and exposes Owner-only case management routes.
- diagnostic remediation planning routes plugin retries to plugin threads,
  routes Gateway/toolset failures to Home AI ownership, blocks low-confidence
  and privacy-unsafe cases, and blocks high-risk physical/device actions.
- diagnostic remediation workflow tests prove Owner-only notification,
  non-Owner-to-Owner routing, manual Codex task-card dispatch, and case state
  transition to `card_sent`.

CLI tests cover process-facing behavior:

- `intake --json`;
- `required-checks --json`;
- `lane allocate` and `lane release`;
- `evidence append` and `evidence verify`;
- `incident create`;
- `remediation plan`;
- help/error behavior.
- diagnostic route and client feedback tests cover workspace/Owner auth,
  redaction, static cache inclusion, and the three-finger trigger.

## Production Closure

Repository tooling closure is proved by:

1. clean source commit;
2. focused tests and aggregate checks;
3. central Mac full-source deploy with no restart;
4. production file-hash validation for the new script, service, and docs;
5. production CLI smoke using the production Node runtime.

Runtime diagnostic intake closure must additionally prove:

1. listener restart when deployed;
2. authenticated workspace event submission smoke without private payloads;
3. Owner case list/read/state smoke with bounded metadata only;
4. static client cache build id updated so PWA/WebView shells receive
   `app-ai-ops-diagnostics-ui.js`;
5. mobile or in-app browser verification that the hidden sheet opens without
   occupying the native shell two-finger gesture.
