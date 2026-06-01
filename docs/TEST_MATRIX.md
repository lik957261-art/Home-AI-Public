# Hermes Mobile Test Matrix

Last updated: 2026-05-31.

Use this matrix to pick focused tests before broader gates. Always add syntax checks for touched JS/Python/PowerShell files.

## Full Gates

- Broad product gate: `npm.cmd run productization:check`
- Standard test gate: `npm test`
- Architecture boundary: `node tests\architecture-refactor-boundary.test.js`
- Privacy scan: `node scripts\privacy-scan.js --all-files`
- Diff hygiene: `git diff --check`

Use full gates before public release, broad shared-service/runtime changes, permission/security/persistence changes, or when requested.

## Harness Requirement Gate

Before implementing non-trivial workflow changes, classify the change with
`docs\IMPLEMENTATION_NOTES\harness-required-matrix.md`.

- H1 flows require a workflow harness or a new harness scenario before the
  change is complete.
- H2 flows require contract/projection coverage for navigation, scroll,
  routing, cache, or visible status behavior.
- H3 changes may use focused syntax/unit/UI tests only when they do not alter
  state, async behavior, permissions, routing, release artifacts, navigation,
  scroll, or service-worker behavior.

For all Hermes Mobile mobile/PWA function, UI, navigation, cache,
service-worker, Web Push, file preview, and embedded-plugin validation, the
primary smoke path is the installed home-screen PWA icon in the emulator or
target device. Browser address-bar navigation is not a valid substitute; it is
browser-mode evidence only and may intentionally show the browser-shell guard
page.
The required PWA smoke sequence is:

1. Verify an Android emulator or target device is connected with `adb devices`.
2. Confirm a home-screen `Hermes` PWA shortcut exists. If it does not, open the
   Hermes HTTPS URL in Chrome only to use Chrome's `Install app` flow, then
   return to the launcher.
3. Start the app by tapping the launcher `Hermes` icon. Do not start the smoke
   by `adb am start ... -d <Hermes URL>` or by pasting the URL into the Chrome
   address bar.
4. Capture evidence from the standalone PWA shell:
   - screenshot without browser address bar;
   - visible client version or DevTools state showing the expected version;
   - loaded workspace list or current workspace content;
   - relevant bottom tab/plugin/file-preview/navigation state.
5. If direct Chrome URL launch shows `mode=browser` or the browser-shell guard,
   record it only as a guard-page diagnostic. It is not a failing PWA smoke and
   it is not passing functional evidence.

For emulator automation, use UI-tree coordinates only to install or tap the PWA
shortcut, then validate the rendered Hermes state with screenshot evidence and,
when needed, Chrome DevTools attached to the PWA WebView. UIAutomator may return
only a generic WebView node for rendered web content, so an empty accessibility
tree alone is not proof that Hermes failed to load.
Startup harnesses must also verify that workspace/project bootstrap failures do
not reveal a half-initialized shell with an empty workspace selector. The client
should retry bounded startup loading and then show an explicit recovery/retry
surface.

H1 includes Growth learning cards, Action Inbox passive notifications,
Automation/Cron execution, Gateway toolset selection/run telemetry,
Gateway elastic worker scheduling, cross-shell production operations, Web Push
click routing, permission/workspace boundaries, and Public Export/Release.

Gateway Pool startup/provisioning harnesses must cover stable manifest
profile/port mapping. `start-low-gateways.sh` and `configure-low-gateways.sh`
must consume explicit `gateway-pool-manifest.json` `profile`/`port` pairs for
`lowgw*`, `grokgw*`, and `deepseekgw*`. Workspace provisioning must append new
personal `lowgwN` entries after existing low/Grok/DeepSeek workers without
moving `grokgw1`, and ordinary workspaces must get two OpenAI/Codex `lowgw*`
candidates plus one workspace-dedicated `deepseekgw*` candidate when DeepSeek is
available. Deleting a workspace must not silently delete profile-local Gateway
state; profile retirement needs an explicit backup/cleanup flow. Focused checks:
`node tests\startup-scripts.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
Gateway Pool startup/provisioning harnesses must also cover per-worker
API-server-key binding. Startup scripts must read the selected worker's own
manifest `api_key` by `profile` and pass that key to the worker process; using
the first manifest key or one class-wide key is a failing case because workers
can stay healthy while rejecting Mobile `/v1/responses` calls with
`401 invalid_api_key`. Gateway profile/schema deployments must sync source
scripts into the production worker root before restart and then run live schema
smoke with the same manifest key Mobile uses for the selected worker.

Kanban-backed Todo board provisioning is part of the same H1 process-safety
harness. `ensureBoard()` must be single-flight per board, failed board creation
must use a bounded retry cooldown, and Windows bridge command timeouts must
terminate the full PowerShell/WSL child process tree. The Windows Kanban
wrapper must resolve the production WSL distro from explicit args or
`HERMES_*` environment values and support maintained caller-context execution
instead of silently defaulting to a retired `HermesGatewayWorker` distro.
Focused checks: `node tests\kanban-provider.test.js`,
`node tests\startup-scripts.test.js`, and `node tests\task-list-ui.test.js`.

OpenAI/Codex shared-auth harnesses must cover runtime-overlay protection for
symlink-preserving atomic writes that cross WSL ext4 and Windows-mounted
storage, including the `hermes_cli.auth` module's direct imported reference.
The static guard is `node tests\startup-scripts.test.js`; live repair
validation should use `/opt/hermes-gateway-runtime/bin/hermes auth list` with
`HOME=/home/hermes` and `HERMES_HOME=/home/hermes/.hermes`, then
`C:\ProgramData\HermesMobile\gateway-worker\check-worker-codex-auth.ps1`, with
no raw tokens or refresh tokens printed.

Gateway elastic worker scheduling is an H1 workflow. The source harness must
cover Owner OpenAI/Codex `minWarm=1` / `maxWorkers=4`, Owner DeepSeek
`minWarm=0` / `maxWorkers=2`, owner-maintenance `minWarm=0` / `maxWorkers=2`,
non-Owner OpenAI/Codex `minWarm=0` / `maxWorkers=2`, non-Owner DeepSeek
`minWarm=0` / `maxWorkers=1`, compatible warm-worker reuse, already-running
warm discovery, profile/provider-compatible cold start, provider-scoped
workspace cap queueing, global cap queueing, idle TTL retirement, active-run
protection, bounded launch-failure diagnostics, public-to-real run id
replacement without worker-slot leakage, tier-scoped worker caps so
owner-maintenance workers do not consume the Owner low-permission user cap,
profile-specific owner-maintenance start/stop and watchdog skip in hybrid
on-demand mode,
hidden single-profile start/stop launchers, and
`/api/status?detail=1` treating configured-but-stopped workers as expected state
rather than unhealthy Gateway Pool degradation, including clearing a previously
warm worker after the process stops and `/health` no longer responds. It must
also cover wildcard profiles such as `grokgw1`: status reconciliation may mark
the process warm, but must not pin an artificial `workspace=*` compatibility
key, and must wake a `profile_affinity` waiter when a healthy idle wildcard
worker is available. The
run-progress UI must
distinguish starting, reused, queued, idle-retirement, and failed states without
exposing API keys, workspace keys, plugin launch tokens, raw prompts, raw model
output, or long logs. The assistant message must receive its public `web_*` run
id before Gateway target selection starts, and `run.gateway_worker_queued`,
`run.gateway_worker_starting`, and permission preflight timeout/fallback events
must render in the inline run-progress panel immediately instead of waiting for
worker selection to finish. Cold-start `starting` must render as startup in the
model-status/run-progress UI rather than as queue depth; `queued` is reserved
for real capacity/profile waits. Before switching production from eager startup to
hybrid/on-demand startup, rerun these checks after syncing scripts into the
production worker root and then smoke `/api/status?detail=1` plus a real Owner
run. Full hybrid/eager starts and listener on-demand `-NoStopExisting`
single-profile starts must skip full reconfiguration when the selected profiles
are already configured and the non-secret configure signature is current.
Changing the manifest, generator script, plugin/schema source, runtime override
source, Skill Store mapping inputs, missing profile artifacts, or explicit
`-ForceConfigure` must run `configure-low-gateways.sh` again. Stop-only
operations must not require profile config/auth validation before killing the
selected port.
If the listener account cannot see the production WSL distro, the launch
service must use the configured Windows Scheduled Task relay: write only bounded
action/profile metadata to `elastic-requests`, trigger the task, wait for the
result file, and keep failures redacted. Focused checks must assert this relay
path in `node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\startup-scripts.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
On a single-user maintained deployment where WSL/Codex state belongs to the
operator account, the preferred production path is to run the listener itself in
that caller context. In that mode the scheduled-task relay must be disabled and
the live gate must prove listener-owned direct single-profile start works.
`scripts/start-worker-host.ps1` must also honor the caller-context marker/env
guard so a later plain `-ReplaceExisting` cannot relaunch the listener under a
separate worker account and recreate the on-demand startup failure.
After a start script returns success, the scheduler must poll the selected
worker's `/health` for the configured bounded window before emitting
`health_check_failed`; a single immediate health miss is a failing harness case
because it can race the newly opened Gateway listener.
Production setup must also verify that the scheduled task can be demand-started
by the listener account. The task principal should remain the WSL-owning
account, but the task file/Task Scheduler ACL must grant the listener account
read/execute permission to run it; otherwise the relay request will remain
pending and the user run will fail before WSL starts.
Because this account-boundary failure has recurred, production rollout is not
complete with only an operator-run `start-gateway-pool.ps1 -StartProfiles`
success. The required live gate is a real non-Owner Mobile API cold-start smoke
from a stopped profile through the listener, followed by healthy
`/api/status?detail=1` and no manual worker start.
Focused implementation checks should include
`node tests\gateway-elastic-worker-scheduler.test.js`,
`node tests\gateway-runtime-composition-service.test.js`,
`node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\gateway-pool-provider.test.js`,
`node tests\gateway-run-start-service.test.js`,
`node tests\gateway-run-lifecycle-service.test.js`,
`node tests\gateway-status-projection.test.js`, `node tests\system-api-routes.test.js`,
`node tests\task-list-ui.test.js`, `node tests\startup-scripts.test.js`,
`node tests\cross-shell-command-harness.test.js`, and
`node tests\static-cache-version-harness.test.js`.

