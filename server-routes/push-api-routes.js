"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function requiredFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`push api routes require ${name}`);
  }
}

function clampLimit(value, fallback = 50) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function listTailReverse(items, limit) {
  return [...(Array.isArray(items) ? items : [])].slice(-limit).reverse();
}

function defaultNowIso() {
  return new Date().toISOString();
}

function normalizeRequestOrigin(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (_) {
    return "";
  }
}

function requestOrigin(req) {
  const headers = req?.headers || {};
  const origin = normalizeRequestOrigin(headers.origin);
  if (origin) return origin;
  const referer = normalizeRequestOrigin(headers.referer || headers.referrer);
  if (referer) return referer;
  const host = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
  if (!host) return "";
  const proto = String(headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  return normalizeRequestOrigin(`${proto}://${host}`);
}

function defaultAppRouteUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function makeTestId() {
  return `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function publicSubscriptionResult(value) {
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of ["id", "endpointHash", "principalIds", "workspaceIds"]) {
    if (Object.hasOwn(value, key)) result[key] = value[key];
  }
  return result;
}

function redactPushEndpoints(value) {
  if (Array.isArray(value)) return value.map(redactPushEndpoints);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "endpoint") continue;
    result[key] = redactPushEndpoints(item);
  }
  return result;
}

function createPushApiRoutes(deps = {}) {
  requiredFunctions(deps, [
    "authenticateRequest",
    "publicPushStatus",
    "readBody",
    "recordPushReceipt",
    "removePushSubscription",
    "requireOwner",
    "requireWorkspaceAccess",
    "savePushSubscription",
    "sendJson",
    "sendPushNotification",
    "workspacePrincipal",
  ]);

  const {
    appRouteUrl = defaultAppRouteUrl,
    authenticateRequest,
    listPushDeliveries,
    listPushReceipts,
    nowIso = defaultNowIso,
    publicPushStatus,
    pushWorkspaceForAuth = (_auth, workspaceId) => workspaceId,
    readBody,
    recordPushReceipt,
    removePushSubscription,
    requireOwner,
    requireWorkspaceAccess,
    savePushSubscription,
    sendJson,
    sendPushNotification,
    state,
    workspacePrincipal,
  } = deps;

  const registry = createApiRouteRegistry([
    {
      id: "push-vapid-public-key",
      method: "GET",
      path: "/api/push/vapid-public-key",
      group: "push",
      moduleKey: "push",
      riskLevel: "public",
      authRequired: false,
      resourceTypes: ["web-push"],
    },
    {
      id: "push-receipt-create",
      method: "POST",
      path: "/api/push/receipt",
      group: "push",
      moduleKey: "push",
      riskLevel: "public",
      authRequired: false,
      resourceTypes: ["web-push", "receipt"],
    },
    {
      id: "push-receipts-list",
      method: "GET",
      path: "/api/push/receipts",
      group: "push",
      moduleKey: "push",
      riskLevel: "owner",
      ownerOnly: true,
      resourceTypes: ["web-push", "receipt"],
    },
    {
      id: "push-deliveries-list",
      method: "GET",
      path: "/api/push/deliveries",
      group: "push",
      moduleKey: "push",
      riskLevel: "owner",
      ownerOnly: true,
      resourceTypes: ["web-push", "delivery"],
    },
    {
      id: "push-subscribe",
      method: "POST",
      path: "/api/push/subscribe",
      group: "push",
      moduleKey: "push",
      workspaceScoped: true,
      resourceTypes: ["web-push", "workspace"],
    },
    {
      id: "push-unsubscribe",
      method: "POST",
      path: "/api/push/unsubscribe",
      group: "push",
      moduleKey: "push",
      workspaceScoped: true,
      resourceTypes: ["web-push", "workspace"],
    },
    {
      id: "push-test",
      method: "POST",
      path: "/api/push/test",
      group: "push",
      moduleKey: "push",
      workspaceScoped: true,
      resourceTypes: ["web-push"],
    },
  ]);

  function currentReceipts() {
    return typeof listPushReceipts === "function" ? listPushReceipts() : state?.pushReceipts;
  }

  function currentDeliveries() {
    return typeof listPushDeliveries === "function" ? listPushDeliveries() : state?.pushDeliveries;
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "push-vapid-public-key") {
      sendJson(res, 200, publicPushStatus());
      return { handled: true, route };
    }

    if (route.id === "push-receipt-create") {
      const body = await readBody(req).catch(() => ({}));
      const receipt = recordPushReceipt(body);
      sendJson(res, 201, { ok: Boolean(receipt), receipt: redactPushEndpoints(receipt) });
      return { handled: true, route };
    }

    if (route.id === "push-receipts-list") {
      if (!requireOwner(req, res)) return { handled: true, route };
      const limit = clampLimit(url?.searchParams?.get("limit"), 50);
      sendJson(res, 200, { ok: true, data: redactPushEndpoints(listTailReverse(currentReceipts(), limit)) });
      return { handled: true, route };
    }

    if (route.id === "push-deliveries-list") {
      if (!requireOwner(req, res)) return { handled: true, route };
      const limit = clampLimit(url?.searchParams?.get("limit"), 50);
      sendJson(res, 200, { ok: true, data: redactPushEndpoints(listTailReverse(currentDeliveries(), limit)) });
      return { handled: true, route };
    }

    if (route.id === "push-subscribe") {
      const push = publicPushStatus();
      if (!push?.enabled) {
        sendJson(res, 503, { error: "Web Push is not configured", push });
        return { handled: true, route };
      }
      try {
        const body = await readBody(req);
        const subscription = body.subscription || body;
        const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || body.workspace_id || "owner");
        if (!workspaceId) return { handled: true, route };
        const pushWorkspaceId = pushWorkspaceForAuth(authenticateRequest(req), workspaceId);
        const clientContext = body.clientContext && typeof body.clientContext === "object" ? body.clientContext : {};
        const userAgent = String(req.headers?.["user-agent"] || body.userAgent || clientContext.userAgent || "");
        const publicOrigin = requestOrigin(req) || clientContext.origin || body.origin || "";
        const saved = savePushSubscription(subscription, {
          deviceLabel: body.deviceLabel || body.label || "",
          userAgent,
          clientContext: Object.assign({}, clientContext, {
            userAgent,
            displayMode: body.displayMode || clientContext.displayMode || "",
            standalone: body.standalone ?? clientContext.standalone,
            clientVersion: body.clientVersion || clientContext.clientVersion || "",
            platform: body.platform || clientContext.platform || "",
            origin: publicOrigin,
            host: clientContext.host || body.host || "",
            path: clientContext.path || body.path || "",
          }),
          displayMode: body.displayMode || clientContext.displayMode || "",
          standalone: body.standalone ?? clientContext.standalone,
          clientVersion: body.clientVersion || clientContext.clientVersion || "",
          platform: body.platform || clientContext.platform || "",
          workspaceId: pushWorkspaceId,
          principalId: workspacePrincipal(pushWorkspaceId),
        });
        sendJson(res, 201, { ok: true, subscription: publicSubscriptionResult(saved), push: publicPushStatus() });
      } catch (err) {
        sendJson(res, 400, { error: err.message || String(err), push: publicPushStatus() });
      }
      return { handled: true, route };
    }

    if (route.id === "push-unsubscribe") {
      const body = await readBody(req).catch(() => ({}));
      const endpoint = body.endpoint || body.subscription?.endpoint || "";
      const removed = removePushSubscription(endpoint || body.subscription || body);
      sendJson(res, 200, { ok: true, removed, push: publicPushStatus() });
      return { handled: true, route };
    }

    if (route.id === "push-test") {
      const body = await readBody(req).catch(() => ({}));
      const workspaceId = requireWorkspaceAccess(req, res, body.workspaceId || body.workspace_id || "owner");
      if (!workspaceId) return { handled: true, route };
      const pushWorkspaceId = pushWorkspaceForAuth(authenticateRequest(req), workspaceId);
      const targetPrincipalId = workspacePrincipal(pushWorkspaceId);
      const sentAt = nowIso();
      const testId = makeTestId();
      const result = await sendPushNotification({
        title: "\u901a\u77e5\u6d4b\u8bd5",
        body: `Test notification ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
        tag: `hermes-web-test-${testId}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        vibrate: [200, 100, 200, 100, 200],
        data: {
          url: appRouteUrl({ view: "tasks", workspaceId: pushWorkspaceId }),
          viewMode: "tasks",
          workspaceId: pushWorkspaceId,
          principalId: targetPrincipalId,
          messageType: "test",
          notificationChannel: "web_push",
          testId,
          sentAt,
          requireInteraction: true,
        },
      }, { urgency: "high", ttl: 5 * 60, principalIds: [targetPrincipalId], notificationChannel: "web_push" });
      sendJson(res, 200, {
        ok: true,
        result,
        target: { workspaceId: pushWorkspaceId, principalId: targetPrincipalId, testId, sentAt },
        push: publicPushStatus(),
      });
      return { handled: true, route };
    }

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
  createPushApiRoutes,
};
