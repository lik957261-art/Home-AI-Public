# Hermes Mobile Service Layer

## Goal

Hermes Mobile should own product data and user-facing services that are independent from the official Hermes codebase. Official Hermes remains the clean Gateway/agent runtime, while Hermes Mobile provides the mobile product surface, access control, notifications, user management, Todo, Automation, file previews, and audit history.

## Current State

This branch adds the first SQLite service-layer foundation:

- `adapters/mobile-sqlite-store.js`
- `scripts/migrate-json-to-sqlite.js`
- contract tests for import, integrity checks, and migration CLI behavior

The SQLite layer is now a migration target and an optional runtime state backend. When `HERMES_WEB_SERVICE_STORE=sqlite` is enabled, Hermes Mobile loads threads/messages/artifacts/Web Push state from SQLite and writes every `saveState()` to SQLite first, then writes `state.json` as a rollback snapshot. Existing production can keep running on JSON until an explicit cutover.

## Schema Scope

The initial schema keeps normalized tables for:

- workspaces
- workspace access-key hashes
- threads
- messages
- artifacts
- Web Push subscriptions
- Web Push receipts
- Web Push delivery summaries
- shared directories
- Todo items
- Automation jobs
- audit events
- metadata and schema migrations

Most tables also preserve a `raw_json` column. That is deliberate. It allows incremental migration without dropping fields that older JSON runtime code still understands.

## Migration

Dry-run migration imports JSON data into a temporary SQLite file and deletes it after reporting:

```powershell
node scripts/migrate-json-to-sqlite.js --data-dir ".\workspace\hermes-web" --dry-run --report ".\workspace\migration-report.json"
```

Write migration imports into a persistent database:

```powershell
node scripts/migrate-json-to-sqlite.js --data-dir ".\workspace\hermes-web" --db ".\workspace\hermes-web\hermes-mobile.sqlite3" --write --report ".\workspace\migration-report.json"
```

If workspace/account records live in an external deployment catalog instead of `workspaces.json`, export that catalog as JSON and pass it explicitly:

```powershell
node scripts/migrate-json-to-sqlite.js --data-dir ".\workspace\hermes-web" --workspaces-file ".\workspace\workspace-catalog.json" --db ".\workspace\hermes-web\hermes-mobile.sqlite3" --write
```

The migration report contains only counts, file hashes, byte sizes, warnings, and SQLite integrity status. It must not include raw access keys, push endpoints, VAPID private keys, or message contents.

## Runtime Smoke

After creating a SQLite database, run a temporary listener smoke before cutover:

```powershell
node scripts/sqlite-runtime-smoke.js --data-dir ".\workspace\hermes-web" --db ".\workspace\hermes-web\hermes-mobile.sqlite3" --port 19041 --report ".\workspace\sqlite-runtime-smoke.json"
```

The smoke runs with auth disabled, Web Push disabled, local Todo/Automation, and `HERMES_WEB_SERVICE_STORE=sqlite`. It verifies that threads load from SQLite and that a push receipt persists back into SQLite.

## Safety Rules

- Run migrations on a copied data directory before touching any live data directory.
- Do not delete JSON state after a successful SQLite import. JSON remains the rollback source until runtime reads and writes have fully moved.
- Keep SQLite files, reports generated from private data, and copied runtime directories under ignored `workspace/` paths.
- Do not push production `workspace/` contents or migration reports containing private file hashes to public repositories.

## Next Runtime Step

## Optional Local Runtime

For clean product installs or migration testing, the service store can back runtime state plus local Todo and Automation:

```powershell
$env:HERMES_WEB_SERVICE_STORE = "sqlite"
$env:HERMES_WEB_DB_PATH = ".\workspace\hermes-web\hermes-mobile.sqlite3"
$env:HERMES_WEB_TODO_BACKEND = "local"
$env:HERMES_WEB_AUTOMATION_BACKEND = "local"
```

Existing deployments can continue to set `HERMES_WEB_TODO_BACKEND` and `HERMES_WEB_AUTOMATION_BACKEND` to bridge backends. Those bridge backends remain compatibility adapters, not the default product architecture.

## Runtime Rollback

SQLite runtime mode keeps writing `state.json` snapshots after successful SQLite writes. To roll back a listener from SQLite mode, unset `HERMES_WEB_SERVICE_STORE` and restart against the same data directory; the JSON snapshot remains readable by the existing JSON state loader.

## Next Runtime Step

After SQLite runtime validation is stable, move workspace/access-key/shared-directory stores behind the same runtime database and add a controlled production cutover script that performs backup, migration, integrity check, smoke, and rollback validation in one command.
