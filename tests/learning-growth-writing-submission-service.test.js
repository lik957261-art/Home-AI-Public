"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthWritingSubmissionService,
} = require("../adapters/learning-growth-writing-submission-service");

async function testSubmitWritingStoresAsKanbanComment() {
  const calls = [];
  const grants = [];
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-feedback.md", name: "growth-writing-feedback.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
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
  assert.equal(result.status, "draft_feedback");
  assert.equal(result.evaluation.nextStep, "rewrite_and_reflect");
  assert.equal(result.evaluation.passed, false);
  assert.equal(result.reward.status, "not_eligible");
  assert.equal(result.result.completed, false);
  assert.equal(result.evaluation.report.name, "growth-writing-feedback.md");
  assert.equal(grants.length, 0);
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
  assert.equal(calls[1].input.submissionKind, "writing_draft");
  assert.equal(calls[2].input.learningGrowthEvaluation.status, "draft_feedback");
  assert.match(calls[2].input.comment, /AI 写作批改/);
  assert.match(calls[2].input.comment, /修改要求/);
  assert.match(calls[2].input.comment, /MEDIA:/);
  assert.doesNotMatch(JSON.stringify(result.evaluation), /Last week I joined/);
}

async function testFinalRewriteSettlesAndCompletes() {
  const calls = [];
  const grants = [];
  const service = createLearningGrowthWritingSubmissionService({
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-final.md", name: "growth-writing-final.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    learningCoinService: {
      grantCoins(input) {
        grants.push(input);
        return { entry: { entryId: "coin-final" } };
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
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
            learningGrowthEvaluationStatus: "draft_feedback",
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
    "I changed the middle sentence because it needed a clearer example.",
  ].join(" ");
  const result = await service.submitWriting({ workspaceId: "child", cardId: "t_growth", text, author: "child" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.evaluation.nextStep, "completed");
  assert.equal(result.evaluation.passed, true);
  assert.equal(result.reward.status, "settled");
  assert.equal(result.reward.entryId, "coin-final");
  assert.equal(result.result.completed, true);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].studentId, "child");
  assert.equal(calls[0].submissionKind, "writing_revision");
  assert.equal(calls[1].learningGrowthEvaluation.status, "completed");
  assert.equal(calls[2].action, "complete");
  assert.match(calls[2].comment, /金币/);
  assert.match(calls[2].comment, /最终结论/);
  assert.match(calls[2].comment, /Markdown/);
  assert.doesNotMatch(calls[2].comment, /[�]/);
}

async function testRejectsMissingNonGrowthAndOversizedSubmissions() {
  const service = createLearningGrowthWritingSubmissionService({
    maxSubmissionChars: 1000,
    reportService: { writeReport() { throw new Error("report should not run"); } },
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
    reportService: {
      writeReport() {
        return { path: "C:\\tmp\\growth-writing-program.md", name: "growth-writing-program.md", mime: "text/markdown; charset=utf-8", size: 120 };
      },
    },
    getLearningProgramService: () => ({
      getTaskCard(taskCardId) {
        programCalls.push(["getTaskCard", taskCardId]);
        return null;
      },
      getTaskCardForKanbanCard(kanbanCardId, filters) {
        programCalls.push(["getTaskCardForKanbanCard", kanbanCardId, filters]);
        return {
          taskCardId: "ltask_from_kanban",
          title: "Writing task",
          sourceBasisRefs: ["source:1"],
        };
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
            learningProgramId: "program-1",
            learningDraftId: "draft-1",
            kanbanCaseCardGoal: "Write 80-120 words about a school activity.",
            learningGrowthEvaluationStatus: "draft_feedback",
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
  assert.ok(programCalls.some((call) => call[0] === "getTaskCardForKanbanCard"));
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
  await testFinalRewriteSettlesAndCompletes();
  await testUsesLearningProgramSettlementWhenTaskLinked();
  await testRejectsMissingNonGrowthAndOversizedSubmissions();
  console.log("learning growth writing submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
