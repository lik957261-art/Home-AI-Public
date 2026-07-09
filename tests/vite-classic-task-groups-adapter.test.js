"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-groups-ui.js"), "utf8");
const TaskArtifactHelpers = require("../public/app-task-artifact-helpers.js");

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const context = {
    console,
    Promise,
    URLSearchParams,
    Set,
    Map,
    Date,
    TaskArtifactHelpers,
    state: {
      viewMode: "tasks",
      currentTaskGroupId: "topic-1",
      currentThreadId: "thread-1",
      currentThread: {
        id: "thread-1",
        singleWindow: true,
        messages: [
          { id: "m1", taskGroupId: "topic-1", role: "user", content: "hello", createdAt: "2026-01-01T00:00:01Z" },
        ],
        taskGroups: [
          { id: "topic-1", sharedTopic: true, messages: [] },
        ],
      },
      caseTopicThreads: [{ id: "thread-1" }],
      selectedWorkspaceId: "owner",
      auth: { workspaceId: "owner", isOwner: true },
    },
    window: {
      __homeAiImportTaskGroupModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat",
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
    TASK_DETAIL_MESSAGE_INITIAL_LIMIT: 30,
    TASK_DETAIL_MESSAGE_PAGE_LIMIT: 10,
    CHAT_MESSAGE_PAGE_LIMIT: 20,
    isGroupChatView() { return false; },
    isTaskDetailView() { return true; },
    isSingleWindowConversationTaskGroupId(id) { return id === "chat" || id === "group-chat"; },
    messageTimelineTimestamp(message) {
      return message?.submittedAt || message?.updatedAt || message?.createdAt || "";
    },
    messageTaskGroup(message) {
      return { id: message?.taskGroupId || "task", messages: [message] };
    },
    mergeServerMessage(existing, incoming) {
      calls.push(["merge", incoming?.id]);
      return Object.assign({}, existing || {}, incoming || {});
    },
    kanbanStoryCases(items) { return Array.isArray(items) ? items : []; },
    rewriteDirectoryPathsForDisplay(value) { return value; },
    parentDirectoryFromFilePath(value) { return String(value || "").replace(/\/[^/]*$/, ""); },
    directoryActivePath() { return ""; },
    directoryRootForPath() { return ""; },
    hermesAppShellRouteForParams(params) { return `/?${params.toString()}`; },
    location: { pathname: "/", search: "" },
    __calls: calls,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-task-groups-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic task groups adapter declares bounded ESM import path", () => {
    assert.match(source, /TASK_GROUP_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/task-group-model\/task-group-model\.js/);
    assert.match(source, /__homeAiImportTaskGroupModel/);
    assert.match(source, /importTaskGroupModel/);
    assert.match(source, /currentTaskGroupModel/);
    assert.match(source, /taskGroupMessagesForThreadPlan/);
    assert.match(source, /mergeMessagesPagePlan/);
    assert.match(source, /localPendingSendReplacedByIncomingPlan/);
  });

  await test("classic task groups adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      topicGroupVisibleInTaskListPlan(group) {
        modelCalls.push(["visible", group.id]);
        return false;
      },
      currentTaskThreadIsSharedTopicThreadPlan(input) {
        modelCalls.push(["shared-thread", input.currentThreadId]);
        return true;
      },
      selectedSharedTopicGroupPlan(input) {
        modelCalls.push(["selected", input.currentTaskGroupId]);
        return { id: "model-topic", sharedTopic: true };
      },
      messagePageParamsPlan(input) {
        modelCalls.push(["params", input.mode]);
        return [["messageMode", input.mode === "tasks" ? "tasks" : "chat"], ["limit", "7"], ["taskGroupId", "model-task"]];
      },
      mergeMessagesPagePlan(input) {
        modelCalls.push(["merge-page", input.messages.length]);
        return { mode: "tasks", loaded: 99, oldestMessageId: "model-oldest" };
      },
      activeChatRunIdsPlan() {
        modelCalls.push(["runs"]);
        return ["run-model"];
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    assert.equal(vm.runInContext('topicGroupVisibleInTaskList({ id: "case", kanbanCaseId: "case" })', context), false);
    assert.equal(vm.runInContext("currentTaskThreadIsSharedTopicThread()", context), true);
    assert.equal(vm.runInContext("selectedSharedTopicGroup().id", context), "model-topic");
    assert.equal(vm.runInContext('taskMessagePageParams({ taskGroupId: "raw" }).get("taskGroupId")', context), "model-task");
    assert.equal(vm.runInContext("mergeMessagesPage(null, null, [{ id: 'm1' }]).loaded", context), 99);
    assert.deepEqual(vm.runInContext("activeChatRunIds()", context), ["run-model"]);
    assert.deepEqual(modelCalls.map((call) => call[0]), ["visible", "shared-thread", "selected", "params", "merge-page", "runs"]);
  });

  await test("classic task groups fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}));
    assert.equal(vm.runInContext('topicGroupVisibleInTaskList({ kanbanCaseId: "case" })', context), false);
    assert.equal(vm.runInContext("currentTaskThreadIsSharedTopicThread()", context), true);
    assert.equal(vm.runInContext("selectedSharedTopicGroup().id", context), "topic-1");
    assert.equal(vm.runInContext('taskMessagePageParams({ taskGroupId: "fallback" }).get("taskGroupId")', context), "fallback");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
