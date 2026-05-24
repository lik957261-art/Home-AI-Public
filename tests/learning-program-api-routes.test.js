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
    importSourceDirectory(input) {
      calls.push(["importSourceDirectory", input]);
      return {
        ok: true,
        binding: { bindingId: input.bindingId || "learning-materials:weixin_stephen", directoryLabel: "\u5b66\u4e60\u8d44\u6599" },
        counts: { sources: 2, importedSources: 2 },
      };
    },
    bootstrapFromSourceDirectory(input) {
      calls.push(["bootstrapFromSourceDirectory", input]);
      return {
        ok: true,
        created: { sources: 2, goal: 1, program: 1, profile: 1 },
        goal: { goalId: "goal-1", domain: "english" },
        program: { programId: "program-1", domain: "english" },
      };
    },
    generateParentReport(input) {
      calls.push(["generateParentReport", input]);
      return { ok: true, reportType: "parent_weekly_summary", workspaceId: input.workspaceId, learnerId: input.learnerId };
    },
    async recommendTaskSeries(input) {
      calls.push(["recommendTaskSeries", input]);
      return {
        ok: true,
        privacyLevel: "summary_only",
        recommendedSeries: [{ recommendationId: "rec-1", templateId: "english-speaking-retell-v1", skillId: "english_speaking_retell" }],
      };
    },
    latestTaskSeriesRecommendation(input) {
      calls.push(["latestTaskSeriesRecommendation", input]);
      return {
        ok: true,
        privacyLevel: "summary_only",
        recommendationRunId: "run-1",
        workspaceId: input.workspaceId,
        learnerId: input.learnerId,
        recommendedSeries: [{ recommendationId: "rec-1", templateId: "english-speaking-retell-v1", skillId: "english_speaking_retell" }],
      };
    },
    async createRecommendedTaskSeriesDraft(input) {
      calls.push(["createRecommendedTaskSeriesDraft", input]);
      return {
        ok: true,
        program: { programId: "program-ai", workspaceId: input.workspaceId, learnerId: input.learnerId },
        draft: { draftId: "draft-ai", programId: "program-ai" },
        taskCards: [{ taskCardId: "task-ai" }],
        recommendation: input.recommendation,
      };
    },
    draftPlan(programId) {
      calls.push(["draft", programId]);
      return { ok: true, draft: { draftId: "draft-1", programId }, taskCards: [{ taskCardId: "task-1" }] };
    },
    rebuildDraftPlan(programId, input) {
      calls.push(["rebuildDraft", programId, input]);
      return { ok: true, rebuilt: true, removed: { draftId: "draft-old", taskCards: 6, reviewItems: 1 }, draft: { draftId: "draft-2", programId }, taskCards: [{ taskCardId: "task-2" }] };
    },
    async publishProgram(programId, input) {
      calls.push(["publish", programId, input]);
      return { ok: true, publication: { publicationId: "pub-1" } };
    },
    reviewQueue(input) {
      calls.push(["reviewQueue", input]);
      return [{ reviewId: "review-1", status: "pending" }];
    },
    async decideReview(reviewId, input) {
      calls.push(["decide", reviewId, input]);
      return {
        reviewItem: { reviewId, status: input.decision },
        autoPublish: { ok: true, publishedSessions: [{ sessionId: "session-1" }] },
      };
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
      return { taskCardId, kanbanCardId: "kanban-1", workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "published" };
    },
    getTaskSubmission(submissionId) {
      calls.push(["getTaskSubmission", submissionId]);
      return {
        submissionId,
        taskCardId: "task-1",
        workspaceId: "weixin_stephen",
        learnerId: "weixin_stephen",
        audio: { kind: "audio", name: "missing-audio.ogg", mime: "audio/ogg" },
      };
    },
    updateTaskRewardPolicy(taskCardId, input) {
      calls.push(["updateTaskRewardPolicy", taskCardId, input]);
      return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "published", rewardCapCoins: input.rewardCapCoins || input.maxCoins };
    },
    startTaskSession(taskCardId, input) {
      calls.push(["startTaskSession", taskCardId, input]);
      return { sessionId: "session-1", taskCardId, currentStep: "receive_task" };
    },
    listInteractionSessions(input) {
      calls.push(["listSessions", input]);
      return [{ sessionId: "session-1", workspaceId: input.workspaceId, learnerId: input.learnerId }];
    },
    getInteractionSession(sessionId) {
      calls.push(["getSession", sessionId]);
      return { sessionId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen" };
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
    learningGrowthSubmissionService: {
      async submitTask(input) {
        calls.push(["submitGrowthTask", input]);
        return { ok: true, status: "draft_feedback", evaluation: { status: "draft_feedback" }, reward: { status: "not_eligible" } };
      },
      async withdrawSubmission(input) {
        calls.push(["withdrawGrowthTask", input]);
        return { ok: true, status: "withdrawn" };
      },
      async submitReflection(input) {
        calls.push(["submitGrowthReflection", input]);
        return { ok: true, status: "completed", reflection: { status: "accepted" } };
      },
      async manualPassTask(input) {
        calls.push(["manualPassGrowthTask", input]);
        return { ok: true, status: "completed", taskCardId: input.taskCardId, rewardSettlement: { status: "settled" } };
      },
    },
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
  assert.equal(LEARNING_PROGRAM_API_ROUTE_SPECS.length, 42);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning/programs" }).id, "learning-programs-list");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/sources" }).id, "learning-sources-create");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/source-directory/import" }).id, "learning-source-directory-import");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/source-directory/bootstrap" }).id, "learning-source-directory-bootstrap");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/profile" }).id, "learning-profile-read");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/foundation-import" }).id, "learning-foundation-import");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/reports/parent" }).id, "learning-parent-report-read");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/recommendations/task-series" }).id, "learning-task-series-recommendations-read");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/recommendations/task-series" }).id, "learning-task-series-recommendations-create");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/recommendations/task-series/draft" }).id, "learning-task-series-recommendation-draft-create");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/programs/program-1/draft-plan" }).id, "learning-program-draft-plan");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/programs/program-1/rebuild-draft-plan" }).id, "learning-program-rebuild-draft-plan");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/task-cards" }).id, "learning-task-cards-list");
  assert.equal(routes.match({ method: "PATCH", path: "/api/learning/task-cards/task-1/reward-policy" }).id, "learning-task-card-reward-policy-update");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/task-execution-queue" }).id, "learning-task-execution-queue");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/daily-plan" }).id, "learning-daily-plan");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/task-submissions/lsub-1/audio" }).id, "learning-task-submission-audio-read");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/sessions" }).id, "learning-task-card-session-start");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/growth-submission" }).id, "learning-task-card-growth-submission");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/growth-submission/withdraw" }).id, "learning-task-card-growth-submission-withdraw");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/manual-pass" }).id, "learning-task-card-growth-manual-pass");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/task-cards/task-1/growth-reflection" }).id, "learning-task-card-growth-reflection");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/sessions/session-1/evaluations" }).id, "learning-session-evaluation-create");
  assert.equal(routes.match({ method: "POST", path: "/api/learning/evaluations/eval-1/reward-settlement" }).id, "learning-evaluation-reward-settle");
  assert.equal(routes.match({ method: "GET", path: "/api/learning/reward-settlements/settle-1" }).id, "learning-reward-settlement-read");
  assert.equal(routes.summary({ public: true }).byModule["learning-program"], 42);
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

  const rebuilt = await request(routes, "POST", "/api/learning/programs/program-1/rebuild-draft-plan", {
    body: { draftId: "draft-old" },
  });
  assert.equal(rebuilt.res.statusCode, 201);
  assert.equal(rebuilt.body.rebuilt, true);
  assert.equal(rebuilt.body.removed.taskCards, 6);
  assert.equal(calls.at(-1)[0], "rebuildDraft");
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

  const importDenied = await request(routes, "POST", "/api/learning/source-directory/import", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { workspaceId: "weixin_stephen", learnerId: "weixin_stephen" },
  });
  assert.equal(importDenied.res.statusCode, 403);
  assert.equal(importDenied.body.error, "Owner access required");

  const bootstrapDenied = await request(routes, "POST", "/api/learning/source-directory/bootstrap", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { workspaceId: "weixin_stephen", learnerId: "weixin_stephen" },
  });
  assert.equal(bootstrapDenied.res.statusCode, 403);
  assert.equal(bootstrapDenied.body.error, "Owner access required");
}

