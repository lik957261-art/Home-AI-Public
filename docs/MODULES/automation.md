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
- Automation job rows and detail views expose a user-facing manual trigger action
  for jobs with an id. The action calls the Home AI Automation API
  `POST /api/automations/:jobId/run`, which delegates to
  `automationProvider.mutateJob({ action: "run" })` and the configured
  canonical scheduler bridge. It must not call shell scripts, override-state
  scripts, or local store writes directly from the UI.
- Manual trigger UI status is bounded to pending/running/success/error labels.
  Error surfaces should show a short issue code or sanitized message only; raw
  logs, endpoint bodies, private payloads, secret paths, keys, and scheduler
  output must not be rendered.
- Manual trigger for a paused scheduled job is a one-shot next-tick request, not
  a schedule resume. The canonical bridge records
  `manual_run_requested_at` while preserving `enabled=false`, `state=paused`,
  `paused_at`, `paused_reason`, and no `next_run_at`; the product dispatcher may
  run that single request with an in-memory enabled job copy, then clears the
  manual request and leaves the durable schedule paused. Resume remains an
  explicit `resume` action.
- The explicit natural-language Automation creation panel must show in-panel
  model/save progress while it is interpreting and creating the job. This
  feedback belongs to the explicit create surface and must not reintroduce a
  per-message model preflight in ordinary chat.
- Completed user-visible deliveries and failed runs should upsert Action Inbox items so the user reads/acts from Inbox. A failed run must still create an Inbox error item and Web Push even when it produced no new deliverable file.
- Failed-run Web Push and Inbox projection must be stable per failed run. The
  failure notification signature is based on the run timestamp and bounded
  failure summary, not on whether the failed run also produced a Markdown
  output file. A failed run output appearing or being filtered must not
  alternate signatures and repeatedly notify the user for the same failure.
- A successful CRON run whose `.md` run output contains a non-empty,
  non-`[SILENT]` `## Response` section is itself a user-facing Markdown
  delivery when no explicit `MEDIA:` deliverable is present. The Automation
  projection should expose that run output as an `outputDocuments` entry so
  Inbox/Web Push delivery does not depend on the model creating a separate
  attachment file.
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
- Returning from an Inbox-opened Automation detail must also refresh the Inbox
  list immediately. It must not depend on a later filter tap to load Todo,
  delivery, or error rows after a notification deep-link return.
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
- Reminder-style Automation runs are Todo notifications, not document
  deliveries. If the underlying CRON run emits a Markdown output file, the
  push/Inbox projection must still show the reminder text and Todo actions
  without promoting that Markdown file as the primary deliverable.
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
`/Users/example/path`; operators and
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

For profile-bound agent jobs, the dispatcher also materializes the profile
model defaults in memory before proxy checks, data-context preparation, and
official `run_job()`. If a job has `profile` but no explicit `model`, the
wrapper reads `$HERMES_HOME/profiles/<profile>/config.yaml` and injects
`model.default`; it also carries provider/base URL fields when present and not
overridden by the job. This compatibility step preserves older profile-bound
jobs without mutating the canonical `cron/jobs.json`. Missing or unreadable
profile config leaves the job unchanged so official CRON still produces its
bounded model-configuration diagnostic.

The dispatcher keeps canonical CRON bookkeeping in the global Hermes home, but
profile-bound agent execution must run official scheduler/auth calls under the
selected profile home. The wrapper scopes `HERMES_HOME` to
`$HERMES_HOME/profiles/<profile>` around `cron.scheduler.run_job()` and
delivery, then restores the global home before saving output or marking job
status. This lets official Codex auth resolution see profile-local or
profile-symlinked `auth.json` without copying credentials into the global
Hermes home. `no_agent` jobs remain exempt.

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
`scripts/macos-automation-cron-audit.js --strict-config --strict-source
--strict-status`, which fails the deploy when the canonical CRON job store or
Skill store cannot be read, when an enabled agent-backed job has no profile,
uses `deliver=origin` without an origin target, declares a Skill that the CRON
Skill store cannot resolve, or when an enabled job's latest status is
`error`/`failed`/`failure`. Deploy-time validation passes
`--status-since <deploy-start-iso>` so it blocks failures created during or
after that deploy, while standalone CRON audits without `--status-since` still
surface all historical enabled-job failures. Script/no-agent jobs such as
disaster backup are exempt from the profile requirement, but their own latest
run failures remain production issues until a later successful run clears the
status.

