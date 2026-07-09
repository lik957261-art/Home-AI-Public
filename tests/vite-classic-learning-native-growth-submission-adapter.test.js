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

const source = read("public/app-learning-native-growth-submission-controller.js");

test("classic native growth submission imports the Vite ESM owner model", () => {
  assert.match(source, /LEARNING_NATIVE_GROWTH_SUBMISSION_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-native-growth-submission-model\/learning-native-growth-submission-model\.js/);
  assert.match(source, /function importLearningNativeGrowthSubmissionModel/);
  assert.match(source, /function currentLearningNativeGrowthSubmissionModel/);
  assert.match(source, /function learningNativeGrowthSubmissionModelFunction/);
  assert.match(source, /__homeAiImportLearningNativeGrowthSubmissionModel/);
});

test("classic native growth submission delegates pure plans with fallbacks", () => {
  for (const marker of [
    "learningNativeGrowthSubmissionStatsPlan",
    "nativeGrowthDraftStorageIdPlan",
    "nativeGrowthDraftStorageKeyPlan",
    "nativeGrowthRequirementPlan",
    "nativeGrowthTextDraftPlan",
    "nativeGrowthStructuredDraftPlan",
    "structuredNativeGrowthAnswersPlan",
    "nativeGrowthSubmissionCompletionTextPlan",
    "nativeGrowthReflectionCompletionTextPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes native growth submission model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningNativeGrowthSubmissionModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-native-growth-submission-model\.mjs/);
  assert.match(viteConfig, /"learning-native-growth-submission-model": learningNativeGrowthSubmissionModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
