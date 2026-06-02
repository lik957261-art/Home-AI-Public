# NAS Deployment Plan

This note defines the first practical NAS deployment shape for Hermes Mobile.
It is a deployment plan, not proof that a NAS-native runtime already exists.

## Current Decision

Use a split deployment first:

- NAS runs the Hermes Mobile web app, static client, SQLite runtime state, data
  directory, plugin same-origin proxy, and HTTPS reverse-proxy entry.
- Windows/WSL continues to run official Hermes Gateway workers, Codex-local
  execution, Grok/xAI OAuth workers, and any worker launcher that depends on
  PowerShell, WSL registration, or local browser/auth state.
- Hermes Mobile on NAS talks to a reachable Gateway API endpoint or fixed remote
  worker manifest. It must not receive raw Codex credentials, local browser
  OAuth state, or direct shell authority over the Windows worker machine.

This is the only deployment shape that is close to usable today. A fully
NAS-native Gateway Pool is a separate engineering project.

## Dev/Production Split And Data Policy

If the NAS deployment succeeds, treat NAS as the production environment and the
current Windows machine as the development and worker environment:

- NAS is the production Hermes Mobile web/data origin for family use.
- Windows remains the development checkout, debugging environment, and current
  external Gateway/Codex/Grok worker host.
- Code moves from Windows development to NAS production by Git commit, push,
  and an explicit NAS deploy of a selected commit.
- Production runtime data is owned by NAS. Do not run the Windows development
  app against the NAS production SQLite database as an ordinary workflow.

Do not implement live bidirectional data sync between Windows and NAS for the
first cut. Hermes Mobile production data includes SQLite state, workspace drive
files, plugin authorization and provisioning records, workspace-local plugin
keys, Web Push records, Skill Stores, task/message state, Inbox state, learning
records, currency ledgers, and session/proxy cookies. These are not safe to
merge as two active writers.

The supported data direction is:

- **Code:** Windows development -> Git -> NAS deploy.
- **Production data:** NAS is authoritative.
- **Backups:** NAS -> backup storage and optional Windows copy for recovery or
  debugging.
- **Debug data:** copy a NAS backup into a separate Windows dev data directory
  when reproduction is needed; never automatically write that dev copy back to
  NAS.

Before every NAS production upgrade:

1. Confirm the target commit and record it in the NAS handoff.
2. Confirm no critical active runs or user-facing writes are in progress.
3. Create a timestamped backup of the NAS `data/` directory and SQLite DB.
4. Deploy the new `app/` tree from a clean Git checkout.
5. Run smoke checks.
6. Roll back the `app/` tree if smoke fails. Treat data migrations separately;
   do not blindly overwrite NAS production data from Windows.

SQLite backup must be consistency-aware. Prefer stopping/quiescing the NAS
listener, using SQLite backup tooling, or taking a storage snapshot that is
known to be consistent. Do not rely on a blind file copy while the app is
writing.

If a production data repair is needed, apply it on NAS through a small
auditable script after backing up data. Record only the script path, affected
record ids/counts, status, and validation result; do not record private content
or raw secrets.

## Maintenance Ownership

Long-term NAS maintenance should be coordinated from the Hermes Mobile thread
as the release/control plane, while NAS-side facts should still be verified on
the NAS host before actions that depend on local paths, permissions, process
state, or reverse-proxy configuration.

Recommended responsibility split:

- Hermes Mobile thread: architecture decisions, release selection, impact
  assessment, deploy/runbook updates, rollback plan, and cross-module harness
  interpretation.
- NAS thread or NAS-side shell: current host facts, service status, filesystem
  paths, permissions, reverse-proxy state, first-deploy execution, and local
  smoke evidence.
- After the first deployment stabilizes, routine NAS deploys may be driven by
  the Hermes Mobile thread if it has a safe maintenance entrypoint.

Do not paste NAS maintenance keys, SSH private keys, access tokens, cookies, or
one-time codes into chats, docs, handoffs, commits, or logs. Store credentials
only in restricted local secret files or the NAS secret store. In conversation
and docs, record only:

- the secret file path;
- the intended use;
- which service/account may read it;
- rotation/revocation notes;
- bounded status/verification results.

Suggested secret-path examples:

```text
Windows operator side: <operator-home>\.hermes\nas-maintenance-key.secret
NAS side: /volume1/docker/hermes-mobile/data/secrets/maintenance-key.secret
```

These are examples only. The actual deployment must choose paths that match the
host's account and permission model.

A future NAS maintenance contract should define:

- connection method: SSH, HTTPS maintenance API, Tailscale address, or another
  explicit channel;
- authentication: secret file path or OS credential store, never raw chat text;
- allowed operations: read status, pull a selected commit, back up `data/`,
  deploy `app/`, restart the NAS listener, and smoke `/api/status`;
