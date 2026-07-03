# Module: Action Inbox

## Responsibility

Action Inbox is the lightweight Hermes Mobile surface for passive or durable things that need a user's attention: manual todos/reminders, automation delivery results, Growth/executor card completion, permission/approval/review requests, and later module handoffs.

It is a Hermes Mobile product domain, not a wrapper around official Hermes Kanban. It should be backed by local Hermes Mobile persistence and should stay fast enough for repeated mobile use.

## Product Shape

- The bottom navigation label is `信息`; the route and internal domain remain Action Inbox (`view=inbox`).
- The intended primary bottom navigation is `聊天 / 信息 / 话题 / 目录 / 成长`.
- `自动化` becomes a background capability. Its completed/failed deliveries should enter Action Inbox instead of requiring a permanent bottom tab.
- The Inbox top-right overflow menu is the primary mobile entry for Automation management: open the Automation list or create a new automation from Inbox without restoring Automation as a bottom tab.
- Inbox root actions, including new manual Inbox item creation, belong in the top-right overflow menu rather than inline page buttons.
- During Audit Request V1, the same Inbox overflow menu may expose a temporary
  audit request entry. The entry uses a controlled target selector, not a
  free-form workspace id field. `home-ai` targets `Home AI Platform Audit`;
  plugin targets such as `music`, `finance`, and `codex-mobile` target
  `Plugin Workspace Audit`. The entry sends one Codex Mobile task card to the
  selected central audit thread; it does not create an Automation plan, run the
  audit locally, fan out to plugin implementation threads, or store full audit
  reports in Inbox rows.
- Autonomous Delivery Loop creates Owner start/approval items with
  `sourceType=autonomous_delivery`. Those rows are attention projections only.
  The loop coordinator remains responsible for execution state, task-card
  routing, verification, and closure; Inbox must not become the execution
  engine or a store for full private work payloads.
  Owner approval/review rows for Autonomous Delivery, AI Ops remediation, and
  plugin conversation repair requests must be dedupe-keyed. Updating an already
  open row with the same dedupe key may refresh title/summary/source metadata,
  but it must not send a second Web Push notification or create a second
  approval item. A reopened row may notify again because it represents a new
  actionable Owner attention state.
  Terminal completed return cards may also create
  `sourceType=autonomous_delivery`, `itemType=review` rows that tell Owner a
  delivery slice is ready for verification/deploy/audit decisions. These review
  rows are projections of the coordinator ledger, not the verification engine.
  Implementation or repair returns that report runtime/production changes
  without completed deployment evidence create
  `notificationType=autonomous_delivery.deploy_readback_required` rows. Those
  rows expose `部署读回`, optionally accept an Owner prompt, and dispatch only
  one deployment/readback task card after Owner action.
  Completed verification returns create a separate Owner closure review row
  with `notificationType=autonomous_delivery.closure_required`. That row
  exposes `完成闭环` and calls the Owner-only close API only after the case is
  already `verified_waiting`.
  Owner closure creates a final delivery row with
  `notificationType=autonomous_delivery.final_report_ready`. That row exposes
  `查看报告` and stores only bounded markdown evidence: case/slice ids,
  statuses, short summaries, task-card ids, return-card ids, and event counts,
  never raw task bodies, prompts, secrets, private payloads, screenshots,
  database rows, or long logs.
  Failed verification returns create Owner repair review rows with
  `notificationType=autonomous_delivery.repair_required`. Those rows expose
  `发修复卡`, optionally accept an Owner prompt, and dispatch only after Owner
  action to the original implementation workspace.
  Owner-triggered dispatch actions complete the approval/review row only after
  the Codex task-card transport returns at least one concrete task-card id. A
  routing failure, exception, or response with no card id leaves the row open
  and records a bounded failure in the owning service so Owner can retry or
  route the repair explicitly.
- Inbox detail/create screens are secondary screens. They must use the shared top-left back button and right-swipe back path; the content area should not render another back button or duplicate the top bar title.
- Existing simple Todo behavior becomes an Action Inbox item type instead of a separate product tab.
- Todo must appear as its own primary Inbox filter tab. The default Inbox list
  opens on `当前`, which is the open non-Todo attention queue. `待办` is the
  second filter tab and is reserved for manual user-created Todo/reminder rows
  that require the user to complete something at a specified time. Ordinary
  non-Todo Inbox status tabs such as `当前`, `稍后`, `已完成`, and `其他` exclude
  `itemType=todo` so Todo rows do not mix with Automation, plugin, Growth,
  approval, or delivery rows.
