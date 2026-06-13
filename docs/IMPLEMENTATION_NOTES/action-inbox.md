# Action Inbox Implementation Plan

## Goal

Implement the bottom navigation `信息` surface as the Hermes Mobile lightweight user-action surface while keeping Action Inbox as the internal domain, and migrate Todo/Automation user-facing participation away from official Hermes Kanban.

The first implementation should be minimal but complete:

- local durable persistence;
- auditable item state transitions;
- workspace-scoped API;
- mobile bottom-tab UI;
- source integration for manual items, Automation deliveries/failures, and Growth next actions;
- a safe official Kanban cutover path that preserves the current `Everything's amazing` reading task.

## Architecture

Action Inbox follows the service-first rule:

- `action-inbox-service` owns product rules, dedupe, state transitions, and source upsert behavior.
- `action-inbox-repository` or `mobile-sqlite-store` helpers own SQLite reads/writes.
- `action-inbox-api-routes` owns HTTP auth/resource boundary only.
- `app-action-inbox-ui` owns rendering and mobile interactions.

Do not add Action Inbox behavior directly to `server.js`, `mobile-server-runtime.js`, or monolithic frontend files.

## SQLite Schema

Add runtime SQLite tables through `adapters/mobile-sqlite-store.js` migration.

### `action_inbox_items`

Required columns:

- `id TEXT PRIMARY KEY`
- `workspace_id TEXT NOT NULL`
- `assignee_workspace_id TEXT`
- `source_type TEXT NOT NULL`
- `source_id TEXT`
- `source_ref_json TEXT`
- `item_type TEXT NOT NULL`
- `status TEXT NOT NULL`
- `priority TEXT NOT NULL DEFAULT 'normal'`
- `title TEXT NOT NULL`
- `summary TEXT`
- `action_label TEXT`
- `deep_link TEXT`
- `dedupe_key TEXT`
- `due_at TEXT`
- `available_at TEXT`
- `completed_at TEXT`
- `dismissed_at TEXT`
- `last_event_at TEXT`
- `raw_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Indexes:

- `(workspace_id, status, updated_at)`
- `(assignee_workspace_id, status, updated_at)`
- unique `(workspace_id, dedupe_key)` where `dedupe_key` is present.
- `(source_type, source_id)`

### `action_inbox_events`

Required columns:

- `id TEXT PRIMARY KEY`
- `item_id TEXT NOT NULL`
- `event_type TEXT NOT NULL`
- `actor_workspace_id TEXT`
- `actor_principal_id TEXT`
- `payload_json TEXT`
- `created_at TEXT NOT NULL`

Indexes:

- `(item_id, created_at)`
- `(event_type, created_at)`

Event payloads must be public-safe summaries only.

## Service Contract

`createActionInboxService(deps)` should expose:

- `listItems({ auth, workspaceId, status, sourceType, limit, cursor })`
- `getItem({ auth, itemId })`
- `createManualItem({ auth, input })`
- `upsertSourceItem({ sourceType, sourceId, workspaceId, assigneeWorkspaceId, itemType, title, summary, deepLink, priority, dedupeKey, sourceRef })`
- `completeItem({ auth, itemId })`
- `dismissItem({ auth, itemId })`
- `snoozeItem({ auth, itemId, availableAt })`
- `recordEvent({ itemId, eventType, actor, payload })`

Source upserts must be idempotent. Repeated Automation refreshes, Growth evaluation polling, or Web Push replays must update one item rather than create duplicates.

## API Routes

Add `server-routes/action-inbox-api-routes.js` and register it in the authenticated route pipeline.

Route behavior:

- `GET /api/action-inbox` returns a compact list plus counts by status/source type.
- `GET /api/action-inbox/:itemId` returns one item and recent public-safe events.
- `POST /api/action-inbox` creates a manual todo-style item.
- mutation routes validate workspace ownership and append an event.

Owner can request managed workspaces where existing workspace policy allows that view. Ordinary users cannot spoof `workspaceId`.

## Frontend

Add `public/app-action-inbox-ui.js`.

Bottom navigation target:

- `聊天`
- `信息`
- `话题`
- `目录`
- `成长`

Automation should be reachable as a background/admin surface, not as a primary bottom tab. During transition it may remain accessible from a menu or Owner/admin entry, but it should not be the main delivery-reading surface.

Current mobile behavior: the Inbox top-right overflow menu exposes Automation list and new-automation actions. The top bar should show this menu on Inbox and must not leave a disabled Stop action in that slot.

Inbox list should support:

- compact rows with explicit source/type badges, title, summary, status, time, and primary action;
- filters: all/open/waiting/done and source tags;
- detail panel with event timeline and source deep link;
- complete, dismiss, and snooze actions;
- route target `view=inbox&inboxItemId=<id>`.

Keep list rendering stable on mobile: no heavy cards inside cards, no large hero, no multi-line tab wraps, no layout shifts when statuses update.

## Source Integration

### Manual Todo

User-created Todo writes must use Action Inbox Todo (`POST
/api/action-inbox/todos`) rather than `createManualItem` or the retired
Todo/Kanban provider. Existing `/api/todos` is a compatibility projection over
Action Inbox Todo only: list/create/complete/cancel/delete are mapped into the
new engine, while legacy Kanban-only Todo actions are disabled.

When `creatorWorkspaceId !== assigneeWorkspaceId`, the Todo service writes two
bounded records: the assignee's actionable Todo and the creator's tracking
Todo. The creator tracking Todo must use `sourceRef.sentTracking=true`, must
not set `availableAt`, and must not be selected by reminder activation. On
completion, the tracking Todo is marked done and the existing summary-only
completion receipt remains the creator notification.

### Automation

When a run completes with user-visible output, upsert an Inbox `delivery` item. When a run fails, upsert an `error` item. Web Push payloads should include either `inboxItemId` or enough source reference for the foreground client to invalidate Inbox and Automation caches.

Automation detail remains useful for configuration and troubleshooting, but the user's reading/acknowledgement path should be Inbox.

For delivery rows, persist only a safe direct deliverable reference in
`sourceRef.latestDeliverable`:

- `name`
- `url`
- `mime`
- `updatedAt`
- `runOutputUpdatedAt`

The list UI can use that reference to render a direct MD/PDF/document file tag and
open the existing same-window preview. Do not store the Markdown body or full
automation output in Inbox.

Recurring Todo/reminder requests should keep Todo semantics while reusing
Automation as the trigger engine:

- Natural-language or explicit job metadata may classify an Automation as a
  scheduled Todo trigger.
- Each trigger upserts an Inbox `itemType=todo`, `sourceType=automation`,
  `sourceRef.scheduledTodo=true` occurrence.
- Completing the Inbox item completes that occurrence only.
- Editing, pausing, or deleting the recurrence remains an Automation job action.
- Ordinary Automation delivery receipts remain `itemType=delivery` and should
  not outrank Todo/reminder items in the default Inbox list.

### Growth

When async evaluation completes and the next learner/Owner action is needed, upsert an Inbox item:

- learner reflection required;
- revision required;
- Owner review required;
- completion/reward notice.

The item links to the Growth card route. Full submission/evaluation content stays in the Growth task detail projection.

True Growth task completion is separate from evaluation completion. After a task is actually completed, `learning-growth-submission-service` calls the injected completion notifier. The Web Push delivery service upserts one summary-only Inbox item per authorized recipient workspace and sends per-principal push notifications to those Inbox routes. The original Growth task route remains the item deep link/original URL.

### Chat

Ordinary active chat/topic terminal receipts should not enter the default Inbox. They are immediate responses to a request the user just made, so Web Push should route directly back to the task/chat view.

Later Chat-derived integration can create Inbox items for passive attention work such as mentions, permission requests, approvals, review requests, or explicit follow-ups.

## Official Kanban Migration

Before disabling the Kanban-backed Todo path:

1. Create a production backup of official Kanban database directories and Hermes Mobile data.
2. Generate a metadata-only inventory of official boards/tasks.
3. Preserve the current `Everything's amazing` reading task by migrating it to Growth/Inbox or explicitly keeping a rollback copy.
4. Migrate only active user-action tasks that are still valuable; do not bulk-import stale multi-agent/history tasks into Inbox.
5. Change production launcher from `HERMES_WEB_TODO_BACKEND=kanban` to the local Inbox path only after route/UI tests pass.
6. Archive/delete obsolete official Kanban tasks after backup and migration verification.

## Minimal Implementation Order

1. Add SQLite schema, repository helpers, and service tests.
2. Add route module, route registration, and API tests.
3. Add frontend Inbox tab/list/detail and static version bump.
4. Bridge existing manual Todo API to Action Inbox.
5. Add Automation source upsert plus Web Push deep-link/cache behavior.
6. Add Growth source upsert for next-action states.
7. Add migration/inventory script for official Kanban cleanup.
8. Deploy with listener restart for service/routes and static refresh for UI.

## Phase 1 Implementation Status

Implemented in static/client version `20260526-action-inbox-v247`:

- SQLite schema version 4 adds `action_inbox_items` and `action_inbox_events`.
- `action-inbox-service` owns source dedupe, manual item creation, complete/dismiss/snooze, and audit events.
- `action-inbox-api-routes` exposes workspace-scoped list/detail/create/action endpoints.
- Bottom navigation now exposes Inbox and keeps Topic in the mobile primary tab bar; Automation remains hidden as a background/admin surface.
- Automation and Growth Web Push source events can upsert Inbox items. Growth
  next-action/completion notifications may route clicks through
  `view=inbox&inboxItemId=...`; Automation notifications should click directly
  into `view=automation&automationId=...` and carry Inbox return context when an
  Inbox item was created.

