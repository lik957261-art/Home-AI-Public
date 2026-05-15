"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createKanbanStudyArtifactService } = require("../adapters/kanban-study-artifact-service");
const { createKanbanReadingWorkflowService } = require("../adapters/kanban-reading-workflow-service");

function quizJson() {
  return JSON.stringify({
    title: "Practice",
    questions: Array.from({ length: 10 }, (_, index) => ({
      id: `q${index + 1}`,
      skill: "focus",
      prompt: `Question ${index + 1}`,
      choices: ["A", "B", "C", "D"],
      answerIndex: index % 4,
      explanation: `Why ${index + 1}`,
    })),
  });
}

function makeService(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-reading-workflow-"));
  const stores = new Map();
  const calls = {
    hermes: [],
    mutate: [],
    reconcile: [],
    transcribe: [],
    warnings: [],
  };
  const cards = overrides.cards || [{
    id: "card-1",
    content: "Session 1",
    kanbanCaseId: "case-1",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "custom",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 1,
    kanbanStatus: "todo",
  }];
  const artifactService = createKanbanStudyArtifactService({
    artifactRoot: root,
    nowIso: () => "2026-05-15T00:00:00.000Z",
    safeStorageSegment: (value) => String(value || "item").replace(/[^A-Za-z0-9_.-]+/g, "_"),
    readJsonStore: (file, fallback) => stores.has(file) ? stores.get(file) : fallback,
    writeJsonStore: (file, value) => {
      stores.set(file, value);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value), "utf8");
    },
    publicKanbanOutputFile: (workspaceId, file) => ({ workspaceId, path: file }),
    isKanbanStudyCaseMode: (mode) => String(mode || "") === "study-plan",
  });
  const transcribeScript = path.join(root, "transcribe.ps1");
  fs.writeFileSync(transcribeScript, "# noop", "utf8");
  const service = createKanbanReadingWorkflowService(Object.assign({
    artifactService,
    analysisTimeoutMs: 1000,
    automationCreateModel: "test-model",
    compactText(value, maxChars = 1000) {
      const text = String(value || "").trim();
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    },
    extractDocxText() {
      return { text: "docx evidence", totalChars: 13, truncated: false };
    },
    extractJsonObject(text) {
      return JSON.parse(text);
    },
    findWorkspace() {
      return { policy: {} };
    },
    async hermesModelText(request) {
      calls.hermes.push(request);
      return request.stream ? "analysis markdown" : quizJson();
    },
    isKanbanStudyCaseMode: (mode) => String(mode || "") === "study-plan",
    kanbanCardEffectiveCaseIndex: (card) => Number(card?.kanbanCaseCardIndex || 0),
    kanbanCardProvider: {
      async listCards() {
        return { ok: true, data: cards };
      },
      async mutateCard(payload) {
        calls.mutate.push(payload);
        return { ok: true, id: payload.cardId, payload };
      },
    },
    kanbanCardRevisionOf: (card) => String(card?.kanbanRevisionOf || ""),
    kanbanCardUsesReadingTemplate: (card) => String(card?.kanbanCaseTemplate || "") === "reading",
    kanbanWorkflowStateCompleted: (state) => String(state?.status || "") === "completed",
    maxUploadBytes: 1000000,
    async maybeReconcileKanbanDependencyBlocks(workspaceId, options) {
      calls.reconcile.push({ workspaceId, options });
    },
    mimeFor(file) {
      if (String(file).endsWith(".txt")) return "text/plain";
      if (String(file).endsWith(".m4a")) return "audio/mp4";
      return "application/octet-stream";
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
    publicTodo: (value) => ({ id: value.id, ok: value.ok }),
    async runProcessText(command, args) {
      calls.transcribe.push({ command, args });
      return { stdout: JSON.stringify({ ok: true, text: "spoken evidence", language: "en" }), stderr: "" };
    },
    safeFileName: (value) => path.basename(String(value || "file")).replace(/[^A-Za-z0-9_.-]+/g, "_"),
    sanitizePolicy: (policy) => policy,
    textFilePreview(file) {
      return { text: fs.readFileSync(file, "utf8"), totalChars: fs.statSync(file).size, truncated: false };
    },
    transcribeScript,
    transcribeTimeoutMs: 1000,
    quizTargetingVersion: "target-v1",
    visibleKanbanCaseCards: (items) => items,
    logger: { warn: (message, meta) => calls.warnings.push({ message, meta }) },
  }, overrides.deps || {}));
  return { root, stores, calls, cards, service };
}

