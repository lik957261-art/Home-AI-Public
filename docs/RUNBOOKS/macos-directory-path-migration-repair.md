# macOS Directory Path Migration Repair

Last updated: 2026-06-07.

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

The enhanced rootless-drive mode also repairs a Mac-only migration residue:
metadata paths under `<root>/data/drive/<top>/...` that should point at the
Owner workspace drive under `<root>/data/drive/users/owner/<owner-drive>/<top>/...`.
It rewrites only when exactly one matching Owner workspace candidate exists and
the target exists. Missing or ambiguous old directory names remain unchanged and
must be treated as stale-reference cleanup, not automatic migration.

In SQLite-backed production, `data/state.json` is still a runtime snapshot. If
that snapshot is newer than SQLite, listener startup imports it back into
SQLite. Production write repairs therefore must use `--reset-state-snapshot`
while the listener is stopped so restart regenerates `state.json` from the
repaired SQLite state.

## Checked Harness

Local source harness:

```powershell
node --check scripts\macos-directory-path-migration-repair.js
node --check scripts\macos-bound-directory-preview-smoke.js
node --check tests\macos-directory-path-migration-repair.test.js
node --check tests\macos-bound-directory-preview-smoke-harness.test.js
node tests\macos-directory-path-migration-repair.test.js
node tests\macos-bound-directory-preview-smoke-harness.test.js
```

If the live production app is missing these tracked scripts or tests, sync the
source versions into `/Users/hermes-host/HermesMobile/app` and run the same
syntax and harness checks there before declaring closure. `/tmp` copies are
valid for triage only, not durable production evidence.

Mac production dry-run:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js \
  --root /Users/hermes-host/HermesMobile \
  --repair-rootless-drive \
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

4. Apply the write while the listener is stopped. The listener keeps runtime
   state in memory and may save stale pre-repair directory metadata during
   shutdown. For production writes, use this order: `bootout listener`, run the
   repair write, then `bootstrap`/`kickstart` the listener again. The script
   copies SQLite main/WAL/SHM files before the transaction.

```bash
sudo launchctl bootout system /Library/LaunchDaemons/com.hermesmobile.listener.plist
```

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js \
  --root /Users/hermes-host/HermesMobile \
  --repair-rootless-drive \
  --reset-state-snapshot \
  --write \
  --sample-limit 5 \
  --json
```

```bash
sudo launchctl bootstrap system /Library/LaunchDaemons/com.hermesmobile.listener.plist
sudo launchctl kickstart -k system/com.hermesmobile.listener
```

5. Re-run dry-run after the listener is back up. Passing closure for the path
   migration is:

```text
ok=true
changed=false
totals.affectedRows=0
totals.valueReplacements=0
totals.parseErrors=0
```

6. Validate with production API evidence:

- `production-status-smoke.js` still returns `ok=true` and `activeGlobal=0`.
- A representative directory preview returns `200` for a remapped Mac path.
- A representative existing artifact returns `200` and a nonzero byte count.
- The repair dry-run still returns `changed=false`.
- The bound-directory preview smoke returns `ok=true` for the current
  non-chat/topic binding surface:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-bound-directory-preview-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --all-workspaces \
  --simulate-ui-route \
  --json
```

Production closure must use `--all-workspaces`; Owner-only smoke can miss
directory-bound topics in inserted Weixin or plugin-authorized workspaces.
After Windows-origin bindings are migrated to Mac, closure should also use
`--simulate-ui-route`. That mode fetches the same `/api/projects` projection the
static client uses and previews the computed `projectId/subprojectId/path`
target, not only the saved physical `path`. A path-only smoke can pass while a
stale project id would make the UI open the wrong root or hit a directory ACL
failure.
Unknown or decommissioned workspaces are reported as `skipped:
unknown-workspace`; if such a workspace should still be active, restore its
workspace registration before treating the smoke as closed. Use `--include-chat`
only for historical cleanup audits. Old chat or group-chat messages may
reference deleted or renamed directories and should not block the current
topic/plugin binding closure unless those references are still surfaced as
actionable directory-topic cards.

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

## 2026-06-07 Rootless Plugin Path Repair

After the first path-prefix repair was clean, production still had rootless Mac
metadata such as `<root>/data/drive/插件/<plugin>` from an early Mac deployment
phase. Enhanced dry-run with `--repair-rootless-drive` reported:

- `ok=true`;
- 12 affected rows;
- 24 value replacements;
- `parseErrors=0`;
- `missingAfterRemap=0`;
- sample targets under `$DRIVE/users/owner/Hermes-徐欣/插件/<plugin>` existed.

Write mode created SQLite backups beside the production database, then a second
enhanced dry-run returned `changed=false`, `affectedRows=0`,
`valueReplacements=0`, and `parseErrors=0`.

The production bound-directory preview smoke then returned `ok=true` for Owner
with `includeChat=false`, `uniquePaths=19`, `okCount=19`, and `failed=0`.
An `--include-chat` audit still found two historical chat/group-chat references
to missing old directories; those are stale-reference cleanup items, not active
topic/plugin binding failures.

