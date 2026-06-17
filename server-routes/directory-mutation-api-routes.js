"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");
const {
  createDirectoryDeletePolicyService,
  directoryDeleteElevationBody,
  isDirectoryNotEmptyError,
} = require("../adapters/directory-delete-policy-service");

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const DIRECTORY_MUTATION_API_ROUTE_SPECS = Object.freeze([
  {
    id: "directories-create",
    method: "POST",
    path: "/api/directories/create",
    group: "directory-mutation",
    moduleKey: "directory-mutation",
    handlerKey: "createDirectory",
    summary: "Create a child directory inside an authorized directory.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory"],
    tags: ["directory", "create"],
  },
  {
    id: "directories-upload",
    method: "POST",
    path: "/api/directories/upload",
    group: "directory-mutation",
    moduleKey: "directory-mutation",
    handlerKey: "uploadDirectoryFile",
    summary: "Upload a file into an authorized directory.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "file"],
    tags: ["directory", "upload"],
  },
  {
    id: "directories-delete",
    method: "POST",
    path: "/api/directories/delete",
    group: "directory-mutation",
    moduleKey: "directory-mutation",
    handlerKey: "deleteDirectoryEntry",
    summary: "Delete an authorized directory entry.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "file"],
    tags: ["directory", "delete"],
  },
  {
    id: "directories-rename",
    method: "POST",
    path: "/api/directories/rename",
    group: "directory-mutation",
    moduleKey: "directory-mutation",
    handlerKey: "renameDirectoryEntry",
    summary: "Rename an authorized directory entry without moving it.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["directory", "file"],
    tags: ["directory", "rename"],
  },
]);

function ensureFunction(deps, name) {
  if (typeof deps[name] !== "function") throw new Error(`directory mutation api routes require ${name}`);
}

function errorMessage(err) {
  return err?.message || String(err);
}

function statusCode(err) {
  return err?.status || 500;
}

function isAlreadyExistsError(err) {
  return err?.code === "EEXIST" || /already exists/i.test(errorMessage(err));
}

function posixBasename(value) {
  return String(value || "").replace(/\/+$/, "").split("/").pop() || "";
}

