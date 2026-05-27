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
- For ordinary active chat/topic task completion/failure receipts, Web Push should link directly to the relevant chat/topic/task route and should not upsert a default Inbox item. The user just initiated the request, so the push click itself is the completion surface.
- Passive or durable notifications should still use Inbox when later attention is needed: automation delivery/failure, manual Todo/reminder, permission/approval/review requests, and Growth/executor card completion.
- Automation failures do not require a new deliverable file to notify. The push/InBox payload should carry only a compact failure summary and a route to the Automation detail.

## Service Worker Rules

- Notification click handling must target top-level application windows only.
- Same-origin embedded preview iframes can appear as window clients. The service worker must not navigate `file-viewer.html`, `pdf-viewer.html`, or `markdown-viewer.html` clients as if they were the app shell.
- If the payload points at a viewer shell, route back to the app route or viewer `return` route instead of opening the viewer shell as the primary app.
- Hermes-owned navigation must stay in the same app window. Web Push uses the shared internal route helper, but direct UI paths such as Inbox row to Automation detail are not Web Push paths; they are covered by the secondary-page navigation contract. App code, second-level pages, file previews, and internal links must not use `window.open`, `target=_blank`, or Markdown `linkTarget="_blank"` for product navigation.
- Markdown, HTML/PDF print, image, and document preview should follow the existing in-app overlay/iframe/download-fallback pattern from `public/app-task-preview-ui.js`; they must not create an outer browser frame as a preview workaround.
- `clients.openWindow(targetWindowRoute)` is allowed only as the service-worker fallback when no same-origin top-level client is available; when an app shell client exists, notification click must post the route to that client and focus it.
- On mobile browser shells, Hermes Mobile must not render the full authenticated app. If the current mobile/touch client is not the installed PWA standalone window, the app must show only a blocker that asks the user to close the browser shell and reopen from the Home Screen Hermes Mobile app.
- The PWA guard must run at app bootstrap before `loadWorkspaces()` / `loadSelectedView()`, and also on click-time routing through the shared internal route helper, startup URL routing (`applyRouteFromUrl`), and restored selected detail state. A browser shell may be launched directly with `automationId`, or may already hold `state.viewMode=automation` plus `selectedAutomationId`.

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