Home AI visual polish can use two official CRON layers when explicitly enabled.
Evidence capture jobs are `no_agent` script jobs: they run
`scripts/visual-polish-audit-runner.js` through installed wrapper scripts under
`$HERMES_HOME/scripts`, execute the shared iOS PWA visual harness, and deliver
failures through Codex Mobile cross-thread task cards. They must not start
Codex CLI directly or create a separate app-server/mux context. Analysis can be
a separate agent-backed Home AI Automation job, `homeai_visual_analysis_xhigh`,
bound to the dedicated `hm-owner-openai-xhigh` profile with `gpt-5.5` and
`agent.reasoning_effort: xhigh`; this is where high-reasoning triage happens.
Scheduled visual verification jobs are disabled by default in production
deployments. The deploy script removes existing `homeai_visual_*` jobs unless
`HOMEAI_INSTALL_VISUAL_POLISH_CRON_JOBS=1` is set for an explicit opt-in deploy.
The CRON runner depends on the Mac desktop-user LaunchAgent
`com.hermesmobile.visual-debug` for `http://127.0.0.1:19073/`; it must not try
to own Simulator/Appium sessions from the `hermes-host` service account.
Before a visual scenario runs, the harness clears Cache Storage, unregisters
Service Workers through the live debug server, reopens the target app URL, and
waits for the expected deployed client version with no old-client update banner.
Version mismatch, hidden/zero-size app, screenshot-too-small, missing `appUrl`,
and lane/debug-server setup failures are classified as `failureKind=environment`
and are skipped by the task-card controller instead of being sent as Home AI or
plugin UI regressions.
The opt-in visual job set includes host, Music, Finance, Wardrobe, Core,
`homeai_visual_global_interactions`, and `homeai_visual_analysis_xhigh`. The
global interaction job is bounded to the host global Dock gesture scenario plus
the Finance plugin drawer action gesture scenario so it catches cross-surface
interaction regressions without duplicating every plugin-specific visual audit.

Audit-class scheduling now follows the dedicated audit-thread governance
contract in
`docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md`. Scheduled
automation may create a bounded audit request card for `Home AI Platform Audit`
or `Plugin Workspace Audit`, but it must not run deep host/plugin audits
directly or route findings to implementation workspaces from cron-local
analysis. Dedicated audit threads perform evidence gathering, findings-first
reporting, task-card routing, and closure verification. Audit threads must not
read `.agent-context/HANDOFF.md` or lineage handoffs as audit context.

Home AI Self-Improving Loop is the maintained observation collector and
request-card generator for daily host/platform and plugin audit triggers. The
macOS production deploy installs the scheduled wrapper at
`/Users/example/path`;
`scripts/macos-automation-cron-audit.js --strict-source` verifies that wrapper
stays executable and source-synchronized. Fresh install and central production
deploy must also ensure the canonical CRON job
`homeai_self_improving_loop` exists as a `no_agent` script job that calls this
wrapper. Installing the wrapper without the canonical job is not a closed
Autonomy loop. The wrapper may run:

```bash
/Users/example/path
```

The wrapper calls `scripts/homeai-self-improving-loop.js
--collect-production-observations` with the production root and may submit
metadata-only self-check events to AI Ops intake, resolve current audit threads,
and send bounded request cards. It prints only bounded status/count JSON to CRON
logs. It must not run the deep audits, inspect private plugin payloads, write
findings, mutate workspaces, restart services, deploy, or send implementation
repair cards from CRON-local analysis. If `Home AI Platform Audit` or
`Plugin Workspace Audit` is unavailable, ambiguous, archived, deleted, or not
discoverable, the job must fail visibly with a bounded task-card/thread error.

