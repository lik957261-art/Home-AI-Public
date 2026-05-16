# 凡凡成长学习系统架构与实施方案 v1.1

本文是 `docs/FANFAN_LEARNING_SYSTEM_ARCHITECTURE.zh-CN.md` 和凡凡学习计划目录中 `Hermes-StePhen凡凡成长学习系统架构与实施方案_v1.md` 的工程补充版。v1 的核心判断保持不变：不复制 Hermes Mobile，也不把学习系统做成割裂的新 App；先在 Hermes Mobile 内建立独立 `learning-growth` 垂直域，复用平台能力，后续可拆独立前端入口。

## 1. v1.1 补强范围

v1.1 固化六个新增工程边界：

1. 新增 `Curriculum Reference Service`，把公开课程标准、公开样题风格、年龄/年级难度阶梯纳入编排输入。
2. 明确任务卡类型体系，Orchestrator 必须支持单学科、跨学科、项目、错题修复、挑战、复习等卡型。
3. 明确凡凡端不是自由聊天入口，而是学习任务状态机。
4. 固化 AI 编排输入/输出 JSON Schema，服务层校验后才能落任务。
5. 固化错题讲解、变式修复、MVP API/数据表、儿童隐私与日志最小化规则。
6. 固化 AI 可靠性与幻觉防控层，把来源依据、结构化校验、评分验证、置信度、家长审核和审计流水作为一等工程边界。

## 2. Curriculum Reference Service

建议文件：

```text
adapters/curriculum-reference-service.js
tests/curriculum-reference-service.test.js
```

职责：

- 维护公开课程标准、公开样题风格、阅读分级、CS/Python 阶梯、AMC8/Math Kangaroo 风格参考。
- 根据 learner 年龄、年级、学校环境、英文环境、历史画像和家长目标输出可进入的下一步难度范围。
- 给 Orchestrator 提供 `curriculum_anchor` 和 `difficulty_ladder`，不直接生成题目。
- 明确版权边界：只记录公开标准、题型风格、能力点和难度特征，不复制受版权保护教材、付费题库、学校内部资料或完整题目答案。

核心实体：

```text
curriculum_reference
- reference_id
- subject
- source_type: public_standard / public_sample_style / reading_level / cs_pathway / contest_style
- title
- age_range
- grade_range
- region_or_system
- skill_tags[]
- difficulty_band
- style_summary
- allowed_use: style_reference / standard_reference / generated_derivative
- forbidden_use_notes
- source_url_or_path
- updated_at
```

Orchestrator 输入中的引用形态：

```json
{
  "curriculum_refs": [
    {
      "reference_id": "amc8-style-ratio-basic",
      "subject": "math",
      "skill_tags": ["ratio", "word_problem"],
      "difficulty_band": "grade_5_to_6_foundation",
      "style_summary": "公开竞赛样题风格摘要，不含原题全文",
      "allowed_use": "style_reference"
    }
  ]
}
```

## 3. 学习资料与课程参考的关系

学习资料分两类：

- `Learning Source Service`：凡凡自己的历史清洗资料、学校资料、私教资料、家长目标、任务结果。
- `Curriculum Reference Service`：公开课程标准、公开样题风格、年龄/年级难度阶梯。

规则：

- 历史清洗资料决定凡凡当前起点和已知弱点。
- 公开课程参考决定同龄/同年级可进入的系统性下一步范围。
- 近期任务卡只作为增量修正，不能覆盖长期画像。
- AI 编排不能只围绕最近错题“补洞”，必须同时考虑长期目标和公开难度阶梯。

## 4. 任务卡类型体系

`Learning Orchestrator Service` 输出任务卡时必须显式声明卡型：

```text
single_subject       # 单学科能力训练
cross_subject       # 跨学科综合任务
project_card        # 项目/作品任务
mistake_repair_card # 错题/薄弱点修复
challenge_card      # 稍高难度挑战
review_card         # 间隔复习/巩固
habit_card          # 学习习惯/表达/复述训练
```

任务卡基础 schema：

