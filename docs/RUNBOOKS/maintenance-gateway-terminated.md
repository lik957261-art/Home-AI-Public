# Runbook: Maintenance Gateway Terminated During ChatGPT Pro

## Symptom

Hermes Mobile shows an Owner-maintenance or ChatGPT Pro run as `terminated`, while the Codex Mobile `ChatGPT Pro` thread may still be running.

## Likely Cause

The maintenance watchdog replaced an Owner-maintenance Gateway worker while it was busy with a long tool call. Logs may show SIGTERM for `officialclean1` or `officialclean2`.

## Checks

1. `/api/status?detail=1`: confirm worker count and maintenance health.
2. `C:\ProgramData\HermesMobile\gateway-worker\logs\start-gateway-pool.log`: check for owner-maintenance repair near the failure time.
3. WSL profile logs:
   - `/home/xuxin/.hermes/profiles/officialclean1/logs/gateway.log`
   - `/home/xuxin/.hermes/profiles/officialclean2/logs/gateway.log`
4. Check whether TCP port was open but `/health` was slow.

## Expected Protection

`scripts/start-gateway-pool.ps1` should defer replacement when HTTP health fails but TCP remains open, for `OwnerMaintenanceBusyGraceMinutes` minutes.

## Repair

If protection is missing, deploy the watchdog busy-grace script change and run:

- PowerShell parse check
- `node tests\startup-scripts.test.js`
- manual watchdog invocation
- `/api/status?detail=1`

Do not restart the full Gateway Pool unless plugin/schema/profile startup changes require it.
