# AI Operations Control Plane Implementation

Last updated: 2026-06-09.

## Problem Statement

Home AI has reached a point where more documentation and more tests alone do
not solve agent efficiency. The recurring failure mode is that an agent thread
starts from an under-specified task, reads too much or too little context,
selects an incomplete test set, collides with another visual debugging session,
or closes a production issue without durable replay evidence.

The control plane addresses this by converting task intent and changed files
into deterministic operational artifacts:

- context packs;
- lane leases;
- check plans;
- evidence records;
- incident cassettes.

## Non-Goals

- No plugin SDK in the first release.
- No mobile UI surface in the first release.
- No `server.js` route in the first release.
- No raw logs, secrets, or private content in control-plane artifacts.
- No replacement for existing harnesses; the control plane selects and records
  them.

## Service Design

`adapters/ai-operations-control-plane-service.js` is a pure service with
filesystem operations injected or bounded. The CLI is the only process-facing
wrapper in the first release.

Public service functions:

```text
buildTaskContextPack(input)
selectRequiredChecks(input)
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

CLI tests cover process-facing behavior:

- `intake --json`;
- `required-checks --json`;
- `lane allocate` and `lane release`;
- `evidence append` and `evidence verify`;
- `incident create`;
- help/error behavior.

## Production Closure

This first release deploys only source tooling and docs. Production closure is
proved by:

1. clean source commit;
2. focused tests and aggregate checks;
3. central Mac full-source deploy with no restart;
4. production file-hash validation for the new script, service, and docs;
5. production CLI smoke using the production Node runtime.

If future runtime routes expose the control plane, production closure must add
listener restart and authenticated API smoke.
