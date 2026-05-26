# 凡凡成长永续卡能力画像驱动实施方案

本文是 `docs/FANFAN_LEARNING_EVERGREEN_CARD_DESIGN.zh-CN.md` 的代码级实施文档。目标是在现有 Hermes Mobile `learning-growth` 服务边界内扩展永续卡，不新增并行学习系统，不把业务状态塞回通用 Kanban/Todo。

## 1. 当前基础

现有相关边界：

- `adapters/learning-growth-sequence-service.js`
  - 已负责永续卡 clone、序列分组、下一张卡生成基础规则。
- `adapters/learning-growth-jit-task-service.js`
  - 已负责基于 summary-only recent learning state 生成具体 learner-facing task。
- `adapters/learning-growth-task-evaluation-service.js`
  - 已负责任务评估和完成判断。
- `adapters/learning-growth-reflection-service.js`
  - 已负责 spoken reflection gate。
- `adapters/learning-skill-taxonomy-service.js`
  - 已有英语能力分类基础。
- `adapters/learning-program-repository.js`
  - SQLite schema 当前版本为 `8`，已有 learner profile、skill states、task cards、evaluations、sources、reward settlements 等表。
- `server-routes/learning-program-api-routes.js`
  - 学习 program/task/evaluation/reward 等 API 聚合入口。
- `public/app-learning-growth-*.js`
  - Growth board、task detail、settings、AI/reward controller 前端入口。

实施原则：

- 继续走 service-first。
- 能力画像和永续推进逻辑属于 `learning-growth` 域。
- Official Kanban 不是学习源事实。
- 永续卡可以引用 Todo/Kanban/platform id，但学习状态必须落在 learning-growth SQLite/service。
- 只存 summary-only 证据，不存完整孩子答案、完整转写、完整题目、答案钥匙或 raw prompts。

## 2. 新增/扩展服务

### 2.0 能力分类基线

实现前先定义稳定的能力分类基线。第一版不需要把所有学科一次性做完，但数据结构必须支持足够细的能力树。

路线约束：

- 凡凡长期按海外留学和高中 A Level 路线准备；
- taxonomy 的外部参考优先使用 Cambridge International、CEFR、ACTFL、PISA、CSTA、AP 等国际框架；
- 中国义务教育课标不作为能力基线，也不作为难度上限；
- 当前年级只作为年龄/学习阶段背景，不能限制高阶能力推进。

建议新增：

```text
adapters/learning-growth-capability-taxonomy-service.js
tests/learning-growth-capability-taxonomy-service.test.js
```

职责：

- 提供 Hermes Mobile 内部稳定的能力 id；
- 将外部框架映射到内部能力树，而不是把外部标准原样写入业务表；
- 支持 `domain -> strand -> skill -> micro_skill` 四层结构；
- 给每个节点提供 summary-only 描述、适用 task template、证据提取规则和推荐策略；
- 管理 taxonomy version，避免后续改名导致历史画像不可解释。

建议内部 id 规则：

```text
<domain>.<strand>.<skill>[.<micro_skill>]
```

示例：

```text
english.speaking.retell_structure
english.speaking.transition_and_cohesion
english.reading.evidence_based_answering
math.practice.quantitative_reasoning
math.practice.precision_and_units
science.practices.explanation_from_evidence
computer_science.programming.testing_and_debugging
computer_science.computational_thinking.abstraction
learning_habit.metacognition.error_awareness
```

第一版内置 taxonomy 可以先覆盖：

- `english`：reading、listening、speaking、writing、language_resources、intercultural_and_pragmatic；
- `chinese`：reading、expression、language_knowledge；
- `math`：content、practice、transfer；
- `science`：core_ideas、practices、crosscutting；
- `computer_science`：computational_thinking、programming、algorithms、systems、networks_and_web、data_and_ai、security_and_responsibility、software_engineering、creative_computing；
- `learning_habit`：self_regulation、metacognition、execution。

每个 taxonomy 节点建议结构：

