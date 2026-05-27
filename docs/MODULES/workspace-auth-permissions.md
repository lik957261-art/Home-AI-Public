# Module: Workspace Auth And Permissions

## Responsibility

Workspace auth owns browser/API identity, Owner versus workspace accounts, Access Key lifecycle, workspace-scoped access policies, and permission-safe projections.

It is the product permission boundary. Gateway workers execute runs, but Hermes Mobile must decide which workspace, roots, shared directories, tools, Skill roots, and API surfaces a request can use before a run is created.

## Core Files

- `adapters/auth-provider.js`
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
- Owner ordinary chat still uses low-permission workers unless an explicit Owner-maintenance path is requested.
- Hermes Mobile should not use natural-language text classifiers to pre-route
  ordinary AI messages into permission/elevation blocks before the model runs.
  Server-side code constructs the access policy and honors explicit
  Owner-maintenance approvals; model-side permission decisions are handled by
  the `productivity/hermes-mobile-permission-boundary-check` Skill together
  with Gateway toolset selection.

## Access Key Handling

- First-run setup may show the Owner Access Key once.
- Generated workspace Access Keys may be shown once at creation/rotation.
- Stored key material, API keys, OAuth tokens, VAPID private keys, push endpoints, and secret file contents must not be exposed in browser projections or docs.
- Revoking or rotating the current account key should force clients back to login rather than silently continuing.

## Validation

- Workspace API tests should cover Owner and non-Owner projections.
- Permission-sensitive route tests should include spoofed `workspaceId` / `actorWorkspaceId` requests.
- Run `node tests\architecture-refactor-boundary.test.js` when changing auth composition or route wiring.
- Use metadata-only verification for production auth checks; do not print raw keys.

## Debug Pointers

If a user can see too much, check the projection service first. If a user can write too much, check the route-level authorization and the downstream service permission check. If a Gateway run can do too much, check the access policy passed into `gateway-run-start-service` and the selected worker profile.
