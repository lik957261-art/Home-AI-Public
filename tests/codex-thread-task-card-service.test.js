"use strict";

const assert = require("node:assert/strict");
const { createCodexThreadTaskCardService } = require("../adapters/codex-thread-task-card-service");

function createFetchStub() {
  const calls = [];
  const threads = [
    {
      id: "thread-home-current",
      title: "Home AI 06-22",
      cwd: "/Users/example/path",
      status: { type: "active" },
      updatedAt: 200,
    },
    {
      id: "thread-home-old",
      title: "Home AI 06-18",
      cwd: "/Users/example/path",
      status: { type: "idle" },
      updatedAt: 100,
    },
    {
      id: "thread-plugin-audit",
      title: "Plugin Workspace Audit",
      cwd: "/Users/example/path",
      status: { type: "idle" },
      updatedAt: 190,
    },
  ];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("http://codex.local/api/threads?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: threads }),
      };
    }
    if (String(url) === "http://codex.local/api/threads/thread-home-current/task-cards") {
      const body = JSON.parse(options.body || "{}");
      if (body.title === "Audit Music") assert.deepEqual(body.targetThreadIds, ["thread-plugin-audit"]);
      if (body.title === "Repair Gateway") assert.deepEqual(body.targetThreadIds, ["thread-home-current"]);
      assert.equal(body.direct, true);
      assert.equal(body.autoApprove, true);
      assert.equal(body.pending, false);
      assert.equal(body.reasoningEffort, "xhigh");
      assert.match(body.body, /central audit|diagnostic repair/i);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          direct: true,
          autoApprove: true,
          workspaceDelegationEnabled: true,
          cards: [{ id: body.title === "Repair Gateway" ? "ttc_gateway_1" : "ttc_audit_1", target: { threadId: body.targetThreadIds[0] } }],
        }),
      };
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
  };
  return { calls, fetchImpl };
}

async function testDiscoversThreadsAndSendsSingleCentralAuditCard() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  const result = await service.sendTaskCard({
    title: "Audit Music",
    body: "central audit request",
    requestId: "audit-music-1",
    reasoningEffort: "xhigh",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-current");
  assert.equal(result.targetThreadId, "thread-plugin-audit");
  assert.deepEqual(result.cardIds, ["ttc_audit_1"]);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.includes("/api/threads?"));
  assert.ok(calls[1].url.includes("/api/threads?"));
  assert.equal(calls[2].url, "http://codex.local/api/threads/thread-home-current/task-cards");
  assert.ok(calls.every((call) => call.options.headers.Authorization === "Bearer secret"));
}

async function testMissingAuditThreadFailsClosed() {
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: "thread-home-current",
            title: "Home AI 06-22",
            cwd: "/Users/example/path",
            status: "active",
          },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => service.sendTaskCard({ title: "Audit", body: "central audit request" }),
    (err) => err.code === "audit_thread_not_found" && err.status === 503,
  );
}

async function testCanSendToWorkspaceThreadByTitlePrefix() {
  const { fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway",
    body: "diagnostic repair request",
    requestId: "diag-gateway-1",
    reasoningEffort: "xhigh",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-home-current");
  assert.deepEqual(result.cardIds, ["ttc_gateway_1"]);
}

(async () => {
  await testDiscoversThreadsAndSendsSingleCentralAuditCard();
  await testMissingAuditThreadFailsClosed();
  await testCanSendToWorkspaceThreadByTitlePrefix();
  console.log("codex thread task-card service tests passed");
})();
