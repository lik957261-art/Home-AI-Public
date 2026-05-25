"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningGrowthMasteryProfileService } = require("../adapters/learning-growth-mastery-profile-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-mastery-profile-"));
}

function createService() {
  const repository = createLearningProgramRepository({ dbPath: path.join(tempRoot(), "learning.sqlite3") });
  return {
    repository,
    service: createLearningGrowthMasteryProfileService({
      repository,
      nowIso: () => "2026-05-25T12:00:00.000Z",
    }),
  };
}

function writingTask() {
  return {
    taskCardId: "ltask_writing_1",
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sequenceGroupId: "program:english",
    templateId: "english-short-writing-v1",
    skillIds: ["english_short_writing"],
    sourceBasisRefs: ["source:summary"],
  };
}

function testExtractsSummaryOnlyEvidenceFromEvaluation() {
  const { service, repository } = createService();
  const result = service.recordTaskEvidence({
    taskCard: writingTask(),
    evaluation: {
      evaluationId: "eval-1",
      score: 90,
      confidence: 0.84,
      summary: "Clear opinion and reason.",
      strengths: ["clear opinion"],
      learnerAnswer: "private raw answer",
    },
  });
  assert.equal(result.evidenceItems.length >= 1, true);
  assert.equal(result.masteryChanges[0].toStatus, "practicing");
  const states = repository.listMasteryStates({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen" });
  assert.ok(states.some((state) => state.skillId === "english.writing.claim_reason_example"));
  assert.equal(JSON.stringify(states).includes("private raw answer"), false);
  repository.close();
}

function testRepeatedPositiveEvidenceCanMasterSkill() {
  const { service } = createService();
  service.recordTaskEvidence({ taskCard: writingTask(), evaluation: { evaluationId: "eval-1", score: 91, confidence: 0.82 } });
  service.recordTaskEvidence({ taskCard: Object.assign({}, writingTask(), { taskCardId: "ltask_writing_2" }), evaluation: { evaluationId: "eval-2", score: 88, confidence: 0.8 } });
  const duplicate = service.recordTaskEvidence({ taskCard: Object.assign({}, writingTask(), { taskCardId: "ltask_writing_2" }), evaluation: { evaluationId: "eval-2", score: 88, confidence: 0.8 } });
  assert.equal(duplicate.masteryChanges.some((change) => change.skipped), true);
  const profile = service.getMasteryProfile({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen", domain: "english" });
  const writingState = profile.skillStates.find((state) => state.skillId === "english.writing.claim_reason_example");
  assert.equal(writingState.status, "mastered");
  assert.equal(writingState.evidenceCount, 2);
  assert.equal(writingState.displayName, "Claim, reason, example writing");
  assert.ok(profile.strengths.some((state) => state.skillId === writingState.skillId));
}

function testMasteryProfileIncludesUnobservedCrossSubjectTaxonomy() {
  const { service } = createService();
  service.recordTaskEvidence({ taskCard: writingTask(), evaluation: { evaluationId: "eval-1", score: 91, confidence: 0.82 } });
  const profile = service.getMasteryProfile({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen" });
  assert.ok(profile.skillStates.some((state) => state.domain === "math" && state.status === "not_observed"));
  assert.ok(profile.skillStates.some((state) => state.domain === "science" && state.status === "not_observed"));
  assert.ok(profile.skillStates.some((state) => state.domain === "computer_science" && state.status === "not_observed"));
  assert.ok(profile.domainSummary.some((item) => item.domain === "english" && item.observed >= 1));
}

function testWeaknessProjectionDrivesNextCardInput() {
  const { service, repository } = createService();
  service.recordTaskEvidence({
    taskCard: Object.assign({}, writingTask(), { taskCardId: "ltask_writing_low" }),
    evaluation: {
      evaluationId: "eval-low",
      score: 62,
      confidence: 0.74,
      remainingWeaknesses: ["sentence control is unstable"],
    },
  });
  repository.upsertCardTrajectory({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sequenceGroupId: "program:english",
    taskCardId: "ltask_writing_low",
    sequenceIndex: 1,
    strategy: "repair",
    targetSkillIds: ["english.writing.sentence_control"],
    performanceSummary: "Sentence control needs repair.",
  });
  const projection = service.projectForNextCard({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sequenceGroupId: "program:english",
    domain: "english",
  });
  assert.ok(projection.weaknesses.includes("english.writing.claim_reason_example"));
  assert.equal(projection.recentTrajectory.length, 1);
}

testExtractsSummaryOnlyEvidenceFromEvaluation();
testRepeatedPositiveEvidenceCanMasterSkill();
testMasteryProfileIncludesUnobservedCrossSubjectTaxonomy();
testWeaknessProjectionDrivesNextCardInput();

console.log("learning growth mastery profile service tests passed");
