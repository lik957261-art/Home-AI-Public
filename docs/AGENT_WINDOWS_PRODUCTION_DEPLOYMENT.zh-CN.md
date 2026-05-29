# Agent 执行版 Windows 生产部署 README

本文面向另一个 Codex / Agent，用于把 public Hermes Mobile 源码部署成与参考生产拓扑一致的 Windows + WSL + official Hermes Gateway Pool 运行形态。

如果用户要求“部署成可用生产环境”或“带 Worker / Gateway Pool / 低权限 worker”，不要只执行根 README 的 Quick Start。Quick Start 只启动最小 single-Gateway listener，不会创建 `HermesMobileWorker`，不会准备 `gateway-worker`，不会启动 `lowgw1..10`，也不会生成 Gateway Pool manifest。

本 runbook 需要两个 bootstrap 权限前提：

- Windows 管理员 PowerShell：用于创建/配置 `HermesMobileWorker`、设置 `C:\ProgramData\HermesMobile` 运行目录、ACL、凭据和宿主启动进程。
- WSL bootstrap 权限：部署 Agent 可以通过 `wsl -d <distro> -u root` 进入目标 distro，或使用已有可 `sudo` 的 Linux 用户。低权限 Linux worker 用户、profile 目录、启动脚本、依赖和 official Hermes runtime 边界应由部署流程创建/配置，不要求用户提前手工建好。

如果目标机器已经安装最新版 official Hermes，这是有利前提，但不等于 Hermes Mobile 生产部署已完成。Agent 仍需创建 Hermes Mobile 的 ProgramData 目录、listener 环境、Gateway Pool manifest、低权限 worker 启动链路，以及需要的 profile-local 认证状态。官方 Hermes runtime 应复用并验证，不应重新打补丁或把 Hermes Mobile 逻辑写进 official Hermes 源码。

如果部署 Agent 没有 Windows 管理员权限，或无法在 WSL 内取得 root/sudo bootstrap 权限，不要宣称已经完成生产 Worker Pool 部署；最多只能完成 Quick Start 的最小 single-Gateway listener，并应明确回报“Worker Pool 未部署”。

## 现场部署踩坑清单

这些问题会表现为“好像部署成功了”，但最终普通权限没有 worker、`/api/status` 没有 Gateway Pool，或 worker 全部不可用。部署 Agent 必须逐项核对。

### 管理员权限必须属于 Agent 进程本身

只打开一个管理员 PowerShell 不够。如果 Codex/Desktop 本身仍然是普通权限，Agent 执行的命令仍然没有管理员 token。执行生产路径前先检查：

```powershell
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isAdmin
```

如果输出 `False`，不要继续执行 Worker Pool 部署。应让 Agent 宿主进程以管理员身份启动，或让操作者在管理员 shell 中执行 Windows 侧命令。

### WSL distro 按 Windows 用户隔离

操作者账号能看到的 WSL distro，不等于 `HermesMobileWorker` 账号也能看到。Gateway Pool 的低权限 worker 会通过 `run-as-worker.ps1` 进入 worker 账号上下文，因此 `wsl.exe -d HermesGatewayWorker` 是在 worker 账号下解析。

如果 `start-gateway-pool.ps1` 日志出现 `WSL_E_DISTRO_NOT_FOUND`，需要把准备好的 distro export/import 到 `HermesMobileWorker` 可见的 WSL 注册表上下文，或用等效方式为 `HermesMobileWorker` 注册名为 `HermesGatewayWorker` 的 distro。典型模式：

```powershell
wsl.exe --export <prepared-distro> C:\ProgramData\HermesMobile\wsl\HermesGatewayWorker.tar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1 `
  -ChildScript C:\ProgramData\HermesMobile\gateway-worker\import-hermes-gateway-worker.ps1
```

子脚本应在 worker 账号下执行 `wsl.exe --import HermesGatewayWorker ...`，然后验证 official runtime 和低权限 Linux 用户，例如：

```powershell
wsl.exe -d HermesGatewayWorker -u root -- test -x /opt/hermes-gateway-runtime/venv/bin/python
wsl.exe -d HermesGatewayWorker -u root -- id hermes
```

### Worker 账号不一定继承操作者 PATH

操作者 shell 能运行 `node`，不代表 `HermesMobileWorker` 也能运行。若生产 listener 启动后立刻退出，且 `hermes-web.out.log` / `hermes-web.err.log` 为空，应优先检查 worker 账号的 Node 路径。

处理方式是给 worker 账号安装系统级 Node，或把已知可用的 Node runtime 放进 runtime package，并显式传入：

```powershell
& "C:\ProgramData\HermesMobile\app\start-hermes-web.ps1" -Detached -ForceLocalStart `
  -NodeExe "C:\ProgramData\HermesMobile\app\bin\node.exe"
```

