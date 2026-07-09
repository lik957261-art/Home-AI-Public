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

const source = read("public/app-shell-ui.js");

test("classic app shell imports the Vite ESM model", () => {
  assert.match(source, /APP_SHELL_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/app-shell-model\/app-shell-model\.js/);
  assert.match(source, /function importAppShellModel/);
  assert.match(source, /function currentAppShellModel/);
  assert.match(source, /__homeAiImportAppShellModel/);
});

test("classic app shell delegates pure helpers with fallbacks", () => {
  for (const marker of [
    "isSingleWindowConversationTaskGroupIdPlan",
    "clamp01Plan",
    "splitConfigListPlan",
    "joinConfigListPlan",
    "workspaceDefaultUsernamePlan",
    "workspaceDefaultsRequestPlan",
    "workspaceDefaultsPatchPlan",
    "formatElapsedDurationPlan",
    "messageDisplayTimestampPlan",
    "messageDisplayTimeLabelPlan",
    "messageTimelineTimestampPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /const result = await api\(`\/api\/workspaces\/defaults\?\$\{params\}`\)/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /TaskArtifactHelpers\.formatBytes/);
  assert.match(source, /TaskArtifactHelpers\.compactDisplayText/);
});

test("Vite config exposes app shell model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /appShellModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/navigation-shell\/app-shell-model\.mjs/);
  assert.match(viteConfig, /"app-shell-model": appShellModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