- The `待办` filter is strict: it may render only rows whose persisted
  `itemType` is `todo` and whose `sourceType` is `manual`. The client keeps a
  final display-side guard in addition to the API query so stale filters,
  deep-link refreshes, or cached responses cannot show Automation deliveries,
  scheduled reports, error, review, or plugin receipt rows inside the Todo tab.
- Active chat/topic task receipts should not enter the default Inbox. Those are immediate responses to a request the user just made, so Web Push should route directly back to the relevant chat/topic/task view.

## Non-Goals

- Do not reuse official Hermes Kanban as the Action Inbox source of truth.
- Do not expose the official Kanban dashboard or database through the mobile UI.
- Do not turn Action Inbox into an execution engine. Automation, Growth, Gateway runs, and Chat remain responsible for doing work.
- Do not copy full learner answers, transcripts, prompts, automation output bodies, secrets, or push endpoints into Inbox summaries.

## Phase 1 Core Files

- `adapters/action-inbox-service.js`
- `adapters/action-inbox-repository.js` or focused SQLite helpers in `adapters/mobile-sqlite-store.js`
- `server-routes/action-inbox-api-routes.js`
- `public/app-action-inbox-ui.js`
- `tests/action-inbox-service.test.js`
- `tests/action-inbox-api-routes.test.js`
- `tests/mobile-sqlite-store.test.js`
- `tests/task-list-ui.test.js`
- `tests/web-push-delivery-service.test.js`

## Item Model

An Inbox item is a summary/action projection, not the canonical record for the source module.

Core fields:

- `id`
- `workspaceId`
- `assigneeWorkspaceId`
- `sourceType`: `manual`, `automation`, `growth`, `chat`, `directory`,
  `weixin`, `autonomous_delivery`, or future module id.
- `sourceId`
- `sourceRef`: public-safe structured reference, such as route ids.
- `itemType`: `todo`, `delivery`, `review`, `reflection`, `revision`, `approval`, `mention`, `error`, or `info`.
- `title`
- `summary`
- `status`: `open`, `waiting`, `done`, `dismissed`, or `archived`.
- `priority`: `normal`, `high`, or `urgent`.
- `dueAt`
- `availableAt`
- `deepLink`
- `dedupeKey`
- timestamps for created, updated, completed, dismissed, and latest event.

Every state-changing operation should append an audit event so the UI state can be explained after refresh or restart.

## Source Rules

### Manual Todo

Manual todos create first-class Action Inbox items. They do not need official Kanban boards, worker assignment, or multi-agent state.

Manual Todo/reminder is a Home AI host capability, not a normal embedded
plugin. The UI may expose Todo-like entry points from Inbox or plugin-like
launchers, but the canonical persistence, permissions, Web Push, audit events,
and cross-workspace assignment rules belong to the host.

Natural-language Todo creation must use a model-guided Skill to produce a
structured draft. The host must not infer assignee, time, recurrence, or
priority through keyword-only parsing. The model output is only a draft; the
host validates required fields, workspace access, date formats, recurrence
support, and confirmation requirements before creation.
The current Skill is `skills/productivity/home-ai-todo-intake/SKILL.md`.
Host-side routing may only detect that the user is explicitly asking to create
a Todo/reminder/alarm; it must not parse people, dates, titles, or recurrence
from the utterance. Those fields come from the Skill-guided model draft and are
then validated by `actionInboxTodoService`.

One-shot reminders are represented as `itemType=todo`,
`sourceType=manual` Inbox items with `status=waiting` and `availableAt` set to
the reminder time. A host reminder tick activates due items to `open`, appends
an audit event, broadcasts Inbox refresh, and sends Web Push to the assignee.
The status vocabulary remains compact: `waiting` is the pre-reminder state,
`open` is actionable, and terminal states remain `done`, `dismissed`, or
`archived`. `overdue` is reserved for future explicit overdue projections and
must not be used as a hidden scheduler state.

