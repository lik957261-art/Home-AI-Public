# Workspace Onboarding Orchestration

This note defines the Home AI workspace onboarding workflow for family
workspaces on Mac production. It is the durable design document for the first
service implementation and the follow-up privileged macOS helper.

## Goal

Creating a family workspace must become an Owner-controlled Home AI workflow,
not a Codex-operated manual runbook. The target flow is:

1. Owner enters a workspace id, display name, and selected plugin set.
   The default set for a fresh public setup is the full workspace-private
   business plugin set: Wardrobe, Health, Finance, Email, Note, and Growth.
   Codex plugin edition is special/Owner-oriented and is not part of this
   ordinary workspace onboarding default.
   Restricted media accounts are a separate narrow workspace type: selecting
   `account_type: media` in the Access Key manager creates a Home AI workspace
   key whose plugin projection is limited to Music and Movie. It does not grant
   the ordinary business plugin set and does not make Music/Movie ordinary
   workspace-grantable plugins.
2. Home AI returns a dry-run provisioning plan.
3. Owner confirms apply.
4. Home AI creates the workspace record and one-time browser Access Key.
5. A restricted macOS provisioning executor ensures the OS user, roots, ACLs,
   and LaunchDaemons.
6. Gateway workspace profiles and Skill Store bindings are created or refreshed.
7. Selected plugins are granted through their existing provisioning contracts.
8. Production smoke checks prove the new workspace does not fall back to Owner.

The model may help collect inputs and explain diagnostics, but it must not run
arbitrary privileged shell. Privileged work is limited to a whitelist executor
surface.

## New Code Surface

- `adapters/workspace-onboarding-service.js`
  owns planning, apply orchestration, status projection, and bounded
  diagnostics.
- `server-routes/workspace-onboarding-api-routes.js`
  exposes Owner-only API routes:
  - `POST /api/workspace-onboarding/plan`
  - `POST /api/workspace-onboarding/apply`
- `server-routes/mobile-api-composition.js`
  wires onboarding after plugin service creation so plugin grants can reuse
  `hermesPluginService.grantWorkspace`.
- `server-routes/mobile-api-dispatcher.js`
  routes onboarding after ordinary workspace CRUD and before plugin APIs.
- `adapters/workspace-system-provisioning-executor-service.js`
  owns the restricted macOS system action surface for workspace OS users,
  private roots, ACL repair, Gateway profile materialization, LaunchDaemon
  plist/start-script generation, manifest metadata repair, and focused smokes.
- `adapters/workspace-system-provisioning-helper-client-service.js`
  is the listener-side Unix socket client for the root helper.
- `scripts/workspace-system-provisioning-helper.js`
  runs as the root-owned local helper and delegates only to the restricted
  executor surface.
- `public/app-access-key-manager-ui.js`
  adds the Owner-side family workspace onboarding entry inside the Access Key
  manager sheet. The UI calls the dry-run plan endpoint first, requires the
  current form state to still match that plan before apply, renders bounded
  step diagnostics, and displays the returned Home AI workspace Access Key only
  through the existing one-time generated key block.

The service deliberately reuses existing components instead of duplicating
their business rules:

- workspace record creation: `upsertLocalWorkspace`;
- Home AI workspace key: `rotateWorkspaceAccessKey`;
- Gateway candidate profiles: `ensureWorkspaceGateway`;
- plugin provisioning: `hermesPluginService.grantWorkspace`.

When `HERMES_WEB_OWNER_DEFAULT_WORKSPACE` / `HERMES_MOBILE_OWNER_DEFAULT_WORKSPACE`
points at the Mac live `data/drive` root, `upsertLocalWorkspace` must default
new family workspace records to `data/drive/users/<workspaceId>`. It must not
derive the root from the display label. A previously auto-derived legacy root
such as `data/drive/<display-name>` should be migrated on the next Owner upsert
when the Owner did not explicitly set a custom root.

## Plan Shape

`planOnboarding(input)` is side-effect free and returns:

- `workspaceId`;
- `label` / `displayName`;
- derived `macUser`, for example `hm-xulu`;
- live and worker paths;
- selected `pluginIds`;
- ordered steps.

Planned steps:

1. `workspace.record`
2. `home_ai.access_key`
3. `mac.user`
4. `mac.roots`
5. `mac.acl`
6. `gateway.profiles`
7. `plugin.<id>` for each selected plugin
8. `mac.launchd`
9. `validation.smokes`

