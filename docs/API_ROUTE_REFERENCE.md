# Hermes Mobile API Route Reference

Last updated: 2026-06-06.

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

## Browser/API Auth Transport Contract

The product credential may be called an Access Key, but the HTTP transport
contract for browser/API smokes is `X-Hermes-Web-Key` or the same-origin
`hermes_web_key` cookie. `X-Hermes-Access-Key` is not a Hermes Mobile API auth
header and must not be used as the positive auth path for `/api/status`,
Gateway Pool smokes, deployment checks, plugin APIs, or ad-hoc diagnostics.
Do not derive the header name from the credential label, secret file name,
environment variable name, or old internal Hermes naming. "Access Key" is the
credential class; `X-Hermes-Web-Key` is the transport header.
Do not add `X-Hermes-Access-Key` as an accepted alias. It is intentionally kept
as a wrong-header probe so that harnesses can prove the auth boundary rejects
plausible but unsupported transport names.

Production status checks must use
`node scripts\production-status-smoke.js --access-key-file <file> --base <origin> --json`
or an equivalent committed harness. The checked harness first proves
`/api/public-config` on the same origin, then authenticates `/api/status?detail=1`
with `X-Hermes-Web-Key`, then proves the same key is rejected when sent under
`X-Hermes-Access-Key`. Harness output may include non-secret header names such
as `authHeader` and `wrongAuthHeader`, but must not print key contents or raw
key file paths.

If a status probe reports an invalid key after using `X-Hermes-Access-Key`,
treat that as a transport-header failure until the canonical smoke proves
otherwise. If `X-Hermes-Access-Key` is accepted, that is an auth-boundary
regression. See `docs/RUNBOOKS/production-api-auth-header.md`.

## Route Modules

| Module | Main Surface | Auth Mode | Notes |
| --- | --- | --- | --- |
| `public-api-routes.js` | `/api/public-config`, login/setup | public | First-run setup may create Owner key; do not expose secrets. |
| `system-api-routes.js` | status, client version, app update | public client-version probe; access-key status; owner mutations | `/api/client-version` must remain reachable without a browser Access Key and returns only version compatibility metadata unless an authenticated key is also present. Status projections must redact worker URLs and secret paths for non-Owner. |
| `runtime-config-api-routes.js` | runtime Gateway, Web Push, VAPID config | owner | Stores config metadata/paths, not plaintext key material. |
| `push-api-routes.js` | VAPID public key, subscriptions, tests, receipts | access-key, owner for admin views | Payloads and receipts must not expose endpoints or secrets to unauthorized users. |
| `native-device-api-routes.js` | iOS native APNs device register/unregister/test | access-key, workspace-scoped | Uses `X-Hermes-Web-Key`, never plugin keys. The native shell registers `platform=ios`, `pushProvider=apns`, `deviceToken`, `workspaceId`, app bundle/version/build metadata, `environment=sandbox|production`, and `source=home_ai_native`; the route clamps workspace access and raw APNs tokens are never returned or logged. |
| `weixin-api-routes.js` | Weixin ingress/outbound, forward targets | ingress-key or workspace-scoped | Ingress events use sidecar auth; browser forward target reads are workspace-scoped. |
| `workspace-api-routes.js` | workspace list/create/update/delete | access-key, owner for management | Ordinary users see only their workspace projection. |
| `workspace-onboarding-api-routes.js` | workspace onboarding plan/apply | owner | `plan` is side-effect free. `apply` orchestrates workspace record, one-time Home AI key, macOS executor steps, Gateway profiles, selected plugin grants, and validation. Without a configured macOS provisioning executor it returns a blocked diagnostic before side effects. |
| `access-key-api-routes.js` | workspace key status/rotate/revoke | owner | Plaintext key shown only once on generation/rotation. |
| `resource-api-routes.js` | shared directories, Skill detail/analysis/fix | workspace-scoped/resource-scoped | Skill write is delegated to `skill-permission-service`. |
| `hermes-plugin-api-routes.js` | embedded plugin list/manifest/proxy/notifications | access-key, workspace-scoped, proxy path unauthenticated after launch | Notification events upsert summary-only `sourceType=plugin` Inbox items and send Web Push through Hermes; same-origin proxy paths do not expose raw plugin keys. |
| `plugin-topic-usage-api-routes.js` | `/api/plugin-topic-usage` quick-action usage preferences | access-key, workspace-scoped | Stores bounded app/action usage counters plus workspace UI preferences such as `pinnedBottomTabs` and `pluginOrder` for the selected workspace. This is the source of truth for Capability Entry Hub ordering; browser `localStorage` is only a startup/offline cache. |
| `note-receipt-api-routes.js` | save assistant receipt to Note; request Note install | access-key, workspace-scoped/resource-scoped | Reads the authorized Hermes thread/message, materializes artifacts through the artifact resolver, and calls Note `POST /api/v1/notes` with bounded base64 attachments only. `/api/note/install-request` validates the requester workspace and creates a deduped Owner Action Inbox approval when Note is not installed for that workspace. |
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
