"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const AUTONOMOUS_DELIVERY_API_ROUTE_SPECS = Object.freeze([
  {
    id: "autonomous-delivery-case-list",
    method: "GET",
    path: "/api/autonomous-delivery/cases",
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "listCases",
    summary: "List workspace-scoped autonomous delivery cases.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["autonomous-delivery", "action-inbox"],
    tags: ["autonomous-delivery", "list"],
  },
  {
    id: "autonomous-delivery-case-create",
    method: "POST",
    path: "/api/autonomous-delivery/cases",
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "createCase",
    summary: "Create an Owner-gated autonomous delivery case and Action Inbox decision item.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["autonomous-delivery", "action-inbox"],
    tags: ["autonomous-delivery", "case", "create"],
  },
  {
    id: "autonomous-delivery-case-detail",
    method: "GET",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "getCase",
    summary: "Read one autonomous delivery case with slices and events.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["autonomous-delivery"],
    tags: ["autonomous-delivery", "case", "detail"],
  },
  {
    id: "autonomous-delivery-case-start",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/start$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "startCase",
    summary: "Owner-triggered manual start for non-high-risk autonomous delivery slices.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card"],
    tags: ["autonomous-delivery", "task-card", "owner"],
  },
  {
    id: "autonomous-delivery-case-close",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/close$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "closeCase",
    summary: "Owner-triggered closure for a verified autonomous delivery case.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "review"],
    tags: ["autonomous-delivery", "closure", "owner"],
  },
  {
    id: "autonomous-delivery-slice-return",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/slices\/[^/]+\/return$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "recordReturn",
    summary: "Record a terminal return-card state for an autonomous delivery slice.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card"],
    tags: ["autonomous-delivery", "return-card", "owner"],
  },
  {
    id: "autonomous-delivery-verification-start",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/slices\/[^/]+\/verification\/start$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "startVerification",
    summary: "Owner-triggered verification-card dispatch for a completed autonomous delivery slice.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card", "review"],
    tags: ["autonomous-delivery", "verification", "task-card", "owner"],
  },
  {
    id: "autonomous-delivery-deployment-start",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/slices\/[^/]+\/deployment\/start$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "startDeployment",
    summary: "Owner-triggered deployment/readback-card dispatch for a completed autonomous delivery slice.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card", "deployment"],
    tags: ["autonomous-delivery", "deployment", "readback", "task-card", "owner"],
  },
  {
    id: "autonomous-delivery-repair-start",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/cases\/[^/]+\/slices\/[^/]+\/repair\/start$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "startRepair",
    summary: "Owner-triggered repair-card dispatch for a failed autonomous delivery verification return.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card", "repair"],
    tags: ["autonomous-delivery", "repair", "task-card", "owner"],
  },
  {
    id: "autonomous-delivery-task-card-return",
    method: "POST",
    pathRegex: /^\/api\/autonomous-delivery\/task-cards\/[^/]+\/return$/,
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "recordTaskCardReturn",
    summary: "Record a terminal return-card state by original dispatched task-card id.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card"],
    tags: ["autonomous-delivery", "return-card", "task-card", "owner"],
  },
  {
    id: "autonomous-delivery-return-card-event",
    method: "POST",
    path: "/api/autonomous-delivery/return-card-events",
    group: "autonomous-delivery",
    moduleKey: "autonomous-delivery",
    handlerKey: "recordReturnCardEvent",
    summary: "Ingest a bounded terminal return-card event from the task-card transport.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["autonomous-delivery", "codex-task-card"],
    tags: ["autonomous-delivery", "return-card", "event", "owner"],
  },
]);

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`autonomous delivery api routes require ${name}`);
  }
}

function safeErrorPayload(err, fallback = "autonomous_delivery_error") {
  return {
    ok: false,
    error: clean(err?.error || err?.code || err?.message || fallback, 160),
  };
}

function responseFromResult(deps, res, result, successStatus = 200) {
  if (!result?.ok) {
    deps.sendJson(res, Number(result?.status || 400), {
      ok: false,
      error: result?.error || "autonomous_delivery_failed",
      required: result?.required || undefined,
    });
    return false;
  }
  deps.sendJson(res, successStatus, result);
  return true;
}

function caseIdFromPath(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/cases\/([^/]+)(?:\/(?:start|close))?$/);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function returnPathIds(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/cases\/([^/]+)\/slices\/([^/]+)\/return$/);
  return match ? {
    caseId: decodeURIComponent(match[1] || ""),
    sliceId: decodeURIComponent(match[2] || ""),
  } : null;
}

function verificationStartPathIds(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/cases\/([^/]+)\/slices\/([^/]+)\/verification\/start$/);
  return match ? {
    caseId: decodeURIComponent(match[1] || ""),
    sliceId: decodeURIComponent(match[2] || ""),
  } : null;
}

function deploymentStartPathIds(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/cases\/([^/]+)\/slices\/([^/]+)\/deployment\/start$/);
  return match ? {
    caseId: decodeURIComponent(match[1] || ""),
    sliceId: decodeURIComponent(match[2] || ""),
  } : null;
}

function repairStartPathIds(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/cases\/([^/]+)\/slices\/([^/]+)\/repair\/start$/);
  return match ? {
    caseId: decodeURIComponent(match[1] || ""),
    sliceId: decodeURIComponent(match[2] || ""),
  } : null;
}

function taskCardIdFromReturnPath(pathname = "") {
  const match = String(pathname || "").match(/^\/api\/autonomous-delivery\/task-cards\/([^/]+)\/return$/);
  return match ? decodeURIComponent(match[1] || "") : "";
}

