"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-source-model.mjs");
const options = [
  { source: "local", label: "本地数据", shortLabel: "本地" },
  { source: "web", label: "网络搜索", shortLabel: "网络" },
  { source: "x", label: "X 搜索", shortLabel: "X" },
];

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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
  const model = await loadModel();

  await test("composer source model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_SOURCE_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("normalizes aliases and detects explicit source commands", () => {
    assert.equal(model.normalizeComposerSearchSourceValue(" web-search "), "web");
    assert.equal(model.normalizeComposerSearchSourceValue("推特"), "x");
    assert.equal(model.normalizeComposerSearchSourceValue("unknown"), "local");
    assert.equal(model.composerSearchSourceCommandPlan({ text: "#web 查一下", options }).source, "web");
    assert.equal(model.composerSearchSourceCommandPlan({ text: "请 #X 搜索", options }).source, "x");
    assert.equal(model.composerSearchSourceCommandPlan({ text: "普通文本", options }), null);
  });

  await test("plans selected source info from manual and auto hints", () => {
    assert.deepEqual(model.selectedComposerSearchSourceInfoPlan({
      text: "帮我搜索网络上的资料",
      manualSource: "local",
      options,
    }), {
      source: "web",
      label: "网络搜索",
      shortLabel: "网络",
      commandExplicit: true,
      explicit: true,
      manualExplicit: false,
      autoDetected: true,
      sourceMode: "auto",
    });

    assert.equal(model.selectedComposerSearchSourceInfoPlan({
      text: "搜索网络",
      manualSource: "x",
      options,
    }).sourceMode, "manual");
  });

  await test("plans source selection toggle and control state", () => {
    assert.deepEqual(model.chooseComposerSearchSourcePlan({
      currentSource: "web",
      source: "web",
    }), {
      version: model.CHAT_COMPOSER_SOURCE_MODEL_VERSION,
      nextSource: "local",
    });

    const info = model.selectedComposerSearchSourceInfoPlan({
      text: "#x news",
      manualSource: "local",
      options,
    });
    assert.deepEqual(model.composerSourceControlPlan({
      searchMode: false,
      viewMode: "single",
      info,
    }), {
      version: model.CHAT_COMPOSER_SOURCE_MODEL_VERSION,
      hidden: false,
      canUse: true,
      active: false,
      autoDetected: true,
      title: "已自动识别本句信源：X 搜索",
    });

    assert.equal(model.composerSourceToggleButtonPlan({
      source: "x",
      info,
      option: options[2],
      canUse: true,
    }).autoDetected, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
