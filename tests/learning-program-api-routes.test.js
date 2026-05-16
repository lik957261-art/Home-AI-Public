"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_PROGRAM_API_ROUTE_SPECS,
  createLearningProgramApiRoutes,
} = require("../server-routes/learning-program-api-routes");

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
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = [];
  const service = Object.assign({
    createProgram(input) {
      calls.push(["create", input]);
      return { programId: "program-1", workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    listPrograms(input) {
      calls.push(["list", input]);
      return [{ programId: "program-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    getProgram(programId) {
      calls.push(["get", programId]);
      return { programId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen" };
    },
    updateProgram(programId, input) {
      calls.push(["update", programId, input]);
      return { programId, title: input.title };
    },
    draftPlan(programId) {
      calls.push(["draft", programId]);
      return { ok: true, draft: { draftId: "draft-1", programId } };
    },
    async publishProgram(programId, input) {
      calls.push(["publish", programId, input]);
      return { ok: true, publication: { publicationId: "pub-1" } };
    },
    reviewQueue(input) {
      calls.push(["reviewQueue", input]);
      return [{ reviewId: "review-1", status: "pending" }];
    },
    decideReview(reviewId, input) {
      calls.push(["decide", reviewId, input]);
      return { reviewId, status: input.decision };
    },
  }, overrides.service || {});
  const deps = Object.assign({
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner);
    },
    learningProgramService: service,
    async readBody(req) {
      return req.body || {};
    },
    requireOwner(req, res) {
      if (!req.auth?.isOwner) {
        sendJson(res, 403, { error: "Owner access required" });
        return null;
      }
      return req.auth;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson,
  }, overrides.deps || {});
  return { routes: createLearningProgramApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const auth = options.auth || { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true };
  const req = { method, url: path, headers: {}, body: options.body || {}, auth };
  const result = await routes.handle(req, res, makeUrl(path), { auth });
  return { result, res, body: parseBody(res) };
}

async function testMetadata() {
  assert.equal(LEARNING_PROGRAM_API_ROUTE_SPECS.length, 8);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning/programs" }).id, "learning-programs-list");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/programs/program-1/draft-plan" }).id, "learning-program-draft-plan");
  assert.equal(routes.summary({ public: true }).byModule["learning-program"], 8);
}

async function testCreateAndDraftRequireOwner() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "POST", "/api/learning/programs", {
    auth: { ok: true, workspaceId: "weixin_stephen", isOwner: false },
    body: { title: "x" },
  });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(calls.length, 0);

  const created = await request(routes, "POST", "/api/learning/programs", {
    body: { workspaceId: "weixin_stephen", learnerId: "weixin_stephen", title: "x" },
  });
  assert.equal(created.res.statusCode, 201);
  assert.equal(created.body.program.programId, "program-1");
  const drafted = await request(routes, "POST", "/api/learning/programs/program-1/draft-plan");
  assert.equal(drafted.res.statusCode, 201);
  assert.equal(calls.at(-1)[0], "draft");
}

async function testStudentCannotReadAnotherLearner() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "GET", "/api/learning/programs?workspaceId=weixin_stephen&learnerId=other", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.body.error, "Learner access is not allowed");
}

async function testReviewDecision() {
  const { routes, calls } = makeRoutes();
  const response = await request(routes, "POST", "/api/learning/review-queue/review-1/decision", {
    body: { decision: "approved" },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.reviewItem.status, "approved");
  assert.equal(calls.at(-1)[0], "decide");
}

(async () => {
  await testMetadata();
  await testCreateAndDraftRequireOwner();
  await testStudentCannotReadAnotherLearner();
  await testReviewDecision();
  console.log("learning program api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
