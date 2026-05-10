# Changelog

## Unreleased

- 暂无未发布变更。

## 2026-05-10 Public Update

本次 public export 对应私库源提交
`28cd114fa6f6478c6cc7e23fed717ba58bd3111e`，主要修复低权限 Gateway 在同账号
外部连接器、Google Workspace 工具运行时和重启恢复方面的问题。

### 权限边界

- 低权限 Gateway 的运行策略现在会保留同一 workspace 已授权的外部连接器能力，
  包括 Google Workspace、Gmail、Outlook/Hotmail 等 profile/toolset 映射。
- 该授权只覆盖“当前账号自己的外部连接能力”。它不会授予其他账号的邮箱、网盘、
  自动化、Access Key、Owner 管理接口或维护型 Gateway profile。
- 普通低权限运行仍会过滤开发者/维护类能力，例如 terminal、代码执行、delegation、
  git、cron 管理、source 访问和宽泛 MCP 能力。
- 新增的权限边界 Skill 会要求模型在执行文件、Skill、自动化、账号、外部连接器、
  交付路径等操作前进行自检；如果当前权限不足，应提示需要 Owner 授权或直接拒绝，
  而不是继续尝试并产生误导性结果。

### 外部连接器与 Google Workspace

- workspace 绑定现在会从 `connector_profiles` 推断外部连接能力，也会从已配置
  toolset 反推 connector profile，避免 App 侧显示已授权但 Gateway 侧拿不到能力。
- 低权限 Gateway Pool 启动时会自动 provision Owner 同账号外部连接器到对应 profile，
  并重新建立必要的 profile-local 链接。
- Google Workspace Skill 的脚本现在优先读取 `HERMES_GOOGLE_PROFILE_HOME` 指向
  的 profile 本地目录，避免回退到共享 Hermes home 后误报 token 缺失或读错凭据。
- 当系统 Python 没有 Google API 依赖时，Google Workspace Skill 会切换到 Gateway
  runtime Python，避免因为基础环境缺依赖导致已授权账号仍不可用。

### 重启与部署恢复

- `scripts/start-gateway-pool.ps1` 会在启动低权限 Gateway 前补齐 profile 环境变量，
  包括 `HERMES_PROFILE` 和 `HERMES_GOOGLE_PROFILE_HOME`。
- `scripts/provision-worker-external-connectors.ps1` 的检查模式会验证每个低权限 profile
  的 Google Workspace setup 是否可用，便于部署者在重启后发现凭据或依赖问题。
- 这部分逻辑不修改官方 Hermes Gateway 源码；它只作用于 Hermes Mobile 的 Gateway
  Pool 启动、profile provisioning 和 public Skill/runtime 脚本。

### 验证

- 私库源树执行过 `npm run productization:check`。
- public export 过程执行了隐私扫描，确认没有导出 `.env`、runtime state、日志、
  uploads、raw key/token、push endpoint 或本地私有配置。
- 生产环境完成过低权限 profile Google Drive 只读 smoke，验证同账号 Google 工具
  可在 profile-local 凭据下启动。

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
