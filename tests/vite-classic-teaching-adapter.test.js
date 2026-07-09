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

const source = read("public/app-learning-growth-teaching-controller.js");

test("classic teaching controller imports the Vite ESM model when available", () => {
  assert.match(source, /TEACHING_CONTROLLER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/teaching-controller-model\/teaching-controller-model\.js/);
  assert.match(source, /function importTeachingControllerModel/);
  assert.match(source, /function currentTeachingControllerModel/);
  assert.match(source, /__homeAiImportTeachingControllerModel/);
});

test("classic teaching controller delegates pure plans and keeps side effects local", () => {
  for (const marker of [
    "teachingStepPlan",
    "teachingDraftPatchPlan",
    "selectedTeachingTaskPlan",
    "teachingCheckSubmitPlan",
    "experienceSignalPlan",
    "stageAssessmentChallengeRequestPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /querySelectorAll/);
  assert.match(source, /addEventListener/);
  assert.match(source, /await api/);
  assert.match(source, /renderLearningCoinsView/);
});

test("Vite config exposes teaching controller model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /teachingControllerModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/teaching-controller-model\.mjs/);
  assert.match(viteConfig, /"teaching-controller-model": teachingControllerModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
