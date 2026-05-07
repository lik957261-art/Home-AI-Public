# Hermes Mobile Service Layer

## Goal

Hermes Mobile should own product data and user-facing services that are independent from the official Hermes codebase. Official Hermes remains the clean Gateway/agent runtime, while Hermes Mobile provides the mobile product surface, access control, notifications, user management, Todo, Automation, file previews, and audit history.

## Current State

This branch adds the first SQLite service-layer foundation:

- `adapters/mobile-sqlite-store.js`
- `scripts/migrate-json-to-sqlite.js`
- contract tests for import, integrity checks, and migration CLI behavior

The SQLite layer is currently a migration and validation target. It does not yet replace the production JSON runtime store. This keeps rollback simple: the live listener can continue using existing JSON files while the SQLite copy is validated.

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

## Safety Rules

- Run migrations on a copied data directory before touching any live data directory.
- Do not delete JSON state after a successful SQLite import. JSON remains the rollback source until runtime reads and writes have fully moved.
- Keep SQLite files, reports generated from private data, and copied runtime directories under ignored `workspace/` paths.
- Do not push production `workspace/` contents or migration reports containing private file hashes to public repositories.

## Next Runtime Step

After migration validation is stable, add an optional `HERMES_WEB_DB_PATH` runtime mode that writes through SQLite while keeping JSON snapshot export enabled. Todo and Automation should then move from deployment bridges into generic service tables, with deployment-specific bridges remaining opt-in adapters.