Selected plugin steps are required by default. When the request does not supply
an explicit plugin list, the service plans
`wardrobe`, `health`, `finance`, `email`, `note`, and `growth`. The Owner UI
must render the same six options, checked by default. `allowPluginFailures=true`
keeps plugin failures as diagnostics without failing the whole onboarding.

## Apply Semantics

`applyOnboarding(input, runtime)` is sequential and idempotency-friendly. Each
step returns one of:

- `ok`;
- `failed`;
- `manual_required`;
- `blocked`;
- `skipped`.

Required non-plugin failures stop later dependent steps. Required plugin
failures make the final onboarding status `provisioning_failed` but do not stop
later plugins, so one run can capture the complete plugin failure surface.

The raw Home AI workspace Access Key may be returned once in the authenticated
Owner apply response. It must not be logged, stored in docs, written to
handoffs, embedded in URLs, or included in plugin provisioning results.

## macOS Privileged Executor Boundary

The implementation has an injection point named
`workspaceSystemProvisioningExecutor`. `mobile-server-runtime.js` injects the
restricted macOS executor only when
`HERMES_MOBILE_WORKSPACE_SYSTEM_EXECUTOR_ENABLED=1` or
`HERMES_WEB_WORKSPACE_SYSTEM_EXECUTOR_ENABLED=1` is set. On Mac production,
the listener normally runs as `hermes-host`, so privileged execution must go
through the root-owned Unix socket helper by setting
`HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET` or
`HERMES_WEB_WORKSPACE_SYSTEM_HELPER_SOCKET`. The helper socket is a local
process boundary, not a generic sudo or shell surface.

When no executor is configured, `/api/workspace-onboarding/apply` returns:

- `status=blocked`;
- `error=system_provisioning_executor_unavailable`;
- `blockedBeforeSideEffects=true`.

This is intentional. Apply must not partially create a family workspace and
leave the Mac OS user/ACL layer missing when privileged execution is not
available.

The executor exposes only whitelisted actions:

- `ensure_mac_user`;
- `ensure_workspace_roots`;
- `ensure_workspace_acl` or `repair_workspace_acl`;
- `ensure_launchd_services`;
- `run_workspace_onboarding_smokes`.

It does not expose arbitrary shell, raw sudo, raw keys, plugin access keys,
OAuth tokens, cookie stores, or unbounded logs to the model or browser. It
validates workspace ids, `hm-*` users, Gateway profile names, launchd labels,
and Mac absolute paths before performing any action. External commands are
invoked with fixed command paths and argument arrays.

`ensure_mac_user` must ensure every workspace worker account is a member of the
shared runtime group, `hermes-workers` by default or
`HERMES_MOBILE_WORKER_GROUP` when explicitly configured. Existing `hm-*`
accounts are repair targets too; creating the user is not enough. The group is
how isolated workers traverse the shared production runtime without granting
access to a developer home directory.

`repair_workspace_acl` repairs the target workspace data root, the target Skill
profile root, and the target worker's write access to the shared
`data/uploads` root used by upload/file handoff. The uploads ACL is applied to
the root directory only, not recursively to historical uploaded files. This
keeps the repair aligned with the target-only ACL harness, which validates both
the workspace drive root and shared upload staging access for the new `hm-*`
worker.

The root helper must run from the production app tree and listen on a local
Unix socket such as:

```text
/Users/example/path
```

The helper owns the socket directory permissions and chowns the socket to the
listener user. The listener calls it through
`workspace-system-provisioning-helper-client-service.js`. The listener must not
be granted broad passwordless sudo just to make onboarding work.

`ensure_launchd_services` repairs each target worker's Mac manifest metadata:

- `osUser`;
- `launchdLabel`;
- `telemetryStateDbPath`;
- `telemetryResponseStoreDbPath`.

Gateway workspace profile provisioning must assign each selected worker a
workspace-owned per-worker API-server key file under
`data/secrets/gateway-workers`, such as `hm-xulu-openai-1.key` and
`hm-xulu-deepseek-1.key`. It must not copy `apiKeyFile`, `api_key_file`, or
inline `api_key` values from template rows.

