"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-embedded-plugin-ui.js"), "utf8");

function createClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createHarness() {
  const calls = { api: [], health: 0, nav: 0, affordance: 0, errors: [], timers: [] };
  const listeners = {};
  const main = { insertBefore() {} };
  const conversation = {
    parentNode: main,
    innerHTML: "native content",
    scrollTop: 0,
  };
  const app = { classList: createClassList() };
  const hosts = {};

  function makeHost(id) {
    let shell = null;
    return {
      id,
      hidden: true,
      attributes: {},
      classList: createClassList(),
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      appendChild(node) {
        shell = node;
        node.parentNode = this;
      },
      querySelector(selector) {
        if (selector === ".embedded-plugin-shell" && shell && !shell.removed) return shell;
        if (selector === ".embedded-plugin-frame" && shell && !shell.removed) return shell.querySelector(selector);
        return null;
      },
      set innerHTML(value) {
        this.html = value;
        if (!value) shell = null;
      },
      get innerHTML() {
        return this.html || "";
      },
      setShell(node) {
        shell = node;
        if (node) node.parentNode = this;
      },
    };
  }

  function makeShell(src = "/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&codexPluginLaunch=old") {
    const frame = {
      dataset: {},
      addEventListener() {},
      getAttribute(name) {
        if (name === "src") return src;
        return "";
      },
      contentWindow: {},
    };
    return {
      removed: false,
      parentNode: null,
      remove() {
        this.removed = true;
      },
      querySelector(selector) {
        return selector === ".embedded-plugin-frame" ? frame : null;
      },
    };
  }

  const sandbox = {
    assert,
    URL,
    URLSearchParams,
    Date,
    Promise,
    state: {
      viewMode: "codex",
      selectedWorkspaceId: "owner",
      embeddedPlugins: {},
    },
    window: {
      location: { origin: "https://hermes.example.test", href: "https://hermes.example.test/hermes-mobile/" },
      addEventListener(type, handler) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      setTimeout(callback, delayMs) {
        calls.timers.push({ callback, delayMs });
      },
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, "div");
        return makeHost("");
      },
      querySelector(selector) {
        return selector === ".main" ? main : null;
      },
      body: { appendChild() {} },
    },
    $: (id) => {
      if (id === "conversation") return conversation;
      if (id === "app") return app;
      if (id === "threadList") return { innerHTML: "" };
      if (id === "threadTitle") return { textContent: "" };
      if (id === "threadMeta") return { textContent: "" };
      if (id === "interruptRun") return { disabled: false };
      return hosts[id] || null;
    },
    api(url) {
      calls.api.push(url);
      return new Promise(() => {});
    },
    showError(err) {
      calls.errors.push(err);
    },
    updateNavigationControls() {
      calls.nav += 1;
    },
    ensureVerticalScrollAffordance() {
      calls.affordance += 1;
    },
    configureComposer() {},
    escapeHtml(value) {
      return String(value || "");
    },
    requestAnimationFrame(callback) {
      callback();
    },
  };

  hosts.codexPluginHost = makeHost("codexPluginHost");
  vm.createContext(sandbox);
  vm.runInContext(`${source}
    globalThis.__pluginRefreshHarness = {
      def: EMBEDDED_PLUGIN_DEFS["codex-mobile"],
      embeddedPluginRecord,
      ensureEmbeddedPluginNavigationBridge,
      embeddedPluginRefreshRequiredEventType,
      requestEmbeddedPluginRefresh,
      renderEmbeddedPluginView,
      scheduleEmbeddedPluginLaunchHealthCheck
    };
  `, sandbox);

  return {
    calls,
    conversation,
    listeners,
    host: hosts.codexPluginHost,
    makeShell,
    sandbox,
    emit(data, origin = "https://codex.example.test") {
      assert.ok(listeners.message?.length, "message bridge should be registered");
      listeners.message[0]({ data, origin });
    },
    setupManifest(shell = makeShell()) {
      const { def, embeddedPluginRecord } = sandbox.__pluginRefreshHarness;
      const record = embeddedPluginRecord(def.id);
      record.manifest = {
        ok: true,
        available: true,
        kind: "embedded_app",
        workspaceId: "owner",
        entry: { url: "https://codex.example.test/?embed=hermes", origin: "https://codex.example.test" },
        embed: { tokenStatus: "launch_token_issued" },
      };
      record.manifestAppearanceKey = "light/default";
      record.manifestFetchedAt = 1000;
      record.checked = true;
      record.manifestFreshForFrame = true;
      record.shellNode = shell;
      record.renderedEntryUrl = "https://codex.example.test/?embed=hermes";
      this.host.setShell(shell);
      return { def, record, shell };
    },
  };
}

