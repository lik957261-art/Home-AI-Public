# Growth Learning Workflow Contract And Harness

## Purpose

Growth learning cards must be implemented as a contract-first workflow, not as independent feature patches in submission, evaluation, reflection, reward, and frontend code.

This document defines the executable contract that future code must implement and test. It exists because recent production incidents showed that happy-path checks are not enough:

- audio submission can be accepted while AI evaluation is delayed;
- a retry job can remain idle until another event wakes the queue;
- an evaluation can exist while the board still says "waiting AI";
- a spoken reflection can be processed as `rejected` while UI still looks like it is transcribing;
- reward settlement must remain idempotent across retries and restarts.

The durable goal is a workflow harness that can prove the whole learning-card lifecycle under success, retry, timeout, partial-write, restart, and UI-projection scenarios.

## Scope

Applies to native Growth cards and all new Growth learning-card behavior:

- `teaching`
- `practice`
- `integration_practice`
- `stage_assessment`

Legacy Kanban-linked learning routes may remain readable for compatibility, but new workflow truth must live in native Growth services, native Growth SQLite records, and summary-only projections.

## Non-Goals

- Do not replace model-assisted generation or evaluation with deterministic pedagogy.
- Do not store full learner answers, full transcripts, full task text, answer keys, raw prompts, model raw responses, push endpoints, secrets, or long logs in harness fixtures, docs, handoffs, or UI snapshots.
- Do not use official Kanban as the source of truth for new card state.
- Do not make UI infer canonical workflow state from scattered records.

## Canonical Services

Target implementation should converge on these responsibilities:

- `adapters/learning-card-workflow-service.js`
  - owns card workflow states, events, transitions, invariants, and idempotency keys;
  - is the only service that can change canonical card workflow state;
  - emits summary-only transition events for audit/debug.
- `adapters/learning-card-workflow-reconciler-service.js`
  - repairs partial writes such as "evaluation exists but card state did not advance";
  - recovers stale processing jobs and missing visible failure states.
- `adapters/learning-card-workflow-harness.js`
  - test-only harness that wires fake repository, fake model, fake queue, fake clock, fake reward settlement, fake push/inbox notifier, and projection assertions.
- Existing services remain domain workers:
  - `learning-growth-submission-service` persists submissions and enqueues work;
  - `learning-growth-task-evaluation-service` evaluates summary-only evidence;
  - `learning-growth-reflection-service` evaluates spoken reflection;
  - `learning-reward-settlement-service` settles rewards idempotently;
  - `learning-growth-board-projection-service` projects workflow state to UI.

Existing services should call the workflow service for state transitions rather than mutate card state independently.

## State Model

The workflow state must be explicit. A card has exactly one canonical `workflowState` at a time, plus derived `visibleStatus` and `nextAction`.

### Shared States

| State | Meaning | Allowed Next Actions |
| --- | --- | --- |
| `published` | Card is available but has no learner evidence yet. | `start`, `submit`, `complete_teaching_check`, `report_too_hard` |
| `teaching_active` | Learner is viewing/working through teaching or guided practice. | `complete_teaching_check`, `report_too_hard`, `pause` |
| `submitted` | Learner evidence is persisted and accepted. | internal transition only |
| `evaluation_pending` | Durable evaluation job exists but has not started. | internal transition only |
| `evaluation_processing` | Evaluation job lease is active. | internal transition only |
| `feedback_ready` | Evaluation exists and learner can act on feedback. | `revise`, `reflect`, `complete_without_reflection` |
| `reflection_required` | Evaluation passed a threshold but completion requires spoken reflection. | `submit_reflection` |
| `reflection_submitted` | Reflection evidence is persisted and being processed. | internal transition only |
| `needs_resubmit` | Learner must revise answer or retry reflection. | `resubmit`, `submit_reflection`, `report_too_hard` |
| `failed_visible` | Automated path failed and the learner/Owner can see a retry/repair action. | `retry`, `owner_review`, `manual_pass` |
| `completed` | Card is truly complete and reward settlement has either completed, been blocked visibly, or been queued with visible status. | none except audit/admin repair |
| `archived` | Card is no longer active. | none |

### Card-Role Rules

`teaching`, `practice`, and `integration_practice` cards should not enter the full formal assessment chain unless explicitly configured.

- Default flow:
  - `published -> teaching_active -> completed`
  - Optional lightweight quick check may create low/medium-weight evidence.
  - Failure or "too hard" produces repair/prerequisite signals, not punishment.
