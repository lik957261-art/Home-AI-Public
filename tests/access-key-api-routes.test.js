"use strict";

const assert = require("node:assert/strict");
const {
  ACCESS_KEY_API_ROUTE_SPECS,
  createAccessKeyApiRoutes,
} = require("../server-routes/access-key-api-routes");

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
    list: [],
    ownerKeySource: 0,
    readBody: [],
    requireOwner: [],
    rotateGlobal: [],
    rotateWorkspace: [],
    revokeWorkspace: [],
  };
  const deps = Object.assign({
    requireOwner(req, res) {
      calls.requireOwner.push(req.headers || {});
      if (req.headers?.["x-owner"] === "yes") {
        return { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };
      }
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    },
    readBody(req) {
      calls.readBody.push(req.body || {});
      return Promise.resolve(req.body || {});
    },
    sendJson,
    isOwnerAuth(auth) {
      return auth?.isOwner === true || auth?.workspaceId === "owner" || auth?.role === "owner";
    },
    ownerKeySource() {
      calls.ownerKeySource += 1;
      return "file";
    },
    listWorkspaceAccessKeyStatuses(auth, options) {
      calls.list.push({ auth, options });
      return [
        {
          workspaceId: "child-a",
          workspaceLabel: "Child A",
          role: "user",
          principalId: "principal-child-a",
          hasKey: true,
          createdAt: "2026-05-14T10:00:00.000Z",
          updatedAt: "2026-05-14T11:00:00.000Z",
        },
      ];
    },
    rotateWorkspaceAccessKey(workspaceId, options) {
      calls.rotateWorkspace.push({ workspaceId, options });
      return {
        key: "fixture-workspace-access-key",
        record: {
          workspaceId,
          workspaceLabel: "Child A",
          role: "user",
          principalId: "principal-child-a",
          hasKey: true,
          createdAt: "2026-05-14T10:00:00.000Z",
          updatedAt: "2026-05-14T12:00:00.000Z",
        },
        dryRun: Boolean(options.dryRun),
      };
    },
    revokeWorkspaceAccessKey(workspaceId, options) {
      calls.revokeWorkspace.push({ workspaceId, options });
      return {
        workspace: {
          workspaceId,
          workspaceLabel: "Child A",
          role: "user",
          principalId: "principal-child-a",
          hasKey: false,
          createdAt: "",
          updatedAt: "",
        },
        revoked: !options.dryRun,
        dryRun: Boolean(options.dryRun),
      };
    },
    rotateGlobalAccessKey(options) {
      calls.rotateGlobal.push(options);
      return {
        key: "fixture-owner-access-key",
        auth: {
          source: options.dryRun ? "file" : "file",
          path: "C:\\ProgramData\\HermesMobile\\data\\owner.key",
          updatedAt: "2026-05-14T12:30:00.000Z",
        },
        dryRun: Boolean(options.dryRun),
      };
    },
    boolParam(value) {
      if (typeof value === "boolean") return value;
      return /^(1|true|yes|on)$/i.test(String(value || "").trim());
    },
  }, overrides);
  return { routes: createAccessKeyApiRoutes(deps), calls, deps };
}