Owner or another authorized workspace may assign a manual Todo/reminder to a
different workspace. The assignee owns the actionable Inbox item. The source
reference records `creatorWorkspaceId` and `assigneeWorkspaceId` only as
bounded metadata. Creation sends Web Push to the assignee even when the Todo is
a future reminder; the due reminder tick may send a second Web Push when the
item becomes actionable. When creator and assignee differ, the host also creates
a creator-side tracking item with `sourceRef.sentTracking=true` and
`sourceRef.assignedTodoItemId=<assignee item id>`. The tracking item is visible
to the creator but must not participate in reminder activation or duplicate
assignee push delivery. When the assignee completes the item, the host marks the
creator-side tracking item done, creates a summary-only completion receipt for
the creator, and may send Web Push to the creator. The receipt must not copy
private task discussion or long content.

Periodic or complex recurring Todos are not stored as independent Inbox
schedules. They are Automation-backed rules that create one Inbox Todo
occurrence per trigger. Completing an occurrence does not delete or pause the
Automation rule.
Automation-backed Todo reminder occurrences should render as Todo rows with
Todo actions. They may retain `automationId` in `sourceRef` for rule
traceability, but generated Markdown run outputs must not be shown as the
primary reminder deliverable.

Legacy Todo/Kanban is not a product-compatible Todo surface for ordinary user
Todos. New user-created Todos must enter Action Inbox Todo. The legacy
`/api/todos` route is only a bounded compatibility URL: list/create project
Action Inbox Todo records, complete maps to Action Inbox Todo completion,
cancel/delete map to Inbox dismissal, and legacy Kanban-only actions such as
block/revise/postpone must return a disabled/retired error. The mobile UI must
route ordinary Todo entry points to Action Inbox, not the retired Todo/Kanban
list or composer. Any legacy direct-create keyword detector controlled by
direct Todo/Kanban compatibility flags is not the product natural-language path
and must remain off by default.

Natural-language Todo creation is part of the same host-owned Todo path, but it
belongs behind an explicit creation surface. The Inbox top-right `新建待办事项`
entry may accept natural language, run the Todo-intake Skill, validate the
structured draft, and then create the Action Inbox Todo. Ordinary chat text must
not run a Todo-intake preflight before every model turn. If the user asks in
ordinary chat for Home AI or Hermes to do current work, the request should go
directly to the chat model unless the user explicitly opens a Todo/reminder
creation entry point.

Current-work execution requests are not Todo requests. Messages asking Home AI,
Hermes, a plugin, or an agent to inspect code, operate a plugin, search,
summarize, fix a bug, rename product copy, replace text, deploy, or continue
current work must proceed as ordinary chat unless the user explicitly asks to
add/save/create a Todo, reminder, alarm, or later follow-up from the Todo
creation surface. Even when a Todo-intake model returns a draft, host
auto-creation requires high confidence from both the detection and draft; below
the auto-create threshold, the host skips persistence.

Cross-workspace natural-language Todo creation must provide the Todo-intake
model with a bounded list of assignable workspace candidates from the workspace
catalog. The model may use a candidate `workspaceId` only when the user's name
or workspace wording matches a candidate display name or alias. If the person is
not in that bounded candidate list or remains ambiguous, the model should return
`assigneeDisplayName`, leave `assigneeWorkspaceId` empty, and ask for
confirmation instead of inventing an id.

The execution service must call Action Inbox Todo creation directly for
model-produced drafts. It must not call the retired `todoProvider.addTodo()`
first and then mirror the result into Inbox, because that leaves chat success
messages backed by data that the current Inbox list no longer reads.

The explicit natural-language Todo creation surface must show in-panel
model/save progress while it is running. At minimum, the user should see that
Home AI is understanding the Todo request, preparing the structured draft, and
saving the confirmed item. Ordinary chat still must not run or display Todo
intake progress.

Manual Inbox Todo is its own mobile source surface. If an older item still
carries a legacy `/?view=todos...` or `todoId` deep link, the Inbox UI must not
render `Open source` for that link and must not navigate into the retired
Todo/Kanban compatibility surface. Scheduled Todo items created by Automation
remain `sourceType=automation` and may still open Automation detail with Inbox
return context.

### Automation

Automation remains a background job engine. A successful run that creates a user-facing delivery should upsert a `delivery` Inbox item. A failed run should upsert an `error` item with a short failure summary and a deep link to the relevant job detail or output history.

