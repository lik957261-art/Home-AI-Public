"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const IOS_SHELL_VERSION_POLICY_PATH = "/api/native/ios-shell/version-policy";

const NATIVE_IOS_SHELL_API_ROUTE_SPECS = Object.freeze([
  {
    id: "native-ios-shell-version-policy",
    method: "GET",
    path: IOS_SHELL_VERSION_POLICY_PATH,
    group: "native-ios-shell",
    moduleKey: "native-ios-shell",
    handlerKey: "versionPolicy",
    summary: "Return public-safe iOS native shell minimum-build policy metadata.",
    riskLevel: "public",
    authMode: "none",
    authRequired: false,
    workspaceScoped: false,
    resourceTypes: ["native-shell", "version-policy"],
    tags: ["native", "ios", "testflight", "version-policy"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`native ios shell api routes require ${name}`);
  }
}

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function publicPayload(result = {}) {
  const payload = {
    ok: Boolean(result.ok),
    platform: clean(result.platform || "ios", 40) || "ios",
    minimumBuild: Number(result.minimumBuild || 0),
    latestBuild: Number(result.latestBuild || 0),
    updateRequired: Boolean(result.updateRequired),
    testFlightUrl: clean(result.testFlightUrl, 600),
    message: clean(result.message, 300),
  };
  if (Number.isFinite(result.currentBuild)) payload.currentBuild = Number(result.currentBuild);
  if (result.version) payload.version = clean(result.version, 80);
  if (!result.ok) {
    payload.code = clean(result.code || "ios_shell_version_policy_error", 120);
    payload.error = payload.code;
  }
  return payload;
}

function createNativeIosShellApiRoutes(deps = {}) {
  requireFunctions(deps, ["sendJson"]);
  if (!deps.nativeIosShellVersionPolicyService || typeof deps.nativeIosShellVersionPolicyService.evaluate !== "function") {
    throw new Error("native ios shell api routes require nativeIosShellVersionPolicyService.evaluate");
  }

  const registry = createApiRouteRegistry(NATIVE_IOS_SHELL_API_ROUTE_SPECS);
  const service = deps.nativeIosShellVersionPolicyService;

  async function handleVersionPolicy(req, res, url) {
    const result = service.evaluate({
      platform: url.searchParams.get("platform"),
      buildNumber: url.searchParams.get("buildNumber") || url.searchParams.get("build"),
      version: url.searchParams.get("version"),
    });
    deps.sendJson(res, result.ok ? 200 : (result.status || 400), publicPayload(result));
    return { handled: true, status: result.ok ? 200 : (result.status || 400) };
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "native-ios-shell-version-policy") return handleVersionPolicy(req, res, url);
    return { handled: false };
  }

  return {
    handle,
    list: (...args) => registry.list(...args),
    match: (...args) => registry.match(...args),
    summary: (...args) => registry.summary(...args),
  };
}

module.exports = {
  IOS_SHELL_VERSION_POLICY_PATH,
  NATIVE_IOS_SHELL_API_ROUTE_SPECS,
  createNativeIosShellApiRoutes,
  publicPayload,
};
