# Hermes Mobile Product Requirements

This file records durable product rules that implementation must preserve.

## General

- Hermes Mobile is a private family/workspace AI control plane, not a generic public SaaS app.
- Hermes Mobile is a multi-user, multi-workspace, multi-task product layer on top of official Hermes Gateway workers, not a single-user personal Agent session and not a product-policy fork of official Hermes.
- Owner controls production configuration, high-permission operations, workspace keys, Gateway maintenance, and Growth configuration.
- Non-Owner accounts must retain normal workspace tools according to their workspace policy; Growth-specific restrictions must not globally lock a workspace out of chat, directory, Growth execution, Inbox, or configured background capabilities.
- Product and architecture changes must be public-deployable. A fresh public
  deployment from the repository must run through documented installer/runtime
  configuration and must not depend on private machine paths, copied production
  state, local-only secrets, hidden approvals, or manual repairs performed only
  in the maintainer's environment.
- Product-facing changes must satisfy the engineering governance gates:
  CI-enforced constraints, production self-diagnostics, and the Productization
  acceptance matrix. A fix is not productized if it only works in the
  maintainer's current production state and lacks documented fresh-install,
  update, permission-boundary, and diagnostic coverage for applicable failure
  modes.

## Multi-User And Multi-Task Platform

- Every user-visible operation must resolve an authenticated actor, effective workspace, resource boundary, access policy, and task surface before model/tool execution.
- Workspace Access Keys map ordinary users to one workspace; server-side auth must clamp or reject spoofed workspace/principal/resource fields.
- Gateway worker/profile selection happens after access policy construction and must not silently fall back to another user's profile when a workspace mapping is missing.
- Creating a family workspace is an Owner-confirmed Home AI onboarding workflow. It must not depend on Codex manual operations for routine use, and the model must not receive arbitrary privileged shell access; macOS system changes go through a restricted whitelist executor.
- Owner ordinary chat may use low-permission workers; Owner maintenance routes must be explicit and separate.
- Ordinary Chat, group-chat, task-stream groups, task-list items, Action Inbox items, Automation jobs, and Growth records are different task surfaces with different sources of truth.
- Action Inbox is the primary lightweight user-action queue; official Hermes Kanban is legacy/compatibility for Hermes Mobile Todo, not the product's main participation model.
- Product behavior for user identity, sharing, UI state, task grouping, delivery routing, and product persistence belongs in Hermes Mobile services, not official Hermes source patches.
- Family-level memory should start from practical household profiles before
  full cross-plugin event graph semantics. Owner is the household administrator
  on Owner's personal computer and can see complete household profile
  projections; ordinary members and non-Owner Gateway runs must receive only
  self or explicitly shared profile projections.
- Household profile records and insights must preserve source workspace,
  domain, sensitivity, visibility, provenance, and idempotency metadata.
  Cross-workspace generated insights default to Owner-only until Owner chooses
  to share a bounded summary.

## Chat Context

- Raw chat/task history must remain auditable, but long raw history should not be injected into every model prompt by default.
- The latest user request and current task state must take priority over compacted summaries.
- Topic context compaction is scoped by `(threadId, taskGroupId)` and must not mix ordinary Chat, group chat, and unrelated task groups.
- Compacted context must keep source references or stable ids so conclusions can be traced when needed.
- Summary/state/debug metadata must not store raw secrets, push endpoints, raw prompts, full model responses, full learner answers, full transcripts, full questions, answer keys, long tool logs, or private generated reports.
- Layered context assembly must keep a rollback path to legacy bounded recent-window behavior.

## Directory Topics

- Directory is a built-in application plugin in the Hermes Mobile topic
  surface. It should be discovered from the topic/application grid rather than
  occupying a permanent bottom navigation tab.
- Treating Directory as a built-in plugin is an information-architecture rule,
  not a permission/runtime rewrite. Directory browsing, upload, delete, preview,
  and context selection must still go through the existing directory ACL and
  boundary services.
- A directory is a project/evidence container, not a single fixed topic.
- One directory may bind multiple topic chats when those chats represent different purposes, such as planning, analysis, summary, issue tracking, or report drafting.
- Each directory may have at most one default primary topic for quick entry. Additional bound topics are topic-specific secondary entries.
- Directory-topic cards may use a large icon/card presentation similar to plugin topics, but the actions should make the distinction clear: open directory, open default topic, or pick a bound topic.
- Directory-topic context must load cleaned summaries, selected files, and bounded previews from the directory through the directory boundary service. It must not blindly inject every file in the directory.
- Directory-topic binding must not weaken directory ACLs. Owner viewing another workspace must resolve that workspace's directory, default topic, and topic list, not Owner's.

