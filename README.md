# Home AI

Home AI is the repository/project name for a mobile-first private family AI
center built on local Hermes Gateway runtime capabilities. The installed app visible brand is Home AI. It is separate from the official Hermes
dashboard and does not use the dashboard terminal/PTY chat surface as its
product model.

This repository contains the public Home AI product source. Keep
deployment-specific secrets, runtime data, generated reports, logs, uploads,
tokens, push endpoints, and adapter configuration outside the source
checkout.

## Documentation Map

For non-trivial development, debugging, deployment, or production repair, start
with [docs/DOCS_INDEX.md](docs/DOCS_INDEX.md). The index points to the current
architecture, product rules, module docs, runbooks, route/auth reference,
frontend state map, data dictionary, Gateway manifest reference, installation
checklist, screenshot debug map, and test matrix.

High-value entry points:

- Route/auth ownership: [docs/API_ROUTE_REFERENCE.md](docs/API_ROUTE_REFERENCE.md)
- Frontend file map: [docs/FRONTEND_STATE_MAP.md](docs/FRONTEND_STATE_MAP.md)
- SQLite tables: [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md)
- Gateway Pool manifest: [docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md](docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md)
- Public install checks: [docs/PUBLIC_INSTALLATION_CHECKLIST.md](docs/PUBLIC_INSTALLATION_CHECKLIST.md)
- Screenshot triage: [docs/SCREENSHOT_DEBUG_MAP.md](docs/SCREENSHOT_DEBUG_MAP.md)
- Focused tests: [docs/TEST_MATRIX.md](docs/TEST_MATRIX.md)

## 1.0 Scope

- Mobile chat, task list, directory, todo, automation, and group chat views.
- Streaming Hermes Gateway runs with usage/model/reasoning display.
- Directory-bound task creation and file/artifact preview.
- Workspace-scoped Access Keys and Owner-managed local workspaces.
- Runtime Gateway and Web Push configuration from the Owner UI.
- Optional Gateway Pool scheduling with workspace-aware worker selection.
- Retired Weixin/iLink ingress notes are retained only for historical context;
  Home AI is the maintained communication surface.
- Markdown-first deliverables: generated documents default to Markdown, render as
  HTML in the app, and offer explicit PDF, Word-compatible, HTML, copy, or raw
  Markdown export/share actions.
- Installable PWA shell with static version checks, distinct app icons, and local
  font-size preferences.

## 1.0.3 Public Release

This release refreshes the public tree from the current Home AI source and
keeps the package metadata aligned with the public `v1.0.3` release tag.

Highlights:

- Stabilizes the global plugin Dock and pinned bottom tabs across cold PWA
  restarts that reopen directly into an embedded plugin.
- Keeps pinned plugin icons out of the plugin drawer while preserving
  server-backed manual Dock order and pinned bottom-tab order per workspace.
- Simplifies plugin-topic detail navigation by removing the plugin-topic
  dropdown and keeping the active delivery directory as the visible topic chip.
- Improves plugin-context back/right-swipe behavior so returning from plugin
  topics restores the topic root without polluting ordinary topic-list caches.
- Adds Email content MCP support for bounded message-body and attachment-content
  reads through the Email plugin instead of synthetic fallback text.
- Hardens macOS Gateway cold-start checks, worker secret-file access audits,
  Grok OAuth metadata diagnostics, and Codex shared-auth deployment gates.
- Productizes recent public-safe deployment constraints so fixes remain
  runnable from a fresh public deployment rather than depending on private
  machine state.

Validation for this public release:

- `npm test`
- `npm run productization:check`
- `npm run privacy:scan`
- `git diff --check`
- public export privacy scan
- focused production smoke evidence from the source deployment before export

## 2026-06-26 Public Update

This update refreshes the public tree from source commit
`0dbebeaf0d2f548feeaa34a241698785e8578392` and advances the static
client/cache identity to `20260627-action-inbox-dispatch-v956`.

Highlights:

- Adds a central in-app dialog contract for Home AI and plugin workspaces:
  product UI must use DOM-rendered dialogs, sheets, forms, toasts, or status
  rows instead of browser-native `alert`, `confirm`, or `prompt`.
- Adds the Home AI host dialog runtime helpers
  `openAppConfirmDialog`, `openAppPromptDialog`, and `openAppMessageDialog`.
- Migrates host confirmation, text-input, and message dialogs in directory,
  Action Inbox, Kanban/card actions, push settings, workspace admin, platform,
  learning, and thread-card surfaces to in-app UI.
- Adds `tests/no-browser-native-dialogs.test.js` as the executable guard for
  Home AI runtime UI and an optional adjacent-plugin audit mode for routing
  plugin-owned follow-up work.
- Keeps the public export privacy scan compatible with GitHub SSA safety tests
  by avoiding literal private-key block markers in source test strings.

Validation for this public update:

- `npm run check`
- `node tests/no-browser-native-dialogs.test.js`
- `node tests/static-cache-version-harness.test.js`
- `node tests/architecture-code-test-harness-map.test.js`
- `node tests/task-list-ui.test.js`
- `node tests/app-action-inbox-ui.test.js`
- `node tests/directory-delete-ui.test.js`
- `node tests/github-shared-source-account-script.test.js`
- `npm run privacy:scan`
- `git diff --check`
- public export privacy scan

