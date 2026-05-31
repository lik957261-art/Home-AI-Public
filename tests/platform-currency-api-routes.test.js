"use strict";

const assert = require("node:assert/strict");
const {
  PLATFORM_CURRENCY_API_ROUTE_SPECS,
  createPlatformCurrencyApiRoutes,
} = require("../server-routes/platform-currency-api-routes");

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

function makeUrl(pathname) {
  return new URL(pathname, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = { workspaceAccess: [] };
  const service = overrides.platformCurrencyService || {
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
    listLedger(input) {
      return [{ entryId: "entry-1", workspaceId: input.workspaceId, amountDelta: 0 }];
    },
  };
  const routes = createPlatformCurrencyApiRoutes(Object.assign({
    platformCurrencyService: service,
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return workspaceId;
    },
    sendJson,
  }, overrides));
  return { calls, routes, service };
}

async function request(routes, method, path) {
  const res = makeResponse();
  const result = await routes.handle({ method, headers: {} }, res, makeUrl(path), { auth: { ok: true } });
  return { result, res, body: res.body ? parseBody(res) : null };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(PLATFORM_CURRENCY_API_ROUTE_SPECS.map((route) => route.id), [
    "platform-currency-wallet",
    "platform-currency-ledger",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/platform-currency/wallet" }).id, "platform-currency-wallet");
  assert.equal(routes.match({ method: "GET", path: "/api/platform-currency/ledger" }).id, "platform-currency-ledger");
  assert.equal(routes.match({ method: "POST", path: "/api/platform-currency/wallet" }), null);
  assert.equal(routes.summary().total, 2);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testWalletAndLedgerAreWorkspaceScoped() {
  const { routes, calls } = makeRoutes();
  const wallet = await request(routes, "GET", "/api/platform-currency/wallet?workspaceId=weixin_test_1");
  assert.equal(wallet.res.statusCode, 200);
  assert.equal(wallet.body.ok, true);
  assert.equal(wallet.body.wallet.workspaceId, "weixin_test_1");
  assert.equal(wallet.body.wallet.currency, "TONGBAO");
  assert.equal(wallet.body.wallet.availableBalance, 0);

  const ledger = await request(routes, "GET", "/api/platform-currency/ledger?workspaceId=weixin_test_1&limit=10");
  assert.equal(ledger.res.statusCode, 200);
  assert.equal(ledger.body.workspaceId, "weixin_test_1");
  assert.equal(ledger.body.ledger[0].workspaceId, "weixin_test_1");
  assert.deepEqual(calls.workspaceAccess, ["weixin_test_1", "weixin_test_1"]);
}

async function testAccessDeniedDoesNotReturnWallet() {
  const { routes } = makeRoutes();
  const denied = await request(routes, "GET", "/api/platform-currency/wallet?workspaceId=blocked");
  assert.equal(denied.res.statusCode, 403);
  assert.equal(denied.body.error, "Workspace access is not allowed");
}

(async () => {
  await testMetadataAndFallthrough();
  await testWalletAndLedgerAreWorkspaceScoped();
  await testAccessDeniedDoesNotReturnWallet();
  console.log("platform currency api route tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
