"use strict";

const assert = require("node:assert/strict");
const {
  RESOURCE_API_ROUTE_SPECS,
  createResourceApiRoutes,
} = require("../server-routes/resource-api-routes");

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
  const calls = {
    compact: [],
    projects: [],
    publicShared: [],
    shared: [],
    skillDetail: [],
    skillFix: [],
    owner: [],
    workspaceAccess: [],
  };
  const deps = Object.assign({
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      calls.owner.push(req.auth?.role || "");
      if (req.auth?.role === "blocked") {
        sendJson(res, 403, { error: "Owner access is required" });
        return null;
      }
      return { role: "owner", isOwner: true };
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push({
        workspaceId,
        key: req.headers?.["x-hermes-web-key"] || "",
      });
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson,
    sharedDirectoryProjectionService: {
      publicProjectsForWorkspace(workspaceId) {
        calls.projects.push(workspaceId);
        return Promise.resolve([
          { id: `${workspaceId}-project-a`, label: "Project A" },
          { id: `${workspaceId}-project-b`, label: "Project B" },
        ]);
      },
      listPublicSharedDirectories(workspaceId) {
        calls.shared.push(workspaceId);
        return [
          { id: "share-a", workspaceId, path: "C:\\Data\\A" },
          { id: "share-b", workspaceId, path: "C:\\Data\\B" },
        ];
      },
    },
    skillDetailProvider: {
      detail(skill) {
        calls.skillDetail.push(skill);
        return Promise.resolve({
          id: skill,
          name: skill.split("/").pop(),
          summary: "Skill summary",
        });
      },
      analyze(skill) {
        calls.skillDetail.push(`analysis:${skill}`);
        return Promise.resolve({
          skill: { path: skill },
          summary: "Skill analysis",
          invocationConditions: ["Use when analysis is requested."],
        });
      },
      applyFix(skill, fixId) {
        calls.skillFix.push({ skill, fixId });
        return Promise.resolve({
          ok: true,
          changed: true,
          detail: { path: skill, content: "fixed" },
          analysis: { skill: { path: skill }, summary: "Fixed" },
        });
      },
    },
    compactText(value, maxChars) {
      calls.compact.push({ value: String(value), maxChars });
      return `compact:${String(value).slice(0, 18)}`;
    },
  }, overrides);
  return { routes: createResourceApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const context = Object.hasOwn(options, "auth") ? { auth: options.auth } : undefined;
  const result = await routes.handle(
    { method, url: path, headers: options.headers || {}, auth: options.auth, body: options.body },
    res,
    makeUrl(path),
    context,
  );
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(RESOURCE_API_ROUTE_SPECS.map((route) => route.id), [
    "projects-list",
    "directories-shared-list",
    "skills-detail",
    "skills-analysis",
    "skills-analysis-fix",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/projects" }).id, "projects-list");
  assert.equal(routes.match({ method: "GET", path: "/api/directories/shared" }).id, "directories-shared-list");
  assert.equal(routes.match({ method: "GET", path: "/api/skills/detail" }).id, "skills-detail");
  assert.equal(routes.match({ method: "GET", path: "/api/skills/analysis" }).id, "skills-analysis");
  assert.equal(routes.match({ method: "POST", path: "/api/skills/analysis/fix" }).id, "skills-analysis-fix");
  assert.equal(routes.match({ method: "POST", path: "/api/projects" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byModule, { resource: 5 });
  assert.deepEqual(summary.byAuthMode, { "access-key": 4, owner: 1 });
  assert.equal(JSON.stringify(summary).includes("/api/projects"), false);

  const publicRoutes = routes.list({ public: true });
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.deepEqual(publicRoutes.map((route) => route.workspaceScoped), [true, true, false, false, false]);
  assert.deepEqual(publicRoutes.map((route) => route.resourceTypes), [
    ["project", "workspace"],
    ["directory", "share"],
    ["skill"],
    ["skill"],
    ["skill"],
  ]);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testProjectsWorkspaceAccessAndInjectedAuthContext() {
  const { routes, calls } = makeRoutes();
  const auth = { ok: true, workspaceId: "child", principalId: "principal-child" };
  const got = await request(routes, "GET", "/api/projects?workspaceId=child", {
    auth,
    headers: { "x-hermes-web-key": "test-key" },
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "projects-list");
  assert.deepEqual(got.result.auth, auth);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    data: [
      { id: "child-project-a", label: "Project A" },
      { id: "child-project-b", label: "Project B" },
    ],
  });
  assert.deepEqual(calls.workspaceAccess, [{ workspaceId: "child", key: "test-key" }]);
  assert.deepEqual(calls.projects, ["child"]);

  const blocked = await request(routes, "GET", "/api/projects?workspaceId=blocked");
  assert.equal(blocked.result.handled, true);
  assert.equal(blocked.res.statusCode, 403);
  assert.deepEqual(blocked.body, { error: "Workspace access is not allowed" });
  assert.deepEqual(calls.projects, ["child"]);
}

async function testSharedDirectoriesFilterPublicRecords() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/directories/shared?workspaceId=child");

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "directories-shared-list");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    ok: true,
    data: [
      { id: "share-a", workspaceId: "child", path: "C:\\Data\\A" },
      { id: "share-b", workspaceId: "child", path: "C:\\Data\\B" },
    ],
  });
  assert.deepEqual(calls.shared, ["child"]);
  assert.deepEqual(calls.publicShared, []);
}

