# Remote Managed Workspace

Status: Phase 1 Home AI control-plane source implementation added; production
deployment is still a separate Owner/deploy-lane step.

## Objective

Remote Managed Workspace lets an independently owned local project, such as a
child's existing Vite game, participate in Home AI's central governance without
turning that project into a Home AI plugin.

The remote project keeps its local fast feedback loop. The child can continue
using Codex Desktop or Codex Mobile on the remote computer to ask for features
in natural language and see immediate local results. Home AI central governance
provides guardrails, daily review, escalation, audit, and architecture support
only when needed.

## Product Model

This is a local-autonomy-first model:

- ordinary feature requests, visual tweaks, gameplay tuning, copy, small bugs,
  simple tests, and local preview remain local to the remote computer;
- the central Home AI system receives daily summary packets and bounded
  escalation cards;
- the central system intervenes only for high-risk architecture, repeated
  failures, deploy/publish approval, security-sensitive work, destructive
  actions, or explicit requests for central review;
- the remote project is governed by Home AI contracts, but is not a plugin,
  does not use the plugin same-origin runtime, and does not need plugin
  provisioning, launch tokens, or MCP plugin authorization.

## Control Plane Ownership

Home AI owns the Remote Managed Workspace control plane.

The central listener/API, workspace registry, Owner-visible status, governance
policy, daily-summary projection, escalation routing, task-card dispatch, audit
policy, approval boundary, and lifecycle ledger belong in the Home AI app
workspace. This keeps the parent/Owner control surface in the same system that
already owns central contracts and cross-workspace governance.

Codex Mobile owns the remote node/runtime client.

The remote Codex Mobile installation on the child's computer should connect
outbound to the Home AI control-plane endpoint, poll for work, run local Codex
Desktop/Codex Mobile tasks, maintain local Worker/Audit lanes, send per-card
heartbeat, and return bounded results. Codex Mobile may provide shared client
libraries, local simulator routes, test harnesses, and MCP/runtime helpers, but
it is not the system-of-record for the remote workspace registry or central
policy decisions.

The direction of control is therefore:

```text
Home AI control plane/listener
  <- outbound register/poll/heartbeat/return -
Remote Codex Mobile node
  -> local Codex Desktop / local project runtime
```

The remote computer should not expose a public inbound management port to
central Home AI. Home AI exposes the central endpoint; the remote Codex Mobile
node dials out to that endpoint.

## Non-Goals

- Do not route every child request through central requirements analysis.
- Do not slow down ordinary creative iteration with central approval gates.
- Do not expose the remote computer to inbound public traffic.
- Do not give central Home AI arbitrary shell access to the remote machine.
- Do not collect private files, browser cookies, account secrets, raw logs, or
  screenshots with private data from the remote machine.
- Do not model the Vite game as a Home AI plugin unless a later product
  requirement explicitly asks for embedded plugin distribution.

## Actors And Roles

- `central_home_ai`: the central governance system.
- `remote_codex_mobile_node`: the Codex Mobile runtime installed on the remote
  computer.
- `remote_codex_desktop`: optional desktop UI launched with a controlled
  shortcut and custom `CODEX_HOME`.
- `external_project_main`: the remote project's main/source thread. This is a
  scheduling and analysis role and must use effective runtime reasoning
  `xhigh`.
- `external_project_worker`: reusable local Worker lanes on the remote
  computer.
- `external_project_audit`: local audit lane for bounded product/code/visual
  checks.
- `external_project_deploy`: optional local deploy/publish lane. Publishing is
  Owner-gated.

## Workspace Registration

The remote Codex Mobile instance should support marking a local project as a
remote managed workspace.

Example local config:

