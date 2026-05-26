# Implementation Note: Maintenance Gateway Watchdog

## Purpose

The maintenance watchdog keeps Owner-maintenance Gateway workers available without killing valid long-running Owner tasks.

## Current Design

Scheduled task: `Hermes Mobile Maintenance Gateway Watchdog`

Command:

```powershell
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\ProgramData\HermesMobile\gateway-worker\start-gateway-pool.ps1" -OwnerMaintenanceOnly -OnlyWhenOwnerMaintenanceUnhealthy
```

The script checks `/health`. If HTTP health fails but TCP port is still open, it treats the worker as possibly busy with a long tool call and defers replacement for `OwnerMaintenanceBusyGraceMinutes` (default 45).

If TCP port is closed, repair is immediate.

State file:

- `C:\ProgramData\HermesMobile\gateway-worker\owner-maintenance-watchdog-state.json`

## Constraint

Do not use a single short `/health` timeout as proof that a maintenance worker is dead during ChatGPT Pro or other long tool calls.
