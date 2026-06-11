# Module: Plugin Topics

Last updated: 2026-06-11.

## Responsibility

Plugin Topics own the Hermes Mobile surface that binds a structured plugin or
built-in application module to a topic/chat context. They connect four existing
boundaries:

- embedded plugin host and manifest/launch authorization;
- Gateway MCP/toolset routing;
- topic context assembly;
- workspace plugin file directories and cleaned files.

They do not own plugin business logic, plugin databases, plugin UI internals,
or raw plugin credentials.

## Product Contract

- A plugin topic is workspace-scoped.
- Built-in plugin cards may be shown in the same topic application grid as
  external plugins. Directory is the current built-in plugin card.
- Built-in plugin cards keep their original module boundaries. Directory uses
  directory ACL and directory services, not embedded plugin launch or MCP
  provisioning.
- A visible plugin topic requires the same effective-workspace plugin
  authorization and provisioning as the plugin app itself.
- The topic card may open the plugin app, the bound topic chat, or the
  workspace plugin file directory.
- The bound topic chat action enters the fixed `plugin:<pluginId>` topic before
  refreshing the plugin file directory. Directory creation is supporting
  context work and must not block topic entry.
- Plugin topic detail is a secondary page. It must hide the bottom app
  navigation and use the standard top back/right-swipe route to return, while
  keeping the normal message composer visible for the topic chat.
- Plugin topic detail is a Hermes-owned chat surface, not a plugin iframe
  layout surface. It must match the ordinary Hermes chat composer layout; the
  only bottom difference is replacing the normal host mobile navigation
  with the three-entry plugin-context navigation. Composer/footer overlap must
  be solved by the shared bottom-layout standard, not by adding visible padding
  to the outer app or main shell.
- Returning from topic detail to the topic list must restore the topic-list
  scroll position captured before entering the detail. Right-swipe/back should
  not jump away from the plugin and Directory card area.
- Host primary navigation starts with host-level surfaces:
  `聊天`, `信息`, and `话题`. The standalone `能力` bottom tab is retired.
  Growth, Codex plugin edition, Wardrobe, Finance, Email, Health, Note, and
  Directory app launch are plugin/Dock entries by default. The bottom
  navigation may expose up to six visible tabs total: the three host tabs plus
  workspace-scoped user-pinned plugin tabs.
- When there is no saved launch view, Hermes Mobile opens the topic page first.
  Plugin app launch is provided by the global plugin Dock/drawer unless the
  user has pinned that plugin into one of the available bottom-tab slots.
- Pinned plugin bottom tabs and manual Dock/drawer ordering are server-backed
  workspace preferences stored through `/api/plugin-topic-usage` as
  `preferences.pinnedBottomTabs` and `preferences.pluginOrder`.
  `hermesPinnedPluginBottomTabs:<workspaceId>` and
  `hermesPluginTopicOrder:<workspaceId>` are only first-paint/offline caches
  and one-time migration sources when the server has no preference timestamp
  yet. When the server returns a preference timestamp, the server value is
  authoritative even when either list is empty.
- A plugin pinned into a bottom-tab slot must not also render its app icon in
  the global plugin Dock/drawer. It remains available through the pinned bottom
  tab, and the user can long-press or context-click that bottom tab to remove
  the pin and return the plugin to the drawer.
- The current frontend projection renders Growth, Codex plugin edition,
  Wardrobe, Finance, Email, Health, Note, and the built-in Directory app in a
  host-owned global plugin Dock anchored directly above the mobile bottom
  navigation when they are visible in the effective workspace. The Dock has a
  collapsed handle by default and expands in place from that handle; it is not
  a separate floating drawer and does not create new plugin grants.
- The global plugin Dock is available on eligible host root surfaces and
  top-level plugin App surfaces. It must not compete with composer,
  secondary-page back gestures, plugin iframe footers, keyboard state, or the
  sidebar. It is hidden in topic/detail secondary pages,
  non-top-level plugin-context pages, keyboard-viewport mode, and back-swipe
  settle states. Codex plugin edition is Owner-only, but its app-icon drawer,
  reorder, and optional pinned bottom-tab affordances follow the same host
  rules as other external plugins.
