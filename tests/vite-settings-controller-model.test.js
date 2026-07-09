"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/learning-growth-settings-controller-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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

(async () => {
  await test("settings controller model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/learning-growth-settings-controller-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("settings task open and close patches preserve classic state semantics", async () => {
    const model = await loadModel();
    assert.deepEqual(model.openSettingsTaskPatchPlan(" task-1 "), {
      ok: true,
      patch: {
        learningGrowthSettingsOpen: true,
        learningGrowthActiveTab: "tasks",
        selectedLearningTaskCardId: "",
        learningGrowthSettingsTaskId: "task-1",
      },
    });
    assert.deepEqual(model.openSettingsTaskPatchPlan(" "), { ok: false, patch: {} });
    assert.deepEqual(model.closeSettingsTaskPatchPlan(), {
      learningGrowthSettingsTaskId: "",
      learningGrowthActiveTab: "tasks",
    });
  });

  await test("settings swipe plans gate mobile task-detail back gestures", async () => {
    const model = await loadModel();
    assert.equal(model.settingsSwipeBackAllowedPlan({
      isMobile: true,
      viewMode: "learning",
      settingsOpen: true,
      settingsTaskId: "task-1",
    }), true);
    assert.equal(model.settingsSwipeBackAllowedPlan({
      isMobile: false,
      viewMode: "learning",
      settingsOpen: true,
      settingsTaskId: "task-1",
    }), false);
    const start = model.settingsSwipeStartPlan({
      canSwipeBack: true,
      touchCount: 1,
      targetIsInteractive: false,
      clientX: 10,
      clientY: 20,
      now: 100,
    });
    assert.equal(start.start, true);
    assert.deepEqual(start.swipe, {
      startX: 10,
      startY: 20,
      startedAt: 100,
      dragging: false,
      accepted: false,
    });
    assert.deepEqual(model.settingsSwipeStartPlan({
      canSwipeBack: true,
      touchCount: 1,
      targetIsInteractive: true,
    }), { start: false, clear: true, swipe: null });
  });

  await test("settings swipe move and end plans compute drag transform and close decision", async () => {
    const model = await loadModel();
    const move = model.settingsSwipeMovePlan({
      swipe: { startX: 10, startY: 10, startedAt: 100, dragging: false },
      canSwipeBack: true,
      touchCount: 1,
      clientX: 90,
      clientY: 14,
      now: 180,
    });
    assert.equal(move.apply, true);
    assert.deepEqual(move.patch, { dragging: true, accepted: true });
    assert.equal(move.transform, "translate3d(33.6px, 0, 0)");
    assert.deepEqual(model.settingsSwipeEndPlan({ dragging: true, accepted: true }), {
      clear: true,
      resetStyle: true,
      shouldClose: true,
    });
    assert.deepEqual(model.settingsSwipeCancelPlan({ dragging: true }), {
      clear: true,
      resetStyle: true,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
