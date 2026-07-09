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

const source = read("public/app-learning-reading-ui.js");

test("classic learning reading imports the Vite ESM model when available", () => {
  assert.match(source, /LEARNING_READING_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/learning-reading-model\/learning-reading-model\.js/);
  assert.match(source, /function importLearningReadingModel/);
  assert.match(source, /function currentLearningReadingModel/);
  assert.match(source, /__homeAiImportLearningReadingModel/);
  assert.match(source, /typeof window !== "undefined"/);
});

test("classic learning reading delegates pure plans with classic render fallbacks", () => {
  for (const marker of [
    "learningReadingLabelsPlan",
    "nextReadingCaseTodoPlan",
    "readingWorkflowPlan",
    "readingQuizPanelPlan",
    "readingRecorderControlsPlan",
    "readingSubmissionPanelPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /data-reading-quiz-choice/);
  assert.match(source, /renderLearningGuidancePanel/);
  assert.match(source, /renderAnswerReviewGate/);
  assert.match(source, /escapeHtml/);
});

test("Vite config exposes learning reading model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /learningReadingModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/learning-reading-model\.mjs/);
  assert.match(viteConfig, /"learning-reading-model": learningReadingModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
