# Adapter Boundary

Hermes Mobile should keep the mobile product core independent from deployment-specific business logic.

## Product Core

These parts belong in the reusable product:

- Mobile UI: chat, group chat, tasks, directory, todos, automation, previews, settings, and Web Push status.
- Hermes Gateway client: pool scheduling, run creation, streaming events, interrupt, liveness watchdog, usage rendering. This boundary should converge on `GatewayPoolProvider` plus `GatewayRunner` abstractions that call official Hermes Gateway profiles and preserve official Hermes Skill, memory, session, tool, usage, event, and artifact behavior instead of reimplementing it.
- Auth/session: owner key, workspace-scoped access keys, one-time plaintext key display, re-login after key rotation.
- State store: local JSON state with backup/drop guards.
- Service data layer: SQLite schema, migration tooling, and optional runtime backend for product-owned workspaces, keys, threads, messages, artifacts, Web Push state, shared directories, Todo, Automation, and audit events.
- Runtime configuration: Owner-managed Gateway URL, API-key file path, Web Push subject, and VAPID file path. Store only paths/config metadata in Web config; do not store API-key plaintext or expose VAPID private keys in the browser.
- Web Push: subscription, receipts, delivery summaries, deep links, foreground toast, task/todo/automation/mention payloads.
- Preview routes: authenticated PDF/file/image viewer, artifact ACL, same-window return links.

## Adapters

These parts must remain replaceable:

- Workspace catalog and ACL source.
- Access policy construction and sanitization.
- Workspace binding/interface summaries.
- Display-path and shared-root label heuristics.
- Project/directory map source.
- Todo provider.
- Automation/CRON provider.
- Delivery boundary prompt provider.
- External bridge command/script resolution.
- Filesystem mount and path normalization helpers.
- Security boundary and protected-path policy.
- Skill detail provider.
- External integration inventory, such as mail, GitHub, Google, or local desktop tools.

## Current Adapter Entry Points

