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

test("classic learning growth AI imports the Vite ESM model", () => {
  const source = read("public/app-learning-growth-ai-controller.js");
  assert.match(source, /LEARNING_GROWTH_AI_MODEL_ESM_PATH = "\/vite-islands\/learning-growth-ai-model\/learning-growth-ai-model\.js"/);
  assert.match(source, /function importLearningGrowthAiModel\(\)/);
  assert.match(source, /function currentLearningGrowthAiModel\(\)/);
  assert.match(source, /function learningGrowthAiModelFunction\(name\)/);
  assert.match(source, /__homeAiImportLearningGrowthAiModel/);
});

test("classic learning growth AI delegates pure plans with fallbacks", () => {
  const source = read("public/app-learning-growth-ai-controller.js");
  for (const marker of [
    "learningAiLearnerBodyPlan",
    "friendlyLearningAiError",
    "learningAiProgressPlan",
    "learningAiRecommendationRequestBody",
    "learningAiScopeKey",
    "learningAiLatestParams",
    "latestLearningAiSummaryPlan",
    "findLearningAiRecommendation",
    "learningAiDraftCreatingId",
    "learningAiDraftRequestBody",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /modelFn\(workspaceId, learnerId\)/);
  assert.match(source, /scopeFn \? scopeFn\(body, "english"\)/);
  assert.match(source, /draftBodyFn \? draftBodyFn\(body, recommendation\)/);
});

test("Vite config exposes learning growth AI model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /learningGrowthAiModelEntry/);
  assert.match(config, /"learning-growth-ai-model": learningGrowthAiModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
