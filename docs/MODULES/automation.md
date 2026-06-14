# Module: Automation And Cron

## Responsibility

Automation owns scheduled jobs, detail loading, Web Push/deep-link production, and product-layer cron dispatch isolation. User-facing delivery reading is moving to Action Inbox; Automation remains the background job engine and admin/troubleshooting surface.

## Core Files

- `server-routes/automation-api-routes.js`
- `public/app-automation-controller-ui.js`
- `public/app-automation-ui.js`
- `cron_bridge.py`
- `scripts/hermes-mobile-cron-dispatcher.py`
- `scripts/run-cron-tick-sidecar.ps1`
- `scripts/start-cron-tick-sidecar.ps1`

## Product Rules

- Official Hermes CRON is the canonical automation job source for production
  automation. Hermes Mobile must not maintain a second durable job-definition
  store that silently diverges from official CRON.
- Home AI may wrap official Hermes CRON with a product API, access-control
  projection, UI normalization, Action Inbox, and Web Push metadata. That wrapper
  must not become a separate scheduler or a parallel job-definition store.
- Any user-facing, plugin-facing, or agent-facing automation creation path must
  enter the Home AI Automation API and then mutate the configured canonical
  scheduler. Direct creation through OS `crontab`, LaunchAgent/LaunchDaemon
  timers, local JSON automation stores, or SQLite automation rows is not a valid
  production automation path.
- Foreground Automation list should preserve the full-detail display format.
- Product direction: Automation should not remain a permanent primary bottom tab after Action Inbox is active.
- The mobile entry for Automation management after Action Inbox activation is the Inbox top-right overflow menu, which can open the Automation list or create a new automation.
- The explicit natural-language Automation creation panel must show in-panel
  model/save progress while it is interpreting and creating the job. This
  feedback belongs to the explicit create surface and must not reintroduce a
  per-message model preflight in ordinary chat.
- Completed user-visible deliveries and failed runs should upsert Action Inbox items so the user reads/acts from Inbox. A failed run must still create an Inbox error item and Web Push even when it produced no new deliverable file.
- Automation list projection must tolerate a single unreadable, missing, or
  permission-denied deliverable file. That file should be skipped or reported as
  bounded item-level metadata; it must not make the full Automation list return
  zero jobs or mark the canonical CRON source unavailable.
- Summary/detail optimizations must not visually downgrade the user-facing list.
- Full-cache reads are only a first paint: the background full refresh must update the visible list when newer status or ordering arrives.
- The list should sort by latest activity, defined as the latest of last run time or latest deliverable time, so failed runs without new files still surface promptly.
- Status badges should reflect the latest run result. A scheduled job whose latest run failed must show a failure state until a later successful run clears it.
- Web Push notifications should open the specific automation detail when `automationId` is present.
- When Automation detail is opened directly from an Action Inbox automation receipt, the route should preserve the Inbox as the return parent. Top-left back and right-swipe must return to the Inbox list, not the Automation list. Opening the Automation list from the Inbox overflow menu remains a list-level secondary surface and should keep the existing list-to-Inbox return behavior.
- Opening Automation detail from an Action Inbox row is not a Web Push flow. It is a second-level in-app navigation flow and must stay in the current Hermes app runtime without `window.open`, `target=_blank`, or location-level browser handoff.
- Returning from an Inbox-opened Automation detail must cancel stale Automation list/detail loads and guard Automation API responses by the current `viewMode`. A late Automation response after the return action must not repaint the Automation root shell over the Inbox.
- After Action Inbox integration, Automation Web Push payloads should include `inboxItemId` when the user's next action is represented by Inbox.
- Foreground Web Push with `messageType=automation_*` or `automationId` must invalidate Automation full-cache state. If the Automation view is open, it should force a full refresh and repaint the list after fresh data arrives.
- A user-initiated full refresh after deleting an automation must replace the local list with the server list. Do not append missing local cache entries back into a refreshed list, or deleted jobs can appear to survive deletion.
- Automation summary/detail hydration must not preserve an older
  `source.available=false` or warning when the current API response has fresh
  source metadata. Detail hydration may merge job fields, but the source block
  should be replaced by the latest response so a transient CRON-file warning
  does not keep rendering after the canonical backend is readable again.
- Long cron jobs must not block the scheduling entrance.
- Automation is the canonical scheduler for periodic or complex recurring
  Todo/reminder rules. One-shot Todo reminders stay in Action Inbox as
  `waiting` items with `availableAt`; recurring rules should create one Inbox
  Todo occurrence per trigger and leave recurrence editing, pause/resume, and
  failure diagnostics in Automation.