async function testTextSubmissionCreatesAnalysisQuizAndComment() {
  const { service, calls, stores } = makeService();
  const result = await service.submitKanbanReadingSubmission("owner", "card-1", {
    submissionText: "short study evidence",
    notes: "parent note",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "quiz_pending");
  assert.equal(result.quiz.questions.length, 10);
  assert.equal(calls.hermes.length, 2);
  assert.equal(calls.mutate.length, 1);
  assert.equal(calls.mutate[0].action, "comment");
  assert.match(calls.mutate[0].comment, /MEDIA:/);
  const state = [...stores.values()].find((value) => value && value.quiz);
  assert.equal(state.quizTargetingVersion, "target-v1");
  assert.equal(state.transcription.sourceKind, "text");
}

async function testReadingAudioUsesTranscriptionPath() {
  const { service, calls } = makeService({
    cards: [{
      id: "card-1",
      content: "Reading",
      kanbanCaseId: "case-1",
      kanbanCaseMode: "study-plan",
      kanbanCaseTemplate: "reading",
      kanbanCaseCardIndex: 1,
      kanbanCaseCardCount: 1,
      kanbanStatus: "todo",
    }],
  });
  const result = await service.submitKanbanReadingSubmission("owner", "card-1", {
    filename: "voice.m4a",
    type: "audio/mp4",
    dataBase64: Buffer.from("audio bytes").toString("base64"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.transcription.sourceKind, "audio");
  assert.equal(calls.transcribe.length, 1);
}

async function testQuizFailureAndPassWorkflow() {
  const fixture = makeService();
  await fixture.service.submitKanbanReadingSubmission("owner", "card-1", {
    submissionText: "evidence",
  });
  const failed = await fixture.service.submitKanbanReadingQuiz("owner", "card-1", {
    answers: Array(10).fill(99),
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.passed, false);
  assert.equal(failed.score, 0);
  assert.equal(failed.results.length, 10);

  const passed = await fixture.service.submitKanbanReadingQuiz("owner", "card-1", {
    answers: Array.from({ length: 10 }, (_, index) => index % 4),
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.passed, true);
  assert.equal(passed.status, "completed");
  assert.equal(fixture.calls.mutate.at(-1).action, "complete");
  assert.equal(fixture.calls.reconcile.length, 1);
}

async function testQuizReadRetargetsOldUnattemptedQuiz() {
  const fixture = makeService();
  await fixture.service.submitKanbanReadingSubmission("owner", "card-1", {
    submissionText: "evidence",
  });
  const stateEntry = [...fixture.stores.entries()].find(([, value]) => value && value.quiz);
  stateEntry[1].quizTargetingVersion = "old";
  stateEntry[1].attempts = [];
  fixture.stores.set(stateEntry[0], stateEntry[1]);
  const read = await fixture.service.getKanbanReadingQuiz("owner", "card-1");
  assert.equal(read.ok, true);
  assert.equal(read.quizRetargeted, true);
  assert.equal(read.quizTargetingVersion, "target-v1");
}

function testNormalizeRejectsInvalidQuiz() {
  const { service } = makeService();
  assert.throws(
    () => service.normalizeKanbanReadingQuiz({ questions: [] }),
    /expected 10/,
  );
}

async function run() {
  await testTextSubmissionCreatesAnalysisQuizAndComment();
  await testReadingAudioUsesTranscriptionPath();
  await testQuizFailureAndPassWorkflow();
  await testQuizReadRetargetsOldUnattemptedQuiz();
  testNormalizeRejectsInvalidQuiz();
  console.log("kanban reading workflow service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
