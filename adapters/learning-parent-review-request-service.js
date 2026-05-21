"use strict";

const crypto = require("node:crypto");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

const REVIEW_DECISIONS = new Set(["approved", "rejected", "returned_for_revision", "cancelled"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createLearningParentReviewRequestService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.saveReviewRequest !== "function") {
    throw new Error("learning parent review request service requires repository");
  }

  function createRequest(input = {}) {
    assertNoPrivateLearningPayload(input, "learning parent review request");
    const idempotencyKey = cleanString(input.idempotencyKey);
    if (idempotencyKey) {
      const existing = repository.listReviewRequests({ idempotencyKey, limit: 1 })[0];
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    return repository.saveReviewRequest({
      reviewRequestId: cleanString(input.reviewRequestId) || createId("lprr"),
      learnerId: cleanString(input.learnerId),
      workspaceId: cleanString(input.workspaceId),
      programId: cleanString(input.programId),
      requestType: cleanString(input.requestType) || "evaluation_review",
      resourceType: cleanString(input.resourceType) || "evaluation",
      resourceId: cleanString(input.resourceId),
      idempotencyKey,
      status: cleanString(input.status) || "pending",
      reason: cleanString(input.reason) || "parent_review_required",
      summary: compactLearningSummary(input.summary || "Parent review required.", 700),
      riskFlags: asArray(input.riskFlags),
      allowedActions: asArray(input.allowedActions).length ? asArray(input.allowedActions) : ["approve", "reject", "return_for_revision"],
      sourceBasisRefs: asArray(input.sourceBasisRefs),
      decision: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  function list(filters = {}) {
    return repository.listReviewRequests(filters);
  }

  function get(reviewRequestId) {
    return repository.getReviewRequest(reviewRequestId);
  }

  function decide(reviewRequestId, input = {}) {
    assertNoPrivateLearningPayload(input, "learning parent review decision");
    const current = get(reviewRequestId);
    if (!current) {
      const err = new Error("Parent review request not found");
      err.status = 404;
      throw err;
    }
    if (current.status !== "pending") {
      const err = new Error("Parent review request is already decided");
      err.status = 409;
      throw err;
    }
    const decision = cleanString(input.decision || input.status);
    if (!REVIEW_DECISIONS.has(decision)) {
      const err = new Error("Unsupported parent review decision");
      err.status = 400;
      throw err;
    }
    const now = new Date().toISOString();
    return repository.saveReviewRequest(Object.assign({}, current, {
      status: decision,
      decision: {
        decision,
        note: compactLearningSummary(input.note || "", 600),
        decidedBy: cleanString(input.decidedBy || input.principalId) || "owner",
      },
      updatedAt: now,
      decidedAt: now,
    }));
  }

  return {
    createRequest,
    decide,
    get,
    list,
  };
}

module.exports = {
  REVIEW_DECISIONS,
  createLearningParentReviewRequestService,
};
