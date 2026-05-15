"use strict";

const assert = require("node:assert/strict");
const {
  KANBAN_STUDY_API_ROUTE_SPECS,
  createKanbanStudyApiRoutes,
} = require("../server-routes/kanban-study-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    access: [],
    annotate: [],
    broadcasts: [],
    clearCache: [],
    errors: [],
    readBody: [],
    requireWorkspace: [],
    studyPlans: [],
    assessmentPlans: [],
    submissions: [],
    quizzes: [],
    exams: [],
  };
  const deps = Object.assign({
    annotateKanbanCardForAuth(card, auth) {
      calls.annotate.push({ card, auth });
      return Object.assign({}, card, { annotated: true });
    },
    broadcast(event) {
      calls.broadcasts.push(event);
    },
    clearKanbanCardListCache(workspaceId) {
      calls.clearCache.push(workspaceId);
    },
    compactText(value) {
      return String(value || "");
    },
    async createKanbanAssessmentPlanCards(workspaceId, body) {
      calls.assessmentPlans.push({ workspaceId, body });
      return { ok: true, kind: "assessment", workspaceId };
    },
    async createKanbanStudyPlanCards(workspaceId, body) {
      calls.studyPlans.push({ workspaceId, body });
      return { ok: true, kind: "study", workspaceId };
    },
    async getKanbanAssessmentExam(workspaceId, cardId) {
      calls.exams.push({ mode: "get", workspaceId, cardId });
      return { ok: true, exam: { id: "exam" }, card: { id: cardId } };
    },
    async getKanbanReadingQuiz(workspaceId, cardId) {
      calls.quizzes.push({ mode: "get", workspaceId, cardId });
      return { ok: true, quiz: { id: "quiz" }, card: { id: cardId } };
    },
    kanbanErrorResponse(res, result, fallbackStatus = 502) {
      calls.errors.push({ result, fallbackStatus });
      sendJson(res, result.status || fallbackStatus, result);
    },
    async readBody(req, limit) {
      calls.readBody.push({ limit });
      if (req.throwBody) throw new Error("bad body");
      return req.body || {};
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.requireWorkspace.push(workspaceId);
      if (workspaceId === "denied") {
        sendJson(res, 403, { error: "denied" });
        return "";
      }
      return workspaceId || "owner";
    },
    async resolveKanbanCardAccess(req, res, workspaceId, cardId, capability) {
      calls.access.push({ workspaceId, cardId, capability });
      if (workspaceId === "denied") {
        sendJson(res, 403, { error: "denied" });
        return null;
      }
      return { workspaceId: workspaceId || "owner", auth: { workspaceId: workspaceId || "owner" } };
    },
    sendJson,
    async startKanbanAssessmentExam(workspaceId, cardId, body) {
      calls.exams.push({ mode: "start", workspaceId, cardId, body });
      return { ok: true, exam: { id: "exam" }, status: "in_progress" };
    },
    async submitKanbanAssessmentExam(workspaceId, cardId, body) {
      calls.exams.push({ mode: "submit", workspaceId, cardId, body });
      return { ok: true, passed: Boolean(body.passed), card: { id: cardId } };
    },
    async submitKanbanReadingQuiz(workspaceId, cardId, body) {
      calls.quizzes.push({ mode: "submit", workspaceId, cardId, body });
      return { ok: true, passed: Boolean(body.passed), card: { id: cardId } };
    },
    async submitKanbanReadingSubmission(workspaceId, cardId, body) {
      calls.submissions.push({ workspaceId, cardId, body });
      return { ok: true, card: { id: cardId } };
    },
    useKanbanTodoBackend() {
      return true;
    },
  }, overrides);
  return { routes: createKanbanStudyApiRoutes(deps), calls };
}

async function request(routes, method, path, body = {}) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: path, body }, res, makeUrl(path), {});
  return { result, res, body: JSON.parse(res.body || "{}") };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(KANBAN_STUDY_API_ROUTE_SPECS.map((route) => route.id), [
    "kanban-card-study-plan",
    "kanban-card-assessment-plan",
    "kanban-reading-submission",
    "kanban-reading-quiz",
    "kanban-assessment-exam",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/study-plan" }).id, "kanban-card-study-plan");
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/card-1/study-quiz" }).id, "kanban-reading-quiz");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/card-1/assessment-exam" }).id, "kanban-assessment-exam");
  assert.equal(routes.summary({ public: true }).byModule["kanban-study"], 5);
  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
}

