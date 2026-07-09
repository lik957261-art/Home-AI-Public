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
    if (String(url) === "http://codex.local/api/at-loop/thread-lifecycle") {
      const body = JSON.parse(options.body || "{}");
      assert.equal(body.action, "resolve");
      assert.equal(body.role, "home_ai_worker");
      assert.equal(body.workspaceCwd, "/Users/example/path");
      assert.equal(body.threadId, "");
      assert.equal(body.targetThreadId, "");
      assert.equal(options.headers.Authorization, "Bearer secret");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          action: "resolve",
          thread: {
            id: "thread-home-worker-a",
            title: "Home AI Worker Lane A",
            cwd: "/Users/example/path",
            role: "home_ai_worker",
            purpose: "worker_lane",
            status: "completed",
            deliverable: true,
          },
        }),
      };
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
  };
  return { calls, fetchImpl };
}

async function testThreadLifecyclePostsToCodexMobileRuntime() {
  const { calls, fetchImpl } = createFetchStub();
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    fetch: fetchImpl,
    sourceWorkspaceCwd: "/Users/example/path",
  });

  const result = await service.threadLifecycle({
    action: "resolve",
    role: "home_ai_worker",
    workspaceCwd: "/Users/example/path",
    body: "must not be forwarded",
    prompt: "must not be forwarded",
  });

  assert.equal(result.ok, true);
  assert.equal(result.thread.id, "thread-home-worker-a");
  assert.equal(result.thread.deliverable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://codex.local/api/at-loop/thread-lifecycle");
  assert.doesNotMatch(calls[0].options.body, /must not be forwarded/);
}

async function testThreadLifecycleForwardsWorkerMetadata() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      assert.equal(String(url), "http://codex.local/api/at-loop/thread-lifecycle");
      const body = JSON.parse(options.body || "{}");
      assert.equal(body.action, "ensure");
      assert.equal(body.role, "plugin_worker");
      assert.equal(body.pluginId, "music");
      assert.equal(body.sourceThreadId, "thread-music-main");
      assert.equal(body.purpose, "worker_lane");
      assert.equal(body.workerPurpose, "worker_lane");
      assert.equal(body.workerLaneId, "worker-music-a");
      assert.equal(body.taskCardId, "ttc_music_1");
      assert.equal(body.status, "busy");
      assert.equal(body.summary, "bounded dispatch");
      assert.equal(body.requestId, "req-music-1");
      assert.equal(body.idempotencyKey, "idem-music-1");
      assert.equal(body.workspaceCwd, "/Users/example/path");
      assert.doesNotMatch(options.body, /raw prompt|secret body/i);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          action: "ensure",
          thread: {
            id: "thread-music-worker-a",
            title: "Music Worker Lane A",
            cwd: "/Users/example/path",
            role: "plugin_worker",
            purpose: "worker_lane",
            status: "available",
            deliverable: true,
          },
        }),
      };
    },
  });

  const result = await service.threadLifecycle({
    action: "ensure",
    role: "plugin_worker",
    pluginId: "music",
    sourceThreadId: "thread-music-main",
    purpose: "worker_lane",
    workerPurpose: "worker_lane",
    workerLaneId: "worker-music-a",
    taskCardId: "ttc_music_1",
    status: "busy",
    summary: "bounded dispatch",
    requestId: "req-music-1",
    idempotencyKey: "idem-music-1",
    workspaceCwd: "/Users/example/path",
    body: "secret body",
    prompt: "raw prompt",
  });

  assert.equal(result.ok, true);
  assert.equal(result.thread.id, "thread-music-worker-a");
  assert.equal(calls.length, 1);
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

