# Hermes Mobile API Route Reference

Last updated: 2026-05-29.

This is a hand-maintained route ownership and auth reference. The executable inventory contract lives in `adapters/api-route-inventory`, `adapters/api-route-registry`, and `tests/api-route-inventory.test.js`.

## Dispatcher Order

`server-routes/mobile-api-dispatcher.js` handles API requests in this order:

1. Public routes.
2. Weixin ingress routes under `/api/ingress/weixin/`, authenticated by the ingress key instead of browser Access Keys.
3. Public system probes, currently only `/api/client-version`, before browser Access Key authentication.
4. Browser/API Access Key authentication.
5. Authenticated route pipeline.

The authenticated pipeline is defined by `MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE`. Route modules marked `passAuth: true` receive `{ auth }` and must enforce workspace/resource rules inside the module or service layer.

## Auth Modes

- `public`: No browser Access Key. Must not expose private state.
- `ingress-key`: Dedicated sidecar key, used only for Weixin ingress/outbound.
- `access-key`: Owner or workspace Access Key required.
- `owner`: Owner Access Key required.
- `workspace-scoped`: Access Key required, then route/service clamps to the authenticated workspace unless Owner is allowed to select another workspace.
- `resource-scoped`: Access Key required, then a service validates thread, message, group, directory, artifact, automation, Skill, or learning resource access.

## Route Modules

| Module | Main Surface | Auth Mode | Notes |
| --- | --- | --- | --- |
| `public-api-routes.js` | `/api/public-config`, login/setup | public | First-run setup may create Owner key; do not expose secrets. |
| `system-api-routes.js` | status, client version, app update | public client-version probe; access-key status; owner mutations | `/api/client-version` must remain reachable without a browser Access Key and returns only version compatibility metadata unless an authenticated key is also present. Status projections must redact worker URLs and secret paths for non-Owner. |
| `runtime-config-api-routes.js` | runtime Gateway, Web Push, VAPID config | owner | Stores config metadata/paths, not plaintext key material. |
| `push-api-routes.js` | VAPID public key, subscriptions, tests, receipts | access-key, owner for admin views | Payloads and receipts must not expose endpoints or secrets to unauthorized users. |
| `weixin-api-routes.js` | Weixin ingress/outbound, forward targets | ingress-key or workspace-scoped | Ingress events use sidecar auth; browser forward target reads are workspace-scoped. |
| `workspace-api-routes.js` | workspace list/create/update/delete | access-key, owner for management | Ordinary users see only their workspace projection. |
| `access-key-api-routes.js` | workspace key status/rotate/revoke | owner | Plaintext key shown only once on generation/rotation. |
| `resource-api-routes.js` | shared directories, Skill detail/analysis/fix | workspace-scoped/resource-scoped | Skill write is delegated to `skill-permission-service`. |
| `hermes-plugin-api-routes.js` | embedded plugin list/manifest/proxy/notifications | access-key, workspace-scoped, proxy path unauthenticated after launch | Notification events upsert summary-only `sourceType=plugin` Inbox items and send Web Push through Hermes; same-origin proxy paths do not expose raw plugin keys. |
| `action-inbox-api-routes.js` | Action Inbox list/detail/manual items/state transitions and Finance ledger join approval actions | workspace-scoped | Uses local SQLite `action_inbox_*` tables; Inbox items are summary/action projections, not canonical source records. Finance approval routes call the Finance review contract before updating Inbox state. |
| `automation-api-routes.js` | automation list/actions/output preview | workspace-scoped/resource-scoped | Owner can manage broader automation; output preview must verify deliverable ownership. |
| `todo-api-routes.js` | Todo/Kanban-compatible todo surface | workspace-scoped | Uses configured Todo backend, currently official Kanban-compatible in production. |
| `kanban-card-api-routes.js` | Kanban/native board cards | workspace-scoped/resource-scoped | Growth-linked cards must preserve learning metadata and learner privacy. |
| `kanban-study-api-routes.js` | study workflows | workspace-scoped | Keep study source and artifact ACL checks in services. |
| `kanban-learning-guidance-api-routes.js` | learning guidance for cards | workspace-scoped | Do not expose full learner content outside authorized card views. |
| `learning-api-routes.js` | Growth overview/board shell | workspace-scoped | Owner and executor projections differ. |
| `learning-program-api-routes.js` | programs, sources, tasks, submissions, evaluations, audio | workspace-scoped/resource-scoped | Mutations are Owner or executor scoped depending on operation; summary-only privacy rules apply. |
| `learning-parent-review-api-routes.js` | parent review queue/actions | owner | Review mutations are Owner-only. |
| `learning-coin-api-routes.js` | coin summary/ledger/rewards | workspace-scoped, owner for mutation | Coin ledger writes go through reward settlement/coin services. |
| `platform-currency-api-routes.js` | Tongbao wallet and ledger | workspace-scoped | v399 exposes read-only wallet/ledger routes; wallet read lazily creates a default `0` Tongbao wallet for the workspace. |
| `file-artifact-api-routes.js` | artifact/file preview/download | resource-scoped | Must validate thread/message/group/automation access before streaming. |
| `directory-browser-api-routes.js` | directory preview/list | workspace-scoped/resource-scoped | Uses directory browser boundary service. |
| `directory-share-api-routes.js` | share/update/unshare directories | owner or sharing workspace | Read-only shares must reject writes downstream. |
| `directory-mutation-api-routes.js` | create/upload/delete | workspace-scoped/resource-scoped | Upload no overwrite by default; delete explicit/non-recursive. |
| `thread-read-upload-api-routes.js` | threads, messages, uploads | workspace-scoped/resource-scoped | Uploads attach to authorized thread context. |
| `thread-task-api-routes.js` | task rename/delete/interrupt | resource-scoped | Interrupt/delete must release queues and preserve auditability. |
| `single-window-group-chat-api-routes.js` | single-window/group chat/revoke | group/resource-scoped | Group artifacts require group membership and visible message attachment. |
| `thread-message-run-api-routes.js` | create user messages and Gateway runs | workspace-scoped/resource-scoped | Owner elevation, concurrency, access policy, and worker selection happen before Gateway run creation. |
| `event-stream-api-routes.js` | SSE event stream | access-key/resource-scoped | Stream only events the authenticated user can see. |
| `owner-elevation-api-routes.js` | temporary Owner elevation | owner | Explicit maintenance/elevation path only. |

## Change Checklist

- Add or update route inventory tests for new route modules.
- Decide auth mode before adding route code.
- Put business rules in a service/provider, not in dispatcher glue.
- Add focused route tests with Owner, workspace, spoofed workspace, and unauthorized cases.
- Update the relevant module doc and this reference when a route changes auth or ownership behavior.
