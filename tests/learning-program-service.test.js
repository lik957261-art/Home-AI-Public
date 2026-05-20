"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-program-service-"));
}

function createService(root, overrides = {}) {
  const repository = createLearningProgramRepository({ dataDir: root });
  const publishCalls = [];
  const service = createLearningProgramService(Object.assign({
    repository,
    publishService: {
      async publish(input) {
        publishCalls.push(input);
        const tasks = (input.draft?.dailyPlans || []).flatMap((day) => day.tasks || []);
        return {
          ok: true,
          kanbanResult: {
            ok: true,
            cards: tasks.map((task, index) => ({
              clientId: task.taskId,
              card: { id: `k${index + 1}` },
            })),
          },
        };
      },
    },
  }, overrides));
  return { service, repository, publishCalls };
}

function seedFanfanSourceDirectory(ownerDriveRoot) {
  const fanfanRoot = path.join(ownerDriveRoot, "Hermes-\u5f90\u6b23", "\u51e1\u51e1");
  fs.mkdirSync(path.join(fanfanRoot, ".hermes-cleaned"), { recursive: true });
  fs.mkdirSync(path.join(fanfanRoot, "\u5b66\u4e60\u8ba1\u5212", ".hermes-cleaned"), { recursive: true });
  fs.writeFileSync(path.join(fanfanRoot, ".hermes-cleaned", "summary.md"), "Cumulative cleaned learning summary only.", "utf8");
  fs.writeFileSync(path.join(fanfanRoot, "\u5b66\u4e60\u8ba1\u5212", ".hermes-cleaned", "summary.md"), "Learning plan cleaned summary only.", "utf8");
}

