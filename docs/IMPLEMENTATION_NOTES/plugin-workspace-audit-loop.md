# Plugin Workspace Audit Loop

Status: V1 implemented for plan creation, validation, canonical Automation
storage, deterministic read-only report execution, summary-only Action Inbox
projection helpers, Mac production target configuration, Simplified Chinese
reports, and manual plugin workspace alignment audit trigger. Model-assisted
repair loops remain a follow-up.

## Product Position

Plugin workspace audit is a Home AI embedded-plugin capability, not a generic
Codex Mobile standalone feature. The user is configuring Home AI to inspect a
registered plugin workspace, produce an audit report, and surface follow-up
review items in Action Inbox. The first alignment phase is manually triggered;
nightly batch execution is intentionally deferred until report quality and task
card quality are stable.

The first version should be deliberately small:

1. Owner or an authorized workspace configures an audit plan for one registered
   plugin workspace.
2. Automation persists the schedule in the canonical scheduler.
3. At the scheduled time, Home AI launches a new read-only audit run with a
   fixed audit prompt and a resolved plugin workspace root.
4. The executor produces a bounded report.
5. Home AI stores audit history, upserts an Action Inbox review/error item, and
   optionally creates pending task-card suggestions for high-risk findings.

## Goals

- Inspect Home AI registered plugin workspaces manually in the first phase, and
  on a schedule in a later phase.
- Keep audit threads separate from ordinary development and chat threads.
- Compare plugin workspace docs, platform contracts, and implementation state
  to detect product-goal drift before repair work starts.
- Default to read-only operation with no repair, commit, push, deploy, or
  service restart.
- Deliver concise reports through audit history, plugin delivery directories,
  Action Inbox, and Web Push when configured.
- Keep the feature productized for public deployments: missing executor or
  missing workspace binding becomes a disabled diagnostic, not a private-path
  fallback.

## Non-Goals

- Do not add this as a Codex Mobile standalone scheduler or public default
  workflow.
- Do not audit arbitrary local paths that are not registered plugin workspaces.
- Do not audit the Home AI host workspace in the first alignment phase.
- Do not auto-fix code, write files, create commits, push branches, deploy
  services, or mutate plugin databases in version 1.
- Do not copy full diffs, raw logs, full model transcripts, secrets, launch
  keys, provider tokens, push endpoints, or private database paths into Inbox,
  long-lived diagnostics, or documentation.
- Do not run a natural-language audit-intent preflight before every ordinary
  chat message.

## Responsibility Boundaries

### Home AI Host

- Owns product authorization, plugin workspace resolution, manual audit trigger
  UI, future audit plan creation UI, Action Inbox projection, and Web Push
  metadata.
- Resolves the target plugin through the same effective-workspace plugin
  registry used by launch, topic, MCP/toolset, and delivery-directory surfaces.
- Converts natural-language audit requests only inside an explicit audit or
  Automation creation surface.

### Automation

- Owns schedule, manual run requests, pause/resume, retry, run history linkage,
  and canonical job persistence.
- Stores the audit plan as a job kind such as `plugin_workspace_audit`.
- Dispatches due runs quickly and leaves long audit execution to a bounded
  runner process.

### Audit Executor

- Runs with the target plugin workspace as `cwd`.
- Receives a fixed read-only prompt and structured audit scope.
- May use read-only commands and source inspection.
- Must not write to the repository, plugin data store, Home AI source checkout,
  runtime database, scheduler store, or production service roots.
- Produces a bounded Markdown or JSON+Markdown report.
- V1 uses `scripts/plugin-workspace-audit-runner.js`, a deterministic read-only
  runner called by `scripts/hermes-mobile-cron-dispatcher.py` for
  `kind=plugin_workspace_audit`. It does not launch ordinary model-backed CRON
  `run_job()` and does not require model proxy egress.

### Codex Mobile Embedded Plugin

- May provide a deep link to the audit thread or report when running inside Home
  AI.
- Does not own the scheduler, microphone/input behavior, Action Inbox records,
  or audit persistence.
- Standalone/public Codex Mobile remains unaffected.

### Action Inbox

- Stores summary-only `review` or `error` projections for audit runs.
- Links to the Automation detail, audit run detail, report preview, or plugin
  route.
