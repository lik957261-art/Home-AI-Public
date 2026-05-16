"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  assessmentConfigLine,
  createAssessmentExamWorkflowService,
  defaultNormalizeAssessmentSubjectId,
  parseAssessmentConfigLine,
  stripAssessmentConfigMarkers,
} = require("../adapters/assessment-exam-workflow-service");
const {
  kanbanCardEffectiveCaseIndex,
  kanbanCardRevisionOf,
  visibleKanbanCaseCards,
} = require("../adapters/kanban-story-provider");

function modelExamJson(count = 5, subject = "English") {
  return JSON.stringify({
    title: `${subject} formal check`,
    subject,
    subjectId: defaultNormalizeAssessmentSubjectId(subject),
    verification: "model-generated",
    questions: Array.from({ length: count }, (_, index) => ({
      id: `q${index + 1}`,
      skill: `skill-${index + 1}`,
      prompt: `Synthetic prompt ${index + 1}`,
      choices: ["A", "B", "C", "D"],
      answerIndex: index % 4,
      explanation: `Synthetic explanation ${index + 1}`,
    })),
  });
}

function parsedExam(count = 5, subject = "English") {
  return JSON.parse(modelExamJson(count, subject));
}

function stateKey(workspaceId, cardId) {
  return `${workspaceId}:${cardId}`;
}

function makeAssessmentCard(id = "card-1", config = {}, extra = {}) {
  const line = assessmentConfigLine(Object.assign({
    subject: "Math",
    subjectId: "math",
    questionCount: 5,
    passingScore: 80,
    durationMinutes: 30,
    difficulty: "synthetic-only",
  }, config));
  return Object.assign({
    id,
    content: `Synthetic ${id}`,
    kanbanCaseId: "case-1",
    kanbanCaseMode: "assessment-plan",
    kanbanCaseTemplate: "assessment",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 1,
    kanbanStatus: "todo",
    kanbanCaseCardGoal: `Complete a synthetic formal check.\n${line}`,
    kanbanCaseSourceText: `Synthetic blueprint.\n${line}`,
    updatedAt: "2026-05-15T00:00:00.000Z",
  }, extra);
}

