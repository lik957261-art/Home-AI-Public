# Deep Product Reality Audit Contract

Contract version: `20260625-v4`.

## Purpose

Deep Product Reality Audit is the stronger Product Reality lane for Home AI and
plugin workspaces. It exists because an action-route or manifest audit can find
surface drift, but it does not prove that the product, design, architecture,
implementation, UX, persistence, failure states, and tests describe the same
system.

This contract supplements `product-reality-audit-contract.md`. When both
contracts apply, the deeper requirement wins.

For multi-plugin audit rounds, this contract also requires the batch ledger in
`docs/IMPLEMENTATION_NOTES/deep-product-reality-audit-batch-ledger.md`. A
multi-plugin audit is not complete until every requested target has a terminal
ledger status and the final return passes the batch return validator rules.

## Non-Goals

This audit is not:

- a plain production/security scan;
- an inventory of manifest actions and route handlers;
- a source-string test review only;
- a request for the audit thread to implement fixes;
- a requirement to force code to match a flawed design document.

The audit may find that code is wrong, that docs are wrong, or that the design
itself is incomplete, overpromised, unsafe, or unreasonable.

## Required Evidence Order

The audit thread must build the product model from documents before judging the
code. It must not start from convenient code surfaces and then infer the
product from implementation.

Read evidence in this order, when present:

1. Home AI canonical audit/platform contracts:
   - `docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md`
   - `docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md`
   - `docs/PLATFORM_CONTRACTS/deep-product-reality-audit-contract.md`
   - root-cause architecture, fallback governance, deployment, mobile visual,
     and plugin workspace contracts relevant to the target.
2. Home AI host/module docs relevant to the target runtime path.
3. Target workspace safety rules and docs index:
   - `AGENTS.md`
   - `docs/HOME_AI_PLATFORM_CONTRACT.md`
   - `docs/DOCS_INDEX.md`
   - `README.md` or `docs/README.md`
4. Product and user-experience documents:
   - product requirements;
   - design notes;
   - user workflow docs;
   - MCP or tool requirement docs;
   - UI/visual/harness rules.
5. Architecture and implementation documents:
   - architecture boundaries;
   - module/service docs;
   - data and state model docs;
   - deploy/runbook docs;
   - test matrices.
6. Source, tests, scripts, static assets, git metadata, and bounded runtime
   evidence.

If the target workspace does not have product/design/architecture docs for a
major feature surface, the absence is evidence. Report it as a documentation or
design gap instead of silently reducing the audit to code inspection.

Implementation handoffs and thread summaries remain excluded by the audit
thread governance contract unless the user explicitly names them as target
evidence.

## Required Audit Model

Before listing findings, the audit must produce a compact model of the product:

- **Product Thesis**: what the product claims to be for, who it serves, and
  which outcomes it promises.
- **Core Journey Matrix**: two to four high-value user journeys. Each row must
  name the actor, trigger, intended completion state, user-visible failure
  state, data or external system touched, current implementation evidence, and
  test/harness evidence.
- **Domain/State Contract Review**: identity, workspace binding, capability
  gates, persistence lifecycle, synchronization lifecycle, failure/degraded
  states, and fallback behavior.
- **Architecture Reality Review**: whether the implementation has coherent
  services/providers/adapters, ownership boundaries, deploy/runtime equivalence,
  and test seams for the journeys being audited.
- **UX Reality Review**: whether the UI, embedded route, error copy,
  navigation, empty state, loading state, and post-action feedback match the
  product thesis and journey matrix.
- **Test/Harness Reality Review**: whether the tests execute behavior at the
  right boundary instead of only checking strings, docs, or manifest shape.
- **Design Critique**: whether the documented product design is internally
  coherent, realistically implementable, privacy-safe, and aligned with Home AI
  platform boundaries.

The final report may keep these sections short, but it must show that the audit
did this modeling work. If a finding comes only from a manifest action and a
single route mapping, label it as `surface_product_reality` and do not treat it
as full deep Product Reality closure.

## Required Assessment Axes

Every deep per-plugin result must include explicit audit opinions for three
axes:

- `architecture`: ownership boundaries, service/provider structure,
  state/persistence model, deployment/runtime equivalence, and whether the
  architecture can support the product thesis without hidden coupling.
- `implementation`: current source behavior, state transitions, failure
  handling, test seams, maintainability, and whether executable evidence proves
  the core journeys.
- `ux`: navigation, visible affordances, empty/loading/error states, copy,
  post-action feedback, trust/provenance cues, and whether the embedded Home AI
  path feels truthful to the user.

Each axis must include:

- `verdict`: one of `aligned`, `improvement_recommended`, `finding`,
  `blocked`, or `not_applicable`;
- `opinion`: a bounded auditor judgment, not just a file list;
- `evidence`: bounded document/source/test/runtime references supporting the
  opinion;
- `improvements`: concrete recommended improvements when `verdict` is
  `finding` or `improvement_recommended`.

The audit may recommend improvements even when it does not raise an H1/H2
defect. Those recommendations must be labeled `improvement_recommended` and
kept separate from required repair findings. A plugin cannot be marked
`closed_deep` by saying only that no blocking findings were found; it must show
why architecture, implementation, and UX are acceptable for the audited scope.

## Multi-Plugin Batch Rule

A request that names more than one plugin is a batch, not a single free-form
audit answer. The audit thread must use a coordinator ledger before drafting
plugin findings.

The ledger must track every requested plugin id, per-plugin status, journey
count, findings sent, repair cards, closure queue, blocked reasons, bounded
evidence digest, architecture/implementation/UX assessment axes, and privacy
review. The audit thread must not mark the batch `completed` while any target
plugin is missing or has a non-terminal status.

Valid terminal plugin statuses are:

- `closed_deep`;
- `findings_sent_deep`;
- `closed_surface_only`;
- `partially_completed`;
- `blocked`;
- `not_applicable`.

For a multi-plugin request, a final return that covers only one plugin is
`invalid_return`, even if that plugin has a valid deep finding or closure. The
source thread must send the batch back for continuation with the missing target
ids.

For each `closed_deep` plugin row, the final return must include a bounded
evidence digest: documents read, selected core journeys, source/test/runtime
evidence trails, skipped boundaries, and unresolved open questions. Listing only
journey names or saying "docs/tests present" is not enough for deep closure.
For every `closed_deep`, `findings_sent_deep`, `closed_surface_only`, or
`partially_completed` row, the return must also include the three assessment
axes above. This makes the audit opinion inspectable even when the row is not
yet closed.
The final batch return must also include the full batch ledger as a fenced
`ledger_json` block so the source thread can run
`scripts/deep-product-reality-batch-ledger-validator.js --body-file` before
accepting or returning the batch.

## Required Reasoning Level

Deep Product Reality audits must run with the highest available Codex reasoning
level.

Home AI audit request cards must state:

- preferred model/profile: `gpt-5.5` through `hm-owner-openai-xhigh` when a
  Home AI/Gateway profile is used;
- required reasoning effort: `xhigh`, sent as the Codex Mobile task-card
  `reasoningEffort` field and repeated in the card body;
- local medium-reasoning final text is not sufficient for deep Product Reality
  closure.

When a Codex Mobile source-thread delivery receipt shows
`delivery.reasoningEffort=xhigh` and
`injectionRuntime.reasoningEffort=xhigh`, that receipt is acceptable runtime
evidence for the audit thread. The audit thread may rely on those bounded
receipt fields even if the target-side local tools do not expose a separate
runtime telemetry API.

If the receiving Codex thread or task-card runtime cannot confirm that the work
is running at X High reasoning, the audit must return `blocked_runtime_evidence`
or `redirected` to the Codex Mobile/Home AI platform owner instead of producing
a shallow audit result. An audit may continue only after the task-card/tooling
path or target thread is made capable of X High execution.

## Minimum Depth Rules

A deep Product Reality audit is incomplete unless it covers all of the
following:

- at least two core user journeys from product docs or visible product claims;
- at least one journey that touches persistence, synchronization, external
  provider state, or workspace ownership;