async function testReplyToThreadTitlePrefixRoutesReturnsToCoordinator() {
  const postedBodies = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async (url, options = {}) => {
      if (String(url).startsWith("http://codex.local/api/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [
              {
                id: "thread-home-current",
                title: "Home AI 07-05",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
            ],
          }),
        };
      }
      if (String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards") {
        const body = JSON.parse(options.body || "{}");
        postedBodies.push(body);
        assert.deepEqual(body.targetThreadIds, ["thread-home-current"]);
        assert.equal(body.replyToThreadId, "thread-home-current");
        assert.equal(body.replyToThreadTitle, "Home AI 07-05");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_reply_prefix_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Home AI Host Issue",
    body: "diagnostic repair request",
    requestId: "diag-home-ai-reply-prefix",
    reasoningEffort: "xhigh",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
    replyToThreadTitlePrefix: "Home AI",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-home-current");
  assert.deepEqual(result.cardIds, ["ttc_reply_prefix_1"]);
  assert.equal(postedBodies.length, 1);
}

async function testExplicitReplyToThreadIdWinsOverReplyTitlePrefix() {
  const postedBodies = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async (url, options = {}) => {
      if (String(url).startsWith("http://codex.local/api/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [
              {
                id: "thread-home-current",
                title: "Home AI 07-05",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
            ],
          }),
        };
      }
      if (String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards") {
        const body = JSON.parse(options.body || "{}");
        postedBodies.push(body);
        assert.deepEqual(body.targetThreadIds, ["thread-home-current"]);
        assert.equal(body.replyToThreadId, "thread-explicit-coordinator");
        assert.equal(body.replyToThreadTitle, "Home AI Explicit");
        assert.equal(body.replyToWorkspaceId, "/Users/example/path");
        assert.equal(body.replyToCardId, "ttc_original");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_reply_explicit_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Home AI Host Issue",
    body: "diagnostic repair request",
    requestId: "diag-home-ai-reply-explicit",
    reasoningEffort: "xhigh",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
    replyToThreadId: "thread-explicit-coordinator",
    replyToThreadTitle: "Home AI Explicit",
    replyToThreadTitlePrefix: "Home AI",
    replyToWorkspaceId: "/Users/example/path",
    replyToCardId: "ttc_original",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.cardIds, ["ttc_reply_explicit_1"]);
  assert.equal(postedBodies.length, 1);
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

async function testHomeAiPrefixTargetStillUsesMainThreadWhenWorkerLanesExist() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A", "Home AI Worker Lane B"],
    fetch: async (url, options = {}) => {
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
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
              {
                id: "thread-worker-a",
                title: "Home AI Worker Lane A",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 300,
              },
              {
                id: "thread-worker-b",
                title: "Home AI Worker Lane B",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 200,
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
            cards: [{ id: "ttc_main_lane_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway",
    body: "diagnostic repair request",
    requestId: "diag-gateway-worker-lane",
    reasoningEffort: "xhigh",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-home-current");
  assert.deepEqual(result.cardIds, ["ttc_main_lane_1"]);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-worker-a/task-cards")), false);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-worker-b/task-cards")), false);
}

async function testHomeAiWorkerKindTargetsImplementationLane() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A", "Home AI Worker Lane B"],
    fetch: async (url, options = {}) => {
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
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
              {
                id: "thread-worker-a",
                title: "Home AI Worker Lane A",
                cwd: "/Users/example/path",
                status: { type: "active" },
                updatedAt: 300,
              },
              {
                id: "thread-worker-b",
                title: "Home AI Worker Lane B",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 200,
              },
            ],
          }),
        };
      }
      if (String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards") {
        const body = JSON.parse(options.body || "{}");
        assert.deepEqual(body.targetThreadIds, ["thread-worker-b"]);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_worker_lane_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway Worker",
    body: "diagnostic repair request",
    requestId: "diag-gateway-worker-lane",
    reasoningEffort: "xhigh",
    cardKind: "home_ai_worker",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetThreadTitlePrefix: "Home AI",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceThreadId, "thread-home-task-intake");
  assert.equal(result.targetThreadId, "thread-worker-b");
  assert.deepEqual(result.cardIds, ["ttc_worker_lane_1"]);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-home-current/task-cards")), false);
}

