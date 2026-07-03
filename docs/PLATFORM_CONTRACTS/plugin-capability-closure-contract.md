# Plugin Capability Closure Contract

Status: active architecture contract.

This contract applies whenever a plugin capability crosses a workspace,
Gateway, Home AI host, UI, deployment, or task-card boundary. It covers MCP
callable changes, deterministic message actions, native-bridge dependent
surfaces, document/file tool exposure, and plugin-owned feature metadata that
must become visible in Home AI conversations.

The goal is to prevent partial closure. A plugin-side implementation is not
complete when only the plugin service works. A Home AI-side sync is not
complete when only prompt text changes. Closure requires the capability to be
observable and usable from a fresh authorized conversation, with production
evidence or an explicit bounded skip.

## Closure Stages

Every capability card must report these stages in order.

1. `plugin_manifest_schema`
   - The plugin manifest, local MCP schema, local action contract, or native
     shell contract names the new capability and its required fields.
   - Field-level changes must be asserted by name. Tool-name-only proof is not
     sufficient when parameters, facets, action metadata, or result states
     changed.
2. `home_ai_schema_sync`
   - Home AI instruction hints, schema epoch, profile/template provisioning,
     toolset policy, or action bridge code has been synchronized.
   - For MCP changes, this includes callable names and changed input
     properties. For deterministic actions, it includes normalized action
     metadata and state.
3. `gateway_callable_registry`
   - A real dispatcher or Gateway callable registry can expose the capability.
     Prompt text alone is not sufficient evidence.
   - If a live Gateway worker cannot be probed in the current turn, the return
     must say exactly which profile/worker still needs production proof.
4. `plugin_conversation_surface`
   - A fresh plugin conversation or plugin-bound topic receives the capability
     in the surface that actually executes the run.
   - For function-output metadata, extraction must happen before compaction or
     the value must be explicitly discarded with a diagnostic code.
5. `ui_action_projection`
   - Public message projection and UI rendering expose only bounded capability
     metadata.
   - Deterministic actions must execute through an action bridge and must not
     enqueue another model run.
   - Non-executable, expired, cross-workspace, renderer-filtered, or missing
     metadata states must be visible as bounded diagnostics, not silent
     fallback.
6. `production_fresh_smoke`
   - Production evidence must come from a fresh authorized conversation,
     selected Gateway profile, native shell, or plugin production endpoint that
     matches the user-facing path.
   - Source-only validation must mark this stage skipped and include the exact
     production proof still required.
7. `auto_return_card`
   - The source thread receives a real terminal return card with bounded
     evidence.
   - A normal final answer, legacy `t_*` claim, implementation receipt sent to
     the wrong thread, or deployment receipt mislabelled as a source-closure
     card is not closure.

## Ownership

Plugin workspaces own local service behavior, plugin manifests, plugin-local
MCP wrappers, plugin docs, and plugin tests.

Home AI owns:

- Gateway callable hints and selected-profile schema sync;
- profile/template provisioning;
- host action bridges;
- message metadata extraction before compaction;
- public thread projection;
- plugin conversation UI action rendering;
- production deployment/readback closure;
- task-card routing and terminal return cards.

If the owning layer is not the current workspace, create a cross-thread task
card with the missing closure stage and bounded evidence. Do not mutate another
workspace directly.

## Evidence Rules

Accepted evidence is bounded metadata only:

- plugin id and capability id;
- local tool/action names;
- Gateway callable names;
- required property names;
- status, counts, short ids, short hashes, and version strings;
- route names and focused test commands;
- production smoke summaries without raw payloads.

Never include raw secrets, cookies, launch tokens, OAuth tokens, private plugin
rows, file contents, provider payloads, full prompts, screenshots with private
data, database rows, or long logs.

## Smoke Harness

Use the central smoke to prove the source-side closure stages:

```bash
node scripts/plugin-capability-closure-smoke.js --source-only
```

Preset checks are available for repeatedly regressed capabilities:

```bash
node scripts/plugin-capability-closure-smoke.js \
  --preset wardrobe-outfit-wear-intent \
  --source-only

node scripts/plugin-capability-closure-smoke.js \
  --preset movie-mcp-v93 \
  --source-only
```

To assert full production closure, pass production and return-card evidence:

```bash
node scripts/plugin-capability-closure-smoke.js \
  --preset movie-mcp-v93 \
  --production-evidence "fresh Owner Movie conversation exposed seven mcp_movie_* callables and actor/preferred_actors schema" \
  --return-card-evidence "ttc_<id> terminal completed return sent to Movie source thread"
```

Custom capabilities may add explicit source markers:

```bash
node scripts/plugin-capability-closure-smoke.js \
  --plugin wardrobe \
  --capability outfit_wear_intent \
  --gateway-tool mcp_wardrobe_wardrobe_execute_outfit_wear_intent \
  --require-source home_ai_schema_sync=adapters/gateway-run-instruction-service.js::mcp_wardrobe_wardrobe_execute_outfit_wear_intent \
  --source-only
```

The existing MCP-specific closure smoke remains required when MCP local schema,
Gateway schema, or live runtime callable property proof changes:

```bash
node scripts/mcp-tool-upgrade-closure-smoke.js ...
```

The plugin capability smoke is the higher-level closure checklist. It does not
replace the MCP schema probe; it prevents a green MCP probe from being mistaken
for UI/action/return-card closure.

Deterministic actions also need a source-side metadata/action closure smoke.
Wardrobe remains the canonical MCP intent-action reference family, but the
default smoke is an aggregate across multiple deterministic action families:

```bash
node scripts/plugin-action-metadata-closure-smoke.js --json
```

That smoke uses bounded fake data and verifies:

- Gateway output metadata/comment parsing before compaction;
- message metadata, Action Inbox, or route projection/readback;
- visible diagnostics or de-duplication for missing, filtered, duplicate, or
  unavailable action states;
- explicit post-execution action state readback through the public message,
  Action Inbox, or route projection when the action writes plugin state;
- deterministic bridge execution, including MCP confirmation retry or task-card
  dispatch where applicable; and
- no model run is created by the action path.

## Required Tests

Changes to this contract or the smoke harness must run:

```bash
node tests/plugin-capability-closure-smoke.test.js
node tests/plugin-action-metadata-closure-service.test.js
node tests/plugin-action-metadata-closure-smoke.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
node scripts/plugin-action-metadata-closure-smoke.js --json
git diff --check
```

If the capability touches Gateway run output metadata, message projection, or
deterministic actions, also run:

```bash
node tests/home-ai-runtime-boundary-contract.test.js
node tests/gateway-run-output-event-service.test.js
node tests/thread-view-service.test.js
node tests/plugin-conversation-action-api-routes.test.js
```

If the capability touches MCP callable schema, also run:

```bash
node tests/gateway-run-instruction-service.test.js
node tests/mcp-tool-upgrade-closure-harness.test.js
```
