# Hermes-Codex Mux Bridge 实现方案

本文描述 Hermes Mobile 与 Codex Mobile 之间的双向协作入口。目标不是让 Hermes 直接控制 Codex，也不是让 Codex 直接控制 Hermes，而是把 Hermes 中产生的工程需求升级成可见、可审计、可恢复的 Mux 任务流，由固定 Codex 工程线程执行，Hermes 按能力协作，用户在手机界面看到完整闭环。

## 目标

- 用户在 Hermes Mobile 聊天中提出需求后，可以一键升级为工程任务。
- 任务进入 Hermes Mobile 的 Mux 任务面板，而不是散落在聊天上下文里。
- Hermes Mobile 默认把 Hermes Mobile 工程任务绑定到一个固定 Codex 工程线程。
- Codex 执行过程中可以向 Hermes 请求协作，例如查询生产状态、查询 Growth 摘要、发送确认请求、运行 Hermes 自有能力。
- Hermes 和 Codex 都通过结构化事件交换进度、请求、结果、交付物和审批状态。
- 即使 Codex 线程压缩、重启或换线程，也能从 Mux task capsule 与工作区 handoff 恢复。

## 非目标

- 不做任意远程 shell。
- 不让 Hermes 直接执行 Codex 内部命令。
- 不让 Codex 绕过 Hermes Mobile 权限边界直接修改生产状态。
- 不跨桥传 raw secrets、Access Keys、OAuth tokens、push endpoints、完整学生提交、完整转写、完整题目、完整 raw prompts 或长日志。
- 第一阶段不做通用多 Codex worker 调度。默认使用固定 worker。

## 架构

```text
Hermes Mobile Chat
    |
    | task.requested
    v
Hermes-Codex Mux
    |                         ^
    | assignment / events      | assistance.result / user decision
    v                         |
Sticky Codex Worker Thread ----
    |
    | optional assistance.request
    v
Hermes Capability Runner
```

### 组件

- Hermes Mux service
  - 存储任务、事件、worker lease、能力请求、交付物引用、审批状态。
  - 建议文件：`adapters/hermes-codex-mux-service.js`。
- Hermes Mux routes
  - 提供任务创建、事件写入、事件读取、协作请求、审批接口。
  - 建议文件：`server-routes/hermes-codex-mux-api-routes.js`。
- Hermes Mux UI
  - 手机端任务面板，显示当前 Codex 工程线程、任务状态、事件流、阻塞点和操作按钮。
  - 建议文件：`public/app-hermes-codex-mux-ui.js`、`public/app-hermes-codex-mux-controller.js`。
- Codex Mobile bridge worker
  - 固定线程轮询或接收 Mux 任务，执行 preflight，写回事件，必要时请求 Hermes 协作。
  - 另一线程实现，见 `.agent-context/mux-tasks/hermes-codex-mux-v1/CODEX_MOBILE_HANDOFF.md`。

## 固定线程策略

默认每个 Hermes Mobile 工程 workspace 只绑定一个 Codex engineering worker：

```json
{
  "bridgeId": "hermes-mobile-codex-main",
  "workspace": "C:\\Users\\xuxin\\Documents\\Agent",
  "workerMode": "sticky",
  "assignedWorker": "codex-hermes-main",
  "requiresSameThread": true,
  "handoverAllowed": false
}
```

如果固定线程不可用，Mux 只标记 `worker_unavailable`。是否允许新线程接管，需要用户确认。接管线程必须读取 task capsule、Mux event log、工作区 `.agent-context/PROJECT_CONTEXT.md`、`.agent-context/HANDOFF.md` 和任务 handoff。

## Task Capsule

Hermes 把需求升级成任务时生成 task capsule。它是执行线程的事实合同，不是聊天摘要。