async function testHomeAiWorkerKindSkipsArchivedAndUndeliverableLanes() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A", "Home AI Worker Lane B", "Home AI Worker Lane C"],
    fetch: async (url, options = {}) => {
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
                status: { type: "active" },
                updatedAt: 500,
              },
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
              {
                id: "thread-worker-a",
                title: "Home AI Worker Lane A",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                archived: true,
                updatedAt: 300,
              },
              {
                id: "thread-worker-b",
                title: "Home AI Worker Lane B",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                canReceiveTaskCards: false,
                updatedAt: 200,
              },
              {
                id: "thread-worker-c",
                title: "Home AI Worker Lane C",
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
        assert.deepEqual(body.targetThreadIds, ["thread-worker-c"]);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_worker_lane_filtered_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway Worker",
    body: "diagnostic repair request",
    requestId: "diag-gateway-worker-lane-filtered",
    reasoningEffort: "xhigh",
    cardKind: "home_ai_worker",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-worker-c");
  assert.deepEqual(result.cardIds, ["ttc_worker_lane_filtered_1"]);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-worker-a/task-cards")), false);
  assert.equal(calls.some((call) => String(call.url).includes("/api/threads/thread-worker-b/task-cards")), false);
}

async function testCompletedHomeAiWorkerLaneCanReceiveImplementationCard() {
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A"],
    fetch: async (url, options = {}) => {
      if (String(url).startsWith("http://codex.local/api/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: { type: "idle" },
                updatedAt: 450,
              },
              {
                id: "thread-worker-a",
                title: "Home AI Worker Lane A",
                cwd: "/Users/example/path",
                status: { type: "completed" },
                updatedAt: 300,
              },
            ],
          }),
        };
      }
      if (String(url) === "http://codex.local/api/threads/thread-home-task-intake/task-cards") {
        const body = JSON.parse(options.body || "{}");
        assert.deepEqual(body.targetThreadIds, ["thread-worker-a"]);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: "ttc_worker_lane_completed_1" }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  const result = await service.sendTaskCard({
    title: "Repair Gateway Worker",
    body: "diagnostic repair request",
    requestId: "diag-gateway-worker-lane-completed",
    reasoningEffort: "xhigh",
    cardKind: "home_ai_worker",
    sourceThreadTitle: "Home AI Task Intake",
    sourceThreadTitlePrefix: "Home AI Task Intake",
    targetWorkspaceCwd: "/Users/example/path",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-worker-a");
  assert.deepEqual(result.cardIds, ["ttc_worker_lane_completed_1"]);
}

async function testExplicitImplementationLaneRequiredFailsClosedWhenMissing() {
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationLaneRequired: true,
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: "thread-home-current",
            title: "Home AI 06-30",
            cwd: "/Users/example/path",
            status: { type: "active" },
            updatedAt: 500,
          },
          {
            id: "thread-home-task-intake",
            title: "Home AI Task Intake",
            cwd: "/Users/example/path",
            status: { type: "idle" },
            updatedAt: 450,
          },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => service.findImplementationThread({ cwd: "/Users/example/path" }),
    (err) => err.code === "home_ai_implementation_lane_not_found" && err.status === 503,
  );
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

async function testImplementationKindDoesNotFallbackToCodexPublicPrByWorkspace() {
  const calls = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A", "Home AI Worker Lane B"],
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith("http://codex.local/api/threads?")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            data: [
              {
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: "active",
                updatedAt: 500,
              },
              {
                id: "thread-codex-public-pr",
                title: "Codex Mobile Public PR",
                cwd: "/Users/example/path",
                status: "active",
                updatedAt: 600,
              },
              {
                id: "thread-chatgpt-pro",
                title: "ChatGPT Pro",
                cwd: "/Users/example/path",
                status: "idle",
                updatedAt: 400,
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Implement AT Loop Runtime",
      body: "diagnostic repair request",
      requestId: "loop-runtime-codex-mobile",
      reasoningEffort: "xhigh",
      cardKind: "implementation",
      sourceThreadTitle: "Home AI Task Intake",
      targetWorkspaceCwd: "/Users/example/path",
    }),
    (err) => err.code === "home_ai_implementation_lane_not_found" && err.status === 503,
  );
  assert.equal(calls.some((call) => String(call.url).endsWith("/task-cards")), false);
}