- Plugin workspace audit plans are Automation-backed jobs. The explicit
  creation surface may use a Skill-guided model to draft schedule and scope, but
  ordinary chat must not run an audit-intent preflight before every message.
  Version 1 audit jobs are read-only and must not write files, commit, push,
  deploy, restart services, install packages, or mutate plugin databases.

## Canonical Store Boundary

Hermes Mobile's Automation API is a safety and projection layer over the
canonical scheduler, not a replacement scheduler.

- Production job definitions, schedule state, pause/resume/run/delete, and
  next-run calculation should be owned by official Hermes CRON.
- `server-routes/automation-api-routes.js` may expose a stable Mobile API, but
  it should project the official CRON job list after applying
  workspace/principal filtering, path privacy, output-file authorization,
  Action Inbox/Web Push metadata, and UI field normalization.
- SQLite/local automation storage is allowed only for first-run local product
  installs, tests, temporary import/migration, or an explicitly selected future
  scheduler backend. It must not be treated as a live mirror of official CRON in
  production.
- When `HERMES_WEB_SERVICE_STORE=sqlite` is enabled and no explicit
  `HERMES_MOBILE_AUTOMATION_BACKEND` / `HERMES_WEB_AUTOMATION_BACKEND` is set,
  Hermes Mobile defaults Automation to `hermes_cron`. The same default applies
  when neither variable is set. Local/SQLite automation must be selected
  explicitly with `HERMES_WEB_AUTOMATION_BACKEND=local`.
- Recognized Automation backends are `hermes_cron`/`cron`/`hermes`/`bridge` for
  the canonical scheduler and `local` for explicit test/import mode. Unknown
  backend names are configuration errors and must not fall back to local stores.
- `createAutomationProvider` enforces the write boundary for
  create/update/delete/pause/resume/run. If the backend is unknown, unavailable,
  or local without explicit local-write enablement, the API returns a structured
  503-style error and must not call the bridge mutation path.
- A production deployment must not return `available=true` with an empty SQLite
  automation store when official CRON contains jobs. That is a configuration
  drift, not a valid "no automations" state.
- If the configured backend is unavailable, unknown, or inconsistent with the
  deployment contract, the API should report a bounded diagnostic warning/error
  rather than silently falling back to an empty alternate store.
- Creating, updating, deleting, pausing, resuming, or manually running an
  automation from Hermes Mobile should mutate the canonical backend only. Any
  cache or UI projection must be invalidated after the canonical mutation.
- Existing jobs that were created outside the Home AI wrapper should be treated
  as drift or legacy imports. They may be shown to Owner/admin as repair
  candidates when safely attributable, but they must not be silently copied into
  local stores or presented as normal workspace automations until ownership,
  schedule, output root, and visibility have been repaired.
- Task prompt text, generated reports, runner logs, raw model output, raw mail
  content, tokens, local secret paths, and push endpoints must not be copied
  into Automation docs, handoffs, or long-lived diagnostic records.
- NAS production must dispatch official CRON with the same maintained runtime
  model defaults as the listener/Gateway layer. The NAS cron tick sidecar syncs
  `$HERMES_HOME/config.yaml` from the product runtime config before dispatch so
  scheduled model jobs do not keep using stale values such as
  `gpt-5.3-codex`. If official CRON jobs show repeated timeouts or rejected
  model errors while Gateway chat uses the correct model, inspect the official
  Hermes home config first instead of reviving Hermes Mobile SQLite automation
  rows.
- Official CRON model jobs must follow the deployment network mode before
  calling the model provider. In Mac `HERMES_MOBILE_NETWORK_MODE=direct`, the
  dispatcher may enter `cron.scheduler.run_job()` without injecting proxy env
  because the Mac network path owns provider egress. In `proxy` mode, and on
  deployments whose cron side requires a maintained proxy, Hermes Mobile does
  not patch the official scheduler source; the product wrapper injects
  `HERMES_MOBILE_CRON_MODEL_PROXY_URL` into `HTTPS_PROXY`, `HTTP_PROXY`, and
  `ALL_PROXY` before invoking `cron.scheduler.run_job()`. If a model job in
  proxy-required mode has no configured/reachable proxy, the dispatcher must
  mark it failed with a bounded `cron_model_proxy_*` diagnostic before official
  `run_job()` starts. Pure `no_agent` script jobs are exempt because they do not
  create an `AIAgent`.
