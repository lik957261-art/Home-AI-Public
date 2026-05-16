"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_COIN_API_ROUTE_SPECS,
  createLearningCoinApiRoutes,
} = require("../server-routes/learning-coin-api-routes");

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
  try {
    return JSON.parse(res.body || "{}");
  } catch (_) {
    return null;
  }
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeLearningCoinService() {
  const state = {
    rewards: [
      { id: "snack", title: "Snack", description: "", coinCost: 40, rmbCents: 500, active: true },
    ],
    redemptions: [],
    ledger: [],
  };
  return {
    state,
    summary(input) {
      return {
        studentId: input.studentId,
        workspaceId: input.workspaceId,
        settlement: { currency: "CNY", rulesStatus: "unset", coinsPerCny: null },
        balances: { availableCoins: 100, heldCoins: 0, totalCoins: 100, earnedCoins: 100, spentCoins: 0 },
        rewards: this.listRewards({}),
        redemptions: state.redemptions,
        ledger: state.ledger,
      };
    },
    listLedger(input) {
      state.lastLedgerInput = input;
      return state.ledger;
    },
    listRewards() {
      return state.rewards;
    },
    grantCoins(input) {
      state.lastGrant = input;
      const entry = { id: "grant-1", coinDelta: input.coinAmount, studentId: input.studentId, workspaceId: input.workspaceId };
      state.ledger.push(entry);
      return { entry, duplicate: false, balances: { availableCoins: input.coinAmount } };
    },
    adjustCoins(input) {
      state.lastAdjust = input;
      const entry = { id: "adjust-1", coinDelta: input.coinDelta, studentId: input.studentId, workspaceId: input.workspaceId };
      return { entry, duplicate: false, balances: { availableCoins: input.coinDelta } };
    },
    upsertReward(input) {
      const reward = { id: input.id || "reward-new", title: input.title, coinCost: input.coinCost, rmbCents: input.rmbCents ?? null, active: input.active !== false };
      state.rewards.push(reward);
      return reward;
    },
    requestRedemption(input) {
      state.lastRedemptionRequest = input;
      const redemption = {
        id: "redeem-1",
        studentId: input.studentId,
        workspaceId: input.workspaceId,
        rewardId: input.rewardId,
        rewardTitle: "Snack",
        coinCost: 40,
        rmbCents: 500,
        status: "requested",
      };
      state.redemptions.push(redemption);
      return { redemption, duplicate: false, balances: { availableCoins: 60, heldCoins: 40 } };
    },
    getRedemption(id, scope = {}) {
      const redemption = state.redemptions.find((item) => item.id === id) || null;
      if (!redemption) return null;
      if (scope.workspaceId && redemption.workspaceId !== scope.workspaceId) return null;
      if (scope.studentId && redemption.studentId !== scope.studentId) return null;
      return redemption;
    },
    transitionRedemption(id, action, input) {
      state.lastTransition = { id, action, input };
      const redemption = state.redemptions.find((item) => item.id === id) || { id, studentId: "child", workspaceId: "child", status: "requested" };
      redemption.status = action === "cancel" ? "cancelled" : action === "reject" ? "rejected" : action === "settle" ? "settled" : "approved";
      return { redemption, duplicate: false, balances: { availableCoins: 60 } };
    },
  };
}

function makeRoutes(overrides = {}) {
  const calls = {
    owner: [],
    workspaceAccess: [],
  };
  const service = overrides.learningCoinService || makeLearningCoinService();
  const deps = Object.assign({
    learningCoinService: service,
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner);
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireOwner(req, res) {
      calls.owner.push(req.owner === true);
      if (req.owner === true) return { principalId: "owner", isOwner: true, workspaceId: "owner" };
      sendJson(res, 403, { error: "Owner access is required" });
      return null;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    sendJson,
  }, overrides);
  return { routes: createLearningCoinApiRoutes(deps), calls, service };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, headers: {}, body: options.body || {}, owner: options.owner },
    res,
    makeUrl(path),
    { auth: options.auth || { ok: true, workspaceId: "owner", principalId: "principal-owner", isOwner: true } },
  );
  return { result, res, body: parseBody(res) };
}

