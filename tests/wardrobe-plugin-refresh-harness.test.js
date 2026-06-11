"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-wardrobe-ui.js"), "utf8");

function createClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    add(name) {
      values.add(name);
    },
    remove(name) {
      values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createHarness() {
  const calls = { api: [], nav: 0, affordance: 0, timers: [] };
  const listeners = {};
  const main = { insertBefore() {} };
  const conversation = { parentNode: main, innerHTML: "wardrobe" };
  const app = { classList: createClassList() };
  const host = {
    hidden: true,
    classList: createClassList(),
    setAttribute() {},
    appendChild(node) {
      node.parentNode = this;
    },
    querySelector(selector) {
      if (selector === ".wardrobe-plugin-shell") return this.shell || null;
      if (selector === ".wardrobe-plugin-frame") return this.shell?.querySelector(selector) || null;
      return null;
    },
    set innerHTML(value) {
      this.html = value;
      if (!value) this.shell = null;
    },
    get innerHTML() {
      return this.html || "";
    },
  };
  const shell = {
    removed: false,
    remove() {
      this.removed = true;
    },
    querySelector(selector) {
      if (selector !== ".wardrobe-plugin-frame") return null;
      return {
        dataset: {},
        getAttribute(name) {
          if (name === "src") return "https://wardrobe.example.test/?embed=hermes&launch=old";
          return "";
        },
        addEventListener() {},
        closest() {
          return shell;
        },
      };
    },
  };
  host.shell = shell;

  const sandbox = {
    assert,
    URL,
    URLSearchParams,
    Date: { now: () => 100000 },
    Promise,
    localStorage: { setItem() {} },
    state: {
      viewMode: "wardrobe",
      selectedWorkspaceId: "weixin_test_1",
      wardrobePluginManifest: {
        ok: true,
        available: true,
        kind: "embedded_app",
        workspaceId: "weixin_test_1",
        title: "Wardrobe",
        entry: {
          url: "https://wardrobe.example.test/?embed=hermes&launch=old",
          origin: "https://wardrobe.example.test",
        },
        embed: { tokenStatus: "launch_token_issued" },
      },
      wardrobePluginChecked: true,
      wardrobePluginManifestFreshForFrame: false,
      wardrobePluginShellNode: shell,
    },
    window: {
      location: { origin: "https://hermes.example.test", href: "https://hermes.example.test/" },
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
        return host;
      },
      querySelector(selector) {
        return selector === ".main" ? main : null;
      },
      body: { appendChild() {} },
    },
    $: (id) => {
      if (id === "conversation") return conversation;
      if (id === "wardrobePluginHost") return host;
      if (id === "app") return app;
      return { classList: createClassList(), setAttribute() {}, disabled: false, textContent: "" };
    },
    api(url) {
      calls.api.push(url);
      return new Promise(() => {});
    },
    showError() {},
    updateNavigationControls() {
      calls.nav += 1;
    },
    ensureVerticalScrollAffordance() {
      calls.affordance += 1;
    },
    clearKeyboardViewportMetrics() {},
    configureComposer() {},
    escapeHtml(value) {
      return String(value || "");
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(`${source}
    globalThis.__wardrobeRefreshHarness = {
      ensureWardrobePluginNavigationBridge,
      renderWardrobeView
    };
  `, sandbox);

  return {
    calls,
    host,
    listeners,
    shell,
    sandbox,
    emit(data, origin = "https://wardrobe.example.test") {
      assert.ok(listeners.message?.length, "message bridge should be registered");
      listeners.message[0]({ data, origin });
    },
  };
}

function testWardrobeRefreshRequiredRebuildsIframe() {
  const harness = createHarness();
  harness.sandbox.__wardrobeRefreshHarness.ensureWardrobePluginNavigationBridge();

  harness.emit({ type: "wardrobe.plugin.refresh_required", reason: "launch_session_invalid" });

  assert.equal(harness.shell.removed, true);
  assert.equal(harness.calls.api.length, 1);
  assert.match(harness.calls.api[0], /^\/api\/hermes-plugins\/wardrobe\/manifest\?/);
  assert.match(harness.calls.api[0], /workspaceId=weixin_test_1/);

  harness.sandbox.state.wardrobePluginLoading = false;
  harness.sandbox.Date.now = () => 105000;
  harness.emit({ type: "wardrobe.plugin.refresh_required", reason: "launch_session_invalid" });
  assert.equal(harness.calls.api.length, 1);
  assert.equal(harness.sandbox.state.wardrobePluginLastRefreshSuppressedAt, 105000);
}

function testWardrobeRefreshRejectsWrongOrigin() {
  const harness = createHarness();
  harness.sandbox.__wardrobeRefreshHarness.ensureWardrobePluginNavigationBridge();

  harness.emit({ type: "wardrobe.plugin.refresh_required" }, "https://evil.example.test");

  assert.equal(harness.shell.removed, false);
  assert.equal(harness.calls.api.length, 0);
}

function testWardrobeResidentFrameSurvivesExpiredLaunchManifest() {
  const harness = createHarness();

  harness.sandbox.state.wardrobePluginManifestFreshForFrame = false;
  harness.sandbox.__wardrobeRefreshHarness.renderWardrobeView();

  assert.equal(harness.shell.removed, false);
  assert.equal(harness.host.hidden, false);
  assert.deepEqual(harness.calls.api, []);
  assert.equal(harness.calls.nav > 0, true);
}

testWardrobeRefreshRequiredRebuildsIframe();
testWardrobeRefreshRejectsWrongOrigin();
testWardrobeResidentFrameSurvivesExpiredLaunchManifest();

console.log("wardrobe plugin refresh harness tests passed");
