"use strict";

const assert = require("node:assert/strict");
const {
  WORKSPACE_ONBOARDING_API_ROUTE_SPECS,
  createWorkspaceOnboardingApiRoutes,
} = require("../server-routes/workspace-onboarding-api-routes");

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
    apply: [],
    plan: [],
    readBody: [],
    requireOwner: [],
  };
  const deps = Object.assign({
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner" || auth?.isOwner === true;
    },
    readBody(req) {
      calls.readBody.push(req.body);
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      calls.requireOwner.push(req.headers || {});
      if (req.headers?.["x-owner"] === "yes") return { workspaceId: "owner", principalId: "owner" };
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    },
    sendJson,
    workspaceOnboardingService: {
      planOnboarding(input, runtime) {
        calls.plan.push({ input, runtime });
        return { ok: true, status: "planned", workspaceId: input.workspaceId, steps: [] };
      },
      applyOnboarding(input, runtime) {
        calls.apply.push({ input, runtime });
        if (input.workspaceId === "blocked") {
          return { ok: false, status: "blocked", error: "system_provisioning_executor_unavailable", steps: [] };
        }
        if (input.workspaceId === "failed") {
          return { ok: false, status: "provisioning_failed", error: "", steps: [{ id: "workspace.record", status: "failed", error: "EACCES" }] };
        }
        return { ok: true, status: "active", workspaceId: input.workspaceId, steps: [] };
      },
    },
  }, overrides);
  return { calls, routes: createWorkspaceOnboardingApiRoutes(deps) };
}

async function request(routes, method, path, auth, headers = {}, body) {
  const res = makeResponse();
  const context = arguments.length >= 4 ? { auth } : undefined;
  const result = await routes.handle({ method, url: path, headers, body }, res, makeUrl(path), context);
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndMatching() {
  const { routes } = makeRoutes();
  assert.deepEqual(WORKSPACE_ONBOARDING_API_ROUTE_SPECS.map((route) => route.id), [
    "workspace-onboarding-plan",
    "workspace-onboarding-apply",
  ]);
  assert.equal(routes.match({ method: "POST", path: "/api/workspace-onboarding/plan" }).id, "workspace-onboarding-plan");
  assert.equal(routes.match({ method: "POST", path: "/api/workspace-onboarding/apply" }).id, "workspace-onboarding-apply");
  assert.equal(routes.match({ method: "GET", path: "/api/workspace-onboarding/plan" }), null);
}

async function testPlanRequiresOwnerAndUsesInjectedAuth() {
  const { calls, routes } = makeRoutes();
  const denied = await request(routes, "POST", "/api/workspace-onboarding/plan", { workspaceId: "child" }, {}, { workspaceId: "xulu" });
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access is required" });
  assert.equal(calls.plan.length, 0);

  const allowed = await request(routes, "POST", "/api/workspace-onboarding/plan", { workspaceId: "owner", principalId: "owner-1" }, {}, { workspaceId: "xulu" });
  assert.equal(allowed.res.statusCode, 200);
  assert.equal(allowed.body.status, "planned");
  assert.deepEqual(calls.plan[0], {
    input: { workspaceId: "xulu" },
    runtime: { actor: "owner-1" },
  });
}

async function testApplyStatusCodes() {
  const { calls, routes } = makeRoutes();
  const active = await request(routes, "POST", "/api/workspace-onboarding/apply", { workspaceId: "owner", principalId: "owner" }, {}, { workspaceId: "xulu" });
  assert.equal(active.res.statusCode, 201);
  assert.equal(active.body.status, "active");
  assert.equal(calls.apply.length, 1);

  const blocked = await request(routes, "POST", "/api/workspace-onboarding/apply", { workspaceId: "owner", principalId: "owner" }, {}, { workspaceId: "blocked" });
  assert.equal(blocked.res.statusCode, 503);
  assert.equal(blocked.body.error, "system_provisioning_executor_unavailable");

  const failed = await request(routes, "POST", "/api/workspace-onboarding/apply", { workspaceId: "owner", principalId: "owner" }, {}, { workspaceId: "failed" });
  assert.equal(failed.res.statusCode, 200);
  assert.equal(failed.body.status, "provisioning_failed");
  assert.equal(failed.body.steps[0].error, "EACCES");
}

async function testDependencyValidation() {
  assert.throws(() => createWorkspaceOnboardingApiRoutes({}), /require readBody/);
  assert.throws(() => createWorkspaceOnboardingApiRoutes({
    isOwnerAuth: () => true,
    readBody: () => Promise.resolve({}),
    requireOwner: () => ({}),
    sendJson,
    workspaceOnboardingService: {},
  }), /planOnboarding/);
}

async function run() {
  await testMetadataAndMatching();
  await testPlanRequiresOwnerAndUsesInjectedAuth();
  await testApplyStatusCodes();
  await testDependencyValidation();
  console.log("workspace onboarding api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
