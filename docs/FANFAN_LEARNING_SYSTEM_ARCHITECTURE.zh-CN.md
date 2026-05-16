# 凡凡成长系统架构决策

本文是 Hermes Mobile 内部的产品架构边界文档。它回答一个长期问题：凡凡学习/成长系统会继续增加阅读、AMC8、Python、互动辅导、金币、兑换、家长审批等功能，这些功能不应继续混入最初的个人工作台主界面，也不应复制一套独立 Hermes Mobile。

## 决策

凡凡成长系统采用 **同仓库、同部署、独立产品入口、复用平台能力** 的架构。

不采用：

- 复制 Hermes Mobile 做一个独立 Web App；
- 把所有学习功能继续塞进当前个人工作台的底部标签和 `public/app.js`；
- 让学习业务直接散落到 Kanban lane、Todo 状态、topic 消息或 story card metadata 里。

采用：

- Hermes Mobile 作为平台底座；
- 凡凡成长系统作为垂直产品模块；
- 学习系统拥有自己的前端入口、API 命名空间、服务层和 UI helper；
- 平台能力通过稳定服务/API 被调用，而不是被复制。

## 平台和产品边界

Hermes Mobile Platform 负责通用能力：

- 账号、workspace、访问权限和 Owner 高权限授权；
- Chat、topic、task window、single-window thread；
- Kanban/story/card 基础工作流；
- directory、artifact、deliverable、file preview；
- Gateway Pool 调度、run lifecycle、Web Push、client version；
- 通用移动端布局、静态缓存、登录和设置。

Fanfan Learning System 负责学习域：

- 英语阅读：录音、转写、分析、10 题测验、复盘；
- AMC8/数学评估：正式测验、错题分析、复习建议；
- Python/编程评估：按本次要求生成题目、答题、解释、编程日志；
- 学习互动：提示、追问、回答、复盘、变式题、弱点修复；
- 金币成长：自动奖励、流水、成长档案、兑换申请；
- 家长/Owner 后台：审批、完成、拒绝、审计和未来结算扩展点。

学习域可以使用平台的 Kanban/topic/deliverable 能力，但不能把学习业务规则反向写进平台入口文件或通用 Kanban UI。

## 前端形态

当前 `public/app.js` 是 Hermes Mobile 工作台的过渡 UI composition root。凡凡成长系统不应长期作为这个文件里的一个大分支继续增长。

目标前端形态：

```text
public/index.html                 # Hermes Mobile 工作台入口
public/app.js                     # 工作台壳和过渡组合层
public/learning.html              # 凡凡成长系统入口，后续新增
public/app-learning-shell.js       # 学习系统产品壳
public/app-learning-reading-ui.js  # 阅读 UI/helper
public/app-learning-assessment-ui.js
public/app-learning-programming-ui.js
public/app-learning-coins-ui.js
public/app-learning-parent-ui.js
```

共享前端能力继续复用：

```text
public/app-api-client.js
public/app-task-artifact-helpers.js
public/app-kanban-story-helpers.js
```

原则：

- 学习系统首页、学生端、家长端应进入独立 shell；
- 工作台可以保留进入学习系统的入口，但不承载完整学习产品；
- 学习 UI helper 只负责确定性渲染、view-model 派生和轻量交互状态投影；
- API 调用、权限、持久化和业务状态仍落在服务/API 层。

## API 形态

学习系统使用 `/api/learning/...` 聚合命名空间，避免前端直接拼接大量 Kanban/topic 细节。

推荐 API 分层：

```text
server-routes/learning-api-routes.js
server-routes/learning-reading-api-routes.js
server-routes/learning-assessment-api-routes.js
server-routes/learning-programming-api-routes.js
server-routes/learning-coin-api-routes.js
```

服务层：