async function request(routes, method, path, body, headers = { "x-owner": "yes" }, context) {
  const res = makeResponse();
  const req = { method, url: path, headers, body };
  const result = await routes.handle(req, res, makeUrl(path), context);
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(ACCESS_KEY_API_ROUTE_SPECS.map((route) => route.id), [
    "access-keys-list",
    "access-keys-workspace-create",
    "access-keys-workspace-delete",
    "access-keys-web-create",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/access-keys" }).id, "access-keys-list");
  assert.equal(routes.match({ method: "POST", path: "/api/access-keys/workspace" }).id, "access-keys-workspace-create");
  assert.equal(routes.match({ method: "DELETE", path: "/api/access-keys/workspace/child-a" }).id, "access-keys-workspace-delete");
  assert.equal(routes.match({ method: "POST", path: "/api/access-keys/web" }).id, "access-keys-web-create");
  assert.equal(routes.match({ method: "PATCH", path: "/api/access-keys/web" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byAuthMode, { owner: 4 });
  assert.deepEqual(summary.byModule, { "access-key": 4 });
  assert.equal(JSON.stringify(summary).includes("/api/access-keys"), false);

  const listed = routes.list({ public: true });
  assert.equal(listed.every((route) => route.ownerOnly && route.moduleKey === "access-key"), true);
  assert.equal(Object.hasOwn(listed[0], "path"), false);

  const miss = await request(routes, "GET", "/api/status", {});
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testOwnerOnly() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "GET", "/api/access-keys", {}, {});

  assert.equal(denied.result.handled, true);
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access is required" });
  assert.equal(calls.requireOwner.length, 1);
  assert.deepEqual(calls.list, []);
  assert.deepEqual(calls.rotateWorkspace, []);
  assert.deepEqual(calls.revokeWorkspace, []);
  assert.deepEqual(calls.rotateGlobal, []);

  const contextDenied = await request(
    routes,
    "POST",
    "/api/access-keys/web",
    { dryRun: true },
    {},
    { auth: { workspaceId: "child-a", role: "workspace" } },
  );
  assert.equal(contextDenied.res.statusCode, 403);
  assert.equal(calls.requireOwner.length, 1);
  assert.deepEqual(calls.rotateGlobal, []);
}

async function testListResponseAuthShape() {
  const { routes, calls } = makeRoutes();
  const listed = await request(routes, "GET", "/api/access-keys?workspaceId=child-a", {});

  assert.equal(listed.result.handled, true);
  assert.equal(listed.result.route.id, "access-keys-list");
  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(listed.body, {
    ok: true,
    auth: {
      isOwner: true,
      workspaceId: "owner",
      source: "file",
      canRotateGlobal: true,
    },
    data: [
      {
        workspaceId: "child-a",
        workspaceLabel: "Child A",
        role: "user",
        principalId: "principal-child-a",
        hasKey: true,
        createdAt: "2026-05-14T10:00:00.000Z",
        updatedAt: "2026-05-14T11:00:00.000Z",
      },
    ],
  });
  assert.equal(calls.ownerKeySource, 1);
  assert.equal(calls.list.length, 1);
  assert.equal(calls.list[0].auth.principalId, "owner-principal");
  assert.deepEqual(calls.list[0].options, { workspaceId: "child-a" });

  const envRoutes = makeRoutes({ ownerKeySource: () => "env" });
  const envListed = await request(envRoutes.routes, "GET", "/api/access-keys", {});
  assert.deepEqual(envListed.body.auth, {
    isOwner: true,
    workspaceId: "owner",
    source: "env",
    canRotateGlobal: false,
  });
}

async function testWorkspaceRotateAndRevokeParametersAndStatusCodes() {
  const { routes, calls } = makeRoutes();
  const rotated = await request(routes, "POST", "/api/access-keys/workspace", {
    workspaceId: "child-a",
    dryRun: "0",
  });

  assert.equal(rotated.res.statusCode, 201);
  assert.deepEqual(calls.rotateWorkspace, [
    {
      workspaceId: "child-a",
      options: {
        dryRun: false,
        actor: "owner-principal",
      },
    },
  ]);
  assert.equal(rotated.body.ok, true);
  assert.equal(rotated.body.key, "fixture-workspace-access-key");
  assert.equal(rotated.body.workspace.workspaceId, "child-a");
  assert.equal(rotated.body.dryRun, false);
  assert.equal(rotated.body.requiresReLogin, false);

  const dryRun = await request(routes, "POST", "/api/access-keys/workspace", {
    workspace_id: "child-b",
    dry_run: "yes",
  });
  assert.equal(dryRun.res.statusCode, 200);
  assert.equal(calls.rotateWorkspace[1].workspaceId, "child-b");
  assert.deepEqual(calls.rotateWorkspace[1].options, { dryRun: true, actor: "owner-principal" });
  assert.equal(dryRun.body.dryRun, true);

  const revoked = await request(routes, "DELETE", "/api/access-keys/workspace/child-a", {
    dryRun: false,
  });
  assert.equal(revoked.res.statusCode, 200);
  assert.deepEqual(calls.revokeWorkspace[0], { workspaceId: "child-a", options: { dryRun: false } });
  assert.deepEqual(revoked.body, {
    ok: true,
    result: {
      workspace: {
        workspaceId: "child-a",
        workspaceLabel: "Child A",
        role: "user",
        principalId: "principal-child-a",
        hasKey: false,
        createdAt: "",
        updatedAt: "",
      },
      revoked: true,
      dryRun: false,
    },
    requiresReLogin: false,
  });

  const revokeDryRun = await request(routes, "DELETE", "/api/access-keys/workspace/child%20b", {
    dry_run: "true",
  });
  assert.equal(revokeDryRun.res.statusCode, 200);
  assert.deepEqual(calls.revokeWorkspace[1], { workspaceId: "child b", options: { dryRun: true } });
  assert.equal(revokeDryRun.body.result.dryRun, true);
}

async function testWebRotateDryRunAndRealStatusCodes() {
  const { routes, calls } = makeRoutes();
  const dryRun = await request(routes, "POST", "/api/access-keys/web", { dryRun: "true" });

  assert.equal(dryRun.res.statusCode, 200);
  assert.deepEqual(calls.rotateGlobal, [{ dryRun: true }]);
  assert.deepEqual(dryRun.body, {
    ok: true,
    key: "fixture-owner-access-key",
    auth: {
      source: "file",
      path: "C:\\ProgramData\\HermesMobile\\data\\owner.key",
      updatedAt: "2026-05-14T12:30:00.000Z",
    },
    dryRun: true,
    requiresReLogin: false,
  });

  const real = await request(routes, "POST", "/api/access-keys/web", { dry_run: "0" });
  assert.equal(real.res.statusCode, 201);
  assert.deepEqual(calls.rotateGlobal[1], { dryRun: false });
  assert.equal(real.body.ok, true);
  assert.equal(real.body.key, "fixture-owner-access-key");
  assert.equal(real.body.dryRun, false);
  assert.equal(real.body.requiresReLogin, true);
}

async function testWorkspaceIdMissing() {
  const { routes, calls } = makeRoutes();
  const missingPost = await request(routes, "POST", "/api/access-keys/workspace", {});

  assert.equal(missingPost.res.statusCode, 400);
  assert.deepEqual(missingPost.body, { error: "workspaceId is required" });
  assert.deepEqual(calls.rotateWorkspace, []);

  const missingDelete = await request(routes, "DELETE", "/api/access-keys/workspace/%20", {});
  assert.equal(missingDelete.res.statusCode, 400);
  assert.deepEqual(missingDelete.body, { error: "workspaceId is required" });
  assert.deepEqual(calls.revokeWorkspace, []);
}

async function testBusinessErrors() {
  const workspaceError = new Error("Unknown workspace");
  workspaceError.status = 400;
  const failingRotate = makeRoutes({
    rotateWorkspaceAccessKey() {
      throw workspaceError;
    },
  });
  const rotateFailed = await request(failingRotate.routes, "POST", "/api/access-keys/workspace", { workspaceId: "missing" });
  assert.equal(rotateFailed.res.statusCode, 400);
  assert.deepEqual(rotateFailed.body, { error: "Unknown workspace" });

  const revokeError = new Error("Access key store is locked");
  revokeError.status = 409;
  const failingRevoke = makeRoutes({
    revokeWorkspaceAccessKey() {
      throw revokeError;
    },
  });
  const revokeFailed = await request(failingRevoke.routes, "DELETE", "/api/access-keys/workspace/child-a", {});
  assert.equal(revokeFailed.res.statusCode, 409);
  assert.deepEqual(revokeFailed.body, { error: "Access key store is locked" });

  const envError = new Error("Hermes Mobile key is configured by HERMES_WEB_KEY");
  envError.status = 409;
  const failingGlobal = makeRoutes({
    rotateGlobalAccessKey() {
      throw envError;
    },
  });
  const globalFailed = await request(failingGlobal.routes, "POST", "/api/access-keys/web", {});
  assert.equal(globalFailed.res.statusCode, 409);
  assert.deepEqual(globalFailed.body, { error: "Hermes Mobile key is configured by HERMES_WEB_KEY" });
}

function testDependencyValidation() {
  assert.throws(
    () => createAccessKeyApiRoutes({}),
    /access key api routes require requireOwner/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testOwnerOnly();
  await testListResponseAuthShape();
  await testWorkspaceRotateAndRevokeParametersAndStatusCodes();
  await testWebRotateDryRunAndRealStatusCodes();
  await testWorkspaceIdMissing();
  await testBusinessErrors();
  testDependencyValidation();
  console.log("access key api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
