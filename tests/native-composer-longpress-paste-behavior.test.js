"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const focusGuardSource = fs.readFileSync(
  path.join(repoRoot, "src/vite-app/runtime/focus-lifecycle-guard.mjs"),
  "utf8",
);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { margin: 0; min-height: 844px; }
            #composer {
              position: fixed;
              left: 12px;
              right: 12px;
              bottom: 12px;
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 8px;
              padding: 8px;
              border: 1px solid #ccc;
              background: #fff;
            }
            #messageInput { min-height: 44px; font-size: 16px; }
            #composerChrome { width: 44px; border: 0; background: #eee; }
            #pasteOverlay { position: fixed; inset: 0; }
          </style>
        </head>
        <body>
          <div id="pasteOverlay" hidden></div>
          <form id="composer">
            <textarea id="messageInput"></textarea>
            <button id="composerChrome" type="button" aria-label="Composer chrome"></button>
          </form>
        </body>
      </html>`);

    const result = await page.evaluate(async (source) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const focusGuard = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);

      let nowMs = 1000;
      const input = document.getElementById("messageInput");
      const composer = document.getElementById("composer");
      const chrome = document.getElementById("composerChrome");
      const overlay = document.getElementById("pasteOverlay");
      const blurEvents = [];
      input.addEventListener("blur", () => blurEvents.push({ at: nowMs }));

      const guard = focusGuard.createEditableFocusLifecycleGuard({
        documentRef: document,
        root: window,
        isNativeShell: () => true,
        getComposerInput: () => input,
        getComposerContainer: () => composer,
        nowMs: () => nowMs,
        nativeComposerPasteMenuPreserveMs: 1200,
      });
      guard.install();

      input.focus();
      const initialActive = document.activeElement === input;
      chrome.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
      nowMs += 600;
      overlay.hidden = false;
      overlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      const activeDuringPasteMenuContinuation = document.activeElement === input;
      const blurCountDuringPasteMenuContinuation = blurEvents.length;

      nowMs += 1300;
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      const activeAfterSuppressionWindow = document.activeElement === input;

      guard.dispose();
      return {
        initialActive,
        activeDuringPasteMenuContinuation,
        blurCountDuringPasteMenuContinuation,
        activeAfterSuppressionWindow,
        blurCountFinal: blurEvents.length,
      };
    }, focusGuardSource);

    assert.equal(result.initialActive, true);
    assert.equal(result.activeDuringPasteMenuContinuation, true);
    assert.equal(result.blurCountDuringPasteMenuContinuation, 0);
    assert.equal(result.activeAfterSuppressionWindow, false);
    assert.equal(result.blurCountFinal, 1);

    const focusedTextareaBlurResult = await page.evaluate(async (source) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const focusGuard = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);

      let nowMs = 5000;
      const input = document.getElementById("messageInput");
      const composer = document.getElementById("composer");
      const blurEvents = [];
      const focusEvents = [];
      const inputEvents = [];
      const pasteEvents = [];
      input.value = "";
      input.addEventListener("blur", () => blurEvents.push({ at: nowMs }), { once: true });
      input.addEventListener("focus", () => focusEvents.push({ at: nowMs }));
      input.addEventListener("input", () => inputEvents.push({ at: nowMs, valueLength: input.value.length }));
      input.addEventListener("paste", (event) => {
        pasteEvents.push({ at: nowMs });
        event.preventDefault();
        const text = event.clipboardData?.getData("text/plain") || "";
        input.setRangeText(text, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      const guard = focusGuard.createEditableFocusLifecycleGuard({
        documentRef: document,
        root: window,
        isNativeShell: () => true,
        getComposerInput: () => input,
        getComposerContainer: () => composer,
        nowMs: () => nowMs,
        nativeComposerPasteMenuPreserveMs: 1200,
      });
      guard.install();

      input.focus();
      const focusedBeforeSecondTouch = document.activeElement === input;
      input.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
      nowMs += 300;
      input.blur();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const refocusedAfterNativeBlur = document.activeElement === input;
      const data = new DataTransfer();
      data.setData("text/plain", "粘贴文本");
      input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
      const valueAfterPaste = input.value;

      nowMs += 1500;
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      const activeAfterWindow = document.activeElement === input;
      const finalStatus = guard.status();
      guard.dispose();
      return {
        focusedBeforeSecondTouch,
        refocusedAfterNativeBlur,
        valueAfterPaste,
        blurCount: blurEvents.length,
        focusCount: focusEvents.length,
        inputCount: inputEvents.length,
        pasteCount: pasteEvents.length,
        activeAfterWindow,
        finalStatus,
      };
    }, focusGuardSource);

    assert.equal(focusedTextareaBlurResult.focusedBeforeSecondTouch, true);
    assert.equal(focusedTextareaBlurResult.refocusedAfterNativeBlur, true);
    assert.equal(focusedTextareaBlurResult.valueAfterPaste, "粘贴文本");
    assert.equal(focusedTextareaBlurResult.blurCount, 1);
    assert.ok(focusedTextareaBlurResult.focusCount >= 1);
    assert.equal(focusedTextareaBlurResult.inputCount, 1);
    assert.equal(focusedTextareaBlurResult.pasteCount, 1);
    assert.equal(focusedTextareaBlurResult.activeAfterWindow, false);
    assert.equal(focusedTextareaBlurResult.finalStatus.lastBlurred, true);
  } finally {
    await browser.close();
  }

  console.log("native composer long-press paste behavior harness passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
