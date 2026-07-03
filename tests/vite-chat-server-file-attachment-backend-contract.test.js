"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  createThreadReadUploadApiRoutes,
} = require("../server-routes/thread-read-upload-api-routes");

const repoRoot = path.resolve(__dirname, "..");

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

function makeUrl(routePath) {
  return new URL(routePath, "http://localhost");
}

async function loadServerFileClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-server-file-client.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function makeServerFileRouteHarness(overrides = {}) {
  const thread = {
    id: "thread-vite-server-file-contract",
    title: "Vite server file contract",
    workspaceId: "owner",
    projectId: "general",
    status: "idle",
    messages: [],
    events: [],
  };
  const state = { threads: [thread] };
  const calls = {
    access: [],
    readBody: [],
    registerArtifact: [],
    resolve: [],
    saved: 0,
    stat: [],
    write: [],
  };
  const deps = Object.assign({
    authenticateRequest(req) {
      return req.auth || { ok: true, workspaceId: "owner" };
    },
    boolParam(value) {
      return /^(1|true|yes|on)$/i.test(String(value || ""));
    },
    broadcast() {},
    chatGroupMemberWorkspaceIds() {
      return [];
    },
    compactMessage(message) {
      return { id: message.id, role: message.role, content: message.content };
    },
    compactThread(item) {
      return { id: item.id, workspaceId: item.workspaceId, messages: [] };
    },
    compactThreadWithMessagePage(item) {
      return { id: item.id, workspaceId: item.workspaceId, messagesPage: { total: 0 }, messages: [] };
    },
    findProject(workspaceId, projectId) {
      return workspaceId === "owner" && projectId === "general" ? { id: "general" } : null;
    },
    findSubproject() {
      return null;
    },
    findThreadForRequest(_req, threadId) {
      return state.threads.find((item) => item.id === threadId) || null;
    },
    findWorkspace(workspaceId) {
      return workspaceId === "owner" ? { id: "owner" } : null;
    },
    isDiscardableEmptyThread() {
      return false;
    },
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner || auth?.role === "owner" || auth?.workspaceId === "owner");
    },
    makeId(prefix) {
      return `${prefix}_vite_server_file_contract`;
    },
    maxUploadBytes: 32,
    normalizeThread(item) {
      return item;
    },
    nowIso() {
      return "2026-07-03T03:00:00.000Z";
    },
    pruneEmptyThreads() {},
    readBody(req, limit) {
      calls.readBody.push({ body: req.body || {}, limit });
      return Promise.resolve(req.body || {});
    },
    registerUploadArtifact(item, message, filePath, originalName, options) {
      const artifact = {
        id: "artifact-vite-server-file-contract",
        threadId: item.id,
        messageId: message?.id || "",
        name: originalName,
        filename: originalName,
        workspaceId: options.workspaceId,
      };
      calls.registerArtifact.push({ threadId: item.id, filePath, originalName, options });
      return artifact;
    },
    requireWorkspaceAccess(_req, res, workspaceId) {
      calls.access.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return workspaceId || "owner";
    },
    resolveBrowserPathAsync(item, params) {
      const pathText = params.get("path") || "";
      calls.resolve.push({
        threadId: item.id,
        workspaceId: item.workspaceId,
        path: pathText,
        alias: params.get("alias") || "",
      });
      if (pathText === "missing") return null;
      if (pathText === "remote/file.pdf") return { remote: true };
      if (pathText === "folder") return { localPath: "/safe/folder" };
      return { localPath: "/safe/weixin/report.pdf" };
    },
    safeFileName(value) {
      return String(value || "server-file").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "server-file";
    },
    saveState() {
      calls.saved += 1;
    },
    searchThreadMessages() {
      return { messages: [], page: { total: 0 } };
    },
    sendJson,
    singleWindowProjectTaskSummaries() {
      return [];
    },
    state: () => state,
    statSync(filePath) {
      calls.stat.push(filePath);
      return { isFile: () => !filePath.endsWith("/folder") };
    },
    threadAccessibleToRequest() {
      return true;
    },
    threadMessagesPage() {
      return { messages: [], page: { total: 0 } };
    },
    threadSummary(item) {
      return { id: item.id, workspaceId: item.workspaceId };
    },
    workspaceUploadDirectoryForRequest() {
      throw new Error("upload directory should not be used for server-file attachments");
    },
    mkdirSync() {},
    randomBytes() {
      return Buffer.from("a1b2c3", "hex");
    },
    writeFileSync(filePath, buffer) {
      calls.write.push({ filePath, length: buffer.length });
    },
  }, overrides);
  const routes = createThreadReadUploadApiRoutes(deps);

  async function api(routePath, requestOptions = {}) {
    const body = requestOptions.body ? JSON.parse(requestOptions.body) : {};
    const auth = { ok: true, workspaceId: "owner" };
    const res = makeResponse();
    const result = await routes.handle(
      { method: requestOptions.method || "GET", url: routePath, body, auth },
      res,
      makeUrl(routePath),
      { auth },
    );
    const parsed = res.body ? JSON.parse(res.body) : {};
    if (!result.handled || res.statusCode >= 400) {
      const error = new Error(parsed.error || "vite_server_file_backend_contract_failed");
      error.status = res.statusCode || 0;
      error.body = parsed;
      throw error;
    }
    return parsed;
  }

  return { api, calls, state, thread };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("Vite server-file client matches the real thread attachment route contract", async () => {
    const client = await loadServerFileClient();
    const { api, calls, thread } = makeServerFileRouteHarness();

    const attached = await client.attachServerFileToComposer({
      api,
      threadId: thread.id,
      workspaceId: "owner",
      entry: {
        path: "微信导入/report.pdf",
        name: "report?.pdf",
      },
    });

    assert.equal(attached.ok, true);
    assert.equal(attached.request.path, `/api/threads/${thread.id}/server-file-attachments`);
    assert.equal(attached.request.method, "POST");
    assert.equal(attached.request.filename, "report?.pdf");
    assert.equal(attached.request.workspaceId, "owner");
    assert.equal(attached.request.hasPath, true);
    assert.equal(attached.artifact.id, "artifact-vite-server-file-contract");
    assert.equal(attached.artifact.name, "report_.pdf");
    assert.equal(attached.artifact.source, "server_file");
    assert.deepEqual(calls.resolve.at(-1), {
      threadId: thread.id,
      workspaceId: "owner",
      path: "微信导入/report.pdf",
      alias: "",
    });
    assert.equal(calls.registerArtifact[0].filePath, "/safe/weixin/report.pdf");
    assert.equal(calls.registerArtifact[0].originalName, "report_.pdf");
    assert.equal(calls.write.length, 0);
    assert.equal(calls.saved, 1);
    assert.equal(JSON.stringify(attached.artifact).includes("/safe/weixin"), false);
  });

  await test("Vite server-file client surfaces real route rejection without silent fallback", async () => {
    const client = await loadServerFileClient();
    const { api, thread } = makeServerFileRouteHarness();
    await assert.rejects(
      () => client.attachServerFileToComposer({
        api,
        threadId: thread.id,
        workspaceId: "owner",
        entry: {
          path: "remote/file.pdf",
          name: "file.pdf",
        },
      }),
      (error) => error.status === 400 && /Remote server files are not attachable yet/.test(error.message),
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
