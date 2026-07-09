"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceApiRoutes, WORKSPACE_API_ROUTE_SPECS } = require("../server-routes/workspace-api-routes");

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

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeRoutes(overrides = {}) {
  const calls = {
    bootTrace: [],
    delete: [],
    defaults: [],
    findWorkspace: [],
    publicWorkspace: [],
    publicWorkspacesForAuth: [],
    readBody: [],
    requireOwner: [],
    upsert: [],
  };
  const deps = Object.assign({
    bootTrace(message) {
      calls.bootTrace.push(message);
    },
    loadCatalog() {
      return { sources: [{ kind: "local" }, { kind: "external-route-map" }] };
    },
    publicWorkspacesForAuth(auth) {
      calls.publicWorkspacesForAuth.push(auth);
      return [
        { id: "child", label: "Child", source: "local-workspace" },
        { id: "owner", label: "Owner", source: "owner" },
      ].filter((workspace) => auth?.workspaceId === "owner" || workspace.id === auth?.workspaceId);
    },
    publicWorkspace(workspace) {
      calls.publicWorkspace.push(workspace.id);
      return {
        id: workspace.id,
        label: workspace.label,
        source: workspace.source,
        workDirectories: [],
      };
    },
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner" || auth?.isOwner === true;
    },
    requireOwner(req, res) {
      calls.requireOwner.push(req.headers || {});
      if (req.headers?.["x-owner"] === "yes") return { ok: true, role: "owner", workspaceId: "owner", principalId: "owner" };
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    },
    localWorkspaceDefaults(input) {
      calls.defaults.push(input);
      return {
        workspaceId: input.workspaceId || "derived",
        label: input.label || input.username || "Workspace",
        defaultWorkspace: `C:\\Data\\${input.workspaceId || input.username || "workspace"}`,
        allowedRoots: [`C:\\Data\\${input.workspaceId || input.username || "workspace"}`],
        allowedToolsets: [],
        connectorProfiles: {},
      };
    },
    readBody(req) {
      calls.readBody.push(req.body);
      return Promise.resolve(req.body || {});
    },
    upsertLocalWorkspace(input, actor) {
      calls.upsert.push({ input, actor });
      const id = input?.workspaceId || input?.workspace_id || input?.id || input?.username || "derived";
      return {
        id,
        label: input?.label || `Workspace ${id}`,
        source: "local-workspace",
      };
    },
    deleteLocalWorkspace(workspaceId) {
      calls.delete.push(workspaceId);
      return { id: workspaceId };
    },
    findWorkspace(workspaceId) {
      calls.findWorkspace.push(workspaceId);
      return {
        id: workspaceId,
        label: `Workspace ${workspaceId}`,
        source: "local-workspace",
      };
    },
    sendJson,
  }, overrides);
  return { routes: createWorkspaceApiRoutes(deps), calls, deps };
}

