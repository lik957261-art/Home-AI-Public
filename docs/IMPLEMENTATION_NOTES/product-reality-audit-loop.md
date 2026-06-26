# Product Reality Audit Loop

Status: V1 implemented as a request-card trigger into the dedicated Codex audit
thread. Home AI does not run the audit locally.

## Objective

Product Reality Audit turns the user's recurring maintenance problem into a
repeatable Home AI workflow: detect when product intent, architecture, code,
UX, and tests no longer describe the same system, then route the repair to the
owning workspace thread with a required return card and audit verification.

It is intentionally different from a generic bug scan:

- it can report implementation insufficiency even when no exception is thrown;
- it can report UX or workflow drift even when the route is technically valid;
- it can report test and harness gaps when current tests cannot prove the user
  workflow;
- it can report previous-fix closure gaps when deployment/readback/return-card
  evidence is missing.

## Runtime Path

The V1 path treats Home AI as a trigger only:

1. Action Inbox or a future scheduler selects one registered plugin target and
   an audit mode.
2. `pluginWorkspaceAuditService` validates plugin visibility, configured
   workspace path, read-only policy, and audit mode.
3. Home AI dynamically queries Codex Mobile's thread API to discover the
   current Home AI source thread and the current `Plugin Workspace Audit`
   thread. It must not store a fixed audit thread id in source, config, docs,
   or runtime state.
4. Home AI sends one Codex Mobile task card to the central
   `Plugin Workspace Audit` thread. The card contains the target plugin,
   audit mode, bounded guidance, return-card requirements, and privacy rules.
5. The audit thread performs the actual read-only audit in Codex. It owns
   workspace fan-out, repair-card routing, implementation return-card tracking,
   and independent closure verification.
6. The audit thread sends one final return card back to the Home AI source
   thread with `completed`, `rejected`, `redirected`, or `blocked`.

For a multi-plugin Deep Product Reality request, step 5 must use the batch
ledger in
`docs/IMPLEMENTATION_NOTES/deep-product-reality-audit-batch-ledger.md`. The
audit thread must first create a coordinator plan, then complete or explicitly
block one work item per target plugin. A final return card is valid only when
the coverage matrix includes every requested plugin with a terminal status.
Completing one plugin, or entering one plugin's repair/closure loop, does not
complete the batch.

The Home AI app/server must not run the deep audit inside Automation, CRON,
Gateway, a local Codex CLI process, or the host app process. Existing local
runner code is legacy diagnostic infrastructure, not the product path for this
audit loop.

Runtime evidence for embedded plugins must start from the Home AI host path,
not from the plugin's private loopback port. The audit thread should use Home AI
manifest/proxy/static routes for product-state evidence, then use plugin ports
only as secondary implementation evidence when narrowing ownership. This is
required for drawer/search/dock action routing, same-origin embedding,
owner-only plugin visibility, and permission-boundary checks.

Home AI exposes a separate audit owner read-only key for audits that need
Owner-visible plugin surfaces such as Codex Mobile or Music. The key uses the
normal `X-Hermes-Web-Key` transport and is stored outside source under the Home
AI data directory. It authenticates with Owner visibility but Home AI rejects
non-`GET`, non-`HEAD`, and non-`OPTIONS` requests before dispatch. Reports and
task cards may name the configured key-file path and `audit_owner_readonly`
source label, but must never include the raw key. If the host path or key is
unavailable, the audit thread must return `blocked` or redirect to Home AI
platform repair rather than silently marking plugin-port evidence as product
closure.

## Manual Trigger Defaults

Manual plugin audit creation defaults to:

```json
{
  "auditMode": "product_reality",
  "readonly": true,
  "triggerMode": "manual",
  "delivery": "central_audit_thread_task_card"
}
```

The older `alignment` mode remains available for narrow document/goal
comparison, but it is no longer the default manual lane. The default lane must
include product intent, architecture, implementation, UX, and executable
evidence.

## Deep Audit Defaults

Manual `product_reality` requests use the deep Product Reality contract:

- `docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md`
- `docs/PLATFORM_CONTRACTS/deep-product-reality-audit-contract.md`

The required reasoning effort is X High. Home AI request cards must pass
`reasoningEffort: xhigh` as a first-class Codex Mobile task-card field and also
state the X High requirement in the card body. Profile-backed legacy runs
default to `hm-owner-openai-xhigh`. If the receiving runtime cannot confirm X
High execution, the audit should return `blocked_runtime_evidence` or redirect
to the platform owner instead of producing a shallow audit.

For Codex Mobile task-card delivery, the source-thread delivery receipt fields
`delivery.reasoningEffort=xhigh` and
`injectionRuntime.reasoningEffort=xhigh` are sufficient runtime evidence for the
audit thread. A target thread should not block solely because its local tool
surface lacks a second telemetry API, as long as the source card or follow-up
provides those bounded receipt fields and the target injected text requests
X High.

The receiving audit thread must read the target's product, design,
architecture, module, and test-matrix documents before source-first inspection.
It must produce a compact Product Thesis and Core Journey Matrix before
findings, then audit domain/state contracts, architecture boundaries,
UX/failure states, and executable evidence for those journeys.