```json
{
  "workspaceId": "son-vite-game",
  "workspaceKind": "remote_managed_workspace",
  "projectType": "vite_game",
  "projectRoot": "/Users/example/path",
  "centralUrl": "https://home-ai.example.com",
  "nodeName": "son-macbook",
  "contractVersion": "remote-managed-workspace-v1",
  "mainThreadRole": "external_project_main",
  "workerRole": "external_project_worker",
  "auditRole": "external_project_audit",
  "deployRole": "external_project_deploy",
  "capabilities": [
    "task_cards",
    "task_card_heartbeat",
    "terminal_return",
    "daily_summary",
    "build",
    "test",
    "vite_preview",
    "playwright_visual_smoke"
  ]
}
```

The remote node should be configured with an enrollment token or equivalent
bounded credential. The token must authorize only this managed workspace and
must not grant broad access to other central Home AI workspaces.

## Connection Direction

The remote Codex Mobile node should initiate outbound connections to the
central server. The central server should not require inbound access to the
child's computer.

Rationale:

- avoids home NAT and firewall complexity;
- avoids exposing a public port on the remote computer;
- works with changing local IP addresses;
- makes offline/sleep recovery simpler;
- matches runner/agent style systems where the managed node polls the control
  plane.

The central server address can be configured as an IP address or URL. The
remote node treats that value as the central control-plane endpoint.

## Home AI Control Plane API Shape

The exact route names may change during implementation, but the Home AI app
should provide these central control-plane endpoints:

```text
POST /api/remote-managed-workspaces/register
POST /api/remote-managed-workspaces/:workspaceId/node-heartbeat
GET  /api/remote-managed-workspaces/:workspaceId/task-cards/poll
POST /api/remote-managed-workspaces/:workspaceId/task-cards/:taskCardId/ack
POST /api/remote-managed-workspaces/:workspaceId/task-cards/:taskCardId/heartbeat
POST /api/remote-managed-workspaces/:workspaceId/task-cards/:taskCardId/return
POST /api/remote-managed-workspaces/:workspaceId/daily-summary
POST /api/remote-managed-workspaces/:workspaceId/escalations
```

`task-cards/poll` is also the bounded outbound session endpoint. A remote node
may call it as ordinary polling with no wait query, or as bounded long-poll by
passing `waitMs=<milliseconds>` up to the server maximum. If queued task cards
already exist, the route returns immediately. If no queued card exists, Home AI
holds only that outbound HTTP request in memory until a task card is dispatched
or the bounded wait expires. Dispatching a task card wakes any live long-poll
waiters for that workspace. No Home AI route requires inbound access to the
remote computer.

Owner-visible status projects the node session separately from task-card
heartbeat. Session states are bounded to `disconnected`, `connecting`,
`connected`, `stale`, `auth_failed`, `config_invalid`, and `offline`.
`connected` means the node has a fresh heartbeat/poll or an active long-poll
request. `stale` and `offline` are derived from central timestamps.
`auth_failed` and `config_invalid` are metadata-only status states and must not
include enrollment token values. The response also exposes the selected design
as `controlPlane.sessionDesign=bounded_long_poll` and
`controlPlane.pollFallback=true`.

All responses should be bounded metadata. The central server should never
request arbitrary filesystem reads or arbitrary shell commands from the remote
node.

Codex Mobile should not be the authoritative public listener for these central
routes. If Codex Mobile has simulator or compatibility routes with the same
semantic shape, they should be documented as local test/client-runtime helpers
or migrated behind the Home AI control-plane boundary.

## Remote Node Behavior

On startup, the remote node should:

1. read the local remote-managed-workspace config;
2. verify the project root exists and is inside an allowed root;
3. register with central Home AI using the enrollment credential;
4. report capabilities, local contract version, lane status, and build/test
   command availability;
5. start polling the central task-card inbox;
6. keep sending node heartbeat while online;
7. run local daily summary on schedule.

The remote node should continue to work offline for local Codex Desktop usage.
When central is unreachable, it should queue bounded summaries and returns
locally and retry later.

## Codex Desktop Shortcut

The child may use Codex Desktop directly. The desktop shortcut should set up the
controlled runtime context:

- project cwd points to the Vite game root;
- `CODEX_HOME` points to a Home AI managed profile for this child project;
- MCP config points to the local Codex Mobile app server;
- remote managed workspace id is set;
- main thread effective runtime reasoning is `xhigh`;
- local AGENTS.md and workspace contracts are loaded;
- task-card and thread-lifecycle tools are available through the local Codex
  Mobile runtime.

This preserves the local "ask and see it immediately" workflow while still
placing the project inside central governance.

## Task Card Protocol

The remote node should reuse the existing Codex Mobile task-card concepts:

- stable task-card id;
- idempotency key;
- execution lease;
- per-card heartbeat;
- terminal return;
- statuses: `completed`, `blocked`, `redirected`, `rejected`,
  `partially_completed`;
- bounded metadata-only evidence;
- Chinese Owner-visible terminal return for cards surfaced to the parent/Owner;
- no duplicate equivalent execution for the same source request.

Task-card heartbeat is per task card, not per Worker. If one Worker holds two
active task cards, the node must send heartbeat for both cards.

## Local Autonomy Rules

The remote main thread may handle low-risk local work without central
round-trip:

- small gameplay changes;
- UI copy and layout tweaks;
- simple bug fixes;
- content or level data updates;
- local build/test/preview;
- small code cleanup with limited blast radius.

The remote main thread should write a short local handoff or activity summary
for these changes so the daily summary can report them.

## Central Escalation Triggers

The remote node must escalate to central Home AI when any of these occur:

- architecture or state model rewrite;
- broad refactor across multiple modules;
- repeated test/build failure that local Codex cannot resolve;
- performance, memory, or animation jank diagnosis requiring deeper analysis;
- security-sensitive work, secrets, login, payments, accounts, network keys, or
  external service credentials;
- deploy/publish/release;
- destructive file operations;
- access outside the project root;
- ambiguous product direction that needs parent/Owner review;
- local Codex requests central help explicitly;
- daily summary detects accumulating complexity or untested behavior.

Escalation should create a central task card with bounded evidence and no raw
private payloads.

## Daily Summary

The daily summary is the primary central governance input.

It should include:

- features or changes completed today;
- files changed, bounded by project-relative paths;
- build/test/preview status;
- visual smoke status when available;
- current open ideas or requested features;
- local blockers;
- possible architecture or maintainability risks;
- central help requested or recommended;
- next suggested focus.

It must not include raw private chats, raw logs, screenshots with private data,
tokens, cookies, account data, or unrelated files from the remote computer.

## Vite Game Validation

For a Vite page game, the default validation suite should include:

```bash
npm install
npm run build
npm test
npm run preview
```

If Playwright or an equivalent browser harness is available, add:

- desktop viewport smoke;
- mobile viewport smoke;
- start/pause/restart flow;
- win/lose or level-complete state;
- canvas/WebGL nonblank pixel check when applicable;
- asset-load check for images, audio, fonts, and sprites;
- no horizontal overflow on common mobile viewport widths.

Validation commands should be configurable per project because a child's Vite
game may start with minimal tooling.

## Security And Privacy Boundary

The first version must be conservative:

- outbound-only connection from remote node to central;
- workspace-scoped enrollment token;
- no arbitrary central shell execution;
- project-root filesystem boundary;
- no upload of raw private files;
- no secrets, cookies, launch tokens, API keys, browser credentials, provider
  payloads, raw prompts, database rows, screenshots with private data, raw logs,
  or long diffs in returns;
- deploy/publish and destructive operations require Owner approval;
- central task cards can request local commands only from an allowlist;
- returns must summarize command status and bounded issue codes instead of
  copying full logs.

## Failure And Recovery

The remote node should handle:

- central unreachable: queue outbound returns/summaries and retry;
- remote machine asleep/offline: central marks node stale but does not fail
  active work immediately;