- forbidden operations: print secrets, delete production data, overwrite
  SQLite without backup, restart during active writes without approval, expose
  Gateway/bridge/plugin backend ports publicly, or copy Codex/browser OAuth
  state to NAS;
- audit record: commit, backup path, changed files or package id, checks run,
  smoke result, and rollback status.

Until that contract exists and is tested, do not give the NAS app broad shell or
remote-worker authority. Keep maintenance actions explicit and reversible.

## Current Source Baseline

For the first NAS thread handoff, deploy from the private Hermes Mobile repo
after commit:

```text
83c0904 完善 Gateway 调度与插件开通回归
```

That commit includes the recent Gateway hybrid/on-demand scheduling fixes,
Grok bridge proxy route, plugin workspace/session isolation fixes, Wardrobe
complete Skill bundle provisioning, and this NAS deployment plan. A NAS
deployment thread should still run `git pull` or clone from the private repo
and record the exact deployed commit before starting.

Do not copy the live Windows production directory as the source of truth. Use a
clean Git checkout plus a NAS-owned data directory.

## Goals

- Move the long-lived Hermes Mobile app/data surface onto NAS storage.
- Keep runtime data outside the Git checkout.
- Preserve workspace isolation, plugin session isolation, and Owner switching
  behavior.
- Preserve per-user Skill Store and Memory Store behavior when moving Gateway
  execution from Windows to NAS.
- Keep Codex, ChatGPT Pro, xAI OAuth, and worker profile credentials on the
  machine/account that actually owns those credentials.
- Keep public exposure behind a hardened reverse proxy.

## Non-Goals For First NAS Cut

- Do not run the Windows/WSL on-demand Gateway Pool launcher on NAS.
- Do not expect NAS Codex CLI login to make Hermes Mobile Gateway/Codex worker
  execution available automatically. A logged-in `codex` command on NAS is
  useful for that NAS thread's development/deployment work; it is not the same
  as the Hermes Mobile Gateway Pool, Codex Mobile worker, ChatGPT Pro bridge,
  or a shared user-facing model backend.
- Do not copy `.agent-context`, `.codegraph`, local upload scratch, logs, worker
  telemetry databases, browser profiles, OAuth state, or raw access keys into
  Git or a portable package.
- Do not use a personal Codex/ChatGPT login as a generic shared model backend
  for unrelated users. Personal Codex task execution should remain a local
  worker/Mux integration boundary.
- Do not claim full NAS support for Weixin/iLink, ChatGPT Pro, Grok, Finance,
  Wardrobe, or Codex plugin flows until each flow has been smoke-tested through
  the NAS public origin.

## Deployment Modes

### Mode A: NAS App + External Gateway

Use this first.

NAS responsibilities:

- Node.js Hermes Mobile listener.
- `HERMES_WEB_DATA_DIR`, SQLite DB, workspace files, plugin authorization
  records, Web Push records, and app-owned non-secret config.
- Public HTTPS reverse proxy and security headers.
- Same-origin embedded plugin proxy routes.
- Plugin containers whose business state should stay outside Hermes Mobile.
  On the maintained NAS deployment this includes:
  - Finance container `finance-mcp` on loopback `127.0.0.1:8791`;
  - Email container `email-plugin` on loopback `127.0.0.1:5175`, with runtime
    SQLite/config/tokens mounted from `/volume1/docker/email-plugin/runtime`.
- Optional NAS-local bridge host only for routes whose upstream dependencies are
  also reachable from NAS.
- Codex Mobile embedded-plugin proxying can point to the Windows development
  host when Codex Mobile itself remains there. On the maintained deployment,
  NAS Hermes uses
  `http://192.168.10.108:8787/api/v1/hermes/plugin/manifest` as the server-side
  Codex Mobile manifest URL and reads the Codex plugin key from a NAS
  server-side secret file. Browser clients still access Codex through Hermes'
  same-origin proxy; the Windows Codex Mobile port is not a public user entry.

Finance on NAS must be complete at both the container and Hermes workspace
layers before it is reported usable. The Finance container must accept the
Hermes server-side registration/bind path from the NAS host/container network,
and each active Hermes workspace must have both
`.hermes-finance/access-key.txt` and `.hermes-finance/config.json` under its
NAS user root. A key-only directory is a partial repair artifact. The NAS
first-start preflight fails this as `nas_finance_config_missing:<workspaceId>`
so a deploy cannot pass while Finance later fails during Owner manifest
provisioning.

External Windows/WSL responsibilities:

- Official Hermes Gateway profiles.
- Hybrid/on-demand worker launch.
- Codex Mobile worker and ChatGPT Pro bridge if they depend on local desktop
  credentials or local browser/session state.
- Grok/xAI OAuth profile and `x_search` worker if OAuth lives on that machine.
- Weixin/iLink sidecars unless those are explicitly migrated and validated.

