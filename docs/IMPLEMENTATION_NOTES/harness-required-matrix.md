# Harness Required Matrix

Last updated: 2026-06-06.

This document defines when Hermes Mobile changes must add or run a workflow
harness instead of relying only on unit tests, focused UI tests, or manual
smoke checks.

A harness is a machine-verifiable workflow contract. It should model the
observable states, accepted events, failed events, async recovery behavior,
privacy limits, and UI projection for a product flow. A harness can be built
from fake model responses, fake queues, fake push delivery, route/service
tests, DOM assertions, and reconciler tests.

## Classification Rule

Before implementing a non-trivial change, classify the touched flow:

- **H1 Required Harness**: the change touches async workflow state, user-visible
  completion, rewards, permissions, passive notifications, delivery routing, or
  public release artifacts. The implementation is not complete until the
  relevant harness scenario exists and passes.
- **H2 Contract/Projection Harness**: the change is mostly UI or projection
  logic but affects persistent navigation, scroll intent, visible status, or
  cross-surface consistency. Add DOM/projection/route contract coverage, but a
  full async state machine harness may not be necessary.
- **H3 Focused Tests Only**: the change is isolated copy, styling, or a small
  deterministic helper that does not alter state, permissions, async behavior,
  routing, release artifacts, or user-visible workflow completion.

If a change touches multiple classes, use the highest class.

## Mobile PWA Verification Rule

Any Hermes Mobile function, navigation, UI, cache, service-worker, Web Push,
plugin, file preview, or mobile viewport validation must launch Hermes Mobile
from the installed home-screen PWA icon in the emulator or target device.

Opening the Hermes URL in Chrome/Safari address bar is browser-mode validation
only. It is not acceptable as the primary mobile/PWA acceptance evidence because
it bypasses standalone display mode and may intentionally show the
browser-shell guard page.

Browser-mode checks may be used only as a diagnostic comparison after the PWA
path has been tested, or when explicitly testing the browser-shell guard page.

Any Hermes Mobile UI change must include visual verification evidence before it
is considered complete. The minimum fallback is a Playwright mobile viewport
screenshot plus measured bounding rectangles for the changed surface and nearby
layout boundaries. If an Android emulator or target device is available, the
same surface should also be checked through the installed PWA path. This visual
gate is required for fixed/sticky regions, bottom navigation, plugin docks,
scroll containers, cards, popups, drawers, embedded plugin frames, and any
change where text or controls can overlap, drift, disappear, or become
untappable.

As of 2026-06-02, the maintained ADB Android 13 e-ink target is the default
real-device UI harness target for Hermes Mobile when the assertion is not about
exact color. Any UI, navigation, gesture, layout, installed-PWA refresh, bottom
navigation, composer, plugin dock, plugin iframe, or scroll/back change must be
smoked on that device before completion if it is connected. Use Playwright,
Chrome, or a normal color phone for color fidelity, saturation, and icon color
review; do not reject or accept color decisions from the e-ink screenshot alone.

Any deployed UI/static change must also verify the client refresh contract on
the actual target origin. The source version bump is insufficient by itself:
validation must read the loaded page's `data-client-version` after a browser or
installed-PWA reload and prove it equals the new static version. It must also
smoke `/api/client-version` with both the new version (`refreshRequired=false`)
and the previously deployed version (`refreshRequired=true`). If the real client
still loads the old version after kill/reopen or reload, the deployment remains
open and the correction must use another static version instead of overwriting
the same `?v=` URLs.

The minimum accepted PWA harness evidence is:

- `adb devices` shows the emulator or target device used for the smoke.
- The `Hermes` home-screen PWA shortcut is installed or installed during the
  test through Chrome's `Install app` flow.
- The app is launched by tapping that launcher icon, not by opening the Hermes
  URL with `am start -d`, Chrome address-bar navigation, or a desktop browser.
- The captured screenshot shows the standalone PWA shell without a browser
  address bar.
- The captured app state proves the tested surface loaded, such as the expected
  client version, workspace list, chat content, bottom tab, plugin iframe,
  file preview, or Web Push destination.
- If DevTools is used because UIAutomator exposes only a generic WebView, the
  recorded state must include bounded fields such as `location.href`,
  `document.readyState`, version, stored-key presence, and visible text summary;
  do not record raw access keys, cookies, launch tokens, push endpoints, or
  private long content.

Opening the same URL in mobile Chrome/Safari may be useful to prove the
browser-shell guard works. That result must be labeled `browser-mode` and must
not be used as PWA functional pass/fail evidence.

## CodeGraph-Assisted Triage Rule

Use CodeGraph as the first structural triage pass for H1/H2 changes, then
validate its result against the harness class and the focused test matrix.

Current benchmark on 2026-05-26 for this workspace:

| Probe | Result |
| --- | --- |
| CodeGraph MCP status | `588` files, `10,518` nodes, `32,875` edges, index up to date |
| MCP structural calls | `codegraph_search`, `codegraph_callers`, `codegraph_callees`, and `codegraph_impact` returned in roughly `12-18ms` for `createLearningGrowthSubmissionService` |
| CLI structural calls | `codegraph` CLI returned in roughly `196-218ms` because each call starts a Node process |
| `rg` text calls | `rg` returned in roughly `20-61ms`, but only produced text matches rather than caller/callee/impact semantics |
| Backend impact sample | `codegraph_impact createLearningGrowthSubmissionService` directly identified `server-routes/mobile-api-composition.js` and `tests/learning-growth-submission-service.test.js` |
| UI limitation sample | `codegraph affected public/app-learning-growth-task-ui.js -q` returned no tests, while `rg` found related UI test references |

Required practice:

- Prefer CodeGraph MCP over CodeGraph CLI when the MCP tools are loaded.
- For H1/H2 work, start with a bounded context-read budget before opening
  source files:
  - Run no more than three CodeGraph structural queries before the first source
    read unless a result is ambiguous.
  - Open no more than four source files during the initial triage pass.
  - Read only the symbol body or about 80-120 surrounding lines for each
    source file during triage.
  - Use `Select-String`/`rg` on `.agent-context/HANDOFF.md` and large docs
    first, then read only the matching small section.
- For backend service/provider/route changes, run at least one structural query
  before editing:
  - `codegraph_context` for broad task context.
  - `codegraph_search` plus `codegraph_callers`/`codegraph_callees` for a known
    symbol.
  - `codegraph_impact` for blast radius and focused test candidates.
- For navigation, route, and cross-surface UI bugs, use a route-first query
  sequence instead of broad file reading:
  - `codegraph_context` for the user-visible flow.
  - `codegraph_search`/`codegraph_callers` for the known route or opener symbol.
  - one targeted `rg` pass for `data-*`, URL query keys, static version strings,
    and test assertions.
- Treat `codegraph_impact` as advisory test selection evidence, not as the only
  validation gate.
- Do not rely on `codegraph affected` alone. It may miss UI tests and closure or
  string-driven frontend dependencies.
- For frontend UI, DOM string, static version, service-worker, and documentation
  changes, combine CodeGraph with `rg`, direct file reads, and the module-focused
  tests in `docs/TEST_MATRIX.md`.
- If CodeGraph returns no result for a frontend closure function, use targeted
  text search instead of assuming the symbol is unused.
- After code changes, run `codegraph sync` or confirm `codegraph status` before
  using new graph results for follow-up decisions.

## H1 Required Harness

### macOS Production Deployment And Workspace Isolation

Applies to the Mac Studio production installer, launchd service generation,
Mac-native Gateway startup, workspace OS-user isolation, plugin MCP binding,
network-mode selection, and first-start preflight.

Required harness dimensions:

- macOS is Darwin/BSD Unix, not Linux. Installer and runbook checks must use
  launchd-oriented service definitions and must not assume systemd, WSL,
  Linux namespace behavior, or Windows Task Scheduler.
- The installer must create or verify a host/control user, such as
  `hermes-host`, and one OS user per production workspace, such as `hm-owner`,
  `hm-wuping`, `hm-stephen`, and `hm-xuyan`.
- Workspace private roots must be owned by their workspace OS user and be
  private (`0700` or stricter equivalent). A non-Owner OS user must fail to
  read Owner files, Owner Skill Store, Owner Memory Store, and Owner
  `.hermes-<plugin>/access-key.txt`.
- Gateway workers and MCP wrappers must run as the effective workspace OS user.
  Owner switching into another workspace must select that workspace's worker
  and MCP bindings rather than an Owner worker.
- Plugin services may be shared application services, but Hermes-facing plugin
  identity must remain workspace-local. MCP wrappers must pass the target
  workspace root plus `--no-workspace-override` and must not accept model-side
  workspace/key overrides.
- Missing plugin config/key must omit the plugin toolset or produce a bounded
  diagnostic. Falling back to Owner plugin MCP is a failing H1 case.
- The installer must support explicit `direct` and `proxy` network modes.
  Direct mode proves model egress through the host/router without requiring
  process proxy env. Proxy mode requires a reachable configured proxy and
  retains fail-closed CRON behavior before official `cron.scheduler.run_job()`.
- launchd services must use explicit absolute command paths, working
  directories, environment variables, and log paths. They must not depend on
  `.zshrc`, `.bashrc`, or an interactive shell.
- Worker LaunchDaemons for enabled manifest rows must stay loaded, but
  non-baseline on-demand workers must not use `RunAtLoad=true` or
  `KeepAlive=true`; otherwise idle retirement cannot stop them. Only the
  required warm baseline may be always-on.
- First-start preflight must prove listener health, model egress, Owner key
  storage, workspace users/directories, Gateway worker selection, plugin MCP
  schema for provisioned plugins, CRON wrapper use, and restart recovery.
- Windows/WSL-to-Mac data migration must prove persisted directory and artifact
  metadata no longer carries legacy drive prefixes. Run
  `scripts/macos-directory-path-migration-repair.js` in dry-run mode after
  repair and require `changed=false`, zero value replacements, and zero JSON
  parse errors before treating directory-topic chip or artifact-card `404`
  failures as ACL bugs. If Mac rootless drive metadata exists, run the same
  repair with `--repair-rootless-drive`, then run
  `scripts/macos-bound-directory-preview-smoke.js --all-workspaces` and require
  `ok=true` for non-chat topic/plugin directory bindings in every workspace that
  has current bound-directory metadata. Owner-only smoke is insufficient because
  Weixin workspace bindings can drift independently. Unknown/decommissioned
  workspaces may be reported as `skipped: unknown-workspace`; active workspaces
  must not be skipped. Use its `--include-chat` mode only for separate
  historical stale-reference cleanup. Production write repairs must stop the
  listener before the SQLite transaction, use `--reset-state-snapshot`, and
  restart it before the final dry-run/smoke, because stale in-memory runtime
  state or a newer `state.json` snapshot can otherwise rewrite repaired
  metadata.
- A clean install may start with no plugin data. Owner must be able to enable
  plugins on demand through the standard provisioning contract instead of
  relying on pre-bound development data.

Reference docs:

- `docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md`
- `docs/MODULES/deployment.md`
- `docs/MODULES/gateway-pool.md`
- `docs/MODULES/plugins.md`

### Cross-Workspace Plugin Platform Contract

Applies to plugin workspace onboarding, plugin-local platform pointer files,
shared Mac SSH/sudo access, plugin deployment scripts, MCP upgrade closure,
mobile visual/Appium harness adoption, and Reference Contract adoption across
Finance, Wardrobe, Note, People, Email, Directory, Growth-adjacent plugin
surfaces, and future plugins.

This flow is H1 because it crosses workspace boundaries, production access,
privilege escalation, service deployment, Gateway/MCP schema, plugin data,
mobile visual validation, and cross-plugin memory references.

Required harness dimensions:

- Every plugin workspace must either have `docs/HOME_AI_PLATFORM_CONTRACT.md`
  or an equivalent local pointer naming the current platform contract version.
- Plugin-local facts must declare plugin id, local workspace path, production
  source/data paths, service URL/port, launchd or process identity, MCP command
  and schema endpoint when applicable, deployment command, local tests,
  production smokes, Reference Contract status, and mobile visual harness
  status.
- Shared Mac production access must use the central access contract. Plugin
  scripts may accept `--ssh-alias` and `--password-file`, but must not print or
  persist raw passwords, key contents, access keys, cookies, tokens, or private
  payloads.
- Privileged Mac commands must use explicit absolute paths and bounded
  operation-specific sudo. Do not rely on interactive shell startup files or
  `sudo node`.
- MCP plugins must run service schema and Gateway selected-profile callable
  schema closure when a tool changes.
- Embedded UI plugins must declare and run the appropriate visual evidence path:
  Playwright, Mac iOS Simulator Appium, installed PWA, or real device depending
  on the risk.
