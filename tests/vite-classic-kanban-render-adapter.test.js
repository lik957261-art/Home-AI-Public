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

test("classic kanban render imports the Vite ESM model", () => {
  const source = read("public/app-kanban-render-ui.js");
  assert.match(source, /KANBAN_RENDER_MODEL_ESM_PATH = "\/vite-islands\/kanban-render-model\/kanban-render-model\.js"/);
  assert.match(source, /function importKanbanRenderModel\(\)/);
  assert.match(source, /function currentKanbanRenderModel\(\)/);
  assert.match(source, /function kanbanRenderModelFunction\(name\)/);
  assert.match(source, /__homeAiImportKanbanRenderModel/);
});

test("classic kanban render delegates pure view plans with fallbacks", () => {
  const source = read("public/app-kanban-render-ui.js");
  for (const marker of [
    "kanbanComposerMessagePlan",
    "kanbanPlanDependencyLabels",
    "kanbanPlanDraftViewPlan",
    "kanbanReasoningOptionPlans",
    "kanbanMultiAgentControlsPlan",
    "kanbanComposerProgressPlan",
    "kanbanComposerModePlan",
    "kanbanComposerPanelModePlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /modelFn\(TASK_REASONING_OPTIONS, configuredReasoningOptions\(\), selected, defaultReasoningLabel\(\)\)/);
  assert.match(source, /modelFn\(plan, \{\s*maxParallel,/);
  assert.match(source, /modelFn\(\{\s*busy: state\.kanbanComposerBusy,/);
  assert.match(source, /modePlan\?\.submitLabel/);
});

test("Vite config exposes kanban render model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /kanbanRenderModelEntry/);
  assert.match(config, /"kanban-render-model": kanbanRenderModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
