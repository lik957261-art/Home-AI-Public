"use strict";

const assert = require("node:assert/strict");
const {
  createLearningTaskSeriesRecommendationService,
} = require("../adapters/learning-task-series-recommendation-service");

function makeRepository() {
  return {
    getLearnerProfile() {
      return {
        learnerId: "weixin_stephen",
        gradeBand: "grade7",
        languageLevel: "5.5-6",
        summary: "Grade 7 learner needs longer input and more accurate oral retell structure.",
      };
    },
    listSources() {
      return [{ sourceRef: "summary:recent-english", sourceType: "progress", title: "Recent English", summary: "Retell detail order and vocabulary transfer need work." }];
    },
    listGoals() {
      return [{ goalId: "goal-1", title: "English speaking", summary: "Build B1 bridge retell ability.", focusAreas: ["english_speaking_retell"] }];
    },
    listPrograms() { return []; },
    listTaskCards() { return []; },
    listEvaluations() { return []; },
    listSkillStates() { return []; },
  };
}

async function testModelRecommendationIsTemplateValidated() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      analysisSummary: "Retell work needs longer reading input.",
      weakSignals: ["detail_order"],
      recommendedSeries: [{
        title: "Longer reading retell",
        templateId: "english-speaking-retell-v1",
        skillId: "english_speaking_retell",
        requirements: "Use original reading material for 10-15 minutes before recording.",
        rationale: "Recent retells need more ordered detail.",
        recommendedReadingMinutes: 12,
      }],
    }),
  });
  const result = await service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.ok, true);
  assert.equal(result.privacyLevel, "summary_only");
  assert.equal(result.modelStatus, "completed");
  assert.equal(result.recommendedSeries[0].templateId, "english-speaking-retell-v1");
  assert.equal(result.recommendedSeries[0].skillId, "english_speaking_retell");
  assert.equal(result.recommendedSeries[0].activityType, "speaking");
  assert.equal(result.recommendedSeries[0].recommendedReadingMinutes, 12);
}

async function testUnknownTemplateFailsClosed() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      recommendedSeries: [{ templateId: "invented-template", skillId: "english_speaking_retell", title: "Bad" }],
    }),
  });
  await assert.rejects(
    () => service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" }),
    /unsupported template/,
  );
}

async function testMismatchedSkillFailsClosed() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      recommendedSeries: [{ templateId: "english-speaking-retell-v1", skillId: "english_short_writing", title: "Bad" }],
    }),
  });
  await assert.rejects(
    () => service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" }),
    /skill does not match/,
  );
}

async function testSnakeCaseModelRecommendationIsAccepted() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      analysis_summary: "Use a template-guarded retell series.",
      recommended_task_series: [{
        title: "Snake case retell",
        template_id: "english-speaking-retell-v1",
        skill_id: "english_speaking_retell",
        sequence_mode: "evergreen_jit",
        recommended_reading_minutes: 15,
        reward_cap_coins: 100,
      }],
    }),
  });
  const result = await service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.recommendedSeries[0].templateId, "english-speaking-retell-v1");
  assert.equal(result.recommendedSeries[0].skillId, "english_speaking_retell");
  assert.equal(result.recommendedSeries[0].recommendedReadingMinutes, 15);
  assert.equal(result.recommendedSeries[0].rewardCapCoins, 100);
}

async function testEmptyModelSeriesFallsBackToRegisteredTemplate() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      analysis_summary: "The model identified a direction but omitted the task series array.",
      recommended_task_series: [],
    }),
  });
  const result = await service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(result.ok, true);
  assert.equal(result.modelStatus, "model_empty_series_fallback");
  assert.equal(result.recommendedSeries[0].templateId, "english-speaking-retell-v1");
  assert.equal(result.recommendedSeries[0].skillId, "english_speaking_retell");
}

async function testPrivatePayloadKeysAreRejected() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    hermesModelText: async () => JSON.stringify({
      prompt: "raw hidden prompt",
      recommendedSeries: [{ templateId: "english-speaking-retell-v1", skillId: "english_speaking_retell", title: "Bad" }],
    }),
  });
  await assert.rejects(
    () => service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" }),
    /summary-only fields/,
  );
}

async function testRequireModelRejectsMissingModel() {
  const service = createLearningTaskSeriesRecommendationService({
    repository: makeRepository(),
    requireModel: true,
  });
  await assert.rejects(
    () => service.recommendTaskSeries({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" }),
    /requires model assistance/,
  );
}

function testRecommendationBuildsProgramInput() {
  const service = createLearningTaskSeriesRecommendationService({ repository: makeRepository() });
  const input = service.programInputFromRecommendation({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    recommendation: {
      title: "Longer reading retell",
      templateId: "english-speaking-retell-v1",
      skillId: "english_speaking_retell",
      requirements: "Read then retell.",
      recommendedReadingMinutes: 12,
    },
  });
  assert.deepEqual(input.focusAreas, ["english_speaking_retell"]);
  assert.equal(input.constraints.templateId, "english-speaking-retell-v1");
  assert.equal(input.constraints.sequenceMode, "evergreen_jit");
  assert.match(input.requirements, /12 minutes/);
}

(async () => {
  await testModelRecommendationIsTemplateValidated();
  await testUnknownTemplateFailsClosed();
  await testMismatchedSkillFailsClosed();
  await testSnakeCaseModelRecommendationIsAccepted();
  await testEmptyModelSeriesFallsBackToRegisteredTemplate();
  await testPrivatePayloadKeysAreRejected();
  await testRequireModelRejectsMissingModel();
  testRecommendationBuildsProgramInput();
  console.log("learning task series recommendation service tests passed");
})();
