# Fallback Registry

This registry tracks active, newly added, or newly extended fallback behavior
across Home AI, plugins, managed clients, Gateway/MCP, deployment scripts, and
production repair flows.

The governing contract is
`docs/PLATFORM_CONTRACTS/fallback-governance-contract.md`.

## Registry Schema

Every fallback entry must include:

| Field | Required | Description |
| --- | --- | --- |
| `fallback_id` | yes | Stable id used by code comments and task-card replies. |
| `status` | yes | `active`, `mitigation_only`, `pending_removal`, `retired`, or `permanent_compatibility`. |
| `layer` | yes | Owning layer such as service, route, plugin, Gateway/MCP, static client, deployment, or native shell. |
| `owning_workspace` | yes | Workspace responsible for closure. |
| `trigger_condition` | yes | Exact condition that activates the fallback. |
| `visible_status` | yes | User-visible or machine-visible status/error field proving the fallback is not silent. |
| `why_needed_now` | yes | Why the system cannot remove the fallback immediately. |
| `unresolved_root_cause` | yes | Root cause that remains after mitigation. |
| `owner` | yes | Person, thread, plugin, or platform owner responsible for closure. |
| `removal_condition` | yes | Condition that retires or hardens the fallback. |
| `validation` | yes | Focused test, harness, or smoke that proves bounded behavior. |
| `review_by` | yes | Review date, release, or `permanent_compatibility` rationale. |

## Active Entries

```text
fallback_id: codex_mobile_workspace_read_compat_20260630
status: mitigation_only
layer: Codex Mobile workspace-delegation runtime permission policy
owning_workspace: /Users/example/path
trigger_condition: workspace delegation is enabled for a non-exempt target workspace and CODEX_MOBILE_WORKSPACE_DELEGATION_ENFORCE_SANDBOX_GUARD is not set
visible_status: Codex Mobile workspace-delegation RPC diagnostics show sandbox=danger-full-access or sandboxPolicyType=dangerFullAccess with approvalPolicy=on-request; docs reference this fallback id
why_needed_now: current Codex app-server workspace-write turns can generate a managed effective profile where the workspace root is write-only, so fresh plugin continuations can enter cwd but cannot read existing source files or run git status
unresolved_root_cause: app-server workspace-write / managed permission-profile semantics do not provide effective read+write access for the workspace root
owner: Codex Mobile Web implementation thread plus Codex app-server runtime owner for final hardening
removal_condition: a fresh delegated Music continuation under /Users/example/path can read src/roon-bridge-service.js, .agent-context/PROJECT_CONTEXT.md, and git status while using workspace-write or an equivalent least-privilege profile without dangerFullAccess
validation: Codex Mobile focused tests for runtime guard and source-write guard; production smoke must create a fresh Music continuation and run pwd, sed -n '1,5p' src/roon-bridge-service.js, git status --short, and sed -n '1,80p' .agent-context/PROJECT_CONTEXT.md
review_by: 2026-07-15
notes: This is a mitigation, not closure. It restores current plugin workspace reads while retaining source-write approval guard; direct writes that do not raise app-server approval requests remain the known risk until the app-server hard sandbox is repaired.
```

Historical compatibility branches are not grandfathered as architectural
closure. When a historical fallback is touched, extended, or used to close a
new incident, it must either be removed or registered here.

## Entry Template

```text
fallback_id:
status:
layer:
owning_workspace:
trigger_condition:
visible_status:
why_needed_now:
unresolved_root_cause:
owner:
removal_condition:
validation:
review_by:
notes:
```

## Example

```text
fallback_id: example_registered_fallback
status: mitigation_only
layer: plugin service
owning_workspace: plugin-example
trigger_condition: upstream provider is unavailable but cached verified data exists
visible_status: provider_status=unavailable, data_source=verified_cache
why_needed_now: restores read-only user visibility during provider incident
unresolved_root_cause: provider auth renewal is not yet repaired
owner: plugin-example thread
removal_condition: provider auth renewal succeeds in production smoke
validation: node tests/example-provider-auth-service.test.js
review_by: 2026-07-01
notes: Example only; not an active fallback.
```