Once Grok/xAI OAuth is migrated to NAS, it must become an explicit NAS-native
Gateway profile instead of a hidden dependency on Windows. The maintained NAS
shape is a manifest-derived `grokgw1` profile with `provider=xai-oauth`,
profile name `grokgw1`, wildcard workspace affinity, and its own port
(`18763` on the current host). `bridge-host` should resolve the target from the
manifest and autostart `grokgw1` on demand. Do not hard-code the historical
Windows Grok port `18761` on NAS because that port can be an ordinary workspace
worker in the NAS hybrid manifest.

Growth reading/speaking audio needs another NAS-native runtime dependency:
Whisper large v3 Turbo on loopback `8001`. Linux/NAS must not invoke the
Windows PowerShell transcription script. The portable path is:

```text
node scripts/transcribe-reading-audio.js --audio-path <audio> --timeout-seconds <n>
```

That script talks to:

```text
http://127.0.0.1:8001/v1/audio/transcriptions
```

The service package/model cache is runtime material, not Git source. It should
be installed under a NAS service directory such as
`/volume1/docker/hermes-mobile/services/whisper-large-v3-turbo`, with model
files and virtualenv outside the source checkout. Record health/status and
paths only; do not record uploaded audio bodies or transcripts.

Gateway connection choices:

- Minimal: set `HERMES_WEB_GATEWAY_POOL_ENABLED=off` and point
  `HERMES_WEB_HERMES_API_BASE` at one reachable Gateway API server. This gives
  the simplest NAS app deployment but not elastic worker scheduling. Current
  Hermes Mobile user-level runs fail closed without a user worker, so this mode
  is suitable only for health/status surfaces unless the selected routes do not
  require user-level Gateway execution.
- NAS-local single worker manifest: set `HERMES_WEB_GATEWAY_POOL_ENABLED=auto`
  and point `HERMES_WEB_GATEWAY_POOL_MANIFEST` at a NAS data-file manifest that
  declares a `securityLevel: user` worker whose `apiBase` is the NAS-local
  Hermes Agent API, for example `http://127.0.0.1:8642`. This is still a fixed
  worker path, not full elastic Gateway Pool. It was verified on 2026-06-01 on
  NAS `192.168.10.99` with one `nas-local-codex` worker and an ordinary Owner
  chat run. The manifest stores only server-side worker credentials and must
  never expose raw keys to the browser, docs, handoffs, or logs.
  Do not claim parity with the maintained Windows hybrid deployment when using
  this mode. A single NAS-local worker has no Owner warm-worker baseline, no
  on-demand candidate expansion, no per-provider capacity split, and no
  workspace-specific MCP/profile process isolation. It can legitimately render
  different Gateway progress wording, such as `Gateway selected` instead of
  `Gateway reused`, and concurrent family use will queue behind the one
  process. If production parity is required, use a validated fixed/elastic
  remote Gateway Pool or implement Mode B.
  This worker must also install and enable the Hermes Mobile fallback Gateway
  plugins under the same Hermes home used by the running API server. Listing
  `web`, `search`, `http`, or other toolsets in `config.yaml` is not enough:
  `/v1/toolsets` can show configured toolsets while `/v1/responses` still has
  no callable schemas if `plugins.enabled` is missing the matching plugin
  bundles. The maintained NAS single-worker config currently installs
  `hermes-mobile-web`, `hermes-mobile-http`, `hermes-mobile-weather`,
  `hermes-mobile-docx`, `hermes-mobile-audio`, `hermes-mobile-image`,
  `hermes-mobile-video`, and `hermes-mobile-cronjob`. Do not enable
  Owner-maintenance plugins such as `hermes-mobile-chatgpt-pro` in this normal
  user-level API-server worker.
- Fixed remote pool: set `HERMES_WEB_GATEWAY_POOL_ENABLED=auto`, use a manifest
  whose worker `apiBase` values point to remote fixed Gateway endpoints, and run
  `HERMES_MOBILE_GATEWAY_POOL_START_MODE=eager` or otherwise keep remote workers
  externally supervised. Do not expect NAS to start/stop those workers.
- Elastic remote pool: not ready. It needs a remote worker-manager API or relay
  with bounded request/result files, redacted diagnostics, and H1 harness
  coverage before enabling on-demand starts from NAS.

### Mode B: Full NAS-Native Runtime

Mode B runs the Hermes Mobile listener and ordinary Gateway workers on NAS.
This is the required direction for a standalone public/NAS install: another
installer cannot depend on XuXin's Windows machine or WSL worker pool.