For graph-guided Growth card planning, the harness must preserve the
graph-first authoring contract. Formal model-generated cards must require a
validated `learningGraphPlan` or validated temporary graph node; prerequisites
must exist and be acyclic; stage assessments must declare graph-node coverage;
and learner difficulty feedback must update planning evidence without becoming
formal mastery failure by itself. External seed graphs must be converted into
native Hermes graph records before runtime use. Public curriculum foundation
imports must be manifest-driven, must preserve URL/status/hash provenance, and
must reject paid/restricted materials or learner-level mismatches such as using
IGCSE/A Level nodes as direct current targets for a Primary learner.

For Gateway toolset selection, the harness must preserve the model-first
contract when that selector is enabled. Do not hard-prune callable toolsets
before a first-round model selection. A first round may use a compact
capability catalog, and the execution round may expand only the selected
authorized toolsets, but the model must have an explicit escalation path for
additional authorized toolsets. If request-level schema proof is missing,
model-first toolset selection stays disabled and execution uses the full
authorized route/access toolset set. Narrow `suggested_toolsets` remain
telemetry only unless the selector succeeds. The model-side permission
preflight is a separate switch and remains enabled by default.
The harness must cover selected narrow execution, allowed escalation, denied
blocked-toolset escalation, invalid selection fallback, and telemetry for
model-selection start/end, tool-call start/end, and final-message start/end.
Selector failure is explicitly recoverable: timeout, invalid JSON, missing
runner, or unauthorized selections must fall back to the originally authorized
toolset list. Permission and optional toolset choice must share the same
model-side preflight when both are enabled; when toolset choice is disabled,
that same preflight returns only the permission decision and execution keeps
the full authorized toolsets. Selector failure has the same fallback rule:
execution restores the full originally authorized toolset list, not the
suggested subset. The selector should use a ChatGPT low-cost model, a bounded
timeout of 30000ms by default, and best-effort cancellation when a selector run
id is known. Do not add local
natural-language permission routing before the model. If the model-side
preflight returns a `HERMES_PERMISSION_APPROVAL_REQUIRED`-style decision,
execution must not start until Owner approval.

