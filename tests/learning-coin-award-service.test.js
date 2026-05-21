"use strict";

const assert = require("node:assert/strict");
const {
  createLearningCoinAwardService,
  executorWorkspaceIdForLearningCard,
  learningCoinAwardKey,
  learningCoinAwardRecipient,
  learningTemplateForCard,
  studentIdForLearningCard,
} = require("../adapters/learning-coin-award-service");

function makeAwardService() {
  const grants = [];
  const broadcasts = [];
  const service = createLearningCoinAwardService({
    learningCoinService: {
      grantCoins(input) {
        grants.push(input);
        return {
          duplicate: input.idempotencyKey === "duplicate",
          entry: { id: `entry-${grants.length}`, coinDelta: input.coinAmount, sourceId: input.sourceId },
          balances: { availableCoins: input.coinAmount },
        };
      },
    },
    onAward(award) {
      broadcasts.push(award);
    },
  });
  return { service, grants, broadcasts };
}

function testRecipientTemplateAndKeyHelpers() {
  assert.equal(studentIdForLearningCard({}, "owner"), "owner");
  assert.equal(studentIdForLearningCard({}, "child-1"), "child-1");
  assert.equal(studentIdForLearningCard({ kanbanCaseStudentId: "Fan Fan" }, "owner"), "Fan-Fan");
  assert.equal(executorWorkspaceIdForLearningCard({ assignee: "child-1" }, "owner"), "child-1");
  assert.equal(executorWorkspaceIdForLearningCard({ assignee: "lowgw2" }, "owner"), "owner");
  assert.deepEqual(learningCoinAwardRecipient({
    workspaceId: "owner",
    card: { assignee: "child-1" },
  }), { workspaceId: "child-1", studentId: "child-1", sourceWorkspaceId: "owner" });
  assert.equal(learningTemplateForCard({ kanbanCaseTemplate: "reading" }), "reading");
  assert.equal(learningTemplateForCard({ kanbanCaseTemplate: "programming", kanbanCaseCardGoal: "Python loop" }), "programming-assessment");
  assert.equal(learningTemplateForCard({ kanbanCaseMode: "assessment-plan" }), "assessment");
  assert.equal(
    learningCoinAwardKey({ workspaceId: "owner", cardId: "card 1", stage: "quiz passed" }),
    "learning:owner:card-1:quiz-passed",
  );
}

function testReadingAwardIsGenericAndBroadcastsOnce() {
  const { service, grants, broadcasts } = makeAwardService();
  const award = service.awardEvent("reading_quiz_passed", {
    workspaceId: "owner",
    cardId: "card-1",
    card: { id: "card-1", assignee: "weixin_stephen", kanbanCaseId: "case-1", kanbanCaseTemplate: "reading", content: "private title should not be stored" },
    score: 100,
    correctCount: 10,
    total: 10,
  });

  assert.equal(award.ok, true);
  assert.equal(award.studentId, "weixin_stephen");
  assert.equal(award.workspaceId, "weixin_stephen");
  assert.equal(award.coinAmount, 85);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].reason, "\u5b66\u4e60\u6d4b\u9a8c\u901a\u8fc7");
  assert.equal(grants[0].sourceType, "kanban-reading-quiz");
  assert.equal(grants[0].sourceId, "card-1");
  assert.equal(grants[0].idempotencyKey, "learning:weixin_stephen:card-1:quiz-passed");
  assert.deepEqual(grants[0].metadata, {
    caseId: "case-1",
    cardId: "card-1",
    template: "reading",
    stage: "quiz-passed",
    score: 100,
    correctCount: 10,
    total: 10,
    passed: true,
    sourceWorkspaceId: "owner",
  });
  assert.equal(JSON.stringify(grants[0]).includes("private title"), false);
  assert.equal(broadcasts.length, 1);
}

function testDuplicateDoesNotBroadcast() {
  const { service, grants, broadcasts } = makeAwardService();
  const award = service.awardEvent("reading_quiz_passed", {
    workspaceId: "owner",
    cardId: "card-1",
    idempotencyKey: "duplicate",
    card: { id: "card-1", kanbanCaseTemplate: "reading" },
  });
  assert.equal(award.duplicate, true);
  assert.equal(grants.length, 1);
  assert.equal(broadcasts.length, 0);
}

function testProgrammingAssessmentUsesProgrammingRule() {
  const { service, grants } = makeAwardService();
  const award = service.awardEvent("assessment_exam_passed", {
    workspaceId: "owner",
    cardId: "python-1",
    card: { id: "python-1", kanbanCaseTemplate: "programming", kanbanCaseCardGoal: "Python CSV" },
    score: 80,
    correctCount: 4,
    total: 5,
  });
  assert.equal(award.template, "programming-assessment");
  assert.equal(grants[0].sourceType, "kanban-programming-assessment");
  assert.equal(grants[0].reason, "\u7f16\u7a0b\u6d4b\u9a8c\u901a\u8fc7");
}

testRecipientTemplateAndKeyHelpers();
testReadingAwardIsGenericAndBroadcastsOnce();
testDuplicateDoesNotBroadcast();
testProgrammingAssessmentUsesProgrammingRule();
console.log("learning coin award service tests passed");
