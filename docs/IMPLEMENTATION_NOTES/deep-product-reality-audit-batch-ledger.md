# Deep Product Reality Audit Batch Ledger

Status: required contract for multi-plugin Deep Product Reality audit batches.

## Purpose

Deep Product Reality audits must not rely on one broad prompt and a final
free-form answer. A broad task can drift into one plugin, one finding, or one
repair/closure loop and then stop while the original audit batch remains
incomplete.

This ledger defines the required batch state model for multi-plugin Product
Reality audits. It turns the audit into a tracked coordinator workflow:

1. create a batch plan;
2. create one per-plugin work item for every target;
3. complete or explicitly block each work item;
4. return one batch summary only after every target has a terminal status;
5. validate the summary before accepting it as closure.

## Batch Coordinator Rule

The first action in a multi-plugin Deep Product Reality audit is the coordinator
plan. The audit thread must produce the plan before drafting findings.

The coordinator plan must include:

- `batch_id`: stable identifier for the audit round;
- `source_task_card_id`: the Home AI request card that started the batch;
- `requested_reasoning_effort`: normally `xhigh`;
- `reasoning_evidence`: task-card receipt fields or target runtime evidence;
- `target_plugins`: ordered list of plugin ids;
- `status_by_plugin`: one row per target plugin;
- `repair_queue`: repair cards sent by the audit thread;
- `closure_queue`: implementation returns waiting for read-only verification;
- `evidence_digest_by_plugin`: bounded summary of documents, journeys, and
  evidence trails reviewed for each target;
- `assessment_axes_by_plugin`: bounded architecture, implementation, and UX
  audit opinions for each target;
- `batch_status`: `planned`, `in_progress`, `partially_completed`,
  `completed`, `blocked`, or `invalid_return`.

The coordinator must not mark the batch `completed` while any target plugin is
still `pending`, `auditing`, `repair_sent`, or missing from the ledger.

## Per-Plugin Work Item

Each target plugin has a work item. A work item can be executed in the same
audit thread or delegated to a bounded audit subtask, but it must return the
same structured result.

Required fields:

```json
{
  "plugin_id": "finance",
  "status": "pending",
  "product_thesis": "",
  "core_journeys": [],
  "domain_state_review": "",
  "architecture_reality_review": "",
  "ux_failure_reality_review": "",
  "test_harness_reality_review": "",
  "design_critique": "",
  "assessment_axes": {
    "architecture": {
      "verdict": "aligned",
      "opinion": "",
      "evidence": [],
      "improvements": []
    },
    "implementation": {
      "verdict": "improvement_recommended",
      "opinion": "",
      "evidence": [],
      "improvements": []
    },
    "ux": {
      "verdict": "finding",
      "opinion": "",
      "evidence": [],
      "improvements": []
    }
  },
  "findings": [],
  "repair_cards": [],
  "blocked_reason": "",
  "privacy_review": ""
}
```

Allowed `status` values:

- `pending`: listed but not started;
- `auditing`: source/docs/runtime evidence is being reviewed;
- `findings_sent_deep`: at least one deep finding was sent to the owning
  workspace with return-card requirements;
- `repair_sent`: a repair card was sent and is waiting for implementation
  return or read-only closure verification;
- `closed_deep`: no open finding remains for the audited scope and the required
  deep evidence sections are present;
- `closed_surface_only`: only route/label/action surface behavior was inspected
  or repaired; core journeys were not fully audited;
- `partially_completed`: some journeys were covered, but a required journey,
  evidence lane, runtime readback, or plugin subset remains incomplete;
- `blocked`: the work item could not continue; `blocked_reason` is required;
- `not_applicable`: the target is not a product-facing embedded plugin for this
  audit round; justification is required.

`closed_deep` is invalid unless the work item includes at least two core
journeys or a documented reason why the product has fewer than two real
journeys. It is also invalid when the final return only names journeys without
showing the documents read, the evidence trail, and the skipped evidence
boundary.

## Core Journey Gate

A per-plugin work item must define two to four core journeys before findings are
accepted as deep findings.

