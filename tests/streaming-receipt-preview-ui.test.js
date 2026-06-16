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

const emptyRunningHtml = context.renderText("", {
  id: "assistant-empty",
  role: "assistant",
  status: "queued",
});
assert.match(emptyRunningHtml, /streaming-receipt empty/);
assert.match(emptyRunningHtml, /hidden/);

console.log("streaming receipt preview UI tests passed");
