# Module: Deployment And Production Operations

## Production Paths

- Source checkout: local Hermes Mobile source checkout, for example `C:\Path\To\HermesMobile`
- Production app: `C:\ProgramData\HermesMobile\app`
- Production data: `C:\ProgramData\HermesMobile\data`
- Backups: `C:\ProgramData\HermesMobile\backups`
- Listener HTTP: `http://127.0.0.1:8797`
- Bridge host: `http://127.0.0.1:8798`
- Local port identity guard: `http://127.0.0.1:8787` is Codex Mobile Web, not
  Hermes Mobile. Do not discover the Hermes origin by trying common ports or
  the first listening Node process; use the configured Hermes listener above
  and prove origin identity with Hermes-specific `/api/public-config` or app
  shell markers before smoke tests.

## Windows Native Runtime

As of 2026-06-07, the maintained Windows runtime no longer keeps WSL resident
for local Home AI services. Windows-local production/development uses native
Node and native Python processes:

- listener: `C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1`
  launches `C:\ProgramData\HermesMobile\app\server.js` on `8797`;
- bridge host: `C:\ProgramData\HermesMobile\start-worker-host.ps1` launches
  `scripts\bridge-host.js` on `8798` and sets
  `HERMES_MOBILE_BRIDGE_PYTHON_MODE=windows-native`;
- Gateway profile cold starts use
  `scripts\start-windows-native-gateway-profile.ps1` and the official Hermes
  source under `C:\ProgramData\HermesMobile\gateway-worker\native-runtime`;
- Whisper large v3 Turbo uses
  `scripts\start-whisper-large-v3-turbo-windows.ps1` and a native venv under
  `C:\ProgramData\HermesMobile\services\whisper-large-v3-turbo\.venv-windows`;
- Weixin mobile ingress uses
  `scripts\start-weixin-mobile-ingress-bridge-windows.ps1`;
- CRON sidecar uses `scripts\start-cron-tick-sidecar.ps1` with
  `HERMES_MOBILE_CRON_TICK_SIDE=windows-native`;
- Kanban-backed Todo compatibility uses
  `scripts\run-kanban-native-windows.ps1` with
  `HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE=native`.

The Windows logon task `Hermes Web Listener User Logon` must not pass
`BridgeWslUser`, `DistroName`, `/home/<user>`, or `Ubuntu-*` arguments. The retired
`Hermes Gateway WSL` task was exported into the WSL downline backup and then
unregistered. `Hermes Mobile Gateway Pool` and
`Hermes Mobile Maintenance Gateway Watchdog` remain disabled because on-demand
Gateway startup is now owned by the native profile launcher.

Acceptance for a Windows native cutover:

- a backup exists under `C:\ProgramData\HermesMobile\backups`;
- `Get-Process wsl,wslhost,wslrelay,vmmemWSL` returns no running processes;
- ports `8001`, `8797`, and `8798` are owned by Windows `python3.13.exe` or
  `node.exe`, not `wslrelay.exe`;
- `node scripts\production-status-smoke.js --access-key-file <file>
  --base http://127.0.0.1:8797 --expected-version <version> --json` passes;
- `/api/status?detail=1` shows `ownerMinWarm=0`, `workspaceMinWarm=0`, and
  `idleTtlMs=60000` for the maintained cold-start configuration;
- `scripts\start-weixin-mobile-ingress-bridge-windows.ps1 -CheckOnly` passes;
- `http://127.0.0.1:8001/health` reports `large-v3-turbo`, `cpu`, and `int8`;
- scheduled task actions do not contain WSL arguments except in archived
  backups.

## macOS Production Direction

The next preferred stable production target is Mac Studio. The detailed design
is `docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md`.
Shared SSH, sudo, password-file, and plugin access rules are centralized in
`docs/RUNBOOKS/macos-production-access.md`; plugin workspaces must reference
that runbook instead of defining their own production access flow.
The shared Mac development-to-production deployment contract is
`docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`.
Home AI and all plugin projects must follow that contract: development work
happens under `/Users/hermes-dev/HermesMobileDev`, production writes happen only
through a bounded deploy operation with backup, controlled sync, restart
decision, and production validation, and the development user must not be given
ordinary write access to production app or plugin source roots.
The shared script is `scripts/deploy-macos-production.js`. It is plan-only by
default and requires `--execute` before it writes production.
For every non-`--sync-only` Home AI or plugin deployment, the shared script also
runs a focused `codex-auth-profile-audit` gate after restart/health checks. The
gate reads `scripts/macos-production-profile-audit.js --expected-workspaces
owner --json --no-strict` and fails the deploy only on `codex_auth_*` issues,
so unrelated plugin-binding diagnostics do not mask or silently skip Codex auth
drift.
Normal source deploys must preserve production-owned runtime dependency
directories. The shared script excludes `.venv/`, `node_modules/`, plugin
`data/`, and other runtime/local state from source-to-production rsync so a
Python plugin LaunchDaemon interpreter cannot be deleted by a code deploy.
Backup rsync uses a narrower exclude list for local tooling metadata such as
`.git`, `.codex`, `.codegraph`, and `.agent-context`; it must not omit
production-owned plugin `data/`, `runtime/`, or `.venv/` directories from the
pre-deploy backup.
Codex Mobile Web is a special plugin target because its LaunchDaemon runs as
`xuxin` while most production roots are owned by `hermes-host`. The central
deploy script now includes a Codex-only post-sync repair that keeps the service
stdout/stderr under `/Users/xuxin/.codex-mobile-web/logs`, updates the
`com.hermesmobile.plugin.codex-mobile` LaunchDaemon `StandardOutPath` and
`StandardErrorPath`, and reloads that LaunchDaemon during deploy. This prevents
launchd `EX_CONFIG` failures if the shared production log directory or files
under `/Users/hermes-host/HermesMobile/logs` later return to `hermes-host`
ownership while Codex Mobile is running.

Key decisions:

- macOS is Darwin/BSD Unix, not Linux. Use `launchd`, explicit paths, and
  macOS users instead of systemd/WSL assumptions.
- Windows remains the fast-iteration development machine until the Mac runtime
  is validated.
- Mac Studio should become the stable Hermes Mobile production host for family
  use after first-start preflight and workspace-isolation harnesses pass.
- NAS remains storage, backup, archive, and cold-data infrastructure rather
  than the primary compute host.
- Mac production should use OS-level workspace isolation: a host/control user
  such as `hermes-host`, plus workspace users such as `hm-owner`,
  `hm-wuping`, `hm-stephen`, and `hm-xuyan`.
- Gateway workers and MCP wrappers must run as the effective workspace OS user
  so non-Owner model/tool execution cannot directly read Owner files, Skill
  Store, Memory Store, or plugin keys.
- Plugin services may remain shared multi-tenant app services. Hermes Mobile
  must still enter every plugin through workspace-local `.hermes-<plugin>`
  config/key material and `--no-workspace-override` MCP wrappers.
- Mac deployments support explicit network modes:
  - `HERMES_MOBILE_NETWORK_MODE=direct` when the Mac's router/default gateway
    provides model-provider egress;
  - `HERMES_MOBILE_NETWORK_MODE=proxy` when per-process proxy env is required.
- CRON model jobs must prove model network egress according to the selected
  mode. In direct mode, no proxy is required; in proxy mode, missing/unreachable
  proxy remains fail-closed before official `cron.scheduler.run_job()`.

Do not treat the Mac plan as fully closed until a Mac-specific installer,
launchd services, first-start preflight, Gateway validation, and workspace
isolation harness exist.

### Current Mac Studio Production State

As of 2026-06-05, Mac Studio is the Home AI production host for Web/data/plugin
serving and model-turn execution at `http://192.168.10.110:8797/`. It is also
reachable inside the tailnet at the configured `<tailnet-https-origin>`.
After the workspace-isolation cutover, the live production root is the
`hermes-host` root below. The previous user-level `/Users/<mac-admin-user>/HermesMobile`
root remains source/rollback material and must not be treated as the live
service root.

- Host: `<mac-admin-user>@192.168.10.110`
- Hostname: `xuxindeMac-Studio.local`
- macOS: `26.4`, arm64
- Deployment root: `/Users/hermes-host/HermesMobile`
- App path: `/Users/hermes-host/HermesMobile/app`
- Data path: `/Users/hermes-host/HermesMobile/data`
- Plugin root: `/Users/hermes-host/HermesMobile/plugins`
- Logs: `/Users/hermes-host/HermesMobile/logs`
- launchd scope: system LaunchDaemons
- Listener launchd label: `com.hermesmobile.listener`
- Automation cron tick launchd label: `com.hermesmobile.cron`
- Host voice input ASR launchd label:
  `com.hermesmobile.whisper-large-v3-turbo`. Install or repair it with
  `node scripts/install-macos-whisper-large-v3-turbo-service.js --execute`.
  Optional comparison engines use independent labels:
  `com.hermesmobile.funasr-local` on port `8002` and
  `com.hermesmobile.sensevoice-local` on port `8003`. Install or repair them
  with `node scripts/install-macos-local-asr-service.js --engine funasr --execute`
  and `node scripts/install-macos-local-asr-service.js --engine sensevoice --execute`.
  They are comparison candidates only until the voice-input provider is
  explicitly configured to use them.
  On Apple Silicon Mac production the service runs with `WHISPER_ENGINE=auto`
  and prefers the offline MLX model directory
  `/Users/hermes-host/HermesMobile/services/whisper-large-v3-turbo/models/mlx-community-whisper-large-v3-turbo`
  when it contains `weights.safetensors`. This is the maintained fast path for
  local `large-v3-turbo` transcription on Mac. If the MLX model or dependencies
  are unavailable, the service falls back to the offline CTranslate2 directory
  `/Users/hermes-host/HermesMobile/services/whisper-large-v3-turbo/models/mobiuslabsgmbh-faster-whisper-large-v3-turbo`
  when it contains `model.bin`. If HuggingFace runtime download is blocked,
  prefetch the required MLX files (`config.json`, `configuration.json`, and
  `weights.safetensors`) or fallback faster-whisper files (`config.json`,
  `preprocessor_config.json`, `tokenizer.json`, `vocabulary.json`, and
  `model.bin`) from a trusted mirror such as ModelScope before starting the
  service.
  The Home AI listener gets `HERMES_MOBILE_VOICE_INPUT_*` / `HERMES_WEB_VOICE_INPUT_*`
  ASR environment variables from the central Mac deploy script, pointing to
  FunASR at `http://127.0.0.1:8002/v1/audio/transcriptions` by default.
