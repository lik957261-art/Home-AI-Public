# Hermes-Codex Mux Bridge 正式实现文档

本文是 Hermes Mobile 与 Codex Mobile 之间固定线程协作机制的正式说明。它用于后续续接、部署、联调和排障，不依赖聊天上下文。

## 1. 当前状态

截至 2026-05-22，本机制已经完成第一阶段最小闭环：

- Hermes Mobile 侧已实现并部署生产：
  - `adapters/hermes-codex-mux-service.js`
  - `server-routes/hermes-codex-mux-api-routes.js`
  - 已接入 `server-routes/mobile-api-composition.js`
  - 已接入 `server-routes/mobile-api-dispatcher.js`
  - 已接入 `adapters/api-route-inventory.js`
- Codex Mobile 侧已实现轮询 worker：
  - 默认 workerId：`codex-hermes-main`
  - 默认 bridgeId：`hermes-mobile-codex-main`
  - 默认 Hermes Mux base URL：`http://127.0.0.1:8797`
  - 第一版不开放 Codex 入站端口，采用 Codex worker 主动轮询 Hermes Mux API。
- 生产已验证：
  - Hermes Mux task 创建成功。
  - Codex worker heartbeat 成功。
  - Codex worker preflight 成功。
  - Hermes 和 Codex 均可向同一个 task event log 写入事件。
  - Codex worker 能读取 task capsule 和 workspace context metadata。

对应本地提交：

- `31c77d3 接入 Hermes Codex Mux 固定线程桥接 API`

## 2. 设计目标

用户在 Hermes Mobile 中讨论工程需求时，不希望 Hermes 直接把 Codex 当作不可控工具调用。目标是让需求进入一个可见、可审计、可恢复的 Mux 任务流：

```text
Hermes Mobile Chat
  -> Hermes-Codex Mux task
  -> 固定 Codex Mobile worker
  -> Codex 执行工程任务
  -> 必要时向 Hermes 请求协作
  -> Hermes 返回结构化结果
  -> Codex 继续执行
  -> 验证、交付、归档
```

关键要求：

- 手机界面最终要能看到完整任务事件流。
- Hermes 与 Codex 之间通过结构化事件协作。
- 默认固定一个 Codex 工程线程，避免多线程争抢同一工作区。
- 线程上下文不能靠聊天继承，必须靠 task capsule、event log 和 workspace handoff 恢复。
- 跨系统通信不能成为远程 shell。

## 3. 当前通信方式

当前机制是 **HTTP listener API 机制**，不是进程内调用，也不是文件轮询。

当前生产默认：

```text
Hermes Mobile listener: http://127.0.0.1:8797
Codex worker base URL: http://127.0.0.1:8797
```

也就是说，当前已部署的形态是：

```text
Codex Mobile worker
  -> HTTP polling
  -> Hermes Mobile /api/codex-mux/*
  -> Hermes Mobile SQLite
```

当前 Hermes Mobile 持久化位置是生产 Hermes Mobile SQLite：

```text
C:\ProgramData\HermesMobile\data\hermes-mobile.sqlite3
```

Mux service 会在该库中按需创建表：

- `codex_mux_tasks`
- `codex_mux_events`
- `codex_mux_worker_heartbeats`

## 4. 跨机器部署方式

如果 Hermes Mobile 与 Codex Mobile 不在同一台机器，机制仍然可以工作，因为协议是 HTTP。

### 4.1 推荐方式：Tailnet HTTPS

Hermes Mobile 已有 tailnet HTTPS origin：

```text
https://<hermes-mobile-tailnet-host>/
```

Codex Mobile worker 可以把 base URL 改为该地址：

```powershell
cd <codex-mobile-web-workspace>
npm.cmd run mux:worker -- --base-url https://<hermes-mobile-tailnet-host> --poll-ms 5000
```

或通过环境变量：

```powershell
$env:CODEX_HERMES_MUX_BASE_URL = "https://<hermes-mobile-tailnet-host>"
npm.cmd run mux:worker -- --poll-ms 5000
```

这种方式要求：

- Codex Mobile 所在机器能访问 tailnet HTTPS 地址。
- Codex worker 请求携带有效认证 header。
- 后续应改用 Mux 专用 Bridge Key，而不是长期复用 Owner Access Key。

### 4.2 公网域名方式

可以使用公网 HTTPS 域名，但不建议第一阶段采用。若采用，必须具备：