- `adapters/workspace-project-provider.js` owns the first catalog boundary. It loads workspace route maps, user policy records, and project-map entries through injected file readers and returns a normalized `{ workspaces, projects, sources, routeMap }` catalog.
- `adapters/access-policy-provider.js` owns access-policy sanitization and construction. It merges route/user/project fields, applies project root overrides, adds shared roots for restricted workspaces, and appends the upload cache root without letting unrelated private fields leak into runtime policy payloads.
- `adapters/auth-provider.js` owns the product auth/key boundary: first-run Owner key creation, Owner/workspace key authentication, workspace key store normalization, scoped workspace-key rotation/revocation, Owner key rotation, and public key-status records.
- `adapters/workspace-bindings-provider.js` owns the non-secret Workspace Access binding summary. It filters common/default toolsets, maps special interface ids to display chips, emits optional channel summaries, and appends Owner external integrations without exposing raw credentials.
- `adapters/display-path-provider.js` owns shared-root owner labels and logical path fallback labels, including configurable owner drive-root names and `/volume1` owner segment detection.
- The same provider also accepts local admin-created workspace records from `workspace/hermes-web/workspaces.json`, so a fresh install can create users without an external Hermes ACL file.
- Admin-created workspace records are managed through the core API/UI for now: create/update/delete local workspace records, configure root/allowed directories/toolsets, generate/revoke workspace Access Keys, and keep external route-map workspaces read-only from this local manager.
- `adapters/runtime-config-provider.js` owns runtime Gateway/Web Push configuration stored in `workspace/hermes-web/runtime-config.json`: Gateway URL validation, API-key file/env loading, Web Push subject validation, VAPID path resolution, and public non-secret runtime status.
- `adapters/todo-provider.js` owns the Todo bridge payload boundary. The HTTP server now asks the provider to list, create, mutate, and mark Web Push state for todos; the provider emits generic `suppress_external_notice` while preserving old `suppress_weixin_notice` compatibility for existing deployment bridges. Existing deployments may still back that provider with `todo_bridge.py`.
- `adapters/automation-provider.js` owns the CRON bridge payload, list-cache, output-file, deliverable-path parsing, and automation file authorization boundary. The HTTP server now asks the provider to list, create, mutate, refresh, and resolve authorized automation output/deliverable files; existing deployments may still back job operations with `cron_bridge.py`. Automation list summaries scan only recent output files per job by default through `HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT`; exact file opening still performs the full authorized file check for the requested output.
- `adapters/delivery-boundary-provider.js` owns reusable Hermes Mobile run instructions for generated documents. Markdown (`.md`) is the default final document deliverable for chat, task, group-chat, and automation runs, exposed through `MEDIA:<absolute_path>` and rendered as HTML inside Hermes Mobile. PDF/Word/Office copies are generated only for explicit external forwarding, printing, editable Office, or required non-Markdown output. Markdown system sharing must go through an export/share choice rather than raw `.md` by default.
- `adapters/bridge-command-provider.js` owns Python bridge command resolution for Todo, CRON, Directory, and Skill bridge scripts. Default scripts remain in the repository for product installs, while deployments can override `HERMES_WEB_TODO_BRIDGE_SCRIPT`, `HERMES_WEB_CRON_BRIDGE_SCRIPT`, `HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT`, and `HERMES_WEB_SKILL_BRIDGE_SCRIPT` with Windows paths, WSL absolute paths, or WSL UNC paths without editing `server.js`.
- `adapters/external-integration-provider.js` owns the non-secret Owner integration inventory boundary. It detects configured integrations such as GitHub, Google, Outlook, AliMail, and Hotmail from injected path/env sources and returns only display metadata.
- `adapters/mobile-runtime-basic-helper-service.js` owns deterministic runtime primitives: string list de-duplication, hashing, UNC detection, generic ids, public task ids, current ISO time, bounded text compaction, searchable text normalization, boolean parameters, single-window mode normalization, Owner elevation duration normalization, and Gateway response text extraction. It must not grow into route, permission, provider, or Gateway lifecycle policy.
- `adapters/mobile-runtime-file-access-facade-service.js` owns runtime file-access facade delegation: lazy Directory browser boundary construction, file/artifact resolver delegation, file response delegation, and request-scoped Directory-thread fallback wiring. It may inject auth/thread lookup dependencies, but it must not own workspace authorization policy, path authorization rules, file conversion, or artifact persistence.
- `adapters/mobile-runtime-artifact-facade-service.js` owns runtime artifact facade delegation and bounded artifact path recovery from already-visible message text. It must not own path authorization, file conversion, artifact persistence, or Markdown discovery policy.
- `adapters/mobile-runtime-state-facade-service.js` owns runtime state normalization/persistence facade delegation and chat-group member projection. It must not own route behavior, Gateway lifecycle policy, or persistence schema details.
- `adapters/path-boundary-service.js` owns deterministic path comparison helpers shared by path policy, project discovery, shared-directory ACL projection, and runtime composition. It normalizes boundary paths, emits comparable keys, checks root containment, and computes relative child paths; it does not decide authorization or mutate the filesystem.
- `adapters/mobile-runtime-path-access-service.js` owns the runtime facade over filesystem mount normalization, security boundary filtering, and path-policy provider decisions. It is a composition adapter for runtime dependency injection, not a replacement for `path-policy-provider.js` authorization rules.
- `adapters/mobile-runtime-sqlite-store-facade-service.js` owns lazy SQLite service-store construction, migration-on-first-use, and singleton reuse for runtime dependency injection. It must not own SQLite schema, repository methods, JSON import/export, or persistence policy.
- `adapters/filesystem-mount-provider.js` owns filesystem path/mount normalization: Windows-to-WSL path conversion, `/mnt/<drive>` conversion, `/volume1` mirror lookup, allowed artifact roots, and path-allowed checks.
- `adapters/security-boundary-provider.js` owns the cross-platform protected-path boundary. It normalizes Windows, WSL, POSIX, and macOS path forms; hardens every model access policy; filters shared-directory and deliverable roots; and classifies product/source maintenance prompts that must stay in the operator channel instead of going through model runs.
- `adapters/gateway-pool-provider.js` owns non-secret Gateway Pool scheduling: manifest loading, worker normalization, exact/preferred worker hints, tag/provider filters, workspace and Skill profile routing, health checks, round-robin selection, fallback to the configured default Gateway, and API-key lookup by `gatewayUrl` without persisting worker keys into mobile state.
- `adapters/gateway-runner.js` owns the official Hermes Gateway execution boundary: authenticated requests, `/v1/responses` streaming, health/status probing, run stop, run liveness checks, SSE parsing, and per-run Gateway URL/API-key overrides.
- `adapters/run-concurrency-policy.js` owns product-level active-run counting and limit decisions before Gateway run creation.
- `adapters/mobile-runtime-weixin-facade-service.js` owns runtime delegation to Weixin ingress, outbound delivery, file forwarding, and user-facing run-error projection. It should expose Weixin composition methods to runtime wiring without duplicating ingress or outbound delivery implementation.
- `adapters/weixin-ingress-provider.js` owns the optional Weixin/iLink sidecar boundary: inbound event normalization, deterministic event ids, account/chat/principal workspace routing, outbound delivery ids, and delivery ack validation. The server endpoint requires a separate ingress key and does not reuse browser access keys.
- `adapters/project-discovery-provider.js` owns project/root discovery from project-map entries, physical owner top-level directories, restricted workspace directories, remote `/volume1` directory trees, shareable-root filtering, and project deduping.
- `adapters/shared-directory-provider.js` owns shared-directory management: persisted share records, derived ACL allowed-root shares, target/permission normalization, project injection for shared roots, read-only write guards, and ACL share removal writes through injected user-policy storage.
- `adapters/skill-detail-provider.js` owns the Skill detail bridge boundary: child-process execution, timeout, stderr compaction, JSON parsing, and not-found mapping. Existing deployments may still back detail reads with `skill_bridge.py`.
- `adapters/mobile-sqlite-store.js` owns the first generic SQLite service-layer schema, JSON import boundary, and optional runtime state backend. It can import/export current JSON state, access-key hash stores, shared-directory records, Todo/Automation rows, and Web Push state while preserving `raw_json` for compatibility.
- `server.js` still owns HTTP route enforcement, artifact/thread access checks, state store, Web Push delivery, and frontend/static serving. New execution work should be extracted behind the Gateway Pool / GatewayRunner boundary described in [Gateway Pool Architecture](GATEWAY_POOL_ARCHITECTURE.md).
- `tests/workspace-project-provider.test.js` is the contract smoke for provider caching, owner fallback, route/user merge behavior, and project expansion.
- `tests/access-policy-provider.test.js` is the contract smoke for policy field allow-listing, restricted-root merging, delivery/cache roots, and owner unrestricted behavior.
- `tests/auth-provider.test.js` is the contract smoke for first-run Owner setup, Owner/workspace authentication, workspace key scoping, revocation, env-key rotation guard, and disabled-auth behavior.
- `tests/runtime-config-provider.test.js` is the contract smoke for runtime config save/load, Gateway URL validation, API key file/env resolution, Web Push subject validation, and public non-secret status.
- `tests/workspace-bindings-provider.test.js` is the contract smoke for binding summaries, common-tool filtering, configured interface labels, Owner external bindings, and custom channel providers.
- `tests/display-path-provider.test.js` is the contract smoke for shared-root labels, owner drive-root labels, directory-route labels, and logical path fallback.
- `tests/todo-provider.test.js` is the contract smoke for Todo bridge payload mapping, public Todo normalization, search filtering, and Web Push mark/pending operations.
- `tests/automation-provider.test.js` is the contract smoke for CRON bridge payload mapping, list-cache behavior, deliverable path parsing, output resolution, and workspace authorization.
- `tests/delivery-boundary-provider.test.js` is the contract smoke for generated-document placement instructions across chat, task, group-chat, and automation runs.
- `tests/bridge-command-provider.test.js` is the contract smoke for bridge script env overrides, Windows/WSL command construction, WSL absolute path preservation, and WSL UNC path conversion.
- `tests/external-integration-provider.test.js` is the contract smoke for Owner integration detection without exposing raw tokens or secret file contents.
- `tests/mobile-runtime-basic-helper-service.test.js` is the contract smoke for deterministic runtime helper primitives, including ids, public task ids, text compaction, searchable text normalization, boolean parameters, mode normalization, duration normalization, and structured response text extraction.
- `tests/mobile-runtime-file-access-facade-service.test.js` is the contract smoke for runtime file-access facade delegation, lazy Directory browser boundary construction, and Owner-only Directory-thread fallback behavior.
- `tests/mobile-runtime-artifact-facade-service.test.js` is the contract smoke for artifact facade delegation, lazy artifact-text service construction, and message-content artifact path recovery.
- `tests/path-boundary-service.test.js` is the contract smoke for shared path comparison behavior, including Windows paths, POSIX paths, slash-first provider compatibility, WSL `//wsl` stripping, `/mnt/<drive>` mapping, and relative child checks.
- `tests/mobile-runtime-path-access-service.test.js` is the contract smoke for the runtime path access facade. It covers filesystem mount delegation, protected path blocking, allowed-root filtering, thread read policy, directory-browser policy, and safe fallback behavior.
- `tests/mobile-runtime-sqlite-store-facade-service.test.js` is the contract smoke for lazy SQLite store creation, migration-on-first-use, optional migrate support, and singleton reuse.
- `tests/mobile-runtime-state-facade-service.test.js` is the contract smoke for runtime state facade lazy normalization/persistence construction, push normalization delegation, and chat-group member projection.
- `tests/filesystem-mount-provider.test.js` is the contract smoke for path conversion, `/volume1` mirror behavior, disabled shares, and allowed-root checks.
- `tests/security-boundary-provider.test.js` is the contract smoke for cross-platform protected-path normalization, policy hardening, developer-tool filtering, and product-maintenance prompt classification.
- `tests/gateway-pool-provider.test.js` is the contract smoke for worker manifest normalization, workspace/Skill routing hints, health-checked selection, fallback behavior, and secret lookup by Gateway URL.
- `tests/gateway-runner.test.js` is the contract smoke for official Gateway request auth/body handling, status tolerance, SSE event preservation, per-run API key overrides, and `runId -> gatewayUrl` operation routing.
- `tests/run-concurrency-policy.test.js` is the contract smoke for active assistant-run counting, global limits, per-workspace limits, and non-secret worker diagnostic fields.
- `tests/mobile-runtime-weixin-facade-service.test.js` is the contract smoke for Weixin runtime facade lazy composition and delegated Weixin ingress/outbound/file-forward/user-facing error methods.
- `tests/weixin-ingress-provider.test.js` is the contract smoke for Weixin event normalization, workspace route matching, deterministic ids, and delivery ack validation.
- `tests/project-discovery-provider.test.js` is the contract smoke for owner physical root discovery, restricted workspace directory discovery, remote `/volume1` tree mapping, shareable-root filtering, and shared-root deduping.
- `tests/shared-directory-provider.test.js` is the contract smoke for explicit shares, ACL allowed-root derived shares, target visibility, read-only/write access, access updates, and ACL removal writes.
- `tests/skill-detail-provider.test.js` is the contract smoke for Skill detail bridge payload mapping, required-skill validation, and not-found status mapping.
- `tests/mobile-sqlite-store.test.js`, `tests/json-to-sqlite-migration.test.js`, and `tests/sqlite-maintenance.test.js` are the contract smoke for SQLite schema migration, JSON import counts, endpoint-hash privacy preservation, CLI dry-run/write behavior, backup/export behavior, and SQLite integrity checks.

