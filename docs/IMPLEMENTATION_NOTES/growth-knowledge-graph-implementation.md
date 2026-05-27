# Growth Knowledge Graph Implementation Plan

Last updated: 2026-05-27.

## Current Status

This is a pre-coding implementation plan. No runtime graph services or database
tables are implemented by this document. The current stable layer is:

- requirements;
- architecture;
- design contract;
- implementation phases;
- harness expectations;
- Skill rule updates;
- documentation guard tests.

## Phase 0: Pre-Coding Contract

Deliverables:

- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-requirements.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-architecture.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-design.md`
- `docs/IMPLEMENTATION_NOTES/growth-knowledge-graph-implementation.md`
- updates to Growth module docs, product requirements, harness matrix, test
  matrix, and card-creation Skill;
- `tests/learning-growth-knowledge-graph-docs.test.js`

Exit criteria:

- docs define the native graph schema and boundaries;
- harness matrix marks graph-guided Growth planning as H1;
- Skill rules require `learningGraphPlan` before formal card creation;
- documentation guard test passes.

## Phase 1: Native Schema And Repository

Planned files:

- `adapters/learning-graph-node-service.js`
- `adapters/learning-graph-repository.js`
- `tests/learning-graph-node-service.test.js`
- `tests/learning-graph-repository.test.js`
- SQLite migration in the normal learning schema path.

Planned tables:

- `learning_graph_nodes`
- `learning_graph_edges`
- `learning_graph_domain_packs`
- `learning_graph_imports`
- `learning_graph_plans`
- `learning_card_graph_bindings`

Harness requirements:

- stable node id validation;
- prerequisite existence;
- cycle detection;
- privacy marker rejection;
- summary-only fixture data.

## Phase 2: Seed Import

Planned files:

- `adapters/learning-graph-import-service.js`
- `scripts/import-learning-graph-pack.js`
- `tests/learning-graph-import-service.test.js`

Initial source types:

- `owner_manual`
- `model_temporary`
- `teachany_seed`
- `public_curriculum_foundation`

Rules:

- import converts external source into native graph records;
- native runtime does not read external repository paths;
- imported source metadata is bounded to source id, source kind, version, and
  import timestamp;
- import can be run in dry-run mode and must report counts, rejected nodes, and
  cycle findings.
- public curriculum foundation imports must start from a manifest that records
  source URL, source family, stage, subject, local path, status, size, and hash
  for downloaded public documents;
- paid textbooks, password-protected support-site material, past-paper archives,
  answer files, and full source body text must not be copied into native graph
  records;
- broad curriculum packages should be split into learner-appropriate domain
  packs instead of imported as one monolith. For example, Fanfan's IGCSE route
  can use an English / mathematics / science focus pack, while a Year 2 British
  route learner should start with a Primary / Key Stage 1-2 pack.

## Phase 3: Graph Plan Service

Planned files:

- `adapters/learning-graph-plan-service.js`
- `tests/learning-graph-plan-service.test.js`

Responsibilities:

- choose target node;
- build prerequisite/path sequence;
- recommend card roles;
- create `learningGraphPlan`;
- fail closed when the plan is invalid;
- support temporary nodes when no seed node exists.

The model may help create candidate nodes or plans, but service validation is
authoritative.

## Phase 4: Card Authoring Integration

Planned touch points:

- `adapters/learning-program-publish-service.js`
- `adapters/learning-growth-jit-task-service.js`
- `adapters/learning-growth-teaching-card-contract-service.js`
- `tests/learning-program-publish-service.test.js`
- `tests/learning-growth-jit-task-service.test.js`
- `tests/learning-growth-teaching-card-services.test.js`

Rules:

- new formal cards require `learningGraphPlanId`;
- card contracts include graph binding metadata;
- stage assessments require coverage nodes;
- old stored cards can render through compatibility normalization but new
  production cards must use graph planning once the feature flag is enabled.

## Phase 5: Evidence And Feedback Loop

Planned touch points:

- `adapters/learning-growth-experience-signal-service.js`
- `adapters/learning-growth-mastery-profile-service.js`
- `adapters/learning-growth-next-card-strategy-service.js`
- `tests/learning-growth-next-card-strategy-service.test.js`
- `tests/learning-growth-mastery-profile-service.test.js`

Rules:

- difficulty feedback is attached to card and node when possible;
- `too_hard`, `not_learned`, and `confusing` generate repair planning evidence;
- feedback does not directly create high-confidence mastery failure;
- mastery updates remain evidence-based and idempotent.

## Phase 6: Projection And UI

Planned touch points:

- `adapters/learning-growth-board-projection-service.js`
- `public/app-learning-growth-task-ui.js`
- `public/app-learning-growth-ui.js`
- `tests/learning-growth-board-projection-service.test.js`
- `tests/app-learning-growth-task-ui.test.js`
- `tests/app-learning-growth-ui.test.js`

Minimum UI:

- current node title;
- compact path label;
- prerequisite chips where useful;
- next-card reason;
- stage assessment coverage summary.

No graph browser is required in the first product pass.

## Harness Scenarios

Minimum H1 harness coverage:

1. publish teaching card with valid graph plan;
2. reject formal card without graph plan;
3. reject graph plan with missing prerequisite;
4. reject graph plan with prerequisite cycle;
5. publish stage assessment only when coverage nodes exist;
6. record `too_hard` as prerequisite repair evidence, not mastery failure;
7. convert external seed into native graph records without runtime path
   dependency;
8. ensure projections are summary-only;
9. ensure old compatibility cards can render but new graph-required mode fails
   closed when plan is missing.

Planned tests:

- `node tests\learning-graph-node-service.test.js`
- `node tests\learning-graph-import-service.test.js`
- `node tests\learning-graph-plan-service.test.js`
- `node tests\learning-card-graph-binding-service.test.js`
- `node tests\learning-growth-knowledge-graph-harness.test.js`
- existing Growth publish/JIT/projection/UI tests from `docs\TEST_MATRIX.md`

## Deployment Notes

Phase 0 is documentation/test-only and does not require deployment.

Runtime phases that add SQLite schema or service behavior require:

- focused service tests;
- architecture boundary test;
- privacy scan;
- backup before production sync;
- listener restart after server/service changes;
- no Gateway Pool restart unless Gateway worker/tool schema changes.

## Risks

- Overbuilding a courseware platform instead of a card-planning layer.
- Treating imported K12 data as complete coverage.
- Letting temporary model-authored nodes become unreviewed permanent truth.
- Storing raw source, learner, or prompt content in graph records.
- Updating card generation without a workflow harness.

## Current Engineering Rule

Until graph services exist, any implementation agent touching Growth card
authoring must either:

- keep the current non-graph behavior unchanged; or
- add the smallest graph-plan harness scenario before changing card generation.

## Pilot Seed: Fanfan IGCSE Bridge 12-Card Sequence

On 2026-05-27 a production pilot sequence was seeded from
`workspace/uk-hk-curriculum-foundation/knowledge-graph/fanfan-uk-hk-igcse-a-level-graph-v1.json`.

Runtime identifiers:

- Program: `lprogram_fanfan_igcse_bridge_pilot_v1`
- Draft: `ldraft_fanfan_igcse_bridge_pilot_v1`
- Sequence group: `kg_fanfan_igcse_bridge_pilot_v1`
- Learner/workspace: `weixin_stephen`

Seed shape:

- 12 ordinary teaching/practice targets across English, mathematics, and science.
- `sequenceMode: "evergreen_jit"` on every card.
- First card is current and JIT-authored through the production publish path.
- Future 11 cards are target shells only: `learningGrowthJitPending=true`,
  `learningGrowthSequenceVisibility="locked_future"`, no stored teaching flow,
  and no pre-created active sessions.
- Completing the current card should use the existing sequence service to JIT
  prepare the next target. After the 12th seed card, the same evergreen policy
  allows a generated follow-up card.

Operational notes:

- The seed script is local staging under gitignored `workspace/`:
  `workspace/uk-hk-curriculum-foundation/scripts/seed-fanfan-igcse-bridge-pilot.mjs`.
- The script writes only `learning_programs` and `learning_plan_drafts`; the
  production `publishProgram` route materializes task cards, Kanban links, and
  the current session.
- Before production write, `learning-growth.sqlite3` plus WAL/SHM was backed up
  under `C:\ProgramData\HermesMobile\backups\20260527-fanfan-igcse-bridge-pilot-v1`.
- No learner answer, transcript, raw prompt, model raw response, full generated
  card body, secret, access key, or push endpoint should be copied into this doc
  or handoff records.
