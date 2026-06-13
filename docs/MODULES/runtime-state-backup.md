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

- Current Mac production root is `/Users/hermes-host/HermesMobile`.
- Current production data directory is
  `/Users/hermes-host/HermesMobile/data`.
- Current SQLite state is `hermes-mobile.sqlite3` under that data directory.
- `state.json` is a snapshot/rollback artifact, not the preferred write target for new product behavior.
- Home AI voice-input learning data is server-side runtime data. Learned
  phrasebook terms, correction pairs, and bounded audit metadata live in
  `hermes-mobile.sqlite3` tables `voice_input_phrasebook`,
  `voice_input_corrections`, and `voice_input_audit`; `state.json` is only the
  compatibility snapshot for that state.
- Plugin data is plugin-owned and must be backed up together with Home AI:
  `/Users/hermes-host/HermesMobile/plugins/<plugin>/data`.
- Workspace-local Skill and Memory stores are under
  `/Users/hermes-host/HermesMobile/data/skill-profiles/<profileId>/skills`
  and
  `/Users/hermes-host/HermesMobile/data/skill-profiles/<profileId>/memories`.
- Production Soul files include at least
  `/Users/hermes-host/HermesMobile/data/hermes-home/SOUL.md` and Gateway
  profile `SOUL.md` files under
  `/Users/hermes-host/HermesMobile/gateway-worker/telemetry/profiles`.
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
  `/Users/xuxin/HomeAI-NAS-Backup-NFS` and mounts the dedicated Synology NFS
  export `192.168.10.99:/volume1/备份`. NFS does not use the NAS account
  password; the helper uses `HOMEAI_MAC_SUDO_PASSWORD_FILE` only for the local
  macOS `mount_nfs` operation. The default backup subdirectory is
  `HomeAI-Production-Backups/mac-production`.
- The supported NFS write path is local staging followed by ordinary-user NFS
  sync. `scripts/run-macos-disaster-backup-to-nas.sh` runs the builder with
  sudo into `/Users/xuxin/HomeAI-Disaster-Staging/mac-production` by default,
  then rsyncs `staging/current` to the mounted NFS destination as the operator
  user. This avoids Synology NFS root-squash failures from sudo writes.
- The production scheduled path is a Hermes CRON `no_agent` job running as
  `hermes-host`. Its script is installed at
  `/Users/hermes-host/HermesMobile/data/hermes-home/scripts/homeai-disaster-backup-cron.sh`
  and calls the same wrapper with `HOMEAI_DISASTER_BACKUP_USE_SUDO=0`,
  staging under
  `/Users/hermes-host/HermesMobile/data/backups/disaster-recovery-staging/mac-production`.
  The cron runner must have `HERMES_CRON_SCRIPT_TIMEOUT=1800` and read-only
  ACLs for backup-critical production/user state, including inherited
  read/traverse ACLs on `data/skill-profiles` for `hermes-host`; do not give
  the cron job access to the sudo password file.
- The disaster backup must copy Home AI production app files, production data,
  all installed plugin directories, plugin-owned `data` directories,
  Gateway worker/profile state, launchd plists, workspace Skill stores,
  workspace Memory stores, per-user/profile Soul files, and selected operator
  Codex/Hermes Agent state when readable.
- Daily backup excludes local tooling indexes and volatile runtime logs such as
  `.codegraph/`, Codex `logs_*.sqlite*`, and SQLite `*-wal` / `*-shm` sidecar
  files that are not the durable restore target and can change while rsync is
  reading them.
- Hermes Agent custom user Skills stores are mandatory backup coverage. The
  authoritative production store is `data/skill-profiles/*/skills`; the
  operator-side Hermes Agent store, such as `/Users/xuxin/.hermes/skills` and
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