Follow-up in static/client version `20260526-inbox-growth-v249`:

- Inbox rows/details show explicit source/type badges for Automation, Growth, manual Todo/reminder, Weixin, directory, approval/review, and executor completion items.
- Inbox top-right menu opens Automation list or new automation creation; Automation stays hidden from the primary bottom tab.
- Growth true-completion notices fan out to the task workspace, Owner, and workspaces authorized for that task workspace, using summary-only Inbox items and recipient-specific Web Push routes.

Follow-up in static/client version `20260526-inbox-nav-v250`:

- Inbox root no longer repeats the top bar title in the content area.
- Inbox root page-level actions, including manual item creation, live in the top-right overflow menu.
- Inbox detail/create are secondary screens using shared top-left back and right-swipe back; detail item actions move to the top-right overflow menu.

Follow-up in static/client version `20260526-inbox-topic-nav-v251`:

- Restored the Topic bottom-tab entry. The primary mobile bottom navigation is now `聊天 / 信息 / 话题 / 目录 / 成长`; Automation remains available from the Inbox overflow menu rather than the bottom tab.

Follow-up in static/client version `20260526-bottom-topic-v252`:

- Corrected the mobile bottom navigation grid to five columns so `聊天 / 信息 / 话题 / 目录 / 成长` stays on one row instead of wrapping/cropping the Growth tab.

Follow-up design/implementation rule for direct delivery and scheduled Todo:

- Automation Web Push Inbox upserts include `sourceRef.latestDeliverable` when a
  fresh deliverable exists.
- Automation delivery Inbox rows expose a direct same-window document preview
  file tag from the list, reusing the Automation detail deliverable pattern.
- Scheduled Todo Automation rows also expose the direct document preview file
  tag when `sourceRef.latestDeliverable` is present; their Todo classification
  only changes sort/completion semantics.
- Scheduled Todo Automation rows use the concrete Automation/reminder title in
  Web Push and Inbox projections, not the generic `待办提醒` label.
- The row title/main area opens the Automation source detail, while the explicit
  deliverable file tag opens the preview. The file tag reuses the Automation
  detail deliverable visual pattern and must not hardcode Markdown-only wording.
  Inbox rows use the compact status badge itself as the processing affordance:
  `来源` / `类型` / status stay together in the meta row, and tapping a status
  badge such as `待处理` opens a viewport-level action sheet containing only
  complete, snooze, and delete/dismiss actions. Do not render a separate
  right-side `处理` button. The sheet must not be absolutely positioned inside the
  card because that can clip or cover the deliverable file tag on mobile.
  The list badge must render the actual status label (`待处理`, `稍后`, or
  `已完成`) rather than a generic `处理` label, and it should remain visually
  weaker than the source/type chips: small text, normal/medium weight, subtle
  chevron, transparent or near-transparent surface, and no high-contrast pill
  fill.
- Left-swipe completion is threshold-gated as a full-swipe action; partial
  swipes do not call the complete transition.
- Scheduled Todo automations create Todo-like Inbox occurrences, but the default
  Inbox list sorts newest items first by update/event/create time. Source/type
  priority must not hide a newer receipt under older Todo or delivery rows.

Still planned:

- Add metadata-only official Kanban cleanup/migration tooling.
- Add source-specific Inbox producers for permission, approval, and review workflows.
- Broaden source integrations for chat mentions and Owner review requests.

## Validation

Local focused checks:

- `node --check adapters\action-inbox-service.js`
- `node --check server-routes\action-inbox-api-routes.js`
- `node --check public\app-action-inbox-ui.js`
- `node --check public\service-worker.js`
- `node tests\action-inbox-service.test.js`
- `node tests\action-inbox-api-routes.test.js`
- `node tests\mobile-sqlite-store.test.js`
- `node tests\todo-api-routes.test.js`
- `node tests\automation-api-routes.test.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\learning-program-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js`
- `git diff --check`

Production verification:

- Back up app and data before route/schema deployment.
- Run focused checks from `C:\ProgramData\HermesMobile\app`.
- Listener-only restart is required for new route/service/schema code.
- Gateway Pool restart is not required unless Gateway worker/plugin/profile code changes.
- Smoke `/api/status?detail=1`, `/api/client-version`, Inbox list, manual item create/complete, Automation delivery item, and Growth next-action item.

## Done Criteria

- A user can open `信息` from the bottom nav and see current action items without official Kanban calls.
- A manual todo can be created, completed, dismissed, and audited.
- Automation completed/failed runs produce or update Inbox items and push/deep-link correctly.
- Growth next actions appear in Inbox without copying full learner content.
- Restarting listener preserves item state and event history.
- Official Kanban Todo compatibility is no longer needed for the primary mobile UX, and old official Kanban data has a backed-up cleanup path.
