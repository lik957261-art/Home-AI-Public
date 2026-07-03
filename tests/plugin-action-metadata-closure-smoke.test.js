"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "plugin-action-metadata-closure-smoke.js");

function testJsonSmoke() {
  const run = spawnSync(process.execPath, [scriptPath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.reference.pluginId, "wardrobe");
  assert.equal(payload.reference.actionKind, "wardrobeOutfitWearIntent");
  assert.equal(payload.actionFamilyCount, 3);
  assert.equal(payload.generalizedActionFamilyCount, 2);
  assert.equal(payload.deterministicActionGeneralization.status, "ok");
  assert.equal(payload.failedStageCount, 0);
  assert.equal(payload.actionFamilies.some((family) => family.familyId === "plugin_conversation_repair_request"), true);
  assert.equal(payload.stages.some((stage) => stage.id === "task_card_dispatch_bridge_probe"), true);
  const readback = payload.stages.find((stage) => stage.id === "action_state_readback_probe");
  assert.equal(readback?.ok, true);
  assert.equal(readback?.evidence?.projectedStatus, "stored");
  assert.equal(readback?.evidence?.projectedReadbackVerified, true);
}

function testSingleWardrobeActionStillRuns() {
  const run = spawnSync(process.execPath, [scriptPath, "--action", "wardrobe-outfit-wear-intent", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.actionFamilyCount, 1);
  assert.equal(payload.deterministicActionGeneralization.status, "partial");
  assert.equal(payload.stages.some((stage) => stage.id === "action_bridge_execution_probe"), true);
  assert.equal(payload.stages.some((stage) => stage.id === "action_state_readback_probe"), true);
}

function testUnsupportedActionFailsClosed() {
  const run = spawnSync(process.execPath, [scriptPath, "--action", "unknown", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  const payload = JSON.parse(run.stderr);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /unsupported_plugin_action_metadata_smoke:unknown/);
}

testJsonSmoke();
testSingleWardrobeActionStillRuns();
testUnsupportedActionFailsClosed();
console.log("plugin action metadata closure smoke tests passed");
