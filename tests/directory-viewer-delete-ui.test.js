"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(repoRoot, "public", "directory-viewer.html"), "utf8");

function inlineScripts(source) {
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((script) => script.trim());
}

function testInlineScriptSyntax() {
  for (const [index, script] of inlineScripts(html).entries()) {
    new vm.Script(script, { filename: `directory-viewer-inline-${index}.js` });
  }
}

function testDeleteFeedbackContract() {
  assert.match(html, /id="viewerToast"/);
  assert.match(html, /\.viewer-toast \{/);
  assert.match(html, /function showViewerToast\(message, type = ""\)/);
  assert.match(html, /删除失败：缺少文件路径/);
  assert.match(html, /showViewerToast\(type === "directory" \? "正在删除目录\.\.\." : "正在删除文件\.\.\."\)/);
  assert.match(html, /showViewerToast\("已删除", "success"\)/);
  assert.match(html, /button\.disabled = true/);
  assert.match(html, /button\.disabled = false/);
}

testInlineScriptSyntax();
testDeleteFeedbackContract();
console.log("directory viewer delete UI tests passed");