Product-specific MCP capabilities are part of the same H1 contract. Wardrobe
ingestion/recommendation/writeback tests must assert that authorized
wardrobe-capable runs keep `wardrobe` in the model-selection catalog and can
select `wardrobe` with `vision`/`file` for image-backed writeback and readback
verification. A run that has a wardrobe-capable Gateway profile but lacks
`wardrobe` in `access_policy_context.allowed_toolsets` should be treated as a
Mobile policy/routing regression, not as a missing Gateway MCP.
Wardrobe callable-schema coverage must include actual-wear history writeback
through `mcp_wardrobe_wardrobe_write_history`, not only item write/search/read
and photo functions.
Wardrobe-bound directory projects must first add `wardrobe` in the access
policy catalog; selector routing alone is insufficient because it cannot grant
toolsets absent from `allowed_toolsets`.
If a topic is already bound to a wardrobe/closet directory, every AI run in
that topic must keep authorized `wardrobe`, `vision`, and `file` in the
suggested model-selection catalog by default, even when the latest message is
semantically light. This is still a policy-bounded suggestion: the router must
not grant toolsets that the run policy did not already authorize.
Wardrobe root UI harnesses must assert shared centered page title, no repeated
body hero title/directory pill, no visible disabled Stop button, and top-right
three-dot section switching for overview, watches, maintenance, wear, featured
looks, and log. Wardrobe stats tests must also cover currency-prefixed prices
such as `¥4,787` so totals and average price do not undercount. Full Wardrobe
UI parity must be tested as a future embedded-app plugin contract, not by
copying Wardrobe detail/photo/settings screens into Hermes Mobile.
Wardrobe MCP schema smoke must use a real selected Gateway worker and require
`mcp_wardrobe_wardrobe_search_items`, `mcp_wardrobe_wardrobe_get_item`,
`mcp_wardrobe_wardrobe_write_item`, `mcp_wardrobe_wardrobe_upload_photo`,
`mcp_wardrobe_wardrobe_set_primary_photo`, and
`mcp_wardrobe_wardrobe_write_history`. A policy record that says `wardrobe` is
enabled is not enough if the callable schema exposed to the model lacks those
functions. MCP registration logs are not enough either: for MCP-required
smoke, use a session schema when the runtime writes one, or run
`node scripts\gateway-tool-schema-smoke.js --profile <profile> --schema-only
--require <mcp_...>` so the harness constructs that profile's actual
`AIAgent` under the production runtime overlay. Runtime-log-only MCP evidence
is allowed only with an explicit emergency override and must not be used as
normal pass evidence. Provider selection remains user intent: if the selected
provider is OpenAI/ChatGPT, repair that OpenAI profile's schema exposure rather
than auto-routing to DeepSeek; the reverse is also true.
When model-first toolset selection is disabled, Wardrobe-intent or
wardrobe-bound-topic runs must still execute with the full authorized
route/access toolset set. The deterministic route may record a narrower
`suggested_toolsets` hint such as `wardrobe`, `vision`, `file`, `skills`, and
weather-sensitive `weather`, but tests must assert that this hint does not
prune `access_policy_context.allowed_toolsets` or top-level `enabled_toolsets`.
For selector/runtime-overlay changes, standalone schema smoke is not sufficient.
The harness must also exercise the real `/v1/responses` request path and prove
that Mobile's top-level `enabled_toolsets` becomes the effective
`AIAgent.enabled_toolsets`. If that proof is unavailable during a hotfix window,
keep `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION=0` while leaving
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT` enabled unless there is an
explicit emergency rollback.
Runtime configuration harnesses must also check the effective production
launcher before concluding the selector is on or off:
`C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1` is the real
toggle owner, while `%USERPROFILE%\.hermes-windows\start-hermes-mobile-production.ps1`
is only a forwarding wrapper. A selector rollout or rollback must document the
launcher value, the backup path, and a post-restart `/api/status?detail=1`
smoke. Changing the selector does not require a Gateway Pool restart by itself,
and it must not change provider routing or disable permission preflight.
Public reverse-proxy hardening is a permission/security workflow. The harness
must cover global HTTP security headers on JSON and route-owned responses,
including `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`; query-string
Access Keys disabled by the effective production launcher; header-based Owner
auth still accepted; anonymous plugin proxy requests denied before upstream
fetch; and Codex Mobile bridge default permission mode remaining below
`full`/dangerous execution unless explicitly overridden. Production rollout
must record the launcher backup, post-restart `/api/public-config` header
smoke, query-key denial smoke, authenticated `/api/status?detail=1` smoke, and
Windows firewall state for generic Node.js Public inbound rules.
Embedded app plugin host tests must assert manifest-driven tab loading,
same-window iframe navigation, no `target=_blank` browser handoff, a short-lived
signed embed token with no raw keys in URLs, a persistent iframe host that does
not reparent launch iframes, a clean blank host during manifest/launch loading,
and a postMessage/back contract. The host-side harness must also assert that
the parent `edgeSwipeZone` starts a real edge back-swipe state for plugin pages
instead of only swallowing iframe-adjacent touch events with `preventDefault()`.
Mobile bottom navigation must keep Codex as a first-level tab while collecting
Wardrobe, Finance, and Email under the `应用` drawer without bypassing their
manifest/workspace visibility rules; hidden legacy plugin tabs must not consume
bottom navigation hit targets.
These are generic plugin requirements, not Wardrobe-only behavior; new plugins
must satisfy the same host contract before being treated as production-ready.
Installed plugin visibility must also be covered: Owner sees installed plugins
by default only when the effective workspace is `owner`; when an Owner session
switches to a non-Owner workspace, ordinary plugin list/navigation/manifest
projection must simulate that target workspace. Non-Owner workspaces do not
list or launch a plugin unless there is an explicit Owner authorization signal.
A global plugin key is not enough to authorize every workspace. Plugin-manager
changes must additionally test Owner-only admin routes, grant/revoke
persistence, normal business-plugin visibility after a grant, Codex Mobile
grant denial, Codex Mobile absence during Owner-to-non-Owner workspace
switching, and the side-navigation manager being hidden from non-Owner users.
Finance workspace provisioning is an H1 plugin authorization workflow. Granting
Finance to a workspace must create a workspace-local
`.hermes-finance/access-key.txt`, call Finance
`POST /api/v1/hermes/plugin/users/bind` with UTF-8 workspace display name,
record only `active` or bounded `provisioning_failed` status, and block
non-Owner list/manifest/launch when provisioning has failed or is still
pending. Harnesses must assert the raw workspace key is not returned in the
grant result, manifest, frontend state, URL, postMessage payload, docs, logs,
or screenshots. Focused checks include
`node tests\finance-plugin-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\wardrobe-plugin-navigation-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Wardrobe workspace provisioning is also an H1 plugin authorization workflow.
Granting Wardrobe to a workspace must create that Hermes user's own Wardrobe
workspace id, write workspace-local `.hermes-wardrobe/access-key.txt` and
non-secret `.hermes-wardrobe/config.json`, call Wardrobe
`POST /api/v1/hermes/plugin/workspaces` with a server-side `owners:write` or
`admin:*` registration bearer credential, install the keyless
complete `productivity/wardrobe-style-operations` Skill bundle into that user's
Skill Store, refresh the workspace Gateway profile binding, and block non-Owner
list/manifest/launch while provisioning is pending or failed. Harnesses must
assert generated target keys use Wardrobe's accepted Program API prefix, replace
invalid legacy placeholder-prefixed keys before registration, and keep the
target raw Wardrobe key present only in the server-to-server registration body
and the workspace-local key file, not in the grant result, manifest, frontend
state, iframe URL, postMessage payload, docs, logs, or screenshots. They must
also assert the target Skill Store contains the full `SKILL.md`,
`references/wardrobe-program-api.md`, at least one other reference Markdown
file, and `scripts/render_wardrobe_phone_pdf.py`; a fixture or runtime source
that lacks `references/` must fail closed instead of falling back to a short
template. The installed Skill bundle must not contain concrete Wardrobe
workspace keys, plugin launch tokens, or `Authorization: Bearer ...`
credentials. Missing/invalid registration credentials or incomplete Skill
bundles are bounded provisioning failures. Focused checks include
`node tests\wardrobe-plugin-provisioning-service.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`, and
`node tests\hermes-plugin-api-routes.test.js`.
Email workspace provisioning is an H1 plugin authorization workflow. Granting
Email to a workspace must call Email
`POST /api/v1/hermes/plugin/workspaces` with a server-side Email Owner key,
bounded workspace identity, and the target workspace root. The resulting
workspace-local `.hermes-email/config.json` and `.hermes-email/access-key.txt`
are the only long-lived launch materials Hermes should use; Email owns mailbox
credentials, local mail storage, sync cursors, and per-user account filtering.
Harnesses must assert the raw Email Owner key, workspace key, launch token, full
mail body, attachment content, and provider credentials are not returned in the
grant result, manifest, frontend state, iframe URL, postMessage payload, docs,
logs, or screenshots. Pending or failed Email provisioning must block non-Owner
list/manifest/launch. Focused checks include
`node tests\email-plugin-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\app-embedded-plugin-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Generic plugin provisioning states must also be covered. A plugin-manager grant
may enter `pending` only when Hermes owns an automatic provisioning service for
that plugin. Finance, Wardrobe, and Email are automatic provisioning plugins; pending
or failed records for either one must block non-Owner list/manifest/launch.
Manual/external-binding plugins without a Hermes provisioner should store
`manual_required` and must not be blocked by the pending/failed gate solely due
to the grant record. Codex Mobile remains non-grantable. The service harness
must cover Finance auto-provisioning, Finance failure blocking, Wardrobe
auto-provisioning, Wardrobe failure blocking, Email auto-provisioning, Email
failure blocking, legacy Wardrobe pending blocking, and Codex grant denial in
`node tests\hermes-plugin-service.test.js`.
Plugin notification coverage must assert that
`POST /api/hermes-plugins/<plugin-id>/notifications` requires Hermes auth,
requires a stable `sourceId`/`eventId`, supports durable Inbox-backed events and
push-only events, sends Web Push through Hermes when requested, and never
exposes plugin keys, launch tokens, push endpoints, or raw plugin content.
The default push click target is the Inbox item when one exists; `openMode=plugin`
or push-only events click the plugin route. Codex Mobile task completion keeps
one latest Inbox record per workspace through a stable workspace-scoped dedupe
key, so a new completion overwrites that workspace's previous Codex completion
item instead of creating a growing Inbox list. Codex Web Push clicks must still
go directly to the Codex plugin route, with the Inbox id carried only as
metadata. Codex completion push must be suppressed unless the plugin event is
terminal, includes bounded final receipt detail, and carries a route anchor that
can focus the completed thread/task/turn. If a plugin supplies bounded
`detailMessage`, Action Inbox detail must render it as the long receipt; Web
Push assertions must prove the long body does not appear in the push payload and
that `openMode=plugin` payloads preserve `pluginRoute`, `pluginItemId`,
`pluginThreadId`, `pluginTaskId`, and `sourceTurnId` before generic Inbox
routing.
Finance ledger join approval is an H1 plugin-to-Inbox workflow. Harnesses must
cover `finance.ledger_join_request` normalization into an Inbox `approval` item,
compact ledger/requester/role display, approve/reject actions, Finance review
contract invocation before Inbox state transition, Finance plugin refresh after
review, and privacy limits that exclude Finance tokens, Hermes workspace keys,
cookies, bank/account details, voucher bodies, push endpoints, and long logs.
Focused checks: `node tests\hermes-plugin-notification-service.test.js`,
`node tests\finance-ledger-join-approval-service.test.js`,
`node tests\action-inbox-api-routes.test.js`, and
`node tests\app-action-inbox-ui.test.js`.
Plugin projects must also carry their own harness: manifest shape, launch
exchange, frame-ancestor origin registration, `?embed=hermes` mode,
`<plugin-id>.plugin.navigation`, `hermes.plugin.back`, optional
`<plugin-id>.plugin.back_result` with `handled=false` fallback to the Hermes
outer back layer, same-iframe internal navigation, no `window.open` /
`target=_blank`, state preservation across tab switches, and installed-PWA
smoke. Hermes Mobile host tests do not replace the plugin project's own
embedded-mode tests.
The first NAS-backed registration uses
`GET /api/hermes-plugins/wardrobe/manifest` as the Mobile-side contract and
defaults the live source to
`http://192.168.10.99:8765/api/v1/hermes/plugin/manifest`, with an environment
override for later local/production source changes. Codex Mobile Web uses the
same generic route shape through `GET /api/hermes-plugins/codex-mobile/manifest`
and defaults to the local Codex plugin manifest at
`http://127.0.0.1:8787/api/v1/hermes/plugin/manifest`.
HTTPS/PWA embedded-plugin tests must assert that a raw HTTP iframe entry is
never silently rendered as a blank plugin pane. External plugins need an HTTPS
browser-facing entry or a visible diagnostic. Local/LAN plugins such as Codex
Mobile and Wardrobe may remain HTTP upstreams only when Hermes Mobile rewrites
the browser-facing entry to `/api/hermes-plugins/<plugin-id>/proxy/...` and
proxies HTML, static assets, plugin API calls, redirect headers, and session
cookies through that path. A same-origin proxied entry must not be marked
unavailable merely because the upstream plugin's `frame-ancestors` directive
does not list the Hermes origin; the browser frames the Hermes proxy URL. Direct
HTTPS/non-proxied plugin entries must still pass the frame-ancestor allow check.
The test must hit the real Mobile dispatcher route
as well as the plugin route module. Same-origin proxy launch tests must prove
server-side `fetch` uses manual redirect handling, because automatic redirect
following consumes launch `302` cookies before the browser can store them. Tests
must also assert upstream cookie `Domain` is stripped and `Path` is rewritten to
the plugin proxy prefix. They must also assert Owner switching into a non-Owner
workspace cannot reuse an Owner plugin session: the proxied launch entry must
carry the effective target `workspaceId`, upstream requests must forward
`x-hermes-plugin-workspace-id` for that target, and session cookies must be
namespaced by plugin id plus workspace id. Rewritten plugin HTML, JavaScript,
CSS, and JSON resource/API URLs must also carry the effective `workspaceId` when
the URL is a static string so a browser request that omits `Referer` still lands
in the selected workspace. JavaScript template-string URLs with runtime query
fragments, such as ``/api/threads${params}`` or
``/api/auth/status?_ts=${Date.now()}``, must preserve the template expression
and only rewrite the static path prefix to the proxy; inserting `workspaceId`
inside the expression or concatenating it as `workspaceId=ownerlimit=...` is a
failing harness case.
The client auth harness must also assert that `public/app-api-client.js` syncs
the same-origin `hermes_web_key` cookie whenever it sends `X-Hermes-Web-Key`;
otherwise authenticated plugin iframes cannot navigate to the protected
same-origin proxy because iframe navigations cannot attach custom headers.
Incoming proxy requests may translate only the current plugin/workspace cookie
back to the upstream cookie name; they must drop Owner-scoped plugin cookies,
other-workspace plugin cookies, and old unscoped plugin cookies. If a request
has no workspace hint and carries multiple workspace-scoped cookies for the same
plugin, the proxy must fail closed as an ambiguous workspace instead of falling
back to Owner. This is a generic embedded-plugin harness requirement, not a
Wardrobe-only case; cover normal workspace-private plugins such as Wardrobe and
Finance, and keep Owner-only plugins such as Codex Mobile hidden when the
effective workspace is non-Owner. Harnesses must also assert stale
session cleanup: manifest responses expire known raw upstream session cookie
names plus Owner/current Hermes-scoped names, and launch-token proxy requests do
not forward any existing plugin session cookie before the upstream issues the
fresh workspace session. The same-origin proxy must also
rewrite plugin-owned image/static URLs in HTML, JavaScript, CSS, and JSON
responses so absolute upstream image URLs and root-relative `/uploads`,
`/media`, `/images`, `/assets`, and `/static` paths stay under
`/api/hermes-plugins/<plugin-id>/proxy/...`; explicit plugin resource APIs such
as `/api/uploads/file` and `/api/files/preview/content` must also be proxied.
Wardrobe JSON photo paths such as `/api/photos/<id>/content`,
`/api/outfit-photos/<id>/content`, `/api/featured-look-photos/<id>/content`,
and `/api/v1/items/<code>/photos/...` are resource URLs and must be proxied
rather than resolved against Hermes Mobile's own `/api` namespace.
JSON responses must be parsed and rewritten structurally so thread/chat prose,
code snippets, and ordinary `/api` strings are not changed. Binary image
requests through that path must be streamed with their original content type.
Embedded plugin upload harnesses must also cover same-origin proxy upload
compatibility: sandbox strings include `allow-forms` and `allow-modals`,
multipart `FormData` upload requests keep the original body/content type, and
Wardrobe CSS proxy output turns hidden `.upload-btn input` file controls into
transparent interactive file inputs instead of `display:none` controls.
Active embedded plugin
hosts must hide the Hermes page header so plugin content is not double-framed;
the Hermes bottom navigation must also be hidden for plugin root and secondary
pages. Deployment
smoke for this class must include the installed Android PWA launched from the
home-screen icon. Opening the same URL in the Chrome/Safari address bar is
explicitly not a valid PWA smoke, because Hermes Mobile shows a browser-shell
guard page there and it does not exercise standalone storage, service-worker,
navigation, or plugin iframe behavior. Dark-mode plugin-tab smoke must also
assert that a newly created iframe is hidden behind a theme-colored shell until
load, so Codex/Wardrobe tab entry does not flash a white browser default
surface. Wardrobe-specific host tests must cover the same loading-shell
contract even when the tab uses `.wardrobe-plugin-*` classes rather than the
generic embedded-plugin host classes. Refresh stability assertions must prove an existing iframe remains
visible while the host fetches a fresh launch URL, passive/non-forced boot
warmup refresh attempts are suppressed, explicit
`<plugin-id>.plugin.refresh_required` postMessages can recover a consumed or
invalid launch page without bypassing relaunch cooldown, and entering plugin
mode clears stale keyboard viewport metrics so the chat composer returns to its
normal bottom alignment.
Dark-mode installed-PWA resume must also assert that the pre-JS shell,
manifest `background_color`/`theme_color`, `html`/`body` background, plugin
host background, and iframe loading shell share the effective dark background.
The navigation regression path `plugin -> topic -> chat` must verify stale
`keyboard-viewport-active`, `keyboard-context-mode`, `--keyboard-*` CSS
variables, and bottom-nav reservation do not shift the composer downward.
Embedded-plugin host tests must also cover the outer return layer: entering a
plugin from a Hermes page records the source route, plugin internal
`canGoBack=true` sends `hermes.plugin.back`, and plugin root /
`back_result handled=false` restores the saved Hermes page instead of trapping
the user inside the plugin tab. Plugin root and secondary pages must hide the
Hermes bottom navigation; exiting a full-screen plugin uses the host
back/right-swipe contract and saved Hermes route restoration, not a visible
bottom-tab escape path inside the plugin surface.
If Hermes sends `hermes.plugin.back` and the plugin does not acknowledge with a
fresh navigation or back-result event inside the bounded fallback window, the
host must treat that back as unconsumed and restore the saved Hermes route when
available.
Plugin refresh coupling must be covered by the host contract: the iframe may
send `<plugin-id>.plugin.refresh_required`, Hermes must validate the plugin
entry origin, discard stale iframe/launch state, fetch a fresh manifest through
the Mobile plugin route, and preserve only bounded route hints so the active
plugin returns to its intended Codex/Wardrobe position after refresh. Wrong
origin refresh messages and payloads carrying keys, cookies, launch tokens,
raw plugin content, prompts, or local paths are failing cases.
The host must still throttle passive launch-health rebuilds so an invalid
plugin page cannot create a relaunch loop; the harness must cover same-window
explicit refresh recovery, messages sent while manifest/launch loading is
already in progress, and active-tab frame rebuild without leaking route hints
beyond bounded plugin route fields. Host-side launch-health retries must use
the same throttle, and a normal host re-render must preserve an already-mounted
iframe instead of requesting another launch token.
Embedded-plugin appearance sync is part of the launch contract. Host tests must
assert Hermes sends sanitized `appearance.theme` and `appearance.fontSize` in
Codex, Finance, and Wardrobe launch bodies, maps Hermes `standard` font size to
plugin `default`, and creates iframe entries only after the short launch path
contains matching `pluginTheme` / `pluginFontSize` query parameters. The host
must treat these as session-scoped preferences and must not leak keys, launch
tokens, local paths, raw settings dumps, or private content into appearance
metadata.
The host cache harness must also assert a manifest/launch result is reused only
when both workspace id and sanitized appearance key match. A previously fetched
`system/default` Wardrobe manifest must not satisfy a later `dark/large` launch;
the next plugin entry must fetch a new launch token and entry URL with matching
appearance query parameters. The render path must apply the same
workspace-and-appearance check before reusing an existing iframe shell, so a new
appearance-aware launch token cannot remain unconsumed while the old iframe
session stays mounted.
The same harness must require stale plugin shells to be discarded when the
workspace-and-appearance key no longer matches; `preserve_iframe_state`,
navigation metadata, and refresh warmup/cooldown paths must not preserve an old
`system/default` Wardrobe iframe after a `dark/large` launch has been requested.
Plugin appearance harnesses must assert Hermes launches plugins with the
effective host theme. A host preference of `system` must be resolved via
`prefers-color-scheme` before launch, so a dark-mode PWA sends `dark` rather
than relying on each plugin to interpret `system` identically.
Plugin API route tests must also assert bounded manifest audit events capture
requested and response appearance without recording keys, launch tokens, entry
URLs, cookies, plugin content, or request bodies. This audit is the required
diagnostic path when a plugin reports receiving `system/default` while Hermes is
visibly in dark mode.
Static-client hotfixes must also run `node tests\static-cache-version-harness.test.js`.
This harness fails when cache-sensitive `public/app-*.js`, `public/styles.css`,
viewer HTML, `index.html`, or `service-worker.js` changes are present without a
client/cache version bump from `HEAD`, and it checks that the versioned app shell
uses the current embedded-plugin host script URL. Windows edits to static/test
files with Chinese text must use UTF-8-safe paths; PowerShell raw text rewrites
are not an acceptable harness path for version replacement.
Finance embedded-app registration follows the same host contract. Tests must
cover compact manifest normalization (`entry` string, top-level `launch`,
`toolsets`, `mcpServer`, `permissions`, and `embedding` events), Owner-default
visibility with non-Owner denial unless explicitly authorized, server-side
Finance launch body fields (`workspace_id`, `workspace_key`, `role`, and
optional `user_key`) without leaking raw keys into the returned manifest, and
the current Finance auth split where `user_key` is optional and must be a separate
workspace-user key, not a reused workspace key, while the workspace key is not
sent in an `Authorization: Bearer ...` header. Tests must also cover
same-origin proxy rewriting for `/finance.html`, `/manifest.webmanifest`,
`/app-finance-ui.js`, and plugin-owned `/api/finance/...` resource URLs, plus
negative cases where anonymous or unauthorized workspace requests are denied
before any upstream fetch. The
Finance token-error smoke must record only bounded evidence: manifest
`available`, `tokenStatus`, redacted proxy launch URL shape, launch `302`
preservation, redirect shape, `finance_hermes_session` cookie name, and a
bounded authenticated `/api/finance/overview` result.
Focused checks for this contract include
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\embedded-plugin-refresh-harness.test.js`,
`node tests\wardrobe-plugin-refresh-harness.test.js`, and
`node tests\app-embedded-plugin-ui.test.js`.
Switching away from a plugin tab must force-hide the plugin host and clear the
active host class even if the iframe shell record is missing, stale, or still
loading; a plugin iframe must not remain above chat/topic content after a
bottom-tab switch.
Wardrobe dashboard binding tests must cover directory ambiguity: a configured
wardrobe root with `.hermes-wardrobe/config.json` must win, child delivery
folders such as `衣橱/交付` must not steal the root, and generic outfit output
folders such as `穿搭建议` must not be treated as the deterministic dashboard
workspace.
The execution policy must also preserve the wardrobe companion set after
model-first narrowing. If the suggested set contains authorized
`wardrobe`, `vision`, and `file`, a selector result of `wardrobe,file` must
still execute with `wardrobe,vision,file`; otherwise the main run will be forced
into an avoidable `HERMES_TOOLSET_ESCALATION_REQUIRED` loop.
The same harness must cover the low-level regression where the selector returns
`clarify` alone for a wardrobe MCP task or an MCP visibility check. When the
router has already suggested authorized `wardrobe`, `vision`, `file`, and
`skills`, execution must expand back to that stack instead of starting a run
whose policy text mentions wardrobe but whose model-selected execution set
cannot expose `mcp_wardrobe_*`.
The common web companion set follows the same rule: `web`, `search`, and
`browser` should be suggested, retained, and escalation-retried together when
authorized, while the negative harness must prove `browser` is not granted if
the run policy did not authorize it.

The selector/preflight is an internal JSON-only step. Tests must assert that
preflight requests disable tool calls, that live preflight probes do not contain
tool-role messages, and that repeated JSON candidates from streamed Responses
events are parsed as a valid final decision rather than `invalid_json`.
Tens-of-seconds latency is acceptable if the preflight reliably returns;
latency/cost claims must verify the actual Gateway session or worker log model
instead of trusting only the request body's `model` field. A successful
model-first or permission-only preflight decision must also suppress a second
permission-classifier pass before execution: the main execution prompt must not
ask the model to load the permission-boundary Skill again or call `skill_view` for
`productivity/hermes-mobile-permission-boundary-check`, and UI status rows should
describe permission/toolset selection as one combined preflight.
Permission-only preflight timeout/error coverage must assert the shorter
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS` path, the
`run.permission_preflight_fallback` status row, and continued deterministic
route/access execution without showing a toolset-selection failure to the user.

