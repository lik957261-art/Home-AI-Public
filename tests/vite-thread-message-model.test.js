"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/thread-message-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

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
  await test("thread-message model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/thread-message-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans create-thread actions for the classic adapter", async () => {
    const model = await loadModel();
    assert.deepEqual(model.createThreadActionPlan({
      state: { viewMode: "tasks", currentTaskGroupId: "topic-1" },
      currentSingleWindowLoaded: true,
      mobileLayout: true,
    }), {
      version: model.THREAD_MESSAGE_MODEL_VERSION,
      action: "render_task_root",
      clearQuotedReply: true,
      clearTransientProjectRoute: false,
      clearCurrentTaskGroupId: true,
      closeSidebar: true,
      resetTodoSelection: false,
      resetKanbanComposer: false,
      setTodoCreateOpen: false,
      loadTodos: false,
      loadSingleWindow: false,
      renderThreads: true,
      renderCurrentThread: true,
      renderCurrentThreadOptions: { stickToBottom: true },
      enableComposer: true,
      focusTarget: "composer",
    });
    assert.equal(model.createThreadActionPlan({ state: { viewMode: "single" } }).action, "load_single_window");
    assert.equal(model.createThreadActionPlan({ state: { viewMode: "todos", todoCreateOpen: false } }).resetKanbanComposer, true);
    assert.equal(model.createThreadActionPlan({ state: { viewMode: "projects" } }).action, "load_directory");
  });

  await test("plans select-thread and project-task request routes", async () => {
    const model = await loadModel();
    assert.deepEqual(model.selectThreadRequestPlan("thread 1"), {
      version: model.THREAD_MESSAGE_MODEL_VERSION,
      ok: true,
      threadId: "thread 1",
      path: "/api/threads/thread%201",
      renderOptions: { stickToBottom: true },
    });
    assert.equal(model.selectThreadRequestPlan("").ok, false);
    const projectTask = model.openProjectTaskRequestPlan({
      sourceThreadId: "thread/source",
      taskGroupId: "plugin:wardrobe",
      messageLimit: 12,
    });
    assert.equal(projectTask.ok, true);
    assert.equal(projectTask.path, "/api/threads/thread%2Fsource?messageMode=tasks&taskGroupId=plugin%3Awardrobe&messageLimit=12");
    assert.deepEqual(projectTask.storage, { key: "hermesWebViewMode", value: "tasks" });
  });

  await test("plans composer visibility and placeholder state", async () => {
    const model = await loadModel();
    const taskRoot = model.composerStatePlan({
      state: { viewMode: "tasks", currentTaskGroupId: "", quotedReply: false },
      options: { enabled: true },
      directoryTopicDraft: false,
      searchMode: false,
      chatSearchDraft: "",
      singleWindowView: false,
      singleWindowChatView: false,
    });
    assert.equal(taskRoot.enabled, false);
    assert.equal(taskRoot.hidden, true);
    assert.equal(taskRoot.shouldBlurFocusedEditable, true);
    assert.equal(taskRoot.attachDisabled, true);
    assert.equal(taskRoot.sendDisabled, true);

    const quoted = model.composerStatePlan({
      state: { viewMode: "single", currentTaskGroupId: "topic", quotedReply: true },
      options: { enabled: false, shellLocked: true, placeholder: "Message Home AI..." },
      directoryTopicDraft: false,
      searchMode: false,
      chatSearchDraft: "",
      singleWindowView: true,
      singleWindowChatView: false,
    });
    assert.equal(quoted.shellLocked, true);
    assert.equal(quoted.visuallyEnabled, true);
    assert.equal(quoted.placeholder, "Reply to quoted task...");
    assert.equal(quoted.ariaBusy, "true");

    const search = model.composerStatePlan({
      state: { viewMode: "single", currentTaskGroupId: "", quotedReply: false },
      options: { enabled: false },
      directoryTopicDraft: false,
      searchMode: true,
      chatSearchDraft: "",
    });
    assert.equal(search.placeholder, "搜索聊天");
    assert.equal(search.attachDisabled, false);
    assert.equal(search.sendDisabled, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
