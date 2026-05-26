# Growth Teaching Card Implementation Plan

This document turns `docs/IMPLEMENTATION_NOTES/growth-teaching-card-flow.md` into a code-oriented implementation plan. It is intentionally more prescriptive than the design note: a later implementation agent should be able to generate service, route, frontend, and test changes from this file without rediscovering the product policy.

## Objective

Implement Growth card roles so ordinary cards teach and practice before they test, while formal ability measurement remains on evergreen stage assessment cards.

The implementation must preserve these rules:

- `teaching`, `practice`, and `integration_practice` cards are low-pressure learning cards.
- `stage_assessment` cards keep the existing formal submit/evaluate/revise/reflect completion gates.
- Learner signals such as `too_hard`, `not_learned`, and `explain_first` repair the learning path; they are not formal mastery failures.
- Public projections, Action Inbox items, logs, docs, and handoffs stay summary-only. Do not store full learner answers, transcripts, full questions, answer keys, raw prompts, or model raw responses.

## V1 Fixed Decisions

These decisions are fixed for the first implementation. Do not leave them to implementation-time judgment.

- New teaching/practice/assessment behavior belongs to the native Hermes Mobile Growth board. Do not implement the new flow as official Kanban compatibility.
- Add the required SQLite tables and columns in the native Growth domain up front. Do not ship a temporary metadata-only storage layer for this feature.
- Existing legacy/Kanban cards may remain readable through current compatibility code, but new teaching cards, practice cards, stage assessments, experience signals, and activation cycles use native Growth persistence and native Growth API routes.
- Daily teaching/practice cards award coins. Default ordinary teaching/practice reward is `100` coins and remains configurable by backend reward policy.
- Stage assessment cards award more. Default stage assessment reward is `300` coins and remains configurable by backend reward policy.
- Ordinary teaching cards should target 10-15 minutes, with enough explanation and example content to actually teach.
- Stage assessment cards should target 25-30 minutes, include more questions/tasks than daily cards, and remain clearly separated from ordinary teaching/practice.
- Stage assessment activation has three paths:
  - system eligibility from learning evidence and cooldown policy;
  - Owner manual activation;
  - executor challenge activation, where the learner explicitly starts a challenge if they feel ready.
- Executor challenge activation should create or activate a formal `stage_assessment` card, not downgrade the assessment into a normal practice card.

## Implementation Shape

Use small slices. Each slice should pass focused tests before moving to the next.

1. Add role and completion contracts.
2. Project card role and teaching flow fields on board/detail payloads.
3. Add teaching-card model contract and validator.
4. Add experience-signal persistence and summary service.
5. Add lightweight teaching completion route.
6. Add stage assessment cycle/activation service.
7. Branch the Growth frontend by card role, following the frontend flowchart in the design note.
8. Wire tests and update docs.

Do not replace the old assessment flow. Treat it as the `stage_assessment` flow.

## Data Contract

V1 should use native Growth SQLite persistence as the source of truth. Metadata projections may still be emitted for compatibility with existing renderers, but they must be derived from native Growth records rather than becoming the authoritative store for new teaching-card behavior.

### Card Fields

Public board/detail projections should expose these normalized fields:

```js
{
  cardRole: "teaching" | "practice" | "integration_practice" | "stage_assessment",
  completionPolicy: "teaching_check" | "practice_feedback" | "formal_assessment",
  masteryEvidenceWeight: "low" | "medium" | "high",
  capabilityClusterId: "python-basics-loops",
  teachingFlow: {
    learningTarget: "Use a for loop to repeat a small action.",
    whyItMatters: "This lets you make code do repeated work without copying lines.",
    prerequisites: [
      { id: "python-print", label: "print()", evidence: "observed" }
    ],
    microLesson: {
      format: "text",
      summary: "A for loop visits each item in a list or range.",
      learnerFacingText: "..."
    },
    workedExample: {
      prompt: "Read this short example.",
      steps: [
        { label: "Code", text: "for n in range(3): print(n)" },
        { label: "What happens", text: "Python prints 0, 1, then 2." }
      ]
    },
    guidedPractice: {
      mode: "modify_code" | "choose" | "fill_blank" | "explain" | "short_answer",
      prompt: "Change the loop so it prints five numbers.",
      hints: ["range(5) gives five values."]
    },
    quickCheck: {
      mode: "short_answer" | "choose" | "code_snippet" | "explain",
      prompt: "What will this loop print?",
      expectedEvidence: ["mentions repeated output", "does not require hidden knowledge"]
    },
    tooHardFallback: {
      action: "prerequisite_repair",
      reason: "range() has weak evidence"
    }
  },
  stageAssessment: {
    cycleId: null,
    activationState: "dormant" | "eligible" | "active" | "completed" | "cooldown",
    activationReason: null,
    activationSource: null,
    cooldownUntil: null
  },
  rewardPolicy: {
    defaultCoins: 100,
    configuredCoins: 100,
    source: "growth_reward_policy"
  },
  experienceSummary: {
    pressureLevel: "low" | "normal" | "high",
    recentSignals: ["too_hard", "not_learned"]
  }
}
```

