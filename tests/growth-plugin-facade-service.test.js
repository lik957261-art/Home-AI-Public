"use strict";

const assert = require("node:assert/strict");
const { boundedCard, createGrowthPluginFacadeService } = require("../adapters/growth-plugin-facade-service");

function createService() {
  const calls = [];
  const service = createGrowthPluginFacadeService({
    learningGrowthService: {
      overview(input) {
        calls.push({ type: "overview", input });
        return {
          learner: { id: "weixin_child", workspaceId: input.workspaceId },
          module: { id: "fanfan-growth" },
          operationalReadiness: { ready: true },
          launchOperations: { canLaunch: true },
        };
      },
    },
    learningGrowthBoardService: {
      board(input) {
        calls.push({ type: "board", input });
        return {
          learner: { id: "weixin_child", workspaceId: input.workspaceId },
          board: {
            learner: { id: "weixin_child" },
            role: "executor",
            summary: { total: 1 },
            lanes: [{ id: "today", title: "Today", count: 2, cards: ["card_1", "hidden_card"] }],
            cards: [{
              taskCardId: "card_1",
              title: "Read chapter 1",
              instructionPreview: "Read and summarize.",
              instruction: "Full raw instruction should not leak",
              prompt: "model prompt should not leak",
              rawModelOutput: "raw model output should not leak",
              latestSubmission: {
                submissionId: "sub_1",
                taskCardId: "card_1",
                status: "submitted",
                text: "learner raw answer should not leak",
                submittedAt: "2026-06-10T00:00:00.000Z",
              },
              latestEvaluation: {
                evaluationId: "eval_1",
                taskCardId: "card_1",
                status: "complete",
                score: 88,
                summary: "Good progress.",
                feedback: "raw private feedback should not leak",
              },
              artifactPreview: [
                { artifactId: "a1", title: "A1" },
                { artifactId: "a2", title: "A2" },
                { artifactId: "a3", title: "A3" },
                { artifactId: "a4", title: "A4" },
              ],
              actions: { canSubmit: true, canWithdraw: false, canReflect: true, internal: true },
            }],
          },
        };
      },
    },
  });
  return { calls, service };
}

function testStatusIsHostFacadeMetadataOnly() {
  const { calls, service } = createService();
  const result = service.status({ workspaceId: "weixin_child" });

  assert.equal(result.facadeVersion, 1);
  assert.equal(result.pluginId, "growth");
  assert.equal(result.dataOwner, "home-ai");
  assert.equal(result.pluginDataOwner, "not_migrated");
  assert.equal(result.migrationStage, "host_facade");
  assert.deepEqual(result.learner, { id: "weixin_child", workspaceId: "weixin_child" });
  assert.deepEqual(calls, [{ type: "overview", input: { workspaceId: "weixin_child" } }]);
}

function testBoardIsBoundedAndFiltersPrivateFields() {
  const { service } = createService();
  const result = service.board({ workspaceId: "weixin_child", learnerId: "weixin_child" });
  const json = JSON.stringify(result);

  assert.equal(result.facadeVersion, 1);
  assert.equal(result.dataOwner, "home-ai");
  assert.equal(result.migrationStage, "host_facade");
  assert.deepEqual(result.board.lanes[0].cards, ["card_1"]);
  assert.equal(result.board.cards[0].title, "Read chapter 1");
  assert.equal(result.board.cards[0].latestSubmission.submissionId, "sub_1");
  assert.equal(result.board.cards[0].latestEvaluation.summary, "Good progress.");
  assert.equal(result.board.cards[0].artifactPreview.length, 3);
  assert.equal(result.board.cards[0].actions.canSubmit, true);
  assert.equal(json.includes("Full raw instruction should not leak"), false);
  assert.equal(json.includes("model prompt should not leak"), false);
  assert.equal(json.includes("learner raw answer should not leak"), false);
  assert.equal(json.includes("raw private feedback should not leak"), false);
  assert.equal(json.includes("rawModelOutput"), false);
}

function testCardFindsOneProjectedCard() {
  const { service } = createService();
  const result = service.card({ workspaceId: "weixin_child", taskCardId: "card_1" });

  assert.equal(result.card.taskCardId, "card_1");
  assert.equal(service.card({ workspaceId: "weixin_child", taskCardId: "missing" }).card, null);
}

function testDependencyValidation() {
  assert.throws(() => createGrowthPluginFacadeService({}), /requires learningGrowthService\.overview/);
  assert.throws(() => createGrowthPluginFacadeService({
    learningGrowthService: { overview() {} },
  }), /requires learningGrowthBoardService\.board/);
  assert.equal(boundedCard({ taskCardId: "card", artifactPreview: [{}, {}, {}, {}] }).artifactPreview.length, 3);
}

testStatusIsHostFacadeMetadataOnly();
testBoardIsBoundedAndFiltersPrivateFields();
testCardFindsOneProjectedCard();
testDependencyValidation();

console.log("growth plugin facade service tests passed");
