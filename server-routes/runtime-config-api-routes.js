"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function boolParam(value) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function redactGeneratedWebPushConfig(value) {
  const generated = value && typeof value === "object" ? Object.assign({}, value) : {};
  delete generated.privateKey;
  delete generated.private_key;
  return generated;
}

function createRuntimeConfigApiRoutes(deps = {}) {
  const {
    generateWebPushVapidConfig,
    getHermesStatus,
    publicPushStatus,
    publicRuntimeConfig,
    readBody,
    refreshGatewayRuntimeConfig = () => true,
    reloadWebPush,
    requireOwner,
    runConcurrencySnapshot,
    saveRuntimeConfig,
    sendJson,
  } = deps;

  for (const [name, value] of Object.entries({
    generateWebPushVapidConfig,
    getHermesStatus,
    publicPushStatus,
    publicRuntimeConfig,
    readBody,
    reloadWebPush,
    requireOwner,
    runConcurrencySnapshot,
    saveRuntimeConfig,
    sendJson,
  })) {
    if (typeof value !== "function") throw new Error(`runtime config api routes require ${name}`);
  }

  const registry = createApiRouteRegistry([
    {
      id: "runtime-config",
      method: ["GET", "PATCH"],
      path: "/api/runtime-config",
      group: "runtime-config",
      moduleKey: "runtime-config",
      riskLevel: "owner",
      authMode: "owner",
      ownerOnly: true,
      resourceTypes: ["runtime-config"],
    },
    {
      id: "runtime-config-test",
      method: "POST",
      path: "/api/runtime-config/test",
      group: "runtime-config",
      moduleKey: "runtime-config",
      riskLevel: "owner",
      authMode: "owner",
      ownerOnly: true,
      resourceTypes: ["runtime-config", "gateway"],
    },
    {
      id: "runtime-config-web-push-generate",
      method: "POST",
      path: "/api/runtime-config/web-push/generate",
      group: "runtime-config",
      moduleKey: "runtime-config",
      riskLevel: "owner",
      authMode: "owner",
      ownerOnly: true,
      resourceTypes: ["runtime-config", "web-push"],
    },
    {
      id: "runtime-config-web-push-reload",
      method: "POST",
      path: "/api/runtime-config/web-push/reload",
      group: "runtime-config",
      moduleKey: "runtime-config",
      riskLevel: "owner",
      authMode: "owner",
      ownerOnly: true,
      resourceTypes: ["runtime-config", "web-push"],
    },
  ]);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const ownerAuth = requireOwner(req, res);
    if (!ownerAuth) return { handled: true, route };

    if (route.id === "runtime-config" && req.method === "GET") {
      sendJson(res, 200, { ok: true, config: publicRuntimeConfig() });
      return { handled: true, route };
    }

    if (route.id === "runtime-config" && req.method === "PATCH") {
      const body = await readBody(req).catch((err) => ({ __error: err }));
      if (body.__error) {
        sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
        return { handled: true, route };
      }
      try {
        saveRuntimeConfig(body, ownerAuth.principalId || "owner");
        reloadWebPush();
        refreshGatewayRuntimeConfig();
        sendJson(res, 200, { ok: true, config: publicRuntimeConfig(), push: publicPushStatus() });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || String(err) });
      }
      return { handled: true, route };
    }

    if (route.id === "runtime-config-web-push-generate") {
      const body = await readBody(req).catch(() => ({}));
      try {
        const generated = redactGeneratedWebPushConfig(generateWebPushVapidConfig({ overwrite: boolParam(body.overwrite) }));
        sendJson(res, 201, { ok: true, generated, config: publicRuntimeConfig(), push: publicPushStatus() });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || String(err), config: publicRuntimeConfig(), push: publicPushStatus() });
      }
      return { handled: true, route };
    }

    if (route.id === "runtime-config-web-push-reload") {
      const config = reloadWebPush();
      sendJson(res, 200, { ok: Boolean(config), config: publicRuntimeConfig(), push: publicPushStatus() });
      return { handled: true, route };
    }

    if (route.id === "runtime-config-test") {
      const status = await getHermesStatus();
      status.concurrency = runConcurrencySnapshot();
      sendJson(res, 200, { ok: Boolean(status.ok), status, config: publicRuntimeConfig() });
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
  createRuntimeConfigApiRoutes,
};
