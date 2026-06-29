"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`native device api routes require ${name}`);
  }
}

function clean(value, max = 500) {
  const text = String(value || "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

const NATIVE_DEVICE_API_ROUTE_SPECS = Object.freeze([
  {
    id: "native-device-register",
    method: "POST",
    path: "/api/native/devices/register",
    group: "native-devices",
    moduleKey: "native-devices",
    workspaceScoped: true,
    resourceTypes: ["native-notification", "device"],
  },
  {
    id: "native-device-unregister",
    method: "POST",
    path: "/api/native/devices/unregister",
    group: "native-devices",
    moduleKey: "native-devices",
    workspaceScoped: true,
    resourceTypes: ["native-notification", "device"],
  },
  {
    id: "native-device-test-notification",
    method: "POST",
    path: "/api/native/devices/test-notification",
    group: "native-devices",
    moduleKey: "native-devices",
    workspaceScoped: true,
    resourceTypes: ["native-notification", "apns", "fcm"],
  },
]);

function createNativeDeviceApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "readBody",
    "requireWorkspaceAccess",
    "sendJson",
    "workspacePrincipal",
  ]);
  if (!deps.nativeNotificationService) throw new Error("native device api routes require nativeNotificationService");

  const registry = createApiRouteRegistry(NATIVE_DEVICE_API_ROUTE_SPECS);
  const service = deps.nativeNotificationService;
  const appRouteUrl = typeof deps.appRouteUrl === "function"
    ? deps.appRouteUrl
    : ((params = {}) => {
      const query = new URLSearchParams(params);
      return `/?${query.toString()}`;
    });

  function publicError(result = {}) {
    return { ok: false, error: clean(result.error || "native_notification_failed", 160) };
  }

  function defaultWorkspaceId(req) {
    const auth = typeof deps.authenticateRequest === "function" ? deps.authenticateRequest(req) : null;
    return clean(auth?.workspaceId || "owner", 120) || "owner";
  }

  function requestedWorkspaceId(req, body = {}) {
    const fallback = defaultWorkspaceId(req);
    return clean(body.workspaceId || body.workspace_id || fallback, 120) || fallback;
  }

  async function handleRegister(req, res) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(req, body));
    if (!workspaceId) return;
    const result = service.registerDevice(Object.assign({}, body, {
      workspaceId,
      principalId: deps.workspacePrincipal(workspaceId),
    }));
    deps.sendJson(res, result.ok ? 201 : (result.status || 400), result.ok
      ? { ok: true, device: result.device, channel: result.channel || service.channel }
      : publicError(result));
  }

  async function handleUnregister(req, res) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(req, body));
    if (!workspaceId) return;
    const result = service.unregisterDevice(Object.assign({}, body, {
      workspaceId,
      principalId: deps.workspacePrincipal(workspaceId),
    }));
    deps.sendJson(res, result.ok ? 200 : (result.status || 404), result.ok
      ? { ok: true, device: result.device, channel: result.channel || service.channel }
      : publicError(result));
  }

  async function handleTestNotification(req, res) {
    const body = await deps.readBody(req).catch(() => ({}));
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(req, body));
    if (!workspaceId) return;
    const channel = clean(body.notificationChannel || body.notification_channel || body.channel, 120);
    const nativeShell = channel === "native_android_fcm" || channel === "android" || channel === "fcm" ? "android" : "ios";
    const deepLink = clean(body.deepLink || body.deep_link || appRouteUrl({ source: "pwa", nativeShell, view: "tasks", workspaceId }), 600);
    const result = await service.sendToWorkspace({
      workspaceId,
      title: clean(body.title || "Home AI", 120) || "Home AI",
      body: clean(body.body || "原生通知测试", 220),
      deepLink,
      notificationChannel: channel,
      data: { workspaceId, messageType: "native_test", notificationChannel: channel },
    });
    deps.sendJson(res, 200, { ok: true, result });
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "native-device-register") await handleRegister(req, res);
    else if (route.id === "native-device-unregister") await handleUnregister(req, res);
    else if (route.id === "native-device-test-notification") await handleTestNotification(req, res);
    else return { handled: false };

    return { handled: true, route };
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
  NATIVE_DEVICE_API_ROUTE_SPECS,
  createNativeDeviceApiRoutes,
};
