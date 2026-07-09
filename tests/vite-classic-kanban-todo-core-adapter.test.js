"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-kanban-todo-core-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const context = {
    console,
    Promise,
    Date,
    window: {
      __homeAiImportKanbanTodoCoreModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      selectedWorkspaceId: "owner",
      todoAssignees: [
        { id: "owner", label: "Owner" },
        { id: "worker", label: "Worker" },
      ],
    },
    escapeHtml,
    formatTime(value) { return value ? `formatted:${value}` : ""; },
    compactDisplayText(value, max) {
      const text = String(value || "").trim();
      return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
    },
    kanbanActiveStoryCases() { return []; },
    renderKanbanArchiveCase() { return ""; },
    __calls: calls,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-kanban-todo-core-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  await test("classic kanban todo core adapter declares bounded ESM import path", () => {
    assert.match(source, /KANBAN_TODO_CORE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/kanban-todo-core-model\/kanban-todo-core-model\.js/);
    assert.match(source, /__homeAiImportKanbanTodoCoreModel/);
    assert.match(source, /importKanbanTodoCoreModel/);
    assert.match(source, /currentKanbanTodoCoreModel/);
    assert.match(source, /todoAssigneeOptionsPlan/);
  });

  await test("classic kanban todo core adapter uses ESM functions after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      todoDueLabelPlan(input) {
        modelCalls.push(["todoDueLabelPlan", input.formattedDueAt]);
        return "model due";
      },
      todoTitlePlan(todo, options) {
        modelCalls.push(["todoTitlePlan", todo.id, options.max]);
        return "model title";
      },
      todoMatchesOpenPlan(todo) {
        modelCalls.push(["todoMatchesOpenPlan", todo.status]);
        return true;
      },
      defaultTodoAssigneePlan(input) {
        modelCalls.push(["defaultTodoAssigneePlan", input.selectedWorkspaceId]);
        return "worker";
      },
      todoAssigneeOptionsPlan(input) {
        modelCalls.push(["todoAssigneeOptionsPlan", input.selected]);
        return {
          options: [
            { value: "owner", label: "Owner", selected: false },
            { value: "worker", label: "Worker", selected: true },
          ],
        };
      },
      localDateTimeInputValuePlan(value) {
        modelCalls.push(["localDateTimeInputValuePlan", value]);
        return "2026-07-05T08:00";
      },
      todoDueInputValuePlan(todo) {
        modelCalls.push(["todoDueInputValuePlan", todo.id]);
        return "2026-07-06T09:00";
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    assert.equal(vm.runInContext("todoDueLabel({ id: 'card-1', dueAt: 'x' })", context), "model due");
    assert.equal(vm.runInContext("todoTitle({ id: 'card-1', content: 'Classic' })", context), "model title");
    assert.equal(vm.runInContext("todoMatchesOpen({ status: 'done' })", context), true);
    assert.equal(vm.runInContext("defaultTodoAssignee()", context), "worker");
    assert.match(vm.runInContext("renderTodoAssigneeOptions('worker')", context), /value="worker" selected/);
    assert.equal(vm.runInContext("localDateTimeInputValue('2026-07-05T08:00:00')", context), "2026-07-05T08:00");
    assert.equal(vm.runInContext("todoDueInputValue({ id: 'card-1' })", context), "2026-07-06T09:00");
    assert.deepEqual(modelCalls.map((call) => call[0]), [
      "todoDueLabelPlan",
      "todoTitlePlan",
      "todoMatchesOpenPlan",
      "defaultTodoAssigneePlan",
      "todoAssigneeOptionsPlan",
      "localDateTimeInputValuePlan",
      "todoDueInputValuePlan",
    ]);
  });

  await test("classic kanban todo core adapter keeps fallback before ESM model loads", async () => {
    const context = createHarness(null, () => new Promise(() => {}));
    assert.equal(vm.runInContext("todoDueLabel({ dueAt: 'soon' })", context), "formatted:soon");
    assert.equal(vm.runInContext("todoTitle({ content: 'Classic card' })", context), "Classic card");
    assert.equal(vm.runInContext("todoMatchesOpen({ status: 'closed' })", context), false);
    assert.equal(vm.runInContext("defaultTodoAssignee()", context), "owner");
    assert.match(vm.runInContext("renderTodoAssigneeOptions('worker')", context), /value="worker" selected/);
    assert.equal(vm.runInContext("todoDueInputValue({ dueLocal: '2026-07-07 10:45' })", context), "2026-07-07T10:45");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
