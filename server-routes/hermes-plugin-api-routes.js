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
    id: "hermes-plugin-codex-mobile-proxy",
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    pathPrefix: "/api/hermes-plugins/codex-mobile/proxy",
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "codexMobileProxy",
    summary: "Proxy the local Codex Mobile plugin through the Hermes same-origin host.",
    riskLevel: "medium",
    authMode: "none",
    authRequired: false,
    workspaceScoped: true,
    resourceTypes: ["plugin", "proxy"],
    tags: ["plugin", "codex-mobile", "proxy"],
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

  function codexProxyUpstreamBase() {
    if (typeof deps.hermesPluginService?.pluginManifestUrl === "function") {
      const value = deps.hermesPluginService.pluginManifestUrl("codex-mobile");
      try {
        return new URL(value).origin;
      } catch (_) {
        return "";
      }
    }
    return process.env.HERMES_MOBILE_CODEX_PLUGIN_UPSTREAM_ORIGIN || "http://127.0.0.1:8787";
  }

  function requestedProxyWorkspaceId(req, url) {
    return url?.searchParams?.get("workspaceId") || req.headers?.["x-hermes-plugin-workspace-id"] || "owner";
  }

  function proxyTargetUrl(url) {
    const prefix = "/api/hermes-plugins/codex-mobile/proxy";
    const pathname = String(url?.pathname || "");
    const upstreamPath = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : "/";
    return new URL(`${upstreamPath}${url?.search || ""}`, codexProxyUpstreamBase()).toString();
  }

  function responseHeader(response, name) {
    return response?.headers?.get?.(name) || response?.headers?.get?.(name.toLowerCase()) || "";
  }

  function rewriteCodexProxyText(text = "") {
    const prefix = "/api/hermes-plugins/codex-mobile/proxy";
    return String(text)
      .replace(/(href|src)=["']\/(?!\/|api\/hermes-plugins\/codex-mobile\/proxy\/)/g, `$1="${prefix}/`)
      .replace(/url\(\s*["']?\/(?!\/)/g, `url("${prefix}/`)
      .replace(/(["'`])\/api\/(?!hermes-plugins\/codex-mobile\/proxy\/)/g, `$1${prefix}/api/`)
      .replace(/(["'`])\/manifest\.json/g, `$1${prefix}/manifest.json`)
      .replace(/(["'`])\/icons\//g, `$1${prefix}/icons/`)
      .replace(/(["'`])\/uploads\//g, `$1${prefix}/uploads/`);
  }

  async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async function handleCodexProxy(req, res, url) {
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
    const upstream = await fetchImpl(proxyTargetUrl(url), { method, headers, body });
    const contentType = responseHeader(upstream, "content-type");
    const outHeaders = { "Content-Type": contentType || "application/octet-stream" };
    const location = responseHeader(upstream, "location");
    if (location) {
      try {
        const target = new URL(location, codexProxyUpstreamBase());
        outHeaders.Location = `/api/hermes-plugins/codex-mobile/proxy${target.pathname}${target.search}`;
      } catch (_) {
        outHeaders.Location = location;
      }
    }
    if (/text\/html|javascript|ecmascript|text\/css|application\/json/i.test(contentType || "")) {
      const text = await upstream.text();
      const rewritten = /text\/html|javascript|ecmascript|text\/css/i.test(contentType || "")
        ? rewriteCodexProxyText(text)
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
    else if (route.id === "hermes-plugin-codex-mobile-proxy") await handleCodexProxy(req, res, url);
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