- The Dock remains single-row. Its first visible card is `常用`, a compact menu
  of up to six usage-ranked plugin quick actions. The remaining cards are
  app/plugin launch entries. When one to six entries are visible,
  the row divides the available width evenly across those entries; when more
  than six entries are visible, the row keeps six-slot sizing and scrolls
  horizontally.
- The collapsed handle uses a bounded vertical gesture: short vertical
  mistouches and horizontal swipes must not expand the Dock, an upward swipe on
  the handle expands it, and a downward swipe on the handle collapses it. The
  bottom navigation must not move during the gesture.
- Dock and pinned bottom-tab reordering are explicit menu actions. A normal
  horizontal swipe must scroll the Dock or leave bottom navigation alone. The
  daily long-press/context gesture opens the action menu; selecting `换位`
  enters a bounded drag-reorder mode, and drag sorting is disabled outside that
  mode.
- Dock move controls must be local to the plugin launcher surface. Tapping
  `前移` or `后移` persists the manual order, closes the action menu, cancels any
  active drag/Dock gesture state, refreshes only the Dock/sidebar plugin
  launcher projections, and preserves the current Dock expanded/collapsed
  state. It must not call the full topic-thread renderer because rebuilding the
  Topics page during the menu click can leave the Dock/menu in a stuck
  intermediate state.
- The Dock action menu must be bound to the touch long-press path as well as
  pointer/context interactions. The frontend CSS must suppress WebKit native
  touch callout on Dock icons so iOS/PWA long-press can reach the Home AI menu.
- On mobile, the expanded Dock keeps a left/right edge inset large enough to
  avoid competing with side gestures. The current minimum edge inset is 24px
  before safe-area expansion.
- Dock plugin entries are app launch targets on tap. A tap records app-level
  usage. Long-press/context menus expose plugin-declared actions, Dock order
  controls, and bottom-tab pin/unpin controls. They do not expose permanent
  topic or file-directory mini actions in the topic list. Plugin- and
  Directory-specific secondary surfaces remain reachable from the `常用` quick
  card, long-press/context menus, and plugin context/navigation rules instead
  of as small buttons beside the app icon.
- Quick-action usage ordering is not a volatile client-only preference. The
  authoritative usage signal lives in `/api/plugin-topic-usage` and is
  persisted per workspace as bounded `plugins` and `actions` count/recency
  maps. `localStorage.hermesPluginTopicUsage` is only a first-paint/offline
  cache and may be rebuilt from the server after login, client reset, PWA
  reinstall, or device switch.
- Usage writes must update visible Dock/quick-action projections immediately
  before waiting for server sync. A long-lived PWA session must also re-check
  server usage after a short loaded TTL instead of treating the first
  successful `/api/plugin-topic-usage` load as permanently fresh. Repeated
  clicks on the same action, such as `wardrobe:style`, must increment that
  action's workspace usage and promote it by count/recency in the quick-action
  menu.
- The Dock `常用` quick-action menu is capped at six entries. Used actions are
  sorted by count and recency; default actions fill the remaining cells. When
  there is no usage history, default ordering should prefer the first
  high-value action from each plugin before filling secondary actions, so one
  plugin cannot monopolize the first-run menu.
- The Dock `常用` menu and each plugin long-press/context popup use the same
  normalized action projection. When the current workspace's plugin manifest
  has loaded and exposes `actions`, those manifest actions are authoritative
  for menu rendering and launch routing. Host static actions are only a
  first-paint fallback while the manifest is unavailable or still loading.
  Opening the Dock starts a bounded manifest refresh for action projection, and
  selecting an action still follows the same host rule: validate the plugin,
  record `pluginId:actionId` usage, open the plugin app, and pass
  `pluginActionId` plus `pluginRoute`.
