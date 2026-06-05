# Mac Worker Filesystem Access

Use this runbook when a Mac production Gateway run says the file tool cannot
write a Markdown delivery, reports `Permission denied`, or says the live data
root is `Path not found` even though Home AI `access_policy_context` contains
the expected `allowed_roots`.

## Known Production Shape

- Live Home AI root: `/Users/hermes-host/HermesMobile`.
- Live data root: `/Users/hermes-host/HermesMobile/data`.
- Listener runs from the live root and builds run policy with live paths such
  as `/Users/hermes-host/HermesMobile/data/drive`.
- Gateway workers run as isolated macOS users such as `hm-owner`,
  `hm-wuping`, `hm-stephen`, `hm-xuyan`, `hm-xulu`, and `hm-test`.
- Worker LaunchDaemons set `HERMES_WORKSPACE_ROOT` to paths such as
  `/Users/hm-owner/HermesWorkspace`, but the file tool still receives the live
  paths from Home AI policy.
- Therefore macOS ACLs must let each worker user traverse the live root and
  read/write only the live data roots authorized for that worker.

If the Home AI policy allows `/Users/hermes-host/HermesMobile/data/drive` but
`hm-owner` cannot traverse that path at the OS layer, the model can correctly
say it is allowed while the actual file tool fails with `Permission denied` or
`Path not found`.

## Harness

Run the harness on Mac production after deployment, data migration, user
creation, ACL repair, or any change to worker isolation:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-worker-filesystem-access-harness.js \
  --root /Users/hermes-host/HermesMobile
```

From Windows, use the shared SSH alias and pass sudo credentials through the
normal local operator mechanism; do not print passwords or keys:

```powershell
ssh homeai-mac "sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-worker-filesystem-access-harness.js --root /Users/hermes-host/HermesMobile"
```

Pass criteria:

- `hm-owner` can read, write, and create/delete a smoke file under live
  `data/drive`, live `data/uploads`, and the Wardrobe delivery root
  `data/drive/插件/衣橱`.
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

## Repair Pattern

For parent directories, grant only traversal and metadata access to worker
users. For authorized live data roots, grant read/write with inheritance.
Record `ls -led` before and after the repair under the production backup
directory.

Example ACL intent:

```bash
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/hermes-host
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/hermes-host/HermesMobile
sudo chmod +a "hm-owner allow list,search,readattr,readextattr,readsecurity" /Users/hermes-host/HermesMobile/data
sudo chmod -R +a "hm-owner allow list,search,readattr,readextattr,readsecurity,read,write,append,execute,add_file,add_subdirectory,delete_child,file_inherit,directory_inherit" /Users/hermes-host/HermesMobile/data/drive
```

Do not solve this by granting every worker write access to every user's data
root. Owner may receive live `data/drive` access because Owner policy uses that
root. Ordinary workers should receive only their live workspace subtree plus
shared cache/upload roots that their policy exposes.

Workspace-private roots must also remove default group/other access. A common
failure is `drwxr-xr-x+`: the ACL grants the intended worker, but POSIX
group/other read bits still let other macOS users list another workspace's
private plugin directory. The repair pattern is:

```bash
sudo chmod -RN /Users/hermes-host/HermesMobile/data/drive/users/<workspaceId>
sudo chmod -R u+rwX,go-rwx /Users/hermes-host/HermesMobile/data/drive/users/<workspaceId>
sudo chmod -R +a "user:<hm-user> allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" /Users/hermes-host/HermesMobile/data/drive/users/<workspaceId>
sudo chmod -R +a "user:hm-owner allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" /Users/hermes-host/HermesMobile/data/drive/users/<workspaceId>
```

## Evidence From 2026-06-05 Incident

The failing Wardrobe Markdown delivery run had:

- `principal_id=owner`
- `access_mode=restricted`
- `default_workspace=/Users/hermes-host/HermesMobile/data/drive`
- `allowed_roots=["/Users/hermes-host/HermesMobile/data/drive"]`
- `allowed_toolsets` included `weather`, `file`, `vision`, `skills`,
  `wardrobe`, and `x_search`

The assistant could use Wardrobe MCP, but the file tool returned
`Permission denied` when writing under
`/Users/hermes-host/HermesMobile/data/drive/插件/衣橱` and then reported the live
drive root as `Path not found`. The root cause was missing macOS ACL access for
the isolated `hm-owner` worker user, not a missing Wardrobe MCP schema.