Run status harnesses must cover no-first-byte visibility. If the execution
stream receives no Gateway event after the configured warning window, the
system may store a diagnostic warning event without refreshing the real Gateway
`lastEventAt` used by liveness/stale decisions. Harness coverage should assert
visible first-stream-event, first-text-output, liveness stale, and stream-failed
statuses. Run-progress UI must not render `run.liveness_warning` as a visible
row; only stale/start-timeout/stream-failed states should consume visible
status space. Light and dark theme checks must also assert the inline active
run-status panel does not collapse into a thin empty border: the panel, header,
rows, elapsed time, and at least one status row must remain visible in both
themes.
Stream-closed-without-terminal coverage is required: if streamed text already
arrived, Mobile must emit `run.stream_closed_without_terminal`, synthesize
completion from the accumulated content, and avoid failed Web Push / failed
external delivery. If no model output arrived, Mobile should release the queue
without showing the raw `Hermes stream ended without a terminal completion
event` string.
Task terminal Web Push coverage must assert duplicate terminal events are
idempotent. A second `response.completed` / `run.completed` for the same
assistant message must return a terminal-ignored result, not enqueue another
external delivery or call `notifyTaskTerminal` again; `notifyTaskTerminal`
itself must skip a duplicate send when the same task receipt tag already has a
successful push delivery.
Run-progress UI tests must also cover preflight burst stability: model-selected
and toolset-selection events should update an existing panel in place, compact
`run.toolset_selection_started` with the matching terminal result, and use only
one delayed fallback thread refresh when no target assistant message is visible.
They must not call the generic whole-thread render path for each preflight
event, because that produces visible mobile screen jitter.
Single Window topic reply and thread-merge harnesses must assert that replying
inside an open topic posts the selected `taskGroupId`, and that a locally
running message not present in an idle incoming thread is removed rather than
kept as a stale pending card.
Wardrobe routing harnesses must include weather-sensitive outfit recommendation:
a wardrobe-bound topic asking for an outfit should add authorized `weather` to
the Wardrobe companion `suggested_toolsets`. With the selector disabled or
after selector fallback, the same test must prove execution still receives the
full authorized toolset set rather than the suggested subset.
Long-reply jump control harnesses must cover terminal DOM replacement and
historical scrolling: arrow visibility recalculation must resolve the current
conversation/message node when the queued callback executes, fall back from a
detached pre-terminal node to the live conversation, and run a short delayed
settle pass after final markdown/layout replacement. The eligibility check must
also cover one-screen overflow by measured rendered height and viewport
geometry, not by the 6000-character rich-render threshold. If a reply footer is
visible, the up/start arrow must stay inline beside the Usage/Skill/status chips;
floating is only allowed while the footer is outside the viewport. Viewport
harnesses must also cover orientation recovery: after landscape/portrait changes,
the client must clear stale keyboard viewport state when the composer is no
longer actually focused, clear temporary conversation scroll-layer reset state,
recompute bottom navigation reservation, and recalculate long-reply arrows.