- Topic-root plugin conversation rows and directory-bound topic rows must honor the
  shared Home AI font-size preference instead of hard-coding a smaller local
  text size. Topics and the information/root surface should stay visually
  aligned with the user's selected reading scale.
- Plugin conversation shortcuts on the Topics root use the same row/list
  language as directory-bound topic collections. They are fixed conversation
  entries such as `健康话题` or `成长话题`, not large app-icon cards. Large
  app icons are reserved for the global plugin Dock/drawer and capability app
  launch surfaces.
- Codex plugin edition is a special developer/tooling plugin. It remains
  available from the plugin Dock/drawer and app launch surfaces, but it must
  not appear as a normal Topics-root plugin conversation shortcut.
- Topics root plugin conversation shortcuts render as compact fixed root-topic
  groups. They are collapsed by default per workspace. The left plugin icon
  opens the default plugin topic; the row body expands or collapses the plugin
  topic group when there are historical/special child topics or recent default
  topic messages; expandable plugin rows use a small row-end chevron instead
  of a left-leading tree chevron. Plugins with only an empty default topic open
  directly and show `暂无最近内容` instead of a fake `默认话题` child. Expanded
  child topics use the same compact indented visual language as
  directory-bound topic rows, with recent default-topic messages rendered as
  short preview entries that open the default plugin topic.
- The compact plugin topic group row is a root-level entry like the Directory
  root entry: 32px plugin icon column, title/meta text column, optional row-end
  chevron, and a 48px row height. The left edge is reserved for root icons, not
  tree expanders. Directory-bound parent rows below the Directory root entry are
  the tree-level rows and use only the left chevron plus title/meta text.
- Plugin topic rows and directory-bound topic rows render their count/update
  metadata inline after the title, not as a second line, so the Topics root
  stays dense and scan-friendly.
- The earlier Capability Entry Hub described in
  `docs/IMPLEMENTATION_NOTES/capability-entry-hub.md` is superseded. Topics
  root is conversation first: plugin conversation shortcuts, ordinary
  directory-bound topic collections, and ordinary topic cards. Quick actions
  are plugin-declared app routes shown from the Dock `常用` card, plugin
  long-press/context menus, search, or future launcher surfaces. They are not
  MCP calls and should not reimplement plugin business workflows in the host.
  The host validates workspace authorization, records `pluginId:actionId`
  usage, opens the plugin iframe, and passes `pluginActionId` plus
  `pluginRoute`; the plugin owns the final in-app screen.
- The global plugin Dock is positioned directly above the real mobile bottom
  navigation height. It must not use the broader page-content reserved height,
  because that value can include scroll/composer spacing after returning from a
  plugin topic chat and would leave a visible blank band above the normal
  bottom navigation. Runtime measurement must reserve only the collapsed handle
  height while collapsed and the full Dock height while expanded.
- Opening an external plugin from the Dock directly enters the plugin app. The
  plugin app keeps the Hermes top navigation button visible and replaces the
  normal mobile bottom tabs with a three-item plugin-context bar:
  `话题` opens the fixed plugin topic, `插件` stays on the plugin app, and `目录`
  opens the plugin file directory.
- In plugin-context navigation, right-swipe or browser-back from any of the
  three context tabs exits the plugin context and returns to the ordinary topic
  list root (`viewMode=tasks`, empty `currentTaskGroupId`). The exit path must
  clear `pluginContextNavPluginId`, hide active plugin iframes, close plugin
  Dock/menu chrome, and restore the normal bottom navigation. It must not leave
  the topic list in a mixed plugin-context bottom-tab state.
- The plugin-context exit path is a dedicated state transition, not the normal
  task-detail return route. It must render the ordinary topic root directly
  from the remembered task-list thread and must not call `openTaskList()`,
  `restoreTaskListThreadFromCache()`, or `loadSingleWindow()`. Those generic
  paths can legally reload a shared topic thread and can produce the empty
  `Select or create a thread` chat page after a plugin right-swipe.
