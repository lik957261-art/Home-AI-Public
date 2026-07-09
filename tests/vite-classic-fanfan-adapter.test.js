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

const source = read("public/app-learning-growth-ui.js");

test("classic learning growth UI imports the Vite ESM model", () => {
  assert.match(source, /LEARNING_GROWTH_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-growth-model\/learning-growth-model\.js/);
  assert.match(source, /function importLearningGrowthModel/);
  assert.match(source, /function currentLearningGrowthModel/);
  assert.match(source, /__homeAiImportLearningGrowthModel/);
});

test("classic learning growth UI delegates pure plans before fallback rendering", () => {
  for (const marker of [
    "statusTextPlan",
    "countPendingTasksPlan",
    "averageCoinsForWindowPlan",
    "learningGrowthBoardViewPlan",
    "ownerSettingsOverviewPlan",
    "learningGrowthSummaryPlan",
    "masteryStatusTextPlan",
    "rewardTaskSeriesPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes learning growth model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningGrowthModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-growth-model\.mjs/);
  assert.match(viteConfig, /"learning-growth-model": learningGrowthModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