- HTTPS。
- Mux 专用 key。
- IP allowlist 或 VPN。
- rate limit。
- audit log。
- 禁止任意 shell capability。

### 4.3 中继 Mux 服务方式

如果双方都不能接受入站连接，可以未来改为：

```text
Hermes Mobile -> Mux Relay <- Codex Mobile
```

两边都主动 outbound polling 或 WebSocket。该方式最通用，但第一阶段复杂度过高，暂不实现。

## 5. 固定 worker 策略

第一阶段不做通用多 worker 调度。Hermes Mobile 工程任务默认绑定一个固定 Codex worker：

```json
{
  "bridgeId": "hermes-mobile-codex-main",
  "workspace": "<agent-private-workspace>",
  "workerMode": "sticky",
  "assignedWorker": "codex-hermes-main",
  "requiresSameThread": true,
  "handoverAllowed": false
}
```

这样做的原因：

- Hermes Mobile 工程修改通常只应由一个 Codex 工程线程处理。
- 固定线程更容易维持连续上下文。
- 避免多个 Codex worker 同时修改同一个工作区。
- 用户在 Hermes Mobile 上看到的是一个稳定的工程执行者。

如果固定 worker 不可用，Mux 应标记 worker unavailable。是否允许新线程接管，需要用户确认。接管线程必须读取 task capsule、event log、`.agent-context/PROJECT_CONTEXT.md`、`.agent-context/HANDOFF.md` 和任务 handoff。

## 6. Task Capsule

Task Capsule 是执行线程的事实合同，不是聊天摘要。

当前共享任务 capsule 示例文件：

```text
.agent-context/mux-tasks/hermes-codex-mux-v1/TASK_CAPSULE.json
```

基本结构：

```json
{
  "schema": "hermes-codex-mux.task.v1",
  "taskId": "hermes-codex-mux-v1",
  "title": "Hermes Mobile 与 Codex Mobile 固定线程双向协作闭环",
  "workspace": "<agent-private-workspace>",
  "bridgeId": "hermes-mobile-codex-main",
  "assignedWorker": "codex-hermes-main",
  "workerMode": "sticky",
  "requiresSameThread": true,
  "handoverAllowed": false,
  "requiredReads": [
    ".agent-context/PROJECT_CONTEXT.md",
    ".agent-context/HANDOFF.md",
    ".agent-context/mux-tasks/hermes-codex-mux-v1/CODEX_MOBILE_HANDOFF.md",
    "docs/HERMES_CODEX_MUX_BRIDGE_IMPLEMENTATION.zh-CN.md"
  ]
}
```

Codex worker 接到任务后必须先按 capsule 做 preflight。

## 7. Event Envelope

所有跨系统通信都写入 task event log。

标准事件 envelope：

```json
{
  "schema": "hermes-codex-mux.event.v1",
  "eventId": "evt_...",
  "taskId": "hermes-codex-mux-v1",
  "type": "progress",
  "from": "codex",
  "to": "mux",
  "workerId": "codex-hermes-main",
  "requestId": "",
  "status": "running",
  "summary": "Codex worker is ready for the Mux task.",
  "artifactRefs": [],
  "payload": {},
  "createdAt": "2026-05-22T03:46:06.452Z"
}
```

当前允许的事件类型：

- `task.requested`
- `task.accepted`
- `worker.preflight.started`
- `worker.preflight.completed`
- `progress`
- `plan.proposed`
- `assistance.requested`
- `assistance.result`
- `approval.requested`
- `approval.result`
- `patch.proposed`
- `validation.started`
- `validation.result`
- `deploy.started`
- `deploy.result`
- `artifact.created`
- `task.final`
- `task.error`
- `worker.blocked.context_conflict`

不支持的事件类型会 fail closed。例如不允许通过事件写入 `remote.shell` 之类任意执行语义。

## 8. Assistance Request

当 Codex 需要 Hermes 配合时，Codex 不应通过聊天临时喊话，而应写 `assistance.requested`。

示例：

```json
{
  "type": "assistance.requested",
  "requestId": "req_...",
  "taskId": "hermes-codex-mux-v1",
  "from": "codex",
  "to": "hermes",
  "capability": "hermes.production.status.query",
  "input": {
    "endpoint": "/api/status",
    "summaryOnly": true
  },
  "constraints": {
    "noSecrets": true,
    "noFullLearnerContent": true,
    "noLongLogs": true
  }
}
```

Hermes 返回 `assistance.result`，必须使用相同 `taskId` 和 matching `requestId`：