```json
{
  "taxonomyVersion": "20260525-evergreen-capability-v1",
  "domain": "english",
  "strand": "speaking",
  "skillId": "english.speaking.retell_structure",
  "parentSkillId": "english.speaking",
  "level": "skill",
  "displayName": "Retell structure",
  "summary": "Can organize a retell with clear beginning, main events, and conclusion.",
  "evidenceSignals": [
    "evaluation.dimensionScores.organization",
    "evaluation.dimensionScores.coherence",
    "reflection.selfCorrectionSummary"
  ],
  "positiveEvidenceRules": [
    "organization >= 0.75",
    "coherence >= 0.75"
  ],
  "negativeEvidenceRules": [
    "missing_main_events",
    "unclear_sequence"
  ],
  "supportedStrategies": ["stabilize", "transfer", "stretch", "repair"],
  "supportedTemplates": ["english-speaking-retell-v1", "weekly-integrated-challenge-v1"],
  "externalReferences": [
    { "framework": "CEFR", "level": "B1", "aspect": "spoken production" },
    { "framework": "ACTFL", "mode": "presentational", "sublevel": "intermediate_mid" },
    { "framework": "Cambridge_AS_A_Level", "subject": "English Language", "aspect": "effective writing and text analysis" }
  ]
}
```

外部框架只作为 reference metadata。它们不直接决定下一张卡难度，只用于对标、解释和生成约束。凡凡路线默认按国际教育和 A Level 准备设计，不以中国义务教育标准作为能力基线。

### 2.1 `learning-growth-mastery-profile-service.js`

新增文件：

```text
adapters/learning-growth-mastery-profile-service.js
tests/learning-growth-mastery-profile-service.test.js
```

职责：

- 读取 learner 当前能力画像；
- 从 task evaluation、submission summary、reflection summary 中抽取能力证据；
- 更新 skill mastery state；
- 输出下一张永续卡生成所需的 compact profile projection。

核心方法：

```js
createLearningGrowthMasteryProfileService({
  repository,
  skillTaxonomyService,
  nowIso,
})
```

建议 API：

```js
getMasteryProfile({ learnerId, workspaceId, domain })
getMasteryProfileByStrand({ learnerId, workspaceId, domain, strand })
recordTaskEvidence({ learnerId, workspaceId, taskCard, evaluation, reflection })
updateSkillStatesFromEvidence({ learnerId, workspaceId, evidenceItems })
projectForNextCard({ learnerId, workspaceId, sequenceGroupId, recentLimit })
listWeaknesses({ learnerId, workspaceId, domain, limit })
listStrengths({ learnerId, workspaceId, domain, limit })
listTransferCandidates({ learnerId, workspaceId, domain, limit })
listReviewDueSkills({ learnerId, workspaceId, domain, nowMs })
```

输出必须是 summary-only。

画像更新原则：

- 所有写入必须先通过 `learning-growth-capability-taxonomy-service` 校验，禁止写入未注册的自由文本 skill id；
- 单次成功只能提升 `confidence`，不能直接把 `mastery` 改为 `mastered`；
- 至少需要跨两次任务、或一次任务加一次反思/迁移证据，才能从 `practicing` 进入 `mastered`；
- 若同一 skill 在不同 context 下表现分化，应更新 `stability=inconsistent`，而不是简单降级；
- micro skill 可比 parent skill 更弱或更强，parent skill 应由子节点加权汇总；
- 低置信度 evidence 只能进入 `recentEvidenceSummary`，不能直接触发跨级 `stretch`。

### 2.2 `learning-growth-next-card-strategy-service.js`

新增文件：

```text
adapters/learning-growth-next-card-strategy-service.js
tests/learning-growth-next-card-strategy-service.test.js
```

职责：

- 根据能力画像、最近卡片轨迹、上一张评估结果选择下一张卡推进策略；
- 给出难度调整和目标能力点；
- 不直接生成题目内容。

策略枚举：

```text
repair
stabilize
transfer
stretch
integrate
review
reflect
```

核心方法：

```js
recommendNextCardStrategy({
  learnerId,
  workspaceId,
  sequenceGroupId,
  currentTask,
  latestEvaluation,
  latestReflection,
  masteryProfile,
  recentTrajectory,
})
```

返回：

```json
{
  "strategy": "repair",
  "targetSkillIds": ["english_grammar_in_expression"],
  "supportSkillIds": ["english_speaking_retell"],
  "difficultyAdjustment": "same_level_narrower_scope",
  "difficultyBand": "repair",
  "gradeReference": "grade7",
  "supportLevel": "guided",
  "transferLevel": "same_context",
  "reason": "最近三张卡主线复述稳定，但语法表达和连接词重复出错。"
}
```

### 2.3 `learning-growth-trajectory-service.js`

