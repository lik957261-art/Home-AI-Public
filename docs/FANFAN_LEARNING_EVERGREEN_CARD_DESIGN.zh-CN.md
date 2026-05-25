# 凡凡成长永续卡能力画像驱动设计

本文固化 Hermes Mobile `learning-growth` 中“永续卡”的长期产品设计。它不是 release note，也不是当前代码状态说明，而是后续实现、评审和回归判断的目标方案。

## 1. 核心判断

永续卡不应长期绑定孩子的年龄、所在年级或当前教材进度。

年龄、学校、年级、课程、学校报告、私教报告、历史表现等资料的主要作用是建立第一张永续卡的初始先验。第一张卡之后，系统的主输入应逐步切换为每一张卡真实暴露出来的能力证据：

- 哪些能力已经稳定掌握；
- 哪些能力正在形成但不稳定；
- 哪些弱点反复出现；
- 哪些强项可以继续拉伸；
- 哪些知识点已经掌握；
- 哪些能力已经超出当前年级标尺；
- 下一步最值得推进什么。

因此，永续卡的本质不是“按年级连续出题”，而是“围绕动态能力画像持续生成下一步任务”。

## 2. 设计目标

永续卡系统应服务于以下结果：

1. 能力随任务持续增强，而不是只完成一张张孤立卡片。
2. 弱点被反复识别、回补、验证，直到稳定消失。
3. 强项被适度拉伸，形成高于年级平均水平的能力优势。
4. 难度跟随真实表现动态上调或下调，而不是按年级固定。
5. 每张新卡都有可解释的生成依据。
6. 家长可以看到孩子能力曲线如何变化，而不只是看到分数和金币。

如果系统运行效果符合预期，孩子可能在八年级达到九年级甚至更高水平。此时系统不应继续受“八年级课程”限制，而应按实际能力生成更高阶段的任务。

## 3. 年级信息的角色变化

年级信息仍然有价值，但角色应从“出题约束”降级为“参考标尺”。

### 3.1 初始先验

在第一张永续卡生成前，系统可以使用：

- 年龄；
- 年级；
- 学校环境；
- 当前课程；
- 学校报告；
- 私教报告；
- 清洗后的历史学习资料；
- 家长长期目标；
- 近期学习状态。

这些资料用于判断起点、避免过难、识别初始弱点和选择第一组能力目标。

### 3.2 后续参考

第一张卡之后，年级主要用于：

- 家长报告中的外部对标；
- 判断当前能力大约处于哪个学习阶段；
- 避免跳跃过大导致挫败；
- 选择公开课程标准或题型风格作为参考；
- 解释“当前实际能力高于/低于所在年级”的原因。

年级不应决定下一张卡的难度上限。

## 4. 能力画像

永续卡的核心数据对象是能力画像，而不是单次分数。

能力画像的拆分应参考已有国际教育框架，但不能照搬任何单一课程标准。凡凡的长期路线按海外留学和高中 A Level 方向设计，不以中国义务教育课标为基线。建议以以下共识为基准：

- A Level / Cambridge International 路线：长期目标是为高中阶段的 AS & A Level 学科能力做准备，尤其强调学科深度、分析表达、独立解题、证据论证和考试型任务表现；
- 语言学习参考 CEFR / ACTFL / Cambridge English Language：用可观察的 `can-do` 表现描述听、说、读、写、互动、呈现、文本分析、语言数据分析和跨文化理解，不把一次任务当作能力定级；
- 数学参考 Cambridge International Mathematics / Common Core Mathematical Practices / PISA：同时记录内容知识、推理、建模、策略选择、表达、精确性、迁移和真实情境应用；
- 科学参考 Cambridge International Sciences / NGSS / PISA Science：同时记录学科核心概念、实验/探究实践、跨学科概念、证据评价、模型建构和科学信息使用；
- 计算机科学参考 Cambridge International Computer Science / CSTA K-12 / K-12 CS Framework / AP Computer Science Principles：覆盖计算系统、网络、数据、算法、编程、计算影响和计算实践；
- 语文/母语类学习作为中文阅读表达与双语思维支持，不作为中国校内语文课标推进。

因此，能力画像应采用“多层能力树”，而不是一个扁平 skill list。

### 4.1 画像分层模型

每个画像节点建议包含四层信息：

```text
domain        # 学科域，例如 english, chinese, math, science, learning_habit
strand        # 能力束，例如 reading, speaking, algebra, inquiry
skill         # 可训练能力，例如 infer_main_idea, proportional_reasoning
micro_skill   # 可观测微能力，例如 use_transition_words, identify_units
```

拆分粒度的原则：