For model-backed CRON jobs that produce the final answer directly in the run
Markdown instead of writing a separate `MEDIA:` file, the non-empty
non-`[SILENT]` run output is a delivery document. The Inbox projection should
show it as a normal automation delivery pointer and keep the report body in the
Automation output file instead of copying it into the Inbox row.

Foreground push refresh should update Inbox state when automation push payloads include an Inbox item id or source reference.

Plugin workspace audit request and return-card projections are review sources.
The manual trigger may show a sent-card receipt, and the central audit thread may
return bounded completion/blocked status later. Inbox rows must store only
summary metadata, target plugin id, central audit thread/card references, safe
deep links, and bounded status. They must not store the full audit report,
private workspace contents, raw logs, prompts, or fixed Codex thread-id mapping
configuration.

Scheduled audit rows are background system-maintenance signals, not ordinary
current work. The default Inbox `当前` projection must hide low-signal scheduled
audit rows such as clean visual-audit deliveries, `info` receipts, and
normal-priority scheduled audit reviews. Manual audit runs and high-signal
scheduled audit rows (`error`, high/urgent priority, or high/critical severity)
remain visible. Explicit Automation/source queries or `includeSystemAudit=1`
may still show the full audit projection for troubleshooting.

Audit Inbox rows are triage pointers, not report storage. They must not copy
full report bodies, raw diffs, raw executor logs, raw model output, prompts,
tokens, launch keys, push endpoints, private plugin data, or local filesystem
paths. The source report and audit history remain canonical.

Action Inbox may expose the first manual Product Reality audit surface. That
surface only selects a registered target from the controlled target list, an
audit mode defaulting to `product_reality`, and optional guidance. It must call
the explicit manual route `POST /api/automations/plugin-workspace-audits/run`,
not the generic natural-language Automation interpreter and not an arbitrary
path runner. The route sends a central audit request card and must not create a
local Automation job. The user-facing completion message should say the request
was sent to the central audit thread, not that Home AI is executing a
background job.

Host-side audit projection is provided by `pluginWorkspaceAuditService` and
uses `actionInboxService.upsertSourceItem`. Projection callers must pass only
summary fields, safe report/deep-link references, severity, and finding count.
The default dedupe key for plugin audit Inbox rows is stable by workspace,
plugin, audit mode, and item type; it must not include the per-run report file
or audit run id unless a caller explicitly needs separate rows. This keeps
scheduled audits updating the same triage pointer instead of flooding the
current list.
When the plugin workspace audit runner executes from CRON, it may upsert this
summary item directly through the runtime SQLite store if a configured database
path is available. If no database path is configured, the run still succeeds and
the report remains available through Automation output. The Inbox item must
continue to store only summary metadata and a report URL, not the report body or
target workspace path.

Automation delivery items may carry a summary-only `sourceRef.latestDeliverable`
object with `name`, `url`, `mime`, and timestamp metadata. The Inbox list may
render this as a direct file tag using the same Automation detail deliverable
visual pattern so the common reading path opens the Markdown/PDF/document
preview from the list, in the same Hermes Mobile window, without first opening
the Inbox detail or the Automation detail. The deliverable body must remain in
the source file/preview route and must not be copied into Inbox.
Scheduled Todo/reminder Automation rows may also render this direct deliverable
file tag when the run produced a safe `latestDeliverable`; Todo semantics affect
completion/sort behavior, not whether the delivery file is reachable.

Recurring reminder-style automations are treated as scheduled Todo triggers,
not ordinary delivery receipts. When an automation job is explicitly marked as
`scheduledTodo` / `todo` / `reminder`, or clearly looks like a recurring
reminder from its summary fields, each trigger should upsert an open Inbox
`itemType=todo` item with `sourceType=automation` and
`sourceRef.scheduledTodo=true`. Completing that Inbox item means the user
completed this occurrence; it does not delete the recurrence rule. Editing or
pausing the recurrence remains an Automation action.

### Growth

Growth remains the canonical learning task system. Inbox may show action items such as:

- evaluation completed and reflection needed;
- revision needed;
- parent review needed;
- reward or completion notice.

The item must link back to the Growth card/detail. It must not store full learner content.

