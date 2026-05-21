"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningInteractionSessionService } = require("../adapters/learning-interaction-session-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-session-service-"));
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
}

function testStartAdvanceAndPrivacyGuard() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  seed(repository);
  const service = createLearningInteractionSessionService({
    repository,
    now: () => new Date("2026-05-16T10:00:00.000Z"),
  });
  const session = service.startSession("task-1", { summary: "start summary" });
  assert.equal(session.currentStep, "receive_task");
  assert.equal(session.interactionModelVersion, "learning-task-model-v1");
  assert.equal(session.nextAction, "submit_first_attempt");
  assert.ok(session.requiredEvidence.includes("retell_summary"));
  assert.equal(session.stepHistory.length, 1);
  const advanced = service.advanceSession(session.sessionId, { summary: "attempt summary" });
  assert.equal(advanced.currentStep, "learner_attempt");
  assert.equal(advanced.status, "active");
  const completed = service.advanceSession(session.sessionId, { step: "ai_evaluation", summary: "evaluation summary" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.nextAction, "review_feedback");
  assert.throws(
    () => service.advanceSession(session.sessionId, { answerText: "raw child answer" }),
    /summary-only fields/,
  );
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testStartAdvanceAndPrivacyGuard();
console.log("learning interaction session service tests passed");
