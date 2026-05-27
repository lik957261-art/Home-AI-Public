# Harness Required Matrix

Last updated: 2026-05-27.

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

### Growth Learning Card Workflow

Applies to teaching cards, practice cards, weekly/stage assessment cards,
challenge-triggered assessment cards, reflection, reward settlement, mastery
profile updates, and Growth board status projection.

Required harness dimensions:

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

### Action Inbox And Passive Notification Workflow

Applies to Inbox item creation, source filtering, multi-recipient delivery,
Web Push coupling, and completion/audit actions.

Required harness dimensions:

- Automation conclusions enter Inbox.
- Todo items enter Inbox.
- Approval/review/permission requests enter Inbox.
- Executor card completion notifications enter the authorized passive
  recipients' Inbox.
- Active user-initiated chat/topic task receipts do not enter Inbox unless they
  become passive follow-up work.
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

### Automation/Cron Execution Workflow

Applies to scheduled jobs, manual runs, bridge-host proxy behavior, status
projection, deletion, and automation Web Push.

Required harness dimensions:

- Cron-triggered and manually-triggered runs follow the same terminal status
  contract.
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

- The system must not hard-prune callable toolsets before the model has had a
  first-round chance to choose the task's needed capability set.
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
- Runtime selector code must keep failure non-blocking: invalid JSON, timeout,
  missing Gateway runner, or an empty/unauthorized selection must fall back to
  the original authorized toolsets rather than failing the user run.
- Selector latency is part of the contract. The first-round selector must use a
  short bounded budget, default to a lightweight model, and attempt a
  best-effort stop when a selector run id is known after failure. It must not
  hold the user's real run behind a long model preflight.
- The permission-boundary flow is the reference design: the model emits
  `HERMES_PERMISSION_APPROVAL_REQUIRED` during the normal run and Hermes parses
  the marker locally. Toolset selection should follow the same marker-style
  contract for future non-blocking expansion/escalation work instead of adding
  another long synchronous pre-run decision.
- Run telemetry must record model-selection start/end, selected toolsets,
  expanded callable count, tool-call start/end, final-message start/end, and
  terminal status without storing raw prompts, raw model responses, secrets, or
  user private content.
- UI/status projection must distinguish at least: waiting for model selection,
  waiting for tool result, generating final message, completed, failed, and
  stale/liveness-failed.

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
- `node tests\run-liveness.test.js`

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

Primary docs and tests:

- `docs/MODULES/gateway-pool.md`
- `docs/RUNBOOKS/codex-responses-stream-output-none.md`
- `node tests\cross-shell-command-harness.test.js`
- `node tests\startup-scripts.test.js`

### Web Push Click And Route Workflow

Applies to notification payload construction, service worker click handling,
deep links, top-level client selection, and route fallback.

Required harness dimensions:

- Notification click opens or focuses a top-level app window, not an embedded
  viewer frame.
- Inbox, task, chat/topic, Growth, and Automation routes resolve to the expected
  in-app view.
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
- Preview fallbacks follow the in-app overlay/iframe/download pattern used by
  Markdown, image, and document previews; `about:blank` print windows and
  `open(..., "_blank")` are not allowed workarounds.

Primary docs:

- `docs/FRONTEND_STATE_MAP.md`
- `docs/MODULES/action-inbox.md`
- `docs/MODULES/automation.md`
- `node tests\same-window-navigation-harness.test.js`

### Chat Send And Scroll Stability

Applies to composer send, run/status box insertion, SSE event updates, keyboard
viewport behavior, search mode transitions, and task-detail follow-up sends.

Required contract dimensions:

- Sending a message pins to the newest message/run-status area unless the user
  intentionally navigated away.
- Run/status box insertion does not restore stale scroll offsets.
- SSE refreshes do not jump to old history after the run appears.
- Keyboard viewport changes do not hide the composer or force a stale scroll
  restore.
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

Primary docs:

- `docs/MODULES/static-client.md`
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
