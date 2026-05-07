# Hermes Mobile

Hermes Mobile is a mobile-first web app for using a local Hermes Gateway from a phone or desktop browser. It is separate from the official Hermes dashboard and does not use the dashboard terminal/PTY chat surface as its product model.

This repository is the private productization checkout. It was split from the larger internal workspace so Hermes Mobile can be stabilized, tested, packaged, and later exported to a clean public repository.

## Current Scope

- Mobile chat, task list, directory, todo, and automation views.
- Streaming Hermes Gateway runs with usage display.
- Directory-bound task creation and file/artifact preview.
- Workspace-scoped access keys.
- Web Push notifications for task, todo, group mention, and automation events.
- CRON/automation list and deliverable preview.

## Run

Install dependencies:

```powershell
npm install
```

Run validation:

```powershell
npm test
```

This runs JavaScript syntax checks, provider contract tests, Python bridge compilation, and a privacy scan for local paths, runtime state, private key material, and internal workspace markers.

Run the full productization gate before packaging or exporting:

```powershell
npm run productization:check
```

This runs `npm test`, the startup `-CheckOnly` path, and `git diff --check`.

Start the listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1 -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1
```

Detached Windows listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1 -Detached
```

Restart after code changes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\restart-hermes-web.ps1
```

WSL/Linux:

```bash
./start-hermes-web.sh -CheckOnly
./start-hermes-web.sh
```

Default URL: `http://0.0.0.0:8797`

## First Run

If `HERMES_WEB_KEY` is not set and the Owner key file (`HERMES_WEB_AUTH_KEY_PATH`, or `.hermes_web_secret_key` by default) does not exist, Hermes Mobile opens a first-run setup screen.

1. Create the Owner Access Key in the browser.
2. Copy and store the plaintext key immediately; it is shown once.
3. Enter Hermes Mobile.
4. Open the sidebar `账号 / 根目录 / 接口` panel, choose `Access Key` management, create user workspaces, configure root/allowed directories and optional toolsets, then generate each user's Access Key.

The Owner can later edit or delete admin-created user workspaces from the same manager. Deleting a local user workspace also revokes that workspace Access Key; historical local state is not erased automatically. Workspace keys can also be revoked without deleting the user workspace.

Local user workspaces are stored in `workspace/hermes-web/workspaces.json` under `HERMES_WEB_DATA_DIR`. Workspace Access Key hashes are stored in `workspace/hermes-web/access-keys.json`. Runtime files in `workspace/` remain ignored by Git. On a fresh install without an external workspace catalog, the Owner's default file root is `drive/` under `HERMES_WEB_DATA_DIR`; override it with `HERMES_WEB_OWNER_DEFAULT_WORKSPACE` if user files should live elsewhere. Todo and Automation also default to local JSON stores under `HERMES_WEB_DATA_DIR`; set `HERMES_WEB_TODO_BACKEND` / `HERMES_WEB_AUTOMATION_BACKEND` to an explicit bridge backend only when intentionally connecting this app to an existing deployment store.

For SQLite-backed installs, set `HERMES_WEB_SERVICE_STORE=sqlite` and `HERMES_WEB_DB_PATH`. SQLite mode stores threads, messages, artifacts, Web Push state, and local Todo/Automation service rows in one database while still writing `state.json` snapshots for rollback.

## Runtime Setup

Owner can open `账号 / 根目录 / 接口` -> `运行配置` to configure and test the Hermes Gateway bridge after login.

The runtime manager stores only:

- Hermes Gateway URL
- Hermes API Key file path
- Web Push subject
- VAPID key file path

It does not store the Hermes API Key plaintext in Web configuration and it never displays the VAPID private key in the browser. The stored runtime config lives at `workspace/hermes-web/runtime-config.json` under `HERMES_WEB_DATA_DIR`.

The Owner can generate or reload VAPID keys from the runtime manager. Regenerating VAPID keys invalidates existing browser push subscriptions; users must re-enable notifications afterward.

## Configuration

Start from `.env.example`. Do not commit real keys, push endpoints, access-key stores, VAPID private keys, local state, uploaded files, or user data.

Important configuration groups:

- `HERMES_WEB_HOST`, `HERMES_WEB_PORT`, `HERMES_WEB_DATA_DIR`
- `HERMES_WEB_OWNER_DEFAULT_WORKSPACE`
- `HERMES_WEB_REPO_ROOT`, `HERMES_WEB_CONFIG_DIR`
- `HERMES_WEB_KEY` or `HERMES_WEB_AUTH_KEY_PATH`
- `HERMES_WEB_HERMES_API_BASE`
- `HERMES_WEB_HERMES_API_KEY` or `HERMES_WEB_HERMES_API_KEY_PATH`
- `HERMES_WEB_WORKSPACE_USERS_PATH`, `HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH`
- `HERMES_WEB_ALLOWED_ARTIFACT_ROOTS`
- `HERMES_WEB_WSL_USER`, `HERMES_WEB_WSL_HOME`, `HERMES_WEB_WSL_HERMES_HOME`
- `HERMES_WEB_OWNER_LABEL`, `HERMES_WEB_OWNER_ROOT_LABEL`, `HERMES_WEB_OWNER_ALIASES`, `HERMES_WEB_OWNER_DRIVE_ROOT_NAMES`
- `HERMES_WEB_GENERIC_OWNER_PROJECT_PREFIXES`, `HERMES_WEB_GENERIC_OWNER_PROJECT_IDS`
- `HERMES_WEB_TODO_BACKEND`, `HERMES_WEB_TODO_STORE_PATH`, `HERMES_WEB_TODO_PLUGIN_PATH`, `HERMES_WEB_TODO_PLUGIN_NAME`
- `HERMES_WEB_AUTOMATION_BACKEND`, `HERMES_WEB_AUTOMATION_STORE_PATH`
- `HERMES_WEB_SERVICE_STORE=sqlite`, `HERMES_WEB_DB_PATH`
- `HERMES_WEB_DISABLED_VOLUME1_WINDOWS_MIRROR_SHARES`
- `HERMES_WEB_WORKSPACE_INTERFACE_TOOLSETS_JSON`
- `HERMES_WEB_VAPID_PATH` or `WEB_PUSH_VAPID_*`

## Repository Boundary

This checkout should contain product source code, static assets, scripts, tests, and non-secret documentation only.

It must not contain:

- internal workspace context directories
- local operator instruction files
- runtime state, logs, uploads, generated reports, or private outbox files
- raw access keys, mailbox passwords, OAuth tokens, VAPID private keys, push endpoints, or API tokens

## Productization Plan

See [docs/PRODUCTIZATION.md](docs/PRODUCTIZATION.md).
See [docs/ADAPTER_BOUNDARY.md](docs/ADAPTER_BOUNDARY.md) for the current private-adapter extraction map.
See [docs/OFFICIAL_HERMES_COMPATIBILITY.md](docs/OFFICIAL_HERMES_COMPATIBILITY.md) for the compatibility boundary with official Hermes.
See [docs/SERVICE_LAYER_SQLITE.md](docs/SERVICE_LAYER_SQLITE.md) for the SQLite service-layer migration plan.

The public repository should be created from a privacy-scanned export of this private repo, not from the Agent workspace history.