function localBasename(value) {
  return String(value || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
}

function parentPath(value) {
  const text = String(value || "").replace(/[\\/]+$/, "");
  if (!text) return "";
  const index = Math.max(text.lastIndexOf("\\"), text.lastIndexOf("/"));
  if (index < 0) return "";
  if (index === 0) return text[0] === "/" ? "/" : "";
  return text.slice(0, index);
}

function hasInjectedAuth(context) {
  return Boolean(context && Object.hasOwn(context, "auth"));
}

function handledResult(route, context) {
  return {
    handled: true,
    route,
    auth: hasInjectedAuth(context) ? context.auth : undefined,
  };
}

function clearDirectoryCatalogCaches(deps, thread) {
  deps.invalidateCatalogCache();
  deps.clearDynamicProjectCache(String(thread?.workspaceId || ""));
}

async function maybeAwait(value) {
  return value;
}

function createDirectoryMutationApiRoutes(deps = {}) {
  for (const name of [
    "readBody",
    "sendJson",
    "findDirectoryThreadForRequest",
    "resolveBrowserPathAsync",
    "directoryRequestParams",
    "runDirectoryBridge",
    "isSharedDirectoryWriteAllowed",
    "isProtectedDirectoryRoot",
    "isDeletableWorkspaceRootChild",
    "isDirectoryBrowserPathAllowedForThread",
    "publicRemoteDirectoryEntry",
    "publicManagedEntry",
    "uniqueChildPath",
    "joinDisplayPath",
    "joinLocalPath",
    "assertChildPathInside",
    "safeDirectoryName",
    "safeFileName",
    "mimeFor",
    "invalidateCatalogCache",
    "clearDynamicProjectCache",
    "authenticateRequest",
    "exists",
    "stat",
    "mkdir",
    "write",
    "rmdir",
    "rmDirRecursive",
    "unlink",
    "rename",
    "isOwnerAuth",
    "isOwnerElevationActive",
    "consumeOwnerElevationOnce",
  ]) {
    ensureFunction(deps, name);
  }

  const maxUploadBytes = Number.isFinite(deps.maxUploadBytes) && deps.maxUploadBytes > 0
    ? deps.maxUploadBytes
    : DEFAULT_MAX_UPLOAD_BYTES;
  const registry = createApiRouteRegistry(DIRECTORY_MUTATION_API_ROUTE_SPECS);
  const directoryDeletePolicyService = createDirectoryDeletePolicyService({
    isOwnerAuth: deps.isOwnerAuth,
    isOwnerElevationActive: deps.isOwnerElevationActive,
    consumeOwnerElevationOnce: deps.consumeOwnerElevationOnce,
  });

  async function readJsonBody(req, res, limit) {
    const body = await deps.readBody(req, limit).catch((err) => ({ __error: err }));
    if (body?.__error) {
      deps.sendJson(res, 400, { error: body.__error.message || "Invalid request body" });
      return { ok: false, body: null };
    }
    return { ok: true, body: body || {} };
  }

  async function requestContext(req, res, body, notFoundMessage) {
    const thread = deps.findDirectoryThreadForRequest(req, String(body.threadId || ""));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return null;
    }
    const resolved = await deps.resolveBrowserPathAsync(thread, deps.directoryRequestParams(body));
    if (!resolved) {
      deps.sendJson(res, 404, { error: notFoundMessage });
      return null;
    }
    return { thread, resolved, auth: deps.authenticateRequest(req) };
  }

  function ensureWritable(reqCtx, res) {
    const { thread, resolved, auth } = reqCtx;
    const localPath = resolved.remote === "wsl" ? "" : resolved.localPath;
    if (!deps.isSharedDirectoryWriteAllowed(thread, localPath, resolved.displayPath, auth)) {
      deps.sendJson(res, 403, { error: "Shared directory is read-only" });
      return false;
    }
    return true;
  }

  async function handleRemoteCreate(reqCtx, res, name) {
    const { thread, resolved } = reqCtx;
    if (resolved.remoteEntry?.type !== "directory") {
      deps.sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    if (!ensureWritable(reqCtx, res)) return;
    const targetDisplayPath = deps.joinDisplayPath(resolved.displayPath, name);
    if (!deps.isDirectoryBrowserPathAllowedForThread(thread, "", targetDisplayPath)) {
      deps.sendJson(res, 403, { error: "Target directory is not allowed" });
      return;
    }
    const result = await deps.runDirectoryBridge({ action: "mkdir", path: resolved.displayPath, name })
      .catch((err) => ({ ok: false, error: errorMessage(err) }));
    if (!result?.ok) {
      deps.sendJson(res, /already exists/i.test(result?.error || "") ? 409 : 500, { error: result?.error || "Create directory failed" });
      return;
    }
    clearDirectoryCatalogCaches(deps, thread);
    deps.sendJson(res, 201, {
      ok: true,
      entry: deps.publicRemoteDirectoryEntry(thread, resolved.displayPath, result.entry),
    });
  }

  async function handleLocalCreate(reqCtx, res, name) {
    const { thread, resolved } = reqCtx;
    let stat;
    try {
      stat = await maybeAwait(deps.stat(resolved.localPath));
    } catch (_) {
      deps.sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      deps.sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    const targetLocalPath = deps.joinLocalPath(resolved.localPath, name);
    const targetDisplayPath = deps.joinDisplayPath(resolved.displayPath, name);
    try {
      if (!ensureWritable(reqCtx, res)) return;
      deps.assertChildPathInside(resolved.localPath, targetLocalPath);
      if (!deps.isDirectoryBrowserPathAllowedForThread(thread, targetLocalPath, targetDisplayPath)) {
        deps.sendJson(res, 403, { error: "Target directory is not allowed" });
        return;
      }
      if (await maybeAwait(deps.exists(targetLocalPath))) {
        deps.sendJson(res, 409, { error: "Directory already exists" });
        return;
      }
      await maybeAwait(deps.mkdir(targetLocalPath));
      clearDirectoryCatalogCaches(deps, thread);
      deps.sendJson(res, 201, {
        ok: true,
        entry: deps.publicManagedEntry(thread, resolved.displayPath, resolved.localPath, targetLocalPath),
      });
    } catch (err) {
      deps.sendJson(res, isAlreadyExistsError(err) ? 409 : statusCode(err), {
        error: isAlreadyExistsError(err) ? "Directory already exists" : errorMessage(err),
      });
    }
  }

  async function handleCreate(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const body = bodyResult.body;
    const reqCtx = await requestContext(req, res, body, "Directory not found or not allowed");
    if (!reqCtx) return handledResult(route, context);
    const name = deps.safeDirectoryName(body.name || "");
    if (!name) {
      deps.sendJson(res, 400, { error: "Invalid directory name" });
      return handledResult(route, context);
    }
    if (reqCtx.resolved.remote === "wsl") await handleRemoteCreate(reqCtx, res, name);
    else await handleLocalCreate(reqCtx, res, name);
    return handledResult(route, context);
  }

  function readUploadBuffer(body) {
    const data = String(body.dataBase64 || "");
    if (!data) return { ok: false, error: "Missing dataBase64" };
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxUploadBytes) return { ok: false, error: "Invalid or too-large upload" };
    return { ok: true, data, buffer };
  }

  async function handleRemoteUpload(reqCtx, res, filename, data) {
    const { thread, resolved } = reqCtx;
    if (resolved.remoteEntry?.type !== "directory") {
      deps.sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    if (!ensureWritable(reqCtx, res)) return;
    const targetDisplayPath = deps.joinDisplayPath(resolved.displayPath, filename);
    if (!deps.isDirectoryBrowserPathAllowedForThread(thread, "", targetDisplayPath)) {
      deps.sendJson(res, 403, { error: "Target file is not allowed" });
      return;
    }
    const result = await deps.runDirectoryBridge({
      action: "upload",
      path: resolved.displayPath,
      filename,
      dataBase64: data,
    }).catch((err) => ({ ok: false, error: errorMessage(err) }));
    if (!result?.ok) {
      deps.sendJson(res, 500, { error: result?.error || "Upload failed" });
      return;
    }
    deps.sendJson(res, 201, {
      ok: true,
      entry: deps.publicRemoteDirectoryEntry(thread, resolved.displayPath, result.entry),
    });
  }

  async function handleLocalUpload(reqCtx, res, filename, buffer) {
    const { thread, resolved } = reqCtx;
    let stat;
    try {
      stat = await maybeAwait(deps.stat(resolved.localPath));
    } catch (_) {
      deps.sendJson(res, 404, { error: "Directory not found" });
      return;
    }
    if (!stat.isDirectory()) {
      deps.sendJson(res, 400, { error: "Path is not a directory" });
      return;
    }
    try {
      if (!ensureWritable(reqCtx, res)) return;
      const targetLocalPath = deps.uniqueChildPath(resolved.localPath, filename);
      const targetDisplayPath = deps.joinDisplayPath(resolved.displayPath, localBasename(targetLocalPath));
      deps.assertChildPathInside(resolved.localPath, targetLocalPath);
      if (!deps.isDirectoryBrowserPathAllowedForThread(thread, targetLocalPath, targetDisplayPath)) {
        deps.sendJson(res, 403, { error: "Target file is not allowed" });
        return;
      }
      await maybeAwait(deps.write(targetLocalPath, buffer, { flag: "wx", contentType: deps.mimeFor(filename) }));
      deps.sendJson(res, 201, {
        ok: true,
        entry: deps.publicManagedEntry(thread, resolved.displayPath, resolved.localPath, targetLocalPath),
      });
    } catch (err) {
      deps.sendJson(res, statusCode(err), { error: errorMessage(err) });
    }
  }

  async function handleUpload(req, res, route, context) {
    const uploadLimit = Math.ceil(maxUploadBytes * 1.4) + 8192;
    const bodyResult = await readJsonBody(req, res, uploadLimit);
    if (!bodyResult.ok) return handledResult(route, context);
    const body = bodyResult.body;
    const reqCtx = await requestContext(req, res, body, "Directory not found or not allowed");
    if (!reqCtx) return handledResult(route, context);
    const filename = deps.safeFileName(body.filename || "upload.bin");
    const upload = readUploadBuffer(body);
    if (!upload.ok) {
      deps.sendJson(res, 400, { error: upload.error });
      return handledResult(route, context);
    }
    if (reqCtx.resolved.remote === "wsl") await handleRemoteUpload(reqCtx, res, filename, upload.data);
    else await handleLocalUpload(reqCtx, res, filename, upload.buffer);
    return handledResult(route, context);
  }

  function deletedPayload(reqCtx, options = {}) {
    const { resolved } = reqCtx;
    return {
      path: resolved.displayPath,
      displayPath: resolved.workspacePath,
      workspacePath: resolved.workspacePath,
      name: options.name || localBasename(resolved.localPath || "") || posixBasename(resolved.displayPath),
      type: options.type || "file",
    };
  }

  function nonEmptyDirectoryDeleteAuthorization(reqCtx, body) {
    return directoryDeletePolicyService.nonEmptyDirectoryDeleteAuthorization(reqCtx.auth, {
      path: reqCtx.resolved?.displayPath,
      displayPath: reqCtx.resolved?.workspacePath || reqCtx.resolved?.displayPath,
      name: reqCtx.resolved?.remoteEntry?.name || localBasename(reqCtx.resolved?.localPath || "") || posixBasename(reqCtx.resolved?.displayPath || ""),
      ownerElevationOnceToken: body?.ownerElevationOnceToken,
      owner_elevation_once_token: body?.owner_elevation_once_token,
    });
  }

  function sendDeleted(reqCtx, res, payloadOptions = {}) {
    clearDirectoryCatalogCaches(deps, reqCtx.thread);
    deps.sendJson(res, 200, {
      ok: true,
      deleted: deletedPayload(reqCtx, payloadOptions),
    });
  }

  async function handleRemoteDelete(reqCtx, res, body) {
    const { thread, resolved } = reqCtx;
    const isDirectory = resolved.remoteEntry?.type === "directory";
    if (!ensureWritable(reqCtx, res)) return;
    if (isDirectory
      && deps.isProtectedDirectoryRoot(thread, "", resolved.displayPath)
      && !deps.isDeletableWorkspaceRootChild(thread, "", resolved.displayPath)) {
      deps.sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
      return;
    }
    const result = await deps.runDirectoryBridge(directoryDeletePolicyService.remoteDeletePayload(resolved.displayPath))
      .catch((err) => ({ ok: false, error: errorMessage(err) }));
    if (!result?.ok) {
      if (isDirectory && /not empty|directory not empty/i.test(result?.error || "")) {
        const authorization = nonEmptyDirectoryDeleteAuthorization(reqCtx, body);
        if (!authorization.allowed) {
          deps.sendJson(res, authorization.status, authorization.body || directoryDeleteElevationBody({ path: resolved.displayPath }));
          return;
        }
        const elevated = await deps.runDirectoryBridge(directoryDeletePolicyService.remoteDeletePayload(resolved.displayPath, { recursive: true }))
          .catch((err) => ({ ok: false, error: errorMessage(err) }));
        if (!elevated?.ok) {
          deps.sendJson(res, 500, { error: elevated?.error || "Delete failed" });
          return;
        }
        sendDeleted(reqCtx, res, {
          name: resolved.remoteEntry?.name || posixBasename(resolved.displayPath),
          type: "directory",
        });
        return;
      }
      const code = /not empty|directory not empty/i.test(result?.error || "") ? 409 : 500;
      deps.sendJson(res, code, { error: /not empty|directory not empty/i.test(result?.error || "") ? "Directory is not empty" : (result?.error || "Delete failed") });
      return;
    }
    sendDeleted(reqCtx, res, {
      name: resolved.remoteEntry?.name || posixBasename(resolved.displayPath),
      type: isDirectory ? "directory" : "file",
    });
  }

  async function handleLocalDelete(reqCtx, res, body) {
    const { thread, resolved } = reqCtx;
    let stat;
    try {
      stat = await maybeAwait(deps.stat(resolved.localPath));
    } catch (_) {
      deps.sendJson(res, 404, { error: "Path not found" });
      return;
    }
    if (!ensureWritable(reqCtx, res)) return;
    if (stat.isDirectory()
      && deps.isProtectedDirectoryRoot(thread, resolved.localPath, resolved.displayPath)
      && !deps.isDeletableWorkspaceRootChild(thread, resolved.localPath, resolved.displayPath)) {
      deps.sendJson(res, 400, { error: "Cannot delete a project/workspace root directory" });
      return;
    }
    try {
      if (stat.isDirectory()) await maybeAwait(deps.rmdir(resolved.localPath));
      else await maybeAwait(deps.unlink(resolved.localPath));
      sendDeleted(reqCtx, res, {
        name: localBasename(resolved.localPath),
        type: stat.isDirectory() ? "directory" : "file",
      });
    } catch (err) {
      if (stat.isDirectory() && isDirectoryNotEmptyError(err)) {
        const authorization = nonEmptyDirectoryDeleteAuthorization(reqCtx, body);
        if (!authorization.allowed) {
          deps.sendJson(res, authorization.status, authorization.body || directoryDeleteElevationBody({ path: resolved.displayPath }));
          return;
        }
        try {
          await maybeAwait(deps.rmDirRecursive(resolved.localPath));
          sendDeleted(reqCtx, res, {
            name: localBasename(resolved.localPath),
            type: "directory",
          });
          return;
        } catch (recursiveErr) {
          deps.sendJson(res, 500, { error: errorMessage(recursiveErr) });
          return;
        }
      }
      deps.sendJson(res, isDirectoryNotEmptyError(err) ? 409 : 500, {
        error: isDirectoryNotEmptyError(err) ? "Directory is not empty" : errorMessage(err),
      });
    }
  }

  async function handleDelete(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const reqCtx = await requestContext(req, res, bodyResult.body, "Path not found or not allowed");
    if (!reqCtx) return handledResult(route, context);
    if (reqCtx.resolved.remote === "wsl") await handleRemoteDelete(reqCtx, res, bodyResult.body);
    else await handleLocalDelete(reqCtx, res, bodyResult.body);
    return handledResult(route, context);
  }

  function safeRenameName(depsRef, value, isDirectory) {
    return isDirectory ? depsRef.safeDirectoryName(value || "") : depsRef.safeFileName(value || "");
  }

  function renamedPayload(reqCtx, targetDisplayPath, name, type) {
    return {
      path: targetDisplayPath,
      displayPath: reqCtx.resolved.workspacePath || targetDisplayPath,
      workspacePath: reqCtx.resolved.workspacePath || targetDisplayPath,
      name,
      type,
    };
  }

  async function handleRemoteRename(reqCtx, res, rawName) {
    const { thread, resolved } = reqCtx;
    const isDirectory = resolved.remoteEntry?.type === "directory";
    const name = safeRenameName(deps, rawName, isDirectory);
    if (!name) {
      deps.sendJson(res, 400, { error: isDirectory ? "Invalid directory name" : "Invalid file name" });
      return;
    }
    if (!ensureWritable(reqCtx, res)) return;
    if (isDirectory
      && deps.isProtectedDirectoryRoot(thread, "", resolved.displayPath)
      && !deps.isDeletableWorkspaceRootChild(thread, "", resolved.displayPath)) {
      deps.sendJson(res, 400, { error: "Cannot rename a project/workspace root directory" });
      return;
    }
    const sourceParentDisplayPath = parentPath(resolved.displayPath);
    if (!sourceParentDisplayPath) {
      deps.sendJson(res, 400, { error: "Cannot rename this path" });
      return;
    }
    const targetDisplayPath = deps.joinDisplayPath(sourceParentDisplayPath, name);
    if (!deps.isDirectoryBrowserPathAllowedForThread(thread, "", targetDisplayPath)) {
      deps.sendJson(res, 403, { error: "Target path is not allowed" });
      return;
    }
    const result = await deps.runDirectoryBridge({
      action: "rename",
      path: resolved.displayPath,
      name,
    }).catch((err) => ({ ok: false, error: errorMessage(err) }));
    if (!result?.ok) {
      deps.sendJson(res, /already exists/i.test(result?.error || "") ? 409 : 500, { error: result?.error || "Rename failed" });
      return;
    }
    clearDirectoryCatalogCaches(deps, thread);
    deps.sendJson(res, 200, {
      ok: true,
      entry: result.entry
        ? deps.publicRemoteDirectoryEntry(thread, sourceParentDisplayPath, result.entry)
        : renamedPayload(reqCtx, targetDisplayPath, name, isDirectory ? "directory" : "file"),
    });
  }

  async function handleLocalRename(reqCtx, res, rawName) {
    const { thread, resolved } = reqCtx;
    let stat;
    try {
      stat = await maybeAwait(deps.stat(resolved.localPath));
    } catch (_) {
      deps.sendJson(res, 404, { error: "Path not found" });
      return;
    }
    const name = safeRenameName(deps, rawName, stat.isDirectory());
    if (!name) {
      deps.sendJson(res, 400, { error: stat.isDirectory() ? "Invalid directory name" : "Invalid file name" });
      return;
    }
    if (!ensureWritable(reqCtx, res)) return;
    if (stat.isDirectory()
      && deps.isProtectedDirectoryRoot(thread, resolved.localPath, resolved.displayPath)
      && !deps.isDeletableWorkspaceRootChild(thread, resolved.localPath, resolved.displayPath)) {
      deps.sendJson(res, 400, { error: "Cannot rename a project/workspace root directory" });
      return;
    }
    const sourceParentLocalPath = parentPath(resolved.localPath);
    const sourceParentDisplayPath = parentPath(resolved.displayPath);
    if (!sourceParentLocalPath || !sourceParentDisplayPath) {
      deps.sendJson(res, 400, { error: "Cannot rename this path" });
      return;
    }
    const targetLocalPath = deps.joinLocalPath(sourceParentLocalPath, name);
    const targetDisplayPath = deps.joinDisplayPath(sourceParentDisplayPath, name);
    try {
      deps.assertChildPathInside(sourceParentLocalPath, targetLocalPath);
      if (!deps.isDirectoryBrowserPathAllowedForThread(thread, targetLocalPath, targetDisplayPath)) {
        deps.sendJson(res, 403, { error: "Target path is not allowed" });
        return;
      }
      if (await maybeAwait(deps.exists(targetLocalPath))) {
        deps.sendJson(res, 409, { error: stat.isDirectory() ? "Directory already exists" : "File already exists" });
        return;
      }
      await maybeAwait(deps.rename(resolved.localPath, targetLocalPath));
      clearDirectoryCatalogCaches(deps, thread);
      deps.sendJson(res, 200, {
        ok: true,
        entry: deps.publicManagedEntry(thread, sourceParentDisplayPath, sourceParentLocalPath, targetLocalPath),
      });
    } catch (err) {
      deps.sendJson(res, isAlreadyExistsError(err) ? 409 : statusCode(err), {
        error: isAlreadyExistsError(err) ? (stat.isDirectory() ? "Directory already exists" : "File already exists") : errorMessage(err),
      });
    }
  }

  async function handleRename(req, res, route, context) {
    const bodyResult = await readJsonBody(req, res);
    if (!bodyResult.ok) return handledResult(route, context);
    const reqCtx = await requestContext(req, res, bodyResult.body, "Path not found or not allowed");
    if (!reqCtx) return handledResult(route, context);
    const rawName = bodyResult.body.name || "";
    if (reqCtx.resolved.remote === "wsl") await handleRemoteRename(reqCtx, res, rawName);
    else await handleLocalRename(reqCtx, res, rawName);
    return handledResult(route, context);
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "directories-create") return handleCreate(req, res, route, context);
    if (route.id === "directories-upload") return handleUpload(req, res, route, context);
    if (route.id === "directories-delete") return handleDelete(req, res, route, context);
    if (route.id === "directories-rename") return handleRename(req, res, route, context);
    return { handled: false };
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
  DIRECTORY_MUTATION_API_ROUTE_SPECS,
  createDirectoryMutationApiRoutes,
};
