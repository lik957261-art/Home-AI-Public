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

const source = read("public/app-learning-growth-settings-controller.js");

test("classic settings controller imports the Vite ESM model", () => {
  assert.match(source, /LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-growth-settings-controller-model\/learning-growth-settings-controller-model\.js/);
  assert.match(source, /function importLearningGrowthSettingsControllerModel/);
  assert.match(source, /function currentLearningGrowthSettingsControllerModel/);
  assert.match(source, /__homeAiImportLearningGrowthSettingsControllerModel/);
});

test("classic settings controller delegates pure plans before fallback logic", () => {
  for (const marker of [
    "openSettingsTaskPatchPlan",
    "closeSettingsTaskPatchPlan",
    "settingsSwipeBackAllowedPlan",
    "settingsSwipeStartPlan",
    "settingsSwipeMovePlan",
    "settingsSwipeEndPlan",
    "settingsSwipeCancelPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes settings controller model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningGrowthSettingsControllerModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-growth-settings-controller-model\.mjs/);
  assert.match(viteConfig, /"learning-growth-settings-controller-model": learningGrowthSettingsControllerModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
