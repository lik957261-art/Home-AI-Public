# Plugin Capability Activation And Lazy MCP Loading

Status: runtime activation, prompt injection, selected-worker availability
probing, bounded events, production sync, and focused unit coverage are
implemented. Full per-plugin deep schema smoke remains a separate operations
probe and is not run on every ordinary chat.

## Goal

Hermes Mobile must support cross-plugin reasoning without paying the token,
latency, and reliability cost of loading every plugin MCP schema in every chat.
A normal chat should know that authorized plugin capabilities exist, and a
plugin-bound topic should always receive its own required plugin rules, but
other plugin capabilities should stay lightweight until the run needs them.

This design separates four concepts that were previously easy to conflate:

- `authorized capability set`: every plugin/MCP/Skill capability the effective
  workspace and permission tier may use.
- `active schema set`: the MCP tool schemas and Skill rules actually injected
  into the current model run.
- `capability catalog`: a compact, non-secret model-visible index of authorized
  capabilities that are not yet active.
- `required plugin bundle`: the current plugin topic's mandatory MCP/toolsets,
  Skill rules, and bounded diagnostics.

The product rule is: profiles should preserve the full authorized capability
boundary, but each run should inject only the active schema set required for
that run plus a compact catalog for the rest.

## Runtime Surfaces

### Current Implementation

The first implementation is intentionally service-first and run-assembly scoped:

- `adapters/plugin-capability-activation-service.js` builds
  `active_schema_set` and `plugin_capability_catalog` from the effective
  run policy.
- `adapters/gateway-run-start-service.js` applies the service after deterministic
  toolset routing and required plugin bundle merging, then writes the active
  schema set into `allowed_toolsets`, `enabled_toolsets`, Gateway routing
  metadata, and assistant `runOptions`.
- `adapters/gateway-run-instruction-service.js` injects catalog-only plugin
  instructions separately from active callable hints, so catalog entries do not
  look like loaded MCP schemas.
- `adapters/plugin-capability-probe-service.js` validates optional active
  plugin candidates against the selected Gateway worker's declared toolsets
  before the model request is sent. A failed optional probe removes that plugin
  from `enabled_toolsets`, marks its catalog entry `unavailable`, and emits a
  bounded `plugin_capability_unavailable` event. A successful probe emits
  `plugin_capability_activated`.
- `adapters/plugin-authorized-toolset-service.js` projects the effective
  workspace's locally complete plugin bindings into the authorization boundary
  before run activation. It exposes Gateway-materialized plugin MCP toolsets
  such as Wardrobe, Finance, Email, Note, Health, Growth, Moira, Music, and
  Movie. Workspace-private plugins require the matching workspace
  `.hermes-*` config/key pair where the plugin contract requires one. Owner-only
  media plugins such as Music and Movie are authorized only for the Owner
  workspace. A key-only partial plugin binding is not authorized for model
  runs.
- `adapters/hermes-plugin-service.js` treats plugin-manager grants as complete
  provisioning, not UI toggles. After a plugin-specific bind/register succeeds,
  it refreshes the workspace Gateway profile binding, runs the restricted
  macOS `ensure_launchd_services` path, mirrors complete `.hermes-*` bindings
  into the worker-local `HermesWorkspace`, renders MCP server config, and
  kickstarts affected workers. If that Gateway refresh is required and fails,
  the grant is marked `provisioning_failed` instead of `active`.
- `adapters/gateway-runtime-composition-service.js` and
  `mobile-server-runtime.js` wire the service into production runtime
  composition.

Optional plugins stay catalog-only unless the deterministic policy activates
them from fixed plugin context, high-confidence aliases, suggested toolsets, or
an explicit escalation retry. Optional activation is soft: Gateway Pool receives
`preferredToolsets` to favor a compatible worker, but the worker choice does not
fail the entire run merely because an optional plugin is absent. If the selected
worker cannot prove the optional plugin toolset is available, runtime downgrades
that plugin to catalog `unavailable` before streaming.

### Ordinary Chat

Ordinary chat starts with:

- the baseline chat tools and Skills required by Hermes Mobile itself;
- the effective workspace's compact capability catalog;
- zero or a small bounded number of deterministic plugin preloads when the
  request or context clearly references those plugins.