## Plugin Topics

- Workspace-private plugins may be bound to first-class application topics.
- The topic application grid may include built-in plugins such as Directory
  alongside external embedded plugins such as Wardrobe, Finance, and Email.
  Built-in plugin cards reuse the launcher pattern but keep their original
  module services and authorization boundaries.
- A plugin topic must not authorize a plugin by itself; visibility, launch, MCP/toolset exposure, and delivery directory access must all resolve through the effective workspace.
- A plugin topic run should use the plugin MCP as the primary structured data access path when the selected workspace has active provisioning and callable schema evidence. Directory context is supporting evidence only.
- Plugin topics must eagerly load the current plugin's required MCP/toolset and
  required Skill rules. Other authorized plugins should remain visible through a
  compact capability catalog and activate only when the run needs cross-plugin
  access.
- Ordinary chat should know the full authorized plugin capability catalog for
  the effective workspace, but must not inject every plugin MCP schema or full
  plugin Skill body by default. Cross-plugin access is enabled through bounded
  deterministic or server-validated lazy activation.
- Capability catalogs are routing hints, not evidence. If a requested plugin
  cannot be activated, Hermes Mobile must report a bounded unavailable-plugin
  diagnostic instead of answering as though it inspected that plugin's data.
- Every plugin topic should have a standard workspace-local delivery directory for cleaned reports and user-facing outputs. That directory must not store raw plugin keys, launch tokens, browser cookies, provider credentials, full mailbox bodies, raw ledger rows, private inventories, health record dumps, or plugin database files.
- Owner switching into a non-Owner workspace must use the target workspace's plugin topic, plugin app, delivery directory, and MCP binding. Owner fallback is a permission failure.

## Plugin Workspace Audit Loop

- Plugin workspace audit is a Home AI host capability for embedded plugin
  workspaces. It is not a Codex Mobile standalone/public feature and must not
  expand the independent Codex Mobile app's default product surface.
- The audit loop may only target registered, enabled plugin workspaces that the
  effective workspace is authorized to inspect. It must not accept arbitrary
  local paths, Owner fallback plugin bindings, or unprovisioned plugin
  directories as valid targets.
- The first alignment phase is manually triggered by the user and only targets
  plugin workspaces. It must not audit the Home AI host workspace or start
  nightly batch audits until the manual report and task-card quality are
  accepted.
- Automation owns scheduling, pause/resume, retry, and durable job state for
  audit plans and manual run requests. Codex, Gateway, or another executor is
  only the bounded read-only audit runner.
- Version 1 is read-only. It may inspect metadata, source text, git status,
  recent changes, and bounded logs, but it must not write files, modify
  databases, run deploy scripts, commit, push, install packages, or restart
  services. Any future write/repair mode requires an explicit Owner-only
  whitelist and a separate product rule.
- Each scheduled or manually triggered audit creates an audit run that is
  separate from ordinary development or chat threads. It must not inherit the
  user's active thread context, hidden UI state, one-time approvals, or
  transient shell state.
- Audit reports are user-facing summaries. They should be written to an audit
  history and, when useful, a plugin delivery directory; Action Inbox receives
  summary-only review/error items with links to the report or audit thread.
  Inbox must not store full diffs, raw logs, secrets, tokens, launch keys, push
  endpoints, private paths, or full model transcripts.
- High-risk audit findings may create pending review/task-card suggestions.
  They are not automatic repair tasks until the user explicitly confirms a
  follow-up implementation workflow.
- A fresh public deployment must work without private machine paths or
  preinstalled private Codex profiles. If no safe audit executor or plugin
  workspace resolver is configured, the feature must be disabled with a bounded
  diagnostic instead of silently running with a local fallback.

## Native iOS Shell Product Boundary

- The Home AI native iOS shell is a system-capability bridge, not a second
  product UI, not an embedded business plugin, and not a plugin credential
  holder. The Home AI Web/PWA surface remains the source of truth for product
  UI, workspace policy, plugin routing, Gateway/MCP use, and server APIs.