- Does not store full reports, raw logs, raw model output, secrets, tokens, or
  local private paths.

## Job Shape

The first manual alignment trigger creates the same canonical
`plugin_workspace_audit` job shape and immediately requests a manual run. The
job uses a CRON-compatible one-shot placeholder such as `schedule=1m`,
`repeat=1`, `auditMode=alignment`, and `audit.triggerMode=manual`; the route
then immediately requests the existing Automation `run` action so execution is
queued for the next dispatcher tick.

The Automation job should be structured instead of prompt-only:

```json
{
  "kind": "plugin_workspace_audit",
  "pluginId": "codex-mobile",
  "workspaceId": "owner",
  "targetWorkspaceId": "owner",
  "workspacePathRef": "plugin_registry",
  "schedule": "0 22 * * 0",
  "auditMode": "alignment",
  "executor": "codex_readonly",
  "readonly": true,
  "delivery": {
    "auditHistory": true,
    "actionInbox": true,
    "webPush": true,
    "pluginDeliveryDirectory": true
  }
}
```

Rules:

- `workspacePathRef` should resolve through Home AI's plugin registry or
  platform contract. Persist raw absolute paths only when the deployment cannot
  avoid it, and never expose them to non-Owner clients.
- `pluginId` must exist in the host plugin registry and be enabled for the
  effective workspace.
- `readonly` must be true in version 1.
- `auditMode` supports `alignment`, `recent_changes`, `dirty_diff`, and
  `full_sample`. The default manual mode is `alignment`.
- The job may include a bounded `scope` object, such as file globs or max report
  size, but the server must validate that scope before dispatch.

## Execution Flow

1. User opens the explicit plugin audit surface from Action Inbox, Automation,
   plugin settings, or a plugin workspace management screen.
2. If natural language is used, Home AI calls a Skill-guided model to produce a
   structured audit draft. The draft is not trusted until host validation
   passes.
3. Home AI validates plugin id, workspace access, plugin provisioning,
   workspace path, schedule, audit mode, executor availability, and read-only
   policy.
4. For manual alignment audit, Automation creates a canonical one-shot job and
   immediately marks it for the next dispatcher tick. For scheduled audit,
   Automation creates or updates the canonical scheduled job.
5. At the manual or scheduled run time, the dispatcher creates a bounded child
   process for the read-only audit runner.
6. The executor reads Git metadata, bounded source markers, and for
   `alignment` mode prioritizes workspace context/docs and platform contract
   files before implementation samples. It then produces a Markdown report with
   severity, evidence, and recommended follow-up context.
7. Home AI stores the report under the audit history or plugin delivery
   directory, with retention and access control.
8. Home AI upserts an Action Inbox item:
   - `itemType=review` for successful reports with findings;
   - `itemType=info` for clean reports when the user requested receipts;
   - `itemType=error` for failed runs.
9. Optional Web Push opens the Inbox row, Automation detail, or report preview
   with same-window navigation.

## Read-Only Enforcement

Read-only must be enforced by policy and by runner mechanics.

Allowed examples:

- `git status --short`
- `git diff --stat`
- `git diff -- <bounded paths>`
- `git log --oneline --max-count=<n>`
- `rg`, `sed`, `ls`, `find` with bounded output
- reading focused docs and source files

Blocked examples:

- `apply_patch`, file writes, database writes, package installs, build outputs
  inside the repo, code generation, migrations, commit, push, deploy, restart,
  service-control commands, or credential export.
- arbitrary test commands in version 1, because many test suites write caches,
  snapshots, or temporary build artifacts into the repository. A later safe-test
  mode may mount a scratch directory and verify that repo state is unchanged.

The runner should snapshot `git status --short` before and after execution and
fail the run if the workspace changed. The failure report should include only a
bounded diagnostic, not raw modified file content.

## Audit Prompt Contract

The fixed prompt should require:

- code-review stance, findings first, ordered by severity;
- for `alignment` mode, read workspace docs first and compare documented goals,
  platform contracts, implementation state, stale documentation, security,
  privacy, cross-platform, deploy productization, extensibility, performance,
  UI consistency, and harness coverage;
- concrete file and line references when available;
- no implementation changes;
- no deployment, commit, push, package install, or service restart;
- no secret printing;
- concise report with residual risks and suggested next actions.