async function testCreateDraftApprovePublish() {
  const root = tempRoot();
  const ownerDriveRoot = path.join(root, "owner-drive");
  seedFanfanSourceDirectory(ownerDriveRoot);
  const { service, publishCalls, repository } = createService(root, { ownerDriveRoot });
  const directoryImport = service.importSourceDirectory({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
  });
  assert.equal(directoryImport.counts.sources, 2);
  assert.equal(directoryImport.binding.directoryLabel, "\u5b66\u4e60\u8d44\u6599");
  const source = service.saveSource({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    sourceType: "school",
    title: "School English summary",
    summary: "Teacher summary only.",
  });
  const goal = service.saveGoal({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "English output",
    domain: "english",
    focusAreas: ["speaking", "writing"],
    targetSummary: "Improve output.",
    sourceBasisRefs: [source.sourceRef],
  });
  const program = service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "English growth",
    goalSummary: "Improve reading, speaking, writing, and active vocabulary.",
    focusAreas: ["reading", "speaking", "writing", "vocabulary"],
    minutesPerDay: 30,
  });
  assert.equal(program.domain, "english");
  assert.ok(program.focusAreas.includes("english_speaking_retell"));
  assert.ok(program.sourceBasisRefs.includes(source.sourceRef));
  assert.ok(program.sourceBasisRefs.includes(goal.goalRef));
  assert.ok(program.curriculumRefs.includes("cefr-a2-b1-english-growth"));

  const drafted = await service.draftPlan(program.programId);
  assert.equal(drafted.ok, true);
  assert.equal(drafted.draft.status, "review_required");
  assert.equal(drafted.taskCards.length, drafted.draft.taskCount);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).taskCards, drafted.draft.taskCount);
  assert.equal(drafted.reviewItem.status, "pending");
  assert.ok(drafted.draft.dailyPlans.flatMap((day) => day.tasks).some((task) => task.skillIds.includes("english_short_writing")));

  await assert.rejects(
    service.publishProgram(program.programId, { draftId: drafted.draft.draftId }),
    /needs parent review/,
  );
  assert.equal(publishCalls.length, 0);

  const decision = await service.decideReview(drafted.reviewItem.reviewId, { decision: "approved", principalId: "owner" });
  assert.equal(decision.reviewItem.status, "approved");
  assert.equal(decision.autoPublish.ok, true);
  const published = decision.autoPublish;
  assert.equal(published.ok, true);
  assert.equal(publishCalls.length, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).publications, 1);
  assert.equal(published.taskCards.length, drafted.draft.taskCount);
  assert.ok(published.taskCards.every((task) => task.status === "published"));
  assert.ok(published.taskCards.every((task) => task.kanbanCardId));
  assert.equal(service.getTaskCardForKanbanCard(published.taskCards[0].kanbanCardId).taskCardId, published.taskCards[0].taskCardId);
  assert.equal(service.getTaskCardForKanbanCard(published.taskCards[1].kanbanCardId).taskCardId, published.taskCards[1].taskCardId);
  assert.equal(service.getTaskCardForKanbanCard("missing-card", { draftId: drafted.draft.draftId }), null);
  assert.equal(published.publishedSessions.length, drafted.draft.taskCount);
  const repeatedPublish = await service.publishProgram(program.programId, { draftId: drafted.draft.draftId });
  assert.equal(repeatedPublish.alreadyPublished, true);
  assert.equal(publishCalls.length, 1);
  assert.ok(repeatedPublish.taskCards.every((task) => task.kanbanCardId));
  assert.equal(repeatedPublish.publishedSessions.length, drafted.draft.taskCount);
  const executorQueue = service.listExecutorTaskQueue({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(executorQueue.length, drafted.draft.taskCount);
  assert.ok(executorQueue.every((task) => task.executionStatus === "pending_execution"));
  assert.doesNotMatch(JSON.stringify(executorQueue), /questions|answerKey|learnerAnswer|fullTranscript|prompt/);
  const dailyPlan = service.dailyPlan({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    startDate: drafted.draft.weekStart,
    days: 7,
  });
  assert.equal(dailyPlan.summary.totalTasks, drafted.draft.taskCount);
  assert.equal(dailyPlan.nextTask.executionStatus, "pending_execution");
  assert.equal(dailyPlan.privacyLevel, "summary_only");
  assert.doesNotMatch(JSON.stringify(dailyPlan), /questions|answerKey|learnerAnswer|fullTranscript|prompt/);
  const profile = service.rebuildLearnerProfile({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.ok(profile.skillStates.some((state) => state.skillId === "english_short_writing"));
  const overview = service.overview({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(overview.sources.length, 3);
  assert.equal(overview.goals.length, 1);
  assert.equal(overview.taskCards.length, drafted.draft.taskCount);
  assert.equal(overview.dailyPlan.summary.totalTasks, drafted.draft.taskCount);
  assert.equal(overview.dailyPlan.privacyLevel, "summary_only");
  assert.equal(overview.interactionSessions.length, drafted.draft.taskCount);
  assert.equal(overview.evaluations.length, 0);
  assert.equal(overview.rewardSettlements.length, 0);
  assert.ok(overview.curriculumReferences.length >= 3);
  assert.equal(overview.learnerProfile.learnerId, "weixin_stephen");
  const loadedSession = service.getInteractionSession(published.publishedSessions[0].sessionId);
  assert.equal(loadedSession.sessionId, published.publishedSessions[0].sessionId);
  assert.equal(loadedSession.learnerId, "weixin_stephen");
  assert.equal(overview.sourceDirectories[0].directoryLabel, "\u5b66\u4e60\u8d44\u6599");
  assert.equal(overview.sourceDirectories[0].availableSummaryCount, 2);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testBlockedDraftDoesNotPublish() {
  const root = tempRoot();
  const publishCalls = [];
  const { service, repository } = createService(root, {
    decompositionService: {
      buildDraft() {
        return {
          weekStart: "2026-05-16",
          weekEnd: "2026-05-16",
          dailyPlans: [{ date: "2026-05-16", tasks: [{ taskId: "bad", taskCardType: "free_chat", sourceBasisRefs: [], curriculumRefs: [], confidence: 0.2 }] }],
        };
      },
    },
    publishService: {
      async publish(input) {
        publishCalls.push(input);
        return { ok: true };
      },
    },
  });
  const program = service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Blocked plan",
    goalSummary: "Should be blocked.",
    sourceBasisRefs: ["parent_config:test"],
  });
  const drafted = await service.draftPlan(program.programId);
  assert.equal(drafted.draft.status, "blocked");
  assert.equal(drafted.draft.reliability.publishBlocked, true);
  await assert.rejects(
    service.publishProgram(program.programId, { draftId: drafted.draft.draftId, force: true }),
    /blocked by reliability guard/,
  );
  assert.equal(publishCalls.length, 0);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testRebuildDraftRemovesOnlyUnpublishedPlan() {
  const root = tempRoot();
  const { service, repository } = createService(root);
  const program = service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Rebuildable English growth",
    goalSummary: "Improve Grade 7 English output.",
    sourceBasisRefs: ["parent_config:summary"],
  });
  const first = await service.draftPlan(program.programId);
  assert.equal(first.draft.status, "review_required");
  assert.equal(repository.getPlanDraft(first.draft.draftId).draftId, first.draft.draftId);
  const rebuilt = await service.rebuildDraftPlan(program.programId);
  assert.equal(rebuilt.rebuilt, true);
  assert.equal(rebuilt.removed.draftId, first.draft.draftId);
  assert.equal(rebuilt.removed.taskCards, first.taskCards.length);
  assert.equal(rebuilt.removed.reviewItems, 1);
  assert.equal(repository.getPlanDraft(first.draft.draftId), null);
  assert.notEqual(rebuilt.draft.draftId, first.draft.draftId);
  assert.equal(repository.latestDraftForProgram(program.programId).draftId, rebuilt.draft.draftId);
  assert.equal(repository.listReviewItems({ learnerId: "weixin_stephen", status: "pending" }).length, 1);
  assert.equal(repository.listTaskCards({ draftId: rebuilt.draft.draftId }).length, rebuilt.taskCards.length);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testRebuildDraftBlocksPublishedPlan() {
  const root = tempRoot();
  const { service, repository } = createService(root);
  const program = service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Published English growth",
    goalSummary: "Improve English output.",
    sourceBasisRefs: ["parent_config:summary"],
  });
  const drafted = await service.draftPlan(program.programId);
  const decision = await service.decideReview(drafted.reviewItem.reviewId, { decision: "approved", principalId: "owner" });
  assert.equal(decision.autoPublish.ok, true);
  await assert.rejects(() => service.rebuildDraftPlan(program.programId), /published or executable records/);
  assert.equal(repository.getPlanDraft(drafted.draft.draftId).status, "published");
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function testPublishUsesPreparedDraftFromPublishService() {
  const root = tempRoot();
  const { service, repository } = createService(root, {
    publishService: {
      async publish(input) {
        const preparedDraft = Object.assign({}, input.draft, {
          dailyPlans: input.draft.dailyPlans.map((day) => Object.assign({}, day, {
            tasks: day.tasks.map((task) => Object.assign({}, task, {
              learnerInstruction: "JIT card instruction generated from recent summary-only state.",
              instruction: "JIT card instruction generated from recent summary-only state.",
              taskModel: Object.assign({}, task.taskModel || {}, {
                learnerInstruction: "JIT card instruction generated from recent summary-only state.",
                jitGeneration: {
                  status: "ready",
                  ready: true,
                  mode: "summary_state_at_card_creation",
                  privacyLevel: "summary_only",
                },
              }),
            })),
          })),
        });
        return {
          ok: true,
          draft: preparedDraft,
          kanbanResult: {
            ok: true,
            cards: preparedDraft.dailyPlans.flatMap((day) => day.tasks).map((task, index) => ({
              clientId: task.taskId,
              card: { id: `jit-kanban-${index + 1}` },
            })),
          },
        };
      },
    },
  });
  const program = service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "Prepared draft publish",
    goalSummary: "Improve English output.",
    sourceBasisRefs: ["parent_config:summary"],
    curriculumRefs: ["cefr-a2-b1-english-growth"],
  });
  const drafted = await service.draftPlan(program.programId);
  const published = await service.publishProgram(program.programId, { draftId: drafted.draft.draftId, force: true });
  assert.equal(published.ok, true);
  const savedDraft = repository.getPlanDraft(drafted.draft.draftId);
  assert.match(savedDraft.dailyPlans[0].tasks[0].learnerInstruction, /JIT card instruction/);
  assert.equal(published.taskCards[0].taskModel.jitGeneration.ready, true);
  assert.equal(published.taskCards[0].kanbanCardId, "jit-kanban-1");
  assert.doesNotMatch(JSON.stringify(published.taskCards[0]), /rawTranscript|questionText|answerKey|prompt|fullTranscript/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testFoundationRecordsRejectPrivatePayloadKeys() {
  const root = tempRoot();
  const { service, repository } = createService(root);
  assert.throws(() => service.saveSource({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "bad",
    summary: "summary",
    rawTranscript: "not allowed",
  }), /summary-only fields/);
  assert.throws(() => service.saveGoal({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "bad",
    questionText: "not allowed",
  }), /summary-only fields/);
  assert.throws(() => service.createProgram({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "bad",
    answerKey: "not allowed",
  }), /summary-only fields/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testSourceDirectoryBootstrapCreatesEditableFoundation() {
  const root = tempRoot();
  const ownerDriveRoot = path.join(root, "owner-drive");
  seedFanfanSourceDirectory(ownerDriveRoot);
  const { service, repository } = createService(root, { ownerDriveRoot });
  const bootstrapped = service.bootstrapFromSourceDirectory({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
  });
  assert.equal(bootstrapped.ok, true);
  assert.equal(bootstrapped.created.sources, 2);
  assert.equal(bootstrapped.created.goal, 1);
  assert.equal(bootstrapped.created.program, 1);
  assert.equal(bootstrapped.created.profile, 1);
  assert.equal(repository.listSources({ learnerId: "weixin_stephen" }).length, 2);
  assert.equal(repository.listGoals({ learnerId: "weixin_stephen", status: "active" }).length, 1);
  assert.equal(repository.listPrograms({ learnerId: "weixin_stephen" }).length, 1);
  assert.ok(bootstrapped.program.focusAreas.includes("english_short_writing"));
  assert.doesNotMatch(JSON.stringify(bootstrapped), /rawTranscript|questionText|answerKey|prompt|fullTranscript/);

  const repeated = service.bootstrapFromSourceDirectory({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
  });
  assert.equal(repeated.created.goal, 0);
  assert.equal(repeated.created.program, 0);
  assert.equal(repeated.reused.goal, 1);
  assert.equal(repeated.reused.program, 1);
  assert.equal(repository.listGoals({ learnerId: "weixin_stephen", status: "active" }).length, 1);
  assert.equal(repository.listPrograms({ learnerId: "weixin_stephen" }).length, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

(async () => {
  await testCreateDraftApprovePublish();
  await testBlockedDraftDoesNotPublish();
  await testRebuildDraftRemovesOnlyUnpublishedPlan();
  await testRebuildDraftBlocksPublishedPlan();
  await testPublishUsesPreparedDraftFromPublishService();
  testFoundationRecordsRejectPrivatePayloadKeys();
  testSourceDirectoryBootstrapCreatesEditableFoundation();
  console.log("learning program service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
