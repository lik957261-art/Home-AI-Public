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
    "src/vite-islands/navigation-shell/sidebar-back-navigation-model.mjs",
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
  await test("sidebar back navigation model remains browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/sidebar-back-navigation-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot|document)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
  });

  await test("sidebar back navigation model preserves high-priority targets", async () => {
    const model = await loadModel();
    assert.equal(model.backSwipeTargetPlan({
      previewOpen: true,
      skillDetail: true,
      moviePluginBackActive: true,
    }), "artifact-preview");
    assert.equal(model.backSwipeTargetPlan({
      skillDetail: true,
      taskDetail: true,
    }), "skill");
    assert.equal(model.backSwipeTargetPlan({
      taskDetail: true,
      pluginTopicDetail: true,
      pluginContextTarget: "plugin-context-home",
    }), "plugin-context-home");
    assert.equal(model.backSwipeTargetPlan({
      taskDetail: true,
      pluginContextTarget: "plugin-context-home",
    }), "task");
    assert.equal(model.backSwipeTargetPlan({ kanbanComposerOpen: true }), "todo-create");
  });

  await test("sidebar back navigation model preserves plugin inner and outer ordering", async () => {
    const model = await loadModel();
    assert.equal(model.backSwipeTargetPlan({
      musicPluginBackActive: true,
      moviePluginBackActive: true,
    }), "music-plugin");
    assert.equal(model.backSwipeTargetPlan({
      moviePluginBackActive: true,
      moviePluginOuterBackActive: true,
    }), "movie-plugin");
    assert.equal(model.backSwipeTargetPlan({
      moviePluginOuterBackActive: true,
      pluginContextBack: false,
    }), "movie-plugin-outer");
    assert.equal(model.backSwipeTargetPlan({
      moviePluginOuterBackActive: true,
      pluginContextBack: true,
      pluginContextTarget: "plugin-context-home",
    }), "plugin-context-home");
  });

  await test("sidebar back navigation model preserves secondary and directory fallbacks", async () => {
    const model = await loadModel();
    assert.equal(model.backSwipeTargetPlan({ directoryTopicDraftActive: true }), "directory-topic-draft");
    assert.equal(model.backSwipeTargetPlan({ automationDetailInboxReturnActive: true }), "automation-secondary");
    assert.equal(model.backSwipeTargetPlan({ automationDetail: true }), "automation");
    assert.equal(model.backSwipeTargetPlan({ actionInboxCreate: true, actionInboxDetail: true }), "action-inbox-create");
    assert.equal(model.backSwipeTargetPlan({ actionInboxDetail: true }), "action-inbox");
    assert.equal(model.backSwipeTargetPlan({ projectsDirectoryActive: true }), "directory");
    assert.equal(model.backSwipeTargetPlan({}), "");
  });

  await test("sidebar back navigation model creates bounded native query plans", async () => {
    const model = await loadModel();
    assert.deepEqual(model.nativeBackQueryPlan({
      target: "movie-plugin",
      primaryBounce: false,
    }), {
      target: "movie-plugin",
      hasTarget: true,
      primaryBounce: false,
    });
    assert.deepEqual(model.nativeBackQueryPlan({}), {
      target: "",
      hasTarget: false,
      primaryBounce: false,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