- Embedded UI plugins must follow the shared mobile UI contract so bottom
  ownership, iframe sizing, safe-area behavior, long-press menus, blank-surface
  handling, and visual evidence do not diverge per workspace.
- Structured fact plugins must declare Reference Contract status and avoid
  ad-hoc object reference formats that conflict with the platform Reference /
  Memory Graph contract.
- Production closure must report bounded commit/status/URL/schema/readback
  evidence and backup paths where relevant.
- The eventual platform checker must fail missing pointers, missing local
  facts, missing deployment validation, missing MCP closure, missing visual
  harness status, missing Reference Contract status, or raw-looking secrets in
  docs.

Primary docs:

- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- `docs/IMPLEMENTATION_NOTES/plugin-workspace-contract-rollout-plan.md`
- `docs/RUNBOOKS/macos-production-access.md`
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`

### Growth Learning Card Workflow

Applies to teaching cards, practice cards, weekly/stage assessment cards,
challenge-triggered assessment cards, reflection, reward settlement, mastery
profile updates, and Growth board status projection.

Required harness dimensions:

- Formal model-generated card authoring requires a validated `learningGraphPlan`
  or an explicitly validated temporary graph node before publication.
- Graph prerequisites must exist, must be acyclic, and must not cross domains
  without an explicit bridge node.
- Stage assessments must declare graph-node coverage instead of relying on
  title text or free-form instructions.
- Learner experience feedback such as `too_hard`, `not_learned`, or
  `confusing` may update graph planning evidence but must not directly become a
  high-confidence mastery failure.
- Imported external seed nodes must be converted to native Hermes graph records;
  runtime card workflow must not depend on external repository paths.
- Public curriculum foundation imports must be manifest-driven. The harness
  must reject source packs that lack URL/status/hash provenance, attempt to use
  paid or restricted material as ordinary public seed data, or import IGCSE /
  A Level nodes as direct current targets for a Primary learner without an
  explicit bridge plan.
- Card generation uses model-main behavior when production rules require it.
- Published card transitions only through allowed events.
- Submission creates durable evaluation work.
- Model success, invalid JSON, timeout, interruption, low score, and retry are
  deterministic in tests.
- Evaluation record written but card status not advanced is repaired by a
  reconciler.
- Reflection audio transcription success/failure advances to a visible state,
  never to an indefinite waiting state.
- Completion and reward settlement are idempotent.
- Duplicate submission, duplicate reflection, and listener/Gateway restart do
  not duplicate jobs, rewards, or completion records.
- UI projection matches the workflow state and exposes a clear next action.
- Stored records and test fixtures remain summary-only; do not store full child
  answers, full transcripts, full questions, raw prompts, or raw model
  responses.

Primary docs:

- `docs/IMPLEMENTATION_NOTES/growth-learning-workflow-contract-harness.md`
- `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md`
- `docs/IMPLEMENTATION_NOTES/growth-teaching-card-implementation.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md`

### Reference / Memory Graph And Note Links

Applies to Reference / Memory Graph repositories, graph services, Note links,
plugin object references, cross-plugin backlinks, event grouping, provenance,
idempotent orchestration, permission trimming, and Gateway/MCP graph tool
exposure.

This flow is H1 because it connects multiple plugin fact stores and can leak
private data or create duplicate facts if retries, permissions, or profile
selection are wrong.

Required harness dimensions:

- Native graph schema and migrations must be validated with SQLite
  `quick_check`, expected table/index existence, and duplicate-prevention
  constraints for object refs and idempotent edges.
- Stable object refs must preserve `workspace_id + plugin_id + object_type +
  object_id` without copying full plugin facts into the graph.
- Note-to-Finance link and backlink must prove create, list, backlink, retry,
  and delete behavior with bounded display fields only.
- Multi-plugin event grouping must connect Note, Finance, Wardrobe, and People
  references through one `event_key` or event node without generating
  uncontrolled N-to-N links.
- Permission trimming must prove restricted principals cannot read full target
  details through display snapshots, provenance, metadata, or backlink lists.
- `reference_get` detail reads must route back to the owning plugin/service for
  final permission checks.
- Partial failure recovery must prove Note/object/event/edge creation remains
  idempotent when a graph write, plugin write, or Note write fails mid-flow.
- Relation types must remain from the approved small vocabulary unless the
  design doc is updated and the harness proves why a new type is needed.
- Graph and Note link writes must record bounded provenance and an
  `idempotency_key`; they must not store raw prompts, raw model responses,
  full private notes, full emails, full transaction details, tokens, cookies,
  push endpoints, or long logs.
- Gateway/MCP schema harness must prove the selected profile exposes the graph
  and Note link tools through the same profile and telemetry root used by real
  runs. Root/default Hermes homes are invalid evidence.
- Production closure must include one bounded create/read backlink smoke,
  duplicate retry proof, permission-trimmed restricted read, selected profile
  identity in bounded form, and backup/rollback notes for data migrations.

Primary docs:

- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`

### Tongbao Platform Currency And Growth Coin Exchange

Applies to platform-level `通宝` wallets, user balances, ledger entries, holds,
spend/refund/reversal flows, and Growth learning coin exchange into `通宝`.

Required harness dimensions:

- Wallet creation is idempotent per workspace user.
- Owner grants, adjustments, and reversals are idempotent and audited.
- Non-Owner reads and exchange requests are clamped to the authenticated
  workspace user; spoofed workspace ids are rejected.
- Growth coin exchange does not double debit learning coins or double credit
  `通宝` when requests retry or listener restarts.
- Exchange rule changes affect only new exchanges and do not mutate settled
  exchange records.
- Owner review, when enabled, settles only after approval and rejects/releases
  without leaking or duplicating funds.
- Ledger metadata remains summary-only and does not store Finance tokens,
  real bank/account rows, plugin keys, raw learner answers, transcripts,
  prompts, push endpoints, or long logs.
- UI projections show available, held, and total balances consistently across
  Growth and platform wallet surfaces.

Primary doc:

- `docs/IMPLEMENTATION_NOTES/tongbao-platform-currency-design.md`

### Gateway Toolset Routing And Stream Recovery

Applies to model-first toolset selection, execution-round toolset escalation,
Gateway event consumption, and terminal message recovery.

Required harness dimensions:

- Wardrobe-related runs must preserve authorized `wardrobe`, `vision`, and
  `file` when the signal comes from a bound directory, plugin/thread/project
  metadata, or recent same-topic message history.
- If that routing signal suggests the authorized `wardrobe`, `vision`, `file`,
  and `skills` stack, model-first selection must not reduce execution to
  `clarify` alone. The harness must cover wardrobe MCP visibility checks as
  well as actual wardrobe read/write tasks, because both need the real
  `mcp_wardrobe_*` callable schema.
- Execution-round Gateway conversation/session reuse must be schema-sensitive.
  If the effective enabled toolset set changes, the worker-side conversation key
  must change with it so a later Wardrobe turn cannot inherit an older
  file-only callable schema.
- Gateway Pool startup/profile changes must prove runtime script and manifest
  consistency. The harness must assert `start-low-gateways.sh` and
  owner-maintenance launch scripts use the selected worker's own
  `gateway-pool-manifest.json` `api_key`, not the first manifest key or a
  class-wide shared key. It must also assert source app scripts and
  `C:\ProgramData\HermesMobile\gateway-worker` runtime scripts are synced before
  a Gateway Pool restart.
- Owner-maintenance routing must fail closed. A maintenance/high-permission
  request that cannot find a matching owner-maintenance worker must return a
  bounded unavailable diagnostic and must not select the `default` fallback
  target. The fallback target is only valid for explicit legacy/diagnostic
  `securityLevel=unspecified` requests, and the harness must cover both cases.
- Gateway Pool restart latency is part of the startup/profile contract.
  `start-low-gateways.sh` must not run full profile reconfiguration on every
  restart when the selected profiles are already ready and the non-secret
  configure signature is current. The harness must assert the
  `config-current` skip path, the `-ForceConfigure` override, stop-only skip,
  and automatic cache invalidation when manifest/script/plugin/schema/Skill
  Store mapping inputs change.
- Kanban-backed Todo board provisioning is a cross-shell process-safety path.
  The harness must assert same-board provisioning is single-flight, board
  creation failures have a bounded retry cooldown, and Windows command timeouts
  terminate the full `powershell.exe` / `run-as-worker.ps1` / `wsl.exe` child
  tree instead of only the direct parent process.
- A run that records `Enabled toolsets: wardrobe` but whose execution schema
  lacks `mcp_wardrobe_*` functions is a Gateway schema/API-key/profile mismatch
  until proven otherwise. The required harness evidence is a live schema smoke
  using the same manifest key Mobile uses for the selected worker, with Wardrobe
  search/read/write/photo/history callables present.
- For MCP-capable profiles, "registered MCP tools" in worker logs is diagnostic
  evidence only. It cannot satisfy the harness by itself because OpenAI/Codex
  agent construction can still read a stale `model_tools` registry and expose no
  `mcp_<server>_*` callables. The harness must use a session schema when
  available or the `gateway-tool-schema-smoke.js --schema-only` /
  agent-schema-probe path, which constructs the same profile's `AIAgent` under
  the production runtime overlay. Runtime-log-only MCP evidence requires an
  explicit emergency override and must not be treated as normal pass evidence.
- Plugin MCP failures must be reproduced and cleared against the exact selected
  profile. If the failed run used `lowgw2`, testing `lowgw1` or an arbitrary
  warm Owner profile is insufficient. The normal proof is
  `node scripts\gateway-tool-schema-smoke.js --profile <selected-profile> --schema-only --require mcp_<plugin>_<tool>`.
  For Finance, a direct wrapper probe must also distinguish a Gateway profile
  mismatch from a plugin-service trust failure such as
  `finance_mcp_dispatch_loopback_only`; the Finance service process must retain
  both `FINANCE_MCP_PORT=8791` and trusted WSL Gateway source env, or the UI can
  remain healthy while `mcp_finance_*` callables disappear.
- Plugin MCP tool additions or renames require the reusable closure harness,
  not only the selected-profile schema smoke:
  `node scripts\mcp-tool-upgrade-closure-smoke.js`. The harness must prove the
  plugin service schema, Gateway `mcp_<server>_<tool>` callable, required
  callable properties, Mobile instruction-service hints, and
  `GATEWAY_TOOL_SCHEMA_EPOCH` are in sync. For Finance attachments this includes
  `finance.add_transaction_attachment:file_path`,
  `finance.add_transaction_attachment:upload_path`,
  `mcp_finance_add_transaction_attachment:file_path`, and
  `mcp_finance_add_transaction_attachment:upload_path`. The guard test is
  `node tests\mcp-tool-upgrade-closure-harness.test.js`.
- Selector/runtime-overlay changes require one more proof layer: the real
  `/v1/responses` request path must show that Mobile's top-level
  `enabled_toolsets` becomes the effective `AIAgent.enabled_toolsets`. If that
  request-level proof is missing in a hotfix window, model-first toolset
  selection must remain disabled and execution must use the deterministic
  authorized toolset set. This does not disable model-side permission preflight:
  `HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT` remains enabled by default,
  while `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION=0` disables only
  toolset narrowing.
- Runtime overlay path checks are part of the harness. The source/staging copy
  is `C:\ProgramData\HermesMobile\gateway-worker\runtime-overrides`, but the
  worker process imports from `/opt/hermes-gateway-runtime/runtime-overrides`.
  Startup tests must assert `start-low-gateways.sh` syncs staging to that WSL
  path before worker start, and production smoke must inspect the selected
  worker's `PYTHONPATH` plus `--schema-only` output after restart.
- OpenAI/Codex shared-auth repair is part of the same Gateway runtime-overlay
  contract. The harness must assert the overlay patches official
  `utils.atomic_replace()` and `hermes_cli.auth`'s imported `atomic_replace`
  reference for `EXDEV` on symlinked `auth.json` writes, and the live repair
  path must validate `auth list` through
  `/opt/hermes-gateway-runtime/bin/hermes` without printing raw tokens or
  refresh tokens.
- Provider selection is user intent. If the user has selected OpenAI/ChatGPT or
  DeepSeek, a missing MCP schema must be repaired inside that selected provider
  profile or reported as a provider-profile schema failure. Do not auto-route a
  selected OpenAI run to DeepSeek, or a selected DeepSeek run to OpenAI, merely
  because another provider currently exposes the desired MCP functions.
- A final assistant message that arrives only through
  `response.output_item.done` or `response.output_text.done` must still count
  as visible model output.
- A later `run.stream_closed_without_terminal` recovery must finish from that
  captured output instead of cancelling the run.
- Raw internal escalation markers such as
  `HERMES_TOOLSET_ESCALATION_REQUIRED` must never remain visible in stored
  assistant content or client-delivered final text.
- When such a marker is the only final payload, Hermes Mobile must record the
  requested toolsets and either auto-retry with the expanded authorized set or
  finish with the sanitized escalation state.

