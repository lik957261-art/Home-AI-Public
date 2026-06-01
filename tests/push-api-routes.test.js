"use strict";

const assert = require("node:assert/strict");
const { createPushApiRoutes } = require("../server-routes/push-api-routes");

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

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    receipts: [],
    removed: [],
    saved: [],
    sent: [],
    workspaceAccess: [],
    auth: [],
  };
  const state = {
    pushReceipts: [
      { id: "receipt-1" },
      { id: "receipt-2", payload: { data: { endpoint: "https://push.example.invalid/receipt" } } },
      { id: "receipt-3" },
    ],
    pushDeliveries: [
      { id: "delivery-1" },
      { id: "delivery-2", subscription: { endpoint: "https://push.example.invalid/delivery" } },
      { id: "delivery-3" },
    ],
  };
  const deps = Object.assign({
    authenticateRequest(req) {
      calls.auth.push(req.headers || {});
      return req.headers?.["x-role"] === "owner"
        ? { ok: true, role: "owner", workspaceId: "owner", isOwner: true }
        : { ok: true, role: "user", workspaceId: "child" };
    },
    appRouteUrl(params = {}) {
      return `/?view=${params.view}&workspaceId=${params.workspaceId}`;
    },
    nowIso() {
      return "2026-05-14T13:00:00.000Z";
    },
    publicPushStatus() {
      return { enabled: true, publicKey: "public-key", subject: "mailto:admin@example.invalid", subscriptionCount: 1 };
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    recordPushReceipt(body) {
      calls.receipts.push(body);
      return { id: "receipt-new", title: body.payload?.title || "", endpoint: body.payload?.data?.endpoint || "" };
    },
    removePushSubscription(value) {
      calls.removed.push(value);
      return true;
    },
    requireOwner(req, res) {
      if (req.headers?.["x-role"] !== "owner") {
        deps.sendJson(res, 403, { error: "Owner access is required" });
        return null;
      }
      return { ok: true, role: "owner", workspaceId: "owner" };
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        deps.sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    savePushSubscription(subscription, meta) {
      calls.saved.push({ subscription, meta });
      return {
        id: "push_1",
        endpoint: subscription.endpoint,
        endpointHash: "hash_1",
        subscription,
        principalIds: [meta.principalId],
        workspaceIds: [meta.workspaceId],
      };
    },
    sendJson(res, status, data) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
    sendPushNotification(payload, options) {
      calls.sent.push({ payload, options });
      return Promise.resolve({ enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
    },
    state,
    pushWorkspaceForAuth(auth, workspaceId) {
      return auth.role === "owner" ? workspaceId : auth.workspaceId;
    },
    workspacePrincipal(workspaceId) {
      return workspaceId === "owner" ? "owner" : `principal_${workspaceId}`;
    },
  }, overrides);
  return { routes: createPushApiRoutes(deps), calls, state };
}

async function testRouteMetadataAndFallthrough() {
  const { routes } = makeRoutes();
  const publicRoutes = routes.list({ public: true });

  assert.equal(publicRoutes.length, 7);
  assert.equal(routes.match({ method: "GET", path: "/api/push/vapid-public-key" }).id, "push-vapid-public-key");
  assert.equal(routes.match({ method: "POST", path: "/api/push/subscribe" }).workspaceScoped, true);
  assert.equal(routes.match({ method: "GET", path: "/api/push/receipts" }).authMode, "owner");
  assert.equal(Object.hasOwn(publicRoutes[0], "path"), false);

  const res = makeResponse();
  const result = await routes.handle({ method: "GET", url: "/api/status", headers: {} }, res, makeUrl("/api/status"));
  assert.equal(result.handled, false);
  assert.equal(res.statusCode, 0);
}

async function testPublicStatusAndReceipt() {
  const { routes, calls } = makeRoutes();

  const statusRes = makeResponse();
  await routes.handle({ method: "GET", url: "/api/push/vapid-public-key", headers: {} }, statusRes, makeUrl("/api/push/vapid-public-key"));
  assert.equal(statusRes.statusCode, 200);
  assert.deepEqual(parseBody(statusRes), {
    enabled: true,
    publicKey: "public-key",
    subject: "mailto:admin@example.invalid",
    subscriptionCount: 1,
  });

  const receiptRes = makeResponse();
  const receiptBody = { payload: { title: "Task done", data: { endpoint: "https://push.example.invalid/token" } } };
  await routes.handle({ method: "POST", url: "/api/push/receipt", headers: {}, body: receiptBody }, receiptRes, makeUrl("/api/push/receipt"));
  assert.equal(receiptRes.statusCode, 201);
  assert.deepEqual(calls.receipts, [receiptBody]);
  assert.deepEqual(parseBody(receiptRes), { ok: true, receipt: { id: "receipt-new", title: "Task done" } });
  assert.equal(receiptRes.body.includes("https://push.example.invalid/token"), false);
}

async function testOwnerReceiptAndDeliveryLists() {
  const { routes } = makeRoutes();

  const denied = makeResponse();
  await routes.handle({ method: "GET", url: "/api/push/receipts", headers: {} }, denied, makeUrl("/api/push/receipts"));
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(parseBody(denied), { error: "Owner access is required" });

  const receipts = makeResponse();
  await routes.handle({ method: "GET", url: "/api/push/receipts?limit=2", headers: { "x-role": "owner" } }, receipts, makeUrl("/api/push/receipts?limit=2"));
  assert.equal(receipts.statusCode, 200);
  assert.deepEqual(parseBody(receipts).data.map((item) => item.id), ["receipt-3", "receipt-2"]);
  assert.equal(receipts.body.includes("https://push.example.invalid/receipt"), false);

  const deliveries = makeResponse();
  await routes.handle({ method: "GET", url: "/api/push/deliveries?limit=9999", headers: { "x-role": "owner" } }, deliveries, makeUrl("/api/push/deliveries?limit=9999"));
  assert.equal(deliveries.statusCode, 200);
  assert.deepEqual(parseBody(deliveries).data.map((item) => item.id), ["delivery-3", "delivery-2", "delivery-1"]);
  assert.equal(deliveries.body.includes("https://push.example.invalid/delivery"), false);
}

async function testSubscribeRequiresConfiguredPushAndWorkspaceAccess() {
  const disabled = makeRoutes({
    publicPushStatus() {
      return { enabled: false, publicKey: "", subject: "", subscriptionCount: 0 };
    },
  });
  const disabledRes = makeResponse();
  await disabled.routes.handle({ method: "POST", url: "/api/push/subscribe", headers: {}, body: {} }, disabledRes, makeUrl("/api/push/subscribe"));
  assert.equal(disabledRes.statusCode, 503);
  assert.deepEqual(parseBody(disabledRes), {
    error: "Web Push is not configured",
    push: { enabled: false, publicKey: "", subject: "", subscriptionCount: 0 },
  });

  const { routes, calls } = makeRoutes();
  const blocked = makeResponse();
  await routes.handle({
    method: "POST",
    url: "/api/push/subscribe",
    headers: {},
    body: { workspaceId: "blocked", subscription: { endpoint: "https://push.example.invalid/blocked" } },
  }, blocked, makeUrl("/api/push/subscribe"));
  assert.equal(blocked.statusCode, 403);
  assert.equal(calls.saved.length, 0);

  const ok = makeResponse();
  await routes.handle({
    method: "POST",
    url: "/api/push/subscribe",
    headers: { "user-agent": "UnitTest/1", origin: "https://nas.example.test/hermes" },
    body: {
      workspaceId: "owner",
      deviceLabel: "phone",
      clientContext: { displayMode: "standalone", standalone: true, clientVersion: "client-test", platform: "iPhone", origin: "https://client.example.test" },
      subscription: { endpoint: "https://push.example.invalid/secret-token", keys: { p256dh: "p", auth: "a" } },
    },
  }, ok, makeUrl("/api/push/subscribe"));
  assert.equal(ok.statusCode, 201);
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.saved[0].meta.userAgent, "UnitTest/1");
  assert.deepEqual(calls.saved[0].meta.clientContext, {
    displayMode: "standalone",
    standalone: true,
    clientVersion: "client-test",
    platform: "iPhone",
    userAgent: "UnitTest/1",
    origin: "https://nas.example.test",
    host: "",
    path: "",
  });
  assert.equal(calls.saved[0].meta.workspaceId, "child");
  assert.equal(calls.saved[0].meta.principalId, "principal_child");

  const response = parseBody(ok);
  assert.deepEqual(response.subscription, {
    id: "push_1",
    endpointHash: "hash_1",
    principalIds: ["principal_child"],
    workspaceIds: ["child"],
  });
  assert.equal(JSON.stringify(response).includes("https://push.example.invalid/secret-token"), false);
}

async function testUnsubscribeUsesEndpointButDoesNotEchoIt() {
  const { routes, calls } = makeRoutes();
  const res = makeResponse();
  await routes.handle({
    method: "POST",
    url: "/api/push/unsubscribe",
    headers: {},
    body: { subscription: { endpoint: "https://push.example.invalid/remove-me" } },
  }, res, makeUrl("/api/push/unsubscribe"));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.removed, ["https://push.example.invalid/remove-me"]);
  assert.equal(JSON.stringify(parseBody(res)).includes("https://push.example.invalid/remove-me"), false);
  assert.equal(parseBody(res).removed, true);
}

async function testPushTestUsesScopedPrincipalAndPayload() {
  const { routes, calls } = makeRoutes();
  const res = makeResponse();
  await routes.handle({
    method: "POST",
    url: "/api/push/test",
    headers: { "x-role": "owner" },
    body: { workspace_id: "child" },
  }, res, makeUrl("/api/push/test"));

  assert.equal(res.statusCode, 200);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].options.urgency, "high");
  assert.equal(calls.sent[0].options.ttl, 300);
  assert.deepEqual(calls.sent[0].options.principalIds, ["principal_child"]);
  assert.equal(calls.sent[0].payload.title, "\u901a\u77e5\u6d4b\u8bd5");
  assert.equal(calls.sent[0].payload.data.workspaceId, "child");
  assert.equal(calls.sent[0].payload.data.principalId, "principal_child");
  assert.equal(calls.sent[0].payload.data.sentAt, "2026-05-14T13:00:00.000Z");
  assert.match(calls.sent[0].payload.data.testId, /^test_/);

  const body = parseBody(res);
  assert.equal(body.ok, true);
  assert.equal(body.target.workspaceId, "child");
  assert.equal(body.target.principalId, "principal_child");
  assert.equal(body.target.sentAt, "2026-05-14T13:00:00.000Z");
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testPublicStatusAndReceipt();
  await testOwnerReceiptAndDeliveryLists();
  await testSubscribeRequiresConfiguredPushAndWorkspaceAccess();
  await testUnsubscribeUsesEndpointButDoesNotEchoIt();
  await testPushTestUsesScopedPrincipalAndPayload();
  console.log("push api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
