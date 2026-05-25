# Hermes Mobile Documentation Gap Analysis

Last updated: 2026-05-25.

## Covered In The Current Doc Set

- High-level architecture and product requirements.
- Growth learning, mastery profile, async evaluation queue, common Growth incidents.
- Gateway Pool, maintenance workers, ChatGPT Pro bridge, Grok routing, and maintenance watchdog incidents.
- Workspace auth, Skill permissions, directory/file/share surfaces, Web Push, Weixin ingress, group chat, Automation/Cron, static client/cache, deployment, runtime state, and disaster backup.

## Still Worth Adding Later

- Per-route API reference generated from `server-routes/*`, with auth mode and Owner/workspace requirements.
- Frontend state map for each main tab: Chat, Topics, Directory, Growth, Automation.
- Data dictionary for runtime SQLite and learning-growth SQLite tables.
- Gateway profile manifest reference with public-safe example manifests.
- Public release installation guide cross-check against current README.
- A short "how to debug from a screenshot" guide mapping common UI labels to route/service files.
- Test matrix document that maps modules to focused tests and full gates.

## Maintenance Rule

When a module changes, update its module doc first. Add a runbook only when the issue is likely to recur. Add an implementation note only when the code design is non-obvious or spans several files.
