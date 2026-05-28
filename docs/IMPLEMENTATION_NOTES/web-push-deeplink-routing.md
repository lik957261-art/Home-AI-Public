# Implementation Note: Web Push Deep-Link Routing

## Problem

Hermes Mobile embeds same-origin viewers for files, PDFs, and Markdown. Service worker notification-click code can see same-origin embedded viewers as window clients. If it navigates one of those clients, the main app can appear nested inside a viewer iframe.

## Design

Notification clicks should:

1. Normalize the push payload into a product route.
2. Find only top-level app shell clients.
3. Focus and navigate the top-level app client if one exists.
4. Open a new app shell route only when no suitable top-level client exists.
5. Treat `file-viewer.html`, `pdf-viewer.html`, and `markdown-viewer.html` as viewer shells, not app shells.

## Route Rules

- Payloads should prefer product identifiers such as task group id, message id, automation id, group-chat flag, or learning evaluation id.
- Active chat/topic terminal notifications should use the terminal assistant receipt `messageId`. Topic routes should scroll to that receipt inside the selected task group; single-window chat and group-chat routes should preserve `threadId`/`messageId` and stay in `view=single`.
- In the service worker, single-window route intent takes precedence over generic `taskGroupId` routing. `viewMode=single`, `weixinChat`, `groupChat`, `taskGroupId=chat`, and `taskGroupId=group-chat` must not be rewritten into `view=tasks`.
- Automation notification route intent takes precedence over generic
  `inboxItemId` routing. Automation payloads may still carry `inboxItemId` for
  foreground refresh and return context, but click routing should open
  `view=automation&automationId=...` directly and preserve
  `returnTo=inbox&returnScope=detail&sourceInboxItemId=...` when available.
- A viewer URL should be folded back through its `return` route or the main app route.
- Sensitive detail is fetched after opening through authenticated APIs.

## Validation

- `node --check public\service-worker.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\same-window-navigation-harness.test.js`
- `node tests\task-list-ui.test.js`
- Static version bump when service worker or route JS changes.

## Regression Risk

Do not reintroduce a loop that navigates every `clients.matchAll({ type: "window", includeUncontrolled: true })` result. Embedded same-origin iframes may be included.
