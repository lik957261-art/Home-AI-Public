"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningEvaluationService } = require("../adapters/learning-evaluation-service");
const { createLearningInteractionSessionService } = require("../adapters/learning-interaction-session-service");
const { createLearningParentReviewRequestService } = require("../adapters/learning-parent-review-request-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningRewardSettlementService } = require("../adapters/learning-reward-settlement-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-reward-settlement-"));
}

function seed(repository) {
  repository.upsertProgram({
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_speaking_retell"],
    goalSummary: "summary",
    startDate: "2026-05-16",
    endDate: "2026-05-20",
    daysPerWeek: 5,
    minutesPerDay: 30,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-english-growth"],
    constraints: {},
    reviewPolicy: {},
  });
  repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "ready",
    weekStart: "2026-05-16",
    weekEnd: "2026-05-20",
    dailyPlans: [],
  });
  repository.upsertTaskCard({
    taskCardId: "task-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "Task",
    domain: "english",
    taskCardType: "single_subject",
    status: "planned",
    plannedDate: "2026-05-16",
    plannedMinutes: 15,
    skillIds: ["english_speaking_retell"],
    templateId: "english-speaking-retell-v1",
    interactionStateMachine: ["receive_task", "learner_attempt", "ai_evaluation"],
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-english-growth"],
    privacyLevel: "summary_only",
  });
  return createLearningInteractionSessionService({ repository }).startSession("task-1", { summary: "start" });
}

function makeCoinService() {
  const grants = [];
  return {
    grants,
    grantCoins(input) {
      grants.push(input);
      return {
        entry: {
          id: `coin-${grants.length}`,
          studentId: input.studentId,
          workspaceId: input.workspaceId,
          coinDelta: input.coinAmount,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          createdAt: "2026-05-16T10:00:00.000Z",
        },
        balances: { availableCoins: input.coinAmount },
        duplicate: false,
      };
    },
  };
}

function makeService(repository, coinService, options = {}) {
  return createLearningRewardSettlementService(Object.assign({
    repository,
    learningCoinService: coinService,
    parentReviewRequestService: createLearningParentReviewRequestService({ repository }),
    now: () => new Date("2026-05-16T10:00:00.000Z"),
  }, options));
}

function recordEvaluation(repository, sessionId, input) {
  return createLearningEvaluationService({
    repository,
    now: () => new Date("2026-05-16T10:00:00.000Z"),
  }).recordEvaluation(sessionId, input);
}

