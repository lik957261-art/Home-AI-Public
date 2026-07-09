"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModule() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/composer-draft-model.mjs",
  )).href;
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

(async () => {
  await test("composer draft model stays browser-global free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/vite-islands/chat-runtime/composer-draft-model.mjs"), "utf8");
    assert.match(source, /CHAT_COMPOSER_DRAFT_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("composer auto-focus suppression is deterministic", async () => {
    const model = await loadModule();
    const plan = model.createComposerAutoFocusSuppressionPlan({
      currentSuppressUntil: 3500,
      nowMs: 2000,
      durationMs: 1200,
    });
    assert.equal(plan.suppressUntil, 3500);
    assert.equal(model.composerAutoFocusAllowed({
      visibilityState: "visible",
      nowMs: 3499,
      suppressUntil: plan.suppressUntil,
    }), false);
    assert.equal(model.composerAutoFocusAllowed({
      visibilityState: "visible",
      nowMs: 3500,
      suppressUntil: plan.suppressUntil,
    }), true);
    assert.equal(model.composerAutoFocusAllowed({
      visibilityState: "hidden",
      nowMs: 5000,
      suppressUntil: plan.suppressUntil,
    }), false);
  });

  await test("system file picker foreground suppression mirrors classic windows", async () => {
    const model = await loadModule();
    const open = model.createSystemFilePickerOpenPlan({
      nowMs: 10000,
      durationMs: 500,
      currentSuppressUntil: 0,
    });
    assert.equal(open.activationAt, 10000);
    assert.equal(open.nativePending, true);
    assert.equal(open.suppressUntil, 11000);

    const pending = model.systemFilePickerForegroundSuppressionState({
      nowMs: 10500,
      nativePending: true,
      activationAt: open.activationAt,
      suppressUntil: open.suppressUntil,
    });
    assert.equal(pending.suppressed, true);
    assert.equal(pending.reason, "native_pending");

    const consumed = model.consumeSystemFilePickerForegroundSuppressionPlan({
      nowMs: 12000,
      nativePending: false,
      activationAt: open.activationAt,
      suppressUntil: 14000,
      returnDurationMs: 2500,
    });
    assert.equal(consumed.consumed, true);
    assert.equal(consumed.returnPlan.nativePending, false);
    assert.equal(consumed.returnPlan.suppressUntil, 14500);

    const clear = model.systemFilePickerForegroundSuppressionState({
      nowMs: 15000,
      nativePending: false,
      activationAt: open.activationAt,
      suppressUntil: 14500,
    });
    assert.equal(clear.suppressed, false);
  });

  await test("draft state treats search mode as no composer draft", async () => {
    const model = await loadModule();
    assert.equal(model.composerHasDraftState({
      text: "  继续  ",
      pendingArtifacts: [],
    }).hasDraft, true);
    assert.equal(model.composerHasDraftState({
      text: "",
      pendingArtifacts: [{ id: "artifact_1" }],
    }).hasDraft, true);
    assert.equal(model.composerHasDraftState({
      searchMode: true,
      text: "搜索词",
      pendingArtifacts: [{ id: "artifact_1" }],
    }).hasDraft, false);
  });

  await test("focus lifecycle helpers are available to classic adapter", async () => {
    const model = await loadModule();
    assert.equal(typeof model.editableElementSelector, "function");
    assert.equal(typeof model.focusedEditableState, "function");
    assert.equal(typeof model.elementVisibleForFocus, "function");
    assert.equal(model.editableElementSelector(), model.EDITABLE_ELEMENT_SELECTOR);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