- NAS official CRON helper scripts must be installed into
  `$HERMES_HOME/scripts` by the cron sidecar. For example,
  `tokenusage001` calls `hermes-mobile-token-usage-daily.py`, which is a
  NAS-local compatibility copy of `scripts/gateway-token-usage-daily-report.py`
  with NAS manifest, telemetry, and report-root environment defaults.

## Cron Dispatcher

Hermes Mobile uses `scripts/hermes-mobile-cron-dispatcher.py` as a product-layer wrapper. It dispatches due jobs into detached runners and returns quickly.

On Mac production, the central deployment script installs this wrapper as the
`com.hermesmobile.cron` LaunchDaemon with `StartInterval=60` and
`HERMES_CRON_SCRIPT_TIMEOUT=1800` so long-running `no_agent` scripts such as the
NAS disaster backup are not killed by the official 120-second default. The job
store is the canonical Hermes home file
`/Users/hermes-host/HermesMobile/data/hermes-home/cron/jobs.json`; operators and
agents must not create native OS cron/launchd jobs for individual Home AI
Automation tasks.

For model-backed jobs, the dispatcher is also the boundary that applies the
deployment network mode without modifying official Hermes source. In direct
mode the job enters official CRON without proxy injection. In proxy-required
mode the accepted proxy sources are `HERMES_MOBILE_CRON_MODEL_PROXY_URL`,
`HERMES_WEB_CRON_MODEL_PROXY_URL`, existing standard proxy variables, or the
deployment default. On the maintained NAS deployment the default is
`http://127.0.0.1:7890`, and the dispatcher checks the endpoint before calling
official `run_job()`.

Mailbox analysis jobs must fetch mailbox content through the Email application
MCP/tool surface exposed to the CRON agent. The network-mode preflight controls
only model-provider egress; it must not become a replacement path that reads
mailbox storage directly from Home AI.

Model-backed CRON jobs that require plugin/MCP tools should run under a
workspace-compatible official Hermes profile. Home AI resolves that profile
from the configured Gateway Pool manifest when an Automation job is created:
the selected worker must match the workspace, provider, user security level,
and requested toolsets such as `email`, `file`, and `skills`. If no manifest is
present in a fresh public deployment, Home AI leaves the CRON `profile` empty
and the official scheduler uses its default Hermes home behavior; it must not
copy private `auth.json` or `config.yaml` files into the scheduler home as a
fallback.

Home AI's Mac deploy path installs source-controlled built-in CRON Skills from
`app/skills/productivity/*` into `$HERMES_HOME/skills/productivity/*` without
deleting data-side private Skills. Host Skills that must be visible to every
profile, such as `productivity/home-ai-todo-intake`, are installed separately
into `data/skill-profiles/shared-global/skills` through an explicit allowlist
rather than by copying every source-controlled Skill into every profile.
Deployment then runs
`scripts/macos-automation-cron-audit.js --strict-config`, which fails the deploy
when an enabled agent-backed job has no profile, uses `deliver=origin` without
an origin target, or declares a Skill that the CRON Skill store cannot resolve.
Script/no-agent jobs such as disaster backup are exempt from the profile
requirement, but their own run failures remain visible in Automation status.

On macOS production, the `com.hermesmobile.cron` LaunchDaemon runs as the
service user `hermes-host`. The central deploy script must therefore install
both the CRON profile alias and read/search ACLs for workspace-local plugin
binding directories such as `.hermes-email`, `.hermes-finance`,
`.hermes-health`, and `.hermes-note` under the effective Gateway workspace
root. These ACLs let the official CRON runtime read the plugin `config.json`
and `access-key.txt` needed by MCP wrappers, while the raw workspace keys stay
server-side and are not copied into the scheduler home.

Existing jobs can be repaired by updating the CRON job `profile` through the
Home AI Automation update path. This remains a canonical CRON job mutation, not
a separate local Automation store.

Model-backed CRON jobs that write files must use an explicit persistent
`workdir` under the runtime data tree, not the Home AI app/code directory. The
macOS deployment path syncs the app directory with `rsync --delete`; any
job-created directories under `/Users/hermes-host/HermesMobile/app` are
deployment scratch and can be removed. User-visible reports, cursors,
intermediate indexes, and `MEDIA:` deliverables should live under a data root
such as `$HERMES_HOME/automation-workspaces/<job>/...` or another authorized
delivery directory.
`cron_bridge.py` preserves workdirs only when they are absolute paths inside
`$HERMES_HOME/automation-workspaces` or the CRON output root, and creates the
directory on create/update. Unsafe workdirs are rejected instead of silently
falling back to the app directory.

