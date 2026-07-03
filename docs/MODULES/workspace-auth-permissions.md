# Module: Workspace Auth And Permissions

## Responsibility

Workspace auth owns browser/API identity, Owner versus workspace accounts, Access Key lifecycle, workspace-scoped access policies, and permission-safe projections.

It is the product permission boundary. Gateway workers execute runs, but Hermes Mobile must decide which workspace, roots, shared directories, tools, Skill roots, and API surfaces a request can use before a run is created.

## Core Files

- `adapters/auth-provider.js`
- `adapters/mobile-runtime-access-policy-facade-service.js`
- `adapters/mobile-runtime-auth-facade-service.js`
- `adapters/runtime-workspace-catalog-service.js`
- `adapters/workspace-public-projection-service.js`
- `adapters/workspace-project-provider.js`
- `adapters/workspace-bindings-provider.js`
- `server-routes/workspace-api-routes.js`
- `scripts/repair-workspace-acl.ps1`

Related route/provider boundaries:

- Directory/share permissions: `docs/MODULES/directory-files.md`
- Skill write protection: `docs/MODULES/skill-permissions.md`
- Gateway worker selection: `docs/MODULES/gateway-pool.md`

## Rules

- Owner can manage global configuration, local workspaces, and workspace Access Keys.
- A workspace key maps to exactly one workspace identity for ordinary API access.
- Ordinary users must not receive other workspace keys, root paths, worker URLs, worker manifests, secret paths, runtime config, or integration credentials.
- Request body fields such as `workspaceId`, `actorWorkspaceId`, or `principalId` are hints only. Server-side auth must clamp or reject them according to the authenticated principal.
- Group chat and shared directories are explicit exceptions; they still require membership/share ACL checks.
- Composer server-file attachment references are Owner-only because they point
  at files that already exist on the server-side filesystem. Non-Owner sessions
  should upload local/system files through the normal upload route unless a
  future workspace-isolated server-share root has explicit ACL coverage.
- Owner ordinary chat still uses low-permission workers unless an explicit Owner-maintenance path is requested.
- Owner timed high-privilege approval must be visible to both model-run routing
  and route-level policy checks. Non-empty directory deletion is one of the
  guarded operations: low-permission runs should request Owner elevation, while
  approved maintenance runs must stay scoped to the exact requested target.
- Permission-boundary fallback detection must recognize both English and
  Chinese model text such as "current permission scope", "权限不足",
  "权限范围", "高权限", and "Owner 授权" so the client can offer the
  elevation action even if the model did not emit the structured marker.
- Hermes Mobile should not use natural-language text classifiers to pre-route
  ordinary AI messages into permission/elevation blocks before the model runs.
  Server-side code constructs the access policy and honors explicit
  Owner-maintenance approvals; model-side permission decisions are handled by
  the `productivity/hermes-mobile-permission-boundary-check` Skill together
  with Gateway toolset selection.

## Windows Native OS Isolation Direction

After the Windows WSL downline, Windows deployments should use native Windows
service accounts and NTFS DACLs instead of WSL-owned home directories.

Default local/development stance:

- run the listener, bridge host, native Gateway launcher, Whisper
  bridge, and CRON sidecar under the maintained Windows service/logon account;
- keep Home AI workspace authorization as the primary product boundary;
- store per-workspace plugin keys, Skill Stores, Memory Stores, and drive roots
  under `C:\ProgramData\HermesMobile\data`;
- enforce workspace access in route/service code and file APIs before model
  runs are created.

Higher-isolation stance for shared or production Windows hosts:

- create a Windows local user or group per sensitive workspace, analogous to
  the Mac `hm-*` users;
- grant each workspace account NTFS access only to its own drive root,
  Skill/Memory profile store, and authorized plugin-private directories;
- keep the host/listener account able to read bounded metadata required for
  routing, projection, and telemetry, but not raw workspace-private content
  beyond the explicit product access path;
- run workspace-specific Gateway/plugin subprocesses as the matching workspace
  account when the subprocess needs direct filesystem access.

