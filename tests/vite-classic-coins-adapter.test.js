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

const source = read("public/app-learning-coins-ui.js");

test("classic coins UI imports the Vite ESM model", () => {
  assert.match(source, /LEARNING_COINS_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-coins-model\/learning-coins-model\.js/);
  assert.match(source, /function importLearningCoinsModel/);
  assert.match(source, /function currentLearningCoinsModel/);
  assert.match(source, /__homeAiImportLearningCoinsModel/);
});

test("classic coins UI delegates pure view plans before fallback rendering", () => {
  for (const marker of [
    "formatCoinsPlan",
    "formatRmbCentsPlan",
    "rewardCardsViewPlan",
    "ledgerRowsViewPlan",
    "redemptionRowsViewPlan",
    "dailyBarsViewPlan",
    "rewardProgressViewPlan",
    "growthPanelViewPlan",
    "coinsSubsystemViewPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes coins model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningCoinsModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-coins-model\.mjs/);
  assert.match(viteConfig, /"learning-coins-model": learningCoinsModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