Known validation note:

- `npm test` and `npm run productization:check` both reached the macOS fresh
  install rehearsal and failed at the privileged
  `install-gateway-launchd-services` phase in the local test root. The failure
  is an operator/launchd application boundary, not a browser-dialog runtime
  regression.

## 2026-06-21 Public Update

This update refreshes the public tree from the current Home AI source. The
exact source commit is recorded in `.public-export-report.json`.

Highlights:

- Bumps the static client cache version to
  `20260621-android-cache-refresh-v904` so Android WebView clients do not stay
  pinned to the previous v903 static bundle.
- Includes the v903 Android navigation fix that hides active embedded plugin
  iframe hosts before deferred primary-view loading when leaving Music or other
  plugin surfaces.
- Publishes the Android native shell update manifest and debug APK metadata for
  `0.4.16` / `versionCode=20`.
- Expands the guided macOS installer so safe non-privileged phases can run in
  one guided pass while privileged and live-runtime phases remain explicit
  operator steps.
- Bounds local disaster-backup receipts to a default three-day retention window
  while keeping the recoverable backup as the remote NAS/SSH `current` tree.
- Records the current anti-drift deployment closure in public-safe docs and
  keeps private runtime state, credentials, uploads, logs, and handoff files out
  of the public tree.

Validation for this public update:

- `node tests/install-macos-production.test.js`
- `node scripts/public-install-preflight.js --source-only --json`
- `node scripts/macos-install-verification-classification.js --json`
- `node tests/macos-fresh-install-rehearsal.test.js`
- `node tests/macos-install-operator-closure-checklist.test.js`
- `node --check public/app-wire-start-ui.js`
- `node --check public/app-plugin-topics-ui.js`
- `node --check public/app-api-client.js`
- `node --check public/service-worker.js`
- `node tests/task-list-ui.test.js`
- `node tests/static-cache-version-harness.test.js`
- `node tests/app-api-client.test.js`
- `node tests/thread-state-ui-behavior.test.js`
- `node tests/same-window-navigation-harness.test.js`
- `node tests/mobile-bottom-region-layout.test.js`
- `node tests/macos-disaster-backup-script.test.js`
- public export privacy scan
- production static deploy smoke from the source deployment before export

## 2026-06-17 Public Update

This update refreshes the public tree after the current mobile Home AI shell
stability pass. The exact source commit is recorded in
`.public-export-report.json`.

Highlights:

- Stabilizes rapid bottom-tab switching by making bottom navigation taps take
  priority over delayed plugin Dock layout refreshes.
- Reduces pinned plugin bottom-tab flicker during fast mobile tab changes.
- Keeps the Inbox `待办` filter limited to manually created Todo/reminder rows;
  automation reports and delivery notifications stay in the non-Todo attention
  queue.
- Adds a controlled directory content-move API used by plugin-bound directory
  migrations without copying runtime data into Git.
- Preserves the public install/update contract: runtime secrets, profile data,
  uploads, generated reports, and local handoff files remain outside the public
  source tree.

Validation for this public update:

- focused static UI/navigation tests
- public export privacy scan
- production static deploy smoke from the source deployment before export

## 1.0.2 Public Release

This release refreshes the public tree from the current Home AI source and
keeps the package metadata aligned with the public `v1.0.2` release tag.

Highlights:

- Fixes Grok/XSearch routing when the live `grokgw1` port is derived from the
  Gateway Pool manifest instead of the legacy fixed port.
- Keeps ordinary no-provider runs on OpenAI Gateway workers unless Grok is
  explicitly requested.
- Adds run-liveness convergence so repeated Gateway 404/lost-run states fail
  and release the UI instead of leaving the app in `running` indefinitely.
- Adds the native Growth learning board, teaching-card flow, learning workflow
  contract/harness docs, and focused Growth tests.
- Adds Action Inbox as the user action surface for automation conclusions,
  todos, approvals, and passive completion notifications.
- Improves Automation/Grok proxy routing, automation refresh behavior, and
  automation detail deletion handling.
- Includes weather Gateway plugin packaging and public deployment notes.
- Tightens public export privacy checks and removes local-machine paths from
  public-facing release artifacts.
- Fixes cross-platform path handling in the ChatGPT Pro bridge tests so public
  CI passes on Linux while preserving Windows deployment paths.

Validation for this public release:

- `npm.cmd run productization:check`
- public export privacy scan
- public repository CI for `v1.0.2`

## 2026-05-28 Public Update

This update refreshes the public tree from the current Home AI source.
The exact source commit is recorded in `.public-export-report.json`.

Highlights:

- Adds Growth learning-card image sharing and simplifies Growth card detail
  layout for mobile reading.
- Improves run-status UI history, stream terminal recovery, toolset escalation,
  and mobile status popover behavior.
- Tightens Action Inbox low-click flows: automation deliverables can be opened
  directly, status actions use compact badges, manual Todo legacy Kanban links
  are suppressed, and Inbox detail now reuses the same compact status/action
  control as the list.
