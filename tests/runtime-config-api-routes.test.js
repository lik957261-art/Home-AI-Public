"use strict";

const assert = require("node:assert/strict");
const { createRuntimeConfigApiRoutes } = require("../server-routes/runtime-config-api-routes");

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

function parseJson(res) {
  return res.body ? JSON.parse(res.body) : null;
}

function makeRoutes(overrides = {}) {
  const calls = {
    generate: [],
    reload: 0,
    save: [],
  };
  const deps = Object.assign({
    generateWebPushVapidConfig(options) {
      calls.generate.push(options);
      return {
        source: "C:\\ProgramData\\HermesMobile\\data\\web-push-vapid.json",
        publicKey: "public-key",
        privateKey: "private-key-must-not-leak",
        subject: "mailto:owner@example.test",
      };
    },
    getHermesStatus() {
      return Promise.resolve({ ok: true, apiBase: "http://127.0.0.1:8000" });
    },
    publicPushStatus() {
      return { enabled: true, publicKey: "public-key", subject: "mailto:owner@example.test", subscriptionCount: 2 };
    },
    publicRuntimeConfig() {
      return {
        hermesApiBase: "http://127.0.0.1:8000",
        hermesApiKeyConfigured: true,
        webPushPublicKeyPresent: true,
      };
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    reloadWebPush() {
      calls.reload += 1;
      return { publicKey: "public-key" };
    },
    requireOwner(req, res) {
      if (req.headers?.["x-owner"] === "yes") return { principalId: "owner" };
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Owner access required" }));
      return null;
    },
    runConcurrencySnapshot() {
      return { activeGlobal: 1, maxGlobal: 10 };
    },
    saveRuntimeConfig(input, actor) {
      calls.save.push({ input, actor });
      return Object.assign({}, input, { updatedBy: actor });
    },
    sendJson(res, status, data) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
  }, overrides);
  return { routes: createRuntimeConfigApiRoutes(deps), calls };
}

async function request(routes, method, pathname, body, headers = { "x-owner": "yes" }) {
  const res = makeResponse();
  const result = await routes.handle({ method, url: pathname, headers, body }, res, { pathname });
  return { result, res, body: parseJson(res) };
}

async function testOwnerRequiredAndRouteInventory() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "GET", "/api/runtime-config", {}, {});
  assert.equal(denied.result.handled, true);
  assert.equal(denied.res.statusCode, 403);
  assert.deepEqual(denied.body, { error: "Owner access required" });

  const miss = await request(routes, "GET", "/api/status", {});
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);

  assert.equal(routes.match({ method: "PATCH", path: "/api/runtime-config" }).id, "runtime-config");
  assert.equal(routes.summary().total, 4);
  assert.equal(routes.summary().byAuthMode.owner, 4);
}

async function testGetAndPatchRuntimeConfig() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/runtime-config", {});
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, {
    ok: true,
    config: {
      hermesApiBase: "http://127.0.0.1:8000",
      hermesApiKeyConfigured: true,
      webPushPublicKeyPresent: true,
    },
  });

  const patched = await request(routes, "PATCH", "/api/runtime-config", { hermesApiBase: "http://localhost:9000" });
  assert.equal(patched.res.statusCode, 200);
  assert.equal(calls.save.length, 1);
  assert.deepEqual(calls.save[0], { input: { hermesApiBase: "http://localhost:9000" }, actor: "owner" });
  assert.equal(calls.reload, 1);
  assert.equal(patched.body.ok, true);
  assert.equal(patched.body.push.enabled, true);
}

async function testPatchBodyAndSaveErrors() {
  const bodyError = new Error("bad json");
  const invalid = makeRoutes({
    readBody() {
      return Promise.reject(bodyError);
    },
  });
  const invalidResult = await request(invalid.routes, "PATCH", "/api/runtime-config", {});
  assert.equal(invalidResult.res.statusCode, 400);
  assert.deepEqual(invalidResult.body, { error: "bad json" });

  const saveError = new Error("Hermes Gateway URL is not valid");
  saveError.status = 400;
  const failing = makeRoutes({
    saveRuntimeConfig() {
      throw saveError;
    },
  });
  const failed = await request(failing.routes, "PATCH", "/api/runtime-config", { hermesApiBase: "file:///tmp/key" });
  assert.equal(failed.res.statusCode, 400);
  assert.deepEqual(failed.body, { error: "Hermes Gateway URL is not valid" });
}

async function testGatewayConnectionTestAddsConcurrency() {
  const { routes } = makeRoutes();
  const tested = await request(routes, "POST", "/api/runtime-config/test", {});
  assert.equal(tested.res.statusCode, 200);
  assert.equal(tested.body.ok, true);
  assert.deepEqual(tested.body.status.concurrency, { activeGlobal: 1, maxGlobal: 10 });
  assert.equal(tested.body.config.hermesApiKeyConfigured, true);
}

async function testWebPushGenerateReloadAndErrors() {
  const { routes, calls } = makeRoutes();
  const generated = await request(routes, "POST", "/api/runtime-config/web-push/generate", { overwrite: "true" });
  assert.equal(generated.res.statusCode, 201);
  assert.deepEqual(calls.generate, [{ overwrite: true }]);
  assert.equal(generated.body.ok, true);
  assert.equal(generated.body.generated.publicKey, "public-key");
  assert.equal(generated.body.generated.subject, "mailto:owner@example.test");
  assert.equal(Object.hasOwn(generated.body.generated, "privateKey"), false);
  assert.equal(Object.hasOwn(generated.body.generated, "private_key"), false);

  const reloaded = await request(routes, "POST", "/api/runtime-config/web-push/reload", {});
  assert.equal(reloaded.res.statusCode, 200);
  assert.equal(reloaded.body.ok, true);
  assert.equal(calls.reload, 1);

  const conflictError = new Error("VAPID key file already exists");
  conflictError.status = 409;
  const failing = makeRoutes({
    generateWebPushVapidConfig() {
      throw conflictError;
    },
  });
  const failed = await request(failing.routes, "POST", "/api/runtime-config/web-push/generate", { overwrite: false });
  assert.equal(failed.res.statusCode, 409);
  assert.equal(failed.body.error, "VAPID key file already exists");
  assert.equal(failed.body.config.hermesApiBase, "http://127.0.0.1:8000");
  assert.equal(failed.body.push.publicKey, "public-key");
}

async function run() {
  await testOwnerRequiredAndRouteInventory();
  await testGetAndPatchRuntimeConfig();
  await testPatchBodyAndSaveErrors();
  await testGatewayConnectionTestAddsConcurrency();
  await testWebPushGenerateReloadAndErrors();
  console.log("runtime config api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