- Formal assessment flow:
  - `published -> submitted -> evaluation_pending -> evaluation_processing -> feedback_ready`
  - Then one of:
    - `completed`
    - `reflection_required -> reflection_submitted -> completed`
    - `needs_resubmit`
    - `failed_visible`

`stage_assessment` keeps the formal chain and higher-weight evidence.

## Event Contract

All transitions must be triggered by named events. Events are idempotent by `(cardId, eventType, sourceRecordId)` or a stronger idempotency key.

| Event | Required Input | Primary Effects |
| --- | --- | --- |
| `card_published` | card id, role, policy | sets `published` |
| `teaching_started` | card id, learner id | sets `teaching_active` |
| `teaching_check_completed` | card id, bounded evidence, score/status | writes evidence, may settle reward, sets `completed` or `needs_resubmit` |
| `submission_received` | submission id, card id, learner id | sets `submitted`, creates evaluation job |
| `evaluation_job_enqueued` | job id, submission id | sets `evaluation_pending` |
| `evaluation_job_started` | job id, lease owner | sets `evaluation_processing` |
| `evaluation_succeeded` | evaluation id, job id, bounded status/score | writes evaluation, updates mastery evidence, sets `feedback_ready`, `reflection_required`, `needs_resubmit`, or `completed` |
| `evaluation_failed_retryable` | job id, error class, availableAt | sets job `retry`, visible state remains waiting/retry |
| `evaluation_failed_final` | job id, error class | sets `failed_visible` |
| `reflection_received` | reflection id, evaluation id | sets `reflection_submitted` |
| `reflection_accepted` | reflection id, bounded score/status | sets `completed` |
| `reflection_rejected` | reflection id, bounded score/status | sets `needs_resubmit` with next action `submit_reflection` |
| `reward_settled` | settlement id, evaluation/reflection id | updates reward projection idempotently |
| `owner_manual_pass` | Owner actor id, reason code | sets `completed`, audit required |
| `executor_challenge_started` | learner id, cycle id | activates/creates a `stage_assessment` card |
| `reconciler_repaired` | repair kind, source ids | records summary-only repair event |

## Invariants

These invariants must be asserted in service tests and harness scenarios.

- A completed card cannot show `submit`, `waiting_feedback`, `reflection_required`, or stale local-pending UI.
- A persisted evaluation with actionable status cannot project as "waiting AI".
- A `rejected` spoken reflection is a processed result, not a transcribing state.
- A final failed job must become `failed_visible`; it must not stay hidden as pending forever.
- Retryable jobs must wake without requiring another learner submission.
- Stale `processing` jobs must become retryable or visible failure after their lease expires.
- Reward settlement is idempotent by source evaluation/reflection and never duplicates coins on retry.
- Owner manual pass is audited and cannot silently bypass reward/privacy constraints.
- Learner feedback such as `too_hard`, `not_learned`, or `confusing` creates repair signals and pressure reduction; it is not high-confidence mastery failure.
- Public projections remain summary-only.

## Durable Job Contract

Every asynchronous model-dependent step must have a durable job row or equivalent durable record.

Required fields:

- `jobId`
- `cardId`
- `sourceRecordId`
- `jobType`
- `status`: `pending`, `processing`, `retry`, `done`, `failed_visible`
- `attemptCount`
- `availableAt`
- `leaseOwner`
- `leaseUntil`
- `lastErrorClass`
- `createdAt`
- `updatedAt`
- `completedAt`

Rules:

- Accepting learner evidence and enqueuing a job must be atomic or repairable by reconciler.
- `processing` without a live lease becomes retryable when `leaseUntil` expires.
- `retry` schedules the next wake-up by `availableAt`; it must not depend on another submission.
- Job completion must call workflow transition before user-facing projections are considered current.
- Raw model output, prompts, full learner content, and full transcripts are never stored in job rows.

## Reconciler Contract

The reconciler is mandatory. It should be safe to run at listener startup, after queue drain, and from a manual debug command.

Minimum repairs:

- submission exists, no job exists -> create or mark visible failure, depending on age and evidence;
- job is `done`, evaluation exists, card still says waiting -> advance workflow;
- evaluation exists, no reward settlement decision where one is required -> enqueue/repair settlement;
- reflection exists with `accepted`, card not completed -> complete;
- reflection exists with `rejected`, UI projection still waiting/transcribing -> set `needs_resubmit`;
- job is stale `processing` -> release lease and retry or final fail;
- duplicate jobs for same submission -> keep one active path and mark duplicates ignored/complete.

