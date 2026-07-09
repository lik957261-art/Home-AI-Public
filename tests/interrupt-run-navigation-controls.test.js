"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function makeClassList() {
  const values = new Set();
  return {
    values,
    toggle(name, force) {
      if (force) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createButton() {
  return {
    classList: makeClassList(),
    dataset: {},
    disabled: false,
  };
}

const nodes = {
  interruptRun: createButton(),
};

const context = {
  console,
  state: {
    viewMode: "",
    singleWindowMode: "task",
    currentTaskGroupId: "",
    currentThreadId: "thread_a",
    currentThread: {
      id: "thread_a",
      activeRunIds: ["run_a"],
    },
  },
  $: (id) => nodes[id] || null,
  isTaskDetailView: () => Boolean(context.state.viewMode === "tasks" && context.state.currentTaskGroupId),
  isSingleWindowView: () => context.state.viewMode === "single",
  activeThreadRunIds: (thread) => thread?.activeRunIds || (thread?.activeRunId ? [thread.activeRunId] : []),
  activeChatRunIds: (thread) => thread?.chatActiveRunIds || [],
  activeTaskRunIds: () => context.taskRunIds || [],
};

vm.createContext(context);
vm.runInContext(`${fs.readFileSync(path.join(repoRoot, "public", "app-navigation-search-ui.js"), "utf8")}
globalThis.interruptRunNavigationTestApi = {
  currentVisibleInterruptRunIds,
  syncInterruptRunControl,
};`, context);

const { currentVisibleInterruptRunIds, syncInterruptRunControl } = context.interruptRunNavigationTestApi;

function assertRunIds(actual, expected) {
  assert.deepEqual(Array.from(actual), expected);
}

function resetButton() {
  nodes.interruptRun.classList = makeClassList();
  nodes.interruptRun.dataset = {};
  nodes.interruptRun.disabled = false;
}

resetButton();
context.state.viewMode = "";
context.state.currentThreadId = "thread_a";
context.state.currentThread = { id: "thread_a", activeRunIds: ["run_a"] };
assertRunIds(currentVisibleInterruptRunIds(), ["run_a"]);
assert.equal(syncInterruptRunControl({ showTopMenu: false, chatView: false }), true);
assert.equal(nodes.interruptRun.disabled, false);
assert.equal(nodes.interruptRun.classList.contains("hidden"), false);
assert.equal(nodes.interruptRun.dataset.visibleRunContext, "run_a");

resetButton();
context.state.viewMode = "codex";
context.state.currentThreadId = "thread_a";
context.state.currentThread = { id: "thread_a", activeRunIds: ["run_a"] };
assertRunIds(currentVisibleInterruptRunIds(), []);
assert.equal(syncInterruptRunControl({ showTopMenu: false, chatView: false }), false);
assert.equal(nodes.interruptRun.disabled, true);
assert.equal(nodes.interruptRun.classList.contains("hidden"), true);
assert.equal(nodes.interruptRun.dataset.visibleRunContext, "");

resetButton();
context.state.viewMode = "";
context.state.currentThreadId = "thread_b";
context.state.currentThread = { id: "thread_a", activeRunIds: ["run_a"] };
assertRunIds(currentVisibleInterruptRunIds(), []);
assert.equal(syncInterruptRunControl({ showTopMenu: false, chatView: false }), false);
assert.equal(nodes.interruptRun.disabled, true);
assert.equal(nodes.interruptRun.classList.contains("hidden"), true);

resetButton();
context.state.viewMode = "tasks";
context.state.currentTaskGroupId = "task_a";
context.state.currentThreadId = "thread_a";
context.state.currentThread = { id: "thread_a", activeRunIds: ["thread_run"] };
context.taskRunIds = ["task_run"];
assertRunIds(currentVisibleInterruptRunIds(), ["task_run"]);
assert.equal(syncInterruptRunControl({ showTopMenu: false, chatView: false }), true);
assert.equal(nodes.interruptRun.disabled, false);
assert.equal(nodes.interruptRun.classList.contains("hidden"), false);

resetButton();
context.taskRunIds = [];
assertRunIds(currentVisibleInterruptRunIds(), []);
assert.equal(syncInterruptRunControl({ showTopMenu: false, chatView: false }), false);
assert.equal(nodes.interruptRun.disabled, true);
assert.equal(nodes.interruptRun.classList.contains("hidden"), true);

console.log("interrupt run navigation controls tests passed");