async function request(routes, method, path, auth, headers = {}, body) {
  const res = makeResponse();
  const context = arguments.length >= 4 ? { auth } : undefined;
  const result = await routes.handle({ method, url: path, headers, body }, res, makeUrl(path), context);
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(WORKSPACE_API_ROUTE_SPECS.map((route) => route.id), [
    "workspaces-list",
    "workspaces-defaults",
    "workspaces-create",
    "workspaces-update",
    "workspaces-delete",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/workspaces" }).id, "workspaces-list");
  assert.equal(routes.match({ method: "GET", path: "/api/workspaces/defaults" }).id, "workspaces-defaults");
  assert.equal(routes.match({ method: "POST", path: "/api/workspaces" }).id, "workspaces-create");
  assert.equal(routes.match({ method: "PATCH", path: "/api/workspaces/child%20one" }).id, "workspaces-update");
  assert.equal(routes.match({ method: "DELETE", path: "/api/workspaces/child%20one" }).id, "workspaces-delete");
  assert.equal(routes.match({ method: "GET", path: "/api/workspaces/child" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byAuthMode, { "access-key": 1, owner: 4 });
  assert.deepEqual(summary.byModule, { "workspace-admin": 5 });
  assert.equal(JSON.stringify(summary).includes("/api/workspaces"), false);

  const publicRoutes = routes.list({ public: true });
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.equal(publicRoutes[1].ownerOnly, true);
  assert.deepEqual(publicRoutes[0].resourceTypes, ["workspace"]);

  const res = makeResponse();
  const result = await routes.handle({ method: "GET", url: "/api/status", headers: {} }, res, makeUrl("/api/status"), { auth: { workspaceId: "owner" } });
  assert.equal(result.handled, false);
  assert.equal(res.statusCode, 0);
}

async function testWorkspaceListShapeAndAuthMetadata() {
  const { routes, calls } = makeRoutes();
  const auth = { ok: true, role: "workspace", workspaceId: "child", principalId: "principal-child" };
  const listed = await request(routes, "GET", "/api/workspaces", auth);

  assert.equal(listed.result.handled, true);
  assert.equal(listed.result.route.id, "workspaces-list");
  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(listed.body, {
    data: [
      {
        id: "child",
        label: "Child",
        source: "local-workspace",
        workDirectories: [],
      },
    ],
    sources: [{ kind: "local" }, { kind: "external-route-map" }],
    auth: {
      role: "workspace",
      workspaceId: "child",
      workspaceIds: ["child"],
      accountType: "",
      restrictedMedia: false,
      allowedOwnerSpecialPlugins: [],
      isOwner: false,
    },
  });
  assert.deepEqual(calls.publicWorkspacesForAuth, [auth]);
  assert.deepEqual(calls.publicWorkspace, ["child"]);
  assert.deepEqual(calls.requireOwner, []);
  assert.deepEqual(calls.bootTrace, [
    "request api/workspaces enter",
    "request api/workspaces after loadCatalog",
    "request api/workspaces sent",
  ]);
}

async function testWorkspaceListIncludesRestrictedMediaAuthMetadata() {
  const { routes } = makeRoutes();
  const auth = {
    ok: true,
    role: "workspace",
    workspaceId: "media",
    accountType: "media",
    restrictedMedia: true,
    allowedOwnerSpecialPlugins: ["music", "movie"],
    isOwner: false,
  };
  const listed = await request(routes, "GET", "/api/workspaces", auth);

  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(listed.body.auth, {
    role: "workspace",
    workspaceId: "media",
    workspaceIds: ["media"],
    accountType: "media",
    restrictedMedia: true,
    allowedOwnerSpecialPlugins: ["music", "movie"],
    isOwner: false,
  });
}

async function testWorkspaceListIncludesTongbaoWalletWhenServiceIsAvailable() {
  const { routes } = makeRoutes({
    platformCurrencyService: {
      walletSummary(input) {
        return {
          walletId: `wallet:${input.workspaceId}`,
          workspaceId: input.workspaceId,
          currency: "TONGBAO",
          status: "active",
          availableBalance: 0,
          heldBalance: 0,
          totalBalance: 0,
        };
      },
    },
  });
  const listed = await request(routes, "GET", "/api/workspaces", { ok: true, role: "workspace", workspaceId: "child" });

  assert.equal(listed.res.statusCode, 200);
  assert.deepEqual(listed.body.data[0].tongbaoWallet, {
    walletId: "wallet:child",
    workspaceId: "child",
    currency: "TONGBAO",
    status: "active",
    availableBalance: 0,
    heldBalance: 0,
    totalBalance: 0,
  });
}

async function testDefaultsOwnerOnlyWithInjectedAuth() {
  const { routes, calls } = makeRoutes();
  const denied = await request(routes, "GET", "/api/workspaces/defaults?username=child", { ok: true, role: "workspace", workspaceId: "child" });

  assert.equal(denied.result.handled, true);
  assert.equal(denied.result.route.authMode, "owner");
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access is required" });
  assert.deepEqual(calls.defaults, []);
  assert.deepEqual(calls.requireOwner, []);
}

async function testDefaultsParameterPassing() {
  const { routes, calls } = makeRoutes();
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner" };

  const got = await request(
    routes,
    "GET",
    "/api/workspaces/defaults?username=Alice%20Lee&workspaceId=child-a&id=ignored&label=Child%20A",
    ownerAuth,
  );
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.defaults[0], {
    username: "Alice Lee",
    workspaceId: "child-a",
    label: "Child A",
  });
  assert.deepEqual(got.body, {
    ok: true,
    defaults: {
      workspaceId: "child-a",
      label: "Child A",
      defaultWorkspace: "C:\\Data\\child-a",
      allowedRoots: ["C:\\Data\\child-a"],
      allowedToolsets: [],
      connectorProfiles: {},
    },
  });

  await request(routes, "GET", "/api/workspaces/defaults?username=Bob&id=child-b", ownerAuth);
  assert.deepEqual(calls.defaults[1], {
    username: "Bob",
    workspaceId: "child-b",
    label: "",
  });
}

async function testDefaultsErrorShape() {
  const boundaryError = new Error("Workspace root is blocked by the Hermes Mobile security boundary");
  boundaryError.status = 403;
  const { routes, calls } = makeRoutes({
    localWorkspaceDefaults(input) {
      calls.defaults.push(input);
      throw boundaryError;
    },
  });
  const failed = await request(routes, "GET", "/api/workspaces/defaults?username=Blocked", { ok: true, role: "owner", workspaceId: "owner" });

  assert.equal(failed.res.statusCode, 403);
  assert.deepEqual(failed.body, { error: "Workspace root is blocked by the Hermes Mobile security boundary" });
  assert.deepEqual(calls.defaults, [{ username: "Blocked", workspaceId: "", label: "" }]);
}

async function testDefaultsFallbackRequireOwnerWhenAuthNotInjected() {
  const { routes, calls } = makeRoutes();
  const res = makeResponse();
  await routes.handle(
    { method: "GET", url: "/api/workspaces/defaults?username=Fallback", headers: { "x-owner": "yes" } },
    res,
    makeUrl("/api/workspaces/defaults?username=Fallback"),
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.requireOwner, [{ "x-owner": "yes" }]);
  assert.deepEqual(calls.defaults[0], { username: "Fallback", workspaceId: "", label: "" });
}

async function testWorkspaceAdminOwnerOnly() {
  const { routes, calls } = makeRoutes();
  const deniedCreate = await request(
    routes,
    "POST",
    "/api/workspaces",
    { ok: true, role: "workspace", workspaceId: "child" },
    {},
    { workspaceId: "new-child" },
  );

  assert.equal(deniedCreate.result.handled, true);
  assert.equal(deniedCreate.result.route.id, "workspaces-create");
  assert.equal(deniedCreate.res.statusCode, 403);
  assert.deepEqual(deniedCreate.body, { error: "Owner access is required" });
  assert.deepEqual(calls.readBody, []);
  assert.deepEqual(calls.upsert, []);

  const deniedDelete = await request(
    routes,
    "DELETE",
    "/api/workspaces/new-child",
    { ok: true, role: "workspace", workspaceId: "child" },
  );
  assert.equal(deniedDelete.res.statusCode, 403);
  assert.deepEqual(calls.delete, []);
}

async function testCreateWorkspace() {
  const { routes, calls } = makeRoutes();
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };
  const body = {
    workspaceId: "new-child",
    label: "New Child",
    allowedRoots: ["C:\\Data\\New Child"],
  };
  const created = await request(routes, "POST", "/api/workspaces", ownerAuth, {}, body);

  assert.equal(created.result.handled, true);
  assert.equal(created.result.route.id, "workspaces-create");
  assert.equal(created.res.statusCode, 201);
  assert.deepEqual(calls.readBody, [body]);
  assert.deepEqual(calls.upsert, [{ input: body, actor: "owner-principal" }]);
  assert.deepEqual(calls.findWorkspace, ["new-child"]);
  assert.deepEqual(calls.publicWorkspace, ["new-child"]);
  assert.deepEqual(created.body, {
    ok: true,
    workspace: {
      id: "new-child",
      label: "Workspace new-child",
      source: "local-workspace",
      workDirectories: [],
    },
    record: {
      id: "new-child",
      label: "New Child",
      source: "local-workspace",
    },
  });
}

async function testUpdateWorkspaceWithDecodedPath() {
  const { routes, calls } = makeRoutes();
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };
  const body = { label: "Child With Space" };
  const updated = await request(routes, "PATCH", "/api/workspaces/child%20space", ownerAuth, {}, body);

  assert.equal(updated.result.handled, true);
  assert.equal(updated.result.route.id, "workspaces-update");
  assert.equal(updated.res.statusCode, 200);
  assert.deepEqual(calls.readBody, [body]);
  assert.deepEqual(calls.upsert, [{
    input: { label: "Child With Space", workspaceId: "child space" },
    actor: "owner-principal",
  }]);
  assert.deepEqual(calls.findWorkspace, ["child space"]);
  assert.equal(updated.body.workspace.id, "child space");
  assert.equal(updated.body.record.id, "child space");
}

async function testDeleteWorkspaceWithDecodedPath() {
  const { routes, calls } = makeRoutes();
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };
  const deleted = await request(routes, "DELETE", "/api/workspaces/child%2Fslash", ownerAuth);

  assert.equal(deleted.result.handled, true);
  assert.equal(deleted.result.route.id, "workspaces-delete");
  assert.equal(deleted.res.statusCode, 200);
  assert.deepEqual(calls.readBody, []);
  assert.deepEqual(calls.delete, ["child/slash"]);
  assert.deepEqual(deleted.body, { ok: true, deleted: { id: "child/slash" } });
}