function makeService(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-exam-workflow-"));
  const states = new Map(overrides.states || []);
  const cards = overrides.cards || [makeAssessmentCard("card-1")];
  const calls = {
    contexts: [],
    hermes: [],
    mutate: [],
    listCards: [],
    reconcile: [],
    reports: [],
    awards: [],
    warnings: [],
  };
  const deps = {
    automationCreateModel: "unit-model",
    compactText(value, maxChars = 1000) {
      const text = String(value ?? "").trim();
      return text.length > maxChars ? text.slice(0, maxChars) : text;
    },
    extractJsonObject(text) {
      return JSON.parse(text);
    },
    findWorkspace(workspaceId) {
      return { id: workspaceId, policy: { workspaceId, secretHint: "removed-by-sanitize" } };
    },
    async hermesModelText(request, timeoutMs) {
      calls.hermes.push({ request, timeoutMs });
      return overrides.modelOutput || modelExamJson(overrides.modelQuestionCount || 5, overrides.modelSubject || "English");
    },
    isKanbanStudyCaseMode: (mode) => String(mode || "") === "study-plan",
    learningCoinAwardService: overrides.learningCoinAwardService || {
      safeAwardEvent(eventType, payload) {
        calls.awards.push({ eventType, payload });
        return { ok: true, eventType, coinAmount: 25, duplicate: false };
      },
    },
    kanbanCardProvider: {
      async listCards(payload) {
        calls.listCards.push(payload);
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
    kanbanWorkflowStateCompleted(state, cardDone) {
      return String(state?.status || "") === "completed" || Boolean(cardDone);
    },
    maxQuestions: 10,
    modelTimeoutMs: 1234,
    async maybeReconcileKanbanDependencyBlocks(workspaceId, options) {
      calls.reconcile.push({ workspaceId, options });
    },
    nowIso: () => "2026-05-15T00:00:00.000Z",
    nowMs: () => 1770000000000,
    publicTodo(value) {
      return { id: value.id, action: value.payload?.action || "" };
    },
    randomHex: () => "abc123",
    readAssessmentExamState(workspaceId, cardId) {
      return states.get(stateKey(workspaceId, cardId)) || null;
    },
    safeFileName(value) {
      return path.basename(String(value || "file")).replace(/[^A-Za-z0-9_.-]+/g, "_") || "file";
    },
    sanitizePolicy(policy) {
      return { workspaceId: policy.workspaceId || "" };
    },
    artifactService: {
      assessmentExamReportDirectory(workspaceId, cardId, currentCard) {
        const dir = path.join(root, "artifacts", workspaceId, currentCard?.kanbanCaseId || "assessment-plan", cardId);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      },
    },
    writeAssessmentExamReport(workspaceId, cardId, currentCard, exam, attempt) {
      const filePath = path.join(root, `${cardId}-${calls.reports.length + 1}-assessment-report.md`);
      const markdown = [
        `# ${currentCard.content}`,
        `Score: ${attempt.score}`,
        `Subject: ${exam.subject}`,
      ].join("\n");
      fs.writeFileSync(filePath, markdown, "utf8");
      calls.reports.push({ workspaceId, cardId, filePath, attempt });
      return filePath;
    },
    writeAssessmentExamState(workspaceId, cardId, _currentCard, state) {
      const payload = Object.assign({ schemaVersion: 1, updatedAt: "2026-05-15T00:00:00.000Z" }, state || {});
      states.set(stateKey(workspaceId, cardId), payload);
      return payload;
    },
    logger: {
      warn(message, meta) {
        calls.warnings.push({ message, meta });
      },
    },
    kanbanCardEffectiveCaseIndex,
    kanbanCardRevisionOf,
    visibleKanbanCaseCards,
  };
  if (overrides.useDefaultReportWriter) {
    delete deps.writeAssessmentExamReport;
  }
  if (overrides.artifactService) {
    deps.artifactService = overrides.artifactService;
  }
  if (!overrides.useProviderContext) {
    deps.readingContextForCard = async function readingContextForCard(workspaceId, cardId) {
      calls.contexts.push({ workspaceId, cardId });
      const current = cards.find((card) => String(card.id) === String(cardId)) || null;
      const caseId = String(current?.kanbanCaseId || "");
      const siblings = caseId ? cards
        .filter((card) => String(card.kanbanCaseId || "") === caseId)
        .sort((a, b) => Number(a.kanbanCaseCardIndex || 0) - Number(b.kanbanCaseCardIndex || 0)) : [];
      const prior = siblings.filter((card) => Number(card.kanbanCaseCardIndex || 0) < Number(current?.kanbanCaseCardIndex || 0));
      return { current, siblings, rawSiblings: siblings, prior };
    };
  }
  const service = createAssessmentExamWorkflowService(Object.assign(deps, overrides.deps || {}));
  return { root, states, cards, calls, service };
}

async function testMathGenerationUsesDeterministicTemplates() {
  const card = makeAssessmentCard("card-1", {
    subject: "Math",
    subjectId: "math",
    questionCount: 6,
    passingScore: 75,
    durationMinutes: 25,
    finalExam: true,
  });
  const { service, calls, states } = makeService({ cards: [card] });
  const result = await service.getKanbanAssessmentExam("owner", "card-1");
  assert.equal(result.ok, true);
  assert.equal(result.status, "in_progress");
  assert.equal(result.exam.subjectId, "math");
  assert.equal(result.exam.questionCount, 6);
  assert.equal(result.exam.passingScore, 75);
  assert.equal(result.exam.questions.length, 6);
  assert.equal(Object.hasOwn(result.exam.questions[0], "answerIndex"), false);
  assert.equal(calls.hermes.length, 0);
  const saved = states.get(stateKey("owner", "card-1"));
  assert.equal(saved.exam.verification, "deterministic-template");
  assert.equal(saved.exam.questions[0].answerIndex >= 0, true);
  const summary = service.publicKanbanAssessmentSummary("owner", card);
  assert.equal(summary.examAvailable, true);
  assert.equal(summary.finalExam, true);
  assert.equal(summary.examUrl, "/?view=todos&workspaceId=owner&todoId=card-1&assessmentExam=1");
}

async function testDefaultReportWriterUsesBoundDeliverableDirectory() {
  const boundRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-bound-case-"));
  const card = makeAssessmentCard("card-1");
  const states = [[stateKey("owner", "card-1"), {
    status: "in_progress",
    exam: parsedExam(5, "Math"),
    config: { passingScore: 80 },
  }]];
  const { service, calls } = makeService({
    cards: [card],
    states,
    useDefaultReportWriter: true,
    artifactService: {
      assessmentExamReportDirectory(_workspaceId, cardId) {
        const dir = path.join(boundRoot, "deliverables", cardId);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      },
    },
  });
  const result = await service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [0, 1, 2, 3, 0],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reportPath.startsWith(path.join(boundRoot, "deliverables", "card-1")), true);
  assert.equal(fs.existsSync(result.reportPath), true);
  assert.match(calls.mutate[0].comment, new RegExp(`MEDIA: ${result.reportPath.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`));
}

async function testModelGenerationUsesInjectedHermesAndSanitizedPrompt() {
  const marker = assessmentConfigLine({
    subject: "English",
    subjectId: "english",
    questionCount: 5,
    courseLevel: "Synthetic level",
  });
  const card = makeAssessmentCard("card-2", {}, {
    id: "card-2",
    kanbanCaseTemplate: "english",
    kanbanCaseCardGoal: `Use this synthetic goal.\n${marker}`,
    kanbanCaseSourceText: `Use this synthetic source.\n${marker}`,
  });
  const { service, calls } = makeService({ cards: [card], modelSubject: "English" });
  const result = await service.getKanbanAssessmentExam("owner", "card-2");
  assert.equal(result.ok, true);
  assert.equal(result.exam.subjectId, "english");
  assert.equal(result.exam.verification, "model-generated");
  assert.equal(calls.hermes.length, 1);
  assert.equal(calls.hermes[0].timeoutMs, 1234);
  assert.equal(calls.hermes[0].request.model, "unit-model");
  assert.equal(calls.hermes[0].request.stream, false);
  assert.equal(calls.hermes[0].request.conversation, "hermes_web_assessment_exam_1770000000000_abc123");
  assert.deepEqual(calls.hermes[0].request.access_policy_context, { workspaceId: "owner" });
  assert.equal(calls.hermes[0].request.input.includes("ASSESSMENT_CONFIG:"), false);
  assert.match(calls.hermes[0].request.input, /Synthetic level/);
}

async function testProgrammingAssessmentRequiresPerCardRequirement() {
  const marker = assessmentConfigLine({
    subject: "Python 编程",
    subjectId: "programming",
    template: "programming",
    questionCount: 5,
    requiresRequirementInput: true,
  });
  const card = makeAssessmentCard("python-1", {}, {
    id: "python-1",
    kanbanCaseTemplate: "programming",
    kanbanCaseCardGoal: `Generate a programming check.\n${marker}`,
    kanbanCaseSourceText: `Python story blueprint.\n${marker}`,
  });
  const fixture = makeService({ cards: [card], modelSubject: "Python 编程" });
  const missing = await fixture.service.getKanbanAssessmentExam("owner", "python-1");
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 409);
  assert.equal(missing.code, "programming_requirement_required");

  const started = await fixture.service.startKanbanAssessmentExam("owner", "python-1", {
    requirement: "根据老师重点生成 for 循环和列表索引题。",
    context: "课堂表现：索引容易从 1 开始数。",
  });
  assert.equal(started.ok, true);
  assert.equal(started.exam.subjectId, "programming");
  assert.equal(fixture.calls.hermes.length, 1);
  assert.match(fixture.calls.hermes[0].request.input, /Programming assessment template/);
  assert.match(fixture.calls.hermes[0].request.input, /for/);
  assert.match(fixture.calls.hermes[0].request.input, /list indexing|索引/);
  const saved = fixture.states.get(stateKey("owner", "python-1"));
  assert.equal(saved.config.sessionRequirement.requirement, "根据老师重点生成 for 循环和列表索引题。");
}

