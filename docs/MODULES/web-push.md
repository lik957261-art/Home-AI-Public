# Module: Web Push

## Responsibility

Web Push notifies browser/PWA clients about task completion, mentions, automation events, Growth evaluation completion, and deep links back into authenticated Hermes Mobile views.

Push payloads are navigation hints. Sensitive content must still be fetched through authenticated APIs after the app opens.

## Core Files

- `adapters/web-push-delivery-service.js`
- `public/service-worker.js`
- `public/app-platform-ui.js`
- `public/app-task-groups-ui.js`
- Feature-specific producers such as Growth, Automation, Weixin, and group-chat services.

## Payload Rules

- Do not include raw secrets, push endpoints, private local paths, full learner content, raw prompts, or long generated reports.
- Include stable route identifiers instead of content when possible: task group id, message id, automation id, learning task/evaluation id, or group-chat route flags.
- For group chat, ordinary messages and generic AI completions do not send broad push notifications. Explicit mentions may notify only mentioned principals.
- For Growth asynchronous evaluation, completion push should deep-link to the relevant task/evaluation detail, then the app fetches authenticated detail data.
- For Growth true task completion, Web Push should use `notifyLearningGrowthTaskComplete`: upsert summary-only Action Inbox items for the task workspace, Owner, and authorized workspace-policy recipients, then send per-principal notifications whose URLs point to each recipient workspace's Inbox item. If Inbox upsert fails, fall back to the original Growth task URL.
- For ordinary active chat/topic task completion/failure receipts, Web Push should link directly to the relevant chat/topic/task route and should not upsert a default Inbox item. The user just initiated the request, so the push click itself is the completion surface. These payloads must use the terminal assistant receipt `messageId`, not the first message in the topic, so clicks scroll to the completion/failure receipt.
- Ordinary task terminal receipts are idempotent per assistant receipt/tag. If duplicate terminal Gateway events arrive for the same assistant message, or a second producer calls the terminal notifier with the same task receipt tag after a successful send, Hermes Mobile must not send a second Web Push or enqueue a second external terminal delivery.
- Passive or durable notifications should still use Inbox when later attention is needed: automation delivery/failure, manual Todo/reminder, permission/approval/review requests, and Growth/executor card completion.
- Embedded plugins must delegate user notifications to Hermes Mobile instead of
  registering iframe-local Web Push subscriptions. Plugin backends post bounded
  events to `POST /api/hermes-plugins/<plugin-id>/notifications`; Hermes can
  upsert a `sourceType=plugin` Inbox item for durable user work and sends Web
  Push from the installed Hermes PWA subscription. Push-only plugin events use
  `inbox=false`, `createInbox=false`, or `inboxMode=push`; Codex Mobile task
  completion keeps one latest Inbox record per workspace by using a
  workspace-scoped dedupe key, but Web Push clicks go directly to the Codex
  plugin route so the task/thread can open without an intermediate Inbox step.
  This keeps local/LAN or proxy-only plugins usable even when their own
  HTTPS/Web Push origin is disabled.
- Codex Mobile completion push is gated on terminal evidence. Hermes must not
  send a Codex completion Web Push for an `open` / non-terminal plugin event, or
  for an event that lacks a bounded final `detailMessage.body` and a stable
  route anchor (`pluginThreadId`, `pluginTaskId`, `pluginItemId`, or
  `sourceTurnId`). Clicking a Codex completion push must preserve those plugin
  route fields even when the notification also carries `inboxItemId`, because
  the Inbox item is receipt metadata and not the click destination.
- Automation failures do not require a new deliverable file to notify. The push/InBox payload should carry only a compact failure summary and a route to the Automation detail.
- Automation Web Push clicks should open the Automation detail directly by
  `automationId`, even when the notification also upserts an Inbox item and
  carries `inboxItemId` for cache/receipt metadata. If an Inbox item id exists,
  include `returnTo=inbox`, `returnScope=detail`, and `sourceInboxItemId` so the
  Automation detail can return to Inbox without forcing the user through an
  intermediate Inbox detail page.
- Scheduled Todo/reminder Automation pushes must be idempotent per `lastRunAt`. If a run already has a push mark for the same `lastRunAt`, a later scan with no newer deliverable must not overwrite the mark with a `no-deliverable` signature or create a second Inbox item. This prevents alternating deliverable/no-deliverable tags and repeated push loops.

## Service Worker Rules

