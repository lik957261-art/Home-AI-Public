# Module: Skill Permissions

## Responsibility

Skill permissions protect Skill Store read/write boundaries per workspace.
Each non-Owner workspace has its own local Skill Store under
`data/skill-profiles/<workspaceId>/skills`; Owner uses `owner-full`, and
deployment-wide shared Skills use `shared-global`.

## Core Files

- `adapters/skill-permission-service.js`
- `adapters/skill-detail-provider.js`
- `server-routes/resource-api-routes.js`
- `public/app-task-groups-ui.js`
- `adapters/gateway-workspace-provisioning-service.js`
- `scripts/configure-low-gateways.sh`
- `tests/skill-detail-provider.test.js`
- `tests/resource-api-routes.test.js`
- `tests/gateway-workspace-provisioning-service.test.js`
- `tests/startup-scripts.test.js`

## Rules

- New Skills should carry creator/owner metadata when created through product flows.
- System/shared Skills are writable by Owner.
- Shared Skills are read-only to non-Owner accounts.
- Skill detail, analysis, and repair routes are workspace-scoped. The frontend
  must pass the selected workspace, and the route must call
  `requireWorkspaceAccess()` before resolving any local Skill root.
- When Owner switches into another workspace, Skill Store reads and repairs use
  that workspace view instead of Owner's `owner-full` view. This keeps the UI
  consistent with "simulate this user's account" behavior.
- Non-Owner Skill detail/analysis must not fall back to the global Skill bridge
  when the workspace-local store cannot resolve a Skill.
- Owner low-permission runs may still need to write Owner-owned Skills; do not equate low-permission Gateway with non-Owner.
- Missing creator metadata on non-system shared Skills should fail closed for write operations.
- Workspace creation/provisioning must create the physical
  `data/skill-profiles/<workspaceId>/skills` directory. Gateway launch scripts
  must link each ordinary user worker's `skills` directory to the matching
  workspace Skill Store based on manifest `skillWorkspaceIds`.
- Product plugin provisioners that install Skills must install the complete
  keyless bundle required by that plugin into the target workspace's private
  Skill Store. Wardrobe onboarding specifically requires the full
  `productivity/wardrobe-style-operations` bundle with `references/` and
  `scripts/`; a minimal placeholder `SKILL.md` is a provisioning failure, not a
  usable grant.

## API/UI

- Skill detail returns `access.canWrite`.
- UI write actions must be hidden or disabled when `access.canWrite` is false.
- `skills-analysis-fix` is authenticated, but actual write authorization is enforced by the Skill permission service.

## Validation

- `node tests\skill-detail-provider.test.js`
- `node tests\resource-api-routes.test.js`
- `node tests\gateway-workspace-provisioning-service.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\task-list-ui.test.js`

## Constraints

- Do not rely only on filesystem symlink layout for product authorization.
- Do not enumerate all `skill-profiles/*` roots for ordinary user requests.
- Do not allow non-Owner shared workspace runs to mutate Owner/shared Skills through product APIs.
