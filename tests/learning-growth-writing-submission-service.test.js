"use strict";

const assert = require("node:assert/strict");
const {
  createLearningGrowthWritingSubmissionService,
} = require("../adapters/learning-growth-writing-submission-service");

async function testSubmitWritingStoresAsKanbanComment() {
  const calls = [];
  const service = createLearningGrowthWritingSubmissionService({
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
          }],
        };
      },
      async mutateCard(input) {
        calls.push({ type: "mutate", input });
        return { ok: true, id: input.cardId, action: input.action };
      },
    },
  });
  const result = await service.submitWriting({
    workspaceId: "child",
    cardId: "t_growth",
    text: "My first draft.",
    author: "child",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "submitted");
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
  assert.deepEqual(calls[1], {
    type: "mutate",
    input: {
      action: "comment",
      workspaceId: "child",
      cardId: "t_growth",
      comment: "My first draft.",
      author: "child",
    },
  });
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

function testDependencyValidation() {
  assert.throws(
    () => createLearningGrowthWritingSubmissionService({ kanbanCardProvider: { listCards() {} } }),
    /requires kanbanCardProvider list\/mutate/,
  );
}

(async () => {
  testDependencyValidation();
  await testSubmitWritingStoresAsKanbanComment();
  await testRejectsMissingNonGrowthAndOversizedSubmissions();
  console.log("learning growth writing submission service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