新增文件：

```text
adapters/learning-growth-trajectory-service.js
tests/learning-growth-trajectory-service.test.js
```

职责：

- 在每张永续卡完成后写入学习轨迹；
- 为下一张卡提供最近 N 条 compact trajectory；
- 为家长报告提供能力变化摘要；
- 保证隐私过滤。

核心方法：

```js
recordCardTrajectory({ taskCard, evaluation, reflection, masteryChanges, nextRecommendation })
listSequenceTrajectory({ learnerId, workspaceId, sequenceGroupId, limit })
summarizeTrajectoryForParent({ learnerId, workspaceId, sequenceGroupId, limit })
```

### 2.4 扩展 `learning-growth-jit-task-service.js`

当前 JIT 服务已有：

- deterministic seed；
- recentLearningState；
- model-main generation；
- repair/steady/stretch band。

需要扩展输入：

```json
{
  "masteryProfile": {
    "skillStates": [],
    "strengths": [],
    "weaknesses": [],
    "stabilitySignals": []
  },
  "nextCardStrategy": {
    "strategy": "repair",
    "targetSkillIds": [],
    "difficultyBand": "repair"
  },
  "recentTrajectory": []
}
```

JIT prompt 要求：

- 必须使用 `nextCardStrategy` 作为任务生成主依据；
- 年级只能作为 `gradeReference`，不能作为硬难度上限；
- 若 `strategy=stretch`，允许高于当前年级；
- 若 `strategy=repair`，范围必须窄，避免同时修太多问题；
- 输出 `teacherRationale` 必须说明为什么生成这张卡。

### 2.5 扩展 `learning-growth-sequence-service.js`

当前 sequence service 的 `cloneEvergreenTask()` 主要复制上一张卡，并清空 instruction 等字段。

需要扩展：

- clone 时带入 `nextCardStrategy`；
- 生成 `learningGrowthSequenceDecision`；
- 记录 `generatedFromMasteryProfileVersion`；
- 将 `taskModel.jitGeneration` 的输入升级为能力画像驱动。

建议新增函数：

```js
buildEvergreenNextCardPlan({
  currentTask,
  latestEvaluation,
  latestReflection,
  masteryProfile,
  recentTrajectory,
  nowIso,
})
```

输出进入 JIT 服务，而不是直接生成 instruction。

## 3. SQLite schema 扩展

将 `CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION` 从 `8` 提升到 `9`。

### 3.1 `learning_growth_mastery_states`

```sql
CREATE TABLE IF NOT EXISTS learning_growth_mastery_states (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  domain TEXT NOT NULL,
  strand TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  micro_skill_id TEXT NOT NULL DEFAULT '',
  parent_skill_id TEXT NOT NULL DEFAULT '',
  node_level TEXT NOT NULL DEFAULT 'skill',
  status TEXT NOT NULL,
  stability TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  positive_evidence_count INTEGER NOT NULL DEFAULT 0,
  negative_evidence_count INTEGER NOT NULL DEFAULT 0,
  recent_success_count INTEGER NOT NULL DEFAULT 0,
  recent_failure_count INTEGER NOT NULL DEFAULT 0,
  grade_reference TEXT NOT NULL DEFAULT '',
  external_level_reference TEXT NOT NULL DEFAULT '',
  difficulty_band TEXT NOT NULL DEFAULT '',
  support_level TEXT NOT NULL DEFAULT '',
  transfer_level TEXT NOT NULL DEFAULT '',
  last_evidence_ref TEXT NOT NULL DEFAULT '',
  source_basis_refs_json TEXT NOT NULL DEFAULT '[]',
  strengths_json TEXT NOT NULL DEFAULT '[]',
  weaknesses_json TEXT NOT NULL DEFAULT '[]',
  error_patterns_json TEXT NOT NULL DEFAULT '[]',
  evidence_summary_json TEXT NOT NULL DEFAULT '[]',
  child_skill_rollup_json TEXT NOT NULL DEFAULT '{}',
  next_recommendation_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(learner_id, workspace_id, taxonomy_version, domain, strand, skill_id, micro_skill_id)
);
```

索引建议：

```sql
CREATE INDEX IF NOT EXISTS idx_learning_growth_mastery_lookup
  ON learning_growth_mastery_states(learner_id, workspace_id, domain, strand, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_learning_growth_mastery_review_due
  ON learning_growth_mastery_states(learner_id, workspace_id, domain, stability, last_evidence_ref);
```