Primary docs:

- `docs/MODULES/gateway-pool.md`
- `docs/MODULES/wardrobe.md`

### Action Inbox And Passive Notification Workflow

Applies to Inbox item creation, source filtering, multi-recipient delivery,
Web Push coupling, and completion/audit actions.

Required harness dimensions:

- Automation conclusions enter Inbox.
- Todo items enter Inbox.
- Manual Todo Inbox items are already on their source surface. Legacy
  `/?view=todos...` or `todoId` deep links must not render an `Open source`
  action or route the app into the retired Todo/Kanban compatibility surface.
- Inbox detail pages must follow the same status/action badge contract as the
  root Inbox list. A secondary detail page must not reintroduce the older large
  status pill or a separate process button; tapping the compact status badge
  opens the same complete/snooze/delete action sheet.
- Approval/review/permission requests enter Inbox.
- Executor card completion notifications enter the authorized passive
  recipients' Inbox.
- Active user-initiated chat/topic task receipts do not enter Inbox unless they
  become passive follow-up work.
- Plugin-backed Codex task-completion notifications may enter Inbox as durable
  follow-up records. The Inbox detail projection must render the bounded
  `sourceRef.detailMessage` final receipt when provided, while Web Push uses
  only the compact title/summary and must not carry the long receipt body.
- Automation delivery Inbox rows that include a safe deliverable reference must
  expose a direct same-window file preview path from the list, without
  requiring an intermediate Inbox detail click.
- Scheduled Todo/reminder automations must project each trigger as a Todo-like
  Inbox occurrence, not as an ordinary delivery receipt; completing the
  occurrence must not delete the recurrence job.
- Scheduled Todo/reminder Automation occurrences that include a safe deliverable
  reference must still expose the direct same-window file preview path.
- Scheduled Todo/reminder Automation push marks must be idempotent per
  `lastRunAt`. A same-run scan after a delivered file must not downgrade the
  mark to `no-deliverable`, create a duplicate Inbox item, or send another push
  with an alternating tag.
- Inbox rows must combine status display and processing entry in one compact
  status badge after source/type. Tapping a non-terminal status such as
  `待处理` opens a viewport-level action sheet or equivalent overlay with
  complete, snooze, and delete/dismiss actions. Do not add a separate right-side
  `处理` button or an absolutely positioned in-card menu, because those duplicate
  the badge and clip or compress mobile row content. The visible badge must show
  the real status label, not a generic `处理` command, and must stay visually at
  metadata weight: no large filled pill, no heavy border, no high-contrast
  action color, and no typography larger than source/type metadata. Adjacent
  row badges/actions such as `来源`, `类型`, and the status action must share the
  same height, padding, font family, font size, font weight, line-height, and
  letter spacing; only semantic color and a subtle status chevron may differ.
  The harness must cover the app font-size setting because the global
  `:root[data-font-size] button` rule can otherwise enlarge the button-based
  status badge while leaving adjacent span badges unchanged.
- Automation delivery and scheduled-Todo row title/main areas must open the
  Automation source detail with Inbox return context, while only the explicit
  deliverable file tag opens the preview. The file tag must reuse the existing
  Automation deliverable visual pattern and must not hardcode Markdown-only
  wording.
- Scheduled Todo/reminder Automation titles should use the concrete
  Automation/reminder name; source/type badges, not generic titles, carry the
  source classification.
- Inbox swipe-complete gestures must be threshold-gated: partial swipes may
  reveal the action but must not call the complete transition; full swipes call
  it once.
- Todo/reminder items must remain visible above ordinary Automation delivery
  receipts in the default Inbox sort order.
- Web Push success with Inbox write failure and Inbox success with Web Push
  failure are both visible/retryable according to the source contract.
- Each recipient workspace gets its own Inbox item and push route.
- Authorization follows workspace access policy; Owner can receive all relevant
  workspace passive items, non-Owner only receives authorized workspaces.
- Inbox item payloads are summary-only.

Primary docs:

- `docs/IMPLEMENTATION_NOTES/action-inbox.md`
- `docs/MODULES/action-inbox.md`
- `docs/MODULES/web-push.md`

### Embedded Plugin PWA Session Workflow

Applies to all same-window embedded app plugins such as Wardrobe, watches,
health, finance, or other future product plugins.

Required harness dimensions:

- Manifest API smoke alone is insufficient. Validation must include installed
  PWA behavior on the target browser class before declaring the workflow done.
- Android Chrome PWA smoke must prove that the bottom-tab iframe renders real
  plugin content or a bounded diagnostic.
- Android/iOS PWA smoke must launch Hermes Mobile from the installed home-screen
  PWA icon. Opening `https://.../hermes-mobile/?source=pwa` in the browser URL
  bar is not valid evidence because Hermes Mobile intentionally shows a
  browser-shell guard page there and does not exercise standalone PWA storage,
  service-worker, navigation, or embedded-plugin behavior.
- iOS Safari installed-PWA smoke is required for cross-origin embedded plugins
  that rely on cookies or browser session storage. iOS failures where a valid
  login flashes back to the login page without decrementing retry count must be
  classified as session persistence failure, not credential failure.
- Server-side launch-token exchange must never expose the long-lived workspace
  key to frontend JavaScript, iframe URLs, docs, handoffs, screenshots, or logs.
- Workspace-private plugin MCP is part of the same H1 boundary, not an optional
  UI enhancement. Every MCP-capable plugin must have a harness proving the
  Wardrobe-style isolation pattern: per-workspace `.hermes-<plugin>/config.json`
  and `access-key.txt` or plugin-owned equivalent, a Gateway profile
  `mcp_servers.<plugin>` block bound to that exact workspace root, an explicit
  no-workspace-override guard, and callable schema evidence for that selected
  profile. Owner switching into a non-Owner workspace must use the target
  workspace's MCP binding or omit the plugin MCP/toolset; falling back to
  Owner's MCP is a failing H1 case.
- Plugin MCP wrappers must attach workspace plugin keys internally. The model
  must not pass raw plugin keys, provider OAuth tokens, mailbox credentials,
  ledger access tokens, health records, or private inventory state as tool
  arguments. Skills installed for plugin operation must be keyless usage
  bundles.
- Plugin-bound application topics are part of the same H1 boundary when they
  affect visibility, app launch, MCP/toolset routing, delivery-directory
  creation, or context assembly. A plugin topic must use the same
  effective-workspace projection as the app drawer, manifest route, and plugin
  launch route. Its open-app action must enter the existing embedded plugin
  host, and its open-topic action must enter a stable topic/task group with the
  selected workspace's plugin MCP only when callable schema evidence exists.
  Missing schema or provisioning must produce a bounded diagnostic and omit the
  plugin toolset; falling back to Owner's plugin app, delivery directory, or MCP
  is a failing H1 case.
- Plugin-context navigation across app/topic/directory is part of the same H1
  boundary. While `pluginContextNavPluginId` is set, right-swipe/browser-back
  from the plugin app, fixed plugin topic, or plugin directory must resolve to
  one dedicated plugin-context exit transition that returns to the ordinary
  topic root. The exit must clear plugin-context state, hide plugin hosts,
  restore normal bottom navigation, and render the remembered topic-list thread
  directly. It must not call `openTaskList()`,
  `restoreTaskListThreadFromCache()`, or `loadSingleWindow()`, because those
  generic routes can reload shared topic threads and expose the empty ordinary
  chat page.
- Plugin-topic delivery directories are supporting evidence, not plugin
  databases. Harnesses must assert the directory is created/resolved under the
  target workspace, exposes only a route/label projection to the frontend, and
  contributes cleaned selected summaries/reports to context rather than raw
  plugin exports, keys, tokens, cookies, full mailbox bodies, raw ledger rows,
  private inventories, health records, full learner content, or long logs.
- Same-origin plugin proxy routes must remain inside the Hermes workspace access
  boundary. The route must require Hermes workspace access, clamp any requested
  `workspaceId` or `x-hermes-plugin-workspace-id` hint through
  `requireWorkspaceAccess`, verify the plugin is visible to that effective
  workspace, and avoid upstream fetches for anonymous or unauthorized requests.
- Same-origin plugin proxy URL rewriting must preserve the effective workspace
  in browser-facing HTML, JavaScript, CSS, and JSON resource/API URLs. If an
  iframe fetch arrives without a direct workspace hint or referrer, and the
  request carries multiple workspace-scoped session cookies for the same plugin,
  the proxy must fail closed instead of routing to Owner by default.
- Public reverse-proxy exposure is part of the permission/workspace boundary.
  Harnesses must assert that browser-facing JSON and route-owned responses carry
  `Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`; public
  production launchers disable `?key=` authentication while keeping header auth
  working; anonymous same-origin plugin proxy requests stop before upstream
  fetch; Codex Mobile bridge defaults to a non-`full` permission mode unless
  explicitly elevated; and Windows firewall rules do not leave generic Node.js
  Public inbound access open when Hermes is reverse-proxied to the internet.
- Short launch URLs must be treated as one-time/short-lived. Rerendering a
  plugin tab must not rebuild an iframe from a consumed launch URL; the
  frontend must either preserve the existing iframe node or fetch a fresh
  manifest/launch URL before creating a new frame.
- Embedded plugin navigation must be a parent/iframe contract, not direct DOM
  coupling. The plugin reports a plugin-owned navigation event such as
  `wardrobe.plugin.navigation`, `codex-mobile.plugin.navigation`, or
  `finance.plugin.navigation` with `canGoBack`; Hermes validates the plugin
  origin, exposes the normal back affordance only when `canGoBack=true`, and
  sends `hermes.plugin.back` to the existing iframe.
- If a plugin emits `<plugin-id>.plugin.back_result`, Hermes must process it as
  part of the same origin-validated navigation contract. `handled=false` means
  the plugin did not consume the back action; the host must clear plugin
  `canGoBack` so the next back action belongs to Hermes outer navigation rather
  than leaving a stale plugin-level main-back affordance visible.
- Entering a plugin tab from a Hermes page must snapshot the source Hermes
  route. When the plugin is at root, or after `back_result handled=false`, the
  next host-level back/right-swipe action must restore that saved route. A user
  must not be trapped in a plugin iframe or forced to use browser controls to
  return to the previous Hermes page.
- If the host sends `hermes.plugin.back` and receives no plugin navigation or
  back-result acknowledgement inside a bounded fallback window, it must treat
  the plugin back as unconsumed and restore the saved Hermes route when one
  exists.
- Mobile PWA right-swipe must be parent-owned. Because iframe touch events do
  not reliably bubble to the Hermes host, the left-edge `edgeSwipeZone` must
  start a real edge back-swipe state for plugin pages and route it through the
  same plugin back/outer-return contract. A transparent edge layer that only
  calls `preventDefault()` is a failing harness case.
- Switching away from an embedded plugin tab must preserve the already-loaded
  iframe node when possible. Harness coverage must assert that the host uses a
  persistent iframe container and CSS visibility, not DOM reparenting, because
  moving a launch iframe can trigger iOS WebKit to reload the original one-time
  URL on every bottom-tab click.
- Switching away from an embedded plugin tab must also force-hide the plugin
  host even when the iframe shell record is missing, stale, or still loading.
  A stale `embedded-plugin-host-active` class must never keep the plugin iframe
  above the native chat/topic surfaces after a bottom-tab switch.
- One-time launch iframe health must be tied to the plugin navigation event. If
  a launch iframe loads but never emits the expected navigation state, the host
  must fetch a fresh manifest/launch URL and must not leave the stale
  `invalid_launch_token` response as the visible plugin page.
- Plugin refresh coupling is part of the same H2 host contract. A plugin may
  emit `<plugin-id>.plugin.refresh_required` when its short-lived launch token,
  session cookie, auth state, or server build becomes invalid. Hermes must
  accept that message only from the plugin entry origin, discard the stale
  iframe and stale launch manifest, fetch a fresh manifest/launch URL through
  the Mobile-owned plugin route, preserve only bounded route hints, and return
  to the same plugin tab when already active. The negative harness must prove
  wrong-origin refresh messages are ignored and refresh payloads do not carry
  access keys, launch tokens, cookies, raw plugin content, prompts, or local
  paths. The current host executable harness is
  `tests/embedded-plugin-refresh-harness.test.js`.
- Plugin startup must be visually clean. Manifest loading and fresh-launch
  exchange states should use the blank persistent plugin host, not an
  intermediate Hermes-owned loading card, left-aligned text, or preflight page.
  Explanatory UI is allowed only for real plugin diagnostics.
- Plugin iframe creation must not flash a white browser default surface in dark
  mode. New iframes should be hidden behind a theme-colored host shell until the
  iframe load event, and the installed-PWA visual smoke must include dark-mode
  tab entry for at least one embedded plugin.