- Plugin iframe inner back, plugin iframe outer return, plugin topic chat back,
  and plugin directory back must not compete. While `pluginContextNavPluginId`
  is set, right-swipe/browser-back resolves first to plugin-context home. After
  that transition, ordinary five-tab navigation and topic-root scroll state are
  restored; the three-item plugin-context bar is removed.
- Restored route snapshots for plugin apps, plugin topics, and plugin
  directories must also restore `pluginContextNavPluginId`. A restored plugin
  secondary route should initialize plugin `canGoBack` so the first
  right-swipe/back action is offered to the plugin before host-level exit. If a
  cold app restart has no in-memory `taskListThread` when exiting plugin
  context, the dedicated plugin-context exit path should fetch the topic root
  thread directly and render it; it must not leave the generic empty
  `Select or create a thread` page as the final state.
- The current frontend projection renders Directory as a built-in Dock app for
  every authenticated workspace, keeps it in the fixed bottom Dock, and hides
  the separate mobile bottom Directory tab.
- The Directory Dock icon opens the Directory application on tap. Its
  long-press/context menu exposes Directory quick actions such as recent
  directories, file topics, and new topic. Directory-bound topics remain in the
  scrollable page body, not as mini buttons attached to the icon.
- The Topics root also keeps a compact Directory root entry directly above the
  directory-bound topic collections. This entry uses a larger root-folder icon
  with a distinct root color and shows the current visible directory-bound
  subdirectory count plus topic count inline after the title. Only the root
  icon opens the Directory application. The title/meta text and row-end
  chevron expand or collapse the directory-bound topic collection tree below,
  with device-local workspace-scoped persistence.
  It exists so starting or finding a directory-bound topic remains discoverable
  near the Topics surface even though the Directory app also lives in the
  plugin Dock/drawer.
- Directory-bound topic collections are visually attached below the Directory
  root entry and must exclude fixed plugin topics such as
  `plugin:wardrobe`,
  `plugin:finance`, `plugin:email`, and `plugin:health`.
- Directory-bound topic collections render as compact collapsible folder-tree
  rows followed by an indented child-topic list. Directory-bound parent rows do
  not repeat the folder icon; the Directory root entry above the tree already
  establishes the directory context, and repeating non-clickable folder icons
  makes the list visually dense and misleading. Parent rows use only the
  expand/collapse chevron plus title/metadata text. The row shows the directory
  display name, topic count, and update time only; it must not expose the raw
  directory path, a generic "bound directory" prompt, or a visible default-topic
  badge. Child topic rows are visually indented below the directory header so
  the parent directory relationship is clear. The directory parent row toggles
  expand/collapse; opening the file manager must remain the explicit Directory
  root entry or another directory action, not an ambiguous parent-row click.
- The root topic list itself hides both the normal page header and the bottom
  message composer. New topic creation must enter through a Directory binding or
  another explicit binding flow, so every new topic has a durable context
  anchor.
- When the root quick-action grid has no usage-backed entries and therefore
  does not render, the first Directory-bound topic block must still receive a
  mobile safe-area top gap. The hidden page header must not cause the first
  folder/topic row to sit under the iOS status area.
- The Directory Dock icon uses the Dock-consistent plugin-app folder visual.
  The Topics-root Directory root entry uses a larger distinct root-folder icon.
  Directory-bound parent rows below it do not repeat folder icons; child topic
  rows keep the smaller chat/topic icon so the Directory app, directory
  collections, and bound topics remain visually distinct.
- Runs started in the plugin topic should include the plugin MCP/toolset only
  when the selected workspace has an active plugin binding and matching Gateway
  callable schema.
- Plugin topic context is not an authorization source. The effective workspace
  policy must already authorize the plugin's primary MCP/toolset before the
  fixed topic can inject required companion toolsets or required plugin Skills.
  A fixed `plugin:<id>` topic must not self-authorize a missing plugin MCP just
  because the route or delivery directory names that plugin.
