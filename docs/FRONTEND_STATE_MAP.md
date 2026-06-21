# Home AI Frontend State Map

Last updated: 2026-06-18.

Use this file to locate the responsible frontend files before debugging a screenshot or mobile UI report.

Visible user-facing product copy should use Home AI. Keep internal Hermes-prefixed
JavaScript globals, cache keys, routes, and Gateway compatibility labels unless
the change is part of a dedicated infrastructure rename.

## App Shell

- Entry/wiring: `public/app-start.js`, `public/app-wire-start-ui.js`, `public/app-shell-ui.js`
- Navigation and route handling: `public/app-route-snapshot-ui.js`,
  `public/app-platform-ui.js`, `public/app-sidebar-task-ui.js`.
  `app-route-snapshot-ui.js` owns saved route/scroll snapshot persistence and
  reload restore; `app-platform-ui.js` owns route application and platform
  bootstrap glue.
- Desktop sidebar navigation is the wide-screen counterpart to the mobile
  primary tabs. Its permanent primary row is `聊天 / 信息 / 话题`; Directory and
  plugin apps are reached through the same permission-filtered launcher model
  as the mobile global Dock. The standalone `能力` primary tab is retired:
  frequent actions live under the Dock/sidebar `常用` launcher entry and
  plugin long-press/context menus. Automation is a secondary/admin surface
  reached from contextual menus rather than a primary row button. Growth is
  plugin-owned and must be opened from the plugin launcher/Dock, an optional
  pinned plugin bottom tab, or explicit compatibility routes, not as a
  permanent host primary tab.
- Mobile sidebar: `public/index.html`, `public/styles.css`,
  `public/app-platform-status-ui.js`
  - On mobile/PWA widths the sidebar is a full-screen navigation surface, not a
    partial drawer that leaves app content visible behind it.
  - The panel must respect top/side/bottom safe areas, stay vertically
    scrollable, and keep close/navigation controls inside the same app surface.
  - Gateway provider status rows must wrap within the panel. They must not use
    fixed multi-column layouts that make `Low`/`High` provider text overlap or
    overflow horizontally.
- API wrapper: `public/app-api-client.js`
- Event stream: `public/app-event-stream-ui.js`, `public/app-events-composer-ui.js`
- Device-local display settings: `public/app-pwa-settings-push-ui.js`
  - Theme mode is stored in `localStorage.hermesWebTheme` as `system`, `light`,
    or `dark`.
  - `public/index.html` applies `data-theme` before loading CSS and updates
    `theme-color` plus `apple-mobile-web-app-status-bar-style` so mobile PWA
    status bars remain readable.
  - System color-scheme changes should affect the app only when the stored
    preference is `system`.
  - Foreground restore (`visibilitychange`, `pageshow`, `focus`) must reapply
    the saved theme preference before other refresh/render work so iOS/PWA
    resume does not briefly repaint the app in the wrong color scheme.
  - Foreground/background and scroll handling must maintain the bounded
    `hermesWebRouteSnapshot` route/scroll snapshot. If the app process is
    reloaded without an explicit URL route, startup restores that snapshot
    before using the default launch view; explicit notification and deep-link
    routes always take precedence.
  - Theme QA must include visible app surfaces, not only the settings control:
    sidebar/top bar, composer, user/assistant messages, topic cards, Inbox rows
    and deliverable tags, Growth warning/danger cards, and the settings or
    access-key sheet.
