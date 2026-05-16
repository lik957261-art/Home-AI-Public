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
    docx: [],
    hermes: [],
    mutate: [],
    reconcile: [],
    textPreview: [],
    transcribe: [],
    awards: [],
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
    caseDirectoryPathForCase: overrides.caseDirectoryPathForCase || (() => ""),
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
    dataDir: path.join(root, "data"),
    extractDocxText(file) {
      calls.docx.push(file);
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
        if (payload.action === "complete" && overrides.completeFails) {
          return { ok: false, error: "Synthetic completion failure" };
        }
        return { ok: true, id: payload.cardId, payload };
      },
    },
    kanbanCardRevisionOf: (card) => String(card?.kanbanRevisionOf || ""),
    kanbanCardUsesReadingTemplate: (card) => String(card?.kanbanCaseTemplate || "") === "reading",
    kanbanWorkflowStateCompleted: (state) => String(state?.status || "") === "completed",
    learningCoinAwardService: overrides.learningCoinAwardService || {
      safeAwardEvent(eventType, payload) {
        calls.awards.push({ eventType, payload });
        return { ok: true, eventType, coinAmount: 20, duplicate: false };
      },
    },
    maxCoverBytes: 64,
    maxFilePreviewChars: 12,
    maxSourceDocumentBytes: 64,
    maxUploadBytes: 1000000,
    async maybeReconcileKanbanDependencyBlocks(workspaceId, options) {
      calls.reconcile.push({ workspaceId, options });
    },
    mimeFor(file) {
      if (String(file).endsWith(".txt")) return "text/plain";
      if (String(file).endsWith(".m4a")) return "audio/mp4";
      if (String(file).endsWith(".png")) return "image/png";
      if (String(file).endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (String(file).endsWith(".md")) return "text/markdown";
      return "application/octet-stream";
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
    publicTodo: (value) => ({ id: value.id, ok: value.ok }),
    async runProcessText(command, args) {
      calls.transcribe.push({ command, args });
      return { stdout: JSON.stringify({ ok: true, text: "spoken evidence", language: "en" }), stderr: "" };
    },
    safeFileName: (value) => path.basename(String(value || "file")).replace(/[^A-Za-z0-9_.-]+/g, "_"),
    safeStorageSegment: (value) => String(value || "item").replace(/[^A-Za-z0-9_.-]+/g, "_"),
    sanitizePolicy: (policy) => policy,
    textFilePreview(file) {
      calls.textPreview.push(file);
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

async function testAnalysisUsesBoundCaseDeliverableDirectory() {
  const boundRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-reading-bound-case-"));
  const { service, calls } = makeService({
    caseDirectoryPathForCase: (_workspaceId, caseId) => caseId === "case-1" ? boundRoot : "",
  });
  const result = await service.submitKanbanReadingSubmission("owner", "card-1", {
    submissionText: "short study evidence",
  });
  assert.equal(result.ok, true);
  assert.equal(result.analysisPath.startsWith(path.join(boundRoot, "deliverables", "card-1")), true);
  assert.equal(fs.existsSync(result.analysisPath), true);
  assert.match(calls.mutate[0].comment, new RegExp(`MEDIA: ${result.analysisPath.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`));
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

async function testReadingAnalysisHeadingsAreReadable() {
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
  await service.submitKanbanReadingSubmission("owner", "card-1", {
    filename: "voice.m4a",
    type: "audio/mp4",
    dataBase64: Buffer.from("audio bytes").toString("base64"),
  });
  assert.match(calls.hermes[0].input, /## 本次评分（100分）/);
  assert.match(calls.hermes[0].input, /## 英语表达与语法/);
  assert.doesNotMatch(calls.hermes[0].input, /鏈|澶嶈堪|瀹堕暱/);
  assert.equal(
    service.repairReadingAnalysisMarkdown("## 鏈璇勫垎锛?00鍒嗭級\n## 澶嶈堪璐ㄩ噺"),
    "## 本次评分（100分）\n## 复述质量",
  );
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
  assert.equal(fixture.calls.awards.length, 0);

  const passed = await fixture.service.submitKanbanReadingQuiz("owner", "card-1", {
    answers: Array.from({ length: 10 }, (_, index) => index % 4),
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.passed, true);
  assert.equal(passed.status, "completed");
  assert.equal(fixture.calls.mutate.at(-1).action, "complete");
  assert.equal(fixture.calls.reconcile.length, 1);
  assert.equal(fixture.calls.awards.length, 1);
  assert.equal(fixture.calls.awards[0].eventType, "reading_quiz_passed");
  assert.equal(fixture.calls.awards[0].payload.cardId, "card-1");
  assert.equal(fixture.calls.awards[0].payload.score, 100);
}

async function testQuizCompletionFailureDoesNotAwardCoins() {
  const fixture = makeService({ completeFails: true });
  await fixture.service.submitKanbanReadingSubmission("owner", "card-1", {
    submissionText: "evidence",
  });
  const result = await fixture.service.submitKanbanReadingQuiz("owner", "card-1", {
    answers: Array.from({ length: 10 }, (_, index) => index % 4),
  });
  assert.equal(result.ok, false);
  assert.equal(fixture.calls.awards.length, 0);
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

function testReadingCoverUploadHelpers() {
  const { service, root } = makeService();
  assert.equal(service.isReadingCoverImageUpload("cover.png", "image/png"), true);
  assert.equal(service.isReadingCoverImageUpload("cover.webp", "image/webp"), true);
  assert.equal(service.isReadingCoverImageUpload("cover.gif", ""), false);
  assert.equal(service.isReadingCoverImageUpload("cover.txt", "image/png"), false);
  assert.equal(service.saveKanbanReadingCoverUpload("owner", "plan-1", null), null);
  assert.equal(service.saveKanbanReadingCoverUpload("owner", "plan-1", { filename: "cover.png" }), null);

  const saved = service.saveKanbanReadingCoverUpload("owner", "plan-1", {
    filename: "My Cover.PNG",
    type: "image/png",
    dataBase64: Buffer.from("img").toString("base64"),
  });
  assert.equal(saved.name, "My_Cover.PNG");
  assert.equal(saved.mime, "image/png");
  assert.equal(saved.size, 3);
  assert.equal(fs.existsSync(saved.path), true);
  assert.equal(path.dirname(saved.path), path.join(root, "owner", "plan-1", "cover"));
  assert.match(path.basename(saved.path), /^\d+-[a-f0-9]{6}-My_Cover\.PNG$/);

  assert.throws(
    () => service.saveKanbanReadingCoverUpload("owner", "plan-1", {
      filename: "cover.png",
      type: "application/octet-stream",
      dataBase64: Buffer.from("img").toString("base64"),
    }),
    /Study plan cover must be/,
  );
  assert.throws(
    () => service.saveKanbanReadingCoverUpload("owner", "plan-1", {
      filename: "cover.png",
      type: "image/png",
      dataBase64: Buffer.alloc(65, 1).toString("base64"),
    }),
    /Invalid or too-large study plan cover image/,
  );
}

function testKanbanSourceDocumentUploadHelpers() {
  const { service, root } = makeService();
  assert.equal(service.isKanbanSourceDocumentUpload("source.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), true);
  assert.equal(service.isKanbanSourceDocumentUpload("source.md", "text/markdown; charset=utf-8"), true);
  assert.equal(service.isKanbanSourceDocumentUpload("source.csv", "application/csv"), true);
  assert.equal(service.isKanbanSourceDocumentUpload("source.json", "application/json"), true);
  assert.equal(service.isKanbanSourceDocumentUpload("source.pdf", "application/pdf"), false);

  const textUpload = service.saveKanbanSourceDocumentUpload("owner user", {
    filename: "Plan Notes.md",
    type: "text/markdown",
    dataBase64: Buffer.from("# Plan").toString("base64"),
  });
  assert.equal(textUpload.name, "Plan_Notes.md");
  assert.equal(textUpload.mime, "text/markdown");
  assert.equal(textUpload.kind, "text");
  assert.equal(textUpload.size, 6);
  assert.equal(fs.existsSync(textUpload.path), true);
  assert.equal(path.dirname(textUpload.path), path.join(root, "data", "uploads", "kanban-source", "owner_user"));

  const docxUpload = service.saveKanbanSourceDocumentUpload("owner", {
    filename: "source.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    dataBase64: Buffer.from("docx").toString("base64"),
  });
  assert.equal(docxUpload.kind, "docx");

  assert.throws(
    () => service.saveKanbanSourceDocumentUpload("owner", {
      filename: "source.pdf",
      type: "application/pdf",
      dataBase64: Buffer.from("pdf").toString("base64"),
    }),
    /Kanban source document must be/,
  );
  assert.throws(
    () => service.saveKanbanSourceDocumentUpload("owner", {
      filename: "source.txt",
      type: "text/plain",
    }),
    /Missing dataBase64/,
  );
  assert.throws(
    () => service.saveKanbanSourceDocumentUpload("owner", {
      filename: "source.txt",
      type: "text/plain",
      dataBase64: Buffer.alloc(65, 1).toString("base64"),
    }),
    /Invalid or too-large Kanban source document/,
  );
}

function testKanbanSourceDocumentExtraction() {
  const { service, root, calls } = makeService();
  const textPath = path.join(root, "source.txt");
  fs.writeFileSync(textPath, "long source document text", "utf8");
  const textResult = service.extractKanbanSourceDocumentText({ path: textPath, name: "source.txt", kind: "text" });
  assert.equal(textResult.text, "long source ");
  assert.equal(textResult.totalChars, 25);
  assert.equal(textResult.truncated, false);
  assert.deepEqual(calls.textPreview, [textPath]);

  const docxPath = path.join(root, "source.docx");
  fs.writeFileSync(docxPath, "docx", "utf8");
  const docxResult = service.extractKanbanSourceDocumentText({ path: docxPath, name: "source.docx", kind: "docx" });
  assert.equal(docxResult.text, "docx evidenc");
  assert.deepEqual(calls.docx, [docxPath]);

  const emptyService = makeService({
    deps: {
      textFilePreview() {
        return { text: "   ", totalChars: 3, truncated: false };
      },
    },
  }).service;
  assert.throws(
    () => emptyService.extractKanbanSourceDocumentText({ path: textPath, name: "source.txt", kind: "text" }),
    /Kanban source document extraction returned empty text/,
  );
}

async function run() {
  await testTextSubmissionCreatesAnalysisQuizAndComment();
  await testAnalysisUsesBoundCaseDeliverableDirectory();
  await testReadingAudioUsesTranscriptionPath();
  await testReadingAnalysisHeadingsAreReadable();
  await testQuizFailureAndPassWorkflow();
  await testQuizCompletionFailureDoesNotAwardCoins();
  await testQuizReadRetargetsOldUnattemptedQuiz();
  testNormalizeRejectsInvalidQuiz();
  testReadingCoverUploadHelpers();
  testKanbanSourceDocumentUploadHelpers();
  testKanbanSourceDocumentExtraction();
  console.log("kanban reading workflow service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
