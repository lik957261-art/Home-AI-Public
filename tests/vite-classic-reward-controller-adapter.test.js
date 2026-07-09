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

const source = read("public/app-learning-growth-reward-controller.js");

test("classic learning growth reward controller imports the Vite ESM model", () => {
  assert.match(source, /LEARNING_GROWTH_REWARD_CONTROLLER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-growth-reward-controller-model\/learning-growth-reward-controller-model\.js/);
  assert.match(source, /function importLearningGrowthRewardControllerModel/);
  assert.match(source, /function currentLearningGrowthRewardControllerModel/);
  assert.match(source, /__homeAiImportLearningGrowthRewardControllerModel/);
});

test("classic learning growth reward controller delegates pure plans before fallback logic", () => {
  for (const marker of [
    "learningRewardSeriesIdsPlan",
    "learningRewardPolicySubmitPlan",
    "learningRewardPolicyPatchRequestsPlan",
    "rewardPolicySubmitPlan",
    "fallbackRewardPolicySubmitPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes learning growth reward controller model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningGrowthRewardControllerModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-growth-reward-controller-model\.mjs/);
  assert.match(viteConfig, /"learning-growth-reward-controller-model": learningGrowthRewardControllerModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
