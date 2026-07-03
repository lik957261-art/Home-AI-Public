"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

async function loadModel() {
  return import(path.join(repoRoot, "src/vite-islands/plugin-host/model.mjs"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
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
  const model = await loadModel();

  await test("plugin host model stays pure and browser-boundary free", () => {
    const source = read("src/vite-islands/plugin-host/model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|localStorage|sessionStorage|fetch)\b/);
    assert.match(source, /PLUGIN_HOST_MODEL_VERSION/);
  });

  await test("available embedded plugin manifest builds iframe-ready state", () => {
    const view = model.buildPluginHostViewModel(
      { id: "finance", title: "记账", manifestPath: "/api/hermes-plugins/finance/manifest" },
      {
        ok: true,
        title: "记账",
        kind: "embedded_app",
        available: true,
        version: "finance-v1",
        entry: { url: "/plugins/finance/?workspaceId=owner" },
        embed: { tokenStatus: "not_required", refreshOnVersionChange: true },
      },
      { workspaceId: "owner", isOwner: true },
    );
    assert.equal(view.status, "ready");
    assert.equal(view.iframe.enabled, true);
    assert.equal(view.iframe.src, "/plugins/finance/?workspaceId=owner");
    assert.equal(view.refresh.refreshOnVersionChange, true);
    assert.equal(view.refresh.manifestMaxAgeMs, 5000);
    assert.equal(view.manifest.version, "finance-v1");
  });

  await test("launch-token URLs are detected and bounded labels are redacted", () => {
    const view = model.buildPluginHostViewModel(
      { id: "codex-mobile", title: "Codex Mobile" },
      {
        ok: true,
        title: "Codex Mobile",
        kind: "embedded_app",
        available: true,
        version: "codex-v1",
        entry: { url: "/plugins/codex-mobile/?workspaceId=owner&launch=secret-value&codexPluginLaunch=secret-two" },
        embed: { tokenStatus: "launch_token_issued" },
      },
      { workspaceId: "owner", isOwner: true },
    );
    assert.equal(view.refresh.usesLaunchToken, true);
    assert.match(view.iframe.boundedEntryLabel, /launch=%5Bredacted%5D/);
    assert.match(view.iframe.boundedEntryLabel, /codexPluginLaunch=%5Bredacted%5D/);
    assert.doesNotMatch(view.iframe.boundedEntryLabel, /secret-value|secret-two/);
  });

  await test("permission and security blocked states fail closed", () => {
    const manifest = {
      ok: true,
      title: "电影",
      kind: "embedded_app",
      available: true,
      entry: { url: "http://127.0.0.1:4195/" },
      embed: { blockedByFrameAncestors: true },
    };
    const denied = model.buildPluginHostViewModel({ id: "movie", title: "电影" }, manifest, { isOwner: false });
    assert.equal(denied.status, "permission_denied");
    assert.equal(denied.iframe.enabled, false);

    const blocked = model.buildPluginHostViewModel({ id: "movie", title: "电影" }, manifest, { isOwner: true });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.security.frameAncestorBlocked, true);
    assert.equal(blocked.iframe.enabled, false);
  });

  await test("HTTP plugin entries are blocked from HTTPS shell embedding", () => {
    const view = model.buildPluginHostViewModel(
      { id: "music", title: "音乐" },
      {
        ok: true,
        title: "音乐",
        kind: "embedded_app",
        available: true,
        entry: { url: "http://127.0.0.1:4180/" },
      },
      { currentProtocol: "https:" },
    );
    assert.equal(view.status, "blocked");
    assert.equal(view.security.mixedContentBlocked, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
