# Root-Cause Architecture Contract

Contract version: `20260623-v3`.

## Purpose

Home AI and every Home AI plugin or managed client workspace must solve
problems at the owning architecture boundary whenever practical. The platform
should not accumulate local patches, silent fallbacks, duplicated policy, or
one-off production mutations that hide the real failure and increase long-term
complexity.

This contract applies to normal feature work, bug fixes, production incidents,
plugin repairs, deployment repairs, mobile/client fixes, Gateway/MCP work,
workspace provisioning, and cross-thread task-card handoffs. Fallback-specific
governance is defined in
`docs/PLATFORM_CONTRACTS/fallback-governance-contract.md`; this root-cause
contract owns the decision to prefer closure over mitigation.

## Root-Cause First Rule

Before implementing a non-trivial fix, identify the smallest owning layer that
can make the behavior correct by design:

- product or platform contract;
- service/provider or route boundary;
- persistence schema, migration, or data ownership;
- workspace provisioning, auth, permission, or binding;
- deployment, launchd, install, or runtime configuration;
- plugin contract, MCP schema, or Gateway toolset selection;
- client projection, cache, or visual state contract.

Fix that layer first. A local workaround is not complete if the underlying
contract, service, provisioning path, schema, or deploy/runtime setup still
allows the same class of failure to recur.

## Required Diagnosis

Every meaningful repair should leave bounded evidence of:

- the user-visible symptom;
- the failing layer and owning workspace;
- the expected invariant or contract that was violated;
- the root cause or the strongest current hypothesis;
- the reason the selected fix belongs at that layer;
- the focused validation that proves the invariant now holds.

For production incidents, restore service promptly, but do not treat service
restoration as architectural closure unless the root cause has also been fixed
or recorded as a bounded follow-up with owner, risk, and verification path.

## Preferred Fix Patterns

Prefer changes that reduce future branches and hidden state:

- move business rules into the existing service/provider boundary instead of
  duplicating them in UI, scripts, plugin glue, or Gateway prompts;
- repair the canonical provisioning or grant path instead of copying Owner
  credentials, hand-writing workspace config, or relying on private operator
  state;
- add deterministic migration, preflight, or install validation instead of
  requiring manual directory edits;
- make missing dependencies observable with explicit status and error codes
  instead of silently falling back to unrelated behavior;
- update the durable contract, module doc, runbook, or harness that owns the
  behavior;
- remove obsolete compatibility branches once the canonical path is verified;
- add focused tests or harness coverage at the boundary that failed.

## Patch And Fallback Limits

Fallbacks are allowed only when all of these are true:

- they protect current user function or data during a bounded incident;
- they do not weaken workspace, auth, permission, or data-ownership semantics;
- they are visible through status, logs, response fields, or user-facing state;
- they have a clear owner and removal or hardening follow-up;
- they are covered by focused tests or a production smoke where practical.

No silent fallback. No fallback without owner. No fallback without visible
status. No fallback without removal path. No mitigation may be called closure.
New or extended fallback behavior must be registered in the fallback registry at
`docs/IMPLEMENTATION_NOTES/fallback-registry.md`, or removed before the task is
considered complete.

Do not add broad catch-all fallbacks that:

- mask unavailable workspace bindings, missing access keys, missing MCP tools,
  or wrong workspace ids;
- silently switch to Owner data, local-only storage, title/artist search, generic
  HTTP calls, default user caches, or private machine paths;
- swallow server-save failures while presenting durable success;
- duplicate central auth, provisioning, route, schema, or persistence policy in
  plugin-local code;
- make a launchd or scheduled job depend on an interactive shell, interactive
  user cache, or previous manual command state;
- make future diagnosis harder by turning a precise error into generic success.

If the same fallback is extended repeatedly, stop and re-evaluate the owning
architecture. Repeated fallback extension is evidence that the root cause has
not been fixed.

## Emergency Hotfix Exception

An emergency hotfix may temporarily patch around the failing layer when user
function, data safety, or production availability is at immediate risk. The
closure requirement is still root-cause based:

- record the temporary nature of the patch;
- name the owning layer and follow-up fix;
- avoid broadening permissions or data visibility;
- add a targeted test or smoke for the restored behavior;
- remove or narrow the patch once the canonical fix lands.

## Cross-Workspace Handoff Rule

When the root cause belongs to another workspace, send a task card instead of
editing across the boundary. The card should name:

- the failing layer;
- the root-cause hypothesis or confirmed cause;
- the current reproduction or bounded evidence;
- the owning workspace and expected contract;
- the validation required for closure.
- a `Return Card Required` section naming the source thread and the expected
  completion, rejection, redirect, or blocked reply.

Task cards should not ask another workspace to add a local fallback when the
correct repair is a platform, provisioning, schema, or service-boundary fix.

The sender must remind the receiver to return a card. A task card without an
explicit return-card requirement is incomplete because the source thread cannot
close its user-facing work and may remain waiting or dormant with no evidence
of acceptance, rejection, progress, or completion.

## Task-Card Intake And Reply Rule

Receiving a cross-thread task card is not approval to do the requested work.
The receiving workspace must first classify the card before taking action:

- identify whether the requested mutation, deployment, test, data repair, or
  runtime operation belongs to the receiving workspace;
- check whether the sending workspace can complete the work through an existing
  contract, script, runbook, or plugin-owned validation path;
- reject or redirect cards that ask the receiver to perform work outside its
  ownership boundary;
- accept the card only when the failing layer or missing capability is owned by
  the receiving workspace.

If the card should not be accepted, the receiver must reply with a return card
or equivalent bounded response that explains:

- why the work is outside the receiver's ownership boundary;
- which workspace owns the next action;
- the exact existing contract, command, runbook, or validation path the sender
  should use;
- what condition would justify escalating the work back to the receiver.

If the card is accepted, the receiver owns the work through implementation,
validation, and closure. After completion, the receiver must send a return card
or equivalent bounded response back to the source thread with:

- the layer fixed and source changes made;
- tests, harnesses, deployment evidence, or production smoke results;
- any remaining owner-specific manual step or follow-up;
- confirmation that no raw secrets, access keys, cookies, launch tokens,
  private payloads, or long logs were exposed.

Do not leave a task card silently consumed. Every accepted or rejected card must
produce a bounded return card or equivalent reply so the source thread can close
its own user-facing work without guessing. The same reply requirement applies
when the receiver redirects, blocks, partially completes, or defers the work.

## Completion Checklist

A repair is complete when:

- the fix is implemented at the owning layer;
- temporary patches are removed or explicitly bounded;
- tests, harnesses, or smoke checks prove the contract now holds;
- durable docs are updated when behavior or policy changes;
- `.agent-context/HANDOFF.md` records current rollout state when the task was
  substantial;
- no raw secrets, access keys, cookies, launch tokens, private payloads, or long
  logs are stored in docs, tests, or handoffs.
