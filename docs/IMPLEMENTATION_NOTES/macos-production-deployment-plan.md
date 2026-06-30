# macOS Production Deployment Plan

This document defines the target plan for running Hermes Mobile natively on a
Mac Studio as a stable production host. It is a deployment and architecture
plan, not proof that the installer already exists.

## Current Decision

Use Mac Studio as the preferred long-lived production host after validation.

- Windows remains the primary fast-iteration development machine for now.
- Mac Studio becomes the stable Hermes Mobile production host for family use.
- NAS remains storage, backup, archive, and large-file infrastructure. It
  should not be the primary compute host for Gateway workers or audio
  transcription.
- macOS is not Linux. It is Darwin/BSD Unix. Linux assumptions such as
  `systemd`, native Linux namespaces, and WSL-style paths do not apply.
- Use macOS `launchd` for services.
- Use macOS local users for strong workspace isolation.
- Plugin services may remain shared multi-tenant app services, as long as
  their Hermes-facing identity is workspace-local and validated by plugin
  harnesses.

The intended outcome is simpler than the current Windows/WSL/NAS split:

```text
Mac Studio
  macOS launchd
  Hermes Mobile listener
  official Hermes Gateway runtime
  per-workspace Gateway/MCP OS users
  local SSD hot data
  NAS backup/cold storage
```

## Goals

- Remove WSL as the production Gateway and MCP boundary.
- Keep Hermes Mobile deployable by a guided installer with administrator
  approval.
- Enforce strong workspace isolation so a bug in a non-Owner worker or MCP
  wrapper cannot directly read Owner files, Skill Store, Memory Store, or
  plugin key files.
- Keep plugin services practical: one plugin app/service may serve multiple
  Hermes workspaces, but each workspace must use its own key/config identity.
- Support both direct network mode and proxy network mode.
- Keep deployment repeatable, restartable, auditable, and reversible.
- Require administrator approval only for bounded install/upgrade phases; after
  bootstrap, routine runtime repair must not depend on a stored Mac login
  password.

## Non-Goals

- Do not make every plugin workspace its own container for the first Mac
  deployment.
- Do not run Hermes Mobile production data from an NAS network mount.
- Do not live-sync SQLite, plugin keys, Skill Stores, Memory Stores, Inbox,
  tasks, or chat state between Windows and Mac.
- Do not copy `.agent-context`, `.codegraph`, local scratch uploads, raw
  secrets, browser profiles, OAuth cookies, or long logs into the production
  package.
- Do not make a Mac administrator password file a production prerequisite or a
  runtime dependency.
- Do not claim full macOS production readiness until first-start preflight and
  workspace-isolation harnesses pass on the actual Mac.

## Privileged Bootstrap Contract

The macOS production installer may ask the operator for administrator approval
during explicit install or upgrade phases. That approval may install
LaunchDaemons, set root-owned files, repair ACLs, and create narrow sudoers
rules for bounded Home AI operations.

After bootstrap, Home AI runtime components must not read or store a Mac login
password. Repeated privileged needs are product defects until they are converted
into one of these durable mechanisms:

- root-owned LaunchDaemon actions with fixed labels and arguments;
- restricted sudoers entries for validated command shapes;
- a native privileged helper with a narrow API;
- corrected ownership or ACL layout that removes the privileged requirement.

Private `--password-file` usage remains acceptable for local developer
automation and emergency operator repair, but it is not part of the public
deployment contract and must not be required for a fresh install.

## Host Layout

Recommended root:

```text
/Users/example/path
/Users/example/path
/Users/example/path
/Users/example/path
/Users/example/path
```

The exact path may change during installation, but the installer must keep a
single `HERMES_MOBILE_ROOT` and derive app/data/runtime/backups/plugins paths
from it.

Suggested environment names:

```text
HERMES_MOBILE_ROOT=/Users/example/path
HERMES_MOBILE_APP_DIR=/Users/example/path
HERMES_MOBILE_DATA_DIR=/Users/example/path
HERMES_MOBILE_RUNTIME_DIR=/Users/example/path
HERMES_MOBILE_BACKUP_DIR=/Users/example/path
HERMES_MOBILE_NETWORK_MODE=direct|proxy
```

## macOS Users And Isolation

Use one host/control user and one OS user per Hermes workspace.

Example:

```text
hermes-host
hm-owner
hm-wuping
hm-stephen
hm-xuyan
hm-test
```

Responsibilities:

```text
hermes-host
  Hermes Mobile listener
  browser/static/proxy/auth routing
  launchd orchestration
  non-secret deployment metadata

hm-owner
  Owner Gateway worker
  Owner MCP wrappers
  Owner files, Skill Store, Memory Store, plugin keys

hm-wuping / hm-stephen / hm-xuyan / hm-test
  workspace-specific Gateway worker
  workspace-specific MCP wrappers
  workspace-specific files, Skill Store, Memory Store, plugin keys
```

Directory ownership pattern:

```text
/Users/example/path       owner hm-owner, mode 700
/Users/example/path      owner hm-wuping, mode 700
/Users/example/path     owner hm-stephen, mode 700
/Users/example/path       owner hm-xuyan, mode 700
```

Inside each workspace:

```text
HermesWorkspace/drive
HermesWorkspace/skills
HermesWorkspace/memories
HermesWorkspace/.hermes-finance
HermesWorkspace/.hermes-wardrobe
HermesWorkspace/.hermes-health
HermesWorkspace/.hermes-email
```

Each workspace-private plugin directory must be readable only by that
workspace OS user and the narrow system service that needs to provision it.
Raw plugin keys remain in `access-key.txt` files and must not enter frontend
JavaScript, iframe URLs, model tool arguments, screenshots, docs, handoffs, or
logs.

Current Home AI production policy still exposes live data paths from
`/Users/example/path` to Gateway runs. A worker may have
`HERMES_WORKSPACE_ROOT=/Users/example/path`, but the official
Gateway file tool can receive an `access_policy_context.allowed_roots` entry
such as `/Users/example/path`. The macOS isolation model
therefore has two required layers:

- Home AI policy must authorize only the intended live data roots.
- macOS ACLs must let the matching `hm-*` worker user traverse the live root
  and read/write only those intended roots.