async function testSkillRequired() {
  const { routes, calls } = makeRoutes();
  const missing = await request(routes, "GET", "/api/skills/detail");

  assert.equal(missing.result.handled, true);
  assert.equal(missing.result.route.id, "skills-detail");
  assert.equal(missing.res.statusCode, 400);
  assert.deepEqual(missing.body, { error: "Skill is required" });
  assert.deepEqual(calls.skillDetail, []);
  assert.deepEqual(calls.compact, []);

  const missingAnalysis = await request(routes, "GET", "/api/skills/analysis");
  assert.equal(missingAnalysis.result.handled, true);
  assert.equal(missingAnalysis.result.route.id, "skills-analysis");
  assert.equal(missingAnalysis.res.statusCode, 400);
  assert.deepEqual(missingAnalysis.body, { error: "Skill is required" });
  assert.deepEqual(calls.skillDetail, []);
  assert.deepEqual(calls.compact, []);
}

async function testSkillDetailSuccessAndError() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/skills/detail?skill=%20productivity%2Fwrite%20");

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.skillDetail, ["productivity/write"]);
  assert.deepEqual(got.body, {
    data: {
      id: "productivity/write",
      name: "write",
      summary: "Skill summary",
    },
  });

  const err = new Error("Skill detail bridge timed out while reading metadata");
  err.status = 504;
  err.skill = "productivity/slow";
  const failing = makeRoutes({
    skillDetailProvider: {
      detail() {
        throw err;
      },
      analyze() {
        throw new Error("not used");
      },
      applyFix() {
        throw new Error("not used");
      },
    },
  });
  const failed = await request(failing.routes, "GET", "/api/skills/detail?skill=productivity%2Fraw");

  assert.equal(failed.res.statusCode, 504);
  assert.deepEqual(failed.body, {
    error: "compact:Skill detail bridg",
    skill: "productivity/slow",
  });
  assert.deepEqual(failing.calls.compact, [{
    value: "Skill detail bridge timed out while reading metadata",
    maxChars: 800,
  }]);
}