- Node runtime: `/Users/hermes-host/HermesMobile/runtime/node-current`
- Official Hermes release runtime:
  `/Users/hermes-host/HermesMobile/runtime/hermes-agent-official`
- Official Hermes release: `v2026.5.29.2` / `hermes-agent 0.15.2`
- Mac Gateway Pool manifest:
  `/Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json`
- Mac Automation CRON runs official Hermes with
  `/Users/hermes-host/HermesMobile/data/hermes-home` as `HERMES_HOME`. The
  central Home AI deploy script maintains
  `/Users/hermes-host/HermesMobile/data/hermes-home/profiles/<profile>` as
  symlinks to enabled user Gateway profile directories discovered from the Mac
  Gateway Pool manifest. It grants `hermes-host` read/traverse ACLs on the
  referenced profile directories so official CRON can load the existing
  workspace provider, Skill, and MCP configuration. It must not copy
  `auth.json`, `config.yaml`, OAuth state, or other private profile files into
  the scheduler home.
- Mac Gateway workers: only the required warm baseline should remain
  always-on. Current hybrid policy keeps the Owner OpenAI/Codex baseline warm;
  other `hm-*`, DeepSeek, and maintenance candidates are launchd-loaded cold
  candidates that may start on demand and must cool down after the configured
  idle TTL.
- Mac Gateway workers run as isolated OS users with workspace roots such as
  `/Users/hm-owner/HermesWorkspace`, but Home AI run policy uses live data
  paths such as `/Users/hermes-host/HermesMobile/data/drive`. The macOS ACL
  layer must therefore allow each worker user to traverse the live root and
  read/write only the live data roots authorized for that worker. Otherwise the
  Gateway file tool can return `Permission denied` or `Path not found` even
  when `access_policy_context.allowed_roots` is correct.
- Mac worker filesystem access harness:
  `scripts/macos-worker-filesystem-access-harness.js`. Run it on Mac
  production with the pinned Node runtime after deployment, data migration,
  worker-user creation, ACL repair, or workspace-isolation changes:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-worker-filesystem-access-harness.js --root /Users/hermes-host/HermesMobile`.
  The pass condition is not only positive read/write access for each workspace
  worker. The harness must also prove cross-user deny checks for Owner
  Skill/Memory stores, other users' drive roots, and `.hermes-*` plugin private
  directories. Do not leave workspace-private roots as `drwxr-xr-x+`; remove
  default group/other access and grant only `hermes-host`, the matching
  workspace OS user, and Owner operations.
  See `docs/RUNBOOKS/macos-worker-filesystem-access.md`.
- Workspace onboarding now has a Home AI service/API layer:
  `adapters/workspace-onboarding-service.js` and
  `server-routes/workspace-onboarding-api-routes.js`. The service can generate
  a dry-run plan and, when a restricted macOS provisioning executor is injected,
  orchestrate workspace record creation, one-time Home AI Access Key creation,
  Gateway profile provisioning, selected plugin grants, and validation. The
  current production wiring intentionally does not expose arbitrary sudo or
  shell. `adapters/workspace-system-provisioning-executor-service.js` provides
  the allowlisted macOS executor for `hm-*` user creation, private roots, ACL
  repair, manifest metadata repair, Gateway profile/start-script materializing,
  and cold LaunchDaemon loading. The listener injects it only when
  `HERMES_MOBILE_WORKSPACE_SYSTEM_EXECUTOR_ENABLED=1` or
  `HERMES_WEB_WORKSPACE_SYSTEM_EXECUTOR_ENABLED=1` is set. Because the Mac
  production listener runs as `hermes-host`, production privileged execution
  should use `scripts/workspace-system-provisioning-helper.js` as a root
  LaunchDaemon and set
  `HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET=/Users/hermes-host/HermesMobile/data/run/workspace-system-provisioning-helper.sock`
  in the listener environment. The helper socket client is
  `adapters/workspace-system-provisioning-helper-client-service.js`. Without a
  configured `workspaceSystemProvisioningExecutor`, apply returns
  `system_provisioning_executor_unavailable` before side effects. See
  `docs/IMPLEMENTATION_NOTES/workspace-onboarding.md`.
- Mac profile/Skill/Memory/MCP audit:
  `scripts/macos-production-profile-audit.js`. Run it after user migration,
  plugin provisioning, worker profile repair, stale-user cleanup, or Access Key
  rotation:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-profile-audit.js --root /Users/hermes-host/HermesMobile --json`.
  Passing production output must have `ok=true`, empty `issues`, no blocking
  `warnings`, the expected active workspace keys, the shared Response baseline,
  complete required Wardrobe Skill bundles for workspaces that require
  Wardrobe, Owner Wardrobe Skill-only required-gate coverage even when the
  plugin authorization table omits `wardrobe`, and profile `skills`/`memories`
  links whose realpath resolves to the matching
  `data/skill-profiles/<profileId>` store. For `openai-codex` workers it also
  verifies profile-local `auth.json` and `auth.lock` are shared-auth symlinks
  and that the worker user can read/write both targets; drift is reported as
  `codex_auth_*` issues. On macOS it also verifies every
  enabled manifest worker's system LaunchDaemon is loaded.
  `launchd_service_not_loaded:<profile>` means the worker can exist in the
  manifest and have a plist file while still failing cold-start with
  `Could not find service ...`. The audit reads only bounded metadata and must
  not print key contents, token contents, plugin access-key values, or raw
  prompts.
- Mac production closure validation:
  `scripts/macos-production-closure-validation.js`. Run it after Mac
  deployment, data migration, Gateway/Profile repair, plugin provisioning,
  Weixin route repair, ACL repair, or before declaring Mac production closed:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js --json`.
  The aggregate harness reads the expected static client version from the live
  app shell by default and passes it as `--expected-version` to every checked
  `production-status-smoke.js` invocation. Operators may pass
  `--expected-version <version>` only for an explicitly reviewed app path.
  It composes the checked status, profile audit, ACL, native MCP schema,
  plugin delivery-directory, all-workspace directory-bound topic previews,
  Wardrobe binding/proxy content, DeepSeek user/maintenance, Weixin heartbeat,
  Owner/OpenAI concurrent product-route, and final-status smokes. Passing output must have top-level
  `ok=true`, `activeGlobal=0` before and after, zero profile issues and zero
  blocking profile warnings,
  zero ACL failures, plugin delivery-directory creation/preview passing for
  every active workspace, directory-bound topics passing both path-only and
  UI-route preview smokes for every active workspace, Wardrobe manifest `programApi.origin` on Mac loopback
  with a launched proxied entry and positive bounded bootstrap content for the
  checked workspace, served `clientVersion` matching the expected app-shell
  version before and after the run, expected DeepSeek profiles, wrong browser/API auth
  header denied with `401`, and no OAuth re-auth process. Grok/xAI remains a deferred
  manual OAuth follow-up and is not part of this default closure gate.
  See `docs/RUNBOOKS/macos-production-closure-validation.md`.
- Mac plugin delivery-directory smoke:
  `scripts/macos-plugin-directory-production-smoke.js`. Run it after Mac data
  migration, workspace catalog path repair, local workspace rename, directory
  ACL repair, or plugin-topic delivery failure:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-plugin-directory-production-smoke.js --root /Users/hermes-host/HermesMobile --base http://127.0.0.1:8797 --json`.
  It must report bounded metadata only. It catches workspace catalog paths that
  still point at Windows or WSL drive prefixes such as
  `C:\ProgramData\HermesMobile\data\drive` or
  `/mnt/c/ProgramData/HermesMobile/data/drive`, as well as macOS ownership/ACL
  failures that surface as directory `404` or `500` responses.
- Mac bound-directory preview smoke:
  `scripts/macos-bound-directory-preview-smoke.js`. Run it after Mac data
  migration, shared-directory repair, directory-topic UI routing changes, or
  reports that directory-topic chips show `Directory not found or not allowed`:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-bound-directory-preview-smoke.js --root /Users/hermes-host/HermesMobile --all-workspaces --simulate-ui-route --json`.
  The aggregate Mac closure harness now runs both path-only and
  `--simulate-ui-route` forms by default. The focused local harness is
  `node tests\macos-bound-directory-preview-smoke-harness.test.js`.
- Mac directory path migration repair:
  `scripts/macos-directory-path-migration-repair.js`. Run it after a
  Windows/WSL-to-Mac data copy when existing directory-topic chips or artifact
  cards still point at legacy drive prefixes:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js --root /Users/hermes-host/HermesMobile --json`.
  Dry-run is the default. The checked local harness is
  `node tests\macos-directory-path-migration-repair.test.js`. Before writing,
  prefer `activeGlobal=0`; after writing, rerun dry-run and restart
  `system/com.hermesmobile.listener` if artifact cards or already-loaded topic
  state were affected. See
  `docs/RUNBOOKS/macos-directory-path-migration-repair.md`.