- Plugin refresh must be one visually stable swap. If a mounted iframe exists,
  the host should keep it visible while fetching a fresh manifest/launch URL and
  suppress non-forced `refresh_required` requests during the frame boot warmup.
  Repeated boot-time refresh messages must not produce multiple blank/loading
  surfaces or vertical layout jumps.
- Entering an embedded plugin disables the chat composer and must clear stale
  keyboard viewport metrics. Returning from plugin/native secondary pages must
  not leave the chat composer shifted downward by an old mobile keyboard inset.
- PWA resume and plugin entry in dark mode must verify the pre-JS app shell,
  manifest `background_color`/`theme_color`, `html`/`body` background, plugin
  host background, and iframe loading shell. A dark-mode installed PWA must not
  flash a browser-default white surface when returning from another app or when
  entering Codex/Wardrobe plugin tabs.
- Primary navigation out of a plugin must cover `plugin -> topic -> chat` and
  `plugin -> chat`. These paths must clear `keyboard-viewport-active`,
  `keyboard-context-mode`, stale `--keyboard-*` CSS variables, and stale
  bottom-nav reservation before laying out the chat composer.
- When an embedded plugin host is active, the Hermes page header must be hidden
  so the plugin is not double-framed by two top bars. The Hermes bottom
  navigation must also be hidden for both plugin root pages and plugin secondary
  pages. Exiting a full-screen plugin belongs to the host back/right-swipe
  contract, not a visible bottom-tab escape path inside the plugin surface.
- Static/client version must be bumped for embedded-plugin host changes so the
  installed PWA does not keep an older iframe contract through the service
  worker.

Primary docs:

- `docs/MODULES/plugins.md`
- `docs/MODULES/wardrobe.md`

### Automation/Cron Execution Workflow

Applies to scheduled jobs, manual runs, bridge-host proxy behavior, status
projection, deletion, and automation Web Push.

Required harness dimensions:

- Cron-triggered and manually-triggered runs follow the same terminal status
  contract.
- Official CRON model jobs enter through the Hermes Mobile dispatcher wrapper
  with an outbound model proxy. Missing or unreachable proxy is a bounded
  `cron_model_proxy_*` failure before official `cron.scheduler.run_job()` starts;
  it must not become a long direct-provider timeout. `no_agent` script jobs are
  exempt because they do not create an `AIAgent`.
- Tool failure markers, including `x_search` failures, cannot be projected as
  successful runs.
- Bridge-host/Gateway worker failure is visible and recoverable.
- Detail deletion removes the job from refreshed lists and does not merge stale
  cache entries back into the UI.
- Automation Web Push events refresh the affected list/detail state.
- Duplicate triggers and concurrent triggers do not corrupt terminal status.

Primary docs:

- `docs/MODULES/automation.md`
- `docs/MODULES/grok-gateway.md`
- `docs/RUNBOOKS/grok-gateway-auth.md`

### Gateway Toolset Selection And Run Telemetry

Applies to Gateway run creation, toolset routing, callable schema exposure,
run-event streaming, liveness, and user-visible status timing for model-driven
tasks.

Required harness dimensions:

- When model-first toolset selection is enabled, the system must not hard-prune
  callable toolsets before the model has had a first-round chance to choose the
  task's needed capability set. The default production posture is selector-off
  unless the request-level schema harness above passes.
- Permission preflight and toolset narrowing must remain separate controls.
  Turning off model-first toolset selection must leave the model-side permission
  decision active. A permission-only preflight may return allowed or
  `HERMES_PERMISSION_APPROVAL_REQUIRED`, but must not choose, omit, or optimize
  execution toolsets; execution uses the full authorized route/access toolset set.
- A first-round model toolset-selection step may receive a compact capability
  catalog and the authorized policy summary, but not the full expanded schema
  for every ordinary tool.
- The execution round may expand only the model-selected toolsets, but it must
  support an explicit escalation path when the model determines that an
  additional authorized toolset is needed.
- Security boundaries still apply before and after model selection: developer,
  shell, source, process, broad MCP, and cross-workspace toolsets remain blocked
  by policy/profile unless the request enters an explicit Owner maintenance
  path.
- Harness scenarios must cover model-selected narrow execution, model-requested
  toolset escalation, denied escalation for blocked toolsets, and fallback when
  the model cannot produce a valid toolset selection.
- Model-requested toolset escalation must not leak
  `HERMES_TOOLSET_ESCALATION_REQUIRED` as visible chat content. Harness coverage
  must assert the raw marker is stripped during both streamed deltas and
  completion handling, metadata records only requested authorized toolsets, and
  a `run.toolset_escalation_required` status event is persisted. This includes
  the schema-mismatch case where the model requests a toolset that is already
  selected; the raw marker must still be stripped, and no retry should start
  unless the request adds an omitted authorized toolset.
- If the requested escalation toolsets are part of the omitted authorized set,
  harness coverage must assert Mobile retries the same assistant message with
  the previous selected toolsets plus the requested authorized toolsets, skips a
  second selector pass for that retry, emits `run.toolset_escalation_retrying`,
  and does not enqueue/notify a terminal successful answer before the retry
  finishes. Retry progress must appear only in run-status events and must not be
  broadcast as assistant receipt text. Unauthorized, blocked, duplicate, or
  over-limit escalation requests must remain a controlled insufficient-toolset
  result. The default automatic retry cap is one internal retry; a second
  escalation marker from the retry is terminal instead of starting a selector or
  retry loop.
- Harness scenarios must cover the common lightweight web companion group:
  `web`, `search`, and `browser` should be suggested/retained/retried together
  when any authorized member is needed. The negative case is required: `browser`
  must not be granted when absent from the authorized policy catalog.
- Harness scenarios must also cover plain-chat or ping/test messages where the
  selector is tempted to choose every authorized toolset due uncertainty. That
  case must narrow to the lightweight suggested set and must not expose `skills`
  merely because the request is ambiguous.
- Harness scenarios must cover product-specific MCP toolsets that are ordinary
  current-workspace capabilities. In particular, wardrobe ingestion and wardrobe
  read/write/readback verification must keep `wardrobe` in the authorized
  catalog when the selected Gateway profile exposes Wardrobe MCP; otherwise the
  model cannot choose the correct MCP path and may over-use generic web/http/file
  tooling.
- Health profile/history import is a required run-assembly harness scenario.
  A single-window or directory-bound request to write Health Profile, historical
  medical records, or strength-training history into Health MCP must activate
  `health` before streaming and prove that `health` appears in the active schema
  set, Gateway `preferredToolsets`, stream `enabled_toolsets`,
  `access_policy_context`, plugin catalog status, assistant `runOptions`, and
  bounded `plugin_capability_activated` telemetry. The same harness must prove
  unrelated product plugins remain catalog-only unless independently activated.
- Wardrobe callable-schema harnesses must include
  `mcp_wardrobe_wardrobe_write_history` for actual-wear history writeback, in
  addition to item write, search, readback, and photo functions.
- Harness scenarios must also cover topic-bound wardrobe directories. If the
  current topic has a directory route whose project id, label, path, or root
  identifies it as a wardrobe/closet directory, every AI run in that topic must
  suggest authorized `wardrobe`, `vision`, and `file` to the model-side selector
  by default, even when the latest message is a short follow-up. The routing
  layer must still preserve policy boundaries and must not grant any of those
  toolsets when absent from the authorized toolset list.
- Wardrobe outfit-recommendation turns must also preserve authorized `weather`.
  Harness coverage should include a wardrobe-bound topic whose latest message is
  an outfit request and assert the suggested set contains `wardrobe`, `vision`,
  `file`, `skills`, and `weather`. When model-first toolset narrowing is
  disabled or falls back, the same harness must assert execution keeps the full
  authorized route/access toolset set rather than the suggested subset.
- Harness scenarios must also assert that model-first narrowing cannot split
  this wardrobe companion set. If the selector chooses any member of a suggested
  authorized `wardrobe`/`vision`/`file` set, execution must keep all authorized
  companions with it so image-backed wardrobe checks and Markdown/file receipts
  do not degrade into a preventable toolset-escalation result.
- The negative case is also required: a single-window chat or topic with no
  resolved directory binding must not crash while reading the directory route.
  It should continue through the normal lightweight chat suggestion path.
- Plain-chat probes in an existing conversation must prefer the lightweight
  suggested set over `clarify` alone, so bounded conversation context cannot
  force an immediate avoidable toolset-escalation response.
- Execution prompts must include a latest-message override for ping, greeting,
  acknowledgement, and plain test messages. That scenario must assert the
  model is told not to reuse a prior tool/search intent from conversation
  history unless the newest message explicitly requests it.
- Retry/rerun messages must be tested separately from plain probes. When recent
  task text or stored toolset-escalation metadata exists, routing should use
  that context to suggest the needed authorized toolsets for the retry, and it
  should prioritize same-`taskGroupId` context over unrelated global chat tail
  messages.
- Runtime selector code must keep failure non-blocking: invalid JSON, timeout,
  missing Gateway runner, or an empty/unauthorized selection must fall back to
  the original authorized toolsets rather than failing the user run.
- Selector latency is part of the contract. The first-round selector uses a
  ChatGPT low-cost model with a bounded timeout large enough for reliable
  completion, defaults to 30000ms, and attempts a best-effort stop when a
  selector run id is known after failure.
- Tens-of-seconds selector latency is acceptable when it reliably returns a
  decision. The timeout must be set for reliability rather than micro-latency,
  and timeout/error fallback must still allow the original authorized toolsets.
- Permission and optional toolset choice must enter the same model-side
  preflight when both are enabled. Do not add a local natural-language
  permission classifier before the model run. The model may return either
  selected authorized toolsets or a `HERMES_PERMISSION_APPROVAL_REQUIRED`-style
  Owner-elevation decision. When model-first toolset narrowing is disabled, the
  model may return only the permission decision and execution keeps the
  full authorized route/access toolset set. For Wardrobe-intent or
  wardrobe-bound-topic runs, the bounded Wardrobe/weather companion set is only
  a `suggested_toolsets` hint unless the selector is explicitly enabled and the
  request-level schema harness passes. Selector timeout, invalid JSON, empty
  selection, or unauthorized-only selection must also fall back to the full
  originally authorized toolset set, not to the suggested subset.
- The selector is an internal JSON-only preflight, not a user-facing task run.
  It must not browse, search, call tools, or load Skills. Harness coverage must
  assert the selector request disables tool calls and, for live probes, that the
  Gateway selector session contains no tool-role messages.
- Selector parsing must tolerate repeated or duplicated JSON candidates from
  streamed Responses events and choose a valid final candidate instead of
  failing the user run as `invalid_json`.
- Latency and cost claims must verify the actual Gateway session or worker log
  model. A request body's `model` field is configuration intent, not proof that
  the worker did not use its profile default.
- Run telemetry must record model-selection start/end, selected toolsets,
  expanded callable count, tool-call start/end, final-message start/end, and
  terminal status without storing raw prompts, raw model responses, secrets, or
  user private content.
- Stream-wait telemetry must make no-first-byte and liveness stalls visible:
  no Gateway stream event after the configured warning window must emit a
  user-visible status event, first stream event and first text output must be
  distinguishable, and synthetic Mobile status events must not refresh the real
  Gateway event timestamp used for stale/liveness decisions.
- A response stream that closes without a terminal event is not automatically a
  user-visible failure. If streamed text output already arrived, harness
  coverage must assert Mobile emits `run.stream_closed_without_terminal`,
  synthesizes `response.completed` from the accumulated content, and does not
  enqueue/send a failed Web Push. If no model output arrived, Mobile should
  release the queue without surfacing the old raw terminal-completion error
  string to the user.
- Run tool budgets must be enforced in the stream layer for bounded network
  tools. At minimum, `mobile_web_search`, `web_search`, and hosted
  `web_search_call` events must count toward the configured Web-search cap,
  emit `run.tool_budget_exceeded`, abort the stream, mark the message failed,
  and release the queue when exceeded. The default cap must allow ordinary
  user-requested news/search tasks to perform several query refinements while
  still stopping runaway loops well below historical multi-dozen-search
  failures. The run instruction harness must also verify that web/search runs
  tell the model the configured Web-search budget and require it to stop before
  opening a search beyond the cap, returning a partial evidence-labeled answer
  or asking for approval when more search is needed.
- Explicit search quality is part of the same H1 contract. When the newest
  user message or source selector explicitly asks for web/X search, the
  instruction and stream-budget harness must use the explicit-search budget,
  must tell the model that source quality, meaningful coverage, and verifiable
  evidence outrank small time/token savings, and must still rely on the stream
  cap to stop runaway loops. Harness coverage must distinguish explicit
  search from incidental web-enabled runs.
