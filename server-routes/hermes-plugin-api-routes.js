"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const HERMES_PLUGIN_API_ROUTE_SPECS = Object.freeze([
  {
    id: "hermes-plugins-list",
    method: "GET",
    path: "/api/hermes-plugins",
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "list",
    summary: "List configured Hermes embedded app plugins.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["plugin"],
    tags: ["plugin", "manifest"],
  },
  {
    id: "hermes-plugin-manifest",
    method: "GET",
    pathRegex: /^\/api\/hermes-plugins\/[^/]+\/manifest$/,
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "manifest",
    summary: "Read a configured embedded-app plugin manifest.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin"],
    tags: ["plugin", "manifest"],
  },
  {
    id: "hermes-plugin-same-origin-proxy",
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    pathRegex: /^\/api\/hermes-plugins\/[^/]+\/proxy(?:\/|$)/,
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "sameOriginProxy",
    summary: "Proxy a local embedded plugin through the Hermes same-origin host.",
    riskLevel: "medium",
    authMode: "none",
    authRequired: false,
    workspaceScoped: true,
    resourceTypes: ["plugin", "proxy"],
    tags: ["plugin", "proxy"],
  },
]);

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`hermes plugin api routes require ${name}`);
}

function createHermesPluginApiRoutes(deps = {}) {
  for (const name of ["requireWorkspaceAccess", "sendJson"]) requireFunction(deps, name);
  if (!deps.hermesPluginService || typeof deps.hermesPluginService.manifest !== "function") {
    throw new Error("hermes plugin api routes require hermesPluginService.manifest");
  }
  if (typeof deps.hermesPluginService.list !== "function") {
    throw new Error("hermes plugin api routes require hermesPluginService.list");
  }

  const registry = createApiRouteRegistry(HERMES_PLUGIN_API_ROUTE_SPECS);

  function requestAuth(req) {
    return typeof deps.authenticateRequest === "function" ? deps.authenticateRequest(req) : null;
  }

  function ownerAuthorized(auth) {
    return typeof deps.isOwnerAuth === "function" ? deps.isOwnerAuth(auth) : false;
  }

  function requestedWorkspaceId(url) {
    return url?.searchParams?.get("workspaceId") || "owner";
  }

  async function handleList(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    deps.sendJson(res, 200, {
      ok: true,
      workspaceId,
      plugins: deps.hermesPluginService.list({
        workspaceId,
        ownerAuthorized: ownerAuthorized(requestAuth(req)),
      }).map((item) => ({
        id: item.id,
        manifestPath: `/api/hermes-plugins/${encodeURIComponent(item.id)}/manifest`,
      })),
    });
  }

  function requestedPluginId(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/manifest$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function pluginProxyUpstreamBase(pluginId) {
    if (typeof deps.hermesPluginService?.pluginManifestUrl === "function") {
      const value = deps.hermesPluginService.pluginManifestUrl(pluginId);
      try {
        return new URL(value).origin;
      } catch (_) {
        return "";
      }
    }
    return "";
  }

  function requestedProxyWorkspaceId(req, url) {
    return url?.searchParams?.get("workspaceId") || req.headers?.["x-hermes-plugin-workspace-id"] || "owner";
  }

  function requestedProxyPluginId(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/proxy(?:\/|$)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function pluginProxyPrefix(pluginId) {
    return `/api/hermes-plugins/${encodeURIComponent(pluginId)}/proxy`;
  }

  function proxyTargetUrl(url, pluginId) {
    const prefix = pluginProxyPrefix(pluginId);
    const pathname = String(url?.pathname || "");
    const upstreamPath = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : "/";
    return new URL(`${upstreamPath}${url?.search || ""}`, pluginProxyUpstreamBase(pluginId)).toString();
  }

  function responseHeader(response, name) {
    return response?.headers?.get?.(name) || response?.headers?.get?.(name.toLowerCase()) || "";
  }

  function responseSetCookies(response) {
    if (typeof response?.headers?.getSetCookie === "function") return response.headers.getSetCookie();
    const value = responseHeader(response, "set-cookie");
    return value ? [value] : [];
  }

  function rewritePluginProxyText(text = "", pluginId = "") {
    const prefix = pluginProxyPrefix(pluginId);
    return String(text)
      .replace(/(href|src)=["']\/(?!\/|api\/hermes-plugins\/[^/]+\/proxy\/)/g, `$1="${prefix}/`)
      .replace(/url\(\s*["']?\/(?!\/)/g, `url("${prefix}/`)
      .replace(/(["'`])\/api\/(?!hermes-plugins\/[^/]+\/proxy\/)/g, `$1${prefix}/api/`)
      .replace(/(["'`])\/manifest\.json/g, `$1${prefix}/manifest.json`)
      .replace(/(["'`])\/icons\//g, `$1${prefix}/icons/`)
      .replace(/(["'`])\/uploads\//g, `$1${prefix}/uploads/`);
  }

  async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async function handlePluginProxy(req, res, url) {
    const pluginId = requestedProxyPluginId(url);
    if (!pluginId || !pluginProxyUpstreamBase(pluginId)) {
      deps.sendJson(res, 404, { ok: false, error: "plugin_proxy_not_found" });
      return;
    }
    const workspaceId = requestedProxyWorkspaceId(req, url);
    const fetchImpl = deps.fetch || global.fetch;
    if (typeof fetchImpl !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "fetch_unavailable" });
      return;
    }
    const method = req.method || "GET";
    const headers = {};
    for (const [name, value] of Object.entries(req.headers || {})) {
      const lower = name.toLowerCase();
      if (["host", "connection", "content-length", "accept-encoding"].includes(lower)) continue;
      headers[name] = value;
    }
    headers["x-hermes-plugin-workspace-id"] = workspaceId;
    const body = ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : await readRequestBody(req);
    const upstream = await fetchImpl(proxyTargetUrl(url, pluginId), { method, headers, body });
    const contentType = responseHeader(upstream, "content-type");
    const outHeaders = { "Content-Type": contentType || "application/octet-stream" };
    const setCookies = responseSetCookies(upstream);
    if (setCookies.length) outHeaders["Set-Cookie"] = setCookies;
    const location = responseHeader(upstream, "location");
    if (location) {
      try {
        const target = new URL(location, pluginProxyUpstreamBase(pluginId));
        outHeaders.Location = `${pluginProxyPrefix(pluginId)}${target.pathname}${target.search}`;
      } catch (_) {
        outHeaders.Location = location;
      }
    }
    if (/text\/html|javascript|ecmascript|text\/css|application\/json/i.test(contentType || "")) {
      const text = await upstream.text();
      const rewritten = /text\/html|javascript|ecmascript|text\/css/i.test(contentType || "")
        ? rewritePluginProxyText(text, pluginId)
        : text;
      res.writeHead(upstream.status || 200, outHeaders);
      res.end(rewritten);
      return;
    }
    const arrayBuffer = await upstream.arrayBuffer();
    res.writeHead(upstream.status || 200, outHeaders);
    res.end(Buffer.from(arrayBuffer));
  }

  async function handleManifest(req, res, url) {
    const workspaceId = deps.requireWorkspaceAccess(req, res, requestedWorkspaceId(url));
    if (!workspaceId) return;
    const pluginId = requestedPluginId(url);
    if (!pluginId) {
      deps.sendJson(res, 404, { ok: false, error: "plugin_not_found" });
      return;
    }
    const manifest = await deps.hermesPluginService.manifest({
      id: pluginId,
      workspaceId,
      ownerAuthorized: ownerAuthorized(requestAuth(req)),
      appOrigin: url?.searchParams?.get("appOrigin") || "",
      launchPlugin: true,
    });
    deps.sendJson(res, 200, Object.assign({ workspaceId }, manifest));
  }

  async function handle(req, res, url) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "hermes-plugins-list") await handleList(req, res, url);
    else if (route.id === "hermes-plugin-manifest") await handleManifest(req, res, url);
    else if (route.id === "hermes-plugin-same-origin-proxy") await handlePluginProxy(req, res, url);
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
  HERMES_PLUGIN_API_ROUTE_SPECS,
  createHermesPluginApiRoutes,
};