function testVerifiedEvaluationSettlesOnce() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  const evaluation = recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-verified",
    score: 92,
    confidence: 0.9,
    summary: "summary only",
    evidenceRefs: ["rubric:verified"],
    verificationMethod: "answer_key_match",
  });
  assert.equal(evaluation.verification.status, "verified");
  const coinService = makeCoinService();
  const service = makeService(repository, coinService);
  const first = service.settleEvaluationReward("eval-verified", { principalId: "owner" });
  const second = service.settleEvaluationReward("eval-verified", { idempotencyKey: "custom-key" });
  assert.equal(first.status, "settled");
  assert.equal(first.coinAmount, 77);
  assert.equal(second.status, "settled");
  assert.equal(coinService.grants.length, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).rewardSettlements, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testModelOnlyCreatesReviewWithoutCoins() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-model",
    score: 88,
    confidence: 0.82,
    summary: "summary only",
  });
  const coinService = makeCoinService();
  const service = makeService(repository, coinService);
  const settlement = service.settleEvaluationReward("eval-model");
  assert.equal(settlement.status, "pending_review");
  assert.equal(settlement.reason, "evaluation_review_required_before_reward");
  assert.equal(coinService.grants.length, 0);
  assert.equal(repository.listReviewRequests({ resourceType: "evaluation", resourceId: "eval-model" }).length, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testApprovedReviewAllowsModelOnlySettlement() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-review",
    score: 88,
    confidence: 0.82,
    summary: "summary only",
  });
  const reviewService = createLearningParentReviewRequestService({ repository });
  const pending = repository.listReviewRequests({ resourceType: "evaluation", resourceId: "eval-review" })[0];
  reviewService.decide(pending.reviewRequestId, { decision: "approved", principalId: "owner" });
  const coinService = makeCoinService();
  const settlement = makeService(repository, coinService, { parentReviewRequestService: reviewService }).settleEvaluationReward("eval-review");
  assert.equal(settlement.status, "settled");
  assert.equal(coinService.grants.length, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testHardVerificationFailureBlocksReward() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  repository.saveEvaluation({
    evaluationId: "eval-blocked",
    taskCardId: "task-1",
    sessionId: session.sessionId,
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "needs_review",
    score: 95,
    passed: true,
    confidence: 0.9,
    summary: "summary only",
    skillResults: [],
    rewardPolicy: { eligibleForRewardReview: false },
    verification: { status: "blocked", parentReviewRequired: true, riskFlags: [{ code: "missing_source_basis", severity: "block" }] },
    sourceBasisRefs: [],
  });
  repository.saveReviewRequest({
    reviewRequestId: "rr-blocked",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    programId: "program-1",
    requestType: "evaluation_review",
    resourceType: "evaluation",
    resourceId: "eval-blocked",
    status: "approved",
    reason: "manual",
    summary: "summary only",
    riskFlags: [],
    allowedActions: ["approve"],
    sourceBasisRefs: [],
  });
  const coinService = makeCoinService();
  const settlement = makeService(repository, coinService).settleEvaluationReward("eval-blocked");
  assert.equal(settlement.status, "blocked");
  assert.equal(settlement.reason, "verification_hard_failure_before_reward");
  assert.equal(coinService.grants.length, 0);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testLargeRewardNeedsSettlementReview() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-large",
    score: 96,
    confidence: 0.9,
    summary: "summary only",
    evidenceRefs: ["rubric:verified"],
    verificationMethod: "answer_key_match",
  });
  const coinService = makeCoinService();
  const service = makeService(repository, coinService, { maxAutoCoins: 30 });
  const pending = service.settleEvaluationReward("eval-large", { coinAmount: 80 });
  assert.equal(pending.status, "pending_review");
  assert.equal(pending.reason, "large_reward_review_required");
  assert.equal(coinService.grants.length, 0);
  assert.equal(repository.listReviewRequests({ requestType: "reward_settlement_review", resourceId: pending.rewardSettlementId }).length, 1);
  assert.throws(
    () => service.settleEvaluationReward("eval-large", { rawTranscript: "private" }),
    /summary-only fields/,
  );
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testTaskRewardCapLimitsSettlement() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  const current = repository.getTaskCard("task-1");
  repository.upsertTaskCard(Object.assign({}, current, { rewardCapCoins: 60, rewardPolicy: { maxCoins: 60 } }));
  recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-capped",
    score: 96,
    confidence: 0.9,
    summary: "summary only",
    evidenceRefs: ["rubric:verified"],
    verificationMethod: "answer_key_match",
  });
  const coinService = makeCoinService();
  const settlement = makeService(repository, coinService).settleEvaluationReward("eval-capped");
  assert.equal(settlement.status, "settled");
  assert.equal(settlement.coinAmount, 49);
  assert.equal(coinService.grants[0].coinAmount, 49);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testEvergreenRewardDecayLimitsLateSettlement() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  const current = repository.getTaskCard("task-1");
  repository.upsertTaskCard(Object.assign({}, current, {
    sequenceGroupId: "evergreen:math",
    sequenceMode: "evergreen_jit",
    learningGrowthJitGeneration: { generatedAt: "2026-05-13T09:00:00.000Z" },
    rewardCapCoins: 100,
    rewardPolicy: { maxCoins: 100 },
  }));
  recordEvaluation(repository, session.sessionId, {
    evaluationId: "eval-decay",
    score: 100,
    confidence: 0.9,
    summary: "summary only",
    evidenceRefs: ["rubric:verified"],
    verificationMethod: "answer_key_match",
  });
  const coinService = makeCoinService();
  const settlement = makeService(repository, coinService, {
    now: () => new Date("2026-05-16T10:00:00.000Z"),
  }).settleEvaluationReward("eval-decay", { coinAmount: 100 });
  assert.equal(settlement.status, "settled");
  assert.equal(settlement.coinAmount, 90);
  assert.equal(settlement.rewardDecay.severity, "danger");
  assert.equal(settlement.rewardDecay.dailyPenaltyPercent, 10);
  assert.equal(coinService.grants[0].coinAmount, 90);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testVerifiedEvaluationSettlesOnce();
testModelOnlyCreatesReviewWithoutCoins();
testApprovedReviewAllowsModelOnlySettlement();
testHardVerificationFailureBlocksReward();
testLargeRewardNeedsSettlementReview();
testTaskRewardCapLimitsSettlement();
testEvergreenRewardDecayLimitsLateSettlement();

console.log("learning reward settlement service tests passed");
