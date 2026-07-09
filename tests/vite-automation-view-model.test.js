"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/automation-view-model.mjs",
  )).href;
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
  await test("automation view model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/automation-view-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("plans view-mode flags and plugin dock activity", async () => {
    const model = await loadModel();
    const chat = model.automationViewModeFlagsPlan({ viewMode: "single", singleWindowMode: "chat" });
    assert.equal(chat.single, true);
    assert.equal(chat.chatSingle, true);
    assert.equal(chat.taskNavigationActive, false);
    assert.equal(model.automationThreadSearchPlaceholderPlan(chat), "Search chat");

    const codex = model.automationViewModeFlagsPlan({ viewMode: "codex" });
    assert.equal(codex.codex, true);
    assert.equal(codex.bottomPluginActive, false);

    const music = model.automationViewModeFlagsPlan({ viewMode: "music" });
    assert.equal(music.music, true);
    assert.equal(music.bottomPluginActive, true);
    assert.equal(model.automationThreadSearchPlaceholderPlan(music), "Search music");

    const workspaceConsole = model.automationViewModeFlagsPlan({ viewMode: "workspace-console" });
    assert.equal(workspaceConsole.workspaceConsole, true);
    assert.equal(workspaceConsole.bottomPluginActive, false);
    assert.equal(model.automationThreadSearchPlaceholderPlan(workspaceConsole), "Search workspaces");
  });

  await test("plans new-thread visibility and search placeholders", async () => {
    const model = await loadModel();
    const directories = model.automationViewModeFlagsPlan({ viewMode: "projects" });
    assert.deepEqual(
      model.automationNewThreadPlan(directories),
      { hidden: true, disabled: true, text: "新建话题" },
    );
    assert.equal(model.automationThreadSearchPlaceholderPlan(directories), "Search directories");

    const todo = model.automationViewModeFlagsPlan({ viewMode: "todos" });
    assert.deepEqual(
      model.automationNewThreadPlan(todo),
      { hidden: true, disabled: true, text: "新建看板卡片" },
    );
    assert.equal(model.automationThreadSearchPlaceholderPlan(todo), "Search Kanban");

    const workspaceConsole = model.automationViewModeFlagsPlan({ viewMode: "workspace-console" });
    assert.deepEqual(
      model.automationNewThreadPlan(workspaceConsole),
      { hidden: true, disabled: true, text: "新建话题" },
    );
  });

  await test("plans legacy redirects and automation route load options", async () => {
    const model = await loadModel();
    assert.deepEqual(
      model.automationLegacyViewRedirectPlan("capabilities"),
      { viewMode: "tasks", storageKey: "hermesWebViewMode", storageValue: "tasks", redirected: true },
    );
    assert.deepEqual(
      model.automationLegacyViewRedirectPlan("learning"),
      { viewMode: "growth", storageKey: "hermesWebViewMode", storageValue: "growth", redirected: true },
    );
    assert.deepEqual(
      model.automationLegacyViewRedirectPlan("automation"),
      { viewMode: "automation", storageKey: "", storageValue: "", redirected: false },
    );
    assert.deepEqual(model.automationLoadOptionsPlan(false), {});
    assert.deepEqual(
      model.automationLoadOptionsPlan(true),
      { detail: "full", refresh: true, ignoreSearch: true, routeTarget: true },
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
