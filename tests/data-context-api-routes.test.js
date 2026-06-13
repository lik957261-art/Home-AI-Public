"use strict";

const assert = require("node:assert/strict");
const { createDataContextApiRoutes } = require("../server-routes/data-context-api-routes");

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
      this.body = body;
    },
  };
}

function parseJson(res) {
  return JSON.parse(res.body || "{}");
}

function makeRoutes(overrides = {}) {
  const calls = [];
  const deps = Object.assign({
    dataContextService: {
      supportedTypes() {
        return ["discussion_activity_daily"];
      },
      prepare(input) {
        calls.push({ type: "prepare", input });
        return {
          ok: true,
          type: input.type,
          context: { audit: { includedMessageCount: 2 }, targetDate: input.date || "2026-06-12" },
          markdown: "# context\n",
        };
      },
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.push({ type: "workspace", workspaceId });
      if (workspaceId === "blocked") {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return "";
      }
      return workspaceId;
    },
    sendJson(res, status, data) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    },
  }, overrides);
  return { calls, routes: createDataContextApiRoutes(deps) };
}

async function request(routes, method, pathname, body, auth = { principalId: "owner", workspaceId: "owner" }) {
  const res = makeResponse();
  const url = new URL(pathname, "http://localhost");
  const result = await routes.handle({ method, body, headers: {} }, res, url, { auth });
  return { result, res, body: parseJson(res) };
}

(async () => {
  const { calls, routes } = makeRoutes();
  const types = await request(routes, "GET", "/api/data-context/types?workspaceId=owner", {});
  assert.equal(types.result.handled, true);
  assert.equal(types.res.statusCode, 200);
  assert.deepEqual(types.body.types, ["discussion_activity_daily"]);

  const prepared = await request(routes, "POST", "/api/data-context/prepare", {
    workspaceId: "owner",
    type: "discussion_activity_daily",
    date: "2026-06-12",
    format: "markdown",
  });
  assert.equal(prepared.res.statusCode, 200);
  assert.equal(prepared.body.context.audit.includedMessageCount, 2);
  assert.equal(prepared.body.markdown, "# context\n");
  assert.equal(calls.find((call) => call.type === "prepare").input.scope.workspaceId, "owner");

  const denied = await request(routes, "POST", "/api/data-context/prepare", {
    workspaceId: "blocked",
    type: "discussion_activity_daily",
  });
  assert.equal(denied.res.statusCode, 403);
  console.log("data context api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
