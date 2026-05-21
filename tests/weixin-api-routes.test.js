"use strict";

const assert = require("node:assert/strict");
const { createWeixinApiRoutes } = require("../server-routes/weixin-api-routes");

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

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function makeRoutes(overrides = {}) {
  const calls = {
    ingressGuard: [],
    events: [],
    pendingFilters: [],
    normalizeAck: [],
    ack: [],
    access: [],
    targets: [],
    forwardFile: [],
    readLimits: [],
  };

  const deps = Object.assign({
    requireWeixinIngress(req, res) {
      calls.ingressGuard.push(req.headers || {});
      if (req.headers?.["x-ingress"] === "ok") return { ok: true, source: "sidecar" };
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return null;
    },
    readBody(req, limit) {
      calls.readLimits.push(limit || 0);
      return Promise.resolve(req.body || {});
    },
    sendJson,
    startWeixinIngressEvent(body) {
      calls.events.push(body);
      return Promise.resolve({
        ok: true,
        eventId: body.eventId || "event-1",
        duplicate: Boolean(body.duplicate),
      });
    },
    pendingWeixinOutboundDeliveries(filters) {
      calls.pendingFilters.push(filters);
      return [{ deliveryId: "delivery-1", status: filters.status, accountId: filters.accountId }];
    },
    ackWeixinOutboundDelivery(deliveryId, ack) {
      calls.ack.push({ deliveryId, ack });
      if (deliveryId === "missing") return null;
      return { deliveryId, status: ack.status };
    },
    weixinIngressProvider: {
      normalizeAck(body) {
        calls.normalizeAck.push(body);
        return {
          status: body.status || "sent",
          acknowledgedAt: body.acknowledgedAt || "2026-05-14T13:00:00.000Z",
        };
      },
    },
    authCanAccessWorkspace(auth, workspaceId) {
      calls.access.push({ auth, workspaceId });
      if (!auth?.ok) return false;
      return auth.workspaceId === "owner" || workspaceId === auth.workspaceId || workspaceId === "shared";
    },
    weixinForwardTargetsForWorkspace(workspaceId, auth) {
      calls.targets.push({ workspaceId, auth });
      return [{ accountId: "wx-alpha", chatId: "chat-1", userId: "user-1", workspaceId }];
    },
    createWeixinFileForwardDelivery(auth, body) {
      calls.forwardFile.push({ auth, body });
      return Promise.resolve({
        ok: true,
        delivery: { deliveryId: "file-delivery-1" },
        workspaceId: body.workspaceId || auth.workspaceId,
      });
    },
  }, overrides);

  return { routes: createWeixinApiRoutes(deps), calls, deps };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const req = {
    method,
    url: path,
    headers: options.headers || {},
    body: options.body,
  };
  const result = await routes.handle(req, res, makeUrl(path), { auth: options.auth });
  return { result, res, body: parseJson(res) };
}

async function testRouteMetadataAndFallthrough() {
  const { routes } = makeRoutes();
  const publicRoutes = routes.list({ public: true });

  assert.deepEqual(routes.list().map((route) => route.id), [
    "weixin-ingress-events",
    "weixin-outbound-list",
    "weixin-outbound-ack",
    "weixin-forward-targets",
    "weixin-forward-file",
  ]);
  assert.equal(publicRoutes.length, 5);
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);
  assert.equal(routes.match({ method: "POST", path: "/api/ingress/weixin/events" }).authMode, "ingress");
  assert.equal(routes.match({ method: "GET", path: "/api/ingress/weixin/outbound" }).id, "weixin-outbound-list");
  assert.equal(routes.match({ method: "POST", path: "/api/ingress/weixin/outbound/delivery-1/ack" }).id, "weixin-outbound-ack");
  assert.equal(routes.match({ method: "GET", path: "/api/weixin/forward-targets" }).workspaceScoped, true);
  assert.equal(routes.match({ method: "GET", path: "/api/ingress/weixin/events" }), null);
  assert.deepEqual(routes.summary().byAuthMode, { ingress: 3, "access-key": 2 });

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testIngressGuardBlocksBeforeBodyRead() {
  let readCount = 0;
  const { routes, calls } = makeRoutes({
    readBody() {
      readCount += 1;
      return Promise.resolve({});
    },
  });

  const denied = await request(routes, "POST", "/api/ingress/weixin/events", { body: { eventId: "e1" } });
  assert.equal(denied.result.handled, true);
  assert.equal(denied.res.statusCode, 401);
  assert.deepEqual(denied.body, { ok: false, error: "Unauthorized" });
  assert.equal(readCount, 0);
  assert.deepEqual(calls.events, []);
}