### JSON manifest 必须是无 BOM UTF-8

Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 可能写入 BOM。如果 Gateway Pool manifest 带 BOM，`/api/status` 可能出现：

```text
gatewayPool.error = Unexpected token '﻿', "... is not valid JSON
gatewayPool.enabled = false
workerCount = 0
```

写 manifest 时使用无 BOM UTF-8：

```powershell
[System.IO.File]::WriteAllText(
  "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json",
  $json,
  [System.Text.UTF8Encoding]::new($false)
)
```

### 不要只用端口监听判断 Worker Pool 成功

看到 `18751..18760` 端口在监听只是必要条件，不是成功条件。最终验证必须同时确认：

- `Get-CimInstance Win32_Process` 显示 Hermes Mobile `node.exe` owner 是 `HermesMobileWorker`。
- `/api/status` 返回 `ok=true`。
- `/api/status.gatewayPool.enabled=true`。
- `/api/status.gatewayPool.workerCount` 等于预期 worker 数。
- `/api/status.gatewayPool.workers` 中每个 worker 都是 `healthy=true`，普通用户 worker 应是 `securityLevel=user`。
- reasoning/model source 指向 lowgw profile config，不是操作者个人 Hermes home。

### 防火墙网络 profile 可能是 Public

Windows 笔记本的当前 Wi-Fi 网络可能是 `Public`。如果需要局域网访问，入站规则应覆盖当前 profile，通常用 `-Profile Any`：

```powershell
New-NetFirewallRule -DisplayName "Hermes Mobile 8797" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8797 -Profile Any
```

### 不要把生成的私密运行态写进日志或 PR

不要粘贴或提交 Owner key、低权限 Gateway API key、Codex OAuth token、VAPID private key、worker credential XML、runtime SQLite DB、WSL export 包，或包含真实 `api_key` 的 Gateway Pool manifest。公开文档和 PR 只记录路径、结构和验证形态。

目标不是复制某台机器的私有数据，而是复刻 Hermes Mobile 自己负责的生产结构：

- Windows 低权限服务用户。
- `C:\ProgramData\HermesMobile` 运行目录。
- Hermes Mobile listener。
- Gateway worker 脚本目录。
- WSL 低权限 Gateway Pool。
- official Hermes clean runtime 边界。
- Mobile 启动、Gateway Pool 启动、健康检查和回滚方式。

不要把 Access Key、OAuth token、Codex auth、Gateway API key、VAPID private key、push endpoint、用户文件、SQLite runtime DB、日志或备份写入 Git 或回复正文。

## 前置假设

部署机已经具备：

- Windows 11 或 Windows Server。
- PowerShell 5.1+。
- Node.js `>=22`。
- Python `>=3.12`。
- WSL 可用。
- 一个用于低权限 Gateway 的 WSL distro，默认名：`HermesGatewayWorker`。
- official Hermes clean runtime 已安装在 WSL 内，默认路径：
  - source：`/opt/hermes-gateway-runtime/official-clean`
  - python：`/opt/hermes-gateway-runtime/venv/bin/python`
- official Hermes 的 Codex/OAuth 登录已经由部署者完成，或部署者能提供安全的 auth seed 文件。
- 如需 `@Grok4.3`，official Hermes 必须能使用 `xai-oauth` provider。Hermes Mobile 只负责把 Grok 请求路由到 `grokgw1`，不随仓库分发 xAI OAuth token。

如果路径不同，Agent 应通过环境变量或脚本参数覆盖，不要硬编码个人路径。

## Agent 必须先确认的输入

向部署者确认这些非秘密值：

