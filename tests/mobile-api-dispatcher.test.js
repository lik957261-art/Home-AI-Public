"use strict";

const assert = require("node:assert/strict");
const {
  EMBEDDED_PLUGIN_PROXY_PATH_REGEX,
  MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE,
  PRE_AUTH_NATIVE_IOS_SHELL_PATHS,
  PRE_AUTH_SYSTEM_PATHS,
  createMobileApiDispatcher,
} = require("../server-routes/mobile-api-dispatcher");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, this.headers, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function createRoute(key, calls, behavior) {
  return {
    async handle(req, res, url, context) {
      calls.push({
        type: "route",
        key,
        path: url.pathname,
        contextArgCount: arguments.length,
        auth: context?.auth || null,
      });
      const result = behavior?.({ key, req, res, url, context });
      if (result?.writeJson) {
        res.writeHead(result.status || 200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result.writeJson));
      }
      return result?.handled ? { handled: true, route: { id: key } } : { handled: false };
    },
  };
}

function makeDeps(options = {}) {
  const calls = [];
  const routeBehaviors = options.routeBehaviors || {};
  const deps = {
    getUrl(req) {
      calls.push({ type: "getUrl", url: req.url });
      return new URL(req.url || "/", "http://localhost");
    },
    attachClientVersionHeaders(req, res) {
      calls.push({ type: "attachClientVersionHeaders" });
      res.headers["X-Hermes-Client-Version"] = "test-version";
    },
    authenticateRequest(req) {
      calls.push({ type: "authenticateRequest" });
      return req.authResult || { ok: true, workspaceId: "owner" };
    },
    buildRequestContext(input) {
      calls.push({ type: "buildRequestContext", input });
      return { built: true, input };
    },
    requestClientVersion(req) {
      calls.push({ type: "requestClientVersion" });
      return req.headers?.["x-client-version"] || "";
    },
    sendJson(res, status, payload) {
      calls.push({ type: "sendJson", status, payload });
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
    publicApiRoutes: createRoute("publicApiRoutes", calls, routeBehaviors.publicApiRoutes),
  };

  for (const entry of MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE) {
    if (!deps[entry.key]) deps[entry.key] = createRoute(entry.key, calls, routeBehaviors[entry.key]);
  }

  return { deps, calls };
}

function routeCalls(calls) {
  return calls.filter((call) => call.type === "route");
}

async function testPublicRoutesRunBeforeAuthAndStopPipeline() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      publicApiRoutes: () => ({ handled: true, status: 200, writeJson: { ok: true } }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();

  const result = await dispatcher.handleApi({ method: "GET", url: "/api/public-config", headers: {} }, res);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.deepEqual(calls.map((call) => call.type), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
  ]);
  assert.equal(routeCalls(calls)[0].key, "publicApiRoutes");
}

async function testClientVersionSystemRouteRunsBeforeBrowserAuth() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      systemApiRoutes: ({ url, context }) => ({
        handled: url.pathname === "/api/client-version" && !context,
        status: 200,
        writeJson: { version: "server-version", refreshRequired: true },
      }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();
  const req = {
    method: "GET",
    url: "/api/client-version?clientVersion=old",
    headers: {},
    authResult: { ok: false },
  };

  const result = await dispatcher.handleApi(req, res);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { version: "server-version", refreshRequired: true });
  assert.equal(req.hermesRequestContext, undefined);
  assert.deepEqual(calls.map((call) => call.type), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
    "route",
  ]);
  assert.deepEqual(routeCalls(calls).map((call) => call.key), ["publicApiRoutes", "systemApiRoutes"]);
  assert.equal(routeCalls(calls)[1].contextArgCount, 3);
  assert.equal(PRE_AUTH_SYSTEM_PATHS.has("/api/client-version"), true);
}

async function testNativeIosShellVersionPolicyRunsBeforeBrowserAuth() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      nativeIosShellApiRoutes: ({ url, context }) => ({
        handled: url.pathname === "/api/native/ios-shell/version-policy" && !context,
        status: 200,
        writeJson: { ok: true, updateRequired: false },
      }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();
  const req = {
    method: "GET",
    url: "/api/native/ios-shell/version-policy?platform=ios&buildNumber=35",
    headers: {},
    authResult: { ok: false },
  };

  const result = await dispatcher.handleApi(req, res);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, updateRequired: false });
  assert.equal(req.hermesRequestContext, undefined);
  assert.deepEqual(calls.map((call) => call.type), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
    "route",
  ]);
  assert.deepEqual(routeCalls(calls).map((call) => call.key), ["publicApiRoutes", "nativeIosShellApiRoutes"]);
  assert.equal(routeCalls(calls)[1].contextArgCount, 3);
  assert.equal(PRE_AUTH_NATIVE_IOS_SHELL_PATHS.has("/api/native/ios-shell/version-policy"), true);
}

async function testUnauthorizedRequestStopsAfterAuthFailure() {
  const { deps, calls } = makeDeps();
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();
  const req = {
    method: "GET",
    url: "/api/status",
    headers: {},
    authResult: { ok: false },
  };

  const result = await dispatcher.handleApi(req, res);

  assert.equal(result.status, 401);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.body), { error: "Unauthorized" });
  assert.equal(req.hermesRequestContext, undefined);
  assert.deepEqual(calls.map((call) => call.type), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
    "authenticateRequest",
    "sendJson",
  ]);
}