Static client UI tests must cover device-local theme settings when the settings
sheet changes: `system` / `light` / `dark` options render in the settings menu,
the selected mode is stored as `hermesWebTheme`, `index.html` applies
`data-theme` before CSS load, and the app updates mobile `theme-color` plus
`apple-mobile-web-app-status-bar-style` so the OS status bar stays readable.
Theme visual harnesses must also cover real dark-mode surfaces, not just root
variables: sidebar/top bar, composer, user and assistant messages, topic cards,
Action Inbox rows and deliverable file tags, Growth warning/danger cards, and
settings/access-key sheets. A change that adds or modifies theme tokens must
include a screenshot or browser visual smoke against those surfaces and focused
assertions that the critical CSS rules consume theme variables instead of
hard-coded pale surfaces.
Dark-mode contrast harnesses must also check that message markdown headings,
receipt labels, file/artifact buttons, Growth teaching badges, and file viewer
shells do not use hard-coded dark green or pale backgrounds on dark surfaces.
Green/success text in dark/system-dark mode should be treated as a contrast
risk: tests should assert success/status text resolves to off-white variables
while preserving green only as a non-text semantic cue such as background,
border, or status dot. Cover Action Inbox source/status badges, Automation
success labels, group/member action buttons, topic secondary-page header
controls and directory chips, and reading fullscreen controls.
Settings-sheet grouped controls must also have dark/system-dark selected-state
coverage: theme options, font options, and default model options need a visible
selected frame/inner outline, not only a low-contrast fill.
Standalone `file-viewer.html`, `markdown-viewer.html`, and `pdf-viewer.html`
must read the saved `hermesWebTheme` preference before paint and expose
near-black page backgrounds in dark mode.
Foreground restore tests must also assert `handleAppForegrounded()` reapplies
the saved theme preference before refresh/render work, so a light-mode user does
not briefly see a dark-mode repaint when returning to the PWA.

