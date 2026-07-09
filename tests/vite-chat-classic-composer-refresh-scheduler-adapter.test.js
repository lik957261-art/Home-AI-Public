"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-refresh-scheduler.js"), "utf8");

function createHarness(fakeModel = null) {
  const context = {
    console,
    Promise,
    globalThis: null,
    __homeAiImportChatComposerRefreshSchedulerModel(importPath) {
      context.importedPath = importPath;
      return Promise.resolve(fakeModel);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-refresh-scheduler.js" });
  return context;
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
  await test("classic refresh scheduler declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-refresh-scheduler-model\/chat-composer-refresh-scheduler-model\.js/);
    assert.match(source, /__homeAiImportChatComposerRefreshSchedulerModel/);
    assert.match(source, /currentChatComposerRefreshSchedulerModel/);
    assert.match(source, /composerRefreshDelayMsPlan/);
    assert.match(source, /composerRefreshTimerDueAtPlan/);
    assert.match(source, /composerKeepScheduledRefreshPlan/);
    assert.match(source, /composerPendingRefreshDelayPlan/);
  });

  await test("classic adapter uses loaded ESM model for scheduler methods", async () => {
    const fakeModel = {
      composerRefreshDelayMsPlan() {
        return { delayMs: 11 };
      },
      composerRefreshTimerDueAtPlan() {
        return { dueAt: 22 };
      },
      composerKeepScheduledRefreshPlan() {
        return { keep: true };
      },
      composerKeepPendingRefreshPlan() {
        return { keep: true };
      },
      composerPendingRefreshDelayPlan() {
        return { delayMs: 33 };
      },
    };
    const context = createHarness(fakeModel);
    const scheduler = context.ComposerRefreshScheduler;
    await scheduler.importChatComposerRefreshSchedulerModel(context);

    assert.equal(context.importedPath, "/vite-islands/chat-composer-refresh-scheduler-model/chat-composer-refresh-scheduler-model.js");
    assert.equal(scheduler.refreshDelayMs({ delayMs: 100 }), 11);
    assert.equal(scheduler.timerDueAt(1000, { delayMs: 100 }), 22);
    assert.equal(scheduler.shouldKeepScheduledRefresh({}, 1000), true);
    assert.equal(scheduler.shouldKeepPendingRefresh({}, { delayMs: 100 }), true);
    assert.equal(scheduler.pendingDelayMs({ delayMs: 100 }, 180), 33);
  });

  await test("classic fallback remains available before ESM model loads", () => {
    const context = createHarness(null);
    const scheduler = context.ComposerRefreshScheduler;

    assert.equal(scheduler.refreshDelayMs({ delayMs: "40" }), 40);
    assert.equal(scheduler.timerDueAt(1000, { delayMs: 80 }), 1080);
    assert.equal(scheduler.shouldKeepScheduledRefresh({
      currentThreadRefreshTimer: 7,
      currentThreadRefreshDueAt: 1000,
    }, 1100), true);
    assert.equal(scheduler.shouldKeepPendingRefresh({
      currentThreadRefreshPending: true,
      currentThreadRefreshPendingOptions: { delayMs: 0 },
    }, { delayMs: 1800 }), true);
    assert.equal(scheduler.pendingDelayMs({ delayMs: 1200 }, 180), 180);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
