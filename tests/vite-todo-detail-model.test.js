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
    "src/vite-islands/navigation-shell/todo-detail-model.mjs",
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
  await test("todo detail model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/todo-detail-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans standard todo detail metadata", async () => {
    const model = await loadModel();
    const plan = model.todoDetailViewPlan({
      todo: {
        id: "todo-1",
        content: "Pay bill",
        assigneeLabel: "Owner",
        reminderLeadMinutes: 15,
        recurrenceLabel: "每周",
      },
      todoStatus: "open",
      open: true,
      kanban: false,
      kanbanStatus: "todo",
      statusText: "未完成",
      articleStatusClass: "open",
      dueLabel: "今天 18:00",
      createdAtLabel: "2026-07-05 09:00",
      updatedAtLabel: "2026-07-05 10:00",
      dueInputValue: "2026-07-05T18:00",
    });
    assert.equal(plan.kanban, false);
    assert.equal(plan.commentPanel.show, false);
    assert.equal(plan.managementPanel.show, true);
    assert.equal(plan.managementPanel.showComplete, true);
    assert.deepEqual(plan.gridItems.map((item) => item.label), ["负责人", "截止", "提醒", "重复", "创建", "更新"]);
  });

  await test("plans blocked kanban comment and management controls", async () => {
    const model = await loadModel();
    const plan = model.todoDetailViewPlan({
      todo: {
        id: "card-1",
        content: "Blocked card",
        kanbanBoard: "Board",
        kanbanAssignee: "worker",
        kanbanTenant: "tenant",
        kanbanWorkspaceKind: "workspace",
        kanbanCreatedBy: "owner",
        kanbanSkills: ["TypeScript", "Review"],
      },
      todoStatus: "open",
      open: true,
      kanban: true,
      kanbanStatus: "blocked",
      statusText: "阻塞",
      kanbanStatusText: "阻塞",
      canManage: true,
      canRevise: true,
      canComment: true,
      priorityLabel: "P1",
      dueLabel: "明天",
      boardLabel: "Board",
      commentDraft: "needs context\nkeep whitespace",
      dueInputValue: "2026-07-06T09:00",
    });
    assert.equal(plan.blocked, true);
    assert.equal(plan.commentPanel.show, true);
    assert.equal(plan.commentPanel.showComplete, true);
    assert.equal(plan.commentPanel.showUnblock, true);
    assert.equal(plan.commentPanel.draft, "needs context\nkeep whitespace");
    assert.equal(plan.managementPanel.showBlock, false);
    assert.equal(plan.managementPanel.showUnblock, true);
    assert.deepEqual(plan.skillLabels, ["TypeScript", "Review"]);
    assert.ok(plan.gridItems.some((item) => item.label === "优先级" && item.value === "P1"));
  });

  await test("suppresses generic controls for specialized learning cards", async () => {
    const model = await loadModel();
    const plan = model.todoDetailViewPlan({
      todo: { id: "reading-1", content: "Reading task" },
      todoStatus: "open",
      open: true,
      kanban: true,
      kanbanStatus: "todo",
      readingCard: true,
      canManage: true,
      canRevise: true,
      canComment: true,
    });
    assert.equal(plan.showGenericCommentPanel, false);
    assert.equal(plan.commentPanel.show, false);
    assert.equal(plan.managementPanel.show, true);
    assert.equal(plan.managementPanel.open, false);
    assert.equal(plan.managementPanel.showComplete, false);
  });

  await test("plans completed revision submission state", async () => {
    const model = await loadModel();
    const plan = model.todoDetailViewPlan({
      todo: { id: "done-1", status: "completed" },
      todoStatus: "completed",
      open: false,
      kanban: true,
      kanbanStatus: "done",
      canRevise: true,
      revisionDraft: "Please revise acceptance",
      revisionSubmitting: true,
    });
    assert.equal(plan.completed, true);
    assert.equal(plan.revisionPanel.show, true);
    assert.equal(plan.revisionPanel.submitting, true);
    assert.equal(plan.revisionPanel.buttonLabel, "正在创建...");
    assert.equal(plan.revisionPanel.draft, "Please revise acceptance");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