Plugin workspace audit jobs are a special read-only job class. They may be
created as scheduled plans or as manual one-shot alignment audits. They should
be stored as `kind=plugin_workspace_audit` with structured fields such as
`pluginId`, `targetWorkspaceId`, `workspacePathRef`, `auditMode`, `executor`,
`readonly=true`, and `delivery`. The dispatcher must resolve
`workspacePathRef` through Home AI's plugin registry or platform contract at run
time, then launch a bounded audit executor with the plugin workspace as `cwd`.
It must not accept arbitrary user-provided paths. If the plugin is not
registered, not enabled for the target workspace, lacks a complete workspace
binding, or no read-only executor is configured, the run should fail with a
bounded diagnostic and upsert an Action Inbox error item.

Audit jobs should write human-readable reports under audit history or the
authorized plugin delivery directory, not under the source checkout. They should
also upsert Action Inbox `review` or `error` items with summary metadata and
safe deep links. Full diffs, raw executor logs, prompts, secrets, launch tokens,
provider tokens, push endpoints, and private local paths must not be copied into
Automation rows, Inbox rows, Web Push payloads, or docs.

Read-only enforcement is part of the Automation contract for this job class.
The first implementation should allow only source inspection and metadata
commands. Arbitrary tests are out of scope for version 1 because many test
suites write cache/build artifacts. A future safe-test mode must use scratch
storage and prove that the plugin workspace git state is unchanged before and
after the run.

The explicit scheduled-plan creation route is
`POST /api/automations/plugin-workspace-audits`.
The route calls `pluginWorkspaceAuditService` to validate plugin visibility,
configured target path, schedule, audit mode, and read-only policy, then creates
the canonical Automation job through `automationProvider.createJob`. It must not
call the generic natural-language Automation interpreter for ordinary audit plan
creation.

The first manual alignment route is
`POST /api/automations/plugin-workspace-audits/run`. It uses the same service
validation and target resolution, creates a canonical one-shot job with
`schedule=manual`, `repeat=once`, `auditMode=alignment` by default, and requests
the existing Automation `run` action. Execution still happens through the
normal dispatcher tick so report creation, run history, and Action Inbox
projection remain on the same canonical path as scheduled jobs.

At due time, the Mac/NAS dispatcher detects `kind=plugin_workspace_audit` and
runs `scripts/plugin-workspace-audit-runner.js` instead of official
model-backed `cron.scheduler.run_job()`. This keeps V1 deterministic and
read-only: the runner only uses bounded Git/source-inspection commands, writes a
Markdown report under the CRON output root, returns a `MEDIA:` line for the
existing Automation output preview path, and marks the canonical CRON run
success/failure through `mark_job_run()`. It does not use the model proxy, does
not enable toolsets, and does not execute user-provided scripts.

The runner may add a Codex read-only review section when the deployment
explicitly enables it with
`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED=1` or
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED=1`. The command is configured
with `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND` /
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND` and is invoked as
`codex exec --sandbox read-only --cd <target> --ephemeral`. Public installs
must remain functional with this flag disabled; missing Codex CLI/auth should
produce a bounded diagnostic instead of granting write access or blocking
ordinary deterministic audit reports.

Audit target paths are configuration, not user input. Deployments may configure
targets with `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS` /
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS` or per-plugin
`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH` /
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH`. Missing targets fail
closed with `plugin_audit_target_unconfigured`.

Analysis automations that need Home AI runtime state must use host-provided
data contexts instead of asking the model to discover or query SQLite directly.
Jobs declare a `data_context` object, for example
`{"type":"discussion_activity_daily","date":"previous_day"}`. Before the model
run, `scripts/hermes-mobile-cron-dispatcher.py` calls the product
`data-context` provider through `scripts/automation-data-context-cli.js`, writes
a bounded Markdown data pack under the job workdir, and injects that path into
the model prompt. The same provider is exposed to authenticated clients through
`/api/data-context/prepare`, so scheduled automation, normal chat, and plugins
share one permission-checked, redacted, capped data access surface. Do not add
one-off SQL scripts to individual Skills or prompts for product features.

