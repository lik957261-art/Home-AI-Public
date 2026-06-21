# macOS Production Access

Last updated: 2026-06-08.

## Purpose

This runbook defines the shared Home AI access path for Mac Studio production.
It is used by the Home AI main workspace and by plugin workspaces. Plugin
projects must not each invent their own SSH, sudo, password, or deployment
access flow.

The deployment rule itself is the platform contract in
`docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`. This
runbook provides the production access mechanics that contract uses.

This runbook records credential locations and access mechanics only by
reference. It must not contain raw passwords, SSH private key contents, access
keys, tokens, cookies, launch tokens, or one-time approval state.

## Current Production Host

Current Mac Studio production facts:

```text
LAN host: 192.168.10.110
Tailnet HTTPS: <tailnet-https-origin>
Default SSH user: <mac-admin-user>
Production root: /Users/example/path
Production app: /Users/example/path
Production data: /Users/example/path
Production plugins: /Users/example/path
Listener URL on Mac loopback: http://127.0.0.1:8797
Listener launchd label: com.hermesmobile.listener
Automation cron tick launchd label: com.hermesmobile.cron
```

Treat `http://192.168.10.110:8797/` and the configured
`<tailnet-https-origin>` as production user-facing origins.
Production scripts running on the Mac should usually use loopback
`http://127.0.0.1:8797`.

## Shared SSH Access

The shared Windows SSH aliases are platform-level facts and should be usable
from all local workspaces:

```text
homeai-mac
homeai-macstudio-prod
macstudio-110
```

Default usage:

```powershell
ssh homeai-mac "hostname && whoami"
```

The shared SSH private key location may be referenced in docs or scripts as a
file path, but private key contents must never be printed or copied:

```text
%USERPROFILE%\.ssh\homeai_macstudio_prod_ed25519
```

If the shared aliases are missing in a future Windows workspace, the fix belongs
in the user's Windows SSH config, not in each plugin project.

## Privileged Access Model

Some install, deploy, and repair checks require privileged macOS operations
because live services run under `hermes-host`, `hm-*` workspace users, and
system LaunchDaemons.

Product rule:

- runtime Home AI services must not hold, read, or depend on a stored Mac login
  password;
- routine runtime repair must use preinstalled LaunchDaemons, restricted helper
  tools, filesystem ACLs, or narrow sudoers rules installed during a privileged
  bootstrap step;
- a password file is allowed only as a private development/operator automation
  compatibility path, not as a required production deployment mechanism;
- public installers and runbooks must guide the operator through an interactive
  `sudo`/administrator approval step instead of asking them to write their Mac
  password into a durable file.

Allowed bootstrap pattern:

- obtain administrator approval interactively during install or upgrade;
- install root-owned LaunchDaemon plists, ACLs, and narrowly scoped sudoers
  rules;
- validate sudoers files with `visudo -cf` before installing them;
- validate that post-bootstrap runtime actions work without reading a password.

Temporary development/operator automation pattern:

- obtain the sudo password from the user's private local password store;
- pass it through stdin or a bounded `--password-file` option;
- never echo the password;
- never print the raw password;
- never write it into docs, command output, handoffs, screenshots, or logs;
- keep sudo commands bounded to the production operation being performed.

Preferred command pattern from Windows:

```powershell
ssh homeai-mac "sudo -n true"
```

If passwordless sudo is not configured and `sudo -n true` fails, use a script or
command wrapper that feeds the password through stdin only for the explicit
operator action being performed. Do not embed the password in the command line.
Command lines can be captured by process lists, shell history, logs, or terminal
transcripts.

Example safe shape:

```powershell
Get-Content -Raw $env:HOMEAI_MAC_SUDO_PASSWORD_FILE |
  ssh homeai-mac "sudo -S /Users/example/path /Users/example/path --json"
```

The environment variable name is the compatibility interface for private
operator automation:

