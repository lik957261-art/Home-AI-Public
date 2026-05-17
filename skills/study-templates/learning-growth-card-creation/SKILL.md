---
name: learning-growth-card-creation
description: Fixed Hermes Mobile rules for generating Fanfan Growth Kanban task cards with UTF-8-safe titles, learning-growth metadata, executor routing, concrete prompts, evaluation, and reward expectations.
---

# Learning Growth Card Creation

Use this Skill whenever an agent or service creates Hermes Mobile Kanban cards for the Fanfan Growth learning system.

## Required Card Contract

Create structured card data, not a generic Todo. Every executable Growth card must include:

- `caseMode: "study-plan"`
- `caseTemplate: "learning-growth"`
- `caseId`: stable program or draft case id
- `caseCardId`: stable task id inside the plan
- `caseCardGoal`: concrete learner-facing instruction, starting with `Task instruction:`
- `caseDeliverables`: expected learner outputs
- `caseAcceptance`: completion and evaluation criteria
- `learningProgramId`
- `learningDraftId`
- `learningTaskCardId`
- `assignee`: executor workspace/account id, not a nickname

For Fanfan, the current executor workspace/account id is `weixin_stephen` unless a service-level learner binding says otherwise.

## Prompt Requirements

Do not create a card that says only "submit output" or "study output". The card must tell the learner what to do.

For English writing cards, require:

- a real first draft as the answer;
- a concrete topic, scope, or writing requirement;
- expected length or sentence count;
- feedback, rewrite, reflection, evaluation, and reward settlement as the flow.

The learner should never need to mark a Growth card complete before submitting the actual answer.

## Encoding Rules

Use the Hermes Mobile service/API creation path. Do not create Growth cards by calling raw `hermes kanban` with ad hoc shell text.

Preserve the original Unicode title in Hermes Mobile metadata. If a lower official Kanban layer returns a title such as `????`, Hermes Mobile must display the metadata title instead of overwriting it.

## Privacy And Safety

Do not log full child answers, full transcripts, full question text, answer keys, raw local paths, or secrets. Store only task ids, summaries, event types, evaluation summaries, and reward status.

Skill output may guide task structure, but database writes, state transitions, completion, evaluation, and coin settlement belong to Hermes Mobile services.
