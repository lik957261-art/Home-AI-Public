# Module: Growth Learning

## Responsibility

Growth Learning owns learner programs, evergreen task cards, submissions, async evaluation, reflection, rewards, mastery profile, and next-card strategy.

## Core Files

- `adapters/learning-growth-service.js`
- `adapters/learning-program-service.js`
- `adapters/learning-program-repository.js`
- `adapters/learning-growth-submission-service.js`
- `adapters/learning-growth-evaluation-job-service.js`
- `adapters/learning-growth-task-evaluation-service.js`
- `adapters/learning-growth-reflection-service.js`
- `adapters/learning-reward-settlement-service.js`
- `adapters/learning-growth-mastery-profile-service.js`
- `adapters/learning-growth-next-card-strategy-service.js`
- `adapters/learning-growth-board-projection-service.js`
- `adapters/learning-growth-card-role-service.js`
- `adapters/learning-growth-teaching-card-contract-service.js`
- `adapters/learning-growth-experience-signal-service.js`
- `adapters/learning-growth-teaching-check-service.js`
- `adapters/learning-growth-stage-assessment-service.js`
- `server-routes/learning-growth-card-api-routes.js`
- `server-routes/learning-program-api-routes.js`
- `public/app-learning-growth-ui.js`
- `public/app-learning-growth-controller.js`
- `public/app-learning-growth-teaching-controller.js`
- `public/app-learning-program-ui.js`

## Key Routes

- `GET /api/learning-growth/board`
- `POST /api/learning-growth/cards/:cardId/teaching-check`
- `POST /api/learning-growth/cards/:cardId/experience-signal`
- `POST /api/learning-growth/stage-assessments/:cycleId/activate`
- `POST /api/learning-growth/stage-assessments/challenge`
- `POST /api/kanban/cards/:cardId/learning-growth-submission` (current legacy/formal compatibility route)
- `POST /api/kanban/cards/:cardId/learning-growth-reflection` (current legacy/formal compatibility route)
- `GET /api/learning/growth/mastery-profile`
- `GET /api/learning/task-submissions/:submissionId/audio`
- `GET /api/learning/task-reflections/:reflectionId/audio`

## Persistence

Primary data is in `C:\ProgramData\HermesMobile\data\hermes-mobile.sqlite3`.

Important tables include:

- `learning_task_cards`
- `learning_task_submissions`
- `learning_growth_evaluation_jobs`
- `learning_evaluations`
- `learning_task_reflections`
- `learning_reward_settlements`
- `learning_growth_mastery_states`
- `learning_growth_card_trajectories`
- `learning_growth_experience_signals`
- `learning_growth_stage_assessment_cycles`

## State Semantics

