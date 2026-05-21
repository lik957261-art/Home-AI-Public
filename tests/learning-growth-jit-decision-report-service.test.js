"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildLearningGrowthJitDecisionMarkdown,
  createLearningGrowthJitDecisionReportService,
} = require("../adapters/learning-growth-jit-decision-report-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-jit-decision-"));
}

function testMarkdownIsDecisionReport() {
  const markdown = buildLearningGrowthJitDecisionMarkdown({
    program: { goalSummary: "Build stronger reading retell stamina." },
    previousTaskCardId: "task-1",
    task: {
      taskCardId: "task-2",
      title: "Reading retell 2",
      sequenceGroupId: "evergreen:reading",
      sequenceIndex: 2,
      learnerInstruction: "Read the bounded passage and record a retell.",
      deliverables: ["recorded retell"],
      acceptance: ["main idea included"],
      learningGrowthJitGeneration: {
        generatedAt: "2026-05-21T01:00:00.000Z",
        modelStatus: "completed",
        model: "automation-create",
        mode: "model_assisted_summary_state_at_card_creation",
        difficultyBand: "stretch",
        teacherRationale: "Recent summary showed the learner can handle a longer retell.",
        sourceRefs: ["progress:recent-1", "profile:stage"],
        focusSignals: ["reading stamina improved", "detail ordering still needs work"],
        skillTargets: ["english_speaking_retell"],
      },
    },
  });
  assert.match(markdown, /AI 开卡决策说明/);
  assert.match(markdown, /Recent summary showed/);
  assert.match(markdown, /progress:recent-1/);
  assert.match(markdown, /reading stamina improved/);
  assert.match(markdown, /Read the bounded passage/);
  assert.doesNotMatch(markdown, /rawPrompt|rawResponse|fullTranscript|localPath/);
}

function testWriteReport() {
  const root = tempRoot();
  const service = createLearningGrowthJitDecisionReportService({
    outputRoot: root,
    nowIso: () => "2026-05-21T01:00:00.000Z",
  });
  const report = service.writeReport({
    workspaceId: "weixin_stephen",
    task: {
      taskCardId: "task-2",
      title: "Reading retell 2",
      learnerInstruction: "Read and retell.",
      learningGrowthJitGeneration: {
        generatedAt: "2026-05-21T01:00:00.000Z",
        modelStatus: "completed",
        teacherRationale: "Use a slightly longer passage.",
      },
    },
  });
  assert.equal(report.mime, "text/markdown; charset=utf-8");
  assert.match(report.artifactId, /^lart_/);
  assert.equal(fs.existsSync(report.path), true);
  assert.match(fs.readFileSync(report.path, "utf8"), /Use a slightly longer passage/);
  fs.rmSync(root, { recursive: true, force: true });
}

testMarkdownIsDecisionReport();
testWriteReport();
console.log("learning growth jit decision report service tests passed");
