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

const source = read("public/app-kanban-list-ui.js");

test("classic kanban list imports the Vite ESM model", () => {
  assert.match(source, /KANBAN_LIST_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-list-model\/kanban-list-model\.js/);
  assert.match(source, /function importKanbanListModel/);
  assert.match(source, /function currentKanbanListModel/);
  assert.match(source, /__homeAiImportKanbanListModel/);
});

test("classic kanban list delegates pure view plans with fallbacks", () => {
  for (const marker of [
    "kanbanTabCountPlan",
    "todoKanbanCardViewPlan",
    "dedupeKanbanOutputsPlan",
    "kanbanCardOutputsPlan",
    "shouldAutoLoadKanbanDetailPlan",
    "kanbanProcessRowsPlan",
    "kanbanDetailReportPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /fetch\(url, \{ headers \}\)/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /escapeHtml/);
});

test("Vite config exposes kanban list model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /kanbanListModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/kanban-list-model\.mjs/);
  assert.match(viteConfig, /"kanban-list-model": kanbanListModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
