"use strict";

const assert = require("node:assert/strict");
const {
  THREAD_READ_UPLOAD_API_ROUTE_SPECS,
  createThreadReadUploadApiRoutes,
} = require("../server-routes/thread-read-upload-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const state = {
    threads: [
      {
        id: "thread-a",
        title: "Alpha thread",
        workspaceId: "owner",
        projectId: "general",
        subprojectId: "",
        status: "idle",
        createdAt: "2026-05-14T10:00:00.000Z",
        updatedAt: "2026-05-14T10:10:00.000Z",
        messages: [
          { id: "msg-1", role: "user", content: "hello alpha", taskGroupId: "chat", createdAt: "2026-05-14T10:00:00.000Z" },
          { id: "msg-2", role: "assistant", content: "answer beta", taskGroupId: "chat", createdAt: "2026-05-14T10:01:00.000Z" },
          { id: "msg-3", role: "assistant", content: "task result", taskGroupId: "task-a", createdAt: "2026-05-14T10:02:00.000Z" },
        ],
        events: [],
      },
      {
        id: "thread-group",
        title: "Group thread",
        workspaceId: "owner",
        projectId: "general",
        subprojectId: "",
        status: "idle",
        updatedAt: "2026-05-14T10:20:00.000Z",
        chatGroup: { memberWorkspaceIds: ["child-a"] },
        messages: [{ id: "group-1", role: "user", content: "shared group", taskGroupId: "chat" }],
        events: [],
      },
      {
        id: "thread-hidden",
        title: "Hidden thread",
        workspaceId: "hidden",
        projectId: "general",
        status: "idle",
        updatedAt: "2026-05-14T10:30:00.000Z",
        messages: [{ id: "hidden-1", role: "user", content: "secret" }],
        events: [],
      },
    ],
  };
  const calls = {
    access: [],
    broadcast: [],
    compactThreadWithPage: [],
    mkdir: [],
    prune: 0,
    readBody: [],
    registerArtifact: [],
    resolve: [],
    saved: 0,
    stat: [],
    uploads: [],
    write: [],
  };
  let idCounter = 0;
  const deps = Object.assign({
    authenticateRequest(req) {
      return req.auth || { ok: true, workspaceId: "owner" };
    },
    boolParam(value) {
      return /^(1|true|yes|on)$/i.test(String(value || ""));
    },
    broadcast(event) {
      calls.broadcast.push(event);
    },
    chatGroupMemberWorkspaceIds(thread) {
      return thread.chatGroup?.memberWorkspaceIds || [];
    },
    compactMessage(message) {
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        taskGroupId: message.taskGroupId || "",
      };
    },
    compactThread(thread, options = {}) {
      return {
        id: thread.id,
        title: thread.title,
        workspaceId: thread.workspaceId,
        projectId: thread.projectId,
        subprojectId: thread.subprojectId || "",
        messages: (options.messages || thread.messages || []).map((message) => deps.compactMessage(message, thread)),
        messagesPage: options.messagePage || null,
      };
    },
    compactThreadWithMessagePage(thread, options = {}) {
      calls.compactThreadWithPage.push({ threadId: thread.id, options });
      const page = deps.threadMessagesPage(thread, options);
      return deps.compactThread(thread, { messages: page.messages, messagePage: page.page });
    },
    findProject(workspaceId, projectId) {
      if (workspaceId === "owner" && projectId === "general") return { id: "general", label: "General" };
      return null;
    },
    findSubproject(project, subprojectId) {
      if (project?.id === "general" && subprojectId === "sub-a") return { id: "sub-a", label: "Sub A" };
      return null;
    },
    findThreadForRequest(_req, threadId) {
      return state.threads.find((thread) => thread.id === threadId) || null;
    },
    findWorkspace(workspaceId) {
      return workspaceId === "owner" ? { id: "owner" } : null;
    },
    isDiscardableEmptyThread(thread) {
      return Boolean(thread.discardable);
    },
    makeId(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
    maxUploadBytes: 16,
    normalizeThread(thread) {
      return Object.assign({ normalized: true }, thread);
    },
    nowIso() {
      return "2026-05-14T12:00:00.000Z";
    },
    pruneEmptyThreads() {
      calls.prune += 1;
      state.threads = state.threads.filter((thread) => !thread.pruned);
    },
    readBody(req, limit) {
      calls.readBody.push({ body: req.body || {}, limit });
      return Promise.resolve(req.body || {});
    },
    registerUploadArtifact(thread, message, filePath, originalName, options) {
      const artifact = { id: "artifact-a", threadId: thread.id, messageId: message?.id || "", path: filePath, name: originalName, workspaceId: options.workspaceId };
      calls.registerArtifact.push({ threadId: thread.id, message, filePath, originalName, options });
      return artifact;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.access.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    async resolveBrowserPathAsync(thread, params) {
      calls.resolve.push({ threadId: thread.id, workspaceId: thread.workspaceId, path: params.get("path") || "", alias: params.get("alias") || "" });
      const pathText = params.get("path") || "";
      if (pathText === "missing") return null;
      if (pathText === "remote/file.pdf") return { remote: "wsl", remoteEntry: { type: "file" } };
      return {
        displayPath: pathText || "微信导入/report.pdf",
        workspacePath: pathText || "微信导入/report.pdf",
        localPath: pathText === "folder" ? "/safe/folder" : "/safe/weixin/report.pdf",
      };
    },
    safeFileName(value) {
      return String(value || "upload.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "upload.bin";
    },
    saveState() {
      calls.saved += 1;
    },
    searchThreadMessages(thread, options = {}) {
      const query = String(options.search || "").toLowerCase();
      const messages = (thread.messages || []).filter((message) => String(message.content || "").toLowerCase().includes(query));
      return { messages, page: { mode: options.mode, search: query, totalMatches: messages.length, limit: Number(options.limit) } };
    },
    sendJson,
    singleWindowProjectTaskSummaries(workspaceId, project, subproject, search) {
      if (!workspaceId || !project || search) return [];
      return [{
        id: "single-task:thread-a:task-a",
        title: "Task A",
        workspaceId,
        projectId: project.id,
        subprojectId: subproject?.id || "",
        updatedAt: "2026-05-14T10:15:00.000Z",
      }];
    },
    state: () => state,
    threadAccessibleToRequest(req, thread) {
      return req.accessAll || thread.workspaceId !== "hidden";
    },
    threadMessageInitialLimit: 2,
    threadMessagePageLimit: 2,
    threadMessageSearchLimit: 3,
    threadMessagesPage(thread, options = {}) {
      const messages = (thread.messages || []).filter((message) => {
        if ((options.mode || "") !== "chat") return true;
        return String(message.taskGroupId || "") === (options.groupChat ? "group-chat" : "chat");
      });
      const limit = Number(options.limit || 2);
      return { messages: messages.slice(-limit), page: { mode: options.mode || "all", total: messages.length, limit } };
    },
    threadSummary(thread) {
      return {
        id: thread.id,
        title: thread.title,
        workspaceId: thread.workspaceId,
        projectId: thread.projectId,
        subprojectId: thread.subprojectId || "",
        updatedAt: thread.updatedAt || "",
        preview: thread.messages?.at(-1)?.content || "",
      };
    },
    workspaceUploadDirectoryForRequest(auth, thread, body) {
      calls.uploads.push({ auth, threadId: thread.id, body });
      if (body.workspaceId === "denied") {
        const err = new Error("Workspace upload directory is not available");
        err.status = 400;
        throw err;
      }
      return { workspaceId: body.workspaceId || thread.workspaceId, uploadDir: "C:\\Uploads\\thread-a" };
    },
    mkdirSync(dir) {
      calls.mkdir.push(dir);
    },
    randomBytes() {
      return Buffer.from("a1b2c3", "hex");
    },
    statSync(filePath) {
      calls.stat.push(filePath);
      return { isFile: () => filePath !== "/safe/folder" };
    },
    writeFileSync(filePath, buffer) {
      calls.write.push({ filePath, text: buffer.toString("utf8"), length: buffer.length });
    },
  }, overrides);
  return { routes: createThreadReadUploadApiRoutes(deps), calls, state };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const result = await routes.handle(
    { method, url: path, body: options.body || {}, auth: options.auth, accessAll: options.accessAll },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  const contentType = String(res.headers["Content-Type"] || "");
  const body = contentType.startsWith("application/json") && res.body ? parseBody(res) : null;
  return { result, res, body };
}

async function testRouteMetadataAndFallthrough() {
  assert.deepEqual(THREAD_READ_UPLOAD_API_ROUTE_SPECS.map((route) => route.id), [
    "threads-list",
    "threads-create",
    "thread-read",
    "thread-messages-list",
    "thread-uploads-create",
    "thread-server-file-attachments-create",
  ]);

  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/threads" }).id, "threads-list");
  assert.equal(routes.match({ method: "POST", path: "/api/threads" }).id, "threads-create");
  assert.equal(routes.match({ method: "GET", path: "/api/threads/thread-a" }).id, "thread-read");
  assert.equal(routes.match({ method: "GET", path: "/api/threads/thread-a/messages" }).id, "thread-messages-list");
  assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-a/uploads" }).id, "thread-uploads-create");
  assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-a/server-file-attachments" }).id, "thread-server-file-attachments-create");
  assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-a/messages" }), null);
  assert.equal(routes.summary({ public: true }).byModule.thread, 3);
  assert.equal(routes.summary({ public: true }).byModule["thread-message"], 1);
  assert.equal(routes.summary({ public: true }).byModule["thread-upload"], 2);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testThreadsListFiltersAccessibleThreadsAndAddsSingleWindowSummaries() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/threads?workspaceId=owner&projectId=general");

  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.access, ["owner"]);
  assert.equal(calls.prune, 1);
  assert.deepEqual(got.body.data.map((item) => item.id), [
    "thread-group",
    "single-task:thread-a:task-a",
    "thread-a",
  ]);

  const groupVisible = await request(routes, "GET", "/api/threads?workspaceId=child-a");
  assert.deepEqual(groupVisible.body.data.map((item) => item.id), ["thread-group"]);
}

async function testThreadsCreateValidatesAndBroadcasts() {
  const { routes, calls, state } = makeRoutes();
  const got = await request(routes, "POST", "/api/threads", {
    body: { workspaceId: "owner", projectId: "general", subprojectId: "sub-a", title: " New topic " },
  });

  assert.equal(got.res.statusCode, 201);
  assert.equal(got.body.thread.title, "New topic");
  assert.equal(got.body.thread.workspaceId, "owner");
  assert.equal(got.body.thread.subprojectId, "sub-a");
  assert.equal(state.threads[0].normalized, true);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcast[0].type, "thread.updated");

  const badProject = await request(routes, "POST", "/api/threads", {
    body: { workspaceId: "owner", projectId: "missing" },
  });
  assert.equal(badProject.res.statusCode, 400);
  assert.deepEqual(badProject.body, { error: "Unknown project" });
}