async function testPlanCreationRoutes() {
  const { routes, calls } = makeRoutes();
  const study = await request(routes, "POST", "/api/kanban/cards/study-plan", { workspaceId: "owner", title: "plan" });
  assert.equal(study.res.statusCode, 201);
  assert.deepEqual(calls.studyPlans, [{ workspaceId: "owner", body: { workspaceId: "owner", title: "plan" } }]);
  assert.equal(calls.broadcasts[0].action, "study-plan-add");

  const assessment = await request(routes, "POST", "/api/kanban/cards/assessment-plan", { workspaceId: "child" });
  assert.equal(assessment.res.statusCode, 201);
  assert.deepEqual(calls.assessmentPlans, [{ workspaceId: "child", body: { workspaceId: "child" } }]);
  assert.equal(calls.broadcasts.at(-1).action, "assessment-plan-add");
}

async function testSubmissionAndQuizRoutes() {
  const { routes, calls } = makeRoutes();
  const submission = await request(routes, "POST", "/api/kanban/cards/card-1/study-submission", { workspaceId: "child" });
  assert.equal(submission.res.statusCode, 200);
  assert.equal(calls.access[0].capability, "submitStudy");
  assert.deepEqual(calls.submissions[0], { workspaceId: "child", cardId: "card-1", body: { workspaceId: "child" } });
  assert.equal(submission.body.card.annotated, true);

  const quiz = await request(routes, "POST", "/api/kanban/cards/card-1/reading-quiz", { workspaceId: "child", passed: true });
  assert.equal(quiz.res.statusCode, 200);
  assert.equal(calls.access.at(-1).capability, "answerQuiz");
  assert.equal(calls.broadcasts.at(-2).action, "reading-quiz-passed");

  const quizRead = await request(routes, "GET", "/api/kanban/cards/card-1/study-quiz?workspaceId=child");
  assert.equal(quizRead.res.statusCode, 200);
  assert.equal(calls.access.at(-1).capability, "view");
}

async function testAssessmentExamRoutes() {
  const { routes, calls } = makeRoutes();
  const read = await request(routes, "GET", "/api/kanban/cards/exam-1/assessment-exam?workspaceId=owner");
  assert.equal(read.res.statusCode, 200);
  assert.equal(calls.access.at(-1).capability, "view");
  assert.deepEqual(calls.exams[0], { mode: "get", workspaceId: "owner", cardId: "exam-1" });

  const submit = await request(routes, "POST", "/api/kanban/cards/exam-1/assessment-exam", { workspaceId: "owner", passed: false });
  assert.equal(submit.res.statusCode, 200);
  assert.equal(calls.access.at(-1).capability, "answerQuiz");
  assert.equal(calls.broadcasts.at(-2).action, "assessment-retake");

  const start = await request(routes, "POST", "/api/kanban/cards/exam-2/assessment-exam", { workspaceId: "owner", generateOnly: true, requirement: "Python loops" });
  assert.equal(start.res.statusCode, 200);
  assert.deepEqual(calls.exams.at(-1), {
    mode: "start",
    workspaceId: "owner",
    cardId: "exam-2",
    body: { workspaceId: "owner", generateOnly: true, requirement: "Python loops" },
  });
  assert.equal(calls.broadcasts.at(-2).action, "assessment-exam-started");
}

async function testDisabledAndBadBody() {
  const disabled = makeRoutes({ useKanbanTodoBackend: () => false });
  const got = await request(disabled.routes, "POST", "/api/kanban/cards/study-plan", { workspaceId: "owner" });
  assert.equal(got.res.statusCode, 409);

  const { routes } = makeRoutes();
  const res = makeResponse();
  await routes.handle({ method: "POST", url: "/api/kanban/cards/card-1/study-submission", throwBody: true }, res, makeUrl("/api/kanban/cards/card-1/study-submission"), {});
  assert.equal(res.statusCode, 400);
}

function testDependencyValidation() {
  assert.throws(
    () => createKanbanStudyApiRoutes({}),
    /kanban study api routes require annotateKanbanCardForAuth/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testPlanCreationRoutes();
  await testSubmissionAndQuizRoutes();
  await testAssessmentExamRoutes();
  await testDisabledAndBadBody();
  testDependencyValidation();
  console.log("kanban study api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