Repair events must record only ids, status fields, timestamps, and short reason codes.

## Projection Contract

Frontend receives workflow projection. It does not reconstruct canonical state from raw records.

Minimum projection shape:

```js
{
  cardId: "ltask_...",
  cardRole: "stage_assessment",
  workflowState: "reflection_required",
  visibleStatus: "Needs reflection",
  nextAction: "submit_reflection",
  canSubmit: false,
  canRetry: true,
  retryAction: "submit_reflection",
  latestSubmissionId: "lsub_...",
  latestEvaluationId: "lgwe_...",
  latestReflectionId: "lrefl_...",
  rewardState: "not_settled" | "pending" | "settled" | "blocked_visible",
  failure: null,
  summaryOnlyEvidence: {
    score: 90,
    reflectionStatus: "rejected"
  }
}
```

UI tests must assert projection outcomes, not just button existence.

### Secondary Page Navigation Contract

Growth learning-card detail views are secondary pages. They must follow the shared mobile shell contract:

- The only page-level back affordances are the top-left shell back button and the right-swipe back gesture.
- The detail content must not render a separate inline back button such as `data-learning-settings-task-back`, `data-learning-close-growth-task`, or `.learning-settings-back`.
- The detail content must not re-render board-level navigation, tabs, summary blocks, or page-level overflow actions.
- Card-internal learning controls are allowed when they are part of the activity itself, for example teaching step tabs, quick-check submit, and lightweight difficulty/experience feedback.
- Functional page actions such as history, settings, delete, or management should live in the shell top-more menu when they are available on a secondary page.
- The page title should come from the shell header. The card may show the card title as content, but it must not duplicate a generic page title such as `任务` / `学习卡` immediately below the shell header.
- The same rule applies to cross-surface secondary pages. If a primary module is opened from another page's top-more menu, the caller must persist an explicit return route and the opened surface must behave as secondary. For example, Inbox -> top-more -> Automation list uses an Inbox return route; bottom navigation -> Automation remains primary.

Harness/UI assertions should include:

```js
harness.expectProjection(cardId, {
  detailVisible: true,
  topBackVisible: true,
  rightSwipeBackTarget: "learning-growth-task",
  inlineBackAbsent: true,
  boardNavAbsent: true,
  duplicatePageTitleAbsent: true
});
```

For current renderer tests this means asserting the selected task detail contains `data-learning-growth-task-focus` and `data-learning-growth-answer-card`, while excluding `data-learning-growth-board-summary`, `data-learning-growth-tab=`, `data-learning-settings-task-back`, `data-learning-close-growth-task`, and `.learning-settings-back`.

## Harness Architecture

The harness must let tests force every failure mode without using the real model or real Gateway Pool.

### Components

- Fake clock:
  - controls `now`, leases, retry backoff, stale processing, and listener restart.
- Fake repository:
  - stores cards, submissions, jobs, evaluations, reflections, rewards, and transition events in memory or temp SQLite;
  - can inject partial-write failures at named points.
- Fake model:
  - scripted responses:
    - valid pass JSON;
    - valid revision JSON;
    - valid reflection accepted;
    - valid reflection rejected;
    - invalid JSON;
    - timeout;
    - interruption;
    - low confidence;
    - throws after evaluation write.
- Fake queue:
  - processes one job at a time;
  - supports delayed retry;
  - supports simulated listener restart and stale lease recovery.
- Fake reward settlement:
  - asserts idempotency and parent-review blocking.
- Fake notifier:
  - captures summary-only Web Push / Action Inbox effects without sending.
- Projection oracle:
  - checks board/detail projection for `workflowState`, `visibleStatus`, `nextAction`, buttons, and stale-pending absence.

### Test Helpers

Target helper names:

- `createWorkflowHarness(options)`
- `harness.publishCard({ role, policy })`
- `harness.submitEvidence({ cardId, mode })`
- `harness.model.next({ kind })`
- `harness.queue.runOne()`
- `harness.queue.runUntilIdle()`
- `harness.restartListener()`
- `harness.reconcile()`
- `harness.expectProjection(cardId, expected)`
- `harness.expectNoPrivateContent()`
- `harness.expectRewardSettlement({ cardId, count })`

## Acceptance Matrix

Each row should become a named test. Do not remove a row after implementation; when a production bug appears, add a row before fixing it.

