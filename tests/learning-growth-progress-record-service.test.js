"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthProgressRecordService,
  progressEntry,
  upsertProgressMarkdown,
} = require("../adapters/learning-growth-progress-record-service");

function testProgressEntryIsPrivacySafe() {
  const entry = progressEntry({
    cardId: "t_vocab",
    card: {
      content: "Vocabulary repair",
      learningTaskModel: { activityType: "vocabulary", skillId: "english_vocabulary_active_use" },
    },
    evaluation: {
      evaluationId: "eval-1",
      activityType: "vocabulary",
      skillId: "english_vocabulary_active_use",
      stage: "final",
      status: "completed",
      score: 88,
      maxScore: 100,
      passed: true,
      evaluatedAt: "2026-05-18T10:00:00.000Z",
      summary: "Vocabulary repair passed with clearer school-context examples.",
      reward: { eligible: true, coinAmount: 72, maxCoinAmount: 100 },
      feedbackSections: {
        focusAreas: ["Keep using concrete school examples."],
        nextPractice: "Use two target words in one connected paragraph.",
      },
    },
    report: { name: "vocabulary-feedback.md" },
  });
  assert.equal(entry.id, "eval-1");
  assert.match(entry.markdown, /Vocabulary repair passed/);
  assert.match(entry.markdown, /72\/100/);
  assert.match(entry.markdown, /vocabulary-feedback.md/);
  assert.doesNotMatch(entry.markdown, /full raw answer/i);
}

function testUpsertProgressMarkdownReplacesExistingAndLimitsEntries() {
  const first = progressEntry({
    cardId: "t_one",
    evaluation: {
      evaluationId: "same-eval",
      activityType: "grammar",
      status: "needs_revision",
      score: 62,
      summary: "First version.",
      evaluatedAt: "2026-05-18T10:00:00.000Z",
    },
  });
  const second = progressEntry({
    cardId: "t_one",
    evaluation: {
      evaluationId: "same-eval",
      activityType: "grammar",
      status: "completed",
      score: 82,
      summary: "Updated version.",
      evaluatedAt: "2026-05-18T10:05:00.000Z",
    },
  });
  const third = progressEntry({
    cardId: "t_two",
    evaluation: {
      evaluationId: "eval-2",
      activityType: "reading",
      status: "draft_feedback",
      score: 70,
      summary: "Another signal.",
      evaluatedAt: "2026-05-18T10:10:00.000Z",
    },
  });
  const one = upsertProgressMarkdown("", first, { title: "Signals", updatedAt: "now", maxEntries: 2 });
  const two = upsertProgressMarkdown(one, second, { title: "Signals", updatedAt: "now", maxEntries: 2 });
  const three = upsertProgressMarkdown(two, third, { title: "Signals", updatedAt: "now", maxEntries: 1 });
  assert.doesNotMatch(two, /First version/);
  assert.match(two, /Updated version/);
  assert.match(two, /Another signal|Updated version/);
  assert.match(three, /Another signal/);
  assert.doesNotMatch(three, /Updated version/);
}

function testRecordEvaluationWritesRootAndProgramProgress() {
  const writes = new Map();
  const service = createLearningGrowthProgressRecordService({
    nowIso: () => "2026-05-18T10:30:00.000Z",
    readText: (filePath) => writes.get(filePath) || "",
    writeText: (filePath, text) => {
      writes.set(filePath, text);
      return filePath;
    },
  });
  const result = service.recordEvaluation({
    learnerRoot: "C:\\learning\\Fanfan\\LearningPlan",
    programDir: "C:\\learning\\Fanfan\\LearningPlan\\Program",
    cardId: "t_speaking",
    card: {
      content: "Speaking retell",
      learningTaskModel: { activityType: "speaking", skillId: "english_speaking_retell" },
    },
    evaluation: {
      evaluationId: "eval-speaking",
      activityType: "speaking",
      stage: "draft",
      status: "draft_feedback",
      score: 74,
      summary: "Retell needs clearer second detail.",
    },
  });
  assert.equal(result.entryId, "eval-speaking");
  assert.ok(writes.has(result.rootProgressPath));
  assert.ok(writes.has(result.programProgressPath));
  assert.match(writes.get(result.rootProgressPath), /Retell needs clearer second detail/);
  assert.match(writes.get(result.programProgressPath), /Speaking retell/);
}

testProgressEntryIsPrivacySafe();
testUpsertProgressMarkdownReplacesExistingAndLimitsEntries();
testRecordEvaluationWritesRootAndProgramProgress();
console.log("learning growth progress record service tests passed");
