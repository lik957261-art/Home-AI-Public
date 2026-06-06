"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
  createLearningProgramRepository,
} = require("../adapters/learning-program-repository");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-growth-mastery-repo-"));
}

function createRepo() {
  const root = tempRoot();
  return createLearningProgramRepository({ dbPath: path.join(root, "learning.sqlite3") });
}

function testSchemaCreatesAuditableMasteryTables() {
  const repo = createRepo();
  repo.migrate();
  assert.equal(CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION, 12);
  const tables = repo.open().prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
      'learning_growth_mastery_states',
      'learning_growth_card_trajectories',
      'learning_task_audio_blobs'
    ) ORDER BY name
  `).all().map((row) => row.name);
  assert.deepEqual(tables, ["learning_growth_card_trajectories", "learning_growth_mastery_states", "learning_task_audio_blobs"]);
  assert.equal(repo.integritySummary().counts.growthMasteryStates, 0);
  assert.equal(repo.integritySummary().counts.growthCardTrajectories, 0);
  repo.close();
}

function testUpsertsMasteryStateSummaryOnly() {
  const repo = createRepo();
  const saved = repo.upsertMasteryState({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    taxonomyVersion: "20260525-evergreen-capability-v2",
    domain: "english",
    strand: "writing",
    skillId: "english.writing.claim_reason_example",
    status: "practicing",
    confidence: 0.62,
    evidenceCount: 1,
    positiveEvidenceCount: 1,
    lastEvidenceRef: "evaluation:eval-1",
    strengths: ["clear opinion"],
    weaknesses: ["example needs detail"],
    evidenceSummary: [{
      summary: "Opinion and reason are visible; example needs detail.",
      learnerAnswer: "private raw answer",
    }],
    sourceBasisRefs: ["evaluation:eval-1"],
  });
  assert.equal(saved.skillId, "english.writing.claim_reason_example");
  assert.equal(saved.status, "practicing");
  assert.equal(saved.evidenceSummary[0].learnerAnswer, "[redacted]");
  const listed = repo.listMasteryStates({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen", domain: "english" });
  assert.equal(listed.length, 1);
  assert.equal(repo.getMasteryState({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    taxonomyVersion: "20260525-evergreen-capability-v2",
    domain: "english",
    strand: "writing",
    skillId: "english.writing.claim_reason_example",
  }).confidence, 0.62);
  repo.close();
}

function testUpsertsTrajectoryByTaskCard() {
  const repo = createRepo();
  repo.upsertCardTrajectory({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sequenceGroupId: "program:english",
    taskCardId: "ltask_1",
    sequenceIndex: 3,
    strategy: "stabilize",
    difficultyBand: "steady",
    targetSkillIds: ["english.writing.claim_reason_example"],
    performanceSummary: "Reached score line, reflection still required.",
    masteryChanges: [{ skillId: "english.writing.claim_reason_example", from: "observed", to: "practicing" }],
    sourceBasisRefs: ["evaluation:eval-1"],
    rawAnswer: "private raw answer",
  });
  repo.upsertCardTrajectory({
    learnerId: "weixin_stephen",
    workspaceId: "weixin_stephen",
    sequenceGroupId: "program:english",
    taskCardId: "ltask_1",
    sequenceIndex: 3,
    strategy: "repair",
    difficultyBand: "repair",
    targetSkillIds: ["english.writing.sentence_control"],
    performanceSummary: "Grammar control needs repair.",
  });
  const rows = repo.listCardTrajectories({ learnerId: "weixin_stephen", workspaceId: "weixin_stephen", sequenceGroupId: "program:english" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].strategy, "repair");
  assert.equal(JSON.stringify(rows).includes("private raw answer"), false);
  repo.close();
}

testSchemaCreatesAuditableMasteryTables();
testUpsertsMasteryStateSummaryOnly();
testUpsertsTrajectoryByTaskCard();

console.log("learning growth mastery repository tests passed");