```text
HOMEAI_MAC_SUDO_PASSWORD_FILE
```

The password file path is user-local secret storage. It may be provided by the
operator at runtime; it must not be copied into plugin repositories, shared
context, public docs, screenshots, or handoffs. Scripts may accept
`--password-file` where a non-interactive developer flow is required, but a
fresh deployment must remain possible without creating such a file.

When a fix repeatedly needs privileged access after installation, close the gap
by productizing one of these mechanisms:

- a root-owned LaunchDaemon that performs the bounded operation;
- a restricted sudoers entry for one validated command shape;
- a signed/native privileged helper with a narrow API;
- corrected file ownership or ACLs that remove the privileged requirement.

Do not solve recurring production drift by requiring Home AI, Codex, Gateway
workers, plugin services, or app-server code to read a Mac administrator
password.

## Long-Lived SSH Channel

All workspaces should share one SSH configuration rather than create their own
per-plugin tunnels.

Recommended future SSH config properties:

```sshconfig
Host homeai-mac
  HostName 192.168.10.110
  User <mac-admin-user>
  IdentityFile %USERPROFILE%/.ssh/homeai_macstudio_prod_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 4
  ControlMaster auto
  ControlPersist 10m
  ControlPath ~/.ssh/cm-%r@%h:%p
```

If ControlMaster causes stale sessions or permission confusion, disable it and
retry with a fresh SSH connection before changing production scripts.

## Root/Sudo Command Rules

Use absolute paths for production commands. Do not rely on interactive shell
startup files, user `PATH`, `.zshrc`, `.bashrc`, or `sudo` secure path.

Preferred Node path:

```text
/Users/example/path
```

Examples:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --json
```

```bash
sudo launchctl print system/com.hermesmobile.listener
```

```bash
sudo launchctl print system/com.hermesmobile.cron
```

```bash
sudo launchctl kickstart -k system/com.hermesmobile.listener
```

```bash
sudo launchctl kickstart -k system/com.hermesmobile.cron
```

Rules:

- avoid `sudo node` because `node` may not exist in sudo's secure path;
- avoid multi-line inline Bash through PowerShell when secrets or complex
  quoting are involved;
- write temporary scripts as UTF-8 no-BOM files when a complex shell sequence is
  needed;
- delete temporary scripts after use unless they are promoted to tracked tools;
- record bounded command status, not full raw logs.

## HANES Mac Command Guardrails

Use these guardrails before production SSH/sudo commands. They are part of the
HANES discipline for normalized evidence and should prevent repeated
permission/quoting retries.

- If a production path is known to be unreadable by the control user, do not
  first run a non-sudo `cd`, `ls`, `node`, or `sqlite3` command against it. Run
  the full bounded operation under `sudo /bin/sh -c '...'`.
- When feeding a sudo password through stdin, do not also use shell input
  redirection such as `< script.sql` in the same remote command. That
  redirection steals stdin from `sudo -S`. Use `sqlite3 database '.read
  /tmp/script.sql'` or a temporary script instead.
- If a command needs `cd /Users/example/path`, put the `cd` and
  the command inside the same sudo shell. `ssh homeai-mac "cd <prod> && sudo
  ..."` fails before sudo because the control user cannot traverse the app root.
- Apply sudo to the whole command chain. `sudo cmd1 && cmd2` leaves `cmd2`
  non-sudo and can look like a missing file when it is actually a traversal
  permission problem.
- Use pinned absolute paths for critical tools. On macOS, do not assume Linux
  paths such as `/bin/find`; prefer checked paths such as `/usr/bin/find`,
  `/usr/bin/head`, `/usr/bin/grep`, `/usr/bin/sqlite3`, and the pinned Home AI
  Node path.
- For complex probes, write a short temporary script, copy it to `/tmp`, execute
  it with sudo, and delete it. Do not stack PowerShell, zsh, sudo, Node, and
  SQL/Python quoting in one inline command.
