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
    workspaceAccess: [],
  };
  const deps = Object.assign({
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
    { method, url: path, headers: options.headers || {} },
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
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/projects" }).id, "projects-list");
  assert.equal(routes.match({ method: "GET", path: "/api/directories/shared" }).id, "directories-shared-list");
  assert.equal(routes.match({ method: "GET", path: "/api/skills/detail" }).id, "skills-detail");
  assert.equal(routes.match({ method: "POST", path: "/api/projects" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 3);
  assert.deepEqual(summary.byModule, { resource: 3 });
  assert.deepEqual(summary.byAuthMode, { "access-key": 3 });
  assert.equal(JSON.stringify(summary).includes("/api/projects"), false);

  const publicRoutes = routes.list({ public: true });
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.deepEqual(publicRoutes.map((route) => route.workspaceScoped), [true, true, false]);
  assert.deepEqual(publicRoutes.map((route) => route.resourceTypes), [
    ["project", "workspace"],
    ["directory", "share"],
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

function testDependencyValidation() {
  assert.throws(
    () => createResourceApiRoutes({}),
    /resource api routes require requireWorkspaceAccess/,
  );
  assert.throws(
    () => createResourceApiRoutes({
      requireWorkspaceAccess() {},
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
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testProjectsWorkspaceAccessAndInjectedAuthContext();
  await testSharedDirectoriesFilterPublicRecords();
  await testSkillRequired();
  await testSkillDetailSuccessAndError();
  testDependencyValidation();
  console.log("resource api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