Each journey row must include:

- actor;
- trigger or Home AI entry point;
- intended completion state;
- user-visible failure/degraded state;
- data, workspace, provider, persistence, or sync state touched;
- implementation evidence;
- executable test or harness evidence;
- host/runtime evidence when safe and available.

If a target has no product/design documents from which journeys can be derived,
the work item must report `blocked_docs_missing` or `design_gap` and explain
which documents are missing. It must not silently reduce the audit to source
inspection.

## Architecture / Implementation / UX Opinion Gate

Every target that reaches `closed_deep`, `findings_sent_deep`,
`closed_surface_only`, or `partially_completed` must include three assessment
axes in its ledger row:

- `architecture`: ownership, service boundaries, state model, deploy/runtime
  equivalence, and whether the implementation shape can support the product
  thesis;
- `implementation`: behavior, state transitions, failure handling,
  maintainability, and whether executable tests prove the selected journeys;
- `ux`: visible affordances, copy, navigation, empty/loading/error states,
  post-action feedback, and trust/provenance cues in the embedded user path.

Each axis must include `verdict`, `opinion`, `evidence`, and `improvements`.
Allowed verdicts are `aligned`, `improvement_recommended`, `finding`,
`blocked`, and `not_applicable`.

When an axis verdict is `finding` or `improvement_recommended`, the
`improvements` list is required. This allows a deep audit to give non-blocking
architecture, implementation, or UX improvement advice without inflating every
recommendation into an H1/H2 repair card. A `closed_deep` row may still have
minor `improvement_recommended` items only when they are explicitly outside the
audited closure criteria and do not contradict the product thesis.

## Finding Gate

Findings must connect to at least one work-item evidence trail:

- core journey;
- domain/state contract;
- architecture boundary;
- UX/failure state;
- executable evidence gap;
- design critique.

A finding that only mentions a manifest label, action id, route mapping, or
source-string test is `surface_product_reality` unless it is tied to a core
journey and a product consequence.

## Repair And Closure Queue Isolation

Repair/closure traffic must not interrupt the batch coordinator.

When a repair card is sent:

- record it in `repair_queue`;
- set the plugin status to `findings_sent_deep` or `repair_sent`;
- continue auditing the remaining target plugins unless the batch itself is
  blocked.

When an implementation return card arrives:

- record it in `closure_queue`;
- perform read-only closure verification when appropriate;
- do not let acknowledgement cards or deployment-only residuals consume the
  whole batch turn;
- do not enter recursive acknowledgement loops.

Email closure in one batch item does not close the whole batch. The coordinator
must continue remaining target plugins until the ledger has terminal statuses
for all targets.

## Batch Return Validator

A final batch return is invalid unless it contains a coverage matrix with every
target plugin and one terminal status per plugin.

Minimum return fields:

```json
{
  "batch_status": "completed",
  "source_task_card_id": "ttc_...",
  "reasoning_evidence": {
    "requested": "xhigh",
    "delivery_reasoning_effort": "xhigh",
    "injection_runtime_reasoning_effort": "xhigh"
  },
  "coverage": [
    {
      "plugin_id": "finance",
      "status": "findings_sent_deep",
      "journey_count": 3,
      "finding_count": 2,
      "repair_cards": ["ttc_..."],
      "blocked_reason": "",
      "evidence_digest": {
        "documents_read": ["docs/PRODUCT_REQUIREMENTS.md", "docs/ARCHITECTURE.md"],
        "journeys": ["create entry", "attachment lifecycle", "report readback"],
        "source_test_runtime_trails": [
          "entry journey: docs -> public/app.js -> tests/app-ui.test.js -> host proxy smoke"
        ],
        "skipped_boundaries": ["no private row inspection"],
        "open_questions": ["repair card remains open"],
        "assessment_axes": {
          "architecture": {
            "verdict": "aligned",
            "opinion": "The product ownership and service boundary are coherent for the audited journeys.",
            "evidence": ["docs/ARCHITECTURE.md -> adapters/domain-service.js -> host proxy smoke"],
            "improvements": []
          },
          "implementation": {
            "verdict": "finding",
            "opinion": "The attachment journey is implemented but lacks executable frontend proof for one write path.",
            "evidence": ["docs/PRODUCT_REQUIREMENTS.md -> public/app.js -> tests/app-ui.test.js"],
            "improvements": ["Add a VM or browser test that executes the missing attachment write path."]
          },
          "ux": {
            "verdict": "improvement_recommended",
            "opinion": "The degraded attachment state is visible but could make retry ownership clearer.",
            "evidence": ["public/app.js status copy -> host proxy static readback"],
            "improvements": ["Clarify whether retry is automatic, manual, or unsupported in the destination state."]
          }
        }
      }
    }
  ],
  "repair_queue": [],
  "closure_queue": [],
  "privacy_review": "passed"
}
```