Mobile sidebar shell tests must assert the side navigation is full-screen at
mobile/PWA widths (`100vw`, `100dvh`, safe-area padding, no visible underlying
app strip) and remains vertically scrollable without horizontal overflow.
Gateway provider status rows inside the sidebar must wrap through a compact
name/status layout rather than fixed three-column rows, so provider labels and
`Low`/`High` availability text cannot overlap on narrow devices.

Growth card detail/share UI tests must cover the H2 projection contract:
teaching-card and formal-card details render a `data-learning-growth-card-share`
control, use the local image-share pipeline with Web Share file payloads plus
clipboard/download fallback, and keep the detail page as a single-column
reading shell rather than nested table-like card grids. Assertions should cover
`app-learning-growth-task-ui`, `app-learning-program-ui`, `app-share-image-ui`,
and CSS rules that prevent card detail sections and structured questions from
compressing mobile text width.

Action Inbox harnesses must cover the low-click delivery and Todo semantics:
Automation delivery rows with `sourceRef.latestDeliverable` must render a
direct same-window document preview file tag that reuses the Automation detail
deliverable visual pattern and does not hardcode Markdown-only wording;
scheduled Todo/reminder Automation triggers must create `itemType=todo` Inbox
occurrences; scheduled Todo Automation rows with a safe deliverable must still
render the direct document preview action; row title/main areas must open the
Automation source detail with Inbox return context; row status must render as a
compact action badge after source/type, and tapping that status badge opens a
viewport-level action sheet with complete, snooze, and delete/dismiss actions;
the default open-state action badge must render the real status label `待处理`,
not a generic `处理` command, and its visual size/weight/color must stay close to
compact metadata text rather than a filled action pill;
the list must not render a separate right-side `处理` button that duplicates the
status badge or compresses the mobile row; generic
`待办提醒` titles must be replaced by the actual Automation/reminder title in
new projections or UI fallback; partial left swipes must not complete an Inbox
item while full swipes complete it once; and the default Inbox list must sort
newest items first by update/event/create time rather than grouping older Todo
rows above newer Automation receipts. Scheduled
Todo/reminder Automation pushes must also assert same-run idempotency: after a
deliverable push is marked for a `lastRunAt`, a later scan for the same run with
no newer deliverable must not send a second no-deliverable push, create another
Inbox upsert, or downgrade the stored mark.
Manual `sourceType=manual,itemType=todo` Inbox rows are already on their source
surface. If legacy data carries `/?view=todos...` or `todoId` deep links,
projection tests must assert the detail page does not render `Open source`, row
navigation does not call the internal route helper, and back navigation never
lands in the retired official Kanban/Todo compatibility surface.
The same compact source/type/status action contract applies to the Inbox detail
secondary page, not only the root list: the detail meta row must reuse the same
status-action badge and action-sheet path instead of rendering a larger legacy
status pill or separate process button.
The Inbox visual harness must also cover adjacent row badges/actions: `来源`,
`类型`, and status-action labels in the same meta row must share height,
padding, font family, font size, font weight, line-height, and letter spacing.
The status action may show a subtle chevron and semantic color, but must not
fall back to a larger browser-default button style.
This must be asserted with the app font-size setting enabled: the generic
`:root[data-font-size] button` rule must not enlarge an inline status button
relative to adjacent span badges.

Topic/navigation harnesses must assert that a missing `currentTaskGroupId`
does not leave the app permanently on `Restoring topic...` because of unrelated
active runs in the same single-window thread. The restore placeholder is valid
only for queued/running messages belonging to the same task group or while the
current thread fetch is actually in flight.

Toolset escalation and retry harnesses must assert that
`HERMES_TOOLSET_ESCALATION_REQUIRED` is stripped from visible chat content,
stored as bounded `toolsetEscalationRequired` metadata, and projected as
`run.toolset_escalation_required`. When the requested toolsets are omitted but
authorized, the same assistant message must automatically retry with the
previous selected toolsets plus the requested toolsets, skip a second selector
pass, emit `run.toolset_escalation_retrying`, and avoid terminal delivery until
that retry finishes. If the model requests a toolset that is already selected,
the raw marker must still be stripped and recorded as a controlled
schema-mismatch escalation without starting a duplicate retry. A later manual
retry/rerun message should also reuse recent task context or stored escalation
metadata to suggest the needed authorized toolsets instead of treating retry as
a plain probe, including when the relevant task context is in the same
`taskGroupId` but no longer in the global message tail.
Streaming-delta tests must also cover marker suppression before completion so
the raw escalation marker cannot appear briefly in the visible receipt while the
retry is being prepared.

