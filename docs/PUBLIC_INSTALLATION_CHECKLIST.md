# Public Installation Checklist

Last updated: 2026-06-21.

Use this checklist when making README, installer, or deployment doc changes for
a public Home AI install or update. The current supported production install
track is macOS. Windows/WSL and NAS notes below are retained only as legacy or
external-worker context and must not be presented as the primary fresh-install
path.

## Source Of Truth

- Public repo metadata: `package.json`
- Main README: `README.md`
- Deployment module: `docs/MODULES/deployment.md`
- macOS deployment plan: `docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md`
- Gateway manifest reference: `docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md`
- Public export checklist: `docs/PUBLIC_EXPORT_CHECKLIST.md`

## Productized Change Gate

Before a fix, architecture change, or deployment script change is treated as
complete, confirm that a fresh public install can reach the same supported
behavior through documented setup. Do not require private Mac/Windows user
paths, copied `auth.json` or plugin keys, maintainer-only environment variables,
manual database edits, or hidden one-time approvals.

Environment-specific configuration is acceptable only when the installer,
runtime UI, manifest, or preflight tells the operator exactly what to provide
and fails closed with a bounded diagnostic when it is missing.

Before a fresh install or public update is treated as ready, run the
machine-readable public install preflight:

```bash
node scripts/public-install-preflight.js --json
```

Use `--source-only` only for source/CI validation. Full host mode checks
Node.js 22+, Python 3.12+, Git, required install/deploy scripts, package
metadata, and `config/public-plugin-sources.json` public HTTPS GitHub plugin
sources.
If the system `python3` is older but a supported Python is installed elsewhere,
point the preflight at it explicitly:

```bash
HOMEAI_PYTHON=/path/to/python3.12 node scripts/public-install-preflight.js --json
```

The equivalent CLI form is `--python-command /path/to/python3.12`.

The macOS installer entrypoint is:

```bash
bash scripts/install-macos-production.sh --json
```

For a fresh macOS install, the guided entrypoint is:

```bash
bash scripts/install-macos-production.sh --execute --guided --root /Users/example/path --json
```

Guided mode executes only the non-privileged automatic phases that create the
install directory layout, copy the fresh app source into an empty app root, pin
the Node runtime, install production npm dependencies, create the Owner key
file, write the Gateway manifest/profile skeleton, CRON scaffold, plugin
source/provisioning plans, and launchd staging plans. It then reports the
remaining operator phases with exact commands. It does not create macOS users,
apply ACLs, install files under `/Library/LaunchDaemons`, copy provider
credentials, start services, or run live smoke tests without the explicit phase
gates below. The guided JSON report includes `guidedPlan.operatorSteps`, which
lists each remaining command, sudo gate, required evidence, and risk boundary.

Before treating a source checkout as fresh-install ready, run the source-only
rehearsal:

```bash
node scripts/macos-fresh-install-rehearsal.js --json
```

This creates a temporary install root, executes the no-sudo staging/config
phases, verifies the key fresh-install artifacts are written, and removes the
temporary root unless `--keep-temp` is supplied.

Then verify the phase evidence classes:

```bash
node scripts/macos-install-verification-classification.js --json
```

The classification audit labels every installer phase as `source_check`,
`source_rehearsed`, `external_input`, `privileged_apply`, or `live_runtime`.
Use it to separate phases already proven by source-only rehearsal from phases
that still require operator-provided paths, sudo/apply execution, or live
production validation.

Then generate the operator closure checklist:

```bash
node scripts/macos-install-operator-closure-checklist.js --markdown
```

This checklist turns every `external_input`, `privileged_apply`, and
`live_runtime` phase into explicit commands, required evidence, operator
inputs, and risk boundaries. A public install is not closed by source-only
rehearsal until the operator closure items have been performed or explicitly
deferred with evidence.

For guided installs, prefer the machine-readable
`guidedPlan.operatorSteps` emitted by `--execute --guided` for the next commands
against the selected root. The separate checklist remains the source-level audit
that verifies every phase has an operator closure definition.

