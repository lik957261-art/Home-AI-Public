# Hermes Mobile 低权限 Gateway 普通工具策略

本文记录长期策略，不是线程交接。

## 结论

低权限 Gateway 不应再按历史上的极窄白名单运行。默认原则是：

- 只要工具作用于当前账号、当前 workspace、当前 run 的授权目录或当前会话，它就是普通低权限能力。
- 会跨 workspace、影响系统安全、修改产品/运行时、执行代码/命令、控制桌面或绕过 Hermes Mobile 调度的能力，默认不开放给普通低权限 Gateway。
- 权限摘要、Gateway profile config、`platform_toolsets.api_server`、profile-local plugin、模型侧 permission-boundary Skill 必须同时一致；只改其中一层不算完成。

## 默认普通能力

普通低权限默认应包含：

- `web` / `search`：公开网页搜索和公开信息提取。
- `http`：当前 workspace 文档化 Program API 的 scoped HTTP 调用。
- `weather`：当前用户请求相关的天气查询。
- `browser`：隔离 worker browser/session 内的公开网页或当前账号明确请求的网页操作。
- `file`：当前 run 授权 roots 内的文件读写。
- `vision` / `video`：授权 roots 内媒体文件或公开媒体 URL 的 OCR、视觉和视频分析。
- `image_gen`：当前账号请求的图片生成、编辑、擦除，输入和输出必须在授权 roots 或 delivery roots 内。
- `messaging` / `tts`：当前会话、当前 workspace 投递通道或明确 in-scope 收件人的消息和语音能力。
- `skills`：当前 workspace/profile-local Skill 读写。
- `todo` / `kanban`：当前账号自己的看板和任务协作。
- `cronjob`：当前账号自己的自动化任务。
- `memory` / `session_search` / `clarify`：当前账号上下文内的记忆、历史会话检索和澄清。

## 默认禁止能力

普通低权限默认不开放：

- `terminal`、`process`、`shell`、`cmd`、`powershell`、`bash`。
- `git`、`source`、`developer`、`debug` / `debugging`。
- `code_execution`、`execute_code`、`python`。
- `codex`、`delegation`、`delegate_task`。
- `computer_use`、`homeassistant`。
- `rl`、`moa` 这类不经过 Hermes Mobile 看板/并发调度的训练或多模型 fanout。
- broad `mcp` 暴露和未做 workspace scope 的平台复合 toolset。

这些能力只能通过 Owner maintenance profile 或专门的受限 adapter 开放，不能作为普通低权限默认能力。

## 验证要求

发布或部署后必须验证真实 worker 账号下的 schema，而不是只看源码：

1. `/api/status` 显示 Gateway Pool 健康。
2. lowgw base config `/home/hermes/.hermes/config.yaml` 包含默认普通 toolsets。
3. lowgw profile config 的 `platform_toolsets.api_server` 包含同一组普通 toolsets。
4. profile-local plugin 已安装并启用，例如 weather/http/image。
5. 用真实 worker 账号和真实 `HERMES_HOME=/home/hermes/.hermes`、`HERMES_PROFILE=lowgwN` introspect `get_tool_definitions(...)`，确认 callable schema 里有预期函数。
6. 不打印 token、Access Key、OAuth refresh token、Gateway API key 或 worker manifest secret。

## 依赖说明

`allowed_toolsets` 表示 Hermes Mobile 允许该类能力；真实 callable 还取决于 Gateway profile 的插件和运行时依赖。已经产品化为 profile-local plugin 的能力，例如 `weather`、`http`、fallback `web`、`image_gen` 编辑/擦除，应随 `scripts/configure-low-gateways.sh` 自动安装到 lowgw。`browser` 还依赖 worker runtime 中的 `agent-browser` 和 Chromium/Lightpanda/云浏览器配置；没有这些依赖时，policy 和 profile 可以开放 `browser`，但真实 schema 不会出现 `browser_*` callable。不能把这种情况描述为“权限不允许”，应描述为“运行时 browser 依赖未就绪”。
