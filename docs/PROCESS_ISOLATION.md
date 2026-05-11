# Process Isolation

Hermes Mobile has two isolation layers:

1. Server-side capability boundary. The HTTP server hardens every model run's `access_policy_context`, blocks protected paths, filters shared-directory roots, filters automation deliverables, and rejects product/source maintenance prompts before they reach a Hermes Gateway.
2. Operating-system process boundary. Production should run from a packaged runtime directory with a low-privilege service account. The development checkout, operator home secrets, and official Hermes source checkout should not be readable by model worker processes.

The first layer is cross-platform and always active. The second layer is deployment work and must be applied per OS.

## Protected By Default

The security boundary treats these as protected:

- Hermes Mobile source and static directories.
- Local config directories.
- Owner/workspace key files.
- Runtime config, SQLite DB, JSON state, access-key store, shared-directory store, Web Push VAPID file, and ingress key files.
- Hermes API key files and Hermes `.env` / config / worker-pool manifest paths.
- OAuth/token files used only for non-secret integration detection.
- The configured Hermes home and update-sandbox roots.

Safe exceptions are limited to user data or generated artifacts:

- Owner drive root.
- `artifacts`, `uploads`, and group-delivery artifact roots under the data directory.
- CRON output and run-log roots configured for Automation deliverables.

Do not add broad roots such as a home directory, `Documents`, a source checkout parent, or the whole runtime data directory to model access. Add the narrow user-data subdirectory instead.

## Environment Overrides

Use these only when a deployment has a different layout:

- `HERMES_MOBILE_SECURITY_PROTECTED_ROOTS`
- `HERMES_MOBILE_SECURITY_PROTECTED_FILES`
- `HERMES_MOBILE_SECURITY_ALLOWED_EXCEPTIONS`
- Compatibility aliases: `HERMES_WEB_SECURITY_PROTECTED_ROOTS`, `HERMES_WEB_SECURITY_PROTECTED_FILES`, `HERMES_WEB_SECURITY_ALLOWED_EXCEPTIONS`

Developer bypasses are intentionally explicit:

- `HERMES_MOBILE_SECURITY_ALLOW_UNRESTRICTED=1`
- `HERMES_MOBILE_SECURITY_ALLOW_DEVELOPER_TOOLSETS=1`

Do not enable those in a shared or public-facing production listener.

## Recommended Production Layout

Use separate locations for source, runtime package, and mutable data:

- Source checkout: readable by the operator/developer account only.
- Runtime package: a clean tracked-file export or release artifact, readable by the Hermes Mobile service account.
- Mutable data: writable by the Hermes Mobile service account.
- Official Hermes Gateway profiles: run under their own constrained user/profile and receive only per-run access policies from Hermes Mobile.

This prevents a model task from editing product code even if a user asks for it inside Hermes Mobile.

## Windows

Use a dedicated local user such as `HermesMobileWorker`.

Suggested layout:

- Runtime package: `C:\ProgramData\HermesMobile\app`
- Mutable data: `C:\ProgramData\HermesMobile\data`
- Logs: `C:\ProgramData\HermesMobile\logs`
- Worker temp: a writable directory under the mutable data root, for example `C:\ProgramData\HermesMobile\data\temp`

