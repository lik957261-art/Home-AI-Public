# Module: Runtime State And Backup

## Responsibility

Runtime state owns SQLite-backed product data, compatibility JSON snapshots, startup normalization, state persistence safety, and disaster-recovery backups.

Backups must allow a replacement machine to restore source, production app files, user data, Gateway runtime/profile state, Codex skills/state, and critical scripts without publishing secrets.

## Core Files

- `adapters/mobile-sqlite-store.js`
- `adapters/runtime-state-repository.js`
- `adapters/runtime-state-store-service.js`
- `adapters/runtime-state-persistence-service.js`
- `adapters/runtime-state-normalization-service.js`
- `adapters/system-runtime-status-service.js`
- `scripts/migrate-json-to-sqlite.js`
- `scripts/sqlite-runtime-smoke.js`
- `scripts/create-hermes-mobile-disaster-backup.ps1`
- `scripts/create-hermes-mobile-disaster-backup.sh`

## Production State

- Current production data directory is under `C:\ProgramData\HermesMobile\data`.
- Current SQLite state is `hermes-mobile.sqlite3` under that data directory.
- `state.json` is a snapshot/rollback artifact, not the preferred write target for new product behavior.
- Learning-growth data has its own SQLite schema and migration path behind the learning services.

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

- The disaster backup should copy production app, production data, online-consistent SQLite snapshots, Gateway worker/runtime state, private source checkout, Codex skills/config/state, and selected WSL Hermes state.
- It should exclude volatile or heavy folders such as `node_modules`, logs, temp/cache, old backups, and raw session logs unless explicitly required for recovery.
- The backup contains secrets and account state; it must not be published or attached to public issues.

## Validation

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-hermes-mobile-disaster-backup.ps1 -CheckOnly`
- Run the backup wrapper once when changing backup coverage.
- Verify the manifest and key coverage paths exist without printing secret contents.
- Run `node tests\architecture-refactor-boundary.test.js` when state/runtime composition changes.