async function testPriorAssessmentGateBlocksUntilComplete() {
  const prior = makeAssessmentCard("prior", { subject: "Math", questionCount: 5 }, {
    kanbanCaseCardIndex: 1,
    content: "Prior assessment",
  });
  const current = makeAssessmentCard("current", { subject: "Math", questionCount: 5 }, {
    kanbanCaseCardIndex: 2,
    content: "Current assessment",
  });
  const fixture = makeService({ cards: [prior, current] });
  const blocked = await fixture.service.getKanbanAssessmentExam("owner", "current");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 409);
  fixture.states.set(stateKey("owner", "prior"), { status: "completed", completionError: "" });
  const allowed = await fixture.service.getKanbanAssessmentExam("owner", "current");
  assert.equal(allowed.ok, true);
}

async function testRevisionUsesOriginalEffectiveCaseIndexForOpenGate() {
  const original = makeAssessmentCard("exam-1", { subject: "Math", questionCount: 5 }, {
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 10,
    content: "Original first assessment",
  });
  const second = makeAssessmentCard("exam-2", { subject: "Math", questionCount: 5 }, {
    kanbanCaseCardIndex: 2,
    kanbanCaseCardCount: 10,
    content: "Second assessment",
  });
  const revision = makeAssessmentCard("exam-1-revision", { subject: "Math", questionCount: 5 }, {
    kanbanCaseCardIndex: 11,
    kanbanCaseCardCount: 11,
    kanbanRevisionOf: "exam-1",
    content: "Revision of first assessment",
  });
  const fixture = makeService({
    cards: [original, second, revision],
    useProviderContext: true,
  });
  const result = await fixture.service.getKanbanAssessmentExam("owner", "exam-1-revision");
  assert.equal(result.ok, true);
  assert.equal(result.status, "in_progress");
  assert.equal(fixture.calls.listCards.length, 1);
  assert.equal(fixture.states.has(stateKey("owner", "exam-1-revision")), true);
  assert.equal(fixture.states.has(stateKey("owner", "exam-2")), false);
}

