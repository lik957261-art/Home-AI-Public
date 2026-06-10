# Module: Growth Learning

## Responsibility

Growth Learning owns learner programs, evergreen task cards, submissions, async evaluation, reflection, rewards, mastery profile, and next-card strategy.

The migration path from the built-in Home AI Growth module to the external
Growth embedded plugin is tracked in
`docs/IMPLEMENTATION_NOTES/growth-pluginization-plan.md`. New pluginization
work must follow that staged boundary instead of copying the Home AI server or
raw Growth internals into the plugin workspace.

## Core Files

- `adapters/growth-plugin-facade-service.js` for the bounded migration facade.
- `server-routes/growth-plugin-facade-api-routes.js` for `/api/growth/v1/*`.
- `/Users/hermes-dev/HermesMobileDev/plugins/growth/src/services/growth-service.js`
  for the current plugin-side facade/snapshot read path.
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
- `public/app-share-image-ui.js` for learning-card image sharing.

Planned graph-guided card planning files are documented in
`docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-implementation.md`:

- `adapters/learning-graph-node-service.js`
- `adapters/learning-graph-repository.js`
- `adapters/learning-graph-import-service.js`
- `adapters/learning-graph-plan-service.js`
- `adapters/learning-card-graph-binding-service.js`

## Key Routes

- `GET /api/growth/v1/status` (bounded pluginization facade)
- `GET /api/growth/v1/board` (bounded pluginization facade)
- `GET /api/growth/v1/cards/:taskCardId` (bounded pluginization facade)
- Growth plugin manifest: `GET /api/v1/hermes/plugin/manifest`.
- Growth plugin provisioning: `POST /api/v1/hermes/plugin/workspaces`.
- Growth plugin launch: `POST /api/v1/hermes/plugin/launch`.
- Growth plugin audio playback:
  `GET /api/v1/growth/audio/submissions/:submissionId` and
  `GET /api/v1/growth/audio/reflections/:reflectionId` when the plugin-owned
  SQLite read path is active.
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
- `learning_task_audio_blobs`
- `learning_growth_evaluation_jobs`
- `learning_evaluations`
- `learning_task_reflections`
- `learning_reward_settlements`
- `learning_growth_mastery_states`
- `learning_growth_card_trajectories`
- `learning_growth_experience_signals`
- `learning_growth_stage_assessment_cycles`

Planned graph-guided card planning tables:

- `learning_graph_nodes`
- `learning_graph_edges`
- `learning_graph_domain_packs`
- `learning_graph_imports`
- `learning_graph_plans`
- `learning_card_graph_bindings`

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
- A `rejected` spoken reflection is a processed result, not a still-transcribing state. Learner UI should clearly show the last reflection was not accepted, optionally with bounded score/summary metadata, and keep the retry recorder visible. The transient "transcribing/settling" copy is only for the foreground submit request and must be replaced by the persisted result after refresh or polling.
- Ordinary Growth cards should not all use the formal submit/evaluate/revise/reflect flow. Teaching cards and practice cards teach a focused concept, provide an example or guided activity, run a lightweight check, and record low/medium-weight learning evidence.
- Stage assessment cards are evergreen formal assessment cards. They can stay dormant and activate when recent teaching/practice evidence, elapsed time, stale mastery evidence, or Owner manual activation indicates that an independent mastery check is useful.
- Executor challenge activation is part of V1: an authorized executor can start a challenge assessment for their own available capability cluster when cooldown and safety policy allow it.
- Reports such as `too_advanced`, `not_learned`, or `prerequisite_gap` should feed card generation and prerequisite repair. They should not be treated as high-confidence mastery failure unless confirmed by a formal assessment.
- Growth scheduling should avoid turning missed days or difficult cards into backlog pressure. Repeated `too_hard`, `not_learned`, abandonment, or fatigue signals should lower pressure and generate repair/teaching cards before further assessment.
- V1 teaching/practice/integration cards default to 100 coins and 10-15 minutes. V1 stage assessment cards default to 300 coins, 25-30 minutes, and more tasks/questions than daily cards. Backend reward policy can override coin values.
- New teaching-card behavior uses native Growth board persistence and native Growth SQLite tables. Do not build the new feature around official Kanban compatibility; existing Kanban-linked routes are legacy/current-flow compatibility only.
- Model-generated cards must pass a structured card contract and validation rules. The model is not trusted to infer pedagogy policy from prose alone; invalid or unsupported output should be rejected, regenerated, downgraded to a repair card, or held for Owner review.
- New formal model-generated cards should converge on a graph-guided planning contract before publication. The required pre-authoring object is `learningGraphPlan`, which declares target graph node, prerequisites, path, card role sequence, evidence requirements, and assessment coverage when applicable.
- The native Growth graph layer is a planning and evidence target layer. It does not own canonical workflow state, async evaluation jobs, spoken reflection, reward settlement, Action Inbox, Web Push, or Owner manual pass.
- The graph schema must support K12 curriculum seed packs while remaining domain-neutral for future packs such as programming, English skill bands, writing, wardrobe/personal workflows, or other Owner-approved learning domains.
- Temporary graph nodes are allowed when no seed node exists, but they must still declare outcomes, prerequisites, evidence, domain, and summary-only source basis.
- Model-assisted learning-plan decomposition uses a long-running model budget by default, accepts common structured `dailyPlans` shapes, and may make one model repair pass when the first response is not strict JSON or does not match the plan schema. With `requireModel=true`, deterministic fallback is still not allowed: if the model times out or the repair pass also fails, the draft fails closed.
- Growth model calls may use either SSE or ordinary JSON responses from Gateway. New learning-plan decomposition and JIT card authoring should prefer streaming responses so `hermesModelText` receives incremental text deltas consistently; non-stream JSON responses must still be surfaced to avoid empty-output invalid JSON failures.
- For `teaching`, `practice`, and `integration_practice` cards, production JIT generation must return an explicit model-authored `teachingFlow` with micro-lesson, worked example, guided practice, and quick check sections. If `requireModel=true` and the model output omits that structure, publishing fails closed instead of silently using a local split of the old instruction text. Deterministic teaching-flow fallback is only a compatibility/normalization aid for older stored cards, not the production authoring path for new cards.
- Native Growth audio/text submissions are accepted before model evaluation and persisted as `learning_growth_evaluation_jobs`. The listener must keep a lightweight retry dispatcher alive: pending/retry jobs should survive restarts, failed model calls should retry after `availableAt`, and stale processing leases should become recoverable without requiring the learner to resubmit.
- Growth card submission/reflection audio is canonical learning evidence and must be persisted in `learning_task_audio_blobs` as authenticated SQLite BLOB data. File paths may still exist as transient upload/transcription/cache material, but playback routes must prefer the SQLite BLOB and only fall back to the file path for older records. NAS or cross-host migration must preserve the learning SQLite database; it must not rely on Windows-local audio artifact paths for card playback.
- New Growth speaking/reading audio still requires a live transcription runtime
  after migration. Windows production calls the local Whisper large v3 Turbo
  service through `scripts/transcribe-reading-audio.ps1`; Linux/NAS production
  calls the same loopback service through `scripts/transcribe-reading-audio.js`.
  A NAS deployment must prove `http://127.0.0.1:8001/health` and the
  `/v1/audio/transcriptions` path before claiming Growth audio submission parity.
- Future non-trivial card workflow changes must follow `docs\IMPLEMENTATION_NOTES\growth-learning-workflow-contract-harness.md`: state transitions, async jobs, reconciler behavior, UI projection, reward settlement, and privacy assertions need harness scenarios before implementation is considered done.
- Historical mastery profile repair should use `scripts\backfill-learning-growth-mastery-profile.js`; it reads historical evaluation metadata and writes idempotent summary-only mastery states.

## Teaching Card Flow

The detailed design is in `docs\IMPLEMENTATION_NOTES\growth-teaching-card-flow.md`. The code-oriented implementation plan is in `docs\IMPLEMENTATION_NOTES\growth-teaching-card-implementation.md`.

The workflow contract and harness design is in `docs\IMPLEMENTATION_NOTES\growth-learning-workflow-contract-harness.md`. Use it as the gate for changes that touch submission, evaluation, reflection, reward settlement, recovery, or learner-facing workflow projection.

Graph-guided planning docs:

- `docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-requirements.md`
- `docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-architecture.md`
- `docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-design.md`
- `docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-implementation.md`

These docs define the pre-authoring layer for future cards. They do not replace
the workflow contract.

Card roles:

- `teaching`: explanation, worked example, guided practice, quick check, lightweight understanding feedback.
- `practice`: small exercises with hints/retry and medium-weight evidence.
- `integration_practice`: combines recently taught concepts.
- `stage_assessment`: formal independent task that may keep the existing submit/evaluate/revise/reflect completion gates.

Frontend Growth detail should branch by card role. Teaching cards use learner-facing steps such as target, lesson, example, guided practice, quick check, and feedback. Stage assessment cards use the formal assessment flow.

Growth card detail pages should use a full-width single-column reading layout:
top summary, compact metadata, then content sections. Do not nest table-like
cards or grids inside another bordered card in a way that squeezes the actual
learning content or pushes primary text below mobile-readable size.

