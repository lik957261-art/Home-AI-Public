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
- A secondary page, document preview, or internal link used `window.open` or `target=_blank`, which created a browser window instead of reusing the current app window.
- Payload lacks the target id, such as `automationId` or task/evaluation id.
- Frontend route handler preserves stale search state or clears the selected target too early.
- The push subscription was created from a mobile browser mode instead of the installed Hermes Mobile PWA. Old subscriptions without standalone metadata can still deliver a notification that opens in a browser shell.
- The user is already operating Hermes inside mobile Safari/browser mode. Same-window routing then stays in that browser shell; JavaScript cannot convert that session into a standalone PWA window.
- Internal routes hardcoded root `/?...` while the installed or externally tested app shell is mounted under a prefix such as `/hermes-mobile/`; iOS/Synology containers can treat that as leaving the PWA scope and show the domain bar/bottom toolbar.
- The browser shell may restore an already-selected detail state, such as `viewMode=automation` with `selectedAutomationId`, without passing through a URL route parser.
- A prior fix may stop detail rendering but still leave the full Inbox/App shell inside the browser frame; that is still a failure for mobile browser-shell launches.
- Static client cache is old.

## Repair

- Keep service worker navigation limited to top-level app clients.
- Keep Hermes-owned links and previews in the current app window. Replace `window.open`, `target=_blank`, and Markdown `linkTarget="_blank"` with same-window navigation, authenticated overlays, or in-place download/share behavior.
- Preserve the current app shell path for Hermes-owned routes. Use a route helper that derives the shell path from the current page or existing client URL instead of hardcoding a domain or root path.
- Require iOS subscriptions to be created from the installed PWA and include `clientContext.displayMode`, `clientContext.standalone`, and `clientContext.clientVersion`.
- Filter legacy iOS browser subscriptions during delivery. If the user needs iPhone push again, re-enable notification from the installed Hermes Mobile app after the new client version is active.
- Gate mobile browser-shell launches before the authenticated app loads. The browser shell should show only a blocker, not Inbox, Automation, Directory, Growth, or file preview UI.
- Put the mobile browser-shell blocker in `index.html` preflight as well as the app router. A stale browser-shell page may not execute the latest app bootstrap before it renders cached Inbox/Automation UI.
- Gate internal notification/source-detail navigation on mobile browser shells when the client is not PWA standalone. The route should stop and prompt the user to reopen the installed Hermes Mobile app instead of showing a detail page inside a browser frame.
- Apply the gate to click-time routing, startup URL routing, and selected-detail state restoration. If the app starts with `?view=automation&automationId=...` inside a browser shell, or restores a selected Automation detail before `loadSelectedView()`, it must stop before rendering the detail page.
- Add stable ids to the payload producer.
- Make the target module force an authenticated fetch that includes the target even if search/limit would otherwise hide it.
- Bump static client/cache version when service worker or route JS changes.

## Validation

- `node --check public\service-worker.js`
- `node --check public\app-pwa-settings-push-ui.js`
- `node tests\same-window-navigation-harness.test.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\push-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `git diff --check`
- Production smoke `/api/client-version?clientVersion=<version>`.
