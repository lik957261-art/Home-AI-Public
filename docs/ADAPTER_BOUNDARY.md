# Adapter Boundary

Hermes Mobile should keep the mobile product core independent from deployment-specific business logic.

## Product Core

These parts belong in the reusable product:

- Mobile UI: chat, group chat, tasks, directory, todos, automation, previews, settings, and Web Push status.
- Hermes Gateway client: run creation, streaming events, interrupt, liveness watchdog, usage rendering.
- Auth/session: owner key, workspace-scoped access keys, one-time plaintext key display, re-login after key rotation.
- State store: local JSON state with backup/drop guards.
- Runtime configuration: Owner-managed Gateway URL, API-key file path, Web Push subject, and VAPID file path. Store only paths/config metadata in Web config; do not store API-key plaintext or expose VAPID private keys in the browser.
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

## Current Adapter Entry Points

- `adapters/workspace-project-provider.js` owns the first catalog boundary. It loads workspace route maps, user policy records, and project-map entries through injected file readers and returns a normalized `{ workspaces, projects, sources, routeMap }` catalog.
- The same provider also accepts local admin-created workspace records from `workspace/hermes-web/workspaces.json`, so a fresh install can create users without an external Hermes ACL file.
- Admin-created workspace records are managed through the core API/UI for now: create/update/delete local workspace records, configure root/allowed directories/toolsets, generate/revoke workspace Access Keys, and keep external route-map workspaces read-only from this local manager.
- Runtime Gateway/Web Push configuration is currently in core server state through `workspace/hermes-web/runtime-config.json`; future packaging may move this behind a deployment settings provider if multiple deployment profiles are needed.
- `adapters/todo-provider.js` owns the Todo bridge payload boundary. The HTTP server now asks the provider to list, create, mutate, and mark Web Push state for todos; the current private deployment still backs that provider with `todo_bridge.py`.
- `adapters/automation-provider.js` owns the CRON bridge payload, list-cache, output-file, deliverable-path parsing, and automation file authorization boundary. The HTTP server now asks the provider to list, create, mutate, refresh, and resolve authorized automation output/deliverable files; the current private deployment still backs job operations with `cron_bridge.py`.
- `adapters/external-integration-provider.js` owns the non-secret Owner integration inventory boundary. It detects configured integrations such as GitHub, Google, Outlook, AliMail, and Hotmail from injected path/env sources and returns only display metadata.
- `adapters/filesystem-mount-provider.js` owns filesystem path/mount normalization: Windows-to-WSL path conversion, `/mnt/<drive>` conversion, `/volume1` mirror lookup, allowed artifact roots, and path-allowed checks.
- `adapters/project-discovery-provider.js` owns project/root discovery from project-map entries, physical owner top-level directories, restricted workspace directories, remote `/volume1` directory trees, shareable-root filtering, and project deduping.
- `server.js` still owns access-policy construction and shared-directory management endpoints. Those helpers should move behind narrower providers in later phases instead of adding more direct file reads to `server.js`.
- `tests/workspace-project-provider.test.js` is the contract smoke for provider caching, owner fallback, route/user merge behavior, and project expansion.
- `tests/todo-provider.test.js` is the contract smoke for Todo bridge payload mapping, public Todo normalization, search filtering, and Web Push mark/pending operations.
- `tests/automation-provider.test.js` is the contract smoke for CRON bridge payload mapping, list-cache behavior, deliverable path parsing, output resolution, and workspace authorization.
- `tests/external-integration-provider.test.js` is the contract smoke for Owner integration detection without exposing raw tokens or secret file contents.
- `tests/filesystem-mount-provider.test.js` is the contract smoke for path conversion, `/volume1` mirror behavior, disabled shares, and allowed-root checks.
- `tests/project-discovery-provider.test.js` is the contract smoke for owner physical root discovery, restricted workspace directory discovery, remote `/volume1` tree mapping, shareable-root filtering, and shared-root deduping.

## Current Private Couplings

The private checkout still contains local deployment behavior that must be moved behind adapters before public export:

- Weixin-flavored workspace catalog and todo plugin naming.
- Account-specific directory display labels and project-id heuristics.
- ChatGPT-Drive display compatibility.
- Owner-only external integration display labels remain product metadata, while deployment-specific path/env detection lives behind the integration provider.
- CRON deliverable URL shape and file preview UI remain core, while deployment-specific path roots stay injected into the automation provider.
- Volume mount helper behavior outside path normalization, now configurable through `HERMES_WEB_VOLUME1_MOUNT_HELPERS_JSON`.

## Extraction Rule

New product features should call an adapter interface instead of reading private files directly. If a feature needs local account names, private folder names, or a private connector id, put that mapping in deployment config or an adapter module, not in the core UI/server logic.