It is currently a dry-run, phase-based plan by default. `--execute --guided`
runs the safe automatic fresh-install phases in one command, but it still does
not create users, install launchd services, or write provider/plugin secrets
until each privileged or live-runtime phase is explicitly closed.
The `create-service-users` phase is executable but conservative: by default it
audits the required macOS service users and fails closed if any are missing.
It creates missing users only when run as root with
`HOMEAI_INSTALL_ALLOW_USER_CREATE=1`. Existing users are reported but not
modified.
The `configure-owner` phase is executable. It creates a missing Owner Web
Access Key file at `data/secrets/owner-web-key.secret` with `0600`
permissions, tightens an existing key file's mode when needed, and never
prints the key contents. It fails closed if an existing key file is empty or
not a regular file.
The `configure-workspace-isolation` phase is executable. It creates the
baseline workspace data roots, upload/artifact roots, and Skill/Memory store
roots from a bounded workspace map. By default it does not apply macOS ACLs or
change OS ownership. ACL/ownership repair requires root and
`HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1`.
The `configure-gateway-profiles` phase is executable for fresh installs. It
creates `data/gateway-pool-manifest-mac.json`, per-worker Mobile-to-Gateway
API key files under `data/secrets/gateway-workers`, and profile `config.yaml`
skeletons from the Gateway profile template builder. A fresh manifest includes
ordinary OpenAI/Codex and DeepSeek workers for each workspace plus Owner Grok
and Owner maintenance workers. It preserves a non-empty existing manifest
instead of rewriting it, fails closed if inline worker API keys are present,
and records `authStatus: provider-auth-not-copied` because provider OAuth
state, browser credentials, and provider API keys are still external setup
inputs.
The `configure-plugins` phase is executable. By default it runs in `plan`
mode: it validates `config/public-plugin-sources.json`, creates the production
`plugins` root, and writes `data/plugin-source-plan.json` without creating
empty plugin directories or workspace grants. With explicit
`--plugin-source-mode clone` or `HOMEAI_INSTALL_PLUGIN_SOURCE_MODE=clone`, it
clones missing plugin source checkouts from the public HTTPS GitHub URLs and
fails closed if a target exists but is not a Git checkout.
The `configure-cron` phase is executable. It creates the official Hermes CRON
home scaffold under `data/hermes-home`, preserves any existing
`cron/jobs.json`, creates an empty canonical `{ "jobs": [] }` store only when
missing, installs dispatcher/helper scripts under `data/hermes-home/scripts`,
copies source-controlled productivity Skills into `data/hermes-home/skills`,
and writes `data/cron-config-plan.json`. It does not create business
automation jobs and does not install or load `com.hermesmobile.cron`.
The `create-directory-layout` phase is executable and idempotent; it creates
only the standard app/data/runtime/plugin/log/temp directory layout and reports
empty-directory rollback commands.
The `install-hermes-mobile` phase is also executable for fresh installs, but it
fails closed unless `root/app` is empty. It copies source files while excluding
private/local state such as `.git`, `.agent-context`, `.env*`, `node_modules`,
logs, mounts, temp directories, and deployment backups. Use the central deploy
script, not this installer phase, for updating an existing production app.
Read-only phases are also executable. For example:

The maintained phase order is audited by
`scripts/macos-install-phase-coverage-audit.js`: `system-preflight`,
`install-dependencies`, `create-service-users`, `create-directory-layout`,
`install-hermes-mobile`, `install-official-hermes-runtime`, `configure-owner`,
`configure-workspace-isolation`, `configure-gateway-profiles`,
`install-gateway-launchd-services`, `repair-gateway-worker-acl`,
`configure-cron`, `configure-plugins`,
`plan-plugin-workspace-provisioning`, `install-launchd-services`,
`run-first-start-preflight`, `run-smoke-tests`, and `print-access-info`.

```bash
bash scripts/install-macos-production.sh --execute --phase create-directory-layout --root /Users/example/path --json
```

Then verify or create the macOS service users:

```bash
bash scripts/install-macos-production.sh --execute --phase create-service-users --root /Users/example/path --json
```

If the report returns `service_user_missing`, rerun with explicit
administrator approval:

```bash
sudo HOMEAI_INSTALL_ALLOW_USER_CREATE=1 bash scripts/install-macos-production.sh --execute --phase create-service-users --root /Users/example/path --json
```

Use `--service-users hermes-host,hm-owner,...` or `HOMEAI_SERVICE_USERS` when a
deployment has a different workspace-user set. The phase validates user names,
uses macOS `dscl`, reports bounded action metadata, and never rewrites existing
users.

Then configure the Owner Web Access Key:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-owner --root /Users/example/path --json
```

Use `--owner-key-file /path/to/owner-web-key.secret` or
`HOMEAI_OWNER_KEY_FILE` for a non-standard secret path. The generated key is
not printed by the installer; the operator must retrieve it through a secure
local channel for first login or set the file from an external secret manager
before running this phase.

Then create the baseline workspace isolation scaffold:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-workspace-isolation --root /Users/example/path --json
```

Use `--workspace-map workspaceId:macUser:driveName,...` or
`HOMEAI_WORKSPACE_MAP` for a different workspace set. The default map includes
Owner and the maintained family workspace examples. To apply macOS ownership
and ACL repairs for existing service users, rerun with explicit administrator
approval:

```bash
sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash scripts/install-macos-production.sh --execute --phase configure-workspace-isolation --root /Users/example/path --json
```

This phase does not replace the later Gateway/profile provisioning stage. It
does not create per-profile key files, Gateway profile directories, or
LaunchDaemons, and it does not prove the final workspace deny/allow matrix.
Run the worker filesystem access harness after Gateway/profile provisioning
and data migration.

Then create the Gateway manifest/profile skeleton:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-gateway-profiles --root /Users/example/path --json
```

Use these options to tune the skeleton:

- `--gateway-openai-workers <n>` / `HOMEAI_GATEWAY_OPENAI_WORKERS`, default
  `2`, bounded to `1..4`.
- `--gateway-deepseek-workers <n>` / `HOMEAI_GATEWAY_DEEPSEEK_WORKERS`,
  default `1`, bounded to `0..2`.
- `--gateway-owner-grok-workers <n>` /
  `HOMEAI_GATEWAY_OWNER_GROK_WORKERS`, default `1`, bounded to `0..1`.
- `--gateway-owner-maintenance-openai-workers <n>` /
  `HOMEAI_GATEWAY_OWNER_MAINTENANCE_OPENAI_WORKERS`, default `2`, bounded to
  `0..2`.
- `--gateway-owner-maintenance-deepseek-workers <n>` /
  `HOMEAI_GATEWAY_OWNER_MAINTENANCE_DEEPSEEK_WORKERS`, default `1`, bounded
  to `0..2`.

The phase writes only worker API key files used by Home AI to call the local
Gateway processes. It does not copy ChatGPT/Codex auth, xAI OAuth, DeepSeek
provider keys, browser cookies, or plugin credentials. Configure those through
the provider-specific setup path before expecting workers to run model calls.

Then materialize Gateway worker LaunchDaemon definitions from the manifest:

```bash
bash scripts/install-macos-production.sh --execute --phase install-gateway-launchd-services --root /Users/example/path --json
```

By default this writes Gateway profile start scripts under each worker's
`.hermes-gateway` directory, stages
`data/launchd-staging/gateway/com.hermesmobile.gateway.*.plist`, and writes
`data/gateway-launchd-services-plan.json`. Gateway worker plists are
on-demand by default: `RunAtLoad=false` and `KeepAlive=false`.

After reviewing the Gateway launchd plan, use the same central privileged
apply gate:

```bash
sudo HOMEAI_INSTALL_LAUNCHD_APPLY=1 bash scripts/install-macos-production.sh --execute --phase install-gateway-launchd-services --root /Users/example/path --json
```

The apply gate copies the staged Gateway worker plist files into
`/Library/LaunchDaemons`, sets mode `0644`, runs best-effort
`launchctl unload -w`, and then runs `launchctl load -w` for every enabled
Gateway manifest worker. It does not embed provider secrets in plist files or
start scripts; the worker start script reads the per-worker API key file and
provider key file at runtime.

Then write the Gateway worker ACL plan:

```bash
bash scripts/install-macos-production.sh --execute --phase repair-gateway-worker-acl --root /Users/example/path --json
```

After reviewing `data/gateway-worker-acl-plan.json`, apply the macOS ACL and
ownership repair:

```bash
sudo HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1 bash scripts/install-macos-production.sh --execute --phase repair-gateway-worker-acl --root /Users/example/path --json
```

This phase grants each `hm-*` Gateway worker read access to the live Gateway
manifest, its own worker API key file, provider key files such as
`deepseek-api-key.secret` when present, and the bridge-host secret file. It
also grants traverse access to required parent directories and makes the
worker's generated profile directory owned by the target worker user. It does
not print or copy secret values.

Then configure plugin source installation:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-plugins --root /Users/example/path --json
```

