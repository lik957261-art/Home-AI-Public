# Directory Topic Collections Design

Last updated: 2026-06-01.

This document defines how Hermes Mobile should present and manage topics that
are bound to directories. It is intentionally separate from
`docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md`.

## Problem

Directory-bound topics and plugin-bound topics solve related but different
problems.

Plugin topics are application entries. A plugin such as Wardrobe, Finance, or
Email owns a structured data domain, a plugin app, and an MCP/toolset boundary,
so one fixed primary topic per plugin is the clearest default.

Directories are evidence/project containers. The same directory can support
several conversations with different goals:

- planning;
- analysis;
- issue tracking;
- weekly or stage summary;
- report drafting;
- follow-up task extraction.

Forcing one directory into one fixed topic would make that topic too broad and
would mix unrelated context. The directory should instead collect its bound
topics in one visible place.

## Product Contract

- A directory may bind multiple topics.
- A directory may have at most one default primary topic.
- The default primary topic is only the quick-entry topic; it does not prevent
  additional special-purpose topics.
- Directory cards should make the actions explicit:
  - open directory;
  - open default topic;
  - choose a bound topic.
- Directory-topic context must use selected, cleaned, bounded directory
  evidence. It must not bulk-inject the whole directory.
- Directory-topic bindings must resolve through the effective workspace and
  the directory ACL boundary. Owner viewing another workspace must see that
  workspace's directory topics, not Owner's.

## Suggested Data Model

The first implementation can be SQLite-backed or use the existing Hermes
Mobile state store, but the behavior should follow this shape:

