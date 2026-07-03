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
  assert.match(html, /button\.dataset\.deleteConfirmUntil = String\(now \+ 5000\)/);
  assert.match(html, /button\.textContent = "再点删除"/);
  assert.doesNotMatch(html, /showViewerToast\(message\)/);
  assert.match(html, /delete button\.dataset\.deleteConfirmUntil/);
  assert.match(html, /showViewerToast\(type === "directory" \? "正在删除目录\.\.\." : "正在删除文件\.\.\."\)/);
  assert.match(html, /showViewerToast\("已删除", "success"\)/);
  assert.match(html, /const previousText = button\.textContent/);
  assert.match(html, /button\.textContent = "删除中\.\.\."/);
  assert.match(html, /button\.disabled = true/);
  assert.match(html, /button\.disabled = false/);
  assert.match(html, /button\.textContent = previousText === "再点删除" \? "删除" : \(previousText \|\| "删除"\)/);
}

function testPreviewRuntimeFacadeScriptOrder() {
  const expectedOrder = [
    "/app-api-client.js",
    "/app-runtime-facade-ui.js",
    "/app-task-preview-helpers-ui.js",
    "/app-task-preview-ui.js",
  ];
  const positions = expectedOrder.map((src) => html.indexOf(src));
  for (const [index, src] of expectedOrder.entries()) {
    assert.ok(positions[index] > -1, `${src} should be loaded by directory viewer`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], `${expectedOrder[index - 1]} should load before ${expectedOrder[index]}`);
  }
}

function testDirectoryApiRuntimeFacadeBoundary() {
  assert.match(html, /const runtime = window\.HomeAiRuntimeFacade \|\| null/);
  assert.match(html, /function directoryRuntimeApi\(\)/);
  assert.match(html, /return directoryRuntimeApi\(\)\(path, requestOptions\)/);
  assert.match(html, /return directoryApi\(`\/api\/directories\/preview\?\$\{currentDirectoryQuery\(\)\.toString\(\)\}`,\s*null,\s*\{ method: "GET" \}\)/);
  assert.match(html, /localStorage\.getItem\("hermesWebTheme"\)/);
  assert.doesNotMatch(html, /localStorage\.getItem\("hermesWebKey"\)/);
  assert.doesNotMatch(html, /X-Hermes-Web-Key/);
  assert.doesNotMatch(html, /(?<![\w$.])fetch\s*\(/);
}

testInlineScriptSyntax();
testDeleteFeedbackContract();
testPreviewRuntimeFacadeScriptOrder();
testDirectoryApiRuntimeFacadeBoundary();
console.log("directory viewer delete UI tests passed");