async function testThreadReadAndMessagePaging() {
  const { routes, calls, state } = makeRoutes();
  const paged = await request(routes, "GET", "/api/threads/thread-a?messageMode=chat&messageLimit=1");
  assert.equal(paged.res.statusCode, 200);
  assert.deepEqual(calls.compactThreadWithPage[0], {
    threadId: "thread-a",
    options: { mode: "chat", groupChat: false, taskGroupId: "", limit: "1" },
  });
  assert.deepEqual(paged.body.thread.messages.map((message) => message.id), ["msg-2"]);

  const full = await request(routes, "GET", "/api/threads/thread-a");
  assert.equal(full.body.thread.messages.length, 3);

  state.threads.push({ id: "empty", workspaceId: "owner", projectId: "general", discardable: true, messages: [] });
  const empty = await request(routes, "GET", "/api/threads/empty");
  assert.equal(empty.res.statusCode, 404);
  assert.equal(calls.prune >= 1, true);
}

async function testThreadMessagesSearchAndPage() {
  const { routes } = makeRoutes();
  const page = await request(routes, "GET", "/api/threads/thread-a/messages?messageMode=chat&limit=1");
  assert.equal(page.res.statusCode, 200);
  assert.deepEqual(page.body.messages.map((message) => message.id), ["msg-2"]);
  assert.equal(page.body.page.limit, 1);

  const search = await request(routes, "GET", "/api/threads/thread-a/messages?search=beta");
  assert.equal(search.res.statusCode, 200);
  assert.deepEqual(search.body.messages.map((message) => message.id), ["msg-2"]);
  assert.equal(search.body.page.search, "beta");
}