| Scenario | Required Result | Target Test |
| --- | --- | --- |
| Teaching card quick check succeeds | `published -> teaching_active -> completed`, low/medium evidence stored, 100-coin default policy applied once | `learning-card-workflow-contract.test.js` |
| Teaching card marked too hard | repair signal stored, no mastery failure, no pressure backlog, next projection suggests repair/prerequisite action | `learning-card-workflow-contract.test.js` |
| Teaching card secondary-page chrome is valid | top-left shell back and right-swipe back work; no inline back button, board tabs, duplicate page title, or page-level action buttons in detail content; feedback buttons may remain as low-weight card controls | `app-learning-growth-ui.test.js`, `app-learning-growth-task-ui.test.js`, future projection harness |
| Stage assessment submission succeeds | submission, job, evaluation, reflection/completion decision all visible in projection | `learning-card-workflow-contract.test.js` |
| First model call fails, retry succeeds | job enters `retry`, wakes by `availableAt`, then reaches feedback/completion | `learning-card-workflow-recovery.test.js` |
| Model keeps failing | card reaches `failed_visible` with retry/Owner repair action | `learning-card-workflow-recovery.test.js` |
| Invalid model JSON then repair succeeds | one repair pass is allowed where configured; final projection is not stuck waiting | `learning-card-workflow-contract.test.js` |
| Job done and evaluation exists, card state stale | reconciler advances workflow and records repair event | `learning-card-workflow-reconciler.test.js` |
| Reflection accepted | card completes, reward settles once, completion notification is summary-only | `learning-card-workflow-contract.test.js` |
| Reflection rejected | projection says processed/not passed, retry recorder/action visible, no transcribing state | `learning-card-workflow-contract.test.js`, `app-learning-program-ui.test.js` |
| Duplicate submit click | one active job or idempotent duplicate ignored, no duplicate reward | `learning-card-workflow-contract.test.js` |
| Listener restart during processing | stale lease recovers and job resumes or fails visibly | `learning-card-workflow-recovery.test.js` |
| Gateway/model unavailable | no hidden stuck pending state; final UI can show retry/visible failure | `learning-card-workflow-recovery.test.js` |
| Reward settlement blocked by review | card completion/reward projection shows visible blocked/pending state, no duplicate ledger entries | `learning-card-workflow-contract.test.js` |
| Owner manual pass | audit event exists, reward/privacy rules still enforced | `learning-card-workflow-contract.test.js` |
| Projection privacy | no full answer, transcript, question text, answer key, raw prompt, raw model response, push endpoint, access key | `learning-card-workflow-privacy.test.js` |

## Implementation Slices

1. Define enum constants and transition table in `learning-card-workflow-service`.
2. Add a temp in-memory harness and contract tests for pure transitions.
3. Wire submissions and evaluation queue through workflow events.
4. Add durable job recovery and reconciler tests.
5. Move board/detail projection to workflow-derived fields.
6. Add UI projection tests for waiting, feedback, reflection rejected, failed visible, and completed.
7. Wire reward settlement idempotency into workflow completion tests.
8. Add production smoke script or DB/API smoke helper that can validate a full chain without leaking private content.

## Required Gate For Future Growth Card Changes

Any non-trivial Growth learning-card change must include:

- updated workflow contract doc if state/event/projection behavior changes;
- one new or updated harness scenario for the changed behavior;
- queue/reconciler test when async behavior changes;
- UI projection test when user-visible state changes;
- reward idempotency test when completion or settlement changes;
- privacy assertion when new evidence fields are projected or persisted;
- production smoke or equivalent DB/API smoke for deployment.

If a bug is found in production, first write the scenario in the harness matrix, then fix the implementation.

## Production Smoke Shape

Production smoke must remain summary-only. It should verify ids and states, not content bodies.

Minimum accepted smoke:

1. Create or select a test card in test workspace.
2. Submit bounded synthetic evidence or use a fake-model-only route in non-production mode.
3. Observe durable job creation.
4. Force/observe job completion.
5. Read board/detail projection.
6. Assert `workflowState`, `visibleStatus`, `nextAction`, reward state, and absence of private fields.
7. Clean up or mark test records with a test source id.

Do not run production smoke with full real learner answers, transcripts, or generated private task content in logs.

## Current Gaps

As of this document, the full harness is a target, not fully implemented:

- Some state decisions still happen in submission, reflection, reward, and projection services separately.
- Async evaluation queue has durable retry behavior, but the workflow transition table is not yet the single source of truth.
- UI still has legacy paths that infer state from latest records for compatibility.
- Reconciler behavior is partially manual/implicit and needs first-class service/tests.

These gaps should be closed before the next large Growth workflow expansion.