async function testWorkspaceAdminBodyParseErrors() {
  const { routes, calls } = makeRoutes({
    readBody() {
      return Promise.reject(new Error("bad json"));
    },
  });
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };

  const createFailed = await request(routes, "POST", "/api/workspaces", ownerAuth, {}, { workspaceId: "new-child" });
  assert.equal(createFailed.res.statusCode, 400);
  assert.deepEqual(createFailed.body, { error: "bad json" });

  const updateFailed = await request(routes, "PATCH", "/api/workspaces/new-child", ownerAuth, {}, { label: "New Child" });
  assert.equal(updateFailed.res.statusCode, 400);
  assert.deepEqual(updateFailed.body, { error: "bad json" });
  assert.deepEqual(calls.upsert, []);
}

async function testWorkspaceAdminBusinessErrors() {
  const conflict = new Error("Workspace id is already managed by the external workspace provider");
  conflict.status = 409;
  const failingUpsert = makeRoutes({
    upsertLocalWorkspace() {
      throw conflict;
    },
  });
  const ownerAuth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner-principal" };
  const createFailed = await request(failingUpsert.routes, "POST", "/api/workspaces", ownerAuth, {}, { workspaceId: "external" });

  assert.equal(createFailed.res.statusCode, 409);
  assert.deepEqual(createFailed.body, { error: "Workspace id is already managed by the external workspace provider" });
  assert.deepEqual(failingUpsert.calls.findWorkspace, []);

  const missing = new Error("Local workspace not found");
  missing.status = 404;
  const failingDelete = makeRoutes({
    deleteLocalWorkspace() {
      throw missing;
    },
  });
  const deleteFailed = await request(failingDelete.routes, "DELETE", "/api/workspaces/missing", ownerAuth);
  assert.equal(deleteFailed.res.statusCode, 404);
  assert.deepEqual(deleteFailed.body, { error: "Local workspace not found" });
}

