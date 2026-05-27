# Growth Knowledge Graph Architecture

Last updated: 2026-05-27.

## Scope

This architecture defines a native Hermes Mobile knowledge-graph layer for
Growth learning cards. It is intentionally smaller than a courseware platform:
it constrains card planning, sequencing, evidence, and assessment coverage, but
does not own rendering, evaluation, reward settlement, or publishing.

## Layering

```text
External seed packs / Owner domain packs
              |
              v
Native graph import and validation
              |
              v
learningGraphPlan
              |
              v
Growth card authoring / JIT card generation
              |
              v
Existing Growth workflow contract
```

## Planned Components

### `learning-graph-node-service`

Owns graph node normalization and validation.

Responsibilities:

- validate graph node shape;
- normalize source pack ids into native node ids;
- validate prerequisite edges;
- detect cycles;
- expose node lookup by id, alias, domain, and source ref.

### `learning-graph-repository`

Persists native graph records.

Planned tables:

- `learning_graph_nodes`
- `learning_graph_edges`
- `learning_graph_domain_packs`
- `learning_graph_imports`
- `learning_graph_plans`
- `learning_card_graph_bindings`

### `learning-graph-import-service`

Converts external or Owner-provided seed packs into native records.

Initial source types:

- `teachany_seed`
- `owner_manual`
- `model_temporary`
- `program_seed`

External records are not runtime dependencies after import. The runtime reads
native graph records and source metadata only.

### `learning-graph-plan-service`

Builds `learningGraphPlan` before card authoring.

Inputs:

- learner id;
- program id;
- goal or source material summary;
- current mastery summary;
- recent experience signals;
- available domain packs;
- requested card role or stage assessment goal.

Outputs:

- a validated node path;
- target node id;
- prerequisite node ids;
- card role recommendations;
- assessment coverage;
- evidence requirements;
- difficulty band.

### `learning-graph-card-binding-service`

Binds authored cards to graph nodes and stores the graph plan id.

Rules:

- a formal card must bind to `learningGraphPlanId`;
- a card may bind to multiple nodes only when its role allows it;
- stage assessments must bind to an explicit coverage set;
- binding records must be immutable except for repair metadata.

### Existing Growth services

Existing services remain authoritative for runtime workflow:

- `learning-program-publish-service`
- `learning-growth-jit-task-service`
- `learning-growth-board-projection-service`
- `learning-growth-submission-service`
- `learning-growth-task-evaluation-service`
- `learning-growth-reflection-service`
- `learning-reward-settlement-service`
- `learning-growth-mastery-profile-service`

Graph services provide planning input and evidence targets. They do not mutate
workflow state directly.

## Native Data Model

### Graph Node

```js
{
  nodeId: "kg_math_ratio_intro",
  domain: "math",
  nodeType: "concept",
  title: "Ratio as comparison",
  aliases: ["ratio meaning", "what a ratio means"],
  levelScale: {
    type: "curriculum_grade",
    value: "grade_6"
  },
  source: {
    kind: "teachany_seed",
    ref: "cn/math/...",
    version: "import-20260527"
  },
  learningOutcomes: [
    "Explain what two quantities a ratio compares."
  ],
  misconceptions: [
    "Treating a ratio as a single absolute number."
  ],
  evidenceRequired: [
    "Solve a simple comparison task and explain the compared quantities."
  ],
  privacyClass: "summary_only"
}
```

### Graph Edge

```js
{
  edgeId: "kg_edge_ratio_fraction",
  fromNodeId: "kg_fraction_meaning",
  toNodeId: "kg_ratio_intro",
  edgeType: "prerequisite",
  confidence: "seed",
  sourceRef: "teachany_seed:..."
}
```

### Learning Graph Plan

```js
{
  learningGraphPlanId: "lgp_...",
  learnerId: "weixin_stephen",
  programId: "lprog_...",
  targetNodeId: "kg_ratio_intro",
  prerequisiteNodeIds: ["kg_fraction_meaning"],
  pathNodeIds: ["kg_fraction_meaning", "kg_ratio_intro"],
  cardSequence: [
    {
      cardRole: "teaching",
      targetNodeIds: ["kg_ratio_intro"],
      difficultyBand: "foundation",
      evidenceRequired: ["explain_ratio_comparison"]
    }
  ],
  assessmentCoverage: [],
  sourceBasis: {
    kind: "native_graph",
    refs: ["kg_ratio_intro"]
  },
  privacyClass: "summary_only"
}
```

## Domain Pack Architecture

A domain pack is a bounded knowledge graph package. K12 is one domain pack type,
not the root schema.

Minimum domain pack metadata:

- `domainPackId`
- `domain`
- `title`
- `sourceKind`
- `version`
- `ownerWorkspaceId`
- `visibility`
- `importStatus`

Domain packs may represent:

- K12 curriculum;
- programming learning paths;
- English CEFR or skill taxonomies;
- writing and presentation skills;
- personal knowledge workflows;
- professional skills.

## Privacy Boundary

Graph records may store:

- node ids;
- source refs;
- bounded summaries;
- short learning outcomes;
- misconception labels;
- evidence types;
- timestamps and import ids.

Graph records must not store:

- full learner answers;
- full transcripts;
- full questions or answer keys;
- raw prompts;
- raw model responses;
- push endpoints;
- access keys;
- local private paths beyond safe source refs.

## Failure Model

Graph planning can fail closed before card publication.

Failure classes:

- `missing_target_node`
- `missing_prerequisite`
- `cycle_detected`
- `invalid_card_binding`
- `assessment_coverage_missing`
- `unsafe_raw_content`
- `source_import_failed`

The learner-facing UI should not receive raw graph failure details. Owner/debug
surfaces may receive bounded failure classes and source ids.

## CodeGraph/Harness Role

CodeGraph should be used for structural impact once implementation begins, but
this architecture is a contract layer. The graph layer itself must be protected
by workflow harnesses and schema tests, not by manual inspection.