```text
adapters/learning-session-service.js
adapters/learning-interaction-service.js
adapters/learning-reading-template-service.js
adapters/learning-assessment-template-service.js
adapters/programming-assessment-template-service.js
adapters/learning-coin-service.js
adapters/learning-parent-review-service.js
```

聚合 API 可以在服务层内部调用 Kanban、topic、artifact、coin、push 等平台能力，但前端学习壳看到的是学习域对象，例如：

```text
LearningPlan
LearningCard
LearningInteraction
LearningAttempt
LearningDeliverable
LearningCoinSummary
LearningParentReview
```

## 数据边界

平台数据仍由平台服务拥有：

- thread/topic state；
- Kanban card/status/dependency；
- artifact/deliverable projection；
- workspace/access policy；
- Gateway run state；
- Web Push delivery state。

学习域数据由学习服务拥有：

- 学习任务模板；
- 互动阶段；
- 答案草稿和提交；
- 测验/评估 attempt；
- 学习报告摘要；
- 金币 ledger、reward、redemption；
- 家长审批状态。

学习域可以存储平台对象引用，例如 `workspaceId`、`threadId`、`taskGroupId`、`kanbanCardId`、`deliverableId`，但不应依赖平台内部 UI 结构或把学习状态嵌入多个平台字段后再由前端拼装还原。

## Skill 和模板边界

英语阅读、AMC8、Python 编程三类学习模板应逐步固定为 service + skill 模板。

要求：

- 模板选择由学习服务完成；
- prompt/skill 注入在服务层集中管理；
- 前端只传本次学习上下文、材料、回答、反思；
- 不在 `public/app.js` 或 `mobile-server-runtime.js` 中散写模板 prompt；
- 每个模板有 focused tests，覆盖输入规范化、阶段推进和交付文件输出约定。

## 迁移路线

第一阶段：继续在当前工作台中收敛学习域边界。

- 把阅读、评估、编程、金币 UI 继续拆到 `public/app-learning-*.js`；
- 把学习互动阶段收敛到 `adapters/learning-interaction-service.js`；
- 前端预算继续向下收紧，避免 `public/app.js` 回涨。

第二阶段：新增学习系统入口。

- 增加 `public/learning.html` 和 `public/app-learning-shell.js`；
- 共享登录/session/client-version/API client；
- 学习入口默认展示学生当前学习任务、成长档案、复盘和家长入口；
- 工作台只提供跳转入口和必要摘要。

第三阶段：收敛学习聚合 API。

- 新增 `/api/learning/overview`、`/api/learning/cards`、`/api/learning/interactions` 等聚合接口；
- 学习前端逐步减少直接调用 Kanban card API；
- 保留 Kanban/topic 作为平台底层记录和交付承载。

第四阶段：家长后台和审计。

- 完善兑换审批、完成/拒绝、撤销、审计日志；
- 未来真实 RMB 结算必须另行设计支付/provider、step-up auth、保留期、冲正和风控，不直接复用金币 MVP 字段。

## 禁止模式

- 不复制 Hermes Mobile 成另一个长期维护的学习 App；
- 不把学习业务塞进 `server.js`、`mobile-server-runtime.js` 或 `public/app.js` 的新大分支；
- 不把金币、评估、互动阶段混入通用 Todo/Kanban lane state；
- 不在前端直接依赖内部 artifact 路径或私有状态 JSON；
- 不记录或打印学生录音全文、转写全文、题目全文、答案全文或长学习内容；
- 不让 `studentId` 回退成昵称或 Owner 默认身份。金币域中的 `studentId` 仍表示执行者 workspace/account id。

## 当前实施判断

短期最优选择不是独立 fork，而是建立独立学习产品入口和服务边界。这样可以复用 Hermes Mobile 已有的主题、聊天、看板、文件交付、Gateway、Web Push 和权限体系，同时避免学习系统继续污染个人工作台主界面。

如果未来凡凡成长系统需要独立发布，也应优先独立前端打包并调用 Hermes Mobile Platform API，而不是复制平台代码。