Mode B performance parity must be validated at the Mobile run-event layer, not
only by checking that a Gateway process is listening. Use an ordinary
representative chat message and compare the NAS phase timeline with the
maintained Windows production timeline: `run.request_preparing` should appear
immediately after send, a warm Owner OpenAI/Codex worker should emit
`run.gateway_worker_reused` quickly, cold workers should emit
`run.gateway_worker_starting`, and `queued` should appear only when capacity or
profile affinity really blocks the run. Do not add probe-only shortcuts or
content-specific "test" fast paths to make this smoke look faster; that hides
the actual deployment bottleneck.

If NAS is slower than Windows while direct Gateway `/health` remains fast,
separate listener-side setup/persistence latency from worker cold-start
latency. A long gap before `run.request_preparing` is not a Gateway startup
delay. In particular, ordinary message-count growth must not trigger a forced
full `state.json` backup on every send; backup protection remains mandatory for
startup/import/parse failure, refused drops, and explicit message-count
decreases.

The maintained run-start path may persist the immediate user/assistant/run-id
state to `state.json` before the heavier SQLite runtime replacement. That is
allowed only with the paired startup recovery rule: when `state.json` is newer
than SQLite's `lastRuntimeStateSave` marker, startup must import the JSON
snapshot into SQLite before serving state. This keeps NAS sends responsive
without making the SQLite projection authoritative over a newer JSON snapshot
after a crash.

The NAS listener restart path is also part of Mode B parity. The maintained
listener can appear as `node server.js` with cwd
`/volume1/docker/hermes-mobile/app`, so stop/restart scripts must identify the
effective listener by cwd/port or use the maintained stop script. Matching only
an absolute `.../app/server.js` command line can leave a stale listener running
and make the next start fail with `EADDRINUSE`.

The first NAS-native worker launcher is
`scripts/start-nas-gateway-pool.sh`. It is intentionally narrower than the
Windows hybrid launcher: it starts a fixed set of NAS-local user workers and
generates a NAS-local manifest. Production readiness is not just `/health`.
The deploy preflight must also prove the per-user isolation shape.

Required Mode B checks:

- Workers are NAS-local processes with NAS-local `apiBase` values.
- Hybrid mode is the default NAS production policy. The manifest may contain a
  larger candidate set than the number of currently running processes:
  - Owner OpenAI/Codex: `1` warm, up to `4`.
  - Owner DeepSeek: `0` warm, up to `2`.
  - Ordinary workspace OpenAI/Codex: `0` warm, up to `2`.
  - Ordinary workspace DeepSeek: `0` warm, up to `1`.
  - The default NAS launcher starts only the Owner OpenAI/Codex warm profile;
    listener-triggered `--start-profiles <profile>` starts candidates on demand.
- User workers are single-workspace workers. Wildcard `allowedWorkspaceIds`
  must fail preflight unless the deployment is explicitly using the legacy
  single-worker bridge warning mode.
- The worker set includes only maintained production workspaces that need
  conversations. On the current NAS production host that is Owner,
  `weixin_wuping`, `weixin_stephen`, `xuyan`, and the active test workspace
  when smoke testing is needed. Historical or inactive workspace directories
  must not automatically become running Gateway workers.
- The NAS data directory contains the same per-user Skill Store profiles that
  Windows production uses, for example `owner-full`, `weixin_wuping`,
  `weixin_stephen`, `xuyan`, and `weixin_test_1`.
- Each worker profile's `skills` entry is linked to
  `/volume1/docker/hermes-mobile/data/skill-profiles/<profile>/skills`.
  It must not point to `/var/services/homes/xuxinxp/.hermes/skills`, because
  that would give all workspaces Owner/default skills.
- Each worker profile's `memories` entry is per-workspace. It may use
  `<skill-profile>/memories` when present, or
  `/volume1/docker/hermes-mobile/data/gateway-memories/<profile>`.
- Each plugin MCP server in a worker profile must read the target workspace's
  local `.hermes-<plugin>` config/key directory. It must not fall back to Owner
  when Owner switches into WuPing, Stephen, XuYan, or test workspaces.
- Plugin toolsets are opt-in per workspace. If a workspace lacks
  `.hermes-wardrobe`, `.hermes-finance`, `.hermes-email`, or the relevant
  plugin config/key directory, its worker profile must omit that MCP server and
  hide that toolset from model calls. A configured toolset with a missing
  workspace-local key is a deployment failure, not an acceptable empty state.
- `data/drive/users/<workspaceId>` directories are private to the NAS service
  account (`0700` or stricter equivalent).

NAS file-system isolation differs from Windows production. Windows can combine
Hermes Mobile policy with OS ACL-backed workspace users. The current NAS-native
launcher runs worker processes under one NAS service account, so `0700`
protects against other NAS users but not against another worker process running
as the same Unix user. Strong NAS isolation requires a future per-workspace Unix
user or container launcher with bind-mounted workspace roots and a harness that
proves cross-workspace filesystem reads fail at the OS boundary.

