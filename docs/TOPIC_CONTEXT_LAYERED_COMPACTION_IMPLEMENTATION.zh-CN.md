# Hermes Mobile 主题上下文分层压缩实施方案

## 目标

把当前主题上下文从固定窗口装配，逐步升级为分层、可追溯、可回退的上下文装配机制。

当前问题不是单纯的窗口大小问题。固定使用最近若干条消息和固定字符上限，会在长主题、工具密集任务、自动化复盘、Hermes/Codex 协作流中反复注入历史原文和长工具输出，导致：

- 模型输入膨胀，首 token 和多轮工具调用变慢。
- 当前任务状态被历史内容挤掉。
- 长工具输出和交付文档污染 prompt。
- 旧结论、用户纠正、当前待办混在同一原文窗口里，模型难以判断优先级。

目标机制是：

1. 原始历史继续完整保存，但默认不全量进入 prompt。
2. 主题长期事实、约束、决策沉淀为 `topic_summary`。
3. 当前正在执行的任务状态沉淀为 `working_state`。
4. 工具结果先转为 `tool_result_digest`，长原文只作为证据引用。
5. 每次模型调用前通过 `context_assembly` 按预算动态装配上下文。
6. 保留源引用和回退开关，避免摘要错误不可审计。

## 设计原则

### 当前请求优先

当前用户最后一条消息、最近一次助手动作、当前活跃任务状态必须原文进入上下文。压缩摘要只能补充背景，不能替代当前请求。

### 异步压缩

压缩不应该阻塞发送路径。发送时使用上一次稳定的摘要和状态；如果摘要过期，通过最近窗口兜底，并在后台排队压缩。

### 可追溯

每条长期摘要事实、决策、用户偏好、风险判断都必须保留 `source_refs`，指向消息、工具结果、交付文件、任务事件或 artifact。没有来源的摘要不得覆盖原有事实。

### 可回退

上线必须保留配置开关，能够退回当前固定窗口装配模式。摘要缺失、损坏、版本冲突或压缩失败时，不阻断用户发送。

### 最小首步

第一阶段只改上下文装配和观测，不先做数据库大结构重构。先减少重复注入和长工具输出，再引入持久化摘要。

## 分层模型

### L0：不可压缩运行上下文

内容包括系统提示、权限边界、工具 schema、必要 Skill、平台约束、账号权限、运行时安全规则。

规则：

- 必须注入。
- 不参与主题压缩。
- 尽量保持稳定，减少 prompt cache 失效。
- 不记录 raw secrets、access key、OAuth token、push endpoint 等敏感内容。

### L1：主题沉淀摘要 `topic_summary`

用途是替代长历史原文，表达主题长期需要保留的事实和决策。

建议结构：

```yaml
topic_id: string
title: string
status: active | paused | archived
summary_version: integer
last_compacted_at: datetime | null
last_active_at: datetime
last_compacted_message_id: string | null
last_compacted_event_id: string | null

objective: string
current_state: string
confirmed_facts:
  - fact: string
    source_refs: [string]
user_preferences_constraints:
  - item: string
    source_refs: [string]
decisions:
  - decision: string
    rationale: string
    source_refs: [string]
open_questions:
  - question: string
    owner: user | hermes | codex | unknown
artifacts:
  - path_or_id: string
    type: file | task | automation | api | other
    note: string
entities:
  - name: string
    type: person | project | file | service | concept | other
    note: string
superseded_or_rejected:
  - old_item: string
    replaced_by: string
    source_refs: [string]
risks_notes:
  - item: string
    severity: low | medium | high
    source_refs: [string]
raw_history_refs:
  - ref: string
```

目标长度：

- 普通主题：1000 到 3000 中文字。
- 复杂项目：最多 5000 中文字。
- 超过上限时二次压缩，但不能直接丢弃来源引用。

### L2：当前任务状态 `working_state`

