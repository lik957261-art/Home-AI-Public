"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_API_ROUTE_SPECS,
  createLearningApiRoutes,
} = require("../server-routes/learning-api-routes");

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
  const calls = { workspaceAccess: [] };
  const growthInputs = [];
  const deps = Object.assign({
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner);
    },
    learningGrowthService: {
      overview(input) {
        growthInputs.push(input);
        return {
          module: { id: "fanfan-growth", currentEntry: "成长标签" },
          learner: { id: input.learnerId, studentId: input.studentId, workspaceId: input.workspaceId },
          coins: { studentId: input.studentId },
        };
      },
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson,
  }, overrides);
  return { routes: createLearningApiRoutes(deps), calls, growthInputs };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, headers: {} },
    res,
    makeUrl(path),
    { auth: options.auth || { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true } },
  );
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(LEARNING_API_ROUTE_SPECS.map((route) => route.id), ["learning-growth-overview", "learning-overview"]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning-growth/overview" }).id, "learning-growth-overview");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/overview" }).id, "learning-overview");
  assert.equal(routes.summary({ public: true }).total, 2);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testOverviewUsesRequestedExecutorWorkspaceForOwner() {
  const { routes, growthInputs } = makeRoutes();
  const response = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=weixin_stephen&studentId=weixin_stephen&limit=5", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.learner.studentId, "weixin_stephen");
  assert.deepEqual(growthInputs[0], {
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    studentId: "weixin_stephen",
    limit: "5",
  });
}

async function testOwnerDefaultOverviewUsesFanfanLearnerBinding() {
  const { routes, growthInputs } = makeRoutes();
  const response = await request(routes, "GET", "/api/learning-growth/overview", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.learner.studentId, "weixin_stephen");
  assert.deepEqual(growthInputs[0], {
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    studentId: "weixin_stephen",
    limit: null,
  });
}

async function testStudentCannotReadAnotherLearner() {
  const { routes, growthInputs } = makeRoutes();
  const denied = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=child&studentId=other", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.body.error, "Learner access is not allowed");
  assert.equal(growthInputs.length, 0);
}

(async () => {
  await testMetadataAndFallthrough();
  await testOverviewUsesRequestedExecutorWorkspaceForOwner();
  await testOwnerDefaultOverviewUsesFanfanLearnerBinding();
  await testStudentCannotReadAnotherLearner();
  console.log("learning api route tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
