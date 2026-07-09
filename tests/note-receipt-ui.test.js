"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const shareImageUi = fs.readFileSync(path.join(repoRoot, "public", "app-share-image-ui.js"), "utf8");

function createHarness(apiImpl) {
  const calls = { api: [], toasts: [], openedNotes: [] };
  const messages = {
    "msg-1": {
      id: "msg-1",
      role: "assistant",
      content: "Receipt body",
      taskGroupId: "task-health",
      actorWorkspaceId: "weixin_wuping",
      artifacts: [],
    },
  };
  const sandbox = {
    console,
    state: {
      auth: { workspaceId: "owner" },
      currentThreadId: "thread-1",
      currentThread: { id: "thread-1", workspaceId: "owner" },
      selectedWorkspaceId: "owner",
      currentWorkspaceLabel: "Owner",
    },
    cleanDisplayText: (value) => String(value || "").trim(),
    rewriteDirectoryPathsForDisplay: (value) => String(value || ""),
    currentMessageById: (id) => messages[id] || null,
    messageTaskGroup: () => ({ id: "task-health", messages: [{ role: "user", actorWorkspaceId: "weixin_wuping" }] }),
    taskGroupOwnerWorkspaceId: () => "weixin_wuping",
    messageOwnerWorkspaceId: (message) => String(message?.actorWorkspaceId || ""),
    workspaceLabelById: (workspaceId) => (workspaceId === "weixin_wuping" ? "WuPing" : workspaceId),
    showPushToast(message, kind = "", options = {}) {
      calls.toasts.push({ message, kind, actionLabel: options.actionLabel || "" });
    },
    showError(err) {
      calls.toasts.push({ message: err?.message || String(err), kind: "error", actionLabel: "" });
    },
    openSavedNoteReceiptFromToast(noteId) {
      calls.openedNotes.push(noteId);
    },
    api: async (url, options = {}) => {
      calls.api.push({ url, body: JSON.parse(options.body || "{}") });
      return apiImpl ? apiImpl(url, options) : { ok: true, note: { id: "note-1", attachmentCount: 0 } };
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${shareImageUi}
globalThis.__noteReceiptHarness = {
  save: saveMessageToNote,
  workspaceFor: noteReceiptWorkspaceIdForMessage,
};`, sandbox);
  return { calls, messages, harness: sandbox.__noteReceiptHarness };
}

async function testSaveTargetsMessageWorkspace() {
  const { calls, harness, messages } = createHarness();

  const result = await harness.save("msg-1");

  assert.equal(result.ok, true);
  assert.equal(harness.workspaceFor(messages["msg-1"]), "weixin_wuping");
  assert.equal(calls.api[0].url, "/api/note/receipts");
  assert.equal(calls.api[0].body.workspaceId, "weixin_wuping");
  assert.deepEqual(calls.toasts[0], { message: "已保存到 Note", kind: "success", actionLabel: "打开" });
}

async function testDuplicateSaveUsesSavedNoteWithoutSecondApiCall() {
  const { calls, harness } = createHarness();

  const first = await harness.save("msg-1");
  const second = await harness.save("msg-1");

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(calls.api.length, 1);
  assert.deepEqual(calls.toasts[1], { message: "已保存过 Note", kind: "warning", actionLabel: "打开" });
}

async function testUnavailableNoteShowsVisibleInstallToast() {
  const err = new Error("Note workspace is not configured");
  err.code = "note_workspace_not_configured";
  const { calls, harness } = createHarness(() => {
    throw err;
  });

  const result = await harness.save("msg-1");

  assert.equal(result.ok, false);
  assert.equal(result.code, "note_workspace_not_configured");
  assert.deepEqual(calls.toasts[0], {
    message: "Note/Notion 插件未安装，请求管理员安装。",
    kind: "warning",
    actionLabel: "请求安装",
  });
}

async function testGenericNoteFailureShowsVisibleErrorToast() {
  const { calls, harness } = createHarness(() => {
    throw new Error("Note API refused");
  });

  const result = await harness.save("msg-1");

  assert.equal(result.ok, false);
  assert.equal(result.code, "note_receipt_save_failed");
  assert.deepEqual(calls.toasts[0], {
    message: "保存到 Note 失败：Note API refused",
    kind: "error",
    actionLabel: "",
  });
}

async function run() {
  await testSaveTargetsMessageWorkspace();
  await testDuplicateSaveUsesSavedNoteWithoutSecondApiCall();
  await testUnavailableNoteShowsVisibleInstallToast();
  await testGenericNoteFailureShowsVisibleErrorToast();
  console.log("note-receipt-ui tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
