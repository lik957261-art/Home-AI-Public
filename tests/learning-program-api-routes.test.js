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
    listSources(input) {
      calls.push(["listSources", input]);
      return [{ sourceId: "source-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    saveSource(input) {
      calls.push(["saveSource", input]);
      return { sourceId: "source-1", workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    listGoals(input) {
      calls.push(["listGoals", input]);
      return [{ goalId: "goal-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    saveGoal(input) {
      calls.push(["saveGoal", input]);
      return { goalId: "goal-1", workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    updateGoal(goalId, input) {
      calls.push(["updateGoal", goalId, input]);
      return { goalId, title: input.title };
    },
    getLearnerProfile(input) {
      calls.push(["profile", input]);
      return { profile: { learnerId: input.learnerId }, skillStates: [] };
    },
    rebuildLearnerProfile(input) {
      calls.push(["rebuildProfile", input]);
      return { profile: { learnerId: input.learnerId }, skillStates: [] };
    },
    listCurriculumReferences(input) {
      calls.push(["curriculum", input]);
      return [{ referenceId: "cefr-a2-b1-english-growth", domain: "english" }];
    },
    importFoundationData(input) {
      calls.push(["importFoundationData", input]);
      return { ok: true, counts: { sources: 1 }, workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    generateParentReport(input) {
      calls.push(["generateParentReport", input]);
      return { ok: true, reportType: "parent_weekly_summary", workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    draftPlan(programId) {
      calls.push(["draft", programId]);
      return { ok: true, draft: { draftId: "draft-1", programId }, taskCards: [{ taskCardId: "task-1" }] };
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
    listTaskCards(input) {
      calls.push(["listTaskCards", input]);
      return [{ taskCardId: "task-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    listExecutorTaskQueue(input) {
      calls.push(["listExecutorTaskQueue", input]);
      return [{ taskCardId: "task-1", workspaceId: input.workspaceId, learnerId: input.learnerId, status: "published", executionStatus: "pending_execution", summary: "summary only" }];
    },
    dailyPlan(input) {
      calls.push(["dailyPlan", input]);
      return {
        workspaceId: input.workspaceId,
        learnerId: input.learnerId,
        startDate: input.startDate || "2026-05-17",
        endDate: "2026-05-23",
        days: [{ date: input.startDate || "2026-05-17", tasks: [{ taskCardId: "task-1", executionStatus: "pending_execution", privacyLevel: "summary_only" }] }],
        nextTask: { taskCardId: "task-1", executionStatus: "pending_execution", privacyLevel: "summary_only" },
        summary: { totalTasks: 1 },
        guidance: { suggestedAction: "start_next_task", privacyLevel: "summary_only" },
        privacyLevel: "summary_only",
      };
    },
    getTaskCard(taskCardId) {
      calls.push(["getTaskCard", taskCardId]);
      return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen" };
    },
    startTaskSession(taskCardId, input) {
      calls.push(["startTaskSession", taskCardId, input]);
      return { sessionId: "session-1", taskCardId, currentStep: "receive_task" };
    },
    listInteractionSessions(input) {
      calls.push(["listSessions", input]);
      return [{ sessionId: "session-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    advanceInteractionSession(sessionId, input) {
      calls.push(["advanceSession", sessionId, input]);
      return { sessionId, currentStep: input.step || "learner_attempt" };
    },
    recordEvaluation(sessionId, input) {
      calls.push(["recordEvaluation", sessionId, input]);
      return { evaluationId: "eval-1", sessionId, score: input.score };
    },
    listEvaluations(input) {
      calls.push(["listEvaluations", input]);
      return [{ evaluationId: "eval-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    settleEvaluationReward(evaluationId, input) {
      calls.push(["settleEvaluationReward", evaluationId, input]);
      return { rewardSettlementId: "settle-1", evaluationId, status: "settled", workspaceId: "weixin_stephen", learnerId: "weixin_stephen" };
    },
    listRewardSettlements(input) {
      calls.push(["listRewardSettlements", input]);
      return [{ rewardSettlementId: "settle-1", evaluationId: "eval-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    getRewardSettlement(rewardSettlementId) {
      calls.push(["getRewardSettlement", rewardSettlementId]);
      return { rewardSettlementId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen" };
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
  assert.equal(LEARNING_PROGRAM_API_ROUTE_SPECS.length, 30);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning/programs" }).id, "learning-programs-list");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/sources" }).id, "learning-sources-create");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/profile" }).id, "learning-profile-read");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/foundation-import" }).id, "learning-foundation-import");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/reports/parent" }).id, "learning-parent-report-read");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/programs/program-1/draft-plan" }).id, "learning-program-draft-plan");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/task-cards" }).id, "learning-task-cards-list");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/task-execution-queue" }).id, "learning-task-execution-queue");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/daily-plan" }).id, "learning-daily-plan");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/sessions" }).id, "learning-task-card-session-start");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/sessions/session-1/evaluations" }).id, "learning-session-evaluation-create");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/evaluations/eval-1/reward-settlement" }).id, "learning-evaluation-reward-settle");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/reward-settlements/settle-1" }).id, "learning-reward-settlement-read");
  assert.equal(routes.summary({ public: true }).byModule["learning-program"], 30);
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
  assert.equal(drafted.body.taskCards[0].taskCardId, "task-1");
}

async function testStudentCannotReadManagementSurfaces() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "GET", "/api/learning/programs?workspaceId=weixin_stephen&learnerId=weixin_stephen", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.body.error, "Owner access required");

  for (const path of [
    "/api/learning/sources?workspaceId=weixin_stephen&learnerId=weixin_stephen",
    "/api/learning/goals?workspaceId=weixin_stephen&learnerId=weixin_stephen",
    "/api/learning/profile?workspaceId=weixin_stephen&learnerId=weixin_stephen",
    "/api/learning/curriculum-references?domain=english",
    "/api/learning/task-cards?workspaceId=weixin_stephen&learnerId=weixin_stephen",
    "/api/learning/reward-settlements?workspaceId=weixin_stephen&learnerId=weixin_stephen",
    "/api/learning/reward-settlements/settle-1",
  ]) {
    const response = await request(routes, "GET", path, {
      auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    });
    assert.equal(response.res.statusCode, 403, path);
    assert.equal(response.body.error, "Owner access required", path);
  }
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

async function testFoundationRoutes() {
  const { routes, calls } = makeRoutes();
  const sourceCreated = await request(routes, "POST", "/api/learning/sources", {
    body: { workspaceId: "weixin_stephen", learnerId: "weixin_stephen", title: "source" },
  });
  assert.equal(sourceCreated.res.statusCode, 201);
  assert.equal(sourceCreated.body.source.sourceId, "source-1");

  const goals = await request(routes, "GET", "/api/learning/goals?workspaceId=weixin_stephen&learnerId=weixin_stephen");
  assert.equal(goals.res.statusCode, 200);
  assert.equal(goals.body.goals[0].goalId, "goal-1");

  const profile = await request(routes, "POST", "/api/learning/profile/rebuild?workspaceId=weixin_stephen", {
    body: { learnerId: "weixin_stephen" },
  });
  assert.equal(profile.res.statusCode, 200);
  assert.equal(profile.body.profile.learnerId, "weixin_stephen");

  const refs = await request(routes, "GET", "/api/learning/curriculum-references?domain=english");
  assert.equal(refs.res.statusCode, 200);
  assert.equal(refs.body.curriculumReferences[0].referenceId, "cefr-a2-b1-english-growth");

  const imported = await request(routes, "POST", "/api/learning/foundation-import", {
    body: {
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      sources: [{ title: "summary only" }],
      goals: [{ title: "goal summary" }],
    },
  });
  assert.equal(imported.res.statusCode, 201);
  assert.equal(imported.body.counts.sources, 1);
  assert.equal(calls.at(-1)[0], "importFoundationData");

  const report = await request(routes, "GET", "/api/learning/reports/parent?workspaceId=weixin_stephen&learnerId=weixin_stephen&startDate=2026-05-11&endDate=2026-05-17");
  assert.equal(report.res.statusCode, 200);
  assert.equal(report.body.reportType, "parent_weekly_summary");
  assert.equal(calls.at(-1)[0], "generateParentReport");
  assert.ok(calls.some((call) => call[0] === "saveSource"));
  assert.ok(calls.some((call) => call[0] === "rebuildProfile"));
}

async function testTaskSessionEvaluationRoutes() {
  const { routes, calls } = makeRoutes();
  const taskList = await request(routes, "GET", "/api/learning/task-cards?workspaceId=weixin_stephen&learnerId=weixin_stephen");
  assert.equal(taskList.res.statusCode, 200);
  assert.equal(taskList.body.taskCards[0].taskCardId, "task-1");

  const executionQueue = await request(routes, "GET", "/api/learning/task-execution-queue?workspaceId=weixin_stephen&learnerId=weixin_stephen", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(executionQueue.res.statusCode, 200);
  assert.equal(executionQueue.body.taskCards[0].executionStatus, "pending_execution");
  assert.equal(calls.at(-1)[0], "listExecutorTaskQueue");

  const dailyPlan = await request(routes, "GET", "/api/learning/daily-plan?workspaceId=weixin_stephen&learnerId=weixin_stephen&startDate=2026-05-17&days=7&status=review_required", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(dailyPlan.res.statusCode, 200);
  assert.equal(dailyPlan.body.dailyPlan.nextTask.executionStatus, "pending_execution");
  assert.equal(dailyPlan.body.dailyPlan.privacyLevel, "summary_only");
  assert.equal(calls.at(-1)[0], "dailyPlan");
  assert.equal(calls.at(-1)[1].workspaceId, "weixin_stephen");
  assert.equal(calls.at(-1)[1].learnerId, "weixin_stephen");
  assert.equal(calls.at(-1)[1].status, "published");

  const ownerDailyPlan = await request(routes, "GET", "/api/learning/daily-plan?workspaceId=weixin_stephen&learnerId=weixin_stephen&includeAllStatuses=1");
  assert.equal(ownerDailyPlan.res.statusCode, 200);
  assert.equal(calls.at(-1)[0], "dailyPlan");
  assert.equal(calls.at(-1)[1].includeAllStatuses, true);

  const task = await request(routes, "GET", "/api/learning/task-cards/task-1", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(task.res.statusCode, 200);
  assert.equal(task.body.taskCard.taskCardId, "task-1");

  const session = await request(routes, "POST", "/api/learning/task-cards/task-1/sessions", {
    body: { summary: "start" },
  });
  assert.equal(session.res.statusCode, 201);
  assert.equal(session.body.session.sessionId, "session-1");

  const advanced = await request(routes, "POST", "/api/learning/sessions/session-1/advance", {
    body: { step: "learner_attempt", summary: "summary only" },
  });
  assert.equal(advanced.res.statusCode, 200);
  assert.equal(advanced.body.session.currentStep, "learner_attempt");

  const evaluation = await request(routes, "POST", "/api/learning/sessions/session-1/evaluations", {
    body: { score: 88, summary: "summary only" },
  });
  assert.equal(evaluation.res.statusCode, 201);
  assert.equal(evaluation.body.evaluation.score, 88);

  const evaluations = await request(routes, "GET", "/api/learning/evaluations?workspaceId=weixin_stephen&learnerId=weixin_stephen");
  assert.equal(evaluations.res.statusCode, 200);
  const reward = await request(routes, "POST", "/api/learning/evaluations/eval-1/reward-settlement", {
    body: { reason: "summary only" },
  });
  assert.equal(reward.res.statusCode, 201);
  assert.equal(reward.body.rewardSettlement.status, "settled");
  const rewards = await request(routes, "GET", "/api/learning/reward-settlements?workspaceId=weixin_stephen&learnerId=weixin_stephen");
  assert.equal(rewards.res.statusCode, 200);
  assert.equal(rewards.body.rewardSettlements[0].rewardSettlementId, "settle-1");
  const rewardRead = await request(routes, "GET", "/api/learning/reward-settlements/settle-1");
  assert.equal(rewardRead.res.statusCode, 200);
  assert.ok(calls.some((call) => call[0] === "recordEvaluation"));
  assert.ok(calls.some((call) => call[0] === "settleEvaluationReward"));
}

(async () => {
  await testMetadata();
  await testCreateAndDraftRequireOwner();
  await testStudentCannotReadManagementSurfaces();
  await testReviewDecision();
  await testFoundationRoutes();
  await testTaskSessionEvaluationRoutes();
  console.log("learning program api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
