# Implementation Note: Skill Write Protection

## Problem

Hermes skills are discovered and edited by Gateway profiles. In a linked or shared Skill store, a low-permission non-Owner run can accidentally write to a shared Skill if filesystem/profile layout allows it.

The product requirement is:

- Owner can update system/shared Skills.
- The creator of a user-created Skill can update that Skill.
- Other shared users can read the Skill but must not write it through Hermes Mobile Skill repair/write APIs.
- Each workspace/user has an independent local Skill Store. Switching the
  Hermes Mobile workspace changes the Skill Store view, including for Owner
  when Owner is simulating another user's workspace.

## Service Boundary

`adapters/skill-permission-service.js` owns product-level write checks.

`adapters/skill-detail-provider.js` exposes Skill detail access metadata and must call the permission service before write operations such as `applyFix()`.

`server-routes/resource-api-routes.js` should authenticate write routes and delegate actual Skill write permission to the provider/service layer.

Skill detail, analysis, and fix routes are workspace-scoped. They must call
`requireWorkspaceAccess()` for the requested workspace and pass a scoped auth
context into `skill-detail-provider`; this prevents Owner's `owner-full` Skill
Store from leaking into another selected workspace.

## Ownership Sources

The permission service may read creator/owner metadata from `SKILL.md` frontmatter, including:

- `creatorWorkspaceId`
- `createdByWorkspaceId`
- `ownerWorkspaceId`
- `workspaceId`
- `creatorPrincipalId`
- `createdByPrincipalId`
- `ownerPrincipalId`
- `principalId`
- `creator`
- `createdBy`

It may also infer ownership from profile roots, such as `skill-profiles/<profile>/skills`, when the root clearly maps to a profile-level creator.

For workspace-local stores, the profile directory is the normalized workspace
id, for example `skill-profiles/weixin_test_1/skills`. The manifest label may
remain `workspace:weixin_test_1`, but Windows filesystem paths must not rely on
colon-containing directory names.

## Skill Store Isolation

`adapters/skill-detail-provider.js` must scope roots before resolving a Skill:

- Owner workspace scope: `owner-full`, `shared-global`, packaged/system Skill
  roots, and Owner-only bridge fallback.
- Non-Owner workspace scope: `<workspaceId>`, `shared-global`, and
  packaged/system Skill roots.
- Non-Owner requests must not enumerate sibling `skill-profiles/*` directories.
- Non-Owner requests must not fall back to the global child bridge if the scoped
  direct resolver misses.

`adapters/gateway-workspace-provisioning-service.js` must create
`data/skill-profiles/<workspaceId>/skills` when a workspace Gateway is
provisioned or when an existing workspace binding is repaired.

`scripts/configure-low-gateways.sh` must link each worker profile's `skills`
directory to the Skill Store selected by manifest `skillWorkspaceIds`. Wildcard
or Owner profiles keep the Owner full Skill Store; a single non-Owner
`skillWorkspaceIds` entry maps to that workspace's private Skill Store.

## System Shared Rule

System, official, shared-global, owner-full, Codex, Hermes, or deployment-wide shared Skill roots are treated as system-shared. Only Owner can write them.

When a Skill lacks creator metadata and is not confidently system-shared, default write behavior should fail closed with a creator-required style error.

## Frontend Rule

Skill repair/fix buttons should be hidden unless `skill.access.canWrite` is true. Read-only users should see a concise explanation that only the Skill creator or Owner can modify the Skill.

## Validation

- `node --check adapters\skill-permission-service.js`
- `node --check adapters\skill-detail-provider.js`
- `node --check adapters\gateway-workspace-provisioning-service.js`
- `node --check server-routes\resource-api-routes.js`
- `node tests\skill-detail-provider.test.js`
- `node tests\resource-api-routes.test.js`
- `node tests\gateway-workspace-provisioning-service.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js`
- `git diff --check`

## Filesystem ACL Note

Filesystem permissions are still useful defense-in-depth for linked shared Skill stores, but Hermes Mobile should not rely on filesystem ACLs alone for product-visible write operations. Product write routes should perform explicit ownership checks first.