Do not validate filesystem isolation only by checking launchd users or
`allowed_roots`. Run the production harness after user creation, data
migration, ACL repair, and deployment:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path
```

The detailed incident workflow is
`docs/RUNBOOKS/macos-worker-filesystem-access.md`.

## Listener Boundary

The long-term target is that `hermes-host` does not directly read every
workspace's private files. The migration can be staged:

### Stage 1: Strong Worker/MCP Isolation

- Listener runs as `hermes-host`.
- Each Gateway worker runs as the target workspace OS user.
- Each MCP wrapper runs as the target workspace OS user.
- Gateway profile selection is workspace-specific.
- Plugin MCP wrappers read only the current OS user's workspace root.
- Owner switching into WuPing/Stephen/XuYan starts the target workspace worker,
  not an Owner worker.

This stage protects the highest-risk path: model tool calls and MCP access.

### Stage 2: Workspace File Broker

- Listener stops direct filesystem reads of workspace-private files.
- Each workspace gets a small local file broker running as the workspace OS
  user.
- The listener can list, preview, and write workspace files only through that
  broker and only after Hermes auth has resolved the effective workspace.
- A listener bug should not grant direct OS-level access to another user's
  private directory.

Stage 2 is the stronger target, but Stage 1 is the minimum acceptable Mac
production starting point.

## Plugin Boundary

Plugin services may be shared app services. Do not split every plugin workspace
into a separate container for the first Mac deployment.

Accepted plugin shape:

```text
finance service
wardrobe service
health service
email service
```

Each service can be a single launchd service or a containerized app. It may
store multiple plugin users internally, but Hermes must enter it with a
workspace-local identity.

Required for every workspace-enabled plugin:

```text
<workspace root>/.hermes-<plugin>/config.json
<workspace root>/.hermes-<plugin>/access-key.txt
```

MCP wrapper contract:

```text
--workspace /Users/example/path
--no-workspace-override
```

Rules:

- The model must not pass raw plugin keys.
- The wrapper must not accept a model-supplied workspace override.
- The wrapper must not fall back to Owner.
- The plugin service must reject invalid keys or keys for another workspace.
- The iframe launch token must bind to the target workspace.
- The same-origin plugin proxy must clamp workspace hints through Hermes
  workspace access policy.

Plugin services should own their own tenant isolation harnesses. Hermes Mobile
owns the host-side proof that the correct workspace-local wrapper/key was used.

## Network Modes

Mac Studio may use a router-level transparent proxy through the household
router. In that case Hermes Mobile should not require process-level proxy
environment variables.

Deployment supports two explicit modes:

```text
HERMES_MOBILE_NETWORK_MODE=direct
HERMES_MOBILE_NETWORK_MODE=proxy
```

### Direct Mode

Use when the Mac's default gateway or router can reach model providers without
per-process proxy configuration.

Requirements:

- DNS resolves model-provider domains correctly.
- HTTPS reaches model providers from both an interactive shell and launchd
  services.
- Official Hermes can complete a minimal model request.
- CRON model jobs do not require `HTTPS_PROXY`, `HTTP_PROXY`, or `ALL_PROXY`.
- If direct connectivity fails, preflight reports a network egress problem,
  not `proxy_required`.

### Proxy Mode

Use when the host needs a local HTTP/SOCKS proxy.

Recommended env:

```text
HERMES_MOBILE_NETWORK_MODE=proxy
HERMES_MOBILE_CRON_MODEL_PROXY_URL=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
ALL_PROXY=http://127.0.0.1:7890
NO_PROXY=127.0.0.1,localhost,::1
```

In proxy mode, model-backed CRON jobs must fail before official
`cron.scheduler.run_job()` starts if no configured/reachable proxy exists.

## Public Upgrade Closure

Existing public installs must use the central upgrade loop before being treated
as current:

```bash
npm run upgrade:public -- --json
npm run upgrade:public -- --execute --reason public-upgrade --json
```

The loop reads `config/public-plugin-sources.json`, performs clean
fast-forward-only source updates, deploys changed Home AI/plugin roots through
`scripts/deploy-macos-production.js`, and runs production closure validation.
Moira, Movie, and Music are in the deployable plugin inventory. Moira points at
the public `MOIRA_chinese_astrology_public` repository; Movie and Music are
marked `operatorAuthenticated` and require operator Git read access.

The install and upgrade loops must also account for the official Hermes Agent
runtime used by provider ingress. Fresh install closure now requires
`install-official-hermes-runtime` to verify Python `>=3.12`, clone or reuse a
Hermes Agent source that is either a git checkout or packaged Python project,
synchronize it to `<root>/runtime/hermes-agent-official/source`, create
`<root>/runtime/hermes-agent-official/venv`, and install Hermes Agent
dependencies when explicitly requested. Updating that source later requires the
explicit `--update-hermes-agent` gate, and dependency refresh requires
`--install-hermes-agent-dependencies`. After a Home AI, plugin, or Hermes Agent
update, the loop must rerun the production profile/provider audit and
`scripts/macos-production-closure-validation.js`. Do not model an install or
upgrade as closed if provider access through Hermes Agent has not been checked.

## Installer Shape

Target top-level installer:

```bash
bash ./scripts/install-macos-production.sh --json
```

Fresh-install guided entrypoint:

```bash
bash ./scripts/install-macos-production.sh --execute --guided --root /Users/example/path --network-mode direct --json
```

The official Hermes Agent runtime phase writes service-owned runtime paths and
must be run through an operator sudo boundary on production installs. Preserve
the installer runtime PATH under sudo so the phase uses the pinned Node runtime
instead of depending on the system shell environment. During bootstrap, when
the requested Node/npm executables live in a temporary runtime directory, that
directory must be included in the sudo PATH until `runtime/node-current/bin`
exists:

```bash
sudo env PATH=/Users/example/path \
  bash ./scripts/install-macos-production.sh --execute --phase install-official-hermes-runtime --root /Users/example/path --json
