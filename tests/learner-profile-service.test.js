"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearnerProfileService } = require("../adapters/learner-profile-service");
const { createLearningSourceService } = require("../adapters/learning-source-service");
const { createLearningGoalService } = require("../adapters/learning-goal-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "learner-profile-service-"));
}

function testRebuildProfileFromSourcesAndGoals() {
  const root = tempRoot();
  const repository = createLearningProgramRepository({ dataDir: root });
  const sources = createLearningSourceService({ repository });
  const goals = createLearningGoalService({ repository });
  sources.save({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    sourceType: "school",
    title: "School summary",
    summary: "summary only",
  });
  goals.save({
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    title: "English output",
    domain: "english",
    focusAreas: ["speaking", "writing"],
    targetSummary: "Improve oral retell and short writing.",
    priority: 90,
  });

  const service = createLearnerProfileService({ repository });
  const rebuilt = service.rebuild({ workspaceId: "weixin_stephen", learnerId: "weixin_stephen" });
  assert.equal(rebuilt.profile.learnerId, "weixin_stephen");
  assert.match(rebuilt.profile.profileSummary, /sources=1/);
  assert.ok(rebuilt.skillStates.some((state) => state.skillId === "english_speaking_retell"));
  assert.ok(rebuilt.skillStates.some((state) => state.skillId === "english_short_writing"));
  const loaded = service.get({ learnerId: "weixin_stephen" });
  assert.equal(loaded.skillStates.length, rebuilt.skillStates.length);
  repository.close();
  fs.rmSync(root, { recursive: true, force: true });
}

testRebuildProfileFromSourcesAndGoals();
console.log("learner profile service tests passed");
