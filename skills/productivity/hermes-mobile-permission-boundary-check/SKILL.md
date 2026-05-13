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
- Search-only public web lookup is **Allowed** when the run has the `search` toolset.
- Scoped HTTP/API requests to the current account/workspace's documented Program APIs are **Allowed** when the run has the `http` toolset. Use `http_request` for authenticated manifest, bundle, validation, or writeback calls whose endpoint, credential, and scope are documented in an allowed workspace file; do not look for `web_request`. Do not use terminal/code for these calls unless those developer toolsets are explicitly allowed.
- Weather lookup for the current account's user-facing request is **Allowed** when the run has the `weather` toolset. Do not request Owner elevation just to check forecast, temperature, rain, wind, air conditions, or weather-dependent planning.
- Browser automation for public pages or explicitly current-account web tasks is **Allowed** when the run has the `browser` toolset. Use only an isolated worker browser/session, and do not operate unrelated logged-in accounts, payments, orders, or privacy commitments.
- File reads and writes inside the current run's allowed roots are **Allowed** when the run has the `file` toolset. Do not request Owner elevation just to read a workspace rule file or write a workspace deliverable/history file inside scope.
- DOCX/Word OpenXML text extraction inside the current run's allowed roots is **Allowed** when the run has the `file` toolset. Use `docx_extract_text` when `read_file` cannot decode a Word document package.
- OCR, document-image extraction, and visual analysis of files inside the current run's allowed roots are **Allowed** when the run has the `vision` toolset. Do not request Owner elevation just to OCR or inspect an in-scope image, PDF, or document.
- Video analysis of public video URLs or files inside the current run's allowed roots is **Allowed** when the run has the `video` toolset.
- Image generation and image editing requested by the current account are **Allowed** when the run has the `image_gen` toolset. Use `image_generate`, `image_edit`, or `image_erase` when those functions are present; input images and outputs must stay inside allowed roots or delivery roots.
- Messaging requested by the current account is **Allowed** when the run has the `messaging` toolset and the recipient/channel is the current conversation, current workspace delivery channel, or an explicitly in-scope recipient. Do not send to unrelated recipients, make payment/order/privacy commitments, or operate another account's channel.
- Text-to-speech requested by the current account is **Allowed** when the run has the `tts` toolset and generated audio stays inside allowed roots or delivery roots.
- The current account/workspace's own documented Program API reads and writes are **Allowed** when the endpoint, credential, and scope are documented in a file inside an allowed root and the operation affects only that same account/workspace. Examples include a wardrobe rule file that grants same-owner `sync:read`, `items:read`, or `history:write`. Do not use terminal/code unless those developer toolsets are explicitly allowed; use the available web/http capability or fail with a normal missing-tool error.
- The current account/workspace's own profile-local Skill read, creation, and update operations are **Allowed** when the run has the `skills` toolset. Keep writes inside the current profile-local Skill store and the current workspace/account scope.
- The current account/workspace's own Kanban/Todo list, card creation, card status changes, block/unblock, and reminder metadata are **Allowed** when the run has the `todo` or `kanban` toolset. This is normal low-permission work and does not require Owner elevation.
- Use Hermes Mobile's Todo/Kanban integration for those operations. Do not run a raw `hermes kanban` CLI command or write directly under `~/.hermes/kanban`, because that can create cards in the wrong local profile/storage namespace.
- The current account/workspace's own Automation/CRON list, job creation, update, pause, resume, and manual run operations are **Allowed** when the run has the `cronjob` toolset. Cross-account automation management still needs Owner elevation.
- Do not read, summarize, search, create, modify, copy, move, or delete files outside the allowed roots.
- Do not search a broad drive such as `C:\`, `/mnt/c`, `/home`, or `/volume1` to compensate for a missing permission root.
- Do not create placeholder files, placeholder Skills, or "future" results when an exact path is outside scope or not found.
- Do not modify shared/system Skills, Owner full Skill stores, another workspace's or another account's Skills, product source code, runtime config, worker profiles, Access Keys, secrets, tokens, or Gateway manifests.
- Do not edit another account's automation, Todo, mail, chat, connector, or integration state unless the access policy explicitly allows that account/scope.
- Do not use a blocked developer toolset indirectly through another tool.

## Missing Or Out-Of-Scope Targets

If the exact target is outside the current permission scope, stop before tool calls and say this clearly in the final response:

- the target is outside the current workspace/Gateway permission scope;
- no changes were made;
- the next safe action is Owner elevation, switching to a workspace that includes the path, or attaching/sharing the allowed directory.

If the exact target is inside the allowed roots but does not exist, report a normal missing-file failure. Do not claim the Skill or file was completed, installed, or will run later.

If the user writes in Chinese, answer this permission result in Chinese.