async function testSkillAnalysisSuccessAndError() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/skills/analysis?skill=x-social-monitoring-and-briefs");

  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.skillDetail, ["analysis:x-social-monitoring-and-briefs"]);
  assert.deepEqual(got.body, {
    data: {
      skill: { path: "x-social-monitoring-and-briefs" },
      summary: "Skill analysis",
      invocationConditions: ["Use when analysis is requested."],
    },
  });

  const err = new Error("Skill analysis failed after bounded parsing");
  err.status = 422;
  err.skill = "x-social-monitoring-and-briefs";
  const failing = makeRoutes({
    skillDetailProvider: {
      detail() {
        throw new Error("not used");
      },
      analyze() {
        throw err;
      },
      applyFix() {
        throw new Error("not used");
      },
    },
  });
  const failed = await request(failing.routes, "GET", "/api/skills/analysis?skill=x-social-monitoring-and-briefs");

  assert.equal(failed.res.statusCode, 422);
  assert.deepEqual(failed.body, {
    error: "compact:Skill analysis fai",
    skill: "x-social-monitoring-and-briefs",
  });
}

async function testSkillAnalysisFixSuccessAndOwnerGate() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/skills/analysis/fix", {
    auth: { role: "owner", isOwner: true },
    body: { skill: "social-media/x-social-monitoring-and-briefs", fixId: "narrow-x-search-invocation" },
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.result.route.id, "skills-analysis-fix");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.skillFix, [{ skill: "social-media/x-social-monitoring-and-briefs", fixId: "narrow-x-search-invocation" }]);
  assert.equal(got.body.data.changed, true);
  assert.equal(got.body.data.detail.path, "social-media/x-social-monitoring-and-briefs");

  const missing = await request(routes, "POST", "/api/skills/analysis/fix", {
    auth: { role: "owner", isOwner: true },
    body: { skill: "", fixId: "" },
  });
  assert.equal(missing.res.statusCode, 400);
  assert.deepEqual(missing.body, { error: "Skill and fixId are required" });

  const blocked = await request(routes, "POST", "/api/skills/analysis/fix", {
    auth: { role: "blocked" },
    body: { skill: "x", fixId: "narrow-x-search-invocation" },
  });
  assert.equal(blocked.res.statusCode, 403);
}

function testDependencyValidation() {
  assert.throws(
    () => createResourceApiRoutes({}),
    /resource api routes require requireWorkspaceAccess/,
  );
  assert.throws(
    () => createResourceApiRoutes({
      requireWorkspaceAccess() {},
      requireOwner() {},
      readBody() {},
      sendJson() {},
      compactText() {},
      sharedDirectoryProjectionService: {
        publicProjectsForWorkspace() {},
      },
      skillDetailProvider: {},
    }),
    /resource api routes require sharedDirectoryProjectionService\.listPublicSharedDirectories/,
  );
  assert.throws(
    () => createResourceApiRoutes({
      requireWorkspaceAccess() {},
      requireOwner() {},
      readBody() {},
      sendJson() {},
      compactText() {},
      sharedDirectoryProjectionService: {
        publicProjectsForWorkspace() {},
        listPublicSharedDirectories() {},
      },
      skillDetailProvider: {},
    }),
    /resource api routes require skillDetailProvider\.detail/,
  );
  assert.throws(
    () => createResourceApiRoutes({
      requireWorkspaceAccess() {},
      requireOwner() {},
      readBody() {},
      sendJson() {},
      compactText() {},
      sharedDirectoryProjectionService: {
        publicProjectsForWorkspace() {},
        listPublicSharedDirectories() {},
      },
      skillDetailProvider: {
        detail() {},
      },
    }),
    /resource api routes require skillDetailProvider\.analyze/,
  );
  assert.throws(
    () => createResourceApiRoutes({
      requireWorkspaceAccess() {},
      requireOwner() {},
      readBody() {},
      sendJson() {},
      compactText() {},
      sharedDirectoryProjectionService: {
        publicProjectsForWorkspace() {},
        listPublicSharedDirectories() {},
      },
      skillDetailProvider: {
        detail() {},
        analyze() {},
      },
    }),
    /resource api routes require skillDetailProvider\.applyFix/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testProjectsWorkspaceAccessAndInjectedAuthContext();
  await testSharedDirectoriesFilterPublicRecords();
  await testSkillRequired();
  await testSkillDetailSuccessAndError();
  await testSkillAnalysisSuccessAndError();
  await testSkillAnalysisFixSuccessAndOwnerGate();
  testDependencyValidation();
  console.log("resource api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
