---
name: hermes-mobile-permission-boundary-check
description: Pre-flight permission check for Hermes Mobile low-permission Gateway runs. Use before filesystem, Skill, automation, account, integration, or delivery-path operations to decide whether the current run has permission, should ask for Owner elevation, or must fail closed.
---

# Hermes Mobile Permission Boundary Check

This Skill is mandatory for Hermes Mobile restricted or low-permission Gateway runs before using tools or changing state.

## Authority

The current run's permissions come from `access_policy_context` and the toolsets available to this Gateway profile. Do not infer extra permission from the user's account label, prior memory, operating-system visibility, or paths mentioned in chat.

Use these fields as the boundary:

- `access_mode`: if it is not `unrestricted`, treat the run as restricted.
- `default_workspace`, `allowed_roots`, `delivery_roots`, `sync_root`, `download_root`, and `cache_roots`: the file roots this run may read or write, subject to the requested operation.
- `allowed_toolsets` and `blocked_toolsets`: the tool families this run may use.
- `allowed_skills` and `blocked_skills`: Skill scope limits if present.
- `principal_id` and workspace/account metadata: the identity whose data this run may act on.

## Required Pre-Flight Decision

Before any tool call, broad search, file write, Skill write, automation edit, account edit, or external integration action, decide one of these:

1. **Allowed**: the requested target is inside the current run's allowed roots/toolsets/account scope.
2. **Needs elevation**: the user is asking for work outside the current run's roots/toolsets/account scope, but it could be valid with Owner approval.
3. **Must fail closed**: the request asks for secrets, unrelated private data, product source/runtime modification, worker manifests, raw keys/tokens, or anything not appropriate for a model run.
4. **Clarify**: the target path, account, workspace, Skill namespace, or desired write is ambiguous.

## Owner Approval Marker

If and only if the decision is **Needs elevation**, start the final response with exactly this machine-readable marker on its own first line:

```text
HERMES_PERMISSION_APPROVAL_REQUIRED {"scope":"owner_high_privilege","reason":"short reason"}
```

Then explain briefly that the request is outside the current workspace/Gateway permission scope and no changes were made.

Do not emit this marker for **Must fail closed**, clarification questions, or a normal missing-file failure inside the allowed roots.

## Restricted-Run Rules

In a restricted run:

- Public Web Search and public web extraction are **Allowed** when the run has the `web` toolset. Do not request Owner elevation just to search or extract public web information.
- The current account/workspace's own Kanban/Todo list, card creation, card status changes, block/unblock, and reminder metadata are **Allowed** when the run has the `todo` or `kanban` toolset. This is normal low-permission work and does not require Owner elevation.
- Use Hermes Mobile's Todo/Kanban integration for those operations. Do not run a raw `hermes kanban` CLI command or write directly under `~/.hermes/kanban`, because that can create cards in the wrong local profile/storage namespace.
- Do not read, summarize, search, create, modify, copy, move, or delete files outside the allowed roots.
- Do not search a broad drive such as `C:\`, `/mnt/c`, `/home`, or `/volume1` to compensate for a missing permission root.
- Do not create placeholder files, placeholder Skills, or "future" results when an exact path is outside scope or not found.
- Do not modify shared/system Skills, another workspace's Skills, product source code, runtime config, worker profiles, Access Keys, secrets, tokens, or Gateway manifests.
- Do not edit another account's automation, Todo, mail, chat, connector, or integration state unless the access policy explicitly allows that account/scope.
- Do not use a blocked developer toolset indirectly through another tool.

## Missing Or Out-Of-Scope Targets

If the exact target is outside the current permission scope, stop before tool calls and say this clearly in the final response:

- the target is outside the current workspace/Gateway permission scope;
- no changes were made;
- the next safe action is Owner elevation, switching to a workspace that includes the path, or attaching/sharing the allowed directory.

If the exact target is inside the allowed roots but does not exist, report a normal missing-file failure. Do not claim the Skill or file was completed, installed, or will run later.

If the user writes in Chinese, answer this permission result in Chinese.
