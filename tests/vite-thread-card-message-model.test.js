"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/thread-card-message-model.mjs");

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
  await test("thread-card-message model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/thread-card-message-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans task card shared-topic and ordinary-topic view state", async () => {
    const model = await loadModel();
    const shared = model.taskCardViewPlan({
      id: "group-1",
      sourceThreadId: "source-thread",
      sourceThreadTitle: "Shared Topic",
      title: "Ignored classic title",
      updatedAtLabel: "today",
      hasArtifact: true,
    });
    assert.equal(shared.version, model.THREAD_CARD_MESSAGE_MODEL_VERSION);
    assert.equal(shared.sharedTopic, true);
    assert.equal(shared.deleteVisible, false);
    assert.equal(shared.assetsVisible, false);
    assert.equal(shared.articleClassSuffix, " shared-topic-card");
    assert.equal(shared.sharedBadgeLabel, "Shared Topic");
    const ordinary = model.taskCardViewPlan({ id: "group-2", title: "", updatedAtLabel: "now", hasArtifact: false });
    assert.equal(ordinary.sharedTopic, false);
    assert.equal(ordinary.menuVisible, true);
    assert.equal(ordinary.docsEmpty, true);
    assert.equal(ordinary.title, "Untitled topic");
  });

  await test("plans task group id, quote previews, and quote action state", async () => {
    const model = await loadModel();
    assert.equal(model.messageTaskGroupIdPlan({ taskGroupId: " task-1 " }).taskGroupId, "task-1");
    assert.equal(model.quotePreviewPlan({ contentPreview: "", taskSummary: "Summary", taskTitle: "Title" }).preview, "Summary");
    assert.equal(model.quotePreviewPlan({ contentPreview: "", taskSummary: "", taskTitle: "" }).preview, "Quoted topic");
    const action = model.messageQuoteActionPlan({
      singleWindowView: true,
      singleWindowChatView: false,
      role: "assistant",
      messageId: "m1",
      taskGroupId: "task-1",
      taskDisplayId: "T-123",
      shortTaskDisplayId: "123",
    });
    assert.equal(action.visible, true);
    assert.equal(action.title, "引用 T-123");
    assert.equal(action.label, "引用 123");
    assert.equal(model.messageQuoteActionPlan({ singleWindowView: true, singleWindowChatView: true, role: "assistant", taskGroupId: "task-1" }).visible, false);
  });

  await test("plans group revoke authorization without side effects", async () => {
    const model = await loadModel();
    const message = { id: "m1", role: "user", taskGroupId: "group-chat", senderWorkspaceId: "workspace-1" };
    assert.equal(model.groupMessageRevokeActionPlan({
      groupChatView: true,
      message,
      selectedWorkspaceId: "workspace-1",
      authWorkspaceId: "workspace-2",
      isOwner: false,
      groupChatTaskGroupId: "group-chat",
      revokeLabel: "撤回",
    }).visible, true);
    assert.equal(model.groupMessageRevokeActionPlan({
      groupChatView: true,
      message,
      selectedWorkspaceId: "workspace-3",
      isOwner: false,
      groupChatTaskGroupId: "group-chat",
    }).visible, false);
    assert.equal(model.groupMessageRevokeActionPlan({
      groupChatView: true,
      message: Object.assign({}, message, { revokedAt: "now" }),
      isOwner: true,
      groupChatTaskGroupId: "group-chat",
    }).visible, false);
  });

  await test("plans sender labels and message article projection", async () => {
    const model = await loadModel();
    const sender = model.messageSenderLabelPlan({
      groupChatView: true,
      role: "user",
      senderLabel: "",
      workspaceLabel: "Owner Workspace",
      messageKind: "ai",
    });
    assert.equal(sender.useSenderLabel, true);
    assert.equal(sender.roleLabel, "Owner Workspace");
    assert.equal(sender.kindLabel, " · AI");
    const article = model.messageArticlePlan({
      role: "assistant",
      status: "running",
      messageId: "m2",
      searchClass: " search-hit",
      preservePromptClass: " preserve-prompt",
      scrollEligible: true,
      hasUsage: true,
    });
    assert.equal(article.activeAssistant, true);
    assert.equal(article.status, " - running");
    assert.match(article.articleClass, /streaming-active preserve-prompt/);
    assert.equal(article.showUsage, true);
    assert.equal(article.scrollEligible, true);
    const revoked = model.messageArticlePlan({ role: "user", revoked: true, status: "running", hasError: true });
    assert.equal(revoked.status, "");
    assert.equal(revoked.bodyMode, "revoked");
    assert.equal(revoked.showError, false);
  });

  await test("plans quoted reply state and active-send guard", async () => {
    const model = await loadModel();
    const reply = model.quotedReplyStatePlan({
      singleWindowView: true,
      singleWindowChatView: false,
      message: { id: "m1", taskGroupId: "task-1" },
      taskDisplayId: "Task 1",
      shortTaskDisplayId: "T1",
      preview: "Preview",
    });
    assert.equal(reply.ok, true);
    assert.deepEqual(reply.quote, {
      taskGroupId: "task-1",
      messageId: "m1",
      label: "Task 1",
      shortLabel: "T1",
      preview: "Preview",
    });
    assert.equal(model.quotedReplyStatePlan({
      singleWindowView: true,
      singleWindowChatView: true,
      message: { id: "m1", taskGroupId: "task-1" },
    }).ok, false);
    assert.equal(model.activeQuotedReplyPlan({
      singleWindowChatView: false,
      viewMode: "single",
      quote: reply.quote,
      panelPresent: true,
      panelHidden: false,
      panelMessageId: "m1",
      panelTaskGroupId: "task-1",
    }).quote, reply.quote);
    assert.equal(model.activeQuotedReplyPlan({
      singleWindowChatView: false,
      viewMode: "single",
      quote: reply.quote,
      panelPresent: true,
      panelHidden: false,
      panelMessageId: "other",
      panelTaskGroupId: "task-1",
    }).quote, null);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