- `domain` 用于规划课程范围；
- `strand` 用于保持学科结构稳定；
- `skill` 用于决定下一张卡的主要训练目标；
- `micro_skill` 用于解释错误、生成窄范围修复卡和判断稳定性；
- 任何画像节点都必须能被任务证据支持，不能只因为模型觉得“可能薄弱”就写入长期画像；
- 每张卡最多主攻 1-2 个 `skill`，最多附带 1-3 个 `micro_skill`，避免任务失焦。

### 4.2 学科能力拆分建议

#### English / 外语

外语画像不应只拆成“听说读写”，而应拆成通信模式、语言资源、认知处理和学习策略四组。

```text
english.reading
  - literal_comprehension              # 明确信息提取
  - inferential_comprehension          # 推断、指代、隐含关系
  - discourse_structure                # 段落结构、转折、因果、举例
  - vocabulary_in_context              # 词义猜测、搭配、词族
  - author_purpose_and_tone            # 作者意图、态度、语气
  - evidence_based_answering           # 用文本证据回答

english.listening
  - gist_listening                     # 抓主旨
  - detail_listening                   # 抓细节
  - speaker_intent                     # 说话人意图
  - connected_speech                   # 连读、弱读、语流识别
  - note_taking_from_audio             # 听力笔记

english.speaking
  - pronunciation_intelligibility      # 可理解发音
  - fluency_and_pacing                 # 流利度和节奏
  - retell_structure                   # 复述结构
  - idea_expansion                     # 展开观点
  - interaction_repair                 # 没听懂时追问、改述
  - transition_and_cohesion            # 连接词、衔接

english.writing
  - sentence_control                   # 句子控制
  - grammar_in_expression              # 表达中的语法准确性
  - paragraph_cohesion                 # 段落连贯
  - argument_or_explanation            # 说明、论证
  - revision_quality                   # 修改质量
  - audience_awareness                 # 读者意识

english.language_resources
  - active_vocabulary                  # 主动词汇
  - collocation                        # 搭配
  - morphology                         # 词根、词缀、词形变化
  - tense_aspect                       # 时态体
  - clause_and_sentence_variety        # 从句和句式多样性

english.intercultural_and_pragmatic
  - register                           # 正式/非正式语域
  - cultural_reference                 # 文化背景
  - pragmatic_appropriateness          # 得体性
```

#### Chinese / 语文或母语阅读表达

```text
chinese.reading
  - information_extraction             # 信息提取
  - text_structure                     # 篇章结构
  - inference_and_interpretation       # 推断和解释
  - literary_appreciation              # 文学鉴赏
  - critical_reading                   # 批判阅读
  - cross_text_connection              # 多文本关联

chinese.expression
  - oral_narration                     # 口头叙述
  - written_narration                  # 书面叙事
  - explanation                        # 说明
  - argumentation                      # 论证
  - evidence_selection                 # 材料选择
  - organization_and_coherence         # 组织和连贯
  - revision_and_polishing             # 修改润色

chinese.language_knowledge
  - word_phrase_sense                  # 字词句理解
  - syntax_awareness                   # 句法意识
  - rhetoric                           # 修辞
  - classical_or_cultural_knowledge    # 古诗文/文化常识
```

#### Mathematics / 数学

数学画像必须分离“会算”和“会想”。同样的正确率，可能来自概念理解、程序熟练、建模、读题、表达或检查能力的差异。

```text
math.content
  - number_sense                       # 数感
  - ratios_and_proportions             # 比、比例、百分比
  - expressions_and_equations          # 式与方程
  - functions_and_relationships        # 函数与关系
  - geometry_and_measurement           # 几何与测量
  - statistics_and_probability         # 统计与概率
  - data_representation                # 图表和数据表达

math.practice
  - problem_representation             # 表征问题
  - strategy_selection                 # 选择策略
  - procedural_fluency                 # 程序熟练
  - conceptual_understanding           # 概念理解
  - quantitative_reasoning             # 数量关系推理
  - algebraic_reasoning                # 代数推理
  - spatial_reasoning                  # 空间推理
  - mathematical_modeling              # 数学建模
  - proof_and_justification            # 论证与说明
  - precision_and_units                # 精确性、单位、符号
  - error_checking                     # 验算和合理性检查

math.transfer
  - same_structure_new_context         # 同结构换情境
  - multi_step_word_problem            # 多步应用题
  - open_ended_modeling                # 开放建模
  - explain_solution_to_other          # 解释解法
```

#### Science / 科学

科学画像不应只记录知识点，而应记录“解释现象、设计探究、解释证据、使用科学信息”的能力。

