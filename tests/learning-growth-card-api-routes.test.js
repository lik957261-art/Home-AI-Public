"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_GROWTH_CARD_API_ROUTE_SPECS,
  createLearningGrowthCardApiRoutes,
} = require("../server-routes/learning-growth-card-api-routes");

function makeReq(method, url, body = {}) {
  return {
    method,
    url,
    __body: body,
    headers: {},
  };
}

function makeRes() {
  return {
    statusCode: 0,
    body: null,
  };
}

function makeDeps(overrides = {}) {
  const task = {
    taskCardId: "task-1",
    learnerId: "learner-1",
    workspaceId: "learner-1",
    status: "published",
  };
  return Object.assign({
    isOwnerAuth: (auth) => Boolean(auth?.isOwner),
    readBody: async (req) => req.__body || {},
    requireOwner(req, res) {
      if (req.__owner) return { principalId: "owner" };
      res.statusCode = 403;
      res.body = JSON.stringify({ ok: false, error: "Owner required" });
      return null;
    },
    requireWorkspaceAccess(_req, _res, workspaceId) {
      return workspaceId;
    },
    sendJson(res, status, payload) {
      res.statusCode = status;
      res.body = JSON.stringify(payload);
    },
    learningProgramService: {
      getTaskCard(id) {
        return id === task.taskCardId ? task : null;
      },
    },
    learningGrowthTeachingCheckService: {
      complete(input) {
        return { ok: true, taskCard: { taskCardId: input.taskCardId, status: "completed" } };
      },
    },
    learningGrowthExperienceSignalService: {
      record(input) {
        return { ok: true, signal: { taskCardId: input.taskCardId, signalType: input.signalType } };
      },
    },
    learningGrowthStageAssessmentService: {
      challenge(input) {
        return { ok: true, taskCard: { taskCardId: "stage-1", workspaceId: input.workspaceId } };
      },
      activate(cycleId) {
        return { ok: true, cycle: { cycleId } };
      },
    },
  }, overrides);
}

async function testRouteMetadata() {
  const routes = createLearningGrowthCardApiRoutes(makeDeps());
  assert.equal(LEARNING_GROWTH_CARD_API_ROUTE_SPECS.length, 4);
  assert.ok(routes.match({ method: "POST", path: "/api/learning-growth/cards/task-1/teaching-check" }));
  assert.ok(routes.match({ method: "POST", path: "/api/learning-growth/stage-assessments/challenge" }));
}

async function testTeachingCheckRoute() {
  const routes = createLearningGrowthCardApiRoutes(makeDeps());
  const res = makeRes();
  await routes.handle(makeReq("POST", "/api/learning-growth/cards/task-1/teaching-check", { quickCheckText: "summary only" }), res, new URL("http://x/api/learning-growth/cards/task-1/teaching-check"), {
    auth: { workspaceId: "learner-1", principalId: "learner-1" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).taskCard.status, "completed");
}

async function testExperienceSignalRoute() {
  const routes = createLearningGrowthCardApiRoutes(makeDeps());
  const res = makeRes();
  await routes.handle(makeReq("POST", "/api/learning-growth/cards/task-1/experience-signal", { signalType: "too_hard" }), res, new URL("http://x/api/learning-growth/cards/task-1/experience-signal"), {
    auth: { workspaceId: "learner-1", principalId: "learner-1" },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).signal.signalType, "too_hard");
}

async function testChallengeRoute() {
  const routes = createLearningGrowthCardApiRoutes(makeDeps());
  const res = makeRes();
  await routes.handle(makeReq("POST", "/api/learning-growth/stage-assessments/challenge", { workspaceId: "learner-1", learnerId: "learner-1" }), res, new URL("http://x/api/learning-growth/stage-assessments/challenge"), {
    auth: { workspaceId: "learner-1", principalId: "learner-1" },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).taskCard.taskCardId, "stage-1");
}

async function run() {
  await testRouteMetadata();
  await testTeachingCheckRoute();
  await testExperienceSignalRoute();
  await testChallengeRoute();
  console.log("learning growth card api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
