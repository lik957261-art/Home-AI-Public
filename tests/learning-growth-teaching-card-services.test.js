"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");
const { createLearningGrowthExperienceSignalService } = require("../adapters/learning-growth-experience-signal-service");
const { createLearningGrowthStageAssessmentService } = require("../adapters/learning-growth-stage-assessment-service");
const { createLearningGrowthTeachingCheckService } = require("../adapters/learning-growth-teaching-check-service");
const {
  CARD_ROLES,
  defaultRewardCoinsForRole,
  inferCardRole,
} = require("../adapters/learning-growth-card-role-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-teaching-"));
}

function seedRepository() {
  const repository = createLearningProgramRepository({ dataDir: tempRoot() });
  repository.migrate();
  repository.upsertProgram({
    programId: "program-1",
    learnerId: "learner-1",
    workspaceId: "learner-1",
    title: "Growth",
    domain: "english",
    focusAreas: ["english_reading_comprehension"],
    goalSummary: "summary only",
    startDate: "2026-05-26",
    endDate: "2026-06-02",
    daysPerWeek: 5,
    minutesPerDay: 30,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["source:parent"],
    curriculumRefs: ["curriculum:english"],
    constraints: {},
    reviewPolicy: {},
  });
  repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    learnerId: "learner-1",
    workspaceId: "learner-1",
    status: "published",
    weekStart: "2026-05-26",
    weekEnd: "2026-06-01",
    dailyPlans: [],
    reliability: { publishBlocked: false, parentReviewRequired: false },
  });
  const card = repository.upsertTaskCard({
    taskCardId: "task-teaching",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "learner-1",
    workspaceId: "learner-1",
    title: "Reading teaching card",
    domain: "english",
    taskCardType: "single_subject",
    cardRole: "teaching",
    status: "published",
    plannedDate: "2026-05-26",
    plannedMinutes: 15,
    skillIds: ["english_reading_comprehension"],
    templateId: "english-reading-v1",
    interactionStateMachine: ["receive_task", "guided_practice", "quick_check"],
    sourceBasisRefs: ["source:parent"],
    curriculumRefs: ["curriculum:english"],
    privacyLevel: "summary_only",
    learnerInstruction: "Read the explanation and answer one small check.",
  });
  return { repository, card };
}

function programService(repository, ledger = []) {
  return createLearningProgramService({
    repository,
    learningCoinService: {
      grantCoins(input) {
        ledger.push(input);
        return { ok: true, entry: { entryId: `coin-${ledger.length}`, coinAmount: input.coinAmount } };
      },
    },
  });
}

function testRoleDefaults() {
  assert.equal(inferCardRole({ taskCardType: "challenge_card" }), CARD_ROLES.STAGE_ASSESSMENT);
  assert.equal(inferCardRole({ taskCardType: "single_subject" }), CARD_ROLES.TEACHING);
  assert.equal(defaultRewardCoinsForRole(CARD_ROLES.STAGE_ASSESSMENT), 300);
  assert.equal(defaultRewardCoinsForRole(CARD_ROLES.TEACHING), 100);
}

function testTeachingCheckSettlesRewardWithoutRawResponse() {
  const { repository } = seedRepository();
  const ledger = [];
  const service = programService(repository, ledger);
  const experienceSignalService = createLearningGrowthExperienceSignalService({ repository });
  const teaching = createLearningGrowthTeachingCheckService({
    experienceSignalService,
    learningProgramService: service,
    repository,
  });
  const result = teaching.complete({
    taskCardId: "task-teaching",
    quickCheckText: "I can explain the main idea.",
    actorPrincipalId: "learner-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.taskCard.status, "completed");
  assert.equal(result.evaluation.passed, true);
  assert.equal(result.evaluation.verification.status, "verified");
  assert.equal(result.rewardSettlement.status, "settled");
  assert.equal(result.rewardSettlement.coinAmount, 100);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].coinAmount, 100);
  assert.equal(result.taskCard.quickCheckText, undefined);
  assert.ok(repository.listExperienceSignals({ taskCardId: "task-teaching" }).some((signal) => signal.signalType === "completed"));
}

function testStageAssessmentChallengeCreatesFormalCard() {
  const { repository } = seedRepository();
  const service = programService(repository, []);
  const stage = createLearningGrowthStageAssessmentService({
    learningProgramService: service,
    repository,
  });
  const result = stage.challenge({
    workspaceId: "learner-1",
    learnerId: "learner-1",
    programId: "program-1",
    skillIds: ["english_reading_comprehension"],
    actorPrincipalId: "learner-1",
  });
  assert.equal(result.ok, true);
  assert.equal(result.taskCard.cardRole, "stage_assessment");
  assert.equal(result.taskCard.rewardPolicy.maxCoins, 300);
  assert.equal(result.taskCard.completionPolicy.requiresReflectionGate, true);
  assert.equal(result.taskCard.status, "published");
  assert.equal(repository.listStageAssessmentCycles({ learnerId: "learner-1", status: "active" }).length, 1);
}

testRoleDefaults();
testTeachingCheckSettlesRewardWithoutRawResponse();
testStageAssessmentChallengeCreatesFormalCard();
console.log("learning growth teaching card service tests passed");
