"use strict";

const assert = require("node:assert/strict");
const { createLearningEvaluationVerifierService } = require("../adapters/learning-evaluation-verifier-service");

function verifier() {
  return createLearningEvaluationVerifierService({
    now: () => new Date("2026-05-17T00:00:00.000Z"),
  });
}

function testVerifiedObjectiveEvaluation() {
  const result = verifier().verifyEvaluation({
    task: { domain: "math", sourceBasisRefs: ["goal:math"], skillIds: ["math_reasoning"] },
    evaluation: {
      score: 90,
      confidence: 0.88,
      passed: true,
      verificationMethod: "answer_key_match",
      evidenceRefs: ["artifact:summary-only-check"],
      sourceBasisRefs: ["goal:math"],
      summary: "summary only",
    },
  });
  assert.equal(result.method, "answer_key_match");
  assert.equal(result.status, "verified");
  assert.equal(result.parentReviewRequired, false);
  assert.equal(result.rewardEligible, true);
}

function testModelOnlyEnglishRequiresReview() {
  const result = verifier().verifyEvaluation({
    task: { domain: "english", sourceBasisRefs: ["source:school"], skillIds: ["english_speaking_retell"] },
    evaluation: {
      score: 82,
      confidence: 0.8,
      passed: true,
      summary: "summary only",
    },
  });
  assert.equal(result.method, "english_rubric_evidence_check");
  assert.equal(result.status, "model_only");
  assert.equal(result.parentReviewRequired, true);
  assert.ok(result.riskFlags.some((flag) => flag.code === "passed_without_verified_method"));
  assert.equal(result.rewardEligible, false);
}

function testModelAssistedGrowthTaskEvaluationSettlesWithoutParentReview() {
  const result = verifier().verifyEvaluation({
    task: { domain: "english", sourceBasisRefs: ["source:growth-summary"], skillIds: ["english_grammar"] },
    evaluation: {
      score: 84,
      confidence: 0.86,
      passed: true,
      verificationMethod: "model_assisted_growth_task_evaluation",
      evidenceRefs: ["learning-growth-task-model-evaluation:v1", "activity:grammar", "stage:final"],
      sourceBasisRefs: ["source:growth-summary"],
      summary: "summary only",
    },
  });
  assert.equal(result.method, "model_assisted_growth_task_evaluation");
  assert.equal(result.status, "verified");
  assert.equal(result.parentReviewRequired, false);
  assert.equal(result.rewardEligible, true);
}

function testOwnerManualPassCanSettleWithoutSourceBasis() {
  const result = verifier().verifyEvaluation({
    task: { domain: "math", skillIds: ["math_reasoning"] },
    evaluation: {
      score: 80,
      confidence: 1,
      passed: true,
      verificationMethod: "owner_manual_pass",
      evidenceRefs: ["owner-manual-pass:v1", "task:math-card"],
      summary: "summary only",
    },
  });
  assert.equal(result.method, "owner_manual_pass");
  assert.equal(result.status, "verified");
  assert.equal(result.parentReviewRequired, false);
  assert.equal(result.rewardEligible, true);
}

function testPythonExecutionRequiresEvidence() {
  const staticOnly = verifier().verifyEvaluation({
    task: { domain: "programming", sourceBasisRefs: ["goal:python"], skillIds: ["python_basics"] },
    evaluation: { score: 75, confidence: 0.76, passed: true, summary: "summary only" },
  });
  assert.equal(staticOnly.method, "python_static_review");
  assert.ok(staticOnly.riskFlags.some((flag) => flag.code === "python_not_executed"));

  const executed = verifier().verifyEvaluation({
    task: { domain: "programming", sourceBasisRefs: ["goal:python"], skillIds: ["python_basics"] },
    evaluation: {
      score: 75,
      confidence: 0.8,
      passed: true,
      verificationMethod: "python_execution",
      evidenceRefs: ["artifact:python-run-summary"],
      sourceBasisRefs: ["goal:python"],
    },
  });
  assert.equal(executed.method, "python_execution");
  assert.equal(executed.status, "verified");
}

function testPrivatePayloadRejected() {
  assert.throws(
    () => verifier().verifyEvaluation({
      task: { domain: "english", sourceBasisRefs: ["source:school"] },
      evaluation: { score: 80, rawTranscript: "full transcript" },
    }),
    /summary-only fields/,
  );
}

testVerifiedObjectiveEvaluation();
testModelOnlyEnglishRequiresReview();
testModelAssistedGrowthTaskEvaluationSettlesWithoutParentReview();
testOwnerManualPassCanSettleWithoutSourceBasis();
testPythonExecutionRequiresEvidence();
testPrivatePayloadRejected();
console.log("learning evaluation verifier service tests passed");
