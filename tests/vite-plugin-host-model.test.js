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

  await test("stable entry signatures strip volatile launch and session params", () => {
    const first = model.stableEntrySignature("/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old&session=a&t=1");
    const second = model.stableEntrySignature("/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=new&session=b&t=2");
    assert.equal(first, second);
    assert.doesNotMatch(first, /old|new|session|launch|t=1|t=2/);
    assert.match(first, /workspaceId=owner/);
  });

  await test("stable entry signatures strip classic volatile plugin credential aliases", () => {
    const first = model.stableEntrySignature(
      "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launchToken=old&session_key=a&apiKey=one&pluginRoute=thread",
    );
    const second = model.stableEntrySignature(
      "/api/hermes-plugins/codex-mobile/proxy/?pluginRoute=thread&api_key=two&sessionToken=b&workspaceId=owner&launchToken=new",
    );
    assert.equal(first, second);
    assert.doesNotMatch(first, /old|new|session|apiKey|api_key|launchToken/i);
    assert.match(first, /pluginRoute=thread/);
  });

  await test("entry equivalence normalizes same-origin absolute and relative URLs with explicit base", () => {
    const absolute = "https://hermes.example.test/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old";
    const relative = "/api/hermes-plugins/codex-mobile/proxy/?launch=new&workspaceId=owner";
    assert.equal(
      model.pluginEntryUrlsStableEquivalent(absolute, relative, { baseUrl: "https://hermes.example.test/app/" }),
      true,
    );
  });

  await test("proxy entry workspace matching fails closed for mismatched workspace", () => {
    assert.equal(
      model.pluginProxyEntryWorkspaceMatches("/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner", "owner"),
      true,
    );
    assert.equal(
      model.pluginProxyEntryWorkspaceMatches("/api/hermes-plugins/codex-mobile/proxy/?workspaceId=family", "owner"),
      false,
    );
    assert.equal(model.pluginProxyEntryWorkspaceMatches("https://codex.example.test/?workspaceId=family", "owner"), true);
  });

  await test("manifest and resident shell context plans stay pure and bounded", () => {
    const record = {
      checked: true,
      manifestAppearanceKey: "dark/default",
      manifestFetchedAt: 1000,
      manifestMaxAgeMs: 60000,
      manifest: {
        ok: true,
        available: true,
        workspaceId: "owner",
        entry: { url: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=secret" },
        embed: { tokenStatus: "launch_token_issued" },
      },
    };
    const manifestPlan = model.pluginManifestLaunchContextPlan({
      record,
      workspaceId: "owner",
      appearanceKey: "dark/default",
      now: 30000,
    });
    assert.equal(manifestPlan.matches, true);
    assert.equal(manifestPlan.usesLaunchToken, true);

    const shellPlan = model.pluginResidentShellContextPlan({
      frameUsesEntry: true,
      renderedEntryUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old",
      renderedWorkspaceId: "owner",
      renderedAppearanceKey: "dark/default",
      workspaceId: "owner",
      appearanceKey: "dark/default",
    });
    assert.equal(shellPlan.matches, true);
    assert.deepEqual(
      model.pluginResidentShellRequiresFreshManifestPlan({
        definition: { residentFrame: true },
        manifest: { embedding: { refreshOnVersionChange: true } },
      }),
      true,
    );
  });

  await test("iframe lifecycle preserves loaded resident iframe for token-only refresh", () => {
    const decision = model.decidePluginIframeLifecycleAction({
      pluginId: "codex-mobile",
      reason: "manifest_refresh",
      loaded: true,
      shellLoading: false,
      currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old-token",
      nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=new-token",
      now: 30000,
      loadingStartedAt: 0,
    });
    assert.equal(decision.action, "preserve_loaded_iframe");
    assert.equal(decision.preserve, true);
    assert.equal(decision.recover, false);
    assert.equal(decision.state.sameStableEntry, true);
  });

  await test("navigation health timeout preserves visible or loaded iframe", () => {
    const visible = model.decidePluginIframeLifecycleAction({
      pluginId: "codex-mobile",
      reason: "navigation_health_timeout",
      loaded: false,
      shellLoading: false,
      currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=old-token",
      nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=new-token",
      now: 30000,
      loadingStartedAt: 0,
    });
    assert.equal(visible.action, "preserve_visible_iframe");
    assert.equal(visible.preserve, true);
    assert.equal(visible.recover, false);
  });

  await test("navigation health timeout recovers only still-loading timed-out iframe", () => {
    const timedOut = model.decidePluginIframeLifecycleAction({
      pluginId: "codex-mobile",
      reason: "navigation_health_timeout",
      loaded: false,
      shellLoading: true,
      currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=stable",
      nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=stable",
      now: 30000,
      loadingStartedAt: 0,
      healthTimeoutMs: 12000,
    });
    assert.equal(timedOut.action, "recover_loading_iframe");
    assert.equal(timedOut.recover, true);
    assert.equal(timedOut.preserve, false);

    const notTimedOut = model.decidePluginIframeLifecycleAction({
      pluginId: "codex-mobile",
      reason: "navigation_health_timeout",
      loaded: false,
      shellLoading: true,
      currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=stable",
      nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&launch=stable",
      now: 5000,
      loadingStartedAt: 0,
      healthTimeoutMs: 12000,
    });
    assert.equal(notTimedOut.action, "wait_for_loading_iframe");
    assert.equal(notTimedOut.recover, false);
  });

  await test("stable entry changes replace iframe", () => {
    const decision = model.decidePluginIframeLifecycleAction({
      pluginId: "codex-mobile",
      reason: "manifest_refresh",
      loaded: true,
      shellLoading: false,
      currentUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&pluginRoute=thread-list&launch=old",
      nextUrl: "/api/hermes-plugins/codex-mobile/proxy/?workspaceId=owner&pluginRoute=quota&launch=new",
      now: 30000,
      loadingStartedAt: 0,
    });
    assert.equal(decision.action, "replace_iframe_for_entry_change");
    assert.equal(decision.replace, true);
    assert.equal(decision.preserve, false);
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