- Notification click handling must target top-level application windows only.
- Same-origin embedded preview iframes can appear as window clients. The service worker must not navigate `file-viewer.html`, `pdf-viewer.html`, or `markdown-viewer.html` clients as if they were the app shell.
- If the payload points at a viewer shell, route back to the app route or viewer `return` route instead of opening the viewer shell as the primary app.
- Hermes-owned navigation must stay in the same app window. Web Push uses the shared internal route helper, but direct UI paths such as Inbox row to Automation detail are not Web Push paths; they are covered by the secondary-page navigation contract. App code, second-level pages, file previews, and internal links must not use `window.open`, `target=_blank`, or Markdown `linkTarget="_blank"` for product navigation.
- Hermes-owned navigation must preserve the current app shell path. Do not hardcode root `/?...` for second-level routes; a deployment opened at `/hermes-mobile/` must keep `/hermes-mobile/?...`, while a root deployment keeps `/?...`.
- Markdown, HTML/PDF print, image, and document preview should follow the existing in-app overlay/iframe/download-fallback pattern from `public/app-task-preview-ui.js`; they must not create an outer browser frame as a preview workaround.
- `clients.openWindow(targetWindowRoute)` is allowed only as the service-worker fallback when no same-origin top-level client is available; when an app shell client exists, notification click must post the route to that client and focus it.
- Single-window chat/group routes take precedence over generic `taskGroupId` routing. If payload data says `viewMode=single`, `weixinChat`, `groupChat`, `taskGroupId=chat`, or `taskGroupId=group-chat`, the service worker must preserve `threadId` and `messageId` and route to `view=single`, not `view=tasks`.
- Automation notification route fields take precedence over generic
  `inboxItemId` routing. Inbox metadata on an Automation payload is used for
  return context and foreground refresh, not as the click destination.
- Plugin notification payloads should default to the Inbox route generated from
  `inboxItemId` when an Inbox item is created. If the plugin explicitly asks for
  `openMode=plugin`, or if the event is push-only, the push URL may open the
  plugin tab. Push-only events must carry empty Inbox ids rather than creating a
  synthetic Inbox receipt.
- For `openMode=plugin`, plugin route fields take precedence over generic
  `inboxItemId` routing in the service worker. The worker must preserve
  `pluginId`, `pluginRoute`, `pluginItemId`, `pluginThreadId`, `pluginTaskId`,
  and `sourceTurnId` so plugin completion notifications can open the final
  receipt start instead of a stale plugin root or Inbox detail.
- On mobile browser shells, Hermes Mobile must not render the full authenticated app. If the current mobile/touch client is not the installed PWA standalone window, the app must show only a blocker that asks the user to close the browser shell and reopen from the Home Screen Hermes Mobile app.
- The PWA guard must run in `index.html` preflight before app bundles load, at app bootstrap before `loadWorkspaces()` / `loadSelectedView()`, and also on click-time routing through the shared internal route helper, startup URL routing (`applyRouteFromUrl`), and restored selected detail state. A browser shell may be launched directly with `automationId`, may already hold `state.viewMode=automation` plus `selectedAutomationId`, or may be a stale long-lived browser shell that has not yet run the latest app router.

## Subscription Window Rules

- iOS Web Push must be registered from the installed Hermes Mobile PWA window, not from Safari/browser mode. The frontend must send `clientContext.displayMode`, `clientContext.standalone`, and `clientContext.clientVersion` when posting `/api/push/subscribe`.
- The subscribe route must forward this client context into `savePushSubscription`, and the Web Push delivery service must reject new iOS browser-mode subscriptions.
- Delivery must skip legacy iOS subscriptions that lack PWA standalone evidence, so old Safari/browser subscriptions cannot keep opening Hermes inside a browser shell.

## Validation

- `node --check public\service-worker.js`
- `node --check public\app-pwa-settings-push-ui.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\push-api-routes.test.js`
- `node tests\same-window-navigation-harness.test.js`
- `node tests\task-list-ui.test.js`
- `git diff --check`
- Production smoke: `/api/status?detail=1` and `/api/client-version?clientVersion=<version>` for static changes.

## Debug Pointers

When a push opens the wrong page, check three layers in order: payload route fields, service worker client selection, and frontend route handling in `app-platform-ui.js`. Do not start by changing the destination URL to a raw viewer URL.

For chat/topic receipt targeting, verify both the producer and the click router. The producer should store the terminal assistant receipt id in `data.messageId`; the service worker should preserve single-window chat/group routes before generic task routing; the frontend route parser should keep the `messageId` until the chat/topic message list renders and scrolls to it.

For browser-frame reports, first separate Web Push click handling from ordinary in-app second-level navigation. Inbox row to Automation detail is not itself a Web Push path, even if the Inbox item was originally created from an automation push. It still uses the same Hermes-owned internal route contract and must preserve the current app-shell path.

Use the exact external app entry reported by the user for smoke verification. A root-mounted local check can miss a prefixed deployment bug where `/hermes-mobile/?source=pwa` is the real entry but an internal helper emits `/?view=...`. Do not hardcode the operator's domain or prefix in code; derive the app-shell path from `window.location.pathname` or the focused service-worker client URL.

For repeated Automation push reports, inspect `automationPushMarks`, `pushDeliveries`, and the corresponding `action_inbox_items` rows together. Alternating tags for the same Automation id and same `lastRunAt` usually means the mark is being rewritten between a deliverable signature and `no-deliverable`; fix the mark transition first, then repair stale no-deliverable Inbox rows so old notification URLs still open a useful detail.
