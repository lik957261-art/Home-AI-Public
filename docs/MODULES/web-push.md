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

## Service Worker Rules

- Notification click handling must target top-level application windows only.
- Same-origin embedded preview iframes can appear as window clients. The service worker must not navigate `file-viewer.html`, `pdf-viewer.html`, or `markdown-viewer.html` clients as if they were the app shell.
- If the payload points at a viewer shell, route back to the app route or viewer `return` route instead of opening the viewer shell as the primary app.

## Validation

- `node --check public\service-worker.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\task-list-ui.test.js`
- `git diff --check`
- Production smoke: `/api/status?detail=1` and `/api/client-version?clientVersion=<version>` for static changes.

## Debug Pointers

When a push opens the wrong page, check three layers in order: payload route fields, service worker client selection, and frontend route handling in `app-platform-ui.js`. Do not start by changing the destination URL to a raw viewer URL.
