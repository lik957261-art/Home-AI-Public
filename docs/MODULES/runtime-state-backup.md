# Module: Runtime State And Backup

## Responsibility

Runtime state owns SQLite-backed product data, compatibility JSON snapshots, startup normalization, state persistence safety, and disaster-recovery backups.

Backups must allow a replacement machine to restore source, production app files, user data, Gateway runtime/profile state, Codex skills/state, and critical scripts without publishing secrets.

## Core Files

- `adapters/mobile-sqlite-store.js`
- `adapters/mobile-runtime-sqlite-store-facade-service.js`
- `adapters/runtime-state-repository.js`
- `adapters/runtime-state-store-service.js`
- `adapters/runtime-state-persistence-service.js`
- `adapters/runtime-state-normalization-service.js`
- `adapters/system-runtime-status-service.js`
- `scripts/migrate-json-to-sqlite.js`
- `scripts/sqlite-runtime-smoke.js`
- `scripts/mount-macos-nas-backup-destination.sh`
- `scripts/create-macos-disaster-backup.js`
- `scripts/run-macos-disaster-backup-to-nas.sh`
- `scripts/create-hermes-mobile-disaster-backup.ps1`
- `scripts/create-hermes-mobile-disaster-backup.sh`

## Production State

- Current Mac production root is `/Users/example/path`.
- Current production data directory is
  `/Users/example/path`.
- Current SQLite state is `hermes-mobile.sqlite3` under that data directory.
- `state.json` is a snapshot/rollback artifact, not the preferred write target for new product behavior.
- Home AI voice-input learning data is server-side runtime data. Learned
  phrasebook terms, correction pairs, and bounded audit metadata live in
  `hermes-mobile.sqlite3` tables `voice_input_phrasebook`,
  `voice_input_corrections`, and `voice_input_audit`; `state.json` is only the
  compatibility snapshot for that state.
- Plugin data is plugin-owned and must be backed up together with Home AI:
  `/Users/example/path<plugin>/data`.
- Workspace-local Skill and Memory stores are under
  `/Users/example/path<profileId>/skills`
  and
  `/Users/example/path<profileId>/memories`.
- Production Soul files include at least
  `/Users/example/path` and Gateway
  profile `SOUL.md` files under
  `/Users/example/path`.
- Learning-growth data has its own SQLite schema and migration path behind the
  learning services.

## State Safety Rules

- Do not overwrite runtime state with fresh defaults after normalization failures.
- Destructive operations must create bounded backups or snapshots first.
- State snapshots are for recovery and inspection; do not copy them into public exports.
- Normal message creation is not a destructive operation and must not force a
  full `state.json` backup for every message-count increase. High-frequency
  run-start writes should use the JSON snapshot as the immediate recovery point
  and avoid SQLite full replacement until a lower-frequency or terminal save.
- Message-count decreases, refused overwrites, startup import, parse failure,
  and explicit data repairs still require bounded backup protection.
- `state.json` remains a compatibility/recovery snapshot. SQLite is the
  structured runtime store; if a fast JSON snapshot is newer than SQLite's
  `lastRuntimeStateSave`, startup must import the JSON snapshot into SQLite
  before serving state.
- Do not store raw secrets, push endpoints, OAuth tokens, full learner content, raw prompts, or long logs in docs or handoffs.

## Disaster Backup Rules

- The Mac disaster backup builder is
  `node scripts/create-macos-disaster-backup.js --destination <path>`. It
  builds the manifest, copies file coverage, and creates online SQLite
  snapshots. For a real NFS publish, call
  `scripts/run-macos-disaster-backup-to-nas.sh` instead of running the builder
  directly against the NFS path with sudo.
- The default Mac NAS mount helper is
  `scripts/mount-macos-nas-backup-destination.sh`. It creates or reuses
  `/Users/example/path` and mounts the dedicated Synology NFS
  export `192.168.10.99:/volume1/备份`. NFS does not use the NAS account
  password; the helper uses `HOMEAI_MAC_SUDO_PASSWORD_FILE` only for the local
  macOS `mount_nfs` operation. The default backup subdirectory is
  `HomeAI-Production-Backups/mac-production`.
- Mac production deploy installs `com.hermesmobile.nas-backup-mount`, a
  root LaunchDaemon that runs `scripts/homeai-nas-backup-mount-watchdog.sh` at
  load and every five minutes. It keeps the NAS NFS export mounted before the
  `03:30` no-agent disaster-backup CRON job runs. The CRON job itself must not
  read the sudo password file or perform sudo escalation.
