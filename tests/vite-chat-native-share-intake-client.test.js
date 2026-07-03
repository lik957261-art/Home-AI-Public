"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-native-share-client.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
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
  const moduleApi = await loadModule();

  await test("native share intake client stays inside injected runtime boundaries", async () => {
    const source = fs.readFileSync(path.join(
      repoRoot,
      "src/vite-islands/chat-runtime/attachment-native-share-client.mjs",
    ), "utf8");
    assert.match(source, /createNativeShareIntakeController/);
    assert.match(source, /normalizeNativeSharedFiles/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /FileReader|EventSource/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("native share intake registers bridge receiver and dedupes files", async () => {
    let currentFiles = [];
    let registeredCallbacks = null;
    const setDetails = [];
    const statuses = [];
    const controller = moduleApi.createNativeShareIntakeController({
      workspaceId: "owner",
      native: {
        registerNativeShareCallbacks(callbacks) {
          registeredCallbacks = callbacks;
          return callbacks;
        },
      },
      getFiles: () => currentFiles,
      setFiles(nextFiles, detail) {
        currentFiles = nextFiles;
        setDetails.push(detail);
      },
      onStatus(status) {
        statuses.push(status);
      },
    });

    const installed = controller.install({ source: "test" });
    assert.equal(installed.ok, true);
    assert.equal(statuses.at(-1).status, "ready");
    assert.equal(typeof registeredCallbacks.receive, "function");

    const first = registeredCallbacks.receive({
      files: [
        { path: "/系统分享/HomeAI/a.md", name: "a.md", workspaceId: "owner", mime: "text/markdown" },
        { path: "/系统分享/HomeAI/a.md", name: "duplicate.md", workspaceId: "owner", mime: "text/markdown" },
        { path: "/系统分享/HomeAI/photo.jpg", name: "photo.jpg", workspaceId: "owner", mime: "image/jpeg" },
      ],
    });

    assert.equal(first.ok, true);
    assert.equal(currentFiles.length, 2);
    assert.equal(setDetails[0].action, "native_share_bridge_receive");
    assert.equal(setDetails[0].receivedCount, 2);
    assert.equal(statuses.at(-1).status, "received");
    assert.equal(statuses.at(-1).nativeShareCount, 2);

    const second = controller.receive({
      files: [
        { path: "/系统分享/HomeAI/photo.jpg", name: "photo-again.jpg", workspaceId: "owner", mime: "image/jpeg" },
        { path: "/系统分享/HomeAI/b.pdf", name: "b.pdf", workspaceId: "owner", mime: "application/pdf" },
      ],
    }, { source: "manual_test" });

    assert.equal(second.ok, true);
    assert.equal(currentFiles.length, 3);
    assert.equal(statuses.at(-1).receivedCount, 2);
    assert.equal(statuses.at(-1).nativeShareCount, 3);
    const artifacts = controller.attachArtifacts();
    assert.equal(artifacts.length, 3);
    assert.equal(artifacts[0].source, "native_share");

    const cleared = controller.clear({ source: "test" });
    assert.equal(cleared.status, "cleared");
    assert.equal(currentFiles.length, 0);
  });

  await test("native share intake reports blocked bridge without fallback", async () => {
    const statuses = [];
    const controller = moduleApi.createNativeShareIntakeController({
      native: {},
      getFiles: () => [],
      setFiles() {
        throw new Error("set_files_should_not_run");
      },
      onStatus(status) {
        statuses.push(status);
      },
    });

    const installed = controller.install({ source: "test" });
    assert.equal(installed.ok, false);
    assert.equal(installed.code, "native_share_bridge_unavailable");
    assert.equal(statuses.at(-1).status, "blocked");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
