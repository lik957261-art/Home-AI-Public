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
sudo /Users/example/path scripts/create-macos-disaster-backup.js \
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

Run the same staged backup through SSH/rsync when the NFS mount is unstable:

```bash
HOMEAI_DISASTER_BACKUP_TRANSPORT=ssh \
HOMEAI_DISASTER_BACKUP_SSH_TARGET=<nas-ssh-alias-or-user@host> \
HOMEAI_DISASTER_BACKUP_SSH_DESTINATION=<remote-backup-root> \
HOMEAI_DISASTER_BACKUP_LABEL=manual-verify-ssh \
scripts/run-macos-disaster-backup-to-nas.sh
```

Do not run the write path as `sudo node ... --destination <NFS path>`. Synology
NFS exports may root-squash sudo writes, which can surface as rsync
`unexpected end of file` or `mkpathat: Permission denied`. The supported write
path is the wrapper above: sudo reads production into local staging, then the
normal operator user syncs staging to NFS or to the configured SSH target.
After a successful publish, local `staging/current` is deleted by default
because the restore artifact now lives on NAS/SSH storage. Set
`HOMEAI_DISASTER_BACKUP_KEEP_STAGING=1` only for a bounded manual diagnostic
run. If a publish fails, staging is left in place for inspection. Local disaster
backup receipts default to three-day retention via
`HOMEAI_DISASTER_BACKUP_RECEIPT_RETENTION_DAYS=3`; do not treat receipts as a
long-term archive because the recoverable backup is the remote `current` tree.
The scheduled `homeai-disaster-backup-cron.sh` wrapper temporarily sets
`HOMEAI_DISASTER_BACKUP_KEEP_STAGING=1` so it can validate the staged manifest
after SSH/NFS publish; it deletes `staging/current` itself only after that
validation succeeds.

The wrapper default is `HOMEAI_DISASTER_BACKUP_TRANSPORT=auto`: it prefers
SSH/rsync when both `HOMEAI_DISASTER_BACKUP_SSH_TARGET` and
`HOMEAI_DISASTER_BACKUP_SSH_DESTINATION` are configured, and otherwise falls
back to the mounted NFS path. Force `nfs` only when validating the mount path
itself.

The backup intentionally excludes heavyweight or externally mounted runtime
trees. Music metadata can be backed up, but `data/music/audio-mounts` and Roon
backup mirrors are excluded because the recoverable audio library lives outside
Home AI source/runtime state. Codex Mobile profile/config state can be backed
up, but browser/Chrome cache trees such as `chrome-pro-bridge` are excluded.

Production Automation uses a `no_agent` Hermes CRON job:

- job id: `d1a17b9f4c02`
- name: `每日 Home AI NAS 灾备`
- schedule: `30 3 * * *`
- script: `homeai-disaster-backup-cron.sh`

The cron script runs as `hermes-host` and does not read the sudo password file.
It requires read ACLs for backup-critical production/user state and the cron
LaunchDaemon environment variable `HERMES_CRON_SCRIPT_TIMEOUT=1800`, because
official no-agent scripts default to 120 seconds.

Mac production deploy also installs `com.hermesmobile.nas-backup-mount`, a root
LaunchDaemon that runs `scripts/homeai-nas-backup-mount-watchdog.sh` on load
and every five minutes. If the daily job reports that
`/Users/example/path` is not mounted, first check that
LaunchDaemon status and its logs:

```bash
sudo launchctl print system/com.hermesmobile.nas-backup-mount
tail -100 /Users/example/path
tail -100 /Users/example/path
```

Do not repair this by giving the CRON job access to the sudo password file.

If a manual run reaches the manifest stage but reports rsync status 23 against
`data/skill-profiles`, repair only the inherited read/traverse ACLs needed by
the listener/cron user. Do not run the scheduled job with sudo. The intended
ACL shape is `hermes-host` read/traverse on the store and inherited read access
for files under `data/skill-profiles`.

If a manual run reports `soul_file_unreadable` for
`gateway-worker/telemetry/profiles`, or rsync status 23 for
`gateway-worker/telemetry/<profile>`, repair the production deploy ACL
contract for the telemetry root and redeploy Home AI. The CRON job still runs as
`hermes-host`; do not give it the sudo password file or change the job to run
with sudo.

If the failure references `.codegraph/`, Codex `logs_*.sqlite*`, or SQLite
`*-wal` / `*-shm` files, those are local tooling indexes or live sidecars and
should be excluded from the daily backup instead of copied as restore-critical
payload.

If the failure references `nfs_destination_current_unavailable` or an
`Operation not permitted` error opening the NAS `current/` directory, the
wrapper must verify write access to both the destination root and `current/`.
When an inherited or server-owned `current/` directory is not writable by the
cron operator user, the supported repair is to rename it under the same NAS
directory as `.homeai-nfs-inaccessible-current-<timestamp>` and create a fresh
`current/`; do not delete the old directory in place.

## Coverage Checklist

Verify the manifest includes these categories without printing secret contents:

- Home AI production app files
- Home AI production data directory
- Every installed plugin directory under
  `/Users/example/path`
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
  `/Users/example/path`, `/Users/example/path`,
  `/Users/example/path`,
  `/Users/example/path`, and profile `SOUL.md` files
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
2. Prefer SSH publish when available. Verify
   `HOMEAI_DISASTER_BACKUP_SSH_TARGET` and
   `HOMEAI_DISASTER_BACKUP_SSH_DESTINATION` are configured for the production
   CRON environment. If they are not configured, verify
   `HOMEAI_DISASTER_BACKUP_DESTINATION` points at the mounted or sync-backed
   NAS destination.
   The default helper is
   `scripts/mount-macos-nas-backup-destination.sh`, which mounts
   `192.168.10.99:/volume1/备份` at
   `/Users/example/path` and returns the destination under
   `HomeAI-Production-Backups/mac-production`. NFS does not require the NAS
   account password.
3. Run `scripts/run-macos-disaster-backup-to-nas.sh` manually if needed. It
   stages to `/Users/example/path` by default
   and publishes `current` through SSH when configured, otherwise to the NFS
   destination as the normal operator user.
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

## Root-Level Rollback Artifacts

The Mac backup script treats direct production `data/*.bak` files as transient
local repair/deploy rollback artifacts. It records them as skipped and continues
backing up the canonical source file. For example, a root-owned
`data/gateway-pool-manifest-mac.json.before-*.bak` must not make the scheduled
backup partial as long as `data/gateway-pool-manifest-mac.json` is readable and
included.

If a failure still references `production-data-file:*.bak`, verify that
production is running a deployed script containing the
`transient-production-data-backup` skip reason before changing file ownership or
ACLs.

## Publish Rsync Verification

The wrapper publishes `staging/current` to SSH or NFS with ordinary rsync
temp-file/rename updates, not `--inplace`. If the target reports a transient
verification failure such as `failed verification -- update retained`, the
wrapper retries the publish up to `HOMEAI_DISASTER_BACKUP_RSYNC_ATTEMPTS`
times. The default is `3`.

If all attempts fail with `ssh_destination_rsync_failed` or
`nfs_destination_rsync_failed`, keep the staging manifest and inspect the target
filesystem or transport. Do not rerun the builder against production data until
the publish destination has been checked; the staged backup may already be
complete and only the publish step may need to be retried.
