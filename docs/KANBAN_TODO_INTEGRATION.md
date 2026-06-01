# Kanban-Backed Todo Integration

Hermes Mobile can use the official Hermes v0.13+ Kanban board as the backing
store for the mobile Todo tab. This keeps the mobile UI compatible with existing
`/api/todos` clients while moving task state to the official Hermes Kanban
kernel.

## Legacy Status

This integration is legacy for the Hermes Mobile primary user-participation surface.

The product direction is Action Inbox:

- new manual todos should become local Action Inbox items;
- Automation delivery results should appear in Action Inbox;
- Growth next actions should appear in Action Inbox;
- official Hermes Kanban should not be the new Inbox source of truth.

Production may temporarily continue to run with `HERMES_WEB_TODO_BACKEND=kanban` until Action Inbox can create, list, complete, dismiss, and deep-link local items. Before disabling this compatibility path, back up official Kanban data and preserve or migrate the current `Everything's amazing` reading task.

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

For packaged Windows production installs, route the CLI call through the
Hermes Mobile Kanban wrapper. On the maintained caller-context deployment,
pass the installed WSL distro explicitly and keep the Kanban wrapper in caller
context so it does not fall back to the retired worker-account distro:

```dotenv
HERMES_MOBILE_KANBAN_COMMAND=powershell.exe
HERMES_MOBILE_KANBAN_COMMAND_ARGS=-NoProfile,-ExecutionPolicy,Bypass,-File,C:\ProgramData\HermesMobile\app\scripts\run-kanban-gateway-worker.ps1,-DistroName,Ubuntu-24.04,-RunInCallerContext
HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE=wsl
```

If a separate Windows worker account owns the WSL distro, use the same wrapper
without `-RunInCallerContext`, but the `-DistroName` value must name a distro
that is registered under that worker account. Do not rely on the historical
`HermesGatewayWorker` default unless that distro is actually installed.

For a simple development install where `hermes` is already on the server
process `PATH`, leave `HERMES_MOBILE_KANBAN_COMMAND=hermes`.

## Mapping

- Each Hermes Mobile workspace maps to an official Hermes Kanban board named
  `workspace-<workspaceId>`.
- The existing Todo tab creates official Kanban tasks on that board. Ordinary
  one-off reminders are manual-only and are not assigned to executable Gateway
  worker profiles; they stay open until a user marks them complete. Planned
  execution cards, such as multi-agent plans and revision follow-ups, can still
  map the selected Mobile assignee to an executable `--assignee` profile.
- The Kanban task body carries a small Hermes Mobile metadata comment with due
  time, human assignee label, recurrence, and reminder settings.
- Hermes Mobile stores a runtime-only metadata sidecar for due/reminder fields
  that official Kanban does not currently model.
- Completing a mobile Todo calls `hermes kanban --board <board> complete`.
- Cancelling or deleting a mobile Todo archives the Kanban task.
- Postponing a mobile Todo updates the Hermes Mobile metadata sidecar and adds a
  Kanban comment for auditability.
- The mobile Todo page renders official Kanban statuses as lanes:
  `triage`, `todo`, `ready`, `running`, `blocked`, `done`, and `archived`.
  It also shows non-secret board, assignee, tenant, priority, workspace kind,
  skills, and timestamp fields returned by the official Kanban row.
- Blocked tasks can be unblocked from the mobile detail page; open tasks can be
  marked blocked from the same surface when human intervention is needed.

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
