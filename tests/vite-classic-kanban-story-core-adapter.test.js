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

const source = read("public/app-kanban-story-core-ui.js");

test("classic kanban story core imports the Vite ESM model", () => {
  assert.match(source, /KANBAN_STORY_CORE_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-story-core-model\/kanban-story-core-model\.js/);
  assert.match(source, /function importKanbanStoryCoreModel/);
  assert.match(source, /function currentKanbanStoryCoreModel/);
  assert.match(source, /__homeAiImportKanbanStoryCoreModel/);
});

test("classic kanban story core delegates pure state plans with fallbacks", () => {
  for (const marker of [
    "kanbanStoryCaseExpandedPlan",
    "kanbanStoryToggleAttrsPlan",
    "kanbanStoryCaseBodyOpenPlan",
    "kanbanStoryCaseRenderStatePlan",
    "kanbanStoryCaseTemplatePlan",
    "kanbanStoryCaseIsLearningGrowthPlan",
    "kanbanStorySwipeRenderStatePlan",
    "kanbanStoryDetailLoadPlan",
    "stripAssessmentConfigTextPlan",
    "assessmentTemplateDisplayTextPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /loadKanbanCardDetail\(load\.id, \{ silent: true \}\)\.catch\(showError\)/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /renderKanbanArchiveCase/);
});

test("Vite config exposes kanban story core model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /kanbanStoryCoreModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/kanban-story-core-model\.mjs/);
  assert.match(viteConfig, /"kanban-story-core-model": kanbanStoryCoreModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
