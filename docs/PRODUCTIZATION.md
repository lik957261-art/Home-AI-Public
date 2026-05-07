# Hermes Web Productization

## Direction

Use this private repository as the productization source for Hermes Web. The public repository should be created later from a clean export after configuration, adapter boundaries, docs, and privacy checks are stable.

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
- Current baseline moves WSL user/home, Hermes home, Web Push subject, todo plugin path/name, skill root, and filesystem path/mount normalization behind environment variables and providers. Remaining private labels and account-specific bindings are tracked in `ADAPTER_BOUNDARY.md`.
- First-run Owner setup is visual: if no `HERMES_WEB_KEY` and no Owner key file exists, the browser creates the Owner Access Key once, displays it once, and then enters the app. Admin-created local workspaces are stored in `workspace/hermes-web/workspaces.json`.
- The Owner workspace manager now supports a usable local-user lifecycle: create, edit label/root/allowed directories/toolsets, generate or revoke a workspace Access Key, and delete the admin-created workspace. Deleting a local workspace revokes its key but intentionally leaves historical runtime state untouched.
- `HERMES_WEB_AUTH_KEY_PATH` can point the file-backed Owner key outside the repository root; tests and packaged deployments should use it so first-run setup never writes secrets into source directories.
- Owner runtime setup is now visual for the Hermes Gateway bridge and Web Push. The UI stores Gateway URL, API key file path, Web Push subject, and VAPID file path in `workspace/hermes-web/runtime-config.json`, tests the Gateway connection from the browser flow, can generate/reload VAPID keys, and does not store API key plaintext or display VAPID private key material in Web config.
- Owner drive-root grouping is configurable through `HERMES_WEB_OWNER_DRIVE_ROOT_NAMES`; the default keeps existing `ChatGPT-Drive` deployments working, while packaged installs can use a product-specific root name.

## Phase 2: Adapter Boundary

- Separate product core from private adapters.
- Keep generic features in the main app: chat, tasks, directory, todos, automation list, preview, and notifications.
- Move account-specific connectors, private mailbox labels, local directory maps, and owner-only integrations behind optional adapters.
- Provider boundaries are now in place for workspace/project catalog loading, project/root discovery, shared-directory management, Todo operations, Automation/CRON bridge operations, automation output/deliverable file resolution, external integration inventory, and filesystem mount/path normalization. Continue by moving any remaining private display heuristics behind provider methods.
- Target shape:
  - `core`: HTTP server, state store, Gateway client, Web Push, static app, preview routes.
  - `adapters`: workspace catalog, project map, shared-directory provider, todo provider, automation provider, filesystem mount helper, external integration inventory.
  - `deployments/private-local`: local-only adapter config and private runbooks, never copied to public export.

## Phase 3: Tests And Packaging

- Add repeatable unit checks for route auth, artifact ACL, automation deliverable parsing, workspace access-key scope, Web Push payload shape, and mobile preview return behavior.
- Keep `npm run check` as a fast syntax gate.
- Add install/run instructions for Windows and Linux.
- Keep the first-run/admin HTTP smoke covering Owner setup, runtime Gateway config save/test, VAPID generation, local workspace create/edit/key revoke/delete, and first authenticated workspace reads.

## Phase 4: Public Export

- Create the public repository only after a clean export passes privacy scanning.
- The public repo must not include private paths, private clone URLs, uploads, logs, access keys, tokens, push endpoints, Tailscale hostnames, or Agent context files.
- Public commits must update README in the same commit when user-visible behavior changes.
