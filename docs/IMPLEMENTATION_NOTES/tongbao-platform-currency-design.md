# 通宝平台货币设计

Status: v399 wallet foundation implemented; exchange/spend/grant pending
Last updated: 2026-05-31

## 目标

`通宝` 是 Hermes Mobile 的平台级基础货币，归属于每一个工作区用户。它不是 Growth 学习金币的改名，也不是 Finance 真实人民币账本的替代。Growth 金币继续表示学习域内的努力、表现和阶段性激励；通宝表示用户在 Hermes Mobile 平台内可流通、可结算、可被多个模块消费的基础权益。

本设计的目标是：

- 为每个工作区用户提供独立通宝钱包。
- 提供幂等、可审计、可冲正的通宝流水。
- 允许管理员按 Owner 配置的规则，把 Growth 金币周期性兑换成通宝。
- 允许未来 Automation、Action Inbox、插件、Education、Finance 报表等模块把通宝作为统一平台货币使用。
- 保持 Growth、Finance、插件和平台钱包之间的边界清晰。

## 非目标

- 通宝 V1 不等同于人民币、现金、银行卡余额或真实支付账户。
- 通宝 V1 不自动接入外部支付、提现、银行流水、税务或发票。
- Growth 金币不会被删除；旧 `/api/learning-coins/...` 兼容接口继续作为学习域积分工作。
- Finance 插件可以读取或展示通宝摘要，但不能把通宝直接混入真实账本交易流水。

## 命名

- 平台货币中文名：`通宝`
- 内部 currency code：`TONGBAO`
- 单位字段：`tongbaoAmount`
- 钱包域：`platform-currency`
- 用户钱包：`user_wallet`
- Growth 学习金币：继续使用 `learning_coins`

UI 文案应优先使用 `通宝`。代码字段使用稳定英文 key，避免用中文字段名进入 API 或 SQLite schema。

## 域边界

### 平台钱包域

平台钱包域拥有：

- 钱包余额。
- 通宝流水。
- 冻结/预扣金额。
- 兑换入账。
- Owner 手动授予/扣减/冲正。
- 跨模块来源的收入和支出记录。
- 审计事件。

平台钱包域不拥有：

- Growth 学习任务评分。
- Growth 学习金币奖励规则。
- Finance 真实账本交易。
- 插件内部业务状态。

### Growth 域

Growth 域拥有：

- 学习金币发放。
- 学习金币余额。
- 学习奖励结算安全门。
- 可兑换额度投影。

Growth 域不能直接写通宝流水。它只能通过兑换桥服务发起一个受控的兑换事务。

### Finance 插件

Finance 可作为通宝的报表或预算展示方，但不能在 V1 中把通宝当作真实人民币账户余额。Finance 如果需要记录通宝相关视图，应保存 summary/reference，而不是复制通宝流水明细或密钥。

## 数据模型

V1 建议使用 Hermes Mobile 主 SQLite，而不是 Growth SQLite。原因是通宝是平台级基础货币，生命周期超过 Growth。

### `platform_currency_wallets`

每个工作区用户一个钱包。

| Field | Type | Notes |
| --- | --- | --- |
| `wallet_id` | text primary key | Stable id, e.g. `wallet:<workspaceId>` |
| `workspace_id` | text unique not null | Owner 或普通工作区用户 id |
| `currency` | text not null | V1 固定 `TONGBAO` |
| `status` | text not null | `active`, `suspended`, `closed` |
| `created_at` | text not null | ISO timestamp |
| `updated_at` | text not null | ISO timestamp |

### `platform_currency_ledger_entries`

通宝流水是唯一余额事实来源。

| Field | Type | Notes |
| --- | --- | --- |
| `entry_id` | text primary key | Stable id |
| `wallet_id` | text not null | Wallet reference |
| `workspace_id` | text not null | Redundant scope for auth/query |
| `currency` | text not null | `TONGBAO` |
| `amount_delta` | integer not null | Positive or negative integer |
| `available_delta` | integer not null | Available balance delta |
| `held_delta` | integer not null | Held balance delta |
| `entry_type` | text not null | See transaction types |
| `source_type` | text | `growth_exchange`, `owner_grant`, `automation_reward`, etc. |
| `source_id` | text | Source record id |
| `idempotency_key` | text not null | Unique with wallet scope |
| `reason` | text | Bounded display reason |
| `metadata_json` | text | Bounded summary-only metadata |
| `created_by_principal_id` | text | Actor principal |
| `created_at` | text not null | ISO timestamp |
| `reversal_of_entry_id` | text | Optional reversal reference |

Unique index:

- `(wallet_id, idempotency_key)`

### `platform_currency_exchange_records`

Growth 金币兑换通宝需要单独记录，因为它跨域消费学习金币并写入平台钱包。该流程是管理员/Owner 操作，不是普通用户自助实时兑换。

