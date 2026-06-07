# Module: Plugin Topics

Last updated: 2026-06-07.

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
  only bottom difference is replacing the normal five-entry mobile navigation
  with the three-entry plugin-context navigation. Composer/footer overlap must
  be solved by the shared bottom-layout standard, not by adding visible padding
  to the outer app or main shell.
- Returning from topic detail to the topic list must restore the topic-list
  scroll position captured before entering the detail. Right-swipe/back should
  not jump away from the plugin and Directory card area.
- When there is no saved launch view, Hermes Mobile opens the topic page first.
  The mobile bottom navigation keeps five primary slots with Topics in the
  center position.
- The current frontend projection renders Wardrobe, Finance, Email, Health,
  Note, and the built-in Directory capability in a topic-page Dock row directly
  above the mobile bottom navigation when they are visible in the effective
  workspace. The Dock is a dedicated layout row outside the scrollable topic
  list, so it must not cover directory-bound topic cards. It does not create a
  separate bottom Plugin tab, does not open a floating plugin drawer from the
  Topics tab, and does not create new plugin grants.
- The Dock remains single-row. When one to six capability entries are visible,
  the row divides the available width evenly across those entries; when more
  than six entries are visible, the row may scroll horizontally.
- Dock reordering is available through the long-press/context action menu with
  bounded move controls. A normal horizontal swipe must scroll the Dock, and the
  daily long-press gesture must open the action menu instead of being consumed
  by drag sorting when that menu exists.
- The Dock action menu must be bound to the touch long-press path as well as
  pointer/context interactions. The frontend CSS must suppress WebKit native
  touch callout on Dock icons so iOS/PWA long-press can reach the Home AI menu.
- Dock entries are app/capability launch targets on tap. A tap records
  app-level capability usage so the same plugin or built-in Directory entry can
  appear later in the root quick-action grid as a recently used capability. They
  do not expose permanent topic or file-directory mini actions in the topic
  list. Plugin- and Directory-specific secondary surfaces remain reachable from
  quick actions, long-press/context menus, and plugin context/navigation rules
  instead of as small buttons beside the app icon.
- Capability usage ordering is not a volatile client-only preference. The
  authoritative usage signal lives in `/api/plugin-topic-usage` and is
  persisted per workspace as bounded `plugins` and `actions` count/recency
  maps. `localStorage.hermesPluginTopicUsage` is only a first-paint/offline
  cache and may be rebuilt from the server after login, client reset, PWA
  reinstall, or device switch.
- Capability usage writes must update the visible root projection immediately
  when the user is on the topic root, before waiting for server sync. A
  long-lived PWA session must also re-check server usage after a short loaded
  TTL instead of treating the first successful `/api/plugin-topic-usage` load as
  permanently fresh. Repeated clicks on the same action, such as
  `wardrobe:style`, must increment that action's workspace usage and promote it
  by count/recency in the quick-action grid.
- The next product direction for the root Topics tab is the Capability Entry
  Hub described in
  `docs/IMPLEMENTATION_NOTES/capability-entry-hub.md`. In that model, the
  plugin icon still consistently opens the plugin app, but plugin icons remain
  in the fixed bottom Dock instead of moving into the middle of the page body.
  The page body shows a compact usage-backed frequent-action grid followed by
  Directory-bound topic collections. Shortcuts can open topics, plugin routes,
  directories, quick forms, app-level capability launches, or MCP-backed Home AI
  intents. A shortcut appears in the root quick-action grid only after the user
  has used that action or launched that app-level capability from the Dock/menu;
  default usage is zero, and the grid is sorted by count and recency. The first
  implementation maps shortcuts to existing host routes; direct MCP intent
  execution remains a separate H1 extension.
- The topic-page plugin Dock is visible only on the root topic list. It must be
  hidden when the sidebar menu is open, when a plugin app is active, and on any
  secondary page, so it cannot cover the navigation menu or plugin iframe.