async function testReviewDecision() {
  const { routes, calls } = makeRoutes();
  const response = await request(routes, "POST", "/api/learning/review-queue/review-1/decision", {
    body: { decision: "approved" },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.reviewItem.status, "approved");
  assert.equal(response.body.autoPublish.ok, true);
  assert.equal(response.body.autoPublish.publishedSessions.length, 1);
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

  const directoryImport = await request(routes, "POST", "/api/learning/source-directory/import?workspaceId=weixin_stephen", {
    body: { learnerId: "weixin_stephen", bindingId: "learning-materials:weixin_stephen" },
  });
  assert.equal(directoryImport.res.statusCode, 201);
  assert.equal(directoryImport.body.counts.sources, 2);
  assert.equal(directoryImport.body.binding.directoryLabel, "\u5b66\u4e60\u8d44\u6599");
  assert.equal(calls.at(-1)[0], "importSourceDirectory");
  assert.equal(calls.at(-1)[1].workspaceId, "weixin_stephen");
  assert.equal(calls.at(-1)[1].learnerId, "weixin_stephen");

  const bootstrap = await request(routes, "POST", "/api/learning/source-directory/bootstrap?workspaceId=weixin_stephen", {
    body: { learnerId: "weixin_stephen", bindingId: "learning-materials:weixin_stephen" },
  });
  assert.equal(bootstrap.res.statusCode, 201);
  assert.equal(bootstrap.body.created.goal, 1);
  assert.equal(bootstrap.body.created.program, 1);
  assert.equal(calls.at(-1)[0], "bootstrapFromSourceDirectory");
  assert.equal(calls.at(-1)[1].workspaceId, "weixin_stephen");
  assert.equal(calls.at(-1)[1].learnerId, "weixin_stephen");

  const report = await request(routes, "GET", "/api/learning/reports/parent?workspaceId=weixin_stephen&learnerId=weixin_stephen&startDate=2026-05-11&endDate=2026-05-17");
  assert.equal(report.res.statusCode, 200);
  assert.equal(report.body.reportType, "parent_weekly_summary");
  assert.equal(calls.at(-1)[0], "generateParentReport");
  assert.ok(calls.some((call) => call[0] === "saveSource"));
  assert.ok(calls.some((call) => call[0] === "rebuildProfile"));
}

async function testAiRecommendationRoutesRequireOwnerAndCreateDraft() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "POST", "/api/learning/recommendations/task-series", {
    auth: { ok: true, workspaceId: "weixin_stephen", isOwner: false },
    body: {},
  });
  assert.equal(denied.res.statusCode, 403);

  const recommendation = await request(routes, "POST", "/api/learning/recommendations/task-series?workspaceId=weixin_stephen&learnerId=weixin_stephen", {
    body: { domain: "english" },
  });
  assert.equal(recommendation.res.statusCode, 200);
  assert.equal(recommendation.body.privacyLevel, "summary_only");
  assert.equal(calls.at(-1)[0], "recommendTaskSeries");
  assert.equal(calls.at(-1)[1].workspaceId, "weixin_stephen");

  const latest = await request(routes, "GET", "/api/learning/recommendations/task-series?workspaceId=weixin_stephen&learnerId=weixin_stephen&domain=english");
  assert.equal(latest.res.statusCode, 200);
  assert.equal(latest.body.recommendationRunId, "run-1");
  assert.equal(calls.at(-1)[0], "latestTaskSeriesRecommendation");
  assert.equal(calls.at(-1)[1].workspaceId, "weixin_stephen");

  const draft = await request(routes, "POST", "/api/learning/recommendations/task-series/draft", {
    body: {
      workspaceId: "weixin_stephen",
      learnerId: "weixin_stephen",
      recommendation: { templateId: "english-speaking-retell-v1", skillId: "english_speaking_retell", title: "Retell" },
    },
  });
  assert.equal(draft.res.statusCode, 201);
  assert.equal(draft.body.program.programId, "program-ai");
  assert.equal(calls.at(-1)[0], "createRecommendedTaskSeriesDraft");
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

  const rewardPolicyDenied = await request(routes, "PATCH", "/api/learning/task-cards/task-1/reward-policy", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { rewardCapCoins: 120 },
  });
  assert.equal(rewardPolicyDenied.res.statusCode, 403);

  const rewardPolicy = await request(routes, "PATCH", "/api/learning/task-cards/task-1/reward-policy", {
    body: { rewardCapCoins: 120 },
  });
  assert.equal(rewardPolicy.res.statusCode, 200);
  assert.equal(rewardPolicy.body.taskCard.rewardCapCoins, 120);
  assert.equal(calls.at(-1)[0], "updateTaskRewardPolicy");

  const session = await request(routes, "POST", "/api/learning/task-cards/task-1/sessions", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { summary: "start" },
  });
  assert.equal(session.res.statusCode, 201);
  assert.equal(session.body.session.sessionId, "session-1");
  assert.equal(calls.at(-1)[0], "startTaskSession");
  assert.equal(calls.at(-1)[2].actor, "child");

  const growthSubmission = await request(routes, "POST", "/api/learning/task-cards/task-1/growth-submission", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { text: "summary only answer" },
  });
  assert.equal(growthSubmission.res.statusCode, 200);
  assert.equal(growthSubmission.body.taskCardId, "task-1");
  assert.equal(growthSubmission.body.kanbanCardId, "kanban-1");
  assert.equal(calls.at(-1)[0], "submitGrowthTask");
  assert.equal(calls.at(-1)[1].cardId, "kanban-1");
  assert.equal(calls.at(-1)[1].taskCardId, "task-1");
  assert.equal(calls.at(-1)[1].author, "child");

  const growthWithdraw = await request(routes, "POST", "/api/learning/task-cards/task-1/growth-submission/withdraw", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { reason: "retry" },
  });
  assert.equal(growthWithdraw.res.statusCode, 200);
  assert.equal(calls.at(-1)[0], "withdrawGrowthTask");

  const growthReflection = await request(routes, "POST", "/api/learning/task-cards/task-1/growth-reflection", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { text: "spoken reflection summary" },
  });
  assert.equal(growthReflection.res.statusCode, 200);
  assert.equal(calls.at(-1)[0], "submitGrowthReflection");

  const manualPassDenied = await request(routes, "POST", "/api/learning/task-cards/task-1/manual-pass", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { reason: "manual" },
  });
  assert.equal(manualPassDenied.res.statusCode, 403);

  const manualPass = await request(routes, "POST", "/api/learning/task-cards/task-1/manual-pass", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "owner", isOwner: true },
    body: { reason: "summary only manual pass" },
  });
  assert.equal(manualPass.res.statusCode, 200);
  assert.equal(calls.at(-1)[0], "manualPassGrowthTask");
  assert.equal(calls.at(-1)[1].taskCardId, "task-1");
  assert.equal(calls.at(-1)[1].cardId, "kanban-1");
  assert.equal(calls.at(-1)[1].author, "owner");

  const advanced = await request(routes, "POST", "/api/learning/sessions/session-1/advance", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { step: "learner_attempt", summary: "summary only" },
  });
  assert.equal(advanced.res.statusCode, 200);
  assert.equal(advanced.body.session.currentStep, "learner_attempt");
  assert.equal(calls.at(-1)[0], "advanceSession");
  assert.equal(calls.at(-1)[2].actor, "child");

  const evaluation = await request(routes, "POST", "/api/learning/sessions/session-1/evaluations", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { score: 88, summary: "summary only" },
  });
  assert.equal(evaluation.res.statusCode, 201);
  assert.equal(evaluation.body.evaluation.score, 88);
  assert.equal(calls.at(-1)[0], "recordEvaluation");
  assert.equal(calls.at(-1)[2].actor, "child");

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

