# Module: Multi-User And Multi-Task Platform

## Responsibility

This module describes the top-level Hermes Mobile product shape: a
multi-user, multi-workspace, multi-task mobile control plane built on top of
official Hermes Gateway workers.

This is the main product difference from a personal Agent session and from the
upstream Hermes runtime:

- A personal Agent session normally has one operator, one active workspace, and
  one conversation/task context.
- Official Hermes Gateway remains the execution kernel for model runs, tools,
  Skills, memory/session behavior, usage/events, and artifacts.
- Hermes Mobile owns the product layer: identities, workspaces, Access Keys,
  access policy, task grouping, queueing, Action Inbox, mobile navigation,
  Web Push, shared/group surfaces, and Gateway worker/profile selection.

## Core Model

Hermes Mobile must resolve these layers before a model run, file operation, or
module mutation is allowed:

1. **Actor identity**
   - Owner Access Key or one workspace Access Key.
   - Request body workspace/principal fields are hints only.
2. **Workspace boundary**
   - Ordinary keys map to one workspace.
   - Owner can manage workspaces, but ordinary Owner chat is still low
     permission unless an explicit maintenance/elevation path is requested.
3. **Resource boundary**
   - Threads, messages, directories, artifacts, Inbox items, automations,
     Growth records, Skills, and group-chat messages must be checked by their
     resource-specific services.
4. **Access policy**
   - Allowed roots, shared roots, toolsets, Skill roots, connector profiles,
     and workspace-specific constraints are computed before Gateway dispatch.
5. **Execution profile**
   - Gateway Pool routing chooses a worker/profile compatible with the current
     workspace, security level, tool needs, and Skill profile.
6. **Task surface**
   - Chat, group chat, task stream, task list, Action Inbox, Growth, and
     Automation each own a different user workflow and source of truth.

## Product Invariants

- Every user-visible operation must have an authenticated actor and an
  effective workspace.
- Ordinary users must not read, write, route through, or receive projections
  from another workspace unless a specific share/group membership allows it.
- Server-side auth clamps or rejects spoofed `workspaceId`, `actorWorkspaceId`,
  `principalId`, `threadId`, `messageId`, or resource ids.
- Gateway workers execute already-authorized runs. They must not be the first
  place where workspace/resource permissions are decided.
- Gateway worker selection must not silently fall back to another user's
  profile when a workspace mapping is missing. Strong-isolation deployments
  should fail closed.
- Owner ordinary chat can use low-permission workers. Owner maintenance,
  ChatGPT Pro, runtime config, worker/profile repair, and secret-path work
  require explicit Owner-maintenance routing.
- Official Kanban is not the primary Hermes Mobile user-participation model.
  Action Inbox is the product surface for lightweight user actions, reminders,
  deliveries, reviews, and follow-ups.
- Task context is scoped by `(threadId, taskGroupId)`. Ordinary Chat,
  group-chat, and independent task groups must not leak context into each
  other.
- Web Push should carry stable route identifiers and open the most specific
  user-action surface, usually Action Inbox when the user's next step is an
  action or delivery review.
- Product summaries and projections must be summary-only where privacy matters;
  raw secrets, push endpoints, raw prompts, long logs, full learner content,
  and credential material must not be copied into docs, tests, UI projections,
  context summaries, or Inbox records.

## Task Surfaces

### Ordinary Chat

- Stable `taskGroupId=chat`.
- Continuous personal/workspace conversation.
- Uses layered chat context and bounded recent history.
- Does not automatically inherit task directory bindings.

### Group Chat

- Stable `taskGroupId=group-chat`.
- Membership controls read/write visibility.
- AI runs use the sending workspace's access policy.
- Artifacts are visible to non-owner members only when attached to visible
  group-chat messages.

### Task Stream

- Unquoted sends create independent stateless task groups.
- Quoted sends continue the selected task group.
- Useful for concurrent independent tasks, but not the main user-action queue.

### Task List

- Aggregates task groups into readable rows/cards.
- Preserves task status, document chips, and task detail navigation.
- Should not absorb ordinary Chat or group-chat internals.