- Standalone PWA behavior is the compatibility baseline. If Home AI is opened
  as a normal browser/PWA without the native shell marker and bridge handshake,
  existing modes, routes, layout, menus, composer behavior, plugin surfaces,
  and permission flows must remain unchanged. Native-shell work may add
  compatibility paths only after `nativeShell=ios` or an equivalent native
  bridge capability is detected.
- Near-term native shell work should focus on system push completion, native
  voice-input capture, system share/receive flows, and WebView stability
  bridges. Each native capability must enter Home AI through explicit server
  APIs or bounded native-to-Web bridge messages.
- Apple Watch and Bluetooth/BLE are deferred extension points, not current or
  near-term roadmap items. They require a separate product requirement and
  validation plan before implementation.
- The shell must not store plugin long-lived credentials, plugin launch tokens,
  Gateway profile credentials, raw cookies, APNs provider secrets, or other
  production secrets. It may store only bounded native app state needed for
  system capabilities, such as local notification registration state.

## Host Voice Input

- Voice input for Home AI composer surfaces is a Home AI host capability, not
  an ordinary plugin iframe and not a system input method. It covers ordinary
  Home AI chat, plugin-bound topic chat, and embedded plugin composers that
  opt in through the plugin bridge. The host owns microphone permission,
  recording UI, ASR dispatch, privacy policy, correction learning, and
  insertion orchestration.
- The primary entry is the active composer send button. A normal tap keeps the
  existing send behavior. A long press starts recording after a bounded
  threshold, and release finalizes the clip and starts transcription. MVP must
  insert confirmed text into the draft; direct auto-send is not the default
  behavior.
- Plugins must not implement their own Home AI microphone capture or ASR stack
  for the shared voice-input path. A plugin only declares whether the current
  composer is writable and which bounded actions it supports: append, replace,
  insert, and optionally submit.
- Home AI must insert confirmed voice text through host draft APIs for native
  Home AI composers and through an explicit plugin bridge protocol for
  embedded plugin composers. It must not simulate keyboard typing, inspect
  plugin DOM, or call plugin-private JavaScript functions.
- In the iOS native shell path, native voice capture should write directly into
  the existing Home AI Composer draft through a bounded composition session. It
  should not introduce a separate transcript text box as the primary input
  surface. Provisional streaming text may appear in the Composer and must be
  replaced by final text without duplicate insertion.
- Native-shell voice input may show a Composer-adjacent status panel for the
  microphone and lifecycle state. It is not a text input box. It must appear
  immediately when the voice entry is pressed, including before microphone
  permission succeeds, and must show microphone permission, local audio setup,
  recording, ASR, insertion, cancellation, no-speech, and failure states. It is
  dismissed by user interaction with the Composer or Send button, not by
  automatic success/failure timers.
- Raw audio is temporary processing input by default. Successful transcription
  must delete raw audio unless an Owner-configured debug retention policy is
  explicitly enabled. Debug retention must be bounded and must live under
  production data/temp storage, not the source checkout.
- Correction learning must be conservative: store only short replacement pairs
  and bounded metadata, require repeated evidence before automatic application,
  and avoid learning or auto-applying dates, amounts, file paths, URLs, code,
  command flags, account identifiers, or other structured/sensitive spans.
- Each authenticated user may open a voice-learning composer from the chat
  top-more menu. This mode reuses the normal chat composer UI, but Send submits
  text only to the voice phrasebook learning route and must not create a chat
  message, start a Gateway run, or send content to a model. The conversation
  area shows a local learning receipt with extracted keywords, support counts,
  suggest/active status, and thresholds.
- Correction scope must resolve authenticated actor, effective workspace,
  composer surface, optional plugin id, and optional thread id. Global
  correction promotion requires an explicit user action; one plugin's edits or
  one native chat's edits must not silently rewrite all other surfaces.
- A public deployment without a configured local ASR backend must show the
  voice input capability as disabled or unavailable with a bounded diagnostic.
  It must not depend on private Mac paths, hand-copied models, or maintainer
  runtime state.

## Growth Learning

