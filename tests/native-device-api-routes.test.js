"use strict";

const assert = require("node:assert/strict");
const { createNativeDeviceApiRoutes } = require("../server-routes/native-device-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    body: "",
    writeHead(status) {
      this.statusCode = status;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = { registered: [], unregistered: [], sent: [], workspaceAccess: [] };
  const nativeNotificationService = Object.assign({
    channel: "native_ios_apns",
    registerDevice(input) {
      calls.registered.push(input);
      return { ok: true, status: 201, device: { id: "ndev_1", workspaceId: input.workspaceId, tokenHash: "hash-token", enabled: true } };
    },
    unregisterDevice(input) {
      calls.unregistered.push(input);
      return { ok: true, status: 200, device: { id: "ndev_1", workspaceId: input.workspaceId, enabled: false } };
    },
    async sendToWorkspace(input) {
      calls.sent.push(input);
      return { ok: true, channel: "native_ios_apns", attempted: 1, sent: 1, failed: 0 };
    },
  }, overrides.nativeNotificationService || {});
  const deps = Object.assign({
    appRouteUrl(params = {}) {
      const query = new URLSearchParams(params);
      return `/?${query.toString()}`;
    },
    nativeNotificationService,
    authenticateRequest(req) {
      return req.auth || { ok: true, workspaceId: "owner", role: "owner" };
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        deps.sendJson(res, 403, { ok: false, error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson(res, status, body) {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    },
    workspacePrincipal(workspaceId) {
      return workspaceId === "owner" ? "owner" : `${workspaceId}-principal`;
    },
  }, overrides.deps || {});
  return { calls, routes: createNativeDeviceApiRoutes(deps) };
}

async function testRegisterUsesWorkspaceAccessAndReturnsPublicDevice() {
  const { calls, routes } = makeRoutes();
  const req = {
    method: "POST",
    body: {
      platform: "ios",
      pushProvider: "apns",
      deviceToken: "raw-secret-token",
      workspaceId: "owner",
      appBundleId: "com.xuxin.homeai.native",
      appVersion: "1.0.3",
      buildNumber: "103",
      environment: "sandbox",
      source: "home_ai_native",
    },
  };
  const res = makeResponse();
  await routes.handle(req, res, makeUrl("/api/native/devices/register"));
  assert.equal(res.statusCode, 201);
  assert.equal(calls.workspaceAccess[0], "owner");
  assert.equal(calls.registered[0].principalId, "owner");
  assert.equal(calls.registered[0].platform, "ios");
  assert.equal(calls.registered[0].pushProvider, "apns");
  assert.equal(calls.registered[0].appBundleId, "com.xuxin.homeai.native");
  assert.equal(calls.registered[0].appVersion, "1.0.3");
  assert.equal(calls.registered[0].buildNumber, "103");
  assert.equal(calls.registered[0].environment, "sandbox");
  assert.equal(calls.registered[0].source, "home_ai_native");
  const body = parseBody(res);
  assert.equal(body.ok, true);
  assert.equal(body.channel, "native_ios_apns");
  assert.equal(body.device.tokenHash, "hash-token");
  assert.equal(body.device.deviceToken, undefined);
  assert.doesNotMatch(res.body, /raw-secret-token/);
}

async function testRegisterDefaultsToAuthenticatedWorkspaceWhenWorkspaceIdMissing() {
  const { calls, routes } = makeRoutes();
  const req = {
    method: "POST",
    auth: { ok: true, workspaceId: "weixin_l", role: "workspace" },
    body: {
      platform: "ios",
      pushProvider: "apns",
      deviceToken: "raw-secret-token",
      appBundleId: "com.xuxin.homeai.native",
      appVersion: "1.0.3",
      buildNumber: "103",
      environment: "sandbox",
      source: "home_ai_native",
    },
  };
  const res = makeResponse();
  await routes.handle(req, res, makeUrl("/api/native/devices/register"));
  assert.equal(res.statusCode, 201);
  assert.equal(calls.workspaceAccess[0], "weixin_l");
  assert.equal(calls.registered[0].workspaceId, "weixin_l");
  assert.equal(calls.registered[0].principalId, "weixin_l-principal");
  assert.doesNotMatch(res.body, /raw-secret-token/);
}

async function testRegisterRejectsWorkspaceSpoof() {
  const { calls, routes } = makeRoutes();
  const req = { method: "POST", body: { workspaceId: "blocked", deviceToken: "raw-secret-token" } };
  const res = makeResponse();
  await routes.handle(req, res, makeUrl("/api/native/devices/register"));
  assert.equal(res.statusCode, 403);
  assert.equal(calls.registered.length, 0);
  assert.doesNotMatch(res.body, /raw-secret-token/);
}

async function testUnregisterAndTestNotification() {
  const { calls, routes } = makeRoutes();
  const unregisterRes = makeResponse();
  await routes.handle({ method: "POST", body: { workspaceId: "owner", deviceToken: "raw-secret-token" } }, unregisterRes, makeUrl("/api/native/devices/unregister"));
  assert.equal(unregisterRes.statusCode, 200);
  assert.equal(calls.unregistered[0].workspaceId, "owner");
  assert.doesNotMatch(unregisterRes.body, /raw-secret-token/);

  const testRes = makeResponse();
  await routes.handle({ method: "POST", body: { workspaceId: "owner", body: "hello" } }, testRes, makeUrl("/api/native/devices/test-notification"));
  assert.equal(testRes.statusCode, 200);
  assert.equal(calls.sent[0].workspaceId, "owner");
  assert.match(calls.sent[0].deepLink, /nativeShell=ios/);
}

Promise.resolve()
  .then(testRegisterUsesWorkspaceAccessAndReturnsPublicDevice)
  .then(testRegisterDefaultsToAuthenticatedWorkspaceWhenWorkspaceIdMissing)
  .then(testRegisterRejectsWorkspaceSpoof)
  .then(testUnregisterAndTestNotification)
  .then(() => {
    console.log("native device api routes tests passed");
  });
