# Directory Topic Collections Design

Last updated: 2026-06-08.

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
- The topic root is an entry/index surface, not a message-composer surface.
  Composer input is hidden on the root topic page and on directory-topic draft
  placeholders. Users can reply only after opening a concrete topic detail.
- Directory cards should make the actions explicit:
  - open directory;
  - open default topic;
  - choose a bound topic.
- Directory-topic context must use selected, cleaned, bounded directory
  evidence. It must not bulk-inject the whole directory.
- Directory-topic bindings must resolve through the effective workspace and
  the directory ACL boundary. Owner viewing another workspace must see that
  workspace's directory topics, not Owner's.
- Directory-bound model runs have two identities: the actor workspace and the
  directory target workspace. The actor is used for audit/user origin; the
  target workspace is used for access policy, Gateway worker/profile routing,
  and plugin/MCP data calls. This is deterministic from bound directory/project
  metadata and is not a natural-language selector.

## Durable Data Model

Directory-bound topics must not be reconstructed by scanning the global
single-window message list on every login or topic-root render. Message history
will grow without a practical upper bound, and a root page that depends on
global replay will eventually become slow, incomplete under pagination, or
memory-heavy.

Use a durable directory-topic index as the source of truth for topic discovery.
The raw `threads` and `messages` records remain the canonical chat transcript,
but they are not the list index.

The index can start as a JSON field in the existing thread/state store for
compatibility, then migrate to a SQLite table. The service contract should
already follow the table shape below so the storage backend can change without
rewriting UI or routing code:

```json
{
  "id": "directory-topic:<workspaceId>:<directoryRoute>:<topicId>",
  "workspaceId": "<effective workspace>",
  "directoryRouteKey": "<stable normalized route key>",
  "directoryRoute": "<server-normalized route snapshot>",
  "topicThreadId": "<thread id>",
  "taskGroupId": "directory:<stable id or route hash>:<topic slug>",
  "title": "Planning",
  "purpose": "planning",
  "isDefault": false,
  "sortOrder": 20,
  "lastMessageId": "<latest visible message id>",
  "lastReceiptTitle": "<bounded assistant receipt title>",
  "lastUserPromptTitle": "<bounded user prompt title>",
  "messageCount": 42,
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
- `directoryRouteKey` is computed from effective workspace id, project id,
  subproject id, and normalized route root/path. Display labels are not unique.
- `lastReceiptTitle`, `lastUserPromptTitle`, and `messageCount` are summary
  fields for list rendering only. They are updated incrementally when a
  directory-bound message or receipt changes.
- Discovery index rows are only for user-visible directory topics. Fixed
  conversation groups, plugin task groups such as `plugin:*`, and Kanban/case
  task groups such as `case_*` must stay out of the directory-topic index.

### Storage Evolution

Phase 1 can use `thread.taskGroupMeta[taskGroupId]` as the compatibility index
only when it stores all required fields:

- `ownerWorkspaceId`;
- normalized `directoryRoute`;
- `directoryRouteKey`;
- explicit/manual `title`;
- `createdAt` and `updatedAt`;
- bounded `lastReceiptTitle` / `lastUserPromptTitle`;
- `messageCount`.

Phase 1 must include a bounded backfill/repair job that reads existing message
history once and writes missing index fields. The request path must not redo
that full scan.

Phase 2 should introduce a first-class SQLite table, for example
`directory_topic_bindings`, with the same fields. Writes should be idempotent
upserts keyed by `(workspace_id, directory_route_key, task_group_id)`.

Phase 3 may split summaries into `directory_topic_activity` if receipt
generation, audit, or search needs richer metadata.

## Loading And Pagination Contract

The topic root has two independent loading scopes:

1. Directory collection scope.
2. Topic list scope inside one directory collection.

The root page should load only directory collections and a bounded number of
recent topic rows for each visible/expanded directory. It must not load all
topics or all messages.

Default behavior:

- Load directory collections for the selected workspace, sorted by latest
  directory-topic activity.
- For the first visible directory collections, include at most the most recent
  `N` topics per directory, for example 5 or 10.
- Collapsed directories may include only count, latest summary, and default
  topic metadata.
- Expanding one directory calls a directory-scoped list API to fetch that
  directory's topic page.
- Pulling upward or tapping "load earlier" inside one directory fetches the
  previous topic page for that directory only.
- Opening a concrete topic fetches that topic's message page, for example the
  latest 60 or 300 task messages for that task group only.
- Audit/search can use a separate server-side query path with explicit limits,
  cursors, and timeout/error reporting. It must not reuse the mobile root list
  payload as an audit dataset.

Suggested API shape:

```text
GET /api/directory-topics?workspaceId=<id>&limitDirectories=20&topicsPerDirectory=5
GET /api/directory-topics/:routeKey/topics?cursor=<cursor>&limit=20
GET /api/threads/:threadId?messageMode=tasks&taskGroupId=<id>&messageLimit=300
```

The first route returns directory collections and recent bounded topic
summaries. The second route pages one directory's topics. The third route loads
the concrete conversation messages only after the user opens a topic.

Response projection:

```json
{
  "collections": [{
    "key": "<directoryRouteKey>",
    "workspaceId": "owner",
    "route": {},
    "label": "健康健身",
    "topicCount": 12,
    "hasMoreTopics": true,
    "nextCursor": "<opaque cursor>",
    "defaultTopic": {},
    "topics": [{
      "taskGroupId": "directory:...",
      "title": "睡眠日志分析",
      "lastReceiptTitle": "睡眠趋势与恢复建议",
      "updatedAt": "ISO-8601"
    }]
  }]
}
```

The frontend must treat this projection as an index. It should not infer index
completeness from the currently loaded `thread.messages` page.

## UI Design

Directory is now also exposed as a built-in application plugin in the topic
surface. This is a navigation and discovery model, not a backend rewrite:
Directory still uses the directory module, directory ACLs, and directory-topic
collection rules. The top-level Directory card opens the built-in file manager.
Directory-bound topic collections use a compact folder-tree expression below
that card instead of borrowing the large plugin-card pattern.

Recommended first UI:

- Show one built-in Directory application card in the plugin/application grid;
  its primary action opens the embedded Directory root for the effective
  workspace. The Directory card should stay compact enough that the bound-topic
  tree remains visible on a mobile first viewport.
- Show directory containers as compact collapsible parent rows in the topic
  surface. The folder icon is placed on the left of the header, followed by the
  explicit directory name/path and topic count. Do not place a second directory
  icon on the far right.
- Show bound child topics below the directory header as an indented list. Each
  child topic row opens that topic, and the default marker is inline with the
  row instead of being represented by a separate topic button.
- The directory parent row toggles expand/collapse. Opening the file directory
  remains the responsibility of the top-level Directory card or an explicitly
  labeled directory action, not an ambiguous parent-row click.
- If no default topic exists, the chat action opens a small chooser or offers
  to create the first topic; it should not silently create a generic topic.
- Bound topic rows/chips should show title, purpose, recent activity, and
  default marker when applicable.
- Topic detail management belongs in the top-right three-dot menu. That menu
  must expose rename for the current topic and a localized delete action. Delete
  is never direct: it must show an explicit confirmation before calling the task
  delete API.

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

Plugin/MCP calls are allowed in directory-bound topics when the target
workspace authorizes them. For example, a Health request inside a directory
bound to another workspace should call that workspace's Health MCP/profile when
available; it must not silently fall back to Owner's Health data merely because
Owner initiated the run.

## Service-First Implementation Plan

Add focused services before wiring UI routes:

- `adapters/directory-topic-index-service.js`
  - compute stable directory route keys;
  - upsert directory-topic index rows when directory-bound messages are
    created, renamed, completed, deleted, or migrated;
  - list directory collections with per-directory topic pagination;
  - avoid request-time full-history scans.
- `adapters/directory-topic-binding-service.js`
  - create/list/update/delete directory-topic bindings;
  - enforce one default topic per directory;
  - resolve effective workspace and directory ACL.
- `adapters/directory-topic-context-service.js`
  - select cleaned directory evidence for a topic run;
  - return bounded context refs/previews only.
- `adapters/directory-run-scope-service.js`
  - resolve actor workspace versus directory target workspace for Gateway runs;
  - keep directory-bound plugin/MCP calls on the target workspace.
- `server-routes/directory-topic-api-routes.js`
  - expose collection list, one-directory topic pagination, open/create,
    rename, delete/unbind, and default-selection APIs;
  - delegate business logic to services.
- Frontend:
  - render directory topic collection cards from the directory-topic index
    projection, not from the global task message list;
  - fetch earlier topics only for the expanded directory;
  - fetch a concrete task-group message page only when opening that topic;
  - open directory/default topic/topic chooser through explicit icon actions;
  - preserve mobile navigation and back behavior.

Do not add this policy directly to `server.js` or a large frontend controller
without service/test coverage.

## Migration And Repair

Existing deployments may have directory-bound topics whose route metadata is
stored only on messages. Add a one-shot repair script and an idempotent startup
diagnostic:

- scan existing single-window threads in bounded batches;
- find task groups with message-level `directoryRoute`;
- compute `directoryRouteKey`;
- write missing `taskGroupMeta` / index rows;
- preserve existing manual titles from rename metadata;
- derive bounded `lastReceiptTitle` and `lastUserPromptTitle` from existing
  messages;
- report counts, skipped invalid routes, and unresolved workspace ownership;
- never print raw message bodies in logs.

The repair script is allowed to scan historical messages because it is an
operator/migration job. Normal login, topic-root rendering, and foreground
refresh must not do so.

## Harness Requirements

Classify this as H1 when persistence, workspace isolation, directory ACL,
context assembly, or topic-open routing changes. It is H2 only for
display-only projection.

Required focused coverage:

- one directory can bind multiple topics;
- one directory can have at most one default topic;
- default topic can be changed without deleting other topics;
- directory-topic root list is built from the durable index rather than from
  the current thread message page;
- topic list pagination is scoped to one directory route and does not fetch
  unrelated directory topics;
- opening an old topic loads that task group's message page on demand;
- opening a directory uses directory ACL;
- opening a topic uses the selected topic id, not a stale or unrelated topic;
- Owner viewing a non-Owner workspace resolves the target workspace directory
  and topic bindings;
- Owner-initiated directory-bound Gateway runs use the target workspace for
  policy, Gateway profile routing, and plugin/MCP data access;
- context selector includes only cleaned/selected/bounded files;
- raw secrets, tokens, push endpoints, full learner content, raw mailboxes, raw
  ledgers, private inventories, and long logs are not stored or injected;
- mobile UI can switch back to Chat/Topics/Directory after entering a
  directory-topic detail.

Likely focused checks:

- `node tests\directory-topic-index-service.test.js`
- `node tests\directory-topic-binding-service.test.js`
- `node tests\directory-topic-context-service.test.js`
- `node tests\directory-topic-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\static-cache-version-harness.test.js` when static files change
- `node scripts\privacy-scan.js`
- `git diff --check`

## Implementation Status

2026-06-03 frontend projection v547:

- `public/app-directory-topics-ui.js` renders directory-topic collection cards
  from existing task directory bindings as compact collapsible folder-tree rows.
- The task list now shows plugin topic cards, then directory-topic collection
  rows, then unbound regular topics.
- Static `20260610-plugin-topic-claim-v686` splits raw directory-topic
  collections into plugin-claimed and ordinary collections. A
  `claimed_by_plugin` claim with `hideFromDirectoryTopicRoot=true` removes that
  collection from the ordinary directory-topic root and projects its existing
  topics into the plugin topic switcher. `auxiliary_context` claims do not hide
  the collection. Claims do not move files; the Directory module remains the
  owner of the physical route.
- Directory-topic parent rows toggle expand/collapse. The default projection
  keeps only the first three most recently updated directory collections
  expanded and renders the rest collapsed. Device-local storage records both
  collapsed overrides for those default-expanded rows and expanded overrides
  for older rows, so user intent survives later re-renders without making every
  directory expanded by default. Bound topics render as named compact indented
  entries with a chat icon, short title, and default marker when applicable.
  The Topics-root Directory parent entry above the tree is split by click
  target: the root folder icon opens the Directory application, while the
  title/meta text and row-end chevron expand or collapse the whole
  directory-bound collection area. That root collapsed state is also
  device-local and workspace-scoped.
  The short title uses a
  deterministic frontend fallback from the first user message unless the topic
  has an explicit/manual title.
- Mobile topic-list scrolling uses native vertical pan behavior. Sidebar touch
  guards may block edge/back gestures or over-scroll boundaries, but must not
  `preventDefault()` during normal vertical scrolling inside `.thread-list`.
- Directory-topic aggregation may render after the first topic-list frame, but
  it must not replace the topic-list DOM while a scroll, task-card swipe, or
  sidebar swipe is in progress. Defer that render until the gesture settles so
  directory-bound topic cards remain consistently scrollable on mobile.
- After a directory-topic collection has been aggregated for the current
  thread/group/update signature, later ordinary task-list re-renders should
  keep that ready state instead of briefly removing the directory collection and
  scheduling another two-frame deferred render. This prevents intermittent
  high-frequency flicker where only the directory-bound topic area refreshes
  repeatedly while the underlying groups have not changed.
- Production cleanup of stale directory-bound topics must use
  `DELETE /api/threads/:threadId/tasks/:taskGroupId` or an equivalent
  state-service path. Direct SQLite deletion is insufficient evidence while the
  listener keeps task/thread state in memory, and the UI can continue to render
  stale rows until the product state is updated through the service boundary.
- A directory-bound topic draft creates the actual topic only on the first
  message. That first send must be serialized with a draft-local in-flight
  guard so rapid consecutive click/Enter sends cannot create two separate
  topics for the same pending directory. The draft can be cancelled before the
  first message through the top-left back button or right-swipe; cancelling must
  clear the pending directory, directory filter, reasoning state, and any
  draft-send in-flight flag before restoring the directory route.
- Static v453 moves the primary Directory entry out of the mobile bottom
  navigation and into the topic application grid as a built-in plugin card.
  Existing directory routes and sidebar directory entry remain compatible.
- Static v547 keeps the Directory built-in card compact and fixes top-left
  Directory back from route-root pages that only have `directoryReturnRoute`:
  the button restores the captured source route instead of opening the sidebar.
- Static v634 changes the built-in Directory plugin back path so route-root
  back returns to the Directory root listing before restoring the outer topic
  route, keeps Directory navigation backgrounds stable in dark mode, and adds a
  deterministic directory-run scope for target-workspace Gateway/MCP routing.
- The v446 projection does not add persistence yet. Until the service layer
  stores an explicit default topic, the frontend uses the most recently updated
  topic in the directory as the temporary default.
- Static/client version: `20260603-directory-topic-tree-v547`.
- Static v589 keeps the multi-topic-per-directory product contract while
  simplifying the root entry surface: the root topic page hides the composer
  through the shared composer controller, so tab switches or route restores
  cannot reopen input on the index surface. A directory-topic draft opened from
  a concrete directory is different: it is a topic-detail draft and must show
  the composer immediately, then create the real topic only on first send. The
  composer context bar also omits the model/reasoning chip to reduce
  bottom-chrome density.
- 2026-06-06 Mac production data repair: directory-bound topics created while
  production used Windows/WSL paths can preserve legacy physical drive prefixes
  inside `messages.directory_route_json` and `messages.directory_aliases_json`.
  After migrating files to Mac, run
  `scripts/macos-directory-path-migration-repair.js` and the runbook
  `docs/RUNBOOKS/macos-directory-path-migration-repair.md` before diagnosing the
  topic binding as a permissions or workspace-mixing bug. The repair is a
  metadata path-prefix migration; it does not change the product rule that one
  directory can collect multiple topics.

Remaining service-layer work:

- persist directory-topic bindings and explicit default topic;
- add directory-topic API routes;
- add directory-topic context selection service;
- add H1 service/API/workspace-isolation harness before changing persistence or
  run-context assembly.
