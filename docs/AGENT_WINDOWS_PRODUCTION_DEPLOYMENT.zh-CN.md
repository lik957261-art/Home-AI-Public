# Agent 执行版 Windows 生产部署 README

本文面向另一个 Codex / Agent，用于把 public Hermes Mobile 源码部署成与参考生产拓扑一致的 Windows + WSL + official Hermes Gateway Pool 运行形态。

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