- Fixed plugin task groups such as `plugin:wardrobe`, `plugin:finance`,
  `plugin:email`, and `plugin:health` must not enter the ordinary
  directory-bound topic attachment path. Even when a plugin-topic message
  carries a delivery `directoryRoute`, Gateway run context must treat
  `taskDirectory` as absent for normal plugin work.
- Plugin-topic run context is plugin-first: configured plugin MCP/toolsets and
  exact plugin Skill paths are mandatory run context. Wardrobe is currently
  configured as `wardrobe`, `vision`, `file`, and `skills` with required Skill
  `productivity/wardrobe-style-operations`.
- Plugin-topic run context is not all-plugin eager context. The current plugin's
  required MCP/toolset and Skill rules are loaded eagerly, while other
  authorized plugins are represented by the compact capability catalog until the
  run needs cross-plugin access.
- Cross-plugin access from a plugin topic must use server-validated lazy
  activation. For example, a Wardrobe topic may activate Finance or Note when
  the newest request needs spending or note evidence, but those optional plugin
  schemas should not be injected into every Wardrobe run by default.
- Optional cross-plugin activation failure is scoped to that optional plugin:
  the catalog entry becomes `unavailable` and runtime emits a bounded
  `plugin_capability_unavailable` event, while the current plugin topic's
  required MCP/Skill bundle remains active.
- Fixed plugin topics preload required Skill content server-side during Gateway
  run assembly. The model should not have to decide to call `skill_view` before
  seeing the required plugin rules. If a required Skill cannot be read from the
  selected workspace Skill Store, the run context must expose a missing-Skill
  diagnostic instead of silently falling back to generic chat behavior.
- A standard plugin file directory is created for user-facing outputs and
  cleaned summaries. The current frontend path is `插件/<plugin title>` under the
  effective workspace directory.
- Directory files are supporting context; structured plugin MCP remains the
  primary source for live domain data. They must not trigger
  `productivity/directory-context-cleaning` for routine plugin-topic runs unless
  the newest user request explicitly asks to clean or analyze files inside the
  delivery directory. Files written into that directory, including pending
  Health import payloads, are not equivalent to a plugin MCP database write.
- Owner viewing a non-Owner workspace must see that workspace's plugin topic,
  plugin app, file directory, and MCP binding, not Owner's.
- Directory-bound topic collections are keyed by both directory route and
  workspace owner/effective workspace. Two users may each bind a directory named
  `健康`; the topic root must render them as separate collections instead of
  merging by display name. Runtime state normalization must preserve
  `directoryRoute.projectId`, `subprojectId`, and owner/workspace identity
  fields, and frontend route resolution must prefer a binding's concrete path
  over a reused project id when both are present.

## Proposed Files

The first frontend increment is implemented in:

- `public/app-plugin-topics-ui.js`
- `public/app-thread-list-ui.js`
- `public/app-event-stream-ui.js`
- `public/styles.css`
- `tests/task-list-ui.test.js`

Further persistence, route, and context work should use focused services:

- `adapters/plugin-required-skill-preload-service.js`
- `adapters/plugin-topic-binding-service.js`
- `adapters/plugin-topic-usage-service.js`
- `adapters/plugin-topic-delivery-directory-service.js`
- `adapters/plugin-topic-context-service.js`
- `adapters/plugin-capability-activation-service.js`
- `server-routes/plugin-topic-api-routes.js`
- `server-routes/mobile-api-plugin-composition.js`
- `server-routes/plugin-topic-usage-api-routes.js`
- `public/app-plugin-topics-ui.js` or an existing topic/navigation UI module
- `tests/plugin-topic-binding-service.test.js`
- `tests/plugin-topic-delivery-directory-service.test.js`
- `tests/plugin-topic-context-service.test.js`
- `tests/plugin-capability-activation-service.test.js`
- `tests/plugin-topic-api-routes.test.js`
- `tests/plugin-topic-usage-service.test.js`
- `tests/plugin-topic-usage-api-routes.test.js`
- `tests/app-plugin-topics-ui.test.js`

