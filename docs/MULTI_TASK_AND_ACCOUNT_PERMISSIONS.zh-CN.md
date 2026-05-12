# 多任务体系与多账户权限控制

本文档说明 Hermes Mobile 的多任务、Gateway 调度、多账户访问控制和低权限执行边界。目标是让 public release 的安装者理解产品安全模型，并能按同一原则部署自己的环境。

## 设计原则

Hermes Mobile 是用户界面、账号体系、任务队列和权限策略层；官方 Hermes Gateway 是模型运行、工具调用、Skill、记忆、会话、事件和 artifact 的执行内核。

核心原则：

- 普通用户只能看到和操作自己的工作区。
- 普通用户的聊天、任务、自动化触发运行默认走低权限 Gateway。
- Owner 可以管理全局配置和用户工作区，但 Owner 的普通聊天/任务也默认走低权限 Gateway。
- 高权限 Gateway 只用于显式 Owner 维护场景，不参与普通用户运行。
- Hermes Mobile 不直接调用 Codex/OpenAI 来绕过 Gateway，也不修改官方 Gateway 源码来实现产品权限。
- 所有部署特定路径、密钥、worker manifest、账号映射和外部集成都必须来自运行配置或 adapter，不能写入 public source。

## 运行对象

Hermes Mobile 将用户交互统一成以下运行对象：

- **聊天消息**：单窗口聊天中的用户消息和 assistant 回复。
- **任务消息**：目录、项目、自动化或外部入口创建的后台/前台任务。
- **自动化运行**：由 Automation/CRON provider 触发，最终仍进入相同的 Gateway 调度和 artifact/交付边界。
- **外部入口事件**：例如可选的 Weixin/iLink sidecar 事件，先映射到 workspace，再创建 Hermes Mobile 任务。

无论入口来自浏览器、任务列表、目录、自动化还是 sidecar，进入模型运行前都必须解析出一个 `actorWorkspaceId`，并基于该 workspace 生成访问策略。

## 多任务队列

Hermes Mobile 在 Gateway run 创建前处理产品层队列和并发限制。

### 单窗口聊天

单窗口聊天保持串行语义。同一个聊天窗口中，如果已有 assistant 消息处于 running 状态，后续消息先排队；排队消息被提升为 active 时再重新检查并发限制和 workspace 权限。

### 任务和自动化

任务列表、目录任务、自动化任务和外部入口任务共享同一个 run 生命周期：

1. 认证请求。
2. 解析目标 workspace、thread、project 或 task directory。
3. 生成 workspace-scoped access policy。
4. 检查全局和单 workspace 并发限制。
5. 选择低权限或 Owner-maintenance Gateway。
6. 创建官方 Hermes Gateway run。
7. 流式保存事件、usage、artifact 和最终消息。
8. 通过 Web Push、前端 SSE、任务列表和预览路由展示结果。

### 并发限制

部署可设置：

- `HERMES_WEB_MAX_ACTIVE_RUNS`
- `HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE`

`0` 表示对应维度不限流。达到限制时，Hermes Mobile 应在创建 Gateway run 之前拒绝请求，避免产生不可见的 Gateway backlog。

### Stale run 处理

如果 Hermes Mobile 重启后无法继续持有某个 stream，系统应通过原 run 所属 Gateway 做 liveness/stop 检查。若 Gateway 不再持有该 run，Web 消息标记为 stale/failed 并释放队列；不能把一个已创建的 run 猜测转移到其他 Gateway。

## Gateway Pool 调度

Gateway Pool 是 Hermes Mobile 的产品调度层。Manifest 中的 worker 只提供非秘密路由元数据和运行时连接信息；worker API key 只能在内存请求中使用，不能写入消息、SQLite、前端 payload、日志或文档。

Worker 至少分为两类：

- `securityLevel=user`：普通用户和 Owner 普通任务使用的低权限 Gateway。
- `securityLevel=owner-maintenance`：只允许显式 Owner 维护模式使用的高权限 Gateway。

普通用户 run 必须选择 `securityLevel=user` worker。若没有健康的 user worker，应 fail closed，而不是回退到高权限 worker。

Owner-maintenance worker 必须同时满足：

- 请求来自 Owner。
- 请求被显式标记为维护场景。
- 部署启用了 Owner maintenance routing。
- worker manifest 声明 `allowMaintenance=true`。

