"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, "src/vite-app/runtime/focus-lifecycle-guard.mjs")).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
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
  let nowMs = Number.isFinite(options.nowMs) ? options.nowMs : 1000;
  const body = createElement("body");
  const composer = createElement("section");
  const input = createElement("textarea", { parentElement: composer });
  const composerChrome = createElement("div", { parentElement: composer });
  const nonEditable = createElement("button");
  composer.children.push(input, composerChrome);
  const documentRef = {
    body,
    activeElement: body,
    addEventListener(type, handler, opts) {
      listeners[type] = listeners[type] || [];
      listeners[type].push({ handler, opts });
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((item) => item.handler !== handler);
    },
  };
  for (const element of [body, composer, input, composerChrome, nonEditable]) element.ownerDocument = documentRef;
  const rootListeners = {};
  const root = {
    getComputedStyle: () => ({ display: "block", visibility: "visible", pointerEvents: "auto" }),
    requestAnimationFrame(callback) {
      callback();
    },
    addEventListener(type, handler, opts) {
      rootListeners[type] = rootListeners[type] || [];
      rootListeners[type].push({ handler, opts });
    },
    removeEventListener(type, handler) {
      rootListeners[type] = (rootListeners[type] || []).filter((item) => item.handler !== handler);
    },
  };
  return {
    blurReasons: [],
    documentRef,
    root,
    rootListeners,
    listeners,
    body,
    composer,
    input,
    composerChrome,
    nonEditable,
    options: {
      root,
      documentRef,
      isNativeShell: () => Boolean(options.nativeShell),
      getComposerInput: () => input,
      getComposerContainer: () => composer,
      nowMs: () => nowMs,
      nativeComposerPasteMenuPreserveMs: options.nativeComposerPasteMenuPreserveMs,
    },
    advance(ms) {
      nowMs += ms;
    },
  };
}

