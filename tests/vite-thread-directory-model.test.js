"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/thread-directory-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

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
  await test("thread-directory model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/thread-directory-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("normalizes and dedupes message directory aliases", async () => {
    const model = await loadModel();
    const plan = model.messageDirectoryAliasesPlan({
      directoryAliases: [
        { label: " Health ", path: "/Health", source: "ignored" },
        { name: "Health", root: "/Health" },
      ],
      directoryRoute: { label: "Projects", root: "/Projects", projectId: "projects" },
    });
    assert.equal(plan.version, model.THREAD_DIRECTORY_MODEL_VERSION);
    assert.deepEqual(plan.aliases, [
      { label: "Health", path: "/Health", projectId: "", subprojectId: "", source: "bound" },
      { label: "Projects", path: "/Projects", projectId: "projects", subprojectId: "", source: "bound" },
    ]);
  });

  await test("plans extracted aliases and task filter matches", async () => {
    const model = await loadModel();
    const extracted = model.messageExtractedDirectoryAliasesPlan({
      messageId: "message-1",
      extractedAliases: [{ label: "Docs", path: "/Docs" }],
      mediaAliases: [{ label: "Image", path: "/Docs/image.png", referenceKind: "media" }],
    });
    assert.deepEqual(extracted.aliases.map((alias) => [alias.label, alias.messageId, alias.source, alias.referenceKind || ""]), [
      ["Docs", "message-1", "extracted", ""],
      ["Image", "message-1", "media", "media"],
    ]);
    assert.equal(model.taskDirectoryRouteMatchesFilterPlan({
      route: { projectId: "docs", subprojectId: "api" },
      filter: { projectId: "docs", subprojectId: "api" },
    }).matches, true);
    assert.equal(model.taskDirectoryRouteMatchesFilterPlan({
      route: { projectId: "docs", subprojectId: "api" },
      filter: { projectId: "docs", subprojectId: "ux" },
    }).matches, false);
  });

  await test("plans filter mutations and bounded view state", async () => {
    const model = await loadModel();
    const setPlan = model.setTaskDirectoryFilterPlan({
      projectId: "docs",
      subprojectId: "api",
      label: "Docs / API",
      directory: { projectId: "docs", subprojectId: "api" },
    });
    assert.equal(setPlan.ok, true);
    assert.deepEqual(setPlan.storage, { key: "hermesWebViewMode", value: "tasks" });
    assert.deepEqual(setPlan.patch.taskDirectoryFilter, {
      projectId: "docs",
      subprojectId: "api",
      label: "Docs / API",
      directory: { projectId: "docs", subprojectId: "api" },
    });
    assert.equal(model.clearTaskDirectoryFilterPlan({ render: false }).render, false);
    assert.deepEqual(model.taskDirectoryFilterBannerViewPlan({ active: true, label: "Docs" }), {
      version: model.THREAD_DIRECTORY_MODEL_VERSION,
      visible: true,
      label: "Docs",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