The prompt should receive structured scope separately from free text. Free text
from the user is treated as guidance, not authority to override read-only
policy.

## Report Contract

Minimum report fields:

- audit run id;
- plugin id and display name;
- target workspace id;
- audit mode and time window;
- source revision or dirty-state summary;
- findings with severity, evidence references, and rationale;
- recommended task-card drafts;
- skipped areas and reasons;
- executor diagnostics;
- retention metadata.

For `alignment` mode the user-facing report title should be
`插件工作区目标一致性审计 - <plugin>`, delivered in Simplified Chinese. The
report should include implemented/partial/missing documented goals when Codex
can determine them, document drift, platform-contract gaps, recommended task
card drafts, and uncertainty. It must not auto-repair code.

Reports may be Markdown for human reading, with optional JSON front matter for
machine projection. Long raw logs and full diffs should remain out of the
report; link to controlled artifacts only when they pass access control and
redaction.

## Action Inbox Projection

Audit Inbox items should use:

- `sourceType=automation` when the audit is schedule-owned;
- `sourceRef.kind=plugin_workspace_audit`;
- `sourceRef.pluginId`;
- `sourceRef.auditRunId`;
- safe report or Automation deep links;
- severity summary and finding count.

The Inbox item should not duplicate the report body. It is a triage pointer.
For manual alignment audit, `sourceType=automation` still applies because
Automation owns the canonical job/run record; `sourceRef.triggerMode=manual`
may be included by later projections.

## Security And Privacy

- Audit configuration is Owner-only by default. A narrower workspace-level
  delegation can be added later only if the target plugin workspace belongs to
  that workspace and policy allows self-audit.
- The target path must resolve through the plugin registry, not through raw user
  input.
- Reports and task-card suggestions must redact secrets, access keys, push
  endpoints, OAuth tokens, plugin launch tokens, private database paths, and raw
  customer content.
- Public deployments must not depend on private Codex profiles, private
  machine paths, hand-copied scheduler state, or one-time approvals.

## MVP

- Manually trigger a plugin workspace alignment audit from an explicit host
  surface.
- Create/read/update/delete scheduled audit plans from an explicit host surface.
- Support one plugin workspace per plan.
- Support `alignment`, `recent_changes`, and `dirty_diff`.
- Launch a read-only executor with a fixed prompt.
- Store a bounded report and Action Inbox review/error item.
- Disable with a bounded diagnostic when no executor is configured.

## Initial API And Configuration

The first implementation exposes the explicit creation route:

- `POST /api/automations/plugin-workspace-audits`
- `POST /api/automations/plugin-workspace-audits/run`

The request body is structured and does not go through the ordinary
natural-language Automation interpreter:

```json
{
  "workspaceId": "owner",
  "pluginId": "codex-mobile",
  "schedule": "0 22 * * 0",
  "auditMode": "recent_changes",
  "instructions": "Focus on recent route changes.",
  "dryRun": true
}
```

Manual alignment trigger:

```json
{
  "workspaceId": "owner",
  "pluginId": "codex-mobile",
  "auditMode": "alignment",
  "instructions": "Focus on product goal drift.",
  "dryRun": true
}
```

The manual route creates a canonical one-shot job with a CRON-compatible
placeholder schedule such as `1m`, `repeat=1`, and immediately requests a
`run` action. The dispatcher still owns actual execution, report creation,
Inbox projection, and run history.

Home AI resolves audit workspaces only from configured targets. Supported
configuration forms are:

- `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_TARGETS` /
  `HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_TARGETS`, a JSON object keyed by plugin id;
- `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH` /
  `HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_<PLUGIN_ID>_PATH` for a single target.

If no target is configured, creation fails with
`plugin_audit_target_unconfigured`. The server does not guess private local
paths.

The central Mac deploy script injects a productized default target map for
registered production plugin source roots under `<macRoot>/plugins`, including
`codex-mobile -> <macRoot>/plugins/codex-mobile-web`, `finance`,
`wardrobe`, `email`, `note`, `growth`, `moira`, and `health -> healthy`.
Installations with different roots should pass `--mac-root` or override the
environment variables. The runtime still validates that the resolved target is
an absolute existing directory and rejects protected paths.