- Temporary probes must output bounded evidence only: ids, counts, field names,
  statuses, and booleans. They must not print raw key values, password contents,
  private payloads, full prompts, full logs, or raw user data.

## Mac Development Codex Boundary

The Mac development environment is intentionally separate from production:

```text
Development entrypoint for xuxin/Codex:
/Users/example/path

Development root:
/Users/example/path

Production root:
/Users/example/path

Single production Codex Mobile plugin service:
com.hermesmobile.plugin.codex-mobile on 127.0.0.1:8787
```

Codex running as macOS user `xuxin` may have full local development access to
`/Users/example/path` so remote Codex Mobile control and local
Mac Codex CLI/App sessions can edit, test, and run development code without
extra prompts.

There should still be only one active Codex Mobile service. The Home AI
production plugin entry runs the production Codex Mobile Web service as
`xuxin`, with `CODEX_HOME` pointing at the `xuxin` Codex home and
`CODEX_MOBILE_RUNTIME_DIR` under `/Users/example/path`. The cloned
development repository under `/Users/example/path` is a
source working tree, not a second long-lived Codex Mobile runtime.

Do not grant `xuxin` normal read/write access to the production app root as a
working tree. Production source updates should use the documented deployment
path with explicit temporary sudo elevation, backup, controlled sync, restart
only when needed, and smoke validation. If a deployment script itself must be
fixed, perform that fix in the development repo and use a bounded sudo command
only for the production-side install or verification step.

The production Codex Mobile plugin service needs a narrow exception so launchd
can restart it:

```text
/Users/example/path                         xuxin traverse/search only
/Users/example/path            xuxin traverse/search only
/Users/example/path    xuxin traverse/search only
/Users/example/path
                                           xuxin read/search/execute only
```

Do not extend that exception to `/Users/example/path` or to
other production plugin source roots unless a service has a specific run-user
need and the exception is recorded.

If the single production Codex Mobile service is not listening on `8787`, use
the host recovery script instead of starting a second runtime:

```bash
/Users/example/path --list-homes --json
/Users/example/path --profile-id previous --dry-run --json
/Users/example/path --profile-id previous --json
```

Home AI exposes the same guarded flow through Owner-only
`/api/codex-mobile/recovery/*` routes. This recovery is for listener-missing or
LaunchDaemon-stopped incidents only. Do not use it for `401` responses, normal
thread failures, frontend refresh issues, or projection bugs.

Mac development workspaces used by the single production Codex Mobile service
are registered in `/Users/example/path`.
Use canonical real paths under `/Users/example/path` as the
visible workspace roots, not `/Users/example/path<repo>` symlink
paths. Codex normalizes new thread `cwd` values to real paths, so registering
only the symlink path lets a new thread start successfully but disappear from
the workspace's thread list. The `HomeAIDev` symlinks remain convenient Finder
and shell entrypoints, but runtime state should use real paths.

The same real paths should be present in the `xuxin` Codex Desktop global
state files so Desktop and the embedded Codex Mobile plugin expose the same
workspaces:

```text
/Users/example/path
/Users/example/path
```

The relevant keys are `electron-saved-workspace-roots`, `project-order`, and
`active-workspace-roots`. These files contain local UI/workspace state, not
auth tokens, but still back them up before operational edits. Do not add
`/Users/example/path` as a normal workspace root.

For the single production Codex Mobile service, future Mobile-created
development workspaces should also sync to Codex Desktop. Start the
`com.hermesmobile.plugin.codex-mobile` listener with
`CODEX_MOBILE_SYNC_DESKTOP_WORKSPACES=1`; the Codex Mobile Web workspace
registry service will canonicalize created workspace roots through `realpath`
where available and add those roots to the same Desktop global-state keys. The
API should expose only a sync boolean/count, not the local `.codex` file paths.

Current development CLI tools exposed to `xuxin`:

```text
/Users/example/path
/Users/example/path
/Users/example/path
```