- public repo checkout 路径。
- Runtime 目录，默认 `C:\ProgramData\HermesMobile\app`。
- Data 目录，默认 `C:\ProgramData\HermesMobile\data`。
- Gateway worker 目录，默认 `C:\ProgramData\HermesMobile\gateway-worker`。
- Windows worker 用户名，默认 `HermesMobileWorker`。
- WSL worker distro 名，默认 `HermesGatewayWorker`。
- official Hermes runtime source/python 路径。
- 是否启用 Gateway Pool；生产建议启用。
- lowgw worker 数量，默认 `10`。
- 是否启用 Grok/xAI worker；默认生产拓扑启用 `grokgw1`，实际端口必须以 `gateway-pool-manifest.json` 为准。
- 是否启用 owner-maintenance Gateway，启用时需要部署者指定 WSL user/profile/ports。
- 对外访问方式：localhost、内网、或 HTTPS reverse proxy。

秘密值只记录“文件路径”，不打印内容：

- Owner Web Key 文件。
- Gateway worker API key 文件。
- Codex auth seed 文件。
- 外部连接器 token 文件。
- Web Push VAPID 文件。
- Weixin/iLink ingress key 文件。

## 目标目录

Windows：

```text
C:\ProgramData\HermesMobile\
  app\                  # clean runtime package
  data\                 # mutable runtime data
  logs\                 # optional host logs
  gateway-worker\       # worker launch scripts, secrets, telemetry profiles
  worker-credential.xml # DPAPI-protected Windows worker credential
```

WSL 低权限 Gateway：

```text
/home/hermes/.hermes/
  config.yaml
  api-server-key.secret
  profiles/lowgw1 -> /mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles/lowgw1
  profiles/lowgw2 -> ...
  plugins/hermes-mobile-weather
  plugins/hermes-mobile-http
```

默认端口：

- Hermes Mobile listener：`8797`
- Bridge host：`8798`
- lowgw1..10：`18751..18760`
- Grok/xAI worker `grokgw1`：从 `gateway-pool-manifest.json` 读取。生产维护时应保持 manifest 中的 Grok 端口稳定；新增个人 workspace worker 排在后续空闲端口，不应把 `grokgw1` 顺延到新端口。
- owner-maintenance 示例：`18651..18653`
- DeepSeek 专属低权限 worker 示例：`18764..18773`，其中 `deepseekgw1`、`deepseekgw2`、`deepseekgw99` 为 Owner 专属；其他用户使用各自 workspace 绑定的 `deepseekgwN`。

部署时要把运行脚本和重启入口一起放到生产目录。至少包括：

```text
C:\ProgramData\HermesMobile\app\scripts\start-worker-host.ps1
C:\ProgramData\HermesMobile\app\scripts\start-cron-tick-sidecar.ps1
C:\ProgramData\HermesMobile\app\scripts\run-cron-tick-sidecar.ps1
C:\ProgramData\HermesMobile\app\scripts\hermes-mobile-cron-dispatcher.py
C:\ProgramData\HermesMobile\gateway-worker\start-gateway-pool.ps1
C:\ProgramData\HermesMobile\gateway-worker\start-low-gateways-child.ps1
C:\ProgramData\HermesMobile\gateway-worker\run-as-worker.ps1
C:\ProgramData\HermesMobile\gateway-worker\start-low-gateways.sh
C:\ProgramData\HermesMobile\gateway-worker\configure-low-gateways.sh
```

如果部署启用 Weixin/iLink 或 disaster recovery，再同步对应脚本；没有启用的 sidecar 不应被计划任务误启动。

## 1. 检查源码

在 public checkout：

```powershell
npm install
npm run productization:check
```

如果失败，先修源码或环境，不要继续部署。

## 2. 生成 runtime package

在 public checkout：

```powershell
npm run package:runtime -- --out "C:\ProgramData\HermesMobile\app" --force --windows-worker-account "$env:COMPUTERNAME\HermesMobileWorker"
npm install --prefix "C:\ProgramData\HermesMobile\app" --omit=dev --no-audit --no-fund
```

如果当前 shell 不是管理员，runtime ACL 可能不会自动应用。后续必须运行 process isolation 脚本。

## 3. 创建 Windows worker 用户和 ACL

用管理员 PowerShell：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\app\scripts\prepare-process-isolation.ps1" `
  -Apply `
  -CreateUser `
  -GeneratePassword `
  -RuntimeDir "C:\ProgramData\HermesMobile\app" `
  -DataDir "C:\ProgramData\HermesMobile\data" `
  -LogDir "C:\ProgramData\HermesMobile\logs" `
  -SourceDir "<public-checkout>"
