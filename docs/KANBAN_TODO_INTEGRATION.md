# Kanban-Backed Todo Integration

Hermes Mobile can use the official Hermes v0.13+ Kanban board as the backing
store for the mobile Todo tab. This keeps the mobile UI compatible with existing
`/api/todos` clients while moving task state to the official Hermes Kanban
kernel.

## Mode

Enable the compatibility layer with:

```dotenv
HERMES_WEB_TODO_BACKEND=kanban
```

Optional runtime settings:

```dotenv
HERMES_MOBILE_KANBAN_COMMAND=hermes
HERMES_MOBILE_KANBAN_COMMAND_ARGS=
HERMES_MOBILE_KANBAN_BRIDGE_TIMEOUT_MS=20000
HERMES_MOBILE_KANBAN_TODO_META_PATH=workspace/hermes-web/kanban-todo-meta.json
HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE=auto
```

For packaged Windows production installs where Hermes Gateway workers run under
the dedicated `HermesMobileWorker` account, route the CLI call through the
worker wrapper shipped with Hermes Mobile:

```dotenv
HERMES_MOBILE_KANBAN_COMMAND=powershell.exe
HERMES_MOBILE_KANBAN_COMMAND_ARGS=-NoProfile,-ExecutionPolicy,Bypass,-File,C:\ProgramData\HermesMobile\app\scripts\run-kanban-gateway-worker.ps1
HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE=wsl
```

For a simple development install where `hermes` is already on the server
process `PATH`, leave `HERMES_MOBILE_KANBAN_COMMAND=hermes`.

## Mapping

- Each Hermes Mobile workspace maps to an official Hermes Kanban board named
  `workspace-<workspaceId>`.
- The existing Todo tab creates unassigned Kanban tasks so human reminder items
  are visible but are not automatically dispatched to a worker profile.
- The Kanban task body carries a small Hermes Mobile metadata comment with due
  time, human assignee label, recurrence, and reminder settings.
- Hermes Mobile stores a runtime-only metadata sidecar for due/reminder fields
  that official Kanban does not currently model.
- Completing a mobile Todo calls `hermes kanban --board <board> complete`.
- Cancelling or deleting a mobile Todo archives the Kanban task.
- Postponing a mobile Todo updates the Hermes Mobile metadata sidecar and adds a
  Kanban comment for auditability.

## Boundaries

- Official Hermes Gateway and official Kanban database semantics remain the
  source of truth for task lifecycle status.
- Hermes Mobile owns browser authentication, workspace ACLs, board selection,
  mobile rendering, Web Push reminder metadata, and public API compatibility.
- Do not expose the official dashboard Kanban plugin directly over the network.
  Hermes Mobile should remain the authenticated API layer for PWA users.
- Do not run the deprecated standalone `hermes kanban daemon` beside the
  gateway-embedded dispatcher; official Kanban expects the Gateway dispatcher.

## Compatibility

The default backend remains local unless `HERMES_WEB_TODO_BACKEND=kanban` is set.
This avoids breaking fresh installs or older Gateway versions that do not yet
ship official Kanban.
