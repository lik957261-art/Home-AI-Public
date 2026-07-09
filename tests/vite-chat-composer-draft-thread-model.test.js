"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-draft-thread-model.mjs");

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

  await test("composer draft thread model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("identifies draft threads by flag or id prefix", () => {
    assert.equal(model.isDraftThreadRecord({ id: "thread_1", draft: true }), true);
    assert.equal(model.isDraftThreadRecord({ id: "draft_1_2" }), true);
    assert.equal(model.isDraftThreadRecord({ id: "thread_1" }), false);
    assert.equal(model.isDraftThreadRecord(null), false);
  });

  await test("creates a deterministic draft thread plan from selection context", () => {
    const plan = model.createDraftThreadPlan({
      sequence: 3,
      nowIso: "2026-07-04T06:00:00.000Z",
      nowMs: 1783144800000,
      workspaceId: "owner",
      projectId: "project_1",
      subprojectId: "sub_1",
    });

    assert.equal(plan.version, model.CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION);
    assert.equal(plan.sequence, 4);
    assert.deepEqual(plan.thread, {
      id: "draft_1783144800000_4",
      title: "New thread",
      workspaceId: "owner",
      projectId: "project_1",
      subprojectId: "sub_1",
      singleWindow: false,
      draft: true,
      hermesSessionId: "",
      status: "draft",
      activeRunId: null,
      activeRunIds: [],
      createdAt: "2026-07-04T06:00:00.000Z",
      updatedAt: "2026-07-04T06:00:00.000Z",
      messages: [],
      events: [],
      preview: "",
    });
  });

  await test("plans materialize request body and shared project detection", () => {
    const request = model.materializeDraftThreadRequestPlan({
      id: "draft_1_1",
      draft: true,
      workspaceId: "mk",
      projectId: "project_2",
      subprojectId: "",
      title: "",
    });
    assert.equal(request.draft, true);
    assert.equal(request.draftId, "draft_1_1");
    assert.deepEqual(request.body, {
      workspaceId: "mk",
      projectId: "project_2",
      subprojectId: "",
      title: "New thread",
    });

    assert.equal(model.materializeDraftThreadRequestPlan({ id: "thread_1" }).draft, false);
    assert.equal(model.isSharedProjectRecord({ source: "shared-allowed-root-owner" }), true);
    assert.equal(model.isSharedProjectRecord({ shared: true }), true);
    assert.equal(model.isSharedProjectRecord({ source: "local" }), false);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