Detached cron runners may execute from the interactive Ubuntu distro while the dedicated Grok Gateway listens behind the Windows host / worker-distro loopback boundary. For `x_search`, the dispatcher should pass `HERMES_MOBILE_X_SEARCH_PROXY_URL` pointing at the bridge-host proxy prefix `/bridge/grok-gateway-proxy`; runners should not assume `127.0.0.1:<grok-port>` reaches the Grok worker.

The `hermes-mobile-web` plugin appends `/v1/responses` to that prefix. Bridge
host therefore receives `POST /bridge/grok-gateway-proxy/v1/responses` and
forwards only to the configured local Grok Gateway `/v1/responses`.

If runner logs contain `Tool x_search returned error`,
`grok_gateway_proxy_failed`, `grok_gateway_http_`, or
`gateway_api_key_unavailable`, the dispatcher should mark the job failed rather
than successful so the Automation list, Web Push, and Action Inbox do not show a
false success.

Do not patch official Hermes runtime cron source for this behavior unless explicitly approved.

## Implementation Contract

Automation implementation must preserve these layers:

1. **Home AI Automation API**
   - Owns request authentication, workspace/principal resolution, access-policy
     context, UI field normalization, Action Inbox/Web Push projection, output
     file authorization, and bounded diagnostics.
   - Routes list/create/update/delete/pause/resume/run through
     `adapters/automation-provider.js`.
   - Fails closed when the configured canonical backend is unavailable. A create
     or mutation request must return an error instead of creating a local
     fallback job.

2. **Automation provider**
   - Remains the single Node-side bridge boundary. It should call one configured
     `runBridge` implementation and should not know about multiple live stores.
   - Clears list caches only after the canonical backend confirms mutation.
   - Resolves output/deliverable files only through the requested job and
     authorized roots.

3. **Canonical scheduler bridge**
   - For the current production design, `cron_bridge.py` is the bridge to
     official Hermes CRON job definitions.
   - The bridge may call official Hermes CRON helpers when available, or perform
     a compatible file mutation of the official CRON jobs document. Both paths
     still write the same canonical scheduler store.
   - `owner_principal_id` is required for workspace-scoped operations. Legacy
     jobs without owner metadata are Owner-only repair candidates unless
     explicitly migrated.

4. **Local/SQLite automation bridge**
   - Exists only for focused tests, first-run local experimentation, explicit
     import/migration work, or a future scheduler backend with its own design.
   - Must not be selected by ordinary production/default runtime.
   - Must not be used as a transparent fallback when official Hermes CRON is
     missing, unreadable, or inconsistent.

5. **Agent/tooling contract**
   - Agents, plugins, and bridge tools that create automations must call the Home
     AI automation route or the configured Home AI bridge-host CRON route. They
     must not write OS-native cron, launchd schedules, local JSON automation
     stores, or SQLite rows directly.
   - If the Home AI automation route cannot reach the canonical backend, the
     correct result is a visible diagnostic and no job creation.
   - Mac Gateway workers that expose `cronjob_mobile` through
     `hermes-mobile-http` must receive
     `HERMES_MOBILE_BRIDGE_HOST_URL=http://127.0.0.1:8798` and
     `HERMES_MOBILE_BRIDGE_HOST_KEY_PATH=$ROOT/data/secrets/bridge-host.secret`
     with the `HERMES_WEB_*` aliases. Workspace provisioning must grant the
     worker user read ACLs on that host-key file. Without those values, the
     tool returns `Hermes Mobile bridge host key is not configured` and must not
     fall back to profile-local cron.

Required implementation updates after this contract:

- Change Automation backend resolution so the default is `hermes_cron`; local
  Automation requires an explicit development/test configuration.
- Add a fail-closed guard that prevents local/SQLite automation writes unless
  the runtime is explicitly configured for local Automation.
- Add focused tests proving default runtime does not create local Automation
  jobs, API create fails when the canonical backend is unavailable, and local
  Automation remains available only in explicit test/development mode.
- Add a repair/migration path for legacy jobs created outside Home AI, including
  a backup-first operator procedure and an Owner-only diagnostic projection.

## Validation

- `node tests\automation-api-routes.test.js`
- `node tests\cron-bridge.test.js`
- `node tests\cron-dispatcher-proxy-harness.test.js`
- `node tests\mobile-runtime-environment-service.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\task-list-ui.test.js`
- `python -m py_compile cron_bridge.py scripts\hermes-mobile-cron-dispatcher.py`

## Constraints

- Static-only Automation UI changes do not require listener restart.
- Route or bridge changes require listener restart.
- Gateway Pool restart is only needed for Gateway worker/profile/plugin/schema changes.
