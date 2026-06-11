# Runbook: Disaster Recovery Backup Verification

## Purpose

Verify that the daily disaster recovery backup can restore Home AI Mac
production, including Home AI, all installed plugins, user data, Gateway
profile state, workspace Skill stores, workspace Memory stores, Soul files,
Codex state, Hermes Agent custom Skills, and critical service scripts on a
replacement machine.

## Commands

Check Mac production backup wiring without writing files:

```bash
eval "$(scripts/mount-macos-nas-backup-destination.sh)"
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node scripts/create-macos-disaster-backup.js \
  --destination "$HOMEAI_DISASTER_BACKUP_DESTINATION" \
  --check-only \
  --json
```

Run a bounded Mac backup verification when changing the backup script or
Automation wrapper:

```bash
eval "$(scripts/mount-macos-nas-backup-destination.sh)"
HOMEAI_DISASTER_BACKUP_LABEL=manual-verify scripts/run-macos-disaster-backup-to-nas.sh
```

Do not run the write path as `sudo node ... --destination <NFS path>`. Synology
NFS exports may root-squash sudo writes, which can surface as rsync
`unexpected end of file` or `mkpathat: Permission denied`. The supported write
path is the wrapper above: sudo reads production into local staging, then the
normal operator user syncs staging to NFS.

Production Automation uses a `no_agent` Hermes CRON job:

- job id: `d1a17b9f4c02`
- name: `每日 Home AI NAS 灾备`
- schedule: `30 3 * * *`
- script: `homeai-disaster-backup-cron.sh`

The cron script runs as `hermes-host` and does not read the sudo password file.
It requires read ACLs for backup-critical production/user state and the cron
LaunchDaemon environment variable `HERMES_CRON_SCRIPT_TIMEOUT=1800`, because
official no-agent scripts default to 120 seconds.

## Coverage Checklist

Verify the manifest includes these categories without printing secret contents:

- Home AI production app files
- Home AI production data directory
- Every installed plugin directory under
  `/Users/hermes-host/HermesMobile/plugins`
- Every plugin-owned `data` directory, including Wardrobe, Note, Finance,
  Growth, Health, Email, and Codex Mobile when installed
- Online-consistent SQLite snapshots
- Gateway worker/profile state needed for production
- `data/skill-profiles/*/skills` workspace Skill stores
- `data/skill-profiles/*/memories` workspace Memory stores
- `data/hermes-home/SOUL.md`
- Gateway profile `SOUL.md` files under
  `gateway-worker/telemetry/profiles`
- Readable operator Hermes Agent custom Skills and Memory stores, such as
  `/Users/xuxin/.hermes/skills`, `/Users/xuxin/.hermes/memories`,
  `/Users/xuxin/.hermes/profiles/*/skills`,
  `/Users/xuxin/.hermes/profiles/*/memories`, and profile `SOUL.md` files
- Codex skills/config/state needed by local workflows
- Codex Mobile state needed to recover cross-thread workspaces
- launchd plist files needed to reconstruct production services

The daily backup should not copy the full production `runtime` tree by
default. It is large and mostly rebuildable; record its path/version in the
manifest and back it up separately at lower frequency if operationally needed.

## Safety

The backup contains secrets and account state. Do not publish it, attach it to issues, or copy paths containing secret values into docs.

## Scheduler Check

If the daily automation fails:

1. Run the Mac script in `--check-only --json` mode.
2. Verify `HOMEAI_DISASTER_BACKUP_DESTINATION` points at the mounted or
   sync-backed NAS destination.
   The default helper is
   `scripts/mount-macos-nas-backup-destination.sh`, which mounts
   `192.168.10.99:/volume1/备份` at
   `/Users/xuxin/HomeAI-NAS-Backup-NFS` and returns the destination under
   `HomeAI-Production-Backups/mac-production`. NFS does not require the NAS
   account password.
3. Run `scripts/run-macos-disaster-backup-to-nas.sh` manually if needed. It
   stages to `/Users/xuxin/HomeAI-Disaster-Staging/mac-production` by default
   and publishes `current` to the NFS destination as the normal operator user.
4. For the production scheduled path, run the official Home AI
   Automation/Hermes CRON job manually if needed:
   `scripts/hermes-mobile-cron-dispatcher.py --run-job d1a17b9f4c02` with the
   production LaunchDaemon environment.
5. Confirm the scheduler reports a recent successful run and the receipt exists
   under `data/backups/disaster-recovery-receipts`.

Do not create native OS cron, launchd, or profile-local cron jobs for this
backup. Product-visible scheduled backups must use Home AI Automation backed by
the official Hermes CRON store.

Keep the no-agent script under the configured cron timeout or split slow work
into smaller bounded scripts.
