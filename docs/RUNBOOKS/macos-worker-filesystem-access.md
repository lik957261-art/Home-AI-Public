# Mac Worker Filesystem Access

Use this runbook when a Mac production Gateway run says the file tool cannot
write a Markdown delivery, reports `Permission denied`, or says the live data
root is `Path not found` even though Home AI `access_policy_context` contains
the expected `allowed_roots`.

## Known Production Shape

- Live Home AI root: `/Users/example/path`.
- Live data root: `/Users/example/path`.
- Listener runs from the live root and builds run policy with live paths such
  as `/Users/example/path`.
- Gateway workers run as isolated macOS users such as `hm-owner`,
  `hm-wuping`, `hm-stephen`, `hm-xuyan`, `hm-xulu`, and `hm-test`.
- Worker LaunchDaemons set `HERMES_WORKSPACE_ROOT` to paths such as
  `/Users/example/path`, but the file tool still receives the live
  paths from Home AI policy.
- Therefore macOS ACLs must let each worker user traverse the live root and
  read/write only the live data roots authorized for that worker.
- Plugin-required Skill preload is different from model-side `skill_view`.
  Home AI preloads required plugin Skill bundles in the listener process before
  Gateway streaming. On Mac production that listener runs as `hermes-host`.
  Therefore a required keyless Skill bundle such as
  `productivity/wardrobe-style-operations` must be readable by `hermes-host`
  through all parent directories. A bundle that root can read but
  `hermes-host` cannot read is a production failure and should surface as
  `plugin_required_skill_unreadable` in the profile audit.

If the Home AI policy allows `/Users/example/path` but
`hm-owner` cannot traverse that path at the OS layer, the model can correctly
say it is allowed while the actual file tool fails with `Permission denied` or
`Path not found`.

## Harness

