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

## 2026-05-10 Public Update

This public tree was refreshed from private source commit
`28cd114fa6f6478c6cc7e23fed717ba58bd3111e`. The update notes below are in
Chinese for deployment operators.

### 本次更新重点

- 低权限 Gateway 现在会默认获得“同一账号已经授权的外部连接能力”。例如某个
  workspace 已经配置了 Google Workspace、Gmail、Outlook/Hotmail 等连接器时，
  该 workspace 的普通低权限运行可以看到并使用这些同账号连接器，而不再只看到
  文件目录权限。
- 这个能力不是跨账号提权。低权限运行仍然不能读取其他 workspace 的连接器、
  Access Key、运行时密钥、维护型 Gateway profile，也不能因此获得 shell、代码执行、
  delegation、git、cron 管理或产品维护权限。
- Gateway Pool 启动脚本会在启动低权限 profile 前重新 provision 外部连接器凭据，
  并为每个低权限 profile 注入 profile-local 的 Google 凭据环境变量。这样重启后不
  依赖手工补链接，部署恢复更可预测。
- Google Workspace Skill 的运行时做了兼容处理：profile-local Skill 会优先读取
  `HERMES_GOOGLE_PROFILE_HOME` 指向的 profile 目录；当系统 Python 缺少 Google
  API 依赖时，会切换到 Gateway runtime Python。这样可以避免低权限 profile 误读
  共享 Hermes home，也避免因为基础 Python 环境缺依赖而误报“未认证”。
- 权限边界 Skill 已纳入 public 版本。它的作用是让模型在执行文件、Skill、自动化、
  账号、外部连接器和交付路径相关操作前，先用当前运行权限自检；如果超出边界，
  应明确提示需要 Owner 授权或拒绝执行。

### 部署者需要注意

- 外部连接器凭据仍然必须放在运行时目录或 profile 私有目录中，不要提交到 Git。
- 如果使用 Gateway Pool，重启后应确认低权限 profile 的状态正常，并确认同账号
  connector profile 已经被同步到对应低权限 profile。
- 本更新不要求修改官方 Hermes Gateway 源码；产品行为仍然放在 Hermes Mobile
  服务、adapter、启动脚本和 Skill 层。
- 本 public export 已经过隐私扫描。部署时仍应使用自己的 `.env`、Access Key、
  Gateway API Key、OAuth token、VAPID key 和 workspace 数据目录。

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

- **Todo:** defaults to local JSON under `HERMES_WEB_DATA_DIR`; bridge/plugin
  backends are opt-in compatibility adapters.
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
- [Local workspace root migration](docs/LOCAL_WORKSPACE_ROOT_MIGRATION.md)
- [Public export checklist](docs/PUBLIC_EXPORT_CHECKLIST.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

Hermes Mobile is released under the MIT License. See [LICENSE](LICENSE).
