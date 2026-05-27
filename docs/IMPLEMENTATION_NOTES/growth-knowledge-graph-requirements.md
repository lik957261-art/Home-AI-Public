# Growth Knowledge Graph Requirements

Last updated: 2026-05-27.

## Purpose

Growth learning cards should not be generated from an unconstrained prompt. A
model can write plausible lessons, but without a prior knowledge structure it
can skip prerequisites, mix difficulty levels, over-test new concepts, or
produce cards that cannot be tied back to mastery evidence.

This document defines the product requirements for a graph-guided Growth card
planning layer. It is a pre-coding contract: future implementation must satisfy
these rules before graph-guided card generation is considered complete.

## Problem

The current AI-driven learning-card authoring path has too much freedom before
the card is created:

- the target concept can be underspecified;
- prerequisites are often implicit instead of explicit;
- card sequence is not always tied to a visible learning path;
- difficulty feedback such as `too_easy`, `right_level`, or `too_hard` affects
  a card but is not yet anchored to a stable graph node;
- stage assessments can be hard to explain unless they declare which capability
  nodes they cover.

The desired behavior is not a full external courseware system. Hermes Mobile
needs a small native graph layer that constrains what the model is allowed to
generate and makes each card auditable.

## Product Requirements

### KG-R1: Graph-first card planning

Every new formal Growth learning card must be generated from a
`learningGraphPlan`.

The plan may come from:

- an existing native graph node;
- a converted external seed graph node;
- a model-authored temporary node that passes validation;
- an Owner-approved domain pack.

The model must not directly publish a formal card from a free-form topic prompt
without a graph node or temporary graph node binding.

### KG-R2: Stable node identity

Each graph node must have a stable id and source metadata. The id must remain
stable across card regeneration, retries, and learner feedback.

Minimum identity fields:

- `nodeId`
- `domain`
- `nodeType`
- `title`
- `sourceKind`
- `sourceRef`
- `version`

### KG-R3: Explicit prerequisites

Prerequisites must be explicit node references. A card may reference no
prerequisites only when the node is an entry-level node or when the plan records
why no prerequisite is required.

The graph validator must reject:

- references to missing prerequisite nodes;
- circular prerequisite chains;
- prerequisite chains that cross domains without an explicit bridge node.

### KG-R4: Card role mapping

Each card must bind graph nodes to a card role:

- `teaching`
- `practice`
- `integration_practice`
- `stage_assessment`

Teaching and practice cards may cover one focused node. Integration cards may
cover several adjacent nodes. Stage assessments must declare the node set they
measure and must not rely on title text alone.

### KG-R5: Observable evidence

Every graph node must define what learning evidence can update it.

Minimum evidence shape:

- `evidenceRequired`
- `practicePatterns`
- `assessmentCoverage`
- `masterySignals`
- `experienceSignals`

Evidence remains summary-only. It must not contain full learner answers, full
transcripts, full questions, answer keys, raw prompts, or raw model responses.

### KG-R6: Difficulty and experience feedback

Learner difficulty feedback must be recorded against both the card and the
graph node when possible.

Examples:

- `too_easy` raises the chance of a harder follow-up or assessment readiness;
- `right_level` reinforces the current difficulty band;
- `too_hard`, `not_learned`, or `confusing` should create prerequisite repair
  evidence instead of a formal mastery failure.

### KG-R7: Beyond K12

The graph model must not be hard-coded to K12, grade, curriculum, or school
subject fields.

It must support domain packs such as:

- school K12 curriculum;
- programming;
- English CEFR or skill-based language learning;
- writing and presentation;
- wardrobe or personal knowledge workflows;
- adult professional or hobby domains.

K12 curriculum fields are optional metadata, not the schema foundation.

### KG-R8: External seed import

External knowledge structures can be used as seed packs only after conversion
into the native Hermes graph schema.

Converted nodes must preserve:

- source name;
- source node id or path;
- curriculum/system name when available;
- subject/domain;
- source version or import timestamp.

The runtime card workflow must depend on native graph records, not on external
repository paths.

### KG-R9: Workflow separation

The graph layer chooses what to learn and how to sequence it. It must not own:

- canonical card workflow state;
- async evaluation jobs;
- spoken reflection gates;
- reward settlement;
- Action Inbox delivery;
- Web Push delivery;
- Owner manual pass.

Those remain governed by the existing Growth workflow contract and services.

### KG-R10: Harness gate

Graph-guided Growth work is H1. Implementation is incomplete until the harness
can prove:

- a card cannot be published without a graph plan or valid temporary node;
- prerequisites exist and are acyclic;
- stage assessments declare coverage;
- learner feedback updates graph-node planning evidence without becoming a
  formal mastery failure by itself;
- public projections remain summary-only.

## Non-Goals

- Do not copy a full external courseware publishing stack into Hermes Mobile.
- Do not require every card to be a complete HTML courseware page.
- Do not make graph import a production dependency for ordinary chat or non-
  Growth workflows.
- Do not store raw learner content or raw model content in graph records.
- Do not block all future Growth work on a complete K12 graph; temporary graph
  nodes are allowed when they pass validation.

## Acceptance Criteria

Before the first implementation pass, the repo must contain:

- product requirements for graph-guided Growth cards;
- architecture notes for the native graph layer;
- design notes for `learningGraphPlan` and card bindings;
- implementation plan and harness scenarios;
- Skill rules that require graph planning before formal card creation;
- test coverage that protects the pre-coding documents and harness language.
