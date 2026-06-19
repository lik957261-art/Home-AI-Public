# Runbook: Maintenance Gateway Terminated During ChatGPT Pro

## Symptom

Hermes Mobile shows an Owner-maintenance or ChatGPT Pro run as `terminated`, while the Codex Mobile `ChatGPT Pro` thread may still be running.

## Likely Cause

The maintenance watchdog replaced an Owner-maintenance Gateway worker while it
was busy with a long tool call, or the ChatGPT Pro bridge was missing its Mac
Codex Mobile handoff environment and failed before the downstream Codex Mobile
thread could complete.

## Checks

1. `/api/status?detail=1`: confirm worker count and maintenance health.
2. Mac bridge-host state:
   `launchctl print system/com.hermesmobile.bridge-host`. Confirm it includes
   `HERMES_MOBILE_CHATGPT_PRO_WORKSPACE`,
   `HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL`,
   `HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE`, and
   `HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR`.
3. Mac bridge-host health: `curl -fsS http://127.0.0.1:8798/health`.
4. Mac Codex Mobile plugin health:
   `curl -fsS http://127.0.0.1:8787/api/v1/hermes/plugin/manifest`.
5. Confirm the Codex Mobile key path is readable by the bridge-host service
   user. Check ACL metadata only; do not print the key contents.
6. Check the relevant Mac Gateway profile logs under the enabled profile's
   production home, and compare SIGTERM timing with
   `/Users/example/path` and listener logs.
7. Legacy Windows/WSL fallback only, when running the old platform:
   `C:\ProgramData\HermesMobile\gateway-worker\logs\start-gateway-pool.log`
   and `/home/<owner>/.hermes/profiles/officialclean*/logs/gateway.log`.

## Expected Protection

`scripts/start-gateway-pool.ps1` should defer replacement when HTTP health fails but TCP remains open, for `OwnerMaintenanceBusyGraceMinutes` minutes.

## Repair

If protection is missing, deploy the watchdog busy-grace script change and run:

- PowerShell parse check
- `node tests\startup-scripts.test.js`
- manual watchdog invocation
- `/api/status?detail=1`

If Mac ChatGPT Pro bridge variables are missing, deploy Home AI through
`scripts/deploy-macos-production.js` so the bridge-host LaunchDaemon plist is
reinstalled from source, then restart `system/com.hermesmobile.bridge-host` and
repeat the health/key/workspace checks.

Do not restart the full Gateway Pool unless plugin/schema/profile startup changes require it.