```

该脚本会创建 `HermesMobileWorker` 并写入 DPAPI-protected credential file。不要打印密码。

如果部署者已经预先创建 worker 用户，可以省略 `-CreateUser -GeneratePassword`，但必须确保 `C:\ProgramData\HermesMobile\worker-credential.xml` 存在且 ACL 受限。

## 4. 准备 gateway-worker 目录

```powershell
$app = "C:\ProgramData\HermesMobile\app"
$gw = "C:\ProgramData\HermesMobile\gateway-worker"
New-Item -ItemType Directory -Force -Path $gw, "$gw\secrets", "$gw\logs" | Out-Null

Copy-Item "$app\scripts\run-as-worker.ps1" "$gw\run-as-worker.ps1" -Force
Copy-Item "$app\scripts\start-gateway-pool.ps1" "$gw\start-gateway-pool.ps1" -Force
Copy-Item "$app\scripts\start-low-gateways-child.ps1" "$gw\start-low-gateways-child.ps1" -Force
Copy-Item "$app\scripts\start-low-gateways.sh" "$gw\start-low-gateways.sh" -Force
Copy-Item "$app\scripts\configure-low-gateways.sh" "$gw\configure-low-gateways.sh" -Force
Copy-Item "$app\scripts\check-worker-codex-auth.ps1" "$gw\check-worker-codex-auth.ps1" -Force
Copy-Item "$app\scripts\provision-worker-external-connectors.ps1" "$gw\provision-worker-external-connectors.ps1" -Force
```

这些脚本是 Hermes Mobile 产品层脚本。不要修改 official Hermes 源码来替代它们。

## 5. 创建 Gateway API key 文件

生成低网关 API key 文件，不打印内容：

```powershell
$secretPath = "C:\ProgramData\HermesMobile\gateway-worker\secrets\low-gateway-api-key.secret"
if (-not (Test-Path $secretPath)) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $value = [Convert]::ToBase64String($bytes)
  [System.IO.File]::WriteAllText($secretPath, $value + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}
