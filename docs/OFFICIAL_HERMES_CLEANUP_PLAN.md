# Official Hermes Cleanup Plan

Goal: keep official Hermes source clean/upgradable and move reusable product behavior into Hermes Mobile.

## Current Boundary

Hermes Mobile should own:

- Accounts, workspace membership, and Access Keys.
- Workspace ACL projection and display labels.
- Mobile chat/task/group UI state.
- Todo and Automation service adapters.
- Web Push delivery, receipts, and deep links.
- Artifact preview authorization and mobile viewers.
- SQLite product runtime state.
- Gateway Pool scheduling and concurrency.

Official Hermes should own:

- Agent loop semantics.
- Model/tool execution.
- Skills, memory, compression, sessions, usage, and artifacts.
- Native Gateway APIs and event streams.

Hermes Mobile must not call Codex/OpenAI directly for user tasks. User tasks should enter Hermes through official Gateway APIs.

## Migration Steps

1. Inventory every customized Hermes patch and classify it as:
   - upstream-compatible bug fix or missing field,
   - deployment-specific behavior to move into Hermes Mobile,
   - obsolete Weixin-specific behavior to retire,
   - operational script/config that should remain outside source.
2. For each deployment-specific behavior, add or extend a Hermes Mobile adapter/service first.
3. Add focused tests and smoke scripts in Hermes Mobile.
4. Run Hermes Mobile against the customized Gateway and verify behavior is equivalent.
5. Switch one profile to clean official Hermes in a test pool and run the compatibility smoke.
6. Move more profiles only after Todo, Automation, Skill, memory, usage, artifacts, and Web Push behavior are verified.
7. Keep rollback backups for database, state snapshots, launcher files, and customized Hermes source until clean profiles have run stably.

## Retire Candidate Areas

These are candidates to remove from customized Hermes only after equivalent Mobile behavior is live:

- Weixin-specific Todo notice suppression and routing glue.
- Weixin-specific foreground delivery receipt shaping that is now a Mobile Web Push concern.
- Hermes Mobile-specific usage payload compatibility patches, if official Gateway exposes the same fields.
- Product account/workspace policy code that can be expressed through Hermes Mobile access-policy adapters.

## Non-Negotiable Checks

- Existing official Hermes Skill discovery and Skill create/update behavior still works.
- Memory/context compression remains native Hermes behavior.
- Usage ledger fields remain accurate through Gateway responses/events.
- Stop/liveness operations hit the Gateway that owns the run.
- No raw keys, tokens, push endpoints, local paths, or backup archives enter public exports.

## Rollback

Rollback should restore, in order:

1. Hermes Mobile production launcher.
2. Hermes Mobile SQLite database or JSON state snapshot.
3. Customized Hermes Gateway source/profile startup.
4. Worker-pool manifest and API key files.

Backups may contain secrets and private paths; never copy backup directories into a public repository.
