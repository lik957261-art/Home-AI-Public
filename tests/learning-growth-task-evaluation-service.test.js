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

async function testHighScoreFinalModelRevisionDoesNotLoop() {
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async () => JSON.stringify({
      score: 80,
      passed: false,
      status: "needs_revision",
      confidence: 0.84,
      summary: "The model reached the pass line but still requested another rewrite.",
      revisionRequirements: ["tighten one detail next time"],
      strengths: ["clear revision evidence"],
      focusAreas: ["next-practice transfer"],
    }),
    now: () => new Date("2026-05-20T06:30:00.000Z"),
  });
  const evaluation = await service.evaluate({
    cardId: "t_high_score",
    stage: "final",
    text: [
      "First, I corrected the reason because the first answer missed the main detail.",
      "Then I added a school example and explained why the new sentence is clearer.",
      "Finally, I checked the order again and wrote what I will improve next time.",
    ].join("\n"),
    card: {
      id: "t_high_score",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "writing",
        skillId: "english_short_writing",
      },
    },
  });
  assert.equal(evaluation.status, "completed");
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.nextStep, "completed");
  assert.equal(evaluation.reward.eligible, true);
  assert.ok(evaluation.evidenceRefs.includes("pass-policy:model-score-consistency"));
}

async function testThirdSeriousAttemptCompletesCurrentCardWithCarryForwardWeaknesses() {
  let prompt = "";
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async (body) => {
      prompt = body;
      return JSON.stringify({
        score: 73,
        passed: false,
        completionDecision: "complete_current_card",
        status: "needs_revision",
        confidence: 0.82,
        summary: "The third serious attempt improved the reasoning, but future practice should keep one weakness.",
        remainingWeaknesses: ["continue checking the last calculation step"],
        revisionRequirements: ["do another rewrite"],
        strengths: ["visible repair"],
        focusAreas: ["calculation check"],
      });
    },
    now: () => new Date("2026-05-23T09:00:00.000Z"),
  });
  const evaluation = await service.evaluate({
    cardId: "t_third_attempt",
    stage: "final",
    attemptNo: 3,
    completionPolicy: {
      attemptNo: 3,
      seriousSubmission: true,
      threeSeriousSubmissionsComplete: true,
    },
    previousEvaluation: {
      status: "needs_repair",
      score: 68,
      revisionRequirements: ["show the missing reasoning step"],
    },
    text: [
      "First, I corrected the missing calculation because the earlier answer skipped the middle step.",
      "Then I compared the old method with the new method and wrote the check line.",
      "Finally, I explained what I still need to practice next time.",
    ].join("\n"),
    card: {
      id: "t_third_attempt",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "math_reasoning",
        skillId: "math_reasoning",
      },
    },
  });
  assert.match(prompt.input || "", /attemptContext/);
  assert.equal(evaluation.status, "completed");
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.score, 73);
  assert.equal(evaluation.completionDecision, "complete_current_card");
  assert.deepEqual(evaluation.remainingWeaknesses, ["continue checking the last calculation step"]);
  assert.deepEqual(evaluation.revisionRequirements, ["continue checking the last calculation step"]);
}

async function testHardSafetyBlockStillPreventsHighScorePass() {
  const service = createLearningGrowthTaskEvaluationService({
    extractJsonObject: (text) => JSON.parse(text),
    hermesModelText: async () => JSON.stringify({
      score: 95,
      passed: true,
      status: "completed",
      confidence: 0.9,
      summary: "The model should not bypass the hard safety seed.",
    }),
    now: () => new Date("2026-05-20T06:35:00.000Z"),
  });
  const evaluation = await service.evaluate({
    cardId: "t_too_short",
    stage: "final",
    text: "Fixed one sentence.",
    card: {
      id: "t_too_short",
      kanbanCaseTemplate: "learning-growth",
      learningTaskModel: {
        version: "learning-task-model-v1",
        activityType: "grammar",
        skillId: "english_grammar",
        learnerInstruction: "Repair four grammar sentences.",
      },
    },
  });
  assert.equal(evaluation.status, "needs_revision");
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.reward.eligible, false);
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
  await testHighScoreFinalModelRevisionDoesNotLoop();
  await testThirdSeriousAttemptCompletesCurrentCardWithCarryForwardWeaknesses();
  await testHardSafetyBlockStillPreventsHighScorePass();
  testTooShortGenericAnswerBlocksFinalPass();
  testRewriteAndWeeklyChallengeHaveSpecificRuntimeContracts();
  await testWritingUsesModelMainEvaluation();
  console.log("learning growth task evaluation service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
