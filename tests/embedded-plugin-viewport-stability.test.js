"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-embedded-plugin-ui.js"), "utf8");

function rect(overrides = {}) {
  return Object.assign({
    top: 0,
    right: 390,
    bottom: 760,
    left: 0,
    width: 390,
    height: 760,
  }, overrides);
}

const posts = [];
const elements = {};
const cssVars = new Map([
  ["--mobile-bottom-nav-bottom-runtime", "18px"],
  ["--mobile-bottom-nav-offset-height-runtime", "58px"],
  ["--mobile-bottom-nav-reserved-height-runtime", "76px"],
  ["--mobile-bottom-stack-height-runtime", "86px"],
  ["--plugin-context-main-bottom", "58px"],
  ["--mobile-bottom-nav-comfort-inset", "18px"],
]);
const frame = {
  contentWindow: {
    postMessage(payload, origin) {
      posts.push({ payload, origin });
    },
  },
  getBoundingClientRect: () => rect({ bottom: 702, height: 702 }),
};
const shell = {
  querySelector: (selector) => selector === ".embedded-plugin-frame" ? frame : null,
};
elements.codexPluginHost = {
  querySelector: () => shell,
  getBoundingClientRect: () => rect({ bottom: 702, height: 702 }),
};
elements.bottomNav = {
  hidden: false,
  getBoundingClientRect: () => rect({ top: 702, bottom: 760, height: 58 }),
};

const context = {
  console,
  URL,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  Boolean,
  Set,
  JSON,
  state: {
    viewMode: "codex",
    selectedWorkspaceId: "owner",
    themeMode: "light",
    fontSize: "standard",
    embeddedPlugins: {},
  },
  shell,
  window: {
    location: { href: "https://home.test/?nativeShell=ios" },
    innerWidth: 390,
    innerHeight: 760,
    visualViewport: {
      width: 390,
      height: 760,
      offsetTop: 0,
      offsetLeft: 0,
      scale: 1,
    },
    __hermesMobileBottomLayoutMetrics: {
      safeAreaTop: 47,
      stackHeight: 86,
      comfortInset: 18,
    },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: (node) => ({
      display: node === elements.bottomNav ? "grid" : "block",
      getPropertyValue: (name) => cssVars.get(name) || "0px",
    }),
    setTimeout: () => 0,
    scrollX: 0,
    scrollY: 0,
  },
  document: {
    documentElement: {
      clientWidth: 390,
      clientHeight: 760,
      classList: { toggle() {} },
    },
    body: {
      appendChild() {},
    },
    createElement: () => ({
      setAttribute() {},
      querySelector: () => null,
    }),
    querySelector: () => null,
  },
  $: (id) => elements[id] || null,
  visualViewportKeyboardMetrics: () => ({
    keyboardLikely: false,
    bottomInset: 0,
    offsetTop: 0,
  }),
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "app-embedded-plugin-ui.js" });

vm.runInContext(`
  const def = EMBEDDED_PLUGIN_DEFS["codex-mobile"];
  const record = embeddedPluginRecord(def.id);
  record.shellNode = shell;
  record.frameOrigin = "https://plugin.test";
  record.manifest = { entry: { origin: "https://plugin.test" } };
`, context);

assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "layout")`, context), true);
assert.strictEqual(posts.length, 1);
assert.strictEqual(posts[0].payload.viewport.hostTopSafeArea, 47);

assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "layout")`, context), false);
assert.strictEqual(posts.length, 1);

context.window.visualViewport.height = 759;
frame.getBoundingClientRect = () => rect({ bottom: 701, height: 701 });
elements.codexPluginHost.getBoundingClientRect = () => rect({ bottom: 701, height: 701 });
assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "layout")`, context), false);
assert.strictEqual(posts.length, 1);

context.window.visualViewport.height = 740;
frame.getBoundingClientRect = () => rect({ bottom: 682, height: 682 });
elements.codexPluginHost.getBoundingClientRect = () => rect({ bottom: 682, height: 682 });
assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "layout")`, context), true);
assert.strictEqual(posts.length, 2);

context.window.__hermesMobileBottomLayoutMetrics.safeAreaTop = 0;
assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "frame_load")`, context), true);
assert.strictEqual(posts.length, 3);
assert.strictEqual(posts[2].payload.viewport.hostTopSafeArea, 47);

assert.strictEqual(vm.runInContext(`sendEmbeddedPluginViewportMetrics(EMBEDDED_PLUGIN_DEFS["codex-mobile"], "frame_load")`, context), false);
assert.strictEqual(posts.length, 3);

console.log("embedded plugin viewport stability tests passed");