(async () => {
  const focusGuard = await loadModule();

  await test("focus lifecycle guard stays injected and browser-global free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/vite-app/runtime/focus-lifecycle-guard.mjs"), "utf8");
    assert.match(source, /FOCUS_LIFECYCLE_GUARD_VERSION/);
    assert.match(source, /createEditableFocusLifecycleGuard/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });

  await test("hidden composer input is blurred as stale focus", () => {
    const harness = createHarness();
    harness.composer.hidden = true;
    harness.documentRef.activeElement = harness.input;
    const result = focusGuard.blurFocusedEditableIfStale(Object.assign({}, harness.options, {
      onKeyboardMetricsClear: () => harness.blurReasons.push("keyboard"),
      onComposerBlur: () => harness.blurReasons.push("composer"),
    }));

    assert.equal(result.blurred, true);
    assert.equal(result.reason, "composer_unavailable");
    assert.equal(harness.input.blurCount, 1);
    assert.deepEqual(harness.blurReasons, ["composer", "keyboard"]);
  });

  await test("zero-rect editable is blurred as invisible", () => {
    const harness = createHarness();
    const hiddenInput = createElement("textarea", { zeroRect: true });
    hiddenInput.ownerDocument = harness.documentRef;
    harness.documentRef.activeElement = hiddenInput;

    const result = focusGuard.blurFocusedEditableIfStale(harness.options);

    assert.equal(result.blurred, true);
    assert.equal(result.reason, "invisible");
    assert.equal(hiddenInput.blurCount, 1);
  });

  await test("ordinary non-editable touch preserves visible composer focus", () => {
    const harness = createHarness();
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(harness.options);
    const status = guard.handleNonEditablePointer({ type: "pointerdown", target: harness.nonEditable });

    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "active_editable_visible");
    assert.equal(harness.input.blurCount, 0);
  });

  await test("iOS native non-editable touch blurs visible composer focus", () => {
    const harness = createHarness({ nativeShell: true });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      onComposerBlur: () => harness.blurReasons.push("composer"),
    }));
    const status = guard.handleNonEditablePointer({ type: "pointerdown", target: harness.nonEditable });

    assert.equal(status.lastBlurred, true);
    assert.equal(status.lastReason, "active_editable_visible");
    assert.equal(status.lastForced, true);
    assert.equal(harness.input.blurCount, 1);
    assert.deepEqual(harness.blurReasons, ["composer"]);
  });

  await test("iOS native long-press target inside composer preserves visible composer focus", () => {
    const harness = createHarness({ nativeShell: true });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      onComposerBlur: () => harness.blurReasons.push("composer"),
    }));
    const status = guard.handleNonEditablePointer({ type: "touchstart", target: harness.composerChrome });

    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "active_editable_visible");
    assert.equal(status.lastForced, false);
    assert.equal(harness.input.blurCount, 0);
    assert.deepEqual(harness.blurReasons, []);
  });

  await test("touch inside the active editable does not blur in native shell", () => {
    const harness = createHarness({ nativeShell: true });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(harness.options);
    const status = guard.handleNonEditablePointer({ type: "touchstart", target: harness.input });

    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "target_editable");
    assert.equal(harness.input.blurCount, 0);
  });

  await test("iOS native long-press paste menu continuation preserves focused composer briefly", () => {
    const harness = createHarness({ nativeShell: true, nativeComposerPasteMenuPreserveMs: 1200 });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      onComposerBlur: () => harness.blurReasons.push("composer"),
    }));

    let status = guard.handleNonEditablePointer({ type: "touchstart", target: harness.input });
    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "target_editable");

    harness.advance(600);
    status = guard.handleNonEditablePointer({ type: "pointerdown", target: harness.body });
    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "active_editable_visible");
    assert.equal(harness.input.blurCount, 0);

    harness.advance(1300);
    status = guard.handleNonEditablePointer({ type: "pointerdown", target: harness.body });
    assert.equal(status.lastBlurred, true);
    assert.equal(status.lastForced, true);
    assert.equal(harness.input.blurCount, 1);
    assert.deepEqual(harness.blurReasons, ["composer"]);
  });

  await test("iOS native second long-press blur on focused composer is refocused inside paste window", () => {
    const harness = createHarness({ nativeShell: true, nativeComposerPasteMenuPreserveMs: 1200 });
    harness.documentRef.activeElement = harness.input;
    const focusPreserveEvents = [];
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      onComposerFocusPreserve: (reason) => focusPreserveEvents.push(reason),
      scheduleNativeComposerRefocus: (callback) => callback(),
    }));

    let status = guard.handleNonEditablePointer({ type: "touchstart", target: harness.input });
    assert.equal(status.lastBlurred, false);
    assert.equal(status.lastReason, "target_editable");

    harness.documentRef.activeElement = harness.body;
    status = guard.handleComposerBlur({ type: "blur", target: harness.input });

    assert.equal(status.lastReason, "native_composer_paste_blur_pending_refocus");
    assert.equal(status.lastRefocused, false);
    assert.equal(guard.status().lastReason, "native_composer_paste_window");
    assert.equal(guard.status().lastRefocused, true);
    assert.equal(harness.input.focusCount, 1);
    assert.equal(harness.documentRef.activeElement, harness.input);
    assert.deepEqual(focusPreserveEvents, ["native_composer_paste_blur"]);
  });

  await test("iOS native paste blur does not refocus hidden or stale composer input", () => {
    const harness = createHarness({ nativeShell: true, nativeComposerPasteMenuPreserveMs: 1200 });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      scheduleNativeComposerRefocus: (callback) => callback(),
    }));

    guard.handleNonEditablePointer({ type: "touchstart", target: harness.input });
    harness.composer.hidden = true;
    harness.documentRef.activeElement = harness.body;
    const status = guard.handleComposerBlur({ type: "blur", target: harness.input });

    assert.equal(status.lastReason, "composer_blur_unpreserved");
    assert.equal(status.lastRefocused, false);
    assert.equal(harness.input.focusCount, 0);
    assert.equal(harness.documentRef.activeElement, harness.body);
  });

  await test("iOS native long-press continuation does not preserve stale composer focus", () => {
    const harness = createHarness({ nativeShell: true, nativeComposerPasteMenuPreserveMs: 1200 });
    harness.documentRef.activeElement = harness.input;
    const guard = focusGuard.createEditableFocusLifecycleGuard(harness.options);

    guard.handleNonEditablePointer({ type: "touchstart", target: harness.composerChrome });
    harness.composer.hidden = true;
    harness.advance(600);
    const status = guard.handleNonEditablePointer({ type: "pointerdown", target: harness.body });

    assert.equal(status.lastBlurred, true);
    assert.equal(status.lastReason, "composer_unavailable");
    assert.equal(harness.input.blurCount, 1);
  });

  await test("install and dispose own lifecycle listeners", () => {
    const harness = createHarness();
    const statusEvents = [];
    const guard = focusGuard.createEditableFocusLifecycleGuard(Object.assign({}, harness.options, {
      onStatus: (status) => statusEvents.push(status),
    }));

    guard.install();
    assert.equal(harness.listeners.visibilitychange.length, 1);
    assert.equal(harness.listeners.pointerdown.length, 1);
    assert.equal(harness.listeners.touchstart.length, 1);
    assert.equal(harness.listeners.blur.length, 1);
    assert.equal(harness.rootListeners.pageshow.length, 1);
    assert.equal(harness.rootListeners.pagehide.length, 1);
    assert.equal(statusEvents.at(-1).installed, true);

    guard.dispose();
    assert.equal(harness.listeners.visibilitychange.length, 0);
    assert.equal(harness.listeners.pointerdown.length, 0);
    assert.equal(harness.listeners.touchstart.length, 0);
    assert.equal(harness.listeners.blur.length, 0);
    assert.equal(harness.rootListeners.pageshow.length, 0);
    assert.equal(harness.rootListeners.pagehide.length, 0);
    assert.equal(statusEvents.at(-1).installed, false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