async function testIngressBodyErrors() {
  const { routes } = makeRoutes({
    readBody() {
      return Promise.reject(new Error("bad json"));
    },
  });

  const event = await request(routes, "POST", "/api/ingress/weixin/events", {
    headers: { "x-ingress": "ok" },
  });
  assert.equal(event.res.statusCode, 400);
  assert.deepEqual(event.body, { error: "bad json", ok: false });

  const ack = await request(routes, "POST", "/api/ingress/weixin/outbound/delivery-1/ack", {
    headers: { "x-ingress": "ok" },
  });
  assert.equal(ack.res.statusCode, 400);
  assert.deepEqual(ack.body, { error: "bad json", ok: false });
}

async function testIngressEventAcceptedDuplicateAndError() {
  const { routes, calls } = makeRoutes();

  const accepted = await request(routes, "POST", "/api/ingress/weixin/events", {
    headers: { "x-ingress": "ok" },
    body: { eventId: "event-accepted" },
  });
  assert.equal(accepted.res.statusCode, 202);
  assert.deepEqual(accepted.body, { ok: true, eventId: "event-accepted", duplicate: false });
  assert.deepEqual(calls.events, [{ eventId: "event-accepted" }]);

  const duplicate = await request(routes, "POST", "/api/ingress/weixin/events", {
    headers: { "x-ingress": "ok" },
    body: { eventId: "event-duplicate", duplicate: true },
  });
  assert.equal(duplicate.res.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);

  const eventError = new Error("workspace route not found");
  eventError.status = 409;
  eventError.result = { code: "weixin_route_unmatched", workspaceId: "" };
  const failing = makeRoutes({
    startWeixinIngressEvent() {
      throw eventError;
    },
  }).routes;
  const failed = await request(failing, "POST", "/api/ingress/weixin/events", {
    headers: { "x-ingress": "ok" },
    body: { eventId: "event-failed" },
  });
  assert.equal(failed.res.statusCode, 409);
  assert.deepEqual(failed.body, {
    ok: false,
    error: "workspace route not found",
    code: "weixin_route_unmatched",
    workspaceId: "",
  });
}

async function testOutboundFilters() {
  const { routes, calls } = makeRoutes();

  const response = await request(routes, "GET", "/api/ingress/weixin/outbound?status=failed&account_id=wx-1&limit=3", {
    headers: { "x-ingress": "ok" },
  });
  assert.equal(response.res.statusCode, 200);
  assert.deepEqual(calls.pendingFilters, [{ status: "failed", accountId: "wx-1", limit: "3" }]);
  assert.deepEqual(response.body, {
    ok: true,
    data: [{ deliveryId: "delivery-1", status: "failed", accountId: "wx-1" }],
  });

  const camelCase = await request(routes, "GET", "/api/ingress/weixin/outbound?accountId=wx-2", {
    headers: { "x-ingress": "ok" },
  });
  assert.equal(camelCase.res.statusCode, 200);
  assert.deepEqual(calls.pendingFilters[1], { status: "pending", accountId: "wx-2", limit: "" });
}

async function testAckDecodeNotFoundAndError() {
  const { routes, calls } = makeRoutes();

  const decoded = await request(routes, "POST", "/api/ingress/weixin/outbound/delivery%2Fencoded/ack", {
    headers: { "x-ingress": "ok" },
    body: { status: "sent" },
  });
  assert.equal(decoded.res.statusCode, 200);
  assert.deepEqual(calls.normalizeAck, [{ status: "sent" }]);
  assert.deepEqual(calls.ack, [{
    deliveryId: "delivery/encoded",
    ack: { status: "sent", acknowledgedAt: "2026-05-14T13:00:00.000Z" },
  }]);
  assert.deepEqual(decoded.body, { ok: true, delivery: { deliveryId: "delivery/encoded", status: "sent" } });

  const missing = await request(routes, "POST", "/api/ingress/weixin/outbound/missing/ack", {
    headers: { "x-ingress": "ok" },
    body: { status: "sent" },
  });
  assert.equal(missing.res.statusCode, 404);
  assert.deepEqual(missing.body, { ok: false, error: "Delivery not found" });

  const normalizeError = new Error("invalid ack status");
  normalizeError.status = 400;
  const failing = makeRoutes({
    weixinIngressProvider: {
      normalizeAck() {
        throw normalizeError;
      },
    },
  }).routes;
  const failed = await request(failing, "POST", "/api/ingress/weixin/outbound/delivery-1/ack", {
    headers: { "x-ingress": "ok" },
    body: { status: "unknown" },
  });
  assert.equal(failed.res.statusCode, 400);
  assert.deepEqual(failed.body, { ok: false, error: "invalid ack status" });
}

