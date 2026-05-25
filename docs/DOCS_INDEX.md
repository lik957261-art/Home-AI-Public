# Hermes Mobile Documentation Index

This index is the first repo document to read after `.agent-context/PROJECT_CONTEXT.md` and `.agent-context/HANDOFF.md` for non-trivial Hermes Mobile work.

## Doc Layers

- `docs/ARCHITECTURE.md` - current system architecture, runtime boundaries, and ownership.
- `docs/PRODUCT_REQUIREMENTS.md` - durable product rules and non-negotiable behavior.
- `docs/MODULES/` - module-level implementation maps, routes, files, state, checks, and constraints.
- `docs/IMPLEMENTATION_NOTES/` - code-level design notes for complex features.
- `docs/RUNBOOKS/` - incident diagnosis and repair procedures.
- `.agent-context/HANDOFF.md` - latest rollout status only.

## Current Priority Modules

- Growth and learning mastery: `docs/MODULES/growth-learning.md`
- Gateway Pool and maintenance workers: `docs/MODULES/gateway-pool.md`
- ChatGPT Pro bridge: `docs/MODULES/chatgpt-pro.md`
- Skill permissions: `docs/MODULES/skill-permissions.md`
- Automation/Cron: `docs/MODULES/automation.md`
- Static client/cache/deploy: `docs/MODULES/static-client.md`, `docs/MODULES/deployment.md`

## Current Priority Runbooks

- Growth card stuck waiting for AI: `docs/RUNBOOKS/growth-card-stuck-waiting-ai.md`
- Maintenance Gateway terminated during ChatGPT Pro: `docs/RUNBOOKS/maintenance-gateway-terminated.md`
- Static client cache/version refresh: `docs/RUNBOOKS/static-client-cache-version.md`

## Documentation Rule

If code or production behavior changes, update the smallest relevant durable doc in the same change:

- product rule -> `PRODUCT_REQUIREMENTS.md`
- module behavior -> `MODULES/<module>.md`
- complex implementation -> `IMPLEMENTATION_NOTES/<feature>.md`
- recurring incident/debug path -> `RUNBOOKS/<incident>.md`
- current rollout status -> `.agent-context/HANDOFF.md`

Do not store secrets, full learner content, raw prompts, push endpoints, long logs, or private generated reports in docs.
