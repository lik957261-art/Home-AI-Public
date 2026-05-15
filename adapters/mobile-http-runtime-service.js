"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createMobileHttpRuntimeService(options = {}) {
  const maxBodyBytes = Number(options.maxBodyBytes || 1024 * 1024) || 1024 * 1024;
  const mimeByExt = options.mimeByExt || {};
  const publicRoot = String(options.publicRoot || "");

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

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(body);
  }

  function readBody(req, maxBytes = maxBodyBytes) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error("request body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          reject(new Error("invalid JSON body"));
        }
      });
      req.on("error", reject);
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
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": mimeFor(target),
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  }

  return {
    attachClientVersionHeaders,
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
