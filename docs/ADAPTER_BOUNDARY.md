# Adapter Boundary

Hermes Mobile should keep the mobile product core independent from deployment-specific business logic.

## Product Core

These parts belong in the reusable product:

- Mobile UI: chat, group chat, tasks, directory, todos, automation, previews, settings, and Web Push status.
- Hermes Gateway client: run creation, streaming events, interrupt, liveness watchdog, usage rendering.
- Auth/session: owner key, workspace-scoped access keys, one-time plaintext key display, re-login after key rotation.
- State store: local JSON state with backup/drop guards.
- Web Push: subscription, receipts, delivery summaries, deep links, foreground toast, task/todo/automation/mention payloads.
- Preview routes: authenticated PDF/file/image viewer, artifact ACL, same-window return links.

## Adapters

These parts must remain replaceable:

- Workspace catalog and ACL source.
- Project/directory map source.
- Todo provider.
- Automation/CRON provider.
- Filesystem mount helpers.
- Skill detail provider.
- External integration inventory, such as mail, GitHub, Google, or local desktop tools.

## Current Private Couplings

The private checkout still contains local deployment behavior that must be moved behind adapters before public export:

- Weixin-flavored workspace catalog and todo plugin naming.
- Account-specific directory display labels and project-id heuristics.
- ChatGPT-Drive display compatibility.
- Owner-only external integration detection labels.
- CRON deliverable parsing tuned for local run-log conventions.
- Volume mount helper behavior, now configurable through `HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON`.

## Extraction Rule

New product features should call an adapter interface instead of reading private files directly. If a feature needs local account names, private folder names, or a private connector id, put that mapping in deployment config or an adapter module, not in the core UI/server logic.