- Mac Wardrobe binding smoke:
  `scripts/macos-wardrobe-binding-production-smoke.js`. Run it after Mac
  listener launchd edits, Wardrobe plugin data migration, Wardrobe workspace
  authorization/key repair, or a report that an embedded Wardrobe plugin opens
  but shows no content:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-wardrobe-binding-production-smoke.js --root /Users/hermes-host/HermesMobile --base http://127.0.0.1:8797 --json`.
  It scans live drive `.hermes-wardrobe/config.json` files for stale legacy
  Wardrobe origins, verifies the Home manifest launches through
  `http://127.0.0.1:8765`, opens the same-origin proxy entry, and reads only
  bounded bootstrap counts. It must not print raw keys, key paths, launch
  tokens, or item details.
- Shared Windows SSH aliases for all local workspaces and plugin projects:
  `homeai-mac`, `homeai-macstudio-prod`, and `macstudio-110`
- Shared Windows SSH identity:
  `%USERPROFILE%\.ssh\homeai_macstudio_prod_ed25519`
- Tailscale node DNS: `<tailnet-magicdns-host>.`
- Tailscale Serve: tailnet-only HTTPS `<tailnet-https-origin>`
  proxies `/` to `http://127.0.0.1:8797`.
- Tailscale certificate files:
  `/Users/hermes-host/HermesMobile/config/tailscale-cert/<tailnet-cert-name>.crt`
  and
  `/Users/hermes-host/HermesMobile/config/tailscale-cert/<tailnet-cert-name>.key`.
  The key is owned by `hermes-host` and must remain mode `0600`. Do not record
  PEM contents in docs, handoffs, logs, screenshots, or harness output.
- Tailscale CLI path on the Mac:
  `/Applications/Tailscale.app/Contents/MacOS/Tailscale`. On this Mac,
  `tailscale cert --cert-file <path> --key-file <path>` cannot write directly
  to arbitrary paths because the app CLI receives `operation not permitted`.
  Use `--cert-file - --key-file -` with shell-side redirection/splitting when
  renewing certificate files.

The current isolated production deployment runs these launchd labels:

- `com.hermesmobile.listener`
- `com.hermesmobile.cron`
- `com.hermesmobile.gateway.hm-*.openai.1` for the six warm workspace workers
- `com.hermesmobile.plugin.wardrobe`
- `com.hermesmobile.plugin.finance`
- `com.hermesmobile.plugin.email`
- `com.hermesmobile.plugin.health`
- `com.hermesmobile.plugin.note`
- `com.hermesmobile.plugin.growth`
- `com.hermesmobile.plugin.moira`
- `com.hermesmobile.plugin.codex-mobile`

For the Home AI target, the central deploy script manages both the web listener
and the Automation cron tick service. A full Home AI deploy installs or refreshes
`/Library/LaunchDaemons/com.hermesmobile.cron.plist`, ensures
`/Users/hermes-host/HermesMobile/data/hermes-home/cron/jobs.json` exists as the
canonical Hermes CRON store, starts the dispatcher every 60 seconds with
`scripts/hermes-mobile-cron-dispatcher.py --dispatch`, sets
`HERMES_CRON_SCRIPT_TIMEOUT=1800` for long-running `no_agent` scripts, and
validates both `system/com.hermesmobile.listener` and
`system/com.hermesmobile.cron`.

The central deploy script can plan or execute all known plugin service roots
with `npm run --silent deploy:macos -- --plugin all --json`. The all-plugin
target expands to Codex Mobile Web, Email, Finance, Growth, Healthy/Health,
Moira, Note, and Wardrobe, with one restart label and one loopback manifest
smoke per plugin. The user-facing `health` alias resolves to the historical
`healthy` source and production directory.

Public setup source locations are declared in
`config/public-plugin-sources.json`. The manifest maps the public Home AI repo
and each public plugin repo to the local source directory, deployment label,
and loopback manifest smoke URL. Public installers must use those HTTPS GitHub
URLs to clone or update source before invoking `scripts/deploy-macos-production.js`.
The deploy script itself continues to require local source directories.

Growth first install uses `scripts/install-growth-launchd-service.js` from the
Home AI app workspace. The script generates the
`com.hermesmobile.plugin.growth` LaunchDaemon, creates the Growth registration
key file only when missing, and injects secrets by file path:
`GROWTH_REGISTRATION_KEY_PATH` and `GROWTH_HOME_AI_ACCESS_KEY_PATH`. It must be
run through the same password-file sudo boundary as the central deploy script
and must not print raw key values.
The LaunchDaemon sets `GROWTH_DATA_OWNER=plugin` and
`GROWTH_LEARNING_DB_PATH=/Users/hermes-host/HermesMobile/plugins/growth/data/growth-learning.sqlite3`,
plus `GROWTH_LEGACY_AUDIO_ROOTS=/Users/hermes-host/HermesMobile/data` for
bounded historical audio playback,
so first install must also import or roll back the plugin-owned SQLite copy
before declaring production closure.
When Growth card authoring is enabled, pass the Gateway Responses boundary to
the installer with `--gateway-authoring-endpoint`,
`--gateway-authoring-access-token-path`, and
`--gateway-authoring-protocol responses`. The token path must point to a
server-side Gateway worker secret file; do not put raw token values in the
plist or deployment logs.
After SQLite import, run the Growth plugin `backfill:audio-blobs` dry-run and
then `--write` only after an online SQLite backup exists; this moves historical
submission/reflection audio into `learning_task_audio_blobs` so playback is
plugin-owned instead of artifact-file dependent.
The Home AI listener LaunchDaemon must also expose the server-side Growth
registration path so plugin-manager grants can call the Growth registration
endpoint without raw secrets:
`HERMES_MOBILE_GROWTH_PLUGIN_MANIFEST_URL=http://127.0.0.1:4881/api/v1/hermes/plugin/manifest`,
`HERMES_MOBILE_PLUGIN_GROWTH_MANIFEST_URL=http://127.0.0.1:4881/api/v1/hermes/plugin/manifest`,
and
`HERMES_MOBILE_GROWTH_PLUGIN_OWNER_KEY_PATH=/Users/hermes-host/HermesMobile/data/plugin-secrets/growth-registration-key.txt`.

Because the Growth launchd label does not exist before first install, the
first source copy uses the central deploy script with explicit plugin
`--sync-only`:

```bash
npm run --silent deploy:macos -- --plugin growth --source /Users/hermes-dev/HermesMobileDev/plugins/growth --restart none --sync-only --execute --password-file <private-local-password-file> --json
```

`--sync-only` is not a deployment closure. It exists only to place plugin source
under the production plugin root before the LaunchDaemon is bootstrapped. The
install is not complete until the Growth LaunchDaemon is bootstrapped,
plugin-owned SQLite readback passes, the Home AI listener has the Growth
manifest/key-path environment above, and loopback health, embedded launch/proxy,
and selected Gateway `mcp_growth_*` schema smoke pass.

Moira first install uses `scripts/install-moira-launchd-service.js` from the
Home AI app workspace after a central `--plugin moira --sync-only` source copy.
The script generates `com.hermesmobile.plugin.moira`, runs the plugin service
from `/Users/hermes-host/HermesMobile/plugins/moira`, binds to
`127.0.0.1:4174`, and sets only bounded values such as
`MOIRA_PLUGIN_BASE_URL`, `MOIRA_HERMES_OWNER_WORKSPACE_ID`, and
`MOIRA_HERMES_ALLOWED_WORKSPACES`. It does not create or print raw plugin keys.
The initial production scope is Owner-only; additional workspace access requires
an explicit Moira workspace key/binding.

The Hermes Mobile launchd environment uses
`HERMES_WEB_HOST=0.0.0.0`, `HERMES_WEB_PORT=8797`,
`HERMES_WEB_DATA_DIR=/Users/hermes-host/HermesMobile/data`,
`HERMES_MOBILE_DATA_DIR=/Users/hermes-host/HermesMobile/data`,
`HERMES_WEB_AUTH_KEY_PATH=/Users/hermes-host/HermesMobile/data/secrets/owner-web-key.secret`,
`HERMES_WEB_SERVICE_STORE=sqlite`, and
`HERMES_WEB_DB_PATH=/Users/hermes-host/HermesMobile/data/hermes-mobile.sqlite3`.
Gateway environment points to the workspace-aware Mac-native Gateway Pool:
`HERMES_WEB_GATEWAY_POOL_ENABLED=1`,
`HERMES_WEB_GATEWAY_POOL_MANIFEST=/Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json`,
`HERMES_MOBILE_GATEWAY_POOL_MANIFEST=/Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json`,
and
`HERMES_GATEWAY_POOL_MANIFEST_PATH=/Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json`.
Every enabled Mac manifest worker must also carry explicit
`telemetryStateDbPath` and `telemetryResponseStoreDbPath` values pointing at
that worker's real profile DBs under
`/Users/<hm-user>/HermesWorkspace/.hermes-gateway/profiles/<profile>/`. The
listener user `hermes-host` must have read-only ACL access to the profile DB,
WAL, SHM, and containing directories. Without these manifest fields and ACLs,
Gateway runs can complete normally but Hermes Mobile cannot enrich the message
usage from official Gateway `state.db` / `response_store.db`; the client will
show cached input as `Not reported` even when the model actually used cached
tokens. The checked repair entry is
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-gateway-telemetry-repair.js --root /Users/hermes-host/HermesMobile --write --grant-listener-read --json`.
The usage telemetry adapter also handles the official Gateway short-response-id
store format by using a unique 24-character response-id prefix fallback after
exact lookup fails. This fallback is intentionally narrow: ambiguous prefixes
leave usage unchanged instead of guessing.
Every enabled Mac manifest worker must also keep its `toolsets` projection in
sync with the worker profile config. Profile config `toolsets` are the
materialized capability source; manifest `toolsets` are what Mobile uses for
Gateway Pool filtering and wardrobe/file/weather pre-stream gates. After
profile materialization, plugin provisioning, manifest hand edits, or a Mac
data migration, run:
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-gateway-manifest-toolset-smoke.js --root /Users/hermes-host/HermesMobile --json`.
This smoke is read-only and must not print API keys, key paths, prompts, or
raw profile config bodies.
Hybrid Mac cold-start also requires the launchd listener environment to pass
`HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT` to the runtime config, pointing
at the Mac-native profile launcher under the live Gateway worker root. This is
not optional on macOS: if the variable is absent or dropped before
`GATEWAY_POOL_ELASTIC_CONFIG`, the worker launcher falls back to the Windows
PowerShell path and cold workers fail with a bounded `spawn powershell.exe
ENOENT` diagnostic. The focused source harness is
`node tests\mobile-runtime-environment-service.test.js` plus
`node tests\gateway-worker-profile-launch-service.test.js`.
Mac production also explicitly sets
`HERMES_MOBILE_GATEWAY_START_TIMEOUT_MS=300000`,
`HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=90000`, and
`HERMES_MOBILE_GATEWAY_START_HEALTH_POLL_MS=1000`, with matching
`HERMES_WEB_*` aliases. Do not rely on the source default 30-second health
window for Mac cold-start validation: a cold worker can become healthy after
the default window, which otherwise creates a user-visible failed task while
the worker becomes reusable moments later.

