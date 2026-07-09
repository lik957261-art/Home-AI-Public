"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModule() {
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/share-image/model.mjs")).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModule();

  await test("share image model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/share-image/model.mjs");
    assert.match(source, /SHARE_IMAGE_MODEL_VERSION/);
    assert.doesNotMatch(source, /\b(?:window|document|navigator|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /FileReader|ClipboardItem|URL\.createObjectURL/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("markdown text is normalized into bounded share blocks", async () => {
    const blocks = model.shareImageBlocksFromText([
      "# 标题",
      "",
      "正文 **加粗** [链接](https://example.test)",
      "- 第一项",
      "1. 第二项",
      "> 引用",
      "```",
      "const a = 1;",
      "```",
    ].join("\n"));

    assert.deepEqual(blocks.map((block) => block.type), [
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "code",
    ]);
    assert.equal(blocks[0].text, "标题");
    assert.equal(blocks[1].text, "正文 加粗 链接");
    assert.equal(blocks[2].marker, "-");
    assert.equal(blocks[3].marker, "1.");
    assert.equal(blocks[5].text, "const a = 1;");
  });

  await test("native outbound share request is sanitized and deterministic when injected", async () => {
    const planned = model.createNativeOutboundShareRequest({
      size: 10,
      mimeType: "image/png",
      dataBase64: "aW1hZ2U=",
      filename: "reply:bad/name.png",
      requestPrefix: "reply-share",
      sourceSurface: "message_share_image",
      title: "Home AI",
      text: "学习卡图片",
      nowMs: 123456,
      randomText: "abc123",
    });

    assert.equal(planned.ok, true);
    assert.deepEqual(planned.request, {
      type: "homeai.nativeShare.share",
      version: 1,
      requestId: "reply-share-2n9c-abc123",
      sourceSurface: "message_share_image",
      title: "Home AI",
      text: "学习卡图片",
      filename: "reply-bad-name.png",
      mimeType: "image/png",
      dataBase64: "aW1hZ2U=",
    });
    assert.equal(model.nativeOutboundShareAvailable({ outboundShare: true, hasShareFunction: true }), true);
    assert.equal(model.nativeOutboundShareAvailable({ outboundShare: true, hasShareFunction: false }), false);
  });

  await test("native outbound share request fails closed for unsupported payloads", async () => {
    assert.equal(model.createNativeOutboundShareRequest({ size: 0, dataBase64: "x" }).code, "share_blob_empty");
    assert.equal(model.createNativeOutboundShareRequest({ size: 1, mimeType: "image/jpeg", dataBase64: "x" }).code, "share_mime_unsupported");
    assert.equal(model.createNativeOutboundShareRequest({ size: 1, mimeType: "image/png" }).code, "share_data_missing");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
