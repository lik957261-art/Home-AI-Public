"use strict";

const assert = require("node:assert/strict");
const {
  AUTOMATION_API_ROUTE_SPECS,
  createAutomationApiRoutes,
} = require("../server-routes/automation-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    sentFile: null,
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
  try {
    return JSON.parse(res.body || "{}");
  } catch (_) {
    return null;
  }
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    bridgeFile: [],
    bridgePreview: [],
    cacheClear: 0,
    create: [],
    cronList: [],
    deliverableResolve: [],
    file: [],
    filePreview: [],
    interpret: [],
    mutate: [],
    owner: [],
    outputResolve: [],
    profileResolve: [],
    pushTick: [],
    workspaceAccess: [],
  };
  const deps = Object.assign({
    automationListSortByLatestDeliverable(left, right) {
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    },
    automationProvider: {
      createJob(payload) {
        calls.create.push(payload);
        return Promise.resolve({ ok: true, job: { id: "job-created" }, source: { name: "hermes_cron" } });
      },
      mutateJob(payload) {
        calls.mutate.push(payload);
        return Promise.resolve({ ok: true, job: { id: payload.jobId, action: payload.action }, source: { name: "hermes_cron" } });
      },
    },
    boolParam(value) {
      return /^(1|true|yes|on)$/i.test(String(value || ""));
    },
    clearCronListCache() {
      calls.cacheClear += 1;
    },
    compactText(value, maxChars) {
      return `compact:${String(value).slice(0, Math.min(16, maxChars || 16))}`;
    },
    cronJobMatchesOwner(job, ownerPrincipalId) {
      return !job.ownerPrincipalId || job.ownerPrincipalId === ownerPrincipalId;
    },
    cronJobMatchesSearch(job, search) {
      return !search || String(job.name || "").toLowerCase().includes(search);
    },
    findWorkspace(workspaceId) {
      return { id: workspaceId, policy: { allowed_toolsets: ["cronjob"], secret: "redacted-by-sanitize" } };
    },
    interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
      calls.interpret.push({ text, workspaceId: workspace.id, ownerPrincipalId });
      return Promise.resolve({ name: `Draft ${text}`, schedule: "daily" });
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      calls.owner.push(req.owner === true);
      if (req.owner === true) return true;
      sendJson(res, 403, { error: "Owner access is required" });
      return false;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    resolveAuthorizedCronDeliverableFile(query, auth) {
      calls.deliverableResolve.push({ file: query.get("file"), auth });
      return Promise.resolve({ file: { path: `deliverable:${query.get("file")}` } });
    },
    resolveAuthorizedCronOutputFile(query, auth) {
      calls.outputResolve.push({ file: query.get("file"), auth });
      return Promise.resolve({ bridgeFile: { path: `bridge:${query.get("file")}` } });
    },
    resolveAutomationCronProfile(payload) {
      calls.profileResolve.push(payload);
      return "";
    },
    runAutomationWebPushTick(payload) {
      calls.pushTick.push(payload);
      return Promise.resolve({ ok: true, dryRun: payload.dryRun, limit: payload.limit });
    },
    runCronListBridgeCached(payload) {
      calls.cronList.push(payload);
      return Promise.resolve({
        ok: true,
        jobs: [
          { id: "old", name: "Ignore", ownerPrincipalId: "principal-other", updatedAt: "2026-01-01T00:00:00Z" },
          { id: "beta", name: "Beta search", ownerPrincipalId: "principal-child", updatedAt: "2026-01-03T00:00:00Z" },
          { id: "alpha", name: "Alpha search", ownerPrincipalId: "principal-child", updatedAt: "2026-01-02T00:00:00Z" },
        ],
        source: { name: "hermes_cron", jobCount: 3 },
      });
    },
    sanitizePolicy(policy) {
      return { allowed_toolsets: policy.allowed_toolsets || [] };
    },
    sendJson,
    sendResolvedBridgeFile(res, file, query) {
      calls.bridgeFile.push({ file, queryFile: query.get("file") });
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end("bridge-file");
    },
    sendResolvedBridgeFilePreview(res, file) {
      calls.bridgePreview.push(file);
      sendJson(res, 200, { preview: "bridge", file });
    },
    sendResolvedFile(res, file, query) {
      calls.file.push({ file, queryFile: query.get("file") });
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end("file");
    },
    sendResolvedFilePreview(res, file) {
      calls.filePreview.push(file);
      sendJson(res, 200, { preview: "file", file });
    },
    workspacePrincipal(workspaceId) {
      return `principal-${workspaceId}`;
    },
  }, overrides);
  return { routes: createAutomationApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, headers: {}, body: options.body || {}, owner: options.owner },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(AUTOMATION_API_ROUTE_SPECS.map((route) => route.id), [
    "automations-list",
    "automations-create",
    "automations-action",
    "automations-push-tick",
    "automations-deliverable",
    "automations-deliverable-preview",
    "automations-output",
    "automations-output-preview",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/automations" }).id, "automations-list");
  assert.equal(routes.match({ method: "POST", path: "/api/automations/job%2F1/pause" }).id, "automations-action");
  assert.equal(routes.match({ method: "POST", path: "/api/automations/push/tick" }).id, "automations-push-tick");
  assert.equal(routes.match({ method: "POST", path: "/api/automations/job-1/run" }).id, "automations-action");
  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 8);
  assert.deepEqual(summary.byAuthMode, { "access-key": 7, owner: 1 });
  assert.equal(JSON.stringify(summary).includes("/api/automations"), false);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testListFiltersWorkspaceOwnerAndSearch() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/automations?workspaceId=child&search=search&limit=1&fresh=1&detail=summary");
  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.cronList, [{ includeDisabled: true, bypassCache: true, ownerPrincipalId: "principal-child", detail: "summary" }]);
  assert.deepEqual(got.body.data.map((job) => job.id), ["alpha"]);
  assert.deepEqual(got.body.source, {
    name: "hermes_cron",
    jobCount: 1,
    detailLevel: "summary",
    totalJobCount: 3,
    workspaceId: "child",
    ownerPrincipalId: "principal-child",
  });
}

