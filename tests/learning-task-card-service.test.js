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
        cardRole: "teaching",
        teachingFlow: {
          learningTarget: "Retell with the main idea first.",
          microLesson: { learnerFacingText: "Say the main idea before details." },
          workedExample: { steps: [{ label: "Example", text: "This passage is mainly about a school rule changing lunch habits." }] },
          guidedPractice: { instruction: "Fill the retell frame first." },
          quickCheck: { instruction: "Write one main idea sentence." },
        },
      }],
    }],
    reliability: { publishBlocked: false, parentReviewRequired: true, guardLevel: "test" },
  });
}

function testMaterializeDraft() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const draft = seed(repository);
  const service = createLearningTaskCardService({
    repository,
    directoryMaterializationService: {
      reportDirectoryForCard(workspaceId, taskCardId, card = {}) {
        return path.join(root, "learning-plan", workspaceId, "series", card.sequenceGroupId || card.programId || "program", "deliverables");
      },
    },
  });
  const cards = service.materializeDraft({ program: repository.getProgram("program-1"), draft });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].taskCardId, stableTaskCardId("draft-1", "task-a"));
  assert.equal(cards[0].status, "review_required");
  assert.deepEqual(cards[0].interactionStateMachine, ["receive_task", "learner_attempt", "ai_evaluation"]);
  assert.equal(cards[0].taskModel.version, "learning-task-model-v1");
  assert.equal(cards[0].taskModel.submissionContract.firstSubmissionKind, "speaking_retell");
  assert.equal(cards[0].rewardCapCoins, 100);
  assert.equal(cards[0].rewardPolicy.maxCoins, 100);
  assert.equal(cards[0].teachingFlow.generationSource, "");
  assert.equal(cards[0].teachingFlow.lesson.title, "Retell with the main idea first.");
  assert.equal(cards[0].teachingFlow.guidedPractice.instruction, "Fill the retell frame first.");
  assert.equal(cards[0].teachingFlow.quickCheck.instruction, "Write one main idea sentence.");
  assert.equal(service.get(cards[0].taskCardId).teachingFlow.lesson.title, "Retell with the main idea first.");
  assert.equal(cards[0].deliverableDirectoryPath, path.join(root, "learning-plan", "weixin_stephen", "series", "program-1", "deliverables"));
  assert.equal(service.get(cards[0].taskCardId).artifactDirectoryPath, cards[0].deliverableDirectoryPath);
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
          kanbanCardId: "kanban-1",
          domain: "english",
          taskCardType: "single_subject",
          plannedMinutes: 15,
          skillIds: ["english_speaking_retell"],
          templateId: "english-speaking-retell-v1",
          interactionStateMachine: ["receive_task", "learner_retells", "ai_evaluation"],
          sourceBasisRefs: ["parent_config:program-1"],
          curriculumRefs: ["cefr-a2-b1-english-growth"],
          confidence: 0.8,
          rewardPolicy: { maxCoins: 140 },
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
  assert.equal(queue[0].source, "learning-growth");
  assert.equal(queue[0].kanbanCardId, "kanban-1");
  assert.equal(queue[0].todoId, "kanban-1");
  assert.equal(queue[0].summary, "summary only");
  assert.equal(queue[0].taskModel.version, "learning-task-model-v1");
  assert.equal(queue[0].taskModel.skillId, "english_speaking_retell");
  assert.equal(queue[0].rewardCapCoins, 140);
  assert.equal(queue[0].rewardPolicy.maxCoins, 140);
  const serialized = JSON.stringify(queue);
  assert.doesNotMatch(serialized, /private prompt|private answer|private transcript|questions|learnerAnswer|fullTranscript/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testUpdateRewardPolicy() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const draft = seed(repository);
  const service = createLearningTaskCardService({ repository });
  const [card] = service.materializeDraft({ program: repository.getProgram("program-1"), draft });
  const updated = service.updateRewardPolicy(card.taskCardId, { rewardCapCoins: 125 });
  assert.equal(updated.rewardCapCoins, 125);
  assert.equal(service.get(card.taskCardId).rewardPolicy.maxCoins, 125);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testExecutorQueueIncludesNativeTasksWithoutKanbanLinks() {
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
        }],
      }],
    }),
  });
  const queue = service.listExecutorQueue({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].source, "learning-growth");
  assert.equal(queue[0].kanbanCardId, "");
  assert.equal(queue[0].todoId, "");
  assert.equal(queue[0].executionStatus, "pending_execution");
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testMaterializeDraft();
testExecutorQueueIsSummaryOnly();
testExecutorQueueIncludesNativeTasksWithoutKanbanLinks();
testUpdateRewardPolicy();
console.log("learning task card service tests passed");
