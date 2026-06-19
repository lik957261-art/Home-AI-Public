"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

const context = {
  console,
  state: {
    expandedLongMessageIds: new Set(),
  },
  extractDirectoryAliases(text) {
    return { text: String(text || ""), aliases: [] };
  },
  rewriteDirectoryPathsForDisplay(text) {
    return String(text || "");
  },
  renderDirectoryAliases() {
    return "";
  },
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  directoryAliasItemsForAliases() {
    return [];
  },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-long-message-ui.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, "public", "app-rich-text-directory-ui.js"), "utf8"), context);

const streamingText = [
  "line 1",
  "line 2",
  "line 3",
  "line 4",
  "line 5",
  "line 6",
  "line 7",
  "line 8",
].join("\n");

const runningHtml = context.renderText(streamingText, {
  id: "assistant-streaming",
  role: "assistant",
  status: "running",
});
assert.match(runningHtml, /data-streaming-receipt="1"/);
assert.match(runningHtml, /assistant-streaming-receipt-text/);
assert.doesNotMatch(runningHtml, /line 1/);
assert.doesNotMatch(runningHtml, /line 2/);
assert.match(runningHtml, /line 3/);
assert.match(runningHtml, /line 8/);

const doneHtml = context.renderText("结论：已经完成", {
  id: "assistant-done",
  role: "assistant",
  status: "done",
});
assert.doesNotMatch(doneHtml, /data-streaming-receipt="1"/);
assert.match(doneHtml, /assistant-receipt-callout/);

const imageHtml = context.renderText("这张封面是这个：\n\n![Album Cover](/api/v1/music/local/covers/album.jpg)", {
  id: "assistant-image",
  role: "assistant",
  status: "done",
});
assert.match(imageHtml, /<img class="hermes-markdown-image" src="\/api\/v1\/music\/local\/covers\/album\.jpg" alt="Album Cover" loading="lazy" decoding="async">/);
assert.doesNotMatch(imageHtml, /!\[Album Cover\]/);
assert.doesNotMatch(imageHtml, /src="javascript:/);

const emptyRunningHtml = context.renderText("", {
  id: "assistant-empty",
  role: "assistant",
  status: "queued",
});
assert.match(emptyRunningHtml, /streaming-receipt empty/);
assert.match(emptyRunningHtml, /hidden/);

const reasoningPreviewHtml = context.renderText("", {
  id: "assistant-reasoning",
  role: "assistant",
  status: "running",
  streamingRunPreview: "正在整理上下文\n模型流已连接\n开始调用工具",
});
assert.match(reasoningPreviewHtml, /data-streaming-receipt="1"/);
assert.match(reasoningPreviewHtml, /streaming-receipt empty/);
assert.doesNotMatch(reasoningPreviewHtml, /正在整理上下文/);
assert.doesNotMatch(reasoningPreviewHtml, /开始调用工具/);

console.log("streaming receipt preview UI tests passed");
