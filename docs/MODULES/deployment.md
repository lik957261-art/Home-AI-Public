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
- For ordinary user-level chat, a disabled Gateway Pool plus
  `HERMES_WEB_HERMES_API_BASE` health is not enough under the current
  fail-closed contract. NAS must expose at least one healthy `securityLevel:
  user` worker through a fixed manifest, such as the verified 2026-06-01
  `nas-local-codex` manifest pointing at `127.0.0.1:8642`, or use a validated
  remote worker manifest.
- A fixed NAS-local `nas-local-codex` manifest is not the same operating model
  as the maintained Windows hybrid Gateway Pool. It provides one always-running
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
  `https://wardrobe-xuxin.synology.me:8555`: router external `8555` reaches NAS
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
- The maintained Windows/local development launcher may point Wardrobe at a
  different local service from NAS. As of 2026-06-01, its
  `HERMES_MOBILE_WARDROBE_PLUGIN_MANIFEST_URL` was changed from the NAS
  `192.168.10.99:8765` service to the local loopback
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
  It must not symlink all users to `/var/services/homes/xuxinxp/.hermes/skills`.
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
  public origin HTML at `https://wardrobe-xuxin.synology.me:8555` contains the
  deployed version.

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