async function testForwardWorkspaceAccess() {
  const { routes, calls } = makeRoutes();

  const unauthenticated = await request(routes, "GET", "/api/weixin/forward-targets");
  assert.equal(unauthenticated.res.statusCode, 401);
  assert.deepEqual(unauthenticated.body, { error: "Unauthorized" });

  const blocked = await request(routes, "GET", "/api/weixin/forward-targets?workspaceId=blocked", {
    auth: { ok: true, workspaceId: "child", principalId: "child-user" },
  });
  assert.equal(blocked.res.statusCode, 403);
  assert.deepEqual(blocked.body, { error: "Workspace access is not allowed" });
  assert.equal(calls.targets.length, 0);

  const allowed = await request(routes, "GET", "/api/weixin/forward-targets?workspace_id=shared", {
    auth: { ok: true, workspaceId: "child", principalId: "child-user" },
  });
  assert.equal(allowed.res.statusCode, 200);
  assert.deepEqual(calls.access.map((item) => item.workspaceId), ["blocked", "shared"]);
  assert.deepEqual(calls.targets.map((item) => item.workspaceId), ["shared"]);
  assert.deepEqual(allowed.body, {
    ok: true,
    data: [{ accountId: "wx-alpha", chatId: "chat-1", userId: "user-1", workspaceId: "shared" }],
  });
}

async function testForwardFileSuccessAndErrors() {
  const { routes, calls } = makeRoutes();
  const auth = { ok: true, workspaceId: "child", principalId: "child-user" };

  const success = await request(routes, "POST", "/api/weixin/forward-file", {
    auth,
    body: { workspaceId: "child", filePath: "workspace/file.pdf" },
  });
  assert.equal(success.res.statusCode, 202);
  assert.deepEqual(calls.forwardFile, [{ auth, body: { workspaceId: "child", filePath: "workspace/file.pdf" } }]);
  assert.equal(calls.readLimits.at(-1), 3 * 1024 * 1024);
  assert.deepEqual(success.body, {
    ok: true,
    delivery: { deliveryId: "file-delivery-1" },
    workspaceId: "child",
  });

  const invalid = makeRoutes({
    readBody() {
      return Promise.reject(new Error("body too large"));
    },
  }).routes;
  const bodyError = await request(invalid, "POST", "/api/weixin/forward-file", { auth });
  assert.equal(bodyError.res.statusCode, 400);
  assert.deepEqual(bodyError.body, { error: "body too large" });

  const forwardError = new Error("No Weixin forwarding target is configured for this workspace");
  forwardError.status = 409;
  forwardError.code = "weixin_forward_target_unavailable";
  const failing = makeRoutes({
    createWeixinFileForwardDelivery() {
      throw forwardError;
    },
  }).routes;
  const failed = await request(failing, "POST", "/api/weixin/forward-file", {
    auth,
    body: { workspaceId: "child", filePath: "workspace/file.pdf" },
  });
  assert.equal(failed.res.statusCode, 409);
  assert.deepEqual(failed.body, {
    ok: false,
    error: "No Weixin forwarding target is configured for this workspace",
    code: "weixin_forward_target_unavailable",
  });
}

function testDependencyValidation() {
  assert.throws(
    () => createWeixinApiRoutes({}),
    /weixin api routes require requireWeixinIngress/,
  );
  assert.throws(
    () => createWeixinApiRoutes(Object.assign(makeRoutes().deps, { weixinIngressProvider: {} })),
    /weixin api routes require weixinIngressProvider\.normalizeAck/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testIngressGuardBlocksBeforeBodyRead();
  await testIngressBodyErrors();
  await testIngressEventAcceptedDuplicateAndError();
  await testOutboundFilters();
  await testAckDecodeNotFoundAndError();
  await testForwardWorkspaceAccess();
  await testForwardFileSuccessAndErrors();
  testDependencyValidation();
  console.log("weixin api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
