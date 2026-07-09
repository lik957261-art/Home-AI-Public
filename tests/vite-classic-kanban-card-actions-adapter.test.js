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

const source = read("public/app-kanban-card-actions-ui.js");

test("classic kanban card actions imports the Vite ESM owner model", () => {
  assert.match(source, /KANBAN_CARD_ACTIONS_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-card-actions-model\/kanban-card-actions-model\.js/);
  assert.match(source, /function importKanbanCardActionsModel/);
  assert.match(source, /function currentKanbanCardActionsModel/);
  assert.match(source, /function kanbanCardActionsModelFunction/);
  assert.match(source, /__homeAiImportKanbanCardActionsModel/);
});

test("classic kanban card actions delegates pure plans with fallbacks", () => {
  for (const marker of [
    "kanbanActionRequestPlan",
    "todoCreatePayloadPlan",
    "learningGrowthProgressRowsPlan",
    "learningGrowthSubmissionSuccessFeedbackPlan",
    "learningGrowthReflectionFeedbackPlan",
    "fallbackLearningGrowthSubmissionSuccessFeedback",
    "fallbackLearningGrowthReflectionFeedback",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("Vite config exposes kanban card actions model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /kanbanCardActionsModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/kanban-card-actions-model\.mjs/);
  assert.match(viteConfig, /"kanban-card-actions-model": kanbanCardActionsModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