```json
{
  "type": "assistance.result",
  "requestId": "req_...",
  "taskId": "hermes-codex-mux-v1",
  "from": "hermes",
  "to": "codex",
  "status": "ok",
  "summary": "activeGlobal=0, health=ok, workerCount=13",
  "payload": {
    "activeGlobal": 0,
    "health": "ok",
    "workerCount": 13
  }
}
```

Codex worker 通过读取 task events，按 `requestId` 匹配结果后继续。

## 9. Hermes Mobile API

当前生产已实现以下 Owner-only API：

```text
GET  /api/codex-mux/tasks
POST /api/codex-mux/tasks
GET  /api/codex-mux/tasks/:taskId
GET  /api/codex-mux/tasks/:taskId/events
POST /api/codex-mux/tasks/:taskId/events
POST /api/codex-mux/workers/:workerId/heartbeat
```

### 9.1 List Tasks

```text
GET /api/codex-mux/tasks?assignedWorker=codex-hermes-main&status=open,running
```

返回：

```json
{
  "ok": true,
  "tasks": []
}
```

### 9.2 Create Or Update Task

```text
POST /api/codex-mux/tasks
```

请求示例：

```json
{
  "taskId": "hermes-codex-mux-v1",
  "title": "Hermes Codex Mux smoke",
  "status": "open",
  "workspace": "<agent-private-workspace>",
  "assignedWorker": "codex-hermes-main",
  "capsule": {
    "taskId": "hermes-codex-mux-v1",
    "assignedWorker": "codex-hermes-main",
    "workspace": "<agent-private-workspace>"
  }
}
```

### 9.3 Task Detail

```text
GET /api/codex-mux/tasks/:taskId
```

返回包含：

- `task`
- `capsule`
- `workerLease`
- `heartbeat`

当前第一阶段 `workerLease.leaseUntil` 为空，仅返回 assigned worker 的 placeholder。后续应实现真实 lease。

### 9.4 Task Events

```text
GET /api/codex-mux/tasks/:taskId/events
POST /api/codex-mux/tasks/:taskId/events
```

`POST` body 使用 event envelope。

### 9.5 Worker Heartbeat

```text
POST /api/codex-mux/workers/codex-hermes-main/heartbeat
```

请求示例：

```json
{
  "bridgeId": "hermes-mobile-codex-main",
  "workspace": "<agent-private-workspace>",
  "mode": "polling",
  "capabilities": [
    "codex.workspace.preflight",
    "codex.repo.inspect",
    "codex.patch.propose",
    "codex.validation.run",
    "codex.handoff.update"
  ],
  "currentTaskId": ""
}
```

## 10. Codex Mobile Worker

Codex Mobile 侧最小 worker 已实现于：

```text
<codex-mobile-web-workspace>
```

默认运行方式：

```powershell
cd <codex-mobile-web-workspace>
npm.cmd run mux:worker -- --base-url http://127.0.0.1:8797 --poll-ms 5000
```

指定任务：

```powershell
npm.cmd run mux:worker -- --task-id hermes-codex-mux-v1
```

跨机器 tailnet：

```powershell
npm.cmd run mux:worker -- --base-url https://<hermes-mobile-tailnet-host> --poll-ms 5000
```

环境变量：

- `CODEX_HERMES_MUX_BASE_URL`
- `CODEX_HERMES_MUX_WORKSPACE`
- `CODEX_HERMES_MUX_WORKER_ID`
- `CODEX_HERMES_MUX_TIMEOUT_MS`
- `CODEX_HERMES_MUX_POLL_MS`
- `CODEX_HERMES_MUX_AUTH_HEADER_NAME`
- `CODEX_HERMES_MUX_AUTH_VALUE_FILE`

## 11. Preflight 规则

Codex worker 接到任务后必须先写：

- `worker.preflight.started`
- `worker.preflight.completed`

preflight 必须检查：

- workspace 是否存在。
- workspace 是否等于 task capsule 中的 workspace。
- task 是否分配给 `codex-hermes-main`。
- 是否存在其他未过期 worker lease。
- required context 文件是否存在。
- git root、HEAD、branch。
- `git status -sb`。
- `git status --short --untracked-files=all`。

如果发现冲突，必须写：

```text
worker.blocked.context_conflict
```

并停止执行。

## 12. 安全边界

当前实现的安全边界：

