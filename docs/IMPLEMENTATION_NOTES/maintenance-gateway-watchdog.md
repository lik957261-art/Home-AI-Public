# Implementation Note: Maintenance Gateway Watchdog

## Purpose

The maintenance watchdog keeps Owner-maintenance Gateway workers available without killing valid long-running Owner tasks.

## Current Design

Scheduled task: `Hermes Mobile Maintenance Gateway Watchdog`

Command:

```powershell
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\gateway-worker\start-gateway-pool.ps1" -StartMode hybrid -OwnerMaintenanceOnly -OnlyWhenOwnerMaintenanceUnhealthy
```

The script checks `/health`. If HTTP health fails but TCP port is still open, it treats the worker as possibly busy with a long tool call and defers replacement for `OwnerMaintenanceBusyGraceMinutes` (default 45).

If TCP port is closed, repair is immediate.

In hybrid/on-demand mode, Owner-maintenance warm baseline defaults to zero. A
closed `officialclean*` or `deepseekmaint*` port is expected when there is no
active maintenance run, so the watchdog must skip repair when
`HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MIN_WARM=0`. The scheduled task should
pass `-StartMode hybrid` explicitly because it does not inherit the listener
launcher environment.

State file:

- `C:\ProgramData\HermesMobile\gateway-worker\owner-maintenance-watchdog-state.json`

## Constraint

Do not use a single short `/health` timeout as proof that a maintenance worker is dead during ChatGPT Pro or other long tool calls.
