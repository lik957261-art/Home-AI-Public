# Product Reality Audit Contract

Contract version: `20260625-v3`.

## Purpose

Product Reality Audit is the Home AI audit lane that finds gaps between what
the product is supposed to do and what the current system actually does.

This is not a narrow security scan, static lint pass, or bug-list generator. It
compares:

1. product intent and user workflow;
2. architecture and domain contracts;
3. code implementation and persistence behavior;
4. real UX state, including embedded/plugin flows;
5. executable tests, harnesses, smokes, and deployment readback.

The goal is to detect design/implementation drift early, before local
workarounds and fallback patches make the system harder to repair.

For deep product/design/architecture review, this contract is extended by
`deep-product-reality-audit-contract.md` version `20260625-v3`. A shallow pass over manifest actions,
labels, and route mappings is useful evidence, but it is only
`surface_product_reality` unless the audit also builds a documented product
model, core journey matrix, domain/state contract review, architecture review,
UX/failure-state review, and executable evidence review.

## Scope

This contract applies to:

- Home AI host audits;
- plugin workspace audits;
- audit-to-implementation task cards;
- implementation return cards;
- audit closure verification.

Product Reality Audit can be run manually for one workspace/plugin, or later as
part of scheduled audit requests. Scheduled automation may request this audit
lane, but the dedicated audit thread performs the actual review and routing.

Home AI is a trigger for this lane, not the auditor. A Home AI route or UI may
validate a target and send a request card, but it must not run the audit inside
the Home AI app process, Automation runner, CRON dispatcher, Gateway worker, or
a local Codex CLI process. The receiving central audit thread owns the audit
work and all downstream task-card fan-out.

Audit request senders must dynamically discover the current central audit
thread through Codex Mobile thread discovery at send time. Fixed Codex audit
thread ids are not durable configuration.

## Required Finding Classes

Every non-trivial finding should be classified with one or more of:

- `product_doc_gap`: product requirement, UX promise, or runbook language is
  stale, ambiguous, or incomplete.
- `implementation_gap`: code does not implement the documented or implied user
  workflow.
- `architecture_gap`: ownership, domain model, route/service boundary, or data
  flow is unclear enough to keep producing regressions.
- `ux_gap`: UI state, navigation, feedback, or embedded/plugin behavior differs
  from the intended workflow.
- `test_gap`: tests are missing, static-only, or do not prove the workflow
  users rely on.
- `fallback_debt`: a fallback, compatibility branch, or local-only path hides
  the root cause or presents degraded behavior as normal.
- `closure_gap`: a previous fix lacks return-card evidence, deployment
  readback, production smoke, or independent verification.

## Audit Method

The audit thread must start from current evidence:

1. canonical platform contracts and product docs;
2. plugin-local pointer docs and product/architecture docs;
3. source code, tests, scripts, and static assets;
4. current git state and bounded diffs;
5. read-only runtime or production evidence when the scope requires it.

For `product_reality` mode, the audit must read product and project documents
before source-first implementation inspection. The audit report should identify
the product thesis, two to four core journeys, domain/state contracts,
architecture boundaries, UX/failure-state reality, and executable test/harness
evidence. Missing, stale, contradictory, or unreasonable design docs are valid
findings; the audit must not force implementation to match a flawed design.
The audit must use X High reasoning. If the task-card/runtime path cannot
confirm X High execution, the audit must return blocked or redirected rather
than producing a shallow medium-effort result.

For multi-plugin Deep Product Reality requests, the audit thread must use the
batch ledger in
`docs/IMPLEMENTATION_NOTES/deep-product-reality-audit-batch-ledger.md`. A
multi-plugin return is not a completed audit unless every requested plugin id is
present in the coverage matrix with a terminal status. Any `closed_deep` row
must also include a bounded evidence digest, not only journey names. A
one-plugin return, acknowledgement loop, or repair-only closure is
`invalid_return` for the batch.

Runtime evidence for embedded plugins must enter through Home AI first. The
audit should use the host manifest/proxy/static routes that users actually
exercise, not the plugin's private loopback port as the primary path. Direct
plugin ports are secondary implementation evidence and cannot close a finding
about Home AI drawer/search/dock action routing, same-origin embedding,
owner-only plugin visibility, or host permission behavior.

When a Product Reality audit needs Owner-visible plugin surfaces, it may use the
Home AI audit owner read-only key through `X-Hermes-Web-Key`. This key exists
only for read-only audit evidence and Home AI rejects write methods before
dispatch. Raw key material must not be printed or copied into reports, task
cards, docs, or handoffs. If this host path or key is unavailable, the audit
must return `blocked` or redirect to Home AI platform repair rather than
silently substituting plugin-port evidence.

Implementation handoffs, source-thread summaries, and prior self-justification
are not audit evidence unless the user explicitly asks to audit those documents
as target material.

## Closure Standard

Closure requires all of the following:

- the owning workspace/layer is identified;
- Home AI or the scheduler sent one request card to the central audit thread,
  not one card per workspace implementation thread;
- the responsible implementation thread receives a bounded task card;
- the task card includes `Return Card Required`;
- the implementation thread returns `completed`, `rejected`, `redirected`, or
  `blocked`;
- the return includes changed files, validation, deployment/readback evidence
  when applicable, residual risks, and privacy confirmation;
- the audit thread performs an independent read-only closure verification.

The audit thread must not repair the finding directly while operating in audit
mode. A fallback, symptom suppression, extra UI warning, or local compatibility
branch is not closure unless the root cause is repaired or the fallback is
explicitly governed by `fallback-governance-contract.md` and the fallback
registry.

Deep Product Reality closure must be labeled using the deep contract closure
classes such as `closed_deep`, `closed_surface_only`, `partially_closed`,
`blocked_docs_missing`, or `blocked_runtime_evidence`. A route/label fix cannot
close the deep audit unless the corresponding product journey, domain state,
architecture boundary, UX/failure behavior, and executable evidence are also
verified.

An audit that returns quickly after one or two convenient small findings without
showing the required product model, core journey coverage, document evidence,
and skipped-boundary accounting is not a valid deep audit result.

## Report Standard

Product Reality Audit reports must be findings-first and concise. Each finding
should include:

- severity;
- finding class;
- concrete evidence with file/line, route, command, harness, screenshot id, or
  bounded runtime status;
- user workflow or product intent that is contradicted;
- owning workspace and layer;
- root-cause hypothesis;
- required repair surface;
- closure validation;
- task-card destination.

Reports and task cards must not include raw secrets, access keys, cookies,
launch tokens, private provider payloads, full logs, raw prompt transcripts, or
private user data.