- Run progress/status panel: `public/app-run-progress-ui.js`, `public/app-thread-state-ui.js`
  - Must render model stream states from `run.model_first_byte_retrying`,
    `run.model_stream_started`, `run.model_output_started`,
    `run.liveness_warning`, `run.liveness_stale`, `run.gateway_start_timeout`,
    `run.stream_failed`, `run.tool_budget_exceeded`, and
    `run.toolset_escalation_required`.
  - `run.liveness_warning` is a diagnostic event only. Keep it in run-event
    metadata, but do not render it as a visible status row; reserve visible
    timeout/failure wording for `run.liveness_stale`, `run.gateway_start_timeout`,
    and `run.stream_failed`.
  - Run progress rows should preserve chronological order and append newer
    model, Skill, and function events downward. The panel may cap the number of
    visible rows, but it must not reorder later function calls above earlier
    startup rows.
  - Toolset-selection status rows represent the combined permission and toolset
    preflight. After a successful model-first selector decision, the main run
    should not load the permission-boundary Skill again as a separate visible
    step or call `skill_view` for
    `productivity/hermes-mobile-permission-boundary-check`.
  - High-frequency preflight events such as model selected, toolset selection
    started, and toolset selected must update the inline status panel in place.
    If the target assistant message is not visible yet, the frontend should
    schedule one short delayed fallback thread refresh and coalesce later
    preflight events into that fallback instead of triggering a full thread
    render for every event.
  - When a toolset-selection terminal event is already present, the visible
    status list should hide the immediately preceding `run.toolset_selection_started`
    row for the same run and show the resulting combined preflight row. The raw
    event order may remain in state for diagnostics.
    Permission-only preflight uses `run.permission_preflight_done` or
    `run.permission_preflight_fallback` as the terminal row; the latter means
    Mobile continued with deterministic server policy, not that execution
    failed.
  - Event-driven refresh must bind a run event to the newest assistant message
    whose own `runId`, `originalRunId`, `responseRunId`, or `taskId` matches
    before falling back to thread active ids. Thread active ids are only a
    fallback for still-active messages; they must not make old terminal
    assistant messages steal the current run-progress update.
  - When an inline run-progress panel grows because new rows arrive, the
    conversation should remain pinned to the newest status area if the user was
    already near/pinned to the bottom or inside the send/run follow window.
    It should preserve the previous bottom offset by compensating only for
    actual height growth, not repeatedly force `scrollTop` to the absolute
    bottom on every status refresh.
    It must not pull the viewport back down after the user has intentionally
    scrolled away.
  - The completed run-status history popover on mobile should prefer the space
    above the tapped status chip and remain scrollable within the viewport. It
    must not default to a bottom-fixed sheet that covers the lower conversation
    or composer area. When content is short, the popover should shrink to its
    content instead of reserving a tall blank fixed area; long histories may
    scroll within a bounded max height.
  - Function-call rows should show the concrete function name whenever the
    event preview, tool field, or paired `callId` makes it available. Generic
    `Function` labels are not useful; if the Gateway event does not expose
    enough metadata to identify the function, the UI should omit that function
    row instead of rendering a fallback such as `Function` or `Function Function`.
  - Paired Skill/function start and done events should render as one compact
    operation row with status and elapsed operation time. The frontend should
    preserve raw event order internally but avoid adjacent duplicate visible
    rows such as `开始 Skill` followed immediately by `完成 Skill`.
  - Function operation duration must measure real tool execution, not only
    model argument generation. For `function_call` / `function_call_output`
    pairs, the visible duration is `function_call_output.done` minus
    `function_call.added`; the intermediate `function_call.done` event is only
    the end of call construction and should not close the visible operation row.
  - Output-item event parsing must accept both `item` and `output_item` payload
    shapes so function names such as scheduled tasks, MCP calls, and search
    calls are preserved without storing raw arguments or raw tool output.
  - After `run.model_output_started` / `run.final_message_started`, and when no
    later tool operation has started, the inline run-progress panel should use
    compact display so streamed assistant text remains visible.
    Compact display may tighten spacing, but it must not reduce the panel's
    outer minimum height while the assistant message is active. Elapsed-time and
    row time columns must use stable widths so the per-second ticker does not
    reflow the message body or page. Active inline run-progress panels must
    keep a bounded maximum height so the preceding user prompt remains visible;
    status rows may scroll inside the panel after that cap instead of expanding
    the whole assistant card. The internal status-row scroller must follow the
    newest rows while the assistant is active; a capped panel must never strand
    the user on the earliest run events, including after an initial full
    thread render before any incremental run-progress update arrives. Follow
    targets should align to complete status-row boundaries so the top visible
    row is not clipped by the panel border when the mathematical bottom offset
    lands in the middle of a row, but should prefer the nearest previous
    full-row group and shrink the internal row viewport to that group's content
    height instead of adding large bottom padding that leaves the visible
    status area mostly empty. If the
    preceding user prompt is long, the panel should shrink to the minimum
    useful height budget. On phone-width
    viewports, rows should keep status and elapsed time aligned on the first
    line and place event previews on a second line so narrow screens do not
    collapse into unreadable four-column truncation.
  - Active assistant messages must render streaming deltas as a bounded receipt
    preview, not as an ever-growing full transcript. The preview belongs inside
    the assistant message, keeps only the recent tail, clamps to a fixed line
    count with hidden overflow, and shares the active message height budget with
    the inline run-progress panel so their combined visible area stays within
    one conversation viewport. Once the preview is visible, it must reserve the
    fixed line-count height and disable scroll anchoring around the active
    assistant message; streamed text tail updates must not move the inline
    run-progress panel. The full assistant receipt is rendered only after the
    message reaches a terminal state.
  - If the active assistant message has not received user-visible text deltas
    yet, safe run events such as model-stream start and output-start may project
    a bounded streaming receipt preview into the same assistant message. This is
    UI-only progress feedback; it must not mutate final assistant content, raw
    function arguments, private tool output, or persisted receipt text.
  - After an assistant receipt reaches a terminal state, detailed run-progress
    rows should collapse into a small `模型状态` footer tag next to Usage/Skill.
    Opening the tag shows historical rows from the first retained event, keeps
    the panel inside the portrait viewport, and remains scrollable. Terminal
    history must not keep a visible "still running" quiet row.
  - Skill footer tags are evidence-based. Do not synthesize a Response Skill
    fallback when no real Skill was loaded or no `skill_view` event exists.