- UI/status projection must distinguish at least: waiting for model selection,
  waiting for tool result, generating final message, completed, failed, and
  stale/liveness-failed. Budget-exceeded failures must be visible in the run
  status window instead of appearing as a generic silent stop.
- Run status projection should keep the latest real tool/model event visible
  without reordering later function events above earlier startup rows. Rows
  should remain chronological and append downward, with a bounded visible row
  count if needed.
- Inline run-progress growth is part of the scroll contract. If the user is
  pinned/near bottom or inside the send/run follow window, replacing a longer
  status panel must preserve the previous bottom offset by compensating only for
  actual height growth. It must not repeatedly force `scrollTop=scrollHeight`,
  because that can make the phone viewport jump to the bottom and then rebound by
  roughly a row. If the user has intentionally scrolled away, the refresh must
  not force the viewport back to the bottom.
- Function-call projection must expose the concrete function name whenever the
  stream event contains it directly or through paired `callId` metadata. The
  UI should avoid generic `Function call` / `Function result` labels when a
  bounded preview object, parsed JSON field, tool field, or adjacent call/result
  event identifies the function.
- Run-progress event refresh must prefer newest-message own-id matching
  (`runId`, `originalRunId`, `responseRunId`, `taskId`) before thread active-id
  fallback, so response-run events cannot update an older terminal assistant
  message while the current phone panel remains stuck on startup rows.
- High-frequency preflight status events must not cause one full conversation
  render per event. `run.gateway_selected`, `run.toolset_selection_started`, and
  `run.toolset_selection_done` bursts should update an existing inline panel in
  place. If the assistant message is not visible yet, the frontend may schedule
  one short delayed fallback thread refresh and must coalesce later preflight
  events into that same fallback.
- Visible toolset-selection projection should compact successful or failed
  `run.toolset_selection_started` / terminal pairs for the same run into one
  combined preflight row. The harness should keep raw events available while
  asserting the UI does not flash two instant rows or trigger a whole-screen
  refresh for the pair.
- Thread active ids must be used only to target a fallback message and remember
  that run id for the target message; they must not be merged into every panel
  at render time, because concurrent or stale active runs can corrupt elapsed
  time and visible function rows.
- Terminal assistant receipts must keep run-progress detail available without
  occupying the main reply surface. The completed model status should collapse
  into a small footer tag comparable to Usage/Skill, and expanding it should
  show historical rows from the first retained event, in chronological order,
  without a misleading "still running" quiet row. On portrait mobile, the
  expanded history panel must stay inside the viewport and be scrollable. It
  should prefer the space above the tapped status chip instead of defaulting to a
  bottom-fixed sheet that covers the lower conversation or composer area.
- Skill footer tags must be evidence-based. Do not add a synthetic response or
  fallback Skill merely because an assistant response completed; render Skill
  only when a real loaded Skill or `skill_view` event is present.
- Permission preflight is one model-side step. When the model-first selector or
  permission-only preflight has returned an allowed decision, the main execution
  prompt must not ask the model to load the permission-boundary Skill again or
  call `skill_view` for it; the run-status row should describe the completed
  preflight, not show a separate Permission Skill step.
- Function-call projection must not render unnamed generic function rows. If a
  concrete function name cannot be recovered from the event, preview JSON,
  `callId` pair, or tool field, omit that function row instead of showing a
  generic `Function` label.

Primary docs and tests:

- `docs/MODULES/gateway-pool.md`
- `docs/GATEWAY_POOL_ARCHITECTURE.md`
- `docs/LOW_GATEWAY_TOOLSET_POLICY.zh-CN.md`
- `node tests\gateway-run-model-toolset-selection-service.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-event-service.test.js`
- `node tests\gateway-run-stream-service.test.js`
- `node tests\gateway-run-lifecycle-service.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\run-progress-ui-behavior.test.js`
- `node tests\run-liveness.test.js`

### Gateway Elastic Worker Scheduling

Applies to Gateway Pool startup mode, on-demand worker launch, worker reuse,
per-workspace worker caps, global worker caps, idle retirement, and
user-visible scheduler status.

Required harness dimensions:

- Hybrid startup must keep exactly one Owner-compatible warm worker and zero
  non-Owner warm workers before any non-Owner run starts.
- Owner runs may expand to four workers, then must queue with a bounded
  `workspace_capacity` status instead of starting a fifth worker.
- Owner-maintenance warm workers must not consume the Owner low-permission user
  worker cap. A warm `officialclean*` or `deepseekmaint*` profile cannot block
  normal Owner work from starting compatible `lowgw*` profiles while the user
  tier cap and global cap allow it.
- Owner-maintenance is also on-demand in hybrid mode by default. The harness
  must prove `officialclean*` / `deepseekmaint*` profiles start only for an
  explicit high-permission maintenance/elevation run, enforce their own cap,
  stop by selected profile after idle retirement, and are not restarted by the
  five-minute watchdog when `HERMES_MOBILE_GATEWAY_OWNER_MAINTENANCE_MIN_WARM=0`.
- A non-Owner workspace may expand to two workers, then must queue with the
  same bounded capacity semantics.
- A compatible warm worker must be reused instead of starting a new process;
  an already-running configured worker discovered by health check must also be
  marked healthy and reused rather than restarted.
- If the scheduler's in-memory state says an earlier candidate is `configured`
  but a later compatible candidate is already healthy, the later warm process
  must be reused before any cold start. The run-progress scheduler event must
  carry a bounded `decisionTrace` that explains the skipped candidate and the
  selected worker without exposing API keys, workspace keys, plugin launch
  tokens, prompts, model output, or long logs.
- Provider/profile selection is part of compatibility. A DeepSeek, Grok, or
  OpenAI/Codex request must select or start a compatible profile and must not
  silently reroute to another provider merely to reuse a warm worker.
- Effective enabled toolsets, schema epoch, MCP/plugin binding, permission
  tier, manifest profile, port, and API key identity must participate in the
  compatibility key.
- Wildcard profiles such as `grokgw1` must not be pinned to a synthetic
  `workspace=*` or default `owner` compatibility key by health/status
  reconciliation. When no active run is assigned, the next real request should
  rebind the worker from that request's routing hints, and reconciliation must
  wake queued `profile_affinity` waiters if a healthy idle wildcard worker is
  available.
- Global cap exhaustion must queue new work with a distinct `global_capacity`
  status.
- Profile-affinity waits, such as a conversation that must stay on the same
  worker, must be distinguishable from workspace/global capacity waits.
- Idle TTL retirement must stop only workers with no active run and no
  protected maintenance action. Active, starting, and maintenance-protected
  workers must survive the reaper.
- Required warm-baseline workers must remain `warm` after a run is released.
  Every other healthy on-demand worker, including one discovered by status
  reconciliation rather than by a tracked run release, must enter the configured
  idle TTL countdown.
- Launch failure must record a bounded diagnostic, release or preserve the
  queue according to terminal state, and never leave a user task indefinitely
  `running`.
- Public-to-real run id replacement must preserve scheduler ownership. When a
  Gateway `response.created` event replaces Mobile's public `web_*` id with a
  real `resp_*` id, the scheduler assignment must be replaced too so terminal
  completion/failure/cancel releases the worker slot and does not leave later
  compatible runs queued behind a false `activeRunCount`.
- Single-profile start/stop launchers must use hidden PowerShell windows and
  bounded diagnostics. Raw API keys, workspace keys, browser tokens, and plugin
  launch tokens must not appear in thrown error details or run-progress events.
- If the listener account cannot see the production WSL distro, on-demand
  launch must go through a configured Windows Scheduled Task relay that runs as
  the distro-owning account. Harnesses must prove only bounded action/profile
  metadata is written to request/result files and that failed relay results are
  redacted before entering run-progress diagnostics.
- On single-user maintained deployments where WSL/Codex state belongs to the
  operator account, running the listener in that same caller context is the
  preferred path. In that mode the scheduled-task relay should be disabled, and
  the regression gate must prove the listener-owned direct single-profile start
  path rather than a relay path.
- After a start script reports success, the scheduler must poll the selected
  worker's `/health` for a bounded propagation window before emitting
  `health_check_failed`. A single immediate miss after script success is a
  known race and must be covered by harness tests.
- This listener-account vs WSL-owner split is a known recurring production
  failure mode, not a one-off workaround. Any future Gateway elastic, profile
  provisioning, provider switch, or startup-script change must keep a regression
  harness for the exact path: Mobile listener writes a relay request, scheduled
  task runs under the WSL-owning Windows account, target profile becomes healthy,
  `/api/status?detail=1` remains non-degraded, and a real non-Owner run can use
  the newly started profile without manual intervention.
- The scheduled task ACL is part of that harness. The task principal must remain
  the WSL-owning account, but the listener Windows account needs permission to
  demand-run the task. A pending relay request plus `command_failed` from
  `schtasks.exe /Run` is a failed production gate even if an operator can run the
  same task manually.
- `/api/status?detail=1` must treat configured-but-stopped elastic workers as
  expected state in hybrid mode, while still reporting failed launch or failed
  health checks as degraded. A worker that was previously warm but now fails
  `/health` with no active run must be reconciled back to `configured` so the
  status UI does not report a stopped process as warm.
- Production hybrid startup scripts must not launch the full historical fixed
  pool. Eager startup must remain available as a rollback mode.
- Run-progress and model-status UI must show cold-start `starting` as a startup
  state, not as queue depth, while still showing reused, queued,
  idle-retirement, and failed scheduler states without exposing raw API keys,
  workspace keys, plugin launch tokens, prompts, model output, or long logs.
- Gateway start harnesses must assert the public `web_*` run id is assigned and
  broadcast before `chooseGatewayRunTarget()` emits scheduler events. UI
  harnesses must render queued/cold-start and permission preflight timeout rows
  in the inline run-progress panel before a worker has been selected.
- Composer optimistic-send harnesses must cover the negative path before any
  run exists: if `POST /api/threads/:id/messages` fails or times out, the local
  pending user/assistant placeholders are removed, draft text is restored, and a
  bounded thread refresh is scheduled. A client-only `queued` placeholder must
  not remain visible as `Home AI - queued` or as a bottom queued badge when the
  server has no corresponding active message.

Primary docs and tests:

- `docs/MODULES/gateway-pool.md`
- `docs/IMPLEMENTATION_NOTES/gateway-elastic-worker-scheduling.md`
- `node tests\gateway-elastic-worker-scheduler.test.js`
- `node tests\gateway-runtime-composition-service.test.js`
- `node tests\gateway-worker-profile-launch-service.test.js`
- `node tests\gateway-pool-provider.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-lifecycle-service.test.js`
- `node tests\gateway-status-projection.test.js`
- `node tests\composer-send-pending-feedback.test.js`
- `node tests\system-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\static-cache-version-harness.test.js`
- `node tests\cross-shell-command-harness.test.js`

### Cross-Shell Production Operations

Applies to PowerShell-driven WSL operations, Gateway Pool startup and repair,
production hotfix scripts, backup scripts, connector provisioning, and runbook
commands that cross the Windows/WSL boundary.

Required harness dimensions:

- PowerShell must not pass inline or multi-line Bash through `bash -lc` or
  `bash -c`.
- Multi-line Bash must be written to a UTF-8 no-BOM script file, converted with
  `wslpath`, and executed as `bash <script-path>`.
- Secrets must be passed through existing secret files or environment variables,
  not interpolated into generated script text or logs.
- Generated operational scripts must have stable names, be logged by metadata
  only, and be removed when they are one-off temporary scripts.
- PowerShell parse checks and shell syntax checks must cover touched startup or
  production-operation scripts.
- The repository scan must reject new inline PowerShell-to-Bash quoting patterns.
- Gateway Pool startup/configure scripts must honor explicit
  `gateway-pool-manifest.json` `profile`/`port` pairs for `lowgw*` and
  `grokgw*`/`deepseekgw*`/`deepseekmaint*`. They must not derive `grokgw1`
  from the current maximum low-worker count, because creating a later personal
  workspace must not move the Grok worker or break Grok/X Search proxy routing.
- Provider-specific Gateway routing must fail closed. A `deepseek` normal run
  must use a healthy `deepseekgw*` worker, and an Owner high-permission DeepSeek
  run must use a healthy `deepseekmaint*` worker. The harness must reject
  fallback to `openai-codex`, `lowgw*`, or `officialclean*` when the selected
  provider tier is missing or unhealthy.
- Low-permission DeepSeek profiles must be workspace-dedicated. Owner may have
  multiple Owner-only low-permission DeepSeek profiles, currently
  `deepseekgw1`, `deepseekgw2`, and `deepseekgw99`, all sharing Owner memory,
  Owner full Skill store, and Owner-bound MCP registrations. Non-Owner
  workspaces must use their own dedicated `deepseekgwN` profile that mirrors
  their OpenAI/Codex `lowgwN` workspace/Skill binding. A missing non-Owner
  DeepSeek profile should fail closed instead of falling back to
  `deepseekgw99` or a broad `allowedWorkspaceIds=["*"]` shared profile.
