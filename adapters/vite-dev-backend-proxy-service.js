"use strict";

const VITE_DEV_BACKEND_PROXY_VERSION = "20260703-vite-dev-backend-proxy-v1";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function stringValue(value) {
  return String(value || "").trim();
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(stringValue(value));
}

function parseHttpBaseUrl(value) {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch (_error) {
    return null;
  }
}

function requestUrl(request = {}) {
  try {
    return new URL(String(request.url || "/"), "http://vite.local");
  } catch (_error) {
    return new URL("/", "http://vite.local");
  }
}

function routeKind(request = {}) {
  const method = stringValue(request.method || "GET").toUpperCase();
  const url = requestUrl(request);
  if (method === "GET" && url.pathname === "/api/events") return "event_stream";
  if (method === "GET" && /^\/api\/threads\/[^/]+$/.test(url.pathname)) return "thread_read";
  if (method === "POST" && /^\/api\/threads\/[^/]+\/messages$/.test(url.pathname)) return "composer_send";
  if (method === "POST" && /^\/api\/threads\/[^/]+\/interrupt$/.test(url.pathname)) return "composer_interrupt";
  if (method === "POST" && /^\/api\/threads\/[^/]+\/uploads$/.test(url.pathname)) return "attachment_upload";
  if (method === "POST" && /^\/api\/threads\/[^/]+\/server-file-attachments$/.test(url.pathname)) return "server_file_attachment";
  return "";
}

function resolveViteDevBackendProxyConfig(env = process.env) {
  const requested = truthy(env.HOMEAI_VITE_DEV_BACKEND_PROXY || env.HOMEAI_VITE_REAL_BACKEND_PROXY);
  const baseUrl = parseHttpBaseUrl(env.HOMEAI_VITE_DEV_BACKEND_BASE || env.HOMEAI_VITE_REAL_BACKEND_BASE);
  let blockedReason = "";
  if (requested && !baseUrl) blockedReason = "backend_base_url_invalid_or_missing";
  return Object.freeze({
    version: VITE_DEV_BACKEND_PROXY_VERSION,
    requested,
    enabled: Boolean(requested && baseUrl),
    baseUrl: baseUrl ? baseUrl.href.replace(/\/$/, "") : "",
    blockedReason,
  });
}

function viteDevBackendProxyRouteApplies(request = {}, config = resolveViteDevBackendProxyConfig()) {
  return Boolean(config.enabled && routeKind(request));
}

function viteDevBackendProxyBlockedRouteApplies(request = {}, config = resolveViteDevBackendProxyConfig()) {
  return Boolean(config.requested && !config.enabled && routeKind(request));
}

function sanitizeProxyRequestHeaders(headers = {}, targetUrl = "") {
  const target = parseHttpBaseUrl(targetUrl);
  const output = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const normalized = String(name || "").toLowerCase();
    if (!normalized || HOP_BY_HOP_HEADERS.has(normalized)) continue;
    if (normalized === "host") continue;
    output[normalized] = value;
  }
  if (target) output.host = target.host;
  return output;
}

function createViteDevBackendProxyRequest(request = {}, config = resolveViteDevBackendProxyConfig()) {
  if (!viteDevBackendProxyRouteApplies(request, config)) {
    return Object.freeze({
      ok: false,
      code: config.blockedReason || "vite_dev_backend_proxy_route_not_enabled",
    });
  }
  const sourceUrl = requestUrl(request);
  const baseUrl = new URL(config.baseUrl);
  const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, baseUrl);
  const headers = sanitizeProxyRequestHeaders(request.headers || {}, targetUrl.href);
  return Object.freeze({
    ok: true,
    code: "",
    version: VITE_DEV_BACKEND_PROXY_VERSION,
    routeKind: routeKind(request),
    method: stringValue(request.method || "GET").toUpperCase(),
    targetUrl: targetUrl.href,
    headers: Object.freeze(headers),
  });
}

module.exports = {
  VITE_DEV_BACKEND_PROXY_VERSION,
  createViteDevBackendProxyRequest,
  resolveViteDevBackendProxyConfig,
  sanitizeProxyRequestHeaders,
  viteDevBackendProxyBlockedRouteApplies,
  viteDevBackendProxyRouteApplies,
};