```

生成后限制 ACL：只允许管理员、SYSTEM、部署者和必要 worker 读取。

## 6. 创建 Gateway Pool manifest

生产 manifest 路径：

```text
C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json
```

低权限 workers 应使用：

- `securityLevel=user`
- `profile=lowgw1..lowgw10`
- `port=18751..18760`
- `api_key` 与 `low-gateway-api-key.secret` 内容一致，但 manifest 文件本身必须当作 secret 保护。
- `telemetryStateDbPath` / `telemetryResponseStoreDbPath` 指向对应 profile DB。

如需 Grok/xAI，在同一个 manifest 中增加独立 worker：

下面的 `18761` 只是默认 `lowgw1..10` 拓扑下的示例端口。实际值以 manifest 为准，但一旦生产 manifest 确定，新增个人 workspace worker 应排在 Grok 后面并使用后续空闲端口，不能因为新增 `lowgwN` 而移动 Grok 端口。

```json
{
  "id": "grokgw1",
  "name": "grokgw1",
  "profile": "grokgw1",
  "host": "127.0.0.1",
  "port": 18761,
  "securityLevel": "user",
  "provider": "xai-oauth",
  "allowedWorkspaceIds": ["*"],
  "skillProfile": "owner-full",
  "skillWorkspaceIds": ["owner"],
  "api_key": "<read-from-secret-file>"
}
```

`provider=xai-oauth` 是必需字段。Hermes Mobile 的 Grok 路由会按 provider hint 查找 worker；如果 manifest 里只有 `profile=grokgw1` 但没有 `provider=xai-oauth`，`@Grok4.3` 可能找不到匹配 worker 或落入不可用状态。Grok worker 可以根据部署策略限制 `allowedWorkspaceIds`，但不要把 Grok 请求伪装成普通 lowgw 请求。

## 6.1 Grok/xAI profile 与认证

生产脚本默认会准备并启动一个 Grok Gateway：

```powershell
$env:HERMES_GROK_GATEWAY_COUNT = "1"
```

默认 profile/端口计算：

```text
profile: grokgw1
port: <manifest-derived-grok-port>  # 例如默认拓扑为 18761；新增个人 worker 不应移动它
provider: xai-oauth
model.default: grok-4.3
```

`scripts/configure-low-gateways.sh` 会为 `grokgw1` 写入官方 Gateway profile config，并把 auth 文件链接到 profile-local auth store。可选覆盖项：

```powershell
$env:HERMES_GROK_GATEWAY_AUTH_PATH = "C:\ProgramData\HermesMobile\gateway-worker\telemetry\shared-auth-grok\auth.json"
$env:HERMES_GROK_GATEWAY_AUTH_LOCK_PATH = "C:\ProgramData\HermesMobile\gateway-worker\telemetry\shared-auth-grok\auth.lock"
```

这些文件是认证状态，不属于 Git，不应打印内容。如果 `grokgw1` 启动健康但 `@Grok4.3` 调用失败，先区分三类问题：

1. manifest 缺少 `provider=xai-oauth`：补 manifest，重启 Gateway Pool。
2. `grokgw1` 未监听 manifest 中记录的端口，或 `/api/status` 无该 worker：检查 `HERMES_GROK_GATEWAY_COUNT`、端口、防火墙、Gateway Pool 启动日志。
3. Gateway 返回 xAI/OAuth 认证失败：不要改 Hermes Mobile 路由；让 Codex 在目标机上按 official Hermes 的 xAI OAuth 流程修复 `grokgw1` 使用的 auth store，然后重启 Gateway Pool 并重新 smoke。

Grok 认证失败时，正确交付状态是“Gateway worker 存在，但 xAI OAuth 未完成/已失效”。不要报告为 Hermes Mobile 部署完成，也不要把其他 provider worker 当作 Grok worker 使用。

## 6.2 多账号 worker / Skill profile 路由规则

生产多账号部署不能把所有普通 lowgw 作为无差别共享池。普通 lowgw 可以共享物理机器和调度池，但每个 workspace/account 必须在 manifest 中有明确 profile 边界，否则 Skill、memory、connector credential、session state 和授权根目录会串。

Hermes Mobile 普通 run 会按当前 `actorWorkspaceId` 生成 `skillWorkspaceId` 路由 hint。生产部署应设置：

```powershell
$env:HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING = "on"
```

`on` 表示缺少匹配 Skill profile 时 fail closed，不会退回到任意 worker。`auto` 仅用于兼容旧 manifest；只要 manifest 声明了 `skillProfile` / `skillWorkspaceIds`，也会按 workspace 匹配。

每个普通 user worker 至少应声明：

```json
{
  "id": "lowgw5",
  "name": "lowgw5",
  "profile": "lowgw5",
  "host": "127.0.0.1",
  "port": 18755,
  "securityLevel": "user",
  "allowedWorkspaceIds": ["weixin_wuping"],
  "skillProfile": "workspace:weixin_wuping",
  "skillWorkspaceIds": ["weixin_wuping"],
  "api_key": "<same low gateway api key>"
}
```

字段含义：

- `allowedWorkspaceIds` 控制该 worker 可以服务哪些 workspace。
- `skillProfile` 是给管理员和诊断使用的非秘密标签，表示该 worker 使用哪套 Skill/profile-local store。
- `skillWorkspaceIds` 声明这套 Skill/profile-local store 对应哪些 workspace；新增 workspace 后必须新增或更新这里的绑定。
- `["*"]` 只适合真正共享、没有用户私有 Skill/connector/memory 的 stateless profile。不要把 `["*"]` 当作生产多账号隔离的默认值。

新增 workspace/account 后，部署 Agent 必须同步做这些事：

1. 在 Hermes Mobile 中创建 workspace 和 Access Key。
2. 在 Gateway Pool manifest 中为该 workspace 分配至少一个 `securityLevel=user` worker，或把该 workspace 加入一个明确批准共享的 worker 组。
3. 为该 worker 设置对应的 `allowedWorkspaceIds`、`skillProfile`、`skillWorkspaceIds`。新增个人 workspace worker 应追加到 manifest 后面，使用当前 low/Grok worker 端口之后的下一个空闲端口，不要重排或移动 `grokgw1`。
4. 准备该 profile 的 Skill store、connector credential 路径、memory/session/SQLite profile-local 状态目录。
5. 重启 Gateway Pool，使新 manifest 和 profile 配置生效。
6. 用该 workspace Access Key 发起一次低权限 smoke，确认实际路由到预期 `profile`，并且 session schema 中包含该账号应该有的工具。

删除本地 workspace 当前只删除 workspace 记录、Access Key 和相关前端/动态 project 缓存，不会自动删除 Gateway manifest worker、profile-local Skill store、connector credential、memory/session 或 SQLite 状态。需要释放 Gateway profile 时，应走单独的显式清理/备份流程，避免误删认证和历史状态。

如果新 workspace 找不到所属 lowgw，不要把所有 worker 改成全员共享；应补 manifest/profile 映射，或者明确决定该 workspace 使用某个受控共享 profile。

参考生产分配约定：

- Owner 普通低权限 worker：`lowgw1..lowgw4` 和 `lowgw10`，`securityLevel=user`，`skillProfile=owner-full`，`skillWorkspaceIds=["owner"]`。
- 普通 workspace/account worker：`lowgw5..lowgw9`，每个 worker 绑定一个或一组明确 workspace，使用 `skillProfile=workspace:<workspaceId>`。
- Owner maintenance worker：不放在普通 `lowgw` 池里，使用独立 profile，例如 `officialclean1..2`，`securityLevel=owner-maintenance`，`allowMaintenance=true`。

这只是参考拓扑，不是硬编码要求。部署可以调整数量，但必须保留隔离原则：Owner 普通、普通用户、Owner maintenance 不应混在同一个无差别共享 profile 中。

Owner maintenance workers 只在部署者明确需要时启用：

- `securityLevel=owner-maintenance`
- `allowMaintenance=true`
- 只能由 Owner elevation 路由使用。

Owner maintenance 不是只在 manifest 中加 worker 就够了。它需要两个条件同时满足：

- manifest 中有 enabled owner-maintenance worker，例如 `securityLevel=owner-maintenance` 且 `allowMaintenance=true`。
- listener 环境显式设置 `HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS=1` 或 `HERMES_WEB_ALLOW_OWNER_MAINTENANCE_RUNS=1`。

如果只配置了 Owner Access Key 和普通 lowgw workers，但没有设置该环境变量，Owner 可以登录，普通权限也可以运行，但侧边栏高权限按钮会显示：

```text
Owner maintenance runs are disabled by server configuration
```

Agent 可以按模板生成 manifest，但不得把真实 API key 打印到回复里。

## 7. 配置 listener 环境

建议把生产 launcher 写在：

```text
C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1
```

关键环境变量：

```powershell
$env:HERMES_WEB_HOST = "0.0.0.0"
$env:HERMES_WEB_PORT = "8797"
$env:HERMES_WEB_DATA_DIR = "C:\ProgramData\HermesMobile\data"
$env:HERMES_WEB_AUTH_KEY_PATH = "C:\ProgramData\HermesMobile\data\secrets\owner-web-key.secret"
$env:HERMES_WEB_SERVICE_STORE = "sqlite"
$env:HERMES_WEB_DB_PATH = "C:\ProgramData\HermesMobile\data\hermes-mobile.sqlite3"
$env:HERMES_WEB_GATEWAY_POOL_ENABLED = "auto"
$env:HERMES_WEB_GATEWAY_POOL_MANIFEST = "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json"
$env:HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING = "on"
$env:HERMES_WEB_MAX_ACTIVE_RUNS = "3"
$env:HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE = "3"
$env:HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS = "1"
$env:HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED = "auto"
$env:HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS = "C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles"
```

只有在 manifest 确实包含 owner-maintenance workers，并且这些 workers 能健康启动时，才设置 `HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS=1`。如果部署目标只需要普通 lowgw，不需要高权限维护通道，应保持默认关闭，并在交付说明里明确“Owner maintenance 未启用”。

不要在 listener 环境里放 operator 的 WSL UNC token/config 路径。外部连接器能力应由 Gateway profile-local credentials 提供。

## 8. 启动 Gateway Pool

用管理员或部署者 shell 执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\gateway-worker\start-gateway-pool.ps1" `
  -GatewayWorkerRoot "C:\ProgramData\HermesMobile\gateway-worker" `
  -ManifestPath "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json"
```

