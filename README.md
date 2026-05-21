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

## 2026-05-21 Public Update

This public export corresponds to private source commit
`26a57d99c8e02a9d20081f9d06488898f889f56d`. It rolls forward the Hermes Mobile
Growth, chat, Grok routing, and workspace-access work that has been validated in
the private production source tree.

### Main Changes

- Growth now uses a native learning board and native task records as the visible
  learning surface, while official Kanban remains available as a separate
  compatibility boundary.
- Learning task sequences support evergreen just-in-time card generation. New
  learning cards are generated through the model path and can emit bounded
  decision reports for review.
- Growth reading-retell, math, and writing cards have task-specific execution
  surfaces, including audio-based retell/reflection flows and structured math
  answers with local draft autosave.
- Growth deliverables use persisted series-level directories, so future cards in
  the same learning series reuse a stable deliverable folder.
- The mobile Growth UI was tightened for board-first use: compact task cards,
  smaller deliverable icons, clearer task-detail typography, and simplified
  settings entry points.
- Chat loading and workspace switching were hardened to avoid stale async
  responses overwriting the current chat view.
- Grok/xAI routing and profile storage were tightened so credentials are kept in
  the intended Gateway profile store instead of drifting across runtime restarts.
- Workspace accounts can now be granted explicit access to additional
  workspaces through `accessible_workspace_ids`, without granting Owner-only
  administration rights.

### Configuration Impact

- To grant a restricted account access to another workspace, add an allowlist to
  the account policy, for example:

```json
{
  "principal_id": "weixin_example",
  "accessible_workspace_ids": ["weixin_stephen"]
}
```

- Growth reward limits, task-series settings, and AI recommendation features are
  service-owned configuration surfaces. Do not store production learner content,
  full transcripts, answers, Access Keys, OAuth tokens, or generated reports in
  this source checkout.
- Grok/xAI OAuth state should be stored in the configured Gateway profile
  location. Deployments should keep profile directories and credential stores
  outside Git.

### Validation Scope

- `npm test`
- `npm run productization:check`
- `git diff --check`
- `npm run privacy:scan`
- public export privacy scan over all exported files

### Known Limitations

- The public tree does not include production data, private learner records,
  OAuth credentials, push endpoints, local Gateway profile state, or runtime
  SQLite databases.
- Real Growth task generation quality depends on the deployment's configured
  model route and available learning summaries.
- Cross-workspace access grants workspace-scoped visibility only. Owner-only
  management actions remain gated by Owner authentication.

## 2026-05-12 Public Update

本次 public tree 的具体 private source commit 由 `.public-export-report.json`
记录。这是一次累计公开更新，重点是让 Windows + WSL + official Hermes Gateway
Pool 部署可以由另一个 Agent 按公开文档完成。

### 主要变化

- 低权限 Gateway 现在公开包含真实的 `weather` 和受限 `http_request` 插件，不再只停留在权限摘要层。
- Gateway Pool 启动链路补齐 worker base config、旧 lowgw 进程替换、shared-auth 同文件系统布局、profile SQLite 健康修复。
- Windows public 部署补齐必要脚本：
  - `scripts/run-as-worker.ps1`
  - `scripts/start-low-gateways-child.ps1`
  - `scripts/start-low-gateways.sh`
  - `scripts/configure-low-gateways.sh`
  - `scripts/start-gateway-pool.ps1`
- 新增 [Agent Windows production deployment](docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md)，供 Codex/Agent 按步骤部署：
  - 创建 `HermesMobileWorker`。
  - 准备 `C:\ProgramData\HermesMobile\app` / `data` / `gateway-worker`。
  - 安装 runtime package。
  - 启动 WSL `HermesGatewayWorker` lowgw pool。
  - 启动 Hermes Mobile listener。
  - 检查 `/api/status`、真实 callable schema、auth realpath、SQLite integrity。
- 看板卡片详情支持回执/过程、Markdown HTML preview、响应式回执字体和更均衡的 Worker 分配。
- Weixin / Mobile ingress 启动脚本同步到 public，但仍要求部署方自己提供账号、密钥和唯一 poller 边界。

### 部署边界

public 源码可以复刻 Hermes Mobile 自己负责的用户、脚本、目录和进程形态；不会也不应该复刻任何生产私有状态。部署方仍需提供：

- official Hermes clean runtime。
- WSL distro。
- Codex/OAuth auth 或安全 seed。
- Gateway API keys。
- Owner Access Key。
- Web Push VAPID。
- 外部连接器 token。
- workspace/user 数据。

本次 public export 不包含私有事故复盘、`.agent-context`、runtime DB、logs、uploads、backups、Access Keys、OAuth/Codex auth、push endpoints 或含 API key 的 worker manifests。

## Requirements

- Node.js `>=22`
- Python `>=3.12`
- A reachable Hermes Gateway API server
- A private network, localhost, or trusted HTTPS reverse proxy for browser access

Hermes Mobile schedules and monitors Hermes Gateway runs. It does not call
OpenAI/Codex providers directly for user tasks and does not reimplement Hermes
agent semantics.

## Deployment Path Selection For Agents

If an Agent/Codex is deploying Hermes Mobile for production on Windows and the
operator expects worker processes, Gateway Pool scheduling, low-permission
profiles, `weather`, `http_request`, Kanban execution, and the same process
shape as the reference deployment, do **not** follow Quick Start as the primary
deployment path.

Use this runbook instead:

- [Agent Windows production deployment](docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md)

Before running the production path, review the runbook's field pitfalls section.
It covers Agent elevation, per-user WSL distro registration, worker-account
Node paths, BOM-free JSON manifests, firewall profiles, and final Worker Pool
validation.

This production path requires a Windows administrator shell and WSL bootstrap
authority. In practice, the deploying Agent can satisfy the WSL requirement by
running the target distro as `root` through `wsl -d <distro> -u root`, or by
using an existing Linux user with `sudo`. The deployment flow should create or
configure the low-permission Linux worker user itself; the operator does not
need to pre-create that user. The Windows administrator step is still needed to
create/configure the Windows worker account, ProgramData runtime directories,
ACLs, credentials, and host startup processes. If Windows admin or WSL
root/sudo access is unavailable, deploy only the minimal single-Gateway path and
report that Worker Pool production deployment is not complete.

Quick Start below is only for a minimal single-Gateway listener or local smoke
test. It does not create `HermesMobileWorker`, does not prepare the
`gateway-worker` directory, does not start `lowgw1..10`, and does not build a
Gateway Pool manifest. A clean install that only follows Quick Start can log in
to Hermes Mobile but will not have production workers.

## Quick Start

Quick Start is the minimal single-Gateway path. Use it for local development,
UI checks, or a deployment that already has one reachable Hermes Gateway. Do
not use it when the requirement is a production worker pool.

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