| Field | Type | Notes |
| --- | --- | --- |
| `exchange_id` | text primary key | Stable id |
| `workspace_id` | text not null | Receiver workspace |
| `source_currency` | text not null | `LEARNING_COIN` |
| `target_currency` | text not null | `TONGBAO` |
| `source_amount` | integer not null | Learning coins consumed |
| `target_amount` | integer not null | Tongbao credited |
| `exchange_rate_id` | text not null | Owner-configured rule id |
| `status` | text not null | `requested`, `settled`, `rejected`, `reversed` |
| `idempotency_key` | text not null | Unique with workspace scope |
| `source_ledger_entry_id` | text | Learning coin ledger reference if available |
| `target_ledger_entry_id` | text | Tongbao ledger entry |
| `requested_by_principal_id` | text | Actor principal |
| `reviewed_by_principal_id` | text | Owner/reviewer if required |
| `created_at` | text not null | ISO timestamp |
| `settled_at` | text | ISO timestamp |
| `metadata_json` | text | Bounded summary-only metadata |

Unique index:

- `(workspace_id, idempotency_key)`

### `platform_currency_exchange_rules`

Owner-managed exchange policy.

| Field | Type | Notes |
| --- | --- | --- |
| `rule_id` | text primary key | Stable id |
| `source_currency` | text not null | `LEARNING_COIN` |
| `target_currency` | text not null | `TONGBAO` |
| `source_amount` | integer not null | e.g. 100 learning coins |
| `target_amount` | integer not null | e.g. 10 tongbao |
| `min_source_amount` | integer | Minimum exchange amount |
| `daily_source_limit` | integer | Per workspace daily limit |
| `requires_owner_review` | integer | 0/1 |
| `status` | text not null | `active`, `disabled` |
| `updated_by_principal_id` | text | Owner principal |
| `updated_at` | text not null | ISO timestamp |

## Transaction Types

V1 transaction types:

- `owner_grant`: Owner 手动发放通宝。
- `owner_adjustment`: Owner 手动调整或扣减。
- `growth_coin_exchange`: Growth 金币兑换通宝入账。
- `hold`: 预扣通宝。
- `release_hold`: 释放预扣。
- `spend`: 消费通宝。
- `refund`: 退款。
- `reversal`: 冲正历史流水。

余额计算规则：

- `availableBalance = sum(available_delta)`
- `heldBalance = sum(held_delta)`
- `totalBalance = availableBalance + heldBalance`

任何消费、兑换、预扣都必须以流水为准，不允许直接更新余额字段作为事实来源。钱包表可以缓存余额，但缓存必须可由流水重建。

## 兑换规则

Growth 金币兑换通宝必须经过兑换桥。兑换桥由管理员/Owner 周期性触发，V1 默认按月处理总额，不跟单张 Growth 卡片完成实时绑定：

1. 管理员/Owner 发起兑换请求，提供 workspace、结算周期、source amount 和 idempotency key。
2. 兑换桥读取 Growth 学习金币可用余额。
3. 兑换桥读取当前 active exchange rule。
4. 若超出限额、余额不足、规则停用或需要审批，则进入明确状态。
5. 对于无需审批的兑换，兑换桥在一个事务中：
   - 记录 exchange record。
   - 扣减或冻结 Growth 学习金币。
   - 写入通宝 `growth_coin_exchange` 流水。
   - 标记 exchange `settled`。
6. 对于需要审批的兑换，先进入 `requested`，Owner 审批后再结算。

重复请求必须用 `(workspace_id, idempotency_key)` 返回同一个 exchange result，不得重复扣减或重复入账。

卡片完成时只结算 Growth 学习金币。它不得直接写通宝流水，也不得实时触发通宝兑换。月度兑换完成后，兑换桥负责记录 Growth 金币清零/扣减依据，并写入对应通宝流水。

## 权限模型

Owner:

- 查看所有工作区钱包。
- 配置兑换规则。
- 手动发放、扣减、冲正通宝。
- 审批需要 Owner review 的兑换。
- 查看审计记录。

普通工作区用户:

- 查看自己的通宝钱包和自己的通宝流水。
- 查看自己的兑换记录。
- 不能查看他人钱包。
- 不能修改兑换规则。
- 不能手动发放或扣减。
- 不能自行发起 Growth 金币兑换通宝。

服务/插件:

- 只能通过服务层 capability 写入通宝。
- 需要明确 source type、source id 和 idempotency key。
- 不能直接写 SQLite。

## API 草案

V1 平台 API:

- `GET /api/platform-currency/wallet?workspaceId=<workspace>` implemented in v399 as read-only lazy wallet creation with default `0` balance.
- `GET /api/platform-currency/ledger?workspaceId=<workspace>&limit=...` implemented in v399 as read-only ledger listing; v399 starts empty because no mutation API is enabled.
- `POST /api/platform-currency/grants` Owner-only
- `POST /api/platform-currency/adjustments` Owner-only
- `POST /api/platform-currency/holds`
- `POST /api/platform-currency/holds/:holdId/release`
- `POST /api/platform-currency/spend`
- `POST /api/platform-currency/reverse` Owner-only

V1 兑换 API:

- `GET /api/platform-currency/exchange-rules`
- `POST /api/platform-currency/exchange-rules` Owner-only
- `POST /api/platform-currency/exchanges/growth-coins`
- `GET /api/platform-currency/exchanges?workspaceId=<workspace>`
- `POST /api/platform-currency/exchanges/:exchangeId/approve` Owner-only
- `POST /api/platform-currency/exchanges/:exchangeId/reject` Owner-only

所有 mutation API 必须要求 idempotency key。没有 idempotency key 的 mutation 应 fail closed。

## 服务拆分

建议新增：

- `adapters/platform-currency-service.js`
  - 钱包、流水、余额、hold/spend/refund/reversal。
- `adapters/platform-currency-repository.js`
  - SQLite schema/migration/transaction helpers。
- `adapters/platform-currency-exchange-service.js`
  - Growth 金币到通宝的兑换桥。
- `server-routes/platform-currency-api-routes.js`
  - API route group。
- `public/app-platform-currency-ui.js`
  - 钱包摘要、流水、兑换入口。

现有 Growth 服务调整：

- `learning-coin-service` 继续拥有学习金币。
- `learning-reward-settlement-service` 继续只写学习金币。
- 新增兑换桥调用学习金币服务的 debit/hold 能力；如果现有学习金币服务不支持扣减/冻结，需要先补幂等 debit/hold，而不是从平台钱包服务直接改 learning coin store。

## UI 草案

V1 不建议新增一个强主导航标签。建议先放在：

- 个人/工作区账户摘要区。
- Growth 页面中显示“学习金币 -> 通宝”的兑换卡片。
- Owner 管理面板显示兑换规则和全局钱包审计入口。

用户可见信息：

- 通宝余额。
- 冻结通宝。
- 最近流水。
- 学习金币可兑换数量。
- 当前兑换率。
- 今日剩余兑换额度。
- 兑换状态。

不显示：

- 内部 idempotency key。
- raw metadata。
- 插件密钥、Finance token、真实支付凭证。

## 插件和 MCP 边界

插件可读取通宝摘要，但写入必须通过 Hermes Mobile 平台 API 或 MCP 工具的受控能力。

未来 MCP toolset 可提供：

- `platform_currency_get_wallet`
- `platform_currency_list_ledger`
- `platform_currency_request_growth_exchange`
- `platform_currency_grant` Owner-only
- `platform_currency_adjust` Owner-only

工具返回只能是 summary-only，不返回 raw audit metadata、密钥、完整私有业务记录或长日志。

## 迁移策略

阶段 1: 文档和服务骨架

- 增加通宝设计文档。
- 增加平台钱包 schema/service/API harness。v399 已完成 `platform_currency_wallets`、`platform_currency_ledger_entries`、`platform-currency-service`、只读 API、`/api/workspaces` 钱包投影和导航页展示。
- 不迁移现有学习金币。

阶段 2: 通宝钱包上线

- 为已有 workspace 用户 lazy-create wallet。v399 已完成，默认余额为 `0`。
- Owner 可手动发放通宝。
- 用户可查看余额和流水。v399 暂时只在导航工作区面板显示通宝余额，独立钱包页待后续实现。

阶段 3: Growth 金币兑换

- 增加兑换规则。
- 增加 Growth 金币 debit/hold 能力。
- 增加兑换 API 和 UI。
- 历史 Growth 金币不自动转换；用户主动兑换或 Owner 批量迁移必须产生审计流水。

阶段 4: 跨模块使用

- Action Inbox、Automation、Education、插件逐步接入通宝 source type。
- Finance 只做 summary/report integration，不直接承载通宝事实流水。

## Harness 要求

通宝是 H1 流程。实现时必须至少覆盖：

- Wallet lazy-create is idempotent.
- Owner grant/adjustment is idempotent and audited.
- Non-Owner can only read and mutate own wallet-scoped flows.
- Cross-workspace spoofed `workspaceId` is rejected.
- Growth coin exchange does not double debit or double credit on retries.
- Exchange rule changes do not mutate already settled records.
- Owner review path settles only after approval.
- Rejection releases or avoids holds.
- Reversal creates a new entry and preserves the original entry.
- Ledger and exchange records store summary-only metadata.
- UI projection shows available/held/total balances consistently.

Suggested tests:

- `node tests\platform-currency-service.test.js`
- `node tests\platform-currency-api-routes.test.js`
- `node tests\platform-currency-exchange-service.test.js`
- `node tests\learning-coin-service.test.js`
- `node tests\learning-coin-api-routes.test.js`
- `node tests\mobile-sqlite-store.test.js`
- `node tests\architecture-refactor-boundary.test.js`

## Open Decisions

- 初始兑换率，例如 `100 学习金币 = 10 通宝`，需要 Owner 决定。
- 是否允许通宝转账给其他工作区用户，V1 建议不开放。
- 是否允许普通模块直接消费通宝，V1 建议先只支持 Owner grant、兑换、hold/spend 基础能力。
- 是否需要 Action Inbox 审批通宝兑换，取决于 Owner 对兑换金额和频次的控制要求。