Existing modules remain responsible for their own boundaries:

- plugin host: `docs/MODULES/plugins.md`
- chat context: `docs/MODULES/chat-context.md`
- directory/files: `docs/MODULES/directory-files.md`
- Gateway Pool/toolsets: `docs/MODULES/gateway-pool.md`

## Data Boundary

The binding record may store plugin id, workspace id, topic/thread id, delivery
route, display order, icon metadata, toolset policy, context policy, and bounded
status. It must not store raw plugin keys, provider tokens, launch tokens,
session cookies, full mailbox bodies, raw ledger rows, private inventories,
health records, full learner submissions, or plugin database dumps.

## Context Boundary

Context assembly for plugin topics should prefer:

1. current user request;
2. recent topic messages;
3. binding metadata;
4. server-side preloaded required plugin Skill rules;
5. live structured plugin MCP access;
6. cleaned delivery-directory summaries and selected reports;
7. existing layered topic summaries and refs.

The delivery directory is a curated evidence layer, not a bulk-import source.
Runtime assembly must keep plugin delivery-directory routes separate from
normal task-directory attachments. The plugin topic may still use the delivery
directory for Markdown receipts and curated exports, but item facts, ledger
rows, mailbox state, health facts, or other live domain records should come
from the plugin MCP and required plugin Skill rules first.

## Harness

Plugin Topics are H1 when they affect plugin authorization, MCP/toolset routing,
workspace switching, delivery-directory creation, context assembly, or
cross-surface navigation between plugin app, plugin topic, plugin directory,
and ordinary topic root. They are H2 only for display-only card projection.

Focused validation should include:

- binding isolation across Owner, WuPing, test, and future workspaces;
- app/topic/delivery actions;
- plugin-context right-swipe/browser-back from plugin app, plugin topic, and
  plugin directory returning to the ordinary topic root without calling
  `openTaskList()` or `loadSingleWindow()`;
- missing or unprovisioned plugin diagnostics;
- plugin MCP schema presence for the selected workspace;
- plugin delivery-directory routes do not become ordinary `taskDirectory`
  bindings, and fixed plugin topics do not emit directory-cleaning instructions;
- configured plugin Skill and MCP requirements reach Gateway routing; required
  plugin `SKILL.md` content is preloaded into the model instruction context,
  with Wardrobe requiring
  `productivity/wardrobe-style-operations`;
- no Owner fallback;
- no raw secret or private-data leakage in docs, prompts, postMessage, frontend
  state, or handoff.

The current frontend projection is covered by `node tests/task-list-ui.test.js`
and `node tests/static-cache-version-harness.test.js`: the harness asserts the
global Dock handle above the bottom navigation, the absence of a separate
bottom Plugin tab, the retired standalone `能力` bottom tab, the built-in
Directory Dock icon, the hidden mobile bottom Directory tab, the plugin-topic
script in the app shell/service worker cache, Dock app launch actions with
long-press/context quick-action menus, the Dock `常用` quick-action card, no
permanent topic/file-directory mini actions beside Dock icons, Directory-bound
topic collections associated below the Directory root entry, usage-backed
quick-action promotion with no trailing source badges, Dock app-launch usage
promotion into persisted usage,
collapsible folder-tree rows excluding plugin topics and hiding raw directory
paths/default badges, root topic-list header/composer suppression, bottom
navigation with Topics centered unless workspace-scoped plugin tabs are pinned,
server-backed pinned plugin bottom-tab preferences with local-cache migration,
default launch to Topics when no saved view exists, fixed `plugin:<pluginId>`
topic entry, compact plugin-topic recent-message previews instead of default
topic-only rows,
non-blocking topic entry before directory refresh, creation of `插件/<plugin title>`, file-directory attachment on
plugin-topic sends, return from plugin file directory to the topic list, plugin
topic detail hiding bottom navigation while keeping the composer available,
embedded plugin host pages preserving bottom plugin-context navigation,
restoring topic-list scroll position after topic-detail back/right-swipe,
plugin-context exit using the dedicated direct topic-root renderer instead of
the generic task-list reload path,
single-surface compact plugin cards,
cache-sensitive static version recovery after missed script sync, plugin app
pages preserving the top navigation button while showing the three-item
`话题` / `插件` / `目录` bottom context bar, hiding the global plugin Dock
when the sidebar/menu, secondary page, keyboard state, back-swipe settle, or
plugin app is active, positioning the Dock against the real bottom navigation
height rather than the page-content reserved height, reserving only the
collapsed handle height while collapsed,
first-paint
topic-list rendering that does not synchronously wait for directory-topic
aggregation, preserving topic-list scroll position after that background
aggregation/refresh completes, and the static version bump.