async function testListFullDetailKeepsDeliverableSort() {
  const { routes, calls } = makeRoutes({
    runCronListBridgeCached(payload) {
      calls.cronList.push(payload);
      return Promise.resolve({
        ok: true,
        jobs: [
          {
            id: "next",
            name: "Next",
            ownerPrincipalId: "principal-child",
            nextRunAt: "2026-01-01T00:00:00Z",
            outputDocuments: [],
          },
          {
            id: "delivered",
            name: "Delivered",
            ownerPrincipalId: "principal-child",
            updatedAt: "2026-02-01T00:00:00Z",
            outputDocuments: [{ updatedAt: "2026-02-01T00:00:00Z" }],
          },
        ],
        source: { name: "hermes_cron", jobCount: 2 },
      });
    },
  });
  const got = await request(routes, "GET", "/api/automations?workspaceId=child&detail=full");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.cronList, [{ includeDisabled: true, bypassCache: false, ownerPrincipalId: "principal-child", detail: "full" }]);
  assert.deepEqual(got.body.data.map((job) => job.id), ["delivered", "next"]);
  assert.equal(got.body.source.detailLevel, "full");
}

async function testListIncludesRouteAutomationTargetOutsideSearch() {
  const { routes } = makeRoutes();
  const got = await request(routes, "GET", "/api/automations?workspaceId=child&search=beta&automationId=alpha&limit=1&detail=full");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body.data.map((job) => job.id), ["alpha"]);
  assert.equal(got.body.source.detailLevel, "full");
}

async function testCreateDryRunAndCreateFailure() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/automations", {
    body: { workspaceId: "child", text: "weekly report", dryRun: true },
  });
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.body.ok, true);
  assert.equal(got.body.dryRun, true);
  assert.equal(got.body.source.workspaceId, "child");
  assert.equal(got.body.source.ownerPrincipalId, "principal-child");
  assert.deepEqual(calls.interpret, [{ text: "weekly report", workspaceId: "child", ownerPrincipalId: "principal-child" }]);
  assert.equal(calls.create[0].accessPolicyContext.secret, undefined);
  assert.deepEqual(calls.create[0].accessPolicyContext, { allowed_toolsets: ["cronjob"] });
  assert.equal(calls.create[0].job.profile, undefined);
  assert.equal(calls.cacheClear, 0);

  const empty = await request(routes, "POST", "/api/automations", { body: { workspaceId: "child", text: "" } });
  assert.equal(empty.res.statusCode, 400);
  assert.deepEqual(empty.body, { error: "Automation description is required" });
}

