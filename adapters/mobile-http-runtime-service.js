"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "frame-src 'self' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: wss:",
  "manifest-src 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join("; ");

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function createMobileHttpRuntimeService(options = {}) {
  const maxBodyBytes = Number(options.maxBodyBytes || 1024 * 1024) || 1024 * 1024;
  const mimeByExt = options.mimeByExt || {};
  const publicRoot = String(options.publicRoot || "");
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

  function contentDisposition(disposition, filename) {
    const safeDisposition = disposition === "attachment" ? "attachment" : "inline";
    const safeAscii = String(filename || "file")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 160) || "file";
    return `${safeDisposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename || "file")}`;
  }

  function serveStatic(req, res) {
    const url = getUrl(req);
    const pathname = url.pathname === "/hermes-mobile" ? "/hermes-mobile/" : url.pathname;
    const rel = decodeURIComponent((pathname === "/" || pathname === "/hermes-mobile/") ? "/index.html" : pathname);
    const target = path.normalize(path.join(publicRoot, rel));
    if (!target.startsWith(publicRoot)) {
      res.writeHead(403, withSecurityHeaders());
      res.end("Forbidden");
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, withSecurityHeaders());
        res.end("Not found");
        return;
      }
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": mimeFor(target),
        "Cache-Control": "no-cache",
      }));
      res.end(data);
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
  createMobileHttpRuntimeService,
};
