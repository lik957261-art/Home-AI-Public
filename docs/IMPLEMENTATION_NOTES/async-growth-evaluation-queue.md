# Implementation Note: Async Growth Evaluation Queue

## Purpose

Growth evaluation can take minutes. Accepted submissions should enqueue durable evaluation work and return quickly. Completion should update card projection and notify the user when appropriate.

## Core Flow

1. Submission route validates and persists learner evidence.
2. Evaluation job row is created in SQLite.
3. Worker/service processes the job with model-assisted evaluation.
4. Evaluation record is persisted.
5. Board projection moves from waiting AI to revision, reflection, completed, or failed state.
6. Web Push can deep-link to the task/evaluation view.

## Required Properties

- Durable across listener restart.
- Durable across Gateway restart.
- Idempotent retry.
- Metadata-only logs and docs.

## Common Failure

If a card says waiting AI but an evaluation exists, inspect projection mapping first. `draft_feedback` must map to actionable revision, not waiting AI.
