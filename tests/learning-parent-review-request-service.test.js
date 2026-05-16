"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningParentReviewRequestService } = require("../adapters/learning-parent-review-request-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-parent-review-request-"));
}

function testCreateDeduplicateAndDecide() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningParentReviewRequestService({ repository });
  const first = service.createRequest({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    programId: "program-optional",
    requestType: "evaluation_review",
    resourceType: "evaluation",
    resourceId: "eval-1",
    idempotencyKey: "evaluation:eval-1:verification",
    summary: "summary only",
    riskFlags: [{ code: "model_only_verification" }],
    sourceBasisRefs: ["source:summary"],
  });
  const second = service.createRequest({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    resourceType: "evaluation",
    resourceId: "eval-1",
    idempotencyKey: "evaluation:eval-1:verification",
    summary: "summary only duplicate",
  });
  assert.equal(second.reviewRequestId, first.reviewRequestId);
  assert.equal(service.list({ learnerId: "weixin_stephen" }).length, 1);
  const decided = service.decide(first.reviewRequestId, { decision: "approved", principalId: "owner" });
  assert.equal(decided.status, "approved");
  assert.throws(() => service.decide(first.reviewRequestId, { decision: "rejected" }), /already decided/);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testPrivatePayloadRejected() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningParentReviewRequestService({ repository });
  assert.throws(
    () => service.createRequest({
      learnerId: "weixin_stephen",
      workspaceId: "weixin_stephen",
      resourceType: "evaluation",
      resourceId: "eval-1",
      answerText: "raw child answer",
    }),
    /summary-only fields/,
  );
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testCreateDeduplicateAndDecide();
testPrivatePayloadRejected();
console.log("learning parent review request service tests passed");