- Static shell/cache: `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`
- Mobile shell breakpoint: `public/app-chat-composer-ui.js`,
  `public/app-composer-context-ui.js`, and `public/styles.css`
  - The mobile shell applies at `max-width: 1099px` and also on coarse-pointer
    touch tablets up to `1366px` wide. iPad-like landscape layouts therefore
    use the same single-column shell and bottom navigation as portrait instead
    of the desktop fixed sidebar.
  - The old narrow-landscape compact footer variant is intentionally absent;
    landscape keeps the normal bottom-tab labels and bottom navigation height.

## Chat And Topics

- Composer: `public/app-chat-composer-ui.js`, `public/app-composer-send-ui.js`, `public/app-composer-context-ui.js`, `public/app-composer-source-ui.js`
- Thread list/message rendering: `public/app-thread-list-ui.js`, `public/app-thread-message-ui.js`, `public/app-thread-card-message-ui.js`
- Task group UI: `public/app-task-groups-ui.js`, `public/app-task-preview-ui.js`
- Capability Entry Hub product direction:
  `docs/IMPLEMENTATION_NOTES/capability-entry-hub.md`
  - The standalone host `能力` tab is retired. Topics root is
    conversation-first and should not render a quick-action grid. Plugin and
    built-in Directory icons stay in the host-owned global plugin Dock above
    the primary bottom navigation or host comfort inset. The Dock is collapsed
    to a small handle by default on eligible root surfaces, the Chat bottom-tab
    surface, and top-level plugin App surfaces, and expands in place from that
    handle. Icon clicks consistently open the app/capability, while
    long-press/context-click opens the compact action menu. The first Dock
    launcher entry is `常用`, which exposes up to six usage-ranked manifest
    actions without acting as a second app launcher.
    Touch-shell validation must verify the `touchstart` long-press path
    directly because desktop `contextmenu` evidence alone does not prove
    iOS/PWA behavior. Ordinary quick actions carry direct plugin or Directory
    routes and are not MCP calls; the destination plugin owns the fixed
    capability screen. Quick actions use the workspace-scoped
    `/api/plugin-topic-usage` preference store as the source of truth, with
    `hermesPluginTopicUsage` only as a local first-paint/offline cache. Used
    entries sort by count/recency, and available default actions may fill the
    remaining `常用` menu entries so first-time users do not see an empty menu.
    Pinned plugin bottom tabs use the same server preference endpoint via
    `preferences.pinnedBottomTabs`; `hermesPinnedPluginBottomTabs:<workspaceId>`
    is only the local first-paint/offline cache and old-cache migration source.
    A pinned plugin bottom tab is removed from the mobile Dock/drawer app-icon
    row to avoid duplicate launch entries; long-press or context-click on that
    bottom tab opens a compact menu with `取消固定` and `换位`. Bottom-tab order
    and Dock/drawer icon order are workspace-scoped server preferences through
    `/api/plugin-topic-usage`; local `hermesPluginTopicOrder:<workspaceId>` and
    `hermesPinnedPluginBottomTabs:<workspaceId>` values are only first-paint or
    offline caches. Drag sorting is enabled only after the explicit `换位` menu
    item, so normal horizontal swipes do not trigger reordering.
    Directory-bound topic rows show the directory display name plus topic count
    and updated time; they hide raw directory paths and default-topic prompt
    badges.
    Plugin-topic detail toolbars show only the active directory chip. Claimed
    directory topics open their paired bound directory; fixed plugin topics open
    the plugin delivery directory. They do not render a plugin-topic dropdown.
  - On desktop, the same plugin app definitions are rendered in the sidebar
    launcher instead of the mobile bottom Dock. This keeps plugin discovery
    available in PC browsers while preserving the mobile collapsed Dock
    interaction on phone and touch-tablet shells.
