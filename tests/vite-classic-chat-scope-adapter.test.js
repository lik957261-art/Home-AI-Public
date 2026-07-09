"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-chat-scope-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatScopeModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    localStorage: {
      values: new Map(),
      getItem(key) {
        calls.push(["localStorage.getItem", key]);
        return this.values.get(key) || "0";
      },
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
        this.values.set(key, value);
      },
    },
    state: {
      selectedWorkspaceId: "owner",
      auth: { isOwner: false, workspaceId: "owner" },
      groupChatOpen: true,
      groupChatAvailable: false,
      workspaces: [
        { id: "owner", label: "Owner" },
        { id: "kid", label: "Kid" },
      ],
      currentThread: {
        id: "thread-1",
        singleWindow: true,
        workspaceId: "owner",
        chatGroup: {
          enabled: true,
          memberWorkspaceIds: ["owner", "kid"],
        },
        messages: [],
      },
      groupChatThread: null,
      groupChatThreadId: "",
      privateChatThread: null,
    },
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
    SINGLE_WINDOW_CHAT_TASK_GROUP_ID: "chat",
    CHAT_SCOPE_SESSION_STARTED_AT: 100,
    isSingleWindowChatView: () => true,
    messageTimelineTimestamp: (message) => message.timestamp || "",
    messageOwnerWorkspaceId: (message) => message.ownerWorkspaceId || "",
    chatMessagesForThread: (thread, taskGroupId) => (thread?.messages || []).filter((message) => message.taskGroupId === taskGroupId),
    assistantDisplayLabel: () => "Home AI",
    virtualAssistantMember: () => ({ workspaceId: "assistant", label: "Home AI" }),
    mergeMessagesPage: (_existingPage, incomingPage) => incomingPage,
    mergeServerMessage: (_existing, incoming) => incoming,
    localPendingSendReplacedByIncoming: () => false,
    shouldPreserveMessageOutsideIncomingPage: () => true,
    sortedThreadMessages: (messages) => [...messages].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    activeChatTaskGroupId: () => "chat",
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__chatScopeHarness = {
  CHAT_SCOPE_MODEL_ESM_PATH,
  importChatScopeModel,
  currentChatScopeModel,
  threadGroupMemberIds,
  isThreadGroupChat,
  selectedWorkspaceInThreadGroup,
  currentUserCanUseGroupChatThread,
  isGroupChatView,
  groupChatSelectable,
  chatScopeTaskGroupId,
  activeChatScope,
  chatScopeReadStorageKey,
  chatScopeMessageTimeMs,
  chatScopeReadAt,
  setChatScopeReadAt,
  isOwnChatScopeMessage,
  unreadChatScopeCount,
  groupChatMemberLabels,
  groupChatMentionMembers,
};`, context, { filename: "app-chat-scope-ui.js" });
  return context;
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
  await test("classic chat-scope adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_SCOPE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-scope-model\/chat-scope-model\.js/);
    assert.match(source, /__homeAiImportChatScopeModel/);
    assert.match(source, /importChatScopeModel/);
    assert.match(source, /currentChatScopeModel/);
    assert.match(source, /threadGroupMemberIdsPlan/);
    assert.match(source, /chatScopeReadStorageKeyPlan/);
    assert.match(source, /unreadChatScopeCountPlan/);
  });

  await test("classic adapter consumes ESM model for scope and read plans", async () => {
    const modelCalls = [];
    const fakeModel = {
      threadGroupMemberIdsPlan() {
        modelCalls.push(["threadGroupMemberIdsPlan"]);
        return { memberIds: ["owner", "kid"] };
      },
      isThreadGroupChatPlan() {
        modelCalls.push(["isThreadGroupChatPlan"]);
        return { groupChat: true };
      },
      selectedWorkspaceInThreadGroupPlan() {
        modelCalls.push(["selectedWorkspaceInThreadGroupPlan"]);
        return { selected: true };
      },
      currentUserCanUseGroupChatThreadPlan() {
        modelCalls.push(["currentUserCanUseGroupChatThreadPlan"]);
        return { canUse: true };
      },
      groupChatViewPlan() {
        modelCalls.push(["groupChatViewPlan"]);
        return { groupChatView: true };
      },
      chatScopeTaskGroupIdPlan(input) {
        modelCalls.push(["chatScopeTaskGroupIdPlan", input.scope]);
        return { taskGroupId: input.scope === "group" ? "group-chat" : "chat" };
      },
      activeChatScopePlan() {
        modelCalls.push(["activeChatScopePlan"]);
        return { scope: "group" };
      },
      chatScopeReadStorageKeyPlan(input) {
        modelCalls.push(["chatScopeReadStorageKeyPlan", input.scope]);
        return { key: "model-key" };
      },
      chatScopeReadAtPlan(input) {
        modelCalls.push(["chatScopeReadAtPlan", input.storedValue]);
        return { readAt: 321 };
      },
      setChatScopeReadAtPlan(input) {
        modelCalls.push(["setChatScopeReadAtPlan", input.value]);
        return { timestamp: 654, shouldWrite: true, storage: { key: "model-key", value: "654" } };
      },
    };
    const context = createHarness(fakeModel);
    await context.__chatScopeHarness.importChatScopeModel(context.window);
    assert.equal(context.__chatScopeHarness.isGroupChatView(), true);
    assert.equal(context.__chatScopeHarness.activeChatScope(), "group");
    assert.equal(context.__chatScopeHarness.chatScopeReadStorageKey("group"), "model-key");
    assert.equal(context.__chatScopeHarness.chatScopeReadAt("group"), 321);
    context.__chatScopeHarness.setChatScopeReadAt("group", 654);
    assert.ok(modelCalls.some((call) => call[0] === "groupChatViewPlan"));
    assert.ok(context.__calls.some((call) => call[0] === "localStorage.setItem" && call[1] === "model-key" && call[2] === "654"));
  });

  await test("classic adapter consumes ESM model for unread and member projections", async () => {
    const fakeModel = {
      chatScopeTaskGroupIdPlan(input) {
        return { taskGroupId: input.scope === "group" ? "group-chat" : "chat" };
      },
      chatScopeMessageTimeMsPlan(input) {
        return { timeMs: Date.parse(input.timestamp) || 0 };
      },
      chatScopeReadStorageKeyPlan() {
        return { key: "read-key" };
      },
      chatScopeReadAtPlan() {
        return { readAt: 10 };
      },
      isOwnChatScopeMessagePlan(input) {
        return { own: input.ownerWorkspaceId === input.selectedWorkspaceId };
      },
      unreadChatScopeCountPlan(input) {
        return { count: input.messages.filter((message) => message.timeMs > input.readAt && !message.own).length };
      },
      groupChatMemberLabelsPlan() {
        return { labels: ["Owner", "Kid", "Home AI"] };
      },
      groupChatMentionMembersPlan() {
        return { members: [{ workspaceId: "assistant", label: "Home AI" }, { workspaceId: "kid", label: "Kid" }] };
      },
    };
    const context = createHarness(fakeModel);
    context.state.groupChatThread = {
      id: "thread-1",
      singleWindow: true,
      chatGroup: context.state.currentThread.chatGroup,
      messages: [
        { id: "m1", taskGroupId: "group-chat", timestamp: "1970-01-01T00:00:00.011Z", role: "user", ownerWorkspaceId: "owner" },
        { id: "m2", taskGroupId: "group-chat", timestamp: "1970-01-01T00:00:00.012Z", role: "user", ownerWorkspaceId: "kid" },
      ],
    };
    await context.__chatScopeHarness.importChatScopeModel(context.window);
    assert.equal(context.__chatScopeHarness.unreadChatScopeCount(context.state.groupChatThread, "group"), 1);
    assert.deepEqual(context.__chatScopeHarness.groupChatMemberLabels(context.state.currentThread), ["Owner", "Kid", "Home AI"]);
    assert.equal(JSON.stringify(context.__chatScopeHarness.groupChatMentionMembers(context.state.currentThread).map((member) => member.workspaceId)), JSON.stringify(["assistant", "kid"]));
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    assert.equal(JSON.stringify(context.__chatScopeHarness.threadGroupMemberIds(context.state.currentThread)), JSON.stringify(["owner", "kid"]));
    assert.equal(context.__chatScopeHarness.isThreadGroupChat(context.state.currentThread), true);
    assert.equal(context.__chatScopeHarness.currentUserCanUseGroupChatThread(context.state.currentThread), true);
    assert.equal(context.__chatScopeHarness.chatScopeTaskGroupId("group"), "group-chat");
    assert.equal(context.__chatScopeHarness.chatScopeReadStorageKey("group"), "hermesChatScopeRead:owner:group:group-chat");
    assert.equal(JSON.stringify(context.__chatScopeHarness.groupChatMentionMembers(context.state.currentThread).map((member) => member.workspaceId)), JSON.stringify(["assistant", "kid"]));
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
