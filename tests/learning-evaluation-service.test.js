"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningEvaluationService } = require("../adapters/learning-evaluation-service");
const { createLearningInteractionSessionService } = require("../adapters/learning-interaction-session-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-evaluation-service-"));
}

function seed(repository) {
  repository.upsertProgram({
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: [],
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

function testRecordEvaluation() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const session = seed(repository);
  const service = createLearningEvaluationService({
    repository,
    now: () => new Date("2026-05-16T10:00:00.000Z"),
  });
  const evaluation = service.recordEvaluation(session.sessionId, {
    score: 86,
    confidence: 0.82,
    summary: "summary only",
    skillResults: [{ skillId: "english_speaking_retell", score: 86, summary: "stable retell" }],
  });
  assert.equal(evaluation.status, "needs_review");
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.verification.status, "model_only");
  assert.equal(evaluation.reviewRequest.status, "pending");
  assert.equal(evaluation.rewardPolicy.coinLedgerWrite, "disabled_in_evaluation_service");
  assert.equal(evaluation.rewardPolicy.eligibleForRewardReview, false);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).reviewRequests, 1);
  assert.equal(service.list({ learnerId: "weixin_stephen" }).length, 1);
  assert.throws(
    () => service.recordEvaluation(session.sessionId, { score: 90, rawTranscript: "full transcript" }),
    /summary-only fields/,
  );
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testRecordEvaluation();
console.log("learning evaluation service tests passed");
