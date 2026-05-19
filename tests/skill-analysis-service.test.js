"use strict";

const assert = require("node:assert/strict");
const { createSkillAnalysisService } = require("../adapters/skill-analysis-service");

function run() {
  const service = createSkillAnalysisService();
  const analysis = service.analyze({
    id: "x-social-monitoring-and-briefs",
    label: "x-social-monitoring-and-briefs",
    namespace: "social-media",
    path: "social-media/x-social-monitoring-and-briefs",
    totalChars: 1000,
    truncated: false,
    content: `---
name: x-social-monitoring-and-briefs
description: Use when a task needs X search, X account monitoring, or social-media briefs.
---

# X Social Monitoring

Use this skill when the user asks to search X posts, inspect an X account, or build a social-media monitoring brief.

## Workflow

- Search X with bounded query terms.
- Summarize claims and uncertainty.

## Do not use

- Do not use for ordinary local data lookup.
- Do not use when the user only asks for a general answer.

## Inputs and outputs

- Input: query, timeframe, and target account when available.
- Output: compact brief with sources.
`,
  });

  assert.equal(analysis.skill.path, "social-media/x-social-monitoring-and-briefs");
  assert.match(analysis.summary, /X search/);
  assert(analysis.invocationConditions.some((item) => /search X posts|X account/.test(item)));
  assert(analysis.nonInvocationConditions.some((item) => /ordinary local data/i.test(item)));
  assert(analysis.inputsOutputs.some((item) => /query, timeframe/.test(item)));
  assert(analysis.modificationNotes.some((item) => /X|social|search/.test(item)));
  assert.deepEqual(analysis.source.frontmatterKeys, ["name", "description"]);
  assert(analysis.source.sectionTitles.includes("Do not use"));

  assert.throws(
    () => service.analyze({ path: "empty", content: "" }),
    /Skill content is empty/,
  );

  console.log("skill analysis service tests passed");
}

run();