- `submitted` without completed evaluation means waiting for AI.
- `draft_feedback` is actionable revision, not waiting AI.
- Numeric passing score does not mean final completion when revision/reflection is still required.
- Completed cards should not show open-time age labels in primary list UI.
- Mastery profile should show the full active capability taxonomy across subjects, not only subjects with evidence. Unobserved capabilities are displayed as `not_observed` so gaps are visible without fabricating evidence.
- Mastery profile evidence remains summary-only; cross-subject display does not imply a learner has attempted every subject.
- Mastery profile UI should switch subjects through a single horizontal subject-tag row and show one subject at a time for readability on mobile.
- Growth AI evaluations should update mastery evidence after feedback is persisted, including `draft_feedback` states that still require revision/reflection.
- True task completion is emitted only after the task is actually completed: passing evaluation without a reflection gate, accepted/forced spoken reflection, or Owner manual pass. Completion notification payloads must stay summary-only and may include task id/title, evaluation status/score, reward status/amount, reflection status, and next-task id/status. They must not include raw learner answers, transcripts, prompts, full task content, or source materials.
- Ordinary Growth cards should not all use the formal submit/evaluate/revise/reflect flow. Teaching cards and practice cards teach a focused concept, provide an example or guided activity, run a lightweight check, and record low/medium-weight learning evidence.
- Stage assessment cards are evergreen formal assessment cards. They can stay dormant and activate when recent teaching/practice evidence, elapsed time, stale mastery evidence, or Owner manual activation indicates that an independent mastery check is useful.
- Executor challenge activation is part of V1: an authorized executor can start a challenge assessment for their own available capability cluster when cooldown and safety policy allow it.
- Reports such as `too_advanced`, `not_learned`, or `prerequisite_gap` should feed card generation and prerequisite repair. They should not be treated as high-confidence mastery failure unless confirmed by a formal assessment.
- Growth scheduling should avoid turning missed days or difficult cards into backlog pressure. Repeated `too_hard`, `not_learned`, abandonment, or fatigue signals should lower pressure and generate repair/teaching cards before further assessment.
- V1 teaching/practice/integration cards default to 100 coins and 10-15 minutes. V1 stage assessment cards default to 300 coins, 25-30 minutes, and more tasks/questions than daily cards. Backend reward policy can override coin values.
- New teaching-card behavior uses native Growth board persistence and native Growth SQLite tables. Do not build the new feature around official Kanban compatibility; existing Kanban-linked routes are legacy/current-flow compatibility only.
- Model-generated cards must pass a structured card contract and validation rules. The model is not trusted to infer pedagogy policy from prose alone; invalid or unsupported output should be rejected, regenerated, downgraded to a repair card, or held for Owner review.
- For `teaching`, `practice`, and `integration_practice` cards, production JIT generation must return an explicit model-authored `teachingFlow` with micro-lesson, worked example, guided practice, and quick check sections. If `requireModel=true` and the model output omits that structure, publishing fails closed instead of silently using a local split of the old instruction text. Deterministic teaching-flow fallback is only a compatibility/normalization aid for older stored cards, not the production authoring path for new cards.
- Native Growth audio/text submissions are accepted before model evaluation and persisted as `learning_growth_evaluation_jobs`. The listener must keep a lightweight retry dispatcher alive: pending/retry jobs should survive restarts, failed model calls should retry after `availableAt`, and stale processing leases should become recoverable without requiring the learner to resubmit.
- Historical mastery profile repair should use `scripts\backfill-learning-growth-mastery-profile.js`; it reads historical evaluation metadata and writes idempotent summary-only mastery states.

## Teaching Card Flow

The detailed design is in `docs\IMPLEMENTATION_NOTES\growth-teaching-card-flow.md`. The code-oriented implementation plan is in `docs\IMPLEMENTATION_NOTES\growth-teaching-card-implementation.md`.

Card roles:

- `teaching`: explanation, worked example, guided practice, quick check, lightweight understanding feedback.
- `practice`: small exercises with hints/retry and medium-weight evidence.
- `integration_practice`: combines recently taught concepts.
- `stage_assessment`: formal independent task that may keep the existing submit/evaluate/revise/reflect completion gates.

Frontend Growth detail should branch by card role. Teaching cards use learner-facing steps such as target, lesson, example, guided practice, quick check, and feedback. Stage assessment cards use the formal assessment flow.

Reward/time defaults:

- `teaching`, `practice`, and `integration_practice`: 100 coins, 10-15 minutes.
- `stage_assessment`: 300 coins, 25-30 minutes.
- Coin amounts remain backend-configurable, but these defaults are part of the V1 product rule.

Learning experience signals:

- V1 supports `too_easy`, `right_level`, `too_hard`, `not_learned`, `confusing`, `interesting`, `challenge_ready`, and `completed`.
- `too_hard`, `not_learned`, and `confusing` are safe learner feedback actions, not punishment triggers.
- These signals are summary-only and should store bounded enums, timestamps, card ids, capability ids, and short safe summaries rather than full learner text.

## Validation

- `node tests\learning-growth-service.test.js`
- `node tests\learning-growth-jit-task-service.test.js`
- `node tests\learning-growth-board-projection-service.test.js`
- `node tests\learning-growth-mastery-profile-service.test.js`
- `node tests\learning-program-publish-service.test.js`
- `node tests\learning-program-api-routes.test.js`
- `node tests\learning-growth-teaching-card-services.test.js`
- `node tests\learning-growth-card-api-routes.test.js`
- `node tests\app-learning-growth-ui.test.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\app-learning-growth-task-ui.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js` for server/service boundary changes.

## Constraints

- Do not store or print full learner answers, transcripts, questions, answer keys, or raw prompts.
- Keep evaluation and reward settlement separate.
- Async evaluation work must be durable across listener/Gateway restarts.
- Mastery profile evidence must be idempotent and auditable by evidence id/source ref.
- Production card skill ids must be normalized through the capability taxonomy aliases before evidence is recorded; do not drop legacy ids such as `english_reading_comprehension` or `math_ratio_proportional_reasoning`.
