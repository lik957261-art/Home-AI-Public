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
      id: "thread-home-task-intake",
      title: "Home AI Task Intake",
      cwd: "/Users/example/path",
      status: { type: "idle" },
      updatedAt: 180,
    },
    {
      id: "thread-plugin-audit",
      title: "Plugin Workspace Audit",
      cwd: "/Users/example/path",
      status: { type: "idle" },
      updatedAt: 190,
    },
    {
      id: "thread-home-deploy",
      title: "Home AI Deploy",
      cwd: "/Users/example/path",
      status: { type: "idle" },
      updatedAt: 210,
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
    if (
      String(url) === "http://codex.local/api/threads/thread-home-current/task-cards"
      || String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards"
    ) {
      const body = JSON.parse(options.body || "{}");
      if (body.title === "Audit Music") assert.deepEqual(body.targetThreadIds, ["thread-plugin-audit"]);
      if (body.title === "Repair Gateway") assert.deepEqual(body.targetThreadIds, ["thread-home-current"]);
      if (body.title === "Repair Explicit") assert.deepEqual(body.targetThreadIds, ["thread-explicit-target"]);
      if (body.title === "Deploy Movie") assert.deepEqual(body.targetThreadIds, ["thread-home-deploy"]);
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
          cards: [{ id: body.title === "Repair Gateway" ? "ttc_gateway_1" : body.title === "Repair Explicit" ? "ttc_explicit_1" : body.title === "Deploy Movie" ? "ttc_deploy_1" : "ttc_audit_1", target: { threadId: body.targetThreadIds[0] } }],
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
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-home-current");
  assert.deepEqual(result.cardIds, ["ttc_gateway_1"]);
}

async function testHomeAiTargetPrefixSkipsDeployAndIntakeThreads() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith("http://codex.local/api/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [
              {
                id: "thread-home-deploy",
                title: "Home AI Deploy",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 490,
              },
              {
                id: "thread-home-platform-audit",
                title: "Home AI Platform Audit",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 480,
              },
              {
                id: "thread-home-current",
                title: "Home AI 06-28",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 100,
              },
            ],
          }),
        };
      }
      if (String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards") {
        const body = JSON.parse(options.body || "{}");
        assert.deepEqual(body.targetThreadIds, ["thread-home-current"]);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_gateway_prefix_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway",
    body: "diagnostic repair request",
    requestId: "diag-gateway-prefix-reserved",
    reasoningEffort: "xhigh",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-home-current");
  assert.deepEqual(result.cardIds, ["ttc_gateway_prefix_1"]);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-home-deploy/task-cards")), false);
}

async function testExplicitMissingSourceTitleDoesNotFallbackToHomeAiThread() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Repair Gateway",
      body: "diagnostic repair request",
      requestId: "diag-gateway-missing-source",
      reasoningEffort: "xhigh",
      sourceThreadTitle: "Missing Intake Thread",
      targetThreadTitlePrefix: "Home AI",
      targetWorkspaceCwd: "/Users/example/path",
    }),
    (err) => err.code === "home_ai_source_thread_not_found" && err.status === 503,
  );
  assert.equal(calls.some((call) => String(call.url).endsWith("/task-cards")), false);
}

async function testSourceTitlePrefixCanResolveDedicatedIntakeThread() {
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
    requestId: "diag-gateway-prefix-source",
    reasoningEffort: "xhigh",
    sourceThreadTitle: "Missing Exact Intake Thread",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-home-current");
}

async function testSameSourceAndTargetFailsBeforePostingTaskCard() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Repair Gateway",
      body: "diagnostic repair request",
      requestId: "diag-gateway-same-thread",
      reasoningEffort: "xhigh",
      targetThreadTitlePrefix: "Home AI",
      targetWorkspaceCwd: "/Users/example/path",
    }),
    (err) => err.code === "task_card_source_target_same_thread" && err.status === 409,
  );
  assert.equal(calls.some((call) => String(call.url).endsWith("/task-cards")), false);
}

async function testCanSendToExplicitTargetThreadIdWithoutDiscoveringTarget() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  const result = await service.sendTaskCard({
    title: "Repair Explicit",
    body: "diagnostic repair request",
    requestId: "diag-explicit-1",
    reasoningEffort: "xhigh",
    targetThreadId: "thread-explicit-target",
    targetThreadTitle: "Archived Display Title",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-explicit-target");
  assert.deepEqual(result.cardIds, ["ttc_explicit_1"]);
  assert.equal(calls.filter((call) => call.url.includes("/api/threads?")).length, 1);
}

async function testDefaultSourceDiscoverySkipsReservedDeployThread() {
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
            id: "thread-home-deploy",
            title: "Home AI Deploy",
            cwd: "/Users/example/path",
            status: "active",
            updatedAt: 300,
          },
          {
            id: "thread-home-current",
            title: "Home AI 06-28",
            cwd: "/Users/example/path",
            status: "idle",
            updatedAt: 100,
          },
        ],
      }),
    }),
  });

  const source = await service.findSourceThread();
  assert.equal(source.id, "thread-home-current");
}