```json
{
  "task_id": "task_...",
  "learner_id": "weixin_stephen",
  "task_card_type": "mistake_repair_card",
  "primary_subject": "math",
  "involved_subjects": ["math", "english_expression"],
  "target_skill_ids": ["ratio_word_problem"],
  "source_basis_refs": ["source:amc8-report-001"],
  "curriculum_refs": ["curriculum:amc8-style-ratio-basic"],
  "estimated_minutes": 20,
  "difficulty_band": "foundation_plus",
  "interaction_policy": {
    "max_hints": 2,
    "requires_reflection": true,
    "requires_variant_repair": true
  },
  "reward_policy_ref": "reward:default-learning-repair",
  "kanban_card_id": "",
  "topic_thread_id": ""
}
```

## 5. AI 编排 JSON Schema

### 5.1 输入

服务层传给编排 Skill 的输入必须是窄上下文：

```json
{
  "schema_version": "learning_orchestrator_input_v1",
  "learner": {
    "learner_id": "weixin_stephen",
    "display_name": "凡凡",
    "grade_level": "private_profile_summary"
  },
  "goals": [
    {
      "goal_id": "goal_...",
      "type": "subject_goal",
      "summary": "目标摘要",
      "priority": 0.8
    }
  ],
  "profile_summary": {
    "strengths": ["摘要"],
    "weaknesses": ["摘要"],
    "motivation_notes": "摘要",
    "baseline_source_refs": ["source:..."]
  },
  "skill_states": [
    {
      "skill_id": "ratio_word_problem",
      "status": "weak",
      "baseline_confidence": 0.7,
      "recent_sample_size": 3
    }
  ],
  "curriculum_refs": [
    {
      "reference_id": "curriculum:...",
      "style_summary": "公开参考摘要",
      "difficulty_band": "foundation_plus"
    }
  ],
  "recent_attempt_summaries": [
    {
      "task_id": "task_...",
      "score": 80,
      "summary": "表现摘要",
      "mistake_types": ["concept_gap"]
    }
  ],
  "constraints": {
    "available_minutes": 40,
    "max_tasks": 3,
    "allowed_task_types": ["single_subject", "mistake_repair_card", "review_card"]
  },
  "privacy": {
    "no_full_child_answers": true,
    "no_full_transcripts": true,
    "use_refs_instead_of_raw_files": true
  }
}
```

### 5.2 输出

编排 Skill 必须输出可校验 JSON：

```json
{
  "schema_version": "daily_learning_plan_v1",
  "plan_id": "plan_...",
  "learner_id": "weixin_stephen",
  "scheduled_for": "2026-05-16",
  "tasks": [
    {
      "task_card_type": "mistake_repair_card",
      "title": "比例应用题修复",
      "primary_subject": "math",
      "involved_subjects": ["math"],
      "target_skill_ids": ["ratio_word_problem"],
      "source_basis_refs": ["source:..."],
      "curriculum_refs": ["curriculum:..."],
      "prompt_to_child": "短任务说明",
      "scoring_rubric_ref": "rubric:math-repair-v1",
      "estimated_minutes": 20,
      "base_coins": 10,
      "requires_parent_review": false
    }
  ],
  "rationale_summary": "给家长看的简短编排依据",
  "risk_flags": []
}
```

服务层必须校验：

- `task_card_type` 在允许集合内。
- `source_basis_refs` 和 `curriculum_refs` 只保存引用和摘要，不保存全文。
- 金币字段只是建议值，最终结算由 Reward Service 决定。
- 输出超出 JSON schema 时拒绝落库或进入人工审核。

## 6. 凡凡端交互状态机

凡凡端不是通用聊天窗口，而是每张任务卡的状态机。自由文本只作为状态机内的提交、复述、追问或反馈材料。

主流程：

```text
received
→ goal_explained
→ child_answering
→ hint_available
→ child_revised
→ submitted
→ scored
→ mistake_explained
→ child_reflected
→ variant_assigned
→ variant_submitted
→ repaired
→ reward_settled
→ feedback_looped
```

必要事件：

```text
learning_event
- event_id
- task_id
- learner_id
- event_type
- created_at
- actor_workspace_id
- summary
- score_delta
- source_refs[]
- artifact_refs[]
```

状态机规则：

