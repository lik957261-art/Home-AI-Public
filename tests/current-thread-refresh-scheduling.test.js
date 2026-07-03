"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const timers = new Map();
const refreshCalls = [];
let nextTimerId = 0;
let nowMs = 1000;

const context = {
  console,
  Date: Object.assign(function DateShim(...args) {
    return args.length ? new Date(...args) : new Date(nowMs);
  }, Date, {
    now: () => nowMs,
  }),
  refreshCalls,
  state: {
    viewMode: "single",
    singleWindowMode: "chat",
    currentTaskGroupId: "",
    selectedWorkspaceId: "owner",
    currentThreadId: "thread_refresh",
    currentThread: { id: "thread_refresh" },
    currentThreadRefreshSeq: 0,
    primaryNavigationSeq: 0,
  },
  window: {
    clearTimeout(id) {
      timers.delete(id);
    },
    setTimeout(fn, delay) {
      const id = ++nextTimerId;
      timers.set(id, { fn, delay });
      return id;
    },
  },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-refresh-scheduler.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-composer-current-thread-refresh-ui.js"), "utf8"), context);
vm.runInContext(`
const originalRefreshCurrentThreadFromServer = refreshCurrentThreadFromServer;
refreshCurrentThreadFromServer = (options = {}) => {
  globalThis.refreshCalls.push(options);
  return Promise.resolve();
};
globalThis.refreshSchedulingTestApi = {
  cancelCurrentThreadNavigationRefreshes,
  requestCurrentThreadRefresh,
  originalRefreshCurrentThreadFromServer,
};
`, context);

const {
  cancelCurrentThreadNavigationRefreshes,
  requestCurrentThreadRefresh,
  originalRefreshCurrentThreadFromServer,
} = context.refreshSchedulingTestApi;

function onlyTimer() {
  assert.equal(timers.size, 1);
  const [id, timer] = Array.from(timers.entries())[0];
  return { id, timer };
}

requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 0 });
const immediate = onlyTimer();
assert.equal(immediate.timer.delay, 0);

nowMs += 10;
requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 1800 });
const stillImmediate = onlyTimer();
assert.equal(stillImmediate.id, immediate.id);
assert.equal(stillImmediate.timer.delay, 0);

timers.delete(stillImmediate.id);
stillImmediate.timer.fn();
assert.equal(timers.size, 0);
assert.equal(context.state.currentThreadRefreshDueAt, 0);
assert.equal(refreshCalls.length, 1);
assert.equal(refreshCalls[0].stickToBottom, false);

nowMs += 10;
requestCurrentThreadRefresh({ stickToBottom: true, delayMs: 1800 });
const delayed = onlyTimer();
assert.equal(delayed.timer.delay, 1800);

nowMs += 10;
requestCurrentThreadRefresh({ stickToBottom: false, delayMs: 0 });
const replaced = onlyTimer();
assert.notEqual(replaced.id, delayed.id);
assert.equal(replaced.timer.delay, 0);

cancelCurrentThreadNavigationRefreshes();
assert.equal(timers.size, 0);
assert.equal(context.state.currentThreadRefreshDueAt, 0);

context.state.currentThreadRefreshInFlight = true;
const currentRefreshSeq = context.state.currentThreadRefreshSeq;
context.state.currentThreadRefreshInFlightSeq = currentRefreshSeq;
originalRefreshCurrentThreadFromServer({ delayMs: 0, stickToBottom: false, routeSnapshot: context.currentThreadRouteSnapshot(), refreshSeq: currentRefreshSeq });
originalRefreshCurrentThreadFromServer({ delayMs: 1800, stickToBottom: true, routeSnapshot: context.currentThreadRouteSnapshot(), refreshSeq: currentRefreshSeq });

assert.equal(context.state.currentThreadRefreshPending, true);
assert.equal(context.state.currentThreadRefreshPendingOptions.delayMs, 0);
assert.equal(context.state.currentThreadRefreshPendingOptions.stickToBottom, false);

console.log("current thread refresh scheduling tests passed");
