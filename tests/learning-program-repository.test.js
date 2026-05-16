"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
  createLearningProgramRepository,
  stripPrivateLearningFields,
} = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-program-repo-"));
}

function sampleProgram() {
  return {
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    title: "English growth",
    domain: "english",
    focusAreas: ["english_reading_comprehension", "english_speaking_retell"],
    goalSummary: "Fast English growth",
    startDate: "2026-05-16",
    endDate: "2026-06-12",
    daysPerWeek: 5,
    minutesPerDay: 30,
    intensity: "normal",
    status: "active",
    sourceBasisRefs: ["parent_config:program-1"],
    curriculumRefs: ["cefr-a2-b1-growth-track"],
    constraints: { noRawChildContentInLogs: true },
    reviewPolicy: { parentReviewRequired: true },
  };
}

function testMigrationAndPersistence() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  repository.migrate();
  const integrity = repository.integritySummary();
  assert.equal(integrity.schemaVersion, CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION);
  assert.equal(integrity.quickCheck, "ok");

  const program = repository.upsertProgram(sampleProgram());
  assert.equal(program.programId, "program-1");
  assert.equal(program.learnerId, "weixin_stephen");
  assert.deepEqual(program.focusAreas, ["english_reading_comprehension", "english_speaking_retell"]);

  const draft = repository.savePlanDraft({
    draftId: "draft-1",
    programId: "program-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "review_required",
    weekStart: "2026-05-16",
    weekEnd: "2026-05-20",
    dailyPlans: [{ date: "2026-05-16", tasks: [{ taskId: "t1" }, { taskId: "t2" }] }],
    reliability: { publishBlocked: false, parentReviewRequired: true },
  });
  assert.equal(draft.taskCount, 2);

  const review = repository.saveReviewItem({
    reviewId: "review-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "pending",
    reason: "parent_review_required",
    summary: "review needed",
    riskFlags: [{ code: "missing_curriculum_refs" }],
    allowedActions: ["parent_review", "publish"],
  });
  assert.equal(review.status, "pending");
  assert.equal(repository.counts({ learnerId: "weixin_stephen" }).pendingReviewItems, 1);

  const publication = repository.savePublication({
    publicationId: "pub-1",
    programId: "program-1",
    draftId: "draft-1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    status: "published",
    kanbanResult: { ok: true, cards: [{ clientId: "safe-id" }] },
  });
  assert.equal(publication.status, "published");
  assert.equal(repository.listPrograms({ learnerId: "weixin_stephen" }).length, 1);
  assert.equal(repository.latestDraftForProgram("program-1").draftId, "draft-1");
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

function testPrivateFieldStripping() {
  const stripped = stripPrivateLearningFields({
    summary: "safe",
    rawTranscript: "child full transcript",
    nested: {
      questionText: "full question",
      sourceBasisRefs: ["safe-ref"],
      answerKey: ["A"],
    },
  });
  assert.equal(stripped.summary, "safe");
  assert.equal(stripped.rawTranscript, "[redacted]");
  assert.equal(stripped.nested.questionText, "[redacted]");
  assert.equal(stripped.nested.answerKey, "[redacted]");
  assert.deepEqual(stripped.nested.sourceBasisRefs, ["safe-ref"]);
}

testMigrationAndPersistence();
testPrivateFieldStripping();

console.log("learning program repository tests passed");
