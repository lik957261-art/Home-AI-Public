# Home AI Runtime Boundary Contract

This contract defines the closure boundaries for Home AI runtime work that
crosses model runs, message projection, deterministic plugin actions, and
fallback governance. It complements `docs/ARCHITECTURE_BOUNDARY.md` with the
specific ownership rules that prevent a bug fix from moving policy into the
wrong layer.

## Run Pipeline Boundary

Gateway run-start services own request construction, profile and toolset
selection, permission gates, worker/runtime selection, and run start
projection.

Gateway stream and output-event services own bounded event ingestion,
terminal-event projection, and durable metadata extraction before raw provider
events are compressed or discarded. When a provider/tool output contains a
structured intent that must become a message action, the extraction belongs in
the run event layer, not in a later view projection pass.

Current canonical example:

- `adapters/gateway-run-output-event-service.js` extracts Wardrobe
  `outfit_wear_intent` data through
  `extractPreparedIntentFromOutputItemEvent` and records
  `run.wardrobe_outfit_wear_intent_metadata_attached`.

Forbidden ownership:

- `thread-view-service.js`, route modules, static-client modules, and plugin
  action services must not parse raw provider payloads or infer tool outputs
  after compaction.
- stream services must not execute deterministic plugin actions or call MCP
  write tools directly.

Required diagnostics are bounded metadata only. Do not store raw provider
payloads, full prompts, private plugin rows, file contents, secrets, cookies,
launch tokens, or long logs.

## Message Projection Boundary

`adapters/thread-view-service.js` owns public thread/message projection. It may
call focused domain action services for sanitized public action state and
diagnostics, but it must not execute actions, call MCP tools, mutate plugin
state, parse raw provider payloads, or perform filesystem/device operations.

Current canonical example:

- `thread-view-service.js` exposes `pluginActions` and
  `pluginActionDiagnostics` from the Wardrobe action service through
  `publicPluginActionDiagnostics`.

Projection must distinguish these user-visible failure classes when possible:

- `intent_metadata_missing`
- `renderer_filtered`
- `action_bridge_unavailable`

## Plugin Action Bridge Boundary

Deterministic plugin message actions must flow through focused action services
and action API routes. A button click must not enqueue a model run.

Domain action services own:

- intent schema validation;
- principal and workspace validation;
- expiry and idempotency checks;
- public action state projection;
- direct deterministic execution through the allowed plugin/MCP bridge.

Action API routes own HTTP request validation, route-level auth/context
handoff, and bounded error responses. They must delegate action-specific policy
to the domain action service.

Current canonical example:

- `adapters/wardrobe-outfit-wear-intent-action-service.js` owns Wardrobe
  intent validation, public diagnostics, and execution.
- `server-routes/plugin-conversation-action-api-routes.js` reports
  `action_bridge_unavailable` when the deterministic bridge is missing instead
  of silently falling back to a model run.
- `adapters/plugin-action-metadata-closure-service.js` and
  `scripts/plugin-action-metadata-closure-smoke.js` provide a bounded
  source-side deterministic action smoke. The smoke keeps the Wardrobe path as
  the canonical MCP intent-action reference, and also exercises a
  plugin-conversation Owner task-card action family plus a manifest route action
  family. The aggregate proves Gateway output parsing/metadata attachment,
  message or Action Inbox persistence, public projection/readback,
  deterministic bridge execution, explicit post-execution action state
  readback through message projection, push de-duplication where applicable,
  and the no-model-run action boundary using metadata-only fake data.

## Fallback Registry Boundary

Mitigations are not closure. Any new fallback or extended fallback behavior for
H1/H2 work must be registered in
`docs/IMPLEMENTATION_NOTES/fallback-registry.md` with:

- `fallback_id`;
- status;
- owning layer/workspace;
- trigger condition;
- unresolved root cause;
- removal condition;
- validation;
- review date.

Current canonical example:

- `codex_mobile_workspace_read_compat_20260630` is registered as
  `mitigation_only` for the Codex Mobile delegated workspace read
  compatibility path.

The required governance check is:

```bash
node scripts/fallback-governance-check.js --json
```

## Required Checks

Changes that touch these boundaries should run the smallest focused set first,
then the broad gates when the change is shared or production-facing:

```bash
node tests/home-ai-runtime-boundary-contract.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node tests/gateway-run-output-event-service.test.js
node tests/gateway-run-event-service.test.js
node tests/thread-view-service.test.js
node tests/wardrobe-outfit-wear-intent-action-service.test.js
node tests/plugin-action-metadata-closure-service.test.js
node tests/plugin-action-metadata-closure-smoke.test.js
node tests/plugin-conversation-action-api-routes.test.js
node scripts/plugin-action-metadata-closure-smoke.js --json
node scripts/fallback-governance-check.js --json
git diff --check
```

Use `npm test` and the deployment contract before claiming closure for a major
runtime or platform-facing feature.
