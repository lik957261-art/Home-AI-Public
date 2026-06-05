"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

function createPublicApiRoutes(deps = {}) {
  const {
    authenticateRequest,
    createInitialOwnerKey,
    ownerSetupStatus,
    readBody,
    sendJson,
  } = deps;

  for (const [name, value] of Object.entries({
    authenticateRequest,
    createInitialOwnerKey,
    ownerSetupStatus,
    readBody,
    sendJson,
  })) {
    if (typeof value !== "function") throw new Error(`public api routes require ${name}`);
  }

  const registry = createApiRouteRegistry([
    {
      id: "public-config",
      path: "/api/public-config",
      group: "setup",
      riskLevel: "public",
      authRequired: false,
    },
    {
      id: "setup-status",
      method: "GET",
      path: "/api/setup/status",
      group: "setup",
      riskLevel: "public",
      authRequired: false,
    },
    {
      id: "setup-owner",
      method: "POST",
      path: "/api/setup/owner",
      group: "setup",
      riskLevel: "public",
      authRequired: false,
    },
    {
      id: "login",
      method: "POST",
      path: "/api/login",
      group: "auth",
      riskLevel: "public",
      authRequired: false,
    },
  ]);

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "public-config") {
      sendJson(res, 200, Object.assign({ title: "Home AI" }, ownerSetupStatus()));
      return { handled: true, route };
    }

    if (route.id === "setup-status") {
      sendJson(res, 200, ownerSetupStatus());
      return { handled: true, route };
    }

    if (route.id === "setup-owner") {
      try {
        await readBody(req).catch(() => ({}));
        const result = createInitialOwnerKey();
        res.writeHead(201, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": `hermes_web_key=${encodeURIComponent(result.key || "")}; Path=/; Max-Age=31536000; SameSite=Lax`,
        });
        res.end(JSON.stringify(Object.assign({ ok: true }, result, ownerSetupStatus())));
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message || String(err), setup: ownerSetupStatus() });
      }
      return { handled: true, route };
    }

    if (route.id === "login") {
      const body = await readBody(req);
      const probe = { headers: Object.assign({}, req.headers, { "x-hermes-web-key": body.key || "" }), url: req.url };
      const auth = authenticateRequest(probe);
      if (!auth.ok) {
        sendJson(res, 401, { error: "Invalid key" });
        return { handled: true, route };
      }
      res.writeHead(204, {
        "Set-Cookie": `hermes_web_key=${encodeURIComponent(body.key || "")}; Path=/; Max-Age=31536000; SameSite=Lax`,
        "Cache-Control": "no-store",
      });
      res.end();
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
  createPublicApiRoutes,
};
