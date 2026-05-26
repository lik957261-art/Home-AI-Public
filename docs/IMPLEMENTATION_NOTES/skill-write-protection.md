# Implementation Note: Skill Write Protection

## Problem

Hermes skills are discovered and edited by Gateway profiles. In a linked or shared Skill store, a low-permission non-Owner run can accidentally write to a shared Skill if filesystem/profile layout allows it.

The product requirement is:

- Owner can update system/shared Skills.
- The creator of a user-created Skill can update that Skill.
- Other shared users can read the Skill but must not write it through Hermes Mobile Skill repair/write APIs.

## Service Boundary

`adapters/skill-permission-service.js` owns product-level write checks.

`adapters/skill-detail-provider.js` exposes Skill detail access metadata and must call the permission service before write operations such as `applyFix()`.

`server-routes/resource-api-routes.js` should authenticate write routes and delegate actual Skill write permission to the provider/service layer.

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

## System Shared Rule

System, official, shared-global, owner-full, Codex, Hermes, or deployment-wide shared Skill roots are treated as system-shared. Only Owner can write them.

When a Skill lacks creator metadata and is not confidently system-shared, default write behavior should fail closed with a creator-required style error.

## Frontend Rule

Skill repair/fix buttons should be hidden unless `skill.access.canWrite` is true. Read-only users should see a concise explanation that only the Skill creator or Owner can modify the Skill.

## Validation

- `node --check adapters\skill-permission-service.js`
- `node --check adapters\skill-detail-provider.js`
- `node --check server-routes\resource-api-routes.js`
- `node tests\skill-detail-provider.test.js`
- `node tests\resource-api-routes.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js`
- `git diff --check`

## Filesystem ACL Note

Filesystem permissions are still useful defense-in-depth for linked shared Skill stores, but Hermes Mobile should not rely on filesystem ACLs alone for product-visible write operations. Product write routes should perform explicit ownership checks first.