Home AI plugin workspace audit creation also depends on listener launchd
environment. The central Mac deploy script sets
`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS` and
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS` to a JSON target map under
`<macRoot>/plugins`. The map is configuration only: the runtime still validates
plugin registry visibility, absolute existing directories, read-only mode, and
protected-path rejection before creating a `plugin_workspace_audit` job.
Codex-assisted review is off by default for productized installs. Operators may
enable it by setting `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED=1`
and `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND=<codex-command>` before
running the deploy script; the script mirrors the `HERMES_WEB_*` aliases into
the listener launchd environment. The runner still invokes Codex with
`--sandbox read-only` and keeps the deterministic audit report available when
the optional Codex phase is disabled.

Mac workspace Gateway start scripts must execute the official runtime through
the production venv Python (`$ROOT/runtime/hermes-agent-official/venv/bin/python
-m hermes_cli.main`) instead of the `venv/bin/hermes` console script. Console
script shebangs can retain the build user's temporary path after a runtime
package copy, causing low-permission users such as `hm-stephen` to fail with
`Permission denied` before `/health` binds.

Workspace worker users must also have read-only ACL access to the live Gateway
manifest, their own worker API key file, and any provider key file read by the
start script, plus traverse-only ACL access to the containing secret
directories. Missing access surfaces as `missing Gateway API key for <profile>`
in the worker stderr and as a user-facing `AI 执行通道启动后没有通过健康检查`.
`scripts/macos-production-profile-audit.js` must flag this before a user run
hits the cold-start path: `worker_manifest_unreadable:<profile>:<user>`,
`worker_api_key_file_missing:<profile>`,
`worker_api_key_unreadable:<profile>:<user>`, and
`worker_provider_key_unreadable:<profile>:<user>:<basename>` are production
blockers. The issue code uses only the provider-key basename, not the full
secret path or secret contents.

Mac Gateway worker LaunchDaemons must stay loaded for every enabled manifest
worker, but loaded does not mean always running. Only profiles in the required
warm baseline may use `RunAtLoad=true` and `KeepAlive=true`. Every other
on-demand worker plist must keep both values false or absent; otherwise
`launchctl kill` from the idle reaper is immediately undone by launchd and the
60-minute cooldown is ineffective. The audit guard is
`node tests\macos-production-profile-audit.test.js` and the production audit
issue names are `launchd_run_at_load_unexpected:<profile>` and
`launchd_keepalive_unexpected:<profile>`.

Mac Gateway start scripts must also inject the live file-plugin roots for every
profile-local file tool. `docx_extract_text`, `audio_transcribe`,
`chatgpt_image_edit`, `chatgpt_image_erase`, `video_gen`, and scoped
`http_request` file upload helpers do not consume the per-run
`access_policy_context.allowed_roots` directly; they read environment variables
such as `HERMES_MOBILE_DOCX_ALLOWED_ROOTS`,
`HERMES_MOBILE_AUDIO_ALLOWED_ROOTS`, `HERMES_MOBILE_IMAGE_ALLOWED_ROOTS`,
`HERMES_MOBILE_VIDEO_ALLOWED_ROOTS`, and `HERMES_MOBILE_HTTP_FILE_ROOTS`.
Those variables must point at the Mac live `data/drive`, `data/uploads`, and
`data/artifacts` roots, using comma, semicolon, or newline separators rather
than PATH-style colon separators. Otherwise Markdown reads and image analysis can work
while DOCX extraction fails with `file_path_outside_allowed_roots`, because the
DOCX plugin has fallen back to the Windows/WSL default roots. The profile audit
reports this as `file_plugin_root_env_missing:<profile>:<env>` or
`file_plugin_root_missing:<profile>:<env>:<root>`. Colon-separated live roots
are reported as `file_plugin_root_list_delimiter_unsupported:<profile>`.
The same start-script audit also checks the Home AI bridge-host CRON endpoint
used by `cronjob_mobile` and `hermes-mobile-http`: every enabled worker script
must include `HERMES_MOBILE_BRIDGE_HOST_URL`,
`HERMES_WEB_BRIDGE_HOST_URL`, `HERMES_MOBILE_BRIDGE_HOST_KEY_PATH`, and
`HERMES_WEB_BRIDGE_HOST_KEY_PATH`, with the default Mac bridge-host URL
`http://127.0.0.1:8798` and `$ROOT/data/secrets/bridge-host.secret`. Missing
values are reported as `mobile_bridge_env_missing:<profile>:<env>`,
`mobile_bridge_host_url_default_missing:<profile>`, or
`mobile_bridge_key_path_missing:<profile>:data/secrets/bridge-host.secret` and
block production closure. The default Mac bridge-host URL is
`http://127.0.0.1:8798`. A loaded worker without these values can return
`Hermes Mobile bridge host key is not configured` and must not create fallback
profile-local cron jobs.
The audit also scans installed gateway LaunchDaemons outside the current
manifest and reports `installed_gateway_launchd_untracked:<label>`,
`installed_gateway_start_script_root_mismatch:<label>`, and
`installed_gateway_mobile_bridge_env_missing:<label>:<env>` when stale
workspace services still point at a development root or lack bridge env.
Full Home AI Mac deploys run
`scripts/macos-gateway-start-script-bridge-env-repair.js --execute` after the
app sync and before service restart. That repair is idempotent and patches
installed gateway start scripts that compute the bridge URL/key path but forgot
to pass `HERMES_MOBILE_BRIDGE_HOST_*` and `HERMES_WEB_BRIDGE_HOST_*` through the
final `exec env`.
After repairing those env roots, run the live DOCX smoke as a second gate:
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-file-plugin-docx-root-smoke.js --root /Users/hermes-host/HermesMobile --profiles hm-wuping-openai-1 --json`.
The smoke generates a temporary DOCX under the live uploads root and imports the
target profile's local `hermes-mobile-docx` plugin. It must return `ok=true`
with no `docx_plugin_file_path_outside_allowed_roots:<profile>` issue before a
Mac file-plugin root repair is considered closed.

Mac production also must explicitly connect the listener workspace catalog to
the live Weixin route data:

- `HERMES_WEB_WORKSPACE_USERS_PATH=/Users/hermes-host/HermesMobile/data/config/access-control/weixin-users.json`
- `HERMES_MOBILE_WORKSPACE_USERS_PATH=/Users/hermes-host/HermesMobile/data/config/access-control/weixin-users.json`
- `HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH=/Users/hermes-host/HermesMobile/data/config/access-control/weixin-routing-map.json`
- `HERMES_MOBILE_WORKSPACE_ROUTE_MAP_PATH=/Users/hermes-host/HermesMobile/data/config/access-control/weixin-routing-map.json`

Without these explicit LaunchDaemon variables, the runtime catalog checks
`/Users/hermes-host/HermesMobile/config/access-control/workspace-*.json` by
default, while the maintained Mac route files live under `data/config`. In that
drift state `scripts/weixin-ingress-production-smoke.js` will authenticate but
return `skipped=true` with `reason=unmatched_workspace_route` for valid
`weixin_*` route workspaces.
Plugin manifest URLs point to Mac loopback ports:

- Wardrobe: `127.0.0.1:8765`
- Finance: `127.0.0.1:8791`
- Email: `127.0.0.1:5175`
- Health: `127.0.0.1:4877`
- Note: `127.0.0.1:4181`
- Codex Mobile: `127.0.0.1:8787`

For Wardrobe specifically, the Mac listener LaunchDaemon must explicitly set
both `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` and
`HERMES_MOBILE_PLUGIN_WARDROBE_MANIFEST_URL` to
`http://127.0.0.1:8765/api/v1/hermes/plugin/manifest`. The source-code fallback
for Wardrobe remains the historical NAS URL `127.0.0.1:8765`, so omitting
the Mac override can make Home fetch a launch token from the wrong host even
when the Mac plugin service and local database are healthy.