```text
science.core_ideas
  - physical_systems                   # 物质、运动、能量、波等
  - life_systems                       # 生命系统
  - earth_space_systems                # 地球与宇宙
  - engineering_design                 # 工程设计

science.practices
  - asking_questions                   # 提出问题
  - modeling                           # 建构模型
  - investigation_design               # 设计探究
  - data_analysis                      # 数据分析
  - explanation_from_evidence          # 基于证据解释
  - argument_from_evidence             # 基于证据论证
  - information_evaluation             # 评价科学信息
  - communication                      # 科学表达

science.crosscutting
  - patterns                           # 模式
  - cause_and_effect                   # 因果
  - scale_proportion_quantity          # 尺度、比例、数量
  - systems_and_system_models          # 系统与模型
  - energy_and_matter                  # 能量与物质
  - structure_and_function             # 结构与功能
  - stability_and_change               # 稳定与变化
```

#### Computer Science / 计算机科学

计算机科学画像不能等同于“会不会 Python”。Python 只是当前入门工具之一。后续画像应覆盖计算机科学的核心概念、计算思维、程序设计实践、系统理解、数据与 AI、网络安全、计算影响和工程协作。

第一版可参考 CSTA K-12 Computer Science Standards、K-12 Computer Science Framework 和 AP Computer Science Principles 的共识结构：计算系统、网络与互联网、数据与分析、算法与编程、计算影响，以及计算实践。

```text
computer_science.computational_thinking
  - problem_decomposition              # 问题分解
  - pattern_recognition                # 模式识别
  - abstraction                        # 抽象
  - algorithm_design                   # 算法设计
  - representation_choice              # 选择合适的数据/模型表示
  - complexity_awareness               # 时间、空间、规模意识

computer_science.programming
  - syntax_and_runtime_model           # 语法与运行模型
  - variables_and_state                # 变量、状态
  - control_flow                       # 条件、循环、分支
  - functions_and_modularity           # 函数和模块化
  - data_structures                    # list/dict/set/tree/graph 等数据结构
  - file_and_io                        # 文件、输入输出
  - error_handling                     # 异常、边界条件
  - testing_and_debugging              # 测试和调试
  - code_readability                   # 可读性、命名、注释
  - refactoring                        # 重构

computer_science.algorithms
  - search_and_sort                    # 搜索和排序
  - recursion                          # 递归
  - iteration_invariants               # 循环不变量
  - graph_algorithms                   # 图算法基础
  - dynamic_programming_intro          # 动态规划入门
  - greedy_and_heuristics              # 贪心和启发式
  - algorithmic_tradeoffs              # 算法权衡

computer_science.systems
  - computer_architecture_basics       # 计算机组成基础
  - operating_system_concepts          # 进程、线程、文件系统、内存
  - command_line_and_environment       # 命令行和运行环境
  - software_dependencies              # 依赖、包、环境
  - performance_and_resource_use       # 性能和资源使用

computer_science.networks_and_web
  - internet_basics                    # IP/DNS/HTTP 基础
  - client_server_model                # 客户端/服务端
  - api_and_protocols                  # API、协议
  - web_data_flow                      # Web 请求链路
  - reliability_and_latency            # 可靠性、延迟

computer_science.data_and_ai
  - data_collection_and_cleaning       # 数据收集和清洗
  - data_representation                # 表格、JSON、结构化数据
  - exploratory_analysis               # 探索性分析
  - visualization                      # 可视化
  - basic_statistics_for_computing     # 计算中的基础统计
  - machine_learning_concepts          # 机器学习概念
  - ai_limitations_and_evaluation      # AI 局限、评估、偏差

computer_science.security_and_responsibility
  - privacy_and_data_protection        # 隐私和数据保护
  - authentication_and_authorization   # 认证和授权
  - threat_modeling_basics             # 威胁建模基础
  - safe_use_of_tools                  # 安全使用工具
  - responsible_ai_and_computing       # 负责任计算

computer_science.software_engineering
  - requirements_clarification         # 澄清需求
  - design_before_code                 # 编码前设计
  - version_control_concepts           # 版本控制概念
  - collaboration                      # 协作
  - documentation                      # 文档
  - maintenance_and_iteration          # 维护和迭代
  - user_centered_feedback             # 用户反馈闭环

computer_science.creative_computing
  - interactive_artifacts              # 交互作品
  - simulation                         # 模拟
  - automation                         # 自动化
  - robotics_or_physical_computing     # 机器人/实体计算
  - product_thinking                   # 产品化思维
```

当前 Python 入门阶段不应只评价“写出代码没有”。同一张 Python 卡可同时产生多类证据：

