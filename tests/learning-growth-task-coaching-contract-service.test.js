"use strict";

const assert = require("node:assert/strict");
const {
  activityCoachingContract,
  coachingContractPrompt,
} = require("../adapters/learning-growth-task-coaching-contract-service");

function testGrammarContractRequiresVariantRepair() {
  const contract = activityCoachingContract("grammar");
  assert.equal(contract.label, "Grammar in expression");
  assert.ok(contract.rubricDimensions.includes("variant transfer"));
  assert.ok(contract.requiredEvidence.some((item) => /variant sentence/i.test(item)));
  assert.match(coachingContractPrompt("grammar"), /target pattern/);
}

function testWeeklyContractIsIntegrated() {
  const contract = activityCoachingContract("weekly_challenge");
  assert.equal(contract.label, "Weekly integrated challenge");
  assert.ok(contract.rubricDimensions.includes("integration"));
  assert.ok(contract.revisionMoves.some((item) => /this week/i.test(item)));
}

function testUnknownActivityFallsBackToPracticeContract() {
  const contract = activityCoachingContract("new_activity");
  assert.equal(contract.activityType, "new_activity");
  assert.equal(contract.label, "Learning task");
  assert.ok(contract.requiredEvidence.includes("one direct answer to the task"));
}

testGrammarContractRequiresVariantRepair();
testWeeklyContractIsIntegrated();
testUnknownActivityFallsBackToPracticeContract();
console.log("learning growth task coaching contract service tests passed");
