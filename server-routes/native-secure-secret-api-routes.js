"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const SECRET_BODY_LIMIT_BYTES = 80 * 1024;
const SECRET_REF_PATH_REGEX = /^\/api\/native\/secure-secrets\/([^/]+)\/resolve$/;

const NATIVE_SECURE_SECRET_API_ROUTE_SPECS = Object.freeze([
  {
    id: "native-secure-secret-create",
    method: "POST",
    path: "/api/native/secure-secrets",
    group: "native-secure-secrets",
    moduleKey: "native-secure-secrets",
    handlerKey: "createSecret",
    summary: "Accept a deliberate native clipboard handoff and return a short-lived secret reference.",
    riskLevel: "high",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["secret-ref"],
    tags: ["native", "secret", "clipboard"],
  },
  {
    id: "native-secure-secret-resolve",
    method: "POST",
    pathRegex: SECRET_REF_PATH_REGEX,
    group: "native-secure-secrets",
    moduleKey: "native-secure-secrets",
    handlerKey: "resolveSecret",
    summary: "Resolve a short-lived secret reference for the scoped target plugin runtime.",
    riskLevel: "high",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["secret-ref"],
    tags: ["native", "secret", "codex"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`native secure secret api routes require ${name}`);
  }
}

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function errorPayload(err) {
  return {
    ok: false,
    code: clean(err?.code || "native_secure_secret_error", 120),
    error: clean(err?.code || "native_secure_secret_error", 120),
  };
}

function redactedCreateResponse(result = {}) {
  return {
    ok: true,
    secretRef: result.secretRef,
    expiresAt: result.expiresAt,
    source: result.source,
    targetPlugin: result.targetPlugin,
    purpose: result.purpose,
    workspaceId: result.workspaceId,
    maxUses: result.maxUses,
    remainingUses: result.remainingUses,
    valueBytes: result.valueBytes,
    valueSha256Prefix: result.valueSha256Prefix,
  };
}

function redactedResolveResponse(result = {}) {
  return {
    ok: true,
    secretRef: result.secretRef,
    value: result.value,
    targetPlugin: result.targetPlugin,
    purpose: result.purpose,
    expiresAt: result.expiresAt,
    remainingUses: result.remainingUses,
  };
}

function secretRefFromPath(pathname) {
  const match = SECRET_REF_PATH_REGEX.exec(String(pathname || ""));
  return match ? decodeURIComponent(match[1]) : "";
}

function createNativeSecureSecretApiRoutes(deps = {}) {
  requireFunctions(deps, ["readBody", "requireWorkspaceAccess", "sendJson"]);
  if (!deps.nativeSecureSecretBrokerService || typeof deps.nativeSecureSecretBrokerService.createSecret !== "function") {
    throw new Error("native secure secret api routes require nativeSecureSecretBrokerService.createSecret");
  }
  if (typeof deps.nativeSecureSecretBrokerService.resolveSecret !== "function") {
    throw new Error("native secure secret api routes require nativeSecureSecretBrokerService.resolveSecret");
  }

  const registry = createApiRouteRegistry(NATIVE_SECURE_SECRET_API_ROUTE_SPECS);
  const broker = deps.nativeSecureSecretBrokerService;

  function authFromContext(context = {}) {
    return context.auth || {};
  }

  function workspaceFromAuth(auth = {}) {
    return clean(auth.workspaceId || "", 120);
  }

  function requireAuthWorkspace(req, res, context = {}) {
    const auth = authFromContext(context);
    const workspaceId = workspaceFromAuth(auth);
    if (!workspaceId) {
      deps.sendJson(res, 403, { ok: false, code: "secure_secret_workspace_required", error: "secure_secret_workspace_required" });
      return "";
    }
    if (auth.auditReadOnly || auth.keySource === "audit_owner_readonly") {
      deps.sendJson(res, 403, { ok: false, code: "secure_secret_readonly_key_denied", error: "secure_secret_readonly_key_denied" });
      return "";
    }
    return deps.requireWorkspaceAccess(req, res, workspaceId);
  }

  async function handleCreate(req, res, _url, context = {}) {
    const workspaceId = requireAuthWorkspace(req, res, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, SECRET_BODY_LIMIT_BYTES).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, errorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    try {
      const result = broker.createSecret({
        auth: Object.assign({}, authFromContext(context), { workspaceId }),
        input: body,
      });
      deps.sendJson(res, 201, redactedCreateResponse(result));
      return { handled: true, status: 201 };
    } catch (err) {
      deps.sendJson(res, err.status || 400, errorPayload(err));
      return { handled: true, status: err.status || 400 };
    }
  }

  async function handleResolve(req, res, url, context = {}) {
    const workspaceId = requireAuthWorkspace(req, res, context);
    if (!workspaceId) return { handled: true, status: res.statusCode || 403 };
    const body = await deps.readBody(req, SECRET_BODY_LIMIT_BYTES).catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, body.__error.status || 400, errorPayload(body.__error));
      return { handled: true, status: body.__error.status || 400 };
    }
    try {
      const result = broker.resolveSecret({
        auth: Object.assign({}, authFromContext(context), { workspaceId }),
        secretRef: secretRefFromPath(url.pathname),
        targetPlugin: body.targetPlugin || body.target_plugin || url.searchParams.get("targetPlugin") || "codex",
        purpose: body.purpose || url.searchParams.get("purpose") || "",
        consume: body.consume !== false,
      });
      deps.sendJson(res, 200, redactedResolveResponse(result));
      return { handled: true, status: 200 };
    } catch (err) {
      deps.sendJson(res, err.status || 400, errorPayload(err));
      return { handled: true, status: err.status || 400 };
    }
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({ method: req.method || "GET", path: url?.pathname || req.url || "/" });
    if (!route) return { handled: false };
    if (route.id === "native-secure-secret-create") return handleCreate(req, res, url, context);
    if (route.id === "native-secure-secret-resolve") return handleResolve(req, res, url, context);
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
  NATIVE_SECURE_SECRET_API_ROUTE_SPECS,
  SECRET_BODY_LIMIT_BYTES,
  createNativeSecureSecretApiRoutes,
  secretRefFromPath,
};