When a Growth task is truly completed after evaluation/reflection/manual pass, the completion notice is a summary-only Inbox item for the task workspace, Owner, and each workspace whose access policy allows that task workspace. Each recipient workspace gets its own Inbox item and Web Push deep link. `sourceRef.taskWorkspaceId` preserves the original task workspace; item title/summary may include task id/title, score, reward status, and reflection status only.

### Chat, Mentions, And Active Receipts

Chat remains the message source of truth. Later integration may create Inbox items for direct mentions, permission requests, approvals, or requested follow-ups. Group/chat message bodies should stay in the chat thread, not be copied into Inbox.

Ordinary active chat/topic task terminal receipts do not create Inbox items. The Web Push payload should link directly to the original task/chat route. If a future chat-derived workflow is passive and needs later attention, it should use a specific source/category such as `approval`, `review`, `growth`, or `automation`, not a generic chat receipt.

### Embedded Plugins

Embedded plugins use `sourceType=plugin` for durable notification events that
Hermes should surface in Inbox and optionally Web Push. The canonical plugin
record remains in the plugin application. Inbox stores only:

- `pluginId`
- stable `eventId` / `sourceId`
- compact `notificationType`
- bounded route metadata such as `route.name`, `route.tab`, or `route.itemId`
- a Hermes app deep link to Inbox or the plugin tab

Plugins must not copy private inventories, long reports, raw model output,
secrets, launch tokens, push endpoints, or database paths into Inbox. If the user
needs details, the Inbox row links back to the plugin UI/API.

Finance ledger join requests are plugin approval events, not ordinary plugin
delivery receipts. A Finance payload with `type=finance.ledger_join_request`
is normalized into an Inbox `itemType=approval` item for the target Hermes
workspace, normally Owner. The Inbox item may store only bounded approval
metadata: request id, ledger id/name, requester display name/id, requested role,
target display name/id, status, created time, and route metadata. It must not
store Finance tokens, Hermes workspace keys, cookies, bank/account details,
receipt bodies, voucher images, push endpoints, or long logs.

Owner approval and rejection are explicit Inbox actions. Hermes must call the
Finance review contract first, using the Finance review tool shape
`finance.review_ledger_join_request` with `{ request_id, decision, role,
member_ids }` for approval and `{ request_id, decision }` for rejection. Hermes
may only transition the Inbox item after Finance confirms success: approval
marks the item `done`, rejection marks it `dismissed`. Hermes must not restore
QR-code, invite-link, or generic direct-database joining paths for Finance
ledger membership.

Plugin conversation repair requests use `sourceType=plugin_conversation` and
`itemType=approval`. They are created by the Home AI host conversation surface
when a plugin-related chat identifies a bounded implementation request, such as
a missing Health strength-catalog action. They are not plugin iframe
notifications and they are not direct Codex dispatches.

Ordinary chat and directory-bound topic chats may use the same Owner-gated
approval mechanics for Home-AI-owned platform or Gateway capability gaps. Those
assistant replies append `homeai-owner-task-request` instead of
`homeai-plugin-conversation-action`; Gateway run completion submits the request
server-side with `pluginId=home-ai`, so the eventual Owner-approved task card
targets the Home AI app thread/workspace. The browser client scanner remains a
compatibility path, but directory-bound topic chats must not depend on a DOM
mutation being observed before the request reaches Action Inbox. This is the
route for low-permission Gateway capability gap requests such as "safe real
Office/PPTX generation and validation", where the model may prepare a request
but must not claim a real `ainb_*` or `ttc_*` until the Host returns one.
Home-AI-owned repair dispatch must not pin an old dated implementation-thread
title such as `Home AI 06-18`; it uses the Home AI app workspace plus the
`Home AI` thread-title prefix so Codex Mobile selects the current discoverable
Home AI implementation thread. Old approval rows that still contain a stale
exact title are upgraded at dispatch time before sending the task card. Because
Codex Mobile requires a task-card source thread to differ from the target
thread, Home-AI-owned repair dispatch uses the dedicated `Home AI Task Intake`
Codex thread as the source. The target is a current Home AI implementation
thread selected through the `Home AI` title prefix. Codex Mobile routing must
not auto-dispatch these Home-AI-owned implementation cards directly to the
`Home AI Worker Lane A/B/C` worker lanes, because those lanes share the same app
repository and can conflict on source files, tests, commits, deployment, and
handoff updates. The current main Home AI implementation thread is the
orchestrator: it may explicitly delegate a bounded subtask to a worker lane only
after defining the module/file boundary, write lock, validation responsibility,
and return-card path. Worker lanes must return bounded evidence to the main
thread; the main thread owns final merge, full validation, commit, deploy, and
closure. `Home AI Task Intake` is only a task-card/return-card intake lane; it
is not the Home AI audit thread and must not replace `Home AI Platform Audit`
for Product Reality or platform audits.

