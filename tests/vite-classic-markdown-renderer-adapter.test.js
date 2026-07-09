"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/markdown-renderer-client.js"), "utf8");

function createHarness(options = {}) {
  const calls = [];
  const fakeModel = options.fakeModel || null;
  const context = {
    console,
    Promise,
    module: { exports: {} },
    exports: {},
    globalThis: null,
    window: options.withWindow === false ? undefined : {
      document: {},
      __homeAiImportMarkdownRendererModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "markdown-renderer-client.js" });
  return context;
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
  await test("classic markdown renderer adapter declares bounded ESM import path", () => {
    assert.match(source, /MARKDOWN_RENDERER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/markdown-renderer-model\/markdown-renderer-model\.js/);
    assert.match(source, /__homeAiImportMarkdownRendererModel/);
    assert.match(source, /importMarkdownRendererModel/);
    assert.match(source, /currentMarkdownRendererModel/);
    assert.match(source, /renderMarkdownDocument/);
    assert.match(source, /renderMarkdownToHtml/);
    assert.match(source, /sanitizeLinkHref/);
    assert.match(source, /renderInline/);
    assert.match(source, /normalizeMarkdownInput/);
    assert.match(source, /shouldDecodeEscapedMarkdownNewlines/);
  });

  await test("classic adapter exposes CommonJS and window globals with fallback rendering", async () => {
    const harness = createHarness();
    const api = harness.module.exports;
    assert.equal(harness.window.HermesMarkdownRenderer, api);
    assert.equal(api.MARKDOWN_RENDERER_MODEL_ESM_PATH, "/vite-islands/markdown-renderer-model/markdown-renderer-model.js");
    assert.equal(typeof api.renderMarkdownDocument, "function");
    assert.match(api.renderMarkdownDocument("# Title"), /<h1>Title<\/h1>/);
    assert.equal(api.shouldDecodeEscapedMarkdownNewlines("\\n\\n#### Title\\n\\n- item"), true);
    assert.doesNotMatch(api.renderMarkdownToHtml("\\n\\n#### Title\\n\\n- item"), /\\n/);
    assert.match(api.renderMarkdownToHtml("\\n\\n#### Title\\n\\n- item"), /<h4>Title<\/h4>/);
    assert.equal(api.sanitizeLinkHref("javascript:alert(1)"), "#");
    assert.equal(api.currentMarkdownRendererModel(), null);
    await Promise.resolve();
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/markdown-renderer-model/markdown-renderer-model.js"]);
  });

  await test("classic adapter delegates to imported ESM model when available", async () => {
    const fakeModel = {
      renderMarkdownDocument(value, options) {
        return `model-doc:${value}:${options?.fontScale || ""}`;
      },
      renderMarkdownToHtml(value) {
        return `model-html:${value}`;
      },
      sanitizeLinkHref(value) {
        return `model-link:${value}`;
      },
      normalizeMarkdownInput(value) {
        return `model-normalize:${value}`;
      },
      renderInline(value) {
        return `model-inline:${value}`;
      },
    };
    const harness = createHarness({ fakeModel });
    const api = harness.module.exports;
    const loaded = await api.importMarkdownRendererModel(harness.window);
    assert.equal(loaded, fakeModel);
    assert.equal(api.currentMarkdownRendererModel(), fakeModel);
    assert.equal(api.renderMarkdownDocument("x", { fontScale: "large" }), "model-doc:x:large");
    assert.equal(api.renderMarkdownToHtml("x"), "model-html:x");
    assert.equal(api.sanitizeLinkHref("x"), "model-link:x");
    assert.equal(api.normalizeMarkdownInput("x"), "model-normalize:x");
    assert.equal(api.renderInline("x"), "model-inline:x");
  });

  await test("classic adapter keeps CommonJS fallback without browser window", () => {
    const harness = createHarness({ withWindow: false });
    const api = harness.module.exports;
    assert.equal(typeof api.renderMarkdownDocument, "function");
    assert.match(api.renderMarkdownDocument("- [x] Done", { taskListCompatibility: true }), /task-list-item hermes-markdown-task-item/);
    assert.equal(harness.globalThis.HermesMarkdownRenderer, api);
    assert.deepEqual(harness.__calls, []);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
