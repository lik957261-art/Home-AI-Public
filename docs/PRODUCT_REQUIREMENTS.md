# Hermes Mobile Product Requirements

This file records durable product rules that implementation must preserve.

## General

- Hermes Mobile is a private family/workspace AI control plane, not a generic public SaaS app.
- Hermes Mobile is a multi-user, multi-workspace, multi-task product layer on top of official Hermes Gateway workers, not a single-user personal Agent session and not a product-policy fork of official Hermes.
- Owner controls production configuration, high-permission operations, workspace keys, Gateway maintenance, and Growth configuration.
- Non-Owner accounts must retain normal workspace tools according to their workspace policy; Growth-specific restrictions must not globally lock a workspace out of chat, directory, Growth execution, Inbox, or configured background capabilities.

## Multi-User And Multi-Task Platform

- Every user-visible operation must resolve an authenticated actor, effective workspace, resource boundary, access policy, and task surface before model/tool execution.
- Workspace Access Keys map ordinary users to one workspace; server-side auth must clamp or reject spoofed workspace/principal/resource fields.
- Gateway worker/profile selection happens after access policy construction and must not silently fall back to another user's profile when a workspace mapping is missing.
- Owner ordinary chat may use low-permission workers; Owner maintenance routes must be explicit and separate.
- Ordinary Chat, group-chat, task-stream groups, task-list items, Action Inbox items, Automation jobs, and Growth records are different task surfaces with different sources of truth.
- Action Inbox is the primary lightweight user-action queue; official Hermes Kanban is legacy/compatibility for Hermes Mobile Todo, not the product's main participation model.
- Product behavior for user identity, sharing, UI state, task grouping, delivery routing, and product persistence belongs in Hermes Mobile services, not official Hermes source patches.

## Chat Context

- Raw chat/task history must remain auditable, but long raw history should not be injected into every model prompt by default.
- The latest user request and current task state must take priority over compacted summaries.
- Topic context compaction is scoped by `(threadId, taskGroupId)` and must not mix ordinary Chat, group chat, and unrelated task groups.
- Compacted context must keep source references or stable ids so conclusions can be traced when needed.
- Summary/state/debug metadata must not store raw secrets, push endpoints, raw prompts, full model responses, full learner answers, full transcripts, full questions, answer keys, long tool logs, or private generated reports.
- Layered context assembly must keep a rollback path to legacy bounded recent-window behavior.

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
- Rewards are settled only through the reward settlement service and coin service. Evaluation services must not write coin ledger rows directly.

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
- Web Push notifications should deep-link to the specific resource when an id is available.
- Notification click handling must target top-level app windows, not embedded viewer iframes.

## Action Inbox

- Action Inbox is the primary passive/durable attention surface for manual Todo/reminder items, automation conclusions, Growth/executor card completion, permission requests, approvals, and review items.
- Action Inbox must be backed by Hermes Mobile local persistence and audit events, not official Hermes Kanban.
- The primary bottom navigation direction is `聊天 / 收件箱 / 话题 / 目录 / 成长`; Automation should move to a background/admin surface.
- Ordinary active chat/topic task receipts should use Web Push to return directly to the relevant route and should not create default Inbox items.
- Inbox items are summary/action projections. Source modules remain canonical and full private content must stay in the source detail views.
- Repeated source refreshes, Web Push events, and background polling must dedupe by stable source references instead of creating duplicate items.
- Official Kanban Todo compatibility is legacy after the Action Inbox migration; preserve or migrate the current `Everything's amazing` reading task before destructive cleanup.

## Static Client

- Any client-visible static change must bump the static/client cache version in `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`, and the relevant test constant.
- Static-only deployment does not require listener or Gateway restart.
