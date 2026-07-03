"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-refresh-scheduler.js"), "utf8"), context);

const scheduler = context.ComposerRefreshScheduler;
assert.ok(scheduler, "ComposerRefreshScheduler should be registered");

assert.equal(scheduler.refreshDelayMs({ delayMs: 0 }), 0);
assert.equal(scheduler.refreshDelayMs({ delayMs: "40" }), 40);
assert.equal(scheduler.refreshDelayMs({ delayMs: -20 }), 0);
assert.equal(scheduler.refreshDelayMs({ delayMs: Number.NaN }), 120);
assert.equal(scheduler.refreshDelayMs({}), 120);

assert.equal(scheduler.timerDueAt(1000, { delayMs: 80 }), 1080);
assert.equal(scheduler.timerDueAt(Number.NaN, { delayMs: 80 }), 80);

assert.equal(scheduler.shouldKeepScheduledRefresh({
  currentThreadRefreshTimer: 7,
  currentThreadRefreshDueAt: 1000,
}, 1100), true);
assert.equal(scheduler.shouldKeepScheduledRefresh({
  currentThreadRefreshTimer: 7,
  currentThreadRefreshDueAt: 1200,
}, 1100), false);
assert.equal(scheduler.shouldKeepScheduledRefresh({
  currentThreadRefreshTimer: 0,
  currentThreadRefreshDueAt: 1000,
}, 1100), false);

assert.equal(scheduler.shouldKeepPendingRefresh({
  currentThreadRefreshPending: true,
  currentThreadRefreshPendingOptions: { delayMs: 0 },
}, { delayMs: 1800 }), true);
assert.equal(scheduler.shouldKeepPendingRefresh({
  currentThreadRefreshPending: true,
  currentThreadRefreshPendingOptions: { delayMs: 1800 },
}, { delayMs: 0 }), false);
assert.equal(scheduler.shouldKeepPendingRefresh({}, { delayMs: 0 }), false);

assert.equal(scheduler.pendingDelayMs({ delayMs: 0 }, 180), 0);
assert.equal(scheduler.pendingDelayMs({ delayMs: 1200 }, 180), 180);
assert.equal(scheduler.pendingDelayMs({ delayMs: 1200 }, "90"), 90);

console.log("composer refresh scheduler tests passed");
