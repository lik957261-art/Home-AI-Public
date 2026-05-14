"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`weixin api routes require ${name}`);
}

function requestPath(req, url) {
  if (url?.pathname) return url.pathname;
  const raw = String(req?.url || "/");
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return raw.split("?")[0] || "/";
  }
}

function requestSearchParams(req, url) {
  if (url?.searchParams) return url.searchParams;
  try {
    return new URL(String(req?.url || "/"), "http://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function bodyReadErrorPayload(err, includeOk) {
  const payload = { error: err?.message || "Invalid request body" };
  if (includeOk) payload.ok = false;
  return payload;
}

function createWeixinApiRoutes(deps = {}) {
  for (const name of [
    "requireWeixinIngress",
    "readBody",
    "sendJson",
    "startWeixinIngressEvent",
    "pendingWeixinOutboundDeliveries",
    "ackWeixinOutboundDelivery",
    "authCanAccessWorkspace",
    "weixinForwardTargetsForWorkspace",
    "createWeixinFileForwardDelivery",
  ]) {
    ensureFunction(deps, name);
  }
  if (!deps.weixinIngressProvider || typeof deps.weixinIngressProvider.normalizeAck !== "function") {
    throw new Error("weixin api routes require weixinIngressProvider.normalizeAck");
  }

  const registry = createApiRouteRegistry([
    {
      id: "weixin-ingress-events",
      method: "POST",
      path: "/api/ingress/weixin/events",
      group: "weixin",
      moduleKey: "weixin-ingress",
      handlerKey: "ingressEvents",
      summary: "Accept Weixin inbound ingress events from the sidecar.",
      riskLevel: "medium",
      authMode: "ingress",
      resourceTypes: ["weixin", "ingress", "event"],
      tags: ["weixin", "ingress"],
    },
    {
      id: "weixin-outbound-list",
      method: "GET",
      path: "/api/ingress/weixin/outbound",
      group: "weixin",
      moduleKey: "weixin-ingress",
      handlerKey: "outboundDeliveries",
      summary: "List pending Weixin outbound deliveries for the sidecar.",
      riskLevel: "medium",
      authMode: "ingress",
      resourceTypes: ["weixin", "egress", "delivery"],
      tags: ["weixin", "ingress"],
    },
    {
      id: "weixin-outbound-ack",
      method: "POST",
      pathRegex: /^\/api\/ingress\/weixin\/outbound\/([^/]+)\/ack$/,
      group: "weixin",
      moduleKey: "weixin-ingress",
      handlerKey: "ackOutboundDelivery",
      summary: "Acknowledge a Weixin outbound delivery from the sidecar.",
      riskLevel: "medium",
      authMode: "ingress",
      resourceTypes: ["weixin", "egress", "delivery", "ack"],
      tags: ["weixin", "ingress"],
    },
    {
      id: "weixin-forward-targets",
      method: "GET",
      path: "/api/weixin/forward-targets",
      group: "weixin",
      moduleKey: "weixin-forward",
      handlerKey: "forwardTargets",
      summary: "List manual Weixin forwarding targets for an authenticated workspace.",
      riskLevel: "low",
      authMode: "access-key",
      workspaceScoped: true,
      resourceTypes: ["weixin", "workspace", "forward-target"],
      tags: ["weixin", "forwarding"],
    },
    {
      id: "weixin-forward-file",
      method: "POST",
      path: "/api/weixin/forward-file",
      group: "weixin",
      moduleKey: "weixin-forward",
      handlerKey: "forwardFile",
      summary: "Queue a manual file delivery to Weixin for an authenticated workspace.",
      riskLevel: "low",
      authMode: "access-key",
      workspaceScoped: true,
      resourceTypes: ["weixin", "workspace", "file", "delivery"],
      tags: ["weixin", "forwarding"],
    },
  ]);

  async function handleIngressEvent(req, res, route) {
    if (!deps.requireWeixinIngress(req, res)) return { handled: true, route };
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, bodyReadErrorPayload(body.__error, true));
      return { handled: true, route };
    }
    try {
      const result = await deps.startWeixinIngressEvent(body);
      deps.sendJson(res, result?.duplicate ? 200 : 202, result);
    } catch (err) {
      deps.sendJson(
        res,
        err.status || 500,
        Object.assign({ ok: false, error: err.message || String(err) }, err.result || {}),
      );
    }
    return { handled: true, route };
  }

  async function handleOutboundList(req, res, url, route) {
    if (!deps.requireWeixinIngress(req, res)) return { handled: true, route };
    const params = requestSearchParams(req, url);
    const data = deps.pendingWeixinOutboundDeliveries({
      status: params.get("status") || "pending",
      accountId: params.get("accountId") || params.get("account_id") || "",
      limit: params.get("limit") || "",
    });
    deps.sendJson(res, 200, { ok: true, data });
    return { handled: true, route };
  }

  async function handleOutboundAck(req, res, path, route) {
    if (!deps.requireWeixinIngress(req, res)) return { handled: true, route };
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, bodyReadErrorPayload(body.__error, true));
      return { handled: true, route };
    }
    try {
      const match = path.match(/^\/api\/ingress\/weixin\/outbound\/([^/]+)\/ack$/);
      const ack = deps.weixinIngressProvider.normalizeAck(body);
      const delivery = deps.ackWeixinOutboundDelivery(decodeURIComponent(match[1]), ack);
      if (!delivery) {
        deps.sendJson(res, 404, { ok: false, error: "Delivery not found" });
        return { handled: true, route };
      }
      deps.sendJson(res, 200, { ok: true, delivery });
    } catch (err) {
      deps.sendJson(res, err.status || 500, { ok: false, error: err.message || String(err) });
    }
    return { handled: true, route };
  }

  function requireForwardAuth(res, route, auth) {
    if (auth?.ok) return auth;
    deps.sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }

  async function handleForwardTargets(req, res, url, route, auth) {
    if (!requireForwardAuth(res, route, auth)) return { handled: true, route };
    const params = requestSearchParams(req, url);
    const workspaceId = String(params.get("workspaceId") || params.get("workspace_id") || auth.workspaceId || "owner").trim() || "owner";
    if (!deps.authCanAccessWorkspace(auth, workspaceId)) {
      deps.sendJson(res, 403, { error: "Workspace access is not allowed" });
      return { handled: true, route, auth };
    }
    deps.sendJson(res, 200, { ok: true, data: deps.weixinForwardTargetsForWorkspace(workspaceId, auth) });
    return { handled: true, route, auth };
  }

  async function handleForwardFile(req, res, route, auth) {
    if (!requireForwardAuth(res, route, auth)) return { handled: true, route };
    const body = await deps.readBody(req).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 400, bodyReadErrorPayload(body.__error, false));
      return { handled: true, route, auth };
    }
    try {
      const result = await deps.createWeixinFileForwardDelivery(auth, body);
      deps.sendJson(res, 202, result);
    } catch (err) {
      deps.sendJson(res, err.status || 500, {
        ok: false,
        error: err.message || String(err),
        code: err.code || "weixin_forward_failed",
      });
    }
    return { handled: true, route, auth };
  }

  async function handle(req, res, url, context = {}) {
    const path = requestPath(req, url);
    const route = registry.match({
      method: req.method || "GET",
      path,
    });
    if (!route) return { handled: false };

    if (route.id === "weixin-ingress-events") return handleIngressEvent(req, res, route);
    if (route.id === "weixin-outbound-list") return handleOutboundList(req, res, url, route);
    if (route.id === "weixin-outbound-ack") return handleOutboundAck(req, res, path, route);
    if (route.id === "weixin-forward-targets") return handleForwardTargets(req, res, url, route, context.auth);
    if (route.id === "weixin-forward-file") return handleForwardFile(req, res, route, context.auth);

    return { handled: false };
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
  createWeixinApiRoutes,
};