用途是服务一次连续任务，尤其是多工具、多 API call、多模型协作任务。它不是长期记忆，而是当前执行状态机。

建议结构：

```yaml
active_task: string
requested_by_user_at: datetime | null
status: planning | executing | blocked | completed | cancelled
current_step: string
completed_steps:
  - string
next_step: string
key_intermediate_results:
  - string
blocking_issues:
  - string
must_not_do:
  - string
pending_user_decisions:
  - string
source_refs:
  - string
```

目标长度：300 到 1000 中文字。

任务完成、阻塞或取消后，仍有长期价值的内容合并进 `topic_summary`，临时执行细节归档或清空。

### L3：短期原文窗口 `recent_window`

用途是保证当前对话细节不丢。

建议默认：

- 普通聊天：最近 6 到 8 条消息。
- 工具密集任务：最近 2 到 4 个 user/assistant 回合。
- 预算上限：约 8000 到 12000 tokens。
- 不再以固定 30 条消息作为硬规则，因为单条消息或工具结果可能非常大。

硬约束：

- 当前用户消息必须保留。
- 最近的待执行助手消息、工具计划、工具错误必须保留。
- 如果最近窗口中包含长 artifact 正文，只保留摘要和引用。

### L4：按需证据召回 `evidence_refs`

用途是在需要查证时召回原文或工具结果。

默认不注入完整原文。只有以下情况召回：

- 用户询问上次依据、路径、旧决定或原文细节。
- 当前任务明确依赖历史细节。
- `topic_summary` 中存在冲突、不确定项或来源不足。
- 需要审计某个结论来源。

建议每次最多召回 3 到 5 段，每段 500 到 1000 字。

### L5：工具结果摘要 `tool_result_digest`

用途是避免长 JSON、网页正文、日志、搜索结果、测试输出原样回填。

建议结构：

```yaml
tool_name: string
call_goal: string
status: success | partial | failed
key_outputs:
  - string
artifact_refs:
  - string
errors:
  - string
next_step_hint: string | null
retain_raw: boolean
raw_ref: string | null
```

规则：

- 单次工具输出超过约 4000 tokens，默认先 digest。
- 多 API call 时，只把 digest 带回模型上下文。
- 原始结果保存为 evidence，不默认注入。
- 对测试输出、接口 smoke、文件列表等结构化结果，优先用确定性摘要；只有语义压缩必要时才调用模型。

## 上下文装配算法

每次模型调用前由 `context_assembly` 执行：

1. 注入 L0 运行上下文。
2. 注入 L1 `topic_summary`；如果不存在，注入空摘要占位和主题基础信息。
3. 如果存在活跃任务，注入 L2 `working_state`。
4. 注入受预算限制的 L3 `recent_window`。
5. 根据当前用户请求检索 L4 `evidence_refs`，只有相关时注入。
6. 注入必要的 L5 `tool_result_digest`，不注入长原始工具结果。
7. 如果超过预算，按以下顺序裁剪：
   - 先裁剪 evidence 数量。
   - 再裁剪 recent window。
   - 再压缩 working state。
   - topic summary 只允许二次压缩，不直接丢弃。

## Context Profile

初始支持四类 profile：

```yaml
normal_chat:
  recent_messages: 8
  recent_token_budget: 12000
  evidence_chunks: 3
tool_dense:
  recent_messages: 4
  recent_token_budget: 8000
  evidence_chunks: 2
historical_lookup:
  recent_messages: 4
  recent_token_budget: 8000
  evidence_chunks: 5
long_form_generation:
  recent_messages: 6
  recent_token_budget: 12000
  evidence_chunks: 5
```

Profile 选择原则：

- 默认 `normal_chat`。
- 一次回复中工具调用较多、存在长工具输出、正在执行自动化或 Codex Mux 协作时使用 `tool_dense`。
- 用户明确询问历史依据、旧文件、之前结论时使用 `historical_lookup`。
- 生成长文档、方案、报告时使用 `long_form_generation`。