Plugin conversation repair approvals are idempotent by bounded request
signature. Equivalent server-side and client-fallback submissions may update the
same row while it is open, but they must not create a second Owner approval,
reopen a terminal approval, dispatch a second task card, or trigger another Web
Push. A new Owner approval requires a distinct bounded request signature.

Host-side assistant replies in plugin conversation topics may create these rows
by appending a hidden `homeai-plugin-conversation-action` JSON comment. The
Gateway run-completion path submits the bounded request through the same
bridge; the client also strips that metadata from display, deduplicates recent
completed assistant messages, and may submit the request to
`POST /api/plugin-conversation/actions` as a compatibility fallback. The host
bridge deduplicates those two transport paths by plugin id, request type, title,
and a compact problem-summary prefix, because one path can preserve longer text
or source message ids while the other may send a trimmed payload. Sparse client
fallback updates must not erase the server-completion source thread/turn
metadata, and must not create a second Owner approval row or second Web Push for
the same bounded request. This path must not create an ordinary Todo/Kanban
`t_*` card or claim a repair card was submitted. A visible dispatchable approval
row has an `ainb_*` id; a real Codex repair card exists only after Owner clicks
`发修复卡` and receives a `ttc_*` id.
If a Gateway reply still claims a legacy `t_*` card was created for an
implementation repair request without a real hidden Owner request marker or
`ainb_*`/`ttc_*` id, run completion treats that as a recoverable transport
contract violation. The host creates a bounded Home-AI-owned Owner approval row
from the visible claim metadata and records a `legacy_task_card_claim_recovered`
event instead of letting the request disappear from Inbox.

The Inbox item stores only the plugin id, request id, request type, target
thread/workspace metadata, bounded summary, suggested change, and compact
evidence. The action sheet exposes `发修复卡`, `稍后`, and `删除`. `发修复卡`
requires Owner auth, may collect an optional Owner prompt, and calls:

```http
POST /api/plugin-conversation/actions/:item_id/task-card
```

The dispatch endpoint appends the Owner prompt to the task card and only then
marks the Inbox item `done`. Non-Owner workspaces may create an Owner-visible
request through the bridge, but they cannot dispatch a task card or attach the
Owner prompt.

Repeated submissions with the same bounded signature must update the existing
approval row without sending duplicate system notifications. Owner push is sent
only when the Action Inbox upsert created a new row or truly reopened a terminal
row.
For AI Ops diagnostic remediation, the same diagnostic case does not reopen a
terminal Owner row: a dismissed or completed case item may receive bounded
metadata updates, but it must not create another approval prompt or Web Push
unless a new diagnostic case id is created.
For plugin conversation repair requests, the stable bounded signature is also
the Codex task-card `requestId` basis; different transport `requestId` values
for the same bounded request must not create a second approval row, second Web
Push, or second Codex task-card dispatch. If the same approval item is submitted
again after a successful dispatch, the dispatch endpoint returns the prior
task-card ids from the Inbox completion event and does not call Codex Mobile
again.

AI Ops diagnostic remediation rows and plugin conversation repair rows must
show button-level dispatch state. When Owner taps `发修复卡`, the row/action
sheet must immediately show `正在发送`, disable the active send action, and keep
the row open if dispatch fails. Failures must leave a bounded visible error
message and support retry. After repeated failures for the same item/action,
the client reports a Home-AI-owned diagnostic event so the platform task-card
dispatch path itself can be repaired. If the diagnostic case is already
`card_sent`, the dispatch operation is idempotent: the row should be marked
handled and must not reopen only because later diagnostic events matched the
same case.
When an AI Ops diagnostic remediation dispatch succeeds, or the case was
already `card_sent`, the dispatch workflow must complete the corresponding
Inbox item when the UI supplies its `itemId`; successful task-card delivery
must not leave an actionable approval row behind.

