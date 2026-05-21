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
        sentenceFeedback: [{
          evidence: "good communication",
          issue: "Too general.",
          fix: "Add who did what.",
          example: "Clear communication helped our group finish the poster.",
        }],
        rewriteChecklist: ["Rewrite two sentences."],
        reflectionPrompts: ["What did I change?"],
        nextPractice: "Use a three-line outline first.",
      },
    },
  });
  assert.match(markdown, /Writing card/);
  assert.match(markdown, /Draft feedback ready/);
  assert.match(markdown, /Add one concrete example/);
  assert.match(markdown, /Clear communication helped our group finish the poster/);
  assert.match(markdown, /Use a three-line outline first/);
  assert.match(markdown, /改写任务/);
  assert.match(markdown, /金币结算/);
  assert.doesNotMatch(markdown, /Last week I joined/);
}

function testBuildFinalMarkdownIncludesConclusionAndSettlement() {
  const markdown = buildWritingFeedbackMarkdown({
    cardId: "t_growth",
    card: { content: "Writing card" },
    settlement: { status: "settled" },
    evaluation: {
      stage: "final",
      status: "completed",
      passed: true,
      score: 91,
      maxScore: 100,
      summary: "Final evaluation ready.",
      evaluatedAt: "2026-05-17T16:00:00.000Z",
      nextStep: "completed",
      wordCount: 96,
      sentenceCount: 6,
      targetMinWords: 80,
      targetMaxWords: 120,
      reward: { eligible: true, coinAmount: 15 },
      feedbackSections: {
        strengths: ["Clear final version."],
        focusAreas: ["Keep adding concrete examples."],
        rewriteChecklist: ["Reuse this outline next time."],
        reflectionPrompts: ["What will I do first next time?"],
      },
    },
  });
  assert.match(markdown, /最终结论/);
  assert.match(markdown, /最终判定/);
  assert.match(markdown, /服务层已结算 15 金币/);
  assert.doesNotMatch(markdown, /Final answer raw text/);
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
  assert.match(report.name, /^01-\u521d\u6b21\u63d0\u4ea4\u6279\u6539-\u82f1\u8bed\u5199\u4f5c-Writing-card-\d{8}-\d{6}\.md$/);
  assert.match(report.path, /C:\\deliverables\\weixin_stephen\\case-1\\t_growth/);
  assert.equal(writes.length, 1);
  assert.match(writes[0].text, /Writing card/);
}

testBuildMarkdownOmitsRawSubmission();
testBuildFinalMarkdownIncludesConclusionAndSettlement();
testWriteReportUsesArtifactDirectory();
console.log("learning growth writing report service tests passed");