- Single Window topic replies must carry the currently selected `taskGroupId`
  just like the standalone Tasks view. If the composer says "Reply in this
  task...", the post must remain in that selected topic instead of creating a
  new topic group.
- Composer send uses local optimistic user/assistant messages only until the
  `POST /api/threads/:id/messages` call is acknowledged. If that POST rejects,
  times out, or otherwise fails before the server returns a thread, the client
  must remove the local pending messages, restore the composer text, and request
  a bounded thread refresh. A local optimistic `queued` placeholder must never
  remain as the source of a visible `Home AI - queued` message or bottom
  `queued` badge when the server has no corresponding active assistant message.
- Composer send completion, event-stream thread refresh, run-progress fallback
  refresh, and topic-root background refresh must remain bound to the route
  snapshot that scheduled the work. If the user changes bottom tabs or exits a
  plugin-topic detail while the assistant run is still active, stale async
  completions may update cached thread summaries but must not repaint the old
  topic surface over the newly selected tab.
- Assistant message rich text is rendered by
  `public/app-rich-text-directory-ui.js`. Assistant receipts support safe
  Markdown image syntax (`![alt](src)`) for `http`/`https`, same-origin, and
  relative image sources, and render images with `.hermes-markdown-image` so
  they stay within the message bubble. `public/markdown-renderer-client.js` and
  `adapters/markdown-renderer.js` keep the same image sanitizer for Markdown
  previews, exports, and server-side readable HTML.
- Thread refresh/merge must not preserve a locally running message once the
  incoming thread summary has no active run. Pending messages outside a paged
  response may be kept only while the incoming thread still reports an active
  run.
- Returning to the Single Window chat should render the cached same-workspace
  chat scope immediately when available, then refresh `/api/single-window` in
  the background. Do not leave the chat header or recent messages absent until
  the server response returns.
- Topic root lists should not show Kanban-generated case-topic groups. Kanban
  study/case evidence should be reached from Growth, Todo/Kanban, Inbox source
  links, or explicit direct routes instead of being mixed into ordinary topics.
  The root-list harness must cover both first-party task groups carrying
  `kanbanCaseId`/`kanbanCaseMode` and shared case-topic threads.
- Message actions, Usage, Skill, and terminal run-status chips: `public/app-message-actions-ui.js`, `public/app-message-usage-ui.js`, `public/app-message-skill-ui.js`, `public/app-run-progress-ui.js`
  - Assistant receipt footer actions include copy, share image, and save to
    Note. Save-to-Note click handling lives with the share/copy helpers in
    `public/app-share-image-ui.js` and calls `POST /api/note/receipts` with
    IDs only; the server owns message lookup and attachment materialization.
    The client keeps a per-message in-flight guard to prevent duplicate Note
    saves from repeated taps while the first request is pending. When the server
    returns a note id, the success toast is actionable and opens the Note plugin
    through the local Hermes route state instead of a deployment-specific URL.
    The receipt title is generated server-side from the heading or first
    meaningful content line, with a plugin prefix when available.
- Search: `public/app-navigation-search-ui.js`
- Group/topic UI: `public/app-group-topic-ui.js`

## Directory And Files

- Embedded directory UI: `public/app-thread-directory-ui.js`
- Shared directory UI: `public/app-shared-directory-ui.js`
- Rich text/file directory helpers: `public/app-rich-text-directory-ui.js`
- Directory automation links: `public/app-directory-automation-ui.js`
- File/artifact preview helpers: `public/app-task-artifact-helpers.js`, `public/app-task-preview-ui.js`
- Standalone viewer shells: `public/file-viewer.html`, `public/pdf-viewer.html`,
  `public/directory-viewer.html`