async function testDeploymentKindTargetsDedicatedDeployThread() {
  const { fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  const result = await service.sendTaskCard({
    title: "Deploy Movie",
    body: "deployment readback diagnostic repair request",
    requestId: "deploy-movie-1",
    reasoningEffort: "xhigh",
    auditKind: "deployment",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-home-deploy");
  assert.deepEqual(result.cardIds, ["ttc_deploy_1"]);
}

async function testDeploymentKindCanUseConfiguredLanePoolAssignments() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith("http://codex.local/api/threads?")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [
            {
              id: "thread-home-current",
              title: "Home AI 06-30",
              cwd: "/Users/example/path",
              status: "active",
              updatedAt: 500,
            },
            {
              id: "thread-home-deploy",
              title: "Home AI Deploy",
              cwd: "/Users/example/path",
              status: "idle",
              updatedAt: 300,
            },
            {
              id: "thread-movie-deploy",
              title: "Movie Deploy Lane",
              cwd: "/Users/example/path",
              status: "idle",
              updatedAt: 200,
            },
            {
              id: "thread-codex-deploy",
              title: "Codex Mobile Deploy Lane",
              cwd: "/Users/example/path",
              status: "idle",
              updatedAt: 100,
            },
          ],
        }),
      };
    }
    if (String(url) === "http://codex.local/api/threads/thread-home-current/task-cards") {
      const body = JSON.parse(options.body || "{}");
      assert.deepEqual(body.targetThreadIds, ["thread-movie-deploy"]);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          direct: true,
          autoApprove: true,
          workspaceDelegationEnabled: true,
          cards: [{ id: "ttc_movie_lane" }],
        }),
      };
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
  };
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
    deployThreadTitles: ["Home AI Deploy", "Movie Deploy Lane", "Codex Mobile Deploy Lane"],
    deployLaneAssignments: { movie: "Movie Deploy Lane", "codex-mobile-web": "Codex Mobile Deploy Lane" },
  });

  const result = await service.sendTaskCard({
    title: "Deploy Movie",
    body: "deployment readback request",
    requestId: "deploy-movie-lane-pool",
    reasoningEffort: "xhigh",
    cardKind: "plugin_deployment",
    pluginId: "movie",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-movie-deploy");
  assert.deepEqual(result.cardIds, ["ttc_movie_lane"]);
  assert.equal(calls.filter((call) => call.url.includes("/api/threads?")).length, 2);
}

async function testConfiguredDeployLaneAssignmentFailsClosedWhenLaneTerminal() {
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    deployThreadTitles: ["Home AI Deploy", "Movie Deploy Lane"],
    deployLaneAssignments: { movie: "Movie Deploy Lane" },
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: "thread-home-deploy",
            title: "Home AI Deploy",
            cwd: "/Users/example/path",
            status: "idle",
            updatedAt: 300,
          },
          {
            id: "thread-movie-deploy",
            title: "Movie Deploy Lane",
            cwd: "/Users/example/path",
            status: "completed",
            updatedAt: 400,
          },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => service.findDeployThread({ pluginId: "movie" }),
    (err) => err.code === "deploy_lane_assignment_not_found" && err.status === 503,
  );
}

async function testDeploymentKindRejectsTerminalReceiptCard() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Return: Movie deployment docs cleaned",
      body: [
        "# Return: Movie Deployment Docs Cleaned",
        "",
        "Return policy: terminal receipt; do not send an acknowledgement return.",
        "",
        "Status: `completed`",
      ].join("\n"),
      requestId: "deploy-movie-receipt-shaped-card",
      reasoningEffort: "xhigh",
      cardKind: "plugin_deployment",
    }),
    (err) => err.code === "deployment_card_must_not_be_terminal_receipt" && err.status === 400,
  );
  assert.equal(calls.some((call) => String(call.url).endsWith("/task-cards")), false);
}

async function testCompletedDeployThreadFailsClosed() {
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
            title: "Home AI 06-28",
            cwd: "/Users/example/path",
            status: { type: "active" },
            updatedAt: 400,
          },
          {
            id: "thread-home-deploy",
            title: "Home AI Deploy",
            cwd: "/Users/example/path",
            status: { type: "completed" },
            updatedAt: 500,
          },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Deploy Movie",
      body: "deployment readback request",
      requestId: "deploy-movie-completed-thread",
      reasoningEffort: "xhigh",
      auditKind: "deployment",
    }),
    (err) => err.code === "deploy_thread_not_found" && err.status === 503,
  );
}

(async () => {
  await testDiscoversThreadsAndSendsSingleCentralAuditCard();
  await testMissingAuditThreadFailsClosed();
  await testCanSendToWorkspaceThreadByTitlePrefix();
  await testHomeAiTargetPrefixSkipsDeployAndIntakeThreads();
  await testExplicitMissingSourceTitleDoesNotFallbackToHomeAiThread();
  await testSourceTitlePrefixCanResolveDedicatedIntakeThread();
  await testSameSourceAndTargetFailsBeforePostingTaskCard();
  await testCanSendToExplicitTargetThreadIdWithoutDiscoveringTarget();
  await testDefaultSourceDiscoverySkipsReservedDeployThread();
  await testDeploymentKindTargetsDedicatedDeployThread();
  await testDeploymentKindCanUseConfiguredLanePoolAssignments();
  await testConfiguredDeployLaneAssignmentFailsClosedWhenLaneTerminal();
  await testDeploymentKindRejectsTerminalReceiptCard();
  await testCompletedDeployThreadFailsClosed();
  console.log("codex thread task-card service tests passed");
})();
