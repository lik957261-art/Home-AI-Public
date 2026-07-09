"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-message-actions-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readyAction(overrides = {}) {
  return Object.assign({
    kind: "outfit_wear_intent",
    pluginId: "wardrobe",
    status: "ready",
    executable: true,
    intent: {
      type: "outfit_wear_intent",
      schema_version: 1,
      plugin_id: "wardrobe",
      principal_id: "owner",
      workspace_id: "owner",
      wear_date: "2026-07-02",
      timezone: "Asia/Shanghai",
      items: [
        { role: "Outer", code: "OUT-001" },
        { role: "Footwear", code: "SHOE-001" },
      ],
      source_message: { message_id: "assistant_1", thread_id: "thread_1" },
      idempotency_key: "wardrobe:outfit_wear_intent:ui",
      expires_at: "2099-07-02T00:00:00Z",
    },
  }, overrides);
}

function createHarness(messages = []) {
  const calls = { api: [], confirms: [], upsertMessages: [], upsertThreads: [], errors: [] };
  const responses = [];
  const context = {
    console,
    Date,
    setTimeout,
    clearTimeout,
    state: {
      currentThread: {
        id: "thread_1",
        workspaceId: "owner",
        messages,
      },
      selectedWorkspaceId: "owner",
      suppressTransientActivationUntil: 0,
    },
    window: {
      clearTimeout,
      setTimeout,
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      cancelAnimationFrame(id) {
        clearTimeout(id);
      },
    },
    document: {
      body: { contains: () => true },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    escapeHtml,
    $: () => null,
    renderMessageSkillPanel: () => "",
    renderMessageRunProgressHistory: () => "",
    showError(err) {
      calls.errors.push(err?.message || String(err));
    },
    upsertMessage(message) {
      calls.upsertMessages.push(message);
    },
    upsertThreadSummary(thread) {
      calls.upsertThreads.push(thread);
    },
    openAppConfirmDialog: async (options) => {
      calls.confirms.push(options);
      return true;
    },
    api: async (url, options = {}) => {
      calls.api.push({ url, options });
      return responses.shift() || { ok: true };
    },
  };
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__wardrobeHarness = {
  renderMessageFooter,
  renderWardrobeOutfitWearAction,
  wardrobeOutfitWearActionState,
  wardrobeOutfitWearActionLabel,
  executeWardrobeOutfitWearMessageAction,
};`, context, { filename: "app-message-actions-ui.js" });
  return { calls, context, harness: context.__wardrobeHarness, responses };
}

async function testUsageFooterRendersReadyButton() {
  const message = {
    id: "assistant_1",
    role: "assistant",
    pluginActions: { wardrobeOutfitWearIntent: readyAction() },
  };
  const { harness } = createHarness([message]);
  const html = harness.renderMessageFooter(message, '<span class="message-usage">Usage</span>');
  assert.match(html, /message-footer-meta/);
  assert.match(html, /message-usage/);
  assert.match(html, /data-wardrobe-outfit-wear-message="assistant_1"/);
  assert.match(html, /data-wardrobe-outfit-label="入库"/);
  assert.match(html, /aria-label="写入衣橱穿着记录 2026-07-02 · 2件"/);
  assert.doesNotMatch(html, />\s*入库\s*</);
  assert.doesNotMatch(html, /<span>\s*入库\s*<\/span>/);
}

function testDiagnosticOnlyRendersDisabledRegenerateState() {
  const message = {
    id: "assistant_2",
    role: "assistant",
    pluginActionDiagnostics: {
      wardrobeOutfitWearIntent: {
        code: "intent_metadata_missing",
        reason: "prepare_tool_output_not_attached",
      },
    },
  };
  const { harness } = createHarness([message]);
  const html = harness.renderWardrobeOutfitWearAction(message);
  assert.match(html, /data-wardrobe-outfit-status="blocked"/);
  assert.match(html, /disabled/);
  assert.match(html, /data-wardrobe-outfit-label="需重新生成"/);
  assert.match(html, /aria-label="这条消息暂时没有可执行的衣橱入库动作"/);
  assert.doesNotMatch(html, />\s*需重新生成\s*</);
  assert.doesNotMatch(html, /<span>\s*需重新生成\s*<\/span>/);
}

function testRawJsonCompatibilityRendersReadyButton() {
  const message = {
    id: "assistant_compat",
    role: "assistant",
    rawJson: { outfitWearIntent: readyAction() },
  };
  const { harness } = createHarness([message]);
  const html = harness.renderWardrobeOutfitWearAction(message);
  assert.match(html, /data-wardrobe-outfit-wear-message="assistant_compat"/);
  assert.match(html, /data-wardrobe-outfit-label="入库"/);
  assert.doesNotMatch(html, />\s*入库\s*</);
}

async function testClickPostsThreadMessageWorkspaceAndCreateMode() {
  const message = {
    id: "assistant_1",
    role: "assistant",
    pluginActions: { wardrobeOutfitWearIntent: readyAction() },
  };
  const { calls, harness, responses } = createHarness([message]);
  responses.push({
    ok: true,
    actionState: readyAction({
      status: "stored",
      executable: false,
      outfitId: "777",
      readbackVerified: true,
    }),
    message: {
      id: "assistant_1",
      pluginActions: {
        wardrobeOutfitWearIntent: readyAction({
          status: "stored",
          executable: false,
          outfitId: "777",
          readbackVerified: true,
        }),
      },
    },
    thread: { id: "thread_1", workspaceId: "owner" },
  });
  const result = await harness.executeWardrobeOutfitWearMessageAction("assistant_1");
  assert.equal(result.ok, true);
  assert.equal(calls.api.length, 1);
  assert.equal(calls.api[0].url, "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent");
  assert.deepEqual(JSON.parse(calls.api[0].options.body), {
    threadId: "thread_1",
    messageId: "assistant_1",
    workspaceId: "owner",
    confirmReplace: false,
    mode: "create_only",
  });
  assert.equal(calls.upsertMessages[0].id, "assistant_1");
}

async function testNeedsConfirmationRepeatsWithReplaceMode() {
  const action = readyAction();
  const message = {
    id: "assistant_1",
    role: "assistant",
    pluginActions: { wardrobeOutfitWearIntent: action },
  };
  const { calls, harness, responses } = createHarness([message]);
  responses.push(
    { ok: true, actionState: readyAction({ status: "needs_confirmation", executable: true, existingOutfitId: "321" }) },
    { ok: true, actionState: readyAction({ status: "stored", executable: false, outfitId: "777", readbackVerified: true }) },
  );
  await harness.executeWardrobeOutfitWearMessageAction("assistant_1");
  assert.equal(calls.confirms.length, 1);
  assert.equal(calls.confirms[0].confirmLabel, "确认替换");
  assert.equal(calls.api.length, 2);
  assert.equal(JSON.parse(calls.api[0].options.body).mode, "create_only");
  assert.equal(JSON.parse(calls.api[1].options.body).mode, "replace");
  assert.equal(JSON.parse(calls.api[1].options.body).confirmReplace, true);
}

function testStoredLabelShowsOutfitIdAndReadback() {
  const { harness } = createHarness();
  const label = harness.wardrobeOutfitWearActionLabel({
    status: "stored",
    outfitId: "777",
    readbackVerified: true,
  });
  assert.equal(label, "已入库 #777 · 已验证");
}

async function run() {
  await testUsageFooterRendersReadyButton();
  testDiagnosticOnlyRendersDisabledRegenerateState();
  testRawJsonCompatibilityRendersReadyButton();
  await testClickPostsThreadMessageWorkspaceAndCreateMode();
  await testNeedsConfirmationRepeatsWithReplaceMode();
  testStoredLabelShowsOutfitIdAndReadback();
  console.log("wardrobe outfit wear intent UI tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
