# Home AI Documentation Index

This index is the first repo document to read after `.agent-context/PROJECT_CONTEXT.md` and `.agent-context/HANDOFF.md` for non-trivial Home AI work.

The repository/project name and visible installed-app brand are Home AI. Internal runtime paths, environment variable prefixes, compatibility
routes, and Gateway integration names may still use Hermes/Hermes Mobile
identifiers until a separate infrastructure migration is planned.

## Doc Layers

- `docs/ARCHITECTURE.md` - current system architecture, runtime boundaries, and ownership.
- `docs/PRODUCT_REQUIREMENTS.md` - durable product rules and non-negotiable behavior.
- `docs/MODULES/` - module-level implementation maps, routes, files, state, checks, and constraints.
- `docs/IMPLEMENTATION_NOTES/` - code-level design notes for complex features.
- `docs/RUNBOOKS/` - incident diagnosis and repair procedures.
- `.agent-context/HANDOFF.md` - latest rollout status only.

## Cross-Cutting Reference Docs

- API route/auth reference: `docs/API_ROUTE_REFERENCE.md`
- Architecture-code-test-harness map: `docs/ARCHITECTURE_CODE_TEST_HARNESS_MAP.md`
- Plugin workspace platform contract:
  `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- Plugin mobile UI and visual harness contract:
  `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- Mac development-to-production deployment contract:
  `docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`
- Frontend tab/state map: `docs/FRONTEND_STATE_MAP.md`
- Runtime and learning SQLite data dictionary: `docs/DATA_DICTIONARY.md`
- Gateway Pool manifest reference: `docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md`
- AI Operations Control Plane:
  `docs/MODULES/ai-operations-control-plane.md`,
  `docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md`
- Public install/deploy checklist: `docs/PUBLIC_INSTALLATION_CHECKLIST.md`
- NAS deployment plan: `docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`
- macOS production deployment plan: `docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md`
- NAS first-start deploy harness: `tests/nas-deploy-harness.test.js`
- Screenshot-to-code debug map: `docs/SCREENSHOT_DEBUG_MAP.md`
- Module-to-test matrix: `docs/TEST_MATRIX.md`
- Harness required matrix: `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Harness/context loading discipline: `docs/IMPLEMENTATION_NOTES/harness-context-loading-discipline.md`
- Original layered topic-context design: `docs/TOPIC_CONTEXT_LAYERED_COMPACTION_IMPLEMENTATION.zh-CN.md`

## Current Priority Modules

- Multi-user and multi-task platform: `docs/MODULES/multi-user-task-platform.md`
- Family profile memory: `docs/MODULES/family-profile-memory.md`
- Growth and learning mastery: `docs/MODULES/growth-learning.md`
- Chat context and topic compaction: `docs/MODULES/chat-context.md`
- Gateway Pool and maintenance workers: `docs/MODULES/gateway-pool.md`
- ChatGPT Pro bridge: `docs/MODULES/chatgpt-pro.md`
- Skill permissions: `docs/MODULES/skill-permissions.md`
- Automation/Cron: `docs/MODULES/automation.md`
- Action Inbox / user participation queue: `docs/MODULES/action-inbox.md`
- Embedded app plugin host: `docs/MODULES/plugins.md`
- Plugin-bound application topics: `docs/MODULES/plugin-topics.md`
- Directory-bound topic collections: `docs/MODULES/directory-files.md`,
  `docs/IMPLEMENTATION_NOTES/directory-topic-collections.md`
- Wardrobe MCP tab and embedded plugin host: `docs/MODULES/wardrobe.md`
- Static client/cache/deploy: `docs/MODULES/static-client.md`, `docs/MODULES/deployment.md`
- Workspace auth, keys, and access policy: `docs/MODULES/workspace-auth-permissions.md`
- Workspace onboarding orchestration:
  `docs/IMPLEMENTATION_NOTES/workspace-onboarding.md`
- Directory, files, previews, and shared roots: `docs/MODULES/directory-files.md`
- Web Push delivery and deep links: `docs/MODULES/web-push.md`
- Weixin/iLink ingress and delivery: `docs/MODULES/weixin-ingress.md`
- Grok/xAI Gateway profile routing: `docs/MODULES/grok-gateway.md`
- Runtime state, SQLite, and disaster backup: `docs/MODULES/runtime-state-backup.md`
- AI Operations Control Plane:
  `docs/MODULES/ai-operations-control-plane.md`
- Group chat and shared messages: `docs/MODULES/group-chat.md`

## Current Priority Runbooks

- Growth card stuck waiting for AI: `docs/RUNBOOKS/growth-card-stuck-waiting-ai.md`
- Maintenance Gateway terminated during ChatGPT Pro: `docs/RUNBOOKS/maintenance-gateway-terminated.md`
- Static client cache/version refresh: `docs/RUNBOOKS/static-client-cache-version.md`
- Web Push opens the wrong page or embedded viewer: `docs/RUNBOOKS/web-push-wrong-page.md`
- Growth submit button disabled or local submission is misleading: `docs/RUNBOOKS/growth-submit-button-disabled.md`
- Grok Gateway authentication or routing failure: `docs/RUNBOOKS/grok-gateway-auth.md`
- Production API auth header mismatch: `docs/RUNBOOKS/production-api-auth-header.md`
- Mac production closure validation: `docs/RUNBOOKS/macos-production-closure-validation.md`
- Mac production access and sudo/SSH rules:
  `docs/RUNBOOKS/macos-production-access.md`
- Mac directory path migration repair:
  `docs/RUNBOOKS/macos-directory-path-migration-repair.md`,
  `scripts/macos-bound-directory-preview-smoke.js`,
  `tests/macos-bound-directory-preview-smoke-harness.test.js`
- Mac iOS Simulator Appium QA: `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- Mac plugin delivery-directory production smoke:
  `scripts/macos-plugin-directory-production-smoke.js`,
  `tests/macos-plugin-directory-production-smoke-harness.test.js`