Migration evidence recorded during the cutover:

- Windows production Hermes data was copied from
  `C:\ProgramData\HermesMobile\data` to `/Users/hermes-host/HermesMobile/data`.
- Plugin workspaces were copied to `/Users/hermes-host/HermesMobile/plugins`:
  Wardrobe, Finance, Email, Health, Note, and Codex Mobile Web.
- Codex runtime state was copied to `/Users/<mac-admin-user>/.codex` and
  `/Users/<mac-admin-user>/.codex-mobile-web`. This was a live snapshot because the
  Windows Codex Mobile Web listener was kept running to preserve the active
  operator channel.
- The local workspace `user-a87aaa61` is named `Eileen` in Mac production.
  Its Mac default workspace is under the live drive as
  `$DRIVE/users/owner/Hermes-徐欣/Eileen`; its source data was migrated from the
  Windows `路路` directory. Avoid reintroducing `徐路`, `徐璐`, or `路路` as the
  Mac catalog label/root unless a separate rename task is opened.
- SQLite `quick_check` passed on migrated Hermes, Growth, Wardrobe, Finance,
  Finance image, Email, Health, Note, and Note attachment databases.
- Direct plugin manifests returned `200` for Wardrobe, Finance, Email, Health,
  and Note during the isolation closure. Codex Mobile plugin repair is handled
  in a separate thread and should not be used as a blocker unless explicitly
  reopened.
- On 2026-06-05, a Wardrobe Markdown delivery failure was traced to missing
  macOS ACL access for `hm-owner` against live
  `/Users/hermes-host/HermesMobile/data/drive`. The run policy already included
  `file`, `skills`, `weather`, `wardrobe`, and
  `allowed_roots=["/Users/hermes-host/HermesMobile/data/drive"]`; the failure
  was at the OS filesystem layer. The repair granted parent traversal ACLs and
  live-root write ACLs for the relevant worker users, then passed an
  `hm-owner` write/delete smoke under `data/drive/插件/衣橱`.
- Authenticated Hermes plugin manifests returned `available=true` and
  `tokenStatus=launch_token_issued` for the product plugins using the migrated
  owner access-key file. Raw keys and launch tokens were not recorded.
- Windows LAN smoke to `http://192.168.10.110:8797/` returned `200`; the
  migrated plugin list contains six plugins.
- Official Hermes release `v2026.5.29.2` was installed under
  `/Users/hermes-host/HermesMobile/runtime/hermes-agent-official` with a
  uv-managed Python runtime.
- Mac active Gateway profile `SOUL.md` files currently use the 513-byte
  baseline soul hash that also exists in Windows profile backups. Windows still
  has legacy 968-byte `lowgw1` through `lowgw5` `SOUL.md` files under
  `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles` and related
  backups; those legacy custom soul files were not copied into active Mac
  official profiles during the 2026-06-05 official-source migration. Do not
  overwrite Mac active profile souls with those files as an incidental repair;
  treat any legacy soul merge as a separate behavior-change task after
  content/intent review.
- `/api/status?detail=1` returned Gateway Pool enabled with `workerCount=30`,
  `runningWorkerCount=6`, and `healthy=6` after the isolation cutover.
- Direct Gateway smoke through `/v1/responses` returned the expected marker
  with `modelRun=ok`, without printing the Gateway key.
- Home AI API smoke created a temporary Owner thread, posted a minimal message,
  and later read back two `done` messages with the expected assistant marker.
- SQLite `quick_check` passed on the corrected Mac paths for Wardrobe
  (`/Users/hermes-host/HermesMobile/plugins/wardrobe/data/wardrobe.db`) and
  Email
  (`/Users/hermes-host/HermesMobile/plugins/email/runtime/data/mail.sqlite`) in
  addition to Hermes, Growth, Finance, Finance images, Health, Note, and Note
  attachments.
- The temporary migration SSH key was removed after the shared production SSH
  alias was verified. Future local deployments should use the OS-level SSH
  config aliases, not project-local key setup.
- Tailscale certificate validation on 2026-06-05:
  `subject=/CN=<tailnet-cert-name>`,
  `issuer=/C=US/O=Let's Encrypt/CN=YE1`,
  `notBefore=Jun 5 12:24:36 2026 GMT`, and
  `notAfter=Sep 3 12:24:35 2026 GMT`. Certificate/key public keys matched.
- Tailscale HTTPS validation on 2026-06-05: `tailscale serve status` reported
  `<tailnet-https-origin>` tailnet-only with `/` proxying to
  `http://127.0.0.1:8797`; Mac `curl -I` returned `HTTP/2 200`; and
  `/api/public-config` returned HTTP `200` with parseable JSON.
- Windows-side `curl` could not resolve `<tailnet-magicdns-host>` during
  the same check. Treat Windows MagicDNS resolution as a separate local
  Tailscale DNS configuration issue; it does not invalidate Mac-local Serve or
  iOS Simulator checks that use the Mac network stack.
- Static-only Mac updates must still be synced into the live
  `/Users/hermes-host/HermesMobile/app` root, not only the Windows development
  checkout or a Mac development checkout. After any static sync, verify
  `/api/client-version` from the Mac listener and run visual smoke against
  `http://192.168.10.110:8797/` or a working tailnet URL. For Capability Entry
  Hub/Dock changes, `scripts/playwright-visual-smoke.js` must open a Dock menu
  with `--open-capability-menu <capability>` and report
  `capabilityMenuGesture=touch-longpress`. If Windows cannot resolve the
  Tailscale hostname, use the LAN URL for Windows-side smoke and treat the
  hostname issue as DNS configuration work rather than static deployment
  evidence.

Remaining Mac production follow-ups:

- Stage 1 OS-level workspace isolation is implemented. The stronger Stage 2
  workspace file broker remains future work.
- Web Push state and VAPID material were migrated and `HERMES_WEB_PUSH_ENABLED`
  is enabled, but external-origin delivery and device re-registration have not
  been validated after the host move.
- Grok/xAI OAuth is a deferred manual re-authentication follow-up. It is not
  part of the default Mac production closure gate; use
  `docs/RUNBOOKS/grok-gateway-auth.md` and the desktop
  `HomeAI-Grok-XAI-Reauth.command` wrapper when the operator is ready.
- Windows scheduled tasks were disabled during cutover, then restored as
  development services after the Mac production closure. Treat Windows services
  as local development surfaces, not production rollback evidence. A rollback
  must be explicit and must not infer production authority merely from Windows
  task state.
- Windows development task actions should run hidden. The restored PowerShell
  scheduled tasks use `-WindowStyle Hidden`; Codex Desktop itself may still have
  an intentional visible app window.

## NAS Deployment Direction

The first supported NAS direction was a split deployment, documented in
`docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`. Treat that section as
historical topology guidance unless a NAS rollout explicitly selects it; the
maintained Windows path is now the native runtime described at the top of this
module:

- NAS runs Hermes Mobile app/data/static/proxy surfaces.
- A selected external Gateway host owns official Hermes Gateway workers,
  Codex-local execution, Grok/xAI OAuth, and worker launchers. On current
  Windows deployments that host must be Windows-native rather than WSL-backed.
- NAS talks to one reachable Gateway API server or to a fixed remote worker
  manifest. NAS should not be expected to start/stop remote workers unless a
  remote worker-manager contract has been implemented and tested.
- For ordinary user-level chat, a disabled Gateway Pool plus
  `HERMES_WEB_HERMES_API_BASE` health is not enough under the current
  fail-closed contract. NAS must expose at least one healthy `securityLevel:
  user` worker through a fixed manifest, such as the verified 2026-06-01
  `nas-local-codex` manifest pointing at `127.0.0.1:8642`, or use a validated
  remote worker manifest.
- A fixed NAS-local `nas-local-codex` manifest is not the same operating model
  as the maintained Windows native Gateway Pool. It provides one always-running
  user worker, but it has no Owner warm-worker baseline, no elastic expansion,
  no per-provider candidate pool, and no on-demand start/reuse events. UI
  wording and progress timing may therefore differ from Windows production
  unless NAS is connected to a validated external Gateway Pool or a NAS-native
  launcher is implemented.
- NAS-side Codex CLI login is useful for the NAS deployment thread, but it is
  not the Hermes Mobile runtime Gateway/Codex backend. Do not treat it as a
  shared user-facing model worker unless a separate remote worker/Mux contract
  has been designed and validated.
- After NAS becomes production, treat NAS runtime data as authoritative and
  Windows as development plus external worker host. Code flows to NAS through
  Git/deploy; NAS data flows back only as backups or isolated debug copies.
  Do not run live bidirectional sync for SQLite, workspace files, plugin keys,
  Skill Stores, Inbox/task state, learning records, or currency ledgers.
- Automation is a special case because production job definitions should be
  owned by the canonical scheduler, not by a second Hermes Mobile mirror. If NAS
  is production, do not keep Windows official CRON jobs and NAS SQLite
  automation rows as two live sources. Either migrate the official CRON job
  store to NAS and run the NAS dispatcher, or explicitly keep Windows as the
  external canonical scheduler and configure NAS to read that backend. A one-off
  import into NAS SQLite is only a repair/migration step; it is not the desired
  steady state.
- NAS maintenance credentials must live in restricted secret files or an OS
  credential store. Do not paste NAS keys, SSH private keys, cookies, or tokens
  into chats, docs, handoffs, commits, or logs.
- On NAS `192.168.10.99`, the current public Hermes entry is
  `http://127.0.0.1:8765`: router external `8555` reaches NAS
  `443`, DSM nginx terminates HTTPS, then proxies to Hermes Mobile
  `127.0.0.1:8797`. The hostname is historical; it is currently the Hermes
  Mobile entry, not a direct Wardrobe entry.
