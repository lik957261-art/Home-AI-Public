"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-group-topic-ui.js"), "utf8");

function createOverlay() {
  const listeners = [];
  return {
    innerHTML: "",
    classList: {
      values: new Set(["hidden"]),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
    },
    querySelector(selector) {
      if (selector === "[data-close-group-chat]" || selector === "[data-save-group-chat]") {
        return { addEventListener(event, handler) { listeners.push([selector, event, handler]); } };
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".group-member-option input:checked") return [{ value: "child" }, { value: "owner" }];
      return [];
    },
    __listeners: listeners,
  };
}

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const overlay = createOverlay();
  const context = {
    console,
    Promise,
    URLSearchParams,
    state: {
      selectedWorkspaceId: "owner",
      selectedProjectId: "project",
      selectedSubprojectId: "sub",
      groupChatManagerOpen: true,
      groupChatMemberDraft: ["child"],
      auth: { isOwner: true },
      currentThread: {
        id: "thread/1",
        workspaceId: "owner",
        chatGroup: {
          enabled: true,
          members: [
            { workspaceId: "owner", label: "Owner" },
            { workspaceId: "child", label: "Child" },
          ],
        },
      },
      workspaces: [
        { id: "owner", label: "Owner" },
        { id: "child", label: "Child" },
      ],
      threads: [],
      caseTopicThreads: [{ id: "case-topic" }],
      kanbanTopicCardSnapshotLoading: false,
      kanbanTopicCardSnapshotLoadedAt: 0,
      viewMode: "tasks",
      currentTaskGroupId: "",
    },
    window: {
      __homeAiImportGroupTopicModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
      setTimeout(callback) {
        calls.push(["setTimeout"]);
        callback();
        return 1;
      },
    },
    $(id) { return id === "groupChatOverlay" ? overlay : null; },
    threadGroupMemberIds(thread) {
      return (thread?.chatGroup?.members || []).map((member) => member.workspaceId).filter(Boolean);
    },
    currentSearchText() { return "receipt"; },
    escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;"); },
    api(pathValue, options) {
      calls.push(["api", pathValue, options]);
      if (pathValue.startsWith("/api/threads?")) return Promise.resolve({ data: [{ id: "thread-list" }] });
      if (pathValue === "/api/single-window") return Promise.resolve({ caseTopicThreads: [{ id: "topic-1" }] });
      if (pathValue.startsWith("/api/kanban/cards?")) return Promise.resolve({ items: [{ id: "card-1" }] });
      if (pathValue.includes("/group-chat")) return Promise.resolve({ thread: { id: "thread/1", workspaceId: "owner" } });
      return Promise.resolve({});
    },
    updateSearchButton() { calls.push(["updateSearchButton"]); },
    renderThreads() { calls.push(["renderThreads"]); },
    renderCurrentThread(options) { calls.push(["renderCurrentThread", options]); },
    closeTopMoreMenu() { calls.push(["closeTopMoreMenu"]); },
    isGroupChatView() { return true; },
    toggleGroupChat() { calls.push(["toggleGroupChat"]); return Promise.resolve(); },
    closeGroupChatManager: undefined,
    showError(error) { throw error; },
    mergeCurrentThread(thread) { return Object.assign({ merged: true }, thread); },
    summarizeThread(thread) { return { id: thread.id, summary: true }; },
    isKanbanTodoSource() { return true; },
    boardCollectionApiPath() { return "/api/kanban/cards"; },
    applyTodoListResult(result, includeCompleted, workspaceId) {
      calls.push(["applyTodoListResult", result.items?.length || 0, includeCompleted, workspaceId]);
    },
    Date,
    KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS: 30000,
    __calls: calls,
    __overlay: overlay,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-group-topic-ui.js" });
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
  await test("classic group topic adapter declares bounded ESM import path", () => {
    assert.match(source, /GROUP_TOPIC_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/group-topic-model\/group-topic-model\.js/);
    assert.match(source, /__homeAiImportGroupTopicModel/);
    assert.match(source, /importGroupTopicModel/);
    assert.match(source, /currentGroupTopicModel/);
    assert.match(source, /groupChatManagerViewPlan/);
    assert.match(source, /threadListQueryPlan/);
    assert.match(source, /kanbanTopicCardSnapshotSchedulePlan/);
  });

  await test("classic group topic adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      groupChatManagerViewPlan(input) {
        modelCalls.push(["manager", input.open]);
        return {
          hidden: false,
          fixedOwnerId: "owner",
          selectedIds: ["owner", "child"],
          canEdit: true,
          subtitle: "Model subtitle",
          showSave: true,
          rows: [
            { id: "owner", label: "Owner", checked: true, disabled: true },
            { id: "child", label: "Child", checked: true, disabled: false },
          ],
        };
      },
      groupChatMemberSavePlan(input) {
        modelCalls.push(["save", input.threadId]);
        return {
          path: "/api/threads/thread%2F1/group-chat",
          method: "PATCH",
          body: { memberWorkspaceIds: ["owner", "child"] },
          serializedBody: JSON.stringify({ enabled: true, memberWorkspaceIds: ["owner", "child"] }),
        };
      },
      threadListQueryPlan(input) {
        modelCalls.push(["threads", input.search]);
        return { entries: [["workspaceId", "owner"], ["search", "receipt"]] };
      },
      caseTopicRefreshRequestPlan(input) {
        modelCalls.push(["case", input.workspaceId]);
        return { path: "/api/single-window", method: "POST", serializedBody: JSON.stringify({ workspaceId: "owner", messageMode: "tasks" }) };
      },
      kanbanTopicCardSnapshotRequestPlan(input) {
        modelCalls.push(["snapshot", input.caseTopicThreadCount]);
        return {
          shouldRequest: true,
          workspaceId: "owner",
          boardCollectionPath: "/api/kanban/cards",
          entries: [["workspaceId", "owner"], ["limit", "500"], ["includeCompleted", "1"], ["scope", "mine"]],
        };
      },
      kanbanTopicCardSnapshotSchedulePlan(input) {
        modelCalls.push(["schedule", input.caseTopicThreadCount]);
        return { shouldSchedule: true, delayMs: 0, shouldRenderAfterRefresh: true };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    vm.runInContext("renderGroupChatManager()", context);
    assert.match(context.__overlay.innerHTML, /Model subtitle/);
    await vm.runInContext("saveGroupChatMembers()", context);
    await vm.runInContext("loadThreads()", context);
    await vm.runInContext("refreshCaseTopicThreadsForWorkspace()", context);
    vm.runInContext("scheduleKanbanTopicCardSnapshotRefresh({ force: true })", context);
    await flushImport();

    assert.ok(context.__calls.some((call) => call[0] === "api" && call[1] === "/api/threads/thread%2F1/group-chat"));
    assert.ok(context.__calls.some((call) => call[0] === "api" && call[1] === "/api/threads?workspaceId=owner&search=receipt"));
    assert.ok(context.__calls.some((call) => call[0] === "applyTodoListResult"));
    assert.deepEqual(modelCalls.map((call) => call[0]), ["manager", "save", "manager", "threads", "case", "schedule", "snapshot"]);
  });

  await test("classic group topic fallback remains usable before ESM model loads", async () => {
    const context = createHarness(null, () => new Promise(() => {}));
    vm.runInContext("renderGroupChatManager()", context);
    assert.match(context.__overlay.innerHTML, /群聊成员/);
    await vm.runInContext("loadThreads()", context);
    assert.ok(context.__calls.some((call) => call[0] === "api" && call[1] === "/api/threads?workspaceId=owner&projectId=project&subprojectId=sub&search=receipt"));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