## Skill Profile 路由

Hermes 的 Skill 发现、创建和更新仍由官方 Gateway profile 负责。Hermes Mobile 不复制或改写官方 Gateway 的 Skill 机制，而是在创建 run 前选择合适的 Gateway profile：

- Owner 普通聊天/任务可以路由到带完整 Owner Skill 集合的低权限 profile。
- 普通 workspace 用户应路由到只挂载该 workspace 私有 Skill 和管理员批准共享 Skill 的低权限 profile。
- 不同 workspace 的私有 Skill 不应混在同一个 Gateway profile 中，除非部署明确接受共享 Skill 集合。
- `skillProfile` 是给管理员和诊断使用的非秘密标签。
- `skillWorkspaceIds` 声明该 worker 的 Skill 集合服务哪些 workspace；`["*"]` 只适合真正共享且无用户私有 Skill 的 profile。

低权限 Gateway 可以读写当前账号/工作区自己的 profile-local Skill。这个能力只作用于当前 `skillProfile` 对应的 Skill store，不等同于写共享 Skill。共享、系统、Owner full 或其他账号的 Skill 变更仍属于 Owner 提权场景。

低权限 Gateway 的普通工具能力按“当前账号/当前工作区/当前授权根”来判断，而不是按历史上的极窄固定白名单来判断。公开信息查询、天气、授权目录内文件与视觉/OCR、图片生成、当前会话或当前工作区的消息投递、语音生成、看板、自动化、记忆和会话检索，只要实际 Gateway profile 暴露了对应函数且目标不越过当前账号/工作区边界，就属于普通低权限能力。

低权限 Gateway 也可以读写当前 run 授权目录内的普通文件，并可以调用由授权目录内规则文件声明、只作用于当前账号/工作区的 Program API。例如衣橱规则文件声明的同 owner `sync:read`、`items:read`、`history:write` 属于普通业务能力；跨账号、维护类、源代码/运行时配置、密钥管理或未在授权目录内声明的私有 API 仍需 Owner 提权。

Hermes Mobile 的默认模式是 `HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING=auto`：旧 manifest 没有 `skillProfile` / `skillWorkspaceIds` 时继续保持兼容；一旦 manifest 声明这些字段，普通聊天/任务会按当前 `actorWorkspaceId` 匹配 `skillWorkspaceIds`。生产或强隔离部署应设置为 `on`，这样缺少匹配 Skill profile 的普通 run 会 fail closed，而不是落到不确定的共享 Skill 集合。

这使 public release 可以保持通用：安装者可以先用单 Gateway 或传统 worker pool 起步；需要多账户 Skill 隔离时，只调整运行时 manifest 和每个 Gateway profile 的 Skill 根目录，不需要修改官方 Hermes 源码。

## 多账户模型

Hermes Mobile 的账户模型由两个层次组成：

- **Owner**：安装者或管理员账号。Owner 可以创建/编辑本地 workspace、生成/revoke workspace Access Key、查看运行配置和系统状态。
- **Workspace 用户**：普通账号。每个 workspace key 只绑定一个 `workspaceId`。

普通用户认证后，服务端只能把该用户映射到自己的 `workspaceId`。普通用户不应收到其他 workspace 的列表、Access Key 状态、运行配置、manifest 路径、worker URL、密钥路径或外部集成明细。

## Workspace 访问规则

所有用户可见 API 都应遵守以下规则：

- Owner 可以访问所有 workspace。
- 普通用户只能访问 `auth.workspaceId` 等于目标 workspace 的资源。
- 如果请求体伪造其他 `workspaceId` 或 `actorWorkspaceId`，服务端必须拒绝或回落到认证用户自己的 workspace。
- Group chat 是显式例外：只有 group 成员可以读写该 group thread，且 artifact/交付仍按 group ACL 校验。
- Shared directory 是显式例外：只有被共享给目标 workspace 的目录可见；只读共享不得执行写操作。

这意味着低权限 Gateway worker 可以作为共享 worker 池服务多个 workspace，但每个 run 的 `access_policy_context` 必须只包含该次发起用户的 workspace roots、delivery roots、cache roots、toolsets 和共享目录。

## Access Key 控制

Public release 应包含以下行为：