For non-teaching cards, `teachingFlow` can be `null` or a limited practice prompt projection. For `stage_assessment`, `completionPolicy` must be `formal_assessment`.

### Native Columns

Add the role/reward/activation fields to the existing native `learning_task_cards` table owned by `adapters/learning-program-repository.js`. The implementation should migrate that table forward and should not store new V1 fields only in official Kanban metadata.

Recommended query-critical fields:

```js
card_role: "teaching",
completion_policy: "teaching_check",
mastery_evidence_weight: "low",
capability_cluster_id: "python-basics-loops",
default_reward_coins: 100,
configured_reward_coins: 100,
expected_duration_minutes_min: 10,
expected_duration_minutes_max: 15,
stage_assessment_cycle_id: null,
activation_state: null,
activation_reason: null,
activation_source: null,
cooldown_until: null,
teaching_flow_json: { ... },
experience_summary_json: { ... }
```

Repository work:

- Add schema migration logic in `adapters/learning-program-repository.js` for the new `learning_task_cards` columns.
- Update `upsertTaskCard()`, `publicTaskCardFromRow()`, and `listTaskCards()` filter support where needed.
- Keep `kanban_card_id` as an optional legacy linkage field, not as the source of truth for new teaching-card state.
- Add repository tests that create an old-schema DB and verify migration preserves existing task cards while adding role/reward/activation fields.

Recommended reward defaults:

| Card Role | Default Coins | Expected Time | Completion Policy |
| --- | ---: | --- | --- |
| `teaching` | 100 | 10-15 minutes | `teaching_check` |
| `practice` | 100 | 10-15 minutes | `practice_feedback` |
| `integration_practice` | 100 | 10-15 minutes | `practice_feedback` |
| `stage_assessment` | 300 | 25-30 minutes | `formal_assessment` |

### New Tables

Add these tables in the first backend implementation slice. They are part of the durable feature, not later optional hardening.

`learning_growth_experience_signals`

| Column | Purpose |
| --- | --- |
| `id` | stable id |
| `learner_workspace_id` | learner/executor workspace |
| `subject_id` | subject or domain |
| `capability_id` | specific skill when known |
| `capability_cluster_id` | broader cluster for scheduling |
| `card_id` | related task/card id |
| `signal_type` | `too_hard`, `not_learned`, `explain_first`, `low_confidence`, `abandoned`, `fatigue`, `interest`, `flow` |
| `signal_value` | bounded enum, such as `reported`, `observed`, `dismissed`, `completed_smoothly` |
| `payload_json` | bounded summary-only payload |
| `created_at` | ISO timestamp |

`learning_growth_stage_assessment_cycles`

| Column | Purpose |
| --- | --- |
| `id` | cycle id |
| `learner_workspace_id` | learner/executor workspace |
| `subject_id` | subject/domain |
| `capability_cluster_id` | assessment target |
| `status` | `dormant`, `eligible`, `active`, `completed`, `cooldown`, `cancelled` |
| `activation_reason` | `enough_recent_practice`, `stale_mastery_evidence`, `owner_manual`, `diagnostic_repair` |
| `activation_source` | `system`, `owner`, or `executor_challenge` |
| `eligible_at` | when system marked it ready |
| `activated_at` | when it became a learner-visible active task |
| `completed_at` | assessment completion time |
| `cooldown_until` | next allowed formal check |
| `source_card_ids_json` | ordinary cards that made it eligible |
| `created_at` / `updated_at` | audit timestamps |

