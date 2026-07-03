"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const shareImageUi = fs.readFileSync(path.join(repoRoot, "public", "app-share-image-ui.js"), "utf8");

function makeHarness(options = {}) {
  const calls = { nativeShare: [], clipboard: [], downloads: [], toasts: [] };
  const sandbox = {
    Blob,
    Date,
    Math,
    FileReader: class FakeFileReader {
      readAsDataURL(blob) {
        this.result = `data:${blob.type || "image/png"};base64,${Buffer.from(options.base64Payload || "png-bytes").toString("base64")}`;
        this.onload?.();
      }
    },
    window: {
      HomeAINativeShareCapability: options.nativeCapable ? { outboundShare: true, platform: "android", version: 1 } : {},
      HomeAINativeShare: options.nativeCapable
        ? {
          async share(request) {
            calls.nativeShare.push(request);
            return { ok: options.nativeOk !== false, requestId: request.requestId };
          },
        }
        : {},
    },
    navigator: {},
    document: {
      createElement() {
        return {
          click() {
            calls.downloads.push(true);
          },
          remove() {},
        };
      },
      body: {
        append() {},
      },
    },
    URL: {
      createObjectURL() {
        return "blob:test";
      },
      revokeObjectURL() {},
    },
    setTimeout() {},
    cleanDisplayText: (value) => String(value || ""),
    rewriteDirectoryPathsForDisplay: (value) => String(value || ""),
    showPushToast(message, kind = "") {
      calls.toasts.push({ message, kind });
    },
    currentMessageById() {
      return null;
    },
    state: { currentThread: null },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${shareImageUi}
globalThis.__shareImageHarness = {
  nativeAvailable: nativeOutboundShareAvailable,
  nativeShare: shareImageBlobWithNative,
};`, sandbox);
  return { calls, harness: sandbox.__shareImageHarness };
}

async function testNativeOutboundShareRequest() {
  const { calls, harness } = makeHarness({ nativeCapable: true, base64Payload: "image" });

  const ok = await harness.nativeShare(new Blob(["image"], { type: "image/png" }), {
    title: "Home AI",
    text: "学习卡图片",
    filename: "reply:bad/name.png",
    sourceSurface: "message_share_image",
    requestPrefix: "reply-share",
  });

  assert.equal(ok, true);
  assert.equal(calls.nativeShare.length, 1);
  assert.equal(calls.nativeShare[0].type, "homeai.nativeShare.share");
  assert.equal(calls.nativeShare[0].version, 1);
  assert.match(calls.nativeShare[0].requestId, /^reply-share-/);
  assert.equal(calls.nativeShare[0].sourceSurface, "message_share_image");
  assert.equal(calls.nativeShare[0].title, "Home AI");
  assert.equal(calls.nativeShare[0].text, "学习卡图片");
  assert.equal(calls.nativeShare[0].filename, "reply-bad-name.png");
  assert.equal(calls.nativeShare[0].mimeType, "image/png");
  assert.equal(calls.nativeShare[0].dataBase64, Buffer.from("image").toString("base64"));
}

async function testNoBridgeReturnsFalse() {
  const { calls, harness } = makeHarness({ nativeCapable: false });

  const ok = await harness.nativeShare(new Blob(["image"], { type: "image/png" }), {
    title: "Home AI",
  });

  assert.equal(harness.nativeAvailable(), false);
  assert.equal(ok, false);
  assert.equal(calls.nativeShare.length, 0);
}

async function testNativeFailureFallsThrough() {
  const { calls, harness } = makeHarness({ nativeCapable: true, nativeOk: false });

  const ok = await harness.nativeShare(new Blob(["image"], { type: "image/png" }), {
    title: "Home AI",
  });

  assert.equal(ok, false);
  assert.equal(calls.nativeShare.length, 1);
}

async function run() {
  await testNativeOutboundShareRequest();
  await testNoBridgeReturnsFalse();
  await testNativeFailureFallsThrough();
  console.log("share image UI tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
