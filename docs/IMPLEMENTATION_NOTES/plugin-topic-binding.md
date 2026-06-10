# Plugin Topic Binding Design

Last updated: 2026-06-01.

This document defines the `plugin topic` / `application topic` feature for
Hermes Mobile. The v440 frontend projection exists; v453 adds Directory as a
built-in application plugin in the topic launcher, v471/v472 tried a
Topics-tab anchored plugin drawer, v473-v475 explored inline placement, v476
proved that a list-internal fixed Dock can drift under mobile layout, v477
fixed the interaction as a dedicated topic-page plugin Dock row directly above
the mobile bottom navigation, v663 upgraded that row into a host-owned global
plugin Dock handle, and v664 makes the handle available on Chat and top-level
plugin App pages. The Dock does not add a separate bottom Plugin tab, does not
use a floating plugin drawer, and still stays out of plugin-bound topic detail,
keyboard, full-screen preview, and back-swipe transition states. Service persistence, server
routes, durable directory binding records, and Gateway/toolset routing
integration remain separate phases.

## Problem

Hermes Mobile now has embedded plugins such as Wardrobe, Finance, Email, and
Codex Mobile. These plugins are no longer only UI tabs. They own structured
domain data and expose that data to model runs through workspace-scoped MCP
toolsets.

The older directory-bound topic model is still useful for documents,
deliverables, cleaned exports, and ad-hoc project files. It is weaker as the
primary interface for data that already has a structured application backend:

- mail should be queried through the Email database and MCP, not by scanning
  raw mailbox exports;
- ledger analysis should use Finance ledgers and reports, not copied JSON
  rows;
- wardrobe recommendations should use Wardrobe items, photos, weather, and
  wear history through MCP;
- future health or education data should use their own domain stores and
  bounded summaries.

Hermes Mobile therefore needs a first-class binding between a plugin and a
topic. A plugin topic is a normal Hermes topic plus plugin-aware navigation,
tool routing, and delivery-directory context.

## Product Requirements

### Goals

- Each workspace may bind a plugin to one or more visible topics.
- A plugin topic appears on the Topics root as a pinned, compact conversation
  group row rather than a large application card. Large app-icon affordances
  belong to the global plugin Dock/drawer and Capability app-launch surfaces.
- The user can open either:
  - the plugin application surface; or
  - the topic chat that is pre-scoped to that plugin; or
  - the plugin file directory.
- Built-in modules may also appear as application plugin cards. Directory is
  the first built-in plugin: it opens the embedded Directory view and directory
  topic collections, but it does not use external plugin authorization, iframe
  launch tokens, or MCP provisioning.
- A run started from the plugin topic should automatically receive:
  - the authorized plugin MCP/toolset for the effective workspace;
  - the normal baseline tools allowed by the workspace policy;
  - companion tools required by the plugin's domain, such as `file`, `vision`,
    `weather`, `search`, or `web`, when policy permits.
- Hermes Mobile creates a standard plugin file directory for the plugin topic.
- The plugin file directory contributes cleaned, selected context to the topic; it
  is not treated as the canonical plugin database.
- Owner switching into a non-Owner workspace must behave as a true workspace
  simulation: the plugin topic, plugin app, plugin MCP, and file directory
  all resolve to the target workspace, not Owner.

### Non-Goals

- Do not copy plugin UI screens, settings, import flows, or databases into
  Hermes Mobile.
- Do not replace embedded plugin hosts or turn the Topics tab into a floating
  plugin drawer. A plugin topic is a launcher/context surface that points at
  the same plugin host contract.
- Do not force built-in modules to adopt external-plugin runtime mechanics.
  Directory remains owned by the directory module and its ACL boundary.
- Do not inject raw plugin data dumps into prompts.
- Do not allow plugin topic binding to authorize a plugin. Plugin authorization
  and provisioning remain the source of truth.
- Do not use a directory name alone as permission to expose a plugin MCP.

## Domain Model

### Plugin Topic Binding

A binding is workspace-scoped metadata that connects a plugin, a topic thread,
and a delivery directory.

Suggested record shape:

