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

test("classic kanban actions imports the Vite ESM owner model", () => {
  const source = read("public/app-kanban-actions-ui.js");
  assert.match(source, /KANBAN_ACTIONS_MODEL_ESM_PATH = "\/vite-islands\/kanban-actions-model\/kanban-actions-model\.js"/);
  assert.match(source, /function importKanbanActionsModel\(\)/);
  assert.match(source, /function currentKanbanActionsModel\(\)/);
  assert.match(source, /function kanbanActionsModelFunction\(name\)/);
});

test("classic kanban actions delegates pure state plans with fallbacks", () => {
  const source = read("public/app-kanban-actions-ui.js");
  for (const marker of [
    "kanbanComposerDraftStoragePatch",
    "kanbanComposerModeSelectionPlan",
    "kanbanComposerDocumentRemovalPlan",
    "kanbanStatusSelectionPlan",
    "kanbanStoryExpandedPatch",
    "kanbanChoiceSelectionPatch",
    "kanbanPreviousStepPlan",
    "kanbanNextStepPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /localStorage\.setItem\(patch\.key, patch\.value\)/);
  assert.match(source, /state\.todoReadingQuizAnswers\[todoId\] = choice\.answers/);
  assert.match(source, /state\.todoAssessmentAnswers\[todoId\] = choice\.answers/);
});

test("Vite config exposes kanban actions model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /kanbanActionsModelEntry/);
  assert.match(config, /"kanban-actions-model": kanbanActionsModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
