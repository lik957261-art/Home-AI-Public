# Visual Polish Controller

Status: V1 implemented as a Home AI CLI controller.

## Product Position

Home AI owns the central mobile visual verification loop for host and embedded
plugin surfaces. Plugin workspaces consume the shared live iOS PWA debug server,
Appium lane lease, and `ios-pwa-visual-harness.js` instead of creating local
visual tooling. The controller converts visual evidence into bounded task-card
requests so the host thread can delegate scoped fixes to plugin Codex threads
and then re-run the same harness for acceptance.

The controller is deliberately not an auto-repair loop. It does not edit plugin
repositories, commit, push, deploy, restart services, or mutate plugin data. It
only plans harness commands, ingests harness reports, writes auditable task-card
drafts, and, when explicitly requested, sends those cards through the Codex
Mobile cross-thread task-card interface.

## Scheduled Audit Runner

`scripts/visual-polish-audit-runner.js` is the production no-agent wrapper for
scheduled visual audits. It reads
`/Users/example/path`, runs the
selected `ios-pwa-visual-harness.js` scenarios, ingests only failed reports, and
sends cross-thread task cards to the configured plugin Codex Mobile threads.

The runner does not start Codex CLI directly. Task execution remains owned by
Codex Mobile task cards so Home AI, app-server, and mux state stay aligned with
the selected target thread/profile. Evidence capture remains `no_agent`; the
high-reasoning analysis step is a separate Home AI Automation job named
`homeai_visual_analysis_xhigh`. That job is agent-backed, uses the dedicated
`hm-owner-openai-xhigh` profile, and maps the requested ChatGPT 5.5 X Hi mode to
`gpt-5.5` plus `agent.reasoning_effort: xhigh` so the analysis itself happens
inside Home AI rather than being expressed only as a downstream card preference.

On Mac production, the live debug server is installed as the desktop user's
LaunchAgent `com.hermesmobile.visual-debug`. The scheduled CRON jobs continue
to run as `hermes-host`, but they only consume `http://127.0.0.1:19073/`; they
do not create their own Simulator/Appium session under the service account. The
LaunchAgent runs `scripts/ios-pwa-live-debug-server.js` from the deployed Home
AI app and uses the desktop user's `.homeai-qa` Appium bootstrap path.

Scheduled runs open the current Home AI app URL before each scenario, clear
browser static caches through the live debug server, and pass
`--expected-client-version` from the deployed `public/index.html`. The default
app URL is `http://127.0.0.1:8797/?source=pwa`; set
`HOMEAI_VISUAL_AUDIT_APP_URL` when a Simulator lane must use a LAN or HTTPS
origin. A stale Safari/PWA page is a harness setup failure and should surface as
`client_version_matches_expected`, not as a misleading Dock or layout failure.
The freshness preflight now unregisters Service Workers, clears Cache Storage,
reopens the target URL, and waits for the expected `data-client-version`, no
old-client update banner, and a visible non-zero app rect. Failures in this
preflight, screenshot minimum size, or app visibility are marked
`failureKind=environment`; the controller records them in reports but does not
generate UI repair task cards from them.

The default production schedule includes a `global-interactions` job installed
as `homeai_visual_global_interactions`. It currently runs the host global Dock
gesture scenario plus the Finance plugin drawer action gesture scenario. This
job is for cross-surface interaction regressions and should stay bounded; broad
per-plugin layout checks remain in the plugin-specific visual jobs.

Low-signal scheduled visual audit completions are not user-facing deliveries.
When a `homeai_visual_*` job completes successfully, the Automation Web Push
projection updates the push mark and leaves the evidence in Automation/audit
history without creating an Inbox row or Web Push notification. Failed visual
audit rows remain high-signal and use a stable `automation-audit:<workspaceId>:<jobId>:error`
dedupe key so the current list shows one actionable item per failing scenario
instead of one row per run.

Video evidence is optional. By default the runner stores screenshots and JSON
reports only. Set `HOMEAI_VISUAL_AUDIT_RECORD_VIDEO=1` for a job environment to
also record an iOS Simulator video with
`xcrun simctl io booted recordVideo`; leave it disabled for high-frequency jobs
unless a specific flicker or transition regression requires frame evidence.

## Entrypoint

```sh
npm run visual:polish -- plan --all-default-plugins --debug-url http://127.0.0.1:19073/
```

`plan` prints checked `npm run ios:pwa:visual -- ... --json` commands for
host-owned surfaces and plugin-owned embedded surfaces.

```sh
npm run visual:polish -- ingest \
  --report tmp/visual-report-music.json \
  --source-thread <source-thread-id> \
  --target-thread music=<codex-thread-id-or-exact-title>
```

`ingest` reads one or more JSON reports produced by
`scripts/ios-pwa-visual-harness.js`, classifies each failed report by owner and
severity, and writes:

- `tmp/visual-polish-runs/<run-id>/report.json`
- `tmp/visual-polish-runs/<run-id>/summary.md`
- `tmp/visual-polish-runs/<run-id>/task-cards/*.md`
- `tmp/visual-polish-runs/<run-id>/task-cards/*.request.json`

```sh
npm run visual:polish -- send-cards \
  --controller-report tmp/visual-polish-runs/<run-id>/report.json \
  --source-thread <source-thread-id> \
  --target-thread music=<codex-thread-id-or-exact-title>
```

`send-cards` is the only mode that calls Codex Mobile. It invokes
`/Users/example/path`,
which uses `POST /api/threads/:sourceThreadId/task-cards`. That Codex route is
the documented thread-callable delegation path and defaults to source-thread
direct approval. Pass `--pending` when a normal target-side approval card is
required instead.

Codex Mobile task cards are cross-thread only. If a host-owned visual issue is
configured to target the same thread as `sourceThreadId`, the controller records
the card as `source_thread_self_target` skipped and does not call the Codex
Mobile task-card script. Plugin-owned issues with a different configured target
thread continue to create cross-thread cards. This keeps scheduled host audits
from failing with `target_thread_id_required` while preserving the evidence in
the audit report.

## Ownership Rules

Home AI owns:

- primary bottom navigation and global plugin Dock;
- host route/back/shell state;
- chat composer and host-owned keyboard behavior;
- screenshot, auth/session, client-version, and visual-lane preconditions.

Plugins own:

- iframe internal layout and scroll behavior;
- plugin app header, tabs, sheets, floating actions, and plugin-specific
  keyboard/composer behavior;
- embedded plugin visual regressions that do not involve host shell geometry.

`plugin-drawer-action-gestures` defaults to Home AI ownership unless the failed
assertion is explicitly about plugin iframe content.

Plugin runtime ids and Codex task-card owners are not always identical. The
Health plugin runtime id is `health`, while the plugin workspace/thread owner is
`healthy`. Visual harness commands must use `--plugin-id health`; controller
task cards for Health-owned iframe issues must still target owner `healthy`.

## Privacy And Audit Rules

The controller redacts token-like query parameters and bearer strings before
writing reports. It stores bounded evidence references such as report paths,
screenshot paths, failed assertion names, and short assertion details. It must
not store raw access keys, cookies, launch keys, full logs, model transcripts,
or private plugin data.

## Acceptance

For controller changes, run:

```sh
node --check scripts/visual-polish-controller.js
node --check scripts/visual-polish-audit-runner.js
node tests/visual-polish-controller.test.js
node tests/visual-polish-audit-runner.test.js
node tests/ios-pwa-visual-harness.test.js
node tests/architecture-code-test-harness-map.test.js
```

When actual UI evidence is needed, allocate the Home AI visual lane first and
then run the planned `npm run ios:pwa:visual -- ... --json` commands.
