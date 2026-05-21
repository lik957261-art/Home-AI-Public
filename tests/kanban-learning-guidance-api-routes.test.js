"use strict";

const assert = require("node:assert/strict");
const {
  KANBAN_LEARNING_GUIDANCE_API_ROUTE_SPECS,
  createKanbanLearningGuidanceApiRoutes,
} = require("../server-routes/kanban-learning-guidance-api-routes");

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
    readBody: [],
    get: [],
    apply: [],
  };
  const deps = Object.assign({
    compactText(value) {
      return String(value || "");
    },
    learningCardGuidanceService: {
      getSession(input) {
        calls.get.push(input);
        return { ok: true, mode: input.mode, cardId: input.cardId, guidance: { questions: [] } };
      },
      applyAction(input) {
        calls.apply.push(input);
        return { ok: true, action: input.action, mode: input.mode, cardId: input.cardId, guidance: { questions: [] } };
      },
    },
    async readBody(req, limit) {
      calls.readBody.push({ limit });
      return req.body || {};
    },
    async resolveKanbanCardAccess(req, res, workspaceId, cardId, capability) {
      calls.access.push({ workspaceId, cardId, capability });
      if (workspaceId === "denied") {
        sendJson(res, 403, { error: "denied" });
        return null;
      }
      return {
        workspaceId: workspaceId || "owner",
        auth: { workspaceId: workspaceId || "owner" },
        card: { id: cardId, kanbanCaseId: "case-1" },
      };
    },
    sendJson,
    useKanbanTodoBackend() {
      return true;
    },
  }, overrides);
  return { routes: createKanbanLearningGuidanceApiRoutes(deps), calls };
}

async function request(routes, method, path, body = {}) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: path, body }, res, makeUrl(path), {});
  return { result, res, body: JSON.parse(res.body || "{}") };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(KANBAN_LEARNING_GUIDANCE_API_ROUTE_SPECS.map((route) => route.id), ["kanban-learning-guidance"]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/card-1/learning-guidance" }).id, "kanban-learning-guidance");
  assert.equal(routes.summary({ public: true }).byModule["kanban-learning-guidance"], 1);
  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
}

async function testGetUsesViewCapability() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/kanban/cards/card-1/learning-guidance?workspaceId=child&mode=reading-quiz");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.access[0], { workspaceId: "child", cardId: "card-1", capability: "view" });
  assert.equal(calls.get[0].mode, "reading-quiz");
  assert.equal(calls.get[0].card.id, "card-1");
}

async function testPostUsesAnswerCapabilityAndBody() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/kanban/cards/card-1/learning-guidance", {
    workspaceId: "child",
    mode: "assessment-exam",
    action: "hint",
    question: { id: "q1" },
  });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.access[0], { workspaceId: "child", cardId: "card-1", capability: "answerQuiz" });
  assert.equal(calls.apply[0].action, "hint");
  assert.equal(calls.apply[0].question.id, "q1");
}

async function testDisabledAndDependencyValidation() {
  const disabled = makeRoutes({ useKanbanTodoBackend: () => false });
  const got = await request(disabled.routes, "GET", "/api/kanban/cards/card-1/learning-guidance?workspaceId=owner&mode=reading-quiz");
  assert.equal(got.res.statusCode, 409);

  assert.throws(
    () => createKanbanLearningGuidanceApiRoutes({}),
    /kanban learning guidance api routes require readBody/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testGetUsesViewCapability();
  await testPostUsesAnswerCapabilityAndBody();
  await testDisabledAndDependencyValidation();
  console.log("kanban learning guidance api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
