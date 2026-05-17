"use strict";

const assert = require("node:assert/strict");
const {
  buildWritingFeedbackMarkdown,
  createLearningGrowthWritingReportService,
} = require("../adapters/learning-growth-writing-report-service");

function testBuildMarkdownOmitsRawSubmission() {
  const markdown = buildWritingFeedbackMarkdown({
    cardId: "t_growth",
    card: { content: "Writing card" },
    evaluation: {
      stage: "draft",
      status: "draft_feedback",
      score: 79,
      maxScore: 100,
      summary: "Draft feedback ready.",
      evaluatedAt: "2026-05-17T16:00:00.000Z",
      nextStep: "rewrite_and_reflect",
      wordCount: 92,
      sentenceCount: 5,
      targetMinWords: 80,
      targetMaxWords: 120,
      feedbackSections: {
        strengths: ["Clear topic."],
        focusAreas: ["Add one concrete example."],
        rewriteChecklist: ["Rewrite two sentences."],
        reflectionPrompts: ["What did I change?"],
      },
    },
  });
  assert.match(markdown, /Writing card/);
  assert.match(markdown, /Draft feedback ready/);
  assert.match(markdown, /Add one concrete example/);
  assert.doesNotMatch(markdown, /Last week I joined/);
}

function testWriteReportUsesArtifactDirectory() {
  const writes = [];
  const service = createLearningGrowthWritingReportService({
    nowMs: () => 1779000000000,
    artifactService: {
      caseDeliverableDirectory(workspaceId, caseId, cardId) {
        return `C:\\deliverables\\${workspaceId}\\${caseId}\\${cardId}`;
      },
    },
    writeTextFile(filePath, text) {
      writes.push({ filePath, text });
      return filePath;
    },
  });
  const report = service.writeReport({
    workspaceId: "weixin_stephen",
    cardId: "t_growth",
    card: { content: "Writing card", kanbanCaseId: "case-1" },
    evaluation: { status: "draft_feedback", score: 79, feedbackSections: {} },
  });
  assert.equal(report.name, "1779000000000-Writing-card-writing-feedback.md");
  assert.match(report.path, /C:\\deliverables\\weixin_stephen\\case-1\\t_growth/);
  assert.equal(writes.length, 1);
  assert.match(writes[0].text, /Writing card/);
}

testBuildMarkdownOmitsRawSubmission();
testWriteReportUsesArtifactDirectory();
console.log("learning growth writing report service tests passed");
