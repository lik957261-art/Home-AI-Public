# Runbook: Growth Card Stuck Waiting For AI

## Symptom

A Growth card shows waiting for AI even though grading appears to have completed.

## Checks

Use metadata-only queries. Do not dump learner answers or transcripts.

1. Check `learning_growth_evaluation_jobs` for the task/submission.
2. Check latest `learning_evaluations` status, score, passed, and next step.
3. Check board projection from `GET /api/learning-growth/board`.

## Known Cause

`draft_feedback` means grading completed and the learner needs revision/reflection. It should not remain in the waiting-AI lane.

Expected board state:

- lane/action: revision
- `nextAction=revise`
- `canSubmit=true` when the learner should revise

## Relevant Files

- `adapters/learning-growth-board-projection-service.js`
- `adapters/learning-growth-service.js`
- `tests/learning-growth-board-projection-service.test.js`
- `tests/learning-growth-service.test.js`

## Validation

- `node tests\learning-growth-board-projection-service.test.js`
- `node tests\learning-growth-service.test.js`
- production board smoke with task ids only
