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

test("classic kanban study actions imports the Vite ESM owner model", () => {
  const source = read("public/app-kanban-study-actions-ui.js");
  assert.match(source, /KANBAN_STUDY_ACTIONS_MODEL_ESM_PATH = "\/vite-islands\/kanban-study-actions-model\/kanban-study-actions-model\.js"/);
  assert.match(source, /function importKanbanStudyActionsModel\(\)/);
  assert.match(source, /function currentKanbanStudyActionsModel\(\)/);
  assert.match(source, /function kanbanStudyActionsModelFunction\(name\)/);
  assert.match(source, /__homeAiImportKanbanStudyActionsModel/);
});

test("classic kanban study actions delegates pure plans with fallbacks", () => {
  const source = read("public/app-kanban-study-actions-ui.js");
  for (const marker of [
    "readingSubmissionFeedbackPlan",
    "readingSubmissionRequestBodyPlan",
    "readingQuizCompletionPlan",
    "readingQuizSubmitResultPlan",
    "assessmentRequirementText",
    "assessmentExamStatePlan",
    "assessmentSubmitResultPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /body: JSON\.stringify\(requestBody\)/);
  assert.match(source, /state\.todoAssessmentExams\[todoId\] = kanbanStudyActionsModelFunction\("assessmentExamStatePlan"\)\?\.\(result\)/);
  assert.match(source, /showPushToast\(resultPlan\.toast\.message, resultPlan\.toast\.tone\)/);
});

test("Vite config exposes kanban study actions model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /kanbanStudyActionsModelEntry/);
  assert.match(config, /"kanban-study-actions-model": kanbanStudyActionsModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
