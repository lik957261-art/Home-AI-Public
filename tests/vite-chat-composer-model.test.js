"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadComposerModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/composer-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("composer model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/composer-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("composer action state mirrors send, stop, and search modes", async () => {
    const model = await loadComposerModel();
    const send = model.buildComposerActionState({
      enabled: true,
      text: "继续",
    });
    assert.equal(send.mode, "send");
    assert.equal(send.label, "发送");
    assert.equal(send.classicVisualLabel, "Send");
    assert.equal(send.disabled, false);
    assert.equal(send.enterKeyHint, "send");

    const stop = model.buildComposerActionState({
      enabled: true,
      activeRunIds: ["run_1"],
      singleWindowView: true,
      text: "",
    });
    assert.equal(stop.mode, "stop");
    assert.equal(stop.label, "停止");
    assert.equal(stop.classicVisualLabel, "Stop");
    assert.equal(stop.disabled, false);

    const stopSuppressedByDraft = model.buildComposerActionState({
      enabled: true,
      activeRunIds: ["run_1"],
      singleWindowView: true,
      text: "有草稿",
    });
    assert.equal(stopSuppressedByDraft.mode, "send");

    const stopSuppressedByAttachment = model.buildComposerActionState({
      enabled: true,
      activeRunIds: ["run_1"],
      singleWindowView: true,
      pendingArtifacts: [{ id: "artifact_1" }],
    });
    assert.equal(stopSuppressedByAttachment.mode, "send");

    const search = model.buildComposerActionState({
      enabled: false,
      searchMode: true,
      searchDraft: "外套",
    });
    assert.equal(search.mode, "search");
    assert.equal(search.label, "搜索");
    assert.equal(search.disabled, false);
    assert.equal(search.enterKeyHint, "search");
  });

  await test("composer optimistic send plan mirrors classic pending user and assistant rows", async () => {
    const model = await loadComposerModel();
    const plan = model.createOptimisticSendPlan({
      threadId: "thread_1",
      text: "帮我总结",
      viewMode: "single",
      singleWindowMode: "task",
      baseId: "local_send_test",
      nowIso: "2026-07-02T12:00:00.000Z",
      queuedAt: "2026-07-02T12:00:01.000Z",
      body: { taskGroupId: "task_1" },
    });

    assert.equal(plan.ok, true);
    assert.deepEqual(plan.token.ids, ["local_send_test_user", "local_send_test_assistant"]);
    assert.equal(plan.messages[0].role, "user");
    assert.equal(plan.messages[0].localPendingSend, true);
    assert.equal(plan.messages[0].taskGroupId, "task_1");
    assert.equal(plan.messages[1].role, "assistant");
    assert.equal(plan.messages[1].status, "queued");
    assert.equal(plan.messages[1].localRunProgressEvents[0].preview, "正在准备模型回复");
    assert.equal(plan.viewport.forceStickToBottomMs, 12000);
  });

  await test("composer optimistic send skips assistant for plain single-window chat", async () => {
    const model = await loadComposerModel();
    const plan = model.createOptimisticSendPlan({
      threadId: "thread_1",
      text: "本地留言",
      viewMode: "single",
      singleWindowMode: "chat",
      activeChatTaskGroupId: "chat",
      baseId: "local_plain",
      body: { messageKind: "plain" },
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.messages.length, 1);
    assert.equal(plan.messages[0].taskGroupId, "chat");
  });

  await test("composer optimistic send accepts attachment-only draft parity", async () => {
    const model = await loadComposerModel();
    const action = model.buildComposerActionState({
      enabled: true,
      text: "",
      pendingArtifacts: [{ id: "artifact_1", name: "report.pdf" }],
    });
    assert.equal(action.mode, "send");
    assert.equal(action.disabled, false);
    assert.equal(action.pendingArtifactCount, 1);

    const plan = model.createOptimisticSendPlan({
      threadId: "thread_1",
      text: "",
      pendingArtifacts: [{ id: "artifact_1", name: "report.pdf" }],
      baseId: "local_attachment",
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.messages[0].content, "已附加 1 个文件");
    assert.equal(plan.messages[0].artifactCount, 1);
  });

  await test("composer optimistic send apply and clear are pure thread transforms", async () => {
    const model = await loadComposerModel();
    const thread = Object.freeze({
      id: "thread_1",
      messages: Object.freeze([{ id: "existing", role: "user", content: "原消息" }]),
    });
    const plan = model.createOptimisticSendPlan({
      threadId: "thread_1",
      text: "新消息",
      baseId: "local_send_test",
    });
    const applied = model.applyOptimisticSendPlan(thread, plan);
    assert.equal(thread.messages.length, 1);
    assert.equal(applied.messages.length, 3);
    const cleared = model.clearOptimisticSendPlan(applied, plan.token);
    assert.deepEqual(cleared.messages, thread.messages);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