- On that NAS, Finance is deployed as Docker/Container Manager container
  `finance-mcp`, bound to loopback `127.0.0.1:8791` only. Wardrobe remains the
  existing NAS Wardrobe service on port `8765`. Both must be reached by users
  through Hermes same-origin plugin proxy routes, not by exposing backend ports
  publicly.
  Finance must also have complete workspace-local Hermes binding files before
  it is projected as active: `.hermes-finance/access-key.txt` and
  `.hermes-finance/config.json` must both exist for the effective workspace. A
  key-only Finance directory is a partial provisioning state and NAS preflight
  must fail it as `nas_finance_config_missing:<workspaceId>`.
- On that NAS, Email is deployed as Docker/Container Manager container
  `email-plugin`, bound to loopback `127.0.0.1:5175` only. Its source is under
  `/volume1/docker/email-plugin/source`, and its SQLite/config/token runtime
  state is mounted from `/volume1/docker/email-plugin/runtime`. Hermes reaches
  it through `HERMES_MOBILE_EMAIL_PLUGIN_MANIFEST_URL=http://127.0.0.1:5175/api/v1/hermes/plugin/manifest`;
  users reach it only through the Hermes same-origin plugin proxy.
- On that NAS, Health is deployed as a local Node service from
  `/volume1/docker/healthy/app`, bound to loopback `127.0.0.1:4877` only. The
  Hermes config points to
  `HERMES_MOBILE_HEALTH_PLUGIN_MANIFEST_URL=http://127.0.0.1:4877/api/v1/hermes/plugin/manifest`.
  The service must be started before the Hermes listener can project Health as
  available. Authorization/provisioning state alone is insufficient: if port
  `4877` is not listening, Hermes will show Health as `plugin_manifest_error`
  / `fetch failed` even when Owner is marked `authorized / active`. The
  maintained NAS hotfix uses `/volume1/docker/healthy/config/start-healthy.sh`
  and `/volume1/docker/healthy/config/stop-healthy.sh`; Health data and logs
  stay under `/volume1/docker/healthy/data` and `/volume1/docker/healthy/logs`.
- On that NAS, the Codex Mobile embedded plugin is a remote upstream served
  from the Windows development/Codex Mobile host at
  `http://192.168.10.108:8787/api/v1/hermes/plugin/manifest`. NAS Hermes must
  set `HERMES_MOBILE_CODEX_PLUGIN_MANIFEST_URL` or
  `HERMES_MOBILE_PLUGIN_CODEX_MOBILE_MANIFEST_URL` to that URL, and set the
  Codex plugin access-key path to the NAS server-side secret file. The raw
  Codex Mobile key must remain server-side only; users enter Codex through the
  Hermes same-origin plugin proxy, not by opening `192.168.10.108:8787`
  directly from the browser.
- The NAS Owner Wardrobe binding is intentionally aligned to the existing XuXin
  Wardrobe binding used by the current Windows environment. Do not reprovision
  Owner as a new empty `wardrobe:owner` workspace during NAS setup; that hides
  existing Owner wardrobe data.
- For a clean public/NAS install with no migrated plugin data, Owner must still
  enable each workspace-private plugin through the same provisioning contract
  used for non-Owner workspaces. Empty plugin business data is acceptable only
  after the plugin has created or confirmed a workspace-local identity, key,
  plugin-side user/space, required Skill/MCP registration, and a successful
  manifest/launch smoke. Do not mark a plugin `active` just because the Hermes
  authorization record exists.
- New plugin deployment must also verify browser-facing resource paths through
  the Hermes same-origin proxy before the plugin is considered usable. Plugin
  JSON fields whose names clearly represent URLs, images, thumbnails,
  attachments, files, previews, icons, downloads, `src`, or `href` should return
  local absolute paths that Hermes rewrites under
  `/api/hermes-plugins/<plugin-id>/proxy/...`; HTML-like JSON fields such as
  `body` may include `src`/`href`/`url(...)` references that receive the same
  rewrite. Deployment/preflight must include at least one plugin-owned static
  asset and one plugin-owned private attachment/image route. A new plugin should
  not require hand-editing Hermes for each attachment directory; if it does, the
  plugin contract or proxy harness is incomplete.
- The maintained Windows/local development launcher may point Wardrobe at a
  different local service from NAS. As of 2026-06-01, its
  `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` was changed from the NAS
  `127.0.0.1:8765` service to the local loopback
  `127.0.0.1:8765` service. Keep NAS and Windows launcher settings explicit
  instead of relying on one shared default. Do not use the Windows host's LAN IP
  as the server-side plugin upstream unless same-host LAN self-connect has been
  verified; the Hermes listener proxy can use loopback for local plugins while
  phones still reach the plugin through Hermes.

NAS-native Gateway workers must be treated as a separate production topology,
not as the Windows hybrid pool copied onto Linux. A NAS worker is acceptable
only after all of these preflight checks pass:

- The Gateway Pool exposes healthy `securityLevel: user` workers from NAS-local
  processes, not from the operator's Windows machine.
- NAS production uses hybrid mode by default, matching the maintained Windows
  policy: Owner OpenAI/Codex keeps `1` warm worker and may expand to `4`;
  ordinary workspaces keep `0` warm workers and may expand to `2`
  OpenAI/Codex workers; Owner DeepSeek keeps `0` warm workers and may expand to
  `2`; ordinary workspace DeepSeek keeps `0` warm workers and may start `1`
  provider-dedicated worker. A fixed always-running pool is a diagnostic
  fallback, not the default deployment model.
- NAS OpenAI/Codex profiles must use the maintained production default model
  and reasoning level: `gpt-5.5` with `agent.reasoning_effort: medium`. Do not
  inherit an older NAS-local Hermes `.env` or profile value such as
  `gpt-5.3-codex`; that model is rejected by the ChatGPT Codex account backend
  and turns normal Owner runs into Gateway failures.
- The Owner runtime setting is the product-level default model source. NAS
  Gateway profile generation and the NAS official CRON tick sidecar must both
  sync from that source before dispatch. The maintained default is ChatGPT
  `gpt-5.5` with `medium` reasoning, while the model permission preflight
  remains a fast classifier path using `gpt-5.4-mini` with low reasoning and an
  8 second timeout unless explicitly overridden. A stale
  `$HERMES_HOME/config.yaml`, `.env`, or generated profile must be treated as a
  failed deploy/preflight, not as a harmless local default.
- NAS official CRON is allowed to use official Hermes `cron.scheduler.run_job()`
  only through the Hermes Mobile cron dispatcher wrapper. Model-backed CRON
  jobs must receive a configured outbound proxy through
  `HERMES_MOBILE_CRON_MODEL_PROXY_URL` or standard `HTTPS_PROXY` /
  `HTTP_PROXY` / `ALL_PROXY`; on the maintained NAS this defaults to
  `http://127.0.0.1:7890`. If that proxy is missing or unreachable, the job
  must fail before official `run_job()` starts with a bounded
  `cron_model_proxy_*` diagnostic. A plain official `hermes cron` model run
  that bypasses this wrapper is not production parity.
- Mac production in `HERMES_MOBILE_NETWORK_MODE=direct` is different: the
  dispatcher may enter official CRON without proxy injection because provider
  egress is owned by the Mac network path. CRON jobs that analyze mailbox
  content must still fetch that content through the Email app MCP/tool surface,
  not by reading Email plugin storage directly.
- Runtime model selection is two-level in the Owner settings UI: first choose
  the provider/family such as `ChatGPT`, then choose the concrete family model
  version such as `gpt-5.4` or `gpt-5.5`. The persisted value remains the final
  provider/model id (`provider:model`) so launcher scripts, official CRON, and
  status projection all share the same resolved model.
- NAS/Windows parity must be measured with the same ordinary representative
  message flow, not with a probe-only shortcut or a content-specific "test"
  fast path. Small token savings must not hide real latency, missing toolsets,
  missing plugin MCP registration, or Gateway selection regressions.
- NAS Growth audio parity also requires a NAS-local Whisper large v3 Turbo
  transcription service. The listener's default reading/Growth transcription
  script is platform-specific: Windows uses
  `scripts/transcribe-reading-audio.ps1`, while Linux/NAS uses
  `scripts/transcribe-reading-audio.js` against
  `http://127.0.0.1:8001/v1/audio/transcriptions`. A NAS deployment that has
  only copied learning SQLite/audio BLOB data but has no healthy 8001 Whisper
  service can play stored audio, but new speaking/reading submissions will fail
  transcription.
- NAS Grok parity requires a dedicated `grokgw1` `provider=xai-oauth` worker in
  the NAS manifest. Do not reuse an ordinary workspace worker port as Grok.
  On the maintained NAS deployment, `grokgw1` is a stopped-on-demand wildcard
  profile at `18763`; bridge-host discovers it from the manifest and starts
  only that profile for `x_search`/Grok proxy cold starts. xAI OAuth files stay
  in the NAS Gateway profile/auth store and must not be printed or copied into
  docs, frontend state, or plugin config.
- A successful parity smoke records the run phase timeline from Mobile events:
  `run.request_preparing`, `run.gateway_worker_reused` or
  `run.gateway_worker_started`, `run.context_ready`, `run.gateway_selected`,
  `run.toolset_selection_started` when enabled, `run.request_sent`,
  `run.model_stream_started`, and `run.model_output_started`. `queued` is valid
  only for real capacity/profile waits; a warm Owner worker should not spend
  tens of seconds before a Gateway reuse/start event.