async function testCodexPluginProxyRunsBeforeBrowserAuth() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      hermesPluginApiRoutes: () => ({ handled: true, status: 200, writeJson: { ok: true, proxied: true } }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();
  const req = {
    method: "GET",
    url: "/api/hermes-plugins/codex-mobile/proxy/?embed=hermes&workspaceId=owner",
    headers: {},
    authResult: { ok: false },
  };

  const result = await dispatcher.handleApi(req, res);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, proxied: true });
  assert.equal(req.hermesRequestContext, undefined);
  assert.deepEqual(calls.map((call) => call.type), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
    "route",
  ]);
  assert.deepEqual(routeCalls(calls).map((call) => call.key), ["publicApiRoutes", "hermesPluginApiRoutes"]);
  assert.equal(EMBEDDED_PLUGIN_PROXY_PATH_REGEX.test("/api/hermes-plugins/wardrobe/proxy/?embed=hermes"), true);
}

async function testAuthenticatedPipelineOrderAndRequestContext() {
  const { deps, calls } = makeDeps();
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();
  const auth = { ok: true, workspaceId: "workspace-a", owner: false };
  const req = {
    method: "PATCH",
    url: "/api/not-found?x=1",
    headers: {
      "x-request-id": "req-123",
      "x-client-version": "client-9",
    },
    authResult: auth,
  };

  const result = await dispatcher.handleApi(req, res);

  assert.equal(result.status, 404);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: "Not found" });
  assert.equal(req.hermesRequestContext.built, true);
  assert.equal(req.hermesRequestContext.input.auth, auth);
  assert.equal(req.hermesRequestContext.input.url.pathname, "/api/not-found");
  assert.deepEqual(req.hermesRequestContext.input.request, {
    method: "PATCH",
    headers: req.headers,
    requestId: "req-123",
    clientVersion: "client-9",
  });

  const routeKeys = routeCalls(calls).map((call) => call.key);
  assert.deepEqual(routeKeys, [
    "publicApiRoutes",
    ...MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.map((entry) => entry.key),
  ]);

  const authRouteCalls = routeCalls(calls).slice(1);
  assert.deepEqual(
    authRouteCalls.map((call) => ({
      key: call.key,
      hasAuthContext: call.contextArgCount === 4,
      auth: call.auth,
    })),
    MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.map((entry) => ({
      key: entry.key,
      hasAuthContext: entry.passAuth,
      auth: entry.passAuth ? auth : null,
    })),
  );

  assert.deepEqual(calls.map((call) => call.type).slice(0, 6), [
    "getUrl",
    "attachClientVersionHeaders",
    "route",
    "authenticateRequest",
    "requestClientVersion",
    "buildRequestContext",
  ]);
}

async function testGrowthCardRoutesPrecedeProgramCatchAllRoutes() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      learningGrowthCardApiRoutes: ({ url }) => ({
        handled: url.pathname === "/api/learning-growth/stage-assessments/challenge",
        status: 201,
        writeJson: { ok: true, route: "growth-card" },
      }),
      learningProgramApiRoutes: () => ({
        handled: true,
        status: 404,
        writeJson: { ok: false, route: "program-catch-all" },
      }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();

  await dispatcher.handleApi({
    method: "POST",
    url: "/api/learning-growth/stage-assessments/challenge",
    headers: {},
    authResult: { ok: true, workspaceId: "learner_test_1" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(JSON.parse(res.body), { ok: true, route: "growth-card" });
  assert.equal(routeCalls(calls).some((call) => call.key === "learningProgramApiRoutes"), false);
  assert.ok(
    MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.findIndex((entry) => entry.key === "learningGrowthCardApiRoutes")
    < MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.findIndex((entry) => entry.key === "learningProgramApiRoutes"),
  );
}

async function testGrowthPluginFacadeRoutesPrecedeLearningRoutes() {
  const { deps, calls } = makeDeps({
    routeBehaviors: {
      growthPluginFacadeApiRoutes: ({ url }) => ({
        handled: url.pathname === "/api/growth/v1/board",
        status: 200,
        writeJson: { ok: true, route: "growth-facade" },
      }),
      learningApiRoutes: () => ({
        handled: true,
        status: 404,
        writeJson: { ok: false, route: "legacy-learning" },
      }),
    },
  });
  const dispatcher = createMobileApiDispatcher(deps);
  const res = makeResponse();

  await dispatcher.handleApi({
    method: "GET",
    url: "/api/growth/v1/board",
    headers: {},
    authResult: { ok: true, workspaceId: "learner_test_1" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, route: "growth-facade" });
  assert.equal(routeCalls(calls).some((call) => call.key === "learningApiRoutes"), false);
  assert.ok(
    MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.findIndex((entry) => entry.key === "growthPluginFacadeApiRoutes")
    < MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.findIndex((entry) => entry.key === "learningApiRoutes"),
  );
}

function testDependencyValidation() {
  assert.throws(() => createMobileApiDispatcher({}), /requires getUrl/);

  const { deps } = makeDeps();
  assert.throws(
    () => createMobileApiDispatcher(Object.assign({}, deps, { publicApiRoutes: {} })),
    /requires publicApiRoutes\.handle/,
  );

  assert.deepEqual(
    createMobileApiDispatcher(deps).authenticatedRouteKeys,
    MOBILE_API_AUTHENTICATED_ROUTE_PIPELINE.map((entry) => entry.key),
  );
}

async function run() {
  await testPublicRoutesRunBeforeAuthAndStopPipeline();
  await testClientVersionSystemRouteRunsBeforeBrowserAuth();
  await testNativeIosShellVersionPolicyRunsBeforeBrowserAuth();
  await testUnauthorizedRequestStopsAfterAuthFailure();
  await testCodexPluginProxyRunsBeforeBrowserAuth();
  await testAuthenticatedPipelineOrderAndRequestContext();
  await testGrowthPluginFacadeRoutesPrecedeLearningRoutes();
  await testGrowthCardRoutesPrecedeProgramCatchAllRoutes();
  testDependencyValidation();
  console.log("mobile api dispatcher tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
