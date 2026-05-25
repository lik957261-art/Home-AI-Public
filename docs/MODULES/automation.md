# Module: Automation And Cron

## Responsibility

Automation owns user-visible scheduled jobs, detail loading, Web Push deep links, and product-layer cron dispatch isolation.

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
- Summary/detail optimizations must not visually downgrade the user-facing list.
- Web Push notifications should open the specific automation detail when `automationId` is present.
- Long cron jobs must not block the scheduling entrance.

## Cron Dispatcher

Hermes Mobile uses `scripts/hermes-mobile-cron-dispatcher.py` as a product-layer wrapper. It dispatches due jobs into detached runners and returns quickly.

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
