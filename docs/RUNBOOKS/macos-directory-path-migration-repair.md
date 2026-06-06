# macOS Directory Path Migration Repair

Last updated: 2026-06-06.

## Purpose

Use this runbook after moving Home AI production data from Windows/WSL to Mac
when directory chips, directory-bound topics, or Markdown/file artifacts return
`Directory not found or not allowed`, `Artifact not found`, or equivalent
`404` errors even though the files were copied to the Mac drive root.

The repair is data-only. It rewrites persisted metadata paths from legacy
Windows/WSL drive prefixes to the Mac production drive root. It does not modify
user files.

## Symptoms

- Directory-bound topic chips open `directory-viewer.html` but the page reports
  `Directory not found or not allowed`.
- The directory exists under
  `/Users/hermes-host/HermesMobile/data/drive/users/...`.
- The affected topic was created from the directory three-dot menu before the
  Mac migration, usually while production still used Windows/WSL paths.
- Existing Markdown/PDF/file artifact cards can return `404` until the
  artifact metadata path and listener runtime state are refreshed.

## Root Cause

Directory-topic routes and artifact cards are stored as persisted metadata in
SQLite. A Windows-to-Mac file copy can move the actual files but leave these
fields pointing at old physical paths:

```text
/mnt/c/ProgramData/HermesMobile/data/drive/users/...
C:/ProgramData/HermesMobile/data/drive/users/...
C:\ProgramData\HermesMobile\data\drive\users\...
```

On Mac those paths do not exist and do not fall inside the Mac directory ACL
roots, so the directory boundary service correctly rejects them.

The repair rewrites these fields:

- `messages.directory_route_json`
- `messages.directory_aliases_json`
- `messages.artifacts_json`
- `threads.task_group_meta_json`
- `artifacts.path`
- `artifacts.raw_json`

## Checked Harness

Local source harness:

```powershell
node --check scripts\macos-directory-path-migration-repair.js
node --check tests\macos-directory-path-migration-repair.test.js
node tests\macos-directory-path-migration-repair.test.js
```

Mac production dry-run:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js \
  --root /Users/hermes-host/HermesMobile \
  --sample-limit 5 \
  --json
```

The dry-run must report bounded metadata only: affected row counts,
replacement counts, parse errors, missing-after-remap counts, and compacted
sample paths. It must not print access keys, passwords, tokens, raw prompts, or
long message/file contents.

## Repair Procedure

1. Confirm the production origin and runtime status with the checked status
   smoke. The authenticated header must be `X-Hermes-Web-Key`; the
   `X-Hermes-Access-Key` probe is a negative control only.

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/production-status-smoke.js \
  --base http://127.0.0.1:8797 \
  --access-key-file /Users/hermes-host/HermesMobile/data/secrets/owner-web-key.secret \
  --json
```

2. Prefer `activeGlobal=0` before writing the database. If a user-visible run is
   active, wait or reschedule the repair.

3. Run the dry-run command above. Treat nonzero `parseErrors` as blocking.
   `missingAfterRemap` can be a warning because historical artifact files may
   have been deleted before migration.

4. Apply the write. The script copies SQLite main/WAL/SHM files before the
   transaction.

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js \
  --root /Users/hermes-host/HermesMobile \
  --write \
  --sample-limit 5 \
  --json
```

5. Re-run dry-run. Passing closure for the path migration is:

```text
ok=true
changed=false
totals.affectedRows=0
totals.valueReplacements=0
totals.parseErrors=0
```

6. Restart the listener when artifact cards or already-loaded topic state are
   part of the incident. The listener keeps runtime state in memory, so a DB
   repair alone can leave `/api/artifacts/<id>` reading old paths until the
   process reloads.

```bash
sudo launchctl kickstart -k system/com.hermesmobile.listener
```

7. Validate with production API evidence:

- `production-status-smoke.js` still returns `ok=true` and `activeGlobal=0`.
- A representative directory preview returns `200` for a remapped Mac path.
- A representative existing artifact returns `200` and a nonzero byte count.
- The repair dry-run still returns `changed=false`.

## 2026-06-06 Production Evidence

The first production repair on Mac Studio rewrote persisted paths in:

- 631 `messages.directory_route_json` rows;
- 631 `messages.directory_aliases_json` rows;
- 18 `messages.artifacts_json` rows;
- 2 `threads.task_group_meta_json` rows;
- 5174 `artifacts.path` rows;
- 5179 `artifacts.raw_json` rows.

Backup files were created beside the production SQLite database with the
timestamp `20260606T160249Z`.

Post-repair validation:

- repair dry-run returned `changed=false`, `affectedRows=0`, and
  `parseErrors=0`;
- the Owner Python directory preview returned `200` with 14 entries;
- the Owner health directory preview returned `200` with 51 entries;
- two existing Markdown artifacts returned `200` with nonzero byte counts after
  listener restart.

Some historical artifact paths had `missingAfterRemap` during the write. Those
rows point to files that were not present after migration and remain separate
missing-file cleanup, not path-prefix drift.