该脚本会：

- 使用 `run-as-worker.ps1` 切到 `HermesMobileWorker`。
- 在 `HermesGatewayWorker` WSL distro 中启动 lowgw 和配置的 `grokgw`。
- 调用 `configure-low-gateways.sh` 写 base/profile config。
- 安装 `hermes-mobile-weather` 和 `hermes-mobile-http` 插件。
- 配置 shared-auth 同文件系统路径。
- 检查并隔离损坏的 profile SQLite DB/sidecar。
- 停掉旧 lowgw 后再启动新 lowgw。
- 检查 lowgw auth fingerprint。

日常修复或配置变更后的 Gateway Pool 重启也使用同一个入口。优先触发计划任务 `Hermes Mobile Gateway Pool`；没有计划任务时再直接运行 `start-gateway-pool.ps1`。不要只杀某个 `python` 进程后手动拉起单个 Gateway，因为这样容易绕过 shared-auth、profile config、plugin 同步、SQLite sidecar 修复和 `grokgw1` 配置。

## 9. 启动 Hermes Mobile listener

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\app\scripts\start-worker-host.ps1" `
  -CredentialPath "C:\ProgramData\HermesMobile\worker-credential.xml" `
  -LauncherPath "C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1" `
  -WorkingDirectory "C:\ProgramData\HermesMobile\app" `
  -UserName "HermesMobileWorker" `
  -Port 8797 `
  -MinGatewayPoolWorkers 1 `
  -GatewayPoolPorts "18751,18752,18753,18754,18755,18756,18757,18758,18759,18760,18761,18762,18763,18764,18765,18766,18767,18768,18769,18770,18771,18772,18773,18651,18652,18653" `
  -ReplaceExisting
```

