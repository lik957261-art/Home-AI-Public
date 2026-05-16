"use strict";

const {
  assertNoPrivateLearningPayload,
  clampLearningConfidence,
  clampLearningScore,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

const VERIFIED_METHODS = new Set(["deterministic_template", "answer_key_match", "python_execution"]);
const KNOWN_METHODS = new Set([
  "deterministic_template",
  "answer_key_match",
  "python_execution",
  "python_static_review",
  "english_rubric_evidence_check",
  "model_only",
  "parent_review",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function addRisk(flags, code, severity = "review", message = code) {
  if (!flags.some((flag) => flag.code === code)) flags.push({ code, severity, message });
}

function normalizeMethod(method, task = {}, input = {}) {
  const requested = cleanString(method || input.verificationMethod || input.verification?.method).replace(/-/g, "_");
  if (KNOWN_METHODS.has(requested)) return requested;
  const domain = cleanString(task.domain);
  if (domain === "programming") return input.executionEvidenceRef ? "python_execution" : "python_static_review";
  if (domain === "english") return "english_rubric_evidence_check";
  return "model_only";
}

function methodStatus(method, input = {}) {
  const explicit = cleanString(input.verificationStatus || input.verification?.status).replace(/-/g, "_");
  if (["verified", "model_only", "needs_review", "failed", "blocked", "error"].includes(explicit)) return explicit;
  if (VERIFIED_METHODS.has(method)) return "verified";
  return "model_only";
}

function createLearningEvaluationVerifierService(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const minVerifiedConfidence = Number(options.minVerifiedConfidence || 0.75);

  function verifyEvaluation(input = {}) {
    assertNoPrivateLearningPayload(input, "learning evaluation verification");
    const task = input.task || {};
    const evaluation = input.evaluation || input;
    const riskFlags = [];
    const score = clampLearningScore(evaluation.score, 0);
    const confidence = clampLearningConfidence(evaluation.confidence, 0.7);
    const passed = evaluation.passed == null ? score >= 70 : Boolean(evaluation.passed);
    const method = normalizeMethod(evaluation.verificationMethod, task, evaluation);
    let status = methodStatus(method, evaluation);
    const sourceBasisRefs = asArray(evaluation.sourceBasisRefs).length ? asArray(evaluation.sourceBasisRefs) : asArray(task.sourceBasisRefs);
    const evidenceRefs = asArray(evaluation.evidenceRefs || evaluation.verification?.evidenceRefs)
      .map(cleanString)
      .filter(Boolean);

    if (!sourceBasisRefs.length) addRisk(riskFlags, "missing_source_basis", "block", "Evaluation has no source basis references.");
    if (!evidenceRefs.length) addRisk(riskFlags, "missing_evidence_refs", "review", "Evaluation has no verifier evidence references.");
    if (confidence < 0.6) addRisk(riskFlags, "low_evaluation_confidence", "review", "Evaluation confidence is low.");
    if (method === "model_only") addRisk(riskFlags, "model_only_verification", "review", "Evaluation is model-only.");
    if (method === "python_static_review") addRisk(riskFlags, "python_not_executed", "review", "Programming evaluation has no execution evidence.");
    if (method === "english_rubric_evidence_check" && status === "verified" && !evidenceRefs.length) {
      status = "model_only";
      addRisk(riskFlags, "english_rubric_without_evidence", "review", "English rubric verification lacks evidence references.");
    }
    if (passed && !VERIFIED_METHODS.has(method)) {
      addRisk(riskFlags, "passed_without_deterministic_verification", "review", "Passed evaluation is not deterministically verified.");
    }
    if (riskFlags.some((flag) => flag.severity === "block")) status = "blocked";
    else if (status === "verified" && confidence < minVerifiedConfidence) status = "needs_review";

    const parentReviewRequired = status !== "verified" || confidence < minVerifiedConfidence || riskFlags.length > 0;
    return {
      method,
      status,
      confidence,
      verifierVersion: "v0.4",
      verifiedAt: now().toISOString(),
      evidenceRefs,
      riskFlags,
      parentReviewRequired,
      rewardEligible: passed && status === "verified" && confidence >= minVerifiedConfidence && !riskFlags.length,
      summary: compactLearningSummary(evaluation.verificationSummary || evaluation.summary || "", 360),
    };
  }

  return {
    verifyEvaluation,
  };
}

module.exports = {
  KNOWN_METHODS,
  VERIFIED_METHODS,
  createLearningEvaluationVerifierService,
  normalizeMethod,
};
