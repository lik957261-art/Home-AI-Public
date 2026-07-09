"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-long-message-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportLongMessageModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : {},
    state: {
      expandedLongMessageIds: new Set(),
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    renderCurrentThread(options) {
      calls.push(["renderCurrentThread", options]);
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__longMessageHarness = {
  LONG_MESSAGE_MODEL_ESM_PATH,
  ACTIVE_MESSAGE_RICH_RENDER_LIMIT,
  LONG_MESSAGE_COLLAPSE_LIMIT,
  LONG_MESSAGE_PREVIEW_HEAD_CHARS,
  LONG_MESSAGE_PREVIEW_TAIL_CHARS,
  importLongMessageModel,
  currentLongMessageModel,
  assistantMessageIsActive,
  longMessageId,
  longMessageIsExpanded,
  shouldRenderLongMessagePreview,
  shouldOfferLongMessageCollapse,
  longMessagePreviewParts,
  renderLongMessageToggle,
  renderLongMessageCollapseButton,
  renderLongMessagePreview,
  wireLongMessageButtons,
};`, context, { filename: "app-long-message-ui.js" });
  return context;
}

function fakeButton(dataset) {
  return {
    dataset: { ...dataset },
    handlers: {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
  };
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
  await test("classic long-message adapter declares bounded ESM import path", () => {
    assert.match(source, /LONG_MESSAGE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/long-message-model\/long-message-model\.js/);
    assert.match(source, /__homeAiImportLongMessageModel/);
    assert.match(source, /importLongMessageModel/);
    assert.match(source, /currentLongMessageModel/);
    assert.match(source, /longMessagePreviewViewPlan/);
    assert.match(source, /longMessageToggleActionPlan/);
  });

  await test("classic adapter consumes ESM model for pure long-message plans", async () => {
    const modelCalls = [];
    const fakeModel = {
      assistantMessageActivePlan(message) {
        modelCalls.push(["assistantMessageActivePlan", message.status]);
        return { active: message.status === "model-active" };
      },
      longMessageIdPlan(message) {
        modelCalls.push(["longMessageIdPlan", message.id]);
        return { id: `model-${message.id}` };
      },
      longMessageExpandedPlan() {
        modelCalls.push(["longMessageExpandedPlan"]);
        return { expanded: true };
      },
      longMessagePreviewDecisionPlan() {
        modelCalls.push(["longMessagePreviewDecisionPlan"]);
        return { shouldRender: true, shouldOfferCollapse: true };
      },
      longMessagePreviewPartsPlan() {
        modelCalls.push(["longMessagePreviewPartsPlan"]);
        return { head: "model-head", tail: "model-tail", omitted: 7 };
      },
      longMessageTogglePlan() {
        modelCalls.push(["longMessageTogglePlan"]);
        return {
          id: "model-id",
          attr: "data-expand-long-message",
          label: "展开完整内容",
        };
      },
      longMessagePreviewViewPlan() {
        modelCalls.push(["longMessagePreviewViewPlan"]);
        return {
          aliases: "<span>alias</span>",
          active: false,
          parts: { head: "model-head", tail: "model-tail", omitted: 7 },
          omittedLabel: "已省略 7 个字符",
          noticeTitle: "长回复已折叠",
          noticeBody: "显示开头和结尾；复制按钮仍会复制完整内容。",
          toggle: { visible: true },
        };
      },
      longMessageToggleActionPlan(input) {
        modelCalls.push(["longMessageToggleActionPlan", input.action, input.messageId]);
        return {
          shouldRender: true,
          messageId: input.messageId,
          mutation: input.action === "collapse" ? "delete" : "add",
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.__longMessageHarness.importLongMessageModel(context.window);
    assert.equal(context.__longMessageHarness.LONG_MESSAGE_MODEL_ESM_PATH, "/vite-islands/long-message-model/long-message-model.js");
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/long-message-model/long-message-model.js"));
    assert.equal(context.__longMessageHarness.assistantMessageIsActive({ status: "model-active" }), true);
    assert.equal(context.__longMessageHarness.longMessageId({ id: "m1" }), "model-m1");
    assert.equal(context.__longMessageHarness.longMessageIsExpanded({ id: "m1" }), true);
    assert.equal(context.__longMessageHarness.shouldRenderLongMessagePreview("short", { id: "m1", role: "assistant" }), true);
    assert.equal(context.__longMessageHarness.shouldOfferLongMessageCollapse("short", { id: "m1", role: "assistant" }), true);
    assert.deepEqual(JSON.parse(JSON.stringify(context.__longMessageHarness.longMessagePreviewParts("abc", false))), {
      head: "model-head",
      tail: "model-tail",
      omitted: 7,
    });
    assert.match(context.__longMessageHarness.renderLongMessageToggle({ id: "m1" }, false), /data-expand-long-message="model-id"/);
    const html = context.__longMessageHarness.renderLongMessagePreview("abc", "", { id: "m1", role: "assistant" });
    assert.match(html, /<span>alias<\/span>/);
    assert.match(html, /长回复已折叠/);
    assert.match(html, /已省略 7 个字符/);
    assert.match(html, /model-head/);
    assert.match(html, /model-tail/);
    assert.ok(modelCalls.some((call) => call[0] === "longMessagePreviewViewPlan"));
  });

  await test("classic adapter preserves long-message behavior before model load", () => {
    const context = createHarness(null);
    const harness = context.__longMessageHarness;
    const longDoneText = "x".repeat(harness.LONG_MESSAGE_COLLAPSE_LIMIT + 1);
    const activeText = "x".repeat(harness.ACTIVE_MESSAGE_RICH_RENDER_LIMIT + 1);
    assert.equal(harness.assistantMessageIsActive({ status: "running" }), true);
    assert.equal(harness.longMessageId({ id: 123 }), "123");
    assert.equal(harness.shouldRenderLongMessagePreview(activeText, {
      id: "a1",
      role: "assistant",
      status: "running",
    }), true);
    assert.equal(harness.shouldRenderLongMessagePreview(longDoneText, {
      id: "a2",
      role: "assistant",
      status: "done",
    }), true);
    context.state.expandedLongMessageIds.add("a2");
    assert.equal(harness.shouldRenderLongMessagePreview(longDoneText, {
      id: "a2",
      role: "assistant",
      status: "done",
    }), false);
    assert.equal(harness.shouldOfferLongMessageCollapse(longDoneText, {
      id: "a2",
      role: "assistant",
      status: "done",
    }), true);
    const parts = harness.longMessagePreviewParts(longDoneText, false);
    assert.equal(parts.head.length, harness.LONG_MESSAGE_PREVIEW_HEAD_CHARS);
    assert.equal(parts.tail.length, harness.LONG_MESSAGE_PREVIEW_TAIL_CHARS);
    assert.equal(parts.omitted, longDoneText.length - parts.head.length - parts.tail.length);
    const html = harness.renderLongMessagePreview("<unsafe>", "<b>alias</b>", {
      id: "a3",
      role: "assistant",
      status: "done",
    });
    assert.match(html, /<b>alias<\/b>/);
    assert.match(html, /长回复已折叠/);
    assert.match(html, /&lt;unsafe&gt;/);
    assert.match(html, /展开完整内容/);
    assert.match(harness.renderLongMessageCollapseButton({ id: "a4" }), /收起长回复/);
  });

  await test("classic adapter keeps DOM binding and state mutation in classic owner", async () => {
    const fakeModel = {
      longMessageToggleActionPlan(input) {
        return {
          shouldRender: Boolean(input.messageId),
          messageId: input.messageId,
          mutation: input.action === "collapse" ? "delete" : "add",
        };
      },
    };
    const context = createHarness(fakeModel);
    await context.__longMessageHarness.importLongMessageModel(context.window);
    const expandButton = fakeButton({ expandLongMessage: "m7" });
    const collapseButton = fakeButton({ collapseLongMessage: "m7" });
    const root = {
      querySelectorAll(selector) {
        if (selector === "[data-expand-long-message]") return [expandButton];
        if (selector === "[data-collapse-long-message]") return [collapseButton];
        return [];
      },
    };
    context.__longMessageHarness.wireLongMessageButtons(root);
    let prevented = 0;
    let stopped = 0;
    const event = {
      preventDefault() { prevented += 1; },
      stopPropagation() { stopped += 1; },
    };
    expandButton.handlers.click(event);
    assert.equal(context.state.expandedLongMessageIds.has("m7"), true);
    collapseButton.handlers.click(event);
    assert.equal(context.state.expandedLongMessageIds.has("m7"), false);
    assert.equal(prevented, 2);
    assert.equal(stopped, 2);
    assert.equal(context.__calls.filter((call) => call[0] === "renderCurrentThread").length, 2);
    assert.equal(expandButton.dataset.boundExpandLongMessage, "1");
    assert.equal(collapseButton.dataset.boundCollapseLongMessage, "1");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
