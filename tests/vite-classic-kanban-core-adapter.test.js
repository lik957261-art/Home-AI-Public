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

const source = read("public/app-kanban-core-ui.js");

test("classic kanban core imports the shared Vite ESM model", () => {
  assert.match(source, /KANBAN_CORE_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-todo-core-model\/kanban-todo-core-model\.js/);
  assert.match(source, /function importKanbanCoreModel/);
  assert.match(source, /function currentKanbanCoreModel/);
  assert.match(source, /function kanbanCoreModelFunction/);
  assert.match(source, /__homeAiImportKanbanCoreModel/);
});

test("classic kanban core delegates pure plans before fallback logic", () => {
  for (const marker of [
    "kanbanStatusNeedsCompletedPlan",
    "shouldLoadCompletedTodosPlan",
    "kanbanCardWorkspaceIdPlan",
    "kanbanCardActionBodyPlan",
    "kanbanCaseLooksLikeReadingPlanPlan",
    "isKanbanProgrammingAssessmentCardPlan",
    "kanbanStudyLabelsPlan",
    "kanbanCanPlan",
    "normalizeKanbanStudyScheduleFrequencyPlan",
    "parseKanbanStudyWeekdaysPlan",
    "saveKanbanComposerModePlan",
    "kanbanComposerDocumentContextPlan",
    "todoListCacheKeyPlan",
    "applyTodoListResultPlan",
    "normalizedKanbanStatusPlan",
    "currentTodoKanbanStatusPlan",
    "cleanKanbanReadingResultTextPlan",
    "kanbanDisplayResultTextPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

if (process.exitCode) process.exit(process.exitCode);