```

The Home AI and plugin dependency phases also write service-owned production
roots and must use the same operator sudo boundary. The same boundary applies
to Owner secret materialization, CRON scaffold writes, plugin provisioning plan
writes, and first-start preflight because those phases read or write
service-owned production state.

The installer should be idempotent and phase-based:

```text
1. system-preflight
2. install-dependencies
3. create-service-users
4. create-directory-layout
5. install-hermes-mobile
6. install-official-hermes-runtime
7. configure-owner
8. configure-workspace-isolation
9. configure-gateway-profiles
10. install-gateway-launchd-services
11. repair-gateway-worker-acl
12. configure-cron
13. configure-plugins
14. install-plugin-dependencies
15. plan-plugin-workspace-provisioning
16. install-launchd-services
17. run-first-start-preflight
18. run-smoke-tests
19. print-access-info
```

`configure-gateway-profiles` is a repair-safe phase on hosts that already have
`data/gateway-pool-manifest-mac.json`: it must preserve the existing manifest
and API key files, but still resync packaged required Skill bundles and
reapply listener ACLs for required Owner skills. A fresh install and an
upgrade/repair run therefore share the same required Skill readability closure
before smoke tests.

The installer may automate system-level work after administrator approval, but
must not pretend to automate external interactive authorization. These remain
guided steps:

Current implementation status: `scripts/install-macos-production.sh` is a
dry-run, machine-readable phase plan by default. `--execute` requires either
`--phase` or `--guided`. Guided execution reports the ordered operator closure
plan by default and performs no production write unless
`HOMEAI_INSTALL_RUN_OPERATOR_PHASES=1` is set and the process is already running
as root through the operator sudo boundary. With that explicit gate, guided
execution runs the full fresh-install sequence in order. The
implemented phases also cover service-user audit and optional creation,
runtime pinning, production dependency install, Owner key setup, workspace
isolation scaffold/ACL gate, Gateway launchd apply, Gateway worker ACL repair,
CRON scaffold, plugin source clone, plugin dependency install, first-run plugin
provisioning plan, core/plugin launchd apply, first-start preflight, and
aggregate closure smoke. Existing production updates should continue to use
`scripts/deploy-macos-production.js`.
The installer defaults guided fresh install to `direct` network mode. Operators
can pass `--network-mode proxy` when the target host intentionally requires a
proxy path for provider egress.
Plugin source installation supports two operator-run materialization paths:
`--plugin-source-mode clone` clones public HTTPS GitHub repositories, while
`--plugin-source-mode bundle --plugin-source-bundle-dir <dir>` copies
pre-fetched sanitized plugin source directories for authenticated repositories
such as Movie and Music. Bundle mode is the supported fresh-install path on a
target host that lacks GitHub credentials for operator-authenticated plugin
repositories; it excludes source-control and runtime/private state and still
does not create plugin grants, launch tokens, or workspace-local plugin keys.
Because guided installation runs many phases through sudo, the core
`install-launchd-services` phase repairs Home AI service-owned runtime
ownership before loading LaunchDaemons. The repaired paths are limited to
service-writable/readable runtime roots (the `data` root itself, `logs`,
plugin sources, service secrets, Hermes Home CRON state, `runtime/uploads`, and
`tmp`) and do not recursively rewrite workspace/Gateway profile ownership.
The earlier `configure-workspace-isolation` phase owns workspace drive setup,
including Owner's shared `data/drive` write ACL and
`data/drive/插件` built-in plugin scaffolds. These paths are required by the
worker filesystem access and plugin-directory smokes and must not be left as
post-install manual fixes.
The later `repair-gateway-worker-acl` phase is the final ACL normalization
point before first-start and smoke checks. It must preserve worker isolation
while also reapplying listener search/read ACLs for packaged Owner required
Skills; otherwise a fresh install can create complete Skill files that the
listener cannot preload.
The core Home AI LaunchDaemons explicitly set `HERMES_WEB_AUTH_KEY_PATH` to
`<root>/data/secrets/owner-web-key.secret`; otherwise a fresh install would
create the Owner key successfully but the listener would fall back to the
app-root `.hermes_web_secret_key` default and report setup as incomplete.
The core listener, bridge-host, and cron LaunchDaemons also carry the
workspace-aware Mac Gateway Pool runtime environment. The install phase sets
`HERMES_WEB_GATEWAY_POOL_ENABLED=1`, points `HERMES_WEB_GATEWAY_POOL_MANIFEST`,
`HERMES_MOBILE_GATEWAY_POOL_MANIFEST`, and
`HERMES_GATEWAY_POOL_MANIFEST_PATH` at
`<root>/data/gateway-pool-manifest-mac.json`, enables hybrid mode, and points
both profile-launch-script aliases at
`<root>/app/scripts/macos-launch-gateway-profile.sh`. This keeps clean installs
from passing Owner setup while `/api/status` still checks the legacy single
Gateway at `127.0.0.1:8642`.
Install-time smoke runs production closure with
`--allow-provider-auth-pending --skip-wardrobe-binding`, which accepts only
missing Codex auth JSON/lock files as a fresh-machine pending setup state, skips
model-run smokes that cannot pass without provider credentials, and skips the
legacy non-Owner Wardrobe binding smoke until migrated workspace binding data is
available. The normal maintainer production closure path does not use these
flags and continues to fail on missing/broken provider auth or missing Wardrobe
bindings.
The same phase pre-creates stdout/stderr log files for every core/plugin
LaunchDaemon and assigns each file to the service user. This keeps plugins that
do not run as `hermes-host`, such as Codex Mobile, from failing launchd config
validation when their log files do not exist yet.
The `run-first-start-preflight` phase points at
`scripts/macos-first-start-preflight.js --root <root> --network-mode <direct|proxy> --json`.
The `run-smoke-tests` guided command must call
`scripts/install-macos-production.sh --execute --phase run-smoke-tests` instead
of invoking closure validation directly. The phase wrapper then points at the
live app `scripts/macos-production-closure-validation.js --root <root> --base
<url> --allow-provider-auth-pending --skip-wardrobe-binding --json` and wraps
its bounded output as an installer report.
Codex Mobile LaunchDaemon generation is profile-aware: when the operator's
`codex-profiles.json` exists, generated `CODEX_HOME` and any shared-Mux
endpoint must follow that active profile instead of the desktop/default
`.codex` home. Existing production deploys also repair this plist drift before
declaring the deployment healthy.

- Codex/ChatGPT/Hermes official login.
- Gmail/Hotmail/Google/Outlook/other OAuth authorization.
- Router/DDNS/reverse-proxy setup outside the Mac.
- macOS security/privacy prompts.
- Plugin business account setup when the plugin requires external login or
  one-time verification.

## launchd Services

Service examples:

```text
com.hermesmobile.listener
com.hermesmobile.gateway.hm-owner.openai.1
com.hermesmobile.gateway.hm-wuping.openai.1
com.hermesmobile.gateway.hm-stephen.openai.1
com.hermesmobile.cron
com.hermesmobile.plugin.finance
com.hermesmobile.plugin.wardrobe
com.hermesmobile.plugin.health
com.hermesmobile.plugin.email
```

The plist must set:

- service user;
- working directory;
- environment variables;
- stdout/stderr log paths;
- restart policy;
- explicit absolute command paths.

Do not depend on interactive shell rc files such as `.zshrc`. launchd services
must run with explicit paths and env.

## Gateway Runtime

Mac official Hermes runtime should live outside the app checkout:

```text
/Users/example/path
/Users/example/path
```

Gateway profiles should be generated from Hermes Mobile manifest and
workspace-provisioning data, not by hand.

Each generated profile must bind:

- one workspace id;
- one provider family;
- one permission tier;
- one Skill Store path;
- one Memory Store path;
- plugin MCP blocks only when the workspace has the matching plugin config/key.

No profile should expose `allowedWorkspaceIds=["*"]` except explicitly
documented special profiles such as Grok if that topology is retained.

## CRON And Automation

CRON remains a canonical workflow and must go through the Hermes Mobile
dispatcher wrapper. Do not run plain official Hermes CRON as production parity.

In direct mode:

- model-backed CRON may run without process proxy env;
- first-start preflight must prove direct outbound model access;
- failed direct egress should produce a network-mode diagnostic.

In proxy mode:

- model-backed CRON must have configured/reachable proxy env;
- missing proxy is a fail-closed preflight/job error.

`no_agent` script jobs remain exempt from model egress checks.

## Data And Backup

Mac local SSD is the hot production data store. NAS is backup/cold storage.

Do not put live SQLite DBs on an NAS network volume.

Backup policy:

- backup app version, data snapshot, runtime config metadata, and migration
  report before production upgrades;
- use SQLite-safe backup or service quiesce for DB snapshots;
- copy backups to NAS after local consistency is established;
- record only backup path, commit, counts/status, and validation result.

Do not store raw access keys, OAuth tokens, cookies, plugin launch tokens,
private user content, transcripts, ledger rows, or long logs in deployment
docs or handoffs.

## First-Start Preflight

The Mac first-start preflight must fail closed if any of these are false:

Run it with:

```bash
node scripts/macos-first-start-preflight.js --root /Users/example/path --network-mode direct --json
```

- `hermes-host` listener can start and report `/api/status?detail=1`.
- effective network mode is explicit: `direct` or `proxy`.
- direct mode proves model egress from launchd context, or proxy mode proves
  configured proxy reachability.
- Owner Access Key exists in a restricted secret file and is not printed after
  first creation.
- each workspace OS user exists and owns its private directory.
- non-Owner OS users cannot read Owner files, Skill Store, Memory Store, or
  plugin key files.
- each workspace Gateway profile is single-workspace.
- each worker can answer `/health` and a real Mobile run can select it.
- Owner warm OpenAI/Codex worker policy is configured.
- non-Owner workers are not warm by default unless explicitly configured.
- plugin MCP toolsets are exposed only when the selected workspace has the
  matching `.hermes-<plugin>` config/key.
- a plugin-bound topic uses the target workspace MCP/schema or omits the
  plugin toolset; it never falls back to Owner.
- workspace catalog paths resolve to the Mac live drive, not to Windows
  `C:\ProgramData\HermesMobile\data\drive` or WSL
  `/mnt/c/ProgramData/HermesMobile/data/drive` prefixes.
- every active workspace can create and preview the standard plugin
  delivery-directory roots under `插件/<plugin title>`.
- CRON official model jobs enter through the Hermes Mobile dispatcher wrapper.
- launchd services use explicit paths/env and do not depend on interactive
  shell configuration.

## Smoke Tests

Minimum smoke after install:

- `sudo /Users/example/path /Users/example/path --json`.
  This is the default Mac production closure gate after deployment, migration,
  Gateway/Profile repair, plugin provisioning, or ACL repair.
- `sudo /Users/example/path /Users/example/path --root /Users/example/path --base http://127.0.0.1:8797 --json`.
  Use this focused smoke after workspace catalog path repair, local workspace
  rename, directory ownership repair, or plugin-topic delivery-directory
  failures.
