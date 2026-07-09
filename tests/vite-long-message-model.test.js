"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/long-message-model.mjs");

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
  await test("long-message model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/long-message-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans active assistant preview thresholds", async () => {
    const model = await loadModel();
    assert.equal(model.assistantMessageActivePlan({ status: "running" }).active, true);
    assert.equal(model.assistantMessageActivePlan({ status: "done" }).active, false);
    assert.equal(model.longMessageIdPlan({ id: 42 }).id, "42");
    assert.equal(model.longMessageExpandedPlan({
      message: { id: "m1" },
      expandedIds: new Set(["m1"]),
    }).expanded, true);
    assert.equal(model.longMessagePreviewDecisionPlan({
      text: "x".repeat(model.ACTIVE_MESSAGE_RICH_RENDER_LIMIT),
      message: { id: "m2", role: "assistant", status: "running" },
      expanded: false,
    }).shouldRender, false);
    assert.equal(model.longMessagePreviewDecisionPlan({
      text: "x".repeat(model.ACTIVE_MESSAGE_RICH_RENDER_LIMIT + 1),
      message: { id: "m2", role: "assistant", status: "running" },
      expanded: false,
    }).shouldRender, true);
    assert.equal(model.longMessagePreviewDecisionPlan({
      text: "x".repeat(model.LONG_MESSAGE_COLLAPSE_LIMIT + 1),
      message: { id: "m3", role: "user", status: "done" },
      expanded: false,
    }).shouldRender, false);
  });

  await test("plans completed assistant preview, collapse, and parts", async () => {
    const model = await loadModel();
    const text = `${"h".repeat(10000)}${"t".repeat(10000)}`;
    const collapsed = model.longMessagePreviewDecisionPlan({
      text,
      message: { id: "m4", role: "assistant", status: "done" },
      expanded: false,
    });
    assert.equal(collapsed.shouldRender, true);
    assert.equal(collapsed.shouldOfferCollapse, false);
    const expanded = model.longMessagePreviewDecisionPlan({
      text,
      message: { id: "m4", role: "assistant", status: "done" },
      expanded: true,
    });
    assert.equal(expanded.shouldRender, false);
    assert.equal(expanded.shouldOfferCollapse, true);

    const parts = model.longMessagePreviewPartsPlan({ text, active: false });
    assert.equal(parts.head.length, model.LONG_MESSAGE_PREVIEW_HEAD_CHARS);
    assert.equal(parts.tail.length, model.LONG_MESSAGE_PREVIEW_TAIL_CHARS);
    assert.equal(parts.omitted, text.length - model.LONG_MESSAGE_PREVIEW_HEAD_CHARS - model.LONG_MESSAGE_PREVIEW_TAIL_CHARS);

    const activeParts = model.longMessagePreviewPartsPlan({ text, active: true });
    assert.equal(activeParts.head, "");
    assert.equal(activeParts.tail.length, model.LONG_MESSAGE_PREVIEW_TAIL_CHARS);
    assert.equal(activeParts.omitted, text.length - model.LONG_MESSAGE_PREVIEW_TAIL_CHARS);
  });

  await test("plans view copy, toggle attributes, and toggle state actions", async () => {
    const model = await loadModel();
    const view = model.longMessagePreviewViewPlan({
      text: "x".repeat(model.LONG_MESSAGE_COLLAPSE_LIMIT + 10),
      aliases: "<span>aliases</span>",
      message: { id: "m5", role: "assistant", status: "done" },
      expanded: false,
    });
    assert.equal(view.noticeTitle, "长回复已折叠");
    assert.equal(view.noticeBody, "显示开头和结尾；复制按钮仍会复制完整内容。");
    assert.match(view.omittedLabel, /^已省略 /);
    assert.equal(view.toggle.attr, "data-expand-long-message");
    assert.equal(view.toggle.label, "展开完整内容");
    assert.equal(model.longMessageTogglePlan({
      message: { id: "m5" },
      expanded: true,
    }).label, "收起长回复");
    const expand = model.longMessageToggleActionPlan({
      action: "expand",
      messageId: "m5",
      expandedIds: [],
    });
    assert.equal(expand.shouldRender, true);
    assert.equal(expand.mutation, "add");
    assert.deepEqual(expand.nextExpandedIds, ["m5"]);
    const collapse = model.longMessageToggleActionPlan({
      action: "collapse",
      messageId: "m5",
      expandedIds: ["m5", "m6"],
    });
    assert.equal(collapse.mutation, "delete");
    assert.deepEqual(collapse.nextExpandedIds, ["m6"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
