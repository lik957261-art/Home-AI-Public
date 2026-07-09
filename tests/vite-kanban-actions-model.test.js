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
    "src/vite-islands/navigation-shell/kanban-actions-model.mjs",
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
  await test("kanban actions model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-actions-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("plans composer draft storage and mode changes", async () => {
    const model = await loadModel();
    assert.deepEqual(
      model.kanbanComposerDraftStoragePatch(" task "),
      { action: "set", key: "hermesKanbanComposerDraft", value: " task " },
    );
    assert.deepEqual(
      model.kanbanComposerDraftStoragePatch(""),
      { action: "remove", key: "hermesKanbanComposerDraft", value: "" },
    );
    assert.deepEqual(
      model.kanbanComposerModeSelectionPlan("multi"),
      { mode: "multi", kanbanPlanDraft: null, preserveScroll: true },
    );
  });

  await test("plans document removal and kanban status selection", async () => {
    const model = await loadModel();
    assert.deepEqual(
      model.kanbanComposerDocumentRemovalPlan([{ name: "a" }, { name: "b" }], 0),
      { ok: true, documents: [{ name: "b" }], preserveScroll: true },
    );
    assert.deepEqual(
      model.kanbanComposerDocumentRemovalPlan([{ name: "a" }], "x"),
      { ok: false, documents: [{ name: "a" }], preserveScroll: false },
    );
    assert.deepEqual(
      model.kanbanStatusSelectionPlan(" Done ", ["todo", "done"], {
        completedLoaded: false,
        needsCompleted: (status) => status === "done",
      }),
      { ok: true, status: "done", storageKey: "hermesTodoKanbanStatus", shouldLoadCompleted: true },
    );
    assert.deepEqual(
      model.kanbanStatusSelectionPlan("bad", ["todo"], {}),
      { ok: false, status: "", storageKey: "hermesTodoKanbanStatus", shouldLoadCompleted: false },
    );
  });

  await test("plans story expansion, choices, and bounded steps", async () => {
    const model = await loadModel();
    assert.deepEqual(
      model.kanbanStoryExpandedPatch({ story1: false }, " story1 "),
      { ok: true, expanded: { story1: true } },
    );
    assert.deepEqual(model.kanbanChoiceSelectionPatch([1], 2, "3"), { ok: true, answers: [1, , 3] });
    assert.deepEqual(model.kanbanChoiceSelectionPatch([1], "bad", "3"), { ok: false, answers: [1] });
    assert.equal(model.kanbanPreviousStepPlan(0), 0);
    assert.equal(model.kanbanPreviousStepPlan(3), 2);
    assert.equal(model.kanbanNextStepPlan(8, 10, 10), 9);
    assert.equal(model.kanbanNextStepPlan(9, 10, 10), 9);
    assert.equal(model.kanbanNextStepPlan(0, 0, 20), 1);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
