"use strict";

const assert = require("node:assert/strict");
const { createNativeIosShellVersionPolicyService } = require("../adapters/native-ios-shell-version-policy-service");
const {
  IOS_SHELL_VERSION_POLICY_PATH,
  NATIVE_IOS_SHELL_API_ROUTE_SPECS,
  createNativeIosShellApiRoutes,
} = require("../server-routes/native-ios-shell-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function createRoutes(serviceOptions = {}) {
  return createNativeIosShellApiRoutes({
    nativeIosShellVersionPolicyService: createNativeIosShellVersionPolicyService(serviceOptions),
    sendJson(res, status, payload) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
  });
}

async function call(routes, path) {
  const res = makeResponse();
  const req = { method: "GET", url: path, headers: {} };
  const result = await routes.handle(req, res, new URL(path, "http://localhost"));
  return { result, res, body: JSON.parse(res.body || "{}") };
}

async function testCurrentBuildResponseIsPublicSafe() {
  const routes = createRoutes({ env: {} });
  const { result, res, body } = await call(routes, `${IOS_SHELL_VERSION_POLICY_PATH}?platform=ios&buildNumber=35&version=1.0.0`);

  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.platform, "ios");
  assert.equal(body.minimumBuild, 35);
  assert.equal(body.latestBuild, 35);
  assert.equal(body.currentBuild, 35);
  assert.equal(body.updateRequired, false);
  assert.equal(body.testFlightUrl, "https://testflight.apple.com/join/MTdEfYEt");
  assert.equal(JSON.stringify(body).includes("access"), false);
  assert.equal(JSON.stringify(body).includes("token"), false);
}

async function testOldBuildResponseRequiresUpdate() {
  const routes = createRoutes({ minimumBuild: 36, latestBuild: 36 });
  const { res, body } = await call(routes, `${IOS_SHELL_VERSION_POLICY_PATH}?platform=ios&buildNumber=35&version=1.0.0`);

  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.updateRequired, true);
  assert.equal(body.minimumBuild, 36);
  assert.match(body.message, /TestFlight/);
}

async function testMalformedBuildReturnsBoundedError() {
  const routes = createRoutes({ minimumBuild: 36, latestBuild: 36 });
  const { res, body } = await call(routes, `${IOS_SHELL_VERSION_POLICY_PATH}?platform=ios&buildNumber=nope&version=1.0.0`);

  assert.equal(res.statusCode, 400);
  assert.equal(body.ok, false);
  assert.equal(body.code, "ios_shell_build_invalid");
  assert.equal(body.updateRequired, true);
  assert.equal(body.testFlightUrl, "https://testflight.apple.com/join/MTdEfYEt");
}

function testRouteSpecs() {
  assert.deepEqual(NATIVE_IOS_SHELL_API_ROUTE_SPECS.map((route) => route.id), [
    "native-ios-shell-version-policy",
  ]);
  const routes = createRoutes({ env: {} });
  assert.equal(routes.match({ method: "GET", path: IOS_SHELL_VERSION_POLICY_PATH }).id, "native-ios-shell-version-policy");
  assert.equal(routes.match({ method: "POST", path: IOS_SHELL_VERSION_POLICY_PATH }), null);
}

Promise.resolve()
  .then(testCurrentBuildResponseIsPublicSafe)
  .then(testOldBuildResponseRequiresUpdate)
  .then(testMalformedBuildReturnsBoundedError)
  .then(testRouteSpecs)
  .then(() => {
    console.log("native ios shell api routes tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
