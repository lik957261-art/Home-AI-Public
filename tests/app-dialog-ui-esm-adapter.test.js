"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function loadBuiltModel() {
  const source = read("public/vite-islands/dialog-sheet-model/dialog-sheet-model.js");
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${Date.now()}-${Math.random()}`);
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
  await test("classic dialog adapter imports the built Dialog Sheet ESM model", () => {
    const classic = read("public/app-dialog-ui.js");
    const viteConfig = read("vite.config.js");
    assert.match(classic, /APP_DIALOG_ESM_MODEL_PATH/);
    assert.match(classic, /\/vite-islands\/dialog-sheet-model\/dialog-sheet-model\.js/);
    assert.match(classic, /importDialogModel/);
    assert.match(classic, /createDialogState/);
    assert.match(classic, /closeDialogState/);
    assert.match(classic, /dialogButtonPlan/);
    assert.match(classic, /dialogCanCancel/);
    assert.match(classic, /dialogNeedsInput/);
    assert.match(viteConfig, /dialogSheetModelEntry/);
    assert.match(viteConfig, /"dialog-sheet-model": dialogSheetModelEntry/);
    assert.doesNotMatch(classic, /window\.confirm|window\.prompt|window\.alert/);
    assert.doesNotMatch(classic, /\bconfirm\(/);
    assert.doesNotMatch(classic, /\bprompt\(/);
    assert.doesNotMatch(classic, /\balert\(/);
  });

  await test("built Dialog Sheet model artifact is importable and browser-global free", async () => {
    assert.ok(
      exists("public/vite-islands/dialog-sheet-model/dialog-sheet-model.js"),
      "run npm run build:vite before this test",
    );
    const built = read("public/vite-islands/dialog-sheet-model/dialog-sheet-model.js");
    assert.match(built, /createDialogState/);
    assert.match(built, /closeDialogState/);
    assert.doesNotMatch(built, /document\.|window\.|localStorage|sessionStorage|\bfetch\(/);

    const model = await loadBuiltModel();
    const prompt = model.createDialogState("prompt", {
      title: "Rename",
      defaultValue: "old",
      confirmLabel: "Save",
    });
    assert.equal(prompt.kind, "prompt");
    assert.equal(model.dialogNeedsInput(prompt), true);
    assert.deepEqual(model.dialogButtonPlan(prompt).map((button) => button.id), ["cancel", "confirm"]);
    assert.deepEqual(model.closeDialogState(prompt, "confirm", "new").result, {
      settled: true,
      value: "new",
      reason: "confirm",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