async function testThreadUpload() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/threads/thread-a/uploads", {
    auth: { ok: true, workspaceId: "owner" },
    body: {
      filename: "report?.md",
      dataBase64: Buffer.from("hello").toString("base64"),
      workspaceId: "owner",
    },
  });

  assert.equal(got.res.statusCode, 201);
  assert.equal(got.body.artifact.id, "artifact-a");
  assert.deepEqual(calls.mkdir, ["C:\\Uploads\\thread-a"]);
  assert.equal(calls.write.length, 1);
  assert.match(calls.write[0].filePath, /C:\\Uploads\\thread-a[/\\]\d+-a1b2c3-report_\.md$/);
  assert.equal(calls.write[0].text, "hello");
  assert.equal(calls.saved, 1);
  assert.equal(calls.registerArtifact[0].originalName, "report_.md");

  const missing = await request(routes, "POST", "/api/threads/thread-a/uploads", { body: { filename: "a.txt" } });
  assert.equal(missing.res.statusCode, 400);
  assert.deepEqual(missing.body, { error: "Missing dataBase64" });

  const denied = await request(routes, "POST", "/api/threads/thread-a/uploads", {
    body: { filename: "a.txt", dataBase64: Buffer.from("x").toString("base64"), workspaceId: "denied" },
  });
  assert.equal(denied.res.statusCode, 400);
  assert.deepEqual(denied.body, { error: "Workspace upload directory is not available" });
}