Prepare with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-process-isolation.ps1 -Apply -CreateUser -GeneratePassword -RuntimeDir "C:\ProgramData\HermesMobile\app" -DataDir "C:\ProgramData\HermesMobile\data" -LogDir "C:\ProgramData\HermesMobile\logs" -SourceDir "<developer checkout>"
```

The script is dry-run by default. `-Apply` requires an elevated shell. `-GeneratePassword` stores a DPAPI-protected credential file for the current Windows user so the raw password is not printed.

Do not run production directly from the development checkout if the goal is OS-level source isolation. Copy a clean runtime package first, then run the listener from that package.

After each runtime package refresh, run the preparation script again from an elevated shell so the recreated package gets the intended ACLs:

```powershell
npm run package:runtime -- --out "C:\ProgramData\HermesMobile\app" --force --allow-dirty
npm install --prefix "C:\ProgramData\HermesMobile\app" --omit=dev --no-audit --no-fund
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\prepare-process-isolation.ps1 -Apply -RuntimeDir "C:\ProgramData\HermesMobile\app" -DataDir "C:\ProgramData\HermesMobile\data" -LogDir "C:\ProgramData\HermesMobile\logs"
```

The script refuses broad source-like data directories such as a full workspace root that contains `.agent-context`, `configs`, `scripts`, `server.js`, or `package.json`. Grant only the narrow mutable runtime data directory.

When starting Hermes Mobile through `scripts/start-worker-host.ps1`, set or let
the launcher create `TEMP` / `TMP` under the mutable data root. Do not let the
low-privilege listener inherit the operator account's temp directory; SQLite and
other libraries may create temporary files during writes.

Gateway process isolation should be at least as strict as the Mobile listener.
If a deployment uses WSL on Windows, a Linux-only user inside the operator's WSL
distro is not a sufficient boundary for Windows-mounted files. Use a WSL distro
owned by the low-privilege Windows account, or another OS/container boundary
that prevents model worker processes from reading the developer checkout and
Agent workspace. Label those workers as `securityLevel=user` in the Gateway Pool
manifest. Keep broader operator-owned workers labeled `owner-maintenance`.

For every low-privilege Gateway profile, set a narrow `platform_toolsets.api_server`
list. Do not rely on the Gateway's default API-server toolset for user workers,
because a deployment default may include terminal, code execution, delegation, or
automation-management tools. Hermes Mobile also sends an explicit safe
`allowed_toolsets` list per ordinary run, but the profile toolset should be a
second boundary. The low-permission `file` capability is limited by
`access_policy_context` roots; it must not expose source checkouts, runtime
state, worker manifests, or secret files. The low-permission `vision` capability
is limited to OCR, document-image extraction, and visual analysis of in-scope
files. If the profile exposes `skills`, it should resolve to the current
account/workspace's profile-local Skill store plus approved shared Skills only,
not to another account's store or an Owner full store.

## macOS

Use a dedicated service user, for example `_hermesmobile`, and launch with `launchd`.

Suggested layout:

- Runtime package: `/Library/Application Support/HermesMobile/app`
- Mutable data: `/Library/Application Support/HermesMobile/data`
- Logs: `/Library/Logs/HermesMobile`

Prepare with:

```bash
sudo scripts/prepare-process-isolation.sh --apply --user _hermesmobile --runtime-dir "/Library/Application Support/HermesMobile/app" --data-dir "/Library/Application Support/HermesMobile/data" --log-dir "/Library/Logs/HermesMobile" --source-dir "<developer checkout>"
```

The script creates directories and prints the `launchd` ownership model. It does not write a launchd plist automatically because that plist usually needs deployment-specific Node paths, Gateway URLs, and key-file paths.

## Linux

Use a system user such as `hermes-mobile` and a `systemd` service.

Suggested layout:

- Runtime package: `/opt/hermes-mobile/app`
- Mutable data: `/var/lib/hermes-mobile`
- Logs: `/var/log/hermes-mobile`

Prepare with:

```bash
sudo scripts/prepare-process-isolation.sh --apply --user hermes-mobile --runtime-dir /opt/hermes-mobile/app --data-dir /var/lib/hermes-mobile --log-dir /var/log/hermes-mobile --source-dir "<developer checkout>"
```

## Validation

Before cutover:

1. Run `npm run productization:check` in the source checkout.
2. Create a clean runtime export or package.
3. Start Hermes Mobile from the runtime package with the low-privilege account.
4. Confirm `/api/status` is healthy.
5. Submit a model run that tries to access the source checkout; it must be rejected or receive no protected roots.
6. Confirm normal user-data tasks, directory preview, Todo, Automation deliverable preview, and Web Push still work.

Rollback is to stop the isolated listener and restart the previous listener/launcher against the existing data backup.
