# Hermes Mobile 低权限 Gateway 运行事故复盘

日期：2026-05-12  
范围：Hermes Mobile 低权限 Gateway Pool、工具 schema、天气/HTTP 工具、Codex auth、Gateway response store  
结论状态：已修复并上线，私库 CI 通过  

本文是长期运维复盘文档，不是交接记录。后续遇到低权限 Gateway “权限摘要显示可用，但模型说没有工具”、Mobile UI 显示 `run failed` / `terminated`、或看似同一类快速失败时，优先按本文排查。

## 一句话结论

这次不是单一问题，而是四个连续问题叠加：

1. Mobile 权限策略允许了 `weather` / `http`，但真实低网关模型 schema 没挂载对应 callable。
2. 后续配置修复后，生产仍有旧 lowgw 进程占用端口，导致“已部署但实际未生效”。
3. 再之后低网关 Codex 共享 auth 落在跨文件系统路径，官方 auth 原子替换失败，引发快速 `run failed`。
4. 最后一轮 lowgw2 已经成功执行并调用了 `http_request`，但 Gateway profile-local `response_store.db` 写 SSE 快照时报 `sqlite3.DatabaseError: database disk image is malformed`，Mobile 流断开并显示 `terminated`。

因此，不能只看 Mobile 权限摘要，也不能只看是否刚部署代码。必须验证“真实生产进程当前拿到的工具 schema、auth 路径、Gateway profile 本地 SQLite 状态、以及 Mobile 消息对应的低网关日志”。

## 用户可见现象

- 普通权限 Gateway 运行衣橱搭配时，说没有天气工具、没有 HTTP/API 调用能力。
- Mobile 权限摘要里已经显示 `weather` 或 `http` 已开放，但模型仍声称“当前 schema 没有 callable”。
- 用户多次重试后，Mobile UI 快速显示：
  - `run failed`
  - `terminated`
- 一次 12:48 的重试在 Mobile UI 失败，但低网关 session 实际已经完成，并且成功调用了衣橱 Program API。

## 时间线

### 1. Weather policy 与真实 callable 不一致

症状：

- Mobile 权限摘要显示低权限运行有 `weather`。
- 实际模型 schema 没有 callable `weather`。

根因：

- 之前只在 Mobile access-policy 和权限边界 Skill 里放开了 `weather`。
- 官方 Hermes 没有内置 `weather` toolset。
- 低网关 profile 需要 profile-local 插件和 `platform_toolsets.api_server` 配置，单纯修改 top-level policy 不会让模型 schema 出现工具。

修复：

- 增加产品层 Gateway 插件：
  - `gateway-plugins/hermes-mobile-weather/plugin.yaml`
  - `gateway-plugins/hermes-mobile-weather/__init__.py`
- `scripts/configure-low-gateways.sh` 负责把插件复制到每个 lowgw profile，并在 `platform_toolsets.api_server` 中启用 `weather`。

关键提交：

- `db4848a Expose weather tool in low gateways`
- `25c8aa3 Fix low gateway shared auth refresh`
- `2ef7711 Install weather plugin per low gateway profile`

### 2. HTTP policy 与真实 callable 不一致

症状：

- Mobile 权限摘要显示 `http` 或 prompt 说 HTTP 已开放。
- 衣橱任务仍说没有 `http_request`，无法调用 Program API manifest/bundle。

根因：

- 起初只修了策略层和提示层，没有让真实 Gateway runtime registry 挂载 `http_request`。
- 后续 profile 级测试也有误导性：测试时使用了 `HERMES_HOME=/home/hermes/.hermes/profiles/lowgwN`，但真实生产启动形态是：
  - `HERMES_HOME=/home/hermes/.hermes`
  - `HERMES_PROFILE=lowgwN`
- 官方 Hermes agent 创建时读取 base config `/home/hermes/.hermes/config.yaml`。当这个 base config 缺失时，会回落到默认 toolsets，导致 profile config 里看起来有 `http`，但真实 agent schema 没有 `http_request`。

修复：