- Owner login and `/api/status?detail=1`, either directly or through the
  closure harness.
- Owner normal ChatGPT run, including the Owner/OpenAI concurrent product-route
  smoke in the closure harness.
- WuPing/Stephen/XuYan normal run, when those workspaces exist.
- Owner switching into WuPing proves target workspace data and plugin bindings.
- Finance/Wardrobe/Health/Email plugin launch, if installed and provisioned.
- `mcp_<plugin>_*` callable schema smoke for each provisioned plugin and
  selected profile.
- Directory listing and preview for each workspace.
- Web Push route origin, if enabled.
- CRON no-due dispatch.
- A controlled model-backed CRON smoke in the configured network mode.
- Restart Mac services through launchd and verify recovery.

## Harness Requirements

The Mac deployment harness should be separate from the NAS harness because the
failure modes differ.

Focused checks:

```text
node tests/macos-production-closure-validation-harness.test.js
node tests/macos-plugin-directory-production-smoke-harness.test.js
node tests/macos-production-profile-audit.test.js
node tests/macos-worker-filesystem-access-harness.test.js
node tests/gateway-workspace-provisioning-service.test.js
node tests/cron-dispatcher-proxy-harness.test.js
```

Required scenarios:

- generated launchd plist has explicit user, env, working directory, and log
  paths;