Required new work:

- Linux/container launcher replacing `start-worker-host.ps1`,
  `start-gateway-pool.ps1`, scheduled-task relay, `taskkill`, and
  ProgramData path assumptions.
- NAS-compatible official Hermes runtime installation and profile generator.
- Linux process supervision for listener, bridge host, cron sidecar, Weixin
  sidecars, and Gateway workers.
- Worker isolation model for ordinary users, Owner maintenance, DeepSeek, and
  Grok profiles.
- Remote-safe Codex/Mux architecture if Codex execution remains on a personal
  workstation.
- NAS backup/restore scripts for SQLite plus runtime files.
- Harness coverage for Linux process lifecycle, remote worker launch, plugin
  provisioning, public reverse proxy, and workspace switching.

## Proposed NAS Layout

Example Synology/Docker layout:

```text
/volume1/docker/hermes-mobile/
  app/                  # clean deployed source tree
  data/
    hermes-mobile.sqlite3
    secrets/
    drive/
    artifacts/
    plugin-workspace-authorizations.json
    web-push-vapid.json
    logs/
  backups/
  config/
```

Keep source checkout and data separate. `app/` can be replaced during deploy;
`data/` and `backups/` must persist.

## NAS Thread Startup Instructions

Use this section as the short handoff prompt for the NAS-side Codex thread.

Objective:

- Deploy the latest private Hermes Mobile source onto NAS as Mode A:
  NAS app/data/static/proxy plus external Gateway/Codex/Grok workers.
- Do not attempt Mode B full NAS-native Gateway Pool unless a later task
  explicitly asks for launcher/process-supervision engineering.

Required first reads on NAS:

```text
docs/DOCS_INDEX.md
docs/MODULES/deployment.md
docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md
docs/PUBLIC_INSTALLATION_CHECKLIST.md
docs/MODULES/plugins.md
docs/MODULES/gateway-pool.md
```

Initial NAS commands:

```sh
git clone <private-hermes-mobile-repo-url> /volume1/docker/hermes-mobile/source
cd /volume1/docker/hermes-mobile/source
git status --short --branch
git log --oneline -5
npm ci
node scripts/privacy-scan.js
git diff --check
```

If the repo is already cloned:

```sh
cd /volume1/docker/hermes-mobile/source
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD
```

Record the deployed commit in the NAS thread handoff. Do not record raw keys,
cookies, launch tokens, Gateway API keys, Codex auth files, or long logs.

Deployment shape to build:

```text
/volume1/docker/hermes-mobile/
  source/               # Git checkout; replaceable
  app/                  # deployed clean app tree; replaceable
  data/                 # persistent runtime data
  data/secrets/         # server-side secret files only
  backups/              # timestamped backups
  config/               # NAS launcher/proxy config
```

NAS thread must decide whether it is deploying directly on the NAS shell or in
a container. For either path, runtime data must live outside the Git checkout.

Minimum environment for first app start:

```text
HERMES_WEB_HOST=0.0.0.0
HERMES_WEB_PORT=8797
HERMES_WEB_DATA_DIR=/volume1/docker/hermes-mobile/data
HERMES_WEB_SERVICE_STORE=sqlite
HERMES_WEB_DB_PATH=/volume1/docker/hermes-mobile/data/hermes-mobile.sqlite3
HERMES_WEB_AUTH_KEY_PATH=/volume1/docker/hermes-mobile/data/secrets/owner-web-key.secret
HERMES_WEB_HERMES_API_BASE=http://<windows-worker-host>:<gateway-port>
HERMES_WEB_HERMES_API_KEY_PATH=/volume1/docker/hermes-mobile/data/secrets/hermes-api-server-key.secret
HERMES_WEB_GATEWAY_POOL_ENABLED=off
HERMES_MOBILE_DISABLE_QUERY_ACCESS_KEY=1
HERMES_WEB_DISABLE_QUERY_ACCESS_KEY=1
HERMES_WEB_OWNER_DEFAULT_WORKSPACE=/volume1/docker/hermes-mobile/data/drive
```

Start command shape depends on packaging, but the first implementation should
be explicit and observable, for example:

```sh
mkdir -p /volume1/docker/hermes-mobile/{app,data,secrets,backups,config}
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .agent-context \
  --exclude .codegraph \
  /volume1/docker/hermes-mobile/source/ \
  /volume1/docker/hermes-mobile/app/
cd /volume1/docker/hermes-mobile/app
npm ci --omit=dev
node server.js
```

If the NAS uses a process manager, the process manager should own only the NAS
listener process. It should not kill or start Windows/WSL Gateway workers.

External Gateway setup:

- Choose one reachable Windows/WSL Gateway API server first.
- Confirm NAS can reach it over the LAN.
- Put the Gateway API key in
  `/volume1/docker/hermes-mobile/data/secrets/hermes-api-server-key.secret`.