async function testMetadataAndFallthrough() {
  assert.deepEqual(LEARNING_COIN_API_ROUTE_SPECS.map((route) => route.id), [
    "learning-coins-summary",
    "learning-coins-ledger",
    "learning-coins-rewards",
    "learning-coins-grant",
    "learning-coins-reward-upsert",
    "learning-coins-redemption-request",
    "learning-coins-redemption-cancel",
    "learning-coins-redemption-owner-action",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/learning-coins/summary" }).id, "learning-coins-summary");
  assert.equal(routes.match({ method: "POST", path: "/api/learning-coins/redemptions/redeem-1/approve" }).id, "learning-coins-redemption-owner-action");
  assert.equal(routes.match({ method: "POST", path: "/api/learning-coins/redemptions/redeem-1/cancel" }).id, "learning-coins-redemption-cancel");
  assert.equal(routes.match({ method: "POST", path: "/api/learning-coins/redemptions/redeem-1/run" }), null);
  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 8);
  assert.equal(summary.byAuthMode.owner, 3);
  assert.equal(summary.byAuthMode["access-key"], 5);
  assert.equal(JSON.stringify(summary).includes("/api/learning-coins"), false);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testSummaryAndLedgerAreWorkspaceScoped() {
  const { routes, calls, service } = makeRoutes();
  const summary = await request(routes, "GET", "/api/learning-coins/summary?workspaceId=child&studentId=child&limit=5", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(summary.res.statusCode, 200);
  assert.equal(summary.body.studentId, "child");
  assert.equal(summary.body.workspaceId, "child");
  assert.deepEqual(calls.workspaceAccess, ["child"]);

  const denied = await request(routes, "GET", "/api/learning-coins/ledger?workspaceId=child&studentId=other", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(denied.res.statusCode, 403);
  assert.equal(service.state.lastLedgerInput, undefined);
}

async function testOwnerGrantRewardAndRedemption() {
  const { routes, service } = makeRoutes();
  const grant = await request(routes, "POST", "/api/learning-coins/grants", {
    owner: true,
    body: { workspaceId: "child", studentId: "child", coinAmount: 25, reason: "done" },
  });
  assert.equal(grant.res.statusCode, 201);
  assert.equal(service.state.lastGrant.createdByPrincipalId, "owner");

  const reward = await request(routes, "POST", "/api/learning-coins/rewards", {
    owner: true,
    body: { id: "movie", title: "Movie", coinCost: 100, rmbCents: 3000 },
  });
  assert.equal(reward.res.statusCode, 201);
  assert.equal(reward.body.reward.id, "movie");

  const redeem = await request(routes, "POST", "/api/learning-coins/redemptions", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
    body: { workspaceId: "child", studentId: "child", rewardId: "snack" },
  });
  assert.equal(redeem.res.statusCode, 201);
  assert.equal(service.state.lastRedemptionRequest.requestedByPrincipalId, "principal-child");

  const approve = await request(routes, "POST", "/api/learning-coins/redemptions/redeem-1/approve", {
    owner: true,
    auth: { ok: true, workspaceId: "owner", principalId: "owner", isOwner: true },
  });
  assert.equal(approve.res.statusCode, 200);
  assert.equal(service.state.lastTransition.action, "approve");
}

async function testChildCanCancelOwnRedemptionOnly() {
  const service = makeLearningCoinService();
  service.state.redemptions.push({ id: "redeem-2", studentId: "child", workspaceId: "child", status: "requested", coinCost: 40 });
  const { routes } = makeRoutes({ learningCoinService: service });

  const cancel = await request(routes, "POST", "/api/learning-coins/redemptions/redeem-2/cancel", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(cancel.res.statusCode, 200);
  assert.equal(service.state.lastTransition.action, "cancel");

  const reject = await request(routes, "POST", "/api/learning-coins/redemptions/redeem-2/reject", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(reject.res.statusCode, 403);
}

async function testRedemptionActionDoesNotDiscloseOtherScopes() {
  const service = makeLearningCoinService();
  service.state.redemptions.push({ id: "owner-redeem", studentId: "owner", workspaceId: "owner", status: "requested", coinCost: 40 });
  const { routes } = makeRoutes({ learningCoinService: service });

  const cancelOther = await request(routes, "POST", "/api/learning-coins/redemptions/owner-redeem/cancel", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(cancelOther.res.statusCode, 404);
  assert.equal(service.state.lastTransition, undefined);

  const missing = await request(routes, "POST", "/api/learning-coins/redemptions/missing-redemption/cancel", {
    auth: { ok: true, workspaceId: "child", principalId: "principal-child", isOwner: false },
  });
  assert.equal(missing.res.statusCode, 404);
}

(async () => {
  await testMetadataAndFallthrough();
  await testSummaryAndLedgerAreWorkspaceScoped();
  await testOwnerGrantRewardAndRedemption();
  await testChildCanCancelOwnRedemptionOnly();
  await testRedemptionActionDoesNotDiscloseOtherScopes();
  console.log("learning coin api route tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