- Evergreen cards are driven by observed ability and weakness evidence, not by a fixed grade-only track.
- Age, school, grade, and curriculum history are initialization signals; subsequent cards should primarily follow demonstrated mastery, repair needs, transfer, and trajectory.
- Ordinary Growth cards should teach before they test. New or weak concepts should default to teaching/practice cards with explanation, example, guided practice, and lightweight understanding feedback.
- Formal mastery checks should use stage assessment evergreen cards that activate by evidence/time conditions or Owner manual activation, not every ordinary card.
- Executor accounts may explicitly start a challenge assessment for their own available capability cluster when cooldown and safety policy allow it.
- A learner report such as "too hard" or "not learned" should create prerequisite-gap evidence and card-generation feedback, not directly count as a formal mastery failure.
- Growth should optimize for sustainable learning habits, not only daily task completion. Missed days, fatigue, or repeated frustration should trigger lighter repair/review paths instead of backlog pressure.
- Coins are secondary reinforcement. The system should also provide visible progress, small creations, choice, and parent-visible evidence.
- V1 Growth reward defaults are configurable but fixed at product level: ordinary teaching/practice/integration cards default to 100 coins; stage assessment cards default to 300 coins.
- Ordinary teaching/practice cards should normally target 10-15 minutes. Stage assessment cards should normally target 25-30 minutes and include more tasks/questions than daily cards.
- New teaching/practice/stage-assessment behavior belongs to the native Hermes Mobile Growth board and native Growth SQLite persistence, not official Kanban compatibility.
- Model-generated Growth cards must follow structured teaching/practice/assessment contracts and validation rules; unsupported high-pressure tasks should not be published just because the model generated them.
- Formal model-generated Growth cards should be graph-guided before publication. Card generation should start from a validated `learningGraphPlan` that declares the target node, prerequisite nodes, card role, evidence requirement, and stage-assessment coverage when applicable.
- Growth knowledge graph data is a planning/evidence layer, not a replacement for card workflow state. Evaluation, reflection, reward settlement, and completion remain owned by the existing Growth workflow services.
- Growth graph schema must support K12 seed packs without being hard-coded to K12. Future domain packs may describe programming, English skill bands, writing, personal workflows, or other Owner-approved learning domains.
- Growth scoring is evidence-based. A score can reach the numeric line while the card is still incomplete if a revision/reflection gate remains.
- AI evaluation must be asynchronous and durable when grading can take time. Restarting listener or Gateway should not lose accepted evaluation work.
- Learning records must be summary-only. Do not expose full child answers, transcripts, questions, answer keys, or prompts in planning records, docs, or handoffs.
- Growth card completion may settle Growth learning coins inside the Growth
  domain, but it must not directly write `通宝` or any real-money-equivalent
  platform ledger.

## Platform Currency

- `通宝` is the Hermes Mobile platform-level base currency for each workspace user.
- Growth learning coins remain a learning-domain reward signal and must not be directly rebranded as platform currency.
- Growth learning coins may be exchanged into `通宝` only through an
  idempotent, audited, administrator-operated exchange service with
  Owner-configurable rules. Ordinary users must not trigger direct exchange.
- Growth-to-`通宝` exchange is a periodic administrative operation, normally
  monthly, based on total eligible Growth coin balance rather than a real-time
  per-card conversion.
- Monthly Growth-to-`通宝` exchange must not recompute eligibility from card
  state. Completed cards have already produced Growth coin settlement records;
  the exchange service reads the Growth coin balance/ledger, credits `通宝`
  through the platform ledger, and records an auditable Growth coin debit or
  clear entry that brings the exchangeable Growth coin balance down by the
  exchanged amount, normally to zero for the period.
- `通宝` wallet and ledger records belong to the platform currency domain, not the Growth SQLite domain and not the Finance plugin.
- Finance may report or summarize `通宝`, but `通宝` must not be mixed with real RMB/bank/card transaction ledgers.
- Platform currency mutations must resolve authenticated actor, target workspace user, source type, source id, and idempotency key before writing a ledger entry.

## Skill Permissions

- Owner can write system/shared Skills.
- Non-Owner shared Skill access should be read-only at the product layer.
- Owner low-permission workers may need write access for Owner-owned Skill work; permission policy must distinguish Owner/non-Owner, not merely low/high Gateway permission.
- Skill UI must hide or disable write actions when `access.canWrite` is false.

## Gateway And ChatGPT Pro

- ChatGPT Pro requests require Owner-maintenance routing and the `chatgpt_pro_generate` tool.
- ChatGPT Pro long runs may take 20-30 minutes. Product timeouts and watchdogs must not terminate them early.
- ChatGPT Pro generated files are temporary artifacts and should default under production data temp, not the source checkout or repo-level `outputs/`.
- Gateway watchdogs may repair genuinely dead workers, but must not replace a busy maintenance worker merely because `/health` is slow during a long tool call.
- When the newest user request explicitly asks to search the web or X, Hermes Mobile should optimize for useful, verifiable information quality over saving a small amount of time or token budget. Search-budget guards still prevent runaway loops, but they must allow several focused query refinements, independent-source comparison, extraction of relevant pages, and evidence-labeled limits before the run stops or asks for approval to continue.

