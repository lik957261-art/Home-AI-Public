"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-composer-draft-ui.js"), "utf8");

function createElement(tagName, attrs = {}) {
  const element = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    hidden: Boolean(attrs.hidden),
    disabled: Boolean(attrs.disabled),
    inert: Boolean(attrs.inert),
    isConnected: attrs.isConnected !== false,
    parentElement: attrs.parentElement || null,
    children: [],
    blurCount: 0,
    focusCount: 0,
    dataset: Object.assign({}, attrs.dataset || {}),
    attrs: Object.assign({}, attrs.attrs || {}),
    matches(selector) {
      const tag = this.tagName.toLowerCase();
      if (selector.includes("textarea") && tag === "textarea") return true;
      if (selector.includes("input") && tag === "input") return true;
      if (selector.includes("select") && tag === "select") return true;
      if (selector.includes("[role='textbox']") && this.attrs.role === "textbox") return true;
      if (selector.includes("[contenteditable='true']") && this.attrs.contenteditable === "true") return true;
      if (selector.includes("[contenteditable='plaintext-only']") && this.attrs.contenteditable === "plaintext-only") return true;
      return false;
    },
    closest(selector) {
      return this.matches(selector) ? this : null;
    },
    contains(target) {
      if (target === this) return true;
      return this.children.includes(target);
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    getClientRects() {
      return attrs.zeroRect ? [] : [{ width: attrs.width || 120, height: attrs.height || 40 }];
    },
    getBoundingClientRect() {
      return attrs.zeroRect
        ? { width: 0, height: 0 }
        : { width: attrs.width || 120, height: attrs.height || 40 };
    },
    blur() {
      this.blurCount += 1;
      this.ownerDocument.activeElement = this.ownerDocument.body;
    },
    focus() {
      this.focusCount += 1;
      this.ownerDocument.activeElement = this;
    },
  };
  return element;
}

function createHarness(options = {}) {
  const listeners = {};
  const body = createElement("body");
  const documentElement = createElement("html", {
    dataset: options.nativeShellDataset ? { nativeShell: "ios" } : {},
  });
  const composer = createElement("div");
  const input = createElement("textarea", { parentElement: composer });
  composer.children.push(input);
  const nonEditable = createElement("button");
  const appRoot = createElement("div", {
    dataset: options.nativeShellDataset ? { nativeShell: "ios" } : {},
  });
  const document = {
    visibilityState: "visible",
    body,
    documentElement,
    activeElement: body,
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
  };
  for (const element of [body, documentElement, composer, input, nonEditable, appRoot]) element.ownerDocument = document;
  const context = {
    console,
    Date,
    URLSearchParams,
    state: {
      composerFocused: false,
      suppressComposerFocusUntil: 0,
      pendingArtifacts: [],
    },
    document,
    window: {
      __homeAiStaleEditableFocusGuardInstalled: false,
      location: { search: options.nativeShellQuery ? "?nativeShell=ios" : "" },
      localStorage: {
        getItem(key) {
          if (key === "homeAI.nativeShell" && options.nativeShellStorage) return "ios";
          return "";
        },
      },
      requestAnimationFrame: (callback) => callback(),
      addEventListener(type, handler) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    },
    $: (id) => ({ app: appRoot, composer, messageInput: input }[id] || null),
    closeGroupMentionMenu() { context.closedMention = (context.closedMention || 0) + 1; },
    clearKeyboardViewportMetrics() { context.clearedKeyboard = (context.clearedKeyboard || 0) + 1; },
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
  return { context, document, listeners, composer, input, nonEditable };
}

function testBlursFocusedComposerWhenComposerIsHidden() {
  const { context, document, composer, input } = createHarness();
  composer.hidden = true;
  document.activeElement = input;
  context.state.composerFocused = true;

  const blurred = context.blurFocusedEditableIfStale("test_hidden_composer");

  assert.equal(blurred, true);
  assert.equal(input.blurCount, 1);
  assert.equal(context.state.composerFocused, false);
  assert.equal(context.clearedKeyboard, 1);
  assert.equal(context.closedMention, 1);
}

function testPointerGuardDoesNotBlurVisibleComposer() {
  const { context, document, listeners, composer, input, nonEditable } = createHarness();
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.pointerdown || []) handler({ target: nonEditable });

  assert.equal(input.blurCount, 0);
  assert.equal(context.state.composerFocused, true);
}

function testNativeShellPointerGuardBlursVisibleComposerOnNonEditableTouch() {
  const { context, document, listeners, composer, input, nonEditable } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.pointerdown || []) handler({ target: nonEditable });

  assert.equal(input.blurCount, 1);
  assert.equal(context.state.composerFocused, false);
  assert.equal(context.clearedKeyboard, 1);
}

function testPointerGuardBlursHiddenFocusedComposer() {
  const { context, document, listeners, composer, input, nonEditable } = createHarness();
  composer.hidden = true;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.pointerdown || []) handler({ target: nonEditable });

  assert.equal(input.blurCount, 1);
  assert.equal(context.state.composerFocused, false);
}

function testZeroRectEditableIsTreatedAsStale() {
  const { context, document } = createHarness();
  const hiddenInput = createElement("textarea", { zeroRect: true });
  hiddenInput.ownerDocument = document;
  document.activeElement = hiddenInput;

  const blurred = context.blurFocusedEditableIfStale("test_zero_rect");

  assert.equal(blurred, true);
  assert.equal(hiddenInput.blurCount, 1);
  assert.equal(context.clearedKeyboard, 1);
}

function testFocusComposerSoonRequiresVisibleEnabledInput() {
  const { context, composer, input } = createHarness();
  composer.hidden = true;
  context.focusComposerSoon({ force: true });
  assert.equal(input.focusCount, 0);

  composer.hidden = false;
  input.disabled = true;
  context.focusComposerSoon({ force: true });
  assert.equal(input.focusCount, 0);

  input.disabled = false;
  context.focusComposerSoon({ force: true });
  assert.equal(input.focusCount, 1);
}

testBlursFocusedComposerWhenComposerIsHidden();
testPointerGuardDoesNotBlurVisibleComposer();
testNativeShellPointerGuardBlursVisibleComposerOnNonEditableTouch();
testPointerGuardBlursHiddenFocusedComposer();
testZeroRectEditableIsTreatedAsStale();
testFocusComposerSoonRequiresVisibleEnabledInput();

console.log("keyboard focus guard UI tests passed");