## 持久化设计

第一阶段可以只保留接口占位和装配日志。第二阶段建议使用 SQLite 表或现有线程状态旁路字段。

推荐表结构：

### `topic_context_summaries`

字段：

- `topic_id`
- `task_group_id`
- `workspace_id`
- `summary_json`
- `summary_version`
- `last_compacted_message_id`
- `last_compacted_event_id`
- `input_hash`
- `created_at`
- `updated_at`

### `topic_working_states`

字段：

- `topic_id`
- `task_group_id`
- `workspace_id`
- `state_json`
- `state_version`
- `status`
- `created_at`
- `updated_at`

### `topic_context_refs`

字段：

- `ref_id`
- `topic_id`
- `task_group_id`
- `workspace_id`
- `ref_type`: `message | tool | artifact | file | run | automation | other`
- `target_id`
- `digest`
- `created_at`

并发更新规则：

- 更新摘要时必须带上当前 `summary_version` 或 `input_hash`。
- 如果版本不匹配，压缩结果不得直接覆盖，应重新合并或丢弃本次后台结果。
- 发送路径永远读取最后一个稳定版本。

## 压缩触发

事件触发优先，定时触发兜底。

### 事件触发

- 主题新增原文超过 8000 到 12000 tokens。
- `recent_window` 超过预算。
- 单次工具输出超过约 4000 tokens。
- 连续工具调用超过 5 次。
- 当前任务 `completed`、`blocked` 或 `cancelled`。
- 用户显式要求沉淀、压缩上下文、总结主题。

### 定时触发

定时触发放在后期阶段，不作为第一阶段上线内容。

建议：

- 每 10 到 30 分钟扫描活跃主题。
- 主题 30 分钟无新消息后，合并 `working_state` 到 `topic_summary`。
- 每天对非活跃主题做归档压缩。

## 实施阶段

### 阶段 1：上下文装配服务化和预算化

目标：不改大存储，先降低 token 浪费和长工具输出污染。

任务：

1. 找到当前主题上下文装配入口和固定窗口限制。
2. 新增 `adapters/context-assembly-service.js` 或同等 focused service。
3. 把消息窗口、字符预算、profile 选择从散落逻辑收敛到服务。
4. 支持 `normal_chat` 和 `tool_dense` 两个 profile。
5. 工具密集任务 recent window 降到约 4 条或 2 到 4 个回合。
6. 长工具输出默认改为 digest 或 bounded preview，不全量回填。
7. 增加上下文装配 debug metadata：
   - `profile`
   - `summaryVersion`
   - `recentMessageCount`
   - `evidenceChunkCount`
   - `toolDigestCount`
   - `estimatedChars`
   - `fallbackUsed`
8. 不打印完整 prompt，不打印 secrets，不打印完整学生内容。

验收：

- 当前用户最后请求不会丢。
- 多工具调用后续请求不再反复携带长历史和长工具输出。
- 有开关可退回旧逻辑。
- focused tests 和架构边界测试通过。

### 阶段 2：`topic_summary` 和 `working_state` 持久化

目标：主题长期信息和当前任务状态不再依赖最近原文窗口。

任务：

1. 增加 SQLite 表或现有状态字段。
2. 增加 summary/state repository 或 service。
3. 发送路径读取最后稳定摘要。
4. 后台压缩任务写入新版本摘要。
5. 支持版本号和并发保护。
6. 任务结束时把长期价值内容合并进 summary，清理 working state。

验收：

- 关闭长 recent window 后，主题仍能保留关键事实和决策。
- 用户纠正能够覆盖旧事实，并进入 `superseded_or_rejected`。
- 摘要缺失或压缩失败时能回退 recent window。

### 阶段 3：证据引用和按需召回

目标：摘要可审计，历史细节可按需恢复。

任务：

