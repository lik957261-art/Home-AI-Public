"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-event-stream-ui.js"), "utf8");

let renderCalls = 0;
let bottomStickCalls = 0;
const state = {
  currentThread: {
    id: "thread_chat",
    messages: [],
  },
  viewMode: "single",
  singleWindowMode: "chat",
  forceChatStickToBottomUntil: 0,
  conversationViewportBottomFollowUntil: 0,
  conversationViewportSettleUntil: 0,
  conversationPinnedToBottom: false,
};

const context = {
  console,
  Date,
  Math,
  state,
  renderCurrentThread(options = {}) {
    renderCalls += 1;
    context.lastRenderOptions = options;
  },
  scheduleConversationBottomStick() {
    bottomStickCalls += 1;
  },
  isSingleWindowChatView() {
    return state.viewMode === "single" && state.singleWindowMode === "chat";
  },
  activeChatTaskGroupId() {
    return "chat-default";
  },
};

vm.createContext(context);
vm.runInContext(`${source}
globalThis.pendingSendTestApi = {
  appendOptimisticSendMessages,
  clearOptimisticSendMessages,
  optimisticSendShouldAppendAssistant,
  sendMessage,
  COMPOSER_SEND_TIMEOUT_MS,
};`, context);

const {
  appendOptimisticSendMessages,
  clearOptimisticSendMessages,
  optimisticSendShouldAppendAssistant,
  sendMessage,
  COMPOSER_SEND_TIMEOUT_MS,
} = context.pendingSendTestApi;

const token = appendOptimisticSendMessages({ messageKind: "ai" }, "hello");
assert.ok(token);
assert.strictEqual(renderCalls, 1);
assert.strictEqual(bottomStickCalls, 1);
assert.strictEqual(state.currentThread.messages.length, 2);
assert.strictEqual(state.currentThread.messages.map((message) => message.role).join(","), "user,assistant");
assert.strictEqual(state.currentThread.messages[0].content, "hello");
assert.strictEqual(state.currentThread.messages[0].taskGroupId, "chat-default");
assert.strictEqual(state.currentThread.messages[1].status, "queued");
assert.strictEqual(state.currentThread.messages[1].taskGroupId, "chat-default");
assert.strictEqual(state.currentThread.messages[1].localPendingSend, true);
assert.strictEqual(state.currentThread.messages[1].localRunProgressEvents[0].event, "run.todo_intake_started");
assert.ok(state.forceChatStickToBottomUntil > 0);

assert.strictEqual(clearOptimisticSendMessages(token, { render: false }), true);
assert.strictEqual(renderCalls, 1);
assert.strictEqual(state.currentThread.messages.length, 0);

const plainToken = appendOptimisticSendMessages({ messageKind: "plain" }, "plain group note");
assert.ok(plainToken);
assert.strictEqual(state.currentThread.messages.length, 1);
assert.strictEqual(state.currentThread.messages[0].role, "user");
assert.strictEqual(optimisticSendShouldAppendAssistant({ messageKind: "plain" }), false);

assert.strictEqual(clearOptimisticSendMessages(plainToken), true);
assert.strictEqual(renderCalls, 3);
assert.strictEqual(state.currentThread.messages.length, 0);

async function runFailedSendRollbackTest() {
  renderCalls = 0;
  bottomStickCalls = 0;
  state.currentThread = { id: "thread_chat", messages: [] };
  state.currentThreadId = "thread_chat";
  state.viewMode = "single";
  state.singleWindowMode = "chat";
  state.pendingArtifacts = [];
  state.selectedWorkspaceId = "owner";
  state.currentTaskGroupId = "";
  state.auth = { isOwner: true, workspaceId: "owner" };
  state.composerComposing = false;
  state.directoryTopicDraftSendInFlight = false;
  let composerText = "send that fails";
  let lastError = "";
  let refreshOptions = null;
  let apiRequest = null;
  let blurCalls = 0;
  let suppressMs = 0;
  const sendButton = { disabled: false };

  Object.assign(context, {
    $(id) {
      if (id === "sendMessage") return sendButton;
      if (id === "messageInput") return { value: composerText, style: {} };
      return { textContent: "" };
    },
    getComposerText() {
      return composerText;
    },
    setComposerText(value) {
      composerText = String(value || "");
    },
    showError(err) {
      lastError = err?.message || String(err);
    },
    isChatSearchMode: () => false,
    isComposerStopMode: () => false,
    loadSingleWindow: async () => {},
    composerAiMentionInfo: () => ({}),
    composerSearchSourceBodyFields: () => null,
    ownerElevationComposerAvailable: () => false,
    ownerElevationActive: () => false,
    clearOwnerElevationOnce: () => {},
    isDraftThread: () => false,
    materializeCurrentThread: async () => {},
    closeGroupMentionMenu: () => {},
    isGroupChatView: () => false,
    selectedComposerReasoningEffort: () => "",
    selectedComposerModel: () => "",
    selectedComposerProvider: () => "",
    activeQuotedReplyForSend: () => null,
    composerRequestSizeError: () => "",
    lockComposerSendToBottom: () => {},
    suppressComposerAutoFocus(ms) {
      suppressMs = ms;
    },
    blurComposerInput() {
      blurCalls += 1;
    },
    shouldOfferOwnerElevation: () => false,
    updateComposerAction: () => {},
    requestCurrentThreadRefresh(options = {}) {
      refreshOptions = options;
    },
    api: async (pathValue, options = {}) => {
      apiRequest = { pathValue, options };
      throw new Error("network down");
    },
    SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat-default",
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
    CHAT_MESSAGE_INITIAL_LIMIT: 80,
    TASK_MESSAGE_INITIAL_LIMIT: 80,
  });

  await sendMessage({ preventDefault() {} });

  assert.strictEqual(apiRequest.pathValue, "/api/threads/thread_chat/messages");
  assert.strictEqual(apiRequest.options.timeoutMs, COMPOSER_SEND_TIMEOUT_MS);
  assert.strictEqual(suppressMs, 1800);
  assert.strictEqual(blurCalls, 1);
  assert.strictEqual(state.currentThread.messages.length, 0);
  assert.strictEqual(composerText, "send that fails");
  assert.strictEqual(lastError, "network down");
  assert.strictEqual(refreshOptions?.stickToBottom, true);
  assert.strictEqual(refreshOptions?.delayMs, 500);
  assert.strictEqual(sendButton.disabled, false);
}

runFailedSendRollbackTest()
  .then(() => {
    console.log("composer send pending feedback tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