- Word/PDF preview projection:
  - `public/app-task-preview-ui.js` decides whether a task/directory document
    link opens the embedded Hermes overlay or resolves the original same-origin
    source URL for same-window native preview.
  - Phone widths keep the overlay fallback. Wide iPad/foldable/desktop widths
    use native/original preview only for PDF. Word/DOCX stays inside
    `file-viewer.html` because raw DOCX URLs download on common mobile browsers.
- Directory preview thread context:
  - `ensureDirectoryThread()` uses `state.directoryReturnRoute.currentThreadId`
    while returning from a topic/message into Directory. This keeps clicked
    directory chips scoped to the topic thread ACL instead of the currently
    selected workspace's generic single-window directory thread.
  - Without a directory return route, Directory keeps the original cached
    `state.directoryThreadId` per `state.selectedWorkspaceId` behavior.

## Wardrobe

- Wardrobe tab/task launcher: `public/app-wardrobe-ui.js`
- Bottom tab: `bottomWardrobeMode`; route aliases: `view=wardrobe`,
  `view=closet`, `view=outfit`.
- The tab is hidden by default and becomes visible from the same workspace
  plugin list projection used for launch. Owner sees it by default only in the
  effective Owner workspace; when Owner switches to a non-Owner workspace, that
  workspace must be returned by `GET /api/hermes-plugins?workspaceId=...` with
  `wardrobe` before the bottom tab appears.
- `GET /api/hermes-plugins/wardrobe/manifest` is the only tab content source.
  When it returns an available `embedded_app` manifest, the Wardrobe tab embeds
  the plugin entry URL in a same-window iframe.
- If the plugin manifest is unavailable, mixed-content blocked, or blocked by
  `frame-ancestors`, the tab shows a compact plugin diagnostic and retry action.
  It must not open a browser window and must not fall back to a local
  `/api/wardrobe/overview` dashboard.
- The old native section switcher and local MCP overview have been removed. Full
  Wardrobe UI parity belongs to the embedded app from the Wardrobe project, not
  copied screens inside Hermes Mobile.

## Growth

- Growth user entry is the embedded plugin view `view=growth`, rendered by
  `public/app-embedded-plugin-ui.js` with plugin id `growth`.
- Growth is no longer a permanent host sidebar/bottom tab. It is opened as an
  embedded plugin from the global plugin Dock/drawer or from explicit Growth
  plugin routes. Stale `viewMode=learning` state and old `view=learning` URLs
  are compatibility inputs only and must be normalized to `growth` before a
  view is loaded.
- Growth card deep links use
  `view=growth&pluginRoute=card&pluginItemId=<taskCardId>`. Old
  `view=learning&taskCardId=<taskCardId>` links are converted to that plugin
  route.
- The old `public/app-learning-growth-*`, `public/app-learning-program-ui.js`,
  and `public/app-learning-coins-ui.js` files are legacy host UI modules kept
  for staged compatibility and tests. They must not be wired as the normal
  visible Growth surface.
- Teaching-card product rules remain in
  `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md` and
  `docs/IMPLEMENTATION_NOTES/growth-teaching-card-implementation.md`, but new
  user-facing Growth UI work should happen in the Growth plugin workspace.

## Automation

- Automation list/detail/cache/actions: `public/app-automation-controller-ui.js`, `public/app-automation-ui.js`
- Automation directory links: `public/app-directory-automation-ui.js`
- Product direction: Automation becomes a background/admin surface; user-facing completed/failed delivery reading should move to Action Inbox.

## Action Inbox

- Inbox tab/list/detail: `public/app-action-inbox-ui.js`
- Route target: `view=inbox&inboxItemId=<id>`
- Primary bottom navigation direction: `聊天 / 信息 / 话题` plus
  workspace-scoped pinned plugin tabs. Directory and Growth are plugin/Dock
  entries unless pinned.
- Inbox should render source tags and action states compactly, one list/detail surface, without relying on official Kanban UI modules.
- Inbox list rows should combine processing actions into the inline status
  badge after source/type. Tapping `待处理` or another non-terminal status opens
  the viewport action sheet; do not add a separate right-side `处理` button. The
  visible badge should show the actual status label and read like compact
  metadata, not a filled command pill.
