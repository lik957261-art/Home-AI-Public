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

## Goals

- Move the long-lived Hermes Mobile app/data surface onto NAS storage.
- Keep runtime data outside the Git checkout.
- Preserve workspace isolation, plugin session isolation, and Owner switching
  behavior.
- Keep Codex, ChatGPT Pro, xAI OAuth, and worker profile credentials on the
  machine/account that actually owns those credentials.
- Keep public exposure behind a hardened reverse proxy.

## Non-Goals For First NAS Cut

- Do not run the Windows/WSL on-demand Gateway Pool launcher on NAS.
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
- Optional NAS-local bridge host only for routes whose upstream dependencies are
  also reachable from NAS.

External Windows/WSL responsibilities:

- Official Hermes Gateway profiles.
- Hybrid/on-demand worker launch.
- Codex Mobile worker and ChatGPT Pro bridge if they depend on local desktop
  credentials or local browser/session state.
- Grok/xAI OAuth profile and `x_search` worker if OAuth lives on that machine.
- Weixin/iLink sidecars unless those are explicitly migrated and validated.

Gateway connection choices:

- Minimal: set `HERMES_WEB_GATEWAY_POOL_ENABLED=off` and point
  `HERMES_WEB_HERMES_API_BASE` at one reachable Gateway API server. This gives
  the simplest NAS app deployment but not elastic worker scheduling.
- Fixed remote pool: set `HERMES_WEB_GATEWAY_POOL_ENABLED=auto`, use a manifest
  whose worker `apiBase` values point to remote fixed Gateway endpoints, and run
  `HERMES_MOBILE_GATEWAY_POOL_START_MODE=eager` or otherwise keep remote workers
  externally supervised. Do not expect NAS to start/stop those workers.
- Elastic remote pool: not ready. It needs a remote worker-manager API or relay
  with bounded request/result files, redacted diagnostics, and H1 harness
  coverage before enabling on-demand starts from NAS.

### Mode B: Full NAS-Native Runtime

Treat this as future work.

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

Recommended migration path:

1. Migrate non-secret plugin authorization metadata.
2. Re-run Hermes Mobile provisioners for Finance/Wardrobe per workspace where
   possible.
3. If a plugin backend already has existing users/ledgers/items, bind the NAS
   workspace to the plugin backend through the plugin's server-side bind or
   registration contract.
4. Validate manifest, proxy launch, workspace switching, and plugin content for
   Owner, one non-Owner, and Owner-impersonating-that-workspace.

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
  the worker host unless full NAS-native runtime is implemented.

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
- Gateway Pool may be disabled or fixed/eager remote; this is not a failure if
  the deployment intentionally uses a single external Gateway.
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