function testLaunchManifestExpiresForTokenPlugins() {
  const harness = createHarness();
  const { record } = harness.setupManifest();
  harness.sandbox.Date.now = () => 61000;

  assert.equal(
    harness.sandbox.embeddedPluginManifestMatchesLaunchContext(record, "owner", "light/default"),
    false,
  );
}

function testFreshManifestEntryRebuildsNavigatedShell() {
  const harness = createHarness();
  const oldShell = harness.makeShell("https://codex.example.test/?embed=hermes&codexPluginLaunch=old");
  const { def, record, shell } = harness.setupManifest(oldShell);
  harness.sandbox.state.viewMode = "codex";
  record.navigationLastAt = 5000;
  record.renderedEntryUrl = "https://codex.example.test/?embed=hermes&codexPluginLaunch=old";
  record.manifest.entry.url = "https://codex.example.test/?embed=hermes&codexPluginLaunch=new";
  record.manifestFetchedAt = 6000;
  harness.sandbox.Date.now = () => 7000;

  harness.sandbox.__pluginRefreshHarness.renderEmbeddedPluginView(def);

  assert.equal(shell.removed, true);
  assert.match(harness.host.innerHTML, /codexPluginLaunch=new/);
}

function testRefreshIgnoresWrongOrigin() {
  const harness = createHarness();
  const { def, record, shell } = harness.setupManifest();
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);
  assert.equal(
    harness.sandbox.__pluginRefreshHarness.embeddedPluginRefreshRequiredEventType({ id: "future-plugin" }),
    "future-plugin.plugin.refresh_required",
  );

  harness.emit({
    type: "codex-mobile.plugin.refresh_required",
    route: { name: "thread", threadId: "thread-1" },
  }, "https://evil.example.test");

  assert.equal(shell.removed, false);
  assert.equal(record.checked, true);
  assert.equal(record.manifestFreshForFrame, true);
  assert.deepEqual(harness.calls.api, []);
}

function testRefreshRebuildsActivePluginWithBoundedRoute() {
  const harness = createHarness();
  const { def, record, shell } = harness.setupManifest();
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);
  record.frameCreatedAt = 1;
  harness.sandbox.Date.now = () => 100000;

  harness.emit({
    type: "codex-mobile.plugin.refresh_required",
    reason: "auth_state_changed",
    route: {
      name: "thread",
      threadId: "t".repeat(240),
      itemId: "turn-1",
      access_key: "must-not-be-copied",
      launch: "must-not-be-copied",
      cookie: "must-not-be-copied",
    },
  });

  assert.equal(shell.removed, false);
  assert.equal(record.checked, false);
  assert.equal(record.manifestFreshForFrame, false);
  assert.equal(record.canGoBack, false);
  assert.equal(record.navigationRoute, null);
  assert.equal(record.openRoute.pluginRoute, "thread");
  assert.equal(record.openRoute.pluginThreadId.length, 180);
  assert.equal(record.openRoute.pluginItemId, "turn-1");
  assert.equal(Object.hasOwn(record.openRoute, "access_key"), false);
  assert.equal(Object.hasOwn(record.openRoute, "launch"), false);
  assert.equal(Object.hasOwn(record.openRoute, "cookie"), false);
  assert.equal(harness.calls.api.length, 1);
  assert.match(harness.calls.api[0], /^\/api\/hermes-plugins\/codex-mobile\/manifest\?/);
}

function testRefreshInvalidatesInactivePluginWithoutFetching() {
  const harness = createHarness();
  const { def, record, shell } = harness.setupManifest();
  harness.sandbox.state.viewMode = "single";
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);

  harness.emit({
    type: "codex-mobile.plugin.refresh_required",
    pluginRoute: "task",
    pluginTaskId: "task-1",
  });

  assert.equal(shell.removed, true);
  assert.equal(record.checked, false);
  assert.equal(record.manifestFreshForFrame, false);
  assert.equal(record.openRoute.pluginRoute, "task");
  assert.equal(record.openRoute.pluginTaskId, "task-1");
  assert.deepEqual(harness.calls.api, []);
}

