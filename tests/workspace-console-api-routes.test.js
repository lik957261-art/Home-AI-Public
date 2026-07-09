"use strict";

const assert = require("node:assert/strict");
const { createWorkspaceConsoleApiRoutes } = require("../server-routes/workspace-console-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, this.headers, headers);
    },
    end(body = "") {
      this.body += String(body);
    },
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(res) {
  return JSON.parse(res.body || "{}");
}

async function call(routes, method, path, owner = true) {
  const req = { method, url: path, owner };
  const res = makeResponse();
  const result = await routes.handle(req, res, new URL(path, "http://localhost"));
  return { result, res, body: parseBody(res) };
}

function createRoutes(options = {}) {
  return createWorkspaceConsoleApiRoutes({
    workspaceConsoleService: {
      summary: options.summary || (async () => ({
        ok: true,
        overallStatus: "ok",
        sections: { localCodex: { items: [] }, remoteCodex: { items: [] } },
      })),
    },
    requireOwner(req, res) {
      if (req.owner) return { ok: true, isOwner: true, workspaceId: "owner" };
      sendJson(res, 403, { ok: false, error: "Owner required" });
      return null;
    },
    sendJson,
  });
}

async function testOwnerCanReadWorkspaceConsoleSummary() {
  const routes = createRoutes({
    summary: async ({ ownerAuth }) => ({
      ok: false,
      ownerWorkspaceId: ownerAuth.workspaceId,
      overallStatus: "blocked",
      counts: { localCodex: 1, remoteCodex: 1 },
      sections: {
        localCodex: { title: "本机 Codex 工作区", items: [{ id: "home-ai", kind: "local_codex" }] },
        remoteCodex: { title: "远程 Codex 工作区", items: [{ id: "remote-game", kind: "remote_codex" }] },
      },
    }),
  });

  const response = await call(routes, "GET", "/api/owner/workspace-console");
  assert.equal(response.result.handled, true);
  assert.equal(response.res.statusCode, 200);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.workspaceConsole.ownerWorkspaceId, "owner");
  assert.equal(response.body.workspaceConsole.counts.remoteCodex, 1);
  assert.equal(response.body.workspaceConsole.sections.localCodex.title, "本机 Codex 工作区");
  assert.equal(response.body.workspaceConsole.sections.remoteCodex.items[0].kind, "remote_codex");
}

async function testNonOwnerIsRejected() {
  const routes = createRoutes();
  const response = await call(routes, "GET", "/api/owner/workspace-console", false);
  assert.equal(response.result.handled, true);
  assert.equal(response.res.statusCode, 403);
  assert.equal(response.body.error, "Owner required");
}

async function testUnknownRouteFallsThrough() {
  const routes = createRoutes();
  const req = { method: "GET", url: "/api/owner/workspace-console/unknown", owner: true };
  const res = makeResponse();
  const result = await routes.handle(req, res, new URL(req.url, "http://localhost"));
  assert.deepEqual(result, { handled: false });
  assert.equal(res.body, "");
}

async function testServiceFailureIsBounded() {
  const routes = createRoutes({
    summary: async () => {
      const err = new Error("raw private path /Users/example/path should not be returned");
      err.status = 503;
      err.code = "workspace_console_test_failure";
      throw err;
    },
  });
  const response = await call(routes, "GET", "/api/owner/workspace-console");
  assert.equal(response.res.statusCode, 503);
  assert.equal(response.body.error, "workspace_console_test_failure");
  assert.equal(JSON.stringify(response.body).includes("/Users/example/path"), false);
}

async function main() {
  await testOwnerCanReadWorkspaceConsoleSummary();
  await testNonOwnerIsRejected();
  await testUnknownRouteFallsThrough();
  await testServiceFailureIsBounded();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
