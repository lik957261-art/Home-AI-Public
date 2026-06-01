# Module: Deployment And Production Operations

## Production Paths

- Source checkout: local Hermes Mobile source checkout, for example `C:\Path\To\HermesMobile`
- Production app: `C:\ProgramData\HermesMobile\app`
- Production data: `C:\ProgramData\HermesMobile\data`
- Backups: `C:\ProgramData\HermesMobile\backups`
- Listener HTTP: `http://127.0.0.1:8797`
- Bridge host: `http://127.0.0.1:8798`

## NAS Deployment Direction

The first supported NAS direction is a split deployment, documented in
`docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`:

- NAS runs Hermes Mobile app/data/static/proxy surfaces.
- Windows/WSL continues to own official Hermes Gateway workers, Codex-local
  execution, Grok/xAI OAuth, and worker launchers that depend on PowerShell,
  WSL registration, or local browser/auth state.
- NAS talks to one reachable Gateway API server or to a fixed remote worker
  manifest. NAS should not be expected to start/stop Windows/WSL workers unless
  a remote worker-manager contract has been implemented and tested.
- NAS-side Codex CLI login is useful for the NAS deployment thread, but it is
  not the Hermes Mobile runtime Gateway/Codex backend. Do not treat it as a
  shared user-facing model worker unless a separate remote worker/Mux contract
  has been designed and validated.
- After NAS becomes production, treat NAS runtime data as authoritative and
  Windows as development plus external worker host. Code flows to NAS through
  Git/deploy; NAS data flows back only as backups or isolated debug copies.
  Do not run live bidirectional sync for SQLite, workspace files, plugin keys,
  Skill Stores, Inbox/task state, learning records, or currency ledgers.
- NAS maintenance credentials must live in restricted secret files or an OS
  credential store. Do not paste NAS keys, SSH private keys, cookies, or tokens
  into chats, docs, handoffs, commits, or logs.

Do not present full NAS-native Gateway Pool as ready. It requires new Linux or
container launchers, process supervision, profile provisioning, and H1 lifecycle
harness coverage.

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
`GMK\xuxin`, `SYSTEM`, and `Administrators`; do not grant shared user accounts
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
  context instead of the separate worker account.
- Node route/service/provider change: restart Hermes Mobile listener only.
- Bridge-host change: restart listener/bridge-host through `scripts\start-worker-host.ps1 -ReplaceExisting`.
- Gateway plugin/schema/profile/startup change: restart Gateway Pool or targeted maintenance worker as appropriate.
- Cron dispatcher change: restart cron sidecar through `scripts\start-cron-tick-sidecar.ps1 -ReplaceExisting`.
- Data-only repair: backup data first; avoid restart unless runtime memory can overwrite the repair.

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
- `/api/status?detail=1`

## Production Launcher Toggles

The operator wrapper at
`%USERPROFILE%\.hermes-windows\start-hermes-mobile-production.ps1` forwards to
the effective launcher:
`C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1`.

For Gateway model-side preflight and toolset selection, inspect the ProgramData
launcher first before searching code:

- `HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT` /
  `HERMES_WEB_GATEWAY_MODEL_PERMISSION_PREFLIGHT`: permission preflight. It
  defaults on in code when unset and should remain on unless the rollback is
  explicitly about permission preflight.
- `HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS`: permission-only
  preflight timeout. Default is `8000`; it is intentionally shorter than the
  optional model-first toolset selector timeout so a slow advisory preflight
  does not block normal deterministic execution for tens of seconds.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION`: optional model-first
  toolset selector. Set to `1`, `true`, `yes`, or `on` to enable narrowing;
  set to `0`, `false`, `no`, or `off` to disable only toolset narrowing.
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