async function testThreadServerFileAttachment() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/threads/thread-a/server-file-attachments", {
    auth: { ok: true, workspaceId: "owner" },
    body: {
      path: "微信导入/report.pdf",
      workspaceId: "owner",
    },
  });

  assert.equal(got.res.statusCode, 201);
  assert.equal(got.body.artifact.id, "artifact-a");
  assert.deepEqual(calls.access.at(-1), "owner");
  assert.deepEqual(calls.resolve.at(-1), {
    threadId: "thread-a",
    workspaceId: "owner",
    path: "微信导入/report.pdf",
    alias: "",
  });
  assert.equal(calls.write.length, 0);
  assert.equal(calls.registerArtifact.at(-1).filePath, "/safe/weixin/report.pdf");
  assert.equal(calls.registerArtifact.at(-1).originalName, "report.pdf");
  assert.equal(calls.saved, 1);

  const missingBody = await request(routes, "POST", "/api/threads/thread-a/server-file-attachments", { body: {} });
  assert.equal(missingBody.res.statusCode, 400);
  assert.deepEqual(missingBody.body, { error: "Missing server file path" });

  const missingFile = await request(routes, "POST", "/api/threads/thread-a/server-file-attachments", { body: { path: "missing" } });
  assert.equal(missingFile.res.statusCode, 404);
  assert.deepEqual(missingFile.body, { error: "Server file not found or not allowed" });

  const remote = await request(routes, "POST", "/api/threads/thread-a/server-file-attachments", { body: { path: "remote/file.pdf" } });
  assert.equal(remote.res.statusCode, 400);
  assert.deepEqual(remote.body, { error: "Remote server files are not attachable yet" });

  const folder = await request(routes, "POST", "/api/threads/thread-a/server-file-attachments", { body: { path: "folder" } });
  assert.equal(folder.res.statusCode, 400);
  assert.deepEqual(folder.body, { error: "Server attachment path must be a file" });
}

function testDependencyValidation() {
  assert.throws(
    () => createThreadReadUploadApiRoutes({}),
    /thread read upload api routes require authenticateRequest/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testThreadsListFiltersAccessibleThreadsAndAddsSingleWindowSummaries();
  await testThreadsCreateValidatesAndBroadcasts();
  await testThreadReadAndMessagePaging();
  await testThreadMessagesSearchAndPage();
  await testThreadUpload();
  await testThreadServerFileAttachment();
  testDependencyValidation();
  console.log("thread read upload api routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