字段含义：

- `taxonomy_version`：能力分类版本，保证历史画像可解释；
- `strand` / `micro_skill_id` / `parent_skill_id` / `node_level`：支持多层能力树；
- `positive_evidence_count` / `negative_evidence_count`：避免只看总 evidence 数；
- `external_level_reference`：CEFR、ACTFL、Cambridge/A Level、PISA、AP/CSTA 等国际外部对标；
- `support_level`：独立完成、轻提示、强引导等；
- `transfer_level`：同情境、近迁移、远迁移；
- `evidence_summary_json`：summary-only 证据摘要；
- `child_skill_rollup_json`：父节点由子节点汇总时保存解释，不保存原始答案。

### 3.2 `learning_growth_card_trajectories`

```sql
CREATE TABLE IF NOT EXISTS learning_growth_card_trajectories (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  sequence_group_id TEXT NOT NULL,
  task_card_id TEXT NOT NULL,
  sequence_index INTEGER NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL,
  difficulty_band TEXT NOT NULL DEFAULT '',
  grade_reference TEXT NOT NULL DEFAULT '',
  target_skill_ids_json TEXT NOT NULL DEFAULT '[]',
  support_skill_ids_json TEXT NOT NULL DEFAULT '[]',
  performance_summary TEXT NOT NULL DEFAULT '',
  confirmed_strengths_json TEXT NOT NULL DEFAULT '[]',
  remaining_weaknesses_json TEXT NOT NULL DEFAULT '[]',
  mastery_changes_json TEXT NOT NULL DEFAULT '[]',
  next_recommendation_json TEXT NOT NULL DEFAULT '{}',
  source_basis_refs_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(task_card_id)
);
```

### 3.3 Repository methods

在 `learning-program-repository.js` 增加：

```js
getMasteryState({ learnerId, workspaceId, taxonomyVersion, domain, strand, skillId, microSkillId })
listMasteryStates({ learnerId, workspaceId, domain, strand, status, limit })
upsertMasteryState(input)
listMasteryStatesByStrategy({ learnerId, workspaceId, domain, nextStrategy, limit })
listMasteryStatesDueForReview({ learnerId, workspaceId, domain, beforeIso, limit })
listCardTrajectories({ learnerId, workspaceId, sequenceGroupId, limit })
upsertCardTrajectory(input)
```

Public projection 需要继续 redaction，禁止输出私有原文。

## 4. 证据抽取

### 4.1 输入来源

允许来源：

- task evaluation summary；
- dimension/rubric score；
- remainingWeaknesses；
- revisionRequirements；
- reflection summary；
- submission metadata；
- audio metadata summary；
- reward settlement status；
- prior trajectory。

禁止来源：

- 完整答案；
- 完整转写；
- 完整题目；
- answer key；
- raw model prompt；
- local file path；
- endpoint/key/token。

### 4.2 Evidence item schema

```json
{
  "evidenceId": "lgevd_...",
  "sourceRef": "evaluation:lgte_...",
  "taskCardId": "ltask_...",
  "sequenceGroupId": "series-...",
  "taxonomyVersion": "20260525-evergreen-capability-v1",
  "domain": "english",
  "strand": "speaking",
  "skillId": "english.speaking.retell_structure",
  "microSkillId": "english.speaking.transition_and_cohesion",
  "signal": "weakness|strength|stability|regression|stretch_ready",
  "confidence": 0.72,
  "summary": "主线复述稳定，但连接词和句式变化不足。",
  "score": 78,
  "difficultyBand": "steady",
  "supportLevel": "light_hint",
  "transferLevel": "near_transfer",
  "errorTypes": ["missing_transitions"],
  "createdAt": "..."
}
```

证据到画像节点的映射规则：

- evaluation 的 dimension/rubric score 只能映射到 taxonomy 中声明过 `evidenceSignals` 的节点；
- reflection 只用于更新复盘、策略意识、错误识别和稳定性，不直接证明学科内容掌握；
- submission metadata 可用于音频、时长、重试次数、是否完成等行为信号，但不能写入原始答案；
- 如果一个 evidence 同时指向多个节点，必须标注主节点和辅助节点，避免一个错误污染整棵能力树；
- 若 evidence 与当前 taxonomy 无法可靠匹配，应进入 `unmappedEvidenceSummary` 或 trajectory，不写 mastery state；
- `microSkillId` 的弱点可以触发窄范围 `repair`，但 parent skill 的降级需要多次证据。