- Direct `GET /health` on a Gateway port is necessary but insufficient. It
  proves the worker process is responsive, not that Hermes Mobile can build the
  run request, choose the worker, emit progress, and dispatch through the same
  path as Windows production.
- Listener-side runtime persistence is part of NAS parity. Normal
  message-count growth must not force a full `state.json` backup before every
  run; message-drop refusal, allowed decreases, startup, import, and
  parse-failure backups remain safety-critical. If a NAS smoke shows a long gap
  before `run.request_preparing`, diagnose listener persistence/setup latency
  before blaming Gateway worker cold start.
- The run-start hot path may write the JSON snapshot before doing the heavier
  SQLite runtime replacement, so progress can become visible before a full
  structured-store refresh. On startup, if `state.json` is newer than SQLite's
  `lastRuntimeStateSave` marker, Hermes must import the newer JSON snapshot
  into SQLite before serving runtime state.
- Every user worker is scoped to exactly one `allowedWorkspaceIds` value. A
  wildcard workspace is allowed only for an explicitly documented legacy bridge
  warning or the dedicated `grokgw1` `provider=xai-oauth` on-demand Grok
  profile. Ordinary workspace workers must not use wildcard access, and a
  wildcard bridge is not production parity.
- Every worker profile binds `skills` to the NAS-local per-workspace Skill
  Store under `/volume1/docker/hermes-mobile/data/skill-profiles/<profile>/skills`.
  It must not symlink all users to one personal NAS home such as
  `/var/services/homes/<nas-user>/.hermes/skills`.
- Every worker profile binds `memories` to a per-workspace Memory Store, either
  under the same skill profile or under
  `/volume1/docker/hermes-mobile/data/gateway-memories/<profile>`. It must not
  use one shared base-memory directory for all users.
- The maintained deployment must include only production workspaces that are
  expected to run conversations. On the current NAS production host this means
  Owner, WuPing (`weixin_wuping`), Stephen (`weixin_stephen`), XuYan (`xuyan`),
  and the active test workspace when test smoke is needed. Do not keep
  historical or inactive workspace workers warm/running just because old data
  directories or Skill profiles exist.
- Plugin MCP toolsets must be workspace-local. The NAS launcher must register
  Wardrobe, Finance, Email, or future plugin MCP servers only when the selected
  workspace has its own `.hermes-<plugin>/config.json` plus key material. A
  worker for Stephen, XuYan, or another workspace without that plugin config
  must not expose the plugin toolset and must not fall back to Owner.
- On macOS, the data-drive plugin binding must also be present in the
  worker-local root before profile rendering. The restricted workspace
  provisioning executor mirrors complete
  `data/drive/users/<workspaceId>/.hermes-<plugin>` directories to
  `/Users/<hm-user>/HermesWorkspace/.hermes-<plugin>` and profile generation
  exposes the plugin MCP only after that worker-local mirror has both
  `config.json` and `access-key.txt`.
- macOS plugin MCP closure also requires worker-side MCP implementation files
  under `<root>/gateway-worker/<plugin>-mcp`. For Growth, the workspace
  provisioning executor materializes the file set from
  `<root>/plugins/growth` into `<root>/gateway-worker/growth-mcp` before
  rendering profiles. The Gateway manifest must then be updated from the
  rendered profile capabilities so `toolsets`, `mcpServers`, and `configPath`
  match the actual `config.yaml`; otherwise a selected worker may omit the
  plugin toolset even though the profile file contains `mcp_servers.<plugin>`.
The central macOS deploy script runs the `codex-auth-profile-audit` gate after
plugin deploys because MCP/profile refresh work can otherwise leave an
`openai-codex` profile with root-owned regular auth files instead of the
shared-auth symlinks required by Gateway runs.
Before that audit, the deploy script repairs bounded shared-auth permissions on
`gateway-worker/telemetry/profiles/shared-auth`: it grants the active
`openai-codex` worker users read/write ACLs on `auth.json` and `auth.lock`
without reading or printing credential contents. A profile audit failure with
`codex_auth_json_unreadable` or `codex_auth_lock_unreadable` after this repair
is a real production blocker.
Home AI deploy also installs source-controlled host Skills with explicit
sharing semantics. CRON-facing built-in Skills are copied to
`data/hermes-home/skills`, and the allowlisted profile-shared host Skill
`productivity/home-ai-todo-intake` is copied to
`data/skill-profiles/shared-global/skills`. Do not copy the full source
`skills/productivity/*` tree into every workspace profile, because plugin-owned
or operational Skills may have narrower workspace boundaries.
- NAS Gateway workers must start with the Hermes Mobile runtime overlay on
  `PYTHONPATH`, ahead of the NAS Hermes Agent runtime, and set
  `HERMES_MOBILE_OFFICIAL_CLEAN_PATH` to that runtime. Otherwise profile YAML
  can list `mcp_servers.health` / `platform_toolsets.api_server: health` while
  the real callable schema still contains only built-in tools. This presents as
  "plugin MCP unavailable" even though the wrapper process is running.
- The NAS `data/drive/users/<workspaceId>` directories must be private to the
  NAS service account (`0700` or stricter equivalent). This protects against
  other NAS users, but it is not equivalent to Windows per-account ACL
  isolation when all Gateway workers run as one Unix user.

NAS file-system isolation is therefore two-tiered. The current NAS-native
launcher provides Hermes Mobile workspace routing plus per-profile
Skill/Memory binding and private directory modes. Strong OS-level isolation
equivalent to Windows ACLs would require each workspace worker to run under a
separate Unix user or container with bind-mounted workspace roots. Do not claim
that level of isolation until a per-user UID/container launcher and harness are
implemented.

## Public Reverse Proxy Security

When Hermes Mobile is reachable through a public HTTPS reverse proxy, the app
layer must emit a conservative browser security envelope:

- `Strict-Transport-Security: max-age=15552000`
- `Content-Security-Policy` with `default-src 'self'`, no object embedding, and
  plugin iframes limited to same-origin proxy paths or HTTPS origins
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`

Public deployments should also disable URL query Access Keys with
`HERMES_MOBILE_DISABLE_QUERY_ACCESS_KEY=1` and
`HERMES_WEB_DISABLE_QUERY_ACCESS_KEY=1`. `?key=` is not suitable for public
traffic because it can leak through proxy logs, browser history, and referrers.

Windows firewall should not keep generic `Node.js JavaScript Runtime` Public
inbound allow rules. On the maintained deployment, only the reverse proxy host
should be allowed to reach the Hermes listener port, for example
`192.168.10.135 -> TCP 8797`. RDP rules should be disabled or source-limited
unless actively needed.

Codex Mobile bridge keys should remain local to the service account that runs
the Codex Mobile plugin process. On the maintained deployment,
`%USERPROFILE%\.codex-mobile-web\access_key` should be readable only by
`<windows-admin-domain>\<windows-admin-user>`, `SYSTEM`, and `Administrators`; do not grant shared user accounts
read/write access to this key file or its parent directory.

## Restart Tiers

- Static-only: no restart.
- Production launcher/env change: restart Hermes Mobile listener through
  `C:\ProgramData\HermesMobile\app\scripts\start-worker-host.ps1
  -RunInCallerContext -ReplaceExisting` so the worker-host process re-reads
  `C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1`. On the
  maintained production machine,
  `C:\ProgramData\HermesMobile\listener-run-in-caller-context.flag` should also
  exist so a later plain `-ReplaceExisting` still starts the listener in caller
  context instead of the separate worker account. If the maintained production
  Gateway warm-worker floor is `0`, restart health checks must also use
  `-MinGatewayPoolWorkers 0`; otherwise the listener can be live while the
  worker-host script reports a false startup failure.
- Node route/service/provider change: restart Hermes Mobile listener only.
  Before restarting, verify the production app root has runtime dependencies
  installed. If `node_modules` is missing after a source-only/static deploy,
  run `npm ci --omit=dev` in the production app root with the production Node
  runtime/PATH, then restart. Otherwise a previously healthy listener can fail
  on first cold import, for example at `require("web-push")`.
- Bridge-host change: restart listener/bridge-host through `scripts\start-worker-host.ps1 -ReplaceExisting`.
- Gateway plugin/schema/profile/startup change: restart Gateway Pool or targeted maintenance worker as appropriate.
- Cron dispatcher change: restart cron sidecar through `scripts\start-cron-tick-sidecar.ps1 -ReplaceExisting`.
- Data-only repair: backup data first; avoid restart unless runtime memory can overwrite the repair.

For NAS listener restarts, do not rely only on a command-line match such as
`/volume1/docker/hermes-mobile/app/server.js`. The maintained listener may run
as `node server.js` with cwd `/volume1/docker/hermes-mobile/app`; restart
scripts and hand repairs must stop by the effective cwd/port or by the
maintained stop script before starting `config/start-hermes-mobile.sh`.
The scripted restart must travel through the same base64/remote-Python control
path as NAS deploy uploads, not through ad-hoc PowerShell strings with nested
Bash quoting. It must wait until port `8797` is no longer serving
`/api/public-config`; if the port is still occupied, fail with
`nas_listener_restart_port_still_busy` instead of starting a second listener.
After start, it must verify that `/api/public-config` reports
`setupRequired=false`, `ownerKeyConfigured=true`, and `ownerKeySource=file`.
Starting `node server.js` by hand without the maintained env is a failing
operation because it can serve from the checkout workspace and lose the
file-backed Owner key.

## NAS Full-Source Deploy Harness

For maintained NAS production updates that touch backend services, startup
scripts, route modules, profile launchers, harness files, or broad frontend
modules, use the scripted tracked-source deploy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-nas-tracked-source.ps1
```

