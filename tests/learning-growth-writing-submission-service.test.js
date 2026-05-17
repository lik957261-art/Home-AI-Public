"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthWritingSubmissionService,
} = require("../adapters/learning-growth-writing-submission-service");

async function testSubmitWritingStoresAsKanbanComment() {
  const calls = [];
  const grants = [];
  const service = createLearningGrowthWritingSubmissionService({
    learningCoinService: {
      grantCoins(input) {
        grants.push(input);
        return { entry: { entryId: "coin-1" } };
      },
    },
    kanbanCardProvider: {
      async listCards(input) {
        calls.push({ type: "list", input });
        return {
          ok: true,
          data: [{
            id: "t_growth",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const draft = [
    "Last week I joined a class activity about teamwork.",
    "First, I thought the task was simple, but our group had many different ideas.",
    "Because we did not want to waste time, I wrote down three steps and asked each classmate to choose one job.",
    "Then we checked the poster together and fixed the unclear sentences.",
    "Finally, we finished it on time, and I learned that clear communication makes a hard task easier.",
  ].join(" ");
  const result = await service.submitWriting({
    workspaceId: "child",
    cardId: "t_growth",
    text: draft,
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.evaluation.passed, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(grants.length, 1);
  assert.equal(grants[0].studentId, "child");
  assert.equal(grants[0].workspaceId, "child");
  assert.deepEqual(calls[0], {
    type: "list",
    input: {
      workspaceId: "child",
      scope: "mine",
      includeCompleted: true,
      limit: 1,
      search: "",
      targetId: "t_growth",
    },
  });
  assert.equal(calls[1].input.learningGrowthSubmission, true);
  assert.equal(calls[2].input.learningGrowthEvaluation.status, "completed");
  assert.equal(calls[3].input.action, "complete");
  assert.doesNotMatch(JSON.stringify(result.evaluation), /Last week I joined/);
}

async function testRejectsMissingNonGrowthAndOversizedSubmissions() {
  const service = createLearningGrowthWritingSubmissionService({
    maxSubmissionChars: 1000,
    kanbanCardProvider: {
      async listCards() {
        return { ok: true, data: [{ id: "t_reading", kanbanCaseTemplate: "reading" }] };
      },
      async mutateCard() {
        throw new Error("mutate should not run");
      },
    },
  });
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "" })).status, 400);
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "x".repeat(1001) })).status, 413);
  assert.equal((await service.submitWriting({ workspaceId: "child", cardId: "t_reading", text: "draft" })).status, 409);
}

async function testUsesLearningProgramSettlementWhenTaskLinked() {
  const calls = [];
  const programCalls = [];
  const service = createLearningGrowthWritingSubmissionService({
    getLearningProgramService: () => ({
      getTaskCard(taskCardId) {
        programCalls.push(["getTaskCard", taskCardId]);
        return { taskCardId, title: "Writing task", sourceBasisRefs: ["source:1"] };
      },
      listInteractionSessions(filters) {
        programCalls.push(["listInteractionSessions", filters]);
        return [];
      },
      startTaskSession(taskCardId) {
        programCalls.push(["startTaskSession", taskCardId]);
        return { sessionId: "session-1" };
      },
      recordEvaluation(sessionId, input) {
        programCalls.push(["recordEvaluation", sessionId, input]);
        return { evaluationId: input.evaluationId, passed: input.passed, verification: { status: "verified" } };
      },
      settleEvaluationReward(evaluationId, input) {
        programCalls.push(["settleEvaluationReward", evaluationId, input]);
        return { status: "settled", ledgerEntry: { entryId: "ledger-1" } };
      },
    }),
    learningCoinService: {
      grantCoins() {
        throw new Error("direct coin fallback should not run");
      },
    },
    kanbanCardProvider: {
      async listCards() {
        return {
          ok: true,
          data: [{
            id: "t_growth",
            workspaceId: "child",
            kanbanCaseMode: "study-plan",
            kanbanCaseTemplate: "learning-growth",
            learningTaskCardId: "ltask_1",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
          }],
        };
      },
      async mutateCard(input) {
        calls.push(input);
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const text = [
    "First, I joined a school activity with my classmates.",
    "Because the poster needed many details, I wrote a plan and checked each part.",
    "Then I asked my group to add examples and fix unclear sentences.",
    "Finally, we finished on time, and I learned that teamwork needs clear communication and careful revision.",
  ].join(" ");
  const result = await service.submitWriting({ workspaceId: "child", cardId: "t_growth", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(result.reward.entryId, "ledger-1");
  assert.ok(programCalls.some((call) => call[0] === "recordEvaluation"));
  assert.equal(calls.at(-1).action, "complete");
}

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthWritingSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires kanbanCardProvider list\/mutate/,
  );
}

(async () => {
  testDependencyValidation();
  await testSubmitWritingStoresAsKanbanComment();
  await testUsesLearningProgramSettlementWhenTaskLinked();
  await testRejectsMissingNonGrowthAndOversizedSubmissions();
  console.log("learning growth writing submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