## Current Deployment Couplings

The checkout still contains local deployment behavior that must stay behind adapters before public export:

- Legacy Weixin workspace user/route-map filenames are not used by default. Existing deployments must opt in with `HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT=1` or pass explicit `HERMES_WEB_WEIXIN_USERS_PATH` / `HERMES_WEB_WEIXIN_ROUTE_MAP_PATH`; new deployments should use the generic `HERMES_WEB_WORKSPACE_USERS_PATH` and `HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH` inputs.
- Weixin message polling/delivery is now a Mobile sidecar boundary, not a reason to patch official Hermes Gateway. A deployment must disable the corresponding Gateway Weixin poller before enabling the sidecar for that same account; otherwise both pollers can race the same cursor.
- Project-id heuristics that are not already covered by the project discovery and display-path providers.
- Owner drive-root display compatibility is configurable through `HERMES_WEB_OWNER_DRIVE_ROOT_NAMES`; the default keeps `ChatGPT-Drive` compatibility for existing deployments.
- Owner-only external integration display labels remain product metadata, while deployment-specific path/env detection lives behind the integration provider.
- CRON deliverable URL shape and file preview UI remain core, while deployment-specific path roots stay injected into the automation provider.
- Any future deployment-specific mount command execution. Current code only normalizes paths and maps `/volume1` mirrors through `adapters/filesystem-mount-provider.js`.

## Extraction Rule

New product features should call an adapter interface instead of reading deployment files directly. If a feature needs local account names, local folder names, or a connector id, put that mapping in deployment config or an adapter module, not in the core UI/server logic.