The ordinary-chat prompt must not include every plugin MCP schema or every
plugin Skill. The catalog is only a routing affordance, not evidence. It may
say that Finance can inspect spending, Wardrobe can inspect clothing/outfits,
Email can inspect bounded mailbox summaries, Note can inspect notes and links,
Growth can inspect bounded learning card/status projections, or a relationship
plugin can inspect people and relationships. It must not include raw ledger
rows, wardrobe inventories, note bodies, learner answers, transcripts,
relationship graphs, access keys, launch tokens, plugin cookies, or full MCP
schema definitions.

When ordinary chat needs a plugin that is not active, runtime must activate the
plugin through a deterministic Gateway operation rather than by asking the
model to invent a tool. The activation operation must:

1. validate the effective workspace authorization;
2. prove workspace-local config/key completeness without exposing the key;
3. health/schema-probe the plugin MCP through the same route the Gateway will
   use;
4. add the plugin's MCP schema and required Skill rules to the run context; and
5. record a bounded run event such as `plugin_capability_activated` or
   `plugin_capability_unavailable`.

If activation fails for a plugin the user actually requested, the run should
surface a bounded diagnostic or ask how to proceed. It must not answer from
generic chat as if it had inspected the plugin data.

### Plugin-Bound Topics

A plugin-bound topic such as `plugin:wardrobe` or `plugin:finance` starts with
that plugin's required bundle active:

- the plugin's required MCP/toolset;
- required plugin Skill content from the selected workspace Skill Store;
- plugin-specific delivery-directory rules;
- bounded missing-MCP or missing-Skill diagnostics when the bundle cannot be
  loaded.

Other authorized plugins are represented only by the compact capability catalog
until the run needs them. For example, a Wardrobe topic may need Finance or Note
later, but Wardrobe's own MCP and Skill rules remain the only mandatory eager
plugin payload. This preserves the current plugin-first quality guarantee while
avoiding a growing all-plugin schema prompt.

Required plugin bundle failure is fail-closed. A Wardrobe topic that cannot load
`wardrobe` MCP or `productivity/wardrobe-style-operations` must not silently
become generic fashion chat. Optional cross-plugin activation failure is scoped
to the optional plugin and should not discard the already-active current plugin.

### Directory-Bound Topics And Plugin Links

Directory-bound topics and notes may reference plugin entities: a note can link
a bill, a person, and a wardrobe outfit. These links should seed deterministic
activation hints, not force all referenced plugin schemas into every request.

Runtime may preload a plugin when a link has a concrete plugin id and the newest
request asks to inspect, verify, update, compare, or summarize the linked
plugin entity. Merely rendering a link or mentioning a plugin name should add
only catalog context.

### Explicit Wide Mode

The user may explicitly ask for a cross-plugin sweep, for example "check this
against all my plugins." In that case runtime may perform a bounded health
probe over all authorized plugin capabilities and activate every healthy plugin
that fits the run budget. Unhealthy plugins must be reported as unavailable,
not retried repeatedly in the background.

## Capability Catalog Contract

The capability catalog is generated server-side from manifest/provisioning
metadata and Gateway schema probe status. It is not generated by the model.

Each catalog entry should be compact:

- `pluginId`
- display title
- domain summary in one short sentence
- toolset id
- required Skill ids, if any
- activation triggers or example intents
- availability state: `available`, `unavailable`, `not_provisioned`, or
  `health_unknown`
- a short non-secret diagnostic code when unavailable

The catalog should be small enough to be always safe for ordinary chat. The
initial target is a few hundred tokens for all plugins in one workspace. If a
workspace has many plugins, entries should degrade to shorter summaries rather
than injecting full per-plugin instructions.

The catalog may include "can activate on request" guidance, but it must not
include raw MCP JSON schema, full Skill bodies, raw plugin data, private entity
lists, or credentials.

## Activation Selection Policy

Activation should be deterministic first and model-assisted only for a bounded
decision when deterministic evidence is insufficient.

Deterministic activation inputs:

- fixed `plugin:<id>` topic group;
- active embedded plugin context;
- explicit plugin id in a note/directory link;
- request text that contains configured high-confidence plugin aliases;
- file or delivery-directory metadata owned by a plugin;
- previous run state that already activated a plugin in the same task group.

Model-assisted activation may choose from the compact catalog, but it is not a
security boundary. Server-side policy must still enforce workspace,
permission-tier, health, and schema checks before loading the plugin.

The default activation budget should be narrow:

- ordinary chat: baseline plus catalog, then at most 1-3 eager plugin
  activations unless the user asks for wide mode;
