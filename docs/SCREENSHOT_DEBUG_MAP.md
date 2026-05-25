# Screenshot-To-Code Debug Map

Last updated: 2026-05-25.

Use this map when the user sends a phone screenshot. Match visible labels and symptoms to likely files before reading broad code.

## Chat/Task Receipt

Visible labels:

- `运行记录`
- `请求已发送`
- `Gateway 已选择`
- `上下文已整理`
- `生成回复`
- `处理完成`
- `Usage`
- `Skill`

Start with:

- `public/app-run-progress-ui.js`
- `public/app-thread-state-ui.js`
- `public/app-message-actions-ui.js`
- `public/app-message-usage-ui.js`
- `public/app-message-skill-ui.js`
- `adapters/gateway-run-event-service.js`
- `adapters/gateway-run-stream-service.js`

Common bug classes:

- Status panel disappears too early or remains after terminal state.
- Events flash too quickly and are not retained in the visible sequence.
- Worker/model label is missing or stale.
- Finished receipt still shows a running timer.

## Growth Card

Visible labels:

- `成长`
- `画像`
- `AI 批改`
- `待作答`
- `已提交`
- `等待 AI`
- `反思`
- Score such as `90`

Start with:

- `public/app-learning-growth-ui.js`
- `public/app-learning-growth-settings-controller.js`
- `public/app-learning-growth-task-ui.js`
- `public/app-learning-program-ui.js`
- `public/app-learning-native-growth-submission-controller.js`
- `adapters/learning-growth-task-interaction-state-service.js`
- `adapters/learning-growth-submission-service.js`
- `adapters/learning-program-repository.js`

Common bug classes:

- Local in-flight state shown as server-confirmed submission.
- Submit button disabled because input guard or phase state disagrees with UI.
- Score reached but task still needs reflection/revision.
- Queue job completed but task projection still says waiting for AI.

## Directory/File Preview

Visible labels:

- `目录`
- file card with extension such as `.docx`, `.pdf`, `.jpeg`
- embedded preview or nested app shell
- shared directory badge

Start with:

- `public/app-thread-directory-ui.js`
- `public/app-task-preview-ui.js`
- `public/file-viewer.html`
- `public/directory-viewer.html`
- `server-routes/file-artifact-api-routes.js`
- `adapters/file-artifact-access-service.js`
- `adapters/directory-browser-boundary-service.js`

Common bug classes:

- Preview opens nested app shell.
- Shared root is missing or duplicated.
- File previews for wrong workspace.
- Upload/delete writes through a read-only share.

## Automation

Visible labels:

- `自动化`
- job list/detail
- Web Push opens automation list instead of specific job
- refresh changes ordering/format

Start with:

- `public/app-automation-controller-ui.js`
- `public/app-automation-ui.js`
- `server-routes/automation-api-routes.js`
- `cron_bridge.py`

Common bug classes:

- Summary/full detail mismatch.
- Cached full result hides route target.
- Search filter hides a push-targeted automation.
- Manual refresh does not preserve full-detail order.

## Workspace/Admin

Visible labels:

- `Workspace`
- `Access Key`
- Owner setup
- runtime config
- push setup

Start with:

- `public/app-workspace-admin-ui.js`
- `public/app-access-key-manager-ui.js`
- `public/app-pwa-settings-push-ui.js`
- `server-routes/workspace-api-routes.js`
- `server-routes/access-key-api-routes.js`
- `server-routes/runtime-config-api-routes.js`

Common bug classes:

- Ordinary workspace sees Owner-only configuration.
- Access Key plaintext appears in the wrong scope.
- Client is not forced to login after current key rotation.

## Gateway/Grok/ChatGPT Pro

Visible labels:

- `Gateway 权限 低`
- `officialclean1`, `officialclean2`, `grokgw1`
- `@Grok`
- `@ChatGPT Pro`
- `terminated`

Start with:

- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-stream-service.js`
- `adapters/owner-elevation-routing-service.js`
- `adapters/chatgpt-pro-codex-bridge-service.js`
- `gateway-plugins/hermes-mobile-chatgpt-pro/__init__.py`
- `scripts/start-gateway-pool.ps1`

Common bug classes:

- Owner-maintenance watchdog replaces busy maintenance worker.
- ChatGPT Pro intent missed by frontend but should be detected server-side.
- Grok request routed to wrong worker/provider.
- Gateway Pool schema/profile change deployed without worker restart.
