"use strict";

const assert = require("node:assert/strict");
const {
  THREAD_MESSAGE_RUN_API_ROUTE_SPECS,
  createThreadMessageRunApiRoutes,
} = require("../server-routes/thread-message-run-api-routes");

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

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

async function main() {
  assert.equal(THREAD_MESSAGE_RUN_API_ROUTE_SPECS.length, 2);

  const calls = [];
  const routes = createThreadMessageRunApiRoutes({
    handleThreadMessageCreate(req, res, _url, context) {
      calls.push({ handler: "create", method: req.method, threadId: context.threadId, auth: context.auth, routeId: context.route.id });
      res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    },
    handleThreadMessageOwnerElevation(req, res, _url, context) {
      calls.push({ handler: "owner", method: req.method, threadId: context.threadId, messageId: context.messageId, auth: context.auth, routeId: context.route.id });
      res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    },
  });

  assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-1/messages" }).id, "thread-messages-create");
  assert.equal(routes.match({ method: "POST", path: "/api/threads/thread-1/messages/msg-1/owner-elevation" }).id, "thread-message-owner-elevation");
  assert.equal(routes.match({ method: "GET", path: "/api/threads/thread-1/messages" }), null);

  {
    const res = makeResponse();
    const result = await routes.handle(
      { method: "POST", url: "/api/threads/thread-1/messages" },
      res,
      makeUrl("/api/threads/thread-1/messages"),
      { auth: { ok: true, workspaceId: "owner" } },
    );
    assert.equal(result.handled, true);
    assert.equal(result.route.id, "thread-messages-create");
    assert.equal(res.statusCode, 202);
    assert.deepEqual(calls.at(-1), {
      handler: "create",
      method: "POST",
      threadId: "thread-1",
      auth: { ok: true, workspaceId: "owner" },
      routeId: "thread-messages-create",
    });
  }

  {
    const res = makeResponse();
    const result = await routes.handle(
      { method: "POST", url: "/api/threads/thread-1/messages/msg-1/owner-elevation" },
      res,
      makeUrl("/api/threads/thread-1/messages/msg-1/owner-elevation"),
      { auth: { ok: true, owner: true } },
    );
    assert.equal(result.handled, true);
    assert.equal(result.route.id, "thread-message-owner-elevation");
    assert.equal(res.statusCode, 202);
    assert.deepEqual(calls.at(-1), {
      handler: "owner",
      method: "POST",
      threadId: "thread-1",
      messageId: "msg-1",
      auth: { ok: true, owner: true },
      routeId: "thread-message-owner-elevation",
    });
  }

  {
    const res = makeResponse();
    const result = await routes.handle(
      { method: "POST", url: "/api/threads/thread%20space/messages/msg%2Fslash/owner-elevation" },
      res,
      makeUrl("/api/threads/thread%20space/messages/msg%2Fslash/owner-elevation"),
      { auth: { ok: true, owner: true } },
    );
    assert.equal(result.handled, true);
    assert.deepEqual(calls.at(-1), {
      handler: "owner",
      method: "POST",
      threadId: "thread space",
      messageId: "msg/slash",
      auth: { ok: true, owner: true },
      routeId: "thread-message-owner-elevation",
    });
  }

  {
    const res = makeResponse();
    const result = await routes.handle(
      { method: "GET", url: "/api/threads/thread-1/messages" },
      res,
      makeUrl("/api/threads/thread-1/messages"),
      {},
    );
    assert.equal(result.handled, false);
    assert.equal(res.statusCode, 0);
  }

  assert.throws(() => createThreadMessageRunApiRoutes({}), /require handleThreadMessageCreate/);
  assert.throws(() => createThreadMessageRunApiRoutes({ handleThreadMessageCreate() {} }), /require handleThreadMessageOwnerElevation/);
}

main().then(() => {
  console.log("thread message run api routes tests passed");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