function testRefreshRequiredBypassesWarmupButUsesCooldown() {
  const harness = createHarness();
  const { def, record } = harness.setupManifest();
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);
  record.frameCreatedAt = 1;

  harness.sandbox.Date.now = () => 100000;
  harness.emit({ type: "codex-mobile.plugin.refresh_required", route: { name: "thread", threadId: "thread-1" } });
  assert.equal(harness.calls.api.length, 1);

  record.shellNode = harness.makeShell();
  harness.host.setShell(record.shellNode);
  record.checked = true;
  record.manifestFreshForFrame = true;
  record.loading = false;
  harness.sandbox.Date.now = () => 105000;
  harness.emit({ type: "codex-mobile.plugin.refresh_required", route: { name: "thread", threadId: "thread-2" } });
  assert.equal(harness.calls.api.length, 1);
  assert.equal(record.openRoute.pluginThreadId, "thread-1");
  assert.equal(record.lastRefreshSuppressedAt, 105000);

  record.loading = false;
  harness.sandbox.Date.now = () => 161000;
  harness.emit({ type: "codex-mobile.plugin.refresh_required", route: { name: "thread", threadId: "thread-3" } });
  assert.equal(harness.calls.api.length, 2);
  assert.equal(record.openRoute.pluginThreadId, "thread-3");
}

function testRefreshRequiredIgnoredDuringManifestLoad() {
  const harness = createHarness();
  const { def, record } = harness.setupManifest();
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);
  record.loading = true;
  harness.sandbox.Date.now = () => 200000;

  harness.emit({ type: "codex-mobile.plugin.refresh_required", route: { name: "thread", threadId: "thread-loading" } });

  assert.equal(harness.calls.api.length, 0);
  assert.equal(record.openRoute, undefined);
  assert.equal(record.lastRefreshSuppressedAt, 200000);
}

function testRefreshRequiredBypassesFrameWarmup() {
  const harness = createHarness();
  const { def, record, shell } = harness.setupManifest();
  harness.sandbox.__pluginRefreshHarness.ensureEmbeddedPluginNavigationBridge(def);
  record.shellNode = shell;
  record.frameCreatedAt = 400000;
  record.loading = false;
  harness.sandbox.Date.now = () => 405000;

  harness.emit({ type: "codex-mobile.plugin.refresh_required", route: { name: "thread", threadId: "thread-warmup" } });

  assert.equal(harness.calls.api.length, 1);
  assert.equal(shell.removed, false);
  assert.equal(record.openRoute.pluginThreadId, "thread-warmup");
}

function testLaunchHealthRefreshUsesCooldown() {
  const harness = createHarness();
  const { def, record, shell } = harness.setupManifest();
  harness.sandbox.state.viewMode = "codex";
  harness.sandbox.Date.now = () => 300000;
  const frame = shell.querySelector(".embedded-plugin-frame");

  harness.sandbox.__pluginRefreshHarness.scheduleEmbeddedPluginLaunchHealthCheck(def, frame, 300000);
  assert.equal(harness.calls.timers.length, 1);
  assert.equal(harness.calls.timers[0].delayMs, 30000);
  harness.calls.timers[0].callback();

  assert.equal(harness.calls.api.length, 1);
  assert.equal(record.lastRefreshRequestedAt, 300000);

  const nextShell = harness.makeShell();
  record.shellNode = nextShell;
  harness.host.setShell(nextShell);
  record.checked = true;
  record.manifestFreshForFrame = true;
  record.loading = false;
  harness.sandbox.Date.now = () => 305000;
  harness.sandbox.__pluginRefreshHarness.scheduleEmbeddedPluginLaunchHealthCheck(def, nextShell.querySelector(".embedded-plugin-frame"), 305000);
  harness.calls.timers[1].callback();

  assert.equal(harness.calls.api.length, 1);
  assert.equal(record.lastRefreshSuppressedAt, 305000);
}

testRefreshIgnoresWrongOrigin();
testLaunchManifestExpiresForTokenPlugins();
testFreshManifestEntryRebuildsNavigatedShell();
testRefreshRebuildsActivePluginWithBoundedRoute();
testRefreshInvalidatesInactivePluginWithoutFetching();
testRefreshRequiredBypassesWarmupButUsesCooldown();
testRefreshRequiredIgnoredDuringManifestLoad();
testRefreshRequiredBypassesFrameWarmup();
testLaunchHealthRefreshUsesCooldown();

console.log("embedded plugin refresh harness tests passed");
