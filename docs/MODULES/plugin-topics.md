# Module: Plugin Topics

Last updated: 2026-06-01.

## Responsibility

Plugin Topics own the Hermes Mobile surface that binds a structured plugin or
built-in application module to a topic/chat context. They connect four existing
boundaries:

- embedded plugin host and manifest/launch authorization;
- Gateway MCP/toolset routing;
- topic context assembly;
- workspace plugin file directories and cleaned files.

They do not own plugin business logic, plugin databases, plugin UI internals,
or raw plugin credentials.

## Product Contract

- A plugin topic is workspace-scoped.
- Built-in plugin cards may be shown in the same topic application grid as
  external plugins. Directory is the current built-in plugin card.
- Built-in plugin cards keep their original module boundaries. Directory uses
  directory ACL and directory services, not embedded plugin launch or MCP
  provisioning.
- A visible plugin topic requires the same effective-workspace plugin
  authorization and provisioning as the plugin app itself.
- The topic card may open the plugin app, the bound topic chat, or the
  workspace plugin file directory.
- The bound topic chat action enters the fixed `plugin:<pluginId>` topic before
  refreshing the plugin file directory. Directory creation is supporting
  context work and must not block topic entry.
- Plugin topic detail is a secondary page. It must hide the bottom app
  navigation and use the standard top back/right-swipe route to return, while
  keeping the normal message composer visible for the topic chat.
- The current frontend projection renders Wardrobe, Finance, and Email as
  large-icon cards only when those plugins are visible in the effective
  workspace. It does not create new plugin grants.
- The current frontend projection renders Directory as a built-in large-icon
  card for every authenticated workspace and hides the separate mobile bottom
  Directory tab.
- Runs started in the plugin topic should include the plugin MCP/toolset only
  when the selected workspace has an active plugin binding and matching Gateway
  callable schema.
- A standard plugin file directory is created for user-facing outputs and
  cleaned summaries. The current frontend path is `插件/<plugin title>` under the
  effective workspace directory.
- Directory files are supporting context; structured plugin MCP remains the
  primary source for live domain data.
- Owner viewing a non-Owner workspace must see that workspace's plugin topic,
  plugin app, file directory, and MCP binding, not Owner's.

## Proposed Files

The first frontend increment is implemented in:

- `public/app-plugin-topics-ui.js`
- `public/app-thread-list-ui.js`
- `public/app-event-stream-ui.js`
- `public/styles.css`
- `tests/task-list-ui.test.js`

Further persistence, route, and context work should use focused services:

- `adapters/plugin-topic-binding-service.js`
- `adapters/plugin-topic-delivery-directory-service.js`
- `adapters/plugin-topic-context-service.js`
- `server-routes/plugin-topic-api-routes.js`
- `public/app-plugin-topics-ui.js` or an existing topic/navigation UI module
- `tests/plugin-topic-binding-service.test.js`
- `tests/plugin-topic-delivery-directory-service.test.js`
- `tests/plugin-topic-context-service.test.js`
- `tests/plugin-topic-api-routes.test.js`
- `tests/app-plugin-topics-ui.test.js`

Existing modules remain responsible for their own boundaries:

- plugin host: `docs/MODULES/plugins.md`
- chat context: `docs/MODULES/chat-context.md`
- directory/files: `docs/MODULES/directory-files.md`
- Gateway Pool/toolsets: `docs/MODULES/gateway-pool.md`

## Data Boundary

The binding record may store plugin id, workspace id, topic/thread id, delivery
route, display order, icon metadata, toolset policy, context policy, and bounded
status. It must not store raw plugin keys, provider tokens, launch tokens,
session cookies, full mailbox bodies, raw ledger rows, private inventories,
health records, full learner submissions, or plugin database dumps.

## Context Boundary

Context assembly for plugin topics should prefer:

1. current user request;
2. recent topic messages;
3. binding metadata;
4. live structured plugin MCP access;
5. cleaned delivery-directory summaries and selected reports;
6. existing layered topic summaries and refs.

The delivery directory is a curated evidence layer, not a bulk-import source.

## Harness

Plugin Topics are H1 when they affect plugin authorization, MCP/toolset routing,
workspace switching, delivery-directory creation, or context assembly. They are
H2 only for display-only card projection.

Focused validation should include:

- binding isolation across Owner, WuPing, test, and future workspaces;
- app/topic/delivery actions;
- missing or unprovisioned plugin diagnostics;
- plugin MCP schema presence for the selected workspace;
- no Owner fallback;
- no raw secret or private-data leakage in docs, prompts, postMessage, frontend
  state, or handoff.

The current frontend projection is covered by `node tests\task-list-ui.test.js`
and `node tests\static-cache-version-harness.test.js`: the harness asserts the
hidden legacy bottom plugin drawer, the built-in Directory card, the hidden
mobile bottom Directory tab, the plugin-topic script in the app
shell/service worker cache, large-card app/chat/file-directory icon actions,
fixed `plugin:<pluginId>` topic entry, non-blocking topic entry before directory
refresh, creation of `插件/<plugin title>`, file-directory attachment on
plugin-topic sends, return from plugin file directory to the topic list, plugin
topic detail hiding bottom navigation while keeping the composer available,
cache-sensitive static version recovery after missed script sync, and the static
version bump.

See `docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md` for the detailed design.
