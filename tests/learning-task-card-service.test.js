"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningTaskCardService, stableTaskCardId } = require("../adapters/learning-task-card-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-task-card-service-"));
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
  return repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "review_required",
    weekStart: "2026-05-16",
    weekEnd: "2026-05-20",
    dailyPlans: [{
      date: "2026-05-16",
      tasks: [{
        taskId: "task-a",
        title: "Oral retell",
        domain: "english",
        taskCardType: "single_subject",
        plannedMinutes: 15,
        skillIds: ["english_speaking_retell"],
        templateId: "english-speaking-retell-v1",
        interactionStateMachine: ["receive_task", "learner_attempt", "ai_evaluation"],
        sourceBasisRefs: ["parent_config:program-1"],
        curriculumRefs: ["cefr-a2-b1-english-growth"],
        confidence: 0.8,
      }],
    }],
    reliability: { publishBlocked: false, parentReviewRequired: true, guardLevel: "test" },
  });
}

function testMaterializeDraft() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const draft = seed(repository);
  const service = createLearningTaskCardService({ repository });
  const cards = service.materializeDraft({ program: repository.getProgram("program-1"), draft });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].taskCardId, stableTaskCardId("draft-1", "task-a"));
  assert.equal(cards[0].status, "review_required");
  assert.deepEqual(cards[0].interactionStateMachine, ["receive_task", "learner_attempt", "ai_evaluation"]);
  assert.equal(cards[0].taskModel.version, "learning-task-model-v1");
  assert.equal(cards[0].taskModel.submissionContract.firstSubmissionKind, "speaking_retell");
  assert.equal(service.list({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(service.get(cards[0].taskCardId).privacyLevel, "summary_only");
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testExecutorQueueIsSummaryOnly() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const draft = seed(repository);
  const service = createLearningTaskCardService({ repository });
  service.materializeDraft({
    program: repository.getProgram("program-1"),
    draft: Object.assign({}, draft, {
      status: "published",
      dailyPlans: [{
        date: "2026-05-16",
        tasks: [{
          taskId: "task-a",
          title: "Oral retell",
          domain: "english",
          taskCardType: "single_subject",
          plannedMinutes: 15,
          skillIds: ["english_speaking_retell"],
          templateId: "english-speaking-retell-v1",
          interactionStateMachine: ["receive_task", "learner_retells", "ai_evaluation"],
          sourceBasisRefs: ["parent_config:program-1"],
          curriculumRefs: ["cefr-a2-b1-english-growth"],
          confidence: 0.8,
          questions: [{ prompt: "private prompt", answer: "private answer" }],
          learnerAnswer: "private answer",
          fullTranscript: "private transcript",
          summary: "summary only",
        }],
      }],
    }),
  });
  const queue = service.listExecutorQueue({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].status, "published");
  assert.equal(queue[0].executionStatus, "pending_execution");
  assert.equal(queue[0].summary, "summary only");
  assert.equal(queue[0].taskModel.version, "learning-task-model-v1");
  assert.equal(queue[0].taskModel.skillId, "english_speaking_retell");
  const serialized = JSON.stringify(queue);
  assert.doesNotMatch(serialized, /private prompt|private answer|private transcript|questions|learnerAnswer|fullTranscript/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testMaterializeDraft();
testExecutorQueueIsSummaryOnly();
console.log("learning task card service tests passed");
