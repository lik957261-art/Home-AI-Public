"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-message-actions-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const responses = [];
  const messages = [
    { id: "model-long", role: "assistant", content: "short" },
    {
      id: "wardrobe_1",
      role: "assistant",
      pluginActions: {
        wardrobeOutfitWearIntent: {
          kind: "outfit_wear_intent",
          status: "needs_confirmation",
          executable: true,
          intent: { wear_date: "2026-07-05", items: [{ code: "OUT-001" }] },
        },
      },
    },
  ];
  const context = {
    console,
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      calls.push(["requestAnimationFrame"]);
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
    window: {
      __homeAiImportMessageActionsModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
      clearTimeout,
      setTimeout,
      requestAnimationFrame(callback) {
        calls.push(["window.requestAnimationFrame"]);
        callback();
        return 1;
      },
      cancelAnimationFrame() {},
    },
    document: {
      body: { contains: () => true },
      documentElement: { dataset: {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
    },
    state: {
      currentThread: { id: "thread_1", workspaceId: "workspace_1", messages },
      selectedWorkspaceId: "workspace_fallback",
      suppressTransientActivationUntil: 0,
      conversationViewportRefreshTimers: [],
    },
    $: () => null,
    escapeHtml,
    renderMessageSkillPanel: () => "",
    renderMessageRunProgressHistory: () => "",
    showError(error) { calls.push(["showError", error?.message || String(error)]); },
    upsertMessage(message) { calls.push(["upsertMessage", message]); },
    upsertThreadSummary(thread) { calls.push(["upsertThreadSummary", thread]); },
    openAppConfirmDialog(options) {
      calls.push(["confirm", options]);
      return Promise.resolve(true);
    },
    api(pathValue, options) {
      calls.push(["api", pathValue, options]);
      return Promise.resolve(responses.shift() || { ok: true });
    },
    __calls: calls,
    __responses: responses,
  };
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__messageActionsHarness = {
  MESSAGE_ACTIONS_MODEL_ESM_PATH,
  importMessageActionsModel,
  currentMessageActionsModel,
  messageScrollEligibleByContent,
  renderMessageActionStrip,
  renderWardrobeOutfitWearAction,
  executeWardrobeOutfitWearMessageAction,
};`, context, { filename: "app-message-actions-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic message actions adapter declares bounded ESM import path", () => {
    assert.match(source, /MESSAGE_ACTIONS_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/message-actions-model\/message-actions-model\.js/);
    assert.match(source, /__homeAiImportMessageActionsModel/);
    assert.match(source, /importMessageActionsModel/);
    assert.match(source, /currentMessageActionsModel/);
    assert.match(source, /messageScrollEligibleByContentPlan/);
    assert.match(source, /wardrobeOutfitWearActionRequestPlan/);
  });

  await test("classic adapter uses ESM model after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      canUseMessageReplyActionsPlan(message) {
        modelCalls.push(["canUse", message.id]);
        return message.role === "assistant" && Boolean(message.id);
      },
      messageScrollEligibleByContentPlan(message) {
        modelCalls.push(["eligible", message.id]);
        return { eligible: message.id === "model-long" };
      },
      messageScrollButtonPlan(message, position) {
        modelCalls.push(["scrollButton", message.id, position]);
        return {
          visible: true,
          messageId: message.id,
          position: "end",
          label: "Model reply end",
          title: "Model End",
          glyph: "&#8595;",
        };
      },
      messageActionStripPlan(message, options) {
        modelCalls.push(["strip", message.id, options.scrollPosition]);
        return { scrollPosition: "end", controls: ["scroll", "copy", "image", "note"] };
      },
      wardrobeOutfitWearButtonPlan(message) {
        modelCalls.push(["wardrobeButton", message.id]);
        return {
          visible: true,
          htmlKind: "action",
          messageId: message.id,
          status: "ready",
          label: "模型入库",
          title: "模型衣橱入库",
          disabled: false,
        };
      },
      wardrobeOutfitWearActionState(message) {
        modelCalls.push(["wardrobeState", message.id]);
        return message.pluginActions?.wardrobeOutfitWearIntent || null;
      },
      wardrobeReplaceConfirmPlan(action) {
        modelCalls.push(["confirmPlan", action.status]);
        return { title: "模型确认", message: "确认替换模型", detail: "detail", confirmLabel: "模型确认", cancelLabel: "取消" };
      },
      wardrobeOutfitWearActionRequestPlan(input) {
        modelCalls.push(["requestPlan", input.messageId, input.confirmReplace]);
        return {
          path: "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent",
          method: "POST",
          body: {
            threadId: input.threadId,
            messageId: input.messageId,
            workspaceId: input.workspaceId,
            confirmReplace: Boolean(input.confirmReplace),
            mode: input.confirmReplace ? "replace" : "create_only",
          },
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    const harness = context.__messageActionsHarness;
    assert.equal(harness.currentMessageActionsModel(), fakeModel);
    assert.equal(harness.MESSAGE_ACTIONS_MODEL_ESM_PATH, "/vite-islands/message-actions-model/message-actions-model.js");
    assert.equal(harness.messageScrollEligibleByContent({ id: "model-long", role: "assistant", content: "short" }), true);
    const strip = harness.renderMessageActionStrip({ id: "model-long", role: "assistant" }, "start");
    assert.match(strip, /data-scroll-position="end"/);
    assert.match(strip, /Model End/);
    const wardrobe = harness.renderWardrobeOutfitWearAction({ id: "wardrobe_1", role: "assistant" });
    assert.match(wardrobe, /data-wardrobe-outfit-label="模型入库"/);
    assert.match(wardrobe, /aria-label="模型衣橱入库"/);
    assert.match(wardrobe, /<svg class="message-line-icon"/);

    context.__responses.push({ ok: true, actionState: { kind: "outfit_wear_intent", status: "stored" } });
    await harness.executeWardrobeOutfitWearMessageAction("wardrobe_1");
    const confirmCall = context.__calls.find((call) => call[0] === "confirm");
    const apiCall = context.__calls.find((call) => call[0] === "api");
    assert.equal(confirmCall[1].confirmLabel, "模型确认");
    assert.equal(apiCall[1], "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent");
    assert.equal(JSON.parse(apiCall[2].body).mode, "replace");
    assert.ok(modelCalls.some((call) => call[0] === "requestPlan" && call[2] === true));
  });

  await test("classic adapter keeps fallback before ESM model loads", async () => {
    const context = createHarness(null, () => new Promise(() => {}));
    const harness = context.__messageActionsHarness;
    assert.equal(harness.currentMessageActionsModel(), null);
    assert.equal(harness.messageScrollEligibleByContent({
      id: "classic-long",
      role: "assistant",
      content: Array.from({ length: 24 }, (_, index) => `line ${index}`).join("\n"),
    }), true);
    const html = harness.renderWardrobeOutfitWearAction({
      id: "wardrobe_classic",
      role: "assistant",
      pluginActions: {
        wardrobeOutfitWearIntent: {
          kind: "outfit_wear_intent",
          status: "ready",
          executable: true,
          intent: { wear_date: "2026-07-05", items: [{ code: "OUT-001" }] },
        },
      },
    });
    assert.match(html, /data-wardrobe-outfit-label="入库"/);
    assert.match(html, /aria-label="写入衣橱穿着记录/);
    assert.match(html, /<svg class="message-line-icon"/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
