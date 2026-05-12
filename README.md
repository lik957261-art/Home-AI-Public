# Hermes Mobile

Hermes Mobile is a mobile-first web app for using a local Hermes Gateway from a
phone or desktop browser. It is separate from the official Hermes dashboard and
does not use the dashboard terminal/PTY chat surface as its product model.

This repository contains the public Hermes Mobile product source. Keep
deployment-specific secrets, runtime data, generated reports, logs, uploads,
tokens, push endpoints, and adapter configuration outside the source
checkout.

## 1.0 Scope

- Mobile chat, task list, directory, todo, automation, and group chat views.
- Streaming Hermes Gateway runs with usage/model/reasoning display.
- Directory-bound task creation and file/artifact preview.
- Workspace-scoped Access Keys and Owner-managed local workspaces.
- Runtime Gateway and Web Push configuration from the Owner UI.
- Optional Gateway Pool scheduling with workspace-aware worker selection.
- Optional Weixin/iLink ingress sidecar boundary.
- Markdown-first deliverables: generated documents default to Markdown, render as
  HTML in the app, and offer explicit PDF, Word-compatible, HTML, copy, or raw
  Markdown export/share actions.
- Installable PWA shell with static version checks, distinct app icons, and local
  font-size preferences.

## Requirements

- Node.js `>=22`
- Python `>=3.12`
- A reachable Hermes Gateway API server
- A private network, localhost, or trusted HTTPS reverse proxy for browser access

Hermes Mobile schedules and monitors Hermes Gateway runs. It does not call
OpenAI/Codex providers directly for user tasks and does not reimplement Hermes
agent semantics.

## Quick Start

Install dependencies:

```powershell
npm install
```

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Minimum single-Gateway configuration:

```dotenv
HERMES_WEB_HOST=127.0.0.1
HERMES_WEB_PORT=8797
HERMES_WEB_DATA_DIR=workspace/hermes-web
HERMES_WEB_HERMES_API_BASE=http://127.0.0.1:8642
HERMES_WEB_HERMES_API_KEY_PATH=workspace/hermes-web/secrets/hermes-api-key.secret
HERMES_WEB_AUTH_KEY_PATH=workspace/hermes-web/secrets/owner-web-key.secret
```

Start the listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1 -CheckOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-hermes-web.ps1
```

WSL/Linux:

```bash
./start-hermes-web.sh -CheckOnly
./start-hermes-web.sh
```

Default URL: `http://127.0.0.1:8797`

The first browser visit opens the Owner setup screen when no Owner Access Key is
configured. Create the Owner key, store the plaintext value immediately, then
use the Owner UI to configure workspaces and runtime Gateway settings.

## Gateway Modes

### Single Gateway

Single Gateway is the minimal install and fallback mode. Configure
`HERMES_WEB_HERMES_API_BASE` and either `HERMES_WEB_HERMES_API_KEY` or
`HERMES_WEB_HERMES_API_KEY_PATH`.

### Gateway Pool

Gateway Pool is optional. It lets Hermes Mobile schedule runs across multiple
official Hermes Gateway profiles while keeping Gateway execution semantics in
the Gateway. Configure:

```dotenv
HERMES_WEB_GATEWAY_POOL_ENABLED=auto
HERMES_WEB_GATEWAY_POOL_MANIFEST=/path/to/gateway-pool-manifest.json
HERMES_WEB_MAX_ACTIVE_RUNS=10
HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE=3
```

See `examples/gateway-pool-manifest.example.json` and
`docs/GATEWAY_POOL_ARCHITECTURE.md`. Do not commit real worker API keys or
worker manifests containing secrets.

## Runtime Data

Runtime files live under `HERMES_WEB_DATA_DIR`. On fresh installs, the Owner's
default file root is `drive/` under that data directory. Access Key hashes,
workspace config, runtime config, local Todo/Automation stores, SQLite
databases, Web Push state, uploads, and generated artifacts should remain
outside Git.

For SQLite-backed installs:

```dotenv
HERMES_WEB_SERVICE_STORE=sqlite
HERMES_WEB_DB_PATH=workspace/hermes-web/hermes-mobile.sqlite3
```

SQLite mode stores threads, messages, artifacts, Web Push state, and local
Todo/Automation service rows in one database while still writing `state.json`
snapshots for rollback.

## Optional Features

- **Todo / Kanban:** defaults to local JSON under `HERMES_WEB_DATA_DIR`;
  `HERMES_WEB_TODO_BACKEND=kanban` maps the mobile Todo tab to official Hermes
  Kanban boards while preserving the `/api/todos` compatibility surface.
