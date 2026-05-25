# Module: Skill Permissions

## Responsibility

Skill permissions protect Skill write operations while allowing shared read access.

## Core Files

- `adapters/skill-permission-service.js`
- `adapters/skill-detail-provider.js`
- `server-routes/resource-api-routes.js`
- `public/app-task-groups-ui.js`
- `tests/skill-detail-provider.test.js`
- `tests/resource-api-routes.test.js`

## Rules

- New Skills should carry creator/owner metadata when created through product flows.
- System/shared Skills are writable by Owner.
- Shared Skills are read-only to non-Owner accounts.
- Owner low-permission runs may still need to write Owner-owned Skills; do not equate low-permission Gateway with non-Owner.
- Missing creator metadata on non-system shared Skills should fail closed for write operations.

## API/UI

- Skill detail returns `access.canWrite`.
- UI write actions must be hidden or disabled when `access.canWrite` is false.
- `skills-analysis-fix` is authenticated, but actual write authorization is enforced by the Skill permission service.

## Validation

- `node tests\skill-detail-provider.test.js`
- `node tests\resource-api-routes.test.js`
- `node tests\task-list-ui.test.js`

## Constraints

- Do not rely only on filesystem symlink layout for product authorization.
- Do not allow non-Owner shared workspace runs to mutate Owner/shared Skills through product APIs.
