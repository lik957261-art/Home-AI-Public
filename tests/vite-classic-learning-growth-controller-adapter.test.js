"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const source = read("public/app-learning-growth-controller.js");

test("classic learning growth controller imports the Vite ESM owner model", () => {
  assert.match(source, /LEARNING_GROWTH_CONTROLLER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-growth-controller-model\/learning-growth-controller-model\.js/);
  assert.match(source, /function importLearningGrowthControllerModel/);
  assert.match(source, /function currentLearningGrowthControllerModel/);
  assert.match(source, /function learningGrowthControllerModelFunction/);
  assert.match(source, /__homeAiImportLearningGrowthControllerModel/);
});

test("classic learning growth controller delegates pure plans before fallback logic", () => {
  for (const marker of [
    "learningGrowthLearnerWorkspaceIdPlan",
    "learningGrowthScopeKeyPlan",
    "learningCoinRequestParamsPlan",
    "learningGrowthMasteryRequestParamsPlan",
    "resetLearningGrowthStatePatchPlan",
    "learningInputListPlan",
    "learningSplitLinesPlan",
    "learningCsvListPlan",
    "learningLearnerBodyPlan",
    "learningProgramFormBodyPlan",
    "learningFoundationImportBodyPlan",
    "learningSourceFormBodyPlan",
    "learningGoalFormBodyPlan",
    "learningRewardFormBodyPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes learning growth controller model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningGrowthControllerModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-growth-controller-model\.mjs/);
  assert.match(viteConfig, /"learning-growth-controller-model": learningGrowthControllerModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
