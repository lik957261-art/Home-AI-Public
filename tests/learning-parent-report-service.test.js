"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningParentReportService } = require("../adapters/learning-parent-report-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-parent-report-"));
}

async function testGeneratesSummaryOnlyWeeklyReport() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningParentReportService({
    repository,
    now: () => new Date("2026-05-17T12:00:00.000Z"),
  });

  repository.upsertProgram({
    programId: "program-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_speaking_retell"],
    goalSummary: "Summary only.",
    startDate: "2026-05-11",
    endDate: "2026-05-17",
    daysPerWeek: 5,
    minutesPerDay: 30,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["school:summary"],
    curriculumRefs: ["public-ref"],
    constraints: {},
    reviewPolicy: {},
  });
  repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    status: "published",
    weekStart: "2026-05-11",
    weekEnd: "2026-05-17",
    dailyPlans: [],
    taskCount: 1,
    reliability: { parentReviewRequired: false, publishBlocked: false },
  });
  repository.upsertTaskCard({
    taskCardId: "task-1",
    programId: "program-1",
    draftId: "draft-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Retell summary task",
    domain: "english",
    taskCardType: "single_subject",
    status: "completed",
    plannedDate: "2026-05-12",
    plannedMinutes: 20,
    skillIds: ["english_speaking_retell"],
    sourceBasisRefs: ["school:summary"],
    curriculumRefs: ["public-ref"],
  });
  repository.upsertTaskCard({
    taskCardId: "task-2",
    programId: "program-1",
    draftId: "draft-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Pending summary task",
    domain: "english",
    taskCardType: "single_subject",
    status: "published",
    plannedDate: "2026-05-16",
    plannedMinutes: 20,
    skillIds: ["english_short_writing"],
    sourceBasisRefs: ["school:summary"],
    curriculumRefs: ["public-ref"],
  });
  repository.saveInteractionSession({
    sessionId: "session-1",
    taskCardId: "task-1",
    programId: "program-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    status: "completed",
    currentStep: "reward_settlement",
    stepHistory: [],
    summary: "Summary only.",
  });
  repository.saveEvaluation({
    evaluationId: "eval-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    programId: "program-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    status: "passed",
    score: 88,
    passed: true,
    confidence: 0.82,
    summary: "Summary only.",
    skillResults: [{ skillId: "english_speaking_retell", score: 88, summary: "Summary only." }],
    rewardPolicy: {},
    sourceBasisRefs: ["school:summary"],
    createdAt: "2026-05-13T00:00:00.000Z",
  });
  repository.saveRewardSettlement({
    rewardSettlementId: "reward-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    programId: "program-1",
    taskCardId: "task-1",
    sessionId: "session-1",
    evaluationId: "eval-1",
    status: "settled",
    coinAmount: 15,
    reason: "Summary reward.",
    sourceType: "learning-growth-evaluation",
    sourceId: "eval-1",
    idempotencyKey: "reward-key",
    settledAt: "2026-05-14T00:00:00.000Z",
  });
  repository.saveReviewRequest({
    reviewRequestId: "review-1",
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    programId: "program-1",
    requestType: "evaluation_review",
    resourceType: "evaluation",
    resourceId: "eval-1",
    status: "pending",
    reason: "parent_review_required",
    summary: "Summary only.",
    riskFlags: [{ code: "low_confidence" }],
    allowedActions: ["approve", "reject"],
    sourceBasisRefs: ["school:summary"],
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
  });

  const report = service.generateReport({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    startDate: "2026-05-11",
    endDate: "2026-05-17",
  });

  assert.equal(report.reportType, "parent_weekly_summary");
  assert.equal(report.counts.plannedTasks, 2);
  assert.equal(report.counts.pendingTasks, 1);
  assert.equal(report.counts.completedTasks, 1);
  assert.equal(report.counts.passedEvaluations, 1);
  assert.equal(report.counts.coinsSettled, 15);
  assert.equal(report.counts.pendingReviews, 1);
  assert.equal(report.evaluationSummary.averageScore, 88);
  assert.equal(report.nextActions[0].reviewRequestId, "review-1");

  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

(async () => {
  await testGeneratesSummaryOnlyWeeklyReport();
  console.log("learning parent report service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
