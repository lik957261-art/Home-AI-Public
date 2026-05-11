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

## 2026-05-11 Public Update

This public tree was refreshed from private source commit
`84e1ca14e92bebe06394bc30f0b719d979682b91`. The notes below are written in
Chinese for deployment operators.

### 本次更新范围

- 这是一次累计公开更新，不是单个补丁。当前 public tree 对应 private
  source commit `84e1ca14e92bebe06394bc30f0b719d979682b91`，覆盖上一版
  public commit `5eb6bee` 之后的一组产品化修复与功能更新。
- 本次公开内容主要包括：
  - 官方 Hermes Kanban 接入与移动端看板 UI
  - 单窗口聊天、群聊切换、未读提示与移动端布局修复
  - 低权限 Gateway 能力边界调整
  - Gateway Pool 的 Codex OAuth 共享认证修复

### 官方 Kanban / 看板

- Todo 页现在可以通过 `HERMES_WEB_TODO_BACKEND=kanban` 适配官方 Hermes
  Kanban，同时继续保留 Hermes Mobile 既有的 `/api/todos` 兼容接口。
- 新增 `adapters/kanban-provider.js`，补充官方 Kanban 元数据、block/unblock、
  worker 路由、无 due time 卡片、评论入口，以及卡片删除和刷新逻辑。
- 移动端看板从横向七列改成状态切换加单列卡片列表，更适合手机竖屏。
- UI 文案已把原来的“待办”主标题切换为“看板”，并同步调整相关页面。

### 聊天 / 群聊 / 移动端界面

- 单窗口聊天历史加入分页，减少首屏一次性加载的消息量，缓解聊天页和相关任务页变慢。
- 聊天与群聊改为页头直接切换，群成员管理移入三点菜单，减少移动端顶部占位。
- 修复群聊未读基线、顶部未读计数、群可见性，以及多账号加入群后看不到群的问题。
- 修复 iPhone、Fold 系列等设备的底部输入框与导航栏占位冲突，并收紧底部保留空间。
- Mention 菜单去掉重复模型显示，改成更短的标签展示，并修复 touch-through 误触发。

### 低权限 Gateway 能力边界

- 低权限 Gateway 恢复和放开了一组原本应可用的能力，包括：
  - Web Search
  - 自动化任务工具集
  - 工作区文件读取能力
  - 自己账号下的 Skill 修改能力
  - Kanban 通过 Hermes Mobile 的执行链路
- 这些调整仍然保留高低权限边界；变化是把“本账号、当前工作区、当前产品流”
  范围内应可用的能力恢复到低权限层，而不是把 Owner maintenance 权限下放。

### Gateway Codex 认证共享修复

- 修复 Gateway Pool 中 OpenAI Codex OAuth 的错误用法。之前如果把同一份
  `auth.json` 复制到多个 low Gateway profile，单次刷新会导致别的 profile
  继续拿旧 refresh token，进而出现 `refresh token was already consumed`
  之类的失败。
- 现在低权限 `lowgw1..10` 不再各自保留复制出来的 `auth.json` 副本，而是共享同一套
  低权限运行时 auth store，包括同一个 `auth.json` 与同一个 `auth.lock`。
- Owner 高权限 maintenance profile 也改成同样的思路，但仍然保持在 Owner 自己的
  运行时里共享同一套 Owner auth store，而不是和低权限 worker 混在一起。
- 这次修复的重点是“共享同一份 auth store 与同一把 lock”，不是“复制同一个 token
  到多个 profile”。前者是单一会话的并发安全共享，后者会制造 refresh token
  重用冲突。

### 启动与运维调整

- `scripts/configure-low-gateways.sh` 现在默认按共享根 auth 模式配置低权限 Gateway。
- 如果共享根 auth 比现有某个 lowgw profile 的 auth 更旧，脚本会自动提升最新的那一份
  lowgw auth 到共享根 auth，用于完成首次切换，避免再次要求多个 profile 分别登录。
- `scripts/start-gateway-pool.ps1` 现在会确保生产的 `start-low-gateways.sh`
  在真正拉起 low Gateway 前先执行 `configure-low-gateways.sh`。
- `scripts/check-worker-codex-auth.ps1` 现在会区分：
  - `shared-refresh`：多个 profile 指向同一个真实 auth 文件路径，这是预期共享。
  - `copied-refresh`：多个 profile 的 refresh token 一样，但落在不同真实文件路径，
    这是危险的复制冲突。

### 权限边界没有放松

- 这次只是修复认证存储方式，不是把高低权限合并。
- 低权限和高权限仍然各自保留独立的 profile home、Skill、workspace 路由、toolset、
  connector 注入和运行边界。
- 改变的是 OAuth 凭据存储模型，不是 Hermes Mobile 的权限模型。

### 部署与验证

- 部署方不应该再把同一份 `auth.json` 手工复制到多个 Gateway profile 目录中。
- 如果需要检查当前生产是否仍有危险副本，可以运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-worker-codex-auth.ps1
```

- 低权限 Gateway 正常共享时，检查结果应显示 `shared-refresh`，并且所有
  `lowgw1..10` 的 `auth_path` 都指向同一个真实 auth 文件路径。
- 这次修复不要求修改官方 Hermes 源码；所有变更都在 Hermes Mobile 的启动脚本、
  运行时编排和检查脚本层完成。
- 私库源树验证通过：
  - `npm run check`
  - `npm run productization:check`
  - `git diff --check`
- 生产 Gateway Pool 重启后验证通过：
  - `lowgw1..10` 均指向同一个低权限共享 auth 文件
  - `officialclean1..2` 均指向同一个 Owner-maintenance 共享 auth 文件
  - 低权限直连 smoke：`lowgw3`、`lowgw6` 完成成功
  - 高权限直连 smoke：`officialclean1` 完成成功

### 已知边界

- 本次没有把 low tier 与 owner-maintenance tier 合并成跨运行时的一套共享 auth。
  当前仍然是“低权限一套、高权限一套”，这样可以保持两个运行时边界清晰。
- public 仓只包含产品源码与公共脚本，不包含任何运行时 token、密钥、Access Key、
  push endpoint、日志、数据库、用户文件或部署目录状态。
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
- [Kanban-backed Todo integration](docs/KANBAN_TODO_INTEGRATION.md)
- [Local workspace root migration](docs/LOCAL_WORKSPACE_ROOT_MIGRATION.md)
- [Public export checklist](docs/PUBLIC_EXPORT_CHECKLIST.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

Hermes Mobile is released under the MIT License. See [LICENSE](LICENSE).