- Mac worker filesystem access: `docs/RUNBOOKS/macos-worker-filesystem-access.md`
- Mac required Skill preload and Gateway toolset gates:
  `docs/RUNBOOKS/macos-required-skill-gateway-toolset-gates.md`
- OpenAI Codex shared auth repair: `docs/RUNBOOKS/openai-codex-shared-auth.md`
- Codex Responses stream output missing: `docs/RUNBOOKS/codex-responses-stream-output-none.md`
- OpenAI Codex MCP callable schema missing: `docs/RUNBOOKS/openai-codex-mcp-schema-missing.md`
- MCP tool upgrade closure: `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- Finance embedded plugin token error: `docs/RUNBOOKS/finance-plugin-token-error.md`
- Disaster recovery backup verification: `docs/RUNBOOKS/disaster-recovery-backup.md`
- Context compaction and chat history debugging: `docs/RUNBOOKS/context-compaction-debug.md`
- Plugin topic composer layout incident: `docs/RUNBOOKS/plugin-topic-composer-layout-incident-20260603.md`

## Current Priority Implementation Notes

- Learning mastery profile: `docs/IMPLEMENTATION_NOTES/learning-mastery-profile.md`
- Growth teaching cards and stage assessment flow: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md`
- Growth teaching card implementation plan: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-implementation.md`
- Growth learning workflow contract and harness: `docs/IMPLEMENTATION_NOTES/growth-learning-workflow-contract-harness.md`
- Growth pluginization plan: `docs/IMPLEMENTATION_NOTES/growth-pluginization-plan.md`
- Growth knowledge graph requirements: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md`
- Growth knowledge graph architecture: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md`
- Growth knowledge graph design: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md`
- Growth knowledge graph implementation plan: `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md`
- Reference and Memory Graph V1: `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- Reference and Memory Graph harness plan:
  `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`
- Family Profile Memory V1:
  `docs/IMPLEMENTATION_NOTES/family-profile-memory-v1.md`
- Memory Graph UI design:
  `docs/IMPLEMENTATION_NOTES/memory-graph-ui-design.md`
- Plugin workspace contract rollout plan:
  `docs/IMPLEMENTATION_NOTES/plugin-workspace-contract-rollout-plan.md`
- Plugin workspace contract rollout status:
  `docs/IMPLEMENTATION_NOTES/plugin-workspace-contract-rollout-status.md`
- Plugin workspace platform contract checker:
  `scripts/plugin-workspace-platform-contract-check.js`,
  `tests/plugin-workspace-platform-contract-check.test.js`
- Tongbao platform currency and Growth coin exchange design: `docs/IMPLEMENTATION_NOTES/tongbao-platform-currency-design.md`
- Gateway elastic worker scheduling: `docs/IMPLEMENTATION_NOTES/gateway-elastic-worker-scheduling.md`
- Gateway profile template materialization: `docs/IMPLEMENTATION_NOTES/gateway-profile-template-materialization.md`
- Gateway profile replica pools:
  `docs/IMPLEMENTATION_NOTES/gateway-profile-replica-pools.md`
- Workspace onboarding orchestration:
  `docs/IMPLEMENTATION_NOTES/workspace-onboarding.md`
- Plugin topic binding: `docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md`
  and `docs/IMPLEMENTATION_NOTES/plugin-topic-directory-claims.md`
- Plugin capability activation and lazy MCP loading:
  `docs/IMPLEMENTATION_NOTES/plugin-capability-activation.md`
- Capability Entry Hub design:
  `docs/IMPLEMENTATION_NOTES/capability-entry-hub.md`
- Embedded plugin UI contract: `docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`
- Embedded surface bottom layout standard: `docs/IMPLEMENTATION_NOTES/embedded-surface-bottom-layout-standard.md`
- Directory topic collections: `docs/IMPLEMENTATION_NOTES/directory-topic-collections.md`
- NAS deployment plan: `docs/IMPLEMENTATION_NOTES/nas-deployment-plan.md`
- macOS production deployment plan: `docs/IMPLEMENTATION_NOTES/macos-production-deployment-plan.md`
- Cross-module harness required matrix: `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- Harness and context loading discipline: `docs/IMPLEMENTATION_NOTES/harness-context-loading-discipline.md`
- Mobile authenticated navigation flow harness:
  `docs/IMPLEMENTATION_NOTES/mobile-authenticated-navigation-flow-harness.md`
- Runtime architecture optimization priorities:
  `docs/IMPLEMENTATION_NOTES/runtime-architecture-optimization-priorities.md`
- AI Operations Control Plane:
  `docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md`
- Service-first refactor backlog:
  `docs/IMPLEMENTATION_NOTES/service-first-refactor-backlog.md`
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