The bridge persists `kind=plugin_workspace_audit`, `readonly=true`, and bounded
`audit` metadata. It rejects audit jobs that try to set `readonly=false`,
`script`, `context_from`, `enabled_toolsets`, `data_context`, model/provider
overrides, non-local delivery, or an executor other than `codex_readonly`.

At dispatch time, `scripts/hermes-mobile-cron-dispatcher.py` detects
`kind=plugin_workspace_audit`, skips the ordinary model proxy requirement, and
calls `scripts/plugin-workspace-audit-runner.js`. The runner:

- validates `readonly=true` in both the job and audit metadata;
- validates the target workspace is an absolute existing directory;
- runs bounded read-only commands such as `git status --short`,
  `git diff --stat`, `git log --oneline`, `git ls-files`, and a bounded
  `rg` marker scan;
- writes a Markdown report under the CRON output root for the job and returns a
  `MEDIA:<report>` line so existing Automation output preview can open it;
- omits the target workspace absolute path from the report and uses only
  `workspacePathRef`;
- upserts a summary-only Action Inbox review/error item when a configured
  runtime SQLite path is available through `HERMES_WEB_DB_PATH`,
  `HERMES_MOBILE_DB_PATH`, or the data-dir default.
- optionally runs a model-assisted Codex read-only review after the
  deterministic scan when
  `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED=1` or
  `HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_ENABLED=1`. The configured command
  defaults to `codex` and may be overridden with
  `HERMES_MOBILE_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND` /
  `HERMES_WEB_PLUGIN_WORKSPACE_AUDIT_CODEX_COMMAND`. The runner invokes
  `codex exec --sandbox read-only --cd <target> --ephemeral`, redacts the
  target absolute path from captured output, appends the bounded review to the
  Markdown report, and records a high-severity finding if the explicitly
  enabled Codex phase fails.
- delivers user-facing audit reports in Simplified Chinese while preserving
  source paths, function names, variable names, config keys, commands, and
  error codes in their original form.

## Phase 2

- Add safe scratch test mode for selected plugin-defined commands.
- Add audit history UI inside plugin management.
- Add recurring summary trends.
- Add nightly batch alignment audit for idle plugin workspaces only.
- Add cross-plugin dependency checks, such as host contract drift.
- Add richer task-card suggestions with user confirmation.
- Add Codex Mobile bridge execution as an alternative to local CLI execution
  where service-user auth should be delegated to the embedded Codex plugin.

## Long-Term

- Add Owner-whitelisted repair workflows that are separate from audit jobs.
- Add pull request creation or branch push only after explicit policy, access,
  and confirmation design.
- Add plugin-provided audit extensions through the platform contract, with
  strict read-only capability declarations.

## Test And Harness Plan

Implementation should add focused coverage before production use:

- service tests for audit plan validation and plugin workspace resolution;
- Automation route/provider tests for `plugin_workspace_audit` creation,
  update, pause/resume, and canonical scheduler projection;
- executor policy tests that reject write/commit/push/deploy modes in version 1;
- Action Inbox projection tests for summary-only review/error rows;
- public-install tests proving missing executor/profile disables the feature
  with a bounded diagnostic;
- privacy scan coverage for reports, diagnostics, and docs;
- optional visual harness for the audit creation surface and report deep link.

Current focused tests:

- `node tests/plugin-workspace-audit-service.test.js`
- `node tests/plugin-workspace-audit-runner.test.js`
- `node tests/cron-dispatcher-plugin-audit-harness.test.js`
- `node tests/automation-api-routes.test.js`
- `node tests/cron-bridge.test.js`
- `node tests/action-inbox-service.test.js`
- `node tests/api-route-inventory.test.js`
- `node tests/mobile-api-dispatcher.test.js`
- `node tests/architecture-refactor-boundary.test.js`

## Open Product Questions

- Whether non-Owner workspaces can schedule self-audits for their own plugin
  workspaces.
- Retention duration for audit reports and executor diagnostics.
- Whether clean reports should always create Inbox receipts or only when the
  user explicitly asks for them.
- Which plugin workspaces are first enabled: Codex Mobile, Wardrobe, Finance,
  Email, Health, Note, Growth, or a smaller Owner-only subset.