```json
{
  "schema": "hermes-codex-mux.task.v1",
  "taskId": "mux_...",
  "title": "修复 Growth 待修订任务回显",
  "source": {
    "system": "hermes-mobile",
    "threadId": "single-window-or-topic-thread",
    "messageIds": ["..."]
  },
  "workspace": "C:\\Users\\xuxin\\Documents\\Agent",
  "assignedWorker": "codex-hermes-main",
  "userIntent": "...",
  "constraints": [
    "默认只做本地 commit，不 push",
    "生产部署前确认 activeGlobal=0",
    "不打印 raw secrets 或完整学生内容",
    "mobile-server-runtime.js <= 2500"
  ],
  "requiredReads": [
    ".agent-context/PROJECT_CONTEXT.md",
    ".agent-context/HANDOFF.md",
    ".agent-context/mux-tasks/<taskId>/HANDOFF.md"
  ],
  "acceptanceCriteria": [
    "用户手机界面能看到任务事件流",
    "Codex 可以请求 Hermes 协作并收到结果",
    "上下文切换时可恢复"
  ]
}
```

## Event Schema

所有跨系统通信都用事件。事件必须有 `eventId`、`taskId`、`type`、`from`、`createdAt`。

```json
{
  "schema": "hermes-codex-mux.event.v1",
  "eventId": "evt_...",
  "taskId": "mux_...",
  "type": "progress",
  "from": "codex",
  "to": "mux",
  "summary": "已定位到发送后滚动回跳的原因",
  "status": "running",
  "artifactRefs": [],
  "createdAt": "2026-05-22T10:30:00+08:00"
}
```

### 事件类型

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

## Assistance Request

Codex 需要 Hermes 配合时，发结构化请求：

```json
{
  "type": "assistance.requested",
  "requestId": "req_...",
  "taskId": "mux_...",
  "from": "codex",
  "to": "hermes",
  "capability": "hermes.production.status.query",
  "input": {
    "endpoint": "/api/status",
    "summaryOnly": true
  },
  "constraints": {
    "noSecrets": true,
    "noFullLearnerContent": true
  }
}
```

Hermes 返回：

```json
{
  "type": "assistance.result",
  "requestId": "req_...",
  "taskId": "mux_...",
  "from": "hermes",
  "to": "codex",
  "status": "ok",
  "summary": "activeGlobal=0, health=ok, workerCount=13",
  "data": {
    "activeGlobal": 0,
    "health": "ok",
    "workerCount": 13
  }
}
```

## Capability Registry

第一阶段只开放少量高价值能力。

### Hermes 暴露给 Codex

- `hermes.production.status.query`
  - 查询 `/api/status`、client version、worker pool summary。
- `hermes.growth.task.summary.query`
  - 查询 Growth 任务摘要，不返回完整学生提交、完整题目、完整报告。
- `hermes.notification.send`
  - 发用户可见状态通知。
- `hermes.automation.run.request`
  - 请求 Hermes Mobile 自动化立即运行，必须走权限与任务存在性校验。

### Codex 暴露给 Hermes

- `codex.workspace.preflight`
  - 报告 cwd、git status、HEAD、已读取上下文。
- `codex.repo.inspect`
  - 做只读诊断并返回摘要。
- `codex.patch.propose`
  - 提交补丁计划或 diff 摘要。
- `codex.validation.run`
  - 运行指定测试并回传摘要。
- `codex.handoff.update`
  - 更新任务 handoff 和工作区 handoff。

## Preflight

固定 Codex 线程开始处理任何 Mux 任务前，必须写入：

```json
{
  "type": "worker.preflight.completed",
  "taskId": "mux_...",
  "workspaceOk": true,
  "gitHead": "...",
  "gitStatus": "clean-or-dirty-summary",
  "contextRead": [
    ".agent-context/PROJECT_CONTEXT.md",
    ".agent-context/HANDOFF.md",
    ".agent-context/mux-tasks/<taskId>/HANDOFF.md"
  ],
  "conflicts": [],
  "ready": true
}
```

如果 cwd、HEAD、lease、生产状态或任务目标冲突，必须写 `worker.blocked.context_conflict`，不能继续执行。