Run tool-budget harnesses must prevent both extremes: runaway Web search loops
must abort when the configured cap is exceeded, but the default cap must not
kill an ordinary user-requested news/search run on the third search call. The
instruction harness must also assert that web/search-enabled runs tell the model
the configured Web-search budget before tool use.

Explicit user-requested web/X search uses the higher explicit-search budget and
quality-first instruction. Harness coverage must assert that explicit
`web_search` / `x_search` runs tell the model to prioritize source quality,
meaningful coverage, and verifiable evidence over small time/token savings,
while ordinary incidental web-enabled runs keep the normal cap.
`x_search` bridge-host proxy coverage must also include hybrid cold starts:
when the manifest Grok profile is configured but stopped, bridge-host checks
Grok `/health`, starts only the manifest `xai-oauth` profile, waits for health,
and then forwards the proxy request. Concurrent proxy requests must share one
start attempt. Focused checks include `node tests\bridge-host-grok-proxy.test.js`
and `node tests\startup-scripts.test.js`.

Run-progress UI behavior tests must also assert chronological downward row
ordering, public `web_...` plus response `resp_...` id merging for the same
assistant message, isolation from unrelated thread active ids so a fast task
cannot inherit another active chat run's elapsed time or events, and bottom
visibility when the inline status panel grows while the conversation is already
following the run. Function-call UI tests must also assert that object-shaped
previews and paired `callId` result events display the concrete function name
when available, and that paired Skill/function start and done events render as
one compact operation row with a status/duration label rather than adjacent
duplicate start/result rows. For `function_call` / `function_call_output`
pairs, the duration assertion must use the output/result completion timestamp
minus the original function-call start timestamp; the intermediate
`function_call.done` event must not be treated as tool execution completion.
Gateway event-service tests must also cover both `item` and `output_item`
payload shapes so function names are preserved while raw arguments and raw tool
outputs remain excluded. Once streamed text begins, run-progress UI tests must
assert the inline panel switches to compact display unless a later tool
operation has started. UI fallback tests must assert unnamed function events are
omitted instead of rendering generic labels such as `Function` or duplicated
labels such as `Function Function`.
Terminal assistant receipts must collapse completed run-progress details into a
footer tag similar to Usage/Skill; opening the tag shows historical rows from
the first retained event, remains scrollable and inside the portrait viewport,
prefers space above the tapped status chip instead of covering the lower
conversation/composer area, and terminal history must not render an ongoing
quiet/still-running row. Skill footer tests must assert no synthetic response
fallback Skill is projected when no real Skill was loaded.
The terminal run-progress history panel must not reserve a tall blank fixed
area when content is short. Mobile positioning should use content-aware
`top + max-height` with `bottom:auto`; only long histories should scroll.

For same-window navigation and browser-frame bugs, the required harness must
cover both root-mounted and prefix-mounted app-shell paths. If the issue is
reported through an external reverse-proxy/PWA URL, validation must include
that exact external entry path and the changed route-helper JavaScript from the
same origin/path; local root smoke alone is insufficient.
Web Push chat/topic receipt routing must cover terminal receipt `messageId`
projection, single-window route precedence over generic `taskGroupId`, and
frontend scroll target consumption after chat/topic messages render. Web Push
subscription and delivery tests must also cover deployment-origin scoping:
frontend `clientContext.origin`, subscribe-route server-origin forwarding,
matching-origin delivery, and skipped delivery for copied legacy subscriptions
with missing or mismatched origin when `HERMES_MOBILE_PUBLIC_ORIGIN` or
`HERMES_WEB_PUBLIC_ORIGIN` is configured.

For secondary-page return bugs, the harness must also cover async race
conditions: a late response from the page being left must not repaint that page
after the return target has already been restored.
Topic-list harnesses must cover Kanban-generated case-topic cleanup: the root
topic list must not render Kanban study/case topics even when their backing
cards still exist. Those records are source evidence for Growth/Todo/Kanban or
Inbox deep links, not ordinary root topics. The same filter must apply to
first-party topic groups carrying `kanbanCaseId`/`kanbanCaseMode` and shared
case-topic threads.

## CodeGraph-Assisted Test Selection

Use CodeGraph for structural test selection, not as a replacement for the test
matrix.

- Check index health first when structural results matter:
  - `codegraph status`
- For known backend symbols:
  - `codegraph callers <symbol>`
  - `codegraph callees <symbol>`
  - `codegraph impact <symbol>`
- For broad backend task context:
  - `codegraph context "<task>"`
- Prefer MCP CodeGraph when available. The 2026-05-26 local benchmark showed
  MCP structural calls around `12-18ms`; CLI calls were around `196-218ms`
  because of process startup.
- Keep `rg` for literal text, docs, static versions, DOM strings, and frontend
  closure functions. In the same benchmark, `codegraph affected
  public/app-learning-growth-task-ui.js -q` returned no UI tests while targeted
  `rg` found related UI test references.
- If `codegraph impact` and `rg` disagree on tests, run the union of relevant
  focused tests unless the difference is clearly unrelated.

## CodeGraph-First Read Budget

For H1/H2 changes, especially navigation, route, passive notification, Web
Push, Automation, Growth, Gateway, or workflow bugs, keep initial context
loading bounded:

- Use MCP CodeGraph first when available; CLI `codegraph` is a fallback because
  each CLI call starts a process.
- Run up to three CodeGraph structural queries before opening source files:
  `codegraph_context`, then a targeted `codegraph_search`/`codegraph_callers`
  or `codegraph_trace`/`codegraph_impact` depending on the question.
- Open no more than four source files in the first triage pass, and read only
  the symbol body or about 80-120 lines around each relevant symbol.
- For frontend closure-local functions, DOM strings, `data-*` attributes, URL
  query parameters, static versions, and tests, run one targeted `rg` pass after
  CodeGraph identifies the likely files.
- For `.agent-context/HANDOFF.md` and long docs, search headings or keywords
  first with `Select-String`/`rg`; do not read long tails by default.
- If more context is needed, state the missing fact and widen the read scope
  deliberately.

The guard test is:

- `node tests\codegraph-harness-discipline.test.js`

## Module Focused Tests