- plugin topic: current plugin required bundle plus catalog for all other
  authorized plugins;
- explicit wide mode: all healthy authorized plugins that fit configured
  run-budget limits.

## Gateway And Profile Relationship

Gateway profiles and Skill Stores remain full-authorized per workspace and
permission tier. A profile must know how to activate every authorized plugin for
that workspace, including workspace-local MCP config and Skill Store binding.
Hermes Mobile derives that authorization from the effective workspace, not from
the authenticated browser principal alone; Owner-authenticated access to a
non-Owner workspace must still use the target workspace's plugin bindings.
`pluginTopicContext.pluginId` is an activation hint after authorization has
already been established; it is not authorization evidence. A plugin topic whose
effective workspace policy does not authorize the plugin primary toolset must
not inject that plugin's required MCP/toolsets or Skills and must not fall back
to Owner plugin bindings.

The active run does not need to inject every profile capability. Runtime should
materialize or reuse a Gateway slot whose authorized capability set matches the
workspace/tier/provider, then select a smaller active schema set for the run.
This is a prompt/runtime optimization; it must not reduce the durable
authorization boundary.

Broken optional plugins must not poison unrelated runs. A failed Finance schema
probe should keep Finance out of the active schema set and catalog it as
unavailable, rather than causing ordinary chat to retry Finance MCP startup.
If the current plugin's required bundle fails, the run should fail closed with a
plugin-specific diagnostic.

The fixed Wardrobe plugin topic has an additional workflow gate because its
daily outfit answers are user-facing decisions with expensive failure modes.
`plugin:wardrobe` must preload `productivity/wardrobe-style-operations` from the
selected workspace Skill Store, including bounded non-secret reference files.
General Wardrobe topic turns require `wardrobe`, `vision`, `file`, and
`skills`; outfit-intent turns also require `weather`. Missing required evidence
blocks the run before Gateway streaming. Outfit completion is validated again
before the run can become `done`; it must show the required Skill, weather,
Wardrobe MCP/readback, Markdown receipt, and watch decision.

## Required Tests

Implementation should add or update focused tests for:

- ordinary chat includes capability catalog but does not include full optional
  plugin Skill bodies or MCP schemas (`node
  tests\plugin-capability-activation-service.test.js`, `node
  tests\gateway-run-start-service.test.js`, `node
  tests\gateway-run-instruction-service.test.js`);
- plugin topic includes the current plugin required MCP/Skill bundle and only
  catalog entries for other plugins (`node
  tests\plugin-capability-activation-service.test.js`, `node
  tests\gateway-run-start-service.test.js`);
- optional plugin activation checks workspace authorization, worker schema
  availability, and no Owner fallback (`node
  tests\plugin-capability-probe-service.test.js`, `node
  tests\plugin-capability-activation-service.test.js`, `node
  tests\gateway-run-start-service.test.js`, `node
  tests\gateway-pool-provider.test.js`);
- Health profile/history import requests activate `health` before streaming and
  prove the active schema set reaches Gateway routing, `enabled_toolsets`,
  `access_policy_context`, plugin catalog status, assistant `runOptions`, and
  bounded activation telemetry (`node tests\gateway-run-start-service.test.js`);
- required plugin failure emits a bounded diagnostic and blocks generic
  fallback;
- Wardrobe plugin topic preflight and completion gates block incomplete outfit
  runs and keep non-outfit Wardrobe topic runs from requiring weather (`node
  tests\wardrobe-outfit-workflow-gate-service.test.js`, `node
  tests\gateway-run-start-service.test.js`, `node
  tests\gateway-run-event-service.test.js`);
- optional plugin failure does not slow or fail unrelated ordinary chat;
- explicit wide mode health-probes plugins once, activates healthy plugins, and
  reports unhealthy plugins;
- capability catalog contains no raw keys, launch tokens, cookies, private
  data, or full tool schema JSON.

## Deployment And Operations

Deployers should treat this as a Gateway/profile behavior change. Source
changes that implement this design need:

- focused service tests for activation policy and catalog generation;
- Gateway/profile startup tests for required bundle versus optional catalog;
- `node tests\architecture-refactor-boundary.test.js`;
- production smoke for ordinary chat, one plugin topic, and one cross-plugin
  activation request.

Production diagnostics should show the active schema set and catalog status in
bounded metadata. They must not print credentials, full Skill bodies, raw plugin
records, or full MCP schema payloads.
