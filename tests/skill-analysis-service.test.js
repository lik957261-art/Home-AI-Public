"use strict";

const assert = require("node:assert/strict");
const { createSkillAnalysisService } = require("../adapters/skill-analysis-service");

function visibleAnalysisText(analysis) {
  return [
    analysis.summary,
    ...analysis.capabilities,
    ...analysis.invocationConditions,
    ...analysis.nonInvocationConditions,
    ...analysis.inputsOutputs,
    ...analysis.modificationNotes,
    ...(analysis.fixes || []).flatMap((fix) => [fix.label, fix.description]),
  ].join("\n");
}

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
  assert.match(analysis.summary, /^功能：/);
  assert(analysis.summary.includes("X/Twitter 信源搜索"));
  assert(analysis.invocationConditions.some((item) => item.includes("用户明确要求")));
  assert(analysis.nonInvocationConditions.some((item) => item.includes("本地数据查询")));
  assert(analysis.inputsOutputs.some((item) => item.includes("查询词")));
  assert(analysis.modificationNotes.some((item) => item.includes("触发条件限定")));
  assert.equal(analysis.fixes[0].id, "narrow-x-search-invocation");
  assert.equal(analysis.fixes[0].label, "收窄 X 搜索调用条件");
  assert.deepEqual(analysis.source.frontmatterKeys, ["name", "description"]);
  assert(analysis.source.sectionTitles.includes("Do not use"));

  const visible = visibleAnalysisText(analysis);
  assert.equal(/Use when|Use this skill|Do not use|Input:|Output:|Search X|Summarize claims|query, timeframe/i.test(visible), false);

  const applied = service.applyFix({
    path: "social-media/x-social-monitoring-and-briefs",
    content: analysis.source ? `---
name: x-social-monitoring-and-briefs
description: Use when a task needs social-media briefs.
---

# X Social
` : "",
  }, "narrow-x-search-invocation");
  assert.equal(applied.changed, true);
  assert.match(applied.content, /Use only when the user explicitly asks to search X\/Twitter/);
  assert.match(applied.content, /Do not use for ordinary local data lookup/);

  assert.throws(
    () => service.analyze({ path: "empty", content: "" }),
    /Skill content is empty/,
  );

  console.log("skill analysis service tests passed");
}

run();