- First-run 创建 Owner Access Key，明文只显示一次。
- Owner 可为每个 workspace 创建、替换和 revoke Access Key。
- Workspace Access Key 只授予对应 workspace 的浏览器/API 权限。
- 普通用户不可查看、修改或 revoke 其他用户的 Access Key。
- 普通用户不可查看 Owner runtime config、Gateway key path、VAPID private key path、worker manifest path 或外部 OAuth/token 状态。
- 服务端和前端都不能显示 raw Access Key、API key、VAPID private key、OAuth token 或 push endpoint。

## 文件与目录权限

每个 workspace 应有自己的默认文件根，并可配置允许目录。Hermes Mobile 的目录、预览、上传、删除、artifact 和交付路由都必须经过同一 workspace ACL。

要求：

- 目录列表只返回当前用户可访问的 root/project/share。
- 上传、创建目录和删除文件必须基于 thread/workspace 解析路径。
- 上传不能默认覆盖已有文件。
- 删除必须显式且非递归；workspace 根、同步根、下载根、allowed-root 根目录应受保护。
- Artifact 预览必须通过 thread/message/group ACL 校验。
- 自动化 deliverable 预览必须确认文件来自该自动化授权的输出或交付路径。

## 生成文件与交付边界

任务和聊天生成的文件应分清源文件和交付文件：

- Markdown (`.md`) 是默认最终文档交付格式，适用于聊天、任务、群聊和自动化运行。Hermes Mobile 内部预览应把 Markdown 渲染为 HTML，而不是要求模型为了预览额外生成 PDF。
- PDF、Word、Office、图片、媒体等格式只在用户明确需要外部转发、打印、可编辑 Office、非 Markdown 媒体或指定格式时生成。
- 系统转发 Markdown 交付物时，不应默认转发原生 `.md` 文件；应由 Hermes Mobile 提供导出/分享选择，例如 HTML、Word-compatible、打印/另存 PDF，原始 Markdown 只作为明确选择。
- 交付文件路径必须通过 `MEDIA:<absolute_path>` 或等价 artifact 元数据进入 Hermes Mobile 预览与投递流程。

该边界适用于聊天、任务、group chat 和自动化运行。

## Codex 与开发工具权限

普通用户低权限 run 默认不允许调用 Codex 委托、shell、terminal、git 或 source 级工具。Hermes Mobile 的 security boundary 应：

- 强制普通 run 的 `can_delegate_codex=false`。
- 强制普通 run 的 `allow_shell=false`。
- 从 `allowed_toolsets` 中过滤 `codex`、`shell`、`terminal`、`cmd`、`powershell`、`bash`、`git`、`developer`、`source`、`process`、`code_execution`、`delegation`、`mcp` 等开发或跨边界工具集。
- 当普通 run 的 policy 没有显式 `allowed_toolsets` 时，Hermes Mobile 必须写入自己的安全默认工具集，而不能依赖 Gateway 的默认 restricted toolsets。默认集合只应包含普通任务能力，例如 `web`、`weather`、`file`、`vision`、`image_gen`、`messaging`、`tts`、`skills`、`todo`、`kanban`、`cronjob`、`memory`、`session_search`、`clarify`。`file` 只表示授权 roots 内的文件能力。`vision` 只表示授权 roots 内图片、PDF 或文档的 OCR/视觉解析能力，不表示可搜索任意磁盘。`image_gen` 只表示当前账号请求的图片生成/编辑，并且输出必须落在授权目录或交付目录内。`messaging` 只表示当前会话、当前 workspace 投递通道或明确属于当前任务范围的收件人；不得发送到无关收件人或承诺付款/订单/隐私事项。`tts` 只表示当前账号请求的语音生成，并且输出必须落在授权目录或交付目录内。`skills` 只表示当前账号/工作区自己的 profile-local Skill 能力；共享/系统/跨账号 Skill 变更仍需 Owner 提权。`cronjob` 只表示当前账号/工作区自己的自动化任务能力；跨账号自动化管理仍需 Owner 提权。
- 将这些工具集加入 `blocked_toolsets`。
- 过滤受保护路径，包括源代码目录、运行配置、密钥文件、SQLite/JSON 状态、worker manifest、Hermes home、token 文件和 operator-only 目录。