`/usr/local/bin/node`, `/usr/local/bin/npm`, `/usr/local/bin/npx`, and
`/usr/local/bin/codex` may point at the same development runtime/CLI so
non-interactive shell sessions can find them. This must not be used as a reason
to run production commands without explicit production sudo boundaries.

## Plugin Deployment Access

Home AI and every plugin must follow
`docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`.
Development source is prepared under `/Users/example/path`;
production source roots are updated only by a bounded deploy operation with a
pre-deploy backup, controlled sync/install command, targeted restart decision,
and post-deploy validation.

Use the shared Home AI deploy script as the default entrypoint:

```bash
node scripts/deploy-macos-production.js --target home-ai --json
node scripts/deploy-macos-production.js --plugin finance --json
npm run --silent deploy:macos -- --target home-ai --json
npm run --silent deploy:macos -- --plugin finance --source /Users/example/path --json
npm run --silent deploy:macos -- --plugin all --json
```

The script is plan-only unless `--execute` is present. For execution, pass the
private sudo password file through `--password-file` or
`HOMEAI_MAC_SUDO_PASSWORD_FILE`; the script feeds it through sudo stdin and does
not print the password. Listener and plugin health validations retry briefly
after restart to account for normal launchd warm-up.
Plugin deployment plans must show `data/` in `rsyncExcludes`, and ordinary
plugin source deploys must not overwrite or delete production plugin `data/`
directories. The central script restores the production target owner after
sync: `hermes-host:staff` by default, with `xuxin:staff` for the Codex Mobile
plugin because that launchd service runs as `xuxin`.
The `--plugin all` target expands to the bounded known plugin services and uses
per-plugin default restart labels plus loopback manifest smokes. It does not
accept a single `--source`, `--restart-label`, or `--health-url` override.
The operator-facing `health` alias resolves to the historical `healthy` source
and production directory.

Growth first production install also needs a source-only sync followed by the
shared launchd installer:

```bash
npm run --silent deploy:macos -- --plugin growth --source /Users/example/path --restart none --sync-only --execute --password-file <private-local-password-file> --json
```

```bash
node scripts/install-growth-launchd-service.js --json
node scripts/install-growth-launchd-service.js --execute --bootstrap \
  --gateway-authoring-endpoint http://127.0.0.1:18751/v1/responses \
  --gateway-authoring-access-token-path <gateway-worker-token-file> \
  --gateway-authoring-protocol responses \
  --gateway-authoring-model gpt-5.5 \
  --gateway-authoring-reasoning-effort xhigh \
  --gateway-planner-model gpt-5.5 \
  --gateway-planner-reasoning-effort xhigh \
  --gateway-evaluation-endpoint http://127.0.0.1:18751/v1/responses \
  --gateway-evaluation-access-token-path <gateway-worker-token-file> \
  --gateway-evaluation-protocol responses \
  --password-file <private-local-password-file> --json
```

That installer uses the same sudo/password-file boundary. It may create the
Growth registration key file when missing, but must not print raw key values.
It starts Growth with `GROWTH_DATA_OWNER=plugin` and
`GROWTH_LEARNING_DB_PATH` under the Growth plugin production data directory.
The Home AI listener must also expose
`HERMES_MOBILE_GROWTH_PLUGIN_MANIFEST_URL`,
`HERMES_MOBILE_PLUGIN_GROWTH_MANIFEST_URL`, and
`HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY_PATH` pointing at the Growth registration
key file. Otherwise Growth workspace grants fail before Gateway materialization.
The `--sync-only` step is first-install-only and is not a deployment closure;
run plugin-owned SQLite import/readback, Growth health, embedded launch/proxy,
and selected Gateway `mcp_growth_*` smokes after bootstrap.

Moira first production install also uses source-only sync before its LaunchDaemon
exists:

```bash
npm run --silent deploy:macos -- --plugin moira --source /Users/example/path --restart none --sync-only --execute --password-file <private-local-password-file> --json
node scripts/install-moira-launchd-service.js --json
node scripts/install-moira-launchd-service.js --execute --bootstrap --password-file <private-local-password-file> --json
```

The Moira installer starts `com.hermesmobile.plugin.moira` on
`127.0.0.1:4174` as `hermes-host`, with only bounded environment values in the
plist. It does not write raw plugin access keys. Initial access is Owner-only
unless `MOIRA_HERMES_ALLOWED_WORKSPACES` is explicitly expanded and the target
workspace has a server-side `.hermes-moira` key path.

Plugin workspaces should read the central deployment contract before deploys:

```text
/Users/example/path
```

If a deployment is initiated from a plugin Codex thread, the thread should call
the Home AI app deploy script by changing to `/Users/example/path`
or by using the script's absolute path. Plugin-local code may provide
plugin-specific facts such as label, health URL, MCP schema check, and data
readback check, but must not define a separate production sudo or direct-write
path. Use Gateway selected-profile callable schema checks when MCP tools
changed, and mobile visual/Appium smoke when embedded UI or mobile gestures
changed.

Plugin deployment scripts should expose one shared access interface:

```text
--ssh-alias homeai-mac
--password-file <private-local-password-file>
--mac-root /Users/example/path
--source <development-source-path>
--target-plugin <plugin-id>
```

They should not hard-code:

- raw password values;
- per-plugin SSH aliases;
- per-plugin private keys;
- interactive sudo prompts that block automation;
- raw credential file contents.

For plugin services, use the plugin's production source path under:

```text
/Users/example/path<plugin>
```

Current standard plugin targets are:

```text
codex-mobile-web -> /Users/example/path
email -> /Users/example/path
finance -> /Users/example/path
growth -> /Users/example/path
healthy -> /Users/example/path
moira -> /Users/example/path
music -> /Users/example/path
note -> /Users/example/path
wardrobe -> /Users/example/path
```

For Home AI app checks, use:

```text
/Users/example/path
```

## Required Production Validation

After production deployment, use the relevant platform checks:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --json
```

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --json
```

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path
```

Plugin-specific production validation must add:

- service health/version;
- launchd status or service PID;
- plugin data readback;
- MCP service schema when applicable;
- Gateway selected-profile callable schema when MCP tools changed;
- mobile visual/Appium smoke when embedded UI or mobile gestures changed.

## Future Restricted Sudo Target

The current password-based sudo path is a bootstrap mechanism. The preferred
long-term production model is:

- SSH key authentication for the control user;
- restricted sudoers entries for deployment and validation commands only;
- no broad interactive sudo for ordinary plugin deployments;
- separate read-only validation commands where possible;
- explicit root escalation only for launchd, ownership, ACL, and production
  migration operations.

Candidate sudoers scope:

```text
launchctl print/kickstart/bootout/bootstrap for Home AI labels
rsync or install into /Users/example/path and plugins
chown/chmod/chmod +a under /Users/example/path
Home AI pinned Node validation scripts under app/scripts
```

Do not implement restricted sudoers until the command list is reviewed against
the current deployment scripts. A too-broad sudoers rule defeats the isolation
model.

## Failure Classification

- SSH alias missing:
  - repair Windows SSH config, not a plugin repository.
- SSH key denied:
  - repair key authorization or fall back to the current approved temporary
    credential path.
- `sudo -n true` fails:
  - passwordless sudo is not configured; use stdin/password-file flow.
- `sudo node` fails:
  - use the absolute pinned Node path.
- launchd operation fails:
  - inspect label, scope, and root path with bounded `launchctl print`.
- production validation fails because a plugin key is missing:
  - repair plugin provisioning for the selected workspace; do not fall back to
    Owner credentials.
- Gateway schema probe uses the wrong profile root:
  - invalid evidence; rerun with the selected worker profile root.