- Owner status/UI harnesses must expose a provider-by-tier availability matrix
  from non-secret Gateway Pool metadata so the operator can see whether ChatGPT,
  DeepSeek, and Grok are available for normal and high-permission runs.
- Workspace provisioning must append new personal `lowgwN` workers after
  existing low/Grok workers and allocate a later free port without renumbering
  or moving existing `grokgw*` entries. Deleting a workspace must not silently
  delete profile-local Gateway state; cleanup requires an explicit
  backup/retirement path.
- Gateway Pool startup scripts must target the actually installed production
  WSL distro. Tests must prevent drift back to retired distro names such as
  `HermesGatewayWorker`; a listener/client deployment is not complete if the
  Gateway Pool restart script still points at a missing distro.
- Kanban/Todo compatibility commands are covered by the same process-safety
  rule. The Windows Kanban wrapper must resolve its WSL distro from explicit
  args or `HERMES_*` environment values, support maintained caller-context
  execution, and must not silently default back to `HermesGatewayWorker`.
- Hybrid single-profile start/stop scripts must remain fast enough for
  listener-triggered on-demand use. Listener on-demand `-NoStopExisting`
  selected-profile starts should skip full reconfiguration when the profile
  telemetry directory, config, shared auth link, and lock link are already ready;
  full hybrid startup must remain able to reconfigure normally. Stop-only
  operations should not run full configure or require profile config/auth
  validation before stopping the selected port.
- WSL Gateway Pool stop/start must not be run through a Windows account that
  cannot see the registered WSL distro. The Windows-side process may invoke
  `wsl.exe` as the account that owns the distro, while Linux-side privilege
  boundaries must still be enforced with `root` for setup and the `hermes`
  Linux user for low-Gateway runtime. In maintained hybrid deployments this can
  be a scheduled-task relay: the listener writes a bounded launch request and
  triggers the existing Gateway Pool scheduled task, which runs under the
  distro-owning Windows account. The regression gate must fail if an on-demand
  listener path falls back to direct listener-account `wsl.exe` execution on a
  deployment where only the scheduled task/operator account can see the distro.
- Ownership repair on Windows-mounted telemetry/profile backup trees must be
  best-effort. Permission-denied errors from historical backup artifacts such as
  `skill-store-backups` must not abort Gateway startup after the active runtime
  directories have been prepared.
- Direct provider additions, such as DeepSeek, require routing tests, dedicated
  provider-profile generation, and production evidence after Gateway Pool
  restart. A request body's `provider` field, secret file, settings option, or
  copied startup script is not enough evidence: validation must prove the
  selected `deepseekgw*`/provider worker has a non-empty provider key in its
  process environment and that the Gateway session or worker log reports the
  actual backend provider as the requested provider rather than a profile
  default such as `openai-codex`. If a provider is installation-wide, docs must
  state that all workspaces that can start that Gateway class can use it unless
  an explicit workspace/provider allowlist is implemented. Provider-specific
  shared profiles must not collapse user-bound MCP registrations together; for
  example, Owner, WuPing, and each additional non-Owner DeepSeek user need
  distinct profile bindings when Wardrobe MCP or personal Skill/memory is
  present.
- Gateway MCP/profile registrations, such as Wardrobe MCP, require generator
  coverage as well as live-profile coverage. A one-off edit to
  `telemetry/profiles/<profile>/config.yaml` is not durable evidence, because a
  later `configure-low-gateways.sh` run can regenerate those files and drop the
  registration if the source script no longer contains the same MCP block.

Primary docs and tests:

- `docs/MODULES/gateway-pool.md`
- `docs/RUNBOOKS/codex-responses-stream-output-none.md`
- `node tests\gateway-workspace-provisioning-service.test.js`
- `node tests\cross-shell-command-harness.test.js`
- `node tests\startup-scripts.test.js`

### Web Push Click And Route Workflow

Applies to notification payload construction, service worker click handling,
deep links, top-level client selection, and route fallback.

Required harness dimensions:

- Active task terminal receipts are idempotent per assistant receipt/tag:
  duplicate `response.completed` / `run.completed` events for the same message,
  or duplicate notifier calls after a successful send, must not create a second
  Web Push or second external terminal delivery.
- Notification click opens or focuses a top-level app window, not an embedded
  viewer frame.
- Inbox, task, chat/topic, Growth, and Automation routes resolve to the expected
  in-app view.
- Chat/topic completion and failure notifications must carry the terminal
  assistant receipt `messageId`. Topic routes should scroll to that receipt
  inside the task group; single-window chat/group routes must preserve
  `threadId`/`messageId` and must not be rewritten into generic `view=tasks`
  because `taskGroupId=chat` is present.
- Original task/detail route is preserved as a deep link when the primary route
  is Inbox.
- Existing app window, no app window, PWA, and browser-tab cases are covered.
- Web Push may reuse the shared internal same-window route helper, but it does
  not own all second-level navigation. Direct UI paths such as Inbox row to
  Automation detail are covered by the H2 Secondary Page Navigation contract.
- Mobile browser shells must not render the full authenticated Hermes Mobile
  app. They should show only a blocker that tells the user to close the browser
  shell and reopen the installed PWA.
- The browser-shell blocker must have a preflight in `index.html` before app
  bundles load, not only an app-bootstrap guard. This covers stale or long-lived
  browser-shell sessions that have not yet run the latest app router.
- Hermes-owned notification and second-level routes must preserve the current
  app shell path instead of hardcoding root `/?...`. A deployment mounted under
  a prefix such as `/hermes-mobile/` must route to that same prefix, while root
  deployments keep `/`.
- The harness must exercise both root-mounted and prefix-mounted app shell
  routes. A localhost/root smoke is not enough to close an externally reported
  browser-frame failure.
- If the symptom is visible only through a reverse proxy, Synology domain,
  installed PWA, or mobile browser container, production verification must use
  the exact external entry path reported by the user and must verify the served
  client version plus changed route-helper JavaScript from that same path.
- iOS Web Push subscription requires PWA standalone evidence. The harness must
  cover frontend `clientContext.displayMode` / `standalone`, subscribe-route
  forwarding, and delivery-side filtering of legacy iOS browser subscriptions.
- Web Push subscriptions are deployment-origin scoped. The harness must cover
  frontend `clientContext.origin`, subscribe-route server-origin forwarding,
  delivery to matching-origin subscriptions, and skipped delivery for copied
  legacy subscriptions with missing or mismatched origin when a production
  public origin is configured.
- iOS browser-shell clients must not continue Hermes-owned notification/source
  detail navigation. The harness must assert a PWA standalone guard before the
  shared internal route helper applies route params.
- The same guard must also apply before startup URL routing calls
  `applyRouteParams()`, because browser shells can load detail URLs directly.
- The same guard must also apply before selected-detail state is rendered by
  `loadSelectedView()`, because browser shells can already hold or restore
  `viewMode=automation` plus `selectedAutomationId` without a URL route parse.
- The harness must execute a mobile browser-shell case, not only inspect route
  parser text. It should verify that the browser shell enters blocked state and
  does not leave Inbox/Automation UI rendered behind the outer browser frame.
- The harness must assert the `index.html` preflight runs before app bundles and
  sets a global browser-shell blocked flag consumed by the app router.
- Old client/service-worker version behavior fails safely.

Primary docs:

- `docs/IMPLEMENTATION_NOTES/web-push-deeplink-routing.md`
- `docs/RUNBOOKS/web-push-wrong-page.md`
- `docs/MODULES/web-push.md`
- `node tests\same-window-navigation-harness.test.js`

### Permissions And Workspace Boundary Workflow

Applies to auth, workspace access policy, Skill write permissions, Growth
executor/Owner boundaries, Inbox recipients, file/artifact access, and group
chat visibility.

Required harness dimensions:

- Owner can access all authorized product management surfaces.
- Non-Owner access follows `accessible_workspace_ids`, `workspace_ids`,
  `workspaces`, and equivalent policy fields.
- System/shared Skills are writable only by Owner; creator-owned Skills are
  writable only by their creator principal/workspace.
- Skill detail, analysis, and repair routes are workspace-scoped and must not
  enumerate sibling `skill-profiles/*` roots or fall back to Owner/global Skill
  bridge for a non-Owner workspace request.
- Workspace provisioning creates a physical private Skill Store at
  `data/skill-profiles/<workspaceId>/skills`, and Gateway startup links each
  ordinary user profile to the store declared by manifest `skillWorkspaceIds`.
- Growth executor surfaces do not expose Owner-only configuration or private
  source records.
- Inbox multi-recipient fanout respects workspace authorization.
- Files, previews, task outputs, and group-chat artifacts require the matching
  route/resource policy.

Primary docs:

- `docs/MODULES/multi-user-task-platform.md`
- `docs/MODULES/workspace-auth-permissions.md`
- `docs/MODULES/skill-permissions.md`

### Public Export And Release Workflow

Applies to public export, package version, README release notes, public CI,
tags, and GitHub Releases.

Required harness dimensions:

- Export is generated by `npm.cmd run export:public`, not by manual copy.
- Export excludes `.agent-context`, `AGENTS.md`, runtime state, logs, uploads,
  backups, keys, OAuth state, push endpoints, private reports, and real worker
  manifests with secrets.
- Public-facing docs do not contain machine-local operator paths.
- `package.json`, `package-lock.json`, release tag, and GitHub Release version
  are aligned.
- Public README includes user-visible changes, config impact, operational
  notes, validation scope, and known limitations.
- Public CI passes on the target public commit before the release is considered
  complete.

Primary docs:

- `docs/PUBLIC_EXPORT_CHECKLIST.md`
- `docs/PUBLIC_INSTALLATION_CHECKLIST.md`

## H2 Contract/Projection Harness

### Secondary Page Navigation

Applies to second-level screens such as Inbox detail, Automation detail/list
opened from a menu, Growth card detail, settings subviews, access-key manager,
runtime config, file preview subviews, and permission sheets.

Required contract dimensions:

- Every second-level page has a top-left back control.
- Every second-level page supports right-swipe/back gesture where the frontend
  shell supports gestures.
- Second-level pages do not show a navigation menu as the primary top-left
  control.
- Page headers are not duplicated inside the page body.
- Functional commands that are not the page's immediate primary action live in
  the top-right overflow menu.
- Bottom navigation remains stable and includes required top-level tabs such as
  Topics and Inbox.
- Second-level pages and file preview subviews must follow the same-window
  navigation contract and reuse the same app window.
  Opening a browser window with `window.open`, `target=_blank`, or Markdown
  `linkTarget="_blank"` is not allowed for Hermes-owned navigation.
- Direct source navigation from Inbox to Automation detail is a second-level
  UI path, not a Web Push-only path. The row must be a button-driven internal
  route that reuses the current app runtime, carries Inbox return context, and
  does not call `window.open`, `target=_blank`, or a location-level page open.
- Manual Inbox Todo source handling is the inverse contract: if the item carries
  an old Todo/Kanban compatibility deep link, the same-window harness must prove
  the source action is suppressed and the internal route helper is not called.
- Direct source navigation must also preserve the current app shell path. The
  harness must cover a prefixed deployment path such as `/hermes-mobile/`
  without hardcoding any domain.
- The harness must assert direct second-level source navigation returns a
  prefixed route when `window.location.pathname` is prefixed, and a root route
  only when the current app shell is root-mounted.
- The route's return context must keep the source surface, for example Inbox
  return ids for Inbox-to-Automation navigation, so an in-app back action
  returns to the originating surface rather than a generic Automation list.
- Return actions from a secondary source surface must cancel stale async loads
  from the surface being left. For example, an Automation API response that
  finishes after returning to Inbox must not repaint an empty `Hermes CRON`
  root shell over the Inbox.
- Root topic lists must not show Kanban-generated task/case topics at all.
  Backing Kanban cards may still exist, but those records belong to
  Growth/Todo/Kanban or Inbox source links rather than the ordinary topic root.
  The harness must cover both first-party topic groups carrying
  `kanbanCaseId`/`kanbanCaseMode` and shared case-topic threads before any
  secondary page is opened.
- Topic restore placeholders must be tied to the requested topic/task group.
  A missing `currentTaskGroupId` may wait only when that same task group has
  queued/running messages or the current thread fetch is already in flight;
  unrelated active runs in the thread must not keep `Restoring topic...`
  visible indefinitely.
- Preview fallbacks follow the in-app overlay/iframe/download pattern used by
  Markdown, image, and document previews; `about:blank` print windows and
  `open(..., "_blank")` are not allowed workarounds.