| Area | Focused Tests |
| --- | --- |
| API registry/dispatcher | `node tests\api-route-registry.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js` |
| Multi-user/task platform | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\conversation-history-service.test.js`, `node tests\action-inbox-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Auth/workspace/access keys | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\workspace-public-projection-service.test.js`, `node tests\mobile-http-runtime-service.test.js` |
| Public reverse-proxy security | `node tests\auth-provider.test.js`, `node tests\mobile-http-runtime-service.test.js`, `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\api-route-inventory.test.js`, `node tests\architecture-refactor-boundary.test.js`, `npm.cmd run security:invariants`, `npm.cmd run privacy:scan`, production smoke: `/api/public-config` headers, query-string key denial, header-authenticated `/api/status?detail=1`, anonymous plugin proxy denial, and Windows firewall state |
| Gateway run lifecycle | `node tests\gateway-run-model-toolset-selection-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\gateway-run-stream-service.test.js`, `node tests\gateway-run-lifecycle-service.test.js`, `node tests\gateway-run-queue-service.test.js`, `node tests\run-liveness.test.js`, `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js` |
| Chat context/compaction | `node tests\conversation-history-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\topic-context-compaction-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\mobile-sqlite-store.test.js` |
| Gateway Pool/scripts | `node tests\gateway-pool-provider.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\cross-shell-command-harness.test.js`, `node tests\hermes-mobile-image-plugin.test.js` |
| Gateway MCP callable schema | `python -m py_compile gateway-runtime-overrides\sitecustomize.py gateway-runtime-overrides\model_tools.py`, `node scripts\probe-lowgw1-wardrobe-mcp.js`, `node tests\no-window-command-harness.test.js` |
| ChatGPT Pro | `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\owner-elevation-routing-service.test.js`, `node tests\thread-message-create-service.test.js` |
| Grok/model routing | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js` |
| Direct provider keys / Gateway Pool distro | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-pool-provider.test.js`, `node tests\gateway-status-projection.test.js`, `node tests\thread-message-create-service.test.js`, `node tests\startup-scripts.test.js`, production smoke: `/api/status?detail=1`, all low/owner-maintenance Gateway health ports, provider-tier status matrix, workspace-dedicated DeepSeek profile routing including Owner-only `deepseekgw99`, and process-environment evidence that target workers received the expected provider key without logging the raw key |
| Web Push | `node tests\web-push-delivery-service.test.js`, `node tests\push-api-routes.test.js`, `node tests\task-list-ui.test.js`, `node tests\same-window-navigation-harness.test.js` |
| Static client/UI shell | `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js`, `node tests\keyboard-viewport-ui.test.js`, `node tests\viewport-scroll-ui.test.js`, `node tests\same-window-navigation-harness.test.js` |
| Action Inbox | `node tests\action-inbox-service.test.js`, `node tests\action-inbox-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\task-list-ui.test.js`, `node tests\web-push-delivery-service.test.js` |
| Embedded plugin host / Wardrobe, Codex, and Finance plugin tabs | `node tests\hermes-plugin-service.test.js`, `node tests\hermes-plugin-notification-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\app-embedded-plugin-ui.test.js`, `node tests\embedded-plugin-refresh-harness.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\app-wardrobe-ui.test.js`, `node tests\wardrobe-plugin-navigation-ui.test.js`, `node tests\task-list-ui.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, Android emulator PWA smoke from the home-screen Hermes icon for embedded-plugin changes |
| Directory/files/artifacts | `node tests\directory-browser-api-routes.test.js`, `node tests\directory-mutation-api-routes.test.js`, `node tests\directory-share-api-routes.test.js`, `node tests\file-artifact-api-routes.test.js`, `node tests\file-artifact-access-service.test.js` |
| Skill permissions/details | `node tests\skill-detail-provider.test.js`, `node tests\skill-analysis-service.test.js`, `node tests\resource-api-routes.test.js`, `node tests\gateway-workspace-provisioning-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\link-skill-profile-store.test.js`, `node tests\task-list-ui.test.js` |
| Automation/Cron | `node tests\automation-api-routes.test.js`, `node tests\automation-provider.test.js`, `node tests\cron-bridge.test.js`, `node tests\local-automation-bridge-service.test.js`, `node tests\mobile-runtime-environment-service.test.js`, `node tests\startup-scripts.test.js`; production/NAS smoke must verify that `/api/automations?detail=summary&refresh=1` reads the configured canonical scheduler and does not silently report an empty SQLite mirror when official CRON has jobs |
| Weixin ingress/delivery | `node tests\weixin-api-routes.test.js`, `node tests\weixin-ingress-event-service.test.js`, `node tests\weixin-ingress-provider.test.js`, `node tests\weixin-outbound-delivery-service.test.js`, `node tests\weixin-runtime-composition-service.test.js` |
| Group chat | `node tests\single-window-group-chat-api-routes.test.js`, `node tests\group-chat-ui.test.js`, `node tests\group-chat-shared-attachment-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Runtime SQLite/state | `node tests\mobile-sqlite-store.test.js`, `node tests\runtime-state-repository.test.js`, `node tests\runtime-state-store-service.test.js`, `node tests\runtime-state-persistence-service.test.js`, `node tests\runtime-state-normalization-service.test.js` |
| Growth board/program/task | `node tests\learning-program-api-routes.test.js`, `node tests\learning-program-service.test.js`, `node tests\learning-program-publish-service.test.js`, `node tests\learning-program-repository.test.js`, `node tests\learning-growth-jit-task-service.test.js`, `node tests\learning-growth-service.test.js`, `node tests\learning-growth-board-projection-service.test.js`, `node tests\learning-growth-teaching-card-services.test.js`, `node tests\learning-growth-card-api-routes.test.js` |
| Growth submissions/evaluation queue | `node tests\learning-growth-submission-service.test.js`, `node tests\learning-growth-task-evaluation-service.test.js`, `node tests\learning-growth-task-interaction-state-service.test.js`, `node tests\learning-growth-task-feedback-service.test.js` |
| Growth mastery/evergreen | `node tests\learning-growth-mastery-profile-service.test.js`, `node tests\learning-growth-mastery-repository.test.js`, `node tests\learning-growth-next-card-strategy-service.test.js`, `node tests\learning-growth-sequence-service.test.js` |
| Growth frontend | `node tests\app-learning-growth-ui.test.js`, `node tests\app-learning-growth-task-ui.test.js`, `node tests\app-learning-program-ui.test.js`, `node tests\app-learning-native-growth-submission-controller.test.js`, `node tests\task-list-ui.test.js` |
| Learning rewards/coins | `node tests\learning-reward-settlement-service.test.js`, `node tests\learning-coin-service.test.js`, `node tests\learning-coin-api-routes.test.js` |
| Tongbao platform currency | v399 wallet foundation: `node tests\platform-currency-service.test.js`, `node tests\platform-currency-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\api-route-inventory.test.js`, `node tests\task-list-ui.test.js`, and `node tests\architecture-refactor-boundary.test.js`; future exchange/spend/grant work must also add `node tests\platform-currency-exchange-service.test.js`, `node tests\learning-coin-service.test.js`, and `node tests\learning-coin-api-routes.test.js` |
| Public export/release | `node tests\public-export.test.js`, `node scripts\privacy-scan.js --all-files`, `npm.cmd run export:public` |

## Planned Growth Workflow Contract Gate

The workflow harness described in `docs\IMPLEMENTATION_NOTES\growth-learning-workflow-contract-harness.md` is the required next gate for non-trivial Growth card workflow work. Once implemented, Growth changes that touch submission, evaluation, reflection, queue recovery, reward settlement, or workflow projection should run:

- `node tests\learning-card-workflow-contract.test.js`
- `node tests\learning-card-workflow-recovery.test.js`
- `node tests\learning-card-workflow-reconciler.test.js`
- `node tests\learning-card-workflow-privacy.test.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\task-list-ui.test.js`

Until those harness tests exist, implementation agents must add the relevant scenario before claiming the workflow change is complete.

## Planned Growth Knowledge Graph Gate

The graph-guided planning docs in
`docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-*.md` are the required
pre-coding gate for future graph-guided Growth card authoring. Current guard:

- `node tests\learning-growth-knowledge-graph-docs.test.js`

Once graph services are implemented, Growth changes that touch graph nodes,
domain packs, seed import, card graph bindings, or graph-guided card publishing
should run:

- `node tests\learning-graph-node-service.test.js`
- `node tests\learning-graph-import-service.test.js`
- `node tests\learning-graph-plan-service.test.js`
- `node tests\learning-card-graph-binding-service.test.js`
- `node tests\learning-growth-knowledge-graph-harness.test.js`
- the relevant Growth publish/JIT/projection/UI tests from the module table.

## Production Verification Tiers

- Static-only change: sync static/test files, run syntax/focused UI tests in production app directory, smoke `/api/client-version`.
- Listener code change: check `/api/status?detail=1` first, backup, sync, run focused tests, listener-only restart, smoke status.
- Gateway plugin/profile/schema/startup change: backup, sync, run focused checks, restart Gateway Pool, smoke worker health. ChatGPT Image 2 plugin changes must also run `node tests\hermes-mobile-image-plugin.test.js` and a bounded direct low Gateway `chatgpt_image_edit` smoke.
- Data repair: backup data first, apply bounded repair, verify metadata/API results, avoid restart unless runtime memory could overwrite the repair.
