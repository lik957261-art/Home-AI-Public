"use strict";

const fs = require("node:fs");
const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const DIRECTORY_BROWSER_API_ROUTE_SPECS = Object.freeze([
  {
    id: "directories-preview",
    method: "GET",
    path: "/api/directories/preview",
    group: "directory",
    moduleKey: "directory",
    handlerKey: "directoryPreview",
    summary: "Preview an authorized directory.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory"],
    tags: ["directory", "preview"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`directory browser api routes require ${name}`);
  }
}

function createDirectoryBrowserApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "compareDirectoryEntriesNewestFirst",
    "findDirectoryThreadForRequest",
    "publicDirectoryEntry",
    "publicRemoteDirectoryEntry",
    "resolveBrowserPathAsync",
    "runDirectoryBridge",
    "sendJson",
  ]);
  const readdirSync = deps.readdirSync || ((dirPath, options) => fs.readdirSync(dirPath, options));
  const statSync = deps.statSync || ((filePath) => fs.statSync(filePath));
  const registry = createApiRouteRegistry(DIRECTORY_BROWSER_API_ROUTE_SPECS);

  async function handlePreview(req, res, url) {
    const threadId = String(url.searchParams.get("threadId") || "");
    const thread = deps.findDirectoryThreadForRequest(req, threadId);
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const resolved = await deps.resolveBrowserPathAsync(thread, url.searchParams);
    if (!resolved) {
      deps.sendJson(res, 404, { error: "Directory not found or not allowed" });
      return;
    }
    if (resolved.remote === "wsl") {
      if (resolved.remoteEntry?.type !== "directory") {
        deps.sendJson(res, 400, { error: "Path is not a directory" });
        return;
      }
      const result = await deps.runDirectoryBridge({ action: "preview", path: resolved.displayPath })
        .catch((err) => ({ ok: false, error: err.message || String(err) }));
      if (!result?.ok) {
        deps.sendJson(res, 404, { error: result?.error || "Directory not found" });
        return;
      }
      const entries = (result.entries || [])
        .map((entry) => deps.publicRemoteDirectoryEntry(thread, resolved.displayPath, entry))
        .filter(Boolean)
        .sort(deps.compareDirectoryEntriesNewestFirst)
        .slice(0, 300);
      deps.sendJson(res, 200, {
        label: resolved.label,
        path: resolved.displayPath,
        displayPath: resolved.workspacePath,
        workspacePath: resolved.workspacePath,
        localPath: "",
        remote: "wsl",
        updatedAt: result.updatedAt || resolved.remoteEntry?.mtime || "",
        entryCount: entries.length,
        entries,
      });
      return;
    }
    let stat;
    try {
      stat = statSync(resolved.localPath);
    } catch (_) {
      deps.sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      deps.sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    const entries = readdirSync(resolved.localPath, { withFileTypes: true })
      .map((entry) => deps.publicDirectoryEntry(thread, resolved.displayPath, resolved.localPath, entry))
      .filter(Boolean)
      .sort(deps.compareDirectoryEntriesNewestFirst)
      .slice(0, 300);
    deps.sendJson(res, 200, {
      label: resolved.label,
      path: resolved.displayPath,
      displayPath: resolved.workspacePath,
      workspacePath: resolved.workspacePath,
      localPath: resolved.localPath,
      updatedAt: stat.mtime.toISOString(),
      entryCount: entries.length,
      entries,
    });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "directories-preview") await handlePreview(req, res, url);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
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
  DIRECTORY_BROWSER_API_ROUTE_SPECS,
  createDirectoryBrowserApiRoutes,
};
