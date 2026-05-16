"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const LEARNING_COIN_API_ROUTE_SPECS = Object.freeze([
  {
    id: "learning-coins-summary",
    method: "GET",
    path: "/api/learning-coins/summary",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "summary",
    summary: "Read the isolated learning coin balance, rewards, ledger, and redemptions.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-coin", "reward", "redemption"],
    tags: ["learning-coins", "summary"],
  },
  {
    id: "learning-coins-ledger",
    method: "GET",
    path: "/api/learning-coins/ledger",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "ledger",
    summary: "Read the sanitized learning coin ledger for one student workspace.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["learning-coin", "ledger"],
    tags: ["learning-coins", "ledger"],
  },
  {
    id: "learning-coins-rewards",
    method: "GET",
    path: "/api/learning-coins/rewards",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "rewards",
    summary: "Read the learning coin reward catalog.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["reward"],
    tags: ["learning-coins", "reward"],
  },
  {
    id: "learning-coins-grant",
    method: "POST",
    path: "/api/learning-coins/grants",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "grant",
    summary: "Owner-only learning coin grant or adjustment.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["learning-coin", "ledger"],
    tags: ["learning-coins", "owner", "grant"],
  },
  {
    id: "learning-coins-reward-upsert",
    method: "POST",
    path: "/api/learning-coins/rewards",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "upsertReward",
    summary: "Owner-only learning coin reward creation or update.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["reward"],
    tags: ["learning-coins", "owner", "reward"],
  },
  {
    id: "learning-coins-redemption-request",
    method: "POST",
    path: "/api/learning-coins/redemptions",
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "requestRedemption",
    summary: "Request a learning coin reward redemption without performing real RMB payout.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["redemption", "reward", "learning-coin"],
    tags: ["learning-coins", "redemption"],
  },
  {
    id: "learning-coins-redemption-cancel",
    method: "POST",
    pathRegex: /^\/api\/learning-coins\/redemptions\/[^/]+\/cancel$/,
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "redemptionAction",
    summary: "Cancel a workspace-owned learning coin redemption request.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["redemption", "learning-coin"],
    tags: ["learning-coins", "redemption", "cancel"],
  },
  {
    id: "learning-coins-redemption-owner-action",
    method: "POST",
    pathRegex: /^\/api\/learning-coins\/redemptions\/[^/]+\/(?:approve|reject|settle)$/,
    group: "learning-coins",
    moduleKey: "learning-coins",
    handlerKey: "redemptionOwnerAction",
    summary: "Owner-only approval, rejection, or settlement of a learning coin redemption.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["redemption", "learning-coin"],
    tags: ["learning-coins", "redemption", "owner"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`learning coin api routes require ${name}`);
  }
}

function requireService(deps) {
  const service = deps.learningCoinService;
  const required = ["summary", "listLedger", "listRewards", "grantCoins", "adjustCoins", "upsertReward", "requestRedemption", "getRedemption", "transitionRedemption"];
  if (!service || required.some((name) => typeof service[name] !== "function")) {
    throw new Error("learning coin api routes require learningCoinService");
  }
  return service;
}

function parseRedemptionAction(pathname) {
  const match = String(pathname || "").match(/^\/api\/learning-coins\/redemptions\/([^/]+)\/(approve|reject|cancel|settle)$/);
  if (!match) return null;
  return {
    redemptionId: decodeURIComponent(match[1] || ""),
    action: match[2],
  };
}

function requestedWorkspaceId(url, body = {}) {
  return String(body.workspaceId || url?.searchParams?.get("workspaceId") || "owner").trim() || "owner";
}

function requestedStudentId(deps, auth, requested, workspaceId) {
  const studentId = String(requested || "").trim();
  if (deps.isOwnerAuth(auth)) return studentId || workspaceId || "fanfan";
  const ownWorkspace = String(auth?.workspaceId || workspaceId || "").trim();
  if (studentId && studentId !== ownWorkspace) {
    const err = new Error("Student access is not allowed");
    err.status = 403;
    throw err;
  }
  return ownWorkspace || workspaceId || "fanfan";
}

function sendRouteError(deps, res, err) {
  deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
}

function publicSummaryPayload(service, input) {
  return Object.assign({ ok: true }, service.summary(input));
}

function broadcastCoinUpdate(deps, payload = {}) {
  if (typeof deps.broadcast === "function") {
    deps.broadcast(Object.assign({ type: "learning-coins.updated" }, payload));
  }
}

function createLearningCoinApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "isOwnerAuth",
    "readBody",
    "requireOwner",
    "requireWorkspaceAccess",
    "sendJson",
  ]);
  const service = requireService(deps);
  const registry = createApiRouteRegistry(LEARNING_COIN_API_ROUTE_SPECS);

  function authorizeQuery(req, res, url, auth) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return null;
    const studentId = requestedStudentId(deps, auth, url.searchParams.get("studentId"), workspaceId);
    return {
      workspaceId,
      studentId,
      limit: url.searchParams.get("limit"),
    };
  }

  async function handleSummary(req, res, url, auth) {
    let input;
    try {
      input = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!input) return;
    deps.sendJson(res, 200, publicSummaryPayload(service, input));
  }

  async function handleLedger(req, res, url, auth) {
    let input;
    try {
      input = authorizeQuery(req, res, url, auth);
    } catch (err) {
      sendRouteError(deps, res, err);
      return;
    }
    if (!input) return;
    deps.sendJson(res, 200, {
      ok: true,
      studentId: input.studentId,
      workspaceId: input.workspaceId,
      ledger: service.listLedger(input),
    });
  }

  async function handleRewards(req, res, url, auth) {
    deps.sendJson(res, 200, {
      ok: true,
      rewards: service.listRewards({ includeInactive: deps.isOwnerAuth(auth) && /^(1|true|yes|on)$/i.test(url.searchParams.get("includeInactive") || "") }),
    });
  }

  async function handleGrant(req, res) {
    const ownerAuth = deps.requireOwner(req, res);
    if (!ownerAuth) return;
    const body = await deps.readBody(req).catch(() => ({}));
    try {
      const payload = Object.assign({}, body, {
        workspaceId: body.workspaceId || "owner",
        studentId: body.studentId || body.workspaceId || "fanfan",
        createdByPrincipalId: ownerAuth.principalId || "owner",
      });
      const result = body.coinDelta
        ? service.adjustCoins(payload)
        : service.grantCoins(payload);
      broadcastCoinUpdate(deps, { workspaceId: payload.workspaceId, studentId: payload.studentId });
      deps.sendJson(res, result.duplicate ? 200 : 201, Object.assign({ ok: true }, result));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRewardUpsert(req, res) {
    const ownerAuth = deps.requireOwner(req, res);
    if (!ownerAuth) return;
    const body = await deps.readBody(req).catch(() => ({}));
    try {
      const reward = service.upsertReward(Object.assign({}, body, {
        createdByPrincipalId: ownerAuth.principalId || "owner",
      }));
      broadcastCoinUpdate(deps, { workspaceId: body.workspaceId || "owner", studentId: body.studentId || "" });
      deps.sendJson(res, 201, { ok: true, reward });
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRedemptionRequest(req, res, auth) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const studentId = requestedStudentId(deps, auth, body.studentId, workspaceId);
      const result = service.requestRedemption(Object.assign({}, body, {
        workspaceId,
        studentId,
        requestedByPrincipalId: auth?.principalId || "",
      }));
      broadcastCoinUpdate(deps, { workspaceId, studentId });
      deps.sendJson(res, result.duplicate ? 200 : 201, Object.assign({ ok: true }, result));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handleRedemptionAction(req, res, url, auth) {
    const parsed = parseRedemptionAction(url.pathname);
    if (!parsed) {
      deps.sendJson(res, 404, { error: "Not found" });
      return;
    }
    let actorAuth = auth || {};
    let scope = {};
    if (parsed.action !== "cancel") {
      const ownerAuth = deps.requireOwner(req, res);
      if (!ownerAuth) return;
      actorAuth = ownerAuth;
    } else if (deps.isOwnerAuth(auth)) {
      scope = {};
    } else if (!deps.isOwnerAuth(auth)) {
      const workspaceId = deps.requireWorkspaceAccess(req, res, auth?.workspaceId || "owner");
      if (!workspaceId) return;
      scope = { workspaceId, studentId: workspaceId };
    }
    const redemption = service.getRedemption(parsed.redemptionId, scope);
    if (!redemption) {
      deps.sendJson(res, 404, { error: "Redemption was not found" });
      return;
    }
    const body = await deps.readBody(req).catch(() => ({}));
    try {
      const result = service.transitionRedemption(parsed.redemptionId, parsed.action, Object.assign({}, scope, {
        actorPrincipalId: actorAuth?.principalId || "owner",
        note: body.note || "",
      }));
      broadcastCoinUpdate(deps, { workspaceId: result.redemption?.workspaceId, studentId: result.redemption?.studentId });
      deps.sendJson(res, 200, Object.assign({ ok: true }, result));
    } catch (err) {
      sendRouteError(deps, res, err);
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const auth = context.auth || null;
    if (route.id === "learning-coins-summary") await handleSummary(req, res, url, auth);
    else if (route.id === "learning-coins-ledger") await handleLedger(req, res, url, auth);
    else if (route.id === "learning-coins-rewards") await handleRewards(req, res, url, auth);
    else if (route.id === "learning-coins-grant") await handleGrant(req, res);
    else if (route.id === "learning-coins-reward-upsert") await handleRewardUpsert(req, res);
    else if (route.id === "learning-coins-redemption-request") await handleRedemptionRequest(req, res, auth);
    else if (route.id === "learning-coins-redemption-cancel" || route.id === "learning-coins-redemption-owner-action") await handleRedemptionAction(req, res, url, auth);
    else return { handled: false };

    return { handled: true, route, auth };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  LEARNING_COIN_API_ROUTE_SPECS,
  createLearningCoinApiRoutes,
};
