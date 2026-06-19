# OpenAI Codex Shared Auth Repair

## Symptom

OpenAI/Codex Gateway runs fail with `token_invalidated`, `Codex auth is missing access_token`, or a generic `run failed` while `/api/status?detail=1` still shows the Hermes Mobile listener and Gateway Pool healthy.

A related operator symptom is `hermes auth list` or `hermes auth add` failing with `Invalid cross-device link` for the low Gateway user.

On macOS multi-user production, the same auth class can appear as
`No Codex credentials stored` in an Owner or family workspace run while the
shared auth file exists. In that case, audit
`scripts/macos-production-profile-audit.js --json --no-strict` and look for
`codex_auth_json_unreadable:<profile>` or
`codex_auth_json_unwritable:<profile>`.

## Known 2026-05-31 Cause

Low Gateway profiles share an OpenAI/Codex auth store through symlinks. The shared store may live under the Windows-mounted worker root while the command path is under `/home/hermes/.hermes`.

Official Hermes preserves symlink targets by resolving `auth.json` before `os.replace()`. If the temp file is created on one filesystem and the resolved target is on another, Linux returns `EXDEV` / `Invalid cross-device link`.

Hermes Mobile keeps the compatibility fix in `gateway-runtime-overrides/sitecustomize.py`. It patches `utils.atomic_replace()` and the `hermes_cli.auth` module's imported `atomic_replace` reference so an `EXDEV` replace retries by copying the temp file to the resolved target filesystem and then replacing locally. Do not patch official-clean source for this local deployment rule.

On macOS, shared OpenAI/Codex auth is also symlinked from many isolated
`hm-*` Gateway profiles into:

```text
/Users/example/path
```

Any one OpenAI worker may refresh that file. A normal successful
`atomic_replace()` can replace the file as that worker and drop the shared
`hermes-workers` group write mode or ACLs. The runtime override must repair
`shared-auth/auth.json` and `shared-auth/auth.lock` to group
`hermes-workers`, mode `0660`, and the per-OpenAI/Codex-worker macOS ACLs
after both the normal replace path and the `EXDEV` fallback path. The ACL user
set must be derived from `gateway-pool-manifest-mac.json` when available, not
hard-coded to a fixed historical worker list.

## Diagnosis

1. Check Mobile health first:
   - `/api/status?detail=1`
2. Identify the failing worker and bounded run metadata from state/logs. Do not dump prompts, raw model output, or tokens.
3. Check worker auth without printing secrets:
   - `C:\ProgramData\HermesMobile\gateway-worker\check-worker-codex-auth.ps1`
4. Check OpenAI/Codex login status as the low Gateway user with the production wrapper:
   - `HOME=/home/hermes HERMES_HOME=/home/hermes/.hermes /opt/hermes-gateway-runtime/bin/hermes auth status openai-codex`
5. If `auth list` or `auth add` is needed, use the same wrapper path so `gateway-runtime-overrides` is loaded.

## Repair

For a one-time repair, copy only the current local Codex token block from the operator's private Codex auth store into the shared low Gateway auth store, preserving the existing JSON shape and credential pool. Back up the shared auth file first and never print token values.

For a durable repair, ensure the production runtime override is synced to:

- `C:\ProgramData\HermesMobile\gateway-worker\runtime-overrides\sitecustomize.py`
- `/opt/hermes-gateway-runtime/runtime-overrides/sitecustomize.py`

Then validate `hermes auth list` with the production wrapper. A listener restart is not required for the auth file repair itself. A Gateway worker restart is required only if already-running workers need to load a newly changed runtime override.

For macOS shared-auth permission drift, run a bounded ACL repair that grants all
OpenAI/Codex manifest `osUser` values read/write access to `auth.json` and
`auth.lock`, then confirm every listed `hm-*` user can read and write those two
files with `sudo -u <user> test -r/-w <file>`. Do not print the auth JSON
contents. If `gateway-runtime-overrides/sitecustomize.py` changes, restart the
affected Gateway profiles so future auth refreshes load the runtime ACL repair.

## Validation

Focused checks:

- `python -m py_compile gateway-runtime-overrides\sitecustomize.py`
- `node tests\startup-scripts.test.js`
- `C:\ProgramData\HermesMobile\gateway-worker\check-worker-codex-auth.ps1`
- `HOME=/home/hermes HERMES_HOME=/home/hermes/.hermes /opt/hermes-gateway-runtime/bin/hermes auth list`
- A bounded `/v1/responses` smoke against one OpenAI/Codex low Gateway.

On macOS, also validate:

- `scripts/macos-production-profile-audit.js --root /Users/example/path --json --no-strict`
  reports `codexIssueCount=0`.
- Every OpenAI/Codex manifest `osUser` can read and write the shared
  `auth.json` and `auth.lock` via `sudo -u <user> test -r/-w`.

## Privacy

Do not store raw access tokens, refresh tokens, Owner keys, workspace keys, cookies, push endpoints, prompts, model output, or long logs in docs, handoffs, screenshots, or chat.
