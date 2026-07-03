"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/message-action-panel/model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function readyAction(overrides = {}) {
  return Object.assign({
    kind: "outfit_wear_intent",
    status: "ready",
    executable: true,
    intent: {
      wear_date: "2026-07-02",
      items: [
        { role: "Outer", code: "OUT-001" },
        { role: "Footwear", code: "SHOE-001" },
      ],
    },
  }, overrides);
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
  await test("message action panel model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/message-action-panel/model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("ready outfit wear intent renders enabled 入库 action near Usage", async () => {
    const model = await loadModel();
    const view = model.buildMessageActionPanelViewModel({
      id: "assistant_1",
      role: "assistant",
      content: "建议穿 OUT-001 和 SHOE-001。",
      usage: { total_tokens: 1024, model: "gpt-5", provider: "openai" },
      pluginActions: { wardrobeOutfitWearIntent: readyAction() },
    });
    assert.equal(view.messageId, "assistant_1");
    assert.equal(view.usage.visible, true);
    assert.equal(view.usage.label, "Usage 1024");
    assert.equal(view.hasActions, true);
    assert.equal(view.readOnly, true);
    assert.equal(view.actionExecutionEnabled, false);
    assert.equal(view.wardrobe.visible, true);
    assert.equal(view.wardrobe.enabled, true);
    assert.equal(view.wardrobe.status, "ready");
    assert.equal(view.wardrobe.label, "入库");
    assert.equal(view.wardrobe.wearDate, "2026-07-02");
    assert.deepEqual(view.wardrobe.itemCodes, ["OUT-001", "SHOE-001"]);
  });

  await test("execution mode can be enabled only by explicit preview option", async () => {
    const model = await loadModel();
    const view = model.buildMessageActionPanelViewModel({
      id: "assistant_1",
      role: "assistant",
      pluginActions: { wardrobeOutfitWearIntent: readyAction() },
    }, { actionExecutionEnabled: true });
    assert.equal(view.readOnly, false);
    assert.equal(view.actionExecutionEnabled, true);
    assert.equal(view.wardrobe.enabled, true);
  });

  await test("stored action label includes outfit id and readback verification", async () => {
    const model = await loadModel();
    const view = model.buildMessageActionPanelViewModel({
      id: "assistant_stored",
      role: "assistant",
      pluginActions: {
        wardrobeOutfitWearIntent: readyAction({
          status: "stored",
          executable: false,
          outfitId: "777",
          readbackVerified: true,
        }),
      },
    });
    assert.equal(view.wardrobe.enabled, false);
    assert.equal(view.wardrobe.status, "stored");
    assert.equal(view.wardrobe.label, "已入库 #777 · 已验证");
    assert.equal(view.wardrobe.detail, "衣橱穿着记录已写入 #777，已回读验证。");
  });

  await test("diagnostic-only message renders disabled regenerate state", async () => {
    const model = await loadModel();
    const view = model.buildMessageActionPanelViewModel({
      id: "assistant_missing",
      role: "assistant",
      pluginActionDiagnostics: {
        wardrobeOutfitWearIntent: {
          code: "intent_metadata_missing",
          reason: "prepare_tool_output_not_attached",
        },
      },
    });
    assert.equal(view.wardrobe.visible, true);
    assert.equal(view.wardrobe.enabled, false);
    assert.equal(view.wardrobe.status, "blocked");
    assert.equal(view.wardrobe.label, "需重新生成");
    assert.match(view.wardrobe.detail, /没有可执行/);
  });

  await test("compatibility action metadata sources match classic renderer paths", async () => {
    const model = await loadModel();
    for (const message of [
      { pluginActions: { outfit_wear_intent: readyAction() } },
      { plugin_actions: { wardrobeOutfitWearIntent: readyAction() } },
      { metadata: { outfit_wear_intent: readyAction() } },
      { rawJson: { pluginActions: { wardrobeOutfitWearIntent: readyAction() } } },
      { rawJson: { plugin_actions: { outfit_wear_intent: readyAction() } } },
      { rawJson: { outfitWearIntent: readyAction() } },
    ]) {
      const view = model.buildMessageActionPanelViewModel(Object.assign({ id: "assistant_compat" }, message));
      assert.equal(view.wardrobe.status, "ready");
      assert.equal(view.wardrobe.label, "入库");
      assert.deepEqual(view.wardrobe.itemCodes, ["OUT-001", "SHOE-001"]);
    }
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
