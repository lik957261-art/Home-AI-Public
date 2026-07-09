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

test("classic app bootstrap imports the Vite ESM model", () => {
  const source = read("public/app.js");
  assert.match(source, /APP_BOOTSTRAP_MODEL_ESM_PATH = "\/vite-islands\/app-bootstrap-model\/app-bootstrap-model\.js"/);
  assert.match(source, /function importAppBootstrapModel\(\)/);
  assert.match(source, /function currentAppBootstrapModel\(\)/);
  assert.match(source, /function appBootstrapModelFunction\(name\)/);
  assert.match(source, /__homeAiImportAppBootstrapModel/);
});

test("classic app bootstrap delegates pure initialization plans with fallbacks", () => {
  const source = read("public/app.js");
  for (const marker of [
    "optionPreferenceId",
    "kanbanComposerModePlan",
    "normalizeKanbanComposerMaxParallel",
    "kanbanReasoningEffortPlan",
    "defaultKanbanReadingDraft",
    "defaultKanbanAssessmentDraft",
    "isKanbanProgrammingStudyTemplate",
    "programmingAssessmentDraftFromStudyDraft",
    "parseWorkspaceIdList",
    "kanbanPlanBindingPartsPlan",
    "kanbanPlanBindingPreviewPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /modelFn\(value, FONT_SIZE_OPTIONS, DEFAULT_FONT_SIZE\)/);
  assert.match(source, /modelFn\(stored, localStorage\.getItem\("hermesKanbanComposerMultiAgent"\)\)/);
  assert.match(source, /modelFn\(studyDraft, todayDateInputValue\(\)\)/);
  assert.match(source, /modelFn\(source, kind, labels\)/);
});

test("Vite config exposes app bootstrap model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /appBootstrapModelEntry/);
  assert.match(config, /"app-bootstrap-model": appBootstrapModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