- Hides Kanban-generated case-topic groups from the root topic list; their
  evidence stays reachable from Growth, Todo/Kanban, Inbox source links, or
  explicit direct routes instead of mixing with ordinary topics.
- Stabilizes Gateway profile ordering so dedicated Grok profiles keep their
  intended position when additional user workspaces are added.
- Adds task-terminal Web Push duplicate-send prevention and expands the
  public harness rules for Web Push, Action Inbox, topic navigation, Gateway
  toolset selection, and startup scripts.

Validation for this public update:

- `npm.cmd run productization:check`
- `node scripts/privacy-scan.js`
- `node tests/public-export.test.js`
- public export privacy scan

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
  - 启动 WSL `HermesGatewayWorker` lowgw pool 和可选 `grokgw1`。
  - 启动 Hermes Mobile listener。
  - 检查 `/api/status`、真实 callable schema、Grok/xAI worker、auth realpath、SQLite integrity。
- 看板卡片详情支持回执/过程、Markdown HTML preview、响应式回执字体和更均衡的 Worker 分配。
- Weixin / Mobile ingress 已退役；`weixin_*` 仍只是历史工作区 ID 命名。

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
to Hermes Mobile but will not have production workers or the dedicated
`@Grok4.3` worker unless the single Gateway was already configured for xAI.

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

For NAS deployments, a single fixed `nas-local-codex` worker manifest can make
ordinary chat run, but it is not equivalent to the maintained Windows hybrid
Gateway Pool. It has no Owner warm-worker baseline, no elastic expansion, and
no per-provider/per-workspace worker capacity. If a NAS install must behave
like the reference Windows production environment, connect it to a validated
external Gateway Pool or implement a NAS-native worker launcher; do not present
the single-worker bridge as production parity. See
`docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`.

For Windows production, copy the script entrypoints from this repo into the
runtime app/gateway-worker directories as described in the deployment runbook.
The operational restart paths are script-owned: use `start-worker-host.ps1`
with `-ReplaceExisting` for the listener/bridge host, `start-gateway-pool.ps1`
or the `Hermes Mobile Gateway Pool` scheduled task for Gateway workers, and
`start-cron-tick-sidecar.ps1` with `-ReplaceExisting` for the cron dispatcher
sidecar.
Do not restart production by killing arbitrary `node`, `python`, or `wsl`
processes without first checking active runs.

### Grok / xAI Worker

Hermes Mobile supports `@Grok4.3` by routing those runs to an official Hermes
Gateway profile whose provider is `xai-oauth`. In the Windows production
runbook, that worker is `grokgw1` on port `18761` by default.

This repository does not include xAI OAuth state, Codex auth, API keys, or any
other credential seed. A production Gateway Pool manifest must include a worker
such as `profile=grokgw1`, `provider=xai-oauth`, and `securityLevel=user`; the
target machine must also complete the official Hermes/xAI OAuth setup for that
profile. If `@Grok4.3` is visible but calls fail with authentication errors, fix
the `grokgw1` Gateway profile/auth store and restart the Gateway Pool; do not
work around it by routing Grok requests to ordinary lowgw workers.

## Runtime Data

Runtime files live under `HERMES_WEB_DATA_DIR`. On fresh installs, the Owner's
default file root is `drive/` under that data directory. Access Key hashes,
workspace config, runtime config, local Todo state, optional local Automation
test/migration state, SQLite databases, Web Push state, uploads, and generated
artifacts should remain outside Git.

For SQLite-backed installs:

```dotenv
HERMES_WEB_SERVICE_STORE=sqlite
HERMES_WEB_DB_PATH=workspace/hermes-web/hermes-mobile.sqlite3
```

SQLite mode stores threads, messages, artifacts, Web Push state, and local Todo
service rows in one database while still writing `state.json` snapshots for
rollback. SQLite Automation rows are for explicit local test/import work only;
production Automation jobs are owned by official Hermes CRON.

## Optional Features

- **Todo / Kanban:** defaults to local JSON under `HERMES_WEB_DATA_DIR`;
  `HERMES_WEB_TODO_BACKEND=kanban` maps the mobile Todo tab to official Hermes
  Kanban boards while preserving the `/api/todos` compatibility surface.
- **Automation:** defaults to official Hermes CRON through the Home AI
  Automation API. The API is the product/access-control projection layer over
  the canonical scheduler; local JSON/SQLite Automation is only for focused
  tests, local experiments, or explicit import/migration work.
- **Web Push:** configure VAPID key file path and subject from the Owner runtime
  panel or with environment variables.
- **Weixin/iLink ingress:** retired. Historical `weixin_*` workspace ids remain
  valid workspace identities only.
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
- `HERMES_WEB_AUTOMATION_BACKEND` normally stays on `hermes_cron`;
  `HERMES_WEB_AUTOMATION_STORE_PATH` is for explicit local Automation
  test/import mode only
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
npm run export:public -- --out workspace\public-export\Home-AI-Public-smoke --force
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
- [Retired Weixin ingress notes](docs/WEIXIN_INGRESS.md)
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