### Action Inbox

- The primary lightweight user-participation queue.
- Receives manual todos, Automation deliveries/errors, Growth next actions,
  review items, and task terminal receipts.
- Stores summary/action projections and audit events; source modules remain
  canonical.

### Automation

- Background/admin capability, not the permanent primary action-reading tab.
- User-facing deliveries and failures should upsert Action Inbox items and
  Web Push routes should prefer the Inbox item when available.

### Growth

- Vertical learning product using workspace/learner-scoped records.
- Owner and executor projections differ.
- Growth next actions may appear in Action Inbox, while full learner records
  stay in Growth services and remain summary-only where projected.

### Family Profile Memory

- Transitional household memory layer before full Reference / Memory Graph
  event semantics.
- Each workspace keeps a personal profile, while Owner can manage the household
  profile because Home AI runs on Owner's personal computer.
- Product permissions do not pretend to defend against Owner's OS-level data
  access. They prevent ordinary members, group surfaces, Web Push, Gateway
  profiles, and API projections from accidentally receiving another
  workspace's private profile data.
- Cross-workspace generated insights default to Owner-only until Owner shares a
  bounded summary.

## Ownership Map

| Concern | Owner |
| --- | --- |
| Identity and Access Keys | `docs/MODULES/workspace-auth-permissions.md` |
| Gateway worker/profile routing | `docs/MODULES/gateway-pool.md` and `docs/GATEWAY_PROFILE_MANIFEST_REFERENCE.md` |
| Chat/task context boundaries | `docs/MODULES/chat-context.md` |
| Family profile memory | `docs/MODULES/family-profile-memory.md` |
| User-action queue | `docs/MODULES/action-inbox.md` |
| Directory/file/share ACLs | `docs/MODULES/directory-files.md` |
| Web Push routes | `docs/MODULES/web-push.md` |
| Group chat membership/artifacts | `docs/MODULES/group-chat.md` |
| Automation background jobs | `docs/MODULES/automation.md` |
| Growth learning workspace/learner records | `docs/MODULES/growth-learning.md` |

## Difference From Upstream Hermes

Hermes Mobile should not patch official Hermes runtime to implement product
policy. Official Hermes remains clean/upgradable and handles agent execution.
Hermes Mobile wraps it with product services:

- workspace catalog and Access Keys;
- request/resource authorization;
- Gateway Pool scheduling and worker selection;
- mobile task/group/chat surfaces;
- Action Inbox;
- Web Push and deep links;
- production deployment, backups, and runtime health;
- family/workspace vertical products such as Growth.

When a behavior is about user identity, sharing, UI state, task grouping,
delivery routing, or product persistence, it belongs in Hermes Mobile services
and docs, not in official Hermes source.

## Common Failure Modes

- A workspace key can see another workspace: inspect auth projection, request
  context, and resource-specific ACLs.
- A run uses another user's worker/profile: inspect Gateway manifest
  `allowedWorkspaceIds`, `skillProfile`, and `skillWorkspaceIds`.
- Owner ordinary chat accidentally uses maintenance tools: inspect Owner
  elevation routing and Gateway worker selection.
- Chat remembers the wrong task: inspect `(threadId, taskGroupId)` context
  assembly and stale reply/directory metadata.
- Completed background work is invisible to the user: inspect Action Inbox
  producers, Web Push route ids, and source dedupe keys.
- Automation or Todo becomes slow/heavy again: verify the user-facing path is
  Inbox, not official Kanban dashboard/state.

## Validation

Focused checks depend on the touched boundary. Common starting set:

- `node tests\auth-provider.test.js`
- `node tests\access-key-api-routes.test.js`
- `node tests\workspace-api-routes.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\conversation-history-service.test.js`
- `node tests\context-assembly-service.test.js`
- `node tests\action-inbox-service.test.js`
- `node tests\action-inbox-api-routes.test.js`
- `node tests\web-push-delivery-service.test.js`
- `node tests\architecture-refactor-boundary.test.js`
