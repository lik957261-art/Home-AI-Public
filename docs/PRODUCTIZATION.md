# Hermes Web Productization

## Direction

Use this private repository as the productization source for Hermes Web. The public repository should be created later from a clean export after configuration, adapter boundaries, docs, and privacy checks are stable.

The productized runtime target is official-Hermes-clean Gateway Pool scheduling in Hermes Mobile. Hermes Mobile must preserve official Hermes Skill, memory, tool, session, usage, event, and artifact behavior instead of replacing the Hermes agent runtime. A single Gateway is the minimal install and fallback path. See `GATEWAY_POOL_ARCHITECTURE.md`.

## Phase 0: Source Split

- Copy Hermes Web app source into an independent private checkout.
- Exclude dependency folders, runtime logs, user state, uploaded files, Agent context, and secrets.
- Add repository-local README, `.gitignore`, and `.env.example`.
- Keep the original Agent workspace as the live integration source until cutover is deliberately planned.

## Phase 1: Configuration Boundary

- Move deployment-specific paths behind environment variables or config files.
- Keep built-in defaults generic.
- Add explicit validation for required paths and credentials.
- Document which features require Hermes Gateway, WSL, Web Push, CRON metadata, or local filesystem access.
- Current baseline moves workspace user/route-map files, WSL user/home, Hermes home, Web Push subject, todo plugin path/name, bridge script paths, skill root, and filesystem path/mount normalization behind environment variables and providers. Remaining private labels and account-specific bindings are tracked in `ADAPTER_BOUNDARY.md`.
- First-run Owner setup is visual: if no `HERMES_WEB_KEY` and no Owner key file exists, the browser creates the Owner Access Key once, displays it once, and then enters the app. Admin-created local workspaces are stored in `workspace/hermes-web/workspaces.json`.
- The Owner workspace manager now supports a usable local-user lifecycle: create, edit label/root/allowed directories/toolsets, generate or revoke a workspace Access Key, and delete the admin-created workspace. Deleting a local workspace revokes its key but intentionally leaves historical runtime state untouched.
- `HERMES_WEB_AUTH_KEY_PATH` can point the file-backed Owner key outside the repository root; tests and packaged deployments should use it so first-run setup never writes secrets into source directories.
- Fresh installs without an external workspace catalog use `HERMES_WEB_DATA_DIR/drive` as the Owner file root by default. This keeps user-created folders out of the source checkout; deployments can override it with `HERMES_WEB_OWNER_DEFAULT_WORKSPACE`.
- Fresh product installs use local JSON stores under `HERMES_WEB_DATA_DIR` for Todo and Automation by default. Existing deployment plugin/CRON stores are opt-in through `HERMES_WEB_TODO_BACKEND` and `HERMES_WEB_AUTOMATION_BACKEND`, so a clean official-Gateway test instance does not accidentally list production tasks.
- Owner runtime setup is now visual for the Hermes Gateway bridge and Web Push. The UI stores Gateway URL, API key file path, Web Push subject, and VAPID file path in `workspace/hermes-web/runtime-config.json`, tests the Gateway connection from the browser flow, can generate/reload VAPID keys, and does not store API key plaintext or display VAPID private key material in Web config.
- Owner account display is configurable through `HERMES_WEB_OWNER_LABEL`; Owner drive-root grouping is configurable through `HERMES_WEB_OWNER_DRIVE_ROOT_NAMES`; the default keeps existing `ChatGPT-Drive` deployments working, while packaged installs can use a product-specific root name.

## Phase 2: Adapter Boundary

- Separate product core from private adapters.
- Keep generic features in the main app: chat, tasks, directory, todos, automation list, preview, and notifications.
- Move account-specific connectors, private mailbox labels, local directory maps, and owner-only integrations behind optional adapters.
- Keep official Hermes execution behind a Gateway Pool / GatewayRunner boundary. Hermes Mobile schedules new runs across healthy official Gateway profiles when a worker-pool manifest is configured, and falls back to one configured Gateway when no pool is available. Run stop/liveness/event handling must route back to the Gateway that created the run.
- Provider boundaries are now in place for auth/key management, runtime configuration, workspace/project catalog loading, access-policy construction, workspace binding summaries, display-path labels, project/root discovery, shared-directory management, Skill detail reads, Todo operations, Automation/CRON bridge operations, automation output/deliverable file resolution, external integration inventory, and filesystem mount/path normalization. Continue by moving any remaining private display heuristics behind provider methods.
- The next product boundary is the service data layer. `adapters/mobile-sqlite-store.js` and `scripts/migrate-json-to-sqlite.js` now provide a SQLite migration target for workspaces, access-key hashes, threads, messages, artifacts, Web Push state, shared directories, Todo, Automation, and audit events. `HERMES_WEB_SERVICE_STORE=sqlite` enables SQLite runtime state for threads/messages/artifacts/Web Push and can also back local Todo/Automation when those backends are local. SQLite runtime still writes `state.json` snapshots after successful database writes for rollback.
- Target shape:
  - `core`: HTTP server, state store, Gateway Pool scheduler, GatewayRunner/Gateway client, Web Push, static app, preview routes.
  - `adapters`: workspace catalog, access policy, workspace binding summaries, display paths, project map, shared-directory provider, skill detail provider, todo provider, automation provider, filesystem mount helper, external integration inventory, SQLite service-layer store.
  - `deployments/private-local`: local-only adapter config and private runbooks, never copied to public export.

## Phase 3: Tests And Packaging

- Add repeatable unit checks for route auth, artifact ACL, automation deliverable parsing, workspace access-key scope, Web Push payload shape, and mobile preview return behavior.
- Keep `npm run check` as a fast syntax gate.
- Add install/run instructions for Windows and Linux.
- Keep the first-run/admin HTTP smoke covering Owner setup, runtime Gateway config save/test, VAPID generation, local workspace create/edit/key revoke/delete, and first authenticated workspace reads.

## Phase 4: Public Export

- Create the public repository only after a clean export passes privacy scanning.
- Use `npm run export:public -- --out <clean-public-export-dir> --force`; the command refuses dirty source trees by default so `.public-export-report.json` matches the exported commit.
- The public repo must not include private paths, private clone URLs, uploads, logs, access keys, tokens, push endpoints, Tailscale hostnames, or Agent context files.
- Public commits must update README in the same commit when user-visible behavior changes.