- Growth card detail is an H2 projection surface even when no workflow state is
  changed. The harness must assert the detail page uses a single-column
  full-width reading shell, does not render nested table-like card/grids that
  compress the learning text, keeps primary text at mobile-readable size, and
  still exposes the existing task id/state data attributes for navigation and
  submission wiring.
- Growth learning-card sharing must be a same-window frontend action. The
  harness must assert a `data-learning-growth-card-share` control exists on
  teaching and formal card details, the implementation uses Web Share file
  payloads (`navigator.share({ files: [...] })`) with clipboard/download
  fallback, and the generated image excludes raw learner answers, transcripts,
  prompts, secrets, push endpoints, and hidden model output.

Primary docs:

- `docs/FRONTEND_STATE_MAP.md`
- `docs/MODULES/action-inbox.md`
- `docs/MODULES/automation.md`
- `docs/MODULES/growth-learning.md`
- `node tests\same-window-navigation-harness.test.js`

### Chat Send And Scroll Stability

Applies to composer send, run/status box insertion, SSE event updates, keyboard
viewport behavior, search mode transitions, and task-detail follow-up sends.

Required contract dimensions:

- Sending a message pins to the newest message/run-status area unless the user
  intentionally navigated away.
- Run/status box insertion does not restore stale scroll offsets.
- Run/status box growth from later model, Skill, or function events keeps the
  bottom rows visible while the conversation is following the run.
- SSE refreshes do not jump to old history after the run appears.
- Keyboard viewport changes do not hide the composer or force a stale scroll
  restore.
- Long assistant reply jump controls survive terminal DOM replacement: queued
  arrow-visibility recalculation must resolve the current live message or
  conversation node at execution time, and final markdown/layout replacement
  must schedule a short delayed settle pass. Eligibility must be based on whether
  the rendered reply can fit in one current conversation screen, using measured
  DOM height and viewport geometry. Character-count limits such as the active
  rich-render threshold are only no-layout fallbacks. If the reply footer is in
  view, the up/start arrow must remain inline beside the footer controls instead
  of floating away from the Usage/Skill/status row.
- Search mode can navigate results without permanently changing the send-time
  scroll intent.

Primary docs:

- `docs/FRONTEND_STATE_MAP.md`
- `docs/MODULES/chat-context.md`

### Static Client Cache And Navigation Shell

Applies to client-visible static changes, service worker behavior, bottom tabs,
top menus, and mobile viewport shell changes.

Required contract dimensions:

- Static/client version is bumped consistently when required.
- `public/index.html`, `public/service-worker.js`,
  `public/directory-viewer.html`, and test constants agree.
- Existing tabs do not disappear unintentionally.
- Top-right menu availability follows the active view contract.
- Stale clients are prompted to refresh through `/api/client-version`.
- The topic root is an entry/index surface. It must keep the composer hidden
  after initial load, Chat->Topics tab switching, cached task-list restore, and
  route restore paths that call generic composer enable helpers. A concrete
  topic detail remains the first surface where topic replies are enabled.
- Client-version mismatch auto-recovery routes through the current app shell
  with `resetClient=1` and `targetVersion=<server-version>`, preserves Access
  Key/theme/font preferences, clears static caches, unregisters Service Workers,
  and reopens the app with a cache-busting query. Automatic update recovery must
  not navigate to `/client-reset.html`, which is reserved for manual/hard reset
  fallback because mobile PWA clients can open it in a browser wrapper.
- Service Worker app-shell requests (`/`, `/index.html`, and
  `/hermes-mobile/`) are network-first with `cache: "no-store"`, so killing and
  reopening the PWA after a version bump cannot keep replaying an old cached
  shell.
- Mobile shell changes keep the OS status bar visible; time, battery, and
  Wi-Fi indicators must not disappear behind browser-shell guards,
  full-viewport overlays, or safe-area changes.
- Orientation changes must include a post-settle recovery pass that clears stale
  keyboard viewport CSS when the composer is not actually focused, clears
  temporary conversation scroll-layer reset state, recomputes bottom navigation
  reservation, and recalculates long-reply jump controls. A landscape-to-portrait
  transition must not leave a blank or hidden conversation surface.
- Theme changes must verify actual shell and module surfaces in light, dark,
  and system modes. Required surfaces include sidebar/top bar, composer,
  user/assistant messages, topic cards, Action Inbox rows and deliverable tags,
  Growth warning/danger cards, and settings/access-key sheets. The harness must
  combine focused CSS variable assertions with at least one screenshot or
  browser visual smoke so hard-coded pale panels cannot pass dark mode.
- Mobile side navigation is an H2 shell projection. On mobile/PWA widths the
  sidebar must render as a full-screen app surface with `100vw` width,
  `100dvh` height, safe-area padding, no visible app-content strip behind it,
  and no horizontal overflow. Dense status sections such as the Gateway provider
  matrix must wrap inside the panel; fixed three-column provider rows are not
  acceptable because they can overlap on real mobile widths.
- Conditional top-level tabs such as embedded plugin tabs are H2 shell
  projections. The harness must assert the tab is hidden by default, becomes
  visible from the same effective-workspace plugin list/authorization projection
  used by manifest and launch, preserves the static client-version contract, and
  renders a same-window embedded plugin or bounded diagnostic rather than
  `window.open`, `target=_blank`, direct Program API fallback, local MCP overview
  fallback, or copied plugin app code.
- Wardrobe tab content is plugin-only. Harness coverage must assert the frontend
  does not contain `loadWardrobeOverview`, `renderWardrobeDashboard`,
  `/api/wardrobe/overview`, native section-switch listeners, model launcher
  cards, local stats/search dashboards, or direct MCP stdio invocation for the
  root tab. If the plugin is unavailable, the only allowed UI is a compact
  plugin diagnostic and retry action.
- Wardrobe directory/toolset detection may guide model-side routing, but it must
  not bypass plugin list authorization for a non-Owner bottom tab and must not
  become a data source for the tab content. The actual page content must come
  from `GET /api/hermes-plugins/wardrobe/manifest`.
- A plugin tab landing surface is the embedded plugin app, not a model task
  launcher or copied deterministic dashboard.
- The Wardrobe root header must use the shared centered root-page title. The
  body must not repeat the title or expose the bound directory as a large
  hero/status pill. Root actions belong in the shared top-right three-dot menu;
  the disabled Stop button must not be visible there.
- Full plugin UI parity must not be implemented by copying external app screens,
  detail pages, settings, import/export, or business workflows into Hermes
  Mobile. The required direction is a generic `embedded-app` plugin host: the
  plugin project exports a manifest, owns the UI, and Hermes Mobile embeds it in
  the same window with a signed short-lived token and workspace context. Plugin
  host harnesses must cover manifest loading, tab registration, same-window
  iframe navigation, no `window.open` or `target=_blank`, no raw credentials in
  URLs, frame/CSP expectations, persistent iframe host behavior, clean loading
  surface, and a postMessage/back contract.
- Embedded-app harnesses must cover HTTPS/mobile security behavior. If Hermes is
  served as HTTPS/PWA and a plugin manifest returns an HTTP iframe entry, the
  frontend must not render a blank frame. External plugins must use a configured
  HTTPS manifest/entry or show a visible plugin diagnostic. Local-machine
  plugins such as Codex Mobile may keep an HTTP upstream only when Hermes Mobile
  rewrites the browser-facing entry to a same-origin proxy path and proxies
  HTML, static assets, and plugin API calls through that path. The Mobile
  manifest route must also probe the entry page's `frame-ancestors` policy for
  the current app origin when embedding directly. If the plugin service does not
  allow the Hermes origin and the plugin is not using the same-origin proxy, the
  UI must not render a Chrome broken-frame icon as if the plugin had loaded.
  Production validation must include opening the installed Android PWA from the
  home-screen icon and verifying the plugin tab content, because API manifest
  smoke or browser URL-bar navigation cannot catch standalone-PWA storage,
  service-worker, display-mode, or mixed-content frame behavior.
- Wardrobe plugin registration is H2 service/projection work. The Mobile route
  `GET /api/hermes-plugins/wardrobe/manifest` must normalize only bounded
  manifest metadata from the configured source, defaulting to the NAS manifest
  URL for this installation and allowing environment override for future local
  production sources. It must not expose `.hermes-wardrobe/access-key.txt`,
  raw access keys, or plugin credentials to the browser.
- Wardrobe plugin launch is H2 auth/session projection work. When the manifest
  declares `program_api.plugin_launch`, Hermes Mobile must read the current
  workspace's local `.hermes-wardrobe/access-key.txt` on the server and exchange
  it for a one-time `entry_path` through `POST /api/v1/hermes/plugin/launch`.
  Harnesses must assert the iframe URL uses the short launch entry, the browser
  payload contains no `Authorization`, `Bearer`, raw `launch_token` field, or
  long-lived workspace key, and a missing/failed launch shows a plugin
  diagnostic rather than the legacy username/password login or local MCP
  overview fallback.
- Codex Mobile plugin registration is H2 service/projection work and must use
  the local Codex Git repo's Hermes plugin manifest, not the PWA manifest.
  `GET /api/hermes-plugins/codex-mobile/manifest` must normalize bounded
  metadata from `GET /api/v1/hermes/plugin/manifest`, use the server-side
  `%USERPROFILE%\.codex-mobile-web\access_key` or configured override only for
  launch exchange, and must not expose Codex Mobile Access Keys, bearer headers,
  or launch-token secrets to the browser.
- Owner workspace switching is a permission/workspace-boundary harness case.
  Owner-authenticated requests for a non-Owner workspace must use the target
  workspace projection for ordinary plugin list/navigation/manifest behavior:
  `codex-mobile` remains hidden and denied for `workspaceId!=owner`, while
  workspace-private plugins remain visible only through grant/provisioning/key
  evidence for that target workspace. This must be covered in service, route,
  and frontend projection tests rather than as a CSS-only hide.
- Finance plugin registration is H2 service/projection work and must use the
  Finance embedded-app manifest at
  `GET http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`. Hermes Mobile must
  normalize Finance's compact manifest shape: string `entry`, top-level
  `launch`, top-level `toolsets`, `mcpServer`, `permissions`, and `embedding`
    event names. Harness coverage must assert Owner default visibility, non-Owner
    denial without explicit authorization, Owner-only fallback to the configured
  `HERMES_WEB_AUTH_KEY_PATH` when no Finance-specific key path exists, Finance
  launch body fields `workspace_id`, `workspace_key`, and `role`, optional
  `user_key` only when a separate workspace-user key is present, no
  `Authorization: Bearer <workspace-key>` header on Finance launch, no raw key
  leakage in the normalized manifest, and route wiring for
  `finance.plugin.navigation`,
  `finance.plugin.back_result`, and `finance.plugin.refresh_required`. Finance
  launch-auth regression coverage must prove `tokenStatus=launch_token_issued`,
  the browser-facing launch URL is
  `/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/<redacted>`,
  the proxy preserves a launch `302`, the redirected page loads under
  `/api/hermes-plugins/finance/proxy/finance.html?embed=hermes`, and only the
  cookie name `finance_hermes_session` is recorded.
- Local/LAN plugins such as Codex Mobile, Wardrobe, and Finance may use HTTP upstreams
  only behind a Hermes same-origin proxy. Hermes Mobile must not require the
  user to configure a separate HTTPS plugin service or reverse proxy for this
  class. When the HTTPS Hermes PWA embeds them, the manifest route should return
  a Hermes same-origin proxy iframe URL and the proxy route should forward to
  the configured HTTP upstream. Harness coverage must prove the browser-facing
  iframe URL is same-origin, not `127.0.0.1` or a LAN IP, and that proxied HTML
  rewrites absolute static/API paths back through the per-plugin proxy prefix.
  It must also prove plugin-owned image/static URLs inside JSON responses are
  rewritten structurally, not with HTML/CSS regexes over arbitrary JSON text.
  Standalone absolute upstream URLs and root-relative `/uploads`, `/media`,
  `/images`, `/assets`, and `/static` paths should be rewritten through that
  prefix. Explicit resource API paths such as `/api/uploads/file` and
  `/api/files/preview/content` should also be rewritten. Finance plugin resource
  APIs under `/api/finance/...` are plugin-owned paths and must be proxied
  through `/api/hermes-plugins/finance/proxy/...`, not leaked to Hermes Mobile's
  own API namespace. Wardrobe image paths returned in JSON, including
  `/api/photos/<id>/content`,
  `/api/outfit-photos/<id>/content`, `/api/featured-look-photos/<id>/content`,
  and `/api/v1/items/<code>/photos/...`, are resource paths and must be proxied
  instead of leaking back to Hermes Mobile's own `/api` namespace. Other `/api`
  strings and prose fields such as chat/thread text remain valid JSON and
  binary image responses preserve their content type.
