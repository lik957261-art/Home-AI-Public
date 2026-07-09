"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-chat-composer-ui.js"), "utf8");

function createElement(id = "") {
  const classes = new Set();
  return {
    id,
    textContent: "",
    disabled: false,
    hidden: false,
    dataset: {},
    attributes: {},
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      },
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    closest(selector) {
      return selector === `#${id}` ? this : null;
    },
  };
}

function createHarness(fakeModel = null) {
  const elements = {
    attachFile: createElement("attachFile"),
    chatSearchNext: createElement("chatSearchNext"),
    chatSearchPrev: createElement("chatSearchPrev"),
    composer: createElement("composer"),
    messageInput: createElement("messageInput"),
    sendMessage: createElement("sendMessage"),
  };
  const calls = [];
  const listeners = {};
  const context = {
    console,
    Promise,
    globalThis: null,
    document: {
      activeElement: elements.messageInput,
      documentElement: {
        classList: { contains: () => false },
      },
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    },
    window: {
      __homeAiImportChatComposerShellModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      actionInboxCreateOpen: false,
      currentTaskGroupId: "",
      currentThread: { singleWindow: true, workspaceId: "owner" },
      selectedWorkspaceId: "owner",
      selectedActionInboxItemId: "",
      selectedAutomationId: "",
      selectedTodoId: "",
      singleWindowMode: "chat",
      skillDetail: null,
      viewMode: "single",
    },
    $: (id) => elements[id] || null,
    selectedWorkspaceInThreadGroup: () => false,
    isChatSearchMode: () => context.chatSearchMode === true,
    composerMentionAvailable: () => context.mentionAvailable !== false,
    closeGroupMentionMenu: () => calls.push("closeMention"),
    updateComposerSourceControl: () => calls.push("sourceControl"),
    currentChatSearchDraft: () => context.chatSearchDraft || "",
    updateChatSearchStatus: () => calls.push("searchStatus"),
    renderComposerContext: () => calls.push("renderContext"),
    refreshVoiceInputSendButton: () => calls.push("refreshVoice"),
    handleVoiceInputSendClick: () => false,
    sendMessage: (event) => {
      calls.push(["sendMessage", event.type]);
      return Promise.resolve();
    },
    voiceInputSetButtonVisualLabel: (button, label) => {
      calls.push(["voiceLabel", label]);
      button.dataset.voiceLabel = label;
    },
    activeComposerRunIds: () => context.activeRunIds || [],
    composerHasDraft: () => context.hasDraft === true,
    openTaskList: () => calls.push("openTaskList"),
    openTodoList: () => calls.push("openTodoList"),
    openAutomationList: () => calls.push("openAutomationList"),
    openActionInboxOverview: () => calls.push("openActionInboxOverview"),
    closeAutomationSecondarySurface: () => calls.push("closeAutomationSecondary"),
    closeSidebar: () => calls.push("closeSidebar"),
    resetSidebarScroll: () => calls.push("resetSidebarScroll"),
    kanbanComposerOpen: () => context.kanbanOpen === true,
    automationDetailInboxReturnActive: () => context.automationInboxReturn === true,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-chat-composer-ui.js" });
  return { calls, context, elements, listeners };
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
  await test("classic composer shell adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_SHELL_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-shell-model\/chat-composer-shell-model\.js/);
    assert.match(source, /__homeAiImportChatComposerShellModel/);
    assert.match(source, /currentChatComposerShellModel/);
    assert.match(source, /composerShellViewStatePlan/);
    assert.match(source, /composerActionViewPlan/);
  });

  await test("classic adapter consumes loaded shell model for search action planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerShellViewStatePlan(input) {
        modelCalls.push(["view", input.state.viewMode]);
        return { singleWindowView: true, singleWindowChatView: true };
      },
      composerStopModePlan(input) {
        modelCalls.push(["stop", input.activeRunIds.length]);
        return { stopMode: false };
      },
      composerActionViewPlan(input) {
        modelCalls.push(["action", input.chatSearchMode, input.chatSearchDraft]);
        return {
          chatSearchMode: true,
          closeMentionMenu: true,
          updateSourceControl: true,
          input: { enterkeyhint: "search", ariaLabel: "Search chat" },
          composerClass: { name: "chat-search-composer", enabled: true },
          inputClass: { name: "chat-search-editor", enabled: true },
          attach: { text: "×", disabled: false, ariaLabel: "关闭搜索", title: "关闭搜索" },
          searchButtons: { hidePrevNext: false },
          button: { label: "搜索", stopMode: false, disabled: false },
          updateChatSearchStatus: true,
          renderComposerContext: true,
          refreshVoiceInputSendButton: true,
        };
      },
    };
    const { calls, context, elements } = createHarness(fakeModel);
    context.chatSearchMode = true;
    context.chatSearchDraft = "needle";
    await context.importChatComposerShellModel(context.window);
    context.updateComposerAction();
    assert.equal(context.importedPath, "/vite-islands/chat-composer-shell-model/chat-composer-shell-model.js");
    assert.equal(elements.composer.classList.contains("chat-search-composer"), true);
    assert.equal(elements.messageInput.attributes.enterkeyhint, "search");
    assert.equal(elements.attachFile.textContent, "×");
    assert.equal(elements.sendMessage.disabled, false);
    assert.deepEqual(calls, [
      "closeMention",
      "sourceControl",
      ["voiceLabel", "搜索"],
      "searchStatus",
      "renderContext",
      "refreshVoice",
    ]);
    assert.deepEqual(modelCalls.map((entry) => entry[0]), ["view", "stop", "action"]);
  });

  await test("classic adapter consumes loaded shell model for sidebar back planning", async () => {
    const fakeModel = {
      composerShellViewStatePlan() {
        return { todoDetailView: false, automationDetailView: false, actionInboxDetailView: false };
      },
      sidebarBackActionPlan() {
        return { action: "open_action_inbox_overview_and_close_sidebar" };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerShellModel(context.window);
    context.sidebarBackToMenu();
    assert.deepEqual(calls, ["openActionInboxOverview", "closeSidebar"]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { context, elements } = createHarness({});
    context.chatComposerShellModel = null;
    context.chatComposerShellModelPromise = null;
    context.activeRunIds = ["run-1"];
    assert.equal(context.isCurrentSingleWindowLoaded(), true);
    assert.equal(context.isSingleWindowChatView(), true);
    assert.equal(context.isComposerStopMode(), true);
    context.updateComposerAction();
    assert.equal(elements.sendMessage.dataset.voiceLabel, "Stop");
    assert.equal(elements.sendMessage.classList.contains("stop-mode"), true);
    assert.equal(elements.sendMessage.disabled, false);
  });

  await test("touch pre-activation submits send before textarea blur can consume the tap", () => {
    const { calls, context, elements } = createHarness({});
    const event = {
      type: "pointerdown",
      pointerType: "touch",
      target: elements.sendMessage,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        calls.push("stopPropagation");
      },
      stopImmediatePropagation() {
        calls.push("stopImmediatePropagation");
      },
    };
    assert.equal(context.composerSendPreActivationEvent(event), true);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(calls.slice(-3), ["stopPropagation", "stopImmediatePropagation", ["sendMessage", "pointerdown"]]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
