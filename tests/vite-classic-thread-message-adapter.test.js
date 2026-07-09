"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-thread-message-ui.js"), "utf8");

function createElement() {
  return {
    hidden: false,
    disabled: false,
    dataset: {},
    attributes: {},
    classList: {
      toggles: [],
      toggle(name, enabled) {
        this.toggles.push([name, enabled]);
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const elements = {
    attachFile: createElement(),
    composer: createElement(),
    messageInput: createElement(),
    sendMessage: createElement(),
  };
  const context = {
    console,
    Promise,
    URLSearchParams,
    globalThis: null,
    window: {
      __homeAiImportThreadMessageModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    localStorage: {
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
      },
    },
    state: {
      viewMode: "tasks",
      currentTaskGroupId: "topic-1",
      currentThreadId: "",
      currentThread: null,
      threads: [],
      todoCreateOpen: false,
      selectedTodoId: "todo-1",
      quotedReply: true,
    },
    $: (id) => elements[id] || null,
    api(pathValue) {
      calls.push(["api", pathValue]);
      return Promise.resolve({
        thread: {
          id: "thread-returned",
          messages: [],
        },
      });
    },
    clearQuotedReply: (options) => calls.push(["clearQuotedReply", options]),
    loadSingleWindow: () => {
      calls.push(["loadSingleWindow"]);
      return Promise.resolve();
    },
    loadTodos: () => {
      calls.push(["loadTodos"]);
      return Promise.resolve();
    },
    loadDirectoryView: () => {
      calls.push(["loadDirectoryView"]);
      return Promise.resolve();
    },
    renderAutomationView: () => calls.push(["renderAutomationView"]),
    renderThreads: () => calls.push(["renderThreads"]),
    renderCurrentThread: (options) => calls.push(["renderCurrentThread", options]),
    setComposerEnabled: (enabled) => calls.push(["setComposerEnabled", enabled]),
    finishKanbanComposerProgress: () => calls.push(["finishKanbanComposerProgress"]),
    focusComposerSoon: () => calls.push(["focusComposerSoon"]),
    focusTodoFormSoon: () => calls.push(["focusTodoFormSoon"]),
    closeSidebar: () => calls.push(["closeSidebar"]),
    createDraftThread: () => ({ id: "draft-1", draft: true }),
    isDraftThread: (thread) => Boolean(thread?.draft),
    isMobileLayout: () => true,
    isCurrentSingleWindowLoaded: () => true,
    isDirectoryTopicDraftActive: () => false,
    isChatSearchMode: () => false,
    currentChatSearchDraft: () => "",
    isSingleWindowView: () => true,
    isSingleWindowChatView: () => false,
    mergeCurrentThread: (thread) => Object.assign({ merged: true }, thread),
    summarizeThread: (thread) => ({ id: thread.id, summary: true }),
    taskDetailMessageInitialLimit: () => 12,
    clearKeyboardViewportMetrics: () => calls.push(["clearKeyboardViewportMetrics"]),
    blurFocusedEditableIfStale: (reason) => calls.push(["blurFocusedEditableIfStale", reason]),
    updateComposerAction: () => calls.push(["updateComposerAction"]),
    renderQuotedReply: () => calls.push(["renderQuotedReply"]),
    __calls: calls,
    __elements: elements,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__threadMessageHarness = {
  THREAD_MESSAGE_MODEL_ESM_PATH,
  importThreadMessageModel,
  currentThreadMessageModel,
  createThread,
  selectThread,
  openProjectTask,
  configureComposer,
  composerPlaceholder,
};`, context, { filename: "app-thread-message-ui.js" });
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
  await test("classic thread-message adapter declares bounded ESM import path", () => {
    assert.match(source, /THREAD_MESSAGE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/thread-message-model\/thread-message-model\.js/);
    assert.match(source, /__homeAiImportThreadMessageModel/);
    assert.match(source, /importThreadMessageModel/);
    assert.match(source, /currentThreadMessageModel/);
    assert.match(source, /createThreadActionPlan/);
    assert.match(source, /openProjectTaskRequestPlan/);
    assert.match(source, /composerStatePlan/);
  });

  await test("classic adapter consumes ESM model for task-root create flow", async () => {
    const modelCalls = [];
    const fakeModel = {
      createThreadActionPlan(input) {
        modelCalls.push(["create", input.state.viewMode, input.currentSingleWindowLoaded]);
        return { action: "render_task_root", closeSidebar: true };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadMessageHarness.importThreadMessageModel(context.window);
    await context.__threadMessageHarness.createThread();
    assert.deepEqual(context.__calls.filter((call) => Array.isArray(call) && ["closeSidebar", "renderThreads", "focusComposerSoon"].includes(call[0])).map((call) => call[0]), [
      "closeSidebar",
      "renderThreads",
      "focusComposerSoon",
    ]);
    assert.deepEqual(modelCalls, [["create", "tasks", true]]);
  });

  await test("classic adapter consumes ESM model for select and project task requests", async () => {
    const fakeModel = {
      selectThreadRequestPlan(threadId) {
        return { ok: true, threadId: `model-${threadId}`, path: `/api/model/${threadId}`, renderOptions: { stickToBottom: false } };
      },
      openProjectTaskRequestPlan(input) {
        return {
          ok: true,
          sourceThreadId: input.sourceThreadId,
          taskGroupId: input.taskGroupId,
          viewMode: "tasks",
          storage: { key: "hermesWebViewMode", value: "tasks" },
          path: `/api/model-task/${input.sourceThreadId}/${input.taskGroupId}`,
          renderOptions: { stickToBottom: false },
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadMessageHarness.importThreadMessageModel(context.window);
    await context.__threadMessageHarness.selectThread("thread-1");
    await context.__threadMessageHarness.openProjectTask("thread-2", "topic-2");
    assert.deepEqual(context.__calls.filter((call) => call[0] === "api").map((call) => call[1]), [
      "/api/model/thread-1",
      "/api/model-task/thread-2/topic-2",
    ]);
    assert.equal(context.state.currentThreadId, "thread-2");
    assert.equal(context.state.currentTaskGroupId, "topic-2");
    assert.ok(context.__calls.some((call) => call[0] === "localStorage.setItem" && call[1] === "hermesWebViewMode"));
  });

  await test("classic adapter consumes ESM model for composer state and keeps DOM execution local", async () => {
    const fakeModel = {
      composerStatePlan() {
        return {
          enabled: true,
          hidden: false,
          searchMode: false,
          shellLocked: true,
          visuallyEnabled: true,
          editorEnabled: true,
          shouldHideBeforeUpdate: false,
          shouldShowAfterUpdate: true,
          shouldClearKeyboardViewportMetrics: false,
          shouldBlurFocusedEditable: false,
          ariaBusy: "true",
          placeholder: "Model placeholder",
          attachDisabled: false,
          sendDisabled: false,
        };
      },
      composerPlaceholderPlan() {
        return { placeholder: "Model quoted placeholder" };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadMessageHarness.importThreadMessageModel(context.window);
    context.__threadMessageHarness.configureComposer({ enabled: false });
    assert.equal(context.__elements.messageInput.dataset.placeholder, "Model placeholder");
    assert.equal(context.__elements.attachFile.disabled, false);
    assert.equal(context.__elements.sendMessage.disabled, false);
    assert.equal(context.__elements.composer.attributes["aria-busy"], "true");
    assert.equal(context.__threadMessageHarness.composerPlaceholder("base"), "Model quoted placeholder");
  });

  await test("classic adapter preserves legacy behavior before model load", async () => {
    const context = createHarness(null);
    context.__threadMessageHarness.configureComposer({ enabled: false, hidden: true });
    assert.equal(context.__elements.composer.hidden, true);
    assert.equal(context.__elements.messageInput.dataset.placeholder, "Reply to quoted task...");
    assert.equal(context.__elements.attachFile.disabled, true);
    assert.equal(context.__elements.sendMessage.disabled, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
