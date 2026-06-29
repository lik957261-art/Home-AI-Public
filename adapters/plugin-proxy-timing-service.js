"use strict";

const fs = require("node:fs");
const path = require("node:path");

function cleanToken(value = "", fallback = "", maxLength = 120) {
  const text = String(value || "")
    .replace(/[^a-z0-9_.:-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return text || fallback;
}

function cleanMethod(value = "") {
  const method = String(value || "GET").trim().toUpperCase();
  return /^[A-Z]{1,12}$/.test(method) ? method : "GET";
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function contentTypeFamily(contentType = "") {
  const text = String(contentType || "").toLowerCase();
  if (text.includes("application/json")) return "json";
  if (text.includes("text/event-stream")) return "event_stream";
  if (text.includes("text/html")) return "html";
  if (text.includes("javascript") || text.includes("ecmascript")) return "javascript";
  if (text.includes("text/css")) return "css";
  if (text.startsWith("image/")) return "image";
  if (text.startsWith("text/")) return "text";
  if (text) return "binary";
  return "unknown";
}

function safePathnameFromUrl(value = "") {
  try {
    return new URL(String(value || ""), "http://localhost").pathname || "/";
  } catch (_) {
    return "/";
  }
}

function routeKindForProxyTarget(input = {}) {
  const pluginId = cleanToken(input.pluginId, "plugin", 80);
  const pathname = safePathnameFromUrl(input.targetUrl || input.requestPath || "/");
  if (pluginId === "codex-mobile") {
    if (/^\/api\/threads\/[^/]+(?:\/|$)/.test(pathname)) return "codex_thread_detail";
    if (pathname === "/api/threads" || pathname.startsWith("/api/threads?")) return "codex_thread_list";
    if (pathname === "/api/events") return "codex_events";
    if (pathname.startsWith("/api/")) return "codex_api";
    if (pathname === "/" || /\.html?$/i.test(pathname)) return "codex_shell";
    return "codex_resource";
  }
  if (pathname.startsWith("/api/")) return "plugin_api";
  if (pathname === "/" || /\.html?$/i.test(pathname)) return "plugin_shell";
  if (/\.(?:js|mjs|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(pathname)) return "plugin_static";
  return "plugin_resource";
}

function serverTimingValue(value) {
  return Math.round(positiveNumber(value) * 10) / 10;
}

function boundedTiming(value) {
  return Math.round(positiveNumber(value));
}

function formatServerTiming(event = {}) {
  const pairs = [
    ["hm_proxy_preflight", event.preflight_ms],
    ["hm_proxy_request_body", event.request_body_ms],
    ["hm_proxy_upstream", event.upstream_headers_ms],
    ["hm_proxy_body", event.upstream_body_ms],
    ["hm_proxy_transform", event.transform_ms],
    ["hm_proxy_response", event.response_write_ms],
  ].filter(([, value]) => Number.isFinite(Number(value)) && Number(value) >= 0);
  return pairs
    .map(([name, value]) => `${name};dur=${serverTimingValue(value)}`)
    .join(", ");
}

function defaultLogPath(dataDir = "") {
  const root = String(dataDir || process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web"));
  return path.join(root, "logs", "plugin-proxy-timing.jsonl");
}

function defaultRecordEvent(logPath, event) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf8");
}

function shouldRecordEvent(event = {}, options = {}) {
  if (Number(event.total_ms || 0) >= positiveNumber(options.slowThresholdMs, 1000)) return true;
  return event.plugin_id === "codex-mobile"
    && ["codex_thread_detail", "codex_thread_list"].includes(event.route_kind);
}

function createPluginProxyTimingService(options = {}) {
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : () => Date.now();
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const logPath = options.logPath || defaultLogPath(options.dataDir);
  const recordEvent = typeof options.recordEvent === "function"
    ? options.recordEvent
    : (event) => defaultRecordEvent(logPath, event);

  function begin(input = {}) {
    const startedAt = nowMs();
    const spans = new Map();
    const state = {
      pluginId: cleanToken(input.pluginId, "plugin", 80),
      method: cleanMethod(input.method),
      requestPath: String(input.requestPath || ""),
      targetUrl: String(input.targetUrl || ""),
    };

    function start(name) {
      const key = cleanToken(name, "", 80);
      if (!key) return;
      const current = spans.get(key) || {};
      current.start = nowMs();
      spans.set(key, current);
    }

    function end(name) {
      const key = cleanToken(name, "", 80);
      if (!key) return;
      const current = spans.get(key) || {};
      current.end = nowMs();
      spans.set(key, current);
    }

    function spanDuration(name) {
      const current = spans.get(name) || {};
      if (!Number.isFinite(current.start) || !Number.isFinite(current.end)) return 0;
      return Math.max(0, current.end - current.start);
    }

    function event(extra = {}) {
      const endedAt = nowMs();
      const item = {
        at: nowIso(),
        event: "plugin_proxy_timing",
        plugin_id: state.pluginId,
        method: state.method,
        route_kind: routeKindForProxyTarget(state),
        status_code: positiveNumber(extra.statusCode, 0),
        upstream_status: positiveNumber(extra.upstreamStatus, 0),
        content_type_family: contentTypeFamily(extra.contentType),
        response_kind: cleanToken(extra.responseKind, "unknown", 80),
        body_bytes: positiveNumber(extra.bodyBytes, 0),
        total_ms: Math.max(0, endedAt - startedAt),
        preflight_ms: spanDuration("preflight"),
        request_body_ms: spanDuration("request_body"),
        upstream_headers_ms: spanDuration("upstream_headers"),
        upstream_body_ms: spanDuration("upstream_body"),
        transform_ms: spanDuration("transform"),
        response_write_ms: spanDuration("response_write"),
      };
      item.upstream_reported_total_ms = boundedTiming(extra.upstreamReportedTotalMs);
      item.proxy_upstream_gap_ms = item.upstream_reported_total_ms > 0
        ? Math.max(0, item.total_ms - item.upstream_reported_total_ms)
        : 0;
      item.proxy_header_gap_ms = item.upstream_reported_total_ms > 0
        ? Math.max(0, item.upstream_headers_ms - item.upstream_reported_total_ms)
        : 0;
      return item;
    }

    return {
      update(next = {}) {
        if (next.targetUrl) state.targetUrl = String(next.targetUrl || "");
        if (next.requestPath) state.requestPath = String(next.requestPath || "");
      },
      start,
      end,
      serverTimingHeader(extra = {}) {
        return formatServerTiming(event(extra));
      },
      finish(extra = {}) {
        const item = event(extra);
        if (shouldRecordEvent(item, options)) {
          try {
            recordEvent(item);
          } catch (_) {
            // Timing must not fail the proxied plugin request.
          }
        }
        return item;
      },
    };
  }

  return { begin };
}

module.exports = {
  contentTypeFamily,
  createPluginProxyTimingService,
  formatServerTiming,
  routeKindForProxyTarget,
};
