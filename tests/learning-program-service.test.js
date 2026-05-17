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
        return { ok: true, kanbanResult: { ok: true, cards: [{ card: { id: "k1" } }] } };
      },
    },
  }, overrides));
  return { service, repository, publishCalls };
}

async function testCreateDraftApprovePublish() {
  const root = tempRoot();
  const { service, publishCalls, repository } = createService(root);
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

  const drafted = service.draftPlan(program.programId);
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

  service.decideReview(drafted.reviewItem.reviewId, { decision: "approved", principalId: "owner" });
  const published = await service.publishProgram(program.programId, { draftId: drafted.draft.draftId });
  assert.equal(published.ok, true);
  assert.equal(publishCalls.length, 1);
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).publications, 1);
  assert.equal(published.taskCards.length, drafted.draft.taskCount);
  assert.ok(published.taskCards.every((task) => task.status === "published"));
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
  assert.equal(overview.sources.length, 1);
  assert.equal(overview.goals.length, 1);
  assert.equal(overview.taskCards.length, drafted.draft.taskCount);
  assert.equal(overview.dailyPlan.summary.totalTasks, drafted.draft.taskCount);
  assert.equal(overview.dailyPlan.privacyLevel, "summary_only");
  assert.equal(overview.interactionSessions.length, 0);
  assert.equal(overview.evaluations.length, 0);
  assert.equal(overview.rewardSettlements.length, 0);
  assert.ok(overview.curriculumReferences.length >= 3);
  assert.equal(overview.learnerProfile.learnerId, "weixin_stephen");
  const startedSession = service.startTaskSession(published.taskCards[0].taskCardId, { summary: "started summary", actor: "child" });
  const loadedSession = service.getInteractionSession(startedSession.sessionId);
  assert.equal(loadedSession.sessionId, startedSession.sessionId);
  assert.equal(loadedSession.learnerId, "weixin_stephen");
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
  const drafted = service.draftPlan(program.programId);
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

(async () => {
  await testCreateDraftApprovePublish();
  await testBlockedDraftDoesNotPublish();
  testFoundationRecordsRejectPrivatePayloadKeys();
  console.log("learning program service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