- no service relies on `.zshrc`, `.bashrc`, or an interactive shell;
- file modes for workspace roots are private;
- non-Owner `sudo -u hm-wuping` cannot read Owner sensitive files;
- direct/proxy network modes produce the correct CRON behavior;
- plugin MCP schema smoke targets the exact selected Gateway profile;
- plugin delivery-directory smoke covers all active workspaces and fails on
  Windows/WSL path drift or Mac ownership/ACL errors;
- missing plugin config/key omits the plugin toolset instead of falling back;
- Owner/OpenAI concurrent product-route smoke finishes both runs and returns to
  `activeGlobal=0`;
- DeepSeek ordinary and Owner-maintenance routes use `deepseekgw1` and
  `deepseekmaint1`, respectively;
- clean public install can create Owner and then provision plugins on demand.

## Deployment Flow For The New Mac

When the Mac Studio arrives:

1. Create or confirm the administrator account.
2. Install Xcode Command Line Tools.
3. Clone the Hermes Mobile source.
4. Create a first draft of `scripts/install-macos-production.sh` and dry-run
   preflight.
5. Create `hermes-host` and one `hm-owner` workspace user.
6. Install Node, Python, official Hermes runtime, and Codex/Hermes CLI.
7. Run listener plus one Owner Gateway worker.
8. Verify direct network mode through the soft-router gateway.
9. Migrate or initialize Owner workspace data.
10. Provision one plugin and one plugin MCP wrapper.
11. Add non-Owner workspace users one by one.
12. Run first-start preflight and smoke.
13. Only after stable validation, consider moving public reverse proxy traffic
    from NAS/Windows to the Mac.

## Open Questions

- Whether Stage 2 file broker is required before first family production use or
  can follow after Stage 1 worker/MCP isolation.
- Whether plugin services should run under `hermes-host`, dedicated plugin OS
  users, or containers.
- Whether Mac production will use direct network mode permanently or keep proxy
  mode as a fast fallback.
- Whether Codex Mobile plugin should run locally on Mac or remain on the
  Windows development host until the public production topology stabilizes.
