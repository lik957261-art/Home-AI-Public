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

const source = read("public/app-learning-growth-reflection-ui.js");

test("classic reflection UI imports the Vite ESM model", () => {
  assert.match(source, /LEARNING_GROWTH_REFLECTION_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-growth-reflection-model\/learning-growth-reflection-model\.js/);
  assert.match(source, /function importLearningGrowthReflectionModel/);
  assert.match(source, /function currentLearningGrowthReflectionModel/);
  assert.match(source, /__homeAiImportLearningGrowthReflectionModel/);
});

test("classic reflection UI delegates pure plans before fallback rendering", () => {
  for (const marker of [
    "feedbackListPlan",
    "reflectionStatusPlan",
    "reflectionRecorderPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes reflection model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningGrowthReflectionModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-growth-reflection-model\.mjs/);
  assert.match(viteConfig, /"learning-growth-reflection-model": learningGrowthReflectionModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