- task-card heartbeat stale: central may request resume of the same task card;
- duplicate task card: local node acknowledges duplicate and executes at most
  one equivalent card;
- local Worker busy: resolve another available Worker lane or queue locally;
- missing local project root: block with bounded reason
  `remote_project_root_missing`;
- contract version mismatch: block high-risk tasks and ask for contract update
  before execution.

## Implementation Phases

### Phase 1: Home AI Control Plane

- Add Remote Managed Workspace registry, enrollment-token validation, and
  workspace-scoped state to the Home AI app.
- Add Home AI central listener routes for register, node heartbeat,
  task-card poll/ack/per-card heartbeat/terminal return, daily summary, and
  escalation.
- Add bounded long-poll semantics to the existing task-card poll route so a
  remote node can keep an outbound session open and be woken when central
  dispatches a task card. Ordinary polling remains the fallback.
- Add Owner-visible bounded status/readback for registered nodes, stale nodes,
  active task cards, session state, summaries, and escalations.
- Add docs and tests for registration, token scoping, fail-closed missing
  enrollment config, and offline/stale state.

Current Home AI source implementation:

- `adapters/remote-managed-workspace-service.js` owns the registry/state model,
  enrollment-token validation, workspace/node projection, task-card queue,
  idempotency keys, execution lease, per-card heartbeat, terminal return,
  bounded long-poll waiter notification, session-state projection,
  daily-summary projection, escalation ledger, and bounded Owner-visible status.
- `server-routes/remote-managed-workspace-api-routes.js` exposes the central
  Home AI listener routes. Remote-node routes authenticate with a
  workspace-scoped enrollment token before normal browser/Home AI web-key auth.
  Owner status and dispatch routes remain Owner-only through the normal
  authenticated route pipeline.
- `server-routes/mobile-api-dispatcher.js` treats
  `/api/remote-managed-workspaces/*` as a pre-browser-auth node path only when
  `handleNode()` accepts the route. Owner-only status/dispatch paths fall
  through to normal Owner authentication.
- The control plane persists under `state().remoteManagedWorkspaces` when the
  Home AI runtime state provider is available. Tests inject an in-memory state
  provider.
- Enrollment config is fail-closed. Supported source-side configuration shapes
  are `HERMES_REMOTE_MANAGED_WORKSPACE_ENROLLMENTS` JSON, comma-separated
  `HERMES_REMOTE_MANAGED_WORKSPACE_TOKENS`, or the single-workspace
  `HERMES_REMOTE_MANAGED_WORKSPACE_ID` plus
  `HERMES_REMOTE_MANAGED_WORKSPACE_ENROLLMENT_TOKEN` pair. Do not store token
  values in docs, handoffs, logs, or task-card returns.
- The first source harnesses are
  `node tests/remote-managed-workspace-service.test.js`,
  `node tests/remote-managed-workspace-api-routes.test.js`, and
  `node tests/remote-managed-workspace-integration.test.js`. The integration
  harness uses two local ephemeral ports, starts the remote-node long-poll
  outbound request before central dispatch, verifies dispatch wakes that
  request, and asserts neither port is production `8787`.

### Phase 2: Codex Mobile Remote Node Client

- Add remote-managed-workspace config support to Codex Mobile.
- Add outbound Home AI registration and node heartbeat client.
- Add central inbox polling from remote node.
- Add ack, per-card heartbeat, terminal return sync to the Home AI control
  plane.
- Map central task cards into local Codex Mobile task-card runtime.
- Preserve idempotency and execution lease semantics locally and centrally.
- Ensure external project main/source incoming cards use effective runtime
  reasoning `xhigh`.

### Phase 3: End-To-End Relay Harness

- Add a two-process or two-port harness that runs a Home AI control-plane
  simulator and a Codex Mobile remote-node simulator.
- Register a managed workspace, dispatch one task card from central, poll it
  from the remote node, ack it, heartbeat it, return it, and verify duplicate
  suppression.
