"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-send-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  let composerText = "hello @ow";
  const messageInput = {
    focused: false,
    focus() {
      this.focused = true;
      calls.push("focusInput");
    },
  };
  const groupMentionMenu = {
    hidden: true,
    innerHTML: "",
  };
  const context = {
    console,
    Promise,
    Date: { now: () => 1000 },
    globalThis: null,
    window: {
      __homeAiImportChatComposerSendUiModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      auth: { isOwner: false },
      conversationPinnedToBottom: false,
      currentTaskGroupId: "",
      currentThread: { id: "thread-1", messages: [{ role: "user", taskGroupId: "task-old" }] },
      currentThreadId: "thread-1",
      groupMentionIndex: 0,
      groupMentionOpen: false,
      groupMentionOptions: [],
      groupMentionToken: null,
      ownerElevationPromptedMessageIds: new Set(),
      ownerElevationRetryingMessageIds: new Set(),
      pendingArtifacts: [{ id: "artifact-1" }],
      pendingTaskDirectory: { projectId: "dir-1" },
      selectedWorkspaceId: "child",
      singleWindowMode: "chat",
      taskDirectoryFilter: { projectId: "dir-1" },
      viewMode: "tasks",
    },
    $: (id) => {
      if (id === "messageInput") return messageInput;
      if (id === "groupMentionMenu") return groupMentionMenu;
      if (id === "connectionState") return { textContent: "" };
      return null;
    },
    clearConversationUserScrollProtection: () => calls.push("clearScrollProtection"),
    clearConversationReadAnchor: () => calls.push("clearReadAnchor"),
    resetComposerSearchSource: () => calls.push("resetSource"),
    clearQuotedReply: () => calls.push("clearQuote"),
    renderPendingArtifacts: () => calls.push("renderArtifacts"),
    renderComposerContext: () => calls.push("renderContext"),
    currentThreadRouteMatches: () => true,
    mergeCurrentThread: (thread) => Object.assign({}, context.state.currentThread, thread),
    mergeTaskListThreadFromThreadUpdate: (thread) => calls.push(["mergeTaskList", thread.id]),
    requestCurrentThreadRefresh: (options) => calls.push(["refresh", options]),
    renderThreads: () => calls.push("renderThreads"),
    renderCurrentThread: (options) => calls.push(["renderCurrentThread", options]),
    isSingleWindowChatView: () => true,
    scheduleConversationBottomStick: () => calls.push("bottomStick"),
    suppressComposerAutoFocus: (ms) => calls.push(["suppressFocus", ms]),
    blurComposerInput: () => calls.push("blurInput"),
    summarizeThread: (thread) => ({ id: thread.id }),
    upsertThreadSummary: (summary) => calls.push(["summary", summary.id]),
    isChatSearchMode: () => false,
    ownerElevationActive: () => false,
    clearOwnerElevationOnce: () => calls.push("clearElevationOnce"),
    normalizeMentionSearch: (value) => String(value || "").toLowerCase(),
    getComposerText: () => composerText,
    setComposerText: (value) => {
      composerText = String(value || "");
      calls.push(["setText", composerText]);
    },
    composerCaretOffset: () => composerText.length,
    composerAiMentionOptions: () => [{ label: "Owner", workspaceId: "owner", mentionText: "@Owner" }],
    groupChatMentionMembers: () => [{ label: "Child", workspaceId: "child", mentionText: "@Child" }],
    isGroupChatView: () => true,
    setComposerCaretOffset: (offset) => calls.push(["caret", offset]),
    updateComposerAction: () => calls.push("updateAction"),
    closeComposerSourceMenu: () => calls.push("closeSourceMenu"),
    escapeHtml: (value) => String(value),
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-send-ui.js" });
  return { calls, context, getComposerText: () => composerText, groupMentionMenu, messageInput };
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
  await test("classic send UI adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_SEND_UI_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-send-ui-model\/chat-composer-send-ui-model\.js/);
    assert.match(source, /__homeAiImportChatComposerSendUiModel/);
    assert.match(source, /currentChatComposerSendUiModel/);
    assert.match(source, /sendResultTaskGroupPlan/);
    assert.match(source, /ownerElevationConfirmMessagePlan/);
    assert.match(source, /activeGroupMentionTokenPlan/);
  });

  await test("classic adapter consumes ESM model for send-result and Owner planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      sendResultViewportResetPlan(input) {
        modelCalls.push(["viewport", input.viewMode]);
        return {
          forceChatStickToBottomMs: 333,
          conversationViewportBottomFollowMs: 222,
          conversationViewportSettleMs: 111,
          suppressChatAutoBottomUntil: 0,
          clearPendingTaskReasoningEffort: true,
          clearPendingTaskReasoningExplicit: true,
        };
      },
      sendResultRoutePlan(input) {
        modelCalls.push(["route", input.expectedThreadId]);
        return { stale: false };
      },
      createdTaskGroupIdFromSendResult(result) {
        modelCalls.push(["created", result.taskGroupId || ""]);
        return "task-from-model";
      },
      latestUserTaskGroupId() {
        modelCalls.push(["latest"]);
        return "task-latest-from-model";
      },
      sendResultTaskGroupPlan(input) {
        modelCalls.push(["task", input.createdTaskGroupId, input.latestTaskGroupId]);
        return {
          nextCurrentTaskGroupId: "task-planned",
          clearPendingTaskDirectory: true,
          clearTaskDirectoryFilter: true,
          refreshRequest: null,
        };
      },
      ownerElevationErrorPlan() {
        modelCalls.push(["elevation_error"]);
        return { offer: true };
      },
      ownerElevationMessagePlan() {
        modelCalls.push(["elevation_message"]);
        return { offer: true };
      },
      ownerElevationConfirmMessagePlan() {
        modelCalls.push(["confirm"]);
        return { message: "model confirmation" };
      },
      ownerElevationComposerAvailablePlan() {
        modelCalls.push(["available"]);
        return { available: true };
      },
    };
    const { calls, context } = createHarness(fakeModel);
    await context.importChatComposerSendUiModel(context.window);

    context.handleSendMessageResult({ thread: { id: "thread-1", messages: [] } }, true, true, {
      threadId: "thread-1",
      routeSnapshot: { currentThreadId: "thread-1" },
    });

    assert.equal(context.importedPath, "/vite-islands/chat-composer-send-ui-model/chat-composer-send-ui-model.js");
    assert.equal(context.state.forceChatStickToBottomUntil, 1333);
    assert.equal(context.state.conversationViewportBottomFollowUntil, 1222);
    assert.equal(context.state.conversationViewportSettleUntil, 1111);
    assert.equal(context.state.pendingTaskDirectory, null);
    assert.equal(context.state.taskDirectoryFilter, null);
    assert.equal(context.state.currentTaskGroupId, "task-planned");
    assert.equal(context.state.pendingArtifacts.length, 0);
    assert.equal(context.shouldOfferOwnerElevation({ elevationRequired: false }), true);
    assert.equal(context.shouldOfferOwnerElevationForMessage({ id: "m1", status: "running" }), true);
    assert.equal(context.ownerElevationConfirmMessage({ elevationScope: "shared_skill_write" }), "model confirmation");
    assert.equal(context.ownerElevationComposerAvailable(), true);
    assert.deepEqual(modelCalls.map((entry) => entry[0]), [
      "viewport",
      "route",
      "created",
      "latest",
      "task",
      "elevation_error",
      "elevation_message",
      "confirm",
      "available",
    ]);
    assert.deepEqual(calls.slice(0, 7), [
      "clearScrollProtection",
      "clearReadAnchor",
      "renderArtifacts",
      "updateAction",
      "renderContext",
      "resetSource",
      "clearQuote",
    ]);
  });

  await test("classic adapter consumes ESM model for mention planning and insertion", async () => {
    const modelCalls = [];
    const fakeModel = {
      ownerElevationComposerAvailablePlan() {
        return { available: true };
      },
      activeGroupMentionTokenPlan(input) {
        modelCalls.push(["token", input.text, input.caret]);
        return { start: 6, end: 9, query: "ow", trigger: "@" };
      },
      mentionOptionsForQueryPlan(input) {
        modelCalls.push(["options", input.query, input.members.length]);
        return { options: [{ label: "Owner", workspaceId: "owner", mentionText: "@Owner" }] };
      },
      chooseGroupMentionTextPlan(input) {
        modelCalls.push(["choose", input.member.workspaceId]);
        return { text: "hello @Owner ", caret: 13 };
      },
      ownerElevationOnceTagInfo() {
        return { present: true };
      },
      stripOwnerElevationOnceTags() {
        return "cleaned";
      },
    };
    const { calls, context, getComposerText, groupMentionMenu, messageInput } = createHarness(fakeModel);
    await context.importChatComposerSendUiModel(context.window);

    assert.deepEqual(context.activeGroupMentionToken(), { start: 6, end: 9, query: "ow", trigger: "@" });
    assert.deepEqual(context.mentionOptionsForQuery("ow").map((item) => item.workspaceId), ["owner"]);
    context.renderGroupMentionMenu();
    assert.equal(groupMentionMenu.hidden, false);
    assert.equal(await context.chooseGroupMention(0), true);
    assert.equal(getComposerText(), "hello @Owner ");
    assert.equal(messageInput.focused, true);
    assert.deepEqual(modelCalls.map((entry) => entry[0]), ["token", "options", "token", "options", "choose"]);
    assert.equal(context.ownerElevationOnceTagInfo("anything").present, true);
    assert.equal(context.stripOwnerElevationOnceTags("anything"), "cleaned");
    assert.ok(calls.some((entry) => Array.isArray(entry) && entry[0] === "caret" && entry[1] === 13));
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { context } = createHarness({});
    context.state.auth = { isOwner: true };
    context.state.selectedWorkspaceId = "owner";
    context.state.viewMode = "single";
    context.state.currentThreadId = "thread-1";
    assert.equal(context.shouldOfferOwnerElevation({ elevationRequired: true }), true);
    assert.equal(context.ownerElevationConfirmMessage({ elevationScope: "owner_high_privilege" }).includes("Owner 高权限"), true);
    assert.equal(context.ownerElevationComposerAvailable(), true);
    assert.equal(context.ownerElevationOnceTagInfo("请 #高权限本次 处理").present, true);
    assert.equal(context.stripOwnerElevationOnceTags("请 #高权限本次 处理"), "请 处理");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