async function testCreatePassesProviderErrorStatus() {
  const { routes, calls } = makeRoutes({
    automationProvider: {
      createJob(payload) {
        calls.create.push(payload);
        return Promise.resolve({
          ok: false,
          status: 503,
          error: "Canonical Automation backend is unavailable",
          code: "automation_canonical_backend_unavailable",
          source: { name: "hermes_cron", available: false },
        });
      },
      mutateJob(payload) {
        calls.mutate.push(payload);
        return Promise.resolve({ ok: true });
      },
    },
  });

  const got = await request(routes, "POST", "/api/automations", {
    body: { workspaceId: "child", text: "weekly report" },
  });
  assert.equal(got.res.statusCode, 503);
  assert.equal(got.body.error, "compact:Canonical Automa");
  assert.equal(got.body.result.code, "automation_canonical_backend_unavailable");
  assert.equal(calls.cacheClear, 0);
  assert.equal(calls.create.length, 1);
}

async function testCreateAddsResolvedCronProfile() {
  const { routes, calls } = makeRoutes({
    interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
      calls.interpret.push({ text, workspaceId: workspace.id, ownerPrincipalId });
      return Promise.resolve({
        name: "Email analysis",
        prompt: "Analyze new email",
        schedule: "0 11 * * *",
        enabled_toolsets: ["email", "file", "skills"],
      });
    },
    resolveAutomationCronProfile(payload) {
      calls.profileResolve.push(payload);
      return "hm-owner-openai-1";
    },
  });
  const got = await request(routes, "POST", "/api/automations", {
    body: { workspaceId: "owner", text: "daily email analysis", dryRun: true },
  });
  assert.equal(got.res.statusCode, 200);
  assert.equal(calls.profileResolve.length, 1);
  assert.equal(calls.profileResolve[0].workspaceId, "owner");
  assert.equal(calls.profileResolve[0].ownerPrincipalId, "principal-owner");
  assert.deepEqual(calls.profileResolve[0].job.enabled_toolsets, ["email", "file", "skills"]);
  assert.equal(calls.create[0].job.profile, "hm-owner-openai-1");
  assert.equal(got.body.draft.profile, "hm-owner-openai-1");
}

async function testCreateNormalizesOriginDeliveryWithoutTarget() {
  const { routes, calls } = makeRoutes({
    interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
      calls.interpret.push({ text, workspaceId: workspace.id, ownerPrincipalId });
      return Promise.resolve({
        name: "Daily summary",
        prompt: "Summarize discussions",
        schedule: "0 10 * * *",
        deliver: "origin",
        enabled_toolsets: ["file", "skills"],
      });
    },
    resolveAutomationCronProfile() {
      return "hm-owner-openai-1";
    },
  });
  const got = await request(routes, "POST", "/api/automations", {
    body: { workspaceId: "owner", text: "daily summary", dryRun: true },
  });
  assert.equal(got.res.statusCode, 200);
  assert.equal(calls.create[0].job.deliver, "local");
  assert.equal(got.body.draft.deliver, "local");
}

async function testActionDecodesJobAndClearsCache() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/automations/job%2F42/update?workspaceId=child", {
    body: {
      name: "Updated",
      enabledToolsets: ["web"],
      profile: "hm-child-openai-1",
      dataContext: { type: "discussion_activity_daily", date: "previous_day" },
      dry_run: false,
      reason: "manual",
    },
  });
  assert.equal(got.res.statusCode, 200);
  assert.equal(got.body.ok, true);
  assert.equal(got.body.job.id, "job/42");
  assert.equal(calls.cacheClear, 1);
  assert.deepEqual(calls.mutate[0], {
    action: "update",
    jobId: "job/42",
    ownerPrincipalId: "principal-child",
    dryRun: false,
    patch: {
      name: "Updated",
      prompt: undefined,
      schedule: undefined,
      deliver: undefined,
      skills: undefined,
      enabled_toolsets: ["web"],
      model: undefined,
      provider: undefined,
      profile: "hm-child-openai-1",
      workdir: undefined,
      data_context: { type: "discussion_activity_daily", date: "previous_day" },
    },
    reason: "manual",
  });

  const run = await request(routes, "POST", "/api/automations/job%2F42/run?workspaceId=child", {
    body: { dryRun: true, reason: "manual run" },
  });
  assert.equal(run.res.statusCode, 200);
  assert.equal(run.body.ok, true);
  assert.equal(calls.cacheClear, 1);
  assert.equal(calls.mutate[1].action, "run");
  assert.equal(calls.mutate[1].jobId, "job/42");
  assert.equal(calls.mutate[1].ownerPrincipalId, "principal-child");
  assert.equal(calls.mutate[1].dryRun, true);
}

