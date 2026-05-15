"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createKanbanStudyArtifactService } = require("../adapters/kanban-study-artifact-service");

function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-study-artifacts-"));
  const writes = [];
  const stores = new Map();
  const service = createKanbanStudyArtifactService({
    artifactRoot: root,
    nowIso: () => "2026-05-14T12:00:00.000Z",
    safeStorageSegment: (value) => String(value || "").replace(/[^A-Za-z0-9_-]+/g, "_") || "item",
    readJsonStore: (file, fallback) => stores.has(file) ? stores.get(file) : fallback,
    writeJsonStore: (file, value) => {
      stores.set(file, value);
      writes.push({ file, value });
    },
    publicKanbanOutputFile: (_workspaceId, rawPath) => ({ path: rawPath, url: `/file?path=${encodeURIComponent(rawPath)}` }),
    isKanbanStudyCaseMode: (mode) => mode === "study-plan",
  });

  const dir = service.readingArtifactDirectory("owner", "case one", "card/1");
  assert.equal(dir.startsWith(root), true);
  assert.equal(fs.existsSync(dir), true);
  assert.match(dir, /case_one/);
  const boundRoot = path.join(root, "bound", "case-a");
  const boundService = createKanbanStudyArtifactService({
    artifactRoot: root,
    safeStorageSegment: (value) => String(value || "").replace(/[^A-Za-z0-9_-]+/g, "_") || "item",
    caseDirectoryPathForCase: (_workspaceId, caseId) => caseId === "case-a" ? boundRoot : "",
  });
  const boundDir = boundService.caseDeliverableDirectory("owner", "case-a", "card/1");
  assert.equal(boundDir, path.join(boundRoot, "deliverables", "card_1"));
  assert.equal(fs.existsSync(boundDir), true);
  assert.equal(boundService.caseDeliverableDirectory("owner", "case-missing", "card/1").startsWith(root), true);
  assert.equal(boundService.assessmentExamReportDirectory("owner", "exam/1", { kanbanCaseId: "case-a" }), path.join(boundRoot, "deliverables", "exam_1"));

  assert.equal(service.readingQuizUrl("owner", "card-1"), "/?view=todos&workspaceId=owner&todoId=card-1&readingQuiz=1");
  const readingState = service.writeReadingSubmissionState("owner", "card-1", { kanbanCaseId: "case-a" }, {
    status: "quiz_pending",
    analysisPath: path.join(root, "analysis.md"),
  });
  assert.equal(readingState.updatedAt, "2026-05-14T12:00:00.000Z");
  assert.equal(writes.length, 1);
  assert.equal(service.readReadingSubmissionState("owner", "card-1", { kanbanCaseId: "case-a" }).status, "quiz_pending");

  const summary = service.publicReadingSubmissionSummary("owner", {
    id: "card-1",
    kanbanCaseId: "case-a",
    kanbanCaseMode: "study-plan",
  });
  assert.equal(summary.status, "quiz_pending");
  assert.equal(summary.quizUrl, "/?view=todos&workspaceId=owner&todoId=card-1&readingQuiz=1");
  assert.equal(summary.analysisOutput.url.startsWith("/file?path="), true);
  assert.equal(service.publicReadingSubmissionSummary("owner", { id: "card-1", kanbanCaseMode: "assessment-plan" }), null);

  const quiz = service.publicReadingQuiz({
    title: "Daily quiz",
    questions: [{ id: "q1", prompt: "P", choices: ["A", "B"], answerIndex: 1, skill: "grammar" }],
  });
  assert.deepEqual(Object.keys(quiz.questions[0]).sort(), ["choices", "id", "prompt", "skill"]);
  assert.equal(quiz.passingScore, 100);

  const examState = service.writeAssessmentExamState("owner", "exam-1", { kanbanCaseId: "case-b" }, {
    status: "in_progress",
    startedAt: "2026-05-14T12:01:00.000Z",
  });
  assert.equal(examState.status, "in_progress");
  assert.equal(service.readAssessmentExamState("owner", "exam-1", { kanbanCaseId: "case-b" }).startedAt, "2026-05-14T12:01:00.000Z");
  assert.equal(service.assessmentExamReportDirectory("owner", "exam-1", { kanbanCaseId: "case-b" }).includes(path.join("owner", "case-b", "exam-1")), true);

  const exam = service.publicAssessmentExam({
    title: "Formal",
    subject: "Math",
    subjectId: "math",
    durationMinutes: 40,
    passingScore: 80,
    verification: "deterministic-template",
    questions: [{ id: "q1", prompt: "2+2?", choices: ["3", "4"], answerIndex: 1, explanation: "x", skill: "arithmetic" }],
  }, examState);
  assert.equal(exam.subjectId, "math");
  assert.equal(exam.questions[0].answerIndex, undefined);
  assert.equal(exam.questions[0].explanation, undefined);
  assert.equal(exam.questions[0].skill, "arithmetic");
}

run();
console.log("kanban-study-artifact-service tests passed");