Plugin Daily Progress Rollup is a separate Home AI platform governance job,
not a plugin-local daemon. The macOS production deploy installs
`plugin-daily-progress-rollup-cron.sh` into the CRON script store and upserts
the canonical no-agent CRON job `plugin_daily_progress_rollup` on the daily
schedule `30 23 * * *` (Asia/Shanghai operating window). The wrapper calls
`scripts/plugin-daily-progress-rollup.js --trigger --trigger-source scheduled`
and stores metadata-only state under the runtime data tree unless an explicit
`HOMEAI_PLUGIN_DAILY_ROLLUP_STATE_FILE` is configured.

The rollup workflow is Home AI-owned: it selects governed plugin workspaces
from the maintained plugin target registry/contracts, dispatches one bounded
Chinese analysis-summary card per resolvable plugin target, ingests bounded
Chinese terminal returns through the Owner rollup route, marks
unresolved/missing/stale plugin reports without blocking forever, and generates
one Owner-visible Chinese analysis report only after collection is complete or
explicitly finalized. Per-plugin task cards are collection mechanism only; the
report is the primary deliverable. A manual or scheduled trigger must not show
Owner a collection-status pseudo-report or a premature conclusion while plugin
returns are still pending; the run may expose bounded counts/status metadata,
but `report` remains absent until all plugin cards have returned or Owner/system
finalize marks remaining plugins missing or stale. These per-plugin daily
analysis cards must explicitly request `reasoningEffort: "xhigh"` because they
perform cross-workspace synthesis, risk judgment, and Owner decision support.
Duplicate triggers for the same date/window reuse existing card ids in the
rollup state and suppress equivalent redispatches. Manual trigger uses the same
service path through
`POST /api/owner/plugin-daily-progress-rollup/trigger`; readback is available
at `GET /api/owner/plugin-daily-progress-rollup/status`. Reports and state
must not include raw plugin thread bodies, raw logs, secrets, endpoint bodies,
screenshots, DB rows, provider payloads, full prompts, or long diffs. Same-day
idempotency only reuses active dispatched cards or already returned reports.
Stale `task_card_not_pending:*` dispatch attempts and archived-thread failures
are retryable with a new bounded dispatch attempt unless the plugin already has
a completed daily report; archived targets must resolve through a current
dispatchable title/prefix or be reported as `target_unresolved`.

Codex Mobile PR Automation is an Owner hourly no-agent CRON job,
`codex_mobile_pr_automation_hourly`, scheduled as `0 * * * *`. The macOS
production deploy installs `codex-mobile-pr-automation-cron.sh` into the CRON
script store and upserts the canonical job. Deploy/install upsert must preserve
an existing Owner pause for this job: `enabled=false`, `state=paused`,
`paused_at`, `paused_reason`, and `next_run_at=null` are retained instead of
being reset to scheduled. New installs still create the job enabled and
scheduled by default. The wrapper runs
`scripts/codex-mobile-pr-automation-scheduled-task.js`, which resolves the
Codex Mobile planner from `CODEX_MOBILE_PR_AUTOMATION_SOURCE_REF` (default
`origin/main`) using a clean detached source worktree under
`HOMEAI_CODEX_MOBILE_PR_AUTOMATION_SOURCE_ROOT` when the shared checkout is
stale or dirty. It must not update, reset, or overwrite the shared Codex Mobile
checkout. If neither the shared checkout nor the resolved source ref contains
`scripts/codex-mobile-pr-automation.js`, the job fails closed with
`planner_source_missing`; if the shared checkout lacks the planner but
`origin/main` has it, readback records `planner_checkout_stale` while running
from the clean source. Planner state is metadata-only and defaults to
`data/hermes-home/codex-mobile-pr-automation/state.json`, overridable by
`HOMEAI_CODEX_MOBILE_PR_AUTOMATION_STATE_FILE` or
`CODEX_MOBILE_PR_AUTOMATION_STATE`.

