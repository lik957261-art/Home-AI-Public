# Hermes Mobile Test Matrix

Last updated: 2026-05-25.

Use this matrix to pick focused tests before broader gates. Always add syntax checks for touched JS/Python/PowerShell files.

## Full Gates

- Broad product gate: `npm.cmd run productization:check`
- Standard test gate: `npm test`
- Architecture boundary: `node tests\architecture-refactor-boundary.test.js`
- Privacy scan: `node scripts\privacy-scan.js --all-files`
- Diff hygiene: `git diff --check`

Use full gates before public release, broad shared-service/runtime changes, permission/security/persistence changes, or when requested.

## Module Focused Tests

| Area | Focused Tests |
| --- | --- |
| API registry/dispatcher | `node tests\api-route-registry.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js` |
| Auth/workspace/access keys | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\workspace-public-projection-service.test.js` |
| Gateway run lifecycle | `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-stream-service.test.js`, `node tests\gateway-run-lifecycle-service.test.js`, `node tests\gateway-run-queue-service.test.js`, `node tests\run-liveness.test.js` |
| Gateway Pool/scripts | `node tests\gateway-pool-provider.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\startup-scripts.test.js` |
| ChatGPT Pro | `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\owner-elevation-routing-service.test.js`, `node tests\thread-message-create-service.test.js` |
| Grok/model routing | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js` |
| Web Push | `node tests\web-push-delivery-service.test.js`, `node tests\push-api-routes.test.js`, `node tests\task-list-ui.test.js` |
| Static client/UI shell | `node tests\task-list-ui.test.js`, `node tests\keyboard-viewport-ui.test.js`, `node tests\viewport-scroll-ui.test.js` |
| Directory/files/artifacts | `node tests\directory-browser-api-routes.test.js`, `node tests\directory-mutation-api-routes.test.js`, `node tests\directory-share-api-routes.test.js`, `node tests\file-artifact-api-routes.test.js`, `node tests\file-artifact-access-service.test.js` |
| Skill permissions/details | `node tests\skill-detail-provider.test.js`, `node tests\skill-analysis-service.test.js`, `node tests\resource-api-routes.test.js`, `node tests\link-skill-profile-store.test.js` |
| Automation/Cron | `node tests\automation-api-routes.test.js`, `node tests\automation-provider.test.js`, `node tests\cron-bridge.test.js`, `node tests\local-automation-bridge-service.test.js` |
| Weixin ingress/delivery | `node tests\weixin-api-routes.test.js`, `node tests\weixin-ingress-event-service.test.js`, `node tests\weixin-ingress-provider.test.js`, `node tests\weixin-outbound-delivery-service.test.js`, `node tests\weixin-runtime-composition-service.test.js` |
| Group chat | `node tests\single-window-group-chat-api-routes.test.js`, `node tests\group-chat-ui.test.js`, `node tests\group-chat-shared-attachment-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Runtime SQLite/state | `node tests\mobile-sqlite-store.test.js`, `node tests\runtime-state-repository.test.js`, `node tests\runtime-state-store-service.test.js`, `node tests\runtime-state-persistence-service.test.js`, `node tests\runtime-state-normalization-service.test.js` |
| Growth board/program/task | `node tests\learning-program-api-routes.test.js`, `node tests\learning-program-service.test.js`, `node tests\learning-program-repository.test.js`, `node tests\learning-growth-service.test.js`, `node tests\learning-growth-board-projection-service.test.js` |
| Growth submissions/evaluation queue | `node tests\learning-growth-submission-service.test.js`, `node tests\learning-growth-task-evaluation-service.test.js`, `node tests\learning-growth-task-interaction-state-service.test.js`, `node tests\learning-growth-task-feedback-service.test.js` |
| Growth mastery/evergreen | `node tests\learning-growth-mastery-profile-service.test.js`, `node tests\learning-growth-mastery-repository.test.js`, `node tests\learning-growth-next-card-strategy-service.test.js`, `node tests\learning-growth-sequence-service.test.js` |
| Growth frontend | `node tests\app-learning-growth-ui.test.js`, `node tests\app-learning-growth-task-ui.test.js`, `node tests\app-learning-program-ui.test.js`, `node tests\app-learning-native-growth-submission-controller.test.js` |
| Learning rewards/coins | `node tests\learning-reward-settlement-service.test.js`, `node tests\learning-coin-service.test.js`, `node tests\learning-coin-api-routes.test.js` |
| Public export/release | `node tests\public-export.test.js`, `node scripts\privacy-scan.js --all-files`, `npm.cmd run export:public` |

## Production Verification Tiers

- Static-only change: sync static/test files, run syntax/focused UI tests in production app directory, smoke `/api/client-version`.
- Listener code change: check `/api/status?detail=1` first, backup, sync, run focused tests, listener-only restart, smoke status.
- Gateway plugin/profile/schema/startup change: backup, sync, run focused checks, restart Gateway Pool, smoke worker health.
- Data repair: backup data first, apply bounded repair, verify metadata/API results, avoid restart unless runtime memory could overwrite the repair.