Run the harness on Mac production after deployment, data migration, user
creation, ACL repair, or any change to worker isolation:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path
```

From Windows, use the shared SSH alias and pass sudo credentials through the
normal local operator mechanism; do not print passwords or keys:

```powershell
ssh homeai-mac "sudo /Users/example/path /Users/example/path --root /Users/example/path"
```

Pass criteria:

- `hm-owner` can read, write, and create/delete a smoke file under live
  `data/drive`, live `data/uploads`, and the Wardrobe delivery root
  `data/drive/插件/衣橱`.
- For ACL-granted writable roots, real create/delete smoke is authoritative.
  macOS `test -w` can report false when a directory is writable through ACL
  rather than POSIX owner mode, so the harness does not fail a path solely for
  that mismatch when write smoke is enabled.
- `hm-wuping` can read, write, and create/delete a smoke file under live
  `data/drive/users/weixin_wuping` and live `data/uploads` when those paths
  exist.
- Other worker users are checked against their current workspace ids, including
  `weixin_stephen`, `user-981731fe`, `user-a87aaa61`, and `weixin_test_1` when
  those roots exist.
- Cross-user deny checks must pass: ordinary worker users must not be able to
  read or write Owner Skill/Memory stores, another user's drive root, or another
  user's `.hermes-*` plugin private directories. A path that reports
  `exists=false` from the denied user's perspective is acceptable when the
  parent directory is intentionally non-traversable.
- The harness output must not contain Owner keys, plugin keys, launch tokens,
  raw business files, or message bodies.

For full Mac production closure, run
`scripts/macos-production-closure-validation.js` after this focused ACL harness
passes. The closure harness includes this ACL check plus status, profile audit,
native MCP schema, DeepSeek, Weixin, Owner/OpenAI concurrency, and final-status
checks.

If a user sees `AI 执行通道启动后没有通过健康检查`, check the affected
workspace Gateway stderr before assuming model/provider failure. On Mac
production, a low-permission worker can exit before binding `/health` when it
cannot read the live Gateway manifest, its worker API key file, or a provider
key file read by the start script. The typical stderr is
`missing Gateway API key for <profile>` or a `Permission denied` line for a
secret/runtime path.

Also verify the worker account and runtime Python path:

```bash
id <hm-user>
python_path=/Users/example/path
readlink "$python_path"
python_realpath="$(/usr/bin/python3 - <<'PY'
import os
print(os.path.realpath("/Users/example/path"))
PY
)"
echo "$python_realpath"
sudo -u <hm-user> "$python_path" -V
```

The `id` output must include `hermes-workers` unless the deployment explicitly
configured another `HERMES_MOBILE_WORKER_GROUP`. The runtime Python realpath
must stay under the production runtime tree or another production-owned runtime
path; it must not resolve into `/Users/example/path`, `/Users/example/path`, or any
developer account home. Fix the production runtime copy/symlink and group
membership instead of granting workspace workers access to a developer home.
Gateway worker API key files must be readable by both the target worker user
and the Home AI listener user. If the worker can start and `/health` is green
but product runs fail with an invalid Gateway API key, check whether the key
file was created by root with mode `600` and no listener ACL.

Repair only the minimum required access:

```bash
sudo chmod +a "user:<hm-user> allow search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "user:<hm-user> allow search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "user:<hm-user> allow read,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "user:<hm-user> allow read,readattr,readextattr,readsecurity" /Users/example/path<profile>.key
sudo chmod +a "user:hermes-host allow read,readattr,readextattr,readsecurity" /Users/example/path<profile>.key
```

If the stderr shows `venv/bin/hermes: Permission denied`, inspect the console
script shebang. Workspace start scripts should execute the runtime as
`$ROOT/runtime/hermes-agent-official/venv/bin/python -m hermes_cli.main gateway
run --replace --accept-hooks`; do not fix this by granting workspace users
access to a developer's home directory.

If stderr shows `missing Gateway API key for <profile>`, compare the affected
manifest row's `apiKeyFile` to the workspace user. A row for `hm-xjz` must not
point at a key file for `hm-wuping` or any template account. Re-run workspace
Gateway provisioning so it writes a workspace-owned key file such as
`hm-xjz-openai-1.key` and refreshes the LaunchDaemon profile files.

If a real run reaches the provider and then fails with `No Codex credentials
stored`, check the affected `openai-codex` profile directory under the workspace
worker home. `auth.json` and `auth.lock` must be symlinks to
`/Users/example/path`.
This is separate from the manifest API-server key. If the run instead reports
`Permission denied: .../auth.lock` or
`Permission denied: .../auth.json.tmp.<suffix>`, the symlink exists but the
shared auth directory, lock/auth files, or profile directory temporary-file ACLs
are missing for the process user. Re-run workspace Gateway provisioning or the
bounded production drift reconcile after fixing the shared-auth source so the
profile links and ACLs are refreshed.
The production profile audit now checks this directly. `codex_auth_*` issues
are deployment blockers, and `scripts/deploy-macos-production.js` runs that
focused gate after non-`--sync-only` plugin deployments because plugin MCP or
profile refresh work can otherwise touch the same worker profile tree.

For required plugin Skills and profile-local file plugins, also run the profile
audit after any Skill Store copy, worker-side Skill edit, plugin provisioning,
user migration, or Gateway start-script repair:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --json
```

Pass criteria include no
`worker_manifest_unreadable:<profile>:<user>`,
`worker_api_key_file_missing:<profile>`,
`worker_api_key_unreadable:<profile>:<user>`, or
`worker_provider_key_unreadable:<profile>:<user>:<basename>` issue. These
issues mean the worker can be configured and launchd-loaded but still fail a
normal cold start before `/health` binds. They are separate from Codex
`auth.json` / `auth.lock` drift and from file-plugin live-root drift.
Pass criteria also include no
`plugin_required_skill_unreadable:<workspace>:<plugin>:<skill>` issue. The
check must use the listener user, not root-only file access.
It must also include no `file_plugin_root_env_missing:<profile>:<env>` and no
`file_plugin_root_missing:<profile>:<env>:<root>` issue. These issues mean a
profile-local file tool such as `docx_extract_text`, `office_extract_text`,
`pptx_create`, `pptx_validate`, `pdf_extract_text`, `pdf_render_pages`, `archive_extract_safe`, or
`audio_transcribe` is still using Windows/WSL
default roots instead of Mac live roots. The root list must use comma,
semicolon, or newline separators; `file_plugin_root_list_delimiter_unsupported`
means a PATH-style colon-separated list was used and must be repaired. In that
state a run can read Markdown or analyze uploaded images but fail Word/DOCX,
PowerPoint generation or extraction, Excel, PDF, audio, or ZIP extraction with
`file_path_outside_allowed_roots`.
It must also include no `mobile_bridge_env_missing:<profile>:<env>`,
`mobile_bridge_host_url_default_missing:<profile>`, or
`mobile_bridge_key_path_missing:<profile>:data/secrets/bridge-host.secret`
issue. These issues mean profile-local automation tools such as
`cronjob_mobile` cannot reach the Home AI bridge-host CRON route and may report
`Hermes Mobile bridge host key is not configured`.

