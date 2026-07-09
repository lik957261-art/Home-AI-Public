"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-kanban-composer-actions-ui.js"), "utf8");

function createHarness(fakeModel) {
  const context = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportKanbanComposerActionsModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      kanbanComposerMessages: [{ id: "old" }],
      kanbanComposerDocuments: [],
      kanbanComposerDocumentUploading: false,
      selectedWorkspaceId: "owner",
      kanbanComposerMaxParallel: 2,
      kanbanComposerReasoningEffort: "medium",
      kanbanPlanDraft: { cards: [{ id: "draft_1" }], maxParallel: 3, reasoningEffort: "high" },
    },
    localStorage: {
      setItem() {},
      removeItem() {},
    },
    $(id) {
      if (id === "conversation") return { scrollTop: 0 };
      return null;
    },
    renderTodos() {},
    showPushToast() {},
    fileToBase64() {
      return Promise.resolve("base64");
    },
    apiCalls: [],
    api(route, options) {
      context.apiCalls.push({ route, options });
      return Promise.resolve({
        document: { name: "需求.md", mime: "text/markdown", kind: "markdown", size: 12 },
        text: "parsed",
        totalChars: 6,
      });
    },
    normalizeKanbanComposerMaxParallel(value) {
      return Math.max(1, Number(value) || 1);
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-kanban-composer-actions-ui.js" });
  return context;
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
  await test("classic kanban composer adapter declares bounded ESM import path", () => {
    assert.match(source, /KANBAN_COMPOSER_ACTIONS_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/kanban-composer-actions-model\/kanban-composer-actions-model\.js/);
    assert.match(source, /__homeAiImportKanbanComposerActionsModel/);
    assert.match(source, /currentKanbanComposerActionsModel/);
    assert.match(source, /createKanbanComposerMessagePlan/);
    assert.match(source, /kanbanComposerDocumentPreviewRequestPlan/);
    assert.match(source, /createKanbanComposerSubmissionPlan/);
    assert.match(source, /kanbanPlanDraftBatchRequestPlan/);
  });

  await test("classic helpers consume loaded ESM model for messages, summaries, and submission planning", async () => {
    const calls = [];
    const fakeModel = {
      createKanbanComposerMessagePlan(input) {
        calls.push(["message", input.role, input.content]);
        return { messages: [{ id: "from_model", role: input.role, content: input.content }] };
      },
      kanbanPlanSummaryTextPlan(input) {
        calls.push(["summary", input.maxParallel]);
        return { text: "summary_from_model" };
      },
      createKanbanComposerSubmissionPlan(input) {
        calls.push(["submission", input.mode, input.rawText]);
        return { userMessageContent: "submission_from_model", progressKind: "plan" };
      },
    };
    const context = createHarness(fakeModel);
    await context.importKanbanComposerActionsModel(context.window);

    context.pushKanbanComposerMessage("user", "hello");
    assert.deepEqual(context.state.kanbanComposerMessages, [{ id: "from_model", role: "user", content: "hello" }]);
    assert.equal(context.kanbanPlanSummaryText({ cards: [{}], maxParallel: 4 }), "summary_from_model");
    assert.deepEqual(context.classicKanbanComposerSubmissionPlan({
      mode: "multi",
      rawText: "拆任务",
      text: "拆任务",
      documentNames: "",
    }), { userMessageContent: "submission_from_model", progressKind: "plan" });
    assert.deepEqual(calls.map((entry) => entry[0]), ["message", "summary", "submission"]);
  });

  await test("document upload and batch body use ESM planning while classic owns API side effects", async () => {
    const calls = [];
    const fakeModel = {
      kanbanComposerDocumentPreviewRequestPlan(input) {
        calls.push(["request", input.workspaceId, input.file.name]);
        return { serializedBody: JSON.stringify({ marker: "request_from_model", workspaceId: input.workspaceId }) };
      },
      kanbanComposerDocumentStatePlan(input) {
        calls.push(["state", input.result.text]);
        return { documents: [{ name: "doc_from_model", text: input.result.text }] };
      },
      kanbanPlanDraftBatchRequestPlan(input) {
        calls.push(["batch", input.maxParallel, input.reasoningEffort]);
        return { serializedBody: JSON.stringify({ marker: "batch_from_model", maxParallel: input.maxParallel }) };
      },
      kanbanBatchCreateSummaryTextPlan(input) {
        calls.push(["batch_summary", input.cards.length]);
        return { text: "batch_summary_from_model" };
      },
    };
    const context = createHarness(fakeModel);
    await context.importKanbanComposerActionsModel(context.window);

    await context.uploadKanbanComposerDocument({
      name: "需求.md",
      type: "text/markdown",
      size: 12,
    });
    assert.equal(context.apiCalls[0].route, "/api/kanban/cards/document-preview");
    assert.deepEqual(JSON.parse(context.apiCalls[0].options.body), {
      marker: "request_from_model",
      workspaceId: "owner",
    });
    assert.deepEqual(context.state.kanbanComposerDocuments, [{ name: "doc_from_model", text: "parsed" }]);

    assert.deepEqual(JSON.parse(context.kanbanPlanDraftBatchRequestBody()), {
      marker: "batch_from_model",
      maxParallel: 3,
    });
    assert.equal(context.kanbanBatchCreateSummaryText([{}, { blocked: true }], 1), "batch_summary_from_model");
    assert.deepEqual(calls.map((entry) => entry[0]), ["request", "state", "batch", "batch_summary"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