第一版可以不单独建 evidence table，直接从 evaluation/reflection 生成并写入 mastery state 和 trajectory。若后续需要审计，再扩展 `learning_growth_mastery_evidence`。

## 5. 策略选择算法

第一版应采用 deterministic + model-assisted 的混合方案。

### 5.0 A Level 路线下的策略约束

策略服务需要把“当前入门任务”和“长期 A Level 目标”分开处理：

- 当前任务可以是 Python 入门、基础阅读、基础数学；
- 长期画像必须能映射到 A Level 所需的学科能力；
- 如果学生在某个领域表现超前，下一张卡可以 `stretch` 到更高阶能力，不受当前学校年级限制；
- 如果学生在 A Level 关键前置能力上薄弱，即使当前年级任务能完成，也应安排 `repair` 或 `stabilize`；
- 计算机科学中，Python 只是 `programming` strand 的一个证据来源，不是整个 `computer_science` domain。

### 5.1 Deterministic guard

硬规则：

- `score < 70` 或三次认真提交才完成：倾向 `repair`。
- 同一 skill 连续 2 次弱点：`repair`。
- 同一 skill 近 3 次表现波动大：`stabilize`。
- 连续 2 次高分且 reflection 合格：可 `stretch`。
- 已掌握 skill 超过 14 天未复现：插入 `review`。
- 已掌握但换场景失败：`transfer`。

### 5.2 Model-assisted strategy

模型只能在 deterministic guard 给出的候选策略中选择或解释，不得绕过安全/隐私/来源规则。

输入：

```json
{
  "masteryProfile": "...summary only...",
  "recentTrajectory": "...summary only...",
  "latestEvaluation": "...summary only...",
  "allowedStrategies": ["repair", "stabilize"],
  "constraints": {
    "maxTargetSkills": 2,
    "maxSupportSkills": 1,
    "allowAboveGrade": true
  }
}
```

输出必须通过 schema validate。

## 6. API 设计

### 6.1 Owner / parent view

新增：

```text
GET /api/learning/growth/mastery-profile?learnerId=...&domain=...
GET /api/learning/growth/trajectory?learnerId=...&sequenceGroupId=...
```

Owner 可查看完整 summary-only 能力轨迹。

### 6.2 Executor view

Executor 不需要看到管理型画像细节。任务详情可展示：

- 本张卡目标；
- 当前要练什么；
- 为什么这张卡适合现在做；
- 下一步行动。

不要展示内部策略权重、所有弱点列表或家长管理备注。

### 6.3 Publish / next-card flow

下一张永续卡生成流程应保持服务内部：

```text
card completed
-> evaluation verified
-> reflection accepted when required
-> record evidence
-> update mastery profile
-> record trajectory
-> recommend next strategy
-> clone evergreen task
-> JIT generate next card
-> publish next card
```

## 7. UI 改动

### 7.1 Growth board

卡片列表可增加轻量提示：

- `补弱`
- `巩固`
- `迁移`
- `拉伸`
- `复习`

不要做大卡片化，不改变当前移动端信息密度。

### 7.2 Task detail

任务详情增加“本卡目标”小节：

```text
本卡目标
- 练习：口头复述主线
- 策略：巩固
- 难度：稳定推进
- 原因：上一张能抓主线，但换文本后连接词不足
```

### 7.3 Owner settings / AI analysis

Owner 视图可增加：

- 能力画像列表；
- 最近轨迹；
- 弱点趋势；
- 强项拉伸建议；
- 年级参考对标。

保持 summary-only。

## 8. Prompt / model contract

JIT prompt 必须包含：

- `masteryProfile`；
- `nextCardStrategy`；
- `recentTrajectory`；
- `gradeReference`；
- `allowAboveGrade`；
- `privacyRules`。

输出 schema：

```json
{
  "learnerInstruction": "...",
  "focusSignals": ["..."],
  "difficultyBand": "repair|foundation|steady|stretch|advanced",
  "gradeReference": "grade7|grade8|grade9|above_grade9",
  "strategy": "repair|stabilize|transfer|stretch|integrate|review|reflect",
  "skillTargets": ["..."],
  "deliverables": ["..."],
  "acceptance": ["..."],
  "teacherRationale": "...",
  "parentRationale": "..."
}
```