- `hint_available` 不等于失败，提示次数进入评分和金币系数。
- `submitted` 后必须产生结构化 `evaluation_result`。
- `mistake_explained` 后必须要求凡凡复述错因。
- `variant_assigned` 的变式题不能只换数字，必须对应同一能力点的修复。
- `reward_settled` 只能由服务层触发，前端不能直接算金币。

## 7. 错题讲解与变式修复

`Evaluation Service` 对错题必须输出：

```json
{
  "mistake_explanation": {
    "mistake_type": "concept_gap",
    "child_friendly_reason": "错因摘要",
    "correct_thinking_steps": ["步骤摘要"],
    "mini_example": "小例子摘要",
    "reflection_prompt": "请凡凡复述自己哪里想错了"
  },
  "variant_repair": {
    "skill_id": "ratio_word_problem",
    "variant_type": "same_skill_new_context",
    "difficulty_delta": 0,
    "success_criteria": "能讲清比例关系并列式"
  }
}
```

修复判定：

- 只看分数不够，必须同时看凡凡复述错因和变式题表现。
- 复述错因不足时，进入 `reflection_retry`，不发满额金币。
- 变式题失败时，生成下一次 `mistake_repair_card`，而不是直接归档为完成。

## 8. MVP 第一阶段 API

第一阶段只做骨架和可验证闭环，不做完整学习系统：

```text
GET  /api/learning-growth/overview
GET  /api/learning/overview                 # short compatibility alias
GET  /api/learning/sources?learnerId=...
POST /api/learning/sources
GET  /api/learning/profile?learnerId=...
POST /api/learning/profile/rebuild
GET  /api/learning/goals?learnerId=...
POST /api/learning/goals
GET  /api/learning/curriculum-references?subject=...
POST /api/learning/plans/daily/draft
POST /api/learning/plans/:planId/publish
GET  /api/learning/tasks?learnerId=...
POST /api/learning/tasks/:taskId/start
POST /api/learning/tasks/:taskId/submit
POST /api/learning/tasks/:taskId/hint
POST /api/learning/tasks/:taskId/reflect
POST /api/learning/tasks/:taskId/settle
```

当前已落地第一步：

- `adapters/learning-growth-service.js`
- `server-routes/learning-api-routes.js`
- `GET /api/learning-growth/overview`
- `GET /api/learning/overview` 兼容别名
- `public/app-learning-growth-ui.js`
- `public/app-learning-coins-ui.js`

## 9. MVP 第一阶段数据表 / Repository

第一阶段 repository 可以先用 JSON，接口必须按未来 SQLite 表设计：

```text
learning_sources
curriculum_references
learner_profiles
learning_goals
learning_task_cards
learning_attempts
learning_evaluations
learning_events
learning_reward_events
learning_skill_versions
```

最低字段要求：

```text
learning_task_cards
- task_id
- learner_id
- workspace_id
- task_card_type
- primary_subject
- involved_subjects_json
- target_skill_ids_json
- source_basis_refs_json
- curriculum_refs_json
- status
- kanban_card_id
- topic_thread_id
- created_at
- updated_at
```

```text
learning_evaluations
- evaluation_id
- task_id
- attempt_id
- score
- passed
- mistake_types_json
- skill_impacts_json
- feedback_summary
- repair_required
- variant_success
- created_at
```

## 10. 儿童隐私与日志最小化

硬规则：

- 通用日志只记录 `task_id`、`learner_id`、`workspace_id`、`event_type`、`score`、`summary`、`source_refs`。
- 不记录完整儿童回答。
- 不记录完整录音转写。
- 不记录完整题目、答案、解析全文。
- 不把凡凡目录全文塞进 AI 请求；只传摘要和引用。
- 交付文件可以保存在授权学习目录，但日志和 handoff 只能记录路径、结构化摘要和校验结果。
- Web Push 只发短标题、任务类型、跳转参数，不含敏感正文。
- 金币、徽章、延期、家长审批都必须可审计，但审计事件不包含儿童原文。

## 11. AI 可靠性与幻觉防控层

凡凡成长学习系统不能让模型直接闭环教育决策。AI 可以负责日常编排、互动、讲解、反馈和激励建议，但系统必须负责来源约束、结构化校验、答案/评分验证、置信度、异常拦截、家长兜底和审计。