async function testSharedWorkspaceMemberCanReadGrowthTaskDetail() {
  const { routes, calls } = makeRoutes({
    deps: {
      requireWorkspaceAccess(req, res, workspaceId) {
        const target = String(workspaceId || "owner");
        const allowed = new Set([req.auth?.workspaceId].concat(req.auth?.workspaceIds || []));
        if (!allowed.has(target)) {
          sendJson(res, 403, { error: "Workspace access is not allowed" });
          return "";
        }
        return target;
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning/task-cards/task-1", {
    auth: {
      ok: true,
      workspaceId: "weixin_wuping",
      workspaceIds: ["weixin_wuping", "weixin_stephen"],
      principalId: "weixin_wuping",
      isOwner: false,
    },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.taskCard.taskCardId, "task-1");
  assert.equal(response.body.taskCard.workspaceId, "weixin_stephen");
  assert.equal(calls.some((call) => call[0] === "getTaskCard"), true);
}

async function testExecutorCannotStartUnpublishedTask() {
  const { routes, calls } = makeRoutes({
    service: {
      getTaskCard(taskCardId) {
        calls.push(["getTaskCard", taskCardId]);
        return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "planned" };
      },
    },
  });
  const response = await request(routes, "POST", "/api/learning/task-cards/task-1/sessions", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { summary: "start" },
  });
  assert.equal(response.res.statusCode, 409);
  assert.equal(response.body.error, "Learning task is not executable");
  assert.equal(calls.some((call) => call[0] === "startTaskSession"), false);
}

async function testNativeGrowthSubmissionDoesNotRequireKanbanLink() {
  const { routes, calls } = makeRoutes({
    service: {
      getTaskCard(taskCardId) {
        calls.push(["getTaskCard", taskCardId]);
        return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "published" };
      },
    },
  });
  const response = await request(routes, "POST", "/api/learning/task-cards/task-native/growth-submission", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { text: "summary only answer" },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.taskCardId, "task-native");
  assert.equal(response.body.kanbanCardId, "");
  assert.equal(calls.at(-1)[0], "submitGrowthTask");
  assert.equal(calls.at(-1)[1].cardId, "");
  assert.equal(calls.at(-1)[1].taskCardId, "task-native");
}