- Verify daily summary and escalation payloads stay bounded and privacy-safe.
- The harness must not use production `8787` and must not require inbound
  public access to the remote machine.

### Phase 4: Daily Summary

- Add local activity summary collector for the remote project.
- Add Home AI daily-summary storage/projection.
- Add Owner-visible daily summary view or Inbox item.
- Keep summaries bounded and privacy-preserving.

### Phase 5: Escalation And Audit

- Add local escalation rules and central escalation cards.
- Add audit lane routing for architecture, visual, and test gaps.
- Add Vite game validation harness integration.
- Add central recommendations without blocking low-risk local work.

### Phase 6: Deploy/Publish Governance

- Add optional deploy lane contract for remote projects.
- Require Owner approval for publishing or destructive operations.
- Add readback requirements for hosted game URLs if the project is published.

## Acceptance Criteria

Phase 1 acceptance:

- a remote node can register a local Vite game workspace with central;
- Home AI can show node online/offline and contract version;
- node heartbeat is bounded metadata only;
- no inbound port is required on the remote computer.

Phase 2 acceptance:

- central can send a task card to the remote workspace;
- remote node acknowledges and executes it locally;
- per-card heartbeat is visible centrally;
- remote node returns terminal status centrally;
- duplicate cards are not executed twice;
- main/source target runtime reasoning remains `xhigh`.

Phase 3 acceptance:

- remote node sends a daily summary without raw private data;
- central displays the summary and flags risks;
- local low-risk work remains possible without central approval.

Phase 4 acceptance:

- local node escalates high-risk or unresolved work to central;
- central can send architecture/audit guidance back as task cards;
- remote Worker/Audit lanes can complete and return bounded evidence.

## Implementation Split

This feature requires two implementation boundaries:

1. Home AI app implementation owns the central control-plane listener, state,
   Owner status, task-card dispatch projection, daily-summary projection, and
   escalation governance.
2. Codex Mobile implementation owns the remote-node client, local project
   runtime integration, local task-card execution, and local simulator/harness
   support.

If an earlier Codex Mobile implementation introduced authoritative central
`/api/remote-managed-workspaces/*` routes inside Codex Mobile, treat that as a
transport/runtime prototype. The follow-up work should either move the
authoritative central routes into Home AI or clearly mark Codex Mobile routes as
local simulator/client-runtime helpers behind the Home AI control-plane
boundary.

## Ready-To-Send Home AI Task Card

Title: Implement Remote Managed Workspace Home AI control plane

Summary: Add Home AI-owned central control-plane APIs and Owner-visible state
for remote managed workspaces. Remote Codex Mobile nodes connect outbound to
these Home AI endpoints.

Body:

```markdown
# Implement Remote Managed Workspace Home AI control plane

## Objective

Implement the Home AI central control plane for `remote_managed_workspace`.
Home AI must own the listener/API, registry, Owner-visible status, policy,
daily-summary projection, escalation routing, and task-card dispatch ledger.
Codex Mobile remote nodes connect outbound to Home AI; Home AI does not connect
inbound to the child computer.

## Requirements

- Add Home AI app routes for register, node heartbeat, task-card poll, ack,
  per-card heartbeat, terminal return, daily summary, and escalation.
- Store registered remote workspace metadata: workspace id, node id/name,
  project type, bounded project root label, contract version, roles,
  capabilities, online/stale state, and last heartbeat.
- Validate workspace-scoped enrollment token before global Owner/task-card
  behavior. Fail closed when token/config is missing.
- Preserve task-card idempotency, execution lease, per-card heartbeat, terminal
  return, duplicate suppression, and bounded metadata-only evidence.
- Expose Owner-visible status for remote node online/offline, active cards,
  latest daily summary, escalation count, and stale heartbeat.
- Keep low-risk local work autonomous. Home AI only receives daily summaries and
  escalations unless it dispatches explicit task cards.
- Do not implement arbitrary shell, broad filesystem reads, raw log collection,
  inbound remote-machine access, or plugin runtime conversion.

## Validation

- Unit tests for enrollment, register, heartbeat, poll, ack, per-card
  heartbeat, return, daily summary, escalation, duplicate suppression, and
  fail-closed missing token/config.
- Service/route tests for Owner-visible bounded state.
- Two-port integration harness with a simulated Codex Mobile remote node
  connecting outbound to the Home AI control-plane simulator.
- Existing task-card, Worker lifecycle, and architecture boundary tests must
  continue to pass.

## Privacy Boundary

Return only bounded metadata. Do not return raw secrets, cookies, launch
tokens, access keys, provider payloads, private thread bodies, endpoint bodies,
screenshots with private data, raw logs, DB rows, full prompts, or long diffs.
```

