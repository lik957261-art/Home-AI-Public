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
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/dialog-sheet/model.mjs")).href;
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
  await test("Vite config builds a development Dialog Sheet island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /dialog-sheet/);
    assert.match(configText, /dialogSheetModelEntry/);
    assert.match(configText, /"dialog-sheet-model": dialogSheetModelEntry/);
    assert.match(configText, /\/vite-dialog-sheet-preview\//);
    assert.match(configText, /src\/vite-islands\/dialog-sheet\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/dialog-sheet/index.html");
    const builtPreview = read("public/vite-preview/dialog-sheet.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/dialog-sheet\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/dialog-sheet\/dialog-sheet\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/dialog-sheet/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/dialog-sheet/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/dialog-sheet/);
  });

  await test("model normalizes classic confirm prompt message behavior", async () => {
    const model = await loadModel();
    const confirm = model.createDialogState("confirm", {
      title: "Delete",
      confirmLabel: "Delete",
      danger: true,
    });
    assert.equal(confirm.kind, "confirm");
    assert.equal(confirm.open, true);
    assert.equal(confirm.options.danger, true);
    assert.equal(model.dialogCanCancel(confirm), true);
    assert.deepEqual(model.dialogButtonPlan(confirm).map((button) => button.id), ["cancel", "confirm"]);
    assert.deepEqual(model.closeDialogState(confirm, "cancel").result, {
      settled: true,
      value: false,
      reason: "cancel",
    });
    assert.deepEqual(model.closeDialogState(confirm, "confirm").result, {
      settled: true,
      value: true,
      reason: "confirm",
    });

    const prompt = model.createDialogState("prompt", {
      defaultValue: "abc",
      multiline: true,
    });
    assert.equal(model.dialogNeedsInput(prompt), true);
    assert.deepEqual(model.closeDialogState(prompt, "confirm", "next").result, {
      settled: true,
      value: "next",
      reason: "confirm",
    });

    const message = model.createDialogState("unknown", {});
    assert.equal(message.kind, "message");
    assert.equal(model.dialogCanCancel(message), false);
    assert.deepEqual(model.dialogButtonPlan(message).map((button) => button.id), ["confirm"]);
  });

  await test("source uses runtime facade and avoids native browser dialogs", async () => {
    const source = read("src/vite-islands/dialog-sheet/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /HomeAIViteDialogSheetPreview/);
    assert.doesNotMatch(source, /window\.confirm|window\.prompt|window\.alert/);
    assert.doesNotMatch(source, /\bconfirm\(/);
    assert.doesNotMatch(source, /\bprompt\(/);
    assert.doesNotMatch(source, /\balert\(/);
    assert.doesNotMatch(source, /localStorage|X-Hermes-Web-Key|\bfetch\(/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/dialog-sheet/dialog-sheet.js"),
      "run npm run build:vite before this test",
    );
    assert.ok(
      exists("public/vite-islands/dialog-sheet-model/dialog-sheet-model.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/dialog-sheet/dialog-sheet.js");
    assert.match(output, /Dialog Sheet/);
    assert.match(output, /确认操作|删除话题/);
    assert.match(output, /HomeAIViteDialogSheetPreview/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
