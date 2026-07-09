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
    id: attrs.id || "",
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
      if (selector.includes("#sendMessage") && this.id === "sendMessage") return true;
      if (selector.includes("textarea") && tag === "textarea") return true;
      if (selector.includes("input") && tag === "input") return true;
      if (selector.includes("select") && tag === "select") return true;
      if (selector.includes("[role='textbox']") && this.attrs.role === "textbox") return true;
      if (selector.includes("[contenteditable='true']") && this.attrs.contenteditable === "true") return true;
      if (selector.includes("[contenteditable='plaintext-only']") && this.attrs.contenteditable === "plaintext-only") return true;
      return false;
    },
    closest(selector) {
      let element = this;
      while (element) {
        if (element.matches?.(selector)) return element;
        element = element.parentElement;
      }
      return null;
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
  let nowMs = Number.isFinite(options.nowMs) ? options.nowMs : 1000;
  function MockDate(...args) {
    return args.length ? new Date(...args) : new Date(nowMs);
  }
  MockDate.now = () => nowMs;
  MockDate.parse = Date.parse;
  MockDate.UTC = Date.UTC;
  const body = createElement("body");
  const documentElement = createElement("html", {
    dataset: options.nativeShellDataset ? { nativeShell: "ios" } : {},
  });
  const composer = createElement("div");
  const input = createElement("textarea", { parentElement: composer });
  const composerChrome = createElement("div", { parentElement: composer });
  composer.children.push(input, composerChrome);
  const nonEditable = createElement("button");
  const sendButton = createElement("button", { id: "sendMessage" });
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
  for (const element of [body, documentElement, composer, input, composerChrome, nonEditable, sendButton, appRoot]) element.ownerDocument = document;
  const context = {
    console,
    Date: MockDate,
    URLSearchParams,
    state: {
      composerFocused: false,
      suppressComposerFocusUntil: 0,
      pendingArtifacts: [],
    },
    document,
    window: {
      __homeAiStaleEditableFocusGuardInstalled: false,
      __homeAiComposerFocusGuardEvents: [],
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
    refreshKeyboardViewportDuringFocus() { context.refreshedKeyboardDuringFocus = (context.refreshedKeyboardDuringFocus || 0) + 1; },
    refreshComposerContextSoon() { context.refreshedComposerContext = (context.refreshedComposerContext || 0) + 1; },
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
  return {
    context,
    document,
    listeners,
    composer,
    input,
    composerChrome,
    nonEditable,
    sendButton,
    advance(ms) {
      nowMs += ms;
    },
  };
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

function testNativeShellPointerGuardPreservesComposerInternalLongPressTarget() {
  const { context, document, listeners, composer, input, composerChrome } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.pointerdown || []) handler({ target: composerChrome });

  assert.equal(input.blurCount, 0);
  assert.equal(context.state.composerFocused, true);
  assert.equal(context.clearedKeyboard || 0, 0);
}

function testNativeShellPasteMenuContinuationPreservesComposerFocusBriefly() {
  const { context, document, listeners, composer, input, advance } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.touchstart || []) handler({ target: input });
  assert.equal(input.blurCount, 0);
  assert.equal(context.state.composerFocused, true);

  advance(700);
  for (const handler of listeners.pointerdown || []) handler({ target: document.body });

  assert.equal(input.blurCount, 0);
  assert.equal(context.state.composerFocused, true);
  assert.equal(context.clearedKeyboard || 0, 0);

  advance(1900);
  for (const handler of listeners.pointerdown || []) handler({ target: document.body });

  assert.equal(input.blurCount, 1);
  assert.equal(context.state.composerFocused, false);
  assert.equal(context.clearedKeyboard, 1);
}

function testNativeShellFocusedTextareaSecondLongPressBlurRefocusesComposer() {
  const { context, document, listeners, composer, input } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.touchstart || []) handler({ target: input });
  assert.equal(input.blurCount, 0);

  document.activeElement = document.body;
  context.state.composerFocused = false;
  for (const handler of listeners.blur || []) handler({ target: input });

  assert.equal(input.focusCount, 1);
  assert.equal(document.activeElement, input);
  assert.equal(context.state.composerFocused, true);
  assert.equal(context.refreshedKeyboardDuringFocus, 1);
  assert.equal(context.refreshedComposerContext, 1);
  assert.deepEqual(
    context.window.__homeAiComposerFocusGuardEvents.map((event) => event.type),
    ["native_composer_paste_blur_preserved", "native_composer_paste_refocused"],
  );
}

function testNativeShellFocusedTextareaSecondLongPressDoesNotRefocusStaleComposer() {
  const { context, document, listeners, composer, input } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.touchstart || []) handler({ target: input });
  composer.hidden = true;
  document.activeElement = document.body;
  context.state.composerFocused = false;
  for (const handler of listeners.blur || []) handler({ target: input });

  assert.equal(input.focusCount, 0);
  assert.equal(document.activeElement, document.body);
  assert.equal(context.state.composerFocused, false);
  assert.deepEqual(context.window.__homeAiComposerFocusGuardEvents, []);
}

function testNativeShellPasteMenuContinuationDoesNotPreserveHiddenComposer() {
  const { context, document, listeners, composer, input, composerChrome, advance } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.touchstart || []) handler({ target: composerChrome });
  composer.hidden = true;
  advance(700);
  for (const handler of listeners.pointerdown || []) handler({ target: document.body });

  assert.equal(input.blurCount, 1);
  assert.equal(context.state.composerFocused, false);
  assert.equal(context.clearedKeyboard, 1);
}

function testNativeShellPointerGuardDoesNotPreBlurSendButtonActivation() {
  const { context, document, listeners, composer, input, sendButton } = createHarness({ nativeShellQuery: true });
  composer.hidden = false;
  input.disabled = false;
  document.activeElement = input;
  context.state.composerFocused = true;

  for (const handler of listeners.pointerdown || []) handler({ target: sendButton });

  assert.equal(input.blurCount, 0);
  assert.equal(context.state.composerFocused, true);
  assert.equal(context.clearedKeyboard || 0, 0);
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
testNativeShellPointerGuardPreservesComposerInternalLongPressTarget();
testNativeShellPasteMenuContinuationPreservesComposerFocusBriefly();
testNativeShellFocusedTextareaSecondLongPressBlurRefocusesComposer();
testNativeShellFocusedTextareaSecondLongPressDoesNotRefocusStaleComposer();
testNativeShellPasteMenuContinuationDoesNotPreserveHiddenComposer();
testNativeShellPointerGuardDoesNotPreBlurSendButtonActivation();
testPointerGuardBlursHiddenFocusedComposer();
testZeroRectEditableIsTreatedAsStale();
testFocusComposerSoonRequiresVisibleEnabledInput();

console.log("keyboard focus guard UI tests passed");
