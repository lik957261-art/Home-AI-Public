"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const FILE_ARTIFACT_API_ROUTE_SPECS = Object.freeze([
  {
    id: "files-preview",
    method: "GET",
    path: "/api/files/preview",
    group: "file",
    moduleKey: "file",
    handlerKey: "filePreview",
    summary: "Preview an authorized file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["file"],
    tags: ["file", "preview"],
  },
  {
    id: "files-read",
    method: "GET",
    path: "/api/files",
    group: "file",
    moduleKey: "file",
    handlerKey: "fileRead",
    summary: "Read an authorized file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["file"],
    tags: ["file", "read"],
  },
  {
    id: "artifact-read",
    method: "GET",
    pathRegex: /^\/api\/artifacts\/[^/]+$/,
    group: "artifact",
    moduleKey: "artifact",
    handlerKey: "artifactRead",
    summary: "Read an authorized message artifact.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    resourceTypes: ["artifact", "file"],
    tags: ["artifact", "read"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`file artifact api routes require ${name}`);
  }
}

function downloadDisposition(url) {
  return /^(1|true|yes|on)$/i.test(String(url.searchParams.get("download") || ""))
    ? "attachment"
    : "inline";
}

function streamLocalFile(deps, res, file, disposition) {
  const localPath = file.localPath || file.path;
  const name = file.name || path.basename(localPath);
  const stat = typeof file.size === "number" && file.size >= 0 ? { size: file.size } : deps.statSync(localPath);
  res.writeHead(200, {
    "Content-Type": file.mime || deps.mimeFor(localPath),
    "Content-Length": stat.size,
    "Content-Disposition": deps.contentDisposition(disposition, name),
    "Cache-Control": "private, max-age=60",
  });
  deps.createReadStream(localPath).pipe(res);
}

function createFileArtifactApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "contentDisposition",
    "extractDocxText",
    "mimeFor",
    "resolveArtifactForRequest",
    "resolveFileForBrowserRequest",
    "sendJson",
    "textFilePreview",
  ]);
  deps.createReadStream = deps.createReadStream || ((filePath) => fs.createReadStream(filePath));
  deps.statSync = deps.statSync || ((filePath) => fs.statSync(filePath));

  const registry = createApiRouteRegistry(FILE_ARTIFACT_API_ROUTE_SPECS);

  async function handleFilePreview(res, url, auth) {
    const resolved = deps.resolveFileForBrowserRequest(url.searchParams, auth);
    if (!resolved.file) {
      deps.sendJson(res, resolved.status || 404, { error: resolved.error || "File not found" });
      return;
    }
    const file = resolved.file;
    const ext = path.extname(file.localPath).toLowerCase();
    try {
      let preview;
      if (ext === ".docx") preview = deps.extractDocxText(file.localPath);
      else if ([".txt", ".md", ".csv", ".json"].includes(ext) || /^text\//i.test(file.mime)) {
        preview = deps.textFilePreview(file.localPath);
      } else {
        deps.sendJson(res, 415, { error: "Preview is not supported for this file type", name: file.name, mime: file.mime });
        return;
      }
      deps.sendJson(res, 200, {
        name: file.name,
        mime: file.mime,
        size: file.size,
        updatedAt: file.updatedAt,
        path: file.displayPath,
        text: preview.text,
        totalChars: preview.totalChars,
        truncated: preview.truncated,
      });
    } catch (err) {
      deps.sendJson(res, 422, { error: `Preview failed: ${err.message || String(err)}` });
    }
  }

  async function handleFileRead(res, url, auth) {
    const resolved = deps.resolveFileForBrowserRequest(url.searchParams, auth);
    if (!resolved.file) {
      deps.sendJson(res, resolved.status || 404, { error: resolved.error || "File not found" });
      return;
    }
    streamLocalFile(deps, res, resolved.file, downloadDisposition(url));
  }

  async function handleArtifactRead(res, url, auth) {
    const match = String(url.pathname || "").match(/^\/api\/artifacts\/([^/]+)$/);
    const resolvedArtifact = deps.resolveArtifactForRequest(decodeURIComponent(match[1]), auth);
    if (!resolvedArtifact.artifact) {
      deps.sendJson(res, resolvedArtifact.status || 404, { error: resolvedArtifact.error || "Artifact not found" });
      return;
    }
    const artifact = resolvedArtifact.artifact;
    streamLocalFile(deps, res, {
      localPath: artifact.localPath || artifact.path,
      mime: artifact.mime,
      name: artifact.name,
    }, downloadDisposition(url));
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    const auth = context.auth;
    if (route.id === "files-preview") await handleFilePreview(res, url, auth);
    else if (route.id === "files-read") await handleFileRead(res, url, auth);
    else if (route.id === "artifact-read") await handleArtifactRead(res, url, auth);
    else return { handled: false };

    return { handled: true, route, auth };
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
  FILE_ARTIFACT_API_ROUTE_SPECS,
  createFileArtifactApiRoutes,
};
