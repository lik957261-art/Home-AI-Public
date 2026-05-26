# Hermes Mobile Documentation Gap Analysis

Last updated: 2026-05-25.

## Covered In The Current Doc Set

- High-level architecture and product requirements.
- Growth learning, mastery profile, async evaluation queue, common Growth incidents.
- Gateway Pool, maintenance workers, ChatGPT Pro bridge, Grok routing, and maintenance watchdog incidents.
- Workspace auth, Skill permissions, directory/file/share surfaces, Web Push, Weixin ingress, group chat, Automation/Cron, static client/cache, deployment, runtime state, and disaster backup.

## Covered In The Second Pass

- Per-route API reference generated from current `server-routes/*` ownership.
- Frontend state map for Chat, Topics, Directory, Growth, Automation, Group Chat, Workspace/Admin, and file preview.
- Runtime SQLite and learning-growth SQLite data dictionary.
- Gateway profile manifest reference with public-safe example fields.
- Public release installation guide cross-check against README and deployment docs.
- Screenshot-to-code debugging map for common UI labels and symptoms.
- Module-to-test matrix for focused checks and full gates.
- Multi-user/multi-task platform module documenting the main product difference
  from personal Agent sessions and upstream Hermes: workspaces, Access Keys,
  access policy, worker/profile selection, task surfaces, Action Inbox, Web
  Push, and resource-scoped services.

## Still Worth Adding Later

- Machine-generated API reference export from `adapters/api-route-inventory` if the route inventory becomes richer than the hand-maintained reference.
- ER diagram rendering for runtime and learning SQLite tables.
- Per-screen frontend screenshots annotated with responsible files after the next stable UI pass.
- Public README mojibake cleanup in a separate public-doc polish change.

## Maintenance Rule

When a module changes, update its module doc first. Add a runbook only when the issue is likely to recur. Add an implementation note only when the code design is non-obvious or spans several files.
