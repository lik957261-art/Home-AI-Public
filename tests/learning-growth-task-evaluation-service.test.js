"use strict";

const assert = require("node:assert/strict");
const {
  activityLabel,
  createLearningGrowthTaskEvaluationService,
  scoreGeneric,
} = require("../adapters/learning-growth-task-evaluation-service");

async function testVocabularyDraftRequiresRevisionWithoutRawAnswerLeak() {
  const modelCalls = [];
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body) => {
      modelCalls.push(body);
      return JSON.stringify({
        score: 62,
        passed: false,
        status: "draft_feedback",
        confidence: 0.8,
        summary: "模型批改：需要补充词义选择原因和修改后的句子。",
        revisionRequirements: ["explain the word choice", "repair one sentence"],
        strengths: ["attempt recorded"],
        focusAreas: ["word meaning"],
        criterionFeedback: [{ dimension: "word meaning", observation: "needs clearer context", action: "add one school example" }],
        rewriteChecklist: ["repair one target word sentence"],
        reflectionPrompts: ["说出这次词义错误是什么"],
      });
    },
    now: () => new Date("2026-05-18T01:00:00.000Z"),
  });
  const text = [
    "I observe the class carefully.",
    "The teacher reminded us to compare two ideas.",
    "I improved my sentence because the first version was too general.",
    "Next time I will add evidence before I answer.",
    "Finally, I can use the word accurately in a school example.",
  ].join("\n");
  const evaluation = await service.evaluate({
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
  assert.equal(modelCalls.length, 1);
  assert.equal(evaluation.status, "draft_feedback");
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.reward.eligible, false);
  assert.equal(evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(evaluation.activityType, "vocabulary");
  assert.equal(evaluation.verificationMethod, "model_assisted_growth_task_evaluation");
  assert.ok(evaluation.feedbackSections.criterionFeedback.some((item) => item.dimension === "word meaning"));
  assert.ok(evaluation.feedbackSections.rewriteChecklist.some((item) => /target word/i.test(item)));
  assert.doesNotMatch(JSON.stringify(evaluation), /I observe the class carefully/);
}

async function testGenericFinalPassSettlesRewardRange() {
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async () => JSON.stringify({
      score: 88,
      passed: true,
      status: "completed",
      confidence: 0.86,
      summary: "模型终评：展示了清楚的开头、理由和改进。",
      revisionRequirements: ["reuse the improved closing next time"],
      strengths: ["clear structure"],
      focusAreas: ["presentation structure"],
    }),
    now: () => new Date("2026-05-18T02:00:00.000Z"),
  });
  const evaluation = await service.evaluate({
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

async function testWritingUsesModelMainEvaluation() {
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async () => JSON.stringify({
      score: 58,
      passed: false,
      status: "draft_feedback",
      confidence: 0.78,
      summary: "模型写作批改：内容太短，需要扩展理由和例子。",
      revisionRequirements: ["add a concrete example"],
      strengths: ["topic is visible"],
      focusAreas: ["reason and example"],
    }),
    now: () => new Date("2026-05-18T03:00:00.000Z"),
  });
  const evaluation = await service.evaluate({
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
  assert.equal(evaluation.verificationMethod, "model_assisted_growth_task_evaluation");
  assert.match(evaluation.summary, /模型写作批改/);
}

(async () => {
  await testVocabularyDraftRequiresRevisionWithoutRawAnswerLeak();
  await testGenericFinalPassSettlesRewardRange();
  testTooShortGenericAnswerBlocksFinalPass();
  testRewriteAndWeeklyChallengeHaveSpecificRuntimeContracts();
  await testWritingUsesModelMainEvaluation();
  console.log("learning growth task evaluation service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