Do not recreate the WSL split by passing `/home/<user>`, `Ubuntu-*`, `wsl.exe`, or
WSL distro-owner assumptions through Windows startup scripts. If Windows ACL
isolation is introduced, add a harness that proves both positive workspace
access and cross-workspace deny checks using Windows account tokens or explicit
DACL inspection.

## Access Key Handling

- First-run setup may show the Owner Access Key once.
- Generated workspace Access Keys may be shown once at creation/rotation.
- Access Key rotation, revocation, and local-workspace deletion confirmations
  must use the app-owned dialog layer, not browser-native `alert`/`confirm`/
  `prompt`, because native shells and embedded WebViews may block or suppress
  browser dialogs.
- Stored key material, API keys, OAuth tokens, VAPID private keys, push endpoints, and secret file contents must not be exposed in browser projections or docs.
- Revoking or rotating the current account key should force clients back to login rather than silently continuing.
- Public/reverse-proxied deployments should disable URL query Access Keys with
  `HERMES_MOBILE_DISABLE_QUERY_ACCESS_KEY=1` or
  `HERMES_WEB_DISABLE_QUERY_ACCESS_KEY=1`. Browser clients should authenticate
  with the `X-Hermes-Web-Key` header and the existing same-origin cookie path;
  `?key=` is a compatibility path only for local/private deployments because it
  can leak through logs, browser history, and referrers.
- Production API smokes must use `X-Hermes-Web-Key` or the same-origin
  `hermes_web_key` cookie. `X-Hermes-Access-Key` is not a Hermes Mobile
  authentication header and must not be used for `/api/status`,
  `/api/threads`, plugin APIs, deployment checks, or harnesses. Use
  `scripts/production-status-smoke.js --access-key-file <file>` instead of
  hand-writing a status probe, so the correct header and wrong-header denial
  check remain executable.
- The repeated failure mode is transport-level: the key file can be correct
  while the request fails because a plausible but unsupported header name was
  used. Treat `X-Hermes-Access-Key` as a regression probe only. If a production
  smoke succeeds with that header, the auth boundary is wrong; if a smoke uses
  that header as the positive auth path, the harness is wrong.
- Do not infer the HTTP header from the credential label. "Access Key" names the
  stored credential class; it does not imply `X-Hermes-Access-Key`. The positive
  browser/API transport remains `X-Hermes-Web-Key`, and every new production
  key-file smoke must carry a wrong-header negative assertion.
- Cookie/localStorage key storage remains a planned migration area. Do not
  remove cookie auth without first preserving embedded plugin iframe/proxy
  requests, because iframe navigations and static resource loads cannot attach
  the `X-Hermes-Web-Key` header.
- Home AI browser/workspace Access Keys are independent from plugin workspace
  credentials. Rotating or regenerating a Home AI workspace key must update only
  the Home AI access-key hash store and must not modify
  `plugin-workspace-authorizations.json`, `.hermes-*/access-key.txt`, or
  `.hermes-*/config.json`. Existing plugin grants must remain authorized and
  active unless the Owner explicitly grants, retries provisioning, revokes, or
  repairs that plugin.
- If a user reports a plugin problem immediately after regenerating a Home AI
  Access Key, first prove whether the plugin binding already had
  `provisioning_failed` or a plugin-side token mismatch. Do not assume Home AI
  key rotation requires re-binding every plugin; that would couple unrelated
  credential domains and can break migrated plugin data.
- Product Reality and plugin audits use a separate audit owner read-only key
  when they need Owner-visible Home AI host surfaces. The default key file is
  `DATA_DIR/secrets/audit-owner-readonly-web-key.secret`, overrideable with
  `HERMES_MOBILE_AUDIT_OWNER_READONLY_KEY_PATH` or
  `HERMES_WEB_AUDIT_OWNER_READONLY_KEY_PATH`; an environment-provided key may
  use `HERMES_MOBILE_AUDIT_OWNER_READONLY_KEY` or
  `HERMES_WEB_AUDIT_OWNER_READONLY_KEY`. This key is accepted only through the
  normal `X-Hermes-Web-Key` transport and authenticates with Owner visibility
  for read-only evidence. The HTTP runtime rejects `POST`, `PUT`, `PATCH`,
  `DELETE`, and other write methods with `audit_readonly_key_write_denied`
  before route dispatch. Never print or store the raw audit key in reports,
  task cards, docs, handoffs, logs, or screenshots.
