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

- Official Hermes CRON is the canonical automation job source for production
  automation. Hermes Mobile must not maintain a second durable job-definition
  store that silently diverges from official CRON.
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
- Returning from an Inbox-opened Automation detail must cancel stale Automation list/detail loads and guard Automation API responses by the current `viewMode`. A late Automation response after the return action must not repaint the Automation root shell over the Inbox.
- After Action Inbox integration, Automation Web Push payloads should include `inboxItemId` when the user's next action is represented by Inbox.
- Foreground Web Push with `messageType=automation_*` or `automationId` must invalidate Automation full-cache state. If the Automation view is open, it should force a full refresh and repaint the list after fresh data arrives.
- A user-initiated full refresh after deleting an automation must replace the local list with the server list. Do not append missing local cache entries back into a refreshed list, or deleted jobs can appear to survive deletion.
- Long cron jobs must not block the scheduling entrance.

## Canonical Store Boundary

Hermes Mobile's Automation API is a safety and projection layer over the
canonical scheduler, not a replacement scheduler.

- Production job definitions, schedule state, pause/resume/run/delete, and
  next-run calculation should be owned by official Hermes CRON.
- `server-routes/automation-api-routes.js` may expose a stable Mobile API, but
  it should project the official CRON job list after applying
  workspace/principal filtering, path privacy, output-file authorization,
  Action Inbox/Web Push metadata, and UI field normalization.
- SQLite/local automation storage is allowed only for first-run local product
  installs, tests, temporary import/migration, or an explicitly selected future
  scheduler backend. It must not be treated as a live mirror of official CRON in
  production.
- When `HERMES_WEB_SERVICE_STORE=sqlite` is enabled and no explicit
  `HERMES_MOBILE_AUTOMATION_BACKEND` / `HERMES_WEB_AUTOMATION_BACKEND` is set,
  Hermes Mobile should default Automation to `hermes_cron`. Local/SQLite
  automation must be selected explicitly with `HERMES_WEB_AUTOMATION_BACKEND=local`.
- A production deployment must not return `available=true` with an empty SQLite
  automation store when official CRON contains jobs. That is a configuration
  drift, not a valid "no automations" state.
- If the configured backend is unavailable, unknown, or inconsistent with the
  deployment contract, the API should report a bounded diagnostic warning/error
  rather than silently falling back to an empty alternate store.
- Creating, updating, deleting, pausing, resuming, or manually running an
  automation from Hermes Mobile should mutate the canonical backend only. Any
  cache or UI projection must be invalidated after the canonical mutation.
- Task prompt text, generated reports, runner logs, raw model output, raw mail
  content, tokens, local secret paths, and push endpoints must not be copied
  into Automation docs, handoffs, or long-lived diagnostic records.

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
- `node tests\mobile-runtime-environment-service.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\task-list-ui.test.js`
- `python -m py_compile cron_bridge.py scripts\hermes-mobile-cron-dispatcher.py`

## Constraints

- Static-only Automation UI changes do not require listener restart.
- Route or bridge changes require listener restart.
- Gateway Pool restart is only needed for Gateway worker/profile/plugin/schema changes.