- 增加产品层 scoped HTTP 插件：
  - `gateway-plugins/hermes-mobile-http/plugin.yaml`
  - `gateway-plugins/hermes-mobile-http/__init__.py`
- `scripts/configure-low-gateways.sh` 同时写入 worker base config `/home/hermes/.hermes/config.yaml` 和各 profile config。
- Mobile run policy prompt 明确列出当前 callable tool names，避免模型继续沿用同一 thread 里旧的“没有 HTTP”历史说法。

关键提交：

- `55124f2 Add scoped low gateway HTTP tool`
- `b37ba70 Name scoped HTTP tool in boundary instructions`
- `73b12c9 List callable tool names in run policy prompt`
- `3d5c108 Prevent stale HTTP tool claims in Mobile runs`
- `1313eea Configure low gateway base toolsets`

### 3. 部署后真实进程仍是旧 lowgw

症状：

- 代码和配置已经同步。
- 生产验证仍像旧配置，工具 schema 不更新。

根因：

- `gateway run --replace` 没有可靠替换已经占用 lowgw 端口的旧进程。
- 结果是新配置存在于磁盘，但旧进程继续服务生产请求。

修复：

- `scripts/start-gateway-pool.ps1` 在启动低网关前显式停止 `lowgw1..10` 旧进程，再启动新 Gateway Pool。

关键提交：

- `37340b6 Replace stale low gateways on pool restart`

验证要点：

- 只看文件修改时间不够。
- 必须验证 lowgw 进程启动时间、端口健康、真实 session tool schema。

### 4. Codex auth 跨文件系统原子替换失败

症状：

- `http_request` 和 `weather` 已经恢复后，Mobile 新请求仍在 1-2 秒内 `run failed`。
- lowgw 日志出现：
  - `Codex refresh token was already consumed by another client`
  - `OSError: [Errno 18] Invalid cross-device link`

根因：

- lowgw profile 目录实际在 Windows telemetry 路径下：
  - `/mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles/lowgw*`
- 旧共享 auth 指向 WSL ext4：
  - `/home/hermes/.hermes/auth.json`
- 官方 auth 更新会在 profile 侧写临时文件，然后原子替换 auth 目标。这个操作从 `/mnt/c` 到 ext4，跨文件系统 rename，必然可能失败。

修复：

- 低网关共享 auth 默认改为与 profile 同一文件系统：
  - `$telemetry_profiles_root/shared-auth/auth.json`
  - `$telemetry_profiles_root/shared-auth/auth.lock`
- `check-worker-codex-auth.ps1` 识别同路径同 refresh 为 intentional shared auth，不再误判为 copied-token collision。

关键提交：

- `e7e2a5b Keep low gateway auth on telemetry filesystem`

验证要点：

- `lowgw1..10` 的 auth realpath 应都指向 telemetry profiles 下的 `shared-auth/auth.json`。
- 同 refresh 且同 realpath 是预期共享；同 refresh 但不同 realpath 才是风险。

### 5. `terminated` 的真实原因是 response_store SQLite

症状：

- 12:48 用户重试，Mobile UI 显示 `Hermes - failed` / `terminated`。
- 但低网关 session 后续实际完成，并成功调用衣橱 Program API。

关键证据：

- Mobile SQLite 消息：
  - `msg_mp25huy3_884954f8`
  - `gatewayProfile=lowgw2`
  - `run_id=resp_a2e4670b70fa409fa829b669660e`
  - `task_id=web_20260512_124852_df56c4`
  - `error=terminated`
- lowgw2 session：
  - `session_bef6454e-98bf-412e-98b2-590aaa65b5ae.json`
  - `toolCount=17`
  - callable 包括 `http_request` 和 `weather`
  - manifest `200 OK`
  - bundle `200 OK`
  - `items=151`
  - `featured_looks=15`
  - `wear_history=36`
  - `rules=9`
- lowgw2 日志在同一时间点：
  - official Gateway `_persist_response_snapshot(...)`
  - `self._response_store.put(...)`
  - `sqlite3.DatabaseError: database disk image is malformed`

根因：