## Automation And Web Push

- Automation list should preserve full-detail user format when foreground data is shown.
- Automation is a background capability, not a permanent primary bottom-tab destination. User-facing automation results should be delivered through Action Inbox when the Inbox domain is active.
- Plugin workspace audit plans are Automation-backed jobs. Their natural
  language creation belongs behind an explicit Automation or audit creation
  surface, not a per-message ordinary chat preflight.
- Manual plugin workspace alignment audit belongs behind an explicit audit
  button and uses a structured route. It must not run through ordinary chat
  preflight or arbitrary natural-language path resolution.
- Web Push notifications should deep-link to the specific resource when an id is available.
- Notification click handling must target top-level app windows, not embedded viewer iframes.

## Action Inbox

- Action Inbox is the primary passive/durable attention surface for manual Todo/reminder items, automation conclusions, Growth/executor card completion, permission requests, approvals, and review items.
- Action Inbox must be backed by Hermes Mobile local persistence and audit events, not official Hermes Kanban.
- The primary bottom navigation direction is `聊天 / 收件箱 / 话题 / 目录 / 成长`; Automation should move to a background/admin surface.
- Manual and scheduled Todo rows must be separated into an Inbox `待办` filter
  tab. Other Inbox tabs must exclude Todo rows so reminders and tasks are not
  mixed with Automation deliveries, plugin notifications, approvals, or Growth
  receipts.
- Todo/reminder is a host-owned Action Inbox item type, not a standalone plugin
  and not a revived official Kanban product surface. The old Todo/Kanban API is
  compatibility only.
- Natural-language Todo creation must use model understanding guided by a
  dedicated Skill and produce a structured draft. Keyword-only parsing is not a
  valid product path for assigning people, dates, title, recurrence, or
  priority. Natural-language Todo interpretation belongs behind explicit Todo
  creation entry points such as the Inbox top-right `新建待办事项` action, not in
  every ordinary chat send. Normal chat must proceed directly to the chat model
  without a Todo-intake preflight.
- The model may only produce a Todo draft. Home AI must validate permissions,
  workspace identity, dates, recurrence, Web Push, audit events, and persistence
  before creating or mutating any Todo/reminder.
- Owner may assign a Todo/reminder to another workspace when access policy
  allows it. The assignee receives the actionable Inbox item and Web Push; when
  the assignee completes it, the creator receives a bounded Inbox completion
  receipt.
- Cross-workspace natural-language assignment must use bounded workspace
  candidates from the Home AI workspace catalog. The model may map a name to an
  `assigneeWorkspaceId` only when it matches a candidate display name or alias;
  otherwise it must ask for confirmation instead of inventing workspace ids.
- One-shot reminders are Action Inbox Todos with a future `availableAt` /
  `remindAt`; periodic or complex recurring tasks are Automation-backed and
  create one Inbox Todo occurrence per trigger.
- Ordinary active chat/topic task receipts should use Web Push to return directly to the relevant route and should not create default Inbox items.
- Plugin workspace audit receipts are Action Inbox `review` or `error`
  projections. The source of truth remains the audit run and its report; Inbox
  stores only bounded summary metadata, severity, status, and safe deep links.
- Action Inbox may expose the first manual plugin workspace alignment audit
  button. The default audit mode is `alignment`, and the user may supply bounded
  guidance, but target resolution remains server-side and registry-based.
- Inbox items are summary/action projections. Source modules remain canonical and full private content must stay in the source detail views.
- Repeated source refreshes, Web Push events, and background polling must dedupe by stable source references instead of creating duplicate items.
- Official Kanban Todo compatibility is retired for ordinary user-created
  Todos after the Action Inbox migration. New manual Todos, reminders, and
  assigned Todos must use the Action Inbox Todo engine. Legacy Kanban/Growth
  learning cards may keep their own card APIs, but the ordinary Todo entry
  points, `/api/todos` compatibility URL, and chat/direct natural-language Todo
  creation path must not create new legacy Todo/Kanban records or create a
  legacy record first and then mirror it into Inbox.

## Static Client

- Any client-visible static change must bump the static/client cache version in `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`, and the relevant test constant.
- Static-only deployment does not require listener or Gateway restart.