```json
{
  "id": "directory-topic:<workspaceId>:<directoryRoute>:<topicId>",
  "workspaceId": "<effective workspace>",
  "directoryRoute": "<server-normalized route>",
  "topicThreadId": "<thread id>",
  "taskGroupId": "directory:<stable id or route hash>:<topic slug>",
  "title": "Planning",
  "purpose": "planning",
  "isDefault": false,
  "sortOrder": 20,
  "contextPolicy": {
    "mode": "cleaned_selected",
    "maxFiles": 8,
    "maxChars": 12000,
    "prefer": ["summary.md", "index.md", "pinned", "recent_reports"]
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Uniqueness rules:

- `(workspaceId, directoryRoute, taskGroupId)` must be unique.
- `(workspaceId, directoryRoute, isDefault=true)` must allow at most one row.
- `directoryRoute` must be a normalized route from the directory boundary
  service, not a raw filesystem path supplied by the client.

## UI Design

Directory is now also exposed as a built-in application plugin in the topic
surface. This is a navigation and discovery model, not a backend rewrite:
Directory still uses the directory module, directory ACLs, and directory-topic
collection rules. Individual directory collection cards can continue borrowing
the large-card/icon pattern from plugin topics, while the top-level Directory
card opens the built-in file manager.

Recommended first UI:

- Show one built-in Directory application card in the plugin/application grid;
  its primary action opens the embedded Directory root for the effective
  workspace.
- Show directory containers as large cards in the topic surface.
- Main visual area opens the directory or expands the directory topic list,
  depending on the existing navigation convention chosen during implementation.
- Use compact icon actions:
  - folder icon: open directory;
  - chat icon: open default topic;
  - list or chevron icon: show bound topics.
- If no default topic exists, the chat action opens a small chooser or offers
  to create the first topic; it should not silently create a generic topic.
- Bound topic rows/chips should show title, purpose, recent activity, and
  default marker when applicable.

The implementation should preserve the current bottom navigation behavior and
must not trap users inside a directory-topic detail page.

## Context Assembly

Directory-topic context should be service-selected:

1. Current user request.
2. Recent messages for the selected directory topic.
3. Directory binding metadata: route label, topic purpose, default marker.
4. Cleaned summaries, selected files, pinned reports, and bounded previews from
   the bound directory.
5. Existing layered topic summaries, working state, and refs.

The selector should prefer:

- `summary.md`, `index.md`, and `.hermes-cleaned/summary.md`;
- user-pinned Markdown/text reports;
- recent final reports with stable ids;
- small text/Markdown files within budget;
- artifact metadata for PDFs/Office docs, not raw binary extraction.

The selector should ignore or summarize:

- raw exports;
- temporary files;
- binary blobs;
- caches;
- logs;
- files over the configured context budget.

## Service-First Implementation Plan

Add focused services before wiring UI routes:

- `adapters/directory-topic-binding-service.js`
  - create/list/update/delete directory-topic bindings;
  - enforce one default topic per directory;
  - resolve effective workspace and directory ACL.
- `adapters/directory-topic-context-service.js`
  - select cleaned directory evidence for a topic run;
  - return bounded context refs/previews only.
- `server-routes/directory-topic-api-routes.js`
  - expose list/open/create/default-selection APIs;
  - delegate business logic to services.
- Frontend:
  - render directory topic collection cards;
  - open directory/default topic/topic chooser through explicit icon actions;
  - preserve mobile navigation and back behavior.

Do not add this policy directly to `server.js` or a large frontend controller
without service/test coverage.

## Harness Requirements

Classify this as H1 when persistence, workspace isolation, directory ACL,
context assembly, or topic-open routing changes. It is H2 only for
display-only projection.

Required focused coverage:

- one directory can bind multiple topics;
- one directory can have at most one default topic;
- default topic can be changed without deleting other topics;
- opening a directory uses directory ACL;
- opening a topic uses the selected topic id, not a stale or unrelated topic;
- Owner viewing a non-Owner workspace resolves the target workspace directory
  and topic bindings;
- context selector includes only cleaned/selected/bounded files;
- raw secrets, tokens, push endpoints, full learner content, raw mailboxes, raw
  ledgers, private inventories, and long logs are not stored or injected;
- mobile UI can switch back to Chat/Topics/Directory after entering a
  directory-topic detail.

Likely focused checks:

- `node tests\directory-topic-binding-service.test.js`
- `node tests\directory-topic-context-service.test.js`
- `node tests\directory-topic-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\static-cache-version-harness.test.js` when static files change
- `node scripts\privacy-scan.js`
- `git diff --check`

## Implementation Status

2026-06-01 frontend projection v446:

- `public/app-directory-topics-ui.js` renders directory-topic collection cards
  from existing task directory bindings.
- The task list now shows plugin topic cards, then directory-topic collection
  cards, then unbound regular topics.
- Directory-topic cards expose icon actions for:
  - default topic;
  - bound directory;
  - secondary topics in the same directory.
- Secondary topics render as named compact entries with a chat icon, short
  title, and default marker when applicable. The short title uses a
  deterministic frontend fallback from the first user message unless the topic
  has an explicit/manual title.
- Mobile topic-list scrolling uses native vertical pan behavior. Sidebar touch
  guards may block edge/back gestures or over-scroll boundaries, but must not
  `preventDefault()` during normal vertical scrolling inside `.thread-list`.
- Directory-topic aggregation may render after the first topic-list frame, but
  it must not replace the topic-list DOM while a scroll, task-card swipe, or
  sidebar swipe is in progress. Defer that render until the gesture settles so
  directory-bound topic cards remain consistently scrollable on mobile.
- Static v453 moves the primary Directory entry out of the mobile bottom
  navigation and into the topic application grid as a built-in plugin card.
  Existing directory routes and sidebar directory entry remain compatible.
- The v446 projection does not add persistence yet. Until the service layer
  stores an explicit default topic, the frontend uses the most recently updated
  topic in the directory as the temporary default.
- Static/client version: `20260601-directory-topic-names-v446`.

Remaining service-layer work:

- persist directory-topic bindings and explicit default topic;
- add directory-topic API routes;
- add directory-topic context selection service;
- add H1 service/API/workspace-isolation harness before changing persistence or
  run-context assembly.
