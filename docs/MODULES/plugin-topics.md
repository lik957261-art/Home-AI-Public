# Module: Plugin Topics

Last updated: 2026-06-01.

## Responsibility

Plugin Topics own the Hermes Mobile surface that binds a structured plugin
application to a topic/chat context. They connect four existing boundaries:

- embedded plugin host and manifest/launch authorization;
- Gateway MCP/toolset routing;
- topic context assembly;
- workspace directory and delivery files.

They do not own plugin business logic, plugin databases, plugin UI internals,
or raw plugin credentials.

## Product Contract

- A plugin topic is workspace-scoped.
- A visible plugin topic requires the same effective-workspace plugin
  authorization and provisioning as the plugin app itself.
- The topic card may open the plugin app or the topic chat.
- Runs started in the plugin topic should include the plugin MCP/toolset only
  when the selected workspace has an active plugin binding and matching Gateway
  callable schema.
- A standard delivery directory is created for user-facing outputs and cleaned
  summaries.
- Directory files are supporting context; structured plugin MCP remains the
  primary source for live domain data.
- Owner viewing a non-Owner workspace must see that workspace's plugin topic,
  plugin app, delivery directory, and MCP binding, not Owner's.

## Proposed Files

Initial implementation should use focused services:

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

See `docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md` for the detailed design.