async function testPushTickOwnerOnly() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "POST", "/api/automations/push/tick", { body: { dryRun: true } });
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access is required" });
  assert.deepEqual(calls.pushTick, []);

  const got = await request(routes, "POST", "/api/automations/push/tick?limit=9", {
    owner: true,
    body: { includeInitial: true },
  });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.pushTick, [{ dryRun: false, includeInitial: true, limit: 9 }]);
  assert.equal(got.body.ok, true);
}

async function testAuthorizedFileRoutesUseResolvers() {
  const auth = { ok: true, workspaceId: "child" };
  const { routes, calls } = makeRoutes();
  const deliverable = await request(routes, "GET", "/api/automations/deliverable?file=report.md", { auth });
  assert.equal(deliverable.res.statusCode, 200);
  assert.equal(deliverable.res.body, "file");
  assert.deepEqual(calls.deliverableResolve, [{ file: "report.md", auth }]);
  assert.equal(calls.file[0].file.path, "deliverable:report.md");

  const output = await request(routes, "GET", "/api/automations/output/preview?file=run.md", { auth });
  assert.equal(output.res.statusCode, 200);
  assert.deepEqual(calls.outputResolve, [{ file: "run.md", auth }]);
  assert.equal(output.body.preview, "bridge");

  const missingRoutes = makeRoutes({
    resolveAuthorizedCronOutputFile() {
      return Promise.resolve({ status: 404, error: "Hidden" });
    },
  });
  const missing = await request(missingRoutes.routes, "GET", "/api/automations/output?file=missing.md", { auth });
  assert.equal(missing.res.statusCode, 404);
  assert.deepEqual(missing.body, { error: "Hidden" });
}

function testDependencyValidation() {
  assert.throws(
    () => createAutomationApiRoutes({}),
    /automation api routes require automationListSortByLatestDeliverable/,
  );
  assert.throws(
    () => createAutomationApiRoutes({
      automationListSortByLatestDeliverable() {},
      boolParam() {},
      clearCronListCache() {},
      compactText() {},
      cronJobMatchesOwner() {},
      cronJobMatchesSearch() {},
      findWorkspace() {},
      interpretAutomationNaturalLanguage() {},
      readBody() {},
      requireOwner() {},
      requireWorkspaceAccess() {},
      resolveAuthorizedCronDeliverableFile() {},
      resolveAuthorizedCronOutputFile() {},
      runAutomationWebPushTick() {},
      runCronListBridgeCached() {},
      sanitizePolicy() {},
      sendJson() {},
      sendResolvedBridgeFile() {},
      sendResolvedBridgeFilePreview() {},
      sendResolvedFile() {},
      sendResolvedFilePreview() {},
      workspacePrincipal() {},
      automationProvider: {},
    }),
    /automation api routes require automationProvider\.createJob\/mutateJob/,
  );
}

(async () => {
  await testRouteMetadataAndFallthrough();
  await testListFiltersWorkspaceOwnerAndSearch();
  await testListFullDetailKeepsDeliverableSort();
  await testListIncludesRouteAutomationTargetOutsideSearch();
  await testCreateDryRunAndCreateFailure();
  await testCreatePassesProviderErrorStatus();
  await testCreateAddsResolvedCronProfile();
  await testCreateNormalizesOriginDeliveryWithoutTarget();
  await testActionDecodesJobAndClearsCache();
  await testPushTickOwnerOnly();
  await testAuthorizedFileRoutesUseResolvers();
  testDependencyValidation();
  console.log("automation api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