async function testWorkspaceAdminFallbackRequireOwnerWhenAuthNotInjected() {
  const { routes, calls } = makeRoutes();
  const res = makeResponse();
  await routes.handle(
    {
      method: "POST",
      url: "/api/workspaces",
      headers: { "x-owner": "yes" },
      body: { workspaceId: "fallback-child" },
    },
    res,
    makeUrl("/api/workspaces"),
  );

  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.requireOwner, [{ "x-owner": "yes" }]);
  assert.deepEqual(calls.upsert, [{
    input: { workspaceId: "fallback-child" },
    actor: "owner",
  }]);
}

function testDependencyValidation() {
  assert.throws(
    () => createWorkspaceApiRoutes({}),
    /workspace api routes require bootTrace/,
  );
  assert.throws(
    () => createWorkspaceApiRoutes({
      bootTrace() {},
      loadCatalog() {},
      publicWorkspacesForAuth() {},
      publicWorkspace() {},
      isOwnerAuth() {},
      requireOwner() {},
      localWorkspaceDefaults() {},
      sendJson,
      readBody() {},
    }),
    /workspace api routes require upsertLocalWorkspace/,
  );
}

async function run() {
  await testMetadataAndFallthrough();
  await testWorkspaceListShapeAndAuthMetadata();
  await testWorkspaceListIncludesRestrictedMediaAuthMetadata();
  await testWorkspaceListIncludesTongbaoWalletWhenServiceIsAvailable();
  await testDefaultsOwnerOnlyWithInjectedAuth();
  await testDefaultsParameterPassing();
  await testDefaultsErrorShape();
  await testDefaultsFallbackRequireOwnerWhenAuthNotInjected();
  await testWorkspaceAdminOwnerOnly();
  await testCreateWorkspace();
  await testUpdateWorkspaceWithDecodedPath();
  await testDeleteWorkspaceWithDecodedPath();
  await testWorkspaceAdminBodyParseErrors();
  await testWorkspaceAdminBusinessErrors();
  await testWorkspaceAdminFallbackRequireOwnerWhenAuthNotInjected();
  testDependencyValidation();
  console.log("workspace api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