验证规则：

- `strategy` 必须等于 next-card strategy 或是其允许子策略；
- `skillTargets` 不超过 2 个主目标；
- `difficultyBand` 不得违反 deterministic guard；
- `parentRationale` 不得包含完整孩子答案或题目原文；
- 不得出现 `prompt`、`answerKey`、`learnerAnswer`、`fullTranscript` 等字段。

## 9. 测试计划

新增测试：

```text
tests/learning-growth-capability-taxonomy-service.test.js
tests/learning-growth-mastery-profile-service.test.js
tests/learning-growth-next-card-strategy-service.test.js
tests/learning-growth-trajectory-service.test.js
```

扩展测试：

```text
tests/learning-program-repository.test.js
tests/learning-growth-sequence-service.test.js
tests/learning-growth-jit-task-service.test.js
tests/learning-program-api-routes.test.js
tests/app-learning-growth-ui.test.js
tests/task-list-ui.test.js
tests/architecture-refactor-boundary.test.js
```

关键用例：

- 年级为 grade8，但 mastery 显示 grade9 能力时，下一张允许 `stretch/above_grade`。
- 未注册 taxonomy skill id 不允许写入 mastery state。
- 同一 parent skill 下 micro skill 表现不一致时，parent skill 应汇总为 `unstable` 或 `practicing`，不能直接伪装为 `mastered`。
- 最近低分但完成时，下一张走 `repair` 而非机械升级。
- 强项连续稳定时，下一张走 `stretch`。
- 掌握但迁移失败时，下一张走 `transfer`。
- 终态轨迹不包含完整答案、完整转写、answer key、raw prompt。
- Owner 可见 profile，executor 只看到任务目标和行动提示。

## 10. 实施阶段

### Phase 1: 数据与服务骨架

- schema v9；
- repository CRUD；
- mastery profile service；
- trajectory service；
- deterministic strategy service；
- focused tests。

### Phase 2: 接入永续卡生成

- sequence service 调用 mastery/strategy；
- JIT service 接收 strategy/profile/trajectory；
- card taskModel 存储 `learningGrowthNextStrategy` 和 `masteryProfileVersion`；
- 更新 tests。

### Phase 3: 完成后写回

- evaluation/reflection 完成后写 trajectory；
- 更新 mastery state；
- 确保 reward settlement 不直接写 mastery，只通过 evaluation/reflection summary。

### Phase 4: UI/报告

- Growth task detail 展示本卡目标；
- Owner AI analysis 展示能力画像和轨迹；
- parent report 增加能力变化摘要。

### Phase 5: 模型辅助策略

- 在 deterministic guard 基础上加入 model-assisted explanation；
- schema validation；
- fail closed；
- privacy tests。

## 11. 迁移与兼容

已有永续卡可按以下方式回填：

- 从 `learning_task_cards.sequenceGroupId` 分组；
- 从最近 evaluations 生成初始 trajectory；
- 从现有 learner skill states 初始化 mastery states；
- 无法可靠判断的能力状态标记为 `new` 或 `practicing`，不要伪造掌握。

## 12. 验证命令

每个阶段至少跑：

```powershell
node --check adapters\learning-growth-mastery-profile-service.js
node --check adapters\learning-growth-next-card-strategy-service.js
node --check adapters\learning-growth-trajectory-service.js
node tests\learning-growth-mastery-profile-service.test.js
node tests\learning-growth-next-card-strategy-service.test.js
node tests\learning-growth-trajectory-service.test.js
node tests\learning-growth-sequence-service.test.js
node tests\learning-growth-jit-task-service.test.js
node tests\learning-program-repository.test.js
node tests\architecture-refactor-boundary.test.js
git diff --check
```

## 13. 非目标

第一版不做：

- 完整自适应课程平台；
- 复杂知识图谱 UI；
- 多儿童横向排名；
- 按学校教材复制题目；
- 把完整答案/转写进入长期画像；
- 真实支付或 RMB 结算；
- 替代家长最终判断。

## 14. 完成定义

该方案完成后，系统应能回答：

- 下一张永续卡为什么这样生成；
- 它补哪个弱点或拉伸哪个强项；
- 难度为什么上调、下调或保持；
- 能力画像发生了什么变化；
- 孩子是否已经超过当前年级标尺；
- 这个判断来自哪些 summary-only 证据。
