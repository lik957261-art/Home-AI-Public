"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-todo-detail-ui.js"), "utf8");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createHarness(fakeModel = null, importer = null, overrides = {}) {
  const calls = [];
  const todo = {
    id: "card-1",
    content: "Classic card",
    status: "open",
    assigneeLabel: "Owner",
    reminderLeadMinutes: 20,
    recurrenceLabel: "不重复",
    kanbanBoard: "Board",
    kanbanAssignee: "worker",
    kanbanTenant: "tenant",
    kanbanWorkspaceKind: "project",
    kanbanCreatedBy: "owner",
    kanbanStartedAt: "2026-07-05T08:00:00Z",
    kanbanSkills: ["Review"],
  };
  const context = {
    console,
    Promise,
    state: {
      todoCommentDrafts: { "card-1": "classic comment" },
      todoRevisionDrafts: { "card-1": "classic revision" },
      todoRevisionSubmitting: {},
    },
    window: {
      __homeAiImportTodoDetailModel(importPath) {
        calls.push(["import", importPath]);
        if (typeof importer === "function") return importer(importPath);
        return Promise.resolve(fakeModel);
      },
    },
    escapeHtml,
    todoMatchesOpen(item) { return item?.status !== "completed" && item?.status !== "cancelled"; },
    isKanbanTodoSource() { return true; },
    normalizedKanbanStatus(item) { return item?.kanbanStatus || "blocked"; },
    isKanbanReadingCard() { return false; },
    isKanbanAssessmentCard() { return false; },
    isKanbanLearningGrowthCard() { return false; },
    kanbanCan(_todo, capability) {
      return ["canManage", "canRevise", "canComment"].includes(capability);
    },
    kanbanStatusText() { return "阻塞"; },
    todoStatusText() { return "未完成"; },
    todoStatusLabel() { return "open"; },
    todoDueLabel() { return "明天 09:00"; },
    todoBoardLabel() { return "Default board"; },
    todoPriorityLabel() { return "P1"; },
    todoTimestampLabel(value) { return value ? `ts:${value}` : ""; },
    todoDueInputValue() { return "2026-07-06T09:00"; },
    renderTodoDetailGridItem(label, value) {
      const text = String(value || "").trim();
      return text ? `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>` : "";
    },
    kanbanCaseCover() { return { url: "cover" }; },
    renderKanbanCaseCover() { return "<section data-cover>cover</section>"; },
    renderKanbanDeliveryFiles() { return "<section data-delivery>delivery</section>"; },
    renderKanbanReadingWorkflowPanel() { return ""; },
    renderKanbanReadingQuizPanel() { return ""; },
    renderKanbanAssessmentExamPanel() { return ""; },
    renderKanbanDetailReport() { return "<section data-report>report</section>"; },
    renderKanbanReadingSubmissionPanel() { return ""; },
    renderKanbanLearningGrowthTodoPanel() { return ""; },
    __calls: calls,
    __todo: todo,
    ...overrides,
  };
  if (overrides.window) {
    context.window = Object.assign(context.window, overrides.window);
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-todo-detail-ui.js" });
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
  await test("classic todo detail adapter declares bounded ESM import path", () => {
    assert.match(source, /TODO_DETAIL_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/todo-detail-model\/todo-detail-model\.js/);
    assert.match(source, /__homeAiImportTodoDetailModel/);
    assert.match(source, /importTodoDetailModel/);
    assert.match(source, /currentTodoDetailModel/);
    assert.match(source, /todoDetailViewPlan/);
  });

  await test("classic todo detail adapter uses ESM plan after import", async () => {
    const modelCalls = [];
    const fakeModel = {
      todoDetailViewPlan(input) {
        modelCalls.push(input);
        return {
          todoId: "card-1",
          content: "Model card",
          open: true,
          kanban: true,
          kanbanStatus: "blocked",
          blocked: true,
          completed: false,
          readingCard: false,
          assessmentCard: false,
          learningGrowthCard: false,
          canManage: true,
          canRevise: true,
          canComment: true,
          canCommentAndManage: true,
          showGenericCommentPanel: true,
          statusText: "模型阻塞",
          statusClass: "blocked",
          articleStatusClass: "model-open",
          gridItems: [
            { label: "负责人", value: "Model Owner" },
            { label: "优先级", value: "P0" },
          ],
          skillLabels: ["Model Skill"],
          commentPanel: {
            show: true,
            draft: "model comment",
            showComplete: true,
            showUnblock: true,
          },
          revisionPanel: { show: false },
          managementPanel: {
            show: true,
            open: true,
            showComplete: true,
            showBlock: false,
            showUnblock: true,
            dueInputValue: "2026-07-07T10:30",
          },
        };
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();
    const html = vm.runInContext("renderTodoDetail(__todo)", context);
    assert.equal(modelCalls.length, 1);
    assert.equal(modelCalls[0].kanbanStatus, "blocked");
    assert.match(html, /Model card/);
    assert.match(html, /模型阻塞/);
    assert.match(html, /Model Owner/);
    assert.match(html, /Model Skill/);
    assert.match(html, /model comment/);
    assert.match(html, /评论并解除阻塞/);
    assert.match(html, /解除阻塞/);
    assert.match(html, /2026-07-07T10:30/);
  });

  await test("classic todo detail fallback renders before ESM model loads", async () => {
    const context = createHarness(null, () => new Promise(() => {}));
    const html = vm.runInContext("renderTodoDetail(__todo)", context);
    assert.match(html, /Classic card/);
    assert.match(html, /classic comment/);
    assert.match(html, /P1/);
    assert.match(html, /评论并解除阻塞/);
    assert.match(html, /2026-07-06T09:00/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