- 语法和运行错误：`programming.syntax_and_runtime_model`；
- 能不能把题拆成步骤：`computational_thinking.problem_decomposition`；
- 是否会写函数：`programming.functions_and_modularity`；
- 是否会自己定位 bug：`programming.testing_and_debugging`；
- 是否能解释算法为什么对：`algorithms.algorithm_design` / `proof_and_justification`；
- 是否能把脚本用于真实小任务：`creative_computing.automation`；
- 是否注意隐私、安全、依赖和文件路径：`security_and_responsibility.safe_use_of_tools`。

后续当能力超过 Python 入门时，永续卡可以转向：

- 更复杂的数据结构与算法；
- Web/API/网络；
- 数据分析和可视化；
- AI 使用与评估；
- 自动化和工具开发；
- 简单系统设计；
- 安全和隐私；
- 软件工程协作与维护。

#### Cross-domain / 通用学习能力

通用能力不能替代学科能力，但能解释为什么某些能力不稳定。

```text
learning_habit.self_regulation
  - task_planning                      # 任务计划
  - attention_control                  # 注意控制
  - persistence                        # 持续投入
  - response_to_feedback               # 接受反馈并修改
  - reflection_quality                 # 复盘质量

learning_habit.metacognition
  - error_awareness                    # 识别自己错在哪里
  - strategy_explanation               # 说明策略
  - confidence_calibration             # 自信与实际表现匹配
  - transfer_awareness                 # 知道何时迁移旧知识

learning_habit.execution
  - time_management                    # 时间管理
  - carefulness                        # 细心
  - completeness                       # 完整作答
  - revision_cycle                     # 修改迭代
```

### 4.3 画像节点字段

每个 `skill` 或 `micro_skill` 节点至少应保存：

```json
{
  "domain": "english",
  "strand": "speaking",
  "skillId": "english.speaking.retell_structure",
  "microSkillId": "english.speaking.transition_and_cohesion",
  "mastery": "unstable",
  "stability": "inconsistent",
  "evidenceCount": 4,
  "positiveEvidenceCount": 2,
  "negativeEvidenceCount": 2,
  "lastEvidenceAt": "2026-05-25T00:00:00.000Z",
  "confidence": 0.68,
  "difficultyBand": "steady",
  "gradeReference": "grade8",
  "externalLevelReference": "cefr_b1_bridge",
  "supportLevel": "light_hint",
  "transferLevel": "near_transfer",
  "typicalErrorTypes": ["missing_transitions", "under_explained_reasoning"],
  "nextStrategy": "stabilize"
}
```

其中：

- `mastery` 表示掌握状态；
- `stability` 表示跨时间、跨任务、跨情境是否稳定；
- `confidence` 表示系统对画像判断的置信度，不等于学生能力；
- `difficultyBand` 表示当前任务难度；
- `gradeReference` 只用于外部对标，不作为上限；
- `externalLevelReference` 可用于 CEFR、ACTFL、Cambridge/A Level、PISA、AP/CSTA 或其他国际标准；
- `supportLevel` 记录是否独立完成；
- `transferLevel` 记录迁移距离；
- `typicalErrorTypes` 用于下一张卡生成时选择修复方式。

能力画像应至少包含以下信息：

- 能力点；
- 当前掌握状态；
- 稳定性；
- 置信度；
- 最近证据；
- 典型错误；
- 推荐下一步策略；
- 最近一次难度变化；
- 是否超过当前年级标尺；
- 是否需要回补基础。

### 4.4 掌握状态

建议使用以下状态：

```text
new          # 新接触或证据不足
practicing   # 正在练习
unstable     # 时好时坏，不稳定
mastered     # 稳定掌握
advanced     # 明显超前，可拉伸
regressed    # 最近退步，需要复查
```

### 4.5 稳定性

稳定性不同于分数。一次高分不能说明掌握，一次低分也不能直接说明不会。

建议记录：

```text
single_success        # 单次成功
repeated_success      # 多次成功
inconsistent          # 表现波动
needs_prompting       # 需要提示才能完成
slow_but_correct      # 会但慢
fast_but_careless     # 快但粗心
transfer_failed       # 换场景后不会
pressure_sensitive    # 压力或限时下不稳
```

### 4.6 错误类型

同一个分数背后可能是完全不同的问题。错误类型应区分：

- 概念不知道；
- 知道但不会用；
- 能做但表达不清；
- 能做但不能迁移；
- 粗心；
- 速度不足；
- 审题问题；
- 语言表达问题；
- 推理链条断裂；
- 缺少复盘能力。

## 5. 推进策略