- The supported publish path is local staging followed by ordinary-user sync.
  `scripts/run-macos-disaster-backup-to-nas.sh` runs the builder with sudo into
  `/Users/example/path` by default, then
  publishes `staging/current`.
  - Default transport is `HOMEAI_DISASTER_BACKUP_TRANSPORT=auto`.
  - In `auto`, a complete `HOMEAI_DISASTER_BACKUP_SSH_TARGET` plus
    `HOMEAI_DISASTER_BACKUP_SSH_DESTINATION` selects SSH/rsync first.
  - Without SSH destination config, `auto` falls back to the NFS destination.
  - `HOMEAI_DISASTER_BACKUP_TRANSPORT=ssh` requires the SSH target/destination
    and fails closed when they are missing.
  - `HOMEAI_DISASTER_BACKUP_TRANSPORT=nfs` keeps the historical mounted-NFS
    behavior.
  The NFS path avoids Synology root-squash failures from sudo writes by syncing
  as the operator user. The SSH path avoids macOS NFS mount instability by
  sending the same staged `current` tree over SSH/rsync with an explicit remote
  `/usr/bin/rsync` path. NFS operations are
  bounded by `HOMEAI_NAS_BACKUP_OP_TIMEOUT_SECONDS` and
  `HOMEAI_NAS_BACKUP_RSYNC_TIMEOUT_SECONDS`; SSH operations are bounded by
  `HOMEAI_BACKUP_SSH_OP_TIMEOUT_SECONDS` and
  `HOMEAI_BACKUP_SSH_RSYNC_TIMEOUT_SECONDS`. Publish rsync uses ordinary
  temp-file/rename updates rather than `--inplace`, and retries are bounded by
  `HOMEAI_DISASTER_BACKUP_RSYNC_ATTEMPTS` with default `3`. A hung or
  unwritable destination must fail with an explicit destination error instead
  of blocking CRON.
  Local disaster-backup staging is an intermediate workspace only. After a
  successful NAS/SSH publish, the wrapper removes `staging/current` by default;
  set `HOMEAI_DISASTER_BACKUP_KEEP_STAGING=1` only for a bounded manual
  diagnostic run. Failed publishes keep staging for inspection. Local disaster
  backup receipts are operational evidence only and default to a three-day
  retention window through `HOMEAI_DISASTER_BACKUP_RECEIPT_RETENTION_DAYS=3`;
  the restore artifact is the NAS/SSH `current` tree, not an accumulating local
  receipt archive.
- The production scheduled path is a Hermes CRON `no_agent` job running as
  `hermes-host`. Its script is installed at
  `/Users/example/path`
  and calls the same wrapper with `HOMEAI_DISASTER_BACKUP_USE_SUDO=0`,
  staging under
  `/Users/example/path`.
  The cron runner must have `HERMES_CRON_SCRIPT_TIMEOUT=1800` and read-only
  ACLs for backup-critical production/user state, including inherited
  read/traverse ACLs on `data/skill-profiles` for `hermes-host`; do not give
  the cron job access to the sudo password file.
- The disaster backup must copy Home AI production app files, production data,
  all installed plugin directories, plugin-owned `data` directories,
  Gateway worker/profile state, launchd plists, workspace Skill stores,
  workspace Memory stores, per-user/profile Soul files, and selected operator
  Codex/Hermes Agent state when readable.
- Mac production deploy repairs read/traverse ACLs for `hermes-host` under
  `data/artifacts` so generated plugin artifacts such as Wardrobe thumbnails
  remain readable by the scheduled backup even when a plugin worker created
  them with a private owner and `700` mode.
- Daily backup excludes local tooling indexes and volatile runtime logs such as
  `.codegraph/`, Codex `logs_*.sqlite*`, and SQLite `*-wal` / `*-shm` sidecar
  files that are not the durable restore target and can change while rsync is
  reading them.
- Daily backup skips root-level production `data/*.bak` files created by local
  repair/deploy rollback operations. Canonical files such as
  `data/gateway-pool-manifest-mac.json` are still backed up; transient
  `.bak` files are recorded as skipped so an unreadable root-owned rollback
  artifact cannot make the scheduled disaster backup partial.
- Hermes Agent custom user Skills stores are mandatory backup coverage. The
  authoritative production store is `data/skill-profiles/*/skills`; the
  operator-side Hermes Agent store, such as `/Users/example/path` and
  profile-local `profiles/*/skills`, is included by the Mac backup script when
  readable.
- Every workspace Memory store and Soul file is mandatory backup coverage.
  This includes `data/skill-profiles/*/memories`, production
  `data/hermes-home/SOUL.md`, Gateway profile `SOUL.md` files, and readable
  operator Hermes Agent profile `SOUL.md` files.
- SQLite databases must be captured through online-consistent snapshots, not
  copied only as live `.sqlite*`, `.sqlite3*`, or `.db*` files.
- The voice-input learning tables in `data/hermes-mobile.sqlite3` are mandatory
  daily-backup coverage. Backup validation should treat the SQLite snapshot as
  the restore target for the user's learned phrasebook and correction history.
- It should exclude volatile or heavy folders such as `node_modules`, virtual
  environments, logs, temp/cache, old backups, raw session logs, and sandboxes
  unless explicitly required for recovery.
- The daily backup should not copy the full production `runtime` tree by
  default because it is large and rebuildable. Record the runtime path/version
  in the manifest and back it up separately at lower frequency if needed.
- The backup contains secrets and account state; it must not be published or attached to public issues.

## Validation

- Mac plan/check mode:
  `node scripts/create-macos-disaster-backup.js --destination <nas-path> --check-only --json`
- NAS mount helper:
  `scripts/mount-macos-nas-backup-destination.sh`
- NAS publish wrapper:
  `scripts/run-macos-disaster-backup-to-nas.sh`
- SSH publish wrapper mode:
  `HOMEAI_DISASTER_BACKUP_TRANSPORT=ssh HOMEAI_DISASTER_BACKUP_SSH_TARGET=<host> HOMEAI_DISASTER_BACKUP_SSH_DESTINATION=<remote-path> scripts/run-macos-disaster-backup-to-nas.sh`
- Focused Mac harness:
  `node tests/macos-disaster-backup-script.test.js`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-hermes-mobile-disaster-backup.ps1 -CheckOnly`
- The PowerShell script is historical Windows coverage and must not be treated
  as sufficient for current Mac production.
- Run the Mac backup wrapper once when changing backup coverage.
- Verify the manifest and key coverage paths exist without printing secret
  contents.
- Run `node tests\architecture-refactor-boundary.test.js` when state/runtime composition changes.
- Run `node tests\mobile-runtime-sqlite-store-facade-service.test.js` when
  lazy SQLite store wiring changes.