## 存储

Hermes Mobile 生产运行态建议落 SQLite，避免只靠 JSON 文件：

- `codex_mux_tasks`
  - `task_id`
  - `title`
  - `status`
  - `workspace`
  - `assigned_worker`
  - `source_thread_id`
  - `capsule_json`
  - `created_at`
  - `updated_at`
- `codex_mux_events`
  - `event_id`
  - `task_id`
  - `type`
  - `from_party`
  - `to_party`
  - `request_id`
  - `status`
  - `summary`
  - `payload_json`
  - `created_at`
- `codex_mux_worker_leases`
  - `workspace`
  - `worker_id`
  - `lease_until`
  - `last_heartbeat_at`
  - `status`
- `codex_mux_capabilities`
  - `capability`
  - `provider`
  - `permission_level`
  - `requires_approval`
  - `enabled`

工作区文件只做人类可读 handoff 和跨线程启动包：

```text
.agent-context/mux-tasks/<taskId>/TASK_CAPSULE.json
.agent-context/mux-tasks/<taskId>/HANDOFF.md
.agent-context/mux-tasks/<taskId>/events.jsonl
```

## API 草案

Hermes Mobile:

- `POST /api/codex-mux/tasks`
- `GET /api/codex-mux/tasks`
- `GET /api/codex-mux/tasks/:taskId`
- `GET /api/codex-mux/tasks/:taskId/events`
- `POST /api/codex-mux/tasks/:taskId/events`
- `POST /api/codex-mux/tasks/:taskId/assistance`
- `POST /api/codex-mux/assistance/:requestId/result`
- `POST /api/codex-mux/tasks/:taskId/approval`
- `POST /api/codex-mux/workers/:workerId/heartbeat`

Codex Mobile 侧建议提供：

- `POST /api/hermes-mux/inbox`
- `GET /api/hermes-mux/tasks/:taskId`
- `POST /api/hermes-mux/tasks/:taskId/events`
- `POST /api/hermes-mux/tasks/:taskId/assistance-result`

第一版也可以不用 Codex 入站端口，先由 Codex worker 轮询 Hermes Mobile 的 Mux API。这样更容易调试，也少一个本地端口安全面。

## 手机 UI

Hermes Mobile 里新增 Mux 任务卡或任务页：

- 标题
- 当前处理方：Codex / Hermes / 用户
- 固定 Codex 线程状态：在线、离线、最后心跳
- 当前阻塞点
- 最近事件流
- 操作：
  - 继续
  - 暂停
  - 批准部署
  - 允许新线程接管
  - 打开交付物
  - 查看上下文 capsule

UI 必须遵守 Hermes Mobile control-panel 风格：移动端优先、低噪声、高状态可见性、避免大段解释性文本。

## 分工

### 本 Hermes Mobile 线程负责

- 设计并实现 Hermes Mobile Mux service、SQLite 存储、route、UI。
- 提供 Hermes capability runner 的第一批能力。
- 生成 task capsule 与事件流。
- 在 Hermes Mobile 页面展示任务闭环。

### Codex Mobile 线程负责

- 实现 Codex 侧 bridge worker/inbox。
- 支持固定 worker identity 与 heartbeat。
- 按 task capsule 做 preflight。
- 能写回 progress、assistance.requested、validation.result、task.final。
- 能从 `.agent-context/mux-tasks/<taskId>/` 读取启动上下文。

## 第一阶段验收

- Hermes Mobile 能从聊天需求创建 Mux 任务。
- Mux 任务在手机页面可见，显示固定 Codex worker 与事件流。
- Codex worker 能接收任务、完成 preflight、写回 progress。
- Codex 能请求 Hermes 查询生产状态，Hermes 返回结果，Codex 继续。
- 上下文文件能让另一个 Codex Mobile 线程准确理解分工和接口。
- 不 push；完成后只做本地 commit，除非用户明确要求 push。

