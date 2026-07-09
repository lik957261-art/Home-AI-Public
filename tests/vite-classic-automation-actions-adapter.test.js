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

const source = read("public/app-automation-actions-ui.js");

test("classic automation actions reuse the controller Vite ESM owner model", () => {
  assert.match(source, /function currentAutomationActionsModel/);
  assert.match(source, /currentAutomationControllerModel/);
  assert.doesNotMatch(source, /import\s*\(/);
  assert.doesNotMatch(source, /AUTOMATION_ACTIONS_MODEL_ESM_PATH/);
});

test("classic automation actions delegate pure action plans with fallbacks", () => {
  for (const marker of [
    "automationCreateOpenStatePlan",
    "automationCreateRequestPlan",
    "automationCreateAcceptedStatePlan",
    "automationCreateFinallyPlan",
    "automationEditOpenStatePlan",
    "automationActionRequestPlan",
    "automationPauseActionPlan",
    "automationManualTriggerRequestPlan",
    "automationManualTriggerStatePatchPlan",
    "automationSelectAfterActionPlan",
    "automationDeleteAcceptedStatePlan",
    "automationUpdateFormPlan",
    "automationUpdateAcceptedStatePlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /api\(plan\.url/);
  assert.match(source, /JSON\.stringify\(plan\.request\?\.body \|\| \{\}\)/);
  assert.match(source, /renderAutomationView\(\{ preserveScroll: true \}\)/);
  assert.match(source, /loadAutomations\(\{ detail: "full", refresh: true \}\)/);
  assert.match(source, /async function triggerAutomationJob/);
  assert.match(source, /setAutomationManualTriggerState\(job\.id, "pending"\)/);
  assert.match(source, /setAutomationManualTriggerState\(job\.id, "success", \{ result \}\)/);
  assert.match(source, /setAutomationManualTriggerState\(job\.id, "error", \{ error \}\)/);
  assert.match(source, /invalidateAutomationListCache\(\)/);
});

test("automation controller model exports action planning functions", () => {
  const model = read("src/vite-islands/automation-controller/model.mjs");
  for (const marker of [
    "export function automationCreateOpenStatePlan",
    "export function automationCreateRequestPlan",
    "export function automationActionRequestPlan",
    "export function automationManualTriggerRequestPlan",
    "export function automationManualTriggerStatePatchPlan",
    "export function automationManualTriggerViewPlan",
    "export function automationUpdateFormPlan",
  ]) {
    assert.match(model, new RegExp(marker));
  }
});

if (process.exitCode) process.exit(process.exitCode);
