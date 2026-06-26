# Fallback Governance Contract

Contract version: `20260623-v1`.

## Purpose

Home AI and every plugin workspace must treat fallbacks as explicit temporary
or compatibility behavior, not as hidden fixes. A fallback that makes the
current symptom disappear without repairing the owning layer increases future
complexity and must not be called closure.

This contract applies to Home AI, embedded plugins, managed native clients,
Gateway/MCP profiles, deployment scripts, provisioning, data repair, static
clients, and cross-thread task-card work.

## Core Rules

No silent fallback.

No fallback without owner.

No fallback without visible status or bounded error state.

No fallback without removal or hardening path.

No mitigation may be called closure.

## Mitigation Versus Closure

Every non-trivial incident or repair must classify its result:

- `mitigation`: restores current user function or narrows impact, but the root
  cause is not fully repaired at the owning layer.
- `closure`: repairs the owning layer, proves the violated invariant now holds,
  and removes or explicitly bounds any temporary fallback.

A mitigation can be deployed when user function, availability, or data safety is
at immediate risk. It must still record the root-cause owner, the missing
closure work, validation for the restored behavior, and the removal/hardening
condition.

## Fallback Registry

New or extended fallback behavior must be registered in
`docs/IMPLEMENTATION_NOTES/fallback-registry.md` before the work is considered
complete.

Registry entries must include:

- `fallback_id`
- affected layer and owning workspace
- triggering condition
- user-visible or machine-visible status/error field
- why the fallback is currently necessary
- root cause that remains unresolved
- owner
- removal or hardening condition
- validation command or smoke
- expiry/review date or explicit `permanent_compatibility` classification

The registry is not a place to normalize hidden complexity. If a fallback is
extended repeatedly, the owning architecture must be re-evaluated and the next
task should target closure, not another fallback branch.

## AI Ops Intake Gate

H1/H2 work and production-impacting work must use the AI Operations Control
Plane intake. The intake context pack must expose root-cause governance fields:

- required diagnosis fields;
- mitigation versus closure classification;
- fallback registration requirement;
- fallback governance check command;
- blocked states such as `root_cause_classification_missing` and
  `fallback_status_unclassified`.

Codex threads must answer those fields before treating work as complete. A
task-card reply that reports only symptom suppression without these fields is a
mitigation report, not closure.

## Executable Check

`scripts/fallback-governance-check.js` is the executable guard for this
contract. It verifies that the governance contract, registry, docs index, test
matrix, architecture map, and AI Ops intake remain wired together.

When called with `--changed-file`, the check scans added code lines in the git
diff for high-risk fallback patterns such as:

- new `fallback` branches;
- Owner/default workspace fallback;
- empty `catch` blocks;
- local success messaging after server failure.

High-risk added lines must either be removed or carry an explicit
`fallback-governance:<fallback_id>` annotation that points to the registry.
The annotation is not approval by itself; it is a link that makes the fallback
auditable.

## Prohibited Patterns

The following are not acceptable closure:

- missing workspace binding falls back to Owner;
- missing key falls back to unauthenticated or local-only storage;
- server-save failure displays durable success;
- title/artist search substitutes for verified playback identity;
- MCP/toolset missing falls back to generic HTTP without explicit status;
- launchd or cron success depends on previous interactive shell state;
- UI hides precise backend failure behind a generic success state.

These patterns may appear only as registered mitigation with a bounded
hardening path, and only when they do not weaken workspace, auth, permission,
or data ownership semantics.

## Completion Standard

A task involving fallback behavior is complete only when:

- the task is classified as mitigation or closure;
- any fallback is registered or removed;
- root-cause owner and failing layer are named;
- validation proves the restored behavior and, for closure, the repaired
  invariant;
- task-card replies, docs, and handoffs state whether closure was reached;
- no raw secrets, access keys, cookies, launch tokens, private payloads,
  provider responses, or long logs are written into governance artifacts.
