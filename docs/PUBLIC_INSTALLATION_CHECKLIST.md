# Public Installation Checklist

Last updated: 2026-05-25.

Use this checklist when making README or deployment doc changes for an external Windows install driven by Codex/Agent.

## Source Of Truth

- Public repo metadata: `package.json`
- Main README: `README.md`
- Production deployment runbook: `docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md`
- Deployment module: `docs/MODULES/deployment.md`
- NAS deployment plan: `docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`
- Gateway manifest reference: `docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md`
- Public export checklist: `docs/PUBLIC_EXPORT_CHECKLIST.md`

## Minimum Install

The minimal path requires:

- Node.js 22 or newer.
- Python 3.12 or newer.
- One reachable official Hermes Gateway API server.
- A data directory outside Git.
- Owner Access Key setup.
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
- Weixin bridge: `scripts/start-weixin-mobile-ingress-bridge.ps1`

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
- Do not publish `.agent-context`, runtime data, SQLite DBs, logs, uploads, backups, keys, OAuth state, push endpoints, worker manifests with real API keys, or private reports.
- Run privacy scan and productization checks according to the release scope.

## Known Follow-Up

The current README contains older Chinese public-update text that may render as mojibake in some tools. Do not do a casual whole-file rewrite on Windows; clean it in a separate UTF-8-safe documentation polish pass.