下一张永续卡不应简单“加难度”。系统应先选择推进策略。

### 5.1 策略集合

```text
repair       # 补弱：针对明确短板
stabilize    # 巩固：刚掌握但不稳定
transfer     # 迁移：换场景使用已掌握能力
stretch      # 拉伸：对强项提升难度
integrate    # 综合：多个能力点组合任务
review       # 复习：间隔复现，防遗忘
reflect      # 复盘：解释错误、策略和自我修正
```

### 5.2 策略选择原则

优先级建议：

1. 有安全、隐私或明显挫败风险时，先降难度和修复。
2. 有反复弱点时，优先 `repair`。
3. 新掌握能力证据不足时，优先 `stabilize`。
4. 已掌握但迁移失败时，优先 `transfer`。
5. 连续稳定高表现时，优先 `stretch`。
6. 多个能力已就绪时，使用 `integrate`。
7. 长期未复现的关键能力，插入 `review`。

## 6. 下一张卡生成流程

每次生成下一张永续卡时，建议按以下顺序：

1. 读取当前永续系列最近 N 张卡的 summary-only 证据。
2. 读取能力画像中相关能力点的状态。
3. 读取上一张卡的评估、反馈、反思和奖励结算结果。
4. 更新能力画像。
5. 判断当前主策略。
6. 选择 1-2 个主能力点，最多 1 个辅助能力点。
7. 决定难度：回补、稳定、保持、拉伸或跨级挑战。
8. 生成下一张卡。
9. 记录生成理由。
10. 完成后写回新的能力证据。

## 7. 难度推进

难度不应只用年级表达。建议同时记录：

```text
difficulty_band: repair | foundation | steady | stretch | advanced
grade_reference: grade7 | grade8 | grade9 | above_grade9
cefr_reference: a2 | b1_bridge | b1 | b2_bridge
cognitive_load: low | medium | high
support_level: guided | light_hint | independent
transfer_level: same_context | near_transfer | far_transfer
```

示例：

- 孩子在八年级，但英语口头复述已经稳定达到九年级水平：
  - `grade_reference=grade9`
  - `difficulty_band=stretch`
  - `support_level=light_hint`

- 孩子在阅读理解强，但语法表达不稳：
  - 阅读任务可以 `stretch`
  - 语法表达部分可以 `repair`

## 8. 永续卡应该记录的学习轨迹

每张卡结束后，系统应写入一条 summary-only 轨迹记录：

```json
{
  "taskCardId": "ltask_...",
  "sequenceGroupId": "series-...",
  "sequenceIndex": 5,
  "targetSkillIds": ["english_speaking_retell"],
  "strategy": "stabilize",
  "difficultyBand": "steady",
  "performanceSummary": "能够抓住主线，但转述时连接词不足。",
  "confirmedStrengths": ["main_idea_retell"],
  "remainingWeaknesses": ["transition_words", "sentence_variety"],
  "masteryChanges": [
    {
      "skillId": "english_speaking_retell",
      "from": "practicing",
      "to": "unstable",
      "reason": "主线稳定，但换文本后表达波动。"
    }
  ],
  "nextRecommendation": {
    "strategy": "repair",
    "targetSkillIds": ["transition_words"],
    "difficultyAdjustment": "same_level_narrower_scope"
  }
}
```

不得记录完整孩子答案、完整转写、完整题目、答案钥匙、raw prompt、音频路径、私有文件路径或凭据。

## 9. 家长可见解释

家长不需要只看“分数”。每张永续卡应能解释：

- 本张卡为什么这样生成；
- 它要验证哪个能力；
- 它补哪个弱点或拉伸哪个强项；
- 难度为什么上调、下调或保持；
- 和当前年级相比，孩子表现处于什么位置；
- 下一张卡将如何推进。

## 10. 禁止模式

以下模式应避免：

- 只按年级和教材继续生成；
- 只根据最近一次分数调难度；
- 只看到弱点，不保留强项拉伸；
- 一次高分就直接判定掌握；
- 三次完成后忽略真实低分；
- 把完整答案、完整转写、完整题目塞进长期画像；
- 让模型无结构地自由决定下一张卡；
- 没有生成理由地创建下一张永续卡。

## 11. 成功标准

长期看，永续卡系统应让以下事实可以被验证：

- 孩子的能力状态随时间有轨迹；
- 弱点有被回补、复验和消失的证据；
- 强项有被拉伸的证据；
- 难度调整有可解释依据；
- 孩子可以高于当前年级标尺推进；
- 家长能理解系统为什么生成下一张卡；
- 每张卡不是孤立任务，而是能力成长链上的一步。