- at least one failure/degraded/empty-state path;
- at least one architecture boundary that explains where the product logic
  should live;
- at least one executable test or harness boundary for each repaired or audited
  critical journey;
- design-document consistency, including whether the design overpromises beyond
  implemented or governed capability.

Depth also requires effort evidence. For each target, the report must include:

- the product/design/architecture documents actually read, or a
  `blocked_docs_missing` classification;
- the selected core journeys and why they are high-value;
- at least one source/test/runtime evidence trail for each core journey;
- explicit open questions and skipped evidence boundaries.
- architecture, implementation, and UX axis opinions with evidence-backed
  improvements when the audit sees a non-blocking but material product-quality
  opportunity.

Finding one or two small issues quickly is not enough to complete a deep audit
unless the report also proves the minimum model and evidence coverage above. If
the audit stops after shallow findings, it must return `partially_closed` or
`closed_surface_only`, not `closed_deep`.

If the target has fewer than two real journeys, the audit must say so and
classify the product scope as too small, placeholder-heavy, or underdocumented
where appropriate.

## Finding Classes

Deep Product Reality findings may use the base Product Reality classes and the
following stronger classes:

- `surface_product_reality`: the issue is real but limited to labels, manifest
  actions, route hints, or shallow UI entry points.
- `journey_gap`: an end-to-end user journey cannot reach its documented or
  implied completion state.
- `domain_model_gap`: data ownership, state transitions, capability gates, or
  provider identities are underspecified or implemented inconsistently.
- `design_gap`: the product/design document is incomplete, contradictory,
  infeasible, unsafe, or not aligned with platform boundaries.
- `architecture_gap`: implementation structure makes product behavior hard to
  reason about, test, or repair.
- `evidence_gap`: current tests, smokes, screenshots, or deployment readbacks
  cannot prove the product journey.

Severity should follow user consequence and repair risk, not just whether an
exception is thrown. A misleading successful save, hidden fallback, or impossible
documented workflow can be H1/H2 even when the server returns `200`.

## Design Critique Rule

The audit thread may challenge product design and documentation. It must not
assume the document is automatically correct or that code should always be
changed to match it.

Valid design findings include:

- a product promises a workflow that should not exist in the current privacy,
  safety, or ownership boundary;
- the docs combine separate actors, capabilities, or persistence models into one
  confusing journey;
- the UI asks users to trust a result without enough provenance or failure
  visibility;
- a workflow requires cross-workspace mutation without a task-card/ownership
  boundary;
- a feature is described as product-ready while tests and harnesses only prove a
  placeholder.

For these findings, closure may be a design/docs correction, a scoped product
decision, or an implementation change, depending on the owning layer.

## Host Evidence Rule

Embedded plugin runtime evidence must use Home AI host routes as the primary
user-path evidence, per `audit-thread-governance-contract.md` and
`product-reality-audit-contract.md`.

Direct plugin loopback ports are secondary evidence only. They can help narrow a
plugin-owned defect but cannot close host entry, permission, owner-only
visibility, same-origin proxy, or embedded route behavior.

## Closure Standard

Deep Product Reality closure requires:

- a completed implementation return card or explicit design decision return;
- independent audit verification against the original Product Thesis and Core
  Journey Matrix;
- source/prod or deploy/readback evidence where runtime behavior changed;
- executable test/harness evidence for product-critical journeys, or a recorded
  residual `evidence_gap`;
- no remaining hidden fallback that presents degraded behavior as normal;
- privacy-safe evidence only.

Use closure labels precisely:

- `closed_deep`: product thesis, core journeys, domain state, architecture, UX,
  and executable evidence are aligned for the audited scope.
- `closed_surface_only`: a route/label/action mismatch was fixed, but deeper
  journeys were not audited.
- `partially_closed`: some journeys or boundaries are closed and others remain
  open.
- `blocked_docs_missing`: product/design docs are insufficient to determine
  intended behavior.
- `blocked_runtime_evidence`: required host or production readback is
  unavailable in the audit context.

Reports must not include raw secrets, access keys, cookies, launch tokens,
private provider payloads, full logs, raw prompt transcripts, or private user
data.
