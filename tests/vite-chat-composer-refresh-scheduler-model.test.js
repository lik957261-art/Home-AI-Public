"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-refresh-scheduler-model.mjs");

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("composer refresh scheduler model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_REFRESH_SCHEDULER_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("normalizes refresh delay and due-at plans", () => {
    assert.equal(model.composerRefreshDelayMsPlan({ options: { delayMs: 0 } }).delayMs, 0);
    assert.equal(model.composerRefreshDelayMsPlan({ options: { delayMs: "40" } }).delayMs, 40);
    assert.equal(model.composerRefreshDelayMsPlan({ options: { delayMs: -20 } }).delayMs, 0);
    assert.equal(model.composerRefreshDelayMsPlan({ options: { delayMs: Number.NaN } }).delayMs, 120);
    assert.equal(model.composerRefreshDelayMsPlan({ options: {} }).delayMs, 120);
    assert.equal(model.composerRefreshTimerDueAtPlan({ nowMs: 1000, options: { delayMs: 80 } }).dueAt, 1080);
    assert.equal(model.composerRefreshTimerDueAtPlan({ nowMs: Number.NaN, options: { delayMs: 80 } }).dueAt, 80);
  });

  await test("plans scheduled and pending refresh retention", () => {
    assert.equal(model.composerKeepScheduledRefreshPlan({
      state: { currentThreadRefreshTimer: 7, currentThreadRefreshDueAt: 1000 },
      dueAt: 1100,
    }).keep, true);
    assert.equal(model.composerKeepScheduledRefreshPlan({
      state: { currentThreadRefreshTimer: 7, currentThreadRefreshDueAt: 1200 },
      dueAt: 1100,
    }).keep, false);
    assert.equal(model.composerKeepPendingRefreshPlan({
      state: {
        currentThreadRefreshPending: true,
        currentThreadRefreshPendingOptions: { delayMs: 0 },
      },
      options: { delayMs: 1800 },
    }).keep, true);
    assert.equal(model.composerKeepPendingRefreshPlan({
      state: {
        currentThreadRefreshPending: true,
        currentThreadRefreshPendingOptions: { delayMs: 1800 },
      },
      options: { delayMs: 0 },
    }).keep, false);
  });

  await test("bounds pending refresh delay", () => {
    assert.equal(model.composerPendingRefreshDelayPlan({ options: { delayMs: 0 }, maxDelayMs: 180 }).delayMs, 0);
    assert.equal(model.composerPendingRefreshDelayPlan({ options: { delayMs: 1200 }, maxDelayMs: 180 }).delayMs, 180);
    assert.equal(model.composerPendingRefreshDelayPlan({ options: { delayMs: 1200 }, maxDelayMs: "90" }).delayMs, 90);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