The visual regression harness must also cover the Dock action menu with
`scripts/playwright-visual-smoke.js --open-plugin-drawer-menu <pluginId>`.
`--open-capability-menu` remains a compatibility alias for older runbooks, but
the checked surface is now the plugin Dock/drawer. Passing gesture work must
also run `npm run ios:pwa:visual -- --scenario
global-plugin-dock-gesture-stability` so short vertical mistouches, horizontal
swipes, valid open/close swipes, and bottom-nav rect stability are checked.
Output must include `pluginDrawerMenuOpened=true` and
`pluginDrawerMenuGesture=touch-longpress`; a desktop-only `contextmenu` dispatch
is not sufficient evidence for iOS/PWA long-press behavior.

Mac production must also run
`scripts/macos-plugin-directory-production-smoke.js` through the aggregate
Mac closure harness after migration, workspace catalog path repair, local
workspace rename, ACL repair, or plugin delivery-directory failure. The smoke
uses the Owner Web key file without printing key contents or raw key paths,
then proves every active workspace can create/preview the standard
`插件/<plugin title>` delivery directories. A `404` row usually means the
workspace catalog still points at a Windows/WSL drive prefix; a `500` row with
`EACCES` usually means the Mac live directory owner/ACL is wrong.

See `docs/IMPLEMENTATION_NOTES/plugin-topic-binding.md` for the detailed design.

## Plugin Topic and Directory Claim Convergence

Implemented in `20260610-plugin-topic-dock-box-v687`.

Topics root now separates three entry layers:

1. Plugin conversation shortcuts. These are labelled as plugin topics and open
   `plugin:<pluginId>` or a claimed historical topic in plugin topic context.
2. Ordinary directory-bound topic collections. These exclude directories that
   are claimed by a plugin.
3. Plugin app entry. Dock icons and plugin app buttons continue to open the
   structured plugin app, not a topic.

The claim identity is the effective workspace plus normalized directory route,
not the directory display name. A Health directory in Stephen's workspace and a
Health directory in Wuping's workspace are distinct even when the visible label
is the same.

Claim records live in
`adapters/plugin-directory-context-binding-service.js` and are exposed through
`/api/plugin-topic-bindings`:

- `claimed_by_plugin` hides the directory from the ordinary directory topic
  root and projects its historical topics into the plugin topic switcher.
- `auxiliary_context` allows the plugin to reference the directory but keeps the
  ordinary directory topic collection visible.

Plugin topic detail pages use an explicit title switcher for default plugin
topic, claimed historical directory topics, and the V1 new-topic path. The
switcher is part of the visible toolbar; it is not hidden under the topic
three-dot menu.

Plugin delivery directories remain output/file areas. They do not define
conversation context ownership. Context injection for plugin topics reads only
indexed eligible sources from
`adapters/plugin-topic-context-source-service.js`; delivery PDFs, images,
tables, raw attachments, temporary results, and old report versions are not
loaded by default.
See `docs/IMPLEMENTATION_NOTES/embedded-surface-bottom-layout-standard.md` for
the shared Hermes-owned chat and plugin-owned iframe bottom-tab layout rules.