## Official Kanban Cutover

Official Hermes Kanban is legacy for Hermes Mobile Todo after the Action Inbox migration.

Cutover rule:

1. Back up official Kanban data before destructive cleanup.
2. Inventory boards using metadata only: board id, task id, title, status, timestamps, and source tags.
3. Preserve the current `Everything's amazing` reading task or explicitly migrate it into Growth/Inbox before cleanup.
4. Delete/archive other historical official Kanban tasks only after the backup and migration check.
5. Change production Todo/Inbox configuration away from `HERMES_WEB_TODO_BACKEND=kanban` only after the local Inbox path can create, list, complete, dismiss, and deep-link items.

## API Shape

Phase 1 routes:

- `GET /api/action-inbox`
- `GET /api/action-inbox/:itemId`
- `POST /api/action-inbox`
- `POST /api/action-inbox/todo-drafts/validate`
- `POST /api/action-inbox/todos`
- `POST /api/action-inbox/todos/tick`
- `POST /api/action-inbox/:itemId/complete`
- `POST /api/action-inbox/:itemId/dismiss`
- `POST /api/action-inbox/:itemId/snooze`
- `POST /api/action-inbox/:itemId/finance-ledger-join/approve`
- `POST /api/action-inbox/:itemId/finance-ledger-join/reject`

Auth mode is workspace-scoped. Owner may inspect or manage configured family/workspace projections, but ordinary workspaces should only see items assigned to or visible to that workspace.

Autonomous Delivery Loop uses Action Inbox as the Owner create/attention
surface while the coordinator ledger remains canonical. The `新建交付 Loop`
entry posts the Owner's natural-language objective to
`POST /api/autonomous-delivery/cases`, stores the case/slices, and creates the
Owner start item without dispatching any task cards. Start items expose
`开始执行` / `确认并开始` and call the coordinator's manual start route.
Verification review items expose `开始验证`; that action creates a
ledger-backed verification slice and sends one task card to the central audit
thread. Deployment/readback review items expose `部署读回`; that action creates
a ledger-backed deployment slice and sends one deployment/readback card to the
configured Home AI deploy lane pool without performing local deployment in the
Inbox UI. The deployment card carries `cardKind=plugin_deployment` and
`pluginId=<plugin-id>` when available so the task-card router can select a
stable lane. Repair review items expose `发修复卡`; that action creates a
ledger-backed repair slice and sends one repair card back to the original
implementation workspace.
Closure review items expose `完成闭环` only after the coordinator case is
already `verified_waiting`. None of these item types auto-dispatch cards before
Owner action, and repeated dispatch failures use the Home AI diagnostic
channel.

## Validation

- `node tests\action-inbox-service.test.js`
- `node tests\action-inbox-todo-service.test.js`
- `node tests\action-inbox-api-routes.test.js`
- `node tests\plugin-conversation-action-bridge-service.test.js`
- `node tests\plugin-conversation-action-api-routes.test.js`
- `node tests\autonomous-delivery-coordinator-service.test.js`
- `node tests\autonomous-delivery-api-routes.test.js`
- `node tests\finance-ledger-join-approval-service.test.js`
- `node tests\mobile-sqlite-store.test.js`
- `node tests\hermes-plugin-notification-service.test.js`
- `node tests\app-action-inbox-ui.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\automation-api-routes.test.js`
- `node tests\learning-program-api-routes.test.js`
- `node tests\architecture-refactor-boundary.test.js`

## Constraints

- Keep mobile UI compact and scan-friendly.
- Inbox rows and detail headers should show explicit source/type badges, not only low-contrast metadata, so items from Automation, Growth, manual Todo/reminder, approval/review, and executor completion notices are distinguishable at a glance.
- Inbox row titles should describe the actual source task or reminder. Generic
  titles such as `待办提醒` are fallback labels only; for Automation scheduled
  Todo rows, use the Automation/reminder name as the title and rely on the
  source/type badges to show `来源：自动化` and `类型：待办`.