- **Automation:** defaults to local JSON under `HERMES_WEB_DATA_DIR`; native
  Hermes CRON bridge integration is optional.
- **Web Push:** configure VAPID key file path and subject from the Owner runtime
  panel or with environment variables.
- **Weixin/iLink ingress:** optional sidecar boundary. Only one poller should
  own a Weixin account at a time.
- **Gateway usage telemetry:** optional read-only fallback when Gateway responses
  omit detailed usage fields.

## Configuration

Start from `.env.example`. Important groups:

- `HERMES_WEB_HOST`, `HERMES_WEB_PORT`, `HERMES_WEB_DATA_DIR`
- `HERMES_WEB_OWNER_DEFAULT_WORKSPACE`
- `HERMES_WEB_KEY` or `HERMES_WEB_AUTH_KEY_PATH`
- `HERMES_WEB_HERMES_API_BASE`
- `HERMES_WEB_HERMES_API_KEY` or `HERMES_WEB_HERMES_API_KEY_PATH`
- `HERMES_WEB_GATEWAY_POOL_ENABLED`, `HERMES_WEB_GATEWAY_POOL_MANIFEST`
- `HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING`
- `HERMES_WEB_MAX_ACTIVE_RUNS`, `HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE`
- `HERMES_WEB_SERVICE_STORE`, `HERMES_WEB_DB_PATH`
- `HERMES_WEB_TODO_BACKEND`, `HERMES_WEB_TODO_STORE_PATH`
- `HERMES_WEB_AUTOMATION_BACKEND`, `HERMES_WEB_AUTOMATION_STORE_PATH`
- `HERMES_WEB_VAPID_PATH` or `WEB_PUSH_VAPID_*`
- `HERMES_MOBILE_SECURITY_PROTECTED_ROOTS`
- `HERMES_MOBILE_SECURITY_PROTECTED_FILES`
- `HERMES_MOBILE_SECURITY_ALLOWED_EXCEPTIONS`

Do not commit real `.env` files, raw keys, OAuth tokens, push endpoints, Access
Key stores, VAPID private keys, local state, uploaded files, generated reports,
or user data.

## Validation

Run fast syntax checks:

```powershell
npm run check
```

Run the full test and privacy gate:

```powershell
npm test
npm run productization:check
```

`productization:check` runs syntax checks, provider tests, Python bridge
compilation, privacy scanning, startup `-CheckOnly`, and whitespace checks.

## Public Export

Create public releases from a clean export, not from runtime directories:

```powershell
npm run productization:check
npm run export:public -- --out workspace\public-export\hermes-mobile-public-smoke --force
```

The export command copies tracked source files, excludes runtime/deployment
directories, writes `.public-export-report.json`, and reruns the privacy scan
against the exported tree. By default it refuses dirty source trees so the
report's source commit matches the exported content.

## PWA Install

Serve Hermes Mobile from HTTPS or localhost so the browser can enable the
Service Worker. Use the top-right install entry or the browser's native
install/add-to-home-screen command. The PWA caches only the application shell
and static assets; API data, artifacts, secrets, and workspace files remain
network/runtime data.

The install identity is path-scoped to `/hermes-mobile/` so deployments that
also expose another app on the same HTTPS host do not collide with Hermes
Mobile's PWA.

## Documentation

- [Productization](docs/PRODUCTIZATION.md)
- [Adapter boundary](docs/ADAPTER_BOUNDARY.md)
- [Official Hermes compatibility](docs/OFFICIAL_HERMES_COMPATIBILITY.md)
- [Gateway Pool architecture](docs/GATEWAY_POOL_ARCHITECTURE.md)
- [Multi-task and account permissions](docs/MULTI_TASK_AND_ACCOUNT_PERMISSIONS.zh-CN.md)
- [Weixin ingress sidecar](docs/WEIXIN_INGRESS.md)
- [SQLite service layer](docs/SERVICE_LAYER_SQLITE.md)
- [Process isolation](docs/PROCESS_ISOLATION.md)
- [Agent Windows production deployment](docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md)
- [Kanban-backed Todo integration](docs/KANBAN_TODO_INTEGRATION.md)
- [Local workspace root migration](docs/LOCAL_WORKSPACE_ROOT_MIGRATION.md)
- [Public export checklist](docs/PUBLIC_EXPORT_CHECKLIST.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

Hermes Mobile is released under the MIT License. See [LICENSE](LICENSE).
