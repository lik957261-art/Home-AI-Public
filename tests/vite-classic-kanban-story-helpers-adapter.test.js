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

const source = read("public/app-kanban-story-helpers.js");

test("classic kanban story helpers import the Vite ESM model when available", () => {
  assert.match(source, /KANBAN_STORY_HELPERS_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-story-helpers-model\/kanban-story-helpers-model\.js/);
  assert.match(source, /function importKanbanStoryHelpersModel/);
  assert.match(source, /function currentKanbanStoryHelpersModel/);
  assert.match(source, /__homeAiImportKanbanStoryHelpersModel/);
});

test("classic kanban story helpers delegate pure plans and keep UMD compatibility", () => {
  for (const marker of [
    "compactDisplayTextPlan",
    "todoSortTimestampPlan",
    "caseTemplatePlan",
    "assessmentExamCompletedPlan",
    "normalizedKanbanStatusPlan",
    "arrayFromKanbanFieldPlan",
    "parsedKanbanPlanDescriptionPlan",
    "kanbanCardCaseInfoPlan",
    "kanbanStoryCaseKeyPlan",
    "kanbanArchiveStatusSummaryPlan",
    "kanbanArchiveConclusionPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /module\.exports = factory\(\)/);
  assert.match(source, /root\.HermesKanbanStoryHelpers = factory\(\)/);
  assert.doesNotMatch(source, /document\.querySelector/);
});

test("Vite config exposes kanban story helpers model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /kanbanStoryHelpersModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/kanban-story-helpers-model\.mjs/);
  assert.match(viteConfig, /"kanban-story-helpers-model": kanbanStoryHelpersModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
