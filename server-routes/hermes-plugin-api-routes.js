"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const HERMES_PLUGIN_API_ROUTE_SPECS = Object.freeze([
  {
    id: "hermes-plugins-admin-list",
    method: "GET",
    path: "/api/hermes-plugins/admin",
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "adminList",
    summary: "Owner-only list of installed embedded plugins and workspace grants.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "workspace"],
    tags: ["plugin", "authorization"],
  },
  {
    id: "hermes-plugin-workspace-grant",
    method: "POST",
    pathRegex: /^\/api\/hermes-plugins\/[^/]+\/workspaces$/,
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "grantWorkspace",
    summary: "Owner-only grant of a plugin to a workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "workspace"],
    tags: ["plugin", "authorization"],
  },
  {
    id: "hermes-plugin-workspace-revoke",
    method: "DELETE",
    pathRegex: /^\/api\/hermes-plugins\/[^/]+\/workspaces\/[^/]+$/,
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "revokeWorkspace",
    summary: "Owner-only revoke of a plugin from a workspace.",
    riskLevel: "owner",
    authMode: "owner",
    authRequired: true,
    ownerOnly: true,
    resourceTypes: ["plugin", "workspace"],
    tags: ["plugin", "authorization"],
  },
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
    id: "hermes-plugin-notification",
    method: "POST",
    pathRegex: /^\/api\/hermes-plugins\/[^/]+\/notifications$/,
    group: "plugins",
    moduleKey: "hermes-plugins",
    handlerKey: "notification",
    summary: "Accept a plugin event and let Hermes Mobile create Inbox/Web Push notification surfaces.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin", "action-inbox", "web-push"],
    tags: ["plugin", "notification", "action-inbox", "web-push"],
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
  if (typeof deps.requireOwner !== "function") {
    throw new Error("hermes plugin api routes require requireOwner");
  }
  if (deps.hermesPluginNotificationService && typeof deps.hermesPluginNotificationService.postNotification !== "function") {
    throw new Error("hermes plugin api routes require hermesPluginNotificationService.postNotification");
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

  function originFromRequest(req) {
    const headers = req?.headers || {};
    const explicit = headers["x-hermes-public-origin"] || headers["x-forwarded-origin"] || headers.origin;
    if (explicit) {
      try {
        return new URL(String(explicit)).origin;
      } catch (_) {
        return "";
      }
    }
    const host = headers["x-forwarded-host"] || headers.host;
    if (!host) return "";
    const proto = headers["x-forwarded-proto"] || "http";
    try {
      return new URL(`${proto}://${host}`).origin;
    } catch (_) {
      return "";
    }
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

  function requestedWorkspaceGrantPluginId(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/workspaces$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function requestedWorkspaceRevoke(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/workspaces\/([^/]+)$/);
    return match ? { pluginId: decodeURIComponent(match[1]), workspaceId: decodeURIComponent(match[2]) } : {};
  }

  function requestedNotificationPluginId(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/notifications$/);
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

  function rewritePluginProxySetCookie(cookie = "", pluginId = "") {
    const parts = String(cookie || "").split(";").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return "";
    const rewritten = [parts[0]];
    let hasPath = false;
    for (const part of parts.slice(1)) {
      const lower = part.toLowerCase();
      if (lower.startsWith("domain=")) continue;
      if (lower.startsWith("path=")) {
        rewritten.push(`Path=${pluginProxyPrefix(pluginId)}`);
        hasPath = true;
        continue;
      }
      rewritten.push(part);
    }
    if (!hasPath) rewritten.push(`Path=${pluginProxyPrefix(pluginId)}`);
    return rewritten.join("; ");
  }

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rewritePluginProxyText(text = "", pluginId = "", upstreamBase = "") {
    const prefix = pluginProxyPrefix(pluginId);
    let out = String(text);
    const upstreamOrigin = (() => {
      try {
        return new URL(upstreamBase).origin;
      } catch (_) {
        return "";
      }
    })();
    if (upstreamOrigin) {
      out = out.replace(new RegExp(`${escapeRegExp(upstreamOrigin)}(?=/)`, "g"), prefix);
    }
    return out
      .replace(/(href|src)=["']\/(?!\/|api\/hermes-plugins\/[^/]+\/proxy\/)/g, `$1="${prefix}/`)
      .replace(/(srcset)=["']\/(?!\/|api\/hermes-plugins\/[^/]+\/proxy\/)/g, `$1="${prefix}/`)
      .replace(/url\(\s*["']?\/(?!\/)/g, `url("${prefix}/`)
      .replace(/(["'`])\/api\/(?!hermes-plugins\/[^/]+\/proxy\/)/g, `$1${prefix}/api/`)
      .replace(/(["'`])\/manifest\.json/g, `$1${prefix}/manifest.json`)
      .replace(/(["'`])\/manifest\.webmanifest/g, `$1${prefix}/manifest.webmanifest`)
      .replace(/(["'`])\/icons\//g, `$1${prefix}/icons/`)
      .replace(/(["'`])\/uploads\//g, `$1${prefix}/uploads/`)
      .replace(/(["'`])\/media\//g, `$1${prefix}/media/`)
      .replace(/(["'`])\/images\//g, `$1${prefix}/images/`)
      .replace(/(["'`])\/assets\//g, `$1${prefix}/assets/`)
      .replace(/(["'`])\/static\//g, `$1${prefix}/static/`);
  }

  function rewritePluginProxyCssText(text = "", pluginId = "") {
    let out = String(text || "");
    if (pluginId === "wardrobe" && /\.upload-btn\s+input\s*\{[\s\S]*?display:\s*none\s*;[\s\S]*?\}/.test(out)) {
      out += `

/* Hermes embedded-plugin upload compatibility: keep file inputs interactive in iOS/PWA iframes. */
.upload-btn {
  overflow: hidden;
}

.upload-btn input[type="file"],
.upload-btn input.entity-photo-input {
  position: absolute;
  inset: 0;
  display: block !important;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
`;
    }
    return out;
  }

  function shouldProxyJsonResourcePath(value = "", pluginId = "") {
    const text = String(value || "");
    if (!text.startsWith("/") || text.startsWith("//")) return false;
    if (text === pluginProxyPrefix(pluginId) || text.startsWith(`${pluginProxyPrefix(pluginId)}/`)) return false;
    return text.startsWith("/icons/")
      || text.startsWith("/api/uploads/")
      || text.startsWith("/api/generated-images/file")
      || text.startsWith("/api/files/preview/content")
      || (pluginId === "finance" && text.startsWith("/api/finance/"))
      || text.startsWith("/api/photos/")
      || text.startsWith("/api/outfit-photos/")
      || text.startsWith("/api/featured-look-photos/")
      || /^\/api\/v1\/items\/[^/]+\/photos\/[^?#]+(?:[?#].*)?$/.test(text)
      || text.startsWith("/uploads/")
      || text.startsWith("/media/")
      || text.startsWith("/images/")
      || text.startsWith("/assets/")
      || text.startsWith("/static/");
  }

  function rewritePluginProxyJsonString(value = "", pluginId = "", upstreamBase = "") {
    const text = String(value || "");
    const prefix = pluginProxyPrefix(pluginId);
    if (!text) return text;
    if (shouldProxyJsonResourcePath(text, pluginId)) return `${prefix}${text}`;
    try {
      const upstreamOrigin = new URL(upstreamBase).origin;
      const parsed = new URL(text);
      if (upstreamOrigin && parsed.origin === upstreamOrigin && shouldProxyJsonResourcePath(parsed.pathname, pluginId)) {
        return `${prefix}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch (_) {
      // Non-URL JSON strings are user/content data and must not be regex-rewritten.
    }
    return text;
  }

  function rewritePluginProxyJsonValue(value, pluginId = "", upstreamBase = "") {
    if (typeof value === "string") return rewritePluginProxyJsonString(value, pluginId, upstreamBase);
    if (Array.isArray(value)) return value.map((item) => rewritePluginProxyJsonValue(item, pluginId, upstreamBase));
    if (value && typeof value === "object") {
      const next = {};
      for (const [key, item] of Object.entries(value)) {
        next[key] = rewritePluginProxyJsonValue(item, pluginId, upstreamBase);
      }
      return next;
    }
    return value;
  }

  function rewritePluginProxyJsonText(text = "", pluginId = "", upstreamBase = "") {
    try {
      return JSON.stringify(rewritePluginProxyJsonValue(JSON.parse(String(text)), pluginId, upstreamBase));
    } catch (_) {
      return String(text);
    }
  }

  async function readRequestBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async function readJsonBody(req) {
    if (typeof deps.readBody === "function") return deps.readBody(req).catch(() => ({}));
    const body = await readRequestBody(req);
    if (!body.length) return {};
    try {
      return JSON.parse(body.toString("utf8"));
    } catch (_) {
      return {};
    }
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
    const publicOrigin = originFromRequest(req);
    if (publicOrigin) {
      headers["x-hermes-public-origin"] = publicOrigin;
      headers["x-forwarded-origin"] = publicOrigin;
    }
    const body = ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : await readRequestBody(req);
    const upstreamBase = pluginProxyUpstreamBase(pluginId);
    const upstream = await fetchImpl(proxyTargetUrl(url, pluginId), { method, headers, body, redirect: "manual" });
    const contentType = responseHeader(upstream, "content-type");
    const outHeaders = { "Content-Type": contentType || "application/octet-stream" };
    const setCookies = responseSetCookies(upstream)
      .map((cookie) => rewritePluginProxySetCookie(cookie, pluginId))
      .filter(Boolean);
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
    if (/application\/json/i.test(contentType || "")) {
      const text = await upstream.text();
      const rewritten = rewritePluginProxyJsonText(text, pluginId, upstreamBase);
      res.writeHead(upstream.status || 200, outHeaders);
      res.end(rewritten);
      return;
    }
    if (/text\/html|javascript|ecmascript|text\/css/i.test(contentType || "")) {
      const text = await upstream.text();
      let rewritten = rewritePluginProxyText(text, pluginId, upstreamBase);
      if (/text\/css/i.test(contentType || "")) rewritten = rewritePluginProxyCssText(rewritten, pluginId);
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
      appearance: {
        theme: url?.searchParams?.get("appearanceTheme") || "",
        fontSize: url?.searchParams?.get("appearanceFontSize") || "",
      },
      launchPlugin: true,
    });
    deps.sendJson(res, 200, Object.assign({ workspaceId }, manifest));
  }

  async function handleAdminList(req, res) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    if (typeof deps.hermesPluginService.listInstalled !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "plugin_admin_unavailable" });
      return;
    }
    deps.sendJson(res, 200, {
      ok: true,
      plugins: deps.hermesPluginService.listInstalled(),
    });
  }

  async function handleWorkspaceGrant(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    if (typeof deps.hermesPluginService.grantWorkspace !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "plugin_admin_unavailable" });
      return;
    }
    const pluginId = requestedWorkspaceGrantPluginId(url);
    const body = await readJsonBody(req);
    const result = deps.hermesPluginService.grantWorkspace({
      id: pluginId,
      workspaceId: body.workspaceId || body.workspace_id,
      actor: owner.workspaceId || "owner",
    });
    if (!result?.ok) {
      deps.sendJson(res, Number(result?.status || 400), { ok: false, error: result?.error || "plugin_workspace_grant_failed" });
      return;
    }
    deps.sendJson(res, 200, result);
  }

  async function handleWorkspaceRevoke(req, res, url) {
    const owner = deps.requireOwner(req, res);
    if (!owner) return;
    if (typeof deps.hermesPluginService.revokeWorkspace !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "plugin_admin_unavailable" });
      return;
    }
    const target = requestedWorkspaceRevoke(url);
    const result = deps.hermesPluginService.revokeWorkspace(target);
    if (!result?.ok) {
      deps.sendJson(res, Number(result?.status || 400), { ok: false, error: result?.error || "plugin_workspace_revoke_failed" });
      return;
    }
    deps.sendJson(res, 200, result);
  }

  async function handleNotification(req, res, url, context = {}) {
    if (!deps.hermesPluginNotificationService) {
      deps.sendJson(res, 503, { ok: false, error: "plugin_notification_service_unavailable" });
      return;
    }
    const pluginId = requestedNotificationPluginId(url);
    if (!pluginId) {
      deps.sendJson(res, 404, { ok: false, error: "plugin_not_found" });
      return;
    }
    const body = await readJsonBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || body.workspace_id || requestedWorkspaceId(url));
    if (!workspaceId) return;
    const result = await deps.hermesPluginNotificationService.postNotification(Object.assign({}, body, {
      pluginId,
      workspaceId,
      auth: context.auth || requestAuth(req),
    }));
    if (!result?.ok) {
      deps.sendJson(res, Number(result?.status || 400), {
        ok: false,
        error: result?.error || "plugin_notification_failed",
      });
      return;
    }
    if (typeof deps.broadcast === "function") {
      deps.broadcast({
        type: "actionInbox.updated",
        workspaceId,
        itemId: result.inboxItem?.id || "",
        sourceType: "plugin",
        pluginId,
      });
    }
    deps.sendJson(res, 202, result);
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };
    if (route.id === "hermes-plugins-admin-list") await handleAdminList(req, res);
    else if (route.id === "hermes-plugin-workspace-grant") await handleWorkspaceGrant(req, res, url);
    else if (route.id === "hermes-plugin-workspace-revoke") await handleWorkspaceRevoke(req, res, url);
    else if (route.id === "hermes-plugins-list") await handleList(req, res, url);
    else if (route.id === "hermes-plugin-manifest") await handleManifest(req, res, url);
    else if (route.id === "hermes-plugin-notification") await handleNotification(req, res, url, context);
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