- Same-origin plugin proxies must handle launch redirects manually. Automatic
  server-side redirect following can consume the plugin launch `302` and its
  session cookie before the browser sees it, causing the embedded app to fall
  back to username/password login. Harness coverage must assert manual redirect
  handling, `Location` rewriting to the proxy prefix, upstream cookie `Domain`
  removal, and cookie `Path` rewriting to
  `/api/hermes-plugins/<plugin-id>/proxy`.
- Same-origin plugin proxies must be validated through the real Mobile
  dispatcher path, not only by direct route-handler calls. The dispatcher must
  allow `/api/hermes-plugins/<plugin-id>/proxy/...` before browser auth so
  iframe HTML/static/API requests can load, while manifest/list/launch issuance
  remains behind the normal workspace access route.
- Installed plugins default to Owner-only visibility. A non-Owner workspace may
  list or launch a plugin only after an explicit Owner authorization signal,
  such as a plugin-manager grant, deployment authorized-workspace list, or a
  plugin-specific workspace-bound key created by the Owner binding flow.
  Generic/global plugin keys must not implicitly authorize every non-Owner
  workspace. Codex Mobile is `owner-critical` and not grantable through the
  plugin manager unless a separate restricted Codex product mode is designed.
- Plugin first-run provisioning is H1 for Owner and non-Owner workspaces. A
  fresh install with empty plugin data must still prove workspace-local
  identity/key creation, plugin-side bind/register success, required Skill/MCP
  setup, and manifest/launch smoke before projecting `active`. Empty plugin
  business rows are acceptable after provisioning; missing provisioning must
  show `pending`, `manual_required`, or `provisioning_failed` and must not reuse
  Owner keys, Owner sessions, global keys, or stale cookies.
- Plugin authorization/admin changes must cover the full contract: Owner-only
  admin API, non-Owner rejection, grant/revoke persistence, Codex grant denial,
  manifest/list visibility after grant, and side-navigation UI exposure only to
  Owner. The stored authorization record may contain plugin id, workspace id,
  timestamps, actor id, and bounded provisioning status only.
  Owner is a valid workspace id for plugin authorization records when a plugin
  requires explicit Owner first-run provisioning. The admin projection must
  merge stored Owner records and discovered Owner workspace-local config/key
  directories, so already-opened Owner plugins stay enabled after reload and
  failed Owner provisioning stays visible as a bounded retryable diagnostic.
- Finance workspace grant is H1 provisioning, not a plain visibility toggle.
  Granting `finance` must create or reuse the target workspace's local
  `.hermes-finance/access-key.txt`, write a non-secret sibling `config.json`,
  call Finance's loopback `/api/v1/hermes/plugin/users/bind` with the Hermes
  workspace label as UTF-8 `display_name`, and expose model-side Finance only
  through a Gateway profile whose `mcp_servers.finance` points at that same
  target workspace with `--no-workspace-override`. Finance must use the common
  plugin MCP runtime shape, i.e. a Python stdio wrapper (`finance_mcp_stdio.py`)
  launched by the Gateway profile's configured Python runtime, so low Gateway
  registration does not depend on ad-hoc Node availability. The authorization
  record may become `active` only after the key/config, Finance bind, and
  profile/MCP registration checks pass. Key creation, config write, bind, or
  MCP/profile failure must remain visible as bounded `provisioning_failed` state
  and must block non-Owner list/manifest/launch rather than falling through to
  `plugin_launch_key_missing`, Owner's Finance MCP, or a misleading usable tab.
- Wardrobe workspace grant is H1 provisioning, not a plain visibility toggle.
  Granting `wardrobe` must create a per-Hermes-user Wardrobe workspace id,
  write only that user's `.hermes-wardrobe/config.json` and `access-key.txt`,
  call Wardrobe's `/api/v1/hermes/plugin/workspaces` registration contract,
  authenticated by a server-side `owners:write` or `admin:*` registration
  credential, install the complete keyless Wardrobe Skill bundle into that
  user's Skill Store, and refresh the workspace Gateway profile binding. The
  harness must prove the
  generated target key uses Wardrobe's accepted Program API prefix, invalid
  legacy placeholder-prefixed keys are replaced before registration, and the
  target raw Wardrobe key appears only in the server-to-server registration body
  and workspace-local key file, not in grant results, manifests, frontend state,
  iframe URLs, postMessage payloads, docs, handoffs, screenshots, or logs.
  The complete Skill bundle requirement is part of the same boundary: the
  target store must contain the full `SKILL.md`,
  `references/wardrobe-program-api.md`, another reference Markdown file, and
  `scripts/render_wardrobe_phone_pdf.py`. A short placeholder template or a
  source bundle with no `references/` must fail closed instead of becoming an
  active Wardrobe grant. Skill bundle sources and installed targets must reject
  concrete Wardrobe workspace keys, plugin launch tokens, and
  `Authorization: Bearer ...` credentials.
  Missing or invalid registration credentials must become bounded
  `provisioning_failed` states. Pending or failed Wardrobe provisioning must
  block non-Owner list/manifest/launch instead of exposing a misleading usable
  tab.
- Email workspace grant is H1 provisioning, not a plain visibility toggle.
  Granting `email` must call Email's `/api/v1/hermes/plugin/workspaces`
  registration contract with a server-side Email Owner key and bounded
  workspace identity. Email owns `.hermes-email/config.json`,
  `.hermes-email/access-key.txt`, mailbox OAuth/IMAP credentials, sync cursors,
  local mail rows, and account-level authorization. Hermes Mobile only records
  bounded provisioning state and later uses the generated workspace key
  server-side to request a short-lived launch entry. Harnesses must prove Email
  auto-provisioning and failure blocking, workspace-key discovery, launch via
  `Authorization: Bearer <workspace-key>` without returning that key, and no
  raw Email Owner key, workspace key, launch token, full mail body, attachment
  content, provider credential, or session cookie appears in grant results,
  manifests, frontend state, iframe URLs, postMessage payloads, docs, handoffs,
  screenshots, or logs.
- Health workspace grant is H1 provisioning, not a plain visibility toggle.
  Granting `health` must create or reuse the target workspace's
  `.hermes-health/access-key.txt`, write a non-secret sibling `config.json`,
  call Health's `/api/v1/hermes/plugin/workspaces` registration contract with a
  server-side registration credential such as `HEALTHY_REGISTRATION_KEY`, and
  register only `access_key_hash` with Health. Missing registration credentials
  must fail closed before writing workspace keys or calling Health. Health MCP
  must follow the common workspace-local wrapper pattern: the Gateway profile
  passes the target workspace root and `--no-workspace-override`, while the
  wrapper reads `.hermes-health/config.json` and `access-key.txt` internally.
  The Health manifest is an installed-plugin contract only; it must not make
  Owner or any other workspace active until an explicit provision/open flow has
  created both workspace-local files and completed Health registration.
  Harnesses must prove fresh-install installed-but-inactive projection, Owner
  explicit provisioning, Health auto-provisioning and failure blocking,
  top-level `toolsets` plus `mcp.toolset` normalization, `launch.endpoint` /
  `provisioning.endpoint` compatibility, `expires_in` /
  `expires_in_seconds` launch TTL compatibility, no raw Health registration
  key or workspace key leakage, and no Owner fallback when Owner switches into
  a non-Owner workspace.
- Note workspace grant is H1 provisioning, not a plain visibility toggle.
  Granting `note` must create or reuse the target workspace's
  `.hermes-note/access-key.txt`, write a non-secret sibling `config.json`, call
  Note's `/api/v1/hermes/plugin/workspaces` registration contract with a
  server-side registration credential such as `NOTE_REGISTRATION_KEY`, and
  register only `access_key_hash` with Note. Missing registration credentials
  must fail closed before writing workspace keys or calling Note. Note MCP must
  follow the common workspace-local wrapper pattern: the Gateway profile passes
  the target workspace root, `--no-workspace-override`, and the deployment
  Note API base, while `note_mcp_stdio.py` reads `.hermes-note/config.json` and
  `access-key.txt` internally. Harnesses must prove fresh-install
  installed-but-inactive projection, Owner explicit provisioning, Note
  auto-provisioning and failure blocking, top-level `toolsets` plus
  `mcp.toolset` normalization, launch/provisioning endpoint compatibility,
  single-prefixed selected-profile callables such as `mcp_note_notes_search`,
  no raw Note registration key or workspace key leakage, and no Owner fallback
  when Owner switches into a non-Owner workspace.
- Email MCP profile registration is part of the Email H1 provisioning surface.
  Granting or using `email` must create or reuse the target workspace's
  `.hermes-email/config.json` and `.hermes-email/access-key.txt`; Gateway
  profiles may expose `email` only from that effective workspace root. The
  maintained local wrapper is `email-mcp-wrapper.py`; it must exchange the
  workspace-local key for a short-lived Email launch session internally and
  expose single-prefixed Gateway callables such as
  `mcp_email_search_messages`. Harnesses must prove ordinary chat keeps Email
  catalog-only, mailbox intent activates Email before streaming, selected
  Gateway profiles declare `mcp_servers.email`, and MCP responses do not expose
  workspace keys, launch tokens, full message bodies, attachment content, or
  provider credentials.
- Generic plugin provisioning status is part of the same contract. A grant may
  enter `pending` only when Hermes owns the automatic provisioning service for
  that plugin. Plugins with manual or external binding must store
  `manual_required`, keep the admin diagnostic visible, and avoid the
  pending/failed launch block unless a real automatic provisioning attempt has
  failed. Harnesses must prove Finance auto-provisioning, Wardrobe
  auto-provisioning, Email auto-provisioning, Health auto-provisioning, Note
  auto-provisioning, their failure-blocking behavior, and Codex non-grantability.
- Plugin notification events are part of the H1 passive-notification path even
  though the plugin host itself is H2. A plugin backend must call Hermes
  `POST /api/hermes-plugins/<plugin-id>/notifications` with a stable
  `sourceId`/`eventId`; Hermes must support both durable Inbox-backed plugin
  notifications and push-only plugin notifications. Codex Mobile task completion
  must keep one latest Inbox item per workspace through a workspace-scoped
  dedupe key rather than creating one Inbox item per completed Codex task. Tests
  must cover default Inbox click routing, `openMode=plugin` click routing,
  explicit `inbox=false` / `inboxMode=push`, Codex workspace-scoped replacement
  completion whose Web Push click goes directly to the Codex plugin route,
  dedupe source keys, plugin registration rejection, and the no-push
  `notify=false` path.
  Codex Inbox click routing must enter the Codex plugin tab and forward bounded
  route hints (`pluginRoute`, `pluginItemId`, `pluginThreadId`, `pluginTaskId`)
  to the embedded iframe entry so the plugin can focus the corresponding thread
  or task.
  Plugin notification handling must keep raw plugin keys, launch tokens, push
  endpoints, private inventories, raw model output, and long reports out of the
  payload, push data, and stored Inbox projection.
- Each plugin project must also implement plugin-side harness coverage before
  release: manifest shape, launch exchange, frame-ancestor origin registration,
  `?embed=hermes` mode, navigation postMessage, `hermes.plugin.back`, no
  browser-window handoff, iframe state preservation across tab switches, and
  installed-PWA smoke. Hermes Mobile cannot prove plugin-owned route behavior
  by testing only the host shell.
- The native Wardrobe MCP dashboard fallback is retired. Reintroducing it, or
  adding another local fallback dashboard, is a new H2/H1 design decision and
  requires explicit product approval plus route/service/frontend harness
  coverage.
- Wardrobe write workflows (`write_item`, `upload_photo`, `set_primary_photo`,
  `write_history`) require explicit user action and dry-run-first coverage
  before any commit path is exposed.
Primary docs:

- `docs/MODULES/static-client.md`
- `docs/MODULES/plugins.md`
- `docs/MODULES/wardrobe.md`
- `docs/RUNBOOKS/static-client-cache-version.md`

## H3 Focused Tests Only

H3 is acceptable only when all of the following are true:

- No persistent state transition changes.
- No async job, queue, retry, reconciliation, or model call changes.
- No permission, workspace, recipient, file, artifact, or push routing changes.
- No public export/release artifact changes.
- No second-level navigation, bottom tab, top menu, scroll intent, or service
  worker behavior changes.

Examples:

- Copy-only typo correction in an existing doc.
- Isolated CSS adjustment that does not affect layout contract or interaction.
- Deterministic helper change with direct unit coverage and no workflow state.

## Implementation Rule

When a bug is fixed in an H1 or H2 flow, update the corresponding harness
scenario in the same change. A fix that only patches the symptom without adding
or extending the scenario remains incomplete unless the user explicitly asks
for an emergency hotfix first.

If the required harness does not exist yet, create the smallest failing scenario
that reproduces the bug or protects the new workflow edge before changing the
implementation. For urgent production repair, restore service first, then add
the harness before closing the engineering task.