- 这次不是工具缺失，也不是 auth 问题。
- 是 profile-local official Gateway `response_store.db` 在 SSE 快照持久化时出错，导致 Mobile SSE 流断开。
- Agent 进程实际继续执行并写入 session 文件，但 Mobile 已经把 assistant message 标记为 failed。

修复：

- `scripts/configure-low-gateways.sh` 在每次 lowgw profile 启动前检查：
  - `state.db`
  - `response_store.db`
- 检查方式：
  - `PRAGMA integrity_check`
- 如果 DB 损坏：
  - 移动 DB、WAL、SHM 到 `sqlite-quarantine-*`
  - 让官方 Gateway 重建
- 如果只有异常小的 `-shm` 侧车且 WAL 为空：
  - 只隔离侧车到 `sqlite-sidecar-quarantine-*`

关键提交：

- `06566ab Repair low gateway sqlite stores on startup`

生产修复：

- 同步 `configure-low-gateways.sh` 到：
  - `C:\ProgramData\HermesMobile\gateway-worker\configure-low-gateways.sh`
  - `C:\ProgramData\HermesMobile\app\scripts\configure-low-gateways.sh`
- 确认 `activeGlobal=0` 后只重启 Gateway Pool，不重启 Mobile listener。
- 从完成的 lowgw2 session 恢复 12:48 那条 Mobile failed message，避免再次消耗额度。

## 为什么这次花了太久

这次慢的主要原因不是单个修复复杂，而是排查模型一开始不够分层：

1. 把“权限策略已开放”和“当前模型实际 schema 有 callable”混在了一起。
2. 早期验证没有完全模拟真实生产 lowgw 启动形态，导致 profile-local probe 结果误导。
3. 同步文件后没有第一时间确认旧进程是否仍在服务端口，出现“文件新、进程旧”。
4. Mobile UI 的 `run failed` / `terminated` 太泛化，多个不同根因看起来像同一个问题。
5. 每次只修当前看到的一层，没有一开始按完整链路验证：policy -> config -> process -> schema -> auth -> response store -> Mobile message state。

以后遇到低网关快速失败，不应直接重试模型。应先查证据，尽量避免消耗额度。

## 以后排查顺序

### 1. 先定位 Mobile message

从 Mobile SQLite 找最近失败 assistant message：

- `id`
- `run_id`
- `task_id`
- `gatewayName`
- `gatewayProfile`
- `gatewayUrl`
- `error`
- `startedAt` / `failedAt`

目的：

- 确认是哪一个 lowgw。
- 确认失败是 Mobile 层、Gateway SSE 层、auth 层、还是模型执行层。

### 2. 查对应 lowgw session，不先做新模型调用

到对应 profile 的 session 目录找最新 session：

- `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\lowgwN\sessions\*.json`

先看：

- session 是否完成。
- 最终 assistant content 是否存在。
- tool schema 里是否有目标 callable。

如果 session 已完成但 Mobile 显示 failed，优先怀疑 SSE/response store/Mobile 持久化问题，而不是模型没跑。

### 3. 查对应 lowgw 日志

重点搜索：

- `database disk image is malformed`
- `Error handling request`
- `Invalid cross-device link`
- `refresh token was already consumed`
- `Authentication failed`
- `tool not found`
- `unknown toolset`

不要只看 `/health`。`/health` 只能说明 API server 活着，不代表当前 run 能成功。

### 4. 验证真实生产 schema

必须验证真实生产启动形态：

- `HERMES_HOME=/home/hermes/.hermes`
- `HERMES_PROFILE=lowgwN`
- profile config 通过 `/home/hermes/.hermes/profiles/lowgwN/config.yaml` 生效
- base config `/home/hermes/.hermes/config.yaml` 存在且包含低权限基础 toolsets

不要只用 `HERMES_HOME=/home/hermes/.hermes/profiles/lowgwN` 做 probe。

### 5. 确认进程不是旧的

每次改 lowgw profile/config/plugin 后，重启 Gateway Pool 必须确认旧 lowgw 被停止：

- 端口 `18751..18760` 都健康。
- 进程启动时间晚于配置同步时间。
- 最新 session 的 tool schema 与预期一致。

