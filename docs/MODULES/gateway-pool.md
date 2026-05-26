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
- Owner-maintenance profiles: `/home/<owner>/.hermes/profiles/officialclean1`, `/home/<owner>/.hermes/profiles/officialclean2`
- Low Gateway profiles: `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\lowgw*`

## Worker Roles

- Low-permission workers: ordinary user/workspace runs.
- Owner-maintenance workers: high-permission Owner maintenance and ChatGPT Pro.
- Grok worker: `grokgw1`, provider `xai-oauth`.

## Profile MCP Registration

- Low Gateway profile MCP servers are generated into each profile `config.yaml` by `C:\ProgramData\HermesMobile\gateway-worker\configure-low-gateways.sh`.
- Wardrobe MCP runtime is installed under `C:\ProgramData\HermesMobile\gateway-worker\wardrobe-mcp`.
- Wardrobe-capable profiles expose toolset `wardrobe` through `platform_toolsets.api_server`.
- Owner wardrobe profiles bind `wardrobe` to the XuXin wardrobe workspace; WuPing profile `lowgw5` binds it to the WuPing wardrobe workspace.
- Wardrobe MCP is launched with `--no-workspace-override`; a model call must not switch a Gateway profile to another owner's `.hermes-wardrobe/access-key.txt`.
- Profile config changes require a Gateway Pool restart before already-running Gateway processes expose the new callable tool schema.

## Weather Plugin

- `gateway-plugins/hermes-mobile-weather` is a Hermes Mobile-owned profile-local Gateway plugin, not an official Hermes built-in toolset.
- China city queries should resolve through the plugin's local alias map first. Mapped Chinese names must not be sent directly to Open-Meteo geocoding because that upstream does not reliably support Chinese input.
- For mapped China cities, the plugin uses `weather.cn` city data first. If that provider fails, it may fall back to Open-Meteo using the mapped English city query instead of the original Chinese input.
- Unknown Chinese locations should fail closed with `chinese_location_not_mapped` until the alias map is extended.
- Changes to this plugin require copying the updated plugin into production and restarting Gateway Pool so already-running lowgw profiles reload the callable implementation.

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
