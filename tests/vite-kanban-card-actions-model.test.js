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
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/navigation-shell/kanban-card-actions-model.mjs")).href;
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
  await test("kanban card actions model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/kanban-card-actions-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch|setInterval|setTimeout)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans todo creation payload and kanban status storage patch", async () => {
    const model = await loadModel();
    const plan = model.todoCreatePayloadPlan({
      workspaceId: "owner",
      assignee: "alice",
      content: " Ship task ",
      dueValue: "2026-07-05T10:30",
      recurrence: "",
      recurrenceDays: "1,3",
      isKanban: true,
    });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.payload, {
      workspaceId: "owner",
      assignee: "alice",
      content: "Ship task",
      dueTime: "2026-07-05 10:30",
      recurrence: "none",
      recurrenceDays: "1,3",
    });
    assert.deepEqual(plan.statePatch, { todoCreateOpen: false, todoKanbanStatus: "todo" });
    assert.deepEqual(plan.storagePatch, { hermesTodoKanbanStatus: "todo" });
    assert.equal(model.todoCreatePayloadPlan({ isKanban: false, content: "x" }).ok, false);
  });

  await test("plans action bodies and progress rows", async () => {
    const model = await loadModel();
    assert.deepEqual(model.kanbanActionRequestPlan({
      todoId: "t1",
      action: "complete",
      body: { comment: "done" },
    }), {
      todoId: "t1",
      action: "complete",
      method: "POST",
      bodyExtra: { comment: "done" },
    });
    const rows = model.learningGrowthProgressRowsPlan({ elapsedSeconds: 9 });
    assert.equal(rows[0].status, "done");
    assert.equal(rows[2].status, "active");
    assert.equal(rows.at(-1).status, "pending");
  });

  await test("plans learning growth feedback messages", async () => {
    const model = await loadModel();
    const success = model.learningGrowthSubmissionSuccessFeedbackPlan({
      evaluation: { score: 88, nextStep: "completed", report: { path: "report.md" } },
      reward: { status: "settled", coinAmount: 5 },
    });
    assert.equal(success.kind, "success");
    assert.match(success.message, /88\/100/);
    assert.match(success.message, /Markdown/);
    assert.match(success.message, /5/);
    const reflection = model.learningGrowthReflectionFeedbackPlan({
      reflection: { status: "accepted" },
      evaluation: { score: 91 },
      reward: { status: "settled", coinAmount: 3 },
    });
    assert.equal(reflection.kind, "success");
    assert.match(reflection.message, /91\/100/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