## Service Slices

### 1. Card Role Service

File: `adapters/learning-growth-card-role-service.js`

Exports:

```js
const CARD_ROLES = {
  TEACHING: "teaching",
  PRACTICE: "practice",
  INTEGRATION_PRACTICE: "integration_practice",
  STAGE_ASSESSMENT: "stage_assessment"
};

const COMPLETION_POLICIES = {
  TEACHING_CHECK: "teaching_check",
  PRACTICE_FEEDBACK: "practice_feedback",
  FORMAL_ASSESSMENT: "formal_assessment"
};

function normalizeCardRole(value, fallback = CARD_ROLES.PRACTICE) {}
function completionPolicyForRole(role) {}
function masteryEvidenceWeightForRole(role) {}
function isFormalAssessmentRole(role) {}
function projectCardRoleFields(cardOrMetadata) {}
```

Rules:

- Unknown existing cards should default conservatively:
  - if they already have submission/evaluation/reflection gates, project `stage_assessment`;
  - otherwise project `practice`.
- `stage_assessment` always maps to `formal_assessment` and `high`.
- `teaching` maps to `teaching_check` and `low`.
- `practice` and `integration_practice` map to `practice_feedback` and `medium`.
- Default rewards are role-derived unless backend reward policy overrides them: ordinary cards `100`, stage assessment `300`.
- Default expected duration is role-derived: ordinary cards 10-15 minutes, stage assessment 25-30 minutes.

Tests:

- `tests/learning-growth-card-role-service.test.js`
- `tests/architecture-refactor-boundary.test.js` export assertion.

### 2. Teaching Contract Service

File: `adapters/learning-growth-teaching-card-contract-service.js`

Exports:

```js
function normalizeTeachingFlow(input) {}
function validateTeachingCardContract(card, context = {}) {}
function validateModelTeachingCardOutput(output, context = {}) {}
function safeTeachingFallback(context = {}, reason = "invalid_model_output") {}
function publicTeachingFlowProjection(cardOrFlow) {}
```

Validation rules:

- A `teaching` card must include `learningTarget`, `microLesson`, `workedExample`, `guidedPractice`, and `quickCheck`.
- `quickCheck` must be answerable from `microLesson` plus `workedExample`.
- `expectedTimeMinutes` for ordinary cards should normally be 10-15.
- Teaching-card content should include enough explanation to teach, not just a one-line hint. Keep it compact: one focused target, one worked example, one guided practice activity, and one quick check.
- If prerequisite evidence is missing, output must become `teaching` or repair-oriented `practice`, not `stage_assessment`.
- Teaching cards must not require spoken reflection by default.
- Public projection must not expose hidden answer keys, raw prompts, model chain text, or full private source content.

Tests:

- `tests/learning-growth-teaching-card-contract-service.test.js`
- Add fixtures for Python "too advanced" and Science "not learned" cases.

### 3. Experience Signal Service

File: `adapters/learning-growth-experience-signal-service.js`

Exports:

```js
function createLearningGrowthExperienceSignalService({
  store,
  now,
  idGenerator
}) {}

async function recordExperienceSignal(input) {}
async function summarizeExperienceSignals(input) {}
function pressureLevelFromSignals(summary) {}
function nextCardStrategyFromSignals(summary) {}
```

`recordExperienceSignal(input)`:

```js
{
  auth,
  learnerWorkspaceId,
  subjectId,
  capabilityId,
  capabilityClusterId,
  cardId,
  signalType: "too_hard",
  signalValue: "reported",
  payload: {
    step: "quick_check",
    summary: "Learner reports prerequisite missing."
  }
}
```

Rules:

- Require the same workspace/auth boundary used by Growth task access.
- Store bounded enums and short summaries only.
- Do not store raw answer text.
- Repeated `too_hard`, `not_learned`, or `abandoned` raises pressure to `high` and should lower difficulty or generate repair cards.
- `interest` and `flow` should be available to card generation but must not override prerequisite gaps.

Tests:

- `tests/learning-growth-experience-signal-service.test.js`
- Add one route-level test when API routes are wired.

### 4. Stage Assessment Service

File: `adapters/learning-growth-stage-assessment-service.js`

Exports:

```js
function createLearningGrowthStageAssessmentService({
  store,
  masteryProfileService,
  experienceSignalService,
  learningGrowthTaskService,
  now,
  idGenerator
}) {}

async function evaluateStageAssessmentEligibility(input) {}
async function activateStageAssessment(input) {}
async function completeStageAssessmentCycle(input) {}
async function projectStageAssessmentState(input) {}
```

Eligibility input:

```js
{
  auth,
  learnerWorkspaceId,
  subjectId,
  capabilityClusterId,
  source: "scheduler" | "owner_manual" | "executor_challenge" | "board_refresh"
}
```

Default activation heuristics:

- minimum 4 recent ordinary cards in the capability cluster;
- minimum 5 days since last completed formal assessment for the same cluster;
- no high-pressure signal in the recent window unless activation reason is diagnostic repair;
- Owner manual activation bypasses time threshold but still records `owner_manual`.
- Executor challenge activation bypasses the system suggestion threshold only after an explicit learner action, but still respects hard cooldown and safety limits unless Owner overrides.

Rules:

- A dormant stage assessment should not appear as daily homework debt.
- `eligible` means ready to activate; `active` means learner can enter the formal flow.
- Completion should move the cycle to `cooldown` and write high-weight mastery evidence through the existing mastery service path.
- Manual activation is Owner-only. Learner self-start uses the separate executor challenge route.
- Executor challenge activation is allowed in V1 as a learner-initiated formal assessment path. It should be labeled as a challenge, carry `activation_source=executor_challenge`, and use the full stage-assessment reward and completion policy.

Tests:

- `tests/learning-growth-stage-assessment-service.test.js`
- Update `tests/learning-growth-board-projection-service.test.js` for dormant/eligible/active projections.

### 5. Existing Growth Service Changes

`adapters/learning-growth-jit-task-service.js`

- Add card-role request fields to model input:
  - `allowedCardRoles`
  - `completionPolicy`
  - `targetDifficultyBand`
  - `recentExperienceSignals`
  - `knownPrerequisites`
  - `stageAssessmentEligibility`
- Validate model output through `learning-growth-teaching-card-contract-service`.
- If validation fails twice, produce a safe deterministic repair card or Owner-review draft. Do not publish an unsupported high-pressure task.

`adapters/learning-growth-task-interaction-state-service.js`

- Add role-aware next actions:
  - `teaching`: `start_lesson`, `continue_guided_practice`, `do_quick_check`, `complete_learning`
  - `practice`: `start_practice`, `retry_with_hint`, `complete_practice`
  - `stage_assessment`: keep existing `submit_first_attempt`, `wait_for_feedback`, `submit_revision`, `submit_spoken_reflection`, `completed`
- Preserve existing formal states for assessment cards.

`adapters/learning-growth-board-projection-service.js`

- Project:
  - role badge data;
  - teaching flow summary;
  - stage assessment activation state;
  - pressure level and safe actions.

`adapters/learning-growth-submission-service.js`

- Keep current formal submission logic for `stage_assessment`.
- Add a lightweight completion path for `completionPolicy=teaching_check`:
  - accept quick-check response or selected feedback signal;
  - optionally call AI coaching for feedback;
  - persist summary evidence;
  - mark the teaching card complete without spoken reflection by default;
  - settle the ordinary card reward through the existing learning reward/coin settlement boundary using the configured ordinary reward amount, default `100`.

`adapters/learning-growth-mastery-profile-service.js`

- Weight evidence by card role:
  - teaching: low confidence support;
  - practice/integration: medium confidence;
  - stage assessment: high confidence.
- `too_hard` and `not_learned` should create repair/prerequisite signals, not high-confidence negative mastery.

`adapters/learning-growth-next-card-strategy-service.js`

- Consume experience summary and pressure level.
- Prefer repair/teaching cards after repeated friction.
- Do not stack missed cards into backlog pressure.

## API Routes

Prefer extending existing route modules instead of adding logic to `server.js`.

New V1 routes should live in the native Growth API surface, preferably `server-routes/learning-api-routes.js` or a new focused `server-routes/learning-growth-card-api-routes.js` composed from `server-routes/mobile-api-composition.js`. Do not add the new teaching/practice/stage-assessment routes to `server-routes/kanban-card-api-routes.js`; that route group is only for the current legacy/formal compatibility path.

### Teaching Quick Check

