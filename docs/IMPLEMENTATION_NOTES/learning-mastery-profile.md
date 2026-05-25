# Implementation Note: Learning Mastery Profile

## Purpose

The mastery profile records auditable ability evidence from Growth evaluations and reflections. It guides evergreen card progression by observed strengths, weaknesses, stability, and next strategy rather than fixed grade progression.

## Core Services

- `learning-growth-capability-taxonomy-service.js`
- `learning-growth-mastery-profile-service.js`
- `learning-growth-next-card-strategy-service.js`
- `learning-growth-board-projection-service.js`

## Persistence

- `learning_growth_mastery_states`
- `learning_growth_card_trajectories`

Evidence writes must be idempotent by evidence id/source ref and task card id. Historical backfill should skip already-recorded evidence.

## API/UI

- API: `GET /api/learning/growth/mastery-profile`
- Owner UI: Growth settings page, `画像` tab.

## Constraints

- Evidence summaries are bounded and summary-only.
- Do not store full learner submissions, transcripts, full questions, answer keys, or prompts.
- Missing historical trajectory records should not be fabricated. New evergreen completions should write trajectory records going forward.
