# Hermes Mobile Documentation Index

This index is the first repo document to read after `.agent-context/PROJECT_CONTEXT.md` and `.agent-context/HANDOFF.md` for non-trivial Hermes Mobile work.

## Doc Layers

- `docs/ARCHITECTURE.md` - current system architecture, runtime boundaries, and ownership.
- `docs/PRODUCT_REQUIREMENTS.md` - durable product rules and non-negotiable behavior.
- `docs/MODULES/` - module-level implementation maps, routes, files, state, checks, and constraints.
- `docs/IMPLEMENTATION_NOTES/` - code-level design notes for complex features.
- `docs/RUNBOOKS/` - incident diagnosis and repair procedures.
- `.agent-context/HANDOFF.md` - latest rollout status only.

## Cross-Cutting Reference Docs

- API route/auth reference: `docs/API_ROUTE_REFERENCE.md`
- Frontend tab/state map: `docs/FRONTEND_STATE_MAP.md`
- Runtime and learning SQLite data dictionary: `docs/DATA_DICTIONARY.md`
- Gateway Pool manifest reference: `docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md`
- Public install/deploy checklist: `docs/PUBLIC_INSTALLATION_CHECKLIST.md`
- Screenshot-to-code debug map: `docs/SCREENSHOT_DEBUG_MAP.md`
- Module-to-test matrix: `docs/TEST_MATRIX.md`
- Harness required matrix: `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Original layered topic-context design: `docs/TOPIC_CONTEXT_LAYERED_COMPACTION_IMPLEMENTATION.zh-CN.md`

## Current Priority Modules

- Multi-user and multi-task platform: `docs/MODULES/multi-user-task-platform.md`
- Growth and learning mastery: `docs/MODULES/growth-learning.md`
- Chat context and topic compaction: `docs/MODULES/chat-context.md`
- Gateway Pool and maintenance workers: `docs/MODULES/gateway-pool.md`
- ChatGPT Pro bridge: `docs/MODULES/chatgpt-pro.md`
- Skill permissions: `docs/MODULES/skill-permissions.md`
- Automation/Cron: `docs/MODULES/automation.md`
- Action Inbox / user participation queue: `docs/MODULES/action-inbox.md`
- Static client/cache/deploy: `docs/MODULES/static-client.md`, `docs/MODULES/deployment.md`
- Workspace auth, keys, and access policy: `docs/MODULES/workspace-auth-permissions.md`
- Directory, files, previews, and shared roots: `docs/MODULES/directory-files.md`
- Web Push delivery and deep links: `docs/MODULES/web-push.md`
- Weixin/iLink ingress and delivery: `docs/MODULES/weixin-ingress.md`
- Grok/xAI Gateway profile routing: `docs/MODULES/grok-gateway.md`
- Runtime state, SQLite, and disaster backup: `docs/MODULES/runtime-state-backup.md`
- Group chat and shared messages: `docs/MODULES/group-chat.md`

## Current Priority Runbooks

- Growth card stuck waiting for AI: `docs/RUNBOOKS/growth-card-stuck-waiting-ai.md`
- Maintenance Gateway terminated during ChatGPT Pro: `docs/RUNBOOKS/maintenance-gateway-terminated.md`
- Static client cache/version refresh: `docs/RUNBOOKS/static-client-cache-version.md`
- Web Push opens the wrong page or embedded viewer: `docs/RUNBOOKS/web-push-wrong-page.md`
- Growth submit button disabled or local submission is misleading: `docs/RUNBOOKS/growth-submit-button-disabled.md`
- Grok Gateway authentication or routing failure: `docs/RUNBOOKS/grok-gateway-auth.md`
- Codex Responses stream output missing: `docs/RUNBOOKS/codex-responses-stream-output-none.md`
- Disaster recovery backup verification: `docs/RUNBOOKS/disaster-recovery-backup.md`
- Context compaction and chat history debugging: `docs/RUNBOOKS/context-compaction-debug.md`

## Current Priority Implementation Notes

- Learning mastery profile: `docs/IMPLEMENTATION_NOTES/learning-mastery-profile.md`
- Growth teaching cards and stage assessment flow: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md`
- Growth teaching card implementation plan: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-implementation.md`
- Growth learning workflow contract and harness: `docs/IMPLEMENTATION_NOTES/growth-learning-workflow-contract-harness.md`
- Growth knowledge graph requirements: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md`
- Growth knowledge graph architecture: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md`
- Growth knowledge graph design: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md`
- Growth knowledge graph implementation plan: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md`
- Cross-module harness required matrix: `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Async Growth evaluation queue: `docs/IMPLEMENTATION_NOTES/async-growth-evaluation-queue.md`
- Maintenance Gateway watchdog: `docs/IMPLEMENTATION_NOTES/maintenance-gateway-watchdog.md`
- Skill write protection: `docs/IMPLEMENTATION_NOTES/skill-write-protection.md`
- Web Push deep-link routing: `docs/IMPLEMENTATION_NOTES/web-push-deeplink-routing.md`
- Action Inbox implementation plan: `docs/IMPLEMENTATION_NOTES/action-inbox.md`
- Topic context layered compaction implementation: `docs/IMPLEMENTATION_NOTES/topic-context-layered-compaction.md`

## Documentation Rule

If code or production behavior changes, update the smallest relevant durable doc in the same change:

- product rule -> `PRODUCT_REQUIREMENTS.md`
- module behavior -> `MODULES/<module>.md`
- complex implementation -> `IMPLEMENTATION_NOTES/<feature>.md`
- recurring incident/debug path -> `RUNBOOKS/<incident>.md`
- current rollout status -> `.agent-context/HANDOFF.md`

Do not store secrets, full learner content, raw prompts, push endpoints, long logs, or private generated reports in docs.