function workspaceFromRequest(url, body, auth) {
  return clean(body?.workspaceId || body?.workspace_id || url.searchParams.get("workspaceId") || auth?.workspaceId || "owner", 120) || "owner";
}

function createAutonomousDeliveryApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.autonomousDeliveryCoordinatorService || typeof deps.autonomousDeliveryCoordinatorService.createCase !== "function") {
    throw new Error("autonomous delivery api routes require autonomousDeliveryCoordinatorService.createCase");
  }
  const service = deps.autonomousDeliveryCoordinatorService;
  const registry = createApiRouteRegistry(AUTONOMOUS_DELIVERY_API_ROUTE_SPECS);

  async function handleList(req, res, url, context = {}) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, {}, context.auth));
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    const result = service.listCases({
      workspaceId,
      status: url.searchParams.get("status") || "",
      limit: Number(url.searchParams.get("limit") || 100),
    });
    responseFromResult(deps, res, result);
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleCreate(req, res, url, context = {}) {
    const body = await deps.readBody(req, 64 * 1024).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, safeErrorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    const result = await Promise.resolve(service.createCase(Object.assign({}, body, {
      workspaceId,
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 201) && typeof deps.broadcast === "function") {
      deps.broadcast({
        type: "actionInbox.updated",
        workspaceId: "owner",
        itemId: result.inboxItem?.id || "",
      });
    }
    return { handled: true, status: res.statusCode || 201 };
  }

  async function handleDetail(req, res, url, context = {}) {
    const result = service.getCase({ caseId: caseIdFromPath(url.pathname) });
    if (!result?.ok) {
      responseFromResult(deps, res, result);
      return { handled: true, status: res.statusCode || 404 };
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, result.case.workspaceId || context.auth?.workspaceId || "owner");
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    deps.sendJson(res, 200, result);
    return { handled: true, status: 200 };
  }

  async function handleStart(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = await Promise.resolve(service.startCase(Object.assign({}, body, {
      caseId: caseIdFromPath(url.pathname),
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: body.inboxItemId || "" });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleClose(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = await Promise.resolve(service.closeCase(Object.assign({}, body, {
      caseId: caseIdFromPath(url.pathname),
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: body.inboxItemId || "" });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleReturn(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const ids = returnPathIds(url.pathname);
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = service.recordReturn(Object.assign({}, body, {
      caseId: ids?.caseId || "",
      sliceId: ids?.sliceId || "",
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    }));
    responseFromResult(deps, res, result, 200);
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleStartVerification(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const ids = verificationStartPathIds(url.pathname);
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = await Promise.resolve(service.startVerification(Object.assign({}, body, {
      caseId: ids?.caseId || "",
      sliceId: ids?.sliceId || "",
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: body.inboxItemId || "" });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleStartDeployment(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const ids = deploymentStartPathIds(url.pathname);
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = await Promise.resolve(service.startDeployment(Object.assign({}, body, {
      caseId: ids?.caseId || "",
      sliceId: ids?.sliceId || "",
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: body.inboxItemId || "" });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleStartRepair(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const ids = repairStartPathIds(url.pathname);
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = await Promise.resolve(service.startRepair(Object.assign({}, body, {
      caseId: ids?.caseId || "",
      sliceId: ids?.sliceId || "",
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    })));
    if (responseFromResult(deps, res, result, 200) && typeof deps.broadcast === "function") {
      deps.broadcast({ type: "actionInbox.updated", workspaceId: "owner", itemId: body.inboxItemId || "" });
    }
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleTaskCardReturn(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, 32 * 1024).catch(() => ({}));
    const result = service.recordReturnForTaskCard(Object.assign({}, body, {
      taskCardId: taskCardIdFromReturnPath(url.pathname),
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    }));
    responseFromResult(deps, res, result, 200);
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handleReturnCardEvent(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, 64 * 1024).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, safeErrorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    const result = service.recordReturnCardEvent(Object.assign({}, body, {
      actor: context.auth?.principalId || "owner",
      auth: context.auth,
    }));
    responseFromResult(deps, res, result, 200);
    return { handled: true, status: res.statusCode || 200 };
  }

  async function handle(req, res, url, context = {}) {
    const match = registry.match({ method: req.method, path: url.pathname });
    if (!match) return { handled: false };
    if (match.id === "autonomous-delivery-case-list") return handleList(req, res, url, context);
    if (match.id === "autonomous-delivery-case-create") return handleCreate(req, res, url, context);
    if (match.id === "autonomous-delivery-case-detail") return handleDetail(req, res, url, context);
    if (match.id === "autonomous-delivery-case-start") return handleStart(req, res, url, context);
    if (match.id === "autonomous-delivery-case-close") return handleClose(req, res, url, context);
    if (match.id === "autonomous-delivery-slice-return") return handleReturn(req, res, url, context);
    if (match.id === "autonomous-delivery-verification-start") return handleStartVerification(req, res, url, context);
    if (match.id === "autonomous-delivery-deployment-start") return handleStartDeployment(req, res, url, context);
    if (match.id === "autonomous-delivery-repair-start") return handleStartRepair(req, res, url, context);
    if (match.id === "autonomous-delivery-task-card-return") return handleTaskCardReturn(req, res, url, context);
    if (match.id === "autonomous-delivery-return-card-event") return handleReturnCardEvent(req, res, url, context);
    return { handled: false };
  }

  return {
    handle,
    list: registry.list,
    match: registry.match,
    routeSpecs: AUTONOMOUS_DELIVERY_API_ROUTE_SPECS,
    summary: registry.summary,
  };
}

module.exports = {
  AUTONOMOUS_DELIVERY_API_ROUTE_SPECS,
  createAutonomousDeliveryApiRoutes,
};
