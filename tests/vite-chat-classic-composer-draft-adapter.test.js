"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-draft-ui.js"), "utf8");

function createElement(tagName, attrs = {}) {
  const element = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    hidden: Boolean(attrs.hidden),
    disabled: Boolean(attrs.disabled),
    isConnected: true,
    parentElement: attrs.parentElement || null,
    attrs: {},
    children: [],
    matches(selector) {
      return selector.includes(this.tagName.toLowerCase());
    },
    closest(selector) {
      return this.matches(selector) ? this : null;
    },
    contains(target) {
      return target === this || this.children.includes(target);
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    getClientRects() {
      return [{ width: 120, height: 40 }];
    },
    getBoundingClientRect() {
      return { width: 120, height: 40 };
    },
    blur() {
      this.blurCount = (this.blurCount || 0) + 1;
      this.ownerDocument.activeElement = this.ownerDocument.body;
    },
    focus() {
      this.focusCount = (this.focusCount || 0) + 1;
      this.ownerDocument.activeElement = this;
    },
  };
  return element;
}

function createHarness(fakeModel) {
  const listeners = {};
  const body = createElement("body");
  const composer = createElement("div");
  const input = createElement("textarea", { parentElement: composer });
  composer.children.push(input);
  const appRoot = createElement("div");
  const document = {
    visibilityState: "visible",
    body,
    documentElement: createElement("html"),
    activeElement: body,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
  };
  for (const element of [body, composer, input, appRoot]) element.ownerDocument = document;
  const context = {
    console,
    Date,
    URLSearchParams,
    state: {
      attachFilePickerActivationAt: 0,
      attachFilePickerForegroundSuppressUntil: 0,
      attachFilePickerNativePending: false,
      composerFocused: false,
      pendingArtifacts: [],
      suppressComposerFocusUntil: 0,
    },
    document,
    window: {
      __homeAiStaleEditableFocusGuardInstalled: false,
      __homeAiImportComposerDraftModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
      location: { search: "" },
      localStorage: { getItem: () => "" },
      requestAnimationFrame: (callback) => callback(),
      addEventListener(type, handler) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      getComputedStyle: () => ({ display: "block", visibility: "visible", pointerEvents: "auto" }),
    },
    $: (id) => ({ app: appRoot, composer, messageInput: input }[id] || null),
    closeGroupMentionMenu() {},
    clearKeyboardViewportMetrics() {},
    clearTodoAutoRefresh() {},
    persistAppRouteSnapshot() {},
    refreshPendingCurrentThreadOnForeground() {},
    scheduleTodoAutoRefresh() {},
    loadActionInbox() { return Promise.resolve(); },
    showError(error) { throw error; },
    settleEmbeddedPluginViewportBroadcast() {},
    settleMobileBottomNavReservation() {},
    scheduleClientLayoutDiagnostics() {},
    scheduleConversationViewportRefresh() {},
    getComposerText() { return input.value || ""; },
    isChatSearchMode() { return false; },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-draft-ui.js" });
  return { context, document, input, listeners };
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
  await test("classic composer draft adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_DRAFT_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-draft-model\/chat-composer-draft-model\.js/);
    assert.match(source, /__homeAiImportComposerDraftModel/);
    assert.match(source, /currentChatComposerDraftModel/);
  });

  await test("classic adapter consumes loaded draft model for suppression and draft decisions", async () => {
    const calls = [];
    const fakeModel = {
      createComposerAutoFocusSuppressionPlan(input) {
        calls.push(["suppress", input.durationMs]);
        return { suppressUntil: 4242 };
      },
      composerAutoFocusAllowed(input) {
        calls.push(["allowed", input.suppressUntil]);
        return true;
      },
      createSystemFilePickerOpenPlan(input) {
        calls.push(["open", input.durationMs]);
        return { activationAt: 100, nativePending: true, suppressUntil: 200 };
      },
      createSystemFilePickerReturnPlan(input) {
        calls.push(["return", input.durationMs]);
        return { nativePending: false, suppressUntil: 300 };
      },
      systemFilePickerForegroundSuppressionState(input) {
        calls.push(["suppressed", input.suppressUntil]);
        return { suppressed: true };
      },
      consumeSystemFilePickerForegroundSuppressionPlan() {
        calls.push(["consume"]);
        return { consumed: true, returnPlan: { nativePending: false, suppressUntil: 500 } };
      },
      composerHasDraftState(input) {
        calls.push(["draft", input.text]);
        return { hasDraft: true };
      },
    };
    const { context, input } = createHarness(fakeModel);
    await context.importChatComposerDraftModel(context.window);

    context.suppressComposerAutoFocus(100);
    assert.equal(context.state.suppressComposerFocusUntil, 4242);
    assert.equal(context.composerAutoFocusAllowed(), true);

    context.markSystemFilePickerOpened(600);
    assert.equal(context.state.attachFilePickerActivationAt, 100);
    assert.equal(context.state.attachFilePickerNativePending, true);
    assert.equal(context.state.attachFilePickerForegroundSuppressUntil, 200);

    context.markSystemFilePickerReturned(700);
    assert.equal(context.state.attachFilePickerNativePending, false);
    assert.equal(context.state.attachFilePickerForegroundSuppressUntil, 300);
    assert.equal(context.systemFilePickerForegroundSuppressed(), true);
    assert.equal(context.consumeSystemFilePickerForegroundSuppression(), true);
    assert.equal(context.state.attachFilePickerForegroundSuppressUntil, 500);

    input.value = "hello";
    assert.equal(context.composerHasDraft(), true);
    assert.deepEqual(calls.map((entry) => entry[0]), [
      "suppress",
      "allowed",
      "open",
      "return",
      "suppressed",
      "consume",
      "draft",
    ]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