Every deep per-plugin result must also include bounded audit opinions for
architecture, implementation, and UX. Each opinion must state a verdict,
evidence, and concrete improvements when the verdict is `finding` or
`improvement_recommended`. This is required even when no H1/H2 defect is found,
because deep Product Reality is expected to assess product quality and
direction, not only detect broken routes.

Action-route and manifest mismatches are still valid findings, but they are
`surface_product_reality` unless they are connected to a core journey and its
state/persistence/failure/test evidence. The audit may also report
`design_gap` findings when the documented product design is contradictory,
unsafe, overpromised, or unrealistic for the current Home AI boundary.

A target audit is not complete merely because it found one or two small issues.
The return must show document coverage, selected core journeys, evidence trails,
skipped evidence boundaries, open questions, and the architecture /
implementation / UX assessment axes. Missing this coverage should be reported as
`partially_closed` or `closed_surface_only`, not `closed_deep`.

For multi-plugin requests, the audit thread must additionally maintain a
per-plugin batch ledger. The ledger separates audit progress from repair and
closure traffic. Repair cards and implementation returns are recorded in their
queues, but the coordinator continues the remaining plugin work until every
target has a terminal status.

The source thread must treat a multi-plugin return as `invalid_return` when it
omits requested plugin ids, returns only one plugin result, marks a plugin
`closed_deep` without the minimum journey/evidence model, omits the per-plugin
evidence digest for a `closed_deep` row, or lets a repair acknowledgement loop
replace the remaining audit work.

## Task Card Requirements

Product Reality repair cards must include:

- evidence summary and report file reference;
- finding class such as `implementation_gap`, `architecture_gap`, `ux_gap`,
  `test_gap`, `fallback_debt`, or `closure_gap`;
- the relevant architecture, implementation, and UX axis verdicts when the
  finding is part of a Deep Product Reality audit;
- owning workspace/layer;
- explicit statement that local fallback or symptom suppression is not closure;
- closure validation;
- privacy constraints;
- `Return Card Required`.

Deployment-only residuals must be routed according to plugin ownership. When a
plugin fix is source-complete and central `deploy:macos -- --plugin <plugin-id>`
can complete production closure, the audit thread should return the deployment
closure task to the plugin implementation thread, not to Home AI. Send a Home AI
card only when the blocker is in the platform deploy script, Home AI host/proxy,
workspace provisioning, Gateway/toolset contract, shared policy, or production
permission layer.

The receiving thread must reply with one of:

- `completed`;
- `rejected`;
- `redirected`;
- `blocked`.

The reply must include changed files, validation evidence, deployment/readback
if applicable, residual risks, and privacy confirmation. The audit source
thread remains open until it independently verifies closure.

For batch audits, the final return must include a coverage matrix with each
requested plugin id, status, journey count, finding count, repair-card ids,
blocked reason when applicable, evidence digest, architecture/implementation/UX
assessment axes for deep rows, and privacy confirmation. It must also include
the same structure as a fenced `ledger_json` block so the source thread can run
`scripts/deep-product-reality-batch-ledger-validator.js --body-file`. A return
without this matrix and machine-readable ledger is not a completed batch return.

## Non-Goals

- Do not let the audit thread directly repair findings.
- Do not bypass owning workspace boundaries.
- Do not auto-deploy from the audit thread.
- Do not accept arbitrary local paths as audit targets.
- Do not treat a screenshot or user complaint alone as closure evidence.
- Do not create a local Automation/CRON job for the manual Product Reality
  request path.
- Do not store fixed Codex audit thread ids. Resolve the current thread through
  the Codex Mobile thread discovery API immediately before sending the card.
- Do not store private payloads, raw logs, secrets, or prompt transcripts in
  Action Inbox rows or task cards.

## Validation

Changes to this loop should run:

```bash
node tests/plugin-workspace-audit-service.test.js
node tests/deep-product-reality-batch-ledger-service.test.js
node tests/codex-thread-task-card-service.test.js
node tests/automation-api-routes.test.js
node tests/app-action-inbox-ui.test.js
node tests/static-cache-version-harness.test.js
node tests/task-list-ui.test.js
node tests/architecture-refactor-boundary.test.js
node scripts/fallback-governance-check.js --changed-file adapters/codex-thread-task-card-service.js --changed-file adapters/plugin-workspace-audit-service.js --changed-file adapters/deep-product-reality-batch-ledger-service.js --changed-file scripts/deep-product-reality-batch-ledger-validator.js --changed-file server-routes/automation-api-routes.js --changed-file public/app-action-inbox-ui.js --changed-file docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md --changed-file docs/PLATFORM_CONTRACTS/deep-product-reality-audit-contract.md --changed-file docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md --changed-file docs/IMPLEMENTATION_NOTES/product-reality-audit-loop.md --changed-file docs/IMPLEMENTATION_NOTES/deep-product-reality-audit-batch-ledger.md --json
```
