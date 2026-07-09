# Workspace Console

## Ownership

Home AI owns the Workspace Console as an Owner-only central control-plane view.
It is not a plugin-owned surface. Codex Mobile remote nodes remain outbound
clients: they enroll, heartbeat, poll task cards, return terminal evidence, and
send bounded daily summaries/escalations to Home AI.

The bottom `工作区` tab is a Codex workspace governance console. Its primary
objects are Codex-manageable project/workspace entries, not Home AI account
workspace records, work directories, or plugin-binding administration rows.

## Product Model

The primary sections are:

- `本机 Codex 工作区`: local projects that Home AI can govern through Codex
  Mobile/Home AI task-card workflows, such as Home AI, Codex Mobile Web, Music,
  Movie, Wardrobe, Finance, Growth, Note, Email, Health, and Moira.
- `远程 Codex 工作区`: Remote Managed Workspace nodes that connect outbound to
  the Home AI control plane.

Rows show bounded management metadata:

- workspace/project label and plugin/project id;
- compact cwd/project label, never a raw full local path;
- source/main thread projection;
- Worker lane and deploy lane projection;
- active task-card count, pending approval count, latest terminal return, and
  daily-summary status where available;
- bounded issue codes such as `codex_workspace_thread_unresolved`,
  `worker_lane_missing`, or Remote Managed Workspace session/escalation codes.

The console is read-only. It does not expose arbitrary shell execution, remote
source editing, enrollment tokens, launch tokens, raw task bodies, raw endpoint
bodies, private thread bodies, raw logs, or database rows.

## Backend Boundary

`adapters/workspace-console-service.js` is the read-only aggregation boundary.
It combines:

- local Codex workspace targets from the maintained Home AI/plugin target
  registry (`DEFAULT_PLUGIN_TARGETS` in the diagnostic remediation service);
- optional bounded activity/daily-summary metadata injected by tests or future
  task-card/rollup providers;
- remote Codex workspace status from
  `adapters/remote-managed-workspace-service.js`.

The earlier local account/work-directory/plugin-binding projection is retained
as a hidden diagnostic building block at:

```text
workspaceConsole.diagnostics.adminLocalWorkspaceProjection
```

That projection remains bounded and private-path-safe, but it is not a primary
bottom-tab section. Its intended future surface is a navigation/plugin
management rebuild, not the Codex workspace governance console.

`server-routes/workspace-console-api-routes.js` exposes the Owner-only route:

```text
GET /api/owner/workspace-console
```

The route is read-only and uses the normal Owner gate. Management actions must
remain explicit future API additions; the current version only supports refresh
and detail expansion in the client.

## Static Client Boundary

`public/app-workspace-console-ui.js` renders the Owner-only `工作区` tab in the
ordered static shell. The tab is registered in `public/index.html` as
`bottomWorkspaceMode` and uses `workspace-console` as the view mode, but runtime
navigation must hide the tab and block entry when `state.auth.isOwner` is not
true. Navigation aliases `workspace-console`, `workspace`, and `workspaces`
route to the same view only after the Owner gate succeeds.

The UI is mobile-first and compact:

- `本机 Codex 工作区` and `远程 Codex 工作区` sections are separate;
- rows show kind, status, bounded project/cwd label, thread/lane/deploy
  projection, active task-card counts, pending approval counts, escalation
  counts, and issue chips;
- loading, empty, Owner-denied, and error states are rendered without executing
  management actions;
- non-Owner sessions do not see the bottom `工作区` tab and defensive click/state
  guards redirect away from `workspace-console`;
- Composer is disabled/hidden while the tab is active;
- the hidden local workspace projection is not rendered by default.

Static shell changes require the normal cache marker update across
`public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`,
and `tests/task-list-ui.test.js`.

## Validation

Focused checks:

- `node tests/workspace-console-service.test.js`
- `node tests/workspace-console-api-routes.test.js`
- `node tests/workspace-console-ui.test.js`
- `node tests/mobile-bottom-nav-capacity-ui.test.js`
- `node tests/task-list-ui.test.js`
- `node tests/static-cache-version-harness.test.js`
- `node tests/api-route-inventory.test.js`
- `node tests/architecture-refactor-boundary.test.js`

For production deployment/readback, verify the installed root shell serves the
new marker, the Owner route denies non-Owner access, and
`GET /api/owner/workspace-console` returns Codex workspace sections with bounded
metadata only. Production UI readback must confirm the main `工作区` page no
longer renders generic local workspace directory/plugin-binding rows.
