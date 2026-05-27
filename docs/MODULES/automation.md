# Module: Automation And Cron

## Responsibility

Automation owns scheduled jobs, detail loading, Web Push/deep-link production, and product-layer cron dispatch isolation. User-facing delivery reading is moving to Action Inbox; Automation remains the background job engine and admin/troubleshooting surface.

## Core Files

- `server-routes/automation-api-routes.js`
- `public/app-automation-controller-ui.js`
- `public/app-automation-ui.js`
- `cron_bridge.py`
- `scripts/hermes-mobile-cron-dispatcher.py`
- `scripts/run-cron-tick-sidecar.ps1`
- `scripts/start-cron-tick-sidecar.ps1`

## Product Rules

- Foreground Automation list should preserve the full-detail display format.
- Product direction: Automation should not remain a permanent primary bottom tab after Action Inbox is active.
- The mobile entry for Automation management after Action Inbox activation is the Inbox top-right overflow menu, which can open the Automation list or create a new automation.
- Completed user-visible deliveries and failed runs should upsert Action Inbox items so the user reads/acts from Inbox. A failed run must still create an Inbox error item and Web Push even when it produced no new deliverable file.
- Summary/detail optimizations must not visually downgrade the user-facing list.
- Full-cache reads are only a first paint: the background full refresh must update the visible list when newer status or ordering arrives.
- The list should sort by latest activity, defined as the latest of last run time or latest deliverable time, so failed runs without new files still surface promptly.
- Status badges should reflect the latest run result. A scheduled job whose latest run failed must show a failure state until a later successful run clears it.
- Web Push notifications should open the specific automation detail when `automationId` is present.
- When Automation detail is opened directly from an Action Inbox automation receipt, the route should preserve the Inbox as the return parent. Top-left back and right-swipe must return to the Inbox list, not the Automation list. Opening the Automation list from the Inbox overflow menu remains a list-level secondary surface and should keep the existing list-to-Inbox return behavior.
- Opening Automation detail from an Action Inbox row is not a Web Push flow. It is a second-level in-app navigation flow and must stay in the current Hermes app runtime without `window.open`, `target=_blank`, or location-level browser handoff.
- After Action Inbox integration, Automation Web Push payloads should include `inboxItemId` when the user's next action is represented by Inbox.
- Foreground Web Push with `messageType=automation_*` or `automationId` must invalidate Automation full-cache state. If the Automation view is open, it should force a full refresh and repaint the list after fresh data arrives.
- A user-initiated full refresh after deleting an automation must replace the local list with the server list. Do not append missing local cache entries back into a refreshed list, or deleted jobs can appear to survive deletion.
- Long cron jobs must not block the scheduling entrance.

## Cron Dispatcher

Hermes Mobile uses `scripts/hermes-mobile-cron-dispatcher.py` as a product-layer wrapper. It dispatches due jobs into detached runners and returns quickly.

Detached cron runners may execute from the interactive Ubuntu distro while the dedicated Grok Gateway listens behind the Windows host / worker-distro loopback boundary. For `x_search`, the dispatcher should pass `HERMES_MOBILE_X_SEARCH_PROXY_URL` pointing at the bridge-host proxy prefix `/bridge/grok-gateway-proxy`; runners should not assume `127.0.0.1:<grok-port>` reaches the Grok worker.

The `hermes-mobile-web` plugin appends `/v1/responses` to that prefix. Bridge
host therefore receives `POST /bridge/grok-gateway-proxy/v1/responses` and
forwards only to the configured local Grok Gateway `/v1/responses`.

If runner logs contain `Tool x_search returned error`,
`grok_gateway_proxy_failed`, `grok_gateway_http_`, or
`gateway_api_key_unavailable`, the dispatcher should mark the job failed rather
than successful so the Automation list, Web Push, and Action Inbox do not show a
false success.

Do not patch official Hermes runtime cron source for this behavior unless explicitly approved.

## Validation

- `node tests\automation-api-routes.test.js`
- `node tests\cron-bridge.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\task-list-ui.test.js`
- `python -m py_compile cron_bridge.py scripts\hermes-mobile-cron-dispatcher.py`

## Constraints

- Static-only Automation UI changes do not require listener restart.
- Route or bridge changes require listener restart.
- Gateway Pool restart is only needed for Gateway worker/profile/plugin/schema changes.
