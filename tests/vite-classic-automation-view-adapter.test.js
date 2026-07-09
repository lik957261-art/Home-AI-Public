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

test("classic automation view imports the Vite ESM owner model", () => {
  const source = read("public/app-automation-ui.js");
  assert.match(source, /AUTOMATION_VIEW_MODEL_ESM_PATH = "\/vite-islands\/automation-view-model\/automation-view-model\.js"/);
  assert.match(source, /function importAutomationViewModel\(\)/);
  assert.match(source, /function currentAutomationViewModel\(\)/);
  assert.match(source, /function automationViewModelFunction\(name\)/);
});

test("classic automation view delegates pure navigation plans with fallbacks", () => {
  const source = read("public/app-automation-ui.js");
  for (const marker of [
    "automationViewModeFlagsPlan",
    "automationNewThreadPlan",
    "automationThreadSearchPlaceholderPlan",
    "automationLegacyViewRedirectPlan",
    "automationLoadOptionsPlan",
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /state\.viewMode === "capabilities" \? "tasks"/);
  assert.match(source, /state\.automationRouteTargetPending\s*\?\s*\{ detail: "full", refresh: true, ignoreSearch: true, routeTarget: true \}/);
});

test("Vite config exposes automation view model as a build input", () => {
  const config = read("vite.config.js");
  assert.match(config, /automationViewModelEntry/);
  assert.match(config, /"automation-view-model": automationViewModelEntry/);
});

if (process.exitCode) process.exit(process.exitCode);