- Do not copy Codex OAuth/browser state to NAS for the first cut.
- If a fixed remote Gateway Pool manifest is used later, every worker entry
  must have a remote `apiBase`; NAS must not run `start-gateway-pool.ps1`.

Public reverse proxy setup:

- Terminate HTTPS on NAS reverse proxy.
- Forward only to the NAS Hermes Mobile listener.
- Do not expose Gateway worker ports, bridge host, plugin backend ports, SQLite
  files, `data/`, or `data/secrets/`.
- Add HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, and
  `Referrer-Policy` headers.

First acceptance smoke:

```text
GET /api/public-config
GET /api/status?detail=1
GET /api/client-version?clientVersion=<current-client-version>
Owner login
workspace list
Owner switch to one non-Owner workspace
one ordinary chat run through the configured external Gateway
Wardrobe/Finance manifest launch only after their NAS-side keys/provisioning are ready
privacy scan on the deployed source tree
```

If the app starts but model runs fail, classify the failure before editing:

- NAS app cannot reach external Gateway: network/firewall/API base issue.
- Gateway rejects auth: wrong Gateway API key path/content.
- Gateway answers but tool/plugin missing: remote worker profile/toolset issue
  on the Windows/WSL worker host, not NAS listener source.
- NAS-local single worker answers but reports no search/download/weather tools:
  inspect the API-server Hermes home `plugins.enabled` and installed plugin
  directories first. The real gate is `model_tools.get_tool_definitions(...)`
  and a direct `/v1/responses` smoke that emits `function_call` /
  `function_call_output`, not only the `/v1/toolsets` configured list.
- Codex/Grok/ChatGPT Pro bridge fails: bridge placement issue. Keep those
  services on the worker host unless there is a separate migration task.

## Baseline Environment

For Mode A minimal Gateway:

```text
HERMES_WEB_HOST=0.0.0.0
HERMES_WEB_PORT=8797
HERMES_WEB_DATA_DIR=/volume1/docker/hermes-mobile/data
HERMES_WEB_SERVICE_STORE=sqlite
HERMES_WEB_DB_PATH=/volume1/docker/hermes-mobile/data/hermes-mobile.sqlite3
HERMES_WEB_AUTH_KEY_PATH=/volume1/docker/hermes-mobile/data/secrets/owner-web-key.secret
HERMES_WEB_HERMES_API_BASE=http://<gateway-host>:<gateway-port>
HERMES_WEB_HERMES_API_KEY_PATH=/volume1/docker/hermes-mobile/data/secrets/hermes-api-server-key.secret
HERMES_WEB_GATEWAY_POOL_ENABLED=off
HERMES_MOBILE_DISABLE_QUERY_ACCESS_KEY=1
HERMES_WEB_DISABLE_QUERY_ACCESS_KEY=1
HERMES_WEB_OWNER_DEFAULT_WORKSPACE=/volume1/docker/hermes-mobile/data/drive
```

For a fixed remote worker manifest, also set:

```text
HERMES_WEB_GATEWAY_POOL_ENABLED=auto
HERMES_MOBILE_GATEWAY_POOL_START_MODE=eager
HERMES_WEB_GATEWAY_POOL_START_MODE=eager
HERMES_WEB_GATEWAY_POOL_MANIFEST=/volume1/docker/hermes-mobile/data/gateway-pool-manifest.json
```

The manifest must contain remote worker URLs and per-worker API keys. It must
not be committed.

## Bridge Host Placement

Bridge host routes are not all equal:

- `/bridge/grok-gateway-proxy/v1/responses` should live where it can reach the
  Grok Gateway and, if autostart is enabled, where it can start that profile.
- `/bridge/chatgpt-pro` should live where the ChatGPT Pro/Codex bridge
  credentials and local worker are valid.
- `/bridge/codex-mux` should live with the Codex Mobile worker/Mux service.

For the first NAS cut, keep bridge host on the Windows worker machine if those
routes depend on local Windows/WSL state. Gateway profiles should receive
`HERMES_MOBILE_BRIDGE_HOST_URL=http://<windows-worker-host>:8798` and a
server-side bridge key path. NAS should not expose the bridge host directly to
the public internet.

If bridge host runs on NAS, disable local profile autostart for routes it cannot
manage and point it at explicit upstream URLs.

## Plugin Rules

Finance and Wardrobe are workspace-private plugin flows. NAS deployment must
preserve these rules:

- Owner switching into another workspace must show that target workspace's
  plugin content, never Owner's plugin session.
- Same-origin plugin proxy cookies must stay namespaced by plugin id and
  effective workspace id.
- Workspace-local plugin keys live under the NAS `data/drive/users/<workspace>`
  tree or are regenerated by provisioners.
