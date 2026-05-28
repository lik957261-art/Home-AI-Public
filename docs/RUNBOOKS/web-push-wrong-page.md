# Runbook: Web Push Opens Wrong Page

## Symptoms

- Tapping a Web Push opens the app inside a file/PDF/Markdown preview.
- Tapping a notification opens the list instead of a specific task, automation, Growth card, or group chat.
- The app opens, but stale search/filter state hides the target item.
- Tapping an in-app Inbox source row opens a Hermes-owned second-level page inside an outer mobile browser frame.

## Diagnosis Record: 2026-05-27 Scoped App-Shell Route

Incident:

- Action Inbox Automation receipts could be opened and linked to the right Automation detail, but the detail appeared inside an outer iOS/Synology browser frame.
- The user refreshed the installed app, killed and reopened the page, and other static UI changes took effect immediately. That made a stale static cache unlikely.
- The failing path was not only Web Push. Direct in-app navigation from Inbox to Automation detail reproduced the same class of browser-frame issue.

Evidence:

- The exact external HTTPS entry used by the phone was a prefixed app shell path such as `/hermes-mobile/?source=pwa`, not only root `/`.
- External smoke showed the expected new static version and updated JavaScript were being served from that prefixed entry.
- Earlier root-only checks could pass while the phone still failed, because the route helper generated root `/?...` routes and did not preserve the mounted app-shell prefix.

Root cause:

- Hermes-owned internal route helpers hardcoded root `/?...` for second-level routes.
- When the app was mounted under a prefix such as `/hermes-mobile/`, those generated routes could leave the current app-shell scope. On iOS/Synology mobile containers this surfaced as the domain bar and bottom browser toolbar.
- Browser-shell blocking, Web Push subscription filtering, and diagnostic logging were useful supporting controls, but they were not the root fix for this direct Inbox-to-Automation path.

Durable fix:

- Route helpers must derive the app shell path from the current page or from the existing service-worker client URL.
- Root deployments should still generate `/?...`; prefixed deployments should generate `/hermes-mobile/?...` or the matching current prefix.
- Do not hardcode the operator's domain or deployment path. The prefix must be inferred from runtime location/client URL.

## Diagnosis Record: 2026-05-28 Repeated Automation Scheduled-Todo Push

Incident:

- The user received many Web Push notifications for the same scheduled Automation Todo items.
- Tapping some notifications opened an older Inbox detail that lacked the direct delivery entry.

Evidence:

- `automationPushMarks` and `pushDeliveries` showed the same Automation ids repeating every minute with alternating tag suffixes.
- SQLite `action_inbox_items` contained both deliverable rows and `no-deliverable` scheduled-Todo rows for the same source ids.
- After the code hotfix, the latest push delivery for the affected jobs stopped advancing; stale no-deliverable Inbox rows still needed data repair because old notification URLs pointed at their ids.

Root cause:

- The Automation push scan computed the latest deliverable relative to the existing mark.
- After a deliverable mark existed, the next scan for the same `lastRunAt` found no newer deliverable, but scheduled-Todo logic still allowed a `no-deliverable` event.
- That no-deliverable event overwrote the mark, so the following scan sent the deliverable again. The cycle produced repeated pushes and duplicate Inbox items.

Durable fix:

- Scheduled Todo/reminder Automation scans must skip no-deliverable events when the existing mark already belongs to the same `lastRunAt` and there is no failure.
- Add harness coverage that sends a scheduled-Todo deliverable once, runs the scan again for the same `lastRunAt`, and asserts there is no second push, no second Inbox upsert, and no mark downgrade to `no-deliverable`.
- For production cleanup, repair stale no-deliverable Inbox rows by preserving their ids but restoring safe deliverable metadata from the sibling deliverable row, then mark the stale duplicates complete.

## First Checks

1. Confirm the phone has refreshed to the expected static client version.
2. Reproduce against the exact external URL/path the phone uses, including any reverse-proxy or app-shell prefix. Do not rely only on `127.0.0.1` or root `/` smoke.
3. Inspect the push payload shape without printing endpoints or secrets.
4. Check `public/service-worker.js` client-selection logic.
5. Check frontend route handling in `public/app-platform-ui.js` and the target module UI.
6. Inspect generated Hermes-owned route strings. `/?view=...` is valid only for a root-mounted app; a prefixed shell must keep its current prefix.
7. If other static changes refresh correctly but the browser-frame symptom does not change, treat this as a route/scope problem before continuing cache workarounds.

## Likely Causes

- Service worker navigated an embedded viewer iframe instead of a top-level app client.
- A secondary page, document preview, or internal link used `window.open` or `target=_blank`, which created a browser window instead of reusing the current app window.
- Payload lacks the target id, such as `automationId` or task/evaluation id.
- Active chat/topic completion payload uses the first task-group message id or the service worker rewrites `viewMode=single` plus `taskGroupId=chat` into `view=tasks`, so the click opens the wrong surface or scrolls to the prompt instead of the completion receipt.
- Frontend route handler preserves stale search state or clears the selected target too early.
- The push subscription was created from a mobile browser mode instead of the installed Hermes Mobile PWA. Old subscriptions without standalone metadata can still deliver a notification that opens in a browser shell.
- The user is already operating Hermes inside mobile Safari/browser mode. Same-window routing then stays in that browser shell; JavaScript cannot convert that session into a standalone PWA window.
- Internal routes hardcoded root `/?...` while the installed or externally tested app shell is mounted under a prefix such as `/hermes-mobile/`; iOS/Synology containers can treat that as leaving the PWA scope and show the domain bar/bottom toolbar.
- The browser shell may restore an already-selected detail state, such as `viewMode=automation` with `selectedAutomationId`, without passing through a URL route parser.
- A prior fix may stop detail rendering but still leave the full Inbox/App shell inside the browser frame; that is still a failure for mobile browser-shell launches.
- Automation scheduled-Todo push marks alternate between a deliverable signature and `no-deliverable` for the same `lastRunAt`, producing repeated notifications and stale no-deliverable Inbox links.
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
- For active chat/topic receipts, use the terminal assistant receipt `messageId`, preserve `threadId/messageId` through the service worker, and keep the route scroll target until the chat/topic message list renders.
- For repeated scheduled-Todo Automation pushes, first stop the mark alternation, then repair stale no-deliverable Inbox rows to include the safe deliverable reference or mark them complete if they are duplicate occurrences.
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
- For externally reported browser-frame failures, also smoke the exact external app-shell entry and the changed JavaScript files through that same origin/path. Verify the served client version and that internal route helpers preserve the external app-shell prefix.