## Ready-To-Send Codex Mobile Task Card

Title: Implement Remote Managed Workspace node support

Summary: Add Codex Mobile support for a remote managed workspace mode where a
local project, such as an independent Vite game, registers outbound with the
Home AI control plane, polls task cards, returns heartbeat/results/daily
summaries, and keeps ordinary local work autonomous.

Body:

```markdown
# Implement Remote Managed Workspace node support

## Objective

Implement the Codex Mobile remote-node client for `remote_managed_workspace`
mode. The first target is an existing independent Vite page game on a remote
computer. The remote project is not a Home AI plugin. It remains locally
autonomous and uses Home AI central control-plane APIs only for guardrails,
daily summaries, escalation, audit, task cards, and Owner-gated deploy/publish
workflows.

## Requirements

- Add local remote-managed-workspace config with workspace id, project root,
  central URL/IP, node name, contract version, allowed commands, capabilities,
  and enrollment token reference.
- Remote node must initiate outbound connection to Home AI central APIs; do not
  require inbound public access to the remote computer.
- Implement remote-node client calls for registration, node heartbeat,
  task-card poll, ack, per-card heartbeat, terminal return, daily summary, and
  escalation protocol.
- Do not make Codex Mobile the authoritative central listener for these routes.
  Any Codex Mobile route with this shape must be a local simulator,
  compatibility layer, or remote-node runtime helper behind Home AI ownership.
- Reuse Codex Mobile task-card semantics: idempotency, execution lease,
  per-card heartbeat, terminal return, duplicate suppression, and bounded
  metadata-only evidence.
- Preserve local autonomy: low-risk local feature work does not require central
  approval or central requirements analysis.
- Escalate high-risk architecture, repeated failures, deploy/publish,
  destructive operations, secrets/accounts/network credentials, access outside
  project root, and explicit central-help requests.
- Main/source thread effective runtime reasoning must be `xhigh`.
- Worker/audit/deploy lanes are reusable stable pools and must not be created
  from transient task titles.
- Return cards and Owner-visible summaries should be Chinese when surfaced to
  the Owner.

## Privacy Boundary

Do not return raw secrets, cookies, launch tokens, access keys, provider
payloads, private thread bodies, screenshots with private data, database rows,
raw prompts, raw logs, endpoint bodies, or long diffs. Central may request only
bounded metadata and allowlisted local project commands.

## Validation

- Unit tests for remote registration, token/workspace scoping, node heartbeat,
  polling, ack, per-card heartbeat, terminal return, duplicate suppression,
  offline retry, and bounded daily summary.
- Integration test showing central task card -> remote node -> local execution
  -> central terminal return.
- Vite game fixture test with build/test/preview metadata.
- Negative tests for inbound shell, project-root escape, duplicate execution,
  and raw secret/log return.
- Existing task-card runtime and thread lifecycle tests must continue to pass.

## Deliverables

- Source implementation and tests.
- Docs for Remote Managed Workspace setup and operator flow.
- Example config for a Vite game workspace.
- No production deploy unless explicitly routed to deploy lane.
```