1. 为消息、工具结果、artifact、交付文档建立 `source_ref`。
2. 增加轻量 evidence 检索。
3. 在 `historical_lookup` profile 中注入相关 evidence。
4. 在 UI 或调试信息中显示摘要来源数量和证据召回数量。

验收：

- 用户问“之前依据是什么”时能召回相关原文片段。
- 摘要结论可以追到来源。
- 默认聊天不注入大量 evidence。

### 阶段 4：后台自动沉淀

目标：非阻塞地维护主题摘要质量。

任务：

1. 增加后台 compaction job。
2. 根据阈值或空闲时间触发。
3. 非活跃主题归档压缩。
4. 记录压缩版本、输入范围、输出摘要长度和失败原因。

验收：

- 发送路径不等待压缩。
- 压缩失败不会影响聊天。
- 后台任务不会频繁扫描造成生产负载异常。

## 服务边界建议

推荐新增或改造以下边界：

- `adapters/context-assembly-service.js`
  - 负责 profile 选择、预算、recent/evidence/tool digest 装配。
- `adapters/topic-context-summary-service.js`
  - 负责摘要读取、合并、版本更新。
- `adapters/topic-working-state-service.js`
  - 负责当前任务状态读写。
- `adapters/tool-result-digest-service.js`
  - 负责工具输出摘要和 raw ref 绑定。
- `server-routes` 只负责注入服务和返回 bounded debug metadata。

不要把压缩状态机、摘要 merge、evidence 检索直接写进 `server.js` 或 `mobile-server-runtime.js`。

## 隐私与安全边界

不得写入长期摘要或调试日志：

- raw secrets、Access Keys、OAuth tokens、API keys。
- push endpoints。
- credential XML。
- 完整学生作文、完整录音转写、完整阅读材料、完整题目、完整答案。
- raw prompts、完整模型响应、长工具日志。

学习成长场景只允许写入 summary-only 信号和 source refs。

## 回退策略

必须提供至少一个配置开关：

```text
HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE=legacy | layered
```

建议默认上线策略：

1. 本地默认 `layered`。
2. 生产先灰度到 Owner 或指定 workspace。
3. 发现摘要异常、上下文缺失、发送失败时切回 `legacy`。

回退后：

- 不删除已生成的 summary/state。
- 发送路径恢复旧窗口。
- 保留 debug metadata 便于排查。

## 测试计划

### 单元测试

- profile 选择。
- recent window 裁剪。
- 当前用户最后消息强制保留。
- 长工具输出转 digest。
- summary 缺失 fallback。
- summary version 冲突不覆盖。
- 用户纠正写入 `superseded_or_rejected`。

### 路由和集成测试

- 普通聊天仍能正常回复。
- 工具密集任务后续 call 的上下文字符数下降。
- 历史查询能召回 evidence。
- Codex Mux 协作流不被压缩丢当前状态。
- 学习成长主题不把完整学生内容写入 summary。

### 生产 smoke

- `/api/status`
- 普通 Chat 发送。
- 主题内 follow-up。
- 工具调用回复。
- 长工具输出场景。
- Owner 和 executor workspace 各一次。

## 第一轮 Codex 任务建议

第一轮只做阶段 1。

明确范围：

- 找到当前固定窗口和上下文拼装入口。
- 抽出 context assembly service。
- 实现 `normal_chat` / `tool_dense` profile。
- 限制长工具输出进入 prompt。
- 增加 bounded debug metadata。
- 增加 legacy/layered 回退开关。

不做：

- 不改完整数据库结构。
- 不做定时压缩。
- 不做全量历史检索。
- 不生成大规模摘要。
- 不改变用户可见聊天 UI。

## 当前结论

这套机制应按“先预算化装配，再持久化摘要，再证据召回，最后后台自动沉淀”的顺序推进。这样可以先解决慢和上下文浪费，又避免过早引入摘要污染、并发覆盖和不可审计的问题。