- The topic-page plugin Dock is positioned directly above the real mobile
  bottom navigation height. It must not use the broader page-content reserved
  height, because that value can include scroll/composer spacing after returning
  from a plugin topic chat and would leave a visible blank band above the
  normal bottom navigation.
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
- The current frontend projection renders Directory as a built-in Dock
  capability for every authenticated workspace, keeps it in the fixed bottom
  capability Dock, and hides the separate mobile bottom Directory tab.
- The Directory Dock icon opens the Directory application on tap. Its
  long-press/context menu exposes Directory quick actions such as recent
  directories, file topics, and new topic. Directory-bound topics remain in the
  scrollable page body, not as mini buttons attached to the icon.
- Directory-bound topic collections are visually attached to the root
  Capability Entry Hub body and must exclude fixed plugin topics such as
  `plugin:wardrobe`,
  `plugin:finance`, `plugin:email`, and `plugin:health`.
- Directory-bound topic collections render as compact collapsible folder-tree
  rows followed by an indented child-topic list. The folder/directory icon lives
  at the left edge of the header and uses a scaled-down version of the bottom
  Directory Dock icon. The row shows the directory display name, topic count,
  and update time only; it must not expose the raw directory path, a generic
  "bound directory" prompt, or a visible default-topic badge. Child topic rows
  are visually indented below the directory header so the parent directory
  relationship is clear. The directory parent row toggles expand/collapse;
  opening the file manager must remain an explicit Directory-card or directory
  action, not an ambiguous parent-row click.
- The root topic list itself hides both the normal page header and the bottom
  message composer. New topic creation must enter through a Directory binding or
  another explicit binding flow, so every new topic has a durable context
  anchor.
- When the root quick-action grid has no usage-backed entries and therefore
  does not render, the first Directory-bound topic block must still receive a
  mobile safe-area top gap. The hidden page header must not cause the first
  folder/topic row to sit under the iOS status area.
- The Directory Dock icon uses the Dock-consistent plugin-app folder visual.
  Directory-bound topic rows use the same visual language at a smaller size;
  child topic rows keep the smaller chat/topic icon so the Directory app and its
  bound topics remain visually distinct.
- Runs started in the plugin topic should include the plugin MCP/toolset only
  when the selected workspace has an active plugin binding and matching Gateway
  callable schema.
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
  delivery directory.
- Owner viewing a non-Owner workspace must see that workspace's plugin topic,
  plugin app, file directory, and MCP binding, not Owner's.

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

The current frontend projection is covered by `node tests\task-list-ui.test.js`
and `node tests\static-cache-version-harness.test.js`: the harness asserts the
topic-page capability Dock row above the bottom navigation, the absence of a separate
bottom Plugin tab and floating plugin drawer, the built-in Directory Dock icon, the hidden mobile
bottom Directory tab, the plugin-topic script in the app shell/service worker
cache, Dock app/capability launch actions with long-press/context quick-action
menus, no permanent topic/file-directory mini actions beside Dock icons,
Directory-bound topic collections associated below the Capability Entry Hub body,
usage-backed three-column quick actions with no trailing source badges, Dock
app-launch usage promotion into root shortcuts,
collapsible folder-tree rows excluding plugin topics and hiding raw directory
paths/default badges, root topic-list header/composer suppression, bottom navigation with
Topics centered, default launch to Topics when no saved view exists, fixed
`plugin:<pluginId>` topic entry,
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
`话题` / `插件` / `目录` bottom context bar, hiding the topic-page plugin Dock
when the sidebar/menu or plugin app is active, positioning the Dock against the
real bottom navigation height rather than the page-content reserved height,
first-paint
topic-list rendering that does not synchronously wait for directory-topic
aggregation, preserving topic-list scroll position after that background
aggregation/refresh completes, and the static version bump.

The visual regression harness must also cover the Dock action menu with
`scripts/playwright-visual-smoke.js --open-capability-menu <capability>`. Passing
output must include `capabilityMenuOpened=true` and
`capabilityMenuGesture=touch-longpress`; a desktop-only `contextmenu` dispatch is
not sufficient evidence for iOS/PWA long-press behavior.

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
See `docs/IMPLEMENTATION_NOTES/embedded-surface-bottom-layout-standard.md` for
the shared Hermes-owned chat and plugin-owned iframe bottom-tab layout rules.