Follow-up on the same day showed two important closure rules:

- the rootless detector must treat each string field independently; one JSON
  blob may contain both already-correct `$DRIVE/users/...` values and still-stale
  `<root>/data/drive/<top>/...` values;
- a production write should stop the listener before the SQLite transaction,
  otherwise stale in-memory state can be saved later and reintroduce old path
  metadata;
- `data/state.json` must be backed up and reset in the same stopped-listener
  write window; otherwise a newer stale snapshot can be imported on startup and
  reintroduce old path metadata into SQLite.

After updating the repair harness for mixed JSON rows and running the
stop-repair-start procedure, production closure was:

- repair dry-run with `--repair-rootless-drive`: `changed=false`,
  `affectedRows=0`, `valueReplacements=0`, `parseErrors=0`;
- bound-directory preview smoke with `includeChat=false`: `ok=true`,
  `uniquePaths=19`, `okCount=19`, `failed=0`;
- `--include-chat` audit: `uniquePaths=26`, `okCount=24`, `failed=2`, both
  failures are historical chat/group-chat references to missing old directories.

## 2026-06-07 Cross-Workspace Binding Repair

Owner-only bound-directory smoke later missed a Weixin workspace regression:
`weixin_wuping` had persisted directory-topic metadata pointing at the missing
workspace-local path
`$DRIVE/users/weixin_wuping/Hermes-吴萍/健康/体检报告`, while the current
authorized shared root was
`$DRIVE/users/owner/Hermes-徐欣/吴萍.健康/体检报告`.

The production repair sequence must keep both repairs in the same stopped
listener window when legacy path drift is also present:

1. Stop `com.hermesmobile.listener`.
2. Run `macos-directory-path-migration-repair.js --repair-rootless-drive --reset-state-snapshot --write`.
3. Apply any exact shared-directory metadata repair for the affected workspace.
4. Start and kickstart `com.hermesmobile.listener`.
5. Re-run the dry-run and bound-directory preview smoke with
   `--all-workspaces --simulate-ui-route`.

After this repair, production evidence was:

- path repair dry-run: `changed=false`, `affectedRows=0`,
  `valueReplacements=0`, `parseErrors=0`;
- status smoke: `ok=true`, `activeGlobal=0`;
- bound-directory preview smoke with `--all-workspaces`: Owner `19/19`,
  `weixin_wuping` `7/7`, `weixin_test_1` `2/2`, and `weixin_stephen` `1/1`.

The same failure mode recurred after later production state churn. A fresh
dry-run again found Windows/WSL path drift in `messages.directory_route_json`,
`messages.directory_aliases_json`, `messages.artifacts_json`,
`threads.task_group_meta_json`, `artifacts.path`, and `artifacts.raw_json`.
The write repair updated 1372 rows and 2658 path values, backed up SQLite, and
reset `data/state.json`; backup timestamp: `20260606T190144Z`. A second exact
repair then moved 7 `weixin_wuping` health report message bindings from the
missing workspace-local path to the authorized Owner shared path, replacing 28
path values; backup timestamp: `20260606T190521Z`. Closure evidence was:
migration dry-run `changed=false`, `affectedRows=0`, `valueReplacements=0`,
`parseErrors=0`; status `ok=true`, `activeGlobal=0`; path-only all-workspaces
smoke Owner `19/19`, `user-981731fe` `2/2`, `weixin_stephen` `1/1`,
`weixin_test_1` `2/2`, `weixin_wuping` `7/7`; UI-route all-workspaces smoke
Owner `25/25`, `user-981731fe` `2/2`, `weixin_stephen` `1/1`,
`weixin_test_1` `2/2`, and `weixin_wuping` `12/12`. `weixin_xiaonan` remained
skipped as `unknown-workspace`. The live app was also repaired to include the
tracked directory migration scripts and harness tests; backup:
`/Users/hermes-host/HermesMobile/app/.deploy-backups/20260606T190655Z-directory-harness-sync`.

## 2026-06-07 UI Route Context Guard

Topic or message directory chips enter the Directory manager through the static
client route helpers. From a topic detail, directory preview must use the
current topic thread as the ACL context when a directory return route exists.
It must not always create a new single-window directory thread from the current
workspace selector, because shared topics and Windows-origin migrated bindings
can otherwise combine a topic from one workspace with a directory preview
thread from another workspace.

The production smoke should therefore be run in both forms when debugging a
chip-only failure:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-bound-directory-preview-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --all-workspaces \
  --json
```

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-bound-directory-preview-smoke.js \
  --root /Users/hermes-host/HermesMobile \
  --all-workspaces \
  --simulate-ui-route \
  --json
```

If both pass but a phone still fails, the next facts to capture are the loaded
`data-client-version`, selected workspace id, current thread id, current task
group id, clicked chip `data-project-id`, `data-subproject-id`, and
`data-directory-path`. Do not treat a path-only smoke pass as sufficient UI
evidence in that case.
