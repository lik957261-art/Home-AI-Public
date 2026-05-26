# Module: Action Inbox

## Responsibility

Action Inbox is the lightweight Hermes Mobile surface for things that need a user's attention: manual todos, automation delivery results, Growth next actions, review requests, and later chat/module handoffs.

It is a Hermes Mobile product domain, not a wrapper around official Hermes Kanban. It should be backed by local Hermes Mobile persistence and should stay fast enough for repeated mobile use.

## Product Shape

- The bottom navigation target is `收件箱`.
- The intended primary bottom navigation is `聊天 / 收件箱 / 目录 / 成长`.
- `自动化` becomes a background capability. Its completed/failed deliveries should enter Action Inbox instead of requiring a permanent bottom tab.
- The Inbox top-right overflow menu is the primary mobile entry for Automation management: open the Automation list or create a new automation from Inbox without restoring Automation as a bottom tab.
- Existing simple Todo behavior becomes an Action Inbox item type instead of a separate product tab.
- Chat integration is a later step; the first implementation should focus on module-generated items and manual items.

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

### Growth

Growth remains the canonical learning task system. Inbox may show action items such as:

- evaluation completed and reflection needed;
- revision needed;
- parent review needed;
- reward or completion notice.

The item must link back to the Growth card/detail. It must not store full learner content.

When a Growth task is truly completed after evaluation/reflection/manual pass, the completion notice is a summary-only Inbox item for the task workspace, Owner, and each workspace whose access policy allows that task workspace. Each recipient workspace gets its own Inbox item and Web Push deep link. `sourceRef.taskWorkspaceId` preserves the original task workspace; item title/summary may include task id/title, score, reward status, and reflection status only.

### Chat And Mentions

Chat remains the message source of truth. Later integration may create Inbox items for direct mentions, approvals, or requested follow-ups. Group/chat message bodies should stay in the chat thread, not be copied into Inbox.

Ordinary task terminal receipts create summary-only `sourceType=chat` Inbox items for completion or failure, with the original task/single-window route preserved as the item deep link. The Inbox stores only title, bounded summary, status, and route identifiers.

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
- Inbox rows and detail headers should show explicit source/type badges, not only low-contrast metadata, so items from Automation, Growth, manual Todo, and task receipts are distinguishable at a glance.
- Keep source modules canonical; Inbox only stores summary/action projection and audit events.
- Dedupe by stable source references so repeated refreshes or Web Push deliveries do not create duplicate items.
- Web Push should deep-link to Inbox when the user's next action is best represented there.
- Do not store raw secrets, access keys, push endpoints, raw prompts, full learner answers, full transcripts, or long automation outputs in Inbox records.
