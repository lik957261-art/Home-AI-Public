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

test("classic kanban learning panel imports the Vite ESM owner model", () => {
  const source = read("public/app-kanban-learning-panel-ui.js");
  assert.match(source, /KANBAN_LEARNING_PANEL_MODEL_ESM_PATH = "\/vite-islands\/kanban-learning-panel-model\/kanban-learning-panel-model\.js"/);
  assert.match(source, /function importKanbanLearningPanelModel\(\)/);
  assert.match(source, /function currentKanbanLearningPanelModel\(\)/);
  assert.match(source, /function kanbanLearningPanelModelFunction\(name\)/);
});

test("classic kanban learning panel delegates pure plans with fallbacks", () => {
  const source = read("public/app-kanban-learning-panel-ui.js");
  for (const marker of [
    "learningGrowthEvaluationLabelPlan",
    "learningGrowthPublicSubmissionTextPlan",
    "answerDraftStorageKeyPlan",
    "answerDraftFingerprintPlan",
    "serializeAnswerDraftAnswersPlan",
    "restoreAnswerDraftAnswersPlan",
    "answerDraftAnsweredCountPlan",
    "learningGuidanceQuestionPayloadPlan",
    "selectedLearningAnswerPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /return nextStep === "spoken_reflection_required"/);
  assert.match(source, /return `hermes\$\{kind\}AnswerDraft:/);
});

test("Vite config exposes kanban learning panel model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /kanbanLearningPanelModelEntry/);
  assert.match(config, /"kanban-learning-panel-model": kanbanLearningPanelModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
