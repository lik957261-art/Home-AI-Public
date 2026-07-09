"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const DEFAULT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'self' https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join("; ");

const DEFAULT_SHELL_MODE_CONFIG_FILE = "home-ai-shell-mode.json";
const DEFAULT_VITE_PRODUCTION_BOOTSTRAP = "/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js";
const VITE_PRODUCTION_CUTOVER_VERSION = "20260706-vite-production-cutover-v1120";

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function normalizeShellMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "vite" ? "vite" : "";
}

function normalizeShellModeToken(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "vite") return "vite";
  if (normalized === "classic") return "unsupported";
  return "";
}

function parseShellModeConfig(text) {
  try {
    const parsed = JSON.parse(String(text || "{}"));
    return normalizeShellModeToken(parsed.shellMode || parsed.mode || parsed.selectedShellMode);
  } catch (_) {
    return "";
  }
}

function createMobileHttpRuntimeService(options = {}) {
  const maxBodyBytes = Number(options.maxBodyBytes || 1024 * 1024) || 1024 * 1024;
  const mimeByExt = options.mimeByExt || {};
  const publicRoot = String(options.publicRoot || "");
  const defaultShellModeConfigPath = options.shellModeConfigPath || (publicRoot
    ? path.join(path.dirname(publicRoot), "config", DEFAULT_SHELL_MODE_CONFIG_FILE)
    : "");
  const shellModeConfigPaths = Array.isArray(options.shellModeConfigPaths)
    ? options.shellModeConfigPaths.filter(Boolean).map((value) => String(value))
    : [defaultShellModeConfigPath].filter(Boolean).map((value) => String(value));
  const viteProductionBootstrapPath = String(options.viteProductionBootstrapPath || DEFAULT_VITE_PRODUCTION_BOOTSTRAP);
  const zlibImpl = options.zlib || zlib;
  const staticCompressionCache = new Map();
  const maxStaticCompressionCacheEntries = Math.max(0, Number(options.maxStaticCompressionCacheEntries || 256) || 256);
  const securityHeadersEnabled = () => !envFlag(
    typeof options.disableSecurityHeaders === "function"
      ? options.disableSecurityHeaders()
      : options.disableSecurityHeaders,
  );
  const hstsEnabled = () => !envFlag(
    typeof options.disableHsts === "function" ? options.disableHsts() : options.disableHsts,
  );
  const contentSecurityPolicy = () => String(
    typeof options.contentSecurityPolicy === "function"
      ? options.contentSecurityPolicy()
      : (options.contentSecurityPolicy || DEFAULT_CONTENT_SECURITY_POLICY),
  ).trim();

  function bodyReadError(message, status, code) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
  }

  function getUrl(req) {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  }

  function requestClientVersion(req) {
    const url = getUrl(req);
    return url.searchParams.get("clientVersion") || req.headers["x-hermes-web-client-version"] || "";
  }

  function attachClientVersionHeaders(req, res) {
    const info = options.clientVersionInfo(requestClientVersion(req));
    res.setHeader("X-Hermes-Web-Version", info.version);
    res.setHeader("X-Hermes-Web-Client-Version", info.clientVersion || "");
    res.setHeader("X-Hermes-Web-Refresh-Required", info.refreshRequired ? "1" : "0");
  }

  function securityHeaders() {
    if (!securityHeadersEnabled()) return {};
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": contentSecurityPolicy(),
    };
    if (hstsEnabled()) {
      headers["Strict-Transport-Security"] = "max-age=15552000";
    }
    return Object.fromEntries(Object.entries(headers).filter(([, value]) => value));
  }

  function attachSecurityHeaders(_req, res) {
    for (const [name, value] of Object.entries(securityHeaders())) {
      if (typeof res.hasHeader === "function" && res.hasHeader(name)) continue;
      res.setHeader(name, value);
    }
  }

  function withSecurityHeaders(headers = {}) {
    return Object.assign({}, securityHeaders(), headers);
  }

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, withSecurityHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    }));
    res.end(body);
  }

  function readBody(req, maxBytes = maxBodyBytes) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      req.on("data", (chunk) => {
        if (settled) return;
        size += chunk.length;
        if (size > maxBytes) {
          chunks.length = 0;
          fail(bodyReadError("request body too large", 413, "request_body_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (settled) return;
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) {
          settled = true;
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          settled = true;
          resolve(parsed);
        } catch (_) {
          fail(bodyReadError("invalid JSON body", 400, "invalid_json_body"));
        }
      });
      req.on("error", fail);
    });
  }

  function mimeFor(file) {
    return mimeByExt[path.extname(String(file || "")).toLowerCase()] || "application/octet-stream";
  }

  function staticCacheControl(target, url) {
    const ext = path.extname(String(target || "")).toLowerCase();
    const base = path.basename(String(target || "")).toLowerCase();
    if (base === "index.html" || base === "service-worker.js") return "no-cache";
    if (url.searchParams.has("v") || /\b\d{8,}\b/.test(base)) {
      return "public, max-age=31536000, immutable";
    }
    if ([".js", ".css", ".json", ".webmanifest", ".svg", ".png", ".jpg", ".jpeg", ".ico"].includes(ext)) {
      return "public, max-age=3600";
    }
    return "no-cache";
  }

  function explicitShellMode() {
    const value = typeof options.shellMode === "function" ? options.shellMode() : options.shellMode;
    if (value) return normalizeShellModeToken(value);
    if (typeof options.envShellMode === "function") {
      const envValue = options.envShellMode();
      if (envValue) return normalizeShellModeToken(envValue);
    } else if (options.envShellMode) {
      return normalizeShellModeToken(options.envShellMode);
    }
    return "";
  }

  function configShellMode() {
    for (const candidatePath of shellModeConfigPaths) {
      try {
        const mode = parseShellModeConfig(fs.readFileSync(candidatePath, "utf8"));
        if (mode) return mode;
      } catch (_) {
        continue;
      }
    }
    return "";
  }

  function requestShellModeOverride(url) {
    const requested = url.searchParams.get("homeAiShellMode") || url.searchParams.get("shellMode");
    return normalizeShellModeToken(requested);
  }

  function shellModeForRequest(url) {
    const requestMode = requestShellModeOverride(url);
    if (requestMode === "vite") return { mode: "vite", source: "request" };
    if (requestMode === "unsupported") return { mode: "vite", source: "request_ignored" };
    const explicit = explicitShellMode();
    if (explicit === "vite") return { mode: "vite", source: "runtime" };
    if (explicit === "unsupported") return { mode: "vite", source: "runtime_ignored" };
    const configured = configShellMode();
    if (configured === "vite") return { mode: "vite", source: "config" };
    if (configured === "unsupported") return { mode: "vite", source: "config_ignored" };
    return { mode: "vite", source: "vite-only" };
  }

  function isAppShellPathname(pathname) {
    return pathname === "/" || pathname === "/hermes-mobile/" || pathname === "/index.html";
  }

  function injectViteProductionBootstrap(html, shellSelection) {
    const modeMeta = [
      `<meta name="home-ai-shell-mode" content="vite">`,
      `<meta name="home-ai-vite-cutover" content="${VITE_PRODUCTION_CUTOVER_VERSION}">`,
    ].join("\n  ");
    const bootstrapScript = [
      `<script type="module"`,
      ` src="${viteProductionBootstrapPath}"`,
      ` data-home-ai-vite-production-bootstrap="${VITE_PRODUCTION_CUTOVER_VERSION}"`,
      ` data-home-ai-shell-mode-source="${shellSelection.source || "config"}"></script>`,
    ].join("");
    let next = String(html || "");
    next = next.replace(/<html\b([^>]*)>/i, (match, attrs) => {
      if (/data-home-ai-shell-mode=/i.test(match)) return match;
      return `<html${attrs} data-home-ai-shell-mode="vite" data-home-ai-vite-cutover="${VITE_PRODUCTION_CUTOVER_VERSION}">`;
    });
    next = next.includes('name="home-ai-shell-mode"')
      ? next
      : next.replace("</head>", `  ${modeMeta}\n</head>`);
    next = next.includes("data-home-ai-vite-production-bootstrap")
      ? next
      : next.replace("</body>", `  ${bootstrapScript}\n</body>`);
    return next;
  }

  function compressibleStatic(target, contentType, data) {
    if (!data || data.length < 1024) return false;
    const ext = path.extname(String(target || "")).toLowerCase();
    if ([".js", ".css", ".html", ".json", ".svg", ".txt", ".md", ".webmanifest"].includes(ext)) return true;
    return /^(text\/|application\/(?:javascript|json)|image\/svg\+xml)/i.test(String(contentType || ""));
  }

  function staticEncodingForRequest(req) {
    const accept = String(req.headers["accept-encoding"] || "");
    if (/\bbr\b/i.test(accept)) return "br";
    if (/\bgzip\b/i.test(accept)) return "gzip";
    return "";
  }

  function rememberStaticEncoding(cacheKey, body) {
    if (!maxStaticCompressionCacheEntries) return;
    staticCompressionCache.set(cacheKey, body);
    while (staticCompressionCache.size > maxStaticCompressionCacheEntries) {
      const oldest = staticCompressionCache.keys().next().value;
      staticCompressionCache.delete(oldest);
    }
  }

  function encodedStaticBody(req, target, contentType, data, stat) {
    if (!compressibleStatic(target, contentType, data)) return { data, encoding: "" };
    const encoding = staticEncodingForRequest(req);
    if (!encoding) return { data, encoding: "" };
    const cacheKey = stat
      ? `${target}\0${stat.size}\0${Number(stat.mtimeMs || 0)}\0${encoding}`
      : "";
    if (cacheKey && staticCompressionCache.has(cacheKey)) {
      return { data: staticCompressionCache.get(cacheKey), encoding };
    }
    const encoded = encoding === "br" ? zlibImpl.brotliCompressSync(data) : zlibImpl.gzipSync(data);
    if (cacheKey) rememberStaticEncoding(cacheKey, encoded);
    return { data: encoded, encoding };
  }

  function contentDisposition(disposition, filename) {
    const safeDisposition = disposition === "attachment" ? "attachment" : "inline";
    const safeAscii = String(filename || "file")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 160) || "file";
    return `${safeDisposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename || "file")}`;
  }

  function sendStaticData(req, res, url, target, data, stat, extraHeaders = {}) {
    const contentType = mimeFor(target);
    const encoded = encodedStaticBody(req, target, contentType, data, stat);
    const headers = Object.assign({
      "Content-Type": contentType,
      "Cache-Control": staticCacheControl(target, url),
      "Content-Length": encoded.data.length,
    }, extraHeaders);
    if (encoded.encoding) {
      headers["Content-Encoding"] = encoded.encoding;
      headers.Vary = "Accept-Encoding";
    }
    res.writeHead(200, withSecurityHeaders(headers));
    res.end(req.method === "HEAD" ? "" : encoded.data);
  }

  function serveStatic(req, res) {
    const url = getUrl(req);
    const pathname = url.pathname === "/hermes-mobile" ? "/hermes-mobile/" : url.pathname;
    const rel = decodeURIComponent(isAppShellPathname(pathname) ? "/index.html" : pathname);
    const target = path.normalize(path.join(publicRoot, rel));
    if (!target.startsWith(publicRoot)) {
      res.writeHead(403, withSecurityHeaders());
      res.end("Forbidden");
      return;
    }
    fs.stat(target, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        res.writeHead(404, withSecurityHeaders());
        res.end("Not found");
        return;
      }
      fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, withSecurityHeaders());
        res.end("Not found");
        return;
      }
      if (isAppShellPathname(pathname)) {
        const shellSelection = shellModeForRequest(url);
        const transformed = Buffer.from(injectViteProductionBootstrap(data.toString("utf8"), shellSelection));
        sendStaticData(req, res, url, target, transformed, null, {
          "X-HomeAI-Shell-Mode": "vite",
          "X-HomeAI-Shell-Mode-Policy": "vite-only",
          "X-HomeAI-Shell-Mode-Source": shellSelection.source || "vite-only",
          "X-HomeAI-Vite-Cutover": VITE_PRODUCTION_CUTOVER_VERSION,
          "X-HomeAI-Vite-Bootstrap": viteProductionBootstrapPath,
        });
        return;
      }
      sendStaticData(req, res, url, target, data, stat);
      });
    });
  }

  return {
    attachClientVersionHeaders,
    attachSecurityHeaders,
    contentDisposition,
    getUrl,
    mimeFor,
    readBody,
    requestClientVersion,
    sendJson,
    serveStatic,
  };
}

module.exports = {
  VITE_PRODUCTION_CUTOVER_VERSION,
  createMobileHttpRuntimeService,
  normalizeShellMode,
  parseShellModeConfig,
};
