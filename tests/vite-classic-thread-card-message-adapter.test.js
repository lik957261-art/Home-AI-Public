"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-thread-card-message-ui.js"), "utf8");

function createClassList(hidden = false) {
  const values = new Set(hidden ? ["hidden"] : []);
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createElement(id = "") {
  return {
    id,
    innerHTML: "",
    className: "",
    dataset: {},
    disabled: false,
    classList: createClassList(true),
    listeners: [],
    querySelector() {
      return {
        addEventListener: (type, handler) => this.listeners.push([type, handler]),
      };
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      this.listeners.push([type, handler]);
    },
    insertBefore(child) {
      this.child = child;
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const elements = {
    composer: createElement("composer"),
    messageInput: createElement("messageInput"),
    quotedReply: createElement("quotedReply"),
  };
  elements.quotedReply.classList = createClassList(false);
  const groups = [
    { id: "task-1", title: "Task One", summary: "Group summary", sharedTopic: true },
    { id: "group-chat" },
  ];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportThreadCardMessageModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    document: {
      createElement(tag) {
        calls.push(["createElement", tag]);
        return createElement();
      },
    },
    state: {
      viewMode: "single",
      selectedWorkspaceId: "workspace-1",
      auth: { workspaceId: "workspace-2", isOwner: false },
      currentThreadId: "thread-1",
      currentThread: { id: "thread-1", messages: [], taskGroups: groups },
      quotedReply: null,
    },
    SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-chat",
    GROUP_REVOKE_LABEL: "撤回",
    GROUP_MESSAGE_REVOKED_TEXT: "Message revoked",
    $: (id) => elements[id] || null,
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    },
    latestTaskListDocument: () => null,
    artifactKind: () => "text",
    artifactHref: () => "/artifact",
    artifactDisplayName: () => "Artifact",
    iconForArtifact: () => "A",
    renderArtifactDirectoryButton: () => "<button>Dir</button>",
    renderTaskDirectoryBadges: () => "<span>Badges</span>",
    taskTitle: (group) => group?.title || group?.id || "",
    taskSummary: (group) => group?.summary || "",
    formatTime: (value) => value ? `fmt:${value}` : "",
    taskGroupsForThread: () => groups,
    compactDisplayText: (value) => String(value || "").slice(0, 92),
    isSingleWindowView: () => true,
    isSingleWindowChatView: () => false,
    isGroupChatView: () => false,
    messageTaskDisplayId: (message) => `Task ${message?.taskGroupId || ""}`,
    shortTaskDisplayId: (label) => String(label || "").replace(/^Task /, "T-"),
    workspaceLabelById: (id) => id ? `Workspace ${id}` : "",
    messageDisplayTimeLabel: () => "12:00",
    renderUsage: () => "<usage></usage>",
    renderMessageFooter: () => "<footer></footer>",
    renderArtifacts: () => "<artifacts></artifacts>",
    renderText: (content) => `<p>${content}</p>`,
    renderMessageRunProgress: () => "<progress></progress>",
    chatSearchClassForMessage: () => " search-hit",
    messageScrollEligibleByContent: () => true,
    configureComposer: (options) => calls.push(["configureComposer", options]),
    focusComposerSoon: () => calls.push(["focusComposerSoon"]),
    __calls: calls,
    __elements: elements,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__threadCardMessageHarness = {
  THREAD_CARD_MESSAGE_MODEL_ESM_PATH,
  importThreadCardMessageModel,
  currentThreadCardMessageModel,
  renderTaskCard,
  messageTaskGroup,
  quotePreviewForMessage,
  renderMessageQuoteAction,
  canRevokeGroupMessage,
  renderMessageRevokeAction,
  messageUsesSenderLabel,
  renderMessage,
  setQuotedReply,
  renderQuotedReply,
  activeQuotedReplyForSend,
};`, context, { filename: "app-thread-card-message-ui.js" });
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
  await test("classic thread-card-message adapter declares bounded ESM import path", () => {
    assert.match(source, /THREAD_CARD_MESSAGE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/thread-card-message-model\/thread-card-message-model\.js/);
    assert.match(source, /__homeAiImportThreadCardMessageModel/);
    assert.match(source, /importThreadCardMessageModel/);
    assert.match(source, /currentThreadCardMessageModel/);
    assert.match(source, /taskCardViewPlan/);
    assert.match(source, /messageArticlePlan/);
    assert.match(source, /groupMessageRevokeActionPlan/);
  });

  await test("classic adapter consumes ESM plans for pure message-card decisions", async () => {
    const modelCalls = [];
    const fakeModel = {
      taskCardViewPlan(input) {
        modelCalls.push(["taskCardViewPlan", input.id]);
        return {
          id: input.id,
          sharedTopic: true,
          articleClassSuffix: " shared-topic-card",
          sourceThreadId: "source-thread",
          sharedBadgeLabel: "Model Shared",
          title: "Model Topic",
          updatedAtLabel: "Model time",
        };
      },
      messageTaskGroupIdPlan(message) {
        modelCalls.push(["messageTaskGroupIdPlan", message?.taskGroupId]);
        return { taskGroupId: message?.taskGroupId };
      },
      quotePreviewPlan() {
        modelCalls.push(["quotePreviewPlan"]);
        return { preview: "Model preview" };
      },
      messageQuoteActionPlan() {
        modelCalls.push(["messageQuoteActionPlan"]);
        return { visible: true, messageId: "m1", title: "Model title", label: "Model label" };
      },
      groupMessageRevokeActionPlan() {
        modelCalls.push(["groupMessageRevokeActionPlan"]);
        return { visible: true, messageId: "m1", label: "Model revoke" };
      },
      messageSenderLabelPlan() {
        modelCalls.push(["messageSenderLabelPlan"]);
        return { useSenderLabel: true, roleLabel: "Model Sender", kindLabel: " · AI" };
      },
      messageArticlePlan() {
        modelCalls.push(["messageArticlePlan"]);
        return { articleClass: "message assistant model-article", messageId: "m1", status: " - model" };
      },
      quotedReplyStatePlan() {
        modelCalls.push(["quotedReplyStatePlan"]);
        return {
          ok: true,
          quote: { taskGroupId: "task-1", messageId: "m1", label: "Model Task", shortLabel: "MT", preview: "Model preview" },
        };
      },
      activeQuotedReplyPlan(input) {
        modelCalls.push(["activeQuotedReplyPlan", input.panelMessageId]);
        return { quote: input.quote };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadCardMessageHarness.importThreadCardMessageModel(context.window);
    assert.equal(context.__threadCardMessageHarness.THREAD_CARD_MESSAGE_MODEL_ESM_PATH, "/vite-islands/thread-card-message-model/thread-card-message-model.js");
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/thread-card-message-model/thread-card-message-model.js"));
    const taskCard = context.__threadCardMessageHarness.renderTaskCard({ id: "task-1", sourceThreadId: "source-thread", updatedAt: "now" });
    assert.match(taskCard, /Model Topic/);
    assert.match(taskCard, /Model Shared/);
    assert.doesNotMatch(taskCard, /data-delete-task/);
    assert.match(context.__threadCardMessageHarness.renderMessageQuoteAction({ id: "m1", role: "assistant", taskGroupId: "task-1" }), /Model label/);
    assert.equal(context.__threadCardMessageHarness.canRevokeGroupMessage({ id: "m1" }), true);
    assert.match(context.__threadCardMessageHarness.renderMessageRevokeAction({ id: "m1" }), /Model revoke/);
    const html = context.__threadCardMessageHarness.renderMessage({ id: "m1", role: "user", taskGroupId: "task-1", messageKind: "ai", content: "Hello", status: "running" });
    assert.match(html, /model-article/);
    assert.match(html, /Model Sender/);
    context.__threadCardMessageHarness.setQuotedReply({ id: "m1", role: "assistant", taskGroupId: "task-1", content: "Hello" });
    assert.equal(context.state.quotedReply.preview, "Model preview");
    assert.equal(context.__threadCardMessageHarness.activeQuotedReplyForSend(), context.state.quotedReply);
    assert.ok(modelCalls.some((call) => call[0] === "messageArticlePlan"));
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    const taskCard = context.__threadCardMessageHarness.renderTaskCard({ id: "task-1", title: "Classic Topic", updatedAt: "now" });
    assert.match(taskCard, /Classic Topic/);
    assert.match(taskCard, /data-delete-task="task-1"/);
    const group = context.__threadCardMessageHarness.messageTaskGroup({ taskGroupId: "task-1" });
    assert.equal(group.id, "task-1");
    assert.equal(context.__threadCardMessageHarness.quotePreviewForMessage({ content: "", taskGroupId: "task-1" }, group), "Group summary");
    assert.match(context.__threadCardMessageHarness.renderMessageQuoteAction({ id: "m1", role: "assistant", taskGroupId: "task-1" }), /引用 T-task-1/);
    context.state.auth.isOwner = true;
    const revokeMessage = { id: "m2", role: "user", taskGroupId: "group-chat", senderWorkspaceId: "workspace-x" };
    context.isGroupChatView = () => true;
    assert.equal(context.__threadCardMessageHarness.canRevokeGroupMessage(revokeMessage), true);
    assert.match(context.__threadCardMessageHarness.renderMessageRevokeAction(revokeMessage), /data-revoke-message="m2"/);
    const revokedHtml = context.__threadCardMessageHarness.renderMessage({ id: "m3", role: "user", revokedAt: "now", content: "Hidden" });
    assert.match(revokedHtml, /Message revoked/);
    context.__threadCardMessageHarness.setQuotedReply({ id: "m1", role: "assistant", taskGroupId: "task-1", content: "Hello world" });
    context.__elements.quotedReply.dataset.messageId = "m1";
    context.__elements.quotedReply.dataset.taskGroupId = "task-1";
    assert.equal(context.__threadCardMessageHarness.activeQuotedReplyForSend(), context.state.quotedReply);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