The default writes only `data/plugin-source-plan.json`. To clone public plugin
source checkouts during first install, use:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-plugins --root /Users/example/path --plugin-source-mode clone --json
```

This phase does not create `.hermes-<plugin>` workspace key/config
directories, does not grant any workspace plugin access, and does not bootstrap
plugin LaunchDaemons. Workspace-local plugin provisioning remains a plugin
manager / onboarding action after the plugin service is installed and healthy.

Then write the first-run workspace plugin provisioning plan:

```bash
bash scripts/install-macos-production.sh --execute --phase plan-plugin-workspace-provisioning --root /Users/example/path --json
```

The phase writes `data/plugin-workspace-provisioning-plan.json` from
`config/public-plugin-sources.json`, `--workspace-map`, current
`plugin-workspace-authorizations.json`, and existing `.hermes-<plugin>`
binding files. It includes the ordinary default family business plugins:
Wardrobe, Health, Finance, Email, Note, and Growth. It explicitly excludes
special Owner-only plugins such as Codex Mobile and Music. This phase is
read/write only for the plan file: it does not create plugin keys, workspace
grants, launch tokens, or plugin-owned database rows, and it does not call
plugin bind/register endpoints. After plugin services are installed and
healthy, apply actual provisioning through `/api/workspace-onboarding/apply`
or the Owner plugin manager so each plugin's own server-side bind/register
contract runs.

Then configure the official Hermes CRON scaffold:

```bash
bash scripts/install-macos-production.sh --execute --phase configure-cron --root /Users/example/path --cron-network-mode direct --json
```

Use `--cron-network-mode proxy` only when model-backed CRON jobs must use the
deployment proxy path. This phase creates the canonical CRON store and helper
files but no scheduled business jobs. The LaunchDaemon remains a later install
phase; after launchd is installed, run:

```bash
node scripts/macos-automation-cron-audit.js --root /Users/example/path --strict-config --strict-source --strict-status --json
```

Then stage the launchd service definitions:

```bash
bash scripts/install-macos-production.sh --execute --phase install-launchd-services --root /Users/example/path --json
```

This phase writes `data/launchd-staging/*.plist` and
`data/launchd-services-plan.json` for the core services:
`com.hermesmobile.listener`, `com.hermesmobile.bridge-host`,
`com.hermesmobile.cron`, `com.hermesmobile.workspace-system-helper`, and
`com.hermesmobile.production-drift-audit`. It also stages plugin plist files
for the public plugin set: Codex Mobile, Email, Finance, Growth, Health,
Moira, Music, Note, and Wardrobe. By default it does not write
`/Library/LaunchDaemons`, does not load services, and does not restart the
host. The plan is the auditable input for the privileged launchd install step.
Codex Mobile plist generation resolves `CODEX_HOME` from the active profile in
`/Users/<operator>/.codex-mobile-web/codex-profiles.json` when that store is
present. Do not hard-code the Desktop/default `.codex` home when the active
profile is `current` or `previous`; the generated shared-Mux endpoint must use
the same resolved Codex Home.

After reviewing `data/launchd-services-plan.json`, run the central privileged
install/load gate:

```bash
sudo HOMEAI_INSTALL_LAUNCHD_APPLY=1 bash scripts/install-macos-production.sh --execute --phase install-launchd-services --root /Users/example/path --json
```

The apply gate copies the staged plist files into `/Library/LaunchDaemons`,
sets mode `0644`, runs `launchctl unload -w` as an idempotent best-effort
cleanup, and then runs `launchctl load -w` for every staged core and public
plugin service. It keeps the same `data/launchd-services-plan.json` as the
audit record and marks `launchdInstalled` / `launchdLoaded` only after every
service load succeeds.

Then install Home AI source into an empty app directory:

```bash
bash scripts/install-macos-production.sh --execute --phase install-hermes-mobile --root /Users/example/path --app-source /path/to/HomeAI --json
```

Then pin the production Node runtime:

```bash
bash scripts/install-macos-production.sh --execute --phase install-official-hermes-runtime --root /Users/example/path --node-command /path/to/node --json
```

The runtime phase requires Node.js `>=22`, creates
`runtime/node-current/bin/node` as a symlink to the requested Node executable,
is idempotent when the link already points at the same executable, and fails
closed when an existing runtime link points elsewhere.

Then install production dependencies:

```bash
bash scripts/install-macos-production.sh --execute --phase install-dependencies --root /Users/example/path --npm-command /path/to/npm --json
```

The dependency phase requires `app/package.json` and `app/package-lock.json`,
runs `npm ci --omit=dev --no-audit --no-fund` in `root/app`, sets
`NODE_ENV=production`, and reports only bounded metadata plus a truncated
failure sample. It fails closed instead of falling back to `npm install` when
the lockfile is missing.

Then run first-start preflight:

```bash
bash scripts/install-macos-production.sh --execute --phase run-first-start-preflight --network-mode direct --json
```

The launchd staging command is not the final privileged install. The apply
gate above is the operator-approved boundary for installing and loading core
and public plugin LaunchDaemons.

After the install phases have created runtime state, run the read-only
first-start preflight:

```bash
node scripts/macos-first-start-preflight.js --root /Users/example/path --network-mode direct --json
```

Use `--network-mode proxy` instead when the target host is intentionally routed
through a local proxy.
This preflight must fail if the earlier
`plan-plugin-workspace-provisioning` phase did not write
`data/plugin-workspace-provisioning-plan.json`. The plan is required evidence
that default business plugin provisioning was considered for each workspace,
but it is still plan-only: actual plugin grants and plugin-owned rows are
created later through onboarding or the Owner plugin manager.

On an already hardened production root, files such as the Gateway manifest and
Owner Access Key are intentionally restricted. In that case run the same
read-only preflight through the production Node runtime with operator sudo
rather than loosening file permissions:

```bash
sudo /Users/example/path scripts/macos-first-start-preflight.js --root /Users/example/path --network-mode direct --base http://127.0.0.1:8797 --json
```

A non-sudo `gateway_manifest_unreadable` or `owner_key_file_unreadable` result
on a hardened production root is an operator-context mismatch, not evidence
that the secret files should be made world-readable.

Then run the aggregate production closure smoke through the installer phase:

```bash
sudo bash scripts/install-macos-production.sh --execute --phase run-smoke-tests --root /Users/example/path --base http://127.0.0.1:8797 --json
```

This phase invokes
`<root>/app/scripts/macos-production-closure-validation.js` with the pinned
production Node runtime when present, wraps the result as bounded installer
JSON, and remains read-only. On a hardened production root it should be run
with operator sudo because the closure harness reads restricted manifest,
Access Key, workspace, and plugin-binding metadata. Passing output must have
`ok=true` both for the phase report and for the embedded closure summary.

Mac production installs and updates must also keep the drift-prevention
baseline discoverable through `node scripts/production-self-diagnostics.js`.
The maintained baseline includes the Home AI deploy plan drift gate, the
bounded production drift reconcile script, and the periodic drift audit
watchdog. It also includes
`scripts/macos-workspace-file-broker-boundary-checklist.js`, which records that
Stage 1 worker/MCP isolation is the current production minimum and that Stage 2
workspace file broker closure is not proved by ACL checks alone. It also
includes the read-only Web Push production audit:

```bash
node scripts/macos-web-push-production-audit.js --source-check --json
node scripts/macos-web-push-production-audit.js --root /Users/example/path --public-origin <external-origin> --require-public-origin --require-active-external-subscription --json
```

The `--source-check` command is the default repository gate and uses a temporary
fixture. Run the real-root audit after at least one target device re-registers
Web Push from the external production origin. A deployment flow that bypasses
these checks is not equivalent to the supported Mac production path.

## Minimum Install

The minimal path requires:

- Node.js 22 or newer.
- Python 3.12 or newer.
- One reachable official Hermes Gateway API server.
- A data directory outside Git.
- macOS service users for the host listener and each workspace, for example
  `hermes-host` plus `hm-owner` and other `hm-*` workspace users.
- Owner Access Key setup under a restricted server-side secret file.
- Hermes API key configured through path/env or Owner runtime UI.

This path can run Hermes Mobile, but it does not create the production worker pool and may not support `@Grok4.3` unless the single Gateway profile is already configured for xAI OAuth.

## NAS Deployment

The current practical NAS path is a split deployment: NAS runs Hermes Mobile
app/data/static/proxy surfaces, while Windows/WSL keeps Gateway workers, Codex
local execution, Grok/xAI OAuth, and desktop/browser-bound bridge flows. Do not
document full NAS-native Gateway Pool as ready until Linux/NAS launchers,
credential placement, remote worker management, plugin provisioning, and
workspace-switching harnesses exist.

A NAS-local single worker manifest, for example one `nas-local-codex` entry
pointing at `127.0.0.1:8642`, is only a bootstrap/runtime bridge. It satisfies
the user-level fail-closed contract, but it is not equivalent to the maintained
Windows production hybrid pool:

- it has no Owner warm-worker baseline;
- it has no per-workspace/per-provider candidate expansion;
- it cannot start additional workers on demand;
- it may show `Gateway selected` instead of `Gateway reused`;
- it will queue or wait behind the single worker under concurrent use.

If a deployment guide claims production parity with the maintained Windows
environment, it must either connect NAS to the real external Gateway Pool
through a validated remote worker manifest/manager or implement and test a
NAS-native worker launcher. Do not present a single worker manifest as the
recommended production topology for a family multi-user install.

If Codex CLI is installed and logged in on NAS, use it only as the deployment
agent's local tool. It does not replace the external Hermes Gateway/Codex
runtime path for Hermes Mobile users.

After a NAS deployment becomes the family production environment, NAS owns the
production data. Windows remains the development and external-worker host.
Publish code from Windows to NAS through Git/deploy, and copy NAS data back only
as backups or isolated debug snapshots. Do not configure bidirectional live sync
for SQLite, runtime state, plugin keys, Skill Stores, learning/currency ledgers,
or task/message data.

When updating an existing NAS production app, deploy all changed frontend
modules and supporting service files that participate in the current static
client version. Updating only `index.html`, `service-worker.js`, and the cache
harness can leave NAS serving an old UI/event module with a new shell version,
which is enough to reintroduce blank waits before Gateway progress appears.

NAS maintenance keys must be stored as restricted secret files or OS-managed
credentials. Public docs, handoffs, chat messages, and commits may record only
the secret path and permission boundary, never the raw key.

## Plugin First-Run Provisioning

A fresh public install starts with empty Hermes and plugin databases unless the
operator intentionally imports data. Empty plugin data is valid; incomplete
plugin provisioning is not.

Fresh setup/account creation must expose every deployable workspace-private
business plugin in one place and default them on for the ordinary family
workspace path: Wardrobe, Health, Finance, Email, Note, and Growth. Directory is
built in and is not deployed as an external plugin. Codex plugin edition is a
special Owner-oriented plugin and must not be silently granted as an ordinary
family workspace plugin.

The Mac deploy entrypoint must support both individual plugin deployment and an
all-plugin deployment plan. `npm run --silent deploy:macos -- --plugin all
--json` must expand to every known plugin service root, including Codex Mobile
Web, Email, Finance, Growth, Healthy/Health, Note, and Wardrobe, with restart
labels and loopback manifest smokes in the plan. The `health` plugin name may
be accepted as an operator-facing alias, but the production source/target
directory remains `healthy`.

Public installers must read `config/public-plugin-sources.json` for clone
sources. That manifest must use HTTPS GitHub public repository URLs only. The
Mac production deploy script still deploys from local source directories; it
does not clone or authenticate to GitHub on behalf of the operator.

For every workspace-private plugin that is enabled for Owner or another
workspace, verify:

- Hermes creates or discovers a workspace-local plugin key/config for that
  exact workspace.
- The plugin backend creates or confirms its own user/workspace/ledger/mailbox
  through a server-side bind/register endpoint.
- Required keyless Skill bundles and MCP/toolset registrations are present
  before model-callable plugin features are advertised.
- Plugin list, manifest, launch, and same-origin proxy use the effective target
  workspace, including the case where Owner switches into a non-Owner
  workspace.
- The plugin is marked `active` only after provisioning and launch smoke pass;
  otherwise the admin UI shows `pending`, `manual_required`, or
  `provisioning_failed`.

Do not copy Owner plugin keys, plugin sessions, browser cookies, launch tokens,
or plugin database rows into another workspace to make a fresh install look
pre-populated.

## Windows Production Worker Pool

The production-like path requires:

- Windows administrator shell for ProgramData directories, service/task setup, worker account, ACLs, and startup scripts.
- WSL root or sudo access for Gateway runtime/profile setup.
- Official-clean Hermes runtime package or an existing current Hermes install.
- `HermesMobileWorker` Windows account if using the reference isolated worker shape.
- `HermesGatewayWorker` WSL distro/user shape if using the reference Gateway Pool scripts.
- Gateway Pool manifest with no committed real secrets.
- Optional `grokgw1` profile with xAI OAuth completed separately.

## Required Restart Scripts

README/deployment docs must keep these restart boundaries clear:

- Listener/bridge host: `scripts/start-worker-host.ps1 -ReplaceExisting`
- Gateway Pool: `scripts/start-gateway-pool.ps1` or scheduled task `Hermes Mobile Gateway Pool`
- Cron sidecar: `scripts/start-cron-tick-sidecar.ps1 -ReplaceExisting`

Do not tell external installers to kill arbitrary `node`, `python`, or `wsl` processes as the normal restart method.

## Grok/xAI Checklist

- `grokgw1` or equivalent profile exists.
- Profile provider is `xai-oauth`.
- xAI OAuth is completed in the Gateway auth store.
- Manifest marks worker as `securityLevel: "user"` with the correct profile/port.
- Hermes Mobile UI exposes only supported Grok variants.
- If Automation/Cron jobs use `x_search`, bridge host must expose
  `/bridge/grok-gateway-proxy/v1/responses`; cron/plugin callers should use
  `HERMES_MOBILE_X_SEARCH_PROXY_URL=http://<windows-host>:8798/bridge/grok-gateway-proxy`
  when they cannot reach the Grok worker through their own loopback.
- If auth fails, fix Gateway profile auth first, then restart Gateway Pool.

## Public Export Safety

- Use `npm.cmd run export:public`.
- For a maintained public release, prefer `npm run release:public`; it wraps
  public export creation, source-only install preflight, public plugin source
  checks, public upgrade harness checks, and provisioning coverage before any
  optional public-repository sync.
- Do not publish `.agent-context`, runtime data, SQLite DBs, logs, uploads, backups, keys, OAuth state, push endpoints, worker manifests with real API keys, or private reports.
- Run privacy scan and productization checks according to the release scope.

## Public Online Updates

- Maintainer-side publication is separate from friend/operator-side upgrade.
  A public release should first be closed from the private source tree:

  ```bash
  npm run release:public -- --json
  npm run release:public -- --execute --out /tmp/Home-AI-Public-export --json
  ```

  Publishing to the public Git checkout requires all explicit gates:

  ```bash
  npm run release:public -- --execute --out /tmp/Home-AI-Public-export \
    --public-repo /path/to/Home-AI-Public \
    --sync-public-repo \
    --commit-public \
    --push-public \
    --commit-message "Publish Home AI public release" \
    --json
  ```

  The release script must not print or copy raw secrets, provider credentials,
  OAuth state, access keys, cookies, launch tokens, or private runtime data.
- Before asking a friend/operator machine to run a mutating upgrade, run the
  public target rehearsal against the published public repo:

  ```bash
  npm run rehearse:public-upgrade -- --json
  npm run rehearse:public-upgrade -- --execute --json
  ```

  The rehearsal clones the public repo to a temporary root, runs source-only
  preflight, verifies missing plugin sources fail closed without
  `--clone-missing-plugins`, and verifies the explicit clone gate produces
  clone/deploy/closure-validation plan actions. It must not mutate production
  or print secrets.
- When a new Mac is available over SSH, run the remote public deployment smoke
  before attempting a production install or upgrade:

  ```bash
  npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --json
  npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --execute --json
  npm run remote:public-deploy-smoke -- --ssh-target <macbook-air-ssh-alias> --execute --cycle-install --json
  ```

  This clones the published public repository into a target-side temporary
  root, runs public source preflight, macOS fresh-install rehearsal, and public
  upgrade rehearsal, then removes the temp root by default. If the target Mac
  does not have `node`/`npm`, the smoke downloads a temporary Node runtime under
  the remote temp root and uses it only for that smoke. It does not create
  service users, install LaunchDaemons, run production `upgrade:public
  --execute`, restart services, or copy credentials. Add `--run-guided-install`
  only after the basic smoke passes and you want to exercise guided automatic
  install phases in the sandbox root. Add `--cycle-install` for first-machine
  acceptance: guided install in the sandbox root, delete the sandbox target
  root, then guided reinstall. Add
  `--execute-production-upgrade --production-root <root>` only for an approved
  real production mutation.
- Public deployments should keep the Home AI checkout and plugin checkouts as
  Git repositories with HTTPS public remotes.
- The maintained source-and-runtime upgrade entrypoint is:

  ```bash
  npm run upgrade:public -- --json
  npm run upgrade:public -- --execute --reason public-upgrade --json
  ```

  The first command is plan-only. The second command is Owner/operator-only and
  performs clean fast-forward source updates, dependency installs when tracked
  dependency files changed, Home AI/plugin deployments for changed or newly
  cloned sources, and provider/profile closure validation.
- `config/public-plugin-sources.json` is the source inventory. It includes
  Moira and Movie as deployable plugins. Moira uses the public
  `MOIRA_chinese_astrology_public` repository. Movie currently requires
  operator-authenticated repository read access and is marked
  `operatorAuthenticated`; it is not an anonymous default public plugin.
- Hermes Agent is a deployment dependency because Gateway provider access can
  route through the official Hermes Agent runtime. Updating the Hermes Agent
  source requires explicit `--update-hermes-agent`, and dependency refresh
  requires `--install-hermes-agent-dependencies`. After any Hermes Agent update,
  the upgrade must run the production profile/provider audit and closure
  validation; it must not print raw provider credentials or OAuth state.
- Owner login checks `/api/app-update/status`. The response covers both Home AI
  and plugin source directories declared in `config/public-plugin-sources.json`.
- The in-app update action is Owner-only and fast-forward-only. It must fail
  closed on a dirty worktree, missing checkout, non-fast-forward remote, or
  unreadable plugin source directory.
- The older in-app apply path remains a bounded source-update surface. For full
  public runtime closure, prefer `npm run upgrade:public` because it couples
  source fast-forward, deployment, Hermes Agent/provider checks, and production
  closure validation. If the in-app source updater still uses
  `HERMES_MOBILE_POST_UPDATE_COMMAND` or `HERMES_WEB_POST_UPDATE_COMMAND`, the
  command must be local operator-owned and must not contain raw secrets.
- Do not silently auto-apply updates for every login. The product default is:
  check on Owner login, show the update badge, then apply after Owner action.

## Known Follow-Up

The current README contains older Chinese public-update text that may render as mojibake in some tools. Do not do a casual whole-file rewrite on Windows; clean it in a separate UTF-8-safe documentation polish pass.
