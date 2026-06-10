# Plugin Topic Directory Claims

Last updated: 2026-06-10.

## Purpose

Plugin conversation topics and legacy directory-bound topics now share one
user path on the Topics page. The split is:

- Topics root exposes plugin conversation shortcuts such as Health topic,
  Wardrobe topic, Growth topic, Finance topic, and Note topic.
- Dock icons, plugin icons, and plugin app buttons continue to open structured
  plugin apps.
- Legacy directory-bound topics that are claimed by a plugin are hidden from
  the ordinary directory topic root and projected under that plugin topic
  space.
- Physical directories stay owned by the Directory module. Claims do not move
  files.

## Data Contracts

Directory claim records are stored through
`adapters/plugin-directory-context-binding-service.js`.

```text
workspaceId
pluginId
directoryRoute
directoryRouteKey
claimMode = claimed_by_plugin | auxiliary_context
contextRole = primary_evidence | legacy_context | delivery_context
hideFromDirectoryTopicRoot
defaultTopicId
createdAt
updatedAt
```

`directoryRouteKey` is built from effective workspace, route project id,
subproject id, and normalized route/root path. Display labels are not identity.
Two directories both named Health must not merge unless their normalized route
identity is the same in the same workspace.

`claimed_by_plugin` with `hideFromDirectoryTopicRoot=true` hides the ordinary
directory topic collection and makes the historical topics available in the
plugin topic switcher. `auxiliary_context` remains visible on the ordinary
directory topic root.

Plugin topic records are stored through
`adapters/plugin-topic-binding-service.js`. Default plugin topics use
`plugin:<pluginId>`. Stored special topics may add explicit plugin topic
entries without changing physical directory ownership.

Context source records are stored through
`adapters/plugin-topic-context-source-service.js`.

```text
workspaceId
pluginId
topicId
directoryRoute
directoryRouteKey
fileRoute
fileRole = cleaned_summary | pinned_context | topic_bound | context_source | stage_summary | delivery_only | raw_source
contextEligible
topicScope
sourceSkillId
updatedAt
```

Plugin topic runs must not scan a whole delivery directory. They read only the
indexed sources with `contextEligible=true`, then select by current workspace,
plugin, topic, role, recency, and budget. Raw/binary/large delivery files stay
as references unless a cleaned or pinned context record exists.

## API

- `GET /api/plugin-topic-bindings`
- `PATCH /api/plugin-topic-bindings`
- `GET /api/plugin-topic-context-sources`
- `PATCH /api/plugin-topic-context-sources`

All routes are workspace-scoped access-key routes. Owner acting on a member
workspace must pass the target workspace id; services use that effective
workspace for claims, topic bindings, context sources, plugin app data, and MCP
context. Owner identity must not fall back to Owner's own plugin or directory
data.

## Frontend Rules

`public/app-plugin-topics-ui.js` renders plugin conversation topic cards on the
Topics root. The card main action opens the plugin topic. It is not an app
launcher.

`public/app-thread-list-ui.js` computes raw directory topic collections first,
then splits them into:

- claimed collections projected under plugin topic space;
- ordinary directory topic collections still visible on Topics root.

`public/app-thread-directory-ui.js` renders the plugin topic switcher in the
task detail toolbar when the active task group is a default plugin topic or a
claimed directory topic. The switcher lists the default plugin topic, claimed
legacy directory topics, and a new-topic entry that routes the user back to the
default plugin topic as the current V1 creation path.

`public/app-directory-topics-ui.js` no longer uses a display label as route id
fallback when building directory collection keys.

## Harness

Focused checks:

- `node tests/plugin-directory-context-binding-service.test.js`
- `node tests/plugin-topic-binding-service.test.js`
- `node tests/plugin-topic-context-source-service.test.js`
- `node tests/plugin-topic-api-routes.test.js`
- `node tests/app-plugin-topics-ui.test.js`
- `node tests/task-list-ui.test.js`

Static shell changes require:

- `node tests/static-cache-version-harness.test.js`
- `git diff --check`