async function testExplicitPublicPrTargetRejectsNonPrTaskCardKind() {
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
                id: "thread-home-task-intake",
                title: "Home AI Task Intake",
                cwd: "/Users/example/path",
                status: "active",
                updatedAt: 500,
              },
            ],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  await assert.rejects(
    () => service.sendTaskCard({
      title: "Implement AT Loop Runtime",
      body: "diagnostic repair request",
      requestId: "loop-runtime-misroute-explicit",
      reasoningEffort: "xhigh",
      cardKind: "implementation",
      sourceThreadTitle: "Home AI Task Intake",
      targetThreadId: "thread-codex-public-pr",
      targetThreadTitle: "Codex Mobile Public PR",
      targetWorkspaceCwd: "/Users/example/path",
    }),
    (err) => err.code === "target_thread_role_mismatch" && err.status === 409 && err.safe.threadPurpose === "public_pr",
  );
  assert.equal(calls.some((call) => String(call.url).endsWith("/task-cards")), false);
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

async function testDefaultSourceDiscoverySkipsImplementationWorkerLanes() {
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    implementationThreadTitles: ["Home AI Worker Lane A"],
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [
          {
            id: "thread-worker-a",
            title: "Home AI Worker Lane A",
            cwd: "/Users/example/path",
            status: "active",
            updatedAt: 500,
          },
          {
            id: "thread-home-current",
            title: "Home AI 06-30",
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

async function testTaskCardReasoningDefaultsToAtLeastMedium() {
  const sentEfforts = [];
  const service = createCodexThreadTaskCardService({
    baseUrl: "http://codex.local",
    key: "secret",
    sourceWorkspaceCwd: "/Users/example/path",
    fetch: async (url, options = {}) => {
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
                id: "thread-plugin-audit",
                title: "Plugin Workspace Audit",
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
        sentEfforts.push(body.reasoningEffort);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            direct: true,
            autoApprove: true,
            workspaceDelegationEnabled: true,
            cards: [{ id: `ttc_reasoning_${sentEfforts.length}` }],
          }),
        };
      }
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: "not_found" }) };
    },
  });

  await service.sendTaskCard({
    title: "Audit Without Effort",
    body: "central audit request",
    requestId: "audit-without-effort",
  });
  await service.sendTaskCard({
    title: "Audit Low Effort",
    body: "central audit request",
    requestId: "audit-low-effort",
    reasoningEffort: "low",
  });
  await service.sendTaskCard({
    title: "Audit High Effort",
    body: "central audit request",
    requestId: "audit-high-effort",
    reasoningEffort: "high",
  });

  assert.deepEqual(sentEfforts, ["medium", "medium", "high"]);
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

async function testDefaultDeployLaneAssignmentsRouteCodexAndMoviePlugins() {
  const sentTargetIds = [];
  const fetchImpl = async (url, options = {}) => {
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
              updatedAt: 400,
            },
            {
              id: "thread-codex-deploy",
              title: "Codex Mobile Deploy Lane",
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
          ],
        }),
      };
    }
    if (String(url) === "http://codex.local/api/threads/thread-home-current/task-cards") {
      const body = JSON.parse(options.body || "{}");
      sentTargetIds.push(body.targetThreadIds[0]);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          direct: true,
          autoApprove: true,
          workspaceDelegationEnabled: true,
          cards: [{ id: `ttc_deploy_${sentTargetIds.length}` }],
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
  });

  const codex = await service.sendTaskCard({
    title: "Deploy Codex Mobile",
    body: "deployment readback request",
    requestId: "deploy-codex-default-lane",
    cardKind: "plugin_deployment",
    pluginId: "codex-mobile-web",
  });
  const movie = await service.sendTaskCard({
    title: "Deploy Movie",
    body: "deployment readback request",
    requestId: "deploy-movie-default-lane",
    cardKind: "plugin_deployment",
    pluginId: "movie",
  });

  assert.equal(codex.targetThreadId, "thread-codex-deploy");
  assert.equal(movie.targetThreadId, "thread-movie-deploy");
  assert.deepEqual(sentTargetIds, ["thread-codex-deploy", "thread-movie-deploy"]);
}