Then run an actual DOCX extraction smoke against at least the affected profile:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --profiles hm-wuping-openai-1 \
  --json
```

This harness creates a temporary synthetic DOCX in the live uploads root and
calls the target profile-local `hermes-mobile-docx` plugin directly. Passing
output has `ok=true`; `docx_plugin_file_path_outside_allowed_roots:<profile>`
means the start-script roots or separators are still wrong even if ordinary
Markdown/image paths appear to work.

## Repair Pattern

For parent directories, grant only traversal and metadata access to worker
users. For authorized live data roots, grant read/write with inheritance.
Record `ls -led` before and after the repair under the production backup
directory.

Example ACL intent:

```bash
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod -R +a "hm-owner allow list,search,readattr,readextattr,readsecurity,read,write,append,execute,add_file,add_subdirectory,delete_child,file_inherit,directory_inherit" /Users/example/path
```

Do not solve this by granting every worker write access to every user's data
root. Owner may receive live `data/drive` access because Owner policy uses that
root. Ordinary workers should receive only their live workspace subtree plus
shared cache/upload roots that their policy exposes.

For keyless required plugin Skill bundles, the listener needs read/traverse but
not write. Keep the Skill Store owner as the workspace worker. Grant the
listener user an explicit read/traverse ACL on the selected required bundle and
its parent category. Do not make the private Skill Store group-readable: on
macOS the service users commonly share `staff`, so group read/traverse can leak
Owner Skill bundles to other workspace users and should fail the worker ACL
harness.

```bash
sudo chmod -RN /Users/example/path
sudo chown -R :staff /Users/example/path
sudo chmod -R u+rwX,go-rwx /Users/example/path
sudo chmod +a "user:hermes-host allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "user:hermes-host allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod +a "user:hermes-host allow list,search,readattr,readextattr,readsecurity" /Users/example/path
sudo chmod -R +a "user:hermes-host allow list,search,readattr,readextattr,readsecurity,read,execute,file_inherit,directory_inherit" /Users/example/path
sudo -u hermes-host test -r /Users/example/path
```

Do not apply this pattern to secret files such as access keys, workspace keys,
tokens, or cookie stores. Required plugin preload must skip secret filenames.

Workspace-private roots must also remove default group/other access. A common
failure is `drwxr-xr-x+`: the ACL grants the intended worker, but POSIX
group/other read bits still let other macOS users list another workspace's
private plugin directory. The repair pattern is:

```bash
sudo chmod -RN /Users/example/path<workspaceId>
sudo chmod -R u+rwX,go-rwx /Users/example/path<workspaceId>
sudo chmod -R +a "user:<hm-user> allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" /Users/example/path<workspaceId>
sudo chmod -R +a "user:hm-owner allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" /Users/example/path<workspaceId>
```

## Evidence From 2026-06-05 Incident

The failing Wardrobe Markdown delivery run had:

- `principal_id=owner`
- `access_mode=restricted`
- `default_workspace=/Users/example/path`
- `allowed_roots=["/Users/example/path"]`
- `allowed_toolsets` included `weather`, `file`, `vision`, `skills`,
  `wardrobe`, and `x_search`

The assistant could use Wardrobe MCP, but the file tool returned
`Permission denied` when writing under
`/Users/example/path` and then reported the live
drive root as `Path not found`. The root cause was missing macOS ACL access for
the isolated `hm-owner` worker user, not a missing Wardrobe MCP schema.