- API 为 Owner-only。
- 不支持任意远程 shell 事件类型。
- event payload 会做基础 sanitization：
  - exact secret/token/access-key/password/push-endpoint 字段 redaction。
  - 长字符串截断。
  - 数组长度限制。
  - 嵌套深度限制。
- Codex preflight 只上传上下文文件 metadata：
  - 相对路径
  - exists
  - bytes
  - 短 sha256
  - 不上传文件正文。

仍需后续增强：

- 独立 Mux Bridge Key。
- 只允许 Bridge Key 访问 `/api/codex-mux/*`。
- worker lease 真实过期/接管机制。
- capability registry 的权限等级和审批规则。
- Mux task UI 中的用户确认按钮。

## 13. 当前认证状态

当前生产 smoke 和本机联调用的是 Owner Access Key header。

这是第一阶段可接受的工程联调方式，但不应作为长期跨机器 worker 认证方式。

后续推荐新增：

```text
HERMES_CODEX_MUX_BRIDGE_KEY_PATH
```

并支持独立 header，例如：

```text
x-hermes-codex-mux-key: <bridge-key>
```

该 key 只能访问：

```text
/api/codex-mux/*
```

不能访问普通聊天、文件、Growth 学生内容、Access Key 管理、runtime config 等接口。

## 14. 联调 Runbook

### 14.1 查 Hermes Mobile 状态

```powershell
$key = (Get-Content -LiteralPath "C:\ProgramData\HermesMobile\data\secrets\owner-web-key.secret" -Raw).Trim()
curl.exe -s -H "x-hermes-web-key: $key" http://127.0.0.1:8797/api/status
```

关注：

- `ok=true`
- `health.status=ok`
- `concurrency.activeGlobal=0`
- `gatewayPool.workerCount`

### 14.2 启动 Codex worker

```powershell
cd <codex-mobile-web-workspace>
npm.cmd run mux:worker -- --base-url http://127.0.0.1:8797 --poll-ms 5000
```

### 14.3 查看 worker heartbeat

```powershell
$key = (Get-Content -LiteralPath "C:\ProgramData\HermesMobile\data\secrets\owner-web-key.secret" -Raw).Trim()
curl.exe -s -H "x-hermes-web-key: $key" http://127.0.0.1:8797/api/codex-mux/tasks/hermes-codex-mux-v1
```

确认：

- `heartbeat.workerId=codex-hermes-main`
- `heartbeat.mode=polling`
- `heartbeat.observedAt` 持续更新。

### 14.4 查看事件流

```powershell
curl.exe -s -H "x-hermes-web-key: $key" http://127.0.0.1:8797/api/codex-mux/tasks/hermes-codex-mux-v1/events?limit=80
```

正常应看到：

- `worker.preflight.started`
- `worker.preflight.completed`
- `progress`
- `plan.proposed`

## 15. 已验证的生产联通事实

2026-05-22 生产联调观察到：

- Codex worker heartbeat 正常。
- `workerId=codex-hermes-main`
- `mode=polling`
- `workspace=<agent-private-workspace>`
- `gitStatus=clean`
- `gitHead=31c77d3...`
- `conflicts=[]`
- required context 文件全部存在。
- Hermes 已向同一 task event log 写入确认事件：

```text
Hermes Mobile confirms Codex worker heartbeat and preflight are normal.
```

## 16. 尚未完成

以下属于下一阶段，不属于当前最小闭环：

- Hermes 聊天中“一键升级为 Mux 任务”的 UI/自然语言入口。
- Hermes Mobile Mux 任务面板。
- `assistance.requested` 的 Hermes capability runner。
- `assistance.result` 自动写回。
- 真实 worker lease。
- Mux Bridge Key。
- 用户审批流。
- artifact/diff/validation 的移动端展示。
- Codex 入站端口。第一版暂不需要。

## 17. 开发与验证命令

Hermes Mobile 侧 focused checks：

```powershell
node tests\hermes-codex-mux-service.test.js
node tests\hermes-codex-mux-api-routes.test.js
node tests\api-route-inventory.test.js
node tests\mobile-api-dispatcher.test.js
node tests\architecture-refactor-boundary.test.js
git diff --check
```

完整门禁：

```powershell
npm.cmd run productization:check
```

生产部署前：

```powershell
curl.exe -s -H "x-hermes-web-key: <key>" http://127.0.0.1:8797/api/status
```

部署后：

```powershell
curl.exe -s -H "x-hermes-web-key: <key>" http://127.0.0.1:8797/api/codex-mux/tasks?assignedWorker=codex-hermes-main&status=open,running
```

