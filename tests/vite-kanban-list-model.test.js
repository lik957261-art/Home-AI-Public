"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/kanban-list-model.mjs");

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
  const model = await loadModel();

  await test("kanban list model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/kanban-list-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /KANBAN_LIST_MODEL_VERSION/);
  });

  await test("plans tab counts and card view models", () => {
    assert.equal(model.kanbanTabCountPlan({
      status: "story",
      storyStatus: "story",
      storyCaseCount: 4,
      completedLoaded: true,
    }), "4");
    assert.equal(model.kanbanTabCountPlan({
      status: "done",
      itemCount: 2,
      completedLoaded: false,
      needsCompleted: true,
    }), "…");
    assert.deepEqual(model.todoKanbanCardViewPlan({
      todo: {
        id: "todo_1",
        content: "Write report",
        kanbanAssignee: "Owner",
        kanbanTenant: "Growth",
        kanbanWorkspaceKind: "workspace",
        kanbanSkills: ["a", "b", "c", "d"],
      },
      status: "doing",
      meta: { shortLabel: "Doing" },
      priority: "P1",
      due: "Today",
    }), {
      status: "doing",
      shortLabel: "Doing",
      title: "Write report",
      due: "Today",
      chips: ["P1", "@Owner", "Growth", "workspace"],
      skills: ["a", "b", "c"],
    });
  });

  await test("dedupes and filters kanban outputs", () => {
    assert.deepEqual(model.dedupeKanbanOutputsPlan([
      { url: "/a", name: "a" },
      { url: "/a", name: "duplicate" },
      { path: "/b", name: "b" },
      { name: "" },
    ]), [{ url: "/a", name: "a" }, { path: "/b", name: "b" }]);
    assert.deepEqual(model.kanbanCardOutputsPlan({
      todoOutputs: [{ name: "answer_key.md", path: "/answer_key.md" }, { name: "report.md", path: "/report.md" }],
      detailOutputs: [{ name: "sample_answers.md", path: "/sample_answers.md" }],
      isAssessment: true,
      assessmentVisible: true,
    }), [{ name: "report.md", path: "/report.md" }]);
    assert.deepEqual(model.kanbanCardOutputsPlan({
      todoOutputs: [{ name: "report.md", path: "/report.md" }],
      isAssessment: true,
      assessmentVisible: false,
    }), []);
  });

  await test("plans detail loading and report rows", () => {
    assert.equal(model.shouldAutoLoadKanbanDetailPlan({
      todo: { id: "todo_1", kanbanResult: "" },
      isKanbanTodoSource: true,
      hasDetail: false,
      outputCount: 0,
    }), true);
    assert.deepEqual(model.kanbanProcessRowsPlan({
      events: [{ kind: "start", preview: "started" }],
      runs: [{ profile: "owner", status: "done", summary: "finished" }],
    }), [
      { label: "start", text: "started" },
      { label: "owner / done", text: "finished" },
    ]);
    assert.deepEqual(model.kanbanDetailReportPlan({
      eligible: true,
      detail: { loading: false, error: "", events: [{ kind: "start", preview: "ok" }] },
      labels: { receipt: "Receipt" },
    }), {
      visible: true,
      loading: false,
      error: "",
      actionLabel: "刷新过程",
      title: "回执 / 过程",
      emptyText: "暂无回执摘要。",
      processRows: [{ label: "start", text: "ok" }],
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
