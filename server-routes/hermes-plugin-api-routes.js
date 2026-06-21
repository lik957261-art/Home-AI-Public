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
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["plugin", "proxy"],
    tags: ["plugin", "proxy"],
  },
]);

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`hermes plugin api routes require ${name}`);
}

function manifestAuditValue(value = "") {
  return String(value || "").trim().slice(0, 80);
}

function manifestAuditAppearance(input = {}) {
  if (!input || typeof input !== "object") return {};
  return {
    theme: manifestAuditValue(input.theme || input.appearanceTheme || input.pluginTheme),
    fontSize: manifestAuditValue(input.fontSize || input.appearanceFontSize || input.pluginFontSize),
  };
}

const PLUGIN_PROXY_DOCUMENT_CSP_BASE = Object.freeze([
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'self' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
]);

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

  function requestAuthForProxy(req, url) {
    if (typeof deps.authenticateRequest !== "function") return null;
    const originalUrl = String(req?.url || `${url?.pathname || ""}${url?.search || ""}`);
    let proxyAuthReq = req;
    try {
      const parsed = new URL(originalUrl || `${url?.pathname || ""}${url?.search || ""}`, "http://localhost");
      if (parsed.searchParams.has("key")) {
        parsed.searchParams.delete("key");
        proxyAuthReq = Object.assign({}, req, {
          auth: null,
          headers: req?.headers || {},
          url: `${parsed.pathname}${parsed.search}${parsed.hash}`,
        });
      }
    } catch (_) {
      // Fall back to normal request auth.
    }
    const auth = deps.authenticateRequest(proxyAuthReq);
    if (auth && req) req.auth = auth;
    return auth;
  }

  function ownerAuthorized(auth) {
    return typeof deps.isOwnerAuth === "function" ? deps.isOwnerAuth(auth) : false;
  }

  function ownerAuthorizedForWorkspace(auth, workspaceId) {
    return ownerAuthorized(auth) && String(workspaceId || "owner") === "owner";
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
        ownerAuthorized: ownerAuthorizedForWorkspace(requestAuth(req), workspaceId),
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

  function scopedProxyCookieWorkspaceIds(cookieHeader = "", pluginId = "") {
    const pluginPart = base64UrlEncode(pluginId);
    if (!pluginPart) return [];
    const ids = new Set();
    const cookies = String(cookieHeader || "")
      .split(";")
      .map((part) => parseCookiePair(part.trim()))
      .filter(Boolean);
    for (const pair of cookies) {
      const parts = String(pair.name || "").split("_");
      if (parts.length < 4 || parts[0] !== "hmplugin" || parts[1] !== pluginPart) continue;
      const workspaceId = base64UrlDecode(parts[2]);
      const cookieName = base64UrlDecode(parts.slice(3).join("_"));
      if (workspaceId && knownPluginSessionCookieNames(pluginId).includes(cookieName)) ids.add(workspaceId);
    }
    return [...ids];
  }

  function requestedProxyWorkspace(req, url, auth, pluginId = "") {
    const normalizedSearchParams = pluginProxySearchParams(url);
    const direct = normalizedSearchParams.get("workspaceId")
      || normalizedSearchParams.get("workspace_id")
      || req.headers?.["x-hermes-plugin-workspace-id"];
    if (direct) return { workspaceId: direct, ambiguous: false };
    const referrer = req.headers?.referer || req.headers?.referrer || "";
    if (referrer) {
      try {
        const referrerUrl = new URL(String(referrer), "http://localhost");
        const referrerWorkspaceId = referrerUrl.searchParams.get("workspaceId");
        if (referrerWorkspaceId) return { workspaceId: referrerWorkspaceId, ambiguous: false };
      } catch (_) {}
    }
    const cookieWorkspaceIds = scopedProxyCookieWorkspaceIds(req.headers?.cookie, pluginId);
    if (cookieWorkspaceIds.length === 1) return { workspaceId: cookieWorkspaceIds[0], ambiguous: false };
    if (cookieWorkspaceIds.length > 1) return { workspaceId: "", ambiguous: true };
    return { workspaceId: auth?.workspaceId || "owner", ambiguous: false };
  }

  function pluginProxyWorkspaceAuthorized(pluginId, workspaceId, auth) {
    const visiblePlugins = deps.hermesPluginService.list({
      workspaceId,
      ownerAuthorized: ownerAuthorizedForWorkspace(auth, workspaceId),
    });
    return Array.isArray(visiblePlugins) && visiblePlugins.some((plugin) => plugin?.id === pluginId);
  }

  function requestedProxyPluginId(url) {
    const match = String(url?.pathname || "").match(/^\/api\/hermes-plugins\/([^/]+)\/proxy(?:\/|$)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function isPublicMusicTidalOAuthCallback(req, url, pluginId = "") {
    if (pluginId !== "music") return false;
    if (String(req?.method || "GET").toUpperCase() !== "GET") return false;
    const pathname = String(url?.pathname || "").replace(/\/+$/, "");
    if (!pathname.endsWith("/api/v1/music/tidal/oauth/callback")) return false;
    const params = pluginProxySearchParams(url);
    const state = String(params.get("state") || "").trim();
    const code = String(params.get("code") || "").trim();
    const error = String(params.get("error") || "").trim();
    return Boolean(state && (code || error));
  }

  function pluginProxyPrefix(pluginId) {
    return `/api/hermes-plugins/${encodeURIComponent(pluginId)}/proxy`;
  }

  function proxyTargetUrl(url, pluginId) {
    const prefix = pluginProxyPrefix(pluginId);
    const pathname = String(url?.pathname || "");
    const upstreamPath = pathname.startsWith(prefix) ? pathname.slice(prefix.length) || "/" : "/";
    return new URL(`${upstreamPath}${pluginProxySearch(url)}`, pluginProxyUpstreamBase(pluginId)).toString();
  }

  function pluginProxySearch(url) {
    const search = String(url?.search || "");
    if (!search) return "";
    return `?${search.slice(1).replace(/\?/g, "&")}`;
  }

  function pluginProxySearchParams(url) {
    const search = pluginProxySearch(url);
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  }

  function base64UrlEncode(value = "") {
    return Buffer.from(String(value), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function base64UrlDecode(value = "") {
    const text = String(value || "");
    if (!/^[A-Za-z0-9_-]*$/.test(text)) return "";
    const padded = `${text}${"=".repeat((4 - (text.length % 4)) % 4)}`;
    try {
      return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    } catch (_) {
      return "";
    }
  }

  function pluginProxyCookieName(pluginId = "", workspaceId = "", cookieName = "") {
    const id = base64UrlEncode(pluginId);
    const workspace = base64UrlEncode(workspaceId || "owner");
    const name = base64UrlEncode(cookieName);
    if (!id || !workspace || !name) return "";
    return `hmplugin_${id}_${workspace}_${name}`;
  }

  function decodePluginProxyCookieName(name = "", pluginId = "", workspaceId = "") {
    const prefix = `hmplugin_${base64UrlEncode(pluginId)}_${base64UrlEncode(workspaceId || "owner")}_`;
    const text = String(name || "");
    if (!text.startsWith(prefix)) return "";
    return base64UrlDecode(text.slice(prefix.length));
  }

  function isHermesPluginProxyCookieName(name = "") {
    return String(name || "").startsWith("hmplugin_");
  }

  function knownPluginSessionCookieNames(pluginId = "") {
    if (pluginId === "wardrobe") return ["wardrobe_session"];
    if (pluginId === "finance") return ["finance_hermes_session", "finance_session"];
    if (pluginId === "codex-mobile") return ["codex_mobile_plugin_session"];
    return [];
  }

  function parseCookiePair(part = "") {
    const index = String(part).indexOf("=");
    if (index <= 0) return null;
    return {
      name: String(part).slice(0, index).trim(),
      value: String(part).slice(index + 1),
    };
  }

  function responseHeader(response, name) {
    return response?.headers?.get?.(name) || response?.headers?.get?.(name.toLowerCase()) || "";
  }

  function pluginProxyDocumentContentSecurityPolicy(pluginId = "") {
    const runtimeSecurity = typeof deps.hermesPluginService?.pluginProxyRuntimeSecurity === "function"
      ? deps.hermesPluginService.pluginProxyRuntimeSecurity({ pluginId })
      : {};
    const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
    if (runtimeSecurity?.wasmEval === true) {
      // WebKit can still gate WebAssembly behind unsafe-eval; scope it to plugins that declare wasmEval.
      scriptSrc[0] += " 'wasm-unsafe-eval' 'unsafe-eval'";
    }
    return [
      ...PLUGIN_PROXY_DOCUMENT_CSP_BASE.slice(0, 8),
      scriptSrc[0],
      ...PLUGIN_PROXY_DOCUMENT_CSP_BASE.slice(8),
    ].join("; ");
  }

  function addPluginProxyDocumentSecurityHeaders(headers = {}, pluginId = "", contentType = "") {
    if (!/text\/html/i.test(String(contentType || ""))) return headers;
    return Object.assign({}, headers, {
      "Content-Security-Policy": pluginProxyDocumentContentSecurityPolicy(pluginId),
    });
  }

  function writePluginProxyStreamChunk(res, chunk) {
    if (!chunk) return;
    res.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  async function streamPluginProxyResponse(upstream, res, status, headers = {}) {
    res.writeHead(status || 200, Object.assign({
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    }, headers));
    const body = upstream?.body;
    if (!body) {
      res.end();
      return;
    }
    if (typeof body.getReader === "function") {
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writePluginProxyStreamChunk(res, value);
        }
      } finally {
        if (typeof reader.releaseLock === "function") reader.releaseLock();
      }
      res.end();
      return;
    }
    for await (const chunk of body) writePluginProxyStreamChunk(res, chunk);
    res.end();
  }

  function responseSetCookies(response) {
    if (typeof response?.headers?.getSetCookie === "function") return response.headers.getSetCookie();
    const value = responseHeader(response, "set-cookie");
    return value ? [value] : [];
  }

  function rewritePluginProxySetCookie(cookie = "", pluginId = "", workspaceId = "") {
    const parts = String(cookie || "").split(";").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return "";
    const pair = parseCookiePair(parts[0]);
    if (!pair) return "";
    const scopedName = pluginProxyCookieName(pluginId, workspaceId, pair.name);
    if (!scopedName) return "";
    const rewritten = [`${scopedName}=${pair.value}`];
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

  function rewritePluginProxyRequestCookie(cookieHeader = "", pluginId = "", workspaceId = "") {
    const cookies = String(cookieHeader || "")
      .split(";")
      .map((part) => parseCookiePair(part.trim()))
      .filter(Boolean);
    const forwarded = [];
    for (const pair of cookies) {
      const originalName = decodePluginProxyCookieName(pair.name, pluginId, workspaceId);
      if (originalName) {
        forwarded.push(`${originalName}=${pair.value}`);
        continue;
      }
      if (isHermesPluginProxyCookieName(pair.name)) continue;
    }
    return forwarded.join("; ");
  }

  function pluginProxyExpireCookie(cookieName = "", pluginId = "") {
    const name = String(cookieName || "").trim();
    if (!name) return "";
    return `${name}=; Path=${pluginProxyPrefix(pluginId)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;
  }

  function pluginProxyCookieCleanupHeaders(pluginId = "", workspaceId = "", cookieHeader = "", options = {}) {
    const expireNames = new Set();
    const currentWorkspaceId = String(workspaceId || "owner").trim() || "owner";
    const knownNames = knownPluginSessionCookieNames(pluginId);
    if (options.resetKnown) {
      for (const name of knownNames) {
        expireNames.add(name);
        expireNames.add(pluginProxyCookieName(pluginId, "owner", name));
        expireNames.add(pluginProxyCookieName(pluginId, currentWorkspaceId, name));
      }
    }
    const cookies = String(cookieHeader || "")
      .split(";")
      .map((part) => parseCookiePair(part.trim()))
      .filter(Boolean);
    for (const pair of cookies) {
      if (knownNames.includes(pair.name)) {
        expireNames.add(pair.name);
        continue;
      }
      if (!isHermesPluginProxyCookieName(pair.name)) continue;
      const currentName = decodePluginProxyCookieName(pair.name, pluginId, currentWorkspaceId);
      if (!currentName) expireNames.add(pair.name);
    }
    return [...expireNames]
      .filter(Boolean)
      .map((name) => pluginProxyExpireCookie(name, pluginId))
      .filter(Boolean);
  }

  function withProxyWorkspaceId(proxyUrl = "", workspaceId = "") {
    const id = String(workspaceId || "owner").trim() || "owner";
    try {
      const parsed = new URL(proxyUrl, "http://localhost");
      if (!parsed.searchParams.get("workspaceId") && !parsed.searchParams.get("workspace_id")) {
        parsed.searchParams.set("workspaceId", id);
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
      return proxyUrl;
    }
  }

  function pluginProxyResourcePath(pluginId = "", resourcePath = "", workspaceId = "") {
    const path = String(resourcePath || "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return withProxyWorkspaceId(`${pluginProxyPrefix(pluginId)}${normalizedPath}`, workspaceId);
  }

  function pluginProxyTextResourcePath(pluginId = "", resourcePath = "", workspaceId = "", options = {}) {
    const path = String(resourcePath || "");
    const templateIndex = path.indexOf("${");
    if (templateIndex < 0) return pluginProxyResourcePath(pluginId, path, workspaceId);
    const staticPart = path.slice(0, templateIndex);
    const dynamicPart = path.slice(templateIndex);
    const normalizedStatic = staticPart.startsWith("/") ? staticPart : `/${staticPart}`;
    return `${pluginProxyPrefix(pluginId)}${normalizedStatic}${dynamicPart}`;
  }

  function pluginProxyScriptResourcePath(pluginId = "", resourcePath = "") {
    const path = String(resourcePath || "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${pluginProxyPrefix(pluginId)}${normalizedPath}`;
  }

  function pluginProxyQuotedApiResourcePath(pluginId = "", resourcePath = "", workspaceId = "", options = {}) {
    if (options && options.script === true) {
      const path = String(resourcePath || "");
      const templateIndex = path.indexOf("${");
      if (templateIndex >= 0) {
        const staticPart = path.slice(0, templateIndex);
        const dynamicPart = path.slice(templateIndex);
        const normalizedStatic = staticPart.startsWith("/") ? staticPart : `/${staticPart}`;
        return `${pluginProxyPrefix(pluginId)}${normalizedStatic}${dynamicPart}`;
      }
      return pluginProxyScriptResourcePath(pluginId, path);
    }
    return pluginProxyTextResourcePath(pluginId, resourcePath, workspaceId);
  }

  function proxyRequestHasLaunchToken(url) {
    return Boolean(
      url?.searchParams?.get("launch")
      || url?.searchParams?.get("codexPluginLaunch")
      || url?.searchParams?.get("financeLaunch")
    );
  }

  function sendJsonWithHeaders(res, status, data, headers = {}) {
    res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers));
    res.end(JSON.stringify(data));
  }

  function escapeRegExp(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function rewritePluginProxyText(text = "", pluginId = "", upstreamBase = "", workspaceId = "", options = {}) {
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
      out = out.replace(new RegExp(`${escapeRegExp(upstreamOrigin)}(/[^\\s"'\\\`<>)]*)`, "g"), (_match, resourcePath) => (
        options.script === true
          ? pluginProxyScriptResourcePath(pluginId, resourcePath)
          : pluginProxyResourcePath(pluginId, resourcePath, workspaceId)
      ));
    }
    return out
      .replace(/(href|src)=(["'])\/(?!\/|api\/hermes-plugins\/[^/]+\/proxy\/)([^"']*)/g, (_match, attr, quote, resourcePath) => (
        `${attr}=${quote}${pluginProxyResourcePath(pluginId, `/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(srcset)=(["'])\/(?!\/|api\/hermes-plugins\/[^/]+\/proxy\/)([^"']*)/g, (_match, attr, quote, resourcePath) => (
        `${attr}=${quote}${pluginProxyResourcePath(pluginId, `/${resourcePath}`, workspaceId)}`
      ))
      .replace(/url\(\s*(["']?)\/(?!\/)([^)"']*)\1/g, (_match, quote, resourcePath) => (
        `url(${quote}${pluginProxyResourcePath(pluginId, `/${resourcePath}`, workspaceId)}${quote}`
      ))
      .replace(/(["'`])\/api\/(?!hermes-plugins\/[^/]+\/proxy\/)([^"'`\s]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyQuotedApiResourcePath(pluginId, `/api/${resourcePath}`, workspaceId, options)}`
      ))
      .replace(/(["'`])\/manifest\.json([^"'`\s)]*)/g, (_match, quote, suffix) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/manifest.json${suffix || ""}`, workspaceId)}`
      ))
      .replace(/(["'`])\/manifest\.webmanifest([^"'`\s)]*)/g, (_match, quote, suffix) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/manifest.webmanifest${suffix || ""}`, workspaceId)}`
      ))
      .replace(/(["'`])\/icons\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/icons/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(["'`])\/uploads\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/uploads/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(["'`])\/media\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/media/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(["'`])\/images\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/images/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(["'`])\/assets\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/assets/${resourcePath}`, workspaceId)}`
      ))
      .replace(/(["'`])\/static\/([^"'`\s)]*)/g, (_match, quote, resourcePath) => (
        `${quote}${pluginProxyResourcePath(pluginId, `/static/${resourcePath}`, workspaceId)}`
      ));
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
      || text.startsWith("/api/v1/app/")
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

  function jsonKeyLooksLikePluginUrl(key = "") {
    const text = String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
    return /(?:^|_)(url|uri|href|src|image|thumb|thumbnail|preview|avatar|icon|attachment|file|download|content)(?:$|_)/.test(text);
  }

  function jsonKeyLooksLikeHtmlContent(key = "") {
    return /^(body|html|content|description|detail|richText|rich_text)$/i.test(String(key || ""));
  }

  function looksLikeLocalPluginResourcePath(value = "", pluginId = "") {
    const text = String(value || "");
    if (!text.startsWith("/") || text.startsWith("//")) return false;
    if (text === pluginProxyPrefix(pluginId) || text.startsWith(`${pluginProxyPrefix(pluginId)}/`)) return false;
    return true;
  }

  function rewritePluginProxyJsonString(value = "", pluginId = "", upstreamBase = "", workspaceId = "", key = "") {
    const text = String(value || "");
    if (!text) return text;
    if (shouldProxyJsonResourcePath(text, pluginId)) return pluginProxyResourcePath(pluginId, text, workspaceId);
    if (jsonKeyLooksLikePluginUrl(key) && looksLikeLocalPluginResourcePath(text, pluginId)) {
      return pluginProxyResourcePath(pluginId, text, workspaceId);
    }
    if (jsonKeyLooksLikeHtmlContent(key) && /(?:\bsrc=|\bhref=|url\()/i.test(text)) {
      return rewritePluginProxyText(text, pluginId, upstreamBase, workspaceId);
    }
    try {
      const upstreamOrigin = new URL(upstreamBase).origin;
      const parsed = new URL(text);
      if (upstreamOrigin && parsed.origin === upstreamOrigin && (
        shouldProxyJsonResourcePath(parsed.pathname, pluginId)
        || jsonKeyLooksLikePluginUrl(key)
      )) {
        return pluginProxyResourcePath(pluginId, `${parsed.pathname}${parsed.search}${parsed.hash}`, workspaceId);
      }
    } catch (_) {
      // Non-URL JSON strings are user/content data and must not be regex-rewritten.
    }
    return text;
  }

  function rewritePluginProxyJsonValue(value, pluginId = "", upstreamBase = "", workspaceId = "", key = "") {
    if (typeof value === "string") return rewritePluginProxyJsonString(value, pluginId, upstreamBase, workspaceId, key);
    if (Array.isArray(value)) return value.map((item) => rewritePluginProxyJsonValue(item, pluginId, upstreamBase, workspaceId, key));
    if (value && typeof value === "object") {
      const next = {};
      for (const [key, item] of Object.entries(value)) {
        next[key] = rewritePluginProxyJsonValue(item, pluginId, upstreamBase, workspaceId, key);
      }
      return next;
    }
    return value;
  }

  function rewritePluginProxyJsonText(text = "", pluginId = "", upstreamBase = "", workspaceId = "") {
    try {
      return JSON.stringify(rewritePluginProxyJsonValue(JSON.parse(String(text)), pluginId, upstreamBase, workspaceId));
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
    const auth = requestAuthForProxy(req, url);
    const publicOAuthCallback = isPublicMusicTidalOAuthCallback(req, url, pluginId);
    const workspaceRequest = publicOAuthCallback
      ? { workspaceId: "owner", ambiguous: false }
      : requestedProxyWorkspace(req, url, auth, pluginId);
    if (workspaceRequest.ambiguous) {
      deps.sendJson(res, 400, { ok: false, error: "plugin_proxy_workspace_ambiguous" });
      return;
    }
    const workspaceId = publicOAuthCallback
      ? "owner"
      : deps.requireWorkspaceAccess(req, res, workspaceRequest.workspaceId);
    if (!workspaceId) return;
    if (!publicOAuthCallback && !pluginProxyWorkspaceAuthorized(pluginId, workspaceId, auth)) {
      deps.sendJson(res, 403, { ok: false, error: "plugin_workspace_not_authorized" });
      return;
    }
    const fetchImpl = deps.fetch || global.fetch;
    if (typeof fetchImpl !== "function") {
      deps.sendJson(res, 503, { ok: false, error: "fetch_unavailable" });
      return;
    }
    const method = req.method || "GET";
    const upstreamBase = pluginProxyUpstreamBase(pluginId);
    const targetUrl = proxyTargetUrl(url, pluginId);
    const headers = {};
    for (const [name, value] of Object.entries(req.headers || {})) {
      const lower = name.toLowerCase();
      if (["host", "connection", "content-length", "accept-encoding", "origin", "referer"].includes(lower)) continue;
      if (lower === "authorization") continue;
      if (lower === "cookie") continue;
      headers[name] = value;
    }
    const hasLaunchToken = proxyRequestHasLaunchToken(url);
    const upstreamCookie = hasLaunchToken
      ? ""
      : rewritePluginProxyRequestCookie(req.headers?.cookie, pluginId, workspaceId);
    if (upstreamCookie) headers.cookie = upstreamCookie;
    headers["x-hermes-plugin-workspace-id"] = workspaceId;
    headers["x-hermes-plugin-actor-workspace-id"] = String(auth?.workspaceId || "");
    headers["x-hermes-plugin-actor-role"] = ownerAuthorized(auth) ? "owner" : "workspace";
    if (typeof deps.hermesPluginService?.pluginProxyAuthorizationHeader === "function") {
      const authorization = deps.hermesPluginService.pluginProxyAuthorizationHeader({ pluginId, workspaceId });
      if (authorization) headers.Authorization = authorization;
    }
    const publicOrigin = originFromRequest(req);
    if (publicOrigin) {
      headers["x-hermes-public-origin"] = publicOrigin;
      headers["x-forwarded-origin"] = publicOrigin;
    }
    if (!["GET", "HEAD"].includes(method.toUpperCase())) {
      try {
        headers.origin = new URL(upstreamBase).origin;
        headers.referer = targetUrl;
      } catch (_) {
        // Keep proxying even if a plugin origin is misconfigured.
      }
    }
    const body = ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : await readRequestBody(req);
    const upstream = await fetchImpl(targetUrl, { method, headers, body, redirect: "manual" });
    const contentType = responseHeader(upstream, "content-type");
    let outHeaders = { "Content-Type": contentType || "application/octet-stream" };
    outHeaders = addPluginProxyDocumentSecurityHeaders(outHeaders, pluginId, contentType);
    const setCookies = [
      ...pluginProxyCookieCleanupHeaders(pluginId, workspaceId, req.headers?.cookie, { resetKnown: hasLaunchToken }),
      ...responseSetCookies(upstream)
      .map((cookie) => rewritePluginProxySetCookie(cookie, pluginId, workspaceId))
      .filter(Boolean),
    ];
    if (setCookies.length) outHeaders["Set-Cookie"] = setCookies;
    const location = responseHeader(upstream, "location");
    if (location) {
      outHeaders.Location = rewritePluginProxyLocationHeader(location, pluginId, workspaceId);
    }
    if (/application\/json/i.test(contentType || "")) {
      const text = await upstream.text();
      const rewritten = rewritePluginProxyJsonText(text, pluginId, upstreamBase, workspaceId);
      res.writeHead(upstream.status || 200, outHeaders);
      res.end(rewritten);
      return;
    }
    if (/text\/event-stream/i.test(contentType || "")) {
      await streamPluginProxyResponse(upstream, res, upstream.status || 200, outHeaders);
      return;
    }
    if (/text\/html|javascript|ecmascript|text\/css/i.test(contentType || "")) {
      const text = await upstream.text();
      const isScript = /javascript|ecmascript/i.test(contentType || "");
      let rewritten = rewritePluginProxyText(text, pluginId, upstreamBase, workspaceId, { script: isScript });
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
      ownerAuthorized: ownerAuthorizedForWorkspace(requestAuth(req), workspaceId),
      appOrigin: url?.searchParams?.get("appOrigin") || "",
      appearance: {
        theme: url?.searchParams?.get("appearanceTheme") || "",
        fontSize: url?.searchParams?.get("appearanceFontSize") || "",
      },
      launchPlugin: true,
    });
    if (typeof deps.auditPluginManifestRequest === "function") {
      deps.auditPluginManifestRequest({
        eventType: "plugin_manifest_request",
        pluginId,
        workspaceId,
        appOriginPresent: Boolean(url?.searchParams?.get("appOrigin")),
        requestedAppearance: manifestAuditAppearance({
          theme: url?.searchParams?.get("appearanceTheme") || "",
          fontSize: url?.searchParams?.get("appearanceFontSize") || "",
        }),
        responseAppearance: manifestAuditAppearance(manifest?.embed?.appearance || manifest?.appearance || {}),
        available: manifest?.available === true,
        code: manifestAuditValue(manifest?.code),
        tokenStatus: manifestAuditValue(manifest?.embed?.tokenStatus),
        sameOriginProxy: manifest?.embed?.sameOriginProxy === true,
      });
    }
    const cleanupCookies = pluginProxyCookieCleanupHeaders(pluginId, workspaceId, req.headers?.cookie, { resetKnown: true });
    sendJsonWithHeaders(
      res,
      200,
      Object.assign({ workspaceId }, manifest),
      cleanupCookies.length ? { "Set-Cookie": cleanupCookies } : {},
    );
  }

  function rewritePluginProxyLocationHeader(location = "", pluginId = "", workspaceId = "") {
    const rawLocation = String(location || "");
    const upstreamBase = pluginProxyUpstreamBase(pluginId);
    if (!rawLocation || !upstreamBase) return rawLocation;
    try {
      const upstream = new URL(upstreamBase);
      const target = new URL(rawLocation, upstream);
      if (target.origin !== upstream.origin) return rawLocation;
      return withProxyWorkspaceId(`${pluginProxyPrefix(pluginId)}${target.pathname}${target.search}${target.hash}`, workspaceId);
    } catch (_) {
      return rawLocation;
    }
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
    const result = await deps.hermesPluginService.grantWorkspace({
      id: pluginId,
      workspaceId: body.workspaceId || body.workspace_id,
      displayName: body.displayName || body.display_name || body.workspaceLabel || body.workspace_label,
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