Route:

```http
POST /api/learning-growth/cards/:cardId/teaching-check
```

Request:

```js
{
  step: "quick_check",
  response: "short learner response or selected option",
  understandingFeedback: "understood" | "partial" | "needs_practice" | "prerequisite_gap" | "too_advanced",
  clientContext: {
    teachingStep: "quick_check",
    elapsedSeconds: 240
  }
}
```

Response:

```js
{
  ok: true,
  cardId: "card_123",
  status: "completed",
  learningGrowthInteractionState: {
    phase: "completed",
    nextAction: "complete_learning",
    cardRole: "teaching"
  },
  evidence: {
    masteryEvidenceWeight: "low",
    understandingFeedback: "partial",
    nextRecommendation: "queue_practice"
  }
}
```

### Experience Signal

Route:

```http
POST /api/learning-growth/cards/:cardId/experience-signal
```

Request:

```js
{
  signalType: "too_hard" | "not_learned" | "explain_first" | "low_confidence" | "fatigue" | "interest" | "flow",
  signalValue: "reported",
  step: "lesson" | "guided_practice" | "quick_check",
  summary: "bounded optional summary"
}
```

Response:

```js
{
  ok: true,
  recorded: true,
  pressureLevel: "high",
  nextRecommendation: "show_prerequisite_repair"
}
```

### Stage Assessment Activation

Route:

```http
POST /api/learning-growth/stage-assessments/:cycleId/activate
```

Request:

```js
{
  reason: "owner_manual"
}
```

Response:

```js
{
  ok: true,
  cycleId: "cycle_123",
  activationState: "active",
  cardId: "card_stage_123"
}
```

This manual activation route is Owner-only. It should reuse existing auth/access policy helpers and not expose other learner workspaces.

### Executor Challenge Activation

Route:

```http
POST /api/learning-growth/stage-assessments/challenge
```

Request:

```js
{
  subjectId: "computer_science",
  capabilityClusterId: "python-basics-loops",
  reason: "learner_feels_ready"
}
```

Response:

```js
{
  ok: true,
  activationSource: "executor_challenge",
  activationState: "active",
  cycleId: "cycle_123",
  cardId: "card_stage_123",
  rewardPolicy: {
    defaultCoins: 300,
    configuredCoins: 300
  }
}
```

The route is available to the authorized executor for their own workspace. It must not allow a learner to activate another workspace's assessment.

## Frontend Implementation

The frontend must follow the role branch flow from `growth-teaching-card-flow.md`.

### Files

Primary files:

- `public/app-learning-growth-task-ui.js`
- `public/app-learning-growth-ui.js`
- `public/app-learning-growth-controller.js`
- `public/app-learning-native-growth-submission-controller.js`
- `public/styles.css`

Add a new file only if the teaching-card UI becomes too large:

- `public/app-learning-growth-teaching-card-ui.js`

If a new frontend file is added, wire it in:

- `public/index.html`
- `public/service-worker.js`
- `public/directory-viewer.html`
- `tests/task-list-ui.test.js`
- `tests/architecture-refactor-boundary.test.js`

Static client version bump is required for any frontend change.

### State

Add state keys in the existing frontend state container:

```js
state.learningGrowthTeachingStepByCardId = {};
state.learningGrowthTeachingDrafts = {};
state.learningGrowthExperienceSignalBusy = {};
state.learningGrowthStageAssessmentActivating = {};
```

Teaching step values:

```js
"lesson" | "guided_practice" | "quick_check" | "feedback" | "complete"
```

### Render Branch

In the Growth task detail renderer:

```js
if (cardRole === "teaching") {
  return renderTeachingCardDetail(todo, options);
}

if (cardRole === "practice" || cardRole === "integration_practice") {
  return renderPracticeCardDetail(todo, options);
}

return renderAssessmentCardDetail(todo, options);
```

Do not render duplicate page titles inside the detail if the top page header already names the Growth view. Detail content should start with the card title, role badge, progress stepper, and the current section.

### Teaching Detail Components

Functions to add:

```js
function growthCardRole(todoOrTaskModel) {}
function renderGrowthCardRoleBadge(role) {}
function renderTeachingCardDetail(todo, options = {}) {}
function renderTeachingStepNav(todo, step, options = {}) {}
function renderTeachingLessonSection(flow, options = {}) {}
function renderTeachingGuidedPracticeSection(flow, draft, options = {}) {}
function renderTeachingQuickCheckSection(flow, draft, options = {}) {}
function renderTeachingFeedbackSection(todo, feedback, options = {}) {}
function renderExperienceSignalActions(todo, options = {}) {}
function renderStageAssessmentActivationPanel(todo, options = {}) {}
function renderExecutorChallengeAction(todoOrCluster, options = {}) {}
```

Learner-facing stepper:

```text
lesson -> guided_practice -> quick_check -> feedback -> complete
```

Button labels should match the current step:

- `开始学习`
- `开始跟练`
- `做小检查`
- `看反馈`
- `完成学习`

Safe feedback actions should be visible in teaching/practice detail:

- `太难`
- `没学过`
- `先讲一下`
- `今天轻一点`

These actions call the experience-signal route, then re-render the card with the returned recommendation.

Stage assessment surfaces should show a challenge action when the learner has an available capability cluster and cooldown/safety policy allows it. The action should be labeled as a challenge/checkpoint, not as daily homework.

### Controllers

Controller functions:

```js
function setLearningGrowthTeachingStep(cardId, step) {}
function updateLearningGrowthTeachingDraft(cardId, patch) {}
async function submitLearningGrowthTeachingCheck(cardId) {}
async function recordLearningGrowthExperienceSignal(cardId, signalType, options = {}) {}
async function activateLearningGrowthStageAssessment(cycleId) {}
async function startLearningGrowthStageAssessmentChallenge(input) {}
```

Controller behavior:

- Store drafts locally per card id.
- Disable only the affected card action while an API request is pending.
- After a successful teaching check, update board/detail state from the response and advance to `feedback` or `complete`.
- After `too_hard` or `not_learned`, keep the learner in a low-pressure UI state and show the repair recommendation; do not force a formal submission.
- After executor challenge activation, open the new `stage_assessment` detail and use the formal assessment UI.
- Swipe/back behavior should follow the existing secondary-view rules: Growth task detail returns to the Growth board/settings parent, not to an unrelated page.

### Visual Rules

- Role badges should be compact: `教学`, `练习`, `综合练习`, `阶段测评`.
- Teaching cards should look like a guided lesson, not an exam sheet.
- Stage assessment cards can keep formal scoring language, but should be labeled as `阶段测评`.
- Avoid large warning blocks for `too_hard`/`not_learned`; these are normal learning signals.
- Do not put functional actions as repeated inline page headers. Use the current page/detail action pattern and top overflow where appropriate.

## Model Contract

Model input should be structured:

```js
{
  learner: {
    ageBand: "grade7",
    languageLevel: "B1-bridge"
  },
  subjectId: "computer_science",
  capabilityClusterId: "python-basics-loops",
  allowedCardRoles: ["teaching"],
  completionPolicy: "teaching_check",
  targetDifficultyBand: "mostly_doable_after_teaching",
  expectedDurationMinutes: { min: 10, max: 15 },
  rewardPolicy: { defaultCoins: 100 },
  recentMasteryEvidence: [
    { capabilityId: "python-print", confidence: "medium", source: "practice" }
  ],
  recentExperienceSignals: [
    { signalType: "too_hard", count: 2, windowDays: 7 }
  ],
  prerequisites: [
    { capabilityId: "python-print", evidence: "observed" },
    { capabilityId: "python-range", evidence: "weak" }
  ],
  outputSchema: "growth_teaching_card_v1"
}
```

Model output must match:

```js
{
  cardRole: "teaching",
  completionPolicy: "teaching_check",
  learningTarget: "...",
  whyItMatters: "...",
  prerequisites: [
    { capabilityId: "python-range", label: "range()", required: true, evidenceAssumption: "weak" }
  ],
  microLesson: { learnerFacingText: "...", keyPoints: ["..."] },
  workedExample: { prompt: "...", steps: [{ label: "...", text: "..." }] },
  guidedPractice: { mode: "modify_code", prompt: "...", hints: ["..."] },
  quickCheck: { mode: "short_answer", prompt: "...", expectedEvidence: ["..."] },
  expectedTimeMinutes: 12,
  rewardPolicy: { defaultCoins: 100 },
  difficultyBasis: "Prerequisite range() is weak, so this teaches before asking independent code.",
  supportLevel: "high",
  tooHardFallback: { action: "prerequisite_repair", capabilityId: "python-range" },
  evidenceToRecord: [
    { type: "understanding_feedback", weight: "low" }
  ]
}
```