It also materializes the worker profile directory under
`/Users/<hm-user>/HermesWorkspace/.hermes-gateway/profiles/<profile>/`, writes
`config.yaml`, writes `start-<profile>.sh` with live Mac file-plugin roots, and
writes a cold `/Library/LaunchDaemons/<label>.plist` with explicit
`UserName`, `WorkingDirectory`, environment variables, log paths,
`RunAtLoad=false`, and `KeepAlive=false`.

## Required Production Evidence

Before a new family workspace can be declared active on Mac production, the
workflow must prove:

- the matching `hm-*` macOS user exists;
- the private worker root and live workspace root exist with private
  permissions;
- the workspace Skill/Memory profile root is private but writable by the
  listener, Owner operations, and the matching `hm-*` worker;
- the worker user can traverse only authorized live roots;
- cross-user deny checks pass for Owner files, Skill Store, Memory Store, and
  `.hermes-*` plugin private roots;
- Gateway selected profile belongs to the target workspace;
- required LaunchDaemons are loaded but non-warm workers do not use
  `RunAtLoad=true` or `KeepAlive=true`;
- selected plugin grants have `provisioningStatus=active`;
- plugin MCP/schema activation uses the target workspace binding and does not
  fall back to Owner;
- wrong-header and wrong-workspace auth probes fail closed.

The onboarding validation step is target-scoped for profile, Gateway toolset,
and worker filesystem ACL failures. `macos-production-profile-audit.js`,
`macos-gateway-manifest-toolset-smoke.js`, and
`macos-worker-filesystem-access-harness.js` can still observe global production
metadata in their ordinary standalone modes, but the onboarding executor must
invoke the ACL harness with the target workspace id and `hm-*` user. It only
fails the new workspace when issues target that workspace, its newly
materialized Gateway profiles, or its own worker filesystem boundary.
Unrelated historical profile/plugin/toolset/ACL issues are preserved as bounded
ignored diagnostics and must be handled by the normal production-closure
backlog, not by failing a new family workspace that is otherwise correctly
provisioned.

## Owner UI Surface

The Owner UI entry is intentionally attached to the existing Access Key manager
instead of a separate page because family workspace onboarding produces a
one-time Home AI Access Key and requires Owner-only access. The sheet exposes:

- workspace id and display name inputs;
- selected plugin checkboxes for `wardrobe`, `health`, `finance`, `email`, and
  `note`;
- a `Preview plan` action that calls `POST /api/workspace-onboarding/plan`;
- a confirm/apply action that first reuses the latest matching plan or requests
  a fresh `POST /api/workspace-onboarding/plan`, then calls
  `POST /api/workspace-onboarding/apply`;
- no native `window.confirm` dependency for apply, because installed PWA
  contexts can suppress or mishandle browser modal dialogs; the apply button
  and in-flight status panel are the confirmation surface;
- an in-flight run status panel after confirm, so the Owner sees that the
  request was sent; if the current form has no matching plan, the panel appears
  before the fresh plan is requested and then updates to show the ordered steps
  while waiting for the synchronous apply response;
- bounded plan/result evidence with step ids, statuses, paths, plugin ids, and
  errors, but no raw key material;
- one-time generated key display through `state.generatedAccessKey` when the
  apply response includes `credentials.homeAiAccessKey`.

The browser keeps the raw key only in the existing generated-key UI state. The
stored onboarding result is redacted to `credentials.homeAiAccessKey=true/false`
so rerendered diagnostic panels do not retain the plaintext key.

## Follow-Up Work To Deployment

1. Commit and push the executor implementation and docs.
2. Deploy to Mac production, install/start the root helper LaunchDaemon, and
   enable `HERMES_MOBILE_WORKSPACE_SYSTEM_EXECUTOR_ENABLED=1` plus
   `HERMES_MOBILE_WORKSPACE_SYSTEM_HELPER_SOCKET=<socket>` in the listener
   LaunchDaemon only after the updated app and tests are present.
3. Run a production dry-run smoke that calls `/api/workspace-onboarding/plan`
   for a disposable workspace id.
4. Run one real Mac apply smoke against the disposable workspace, then verify
   `hm-*` user creation, private roots, ACL deny checks, manifest metadata,
   LaunchDaemon loaded/cold state, profile audit, manifest toolset smoke, and
   worker ACL harness.
5. Remove or quarantine disposable workspace artifacts if the smoke was only a
   deployment proof.
6. Run final Mac closure validation after UI wiring and before declaring the
   onboarding workflow production-ready.
7. Add persisted onboarding state if long-running or retryable production
   applies become common.
