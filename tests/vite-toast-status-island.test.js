"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function loadModel() {
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/toast-status/model.mjs")).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("Vite config builds a development Toast Status island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /toast-status/);
    assert.match(configText, /\/vite-toast-status-preview\//);
    assert.match(configText, /src\/vite-islands\/toast-status\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/toast-status/index.html");
    const builtPreview = read("public/vite-preview/toast-status.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/toast-status\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/toast-status\/toast-status\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/toast-status/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/toast-status/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/toast-status/);
  });

  await test("model normalizes toast tone duration action and status", async () => {
    const model = await loadModel();
    assert.equal(model.normalizeToastTone("success"), "success");
    assert.equal(model.normalizeToastTone("bad"), "info");
    assert.equal(model.clampDurationMs(50), model.MIN_DURATION_MS);
    assert.equal(model.clampDurationMs(50000), model.MAX_DURATION_MS);
    assert.equal(model.clampDurationMs(undefined, "success"), model.DEFAULT_SUCCESS_DURATION_MS);

    const toast = model.createToastState("Saved", {
      tone: "success",
      actionLabel: "Open",
      actionId: "open-result",
      durationMs: 900,
    }, 1000);
    assert.equal(toast.visible, true);
    assert.equal(toast.actionable, true);
    assert.equal(toast.expiresAt, 1900);
    assert.equal(model.expireToastState(toast, 1500).visible, true);
    assert.equal(model.expireToastState(toast, 1900).visible, false);
    assert.equal(model.recordToastAction(toast, 2000).clickCount, 1);

    const status = model.createStatusState("Connected", { tone: "warning", detail: "demo" }, 3000);
    assert.deepEqual(status, {
      version: model.TOAST_STATUS_MODEL_VERSION,
      message: "Connected",
      tone: "warning",
      detail: "demo",
      updatedAt: 3000,
    });

    const preview = model.addToastToPreviewState(model.createToastStatusPreviewState({ now: 1000 }), toast, 2);
    assert.equal(preview.history.length, 2);
    assert.equal(model.setStatusInPreviewState(preview, status).lastAction, "status");
  });

  await test("source uses runtime facade feedback and avoids production boundaries", async () => {
    const source = read("src/vite-islands/toast-status/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /runtime\.feedback/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /HomeAIViteToastStatusPreview/);
    assert.doesNotMatch(source, /window\.confirm|window\.prompt|window\.alert/);
    assert.doesNotMatch(source, /\bconfirm\(/);
    assert.doesNotMatch(source, /\bprompt\(/);
    assert.doesNotMatch(source, /\balert\(/);
    assert.doesNotMatch(source, /localStorage|X-Hermes-Web-Key|\bfetch\(/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/toast-status/toast-status.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/toast-status/toast-status.js");
    assert.match(output, /Toast \/ Status/);
    assert.match(output, /HomeAIViteToastStatusPreview/);
    assert.match(output, /feedback:status/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
