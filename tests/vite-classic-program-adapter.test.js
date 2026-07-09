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

const source = read("public/app-learning-program-ui.js");

test("classic learning program UI imports the Vite ESM model when available", () => {
  assert.match(source, /LEARNING_PROGRAM_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-program-model\/learning-program-model\.js/);
  assert.match(source, /function importLearningProgramModel/);
  assert.match(source, /function currentLearningProgramModel/);
  assert.match(source, /__homeAiImportLearningProgramModel/);
});

test("classic learning program UI delegates pure plans and keeps UMD compatibility", () => {
  for (const marker of [
    "programStatusTextPlan",
    "taskStatusTextPlan",
    "taskRewardPolicyPlan",
    "latestRewardSettlementForTaskPlan",
    "rewardSettlementDisplayTextPlan",
    "compactRiskFlagsPlan",
    "focusLabelPlan",
    "latestDraftForProgramPlan",
    "taskCardsForDraftPlan",
    "draftNeedsRebuildPlan",
    "draftCanBeRebuiltPlan",
    "learnerFactsPlan",
    "sourceRefsForProgramPlan",
    "compactFocusPlan",
    "formatPercentPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /module\.exports = factory\(\)/);
  assert.match(source, /root\.HermesLearningProgramUi = factory\(\)/);
  assert.match(source, /data-learning-program-create/);
  assert.match(source, /data-learning-native-growth-submission-input/);
});

test("Vite config exposes learning program model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningProgramModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-program-model\.mjs/);
  assert.match(viteConfig, /"learning-program-model": learningProgramModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
