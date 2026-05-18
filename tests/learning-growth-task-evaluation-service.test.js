"use strict";

const assert = require("node:assert/strict");
const {
  activityLabel,
  createLearningGrowthTaskEvaluationService,
  scoreGeneric,
} = require("../adapters/learning-growth-task-evaluation-service");

function testVocabularyDraftRequiresRevisionWithoutRawAnswerLeak() {
  const service = createLearningGrowthTaskEvaluationService({
    now: () => new Date("2026-05-18T01:00:00.000Z"),
  });
  const text = [
    "I observe the class carefully.",
    "The teacher reminded us to compare two ideas.",
    "I improved my sentence because the first version was too general.",
    "Next time I will add evidence before I answer.",
    "Finally, I can use the word accurately in a school example.",
  ].join("\n");
  const evaluation = service.evaluate({
    cardId: "t_vocab",
    stage: "draft",
    text,
    card: {
      id: "t_vocab",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "vocabulary",
        skillId: "english_vocabulary_active_use",
        learnerInstruction: "Use target vocabulary in school examples.",
        submissionContract: {
          firstSubmissionKind: "vocabulary_sentences",
          revisionSubmissionKind: "vocabulary_repair",
        },
      },
    },
  });
  assert.equal(evaluation.status, "draft_feedback");
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.reward.eligible, false);
  assert.equal(evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(evaluation.activityType, "vocabulary");
  assert.doesNotMatch(JSON.stringify(evaluation), /I observe the class carefully/);
}

function testGenericFinalPassSettlesRewardRange() {
  const service = createLearningGrowthTaskEvaluationService({
    now: () => new Date("2026-05-18T02:00:00.000Z"),
  });
  const evaluation = service.evaluate({
    cardId: "t_presentation",
    stage: "final",
    text: [
      "First, my presentation explains the problem in our school project.",
      "Because the audience needs a clear reason, I compare two choices and give one example.",
      "Then I improve the closing sentence and connect it back to the opening.",
      "Finally, I changed my outline because the old version did not show enough evidence.",
    ].join("\n"),
    card: {
      id: "t_presentation",
      dueLocal: "2026-05-18",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "presentation",
        skillId: "english_presentation",
        learnerInstruction: "Prepare a presentation outline with opening, two points, and closing.",
      },
    },
  });
  assert.equal(evaluation.status, "completed");
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.reward.eligible, true);
  assert.ok(evaluation.reward.coinAmount >= 40);
  assert.ok(evaluation.reward.coinAmount <= 100);
  assert.equal(evaluation.reward.maxCoinAmount, 100);
}

function testTooShortGenericAnswerBlocksFinalPass() {
  const scored = scoreGeneric({
    activityType: "grammar",
    model: { activityType: "grammar", learnerInstruction: "Repair four grammar sentences." },
    text: "Fixed one sentence.",
  });
  assert.equal(scored.passed, false);
  assert.ok(scored.issues.some((issue) => issue.code === "too_short"));
}

function testRewriteAndWeeklyChallengeHaveSpecificRuntimeContracts() {
  assert.equal(activityLabel("rewriting"), "Rewrite improvement");
  assert.equal(activityLabel("weekly_challenge"), "Weekly integrated challenge");
  const rewrite = scoreGeneric({
    activityType: "rewriting",
    model: {
      activityType: "rewriting",
      learnerInstruction: "Rewrite the target paragraph and explain what changed.",
    },
    text: [
      "First, I rewrote the sentence because the old version was too general.",
      "Then I added one school detail and fixed the unclear verb phrase.",
      "Finally, I wrote a variant repair to show that I can use the pattern again.",
    ].join("\n"),
  });
  assert.equal(rewrite.passed, true);
  const weekly = scoreGeneric({
    activityType: "weekly_challenge",
    model: {
      activityType: "weekly_challenge",
      learnerInstruction: "Complete one integrated weekly challenge using reading, vocabulary, and expression repair.",
    },
    text: [
      "First, this week I used the reading detail to explain the main idea.",
      "Because my old sentence was not clear, I changed it with a stronger vocabulary word.",
      "Then I added one grammar repair and connected it to my answer.",
      "Finally, I can remember to use evidence before I finish the next task.",
    ].join("\n"),
  });
  assert.equal(weekly.passed, true);
}

function testWritingDelegatesToWritingEvaluator() {
  const service = createLearningGrowthTaskEvaluationService({
    now: () => new Date("2026-05-18T03:00:00.000Z"),
  });
  const evaluation = service.evaluate({
    cardId: "t_writing",
    stage: "draft",
    text: [
      "Last week I joined a class activity about teamwork.",
      "First, I wrote down a plan and checked the poster.",
      "Finally, I learned that clear communication makes a hard task easier.",
    ].join(" "),
    card: {
      id: "t_writing",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "writing",
        skillId: "english_short_writing",
      },
    },
  });
  assert.equal(evaluation.activityType, "writing");
  assert.equal(evaluation.taskModelVersion, "learning-task-model-v1");
  assert.match(evaluation.verificationMethod, /deterministic/);
}

testVocabularyDraftRequiresRevisionWithoutRawAnswerLeak();
testGenericFinalPassSettlesRewardRange();
testTooShortGenericAnswerBlocksFinalPass();
testRewriteAndWeeklyChallengeHaveSpecificRuntimeContracts();
testWritingDelegatesToWritingEvaluator();
console.log("learning growth task evaluation service tests passed");