Learning cards can be shared as PNG images from the detail page. The frontend
generates the image locally and uses the Web Share API with a file payload so a
phone can hand it to WeChat through the native share sheet. If file sharing is
not available, the fallback is clipboard copy or PNG download. The share image
should contain only the card's visible learning brief, goals, instructions,
teaching flow, checks, and safe metadata; it must not include raw learner
answers, transcripts, prompts, push endpoints, secrets, or hidden model output.

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
- `node tests\learning-growth-knowledge-graph-docs.test.js` for the pre-coding graph contract.
- `node tests\architecture-refactor-boundary.test.js` for server/service boundary changes.

## Growth Plugin Integration Notes

The development-stage Growth plugin uses the shared Hermes embedded-plugin
contract but its local manifest currently exposes snake_case fields:
`entry_url`, `workspace_registration_endpoint`, and `mcp_toolset`. Home AI
normalizes these into the standard manifest projection and infers
`/api/v1/hermes/plugin/launch` from the workspace registration endpoint when no
explicit launch endpoint is present.

Provisioning uses the Growth registration key only to create/bind a workspace
and store a hashed workspace access key. Runtime launch uses the workspace
access key, not the registration key, and the plugin returns an `entry_url`
containing a short-lived launch token. Host logs, docs, screenshots, and test
output must not include raw access keys or launch token values.

Growth plugin SQLite migration is now the production Growth read source for
Mac Home AI when the deployed plugin sets `GROWTH_DATA_OWNER=plugin`. The
plugin workspace provides
`npm run import:learning-sqlite -- --source-db <verified-backup.sqlite3>
--target-db <plugin-data>/growth-learning.sqlite3 --write --workspace-id
<workspace-id> --json` to copy a verified learning-growth SQLite backup into
plugin-owned storage. The script validates required Growth tables,
`PRAGMA quick_check`, foreign-key checks, creates a backup of any existing
target, and returns bounded count/readback metadata. Rollback uses the same
script with `--rollback <script-created-backup.sqlite3>`. Runtime reads prefer
that plugin-owned SQLite only when `GROWTH_DATA_OWNER=plugin`.

The plugin read boundary currently includes status, board, card detail, latest
submission/reflection projections, and playback of historical submission or
reflection audio. Plugin audio playback prefers `learning_task_audio_blobs`
content when present and falls back to bounded legacy artifact-file lookup under
configured Home AI data roots for older migrated records. The fallback root is
configured by `GROWTH_LEGACY_AUDIO_ROOTS`; if omitted, the plugin derives the
standard sibling Home AI `data` root from its workspace. The plugin must never
return raw absolute audio paths to the browser.

Historical Growth audio BLOB backfill is the first completed step toward making
the plugin self-contained for read evidence. The plugin workspace provides:

```bash
npm run backfill:audio-blobs -- \
  --db <plugin-data>/growth-learning.sqlite3 \
  --workspace-id <workspace-id> \
  --legacy-audio-root <Home-AI-data-root> \
  --dry-run \
  --json
```

Run `--write` only after an online SQLite backup exists and the dry-run shows
acceptable `would_backfill`, `file_missing`, and bounded sample evidence.
Production Stephen backfill on 2026-06-10 wrote 10 BLOB records, 46,107,050
bytes, with `file_missing=0`; a follow-up dry-run reported
`already_blobbed=10` and `would_backfill=0`.

Submission creation, audio upload, transcription, async model evaluation,
reflection settlement, reward settlement, mastery updates, Action Inbox/Web
Push notifications, and Owner manual workflow decisions remain in Home AI until
the workflow migration has separate tests and cutover evidence.

Current development visual evidence:

- `npm run ios:pwa:visual -- --debug-url http://127.0.0.1:19073/ --scenario embedded-plugin-shell --plugin-id growth --theme dark --expected-client-version 20260610-growth-plugin-shell-v680 --timeout-ms 70000 --json`
- Result: `ok=true`; assertions passed for plugin id, shell existence, frame
  existence, meaningful frame size, no horizontal overflow, expected client
  version, and non-empty screenshot.
- Screenshot:
  `/Users/xuxin/.homeai-qa/artifacts/ios-pwa-visual-embedded-plugin-shell-growth-20260610T023822Z.png`.

## Constraints

- Do not store or print full learner answers, transcripts, questions, answer keys, or raw prompts.
- Keep evaluation and reward settlement separate.
- Async evaluation work must be durable across listener/Gateway restarts.
- Mastery profile evidence must be idempotent and auditable by evidence id/source ref.
- Production card skill ids must be normalized through the capability taxonomy aliases before evidence is recorded; do not drop legacy ids such as `english_reading_comprehension` or `math_ratio_proportional_reasoning`.
- Future graph-guided card authoring must not publish formal cards from a free-form topic prompt alone; it must use a validated `learningGraphPlan` or an explicitly validated temporary graph node.