自然语言意图识别只能用于提前提示 Owner “这可能需要提权”，不能作为唯一权限边界。没有被识别出来的越权请求，也必须在 `access_policy_context`、Gateway worker toolsets 和 Hermes Mobile API ACL 这三层 fail closed。

如果某个 deployment 未来需要“用户只能在自己 workspace 内使用 Codex”，应实现为 Hermes Mobile 侧的受限 adapter 或独立 sandbox：

- 固定 cwd 到该用户 workspace。
- 文件系统 sandbox 只允许该 workspace 和明确共享目录。
- 禁止访问产品源码、运行配置、密钥、其他用户 workspace 和 operator home。
- 仍然不修改官方 Gateway 源码。

在默认 public release 中，不应为普通用户启用 developer toolsets。

## Owner 维护模式

Owner 维护模式用于部署维护、诊断、迁移或 public release 准备，不是普通聊天能力。

建议约束：

- UI 上应与普通聊天/任务明显区分。
- 需要显式开关启用。
- 使用 `owner-maintenance` worker。
- 不向普通 workspace 用户暴露。
- 所有涉及密钥、路径、worker manifest 和本地部署状态的信息只返回给 Owner。
- 不把维护 run 的私有路径或配置写入 public docs、public export 或普通用户可见消息。

## Web Push 与实时刷新

Hermes Mobile 可以通过 SSE 和 Web Push 同步任务状态：

- 当前打开的 thread 应在收到 run 终止、消息更新或通知点击后刷新。
- Web Push payload 不应包含敏感内容、密钥路径、worker URL 或 raw artifact path。
- 通知深链只作为重新打开 thread/task 的提示，实际内容仍通过认证 API 读取。

## Usage 与遥测

Usage 显示属于诊断信息，不是权限来源。

要求：

- 优先使用 Gateway 返回的 usage 字段。
- 如果 Gateway 响应缺少 cached token、API calls 或 cost，可通过只读 telemetry adapter 读取官方 Gateway profile 数据库。
- Telemetry adapter 只能补齐汇总字段，例如 cached input、API calls、cost 状态；不应暴露 per-call secret、原始请求、token 或本地 profile 路径给普通用户。
- 普通用户只能看到自己消息/任务的 usage。
- Owner 可查看系统健康和非秘密 worker 统计，但仍不能在浏览器中看到 raw key。

## Public Release 要求

Public release 应满足：

- 官方 Hermes Gateway 源码保持 clean/upgradable。
- 产品权限逻辑位于 Hermes Mobile core、adapter 或部署配置中。
- public export 不包含 `.agent-context/`、operator instruction、runtime state、日志、uploads、数据库、密钥、tokens、push endpoints、worker manifest secrets、私有 clone URL 或本地绝对路径。
- README 和 docs 只描述通用配置名、示例路径和安全原则。
- 默认配置不启用 unrestricted access、developer toolsets 或普通用户 Codex 委托。
- Gateway Pool manifest 示例不得包含真实 API key。
- public README 必须说明 Owner、workspace key、低权限 worker、Owner maintenance worker 和 process isolation 的关系。

## 验收清单

发布前至少验证：

- Owner first-run setup 可创建 Owner key，明文只显示一次。
- Owner 可以创建 workspace、生成 workspace key、revoke key。
- 普通用户登录后只看到自己的 workspace、threads、tasks、directories、todos 和 automations。
- 普通用户请求其他 workspace 的 API 返回 403 或等价拒绝。
- 普通用户无法打开 Access Key 管理、runtime config、worker manifest 或外部集成详情。
- 普通用户聊天/任务选择 `securityLevel=user` worker。
- 没有健康 user worker 时，普通用户 run fail closed。
- Owner 普通聊天/任务仍选择 user worker。
- Owner maintenance run 只有显式维护模式才选择 `owner-maintenance` worker。
- 普通 run 的 access policy 不包含源码、密钥、运行配置、其他用户 workspace 或 operator home。
- 普通 run 不允许 `codex`、`shell`、`terminal`、`git`、`source` 等 developer toolsets。
- Artifact、目录预览、上传、删除和自动化 deliverable 预览都按 workspace/thread/group ACL 校验。
- Usage 只显示当前用户可访问消息的汇总字段。
- `npm test`、`npm run productization:check`、privacy scan 和 clean public export 均通过。
