# Runbook: Disaster Recovery Backup Verification

## Purpose

Verify that the daily disaster recovery backup can restore Hermes Mobile source, production app, user data, Gateway runtime/profile state, Codex skills/state, and critical scripts on a replacement machine.

## Commands

Check script wiring:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-hermes-mobile-disaster-backup.ps1 -CheckOnly
```

Run a bounded backup verification when changing the backup script or cron wrapper:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-hermes-mobile-disaster-backup.ps1
```

## Coverage Checklist

Verify the manifest includes these categories without printing secret contents:

- Private source checkout and `.git`
- Production app files
- Production data directory
- Online-consistent SQLite snapshots
- Gateway worker/runtime sync package
- Gateway profile/plugin state needed for production
- Codex skills/config/state needed by local workflows
- WSL Hermes scripts, skills, cron state, and maintenance profiles

## Safety

The backup contains secrets and account state. Do not publish it, attach it to issues, or copy paths containing secret values into docs.

## Scheduler Check

If the daily automation fails:

1. Run the PowerShell script in check mode.
2. Run the WSL wrapper once.
3. Run the official cron job manually if needed.
4. Confirm the scheduler reports a recent successful run.

Keep the no-agent script under the configured cron timeout or convert slow work into a smaller bounded script.
