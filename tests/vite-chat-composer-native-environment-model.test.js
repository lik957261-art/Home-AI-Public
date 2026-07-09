"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-native-environment-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function expectedLocalTargetAt(baseMs, dayOffset, hour) {
  const target = new Date(baseMs);
  target.setDate(target.getDate() + dayOffset);
  target.setHours(hour, 0, 0, 0);
  return target.toISOString();
}

(async () => {
  const model = await loadModel();

  await test("model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\b/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("bridge availability requires iOS shell, enabled capability, and getContext", () => {
    assert.equal(model.nativeEnvironmentBridgeAvailabilityPlan({
      nativeShellQuery: "ios",
      capabilityEnvironmentContext: true,
      hasGetContext: true,
    }).available, true);
    assert.equal(model.nativeEnvironmentBridgeAvailabilityPlan({
      nativeShellQuery: "ios",
      capabilityEnvironmentContext: true,
      hasGetContext: false,
    }).available, false);
    assert.equal(model.nativeEnvironmentBridgeAvailabilityPlan({
      nativeShellQuery: "",
      capabilityEnvironmentContext: true,
      hasGetContext: true,
    }).available, false);
  });

  await test("target date planning preserves existing Chinese and English intent hints", () => {
    const tomorrowMorning = model.nativeEnvironmentContextTargetAtPlan({
      text: "\u660e\u5929\u65e9\u4e0a\u7a7f\u4ec0\u4e48",
      nowMs: Date.UTC(2026, 6, 4, 2, 30, 0),
    });
    assert.equal(tomorrowMorning.targetAt, expectedLocalTargetAt(Date.UTC(2026, 6, 4, 2, 30, 0), 1, 9));

    const dayAfterEvening = model.nativeEnvironmentContextTargetAtPlan({
      text: "day after tomorrow evening forecast",
      nowMs: Date.UTC(2026, 6, 4, 2, 30, 0),
    });
    assert.equal(dayAfterEvening.targetAt, expectedLocalTargetAt(Date.UTC(2026, 6, 4, 2, 30, 0), 2, 19));
  });

  await test("purpose and request planning match wardrobe and weather send semantics", () => {
    const wardrobePlan = model.createNativeEnvironmentContextRequestPlan({
      body: { taskGroupId: "plugin:wardrobe" },
      text: "\u660e\u5929\u65e9\u4e0a",
      nowMs: Date.UTC(2026, 6, 4, 2, 30, 0),
    });
    assert.equal(wardrobePlan.shouldRequest, true);
    assert.equal(wardrobePlan.purpose, "wardrobe_outfit");
    const expectedTomorrowMorning = expectedLocalTargetAt(Date.UTC(2026, 6, 4, 2, 30, 0), 1, 9);
    assert.deepEqual(wardrobePlan.request, {
      targetAt: expectedTomorrowMorning,
      forceRefresh: false,
      precise: false,
      purpose: "wardrobe_outfit",
    });

    assert.equal(model.createNativeEnvironmentContextRequestPlan({
      body: {},
      text: "forecast for tomorrow",
      nowMs: Date.UTC(2026, 6, 4, 2, 30, 0),
    }).purpose, "general_environment");

    assert.equal(model.createNativeEnvironmentContextRequestPlan({
      body: {},
      text: "hello",
      nowMs: Date.UTC(2026, 6, 4, 2, 30, 0),
    }).shouldRequest, false);
  });

  await test("snapshot planning preserves throttle and upload body contracts", () => {
    assert.equal(model.nativeEnvironmentSnapshotRefreshPlan({
      nowMs: 1000,
      lastUploadedAt: 900,
      intervalMs: 1000,
      forceUpload: false,
    }).shouldRefresh, false);
    assert.equal(model.nativeEnvironmentSnapshotRefreshPlan({
      nowMs: 1000,
      lastUploadedAt: 900,
      intervalMs: 1000,
      forceUpload: true,
    }).shouldRefresh, true);
    assert.equal(model.nativeEnvironmentSnapshotRefreshPlan({
      nowMs: 1000,
      lastUploadedAt: 0,
      intervalMs: 1000,
      inFlight: true,
    }).reason, "in_flight");

    const upload = model.nativeEnvironmentSnapshotUploadBodyPlan({
      workspaceId: "mk",
      context: { temperatureC: 28 },
      purpose: "model_tool_snapshot",
    });
    assert.deepEqual(upload.body, {
      workspaceId: "mk",
      deviceId: "native-ios-current",
      environmentContext: {
        temperatureC: 28,
        purpose: "model_tool_snapshot",
      },
    });
    assert.equal(upload.serializedBody, JSON.stringify(upload.body));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
