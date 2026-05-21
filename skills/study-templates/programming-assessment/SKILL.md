---
name: programming-assessment
description: Fixed Hermes Mobile template rules for programming assessment cards, including question generation, explanations, Chinese delivery reports, wrong-item summaries, and weak-point guidance.
---

# Programming Assessment Template

Use this Skill for Hermes Mobile programming assessment cards. The learner may provide teacher focus, classroom performance, project goals, code review notes, practice needs, or reference material. Treat that per-card requirement as the primary source.

## Question Generation Rules

- Generate targeted programming exam questions, not generic computer trivia.
- Prefer code reading, output prediction, debugging, syntax/API selection, algorithm reasoning, and small design-decision questions that can be answered as single-answer multiple choice.
- Calibrate difficulty to the learner level and current requirement. If the level is unclear, use a beginner-to-intermediate mix.
- Every question must have one clear correct answer, exactly four choices, a concise skill tag, and an explanation.
- Do not invent teacher notes, classroom behavior, source code, or project requirements that were not provided.

## Explanation Rules

- Explain why the correct option is correct.
- Explain the misconception behind the likely wrong choices when useful.
- Link each explanation to a concrete programming concept, such as variable assignment, loop boundaries, list indexes, condition branches, function return values, data types, debugging strategy, or algorithm steps.
- Use Chinese by default for learner-facing explanations unless the card explicitly asks for another language.

## Delivery Report Rules

The final report should be learner-facing Chinese Markdown. It must start with a useful summary before listing every question:

- `## 结论`: score, pass/fail, number of wrong items, and the main weak points.
- `## 本次输入要求清洗`: cleaned current requirement, teacher notes/context, and reference material.
- `## 错题清单`: only wrong questions, with student answer, correct answer, key explanation, and review focus.
- `## 薄弱点总结`: aggregate by skill tag and identify which concepts need priority review.
- `## 后续复习建议`: short actionable next steps.
- `## 逐题讲解`: every question with result, answer comparison, and explanation.

Do not bury the conclusion after the per-question list. A parent or student should be able to see what was wrong and what to practice within the first screen of the report.