In addition to the human-readable summary, a batch return card must include this
same structure as a fenced `ledger_json` block. The source thread can validate
the card directly with:

```bash
node scripts/deep-product-reality-batch-ledger-validator.js \
  --body-file <return-card.md> \
  --requested-plugins finance,wardrobe,note,music,growth,health,email,moira,codex-mobile \
  --json
```

The validator rejects or returns the batch as `invalid_return` when:

- any requested plugin id is missing;
- any plugin lacks a terminal status;
- a plugin has `closed_deep` with fewer than two journeys and no justified
  reduced-scope explanation;
- a plugin has `closed_deep` but lacks bounded document coverage, selected
  journey names, at least one source/test/runtime evidence trail, and skipped
  boundary accounting;
- a deep plugin row lacks architecture, implementation, or UX assessment axes;
- an assessment axis lacks verdict, opinion, or evidence;
- an assessment axis uses `finding` or `improvement_recommended` without
  concrete improvements;
- a plugin has findings but no owning workspace/layer or repair destination;
- the return contains only one plugin result for a multi-plugin request;
- repair/closure acknowledgement loops replaced remaining audit work;
- raw secrets, private payloads, database rows, full logs, screenshots with
  private data, or full prompts are included.

## Invalid Return Handling

If Home AI or the source thread detects `invalid_return`, it must send the batch
back to the audit thread with the missing plugin ids and required correction.
The audit thread should resume from the ledger rather than restarting from
scratch.

## Validator CLI

The source-thread agent should validate structured batch ledger returns or full
return-card Markdown with the checked CLI before accepting a multi-plugin Deep
Product Reality batch as complete:

```bash
node scripts/deep-product-reality-batch-ledger-validator.js \
  --json-file <ledger.json> \
  --requested-plugins finance,wardrobe,note,music,growth,health,email,moira,codex-mobile \
  --json

node scripts/deep-product-reality-batch-ledger-validator.js \
  --body-file <return-card.md> \
  --requested-plugins finance,wardrobe,note,music,growth,health,email,moira,codex-mobile \
  --json
```

The input JSON should contain `batch_status`, `reasoning_evidence`, `coverage`,
`repair_queue`, `closure_queue`, and `privacy_review`. Each `coverage` row must
use the batch return validator schema above, including architecture,
implementation, and UX assessment axes for deep rows. The CLI exits non-zero and
returns `status=invalid_return` when required plugin ids, terminal statuses,
`closed_deep` evidence digests, assessment axes, repair destinations, X High
receipt evidence, or privacy review are missing.

If an incoming return is not structured enough to feed the CLI or does not
contain a fenced ledger JSON block, the source thread must return
`invalid_return` or manually apply the same checks and send a continuation card
listing the missing fields. It must not accept a free-form matrix as deep
closure when `closed_deep` rows lack evidence digests.

## Privacy Boundary

The ledger is summary-only. It may store plugin ids, statuses, counts, card ids,
file paths, commit ids, command names, and bounded error codes. It must not
store raw access keys, cookies, launch tokens, mailbox content, health records,
financial rows, learner submissions, provider payloads, private screenshots,
full prompts, or long logs.
