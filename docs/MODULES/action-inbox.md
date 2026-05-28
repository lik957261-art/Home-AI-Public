# Module: Action Inbox

## Responsibility

Action Inbox is the lightweight Hermes Mobile surface for passive or durable things that need a user's attention: manual todos/reminders, automation delivery results, Growth/executor card completion, permission/approval/review requests, and later module handoffs.

It is a Hermes Mobile product domain, not a wrapper around official Hermes Kanban. It should be backed by local Hermes Mobile persistence and should stay fast enough for repeated mobile use.

## Product Shape

- The bottom navigation target is `收件箱`.
- The intended primary bottom navigation is `聊天 / 收件箱 / 话题 / 目录 / 成长`.
- `自动化` becomes a background capability. Its completed/failed deliveries should enter Action Inbox instead of requiring a permanent bottom tab.
- The Inbox top-right overflow menu is the primary mobile entry for Automation management: open the Automation list or create a new automation from Inbox without restoring Automation as a bottom tab.
- Inbox root actions, including new manual Inbox item creation, belong in the top-right overflow menu rather than inline page buttons.
- Inbox detail/create screens are secondary screens. They must use the shared top-left back button and right-swipe back path; the content area should not render another back button or duplicate the top bar title.
- Existing simple Todo behavior becomes an Action Inbox item type instead of a separate product tab.
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
- `sourceType`: `manual`, `automation`, `growth`, `chat`, `directory`, `weixin`, or future module id.
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

The legacy `POST /api/todos` compatibility route may still create a Todo/Kanban record while the old surface is being retired, but it must also upsert a summary-only `sourceType=manual`, `itemType=todo` Action Inbox item for the selected workspace. This keeps existing callers from silently bypassing the Inbox.

### Automation

Automation remains a background job engine. A successful run that creates a user-facing delivery should upsert a `delivery` Inbox item. A failed run should upsert an `error` item with a short failure summary and a deep link to the relevant job detail or output history.

Foreground push refresh should update Inbox state when automation push payloads include an Inbox item id or source reference.

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
- `POST /api/action-inbox/:itemId/complete`
- `POST /api/action-inbox/:itemId/dismiss`
- `POST /api/action-inbox/:itemId/snooze`

Auth mode is workspace-scoped. Owner may inspect or manage configured family/workspace projections, but ordinary workspaces should only see items assigned to or visible to that workspace.

## Validation

- `node tests\action-inbox-service.test.js`
- `node tests\action-inbox-api-routes.test.js`
- `node tests\mobile-sqlite-store.test.js`
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
- Inbox row state and processing actions are separate. The row may show a small
  inline state badge such as `待处理`, but the action affordance should be a
  stable `处理` control in the row tool area. It opens a viewport-level action
  sheet for complete, snooze, and delete/dismiss so the menu is not clipped by
  the card or laid over the deliverable file tag. Source and file navigation
  should stay on the title/main area and the explicit deliverable file tag, not
  inside the processing sheet.
- Todo/reminder items, including scheduled Todo occurrences created by
  Automation, must sort above ordinary Automation delivery receipts in the
  default Inbox. Automation failures and review/approval items may still rank
  above ordinary delivery receipts because they need intervention.
- Manual Todo Inbox rows should display due time from `dueAt`/`sourceRef.dueAt` when available. Legacy summaries that only contain raw ISO text such as `截止：2026-...Z` should be normalized in the UI to the same compact local time format and must not expose raw UTC ISO text in the list.
- Inbox root status filters should use the same mobile control typography scale as other compact app filters: stable 14px labels with explicit line-height, not browser-default button text.
- Do not store raw secrets, access keys, push endpoints, raw prompts, full learner answers, full transcripts, or long automation outputs in Inbox records.
