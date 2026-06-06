# macOS Production Access

Last updated: 2026-06-06.

## Purpose

This runbook defines the shared Home AI access path for Mac Studio production.
It is used by the Home AI main workspace and by plugin workspaces. Plugin
projects must not each invent their own SSH, sudo, password, or deployment
access flow.

This runbook records credential locations and access mechanics only by
reference. It must not contain raw passwords, SSH private key contents, access
keys, tokens, cookies, launch tokens, or one-time approval state.

## Current Production Host

Current Mac Studio production facts:

```text
LAN host: 192.168.10.110
Tailnet HTTPS: <tailnet-https-origin>
Default SSH user: <mac-admin-user>
Production root: /Users/hermes-host/HermesMobile
Production app: /Users/hermes-host/HermesMobile/app
Production data: /Users/hermes-host/HermesMobile/data
Production plugins: /Users/hermes-host/HermesMobile/plugins
Listener URL on Mac loopback: http://127.0.0.1:8797
Listener launchd label: com.hermesmobile.listener
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

## Sudo Access

Some production checks require `sudo` because live services run under
`hermes-host`, `hm-*` workspace users, and system LaunchDaemons.

Allowed current pattern:

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
command wrapper that feeds the password through stdin. Do not embed the password
in the command line. Command lines can be captured by process lists, shell
history, logs, or terminal transcripts.

Example safe shape:

```powershell
Get-Content -Raw $env:HOMEAI_MAC_SUDO_PASSWORD_FILE |
  ssh homeai-mac "sudo -S /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js --json"
```

The environment variable name is the durable interface:

```text
HOMEAI_MAC_SUDO_PASSWORD_FILE
```

The password file path is user-local secret storage. It may be provided by the
operator at runtime; it should not be copied into plugin repositories. Scripts
should accept `--password-file` where a non-interactive Windows-to-Mac flow is
required.

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
/Users/hermes-host/HermesMobile/runtime/node-current/bin/node
```

Examples:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js \
  --json
```

```bash
sudo launchctl print system/com.hermesmobile.listener
```

```bash
sudo launchctl kickstart -k system/com.hermesmobile.listener
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
- If a command needs `cd /Users/hermes-host/HermesMobile/app`, put the `cd` and
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

## Plugin Deployment Access

Plugin deployment scripts should expose one shared access interface:

```text
--ssh-alias homeai-mac
--password-file <private-local-password-file>
--mac-root /Users/hermes-host/HermesMobile
```

They should not hard-code:

- raw password values;
- per-plugin SSH aliases;
- per-plugin private keys;
- interactive sudo prompts that block automation;
- raw credential file contents.

For plugin services, use the plugin's production source path under:

```text
/Users/hermes-host/HermesMobile/plugins/<plugin>
```

For Home AI app checks, use:

```text
/Users/hermes-host/HermesMobile/app
```

## Required Production Validation

After production deployment, use the relevant platform checks:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js \
  --json
```

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-production-profile-audit.js \
  --root /Users/hermes-host/HermesMobile \
  --json
```

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-worker-filesystem-access-harness.js \
  --root /Users/hermes-host/HermesMobile
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
rsync or install into /Users/hermes-host/HermesMobile/app and plugins
chown/chmod/chmod +a under /Users/hermes-host/HermesMobile
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
