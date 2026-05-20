"use strict";

const assert = require("node:assert/strict");
const {
  buildLearningGrowthTaskFeedbackMarkdown,
  createLearningGrowthTaskReportService,
} = require("../adapters/learning-growth-task-report-service");

function testBuildGenericMarkdownOmitsRawSubmission() {
  const markdown = buildLearningGrowthTaskFeedbackMarkdown({
    cardId: "t_vocab",
    card: {
      content: "Vocabulary card",
      learningTaskModel: {
        activityType: "vocabulary",
        skillId: "english_vocabulary_active_use",
        learnerInstruction: "Use target vocabulary in school examples.",
      },
    },
    evaluation: {
      activityType: "vocabulary",
      stage: "draft",
      status: "draft_feedback",
      score: 76,
      maxScore: 100,
      summary: "Vocabulary answer needs one clearer repair sentence.",
      evaluatedAt: "2026-05-18T01:00:00.000Z",
      nextStep: "rewrite_and_reflect",
      wordCount: 46,
      lineCount: 5,
      feedbackSections: {
        strengths: ["The answer uses school context."],
        focusAreas: ["Add one sentence showing the exact word meaning."],
        criterionFeedback: [{
          dimension: "word meaning",
          observation: "The target word is used but the meaning needs clearer context.",
          action: "Show the word meaning through a school example.",
        }],
        sentenceFeedback: [{
          evidence: "compare two ideas",
          issue: "The connection is not clear.",
          fix: "Show what is being compared.",
          example: "I compare the two ideas before I choose my answer.",
        }],
        rewriteChecklist: ["Repair two vocabulary sentences."],
        reflectionPrompts: ["Which word became clearer?"],
        nextPractice: "Use the word again in a different school scene.",
      },
    },
  });
  assert.match(markdown, /Vocabulary card/);
  assert.match(markdown, /Active vocabulary/);
  assert.match(markdown, /Vocabulary answer needs one clearer repair sentence/);
  assert.match(markdown, /word meaning/);
  assert.match(markdown, /Show the word meaning through a school example/);
  assert.match(markdown, /I compare the two ideas/);
  assert.match(markdown, /Use target vocabulary/);
  assert.doesNotMatch(markdown, /full raw student answer/);
}

function testWriteGenericReportUsesActivityFilename() {
  const writes = [];
  const service = createLearningGrowthTaskReportService({
    nowMs: () => 1779000000001,
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
    cardId: "t_vocab",
    card: {
      content: "Vocabulary card",
      kanbanCaseId: "case-1",
      learningTaskModel: { activityType: "vocabulary", skillId: "english_vocabulary_active_use" },
    },
    evaluation: { activityType: "vocabulary", status: "draft_feedback", score: 76, feedbackSections: {} },
  });
  assert.match(report.name, /^01-\u521d\u6b21\u63d0\u4ea4\u6279\u6539-\u8bcd\u6c47-Vocabulary-card-\d{8}-\d{6}\.md$/);
  assert.match(report.path, /C:\\deliverables\\weixin_stephen\\case-1\\t_vocab/);
  assert.equal(writes.length, 1);
  assert.match(writes[0].text, /Vocabulary card/);
}

function testWritingStillDelegatesToWritingReport() {
  const service = createLearningGrowthTaskReportService({
    writingReportService: {
      writeReport(input) {
        assert.equal(input.evaluation.activityType, "writing");
        return { path: "C:\\tmp\\writing.md", name: "writing.md", mime: "text/markdown", size: 10 };
      },
    },
  });
  const report = service.writeReport({
    cardId: "t_write",
    card: { content: "Writing card", learningTaskModel: { activityType: "writing" } },
    evaluation: { activityType: "writing" },
  });
  assert.equal(report.name, "writing.md");
}

testBuildGenericMarkdownOmitsRawSubmission();
testWriteGenericReportUsesActivityFilename();
testWritingStillDelegatesToWritingReport();
console.log("learning growth task report service tests passed");
