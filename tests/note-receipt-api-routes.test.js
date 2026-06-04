"use strict";

const assert = require("node:assert/strict");
const {
  NOTE_RECEIPT_API_ROUTE_SPECS,
  createNoteReceiptApiRoutes,
} = require("../server-routes/note-receipt-api-routes");

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
      this.body = String(body);
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
  const calls = { access: [], findThread: [], saves: [] };
  const thread = {
    id: "thread-1",
    workspaceId: "owner",
    messages: [
      { id: "msg-1", role: "assistant", content: "测试回执" },
      { id: "user-1", role: "user", content: "用户消息" },
    ],
  };
  const deps = Object.assign({
    findThreadForRequest(req, threadId) {
      calls.findThread.push({ threadId, key: req.headers?.["x-hermes-web-key"] || "" });
      return threadId === "missing-thread" ? null : thread;
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.access.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return workspaceId || "owner";
    },
    sendJson,
    noteReceiptSaveService: {
      saveReceipt(input) {
        calls.saves.push(input);
        return Promise.resolve({ ok: true, note: { id: "note-1", title: "测试回执", attachmentCount: 0 } });
      },
    },
  }, overrides);
  return { calls, routes: createNoteReceiptApiRoutes(deps), thread };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const req = { method, url: path, headers: options.headers || {}, body: options.body || {} };
  const result = await routes.handle(req, res, makeUrl(path), options.context || {});
  return { result, res, body: res.body ? parseBody(res) : null };
}

async function testRouteMetadataAndFallthrough() {
  assert.equal(NOTE_RECEIPT_API_ROUTE_SPECS.length, 1);
  assert.equal(NOTE_RECEIPT_API_ROUTE_SPECS[0].path, "/api/note/receipts");
  assert.equal(NOTE_RECEIPT_API_ROUTE_SPECS[0].workspaceScoped, true);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "POST", path: "/api/note/receipts" }).id, "note-receipt-save");
  assert.equal(routes.match({ method: "GET", path: "/api/note/receipts" }), null);
  assert.equal(routes.summary({ public: true }).byModule["note-receipt"], 1);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testSaveReceiptUsesThreadMessageAndWorkspaceAccess() {
  const { calls, routes, thread } = makeRoutes();
  const auth = { ok: true, workspaceId: "owner" };
  const got = await request(routes, "POST", "/api/note/receipts", {
    context: { auth },
    headers: { "x-hermes-web-key": "test-key" },
    body: { threadId: "thread-1", messageId: "msg-1", workspaceId: "ignored-child" },
  });

  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body, { ok: true, note: { id: "note-1", title: "测试回执", attachmentCount: 0 } });
  assert.deepEqual(calls.findThread, [{ threadId: "thread-1", key: "test-key" }]);
  assert.deepEqual(calls.access, ["owner"]);
  assert.equal(calls.saves.length, 1);
  assert.equal(calls.saves[0].workspaceId, "owner");
  assert.equal(calls.saves[0].thread, thread);
  assert.equal(calls.saves[0].message.id, "msg-1");
  assert.deepEqual(calls.saves[0].auth, auth);
}

async function testMissingTargetsReturnControlledErrors() {
  const { routes } = makeRoutes();
  const missingInput = await request(routes, "POST", "/api/note/receipts", { body: { threadId: "thread-1" } });
  assert.equal(missingInput.res.statusCode, 400);
  assert.equal(missingInput.body.code, "note_receipt_target_required");

  const missingThread = await request(routes, "POST", "/api/note/receipts", {
    body: { threadId: "missing-thread", messageId: "msg-1" },
  });
  assert.equal(missingThread.res.statusCode, 404);
  assert.equal(missingThread.body.code, "thread_not_found");

  const missingMessage = await request(routes, "POST", "/api/note/receipts", {
    body: { threadId: "thread-1", messageId: "missing-message" },
  });
  assert.equal(missingMessage.res.statusCode, 404);
  assert.equal(missingMessage.body.code, "message_not_found");
}

async function testServiceErrorPassesThroughStatusAndCode() {
  const { routes } = makeRoutes({
    noteReceiptSaveService: {
      saveReceipt() {
        const err = new Error("Note workspace is not configured");
        err.code = "note_workspace_not_configured";
        err.status = 409;
        throw err;
      },
    },
  });
  const got = await request(routes, "POST", "/api/note/receipts", {
    body: { threadId: "thread-1", messageId: "msg-1" },
  });
  assert.equal(got.res.statusCode, 409);
  assert.deepEqual(got.body, {
    error: "Note workspace is not configured",
    code: "note_workspace_not_configured",
  });
}

function testDependencyValidation() {
  assert.throws(
    () => createNoteReceiptApiRoutes({}),
    /note receipt api routes require findThreadForRequest/,
  );
}

async function run() {
  await testRouteMetadataAndFallthrough();
  await testSaveReceiptUsesThreadMessageAndWorkspaceAccess();
  await testMissingTargetsReturnControlledErrors();
  await testServiceErrorPassesThroughStatusAndCode();
  testDependencyValidation();
  console.log("note-receipt-api-routes tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
