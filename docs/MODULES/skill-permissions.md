# Module: Skill Permissions

## Responsibility

Skill permissions protect Skill Store read/write boundaries per workspace.
Each non-Owner workspace has its own local Skill Store under
`data/skill-profiles/<workspaceId>/skills`; Owner uses `owner-full`, and
deployment-wide shared Skills use `shared-global`.

## Core Files

- `adapters/skill-permission-service.js`
- `adapters/skill-detail-provider.js`
- `adapters/plugin-required-skill-preload-service.js`
- `adapters/plugin-capability-activation-service.js`
- `server-routes/resource-api-routes.js`
- `public/app-task-groups-ui.js`
- `adapters/gateway-workspace-provisioning-service.js`
- `scripts/configure-low-gateways.sh`
- `tests/skill-detail-provider.test.js`
- `tests/plugin-required-skill-preload-service.test.js`
- `tests/plugin-capability-activation-service.test.js`
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
- Gateway `HERMES_HOME/skills` is not an independent profile-local Skill Store.
  It must be a link to the workspace Skill Store for that Gateway template:
  Owner resolves to `owner-full`, non-Owner workspaces resolve to
  `<workspaceId>`, and deployment-wide shared Skills remain `shared-global`.
  Provider labels or legacy profile aliases such as `grok`, `deepseek`, or a
  slot name are not Skill Store ids; the Skill Store dimension is workspace,
  not model provider.
  Official Hermes Skill create/update flows that write under
  `HERMES_HOME/skills` must therefore land in the workspace store so sibling
  Gateways for the same workspace receive the same updated Skill bundle.
- Mac production worker home roots must follow the same rule. Profile-local
  `skills` and `memories` links may point through `/Users/hm-*/HermesWorkspace`,
  but their realpath must resolve to
  `/Users/hermes-host/HermesMobile/data/skill-profiles/<profileId>/skills` and
  `/Users/hermes-host/HermesMobile/data/skill-profiles/<profileId>/memories`.
  The corresponding isolated macOS worker user must be able to read and write
  the resolved store; otherwise official Hermes Skill creation, memory writes,
  plugin-required Skill preload, or Response grounding can drift back into a
  worker-local copy.
- Startup must treat a real profile-local `skills` directory as drift. The
  launcher should back it up under the profile's `skill-store-backups` directory
  and replace it with the correct workspace Skill Store link, instead of
  preserving or merging it implicitly at run time.
- Stale profile roots for deleted users must be backed up and removed instead
  of left as discoverable `skill-profiles/*` entries. A profile alias migrated
  to a stable workspace id, such as an old `xuyan` root after migration to
  `user-981731fe`, is also stale once the new root has been populated and worker
  links resolve to the new root.
- Product plugin provisioners that install Skills must install the complete
  keyless bundle required by that plugin into the target workspace's private
  Skill Store. Wardrobe onboarding specifically requires the full
  `productivity/wardrobe-style-operations` bundle with `references/` and
  `scripts/`; a minimal placeholder `SKILL.md` is a provisioning failure, not a
  usable grant.
- Required plugin Skill preloading may read only the selected workspace profile
  and `shared-global`; Owner maps to `owner-full` and `shared-global`. It must
  not enumerate every `skill-profiles/*` root to satisfy a missing required
  Skill for an ordinary user request.
- Required plugin Skill preloading loads the complete non-secret instruction
  bundle, not only `SKILL.md`. The preload may include bounded `.md` and `.txt`
  files from `references/` under the selected Skill root, while skipping
  sensitive filenames such as key, token, secret, credential, password, cookie,
  `access-key.txt`, and `workspace-key.txt`. If a required plugin Skill is
  missing, empty, unreadable, or reduced to a placeholder without its required
  references, the owning plugin workflow must fail closed before model
  execution.
- Capability catalog generation may mention authorized plugin Skill ids and
  short non-secret summaries, but it must not preload full optional plugin
  Skill bodies. Full plugin Skill content is loaded only for the current
  plugin's required bundle or after server-validated lazy activation of that
  plugin.

## API/UI

- Skill detail returns `access.canWrite`.
- UI write actions must be hidden or disabled when `access.canWrite` is false.
- `skills-analysis-fix` is authenticated, but actual write authorization is enforced by the Skill permission service.

## Validation

- `node tests\skill-detail-provider.test.js`
- `node tests\plugin-required-skill-preload-service.test.js`
- `node tests\resource-api-routes.test.js`
- `node tests\gateway-workspace-provisioning-service.test.js`
- `node tests\startup-scripts.test.js`
- `node tests\macos-production-profile-audit.test.js`
- Mac production profile audit:
  `sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-profile-audit.js --root /Users/hermes-host/HermesMobile --json`
- `node tests\task-list-ui.test.js`

## Constraints

- Do not rely only on filesystem symlink layout for product authorization.
- Do not enumerate all `skill-profiles/*` roots for ordinary user requests.
- Do not allow non-Owner shared workspace runs to mutate Owner/shared Skills through product APIs.
