"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const AI_OPS_DIAGNOSTIC_API_ROUTE_SPECS = Object.freeze([
  {
    id: "ai-ops-diagnostics-events-create",
    method: "POST",
    path: "/api/v1/home-ai/diagnostics/events",
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "createEvent",
    summary: "Submit a bounded Home AI diagnostic event.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["diagnostic-event", "diagnostic-case"],
    tags: ["ai-ops", "diagnostics", "bug-report"],
  },
  {
    id: "ai-ops-diagnostics-cases-list",
    method: "GET",
    path: "/api/v1/home-ai/diagnostics/cases",
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "listCases",
    summary: "List Home AI diagnostic cases for the AI Ops inbox.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["diagnostic-case"],
    tags: ["ai-ops", "diagnostics", "inbox"],
  },
  {
    id: "ai-ops-diagnostics-case-read",
    method: "GET",
    pathRegex: /^\/api\/v1\/home-ai\/diagnostics\/cases\/[^/]+$/,
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "getCase",
    summary: "Read a bounded AI Ops diagnostic case.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["diagnostic-case"],
    tags: ["ai-ops", "diagnostics", "inbox"],
  },
  {
    id: "ai-ops-diagnostics-events-list",
    method: "GET",
    path: "/api/v1/home-ai/diagnostics/events",
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "listEvents",
    summary: "List bounded diagnostic events for a case.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["diagnostic-event"],
    tags: ["ai-ops", "diagnostics", "inbox"],
  },
  {
    id: "ai-ops-diagnostics-case-state",
    method: "POST",
    pathRegex: /^\/api\/v1\/home-ai\/diagnostics\/cases\/[^/]+\/state$/,
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "updateCaseState",
    summary: "Update a diagnostic case lifecycle state.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["diagnostic-case", "case-state"],
    tags: ["ai-ops", "diagnostics", "inbox"],
  },
  {
    id: "ai-ops-diagnostics-case-task-card",
    method: "POST",
    pathRegex: /^\/api\/v1\/home-ai\/diagnostics\/cases\/[^/]+\/task-card$/,
    group: "ai-ops-diagnostics",
    moduleKey: "ai-ops-diagnostics",
    handlerKey: "sendTaskCard",
    summary: "Owner-triggered Codex task-card dispatch for a diagnostic remediation case.",
    riskLevel: "owner",
    authMode: "access-key",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["diagnostic-case", "codex-task-card"],
    tags: ["ai-ops", "diagnostics", "task-card", "owner"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`ai ops diagnostic api routes require ${name}`);
  }
}

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeErrorPayload(err) {
  return {
    ok: false,
    code: cleanString(err?.code || err?.message || "ai_ops_diagnostic_error", 100),
    error: cleanString(err?.message || "AI Ops diagnostic error", 240).replace(/\s+/g, " "),
  };
}

function workspaceFromRequest(url, body, auth) {
  return cleanString(body?.workspaceId || body?.workspace_id || url.searchParams.get("workspaceId") || auth?.workspaceId || "owner", 120) || "owner";
}

function caseIdFromPath(pathname, suffix = "") {
  const prefix = "/api/v1/home-ai/diagnostics/cases/";
  if (!pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length);
  if (suffix && !rest.endsWith(suffix)) return "";
  const raw = suffix ? rest.slice(0, -suffix.length) : rest;
  if (!raw || raw.includes("/")) return "";
  return decodeURIComponent(raw);
}

function createAiOpsDiagnosticApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireOwner", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.aiOpsDiagnosticIntakeService || typeof deps.aiOpsDiagnosticIntakeService.ingestEvent !== "function") {
    throw new Error("ai ops diagnostic api routes require aiOpsDiagnosticIntakeService.ingestEvent");
  }
  const registry = createApiRouteRegistry(AI_OPS_DIAGNOSTIC_API_ROUTE_SPECS);

  async function handleCreateEvent(req, res, url, context = {}) {
    const body = await deps.readBody(req, 96 * 1024).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, safeErrorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, workspaceFromRequest(url, body, context.auth));
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    try {
      const result = deps.aiOpsDiagnosticIntakeService.ingestEvent(body, {
        workspaceId,
        clientVersion: req.headers?.["x-hermes-web-client-version"] || req.headers?.["x-client-version"] || "",
        route: url.pathname,
      });
      if (deps.aiOpsDiagnosticRemediationWorkflowService?.notifyOwner) {
        try {
          const notification = await deps.aiOpsDiagnosticRemediationWorkflowService.notifyOwner({ case_id: result.case_id });
          result.owner_notification = {
            ok: notification?.ok !== false,
            notified: Boolean(notification?.notified),
            inbox_item_id: cleanString(notification?.inboxItem?.id, 160),
            reason: cleanString(notification?.reason || notification?.error || "", 160),
          };
        } catch (err) {
          result.owner_notification = {
            ok: false,
            notified: false,
            reason: cleanString(err?.message || "diagnostic_owner_notification_failed", 160),
          };
        }
      }
      deps.sendJson(res, 202, result);
      return { handled: true, status: 202 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleListCases(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    try {
      deps.sendJson(res, 200, deps.aiOpsDiagnosticIntakeService.listCases({
        limit: url.searchParams.get("limit"),
        plugin_id: url.searchParams.get("plugin_id") || url.searchParams.get("pluginId"),
        status: url.searchParams.get("status"),
      }));
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleListEvents(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    try {
      deps.sendJson(res, 200, deps.aiOpsDiagnosticIntakeService.listEvents({
        limit: url.searchParams.get("limit"),
        case_id: url.searchParams.get("case_id") || url.searchParams.get("caseId"),
      }));
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleGetCase(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const item = deps.aiOpsDiagnosticIntakeService.getCase(caseIdFromPath(url.pathname));
    if (!item) {
      deps.sendJson(res, 404, { ok: false, error: "diagnostic_case_not_found" });
      return { handled: true, status: 404 };
    }
    deps.sendJson(res, 200, { ok: true, case: item });
    return { handled: true, status: 200 };
  }

  async function handleUpdateCaseState(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req).catch(() => ({}));
    try {
      const result = deps.aiOpsDiagnosticIntakeService.updateCaseStatus({
        case_id: caseIdFromPath(url.pathname, "/state"),
        status: body.status,
        reason: body.reason,
        actor: "owner",
      });
      deps.sendJson(res, 200, result);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handleSendTaskCard(req, res, url, context = {}) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return { handled: true, status: res.statusCode || 403 };
    if (!deps.aiOpsDiagnosticRemediationWorkflowService?.dispatchTaskCard) {
      deps.sendJson(res, 503, { ok: false, error: "diagnostic_remediation_workflow_unavailable" });
      return { handled: true, status: 503 };
    }
    try {
      const actor = cleanString(
        context.auth?.principalId || context.auth?.workspaceId || owner?.principalId || owner?.workspaceId || "authenticated",
        80,
      );
      const result = await deps.aiOpsDiagnosticRemediationWorkflowService.dispatchTaskCard({
        case_id: caseIdFromPath(url.pathname, "/task-card"),
        actor,
      });
      if (!result?.ok) {
        deps.sendJson(res, Number(result?.status || 400), {
          ok: false,
          error: cleanString(result?.error || "diagnostic_remediation_dispatch_failed", 200),
          blockedReasons: Array.isArray(result?.blockedReasons) ? result.blockedReasons : [],
        });
        return { handled: true, status: Number(result?.status || 400) };
      }
      deps.sendJson(res, 200, result);
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 500, safeErrorPayload(err));
      return { handled: true, status: err.status || 500 };
    }
  }

  async function handle(req, res, url, context = {}) {
    const match = registry.match({ method: req.method, path: url.pathname });
    if (match?.handlerKey === "createEvent") return handleCreateEvent(req, res, url, context);
    if (match?.handlerKey === "listCases") return handleListCases(req, res, url);
    if (match?.handlerKey === "listEvents") return handleListEvents(req, res, url);
    if (match?.handlerKey === "getCase") return handleGetCase(req, res, url);
    if (match?.handlerKey === "updateCaseState") return handleUpdateCaseState(req, res, url);
    if (match?.handlerKey === "sendTaskCard") return handleSendTaskCard(req, res, url, context);
    return { handled: false };
  }

  return {
    handle,
    list: (options) => registry.list(options),
    match: (input) => registry.match(input),
    specs: AI_OPS_DIAGNOSTIC_API_ROUTE_SPECS,
    summary: (options) => registry.summary(options),
  };
}

module.exports = {
  AI_OPS_DIAGNOSTIC_API_ROUTE_SPECS,
  createAiOpsDiagnosticApiRoutes,
};
