# Module: Gateway Pool

## Responsibility

Gateway Pool owns official-clean Hermes worker startup, health checks, routing targets, maintenance worker lifecycle, and Gateway plugin availability.

## Core Files

- `scripts/start-gateway-pool.ps1`
- `scripts/start-low-gateways.sh`
- `scripts/configure-low-gateways.sh`
- `scripts/check-worker-codex-auth.ps1`
- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-stream-service.js`
- `adapters/owner-elevation-routing-service.js`
- `gateway-plugins/`

## Production Paths

- Manifest: `C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json`
- Gateway worker root: `C:\ProgramData\HermesMobile\gateway-worker`
- Owner-maintenance profiles: `/home/xuxin/.hermes/profiles/officialclean1`, `/home/xuxin/.hermes/profiles/officialclean2`
- Low Gateway profiles: `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\lowgw*`

## Worker Roles

- Low-permission workers: ordinary user/workspace runs.
- Owner-maintenance workers: high-permission Owner maintenance and ChatGPT Pro.
- Grok worker: `grokgw1`, provider `xai-oauth`.

## Watchdog Rule

`Hermes Mobile Maintenance Gateway Watchdog` runs every 5 minutes and calls `start-gateway-pool.ps1 -OwnerMaintenanceOnly -OnlyWhenOwnerMaintenanceUnhealthy`.

It must not replace a maintenance worker during a long tool call merely because `/health` is slow. If HTTP health fails but TCP port remains open, the busy-grace guard defers replacement for `OwnerMaintenanceBusyGraceMinutes` (default 45).

## Validation

- `node tests\startup-scripts.test.js`
- PowerShell parse check for `scripts\start-gateway-pool.ps1`
- `/api/status?detail=1` should report expected worker count and healthy workers.

## Constraints

- Do not patch official Hermes runtime for product-specific worker behavior unless explicitly approved.
- Gateway plugin/schema/profile changes usually require Gateway Pool restart.
- Listener-only restart is insufficient after plugin/schema/profile changes.
- Do not print API keys, auth tokens, or browser credentials.