async function testFailedSubmissionWritesRetakeStateAndReport() {
  const exam = parsedExam(5, "English");
  const fixture = makeService({
    cards: [makeAssessmentCard("card-1", { subject: "English", subjectId: "english", questionCount: 5 })],
    states: [[stateKey("owner", "card-1"), {
      status: "in_progress",
      config: { subject: "English", subjectId: "english", questionCount: 5, passingScore: 80 },
      exam,
      attempts: [],
      startedAt: "2026-05-15T00:00:00.000Z",
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [1, 2, 3, 0, 1],
  });
  assert.equal(result.ok, true);
  assert.equal(result.passed, false);
  assert.equal(result.status, "retake_required");
  assert.equal(result.score, 0);
  assert.equal(fixture.calls.reports.length, 1);
  assert.equal(fixture.calls.mutate.length, 1);
  assert.equal(fixture.calls.mutate[0].action, "comment");
  assert.match(fixture.calls.mutate[0].comment, /MEDIA:/);
  const saved = fixture.states.get(stateKey("owner", "card-1"));
  assert.equal(saved.status, "retake_required");
  assert.equal(saved.attempts.length, 1);
  assert.equal(saved.lastReportPath, fixture.calls.reports[0].filePath);
  assert.equal(result.results.every((item) => item.correct === false && item.explanation), true);
  assert.equal(Object.hasOwn(result.exam.questions[0], "answerIndex"), false);
  assert.equal(fixture.calls.awards.length, 0);
}

async function testPassedSubmissionCompletesCardAndReconciles() {
  const exam = parsedExam(5, "English");
  const fixture = makeService({
    cards: [makeAssessmentCard("card-1", { subject: "English", subjectId: "english", questionCount: 5 })],
    states: [[stateKey("owner", "card-1"), {
      status: "in_progress",
      config: { subject: "English", subjectId: "english", questionCount: 5, passingScore: 80 },
      exam,
      attempts: [],
      startedAt: "2026-05-15T00:00:00.000Z",
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [0, 1, 2, 3, 0],
  });
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
  assert.equal(result.status, "completed");
  assert.equal(result.score, 100);
  assert.deepEqual(fixture.calls.mutate.map((call) => call.action), ["comment", "complete"]);
  assert.deepEqual(fixture.calls.reconcile, [{ workspaceId: "owner", options: { force: true, limit: 500 } }]);
  assert.deepEqual(result.card, { id: "card-1", action: "complete" });
  const saved = fixture.states.get(stateKey("owner", "card-1"));
  assert.equal(saved.status, "completed");
  assert.equal(saved.completionError, "");
  assert.equal(fixture.calls.awards.length, 1);
  assert.equal(fixture.calls.awards[0].eventType, "assessment_exam_passed");
  assert.equal(fixture.calls.awards[0].payload.cardId, "card-1");
  assert.equal(fixture.calls.awards[0].payload.score, 100);
}

async function testDefaultReportWriterUsesCardArtifactDirectory() {
  const exam = parsedExam(5, "English");
  const fixture = makeService({
    useDefaultReportWriter: true,
    cards: [makeAssessmentCard("card-1", { subject: "English", subjectId: "english", questionCount: 5 })],
    states: [[stateKey("owner", "card-1"), {
      status: "in_progress",
      config: { subject: "English", subjectId: "english", questionCount: 5, passingScore: 80 },
      exam,
      attempts: [],
      startedAt: "2026-05-15T00:00:00.000Z",
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [0, 1, 2, 3, 0],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reportPath.startsWith(path.join(fixture.root, "artifacts", "owner", "case-1", "card-1")), true);
  assert.equal(fs.existsSync(result.reportPath), true);
  assert.match(fs.readFileSync(result.reportPath, "utf8"), /得分：100\/100/);
  const saved = fixture.states.get(stateKey("owner", "card-1"));
  assert.equal(saved.lastReportPath, result.reportPath);
}

async function testProgrammingPassWritesCompletionLogAndReturnsExplanations() {
  const exam = parsedExam(5, "Python 编程");
  const fixture = makeService({
    useDefaultReportWriter: true,
    cards: [makeAssessmentCard("python-2", {
      subject: "Python 编程",
      subjectId: "programming",
      template: "programming",
      questionCount: 5,
    }, { kanbanCaseTemplate: "programming" })],
    states: [[stateKey("owner", "python-2"), {
      status: "in_progress",
      config: {
        subject: "Python 编程",
        subjectId: "programming",
        template: "programming",
        questionCount: 5,
        passingScore: 80,
        sessionRequirement: { requirement: "测试函数和循环。", context: "项目练习：猜数字。" },
      },
      exam,
      attempts: [],
      startedAt: "2026-05-15T00:00:00.000Z",
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "python-2", {
    answers: [0, 1, 2, 3, 0],
  });
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
  assert.equal(result.results.length, 5);
  assert.equal(result.results.every((item) => item.explanation), true);
  assert.match(path.basename(result.reportPath), /programming-log\.md$/);
  const markdown = fs.readFileSync(result.reportPath, "utf8");
  assert.match(markdown, /## 结论/);
  assert.match(markdown, /## 本次输入要求清洗/);
  assert.match(markdown, /## 错题清单/);
  assert.match(markdown, /## 薄弱点总结/);
  assert.match(markdown, /## 后续复习建议/);
  assert.match(markdown, /## 逐题讲解/);
  assert.match(markdown, /本次没有错题/);
  assert.doesNotMatch(markdown, /Cleaned Programming Requirement/);
  assert.doesNotMatch(markdown, /Question Analysis/);
  assert.equal(fixture.calls.awards.length, 1);
  assert.equal(fixture.calls.awards[0].eventType, "assessment_exam_passed");
  assert.equal(fixture.calls.awards[0].payload.card.kanbanCaseTemplate, "programming");
}

async function testCompletionFailurePreservesRetakeRequiredState() {
  const exam = parsedExam(5, "English");
  const fixture = makeService({
    completeFails: true,
    cards: [makeAssessmentCard("card-1", { subject: "English", subjectId: "english", questionCount: 5 })],
    states: [[stateKey("owner", "card-1"), {
      status: "in_progress",
      config: { subject: "English", subjectId: "english", questionCount: 5, passingScore: 80 },
      exam,
      attempts: [],
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [0, 1, 2, 3, 0],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "Synthetic completion failure");
  assert.equal(fixture.calls.reconcile.length, 0);
  const saved = fixture.states.get(stateKey("owner", "card-1"));
  assert.equal(saved.status, "retake_required");
  assert.equal(saved.completionError, "Synthetic completion failure");
  assert.equal(fixture.calls.awards.length, 0);
}

async function testInvalidAnswersDoNotWriteReportOrMutate() {
  const exam = parsedExam(5, "English");
  const fixture = makeService({
    states: [[stateKey("owner", "card-1"), {
      status: "in_progress",
      config: { subject: "English", subjectId: "english", questionCount: 5, passingScore: 80 },
      exam,
      attempts: [],
    }]],
  });
  const result = await fixture.service.submitKanbanAssessmentExam("owner", "card-1", {
    answers: [0, 1],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(fixture.calls.reports.length, 0);
  assert.equal(fixture.calls.mutate.length, 0);
}

function testPureHelpers() {
  const config = { subject: "Science", questionCount: 7 };
  const line = assessmentConfigLine(config);
  assert.deepEqual(parseAssessmentConfigLine(line), config);
  assert.equal(parseAssessmentConfigLine("missing"), null);
  assert.equal(stripAssessmentConfigMarkers(`x ${line} y`).includes("ASSESSMENT_CONFIG:"), false);
}

async function run() {
  testPureHelpers();
  await testMathGenerationUsesDeterministicTemplates();
  await testModelGenerationUsesInjectedHermesAndSanitizedPrompt();
  await testProgrammingAssessmentRequiresPerCardRequirement();
  await testPriorAssessmentGateBlocksUntilComplete();
  await testRevisionUsesOriginalEffectiveCaseIndexForOpenGate();
  await testFailedSubmissionWritesRetakeStateAndReport();
  await testPassedSubmissionCompletesCardAndReconciles();
  await testDefaultReportWriterUsesCardArtifactDirectory();
  await testDefaultReportWriterUsesBoundDeliverableDirectory();
  await testProgrammingPassWritesCompletionLogAndReturnsExplanations();
  await testCompletionFailurePreservesRetakeRequiredState();
  await testInvalidAnswersDoNotWriteReportOrMutate();
  console.log("assessment exam workflow service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