The tracked-source deploy path is intentionally fixed because ad-hoc
PowerShell/SSH quoting and binary transport failures have caused repeated
operator errors. The script must:

- package only Git-tracked files with `git archive`;
- upload a base64 text archive through SSH rather than `scp`, `sftp`, or a raw
  binary tar pipe;
- decode the archive on NAS with Python and extract the same archive into both
  `/volume1/docker/hermes-mobile/app` and
  `/volume1/docker/hermes-mobile/source`;
- back up overwritten files before extraction;
- run pinned NAS Node checks and the first-start preflight;
- compare the served version and Gateway worker posture after deploy.
- keep runtime config launchers that live outside the Git-tracked app tree in
  sync with the deployed app scripts. At minimum,
  `config/start-nas-gateway-pool.sh` must be refreshed from
  `app/scripts/start-nas-gateway-pool.sh` before Gateway profile restart or
  smoke, otherwise new MCP registrations such as Note can exist in source while
  live Gateway profiles are generated by an old script.

Do not replace this with one-off inline PowerShell strings that embed complex
Bash, heredocs, binary streams, or long remote command chains. If a new NAS
operation is needed, add it to the deploy script and update the harness.
This also applies to restart-only hotfixes: represent the operation as a
checked script function using the fixed base64/remote-Python execution channel,
then add a harness assertion for the specific failure mode.

## NAS Static Deploy Harness

For the maintained NAS production host `192.168.10.99`, static-only Hermes
Mobile updates should use the scripted harness:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\deploy-nas-static-assets.ps1
```

The script is intentionally narrow, but its file list must include every
changed frontend module participating in the current client version. Do not
update only the shell/version files when the fix lives in `public/app-*.js` or
`public/styles.css`; otherwise NAS can appear current while still running old
interaction/progress code.

The script:

- It reads the current client version from `public/index.html`.
- It checks NAS `/api/status?detail=1` with the NAS-side Owner key file and
  aborts if health is not `ok` or `activeGlobal` is nonzero.
- It backs up the target files from both `/volume1/docker/hermes-mobile/app`
  and `/volume1/docker/hermes-mobile/source` under
  `/volume1/docker/hermes-mobile/backups/<version>-<timestamp>`.
- It syncs only the declared static/test file set. Callers must expand `-Files`
  for the current change, or use a full tracked-source deploy when backend,
  startup, route, profile, or broad frontend modules changed.
- It does not use `scp`, `sftp`, or a PowerShell binary pipe for tar data. The
  maintained NAS SSH setup rejected `scp`/`sftp`, and Windows PowerShell can
  corrupt binary tar streams. The script packages a local tar, converts it to
  base64 text, streams that text through SSH, decodes it on NAS with Python,
  and extracts the same archive into both `app` and `source`.
- It compares SHA-256 for every file in both NAS destinations before running
  checks.
- It runs NAS checks with the pinned NAS Node runtime path
  `/volume1/docker/hermes-mobile/runtime/node-v22.22.3-linux-x64/bin/node`
  rather than assuming `node` is on the remote PATH.
- It smokes `/api/client-version?clientVersion=<version>` and verifies the
  public origin HTML at `http://127.0.0.1:8765` contains the
  deployed version.
- It must also smoke `/api/owner-elevation` with Owner auth and fail if
  `ownerElevation.available` is not `true`. On the maintained NAS production
  host, `config/hermes-mobile.env` must set
  `HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS=1`; putting this export after the
  `exec node server.js` line in `config/start-hermes-mobile.sh` is ineffective.

The harness does not print Owner keys, plugin keys, launch tokens, cookies, or
push endpoints. If a future NAS static deploy needs a different file set, add it
to the script parameter explicitly and extend `tests\nas-static-deploy-harness.test.js`
instead of doing an ad hoc one-off copy.

## Automation Deployment Checks

Before declaring a production environment ready for Automation:

- Confirm the configured canonical backend. Official Hermes CRON is the default
  production target unless a future scheduler backend has an explicit design and
  harness. If `HERMES_WEB_SERVICE_STORE=sqlite` is enabled without an explicit
  Automation backend override, Hermes Mobile defaults Automation to
  `hermes_cron`; choosing local/SQLite Automation must be explicit.
- Query `/api/automations?detail=summary&refresh=1` and verify the visible job
  count matches the canonical scheduler for the same principal/workspace.
- Confirm there is exactly one live scheduler/tick owner for production. The
  Windows development cron sidecar must be stopped when NAS owns production
  scheduling.
- For NAS production, verify the dispatcher/tick process is running only if NAS
  owns the canonical scheduler. If Windows remains the external scheduler,
  document that boundary and do not also run a NAS tick loop against a mirrored
  store.
- When NAS owns the canonical scheduler, install
  `scripts/start-nas-cron-tick.sh` and `scripts/stop-nas-cron-tick.sh` into the
  NAS config directory, keep the PID file under
  `/volume1/docker/hermes-mobile/runtime/hermes-cron-tick.pid`, and set
  `PYTHONPATH` to `/volume1/docker/hermes-agent/current` so
  `scripts/hermes-mobile-cron-dispatcher.py` imports official Hermes CRON from
  the NAS Hermes Agent release.
- Back up the canonical automation store before any migration or repair. Do not
  print task prompts, raw runner output, keys, OAuth tokens, mail content, or
  push endpoints during the check.

## Bridge Host Routes

Bridge host lives on `http://127.0.0.1:8798` and is restarted with the listener
host script. Current product bridge routes include:

- `POST /bridge/chatgpt-pro`
- `POST /bridge/codex-mux`
- `POST /bridge/grok-gateway-proxy/v1/responses`

The Grok Gateway proxy route exists for cross-distro Automation/Cron `x_search`
where the plugin process cannot safely reach `127.0.0.1:<grok-port>` directly.
Gateway/plugin callers should use proxy prefix `/bridge/grok-gateway-proxy`;
the plugin appends `/v1/responses`.

## Standard Checks

- `git status -sb --untracked-files=all`
- syntax checks for touched JS/Python/PowerShell
- focused tests for touched scope
- `node tests\architecture-refactor-boundary.test.js` for server/runtime boundaries
- `git diff --check`
- production focused checks after sync
- authenticated status smoke through the checked harness:
  `node scripts\production-status-smoke.js --access-key-file <owner-key-file> --base <origin> --expected-version <version> --json`
- origin identity must be checked on the same origin before authenticated API
  status; the checked harness does this through `/api/public-config` and fails
  with `production_origin_identity_mismatch` rather than trying another port.
- `/api/status?detail=1` only through `X-Hermes-Web-Key` or the
  `hermes_web_key` cookie. `X-Hermes-Access-Key` is a wrong-header negative
  case; it must not be used for deployment status checks.

`scripts\production-status-smoke.js` reads the key from a file, does not print
the key or raw key path, proves the target origin is Home AI before sending the
key, verifies `activeGlobal` before restart-sensitive work, and by default
confirms that the wrong-header probe using `X-Hermes-Access-Key` is rejected.
Its JSON output includes only bounded metadata, including the non-secret
`authHeader` and `wrongAuthHeader` names, so a reviewer can see which transport
header was actually exercised without exposing key material.
Do not replace it with a one-off inline Node/Python status script unless the
new script is added to source and covered by a harness.
- Mac production profile audit after deployment or profile repair:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-profile-audit.js --root /Users/hermes-host/HermesMobile --json`.
  Treat non-empty `issues` as a blocker. Non-empty `warnings` are not a user
  login failure by themselves, but stale profile roots or unexpected profile
  link targets must be backed up and resolved before considering migration
  closed. `launchd_service_not_loaded:<profile>` is always a cold-start blocker:
  bootstrap or repair the matching system LaunchDaemon before accepting the
  deployment.

## Production Launcher Toggles

The operator wrapper at
`%USERPROFILE%\.hermes-windows\start-hermes-mobile-production.ps1` forwards to
the effective launcher:
`C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1`.

For Gateway model-side preflight and toolset selection, inspect the ProgramData
launcher first before searching code:

- `HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT` /
  `HERMES_WEB_GATEWAY_MODEL_PERMISSION_PREFLIGHT`: permission preflight. It
  defaults off in code when unset. Set it only for an explicit diagnostic
  rollback that accepts the extra model call before normal execution.
- `HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS`: permission-only
  preflight timeout. Default is `8000`, but with the default disabled preflight
  state this value is inactive and no permission-only selector request is sent.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION`: optional model-first
  toolset selector. Set to `1`, `true`, `yes`, or `on` to enable advisory
  `suggested_toolsets`; set to `0`, `false`, `no`, or `off` to disable the
  selector call. The execution request must still expose the full authorized
  ordinary user toolset surface.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS`: optional
  selector timeout. Default is `30000`; selector failure or timeout must fall
  back to the full originally authorized toolset set, not to a narrower
  suggested set.
- `HERMES_MOBILE_DISABLE_QUERY_ACCESS_KEY` /
  `HERMES_WEB_DISABLE_QUERY_ACCESS_KEY`: disable Access Key authentication via
  URL query parameter for public deployments. Header and same-origin cookie
  authentication remain available.
- `HERMES_MOBILE_CHATGPT_PRO_CODEX_PERMISSION_MODE`: optional override for the
  ChatGPT Pro Codex bridge. The source default is `auto`; setting `full` is an
  explicit high-trust override, not the public default.

Changing these values requires a listener restart, not a Gateway Pool restart,
unless a separate worker profile/plugin/schema file also changed.

## Secrets

Owner key and other secrets stay under production data secret paths. Use them only in command variables and never print them.

Do not copy production data, secrets, browser credentials, tokens, or generated private reports into docs, commits, handoffs, or public exports.