### 6. 检查 auth realpath

低网关共享 auth 应在 telemetry profile 同一文件系统：

- `/mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles/shared-auth/auth.json`
- `/mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles/shared-auth/auth.lock`

不要让 profile 侧临时文件跨 `/mnt/c` 和 ext4 原子替换。

### 7. 检查 profile SQLite

对每个 lowgw 检查：

- `state.db`
- `response_store.db`

完整性：

- `PRAGMA integrity_check` 应返回 `ok`。

侧车文件：

- `-shm` 正常通常不是 3 字节这类异常小文件。
- 如果 DB integrity ok 但 `-shm` 异常且 WAL 为空，应清理侧车。

### 8. 最后才做模型 smoke

如果必须做模型 smoke：

- 先确认用户额度风险。
- 优先做最小 prompt。
- 先直接低网关 smoke，再 Mobile route smoke。
- 不要在根因未定位时连续让用户重试。

## 当前稳定状态

截至修复完成：

- 低网关 policy 和真实 schema 已对齐。
- `weather` 是真实 callable。
- `http_request` 是真实 callable。
- lowgw 共享 auth 位于 telemetry profiles 同文件系统。
- Gateway Pool 重启会先停旧 lowgw。
- Gateway Pool 启动会检查并隔离损坏的 lowgw profile SQLite DB/sidecar。
- 生产 `/api/status` 返回：
  - `ok=true`
  - `health=ok`
  - `activeGlobal=0`
  - `workerCount=12`
- `lowgw1..10` 的 `state.db` 和 `response_store.db` integrity 均为 `ok`。

## 不变的边界

- 没有修改官方 Hermes 源码。
- 这些修复属于 Hermes Mobile 产品层：
  - Gateway plugin
  - lowgw profile/config provisioning
  - Gateway Pool startup hardening
  - production runtime repair
- 官方 Hermes 仍负责 agent loop、tool execution、sessions、response store、artifacts。
- Hermes Mobile 负责调度、权限、低网关 profile 装配、运行前健康检查和生产恢复。

## 后续改进建议

1. Mobile UI 不应只显示 `run failed` / `terminated`，应至少展示内部分类：
   - auth failure
   - missing callable
   - gateway stream failed
   - response store failure
   - quota/model failure
2. `/api/status` 可增加非敏感 lowgw diagnostics：
   - tool schema marker
   - auth same-filesystem marker
   - profile SQLite integrity marker
3. Gateway Pool startup 日志应记录每个 lowgw 的 profile config mtime、process start time、plugin enabled markers。
4. 对 `response_store.db` 失败可考虑自动降级：如果 Gateway session 后续完成，Mobile 可以提供“从 Gateway session 恢复结果”的后台修复入口。
5. 衣橱等高频工作流应有一次性 preflight：
   - `skills`
   - `file`
   - `weather`
   - `http_request`
   - Program API manifest/bundle reachability

## 快速判断表

| 现象 | 首要怀疑 | 证据位置 | 常见修复 |
| --- | --- | --- | --- |
| 权限摘要有工具，但模型说没有 callable | policy/schema 不一致或旧进程 | lowgw session tool list、profile config、base config | 修 `configure-low-gateways.sh` 并重启/替换旧 lowgw |
| 刚部署后仍像旧行为 | 旧 lowgw 进程占端口 | 进程启动时间、端口、session schema | 先 stop `lowgw1..10` 再 start |
| 1-2 秒 `run failed` | auth 或 Gateway 初始化失败 | lowgw logs | 查 auth realpath、refresh status |
| `Invalid cross-device link` | auth 跨文件系统替换 | lowgw logs、auth symlink realpath | auth 放到 telemetry profiles 同文件系统 |
| Mobile `terminated` 但 session 后续完成 | SSE/response store/Mobile 持久化失败 | lowgw session、agent.log、Mobile SQLite | 查 `response_store.db` integrity，必要时恢复 message |
| `database disk image is malformed` | profile SQLite 损坏 | lowgw logs、`PRAGMA integrity_check` | 隔离 DB/sidecar，让 Gateway 重建 |