Reject output when:

- schema fields are missing;
- it asks for independent work before teaching an uncertain prerequisite;
- expected time is too high for an ordinary card;
- expected time is below 10 minutes or above 15 minutes for ordinary teaching/practice unless Owner policy explicitly overrides it;
- it exposes hidden answer keys in public fields;
- it uses formal assessment gates on `teaching`;
- it claims high mastery from teaching-card evidence;
- it includes raw prompt text or private source body.

Regeneration policy:

1. Ask the model once more with explicit validation errors.
2. If it still fails, create a deterministic repair/teaching draft or mark the draft for Owner review.
3. Do not silently publish a formal test when teaching was requested.

## Tests

New tests:

- `node tests\learning-growth-card-role-service.test.js`
- `node tests\learning-growth-teaching-card-contract-service.test.js`
- `node tests\learning-growth-experience-signal-service.test.js`
- `node tests\learning-growth-stage-assessment-service.test.js`

Updated tests:

- `node tests\learning-growth-jit-task-service.test.js`
- `node tests\learning-growth-task-interaction-state-service.test.js`
- `node tests\learning-growth-board-projection-service.test.js`
- `node tests\learning-growth-submission-service.test.js`
- `node tests\learning-growth-mastery-profile-service.test.js`
- `node tests\learning-growth-next-card-strategy-service.test.js`
- `node tests\app-learning-growth-ui.test.js`
- `node tests\app-learning-growth-task-ui.test.js`
- `node tests\task-list-ui.test.js`
- `node tests\architecture-refactor-boundary.test.js`

Regression cases:

- Python card with weak `range()` evidence becomes `teaching`, not `stage_assessment`.
- Science card where learner reports `not_learned` records a prerequisite gap and recommends repair.
- Teaching card completes without spoken reflection by default.
- Teaching/practice completion settles default `100` coins through the existing reward boundary unless backend policy overrides it.
- Stage assessment still requires the formal submit/evaluate/revise/reflect path.
- Stage assessment completion settles default `300` coins through the existing reward boundary unless backend policy overrides it.
- Dormant stage assessment does not display as daily overdue work.
- Owner manual activation turns an eligible cycle into an active stage assessment card.
- Executor challenge activation creates or activates an active stage assessment for the executor's own workspace.
- Full learner answer text is not copied into experience signals, mastery summaries, Action Inbox, docs, or handoffs.

## Rollout Plan

1. Commit native Growth schema/contracts/tests with no official Kanban dependency for the new flow.
2. Add native projection fields with default role inference for old readable cards only.
3. Enable teaching-card generation for native Growth cards behind a config flag, for example `HERMES_MOBILE_GROWTH_TEACHING_CARDS=1`.
4. Use test workspace `weixin_test_1` and create one Python teaching card, one Science prerequisite-repair card, and one executor-triggered stage assessment challenge.
5. Verify frontend flow on mobile viewport:
   - role badge visible;
   - lesson/example/guided practice/quick check steps fit without repeated headers;
   - `太难` / `没学过` records a safe signal;
   - stage assessment still uses the old formal flow.
6. After local tests pass, deploy according to changed scope:
   - frontend-only: static version bump and static sync;
   - route/service changes: listener/bridge-host restart after `/api/status` confirms no active work;
   - Gateway Pool restart only if Gateway plugin/profile/schema/start scripts change.

## Acceptance Criteria

- Ordinary new cards for uncertain Python/Science topics teach first.
- Formal mastery evidence is mostly produced by stage assessment cards.
- The learner can report "too hard" or "not learned" without being forced into failure.
- Owner can manually activate a stage assessment cycle.
- Executor can start a challenge assessment for their own available capability cluster.
- Daily teaching/practice cards award default `100` coins, and stage assessment cards award default `300` coins, with backend policy override.
- Existing assessment cards keep working.
- Tests cover service contracts, projections, frontend role branching, and privacy constraints.
- Docs stay aligned: design note, implementation note, Growth module doc, frontend state map, product requirements, and test matrix if test scope expands.
