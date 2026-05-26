# Runbook: Web Push Opens Wrong Page

## Symptoms

- Tapping a Web Push opens the app inside a file/PDF/Markdown preview.
- Tapping a notification opens the list instead of a specific task, automation, Growth card, or group chat.
- The app opens, but stale search/filter state hides the target item.

## First Checks

1. Confirm the phone has refreshed to the expected static client version.
2. Inspect the push payload shape without printing endpoints or secrets.
3. Check `public/service-worker.js` client-selection logic.
4. Check frontend route handling in `public/app-platform-ui.js` and the target module UI.

## Likely Causes

- Service worker navigated an embedded viewer iframe instead of a top-level app client.
- Payload lacks the target id, such as `automationId` or task/evaluation id.
- Frontend route handler preserves stale search state or clears the selected target too early.
- Static client cache is old.

## Repair

- Keep service worker navigation limited to top-level app clients.
- Add stable ids to the payload producer.
- Make the target module force an authenticated fetch that includes the target even if search/limit would otherwise hide it.
- Bump static client/cache version when service worker or route JS changes.

## Validation

- `node --check public\service-worker.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\task-list-ui.test.js`
- `git diff --check`
- Production smoke `/api/client-version?clientVersion=<version>`.