```json
{
  "id": "plugin-topic:<workspaceId>:<pluginId>",
  "workspaceId": "<effective Hermes workspace>",
  "pluginId": "finance",
  "topicThreadId": "<single-window thread id>",
  "taskGroupId": "plugin:finance",
  "displayName": "记账",
  "icon": "plugin-provided-or-host-normalized-icon",
  "pinned": true,
  "sortOrder": 30,
  "appEntry": {
    "kind": "embedded_plugin",
    "pluginId": "finance"
  },
  "deliveryRoot": {
    "kind": "workspace_directory",
    "route": "<server-normalized route>",
    "label": "插件/记账"
  },
  "toolsetPolicy": {
    "required": ["finance"],
    "companions": ["file", "search", "web"],
    "omitIfMcpUnavailable": true
  },
  "contextPolicy": {
    "structuredFirst": true,
    "deliveryDirectoryMode": "cleaned_selected",
    "maxDeliveryFiles": 8,
    "maxDeliveryChars": 12000
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

The exact persistence format can be SQLite-backed or JSON-backed in the first
implementation, but the public behavior must keep the same boundaries.

### Standard Plugin File Directory

Each plugin topic gets a workspace-local plugin file root. The directory stores
human-readable outputs, exports, reports, and curated summaries that are useful
to the model and the user.

It must not store:

- raw plugin workspace keys;
- launch tokens or browser session cookies;
- provider OAuth tokens;
- raw mailbox credentials;
- full mailboxes, full ledger dumps, private wardrobe inventories, health
  record dumps, or raw learner submissions unless a future plugin-specific
  retention design explicitly allows it;
- plugin database files.

The initial frontend route is:

```text
插件/<plugin title>
```

The physical path must be resolved by the directory boundary service for the
effective workspace. The frontend should display the friendly label, not the
raw filesystem path.

### Context Layers

A plugin topic's context should be assembled in this order:

1. Current user request and recent topic messages.
2. Runtime access policy and effective workspace identity.
3. Plugin topic binding metadata: plugin id, bounded title, file-directory route,
   and toolset policy.
4. Structured plugin access through MCP/toolsets. This is the primary source
   for live domain data.
5. Cleaned plugin file directory summaries and selected report files.
6. Existing layered topic summaries, working state, and refs.

The plugin file directory is context evidence, not a database mirror. If a question
needs live or authoritative domain state, the model should use the plugin MCP.

## Architecture

### Service-First Modules

Implementation should add focused services before route or UI wiring:

- `adapters/plugin-topic-binding-service.js`
  - creates, reads, updates, and lists workspace-scoped plugin topic bindings;
  - validates plugin visibility/provisioning before creating active bindings;
  - resolves Owner-to-non-Owner effective workspace simulation.
- `adapters/plugin-directory-context-binding-service.js`
  - creates, reads, and lists workspace-scoped plugin directory claims;
  - keys claims by effective workspace plus normalized directory route, not
    display label;
  - distinguishes `claimed_by_plugin` from `auxiliary_context`.
- `adapters/plugin-topic-delivery-directory-service.js`
  - creates and resolves the standard delivery directory;
  - delegates path validation to existing directory boundary services;
  - exposes a route/label projection without raw absolute paths.
- `adapters/plugin-topic-context-service.js`
  - converts binding metadata and selected delivery files into bounded context
    refs;
  - redacts raw/private data and stores only source ids, summaries, counts, and
    short previews.
- `adapters/plugin-topic-context-source-service.js`
  - stores a light context source index for cleaned, pinned, topic-bound, or
    explicitly marked files;
  - prevents plugin topic startup from scanning an entire delivery directory.
- `server-routes/plugin-topic-api-routes.js`
  - provides Owner/admin create/manage routes and user-visible list/open routes;
  - does not implement business logic inline.
- `server-routes/plugin-topic-context-api-routes.js`
  - exposes indexed context source eligibility for plugin topic runs;
  - does not perform directory scans.
- Existing Gateway/toolset services
  - merge plugin topic toolset policy into run-start routing only after
    workspace authorization and MCP schema evidence pass.
- Existing embedded plugin services
  - remain the source for manifest, launch, proxy, postMessage navigation, and
    plugin refresh behavior.

Implemented convergence update, 2026-06-10:

- Topics root plugin rows are fixed conversation groups. They are collapsed by
  default per workspace; the left icon opens the default plugin topic, while
  the row body expands historical/special child topics when present.
- Dock/plugin app icons remain app launchers.
- Claimed legacy directory topics are projected into the plugin topic switcher
  without moving physical directories.
- Plugin delivery directories are output surfaces; context eligibility is
  controlled by the context source index.

### Frontend Surfaces

The first UI should be deliberately small:

- A topic-page Directory application card near the topic entry surface, followed
  by directory-bound topic collections.
- A host-owned global plugin Dock anchored directly above the mobile bottom
  navigation. It contains external plugin launch icons such as Wardrobe,
  Finance, and Email, lives outside scrollable page bodies, collapses to a
  small bottom handle, and does not add a separate bottom Plugin tab or a
  floating drawer.
- The Dock's fixed bottom offset is based on the real bottom-navigation height,
  not the broader page-content reserved height. Runtime measurement reserves
  only the collapsed handle height while collapsed and the full Dock height
  while expanded.
- Each external plugin Dock item opens the plugin app directly. It does not show
  separate topic or delivery-directory mini actions in the topic list.
- The app action enters the existing embedded plugin host, which keeps the mobile bottom navigation visible as plugin-context navigation.
- The topic action opens the bound topic/task group with a plugin-aware
  composer/run route.
- A delivery-directory action may appear in the topic menu or card overflow,
  but it must use the directory module's normal ACL and preview flow.
- The root topic list does not provide a bottom `New topic` message composer.
  Users create or enter new topics through an explicit binding surface such as a
  Directory-bound topic. This prevents unanchored topic creation from bypassing
  directory/plugin context rules.

### Plugin Context State Machine

The plugin-context surface has four explicit states:

- **Topic root**: `viewMode=tasks`, `currentTaskGroupId=""`, and
  `pluginContextNavPluginId=""`. This is the ordinary Hermes topic list with
  the normal bottom navigation.
- **Plugin app**: `viewMode=<plugin viewMode>` and
  `pluginContextNavPluginId=<pluginId>`. The embedded plugin host is visible
  and the mobile bottom navigation is replaced by the three plugin-context
  tabs: topic, plugin, and directory.
- **Plugin topic**: `viewMode=tasks`,
  `currentTaskGroupId=plugin:<pluginId>`, and
  `pluginContextNavPluginId=<pluginId>`. The chat composer is visible for the
  bound topic and the same three plugin-context tabs remain visible.
- **Plugin directory**: `viewMode=projects` and
  `pluginContextNavPluginId=<pluginId>`. The directory module owns the file
  view, but the same three plugin-context tabs remain visible.

Right-swipe/browser-back from any plugin-context state exits the plugin context
and returns directly to **Topic root**. This transition is not the same as
ordinary task-detail back. It must call the dedicated plugin-context exit
renderer, restore the remembered topic-list thread, clear plugin-context state,
hide plugin iframes, remove the three-tab plugin-context bar, and restore the
ordinary five-tab navigation. It must not call `openTaskList()`,
`restoreTaskListThreadFromCache()`, or `loadSingleWindow()`, because those
generic routes can reload a shared topic thread and fall into the empty ordinary
chat page.

Codex remains a first-level bottom tab by current product rule. Wardrobe,
Finance, Email, and future business plugins are launched from the global plugin
Dock above the mobile bottom navigation when visible in the effective workspace.
Directory is no longer a permanent bottom tab in the mobile primary
navigation; it is a built-in plugin card on the topic surface, with old
directory routes/deep links remaining compatible.

### Built-In Directory Plugin

Directory is a built-in application plugin with a different backend boundary
from embedded plugins:

- card id: `directory`;
- primary action: open the embedded Directory root for the effective workspace;
- topic action: return to the topic list and show directory-topic collections;
- directory action: open the embedded Directory root;
- authorization: existing directory browser/mutation ACLs;
- context: selected, cleaned, bounded directory evidence through the directory
  context path;
- non-goal: no iframe launch token, no plugin workspace key, no MCP schema gate.

The UI may render the Directory card in the same large-icon grid as other
plugins, but code should keep a separate built-in branch so future external
plugin authorization checks cannot accidentally hide or grant Directory.

### Toolset Routing

Plugin topics are a strong routing signal, not an authorization bypass.

Before adding a plugin toolset to a run:

1. Resolve the effective workspace from the request.
2. Confirm the plugin is visible and provisioned for that workspace.
3. Confirm the workspace-local plugin config/key or plugin-owned equivalent is
   present.
4. Confirm the selected Gateway profile exposes the plugin MCP callable schema
   for that same workspace when the plugin is MCP-capable.
5. Add the plugin and companion toolsets only if the workspace policy already
   allows them.

If any step fails, Hermes should show a bounded diagnostic and omit the plugin
toolset. It must not fall back to Owner's plugin MCP.

When model-first toolset selection is disabled, plugin topic runs should execute
with the full authorized route/access toolset set. Suggested toolsets can guide
the model, but must not prune `allowed_toolsets` or `enabled_toolsets`.

### Delivery Context Selection

The delivery directory contribution should be selected by a service, not by
blind prompt stuffing. The selector should prefer:

- `summary.md`, `index.md`, or plugin-owned cleaned report metadata;
- recent final reports with stable ids;
- user-pinned files;
- small Markdown/text summaries;
- bounded previews of generated PDFs/Office docs via existing artifact metadata,
  not binary extraction.

The selector should ignore or summarize:

- binary blobs;
- raw exports;
- temporary files;
- full logs;
- plugin cache folders;
- files larger than the configured context budget.

## Implementation Plan

### Phase 1 - Product Projection And Persistence

- Add plugin-topic binding service and tests.
- Add read-only list projection for current workspace plugin topics.
- Create standard delivery directory records for bindings.
- Add module docs and product requirements.

### Phase 2 - UI And Navigation

- Render plugin topic cards. Implemented in v439 for visible Wardrobe, Finance,
  and Email entries.
- Wire open-app to the existing plugin host. Implemented in v439.
- Wire open-topic to a stable plugin task group. Implemented in v439 using
  `plugin:<pluginId>` task group ids.
- Add app/topic/file-directory actions without changing plugin iframe internals.
  Implemented in v440 with small chat and folder icon actions.
- Create/open the fixed workspace directory `插件/<plugin title>` when the user
  enters the plugin topic or file directory. Implemented in v440 through the
  existing directory mutation API and directory ACL boundary.
- Return from the plugin file directory to the topic list on back/right-swipe
  instead of walking up the directory tree. Implemented in v440.
- Keep Topics in the center of the primary bottom navigation. Do not add a
  separate bottom Plugin tab and do not attach a floating plugin drawer to the
  Topics tab. External plugin launch icons are rendered in the host-owned global
  Dock above the mobile bottom navigation; the collapsed handle is the only
  open/close gesture target. Implemented in v477 and updated to a global
  handle Dock in v664.
- Keep plugin-context back/right-swipe as a single state-machine transition to
  the ordinary topic root. It must not delegate through `openTaskList()` or any
  path that can call `loadSingleWindow()`. Implemented in v492 after the v491
  regression where plugin topic right-swipe could land on
  `Select or create a thread`.

The v440 frontend increment does not authorize plugins, create provisioning
records, or force MCP exposure. It reuses the existing effective-workspace
plugin visibility checks and only appends plugin-topic instructions and
file-directory route metadata when the user sends from a plugin-bound topic.

### Phase 3 - Context And Toolset Integration

- Add plugin-topic context refs to context assembly.
- Add run-start routing signal for plugin topic bindings.
- Prove plugin MCP schema is workspace-bound before exposing the plugin toolset.
- Keep companion tools such as `file`, `vision`, `weather`, `search`, and `web`
  according to plugin policy and workspace permissions.

### Phase 4 - Migration And Backfill

- Create default bindings for existing authorized plugins where safe:
  - Wardrobe;
  - Finance;
  - Email;
  - later Health and Education plugins after their plugin contracts exist.
- Do not auto-create bindings for Owner-critical Codex in non-Owner workspaces.
- Do not infer binding from a directory name unless an explicit migration helper
  writes a normal binding record.

### Phase 5 - Production Rollout

- Treat the first rollout as listener/static plus possible Gateway profile
  behavior depending on touched files.
- If Gateway schema/toolset routing changes, run live schema smoke for the
  selected profiles.
- Deploy local Windows production first unless the user explicitly asks for NAS
  deployment.

## Harness Requirements

This feature is H1 when it touches plugin authorization, MCP/toolset routing,
workspace switching, delivery-directory creation, or context assembly. It is H2
only for a display-only card projection that does not influence routing or
context.

Required harness coverage:

- `plugin-topic-binding-service`:
  - creates one binding per `(workspaceId, pluginId)` unless multiple bindings
    are explicitly enabled;
  - rejects bindings for unprovisioned or unauthorized plugins;
  - Owner switching into another workspace binds to the target workspace.
- `plugin-topic-delivery-directory-service`:
  - creates/resolves the standard delivery directory under the target workspace;
  - returns route/label projection without raw secret paths;
  - rejects path traversal and protected-root writes.
- `plugin-topic-context-service`:
  - includes cleaned summaries and selected delivery files only;
  - excludes raw keys, launch tokens, cookies, full mail bodies, raw ledger
    rows, private inventories, health records, and long logs.
- Gateway/toolset routing:
  - plugin topic runs keep the authorized plugin MCP and companion tools;
  - missing MCP schema omits the plugin toolset with a diagnostic;
  - Owner MCP fallback is a failing case.
- Frontend/UI:
  - pinned cards show only visible/provisioned plugins for the effective
    workspace;
  - open-app and open-topic are distinct actions;
  - hidden/unavailable plugin cards do not consume tap targets;
  - mobile PWA smoke covers at least one plugin topic.

Suggested focused tests once implemented:

- `node tests\plugin-topic-binding-service.test.js`
- `node tests\plugin-topic-delivery-directory-service.test.js`
- `node tests\plugin-topic-context-service.test.js`
- `node tests\plugin-topic-api-routes.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\context-assembly-service.test.js`
- `node tests\app-plugin-topics-ui.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js`
- `node scripts\privacy-scan.js`
- `git diff --check`

## Open Decisions

- Whether one plugin can have multiple topic bindings per workspace. The first
  implementation should default to one topic per plugin per workspace.
- Whether plugin topic ordering belongs in topic metadata, plugin manager state,
  or a dedicated navigation-layout store.
- Whether delivery directories should be created eagerly during plugin
  provisioning or lazily when the binding is first opened.
- Whether selected delivery files should be pinned manually, automatically
  selected by recency/type, or both.
