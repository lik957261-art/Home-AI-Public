# AI Operations Control Plane

Last updated: 2026-06-09.

## Purpose

The AI Operations Control Plane reduces error and latency as Home AI, plugin
workspaces, Gateway profiles, production deployment, and visual harnesses grow.
It does not replace module contracts or tests. It turns those contracts into
bounded machine-readable work packets, resource leases, required checks,
evidence records, and incident cassettes so agent threads do less guessing.

## Scope

The first control-plane release owns five functions:

1. task intake and context-pack generation;
2. visual debug lane allocation;
3. required-check selection from changed files and task text;
4. evidence ledger append/list/verification;
5. incident cassette creation and listing.

The first release is CLI/service based. It is intentionally not a mobile UI
surface and does not add routes to `server.js`. Future UI or API exposure must
stay behind the same service boundary.

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

## Task Intake Contract

Task intake produces a bounded context pack with:

- `harnessClass`: `H1`, `H2`, or `H3`;
- `modules`: durable module names inferred from task text and changed files;
- `requiredDocs`: canonical docs to read before editing;
- `allowedBoundaries`: code areas that should own the work;
- `requiredChecks`: focused tests, scripts, and visual harnesses to run;
- `visualLane`: whether a dedicated Simulator/Appium lane is required;
- `deployment`: expected deployment target/surface when deployment is in scope;
- `blockedIf`: conditions that make the result invalid.

Intake output is advisory but strict enough for handoff: an agent must explain
why it skips a required doc, lane, or check.

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
- visual lane gates;
- production deploy gates.

The selector intentionally over-selects focused checks when a path crosses a
runtime boundary. Broad gates such as `npm test` remain aggregate closure
checks, not replacements for focused evidence.

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

## Ownership

Primary service:

```text
adapters/ai-operations-control-plane-service.js
```

CLI:

```text
scripts/ai-ops-control-plane.js
```

Focused tests:

```text
tests/ai-operations-control-plane-service.test.js
tests/ai-ops-control-plane-cli.test.js
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
