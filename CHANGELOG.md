# Changelog

## Unreleased

- Add a mandatory low-permission Gateway pre-flight Skill for Hermes Mobile
  permission-boundary checks before filesystem, Skill, automation, account,
  integration, or delivery-path operations.

## 1.0.4 - 2026-07-10

- Improve Home AI mobile startup by running independent bootstrap requests in
  parallel and preserving startup performance diagnostics.
- Add a lightweight mobile quick-login route for signed-out browsers, including
  a short-link entry point that does not persist credentials in source control.
- Make the service worker return a cached app shell after a 900 ms navigation
  stall while refreshing the cache from the network in the background.
- Preserve the complete v1.0.3 client surface while advancing the static client
  and cache version to `20260710-startup-performance-v1004`.
- Harden portable macOS deployment so a fresh machine can discover Homebrew
  Node/Python and the current ChatGPT-bundled Codex executable without relying
  on machine-specific cache paths.
- Extend deployment, startup, privacy, and UI contract tests for the new mobile
  startup and portable installation paths.

## 2026-05-12 Public Update

Public export source commit:
`12e0f987dadcb43cd13d7ab43957fe42b1ba3a16`

### 本次公开更新重点

- 低权限 Gateway 的实际 callable schema 与 Hermes Mobile 权限策略对齐：
  - 新增真实 `weather` 工具插件。
  - 新增受限 `http_request` 工具插件。
  - 低权限账号可在当前账号/工作区范围内使用 Web、HTTP、天气、文件、视觉、图片、消息、TTS、Skill、Todo/Kanban、CRON、memory、session search、clarify 等低风险工具。
- Gateway Pool 启动链路补齐：
  - 生成 worker base config，避免 profile config 有工具但真实 agent schema 没挂载。
  - 启动前先停止旧 `lowgw1..10`，避免磁盘配置已更新但旧进程继续占端口。
  - 低权限 Codex auth 改为同一文件系统下的 shared-auth，避免跨文件系统 atomic rename 失败。
  - 启动时检查并隔离 lowgw profile-local `state.db` / `response_store.db` 损坏或异常 sidecar。
- Windows public 部署补齐 Agent 可执行 runbook 与必要脚本：
  - `docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md`
  - `scripts/run-as-worker.ps1`
  - `scripts/start-low-gateways-child.ps1`
  - `scripts/start-low-gateways.sh`
- 看板和移动端 UX 更新：
  - 看板卡片详情支持回执/过程读取。
  - 回执优先展示，低价值 metadata 折叠。
  - Markdown 输出通过 HTML preview viewer 打开。
  - 回执字体按屏幕宽度分档适配。
  - 看板 Worker 分配避免全部落到一个 lowgw。
- Weixin / Mobile ingress public 脚本同步：
  - front Gateway 启动检查。
  - Mobile ingress bridge。
  - 避免恢复旧的 stale worker-pool 启动链。

### Public export 边界

- Public export 继续排除 `.agent-context`、`AGENTS.md`、runtime DB、logs、uploads、backups、Access Keys、OAuth/Codex auth、push endpoints、worker manifests with API keys。
- 私有事故复盘 `docs/LOW_GATEWAY_RUNTIME_INCIDENT_2026-05-12.zh-CN.md` 不导出到 public；公开仓只保留泛化后的 Agent Windows production deployment README。
- 本次仍不包含任何运行时用户数据、生产 secret、OAuth token、Web Push private key 或本机日志。

### 验证

- 私库源树通过：
  - `npm run productization:check`
  - GitHub Actions CI
- Public export 通过：
  - `npm test`
  - `node scripts/privacy-scan.js --root . --all-files`
  - `git diff --check`

## 1.0.0 - 2026-05-09

- First public release of Hermes Mobile.
- Mobile-first chat, task list, directory, todo, automation, group chat, and
  Markdown preview UI for a local Hermes Gateway.
- First-run Owner setup with workspace Access Keys and runtime Gateway/Web Push
  configuration.
- Local JSON or SQLite-backed product state with optional bridge backends for
  existing Todo and Automation deployments.
- Gateway Pool scheduling with workspace-aware worker selection, run limits,
  non-secret runtime status, and optional Skill profile routing.
- Markdown-first deliverables with in-app HTML preview and explicit export/share
  paths for PDF, Word-compatible, and raw Markdown formats.
- PWA shell with version checks, distinct Hermes Mobile icons, install guidance,
  and local font-size preferences.
- Clean public export workflow with privacy scanning and CI productization gate.
