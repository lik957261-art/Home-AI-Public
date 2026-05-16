"use strict";

const crypto = require("node:crypto");

function cleanString(value) {
  return String(value ?? "").trim();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function createLearningParentReviewQueueService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.saveReviewItem !== "function") {
    throw new Error("learning parent review queue service requires repository");
  }

  function createReviewItem(input = {}) {
    const now = new Date().toISOString();
    const riskFlags = Array.isArray(input.riskFlags) ? input.riskFlags : [];
    return repository.saveReviewItem({
      reviewId: input.reviewId || createId("lreview"),
      programId: cleanString(input.programId),
      draftId: cleanString(input.draftId),
      learnerId: cleanString(input.learnerId),
      workspaceId: cleanString(input.workspaceId) || "owner",
      status: cleanString(input.status) || "pending",
      reason: cleanString(input.reason) || "plan_reliability_review",
      summary: cleanString(input.summary) || `${riskFlags.length} reliability flags require parent review.`,
      riskFlags,
      allowedActions: Array.isArray(input.allowedActions) ? input.allowedActions : ["approve", "reject", "revise"],
      decision: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  function list(input = {}) {
    return repository.listReviewItems(input);
  }

  function get(reviewId) {
    return repository.getReviewItem(reviewId);
  }

  function decide(reviewId, decisionInput = {}) {
    const item = get(reviewId);
    if (!item) {
      const err = new Error("Review item not found");
      err.status = 404;
      throw err;
    }
    const decision = cleanString(decisionInput.decision || decisionInput.status);
    if (!["approved", "rejected", "returned_for_revision"].includes(decision)) {
      const err = new Error("Unsupported review decision");
      err.status = 400;
      throw err;
    }
    const now = new Date().toISOString();
    return repository.saveReviewItem(Object.assign({}, item, {
      status: decision,
      decision: {
        decision,
        note: cleanString(decisionInput.note),
        decidedBy: cleanString(decisionInput.decidedBy || decisionInput.principalId) || "owner",
      },
      updatedAt: now,
      decidedAt: now,
    }));
  }

  return {
    createReviewItem,
    decide,
    get,
    list,
  };
}

module.exports = {
  createLearningParentReviewQueueService,
};
