# Changelog

## Unreleased

- Add a mandatory low-permission Gateway pre-flight Skill for Hermes Mobile
  permission-boundary checks before filesystem, Skill, automation, account,
  integration, or delivery-path operations.

## 2026-05-11 Public Update

Public export source commit:
`84e1ca14e92bebe06394bc30f0b719d979682b91`

### 本次公开更新包含的主要内容

- 官方 Hermes Kanban 已接入 Hermes Mobile Todo / 看板层，新增 `adapters/kanban-provider.js`，并补充移动端状态切换式看板 UI。
- 单窗口聊天历史改为分页加载，聊天/群聊切换移到页头，修复群可见性、未读计数与多机移动端底部占位问题。
- 低权限 Gateway 恢复 Web Search、自动化任务、工作区文件读取、本人 Skill 修改，以及 Hermes Mobile 看板执行链路。
- Gateway Pool 的 Codex OAuth 认证从“多 profile 复制同一份 token”改为“同一运行时内共享同一 auth store 与 auth.lock”。

### Gateway Codex 认证共享修复

- 修复 Gateway Pool 错误复制 `auth.json` 导致的 Codex refresh token 重用冲突。
- 低权限 `lowgw1..10` 改为共享同一套低权限运行时 `auth.json` 与 `auth.lock`，不再为每个 profile 保留独立复制副本。
- Owner maintenance `officialclean1..2` 也改为在 Owner 运行时内部共享同一套 `auth.json` 与 `auth.lock`。
- 这样做的目标是“一次登录，按运行时安全共享”，而不是“多 profile 复制同一个 token”。

### 启动链路修复

- `configure-low-gateways.sh` 现在默认生成共享 auth 布局。
- `start-gateway-pool.ps1` 现在确保生产的 `start-low-gateways.sh` 会在拉起 worker 前执行 `configure-low-gateways.sh`。
- 如果共享根 auth 比现有 lowgw profile auth 更旧，迁移脚本会自动提升最新的那一份，用于完成首次切换。

### 诊断能力改进

- `check-worker-codex-auth.ps1` 现在区分：
  - `shared-refresh`：多个 profile 指向同一真实 auth 文件，属于预期共享。
  - `copied-refresh`：多个 profile refresh token 相同但真实路径不同，属于危险副本。

### 验证

- public repo 通过：
  - `npm run check`
  - `node scripts/privacy-scan.js --root . --all-files`
  - `git diff --check`
- private/production 已验证：
  - `npm run productization:check`
  - `lowgw1..10` 共用同一低权限 auth store
  - `officialclean1..2` 共用同一 Owner-maintenance auth store
  - `lowgw3`、`lowgw6`、`officialclean1` 直连响应 smoke 成功
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
