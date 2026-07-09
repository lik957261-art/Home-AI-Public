"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-source-ui.js"), "utf8");

function createClassList() {
  const values = new Set();
  return {
    values,
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createButton(sourceName) {
  return {
    dataset: { composerSourceToggle: sourceName },
    disabled: false,
    classList: createClassList(),
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };
}

function createHarness(fakeModel = null, options = {}) {
  const buttons = [createButton("web"), createButton("x")];
  const control = {
    hidden: false,
    classList: createClassList(),
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    querySelectorAll(selector) {
      return selector === "[data-composer-source-toggle]" ? buttons : [];
    },
  };
  const menu = {
    hidden: true,
    innerHTML: "",
  };
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerSourceModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      composerSearchSource: options.composerSearchSource || "local",
      composerSourceMenuOpen: false,
      viewMode: options.viewMode || "single",
    },
    getComposerText() {
      return options.text || "";
    },
    isChatSearchMode() {
      return Boolean(options.searchMode);
    },
    closeGroupMentionMenu() {
      calls.push("closeGroupMentionMenu");
    },
    renderComposerContext() {
      calls.push("renderComposerContext");
    },
    escapeHtml(value) {
      return String(value || "");
    },
    $(id) {
      if (id === "composerSearchSource") return control;
      if (id === "composerSourceMenu") return menu;
      return null;
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-source-ui.js" });
  return { buttons, calls, context, control, menu };
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
  await test("classic composer source adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_SOURCE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-source-model\/chat-composer-source-model\.js/);
    assert.match(source, /__homeAiImportChatComposerSourceModel/);
    assert.match(source, /currentChatComposerSourceModel/);
    assert.match(source, /selectedComposerSearchSourceInfoPlan/);
    assert.match(source, /composerSourceControlPlan/);
    assert.match(source, /composerSourceToggleButtonPlan/);
  });

  await test("classic adapter consumes ESM model for selected source info", async () => {
    const fakeModel = {
      selectedComposerSearchSourceInfoPlan(input = {}) {
        assert.equal(input.manualSource, "local");
        return {
          source: "web",
          label: "网络搜索",
          manualExplicit: false,
          autoDetected: true,
          sourceMode: "auto",
        };
      },
    };
    const { context } = createHarness(fakeModel, { text: "查网络" });
    await context.importChatComposerSourceModel(context.window);

    assert.equal(context.selectedComposerSearchSourceInfo().source, "web");
    assert.equal(context.importedPath, "/vite-islands/chat-composer-source-model/chat-composer-source-model.js");
  });

  await test("classic adapter consumes ESM model for source choice and control projection", async () => {
    const fakeModel = {
      normalizeComposerSearchSourceValue(value) {
        return String(value || "").toLowerCase() === "x" ? "x" : "web";
      },
      composerSearchSourceOptionPlan(input = {}) {
        return { source: input.source, label: input.source === "x" ? "X 搜索" : "网络搜索" };
      },
      selectedComposerSearchSourceInfoPlan() {
        return { source: "x", label: "X 搜索", manualExplicit: true, autoDetected: false };
      },
      chooseComposerSearchSourcePlan() {
        return { nextSource: "x" };
      },
      composerSourceControlPlan(input = {}) {
        return {
          hidden: false,
          canUse: true,
          active: input.info.manualExplicit,
          autoDetected: false,
          title: "model title",
        };
      },
      composerSourceToggleButtonPlan(input = {}) {
        return {
          disabled: false,
          active: input.source === "x",
          autoDetected: false,
          ariaPressed: input.source === "x" ? "true" : "false",
          title: `toggle ${input.source}`,
        };
      },
    };
    const { buttons, calls, context, control } = createHarness(fakeModel);
    await context.importChatComposerSourceModel(context.window);

    context.chooseComposerSearchSource("x");

    assert.equal(context.state.composerSearchSource, "x");
    assert.deepEqual(calls, ["renderComposerContext"]);
    assert.equal(control.attrs["aria-disabled"], "false");
    assert.equal(control.attrs.title, "model title");
    assert.equal(control.classList.contains("active"), true);
    assert.equal(buttons[1].classList.contains("active"), true);
    assert.equal(buttons[1].attrs["aria-pressed"], "true");
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { context } = createHarness({}, { text: "#web 查资料" });
    const info = context.selectedComposerSearchSourceInfo();
    assert.equal(info.source, "web");
    assert.equal(info.autoDetected, true);
    assert.equal(context.composerSearchSourceBodyFields(), null);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
