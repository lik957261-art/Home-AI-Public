"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-context-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
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
  const model = await loadModel();

  await test("composer context model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("active run planning preserves composer and task-detail role boundaries", () => {
    const messages = [
      { role: "user", status: "running", runId: "run-user" },
      { role: "assistant", status: "running", runId: "run-assistant" },
      { role: "assistant", status: "completed", runId: "run-stale" },
      { role: "assistant", status: "queued", runId: "run-queued" },
    ];
    assert.deepEqual(model.createActiveThreadRunIdsPlan({
      thread: { activeRunIds: ["run-a", "", null], activeRunId: "ignored" },
    }).runIds, ["run-a"]);
    assert.deepEqual(model.createActiveComposerRunIdsPlan({ messages }).runIds, ["run-assistant", "run-queued"]);
    assert.deepEqual(model.createActiveComposerRunIdsPlan({ messages, assistantOnly: false }).runIds, ["run-user", "run-assistant", "run-queued"]);
    assert.equal(model.activeComposerAssistantMessagePlan({ messages }).message.runId, "run-queued");
    assert.deepEqual(model.composerRunCountsPlan({ messages }).counts, { queued: 1, running: 2 });
  });

  await test("context item and visibility planning preserve compact chips", () => {
    const items = model.composerContextItemsPlan({
      workspaceLabel: "Owner",
      permissionLabel: "Owner",
      gatewayPermissionLabel: { label: "Gateway A", tone: "active" },
      searchSourceLabel: { label: "Web", tone: "active" },
      directoryLabel: "Project X",
      pendingArtifactCount: 2,
      quotedReply: true,
      counts: { running: 1, queued: 1 },
    }).items;
    assert.deepEqual(items.map((item) => item.label), [
      "Owner · Owner",
      "Gateway A",
      "Web",
      "目录 Project X",
      "附件 2",
      "引用回复",
      "运行中 1",
      "排队 1",
    ]);
    assert.equal(model.shouldShowComposerContextPlan({
      items,
      counts: { running: 1, queued: 0 },
      viewMode: "single",
    }).visible, true);
    assert.equal(model.shouldShowComposerContextPlan({
      items,
      counts: { running: 0, queued: 0 },
      viewMode: "single",
      composerFocused: false,
      hasDraft: false,
    }).visible, false);
    assert.equal(model.shouldShowComposerContextPlan({
      items,
      counts: { running: 0, queued: 0 },
      viewMode: "projects",
      composerFocused: true,
    }).visible, false);
  });

  await test("permission and model reasoning labels stay bounded", () => {
    assert.equal(model.composerPermissionLabelPlan({ auth: { isOwner: true } }).label, "Owner");
    assert.equal(model.composerPermissionLabelPlan({ auth: { workspaceId: "mk" } }).label, "低权限");
    assert.equal(model.composerPermissionLabelPlan({ auth: {} }).label, "未登录");
    assert.equal(model.composerModelReasoningLabelPlan({ model: "gpt-5", reasoning: "高" }).label, "gpt-5 · 高");
    assert.equal(model.composerModelReasoningLabelPlan({ model: "gpt-5", reasoning: "" }).label, "gpt-5");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
