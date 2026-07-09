"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/kanban-composer-actions-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
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

  await test("model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("composer message planning creates bounded newest messages", () => {
    const existing = Array.from({ length: 3 }, (_, index) => ({ id: `old_${index}` }));
    const plan = model.createKanbanComposerMessagePlan({
      messages: existing,
      role: "user",
      content: "hello",
      nowMs: Date.UTC(2026, 6, 4, 9, 0, 0),
      randomSuffix: "abc",
      limit: 3,
    });
    assert.equal(plan.message.id, "kanban-1783155600000-abc");
    assert.equal(plan.message.at, "2026-07-04T09:00:00.000Z");
    assert.equal(plan.message.content, "hello");
    assert.equal(plan.messages.length, 3);
    assert.deepEqual(plan.messages.map((item) => item.id), ["old_1", "old_2", "kanban-1783155600000-abc"]);
  });

  await test("plan and batch summary text preserve existing counts", () => {
    const summary = model.kanbanPlanSummaryTextPlan({
      plan: { cards: [{ initialRunnable: true }, { initialRunnable: false }, { initialRunnable: true }] },
      maxParallel: 2,
    });
    assert.equal(summary.cardCount, 3);
    assert.equal(summary.firstWave, 2);
    assert.match(summary.text, /已生成 3 张卡片/);
    assert.match(summary.text, /首批执行 2/);
    assert.match(summary.text, /最大并行 2/);

    const batch = model.kanbanBatchCreateSummaryTextPlan({
      cards: [{}, { blocked: true }, {}],
    });
    assert.equal(batch.runnable, 2);
    assert.equal(batch.blocked, 1);
    assert.match(batch.text, /已创建 3 张多 Agent 看板卡片/);
  });

  await test("document preview request and state projection are bounded", () => {
    const request = model.kanbanComposerDocumentPreviewRequestPlan({
      workspaceId: "owner",
      file: { name: "需求.md", type: "text/markdown", size: 123 },
      dataBase64: "abc123",
    });
    assert.deepEqual(request.body, {
      workspaceId: "owner",
      filename: "需求.md",
      type: "text/markdown",
      dataBase64: "abc123",
    });
    assert.equal(request.serializedBody, JSON.stringify(request.body));

    const state = model.kanbanComposerDocumentStatePlan({
      documents: [{ name: "old" }],
      file: { name: "需求.md", type: "text/markdown", size: 123 },
      result: {
        document: { name: "需求.md", mime: "text/markdown", kind: "markdown", size: 120 },
        text: "parsed",
        totalChars: 6,
        truncated: false,
      },
    });
    assert.equal(state.documents.length, 2);
    assert.deepEqual(state.documents[1], {
      name: "需求.md",
      mime: "text/markdown",
      kind: "markdown",
      size: 120,
      text: "parsed",
      totalChars: 6,
      truncated: false,
    });
  });

  await test("submission and batch request planning preserve mode-specific behavior", () => {
    assert.deepEqual(model.createKanbanComposerSubmissionPlan({
      mode: "study",
      rawText: "",
      text: "combined",
      documentNames: "book.pdf",
      readingTitle: "阅读 A",
      programmingStudyAssessment: false,
    }), {
      version: model.KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
      mode: "study",
      multiAgent: false,
      studyPlan: true,
      assessmentPlan: false,
      programmingStudyAssessment: false,
      userMessageContent: "阅读 A\nDocuments: book.pdf",
      progressKind: "reading",
    });

    const assessment = model.createKanbanComposerSubmissionPlan({
      mode: "study",
      rawText: "刷题",
      readingTitle: "编程练习",
      programmingStudyAssessment: true,
    });
    assert.equal(assessment.progressKind, "assessment");

    const batch = model.kanbanPlanDraftBatchRequestPlan({
      workspaceId: "owner",
      plan: { cards: [{ id: "c1" }] },
      maxParallel: 3,
      reasoningEffort: "high",
    });
    assert.deepEqual(batch.body, {
      workspaceId: "owner",
      plan: { cards: [{ id: "c1" }] },
      maxParallel: 3,
      reasoning_effort: "high",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