生产可把这一步放入 Windows Scheduled Task，例如：

- `Hermes Mobile Gateway Pool`
- `Hermes Web Listener User Logon`

Agent 创建计划任务前必须让部署者确认触发条件和运行账户。

## 9.1 运行态重启入口

部署交付时必须把以下运维入口写进本机 README 或交付说明，方便后续 Codex 复查和修复：

### Listener / bridge host

服务端代码、route/provider、bridge-host、ChatGPT Pro bridge、Web Push 服务端逻辑变更后，重启 listener/bridge host：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\app\scripts\start-worker-host.ps1" `
  -CredentialPath "C:\ProgramData\HermesMobile\worker-credential.xml" `
  -LauncherPath "C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1" `
  -WorkingDirectory "C:\ProgramData\HermesMobile\app" `
  -Port 8797 `
  -BridgeHostPort 8798 `
  -ReplaceExisting
```

重启前先查 `/api/status?detail=1`。如果 `activeGlobal` 非 0，应等待、停止对应任务，或让部署者确认中断；不要直接重启。

### Gateway Pool

Gateway profile、plugin、worker manifest、Grok/xAI auth store、owner-maintenance、Gateway worker 脚本变更后，重启 Gateway Pool：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\gateway-worker\start-gateway-pool.ps1" `
  -GatewayWorkerRoot "C:\ProgramData\HermesMobile\gateway-worker" `
  -ManifestPath "C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json"
```

若已创建计划任务，优先用 `Start-ScheduledTask -TaskName "Hermes Mobile Gateway Pool"`，然后检查任务结果、`start-gateway-pool.log`、端口和 `/api/status` worker 健康。Gateway Pool 重启通常不需要 listener 重启，除非 manifest 路径、listener 环境或 server routing code 也变了。

### Cron dispatcher sidecar

如果启用官方 cron 自动化，listener 启动会按配置确保 cron sidecar。单独修复 cron sidecar 时使用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\app\scripts\start-cron-tick-sidecar.ps1" `
  -DistroName "<owner-or-cron-distro>" `
  -WslUser "<owner-or-cron-user>" `
  -HermesHome "/home/<user>/.hermes" `
  -ReplaceExisting
```

该 sidecar 调用 `hermes-mobile-cron-dispatcher.py --dispatch`，只负责快速派发 due jobs；长任务应在 detached runner 中继续跑。不要把它改回直接同步调用 `hermes cron tick`，否则长任务会阻塞后续 tick。

### Static-only 更新

只改 `public/` 静态文件和对应 tests 时，通常只需同步文件并验证 client version，不需要重启 listener 或 Gateway Pool。只要改到 `server-routes/`、`adapters/`、`mobile-server-runtime.js`、bridge host、Gateway plugin/profile/schema/startup script，就按上面的 listener 或 Gateway Pool 规则重启。

## 10. 验证