- Raw plugin keys, launch tokens, upstream cookies, and workspace access keys
  must not enter iframe URLs, postMessage payloads, screenshots, docs, handoffs,
  or logs.

Fresh installs and migrated installs differ only in where plugin-side business
data comes from. A clean public/NAS install may have empty Finance ledgers,
Wardrobe items, or Email mailbox rows, but every enabled plugin still needs a
workspace-local identity and server-side bind before it is usable. Owner's own
first plugin enablement must run the same provisioning class as a non-Owner
grant unless the deployment explicitly binds Owner to an existing plugin
account. A Hermes authorization record alone is not enough to show an `active`
plugin.

For each workspace-private plugin, first-run provisioning must finish all
plugin-relevant steps before `provisioningStatus=active`:

1. Select the effective Hermes workspace and clamp it through workspace access.
2. Create or discover the workspace-local plugin key/config under that
   workspace's NAS data directory.
3. Call the plugin's server-to-server bind/register contract so the plugin owns
   its user, workspace, ledger, mailbox store, or equivalent business space.
4. Install any required keyless Skill bundle into that workspace's independent
   Skill Store.
5. Register or refresh the MCP/toolset/profile binding if model calls need the
   plugin tools.
6. Smoke manifest, launch, same-origin proxy, workspace switching, and at least
   one empty-state or seeded-content page for the same effective workspace.

If a step fails, keep the grant as `pending` or `provisioning_failed` with a
bounded diagnostic. Do not fall back to Owner's plugin key, Owner's plugin
session, a global plugin key, or a misleading empty active tab.

Recommended migration path:

1. Migrate non-secret plugin authorization metadata.
2. Re-run Hermes Mobile provisioners for Finance/Wardrobe per workspace where
   possible.
3. If a plugin backend already has existing users/ledgers/items, bind the NAS
   workspace to the plugin backend through the plugin's server-side bind or
   registration contract.
4. Validate manifest, proxy launch, workspace switching, and plugin content for
   Owner, one non-Owner, and Owner-impersonating-that-workspace.

### Plugin MCP Responsibility Boundary

Hermes Mobile host owns the embedded-plugin contract on NAS: plugin registry,
admin visibility, workspace authorization/provisioning handshake, manifest
normalization, same-origin proxy, iframe launch, postMessage navigation/back,
theme/font-size refresh, workspace-switch isolation, and Gateway worker
selection.

Each plugin project owns its NAS runtime and model-tooling surface: container or
service process, plugin database and migrations, plugin-specific secrets,
health checks, MCP server runtime, MCP schema/toolset registration into the
NAS-local Hermes Agent or Gateway profile, and plugin-side deploy/runbook. If a
plugin iframe/proxy works but model calls report a missing MCP/toolset, first
debug the plugin project's NAS MCP package and profile registration. Do not
solve that by copying plugin MCP source into the Hermes Mobile host.

For the maintained `10.99` NAS, the current Gateway path is a single
`nas-local-codex` worker at `127.0.0.1:8642`. Therefore Wardrobe, Finance,
Email, or later plugins that need model-callable tools must register their MCP
servers with that NAS-local Hermes Agent/Gateway profile, not with the old
Windows/WSL low Gateway profile generator unless that generator is explicitly in
use for the deployment.

### Verified 10.99 Plugin Shape

As of 2026-06-01, NAS `192.168.10.99` uses this first plugin deployment shape:

- Public entry `https://wardrobe-xuxin.synology.me:8555` is Hermes Mobile. The
  router forwards external `8555` to NAS `443`; DSM nginx terminates HTTPS and
  proxies to Hermes Mobile `127.0.0.1:8797`.
- Finance runs as a NAS Docker/Container Manager container named
  `finance-mcp`, bound only to `127.0.0.1:8791`. The backend source is under
  `/volume1/docker/finance-mcp/source`, runtime data under
  `/volume1/docker/finance-mcp/data`, and the container reuses the NAS Hermes
  Node runtime mounted from `/volume1/docker/hermes-mobile/runtime/node-current`.
  Do not expose Finance port `8791` directly to the public internet.
- Wardrobe continues to run on the existing NAS Wardrobe service at port `8765`.
  Hermes Mobile reaches it through the plugin manifest/proxy path; Wardrobe no
  longer needs its own public reverse-proxy entry. Wardrobe must allow the
  Hermes public origin as an iframe frame ancestor and must use workspace-local
  `.hermes-wardrobe` config/key files.
- The NAS Hermes Owner Wardrobe binding must point to the existing XuXin
  Wardrobe binding already used by the Windows development/production machine,
  not to a freshly provisioned empty `wardrobe:owner` workspace. If a migration
  step accidentally creates `drive/users/owner/.hermes-wardrobe` with
  `workspace_id=wardrobe:owner`, it masks the existing nested XuXin binding and
  Owner will see an empty wardrobe. Repair by backing up that direct directory
  and installing the known-good Owner `.hermes-wardrobe` config/key into the
  direct NAS Owner path without exposing the raw key.
