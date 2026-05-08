# Local Workspace Root Migration

Hermes Mobile deployments can move workspace roots from mounted network drives
to local per-user data directories without changing application source code.
Use `scripts/migrate-workspace-roots.py` to rewrite runtime path references in
JSON state/config files and the SQLite service store.

The migration tool is generic. Site-specific old and new paths must live in an
operator-owned mapping file outside the repository.

## Mapping File

Example:

```json
{
  "replacements": [
    {
      "from": "/old/mounted/root",
      "to": "/new/local/root"
    },
    {
      "from": "C:\\Old\\Mounted\\Root",
      "to": "C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\Hermes-Owner"
    }
  ],
  "json_files": [
    "config/access-control/weixin-users.json",
    "config/access-control/weixin-routing-map.json",
    "shared-directories.json",
    "config/project-directory-map.json",
    "state.json"
  ],
  "sqlite_file": "hermes-mobile.sqlite3"
}
```

The replacement order is preserved. Put more specific paths before broad roots
when a deployment has overlapping directories.

## Procedure

1. Stop the Hermes Mobile listener.
2. Back up the runtime data directory.
3. Copy workspace files to the new local roots.
4. Set OS permissions on the new roots for the Hermes Mobile runtime account.
5. Run a dry run:

```powershell
python scripts\migrate-workspace-roots.py --data-dir <runtime-data-dir> --map <mapping-file>
```

6. Apply the migration:

```powershell
python scripts\migrate-workspace-roots.py --data-dir <runtime-data-dir> --map <mapping-file> --apply
```

7. Start Hermes Mobile and verify `/api/status`, `/api/workspaces`, directory
   preview, and a historical artifact preview.

The tool creates backups of changed files when `--apply` is used. Keep the full
runtime backup until directory browsing, task artifacts, Todo, Automation, and
Web Push flows have been smoke-tested.

## Repository Boundary

Do not commit deployment mapping files. They may contain user names, private
mount paths, NAS paths, or other local topology. Only the generic tool and this
runbook belong in the product repository.
