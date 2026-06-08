# Workspace Onboarding Orchestration

This note defines the Home AI workspace onboarding workflow for family
workspaces on Mac production. It is the durable design document for the first
service implementation and the follow-up privileged macOS helper.

## Goal

Creating a family workspace must become an Owner-controlled Home AI workflow,
not a Codex-operated manual runbook. The target flow is:

1. Owner enters a workspace id, display name, and selected plugin set.
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

The service deliberately reuses existing components instead of duplicating
their business rules:

- workspace record creation: `upsertLocalWorkspace`;
- Home AI workspace key: `rotateWorkspaceAccessKey`;
- Gateway candidate profiles: `ensureWorkspaceGateway`;
- plugin provisioning: `hermesPluginService.grantWorkspace`.

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
5. `gateway.profiles`
6. `mac.launchd`
7. `plugin.<id>` for each selected plugin
8. `validation.smokes`

Selected plugin steps are required by default. `allowPluginFailures=true`
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

The current implementation has an injection point named
`workspaceSystemProvisioningExecutor`. When no executor is configured,
`/api/workspace-onboarding/apply` returns:

- `status=blocked`;
- `error=system_provisioning_executor_unavailable`;
- `blockedBeforeSideEffects=true`.

This is intentional. Until the privileged helper is implemented, apply must not
partially create a family workspace and leave the Mac OS user/ACL layer missing.

The future executor must expose only whitelisted actions:

- `ensure_mac_user`;
- `ensure_workspace_roots`;
- `ensure_workspace_acl` or `repair_workspace_acl`;
- `ensure_launchd_services`;
- `run_workspace_onboarding_smokes`.

It must not expose arbitrary shell, raw sudo, raw keys, plugin access keys,
OAuth tokens, cookie stores, or unbounded logs to the model or browser.

## Required Production Evidence

Before a new family workspace can be declared active on Mac production, the
workflow must prove:

- the matching `hm-*` macOS user exists;
- the private worker root and live workspace root exist with private
  permissions;
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

## Follow-Up Work

1. Implement the Mac privileged executor as a separate service/helper with
   allowlisted actions and focused tests.
2. Add a production dry-run smoke that calls `/api/workspace-onboarding/plan`.
3. Add a real Mac apply smoke against a disposable workspace once the helper is
   installed.
4. Add Owner UI for workspace id, display name, plugin selection, dry-run plan,
   confirmation, and one-time Access Key delivery.
5. Add persisted onboarding state if long-running or retryable production
   applies become common.
