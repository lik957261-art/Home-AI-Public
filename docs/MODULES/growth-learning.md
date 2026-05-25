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
- `server-routes/learning-program-api-routes.js`
- `public/app-learning-growth-ui.js`
- `public/app-learning-growth-controller.js`
- `public/app-learning-program-ui.js`

## Key Routes

- `GET /api/learning-growth/board`
- `POST /api/kanban/cards/:cardId/learning-growth-submission`
- `POST /api/kanban/cards/:cardId/learning-growth-reflection`
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

## State Semantics

- `submitted` without completed evaluation means waiting for AI.
- `draft_feedback` is actionable revision, not waiting AI.
- Numeric passing score does not mean final completion when revision/reflection is still required.
- Completed cards should not show open-time age labels in primary list UI.
- Mastery profile should show the full active capability taxonomy across subjects, not only subjects with evidence. Unobserved capabilities are displayed as `not_observed` so gaps are visible without fabricating evidence.
- Mastery profile evidence remains summary-only; cross-subject display does not imply a learner has attempted every subject.
- Growth AI evaluations should update mastery evidence after feedback is persisted, including `draft_feedback` states that still require revision/reflection.
- Historical mastery profile repair should use `scripts\backfill-learning-growth-mastery-profile.js`; it reads historical evaluation metadata and writes idempotent summary-only mastery states.

## Validation

- `node tests\learning-growth-service.test.js`
- `node tests\learning-growth-board-projection-service.test.js`
- `node tests\learning-growth-mastery-profile-service.test.js`
- `node tests\learning-program-api-routes.test.js`
- `node tests\app-learning-growth-ui.test.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js` for server/service boundary changes.

## Constraints

- Do not store or print full learner answers, transcripts, questions, answer keys, or raw prompts.
- Keep evaluation and reward settlement separate.
- Async evaluation work must be durable across listener/Gateway restarts.
- Mastery profile evidence must be idempotent and auditable by evidence id/source ref.
- Production card skill ids must be normalized through the capability taxonomy aliases before evidence is recorded; do not drop legacy ids such as `english_reading_comprehension` or `math_ratio_proportional_reasoning`.
