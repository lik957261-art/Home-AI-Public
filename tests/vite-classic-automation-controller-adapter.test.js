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

const source = read("public/app-automation-controller-ui.js");

test("classic automation controller imports the Vite ESM owner model", () => {
  assert.match(source, /AUTOMATION_CONTROLLER_MODEL_ESM_PATH/);
  assert.match(source, /\/vite-islands\/automation-controller-model\/automation-controller-model\.js/);
  assert.match(source, /function importAutomationControllerModel/);
  assert.match(source, /function currentAutomationControllerModel/);
  assert.match(source, /__homeAiImportAutomationControllerModel/);
});

test("classic automation controller delegates pure plans before fallback logic", () => {
  for (const marker of [
    "automationRequestParamsPlan",
    "automationFullStorageKeyPlan",
    "automationRequestCacheKeyPlan",
    "automationSummaryCacheKeyPlan",
    "automationFullCachePayloadPlan",
    "automationCachedFullStatePlan",
    "automationIsSummaryJobPlan",
    "mergeAutomationJobsPlan",
    "automationPushRefreshPlan",
    "automationStatusLabelPlan",
    "automationStatusTonePlan",
    "automationStatusTextPlan",
    "automationRunTimeMsPlan",
    "automationFailureHasNoFreshDeliverablePlan",
    "automationManualTriggerViewPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
});

test("classic automation controller renders manual trigger entry and bounded status", () => {
  assert.match(source, /function automationManualTriggerEntry/);
  assert.match(source, /function renderAutomationManualTriggerButton/);
  assert.match(source, /function renderAutomationManualTriggerStatus/);
  assert.match(source, /data-automation-trigger/);
  assert.match(source, /triggerAutomationJob\(button\.dataset\.automationTrigger \|\| ""\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /手动触发/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /issueCode/);
  assert.match(source, /replace\(\/\[\^A-Za-z0-9_/);
});

test("Vite config exposes automation controller model as a build input", () => {
  const viteConfig = read("vite.config.js");
  assert.match(viteConfig, /automationControllerModelEntry/);
  assert.match(viteConfig, /src\/vite-islands\/automation-controller\/model\.mjs/);
  assert.match(viteConfig, /"automation-controller-model": automationControllerModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
