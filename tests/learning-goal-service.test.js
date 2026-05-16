"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningGoalService, normalizeLearningGoalInput } = require("../adapters/learning-goal-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learning-goal-service-"));
}

function testNormalizeSaveAndUpdate() {
  const normalized = normalizeLearningGoalInput({
    workspaceId: "weixin_stephen",
    domain: "english",
    title: "Fast English output",
    targetSummary: "Speaking and writing",
    focusAreas: ["speaking", "writing"],
    priority: 120,
  });
  assert.equal(normalized.learnerId, "weixin_stephen");
  assert.equal(normalized.priority, 100);
  assert.ok(normalized.focusAreas.includes("english_speaking_retell"));
  assert.ok(normalized.focusAreas.includes("english_short_writing"));

  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const service = createLearningGoalService({ repository });
  const goal = service.save(normalized);
  assert.equal(goal.goalRef, `goal:${goal.goalId}`);
  const updated = service.update(goal.goalId, { priority: 40, status: "paused" });
  assert.equal(updated.priority, 40);
  assert.equal(updated.status, "paused");
  assert.equal(service.list({ learnerId: "weixin_stephen", includeArchived: true }).length, 1);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testNormalizeSaveAndUpdate();
console.log("learning goal service tests passed");