- Inbox detail must reuse the same compact status-action badge and action sheet
  as the list. Do not render a larger legacy status pill on the secondary page.
- Inbox root page-level actions live in the top-right overflow menu. Inbox detail/create are secondary states and should use shared top-left back plus right-swipe back, not inline duplicate back/title controls.
- When Inbox has cached rows, refreshes should keep the cached list visible and
  update it in place after `/api/action-inbox` returns. A full loading state is
  reserved for first load or explicit force-loading so mobile tab switches do
  not blank the message area.

## Kanban/Todo

- Kanban core/list/render/actions: `public/app-kanban-core-ui.js`, `public/app-kanban-list-ui.js`, `public/app-kanban-render-ui.js`, `public/app-kanban-actions-ui.js`
- Card actions: `public/app-kanban-card-actions-ui.js`, `public/app-kanban-composer-actions-ui.js`
- Todo detail/core: `public/app-kanban-todo-core-ui.js`, `public/app-todo-detail-ui.js`
- Study/learning panel: `public/app-kanban-learning-panel-ui.js`, `public/app-kanban-study-actions-ui.js`
- Recorder/story helpers: `public/app-kanban-recorder-ui.js`, `public/app-kanban-story-core-ui.js`, `public/app-kanban-story-helpers.js`
- Product direction: old Todo/Kanban UI is legacy for Hermes Mobile once Action Inbox is active. Official Kanban remains separate from the new Inbox source of truth.

## Workspace/Admin

- Workspace access/admin UI: `public/app-workspace-admin-ui.js`, `public/app-access-key-manager-ui.js`,
  `public/app-plugin-admin-ui.js`
- PWA push settings: `public/app-pwa-settings-push-ui.js`
- Upload/sidebar: `public/app-upload-sidebar-ui.js`
- Share image: `public/app-share-image-ui.js`

## Common State Rules

- Static client changes require version bump in `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`, and `tests/task-list-ui.test.js`.
- Local in-flight state must not be displayed as server-confirmed state.
- Route targets should be kept until the target module has fetched or rendered the requested resource.
- Topic restore placeholders must be scoped to the requested topic/task group.
  If `currentTaskGroupId` no longer resolves, the UI may hold on
  `Restoring topic...` only while that same task group has queued/running
  messages or the current thread fetch is in flight. Unrelated active runs in
  the same single-window thread must not keep the Topic page stuck in restore.
- Secondary screens should be represented by explicit detail/create state and wired into `updateNavigationControls()`, `activateTopNavButton()`, `backSwipeTarget()`, and `performBackSwipeAction()`. The content area should not duplicate the top bar title or page-level overflow actions.
- Plugin topic details are secondary task-detail surfaces only visually; when
  plugin context is active, right-swipe/back must resolve to plugin-context
  home before ordinary task-detail back, and detail-page single-window loads
  must not overwrite the task-list root cache.
- A primary module can also be opened as a secondary surface when launched from another page-level overflow menu. Example: opening the Automation list from the Inbox overflow records `automationReturnRoute="inbox"`; the Automation list then uses the top-left shell back button and right-swipe back to return to Inbox. Bottom navigation into the same module remains a primary page and clears the return route.
- Mobile OS status bar visibility, safe-area, bottom nav, keyboard viewport, and back/right-swipe behavior must be tested when changing shell/navigation code.
- Android installed PWA/browser shells cannot use browser history as final
  acceptance for launcher-exit prevention. The Web client keeps a best-effort
  Android-only `history.pushState` guard: `index.html` installs a cold-start
  guard before the main client bundle loads, and the app-level guard adopts
  that depth before taking over. The guard is replenished synchronously on
  `popstate`, `pageshow`, focus, visibility restore, and the first user
  interaction after resume. Production-quality primary-page Back/Predictive
  Back behavior belongs to the Android native shell, which must consume root
  Back events without reloading the workspace or finishing the Activity.
  Secondary Web surfaces still resolve through `backSwipeTarget()` and
  `performBackSwipeAction()` when the native shell forwards a bounded back
  request.
- After the composer sends a message in Chat or a task detail, the conversation must stay pinned to the newest run/status area through the immediate server response, inline run-progress growth, and follow-up viewport refreshes. Refresh/render helpers should extend the bottom-follow window and avoid restoring stale bottom offsets during this send/run-start interval.
