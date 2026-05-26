# Hermes Mobile Frontend State Map

Last updated: 2026-05-26.

Use this file to locate the responsible frontend files before debugging a screenshot or mobile UI report.

## App Shell

- Entry/wiring: `public/app-start.js`, `public/app-wire-start-ui.js`, `public/app-shell-ui.js`
- Navigation and route handling: `public/app-platform-ui.js`, `public/app-sidebar-task-ui.js`
- API wrapper: `public/app-api-client.js`
- Event stream: `public/app-event-stream-ui.js`, `public/app-events-composer-ui.js`
- Run progress/status panel: `public/app-run-progress-ui.js`, `public/app-thread-state-ui.js`
- Static shell/cache: `public/index.html`, `public/service-worker.js`, `public/directory-viewer.html`

## Chat And Topics

- Composer: `public/app-chat-composer-ui.js`, `public/app-composer-send-ui.js`, `public/app-composer-context-ui.js`, `public/app-composer-source-ui.js`
- Thread list/message rendering: `public/app-thread-list-ui.js`, `public/app-thread-message-ui.js`, `public/app-thread-card-message-ui.js`
- Task group UI: `public/app-task-groups-ui.js`, `public/app-task-preview-ui.js`
- Message actions, Usage, Skill chip: `public/app-message-actions-ui.js`, `public/app-message-usage-ui.js`, `public/app-message-skill-ui.js`
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

## Automation

- Automation list/detail/cache/actions: `public/app-automation-controller-ui.js`, `public/app-automation-ui.js`
- Automation directory links: `public/app-directory-automation-ui.js`
- Product direction: Automation becomes a background/admin surface; user-facing completed/failed delivery reading should move to Action Inbox.

## Action Inbox

- Inbox tab/list/detail: `public/app-action-inbox-ui.js`
- Route target: `view=inbox&inboxItemId=<id>`
- Primary bottom navigation direction: `聊天 / 收件箱 / 目录 / 成长`
- Inbox should render source tags and action states compactly, one list/detail surface, without relying on official Kanban UI modules.
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
- Secondary screens should be represented by explicit detail/create state and wired into `updateNavigationControls()`, `activateTopNavButton()`, `backSwipeTarget()`, and `performBackSwipeAction()`. The content area should not duplicate the top bar title or page-level overflow actions.
- Mobile safe-area, bottom nav, keyboard viewport, and back/right-swipe behavior must be tested when changing shell/navigation code.