- Do not duplicate the top bar title inside the Inbox content area. Page-level actions should stay in the overflow menu; form-submit controls may remain in the form itself.
- Keep source modules canonical; Inbox only stores summary/action projection and audit events.
- Dedupe by stable source references so repeated refreshes or Web Push deliveries do not create duplicate items.
- Web Push should deep-link to Inbox when the user's next action is best represented there.
- Inbox detail must expose a clear source action when `deepLink` or a safe `sourceRef` route exists.
- Automation receipt rows are direct-source rows: tapping the Inbox list row should open the matching Automation detail by `automationId` immediately, without first showing an intermediate Inbox detail. The generated route must carry Inbox return context (`returnTo=inbox`, direct detail scope, and the safe source Inbox item id) so the top-left back button and right-swipe return to the Inbox list instead of the Automation list.
- The Inbox row to Automation detail path is an internal secondary-page navigation path, not a Web Push path. It must use the shared same-window route helper from the current app runtime, render as a button-driven action, and must not open a browser window or replace the app with a new browser shell.
- Returning from an Inbox-opened Automation detail must explicitly restore `viewMode=inbox` and cancel pending Automation list/detail loads. Otherwise an in-flight Automation refresh can repaint an empty `Hermes CRON` root shell after the right-swipe back action.
- Inbox list rows may expose a left-swipe `完成` action for non-terminal items. The action must call the existing complete transition and project the item as `done`; terminal rows must not keep an active swipe-complete affordance.
- Inbox left-swipe completion is a full-swipe action. A partial swipe may reveal
  the action, but must not commit completion until the row passes the explicit
  full-swipe threshold and the user releases. This keeps fast Inbox clearing
  possible without making half-swipes destructive.
- Automation `delivery` rows with a safe `sourceRef.latestDeliverable.url`
  should expose a direct deliverable file tag from the list. Reuse the same
  file-label/card visual pattern used by Automation detail deliverables, because
  the delivery may be Markdown, PDF, Word, or another supported file type. The
  file tag opens the preview; the row title/main area opens the Automation
  detail with Inbox return context so source management/troubleshooting remains
  one tap away.
- Automation scheduled-Todo rows with a safe `sourceRef.latestDeliverable.url`
  should also expose the same direct file tag, because the occurrence is still
  the user's low-click delivery-reading path.
- Inbox row state and processing actions are combined in the inline status
  badge. The row should show `来源` / `类型` / status in one compact meta row, and
  tapping the status badge such as `待处理` opens a viewport-level action sheet
  for complete, snooze, and delete/dismiss. Do not add a separate right-side
  `处理` button, because it duplicates the state badge and compresses mobile row
  content. Source and file navigation should stay on the title/main area and the
  explicit deliverable file tag, not inside the processing sheet.
- Inbox detail is a secondary surface but must reuse the same compact
  source/type/status-action badge system as the list. It must not render a
  larger legacy status pill or a separate process button, because the user
  should see the same action vocabulary before and after opening the detail.
- In the default open Inbox list, the visible status/action control must show
  the real state label such as `待处理`, not a generic command label like `处理`.
  It should read as compact metadata subordinate to the source/type badges:
  about 20px high, 11px text, light-medium weight, subtle chevron, no large
  filled pill, no strong border, and no high-contrast action color. The open
  state uses a very low-contrast pale amber treatment. Keep the accessible
  label tied to the real status and the available processing menu.
- Adjacent controls in the same Inbox row meta line must share one badge style
  system. `来源` / `类型` / status-action labels should use the same height,
  padding, font family, font size, font weight, line-height, and letter spacing;
  only semantic color and the status chevron may differ.
- The app font-size setting must not make the clickable status badge larger
  than neighboring non-button badges. If a generic `button` font-size rule is
  active, the Inbox row badge rule must explicitly keep the whole adjacent badge
  set on the same compact typography.
- The default Inbox list must show newest items first by update/event/create
  time. Terminal items may stay below non-terminal items when mixed into an
  all-status view, but source/type priority must not hide a newer receipt under
  older Todo or delivery rows.
- Manual Todo Inbox rows should display due time from `dueAt`/`sourceRef.dueAt` when available. Legacy summaries that only contain raw ISO text such as `截止：2026-...Z` should be normalized in the UI to the same compact local time format and must not expose raw UTC ISO text in the list.
- Inbox root status filters should use the same mobile control typography scale as other compact app filters: stable 14px labels with explicit line-height, not browser-default button text.
- Do not store raw secrets, access keys, push endpoints, raw prompts, full learner answers, full transcripts, or long automation outputs in Inbox records.