基础验证：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8797/
```

带 Owner key 的状态验证：

```powershell
$key = Get-Content -Raw "C:\ProgramData\HermesMobile\data\secrets\owner-web-key.secret"
Invoke-WebRequest -UseBasicParsing -Headers @{ "X-Hermes-Web-Key" = $key } http://127.0.0.1:8797/api/status
```

必须确认：

- `ok=true`
- `health=ok`
- Gateway Pool workers healthy。
- manifest 中每个 enabled `lowgw*` / `grokgw*` 端口都在 listening。
- 如果启用 Grok，`grokgw1` manifest port 正在 listening，`/api/status.gatewayPool.workers` 中该 worker 为 `healthy=true`，并且 worker metadata/manifest 中保留 `provider=xai-oauth`。
- 每个已创建 workspace 都能在 `/api/status.gatewayPool.workers` 中找到匹配的 `securityLevel=user` worker，并且该 worker 的 `allowedWorkspaceIds` 或 `skillWorkspaceIds` 包含该 workspace。
- 生产强隔离部署中，`HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING=on`，缺少 workspace/profile 映射时应 fail closed，而不是落到其他用户 worker。
- lowgw profile config 包含 `weather` 和 `http`。
- 实际 session schema 包含 `weather` 和 `http_request`。
- 如果启用 Grok，用 Owner 或目标 workspace 发起一次 `@Grok4.3` smoke。成功标准不是只看到模型选项，而是实际返回由 `provider=xai-oauth` / `profile=grokgw1` 执行的响应；若返回 OAuth/auth 错误，按“Grok/xAI profile 与认证”修复 auth store。
- `state.db` / `response_store.db` integrity 为 `ok`。

如果要求同构高权限维护能力，还必须确认：

- `/api/status.ownerElevation.available=true`
- Gateway Pool 中存在 healthy 的 `owner-maintenance` worker。
- owner-maintenance ports 例如 `18651..18653` listening。
- 高权限运行按钮不再显示 `Owner maintenance runs are disabled by server configuration`。

管理员首次设置流程说明：

- 如果启动前没有 `HERMES_WEB_KEY`，且 `HERMES_WEB_AUTH_KEY_PATH` 指向的 Owner key 文件不存在，浏览器首次访问会进入 Owner setup。
- 如果部署脚本已经生成了 `C:\ProgramData\HermesMobile\data\secrets\owner-web-key.secret`，或设置了 `HERMES_WEB_KEY`，setup 会被跳过，使用该 Owner key 直接登录。这是预配置生产部署的正常行为。
- 不要把 Owner key 内容写进 README、日志、PR 或回复正文；只记录文件路径。

## 11. 回滚

每次覆盖 runtime 前先备份：

```text
C:\ProgramData\HermesMobile\backups\<reason>-<timestamp>
```

回滚顺序：

1. 停 listener。
2. 停 Gateway Pool。
3. 恢复 `app` 或 gateway-worker 脚本备份。
4. 不删除 `data`，除非部署者明确要求。
5. 重新启动 Gateway Pool。
6. 重新启动 listener。
7. 验证 `/api/status`。

## Agent 禁止事项

- 不要修改 official Hermes 源码。
- 不要把 private repo、`.agent-context`、本机运行 DB、logs、uploads、backups 复制到 public 或 runtime package。
- 不要打印任何 secret/token/key。
- 不要把整个用户 home、Documents、source checkout、`ProgramData\HermesMobile\data` 总根暴露给低权限模型。
- 不要在有 active runs 时重启 listener 或 Gateway Pool；先查 `/api/status` 的 `activeGlobal`。
- 不要用 raw `hermes kanban` 写 operator 本地 namespace 来代替 Mobile 看板 API。

## Mac / Linux 说明

本文只覆盖 Windows 同构生产。macOS/Linux 可以运行 Hermes Mobile Web app 和 single Gateway 模式，但不能原样使用：

- Windows local user / DPAPI credential。
- Windows Scheduled Task。
- `ProgramData` 布局。
- `run-as-worker.ps1`。
- WSL `HermesGatewayWorker`。

macOS/Linux 需要单独的 launchd/systemd + Unix user + official Gateway profile 启动脚本。可复用的部分是 Hermes Mobile server、Gateway Pool manifest、weather/http 插件、权限策略和官方 Gateway 边界。
