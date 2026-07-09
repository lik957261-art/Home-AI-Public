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

const source = read("public/app-kanban-recorder-ui.js");

test("classic kanban recorder imports the Vite ESM model when available", () => {
  assert.match(source, /KANBAN_RECORDER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/kanban-recorder-model\/kanban-recorder-model\.js/);
  assert.match(source, /function importKanbanRecorderModel/);
  assert.match(source, /function currentKanbanRecorderModel/);
  assert.match(source, /__homeAiImportKanbanRecorderModel/);
});

test("classic kanban recorder delegates pure plans and keeps recorder side effects local", () => {
  for (const marker of [
    "recordingExtensionPlan",
    "recordingFileNamePlan",
    "recordingDurationMsPlan",
    "recordingDurationLabelPlan",
    "recordingPermissionMessagePlan",
    "recordingStatusTextPlan",
    "recordingFinishPlan",
    "recordingErrorPatchPlan",
    "shouldClearSubmittedRecordingPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /new Recorder\(stream/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /renderTodosAfterReadingRecorderChange/);
});

test("Vite config exposes kanban recorder model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /kanbanRecorderModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/kanban-recorder-model\.mjs/);
  assert.match(viteConfig, /"kanban-recorder-model": kanbanRecorderModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