- Local family workspace records created from the Mac `data/drive` root must
  use `data/drive/users/<workspaceId>` as their default workspace root unless
  the Owner explicitly configured a custom root. A legacy auto-derived path
  such as `data/drive/<display-name>` is a repair target, not a valid current
  default, because directory projection, file APIs, Gateway access policy, and
  plugin-private config discovery all key off the effective workspace root.
- Workspace onboarding may create a Home AI workspace Access Key and selected
  plugin workspace bindings in one Owner-confirmed workflow, but those remain
  separate credential domains. The one-time Home AI key is returned only in the
  Owner apply response. Plugin provisioners still create or verify their own
  workspace-local `.hermes-<plugin>` key/config and must not copy or derive
  credentials from the Home AI key.
- Native secure secret handoff uses the same Home AI browser/API Access Key
  transport. `POST /api/native/secure-secrets` resolves workspace and actor
  from `X-Hermes-Web-Key`; request body workspace, actor, plugin-key, cookie,
  or launch-token fields are not authority. The broker currently accepts only
  explicit iOS clipboard source `ios_clipboard`, target plugin `codex`, and
  purpose `current_task`. It stores the value only in process-local short-lived
  memory, returns `secretRef` plus bounded metadata, and rejects audit
  read-only keys because creating or resolving a secret is a write/use action.
  General UI projections must never include the raw value; plaintext
  resolution is limited to the scoped target-plugin runtime path and should not
  be copied into model-visible chat or diagnostics.

## Family Profile Memory Projection

Family Profile Memory is a product projection layer, not a filesystem security
layer against Owner.

Owner runs Home AI on Owner's personal computer and can administer local data,
backups, production databases, and runtime files through the operating system.
Hermes Mobile must not pretend that runtime permissions can prevent Owner from
reading local data.

The permission boundary still matters for non-Owner users and Gateway runs:

- Owner may read complete household profile projections.
- Ordinary workspace users may read their own `member_self` profile records and
  profile records explicitly classified as `household_summary` or
  `shared_with_members`.
- Cross-workspace generated insights default to `owner_only`.
- Gateway context assembly must use the authenticated actor and effective
  workspace to select profile projections.
- Group chat, Web Push, Action Inbox, and plugin runs must receive only bounded
  profile summaries allowed by their resource-specific policy.
- Every profile record and insight must preserve source workspace, visibility,
  sensitivity, provenance, and idempotency metadata so projection decisions are
  auditable.

## Validation

- Workspace API tests should cover Owner and non-Owner projections.
- Permission-sensitive route tests should include spoofed `workspaceId` / `actorWorkspaceId` requests.
- Auth tests should cover URL query-key denial when the public deployment toggle
  is enabled.
- Auth tests must cover that workspace key rotation leaves plugin authorization
  and plugin-local key/config files unchanged.
- Run `node tests\mobile-runtime-access-policy-facade-service.test.js` when
  changing runtime access-policy sanitize/harden composition.
- Run `node tests\mobile-runtime-auth-facade-service.test.js` when changing
  delayed runtime delegation to the auth provider.
- Run `node tests\architecture-refactor-boundary.test.js` when changing auth composition or route wiring.
- Use metadata-only verification for production auth checks; do not print raw keys.

## Debug Pointers

If a user can see too much, check the projection service first. If a user can write too much, check the route-level authorization and the downstream service permission check. If a user sees "no permission" across chat, directory, and plugins, first compare the workspace record's `defaultWorkspace` / `allowedRoots` with the canonical `data/drive/users/<workspaceId>` root and then verify plugin authorization records plus workspace-local `.hermes-<plugin>` config/key directories. If a Gateway run can do too much, check the access policy passed into `gateway-run-start-service` and the selected worker profile.
