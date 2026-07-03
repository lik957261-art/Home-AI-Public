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

async function loadUploadClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-upload-client.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

function makeUploadRouteHarness(overrides = {}) {
  const thread = {
    id: "thread-vite-upload-contract",
    title: "Vite upload contract",
    workspaceId: "owner",
    projectId: "general",
    status: "idle",
    messages: [],
    events: [],
  };
  const state = { threads: [thread] };
  const calls = {
    access: [],
    mkdir: [],
    readBody: [],
    registerArtifact: [],
    saved: 0,
    uploads: [],
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
      return `${prefix}_vite_upload_contract`;
    },
    maxUploadBytes: 32,
    normalizeThread(item) {
      return item;
    },
    nowIso() {
      return "2026-07-03T02:00:00.000Z";
    },
    pruneEmptyThreads() {},
    readBody(req, limit) {
      calls.readBody.push({ body: req.body || {}, limit });
      return Promise.resolve(req.body || {});
    },
    registerUploadArtifact(item, message, filePath, originalName, options) {
      const artifact = {
        id: "artifact-vite-upload-contract",
        threadId: item.id,
        messageId: message?.id || "",
        path: filePath,
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
    resolveBrowserPathAsync() {
      return null;
    },
    safeFileName(value) {
      return String(value || "upload.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "upload.bin";
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
    threadAccessibleToRequest() {
      return true;
    },
    threadMessagesPage() {
      return { messages: [], page: { total: 0 } };
    },
    threadSummary(item) {
      return { id: item.id, workspaceId: item.workspaceId };
    },
    workspaceUploadDirectoryForRequest(auth, item, body) {
      calls.uploads.push({ auth, threadId: item.id, body });
      if (body.workspaceId === "denied") {
        const err = new Error("Workspace upload directory is not available");
        err.status = 400;
        throw err;
      }
      return {
        workspaceId: body.workspaceId || item.workspaceId,
        uploadDir: "/tmp/home-ai-vite-upload-contract",
      };
    },
    mkdirSync(dir) {
      calls.mkdir.push(dir);
    },
    randomBytes() {
      return Buffer.from("a1b2c3", "hex");
    },
    statSync(filePath) {
      return { isFile: () => filePath.includes("allowed") };
    },
    writeFileSync(filePath, buffer) {
      calls.write.push({ filePath, text: buffer.toString("utf8"), length: buffer.length });
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
      const error = new Error(parsed.error || "vite_upload_backend_contract_failed");
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
  await test("Vite upload client matches the real thread upload route contract", async () => {
    const client = await loadUploadClient();
    const { api, calls, thread } = makeUploadRouteHarness();
    const dataBase64 = Buffer.from("# Vite upload\n").toString("base64");

    const upload = await client.uploadComposerFile({
      api,
      threadId: thread.id,
      filename: "report?.md",
      type: "text/markdown",
      size: 14,
      dataBase64,
      workspaceId: "owner",
    });

    assert.equal(upload.ok, true);
    assert.equal(upload.request.path, `/api/threads/${thread.id}/uploads`);
    assert.equal(upload.request.method, "POST");
    assert.equal(upload.request.filename, "report?.md");
    assert.equal(upload.request.type, "text/markdown");
    assert.equal(upload.request.workspaceId, "owner");
    assert.equal(upload.request.dataBase64Length, dataBase64.length);
    assert.equal(upload.artifact.id, "artifact-vite-upload-contract");
    assert.equal(upload.artifact.name, "report_.md");
    assert.equal(upload.artifact.source, "system_upload");
    assert.equal(calls.mkdir[0], "/tmp/home-ai-vite-upload-contract");
    assert.equal(calls.write[0].text, "# Vite upload\n");
    assert.match(calls.write[0].filePath, /\/tmp\/home-ai-vite-upload-contract\/\d+-a1b2c3-report_\.md$/);
    assert.equal(calls.registerArtifact[0].originalName, "report_.md");
    assert.equal(calls.saved, 1);
    assert.equal(JSON.stringify(upload.artifact).includes(dataBase64), false);
  });

  await test("Vite upload client surfaces real route rejection without silent fallback", async () => {
    const client = await loadUploadClient();
    const { api, thread } = makeUploadRouteHarness({ maxUploadBytes: 4 });
    await assert.rejects(
      () => client.uploadComposerFile({
        api,
        threadId: thread.id,
        filename: "too-large.txt",
        type: "text/plain",
        dataBase64: Buffer.from("too large").toString("base64"),
        workspaceId: "owner",
      }),
      (error) => error.status === 400 && /Invalid or too-large upload/.test(error.message),
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
