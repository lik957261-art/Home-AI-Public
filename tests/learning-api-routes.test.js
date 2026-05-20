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
          viewerRole: input.viewerRole,
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
  assert.deepEqual(LEARNING_API_ROUTE_SPECS.map((route) => route.id), ["learning-growth-overview", "learning-overview", "learning-status"]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning-growth/overview" }).id, "learning-growth-overview");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/overview" }).id, "learning-overview");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/status" }).id, "learning-status");
  assert.equal(routes.summary({ public: true }).total, 3);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testOwnerCanReadLearningStatusReadiness() {
  const { routes, growthInputs } = makeRoutes({
    learningGrowthService: {
      overview(input) {
        growthInputs.push(input);
        return {
          module: { id: "fanfan-growth" },
          learner: { id: input.learnerId, workspaceId: input.workspaceId },
          operationalReadiness: {
            version: "learning-growth-v1",
            status: "operational_ready",
            operationalTestReady: true,
          },
          launchOperations: {
            version: "learning-growth-launch-ops-v1",
            status: "ready",
          },
        };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning/status?workspaceId=weixin_stephen&learnerId=weixin_stephen", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.learning.moduleId, "fanfan-growth");
  assert.equal(response.body.learning.readiness.status, "operational_ready");
  assert.equal(response.body.learning.launchOperations.status, "ready");
  assert.deepEqual(growthInputs[0], {
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    studentId: "weixin_stephen",
    limit: null,
    owner: true,
    viewerRole: "owner",
  });
}

async function testExecutorCannotReadLearningStatus() {
  const { routes, growthInputs } = makeRoutes();
  const response = await request(routes, "GET", "/api/learning/status?workspaceId=child&learnerId=child", {
    auth: { ok: true, workspaceId: "child", principalId: "child", isOwner: false },
  });
  assert.equal(response.res.statusCode, 403);
  assert.equal(response.body.error, "Owner access is required");
  assert.equal(growthInputs.length, 0);
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
    owner: true,
    viewerRole: "owner",
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
    owner: true,
    viewerRole: "owner",
  });
}

async function testOwnerWorkspaceWithLearnerUsesExecutorWorkspace() {
  const { routes, growthInputs } = makeRoutes();
  const response = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=owner&studentId=weixin_stephen", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.learner.workspaceId, "weixin_stephen");
  assert.deepEqual(growthInputs[0], {
    workspaceId: "weixin_stephen",
    learnerId: "weixin_stephen",
    studentId: "weixin_stephen",
    limit: null,
    owner: true,
    viewerRole: "owner",
  });
}

async function testStudentReadsOwnOverviewAsExecutor() {
  const { routes, growthInputs } = makeRoutes();
  const response = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=child&studentId=child&limit=7", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.viewerRole, "executor");
  assert.deepEqual(growthInputs[0], {
    workspaceId: "child",
    learnerId: "child",
    studentId: "child",
    limit: "7",
    owner: false,
    viewerRole: "executor",
  });
}

async function testOverviewSkipsKanbanProjectionByDefault() {
  let kanbanCalls = 0;
  const { routes, growthInputs } = makeRoutes({
    learningGrowthTaskService: {
      async listExecutableTasks() {
        kanbanCalls += 1;
        return {
          ok: true,
          tasks: [{ taskCardId: "t_growth", todoId: "t_growth", source: "kanban", status: "published" }],
        };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=weixin_stephen&studentId=weixin_stephen", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(kanbanCalls, 0);
  assert.equal(growthInputs[0].executableTasks, undefined);
}

async function testOverviewIncludesExecutableKanbanTasksOnlyWhenRequested() {
  const { routes, growthInputs } = makeRoutes({
    learningGrowthTaskService: {
      async listExecutableTasks(input) {
        assert.equal(input.workspaceId, "weixin_stephen");
        assert.equal(input.learnerId, "weixin_stephen");
        return {
          ok: true,
          tasks: [{ taskCardId: "t_growth", todoId: "t_growth", source: "kanban", status: "published" }],
        };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning-growth/overview?workspaceId=weixin_stephen&studentId=weixin_stephen&includeKanbanProjection=1", {
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(response.res.statusCode, 200);
  assert.deepEqual(growthInputs[0].executableTasks, [
    { taskCardId: "t_growth", todoId: "t_growth", source: "kanban", status: "published" },
  ]);
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
  await testOwnerWorkspaceWithLearnerUsesExecutorWorkspace();
  await testStudentReadsOwnOverviewAsExecutor();
  await testOverviewSkipsKanbanProjectionByDefault();
  await testOverviewIncludesExecutableKanbanTasksOnlyWhenRequested();
  await testStudentCannotReadAnotherLearner();
  await testOwnerCanReadLearningStatusReadiness();
  await testExecutorCannotReadLearningStatus();
  console.log("learning api route tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