async function testConfiguredDeployLaneAssignmentFallsBackToDeployPoolWhenLaneTerminal() {
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
            status: "archived",
            archived: true,
            updatedAt: 400,
          },
        ],
      }),
    }),
  });

  const result = await service.findDeployThread({ pluginId: "movie" });
  assert.equal(result.id, "thread-home-deploy");
  assert.equal(result.title, "Home AI Deploy");
}

async function testDeploymentKindInfersCodexMobileDeployLaneFromWorkspacePath() {
  const sentTargetIds = [];
  const fetchImpl = async (url, options = {}) => {
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
              updatedAt: 400,
            },
            {
              id: "thread-codex-deploy",
              title: "Codex Mobile Deploy Lane",
              cwd: "/Users/example/path",
              status: "idle",
              updatedAt: 300,
            },
          ],
        }),
      };
    }
    if (String(url) === "http://codex.local/api/threads/thread-home-current/task-cards") {
      const body = JSON.parse(options.body || "{}");
      sentTargetIds.push(body.targetThreadIds[0]);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          direct: true,
          autoApprove: true,
          workspaceDelegationEnabled: true,
          cards: [{ id: "ttc_codex_inferred_deploy" }],
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
  });

  const result = await service.sendTaskCard({
    title: "Deploy prepared plugin",
    body: "Routine production readback for /Users/example/path",
    requestId: "deploy-codex-inferred-lane",
    cardKind: "plugin_deployment",
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetThreadId, "thread-codex-deploy");
  assert.deepEqual(sentTargetIds, ["thread-codex-deploy"]);
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

async function testArchivedDeployThreadFailsClosed() {
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
            status: { type: "archived" },
            archived: true,
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
      requestId: "deploy-movie-archived-thread",
      reasoningEffort: "xhigh",
      auditKind: "deployment",
    }),
    (err) => err.code === "deploy_thread_not_found" && err.status === 503,
  );
}

(async () => {
  await testThreadLifecyclePostsToCodexMobileRuntime();
  await testThreadLifecycleForwardsWorkerMetadata();
  await testDiscoversThreadsAndSendsSingleCentralAuditCard();
  await testMissingAuditThreadFailsClosed();
  await testCanSendToWorkspaceThreadByTitlePrefix();
  await testReplyToThreadTitlePrefixRoutesReturnsToCoordinator();
  await testExplicitReplyToThreadIdWinsOverReplyTitlePrefix();
  await testHomeAiTargetPrefixSkipsDeployAndIntakeThreads();
  await testHomeAiPrefixTargetStillUsesMainThreadWhenWorkerLanesExist();
  await testHomeAiWorkerKindTargetsImplementationLane();
  await testHomeAiWorkerKindSkipsArchivedAndUndeliverableLanes();
  await testCompletedHomeAiWorkerLaneCanReceiveImplementationCard();
  await testExplicitImplementationLaneRequiredFailsClosedWhenMissing();
  await testExplicitMissingSourceTitleDoesNotFallbackToHomeAiThread();
  await testSourceTitlePrefixCanResolveDedicatedIntakeThread();
  await testSameSourceAndTargetFailsBeforePostingTaskCard();
  await testCanSendToExplicitTargetThreadIdWithoutDiscoveringTarget();
  await testImplementationKindDoesNotFallbackToCodexPublicPrByWorkspace();
  await testExplicitPublicPrTargetRejectsNonPrTaskCardKind();
  await testDefaultSourceDiscoverySkipsReservedDeployThread();
  await testDefaultSourceDiscoverySkipsImplementationWorkerLanes();
  await testTaskCardReasoningDefaultsToAtLeastMedium();
  await testDeploymentKindTargetsDedicatedDeployThread();
  await testDeploymentKindCanUseConfiguredLanePoolAssignments();
  await testDefaultDeployLaneAssignmentsRouteCodexAndMoviePlugins();
  await testConfiguredDeployLaneAssignmentFallsBackToDeployPoolWhenLaneTerminal();
  await testDeploymentKindInfersCodexMobileDeployLaneFromWorkspacePath();
  await testDeploymentKindRejectsTerminalReceiptCard();
  await testArchivedDeployThreadFailsClosed();
  console.log("codex thread task-card service tests passed");
})();