建议服务：

```text
adapters/learning-ai-reliability-guard-service.js
adapters/learning-evaluation-verifier-service.js
adapters/learning-parent-review-queue-service.js
adapters/learning-audit-event-service.js
```

最小决策 schema：

```json
{
  "schema_version": "learning_reliability_decision_v1",
  "task_id": "task_...",
  "learner_id": "weixin_stephen",
  "source_basis_refs": ["source:..."],
  "curriculum_refs": ["curriculum:..."],
  "task_confidence": "medium",
  "evaluation_confidence": "model_only",
  "risk_flags": ["missing_curriculum_reference"],
  "parent_review_required": true,
  "publish_blocked": true,
  "allowed_actions": ["save_draft", "request_parent_review"],
  "content_ref": "artifact:summary-only",
  "content_hash": "sha256:..."
}
```

四道门：

- 输入来源门：AI 不能凭空断言“已经掌握”“明显退步”“一直不喜欢”。每个画像、任务和评价判断都必须有 `source_basis_refs`，缺证据时只能写不确定性说明。
- 生成约束门：AI 输出必须通过版本化 Skill 和 JSON Schema；题型、年龄/年级、学校特点、公开课程边界、版权边界都由服务层校验。
- 答案与评分校验门：数学优先规则/程序校验；Python 必须区分真实运行和静态判断；英语只围绕本次 rubric 纠错；金币最终由 Reward Service 公式结算。
- 人工兜底门：低置信度、新题型、大额金币/兑换、连续失败、凡凡反馈太难/焦虑/不想做、疑似乱填或复制，都进入家长审核队列。

工程顺序约束：

- `POST /api/learning/plans/daily/draft` 只生成草稿，不能直接发布到 Kanban。
- `POST /api/learning/plans/:planId/publish` 必须先经过 `learning-ai-reliability-guard-service`；`publish_blocked=true` 时只能进入家长审核。
- `POST /api/learning/tasks/:taskId/submit` 必须先经过 `learning-evaluation-verifier-service`；`evaluation_confidence=model_only` 不能伪装成程序或真实运行校验。
- 金币结算必须在 verifier 和 reward policy 后执行；大额、异常或低置信度结算进入 parent review。

家长审核队列最小状态：

```text
pending
approved
rejected
returned_for_revision
cancelled
```

队列项只保存摘要、引用、风险标记、允许动作和内容 hash，不保存完整儿童回答、完整录音转写、完整题目或答案全文。

## 12. 独立 App 演进边界

当前阶段可继续使用 Hermes Mobile 的 `learning` view 和“金币标签”作为入口，但产品语义是“凡凡成长系统”。金币只是其中一个子模块。

后续拆独立 App 时：

- 新增 `public/learning.html` 或独立前端包。
- 复用同一套 `/api/learning/...`、`/api/learning-coins/...`、Kanban/topic/file API。
- 不复制 Hermes Mobile 平台代码。
- 不复制金币账本或学习数据。
- 工作台只保留入口和摘要。

## 13. 下一轮工程顺序

建议顺序：

1. `curriculum-reference-service`：公开课程参考和版权边界。
2. `learning-source-service`：历史/学校/私教/家长资料索引。
3. `learner-profile-service`：画像和 skill_state。
4. `learning-goal-service`：长期/阶段/学科目标。
5. `learning-task-card-service`：任务卡 schema、类型、状态。
6. `learning-orchestrator-service`：每日任务 draft，不直接写 Kanban。
7. `learning-ai-reliability-guard-service`：draft/publish 前的来源、schema、置信度和家长审核判断。
8. `learning-interaction-session-service`：状态机。
9. `learning-evaluation-service`：错题讲解、复述、变式修复。
10. `learning-evaluation-verifier-service`：数学/Python/英语评分校验和 `model_only` 标记。
11. `learning-parent-review-queue-service`：低置信度、异常奖励和高风险任务审核队列。
12. `learning-parent-report-service`：周报。
13. `learning-badge-service` 和金币家长后台。

每一步都必须有 focused tests 和 schema fixtures；新增前端只进 `public/app-learning-*.js`，不扩大 `public/app.js` 主体。
