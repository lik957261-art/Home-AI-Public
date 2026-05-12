# Agent 执行版 Windows 生产部署 README

本文面向另一个 Codex / Agent，用于把 public Hermes Mobile 源码部署成与参考生产拓扑一致的 Windows + WSL + official Hermes Gateway Pool 运行形态。

如果用户要求“部署成可用生产环境”或“带 Worker / Gateway Pool / 低权限 worker”，不要只执行根 README 的 Quick Start。Quick Start 只启动最小 single-Gateway listener，不会创建 `HermesMobileWorker`，不会准备 `gateway-worker`，不会启动 `lowgw1..10`，也不会生成 Gateway Pool manifest。

本 runbook 需要两个 bootstrap 权限前提：

- Windows 管理员 PowerShell：用于创建/配置 `HermesMobileWorker`、设置 `C:\ProgramData\HermesMobile` 运行目录、ACL、凭据和宿主启动进程。
- WSL bootstrap 权限：部署 Agent 可以通过 `wsl -d <distro> -u root` 进入目标 distro，或使用已有可 `sudo` 的 Linux 用户。低权限 Linux worker 用户、profile 目录、启动脚本、依赖和 official Hermes runtime 边界应由部署流程创建/配置，不要求用户提前手工建好。

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
- owner-maintenance 示例：`18651..18652`

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

Owner maintenance workers 只在部署者明确需要时启用：

- `securityLevel=owner-maintenance`
- `allowMaintenance=true`
- 只能由 Owner elevation 路由使用。

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
$env:HERMES_WEB_MAX_ACTIVE_RUNS = "3"
$env:HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE = "3"
$env:HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED = "auto"
$env:HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS = "C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles"
```

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
- 在 `HermesGatewayWorker` WSL distro 中启动 lowgw。
- 调用 `configure-low-gateways.sh` 写 base/profile config。
- 安装 `hermes-mobile-weather` 和 `hermes-mobile-http` 插件。
- 配置 shared-auth 同文件系统路径。
- 检查并隔离损坏的 profile SQLite DB/sidecar。
- 停掉旧 lowgw 后再启动新 lowgw。
- 检查 lowgw auth fingerprint。

## 9. 启动 Hermes Mobile listener

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\app\scripts\start-worker-host.ps1" `
  -CredentialPath "C:\ProgramData\HermesMobile\worker-credential.xml" `
  -LauncherPath "C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1" `
  -WorkingDirectory "C:\ProgramData\HermesMobile\app" `
  -UserName "HermesMobileWorker" `
  -Port 8797 `
  -MinGatewayPoolWorkers 1 `
  -GatewayPoolPorts "18751,18752,18753,18754,18755,18756,18757,18758,18759,18760" `
  -ReplaceExisting
```

生产可把这一步放入 Windows Scheduled Task，例如：

- `Hermes Mobile Gateway Pool`
- `Hermes Web Listener User Logon`

Agent 创建计划任务前必须让部署者确认触发条件和运行账户。

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
- lowgw ports `18751..18760` listening。
- lowgw profile config 包含 `weather` 和 `http`。
- 实际 session schema 包含 `weather` 和 `http_request`。
- `state.db` / `response_store.db` integrity 为 `ok`。

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