async function testNativeGrowthSubmissionUsesUploadSizedBodyLimit() {
  let observedLimit = 0;
  const { routes, calls } = makeRoutes({
    deps: {
      maxUploadBytes: 1000000,
      async readBody(req, limit) {
        observedLimit = limit;
        return req.body || {};
      },
    },
    service: {
      getTaskCard(taskCardId) {
        calls.push(["getTaskCard", taskCardId]);
        return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "published" };
      },
    },
  });
  const response = await request(routes, "POST", "/api/learning/task-cards/task-native/growth-submission", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: {
      filename: "retell.webm",
      type: "audio/webm",
      dataBase64: "ZmFrZS1hdWRpbw==",
      durationMs: 12000,
    },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(observedLimit > 240000, true);
  assert.equal(calls.at(-1)[0], "submitGrowthTask");
  assert.equal(calls.at(-1)[1].dataBase64, "ZmFrZS1hdWRpbw==");
  assert.equal(calls.at(-1)[1].filename, "retell.webm");
}

async function testExecutorTaskReadUsesSummaryProjectionOnly() {
  const { routes } = makeRoutes({
    service: {
      getTaskCard(taskCardId) {
        return {
          taskCardId,
          programId: "program-1",
          draftId: "draft-1",
          workspaceId: "weixin_stephen",
          learnerId: "weixin_stephen",
          title: "Task",
          domain: "english",
          taskCardType: "single_subject",
          status: "published",
          plannedDate: "2026-05-17",
          plannedMinutes: 30,
          skillIds: ["english_speaking_retell"],
          summary: "summary only",
          sourceBasisRefs: ["source-1"],
          curriculumRefs: ["cefr-a2-b1"],
          reliability: { confidence: 0.9 },
          interactionStateMachine: ["receive_task", "learner_attempt"],
        };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning/task-cards/task-1", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.taskCard.privacyLevel, "summary_only");
  assert.equal(response.body.taskCard.executionStatus, "pending_execution");
  assert.equal(response.body.taskCard.sourceBasisRefs, undefined);
  assert.equal(response.body.taskCard.curriculumRefs, undefined);
  assert.equal(response.body.taskCard.reliability, undefined);
  assert.equal(response.body.taskCard.interactionStateMachine, undefined);
}

async function testExecutorCannotReadUnpublishedTaskDetail() {
  const { routes } = makeRoutes({
    service: {
      getTaskCard(taskCardId) {
        return { taskCardId, workspaceId: "weixin_stephen", learnerId: "weixin_stephen", status: "planned" };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning/task-cards/task-1", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(response.res.statusCode, 409);
  assert.equal(response.body.error, "Learning task is not executable");
}

async function testTaskSubmissionAudioRouteIsScopedAndBounded() {
  const { routes, calls } = makeRoutes({
    service: {
      getTaskCard(taskCardId) {
        calls.push(["getTaskCard", taskCardId]);
        return {
          taskCardId,
          workspaceId: "weixin_stephen",
          learnerId: "weixin_stephen",
          status: "published",
          artifactDirectoryPath: "C:\\missing-learning-audio-dir",
        };
      },
    },
  });
  const response = await request(routes, "GET", "/api/learning/task-submissions/lsub-1/audio", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
  });
  assert.equal(response.res.statusCode, 404);
  assert.equal(response.body.error, "Learning task submission audio file not found");
  assert.deepEqual(calls.slice(-2).map((call) => call[0]), ["getTaskSubmission", "getTaskCard"]);
}

async function testExecutorCannotEvaluateOtherLearnerSession() {
  const { routes, calls } = makeRoutes({
    service: {
      getInteractionSession(sessionId) {
        calls.push(["getSession", sessionId]);
        return { sessionId, workspaceId: "owner", learnerId: "owner" };
      },
    },
  });
  const response = await request(routes, "POST", "/api/learning/sessions/session-1/evaluations", {
    auth: { ok: true, workspaceId: "weixin_stephen", principalId: "child", isOwner: false },
    body: { score: 88, summary: "summary only" },
  });
  assert.equal(response.res.statusCode, 403);
  assert.equal(response.body.error, "Learner access is not allowed");
  assert.equal(calls.some((call) => call[0] === "recordEvaluation"), false);
}

(async () => {
  await testMetadata();
  await testCreateAndDraftRequireOwner();
  await testStudentCannotReadManagementSurfaces();
  await testReviewDecision();
  await testFoundationRoutes();
  await testAiRecommendationRoutesRequireOwnerAndCreateDraft();
  await testTaskSessionEvaluationRoutes();
  await testSharedWorkspaceMemberCanReadGrowthTaskDetail();
  await testExecutorTaskReadUsesSummaryProjectionOnly();
  await testExecutorCannotReadUnpublishedTaskDetail();
  await testTaskSubmissionAudioRouteIsScopedAndBounded();
  await testExecutorCannotStartUnpublishedTask();
  await testNativeGrowthSubmissionDoesNotRequireKanbanLink();
  await testNativeGrowthSubmissionUsesUploadSizedBodyLimit();
  await testExecutorCannotEvaluateOtherLearnerSession();
  console.log("learning program api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
