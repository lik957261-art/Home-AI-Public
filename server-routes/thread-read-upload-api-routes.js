"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createApiRouteRegistry } = require("../adapters/api-route-registry");

const THREAD_READ_UPLOAD_API_ROUTE_SPECS = Object.freeze([
  {
    id: "threads-list",
    method: "GET",
    path: "/api/threads",
    group: "thread",
    moduleKey: "thread",
    handlerKey: "threadsList",
    summary: "List visible threads.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread"],
    tags: ["thread", "list"],
  },
  {
    id: "threads-create",
    method: "POST",
    path: "/api/threads",
    group: "thread",
    moduleKey: "thread",
    handlerKey: "threadsCreate",
    summary: "Create a thread.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread"],
    tags: ["thread", "create"],
  },
  {
    id: "thread-read",
    method: "GET",
    pathRegex: /^\/api\/threads\/[^/]+$/,
    group: "thread",
    moduleKey: "thread",
    handlerKey: "threadRead",
    summary: "Read a thread.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread"],
    tags: ["thread", "read"],
  },
  {
    id: "thread-messages-list",
    method: "GET",
    pathRegex: /^\/api\/threads\/[^/]+\/messages$/,
    group: "thread",
    moduleKey: "thread-message",
    handlerKey: "threadMessagesList",
    summary: "List paged thread messages.",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread", "message"],
    tags: ["thread", "message", "list"],
  },
  {
    id: "thread-uploads-create",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/uploads$/,
    group: "thread",
    moduleKey: "thread-upload",
    handlerKey: "threadUpload",
    summary: "Upload a file into a thread workspace.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread", "artifact", "file"],
    tags: ["thread", "upload", "artifact"],
  },
  {
    id: "thread-server-file-attachments-create",
    method: "POST",
    pathRegex: /^\/api\/threads\/[^/]+\/server-file-attachments$/,
    group: "thread",
    moduleKey: "thread-upload",
    handlerKey: "threadServerFileAttachment",
    summary: "Attach an already server-side directory file to a thread composer.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["thread", "artifact", "file", "directory"],
    tags: ["thread", "server-file", "artifact"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`thread read upload api routes require ${name}`);
  }
}

function routeIdFromPath(pathname, regex) {
  const match = String(pathname || "").match(regex);
  return match ? decodeURIComponent(match[1]) : "";
}

function createThreadReadUploadApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "authenticateRequest",
    "boolParam",
    "broadcast",
    "chatGroupMemberWorkspaceIds",
    "compactMessage",
    "compactThread",
    "compactThreadWithMessagePage",
    "findProject",
    "findSubproject",
    "findThreadForRequest",
    "findWorkspace",
    "isDiscardableEmptyThread",
    "makeId",
    "normalizeThread",
    "nowIso",
    "pruneEmptyThreads",
    "readBody",
    "registerUploadArtifact",
    "requireWorkspaceAccess",
    "resolveBrowserPathAsync",
    "safeFileName",
    "saveState",
    "searchThreadMessages",
    "sendJson",
    "singleWindowProjectTaskSummaries",
    "state",
    "threadAccessibleToRequest",
    "threadMessagesPage",
    "threadSummary",
    "workspaceUploadDirectoryForRequest",
  ]);

  deps.mkdirSync = deps.mkdirSync || ((dir) => fs.mkdirSync(dir, { recursive: true }));
  deps.randomBytes = deps.randomBytes || ((size) => crypto.randomBytes(size));
  deps.statSync = deps.statSync || ((filePath) => fs.statSync(filePath));
  deps.writeFileSync = deps.writeFileSync || ((filePath, buffer) => fs.writeFileSync(filePath, buffer));

  const registry = createApiRouteRegistry(THREAD_READ_UPLOAD_API_ROUTE_SPECS);
  const threadMessageInitialLimit = Math.max(10, Number(deps.threadMessageInitialLimit || 60) || 60);
  const threadMessagePageLimit = Math.max(10, Number(deps.threadMessagePageLimit || 40) || 40);
  const threadMessageSearchLimit = Math.max(10, Number(deps.threadMessageSearchLimit || 120) || 120);
  const maxUploadBytes = Math.max(1, Number(deps.maxUploadBytes || 100 * 1024 * 1024) || 100 * 1024 * 1024);

  async function handleThreadsList(req, res, url) {
    deps.pruneEmptyThreads();
    const workspaceId = url.searchParams.get("workspaceId") || "";
    const projectId = url.searchParams.get("projectId") || "";
    const subprojectId = url.searchParams.get("subprojectId") || "";
    const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
    if (workspaceId) {
      const allowedWorkspaceId = deps.requireWorkspaceAccess(req, res, workspaceId);
      if (!allowedWorkspaceId) return;
    }
    const selectedProject = workspaceId && projectId ? deps.findProject(workspaceId, projectId) : null;
    const selectedSubproject = selectedProject && subprojectId ? deps.findSubproject(selectedProject, subprojectId) : null;
    let threads = deps.state().threads.filter((item) => deps.threadAccessibleToRequest(req, item));
    if (workspaceId) {
      threads = threads.filter((item) => item.workspaceId === workspaceId || deps.chatGroupMemberWorkspaceIds(item).includes(workspaceId));
    }
    if (projectId) threads = threads.filter((item) => item.projectId === projectId);
    if (subprojectId) threads = threads.filter((item) => (item.subprojectId || "") === subprojectId);
    if (search) {
      threads = threads.filter((item) => {
        const haystack = `${item.title}\n${(item.messages || []).map((msg) => msg.content || "").join("\n")}`.toLowerCase();
        return haystack.includes(search);
      });
    }
    const summaries = [
      ...threads.map(deps.threadSummary),
      ...deps.singleWindowProjectTaskSummaries(workspaceId, selectedProject, selectedSubproject, search),
    ].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    deps.sendJson(res, 200, { data: summaries });
  }

  async function handleThreadsCreate(req, res) {
    deps.pruneEmptyThreads();
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const projectId = String(body.projectId || "general");
    const subprojectId = String(body.subprojectId || "");
    const workspace = deps.findWorkspace(workspaceId);
    const project = deps.findProject(workspaceId, projectId);
    if (!workspace) {
      deps.sendJson(res, 400, { error: "Unknown workspace" });
      return;
    }
    if (!project) {
      deps.sendJson(res, 400, { error: "Unknown project" });
      return;
    }
    if (subprojectId && !deps.findSubproject(project, subprojectId)) {
      deps.sendJson(res, 400, { error: "Unknown subproject" });
      return;
    }
    const thread = deps.normalizeThread({
      id: deps.makeId("thread"),
      title: String(body.title || "New thread").trim() || "New thread",
      workspaceId,
      projectId,
      subprojectId,
      hermesSessionId: `web_${deps.makeId("session")}`,
      status: "idle",
      createdAt: deps.nowIso(),
      updatedAt: deps.nowIso(),
      messages: [],
      events: [],
    });
    deps.state().threads.unshift(thread);
    deps.saveState();
    deps.broadcast({ type: "thread.updated", thread: deps.threadSummary(thread) });
    deps.sendJson(res, 201, { thread: deps.compactThread(thread) });
  }

  async function handleThreadRead(req, res, url) {
    const thread = deps.findThreadForRequest(req, routeIdFromPath(url.pathname, /^\/api\/threads\/([^/]+)$/));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    if (deps.isDiscardableEmptyThread(thread)) {
      deps.pruneEmptyThreads();
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageMode = String(url.searchParams.get("messageMode") || url.searchParams.get("message_mode") || "").trim().toLowerCase();
    if (["chat", "tasks", "task"].includes(messageMode)) {
      deps.sendJson(res, 200, {
        thread: deps.compactThreadWithMessagePage(thread, {
          mode: messageMode,
          groupChat: deps.boolParam(url.searchParams.get("groupChat") || url.searchParams.get("group_chat")),
          taskGroupId: url.searchParams.get("taskGroupId") || url.searchParams.get("task_group_id") || "",
          limit: url.searchParams.get("messageLimit") || url.searchParams.get("message_limit") || threadMessageInitialLimit,
        }),
      });
      return;
    }
    deps.sendJson(res, 200, { thread: deps.compactThread(thread) });
  }

  async function handleThreadMessagesList(req, res, url) {
    const thread = deps.findThreadForRequest(req, routeIdFromPath(url.pathname, /^\/api\/threads\/([^/]+)\/messages$/));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const messageMode = String(url.searchParams.get("messageMode") || url.searchParams.get("message_mode") || "chat").trim().toLowerCase();
    const options = {
      mode: messageMode,
      groupChat: deps.boolParam(url.searchParams.get("groupChat") || url.searchParams.get("group_chat")),
      taskGroupId: url.searchParams.get("taskGroupId") || url.searchParams.get("task_group_id") || "",
      before: url.searchParams.get("before") || "",
      limit: url.searchParams.get("limit") || threadMessagePageLimit,
      search: url.searchParams.get("search") || url.searchParams.get("q") || "",
    };
    const page = String(options.search || "").trim()
      ? deps.searchThreadMessages(thread, Object.assign({}, options, { limit: url.searchParams.get("limit") || threadMessageSearchLimit }))
      : deps.threadMessagesPage(thread, options);
    deps.sendJson(res, 200, {
      messages: page.messages.map((message) => deps.compactMessage(message, thread)),
      page: page.page,
    });
  }

  async function handleThreadUpload(req, res, url) {
    const auth = deps.authenticateRequest(req);
    const thread = deps.findThreadForRequest(req, routeIdFromPath(url.pathname, /^\/api\/threads\/([^/]+)\/uploads$/));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const body = await deps.readBody(req, Math.ceil(maxUploadBytes * 1.4) + 4096);
    const filename = deps.safeFileName(body.filename || "upload.bin");
    const data = String(body.dataBase64 || "");
    if (!data) {
      deps.sendJson(res, 400, { error: "Missing dataBase64" });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > maxUploadBytes) {
      deps.sendJson(res, 400, { error: "Invalid or too-large upload" });
      return;
    }
    let uploadTarget;
    try {
      uploadTarget = deps.workspaceUploadDirectoryForRequest(auth, thread, body);
    } catch (err) {
      deps.sendJson(res, err.status || 500, { error: err.message || String(err) });
      return;
    }
    const uploadDir = uploadTarget.uploadDir;
    deps.mkdirSync(uploadDir);
    const filePath = path.join(uploadDir, `${Date.now()}-${deps.randomBytes(3).toString("hex")}-${filename}`);
    deps.writeFileSync(filePath, buffer);
    const artifact = deps.registerUploadArtifact(thread, null, filePath, filename, { workspaceId: uploadTarget.workspaceId });
    deps.saveState();
    deps.sendJson(res, 201, { artifact });
  }

  async function handleServerFileAttachment(req, res, url) {
    const auth = deps.authenticateRequest(req);
    const thread = deps.findThreadForRequest(req, routeIdFromPath(url.pathname, /^\/api\/threads\/([^/]+)\/server-file-attachments$/));
    if (!thread) {
      deps.sendJson(res, 404, { error: "Thread not found" });
      return;
    }
    const body = await deps.readBody(req, 8192);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || thread.workspaceId || auth?.workspaceId || "owner");
    if (!workspaceId) return;
    const params = new URLSearchParams();
    const pathText = String(body.path || body.displayPath || body.workspacePath || "").trim();
    const alias = String(body.alias || "").trim();
    if (pathText) params.set("path", pathText);
    if (alias) params.set("alias", alias);
    if (!pathText && !alias) {
      deps.sendJson(res, 400, { error: "Missing server file path" });
      return;
    }
    const resolved = await deps.resolveBrowserPathAsync(Object.assign({}, thread, { workspaceId }), params);
    if (!resolved) {
      deps.sendJson(res, 404, { error: "Server file not found or not allowed" });
      return;
    }
    if (resolved.remote) {
      deps.sendJson(res, 400, { error: "Remote server files are not attachable yet" });
      return;
    }
    let stat;
    try {
      stat = deps.statSync(resolved.localPath);
    } catch (_) {
      deps.sendJson(res, 404, { error: "Server file not found" });
      return;
    }
    if (!stat.isFile()) {
      deps.sendJson(res, 400, { error: "Server attachment path must be a file" });
      return;
    }
    const artifact = deps.registerUploadArtifact(
      Object.assign({}, thread, { workspaceId }),
      null,
      resolved.localPath,
      deps.safeFileName(body.filename || path.basename(resolved.localPath)),
      { workspaceId },
    );
    deps.saveState();
    deps.sendJson(res, 201, { artifact });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "threads-list") await handleThreadsList(req, res, url, context);
    else if (route.id === "threads-create") await handleThreadsCreate(req, res, url, context);
    else if (route.id === "thread-read") await handleThreadRead(req, res, url, context);
    else if (route.id === "thread-messages-list") await handleThreadMessagesList(req, res, url, context);
    else if (route.id === "thread-uploads-create") await handleThreadUpload(req, res, url, context);
    else if (route.id === "thread-server-file-attachments-create") await handleServerFileAttachment(req, res, url, context);
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
  THREAD_READ_UPLOAD_API_ROUTE_SPECS,
  createThreadReadUploadApiRoutes,
};