- Browser access to both plugins must go through Hermes same-origin routes:
  `/api/hermes-plugins/finance/proxy/...` and
  `/api/hermes-plugins/wardrobe/proxy/...`.
- Current smoke verified owner manifest/launch availability for Finance and
  Wardrobe through both NAS local Hermes and the public HTTPS origin. Treat
  non-Owner content checks as a separate smoke requirement before declaring
  per-user plugin migration complete.

Operational notes:

- Finance on NAS was deployed from the current Finance working-tree snapshot,
  not from a clean tagged release. Before a repeatable production rollout,
  freeze that source in Git or package it with an explicit source checksum.
- Finance and Wardrobe plugin keys remain server-side only. Record key file
  paths and provisioning status, not raw keys, launch tokens, session cookies,
  or upstream cookies.
- When recreating NAS containers from Windows, avoid embedding non-ASCII NAS
  mount paths directly in inline shell commands. Prefer NAS-side inspect files,
  UTF-8 scripts, or Python helpers executed on NAS so paths such as localized
  shared folders are preserved exactly.

## Data Migration

Before migration:

- Commit or otherwise freeze the exact Hermes Mobile source revision to deploy.
- Run privacy scan and focused checks from that revision.
- Stop or quiesce production writes.
- Back up the source data directory and SQLite DB.

Move or recreate:

- `hermes-mobile.sqlite3`
- workspace drive files needed by the NAS instance
- plugin authorization records
- Web Push subscriptions only if public origin and VAPID continuity are intended
- non-secret runtime config

Handle separately:

- Owner Access Key and workspace Access Keys: copy only through secure secret
  storage or rotate after NAS first-run.
- Hermes Gateway API key: store only under `data/secrets`.
- Web Push VAPID private key: copy only if keeping the same push identity.
- Finance/Wardrobe workspace plugin keys: prefer reprovision/bind; if copying,
  copy server-side key files only and verify workspace isolation.
- xAI OAuth, Codex auth, browser state, and worker profile credentials: keep on
  the worker host unless full NAS-native runtime is implemented. If xAI/Grok is
  promoted to NAS-native, copy only the profile/auth files through a restricted
  maintenance channel and validate `grokgw1` health; never print the token
  material.

Do not migrate:

- `.agent-context`
- `.codegraph`
- `node_modules`
- logs except short diagnostic excerpts
- backups into Git
- uploads/scratch directories unless explicitly needed
- worker telemetry DBs unless a telemetry migration is designed

## Public Reverse Proxy

NAS public exposure must enforce:

- HTTPS only.
- HSTS.
- conservative Content Security Policy.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: SAMEORIGIN`.
- `Referrer-Policy: no-referrer`.
- no public direct access to Gateway worker ports, bridge host, plugin backend
  ports, SQLite files, data directory, or secrets.
- URL query Access Keys disabled.

## First Smoke Checklist

Run after NAS app starts:

```text
GET /api/public-config
GET /api/status?detail=1
GET /api/client-version?clientVersion=<current>
Owner login
workspace list
Owner switch to one non-Owner workspace
send one ordinary chat run through configured Gateway path
open Wardrobe manifest/launch for a non-Owner workspace if enabled
open Finance manifest/launch for a non-Owner workspace if enabled
trigger one Web Push test only after public origin and VAPID behavior are known
run privacy scan on the deployed source tree
```

Expected Mode A status:

- Hermes Mobile app health is `ok`.
- Gateway Pool may be fixed/eager local or remote. A NAS-local single user
  worker manifest can satisfy user-level chat execution if it exposes a healthy
  `securityLevel: user` worker. A fully disabled pool can still pass health but
  will not run ordinary user-level chats under the current fail-closed contract.
- Hybrid/on-demand worker start from NAS is not expected unless a remote worker
  manager has been implemented and tested.

## Readiness Gates

Mode A is ready when:

- The deploy branch contains the current production hotfixes.
- NAS app starts from a clean source tree with data outside Git.
- External Gateway path returns a normal model response.
- Public reverse proxy security headers are present.
- Workspace switching and plugin proxy isolation pass smoke.
- No raw key/token/path dump appears in docs, logs, or frontend state.

Mode B is ready only after:

- Linux/NAS worker launchers exist.
- Remote/local Gateway lifecycle harnesses pass.
- Worker profile provisioning no longer assumes Windows ProgramData, WSL UNC,
  PowerShell, scheduled tasks, or `taskkill`.
- Codex/Grok/ChatGPT Pro credential placement is explicitly redesigned and
  validated.
