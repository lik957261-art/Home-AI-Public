# Hermes Mobile Frontend State Map

Last updated: 2026-05-28.

Use this file to locate the responsible frontend files before debugging a screenshot or mobile UI report.

## App Shell

- Entry/wiring: `public/app-start.js`, `public/app-wire-start-ui.js`, `public/app-shell-ui.js`
- Navigation and route handling: `public/app-platform-ui.js`, `public/app-sidebar-task-ui.js`
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
  - After an assistant receipt reaches a terminal state, detailed run-progress
    rows should collapse into a small `模型状态` footer tag next to Usage/Skill.
    Opening the tag shows historical rows from the first retained event, keeps
    the panel inside the portrait viewport, and remains scrollable. Terminal
    history must not keep a visible "still running" quiet row.
  - Skill footer tags are evidence-based. Do not synthesize a Response Skill
    fallback when no real Skill was loaded or no `skill_view` event exists.
- Static shell/cache: `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`

## Chat And Topics

- Composer: `public/app-chat-composer-ui.js`, `public/app-composer-send-ui.js`, `public/app-composer-context-ui.js`, `public/app-composer-source-ui.js`
- Thread list/message rendering: `public/app-thread-list-ui.js`, `public/app-thread-message-ui.js`, `public/app-thread-card-message-ui.js`
- Task group UI: `public/app-task-groups-ui.js`, `public/app-task-preview-ui.js`
- Topic root lists should filter out retired Kanban case-topic groups once the
  Kanban snapshot confirms the bound case id is missing or fully archived. This
  applies before rendering both first-party topic groups and shared case-topic
  groups.
- Message actions, Usage, Skill, and terminal run-status chips: `public/app-message-actions-ui.js`, `public/app-message-usage-ui.js`, `public/app-message-skill-ui.js`, `public/app-run-progress-ui.js`
- Search: `public/app-navigation-search-ui.js`
- Group/topic UI: `public/app-group-topic-ui.js`

## Directory And Files

- Embedded directory UI: `public/app-thread-directory-ui.js`
- Shared directory UI: `public/app-shared-directory-ui.js`
- Rich text/file directory helpers: `public/app-rich-text-directory-ui.js`
- Directory automation links: `public/app-directory-automation-ui.js`
- File/artifact preview helpers: `public/app-task-artifact-helpers.js`, `public/app-task-preview-ui.js`
- Standalone viewer shells: `public/file-viewer.html`, `public/directory-viewer.html`

## Growth

- Growth overview/board: `public/app-learning-growth-ui.js`, `public/app-learning-growth-controller.js`
- Growth settings and profile tab: `public/app-learning-growth-settings-controller.js`
- Task detail/outcome: `public/app-learning-growth-task-ui.js`
- Program/task execution detail: `public/app-learning-program-ui.js`
- Native submission flow: `public/app-learning-native-growth-submission-controller.js`
- Reflection UI: `public/app-learning-growth-reflection-ui.js`
- AI/reward controllers: `public/app-learning-growth-ai-controller.js`, `public/app-learning-growth-reward-controller.js`
- Coins compatibility: `public/app-learning-coins-ui.js`
- Teaching-card UI flow: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md`
- Code-oriented teaching-card UI implementation plan: `docs/IMPLEMENTATION_NOTES/growth-teaching-card-implementation.md`
- Teaching-card interactions: `public/app-learning-growth-teaching-controller.js`
- Growth detail should branch by card role: teaching/practice cards use lesson, example, guided practice, quick check, and feedback steps; stage assessment cards keep the formal submit/evaluate/revise/reflect flow.

## Automation

- Automation list/detail/cache/actions: `public/app-automation-controller-ui.js`, `public/app-automation-ui.js`
- Automation directory links: `public/app-directory-automation-ui.js`
- Product direction: Automation becomes a background/admin surface; user-facing completed/failed delivery reading should move to Action Inbox.

## Action Inbox

- Inbox tab/list/detail: `public/app-action-inbox-ui.js`
- Route target: `view=inbox&inboxItemId=<id>`
- Primary bottom navigation direction: `聊天 / 收件箱 / 话题 / 目录 / 成长`
- Inbox should render source tags and action states compactly, one list/detail surface, without relying on official Kanban UI modules.
- Inbox list rows should combine processing actions into the inline status
  badge after source/type. Tapping `待处理` or another non-terminal status opens
  the viewport action sheet; do not add a separate right-side `处理` button. The
  visible badge should show the actual status label and read like compact
  metadata, not a filled command pill.
- Inbox detail must reuse the same compact status-action badge and action sheet
  as the list. Do not render a larger legacy status pill on the secondary page.
- Inbox root page-level actions live in the top-right overflow menu. Inbox detail/create are secondary states and should use shared top-left back plus right-swipe back, not inline duplicate back/title controls.

## Kanban/Todo

- Kanban core/list/render/actions: `public/app-kanban-core-ui.js`, `public/app-kanban-list-ui.js`, `public/app-kanban-render-ui.js`, `public/app-kanban-actions-ui.js`
- Card actions: `public/app-kanban-card-actions-ui.js`, `public/app-kanban-composer-actions-ui.js`
- Todo detail/core: `public/app-kanban-todo-core-ui.js`, `public/app-todo-detail-ui.js`
- Study/learning panel: `public/app-kanban-learning-panel-ui.js`, `public/app-kanban-study-actions-ui.js`
- Recorder/story helpers: `public/app-kanban-recorder-ui.js`, `public/app-kanban-story-core-ui.js`, `public/app-kanban-story-helpers.js`
- Product direction: old Todo/Kanban UI is legacy for Hermes Mobile once Action Inbox is active. Official Kanban remains separate from the new Inbox source of truth.

## Workspace/Admin

- Workspace access/admin UI: `public/app-workspace-admin-ui.js`, `public/app-access-key-manager-ui.js`
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
- A primary module can also be opened as a secondary surface when launched from another page-level overflow menu. Example: opening the Automation list from the Inbox overflow records `automationReturnRoute="inbox"`; the Automation list then uses the top-left shell back button and right-swipe back to return to Inbox. Bottom navigation into the same module remains a primary page and clears the return route.
- Mobile OS status bar visibility, safe-area, bottom nav, keyboard viewport, and back/right-swipe behavior must be tested when changing shell/navigation code.
- After the composer sends a message in Chat or a task detail, the conversation must stay pinned to the newest run/status area through the immediate server response, inline run-progress growth, and follow-up viewport refreshes. Refresh/render helpers should extend the bottom-follow window and avoid restoring stale bottom offsets during this send/run-start interval.