The Codex Mobile PR automation job is a planner/readback path only. It scans
bounded PR metadata, writes bounded state, and returns next-action/task-card
request metadata. It must not directly merge private PRs, deploy, push public
code, close public PRs, mutate the Codex Mobile shared checkout, or read raw
GitHub tokens. Missing GitHub credentials, dirty shared checkout without a clean
source path, release holds, missing deploy gates, and missing public-ready gates
remain fail-closed bounded issue codes.

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
job-created directories under `/Users/example/path` are
deployment scratch and can be removed. User-visible reports, cursors,
intermediate indexes, and `MEDIA:` deliverables should live under a data root
such as `$HERMES_HOME/automation-workspaces/<job>/...` or another authorized
delivery directory.
`cron_bridge.py` preserves workdirs only when they are absolute paths inside
`$HERMES_HOME/automation-workspaces` or the CRON output root, and creates the
directory on create/update. Unsafe workdirs are rejected instead of silently
falling back to the app directory.

Plugin workspace, Home AI platform, and Product Reality audits are no longer a
local Automation execution job class. Home AI may use an explicit route or a
future scheduled Automation tick to request an audit, but that request must only
send a Codex Mobile task card to the correct central audit thread. The Home AI
app, Automation runner, CRON dispatcher, Gateway worker, and local Codex CLI
must not perform the deep audit.

The manual Product Reality route is
`POST /api/automations/plugin-workspace-audits/run`. The route is kept under
the Automation namespace for UI compatibility, but its semantics are request
delivery, not job creation. It calls `pluginWorkspaceAuditService` to validate
the controlled target id, configured target path, audit mode, and read-only
policy. Plugin targets also validate plugin registry visibility. The route then
dynamically discovers the current Home AI source thread and the correct central
audit thread through Codex Mobile thread discovery. `home-ai` targets
`Home AI Platform Audit`; plugin targets target `Plugin Workspace Audit`. It
sends one request card to that central audit thread. It must not call the
generic natural-language Automation interpreter, `automationProvider.createJob`,
`automationProvider.mutateJob`, or CRON cache mutation for this manual path.

Home AI must not store fixed Codex audit thread ids in environment files,
Automation rows, source, or docs. The only durable routing contract is the
audit thread role/title, such as `Plugin Workspace Audit` or
`Home AI Platform Audit`, plus the app workspace cwd. Thread ids are discovered
at send time.

For plugin audits, Home AI sends only the central plugin audit request. It must
not send task cards directly to each plugin workspace implementation thread.
The central `Plugin Workspace Audit` thread owns workspace fan-out, repair-card
routing, implementation return-card tracking, closure verification, and the
final return card back to Home AI. For host/platform audits, Home AI sends only
one request to `Home AI Platform Audit`; the ordinary implementation thread is
not the auditor.

Existing `plugin_workspace_audit` CRON runner code is legacy diagnostic
infrastructure. It is not the maintained production path for the Product
Reality audit loop. If used manually for investigation, it must remain
read-only, bounded, and clearly labeled as local diagnostic output rather than
the canonical audit workflow.

Audit target paths are configuration, not user input. Deployments may configure
targets with `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS` /
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS` or per-plugin
`HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH` /
`HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH`. Missing targets fail
closed with `plugin_audit_target_unconfigured`. The target map includes the
special controlled target `home-ai`, which resolves to the Home AI app root and
routes to `Home AI Platform Audit` rather than `Plugin Workspace Audit`.

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
   - Manual trigger requests are ordinary `run` mutations. A successful request
     schedules the job through the maintained backend path, usually by requesting
     the canonical scheduler to run the job on the next tick. UI callers should
     clear Automation list caches after successful non-dry-run mutations.

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
- `node tests\automation-manual-trigger-ui.test.js`
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
