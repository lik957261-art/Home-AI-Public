"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const TEST_OWNER_KEY = "test-owner-key";
const TEST_GATEWAY_KEY = "test-gateway-key";
const TEST_THREAD_ID = "thread_vite_live";
const VITE_PROXY_HEADER = "20260703-vite-dev-backend-proxy-v1";

function bounded(value) {
  return String(value || "").slice(-2400);
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = server.address().port;
  await closeServer(server);
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/status`, {
        headers: { "X-Hermes-Web-Key": TEST_OWNER_KEY },
      });
      if (response.ok) return response;
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("server did not become ready");
}

async function waitForCondition(description, predicate, options = {}) {
  const deadline = Date.now() + (Number(options.timeoutMs) || 10000);
  let lastResult = null;
  while (Date.now() < deadline) {
    lastResult = await predicate();
    if (lastResult) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, Number(options.intervalMs) || 100));
  }
  throw new Error(`${description} did not settle`);
}

function writeFixtureState(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const statePath = path.join(dataDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: 1,
    artifacts: [],
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    automationPushMarks: {},
    threads: [{
      id: TEST_THREAD_ID,
      title: "Vite live backend parity",
      workspaceId: "owner",
      projectId: "vite-dev",
      singleWindow: true,
      hermesSessionId: "vite_live_backend",
      status: "idle",
      activeRunId: "",
      activeRunIds: [],
      taskGroupMeta: {},
      createdAt: "2026-07-03T08:00:00.000Z",
      updatedAt: "2026-07-03T08:00:01.000Z",
      chatGroup: {
        enabled: true,
        memberWorkspaceIds: ["owner"],
        createdAt: "2026-07-03T08:00:00.000Z",
        updatedAt: "2026-07-03T08:00:00.000Z",
      },
      messages: [],
      events: [],
    }],
  }, null, 2));
  return statePath;
}

function writeGatewayManifest(dataDir, gatewayBaseUrl) {
  const manifestPath = path.join(dataDir, "gateway-pool-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    enabled: true,
    version: "20260703-vite-dev-fake-gateway-v1",
    workers: [{
      id: "vite-dev-fake-lowgw1",
      name: "vite-dev-fake-lowgw1",
      profile: "vite-dev-fake-lowgw1",
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      toolsets: [],
      apiBase: gatewayBaseUrl,
      apiKey: TEST_GATEWAY_KEY,
    }],
  }, null, 2));
  return manifestPath;
}

function readState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

async function startFakeGatewayServer() {
  const requests = {
    health: 0,
    detailed: 0,
    capabilities: 0,
    responses: [],
    stops: [],
  };
  const state = {
    activeResponse: null,
    streamClosed: false,
  };

  function writeJson(res, status, payload) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return { text, json: JSON.parse(text || "{}") };
    } catch (_error) {
      return { text, json: {} };
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      requests.health += 1;
      writeJson(res, 200, { status: "ok" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/health/detailed") {
      requests.detailed += 1;
      writeJson(res, 200, { ok: true, worker: "vite-dev-fake-lowgw1" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/capabilities") {
      requests.capabilities += 1;
      writeJson(res, 200, { ok: true, toolsets: [] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/responses") {
      const body = await readBody(req);
      requests.responses.push({
        authorization: req.headers.authorization || "",
        body: body.json,
      });
      const responseId = `resp_vite_fake_${requests.responses.length}`;
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`event: response.created\ndata: ${JSON.stringify({
        event: "response.created",
        response: {
          id: responseId,
          model: "vite-dev-fake-model",
          provider: "openai-codex",
          reasoning_effort: "medium",
        },
      })}\n\n`);
      res.write(`event: message.delta\ndata: ${JSON.stringify({
        event: "message.delta",
        response_id: responseId,
        delta: "Vite fake Gateway partial output",
      })}\n\n`);
      state.activeResponse = res;
      const markClosed = () => {
        state.streamClosed = true;
        if (state.activeResponse === res) state.activeResponse = null;
      };
      req.on("close", markClosed);
      res.on("close", markClosed);
      return;
    }
    const stopMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/stop$/);
    if (req.method === "POST" && stopMatch) {
      requests.stops.push({ runId: decodeURIComponent(stopMatch[1]), authorization: req.headers.authorization || "" });
      if (state.activeResponse && !state.activeResponse.destroyed) {
        state.activeResponse.end();
      }
      writeJson(res, 200, { ok: true, stopped: true });
      return;
    }
    writeJson(res, 404, { error: "not_found" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    state,
    async close() {
      if (state.activeResponse && !state.activeResponse.destroyed) state.activeResponse.end();
      await closeServer(server);
    },
  };
}

async function startRealHomeAiServer({ dataDir, port, gatewayBaseUrl = "", gatewayManifestPath = "" }) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = Object.assign({}, process.env, {
    HERMES_WEB_HOST: "127.0.0.1",
    HERMES_WEB_PORT: String(port),
    HERMES_WEB_DATA_DIR: dataDir,
    HERMES_WEB_KEY: TEST_OWNER_KEY,
    HERMES_WEB_PUSH_ENABLED: "0",
    HERMES_WEB_GATEWAY_POOL_ENABLED: gatewayManifestPath ? "1" : "0",
    HERMES_WEB_GATEWAY_POOL_MANIFEST: gatewayManifestPath,
    HERMES_WEB_GATEWAY_POOL_START_MODE: "eager",
    HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS: "1000",
    HERMES_WEB_HERMES_API_BASE: gatewayBaseUrl || "http://127.0.0.1:1",
    HERMES_WEB_HERMES_API_KEY: TEST_GATEWAY_KEY,
    HERMES_WEB_HERMES_API_TIMEOUT_MS: "5000",
    HERMES_WEB_RUN_START_TIMEOUT_MS: "5000",
    HERMES_WEB_RUN_MODEL_FIRST_BYTE_WARNING_MS: "10000",
    HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED: "0",
  });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  await waitForServer(baseUrl).catch(async (error) => {
    await stopChild(child);
    throw new Error(`${error.message}\nstdout=${bounded(stdout)}\nstderr=${bounded(stderr)}`);
  });
  return {
    baseUrl,
    child,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

async function startViteServer(realBackendBaseUrl) {
  const previousEnv = {
    HOMEAI_VITE_DEV_BACKEND_PROXY: process.env.HOMEAI_VITE_DEV_BACKEND_PROXY,
    HOMEAI_VITE_DEV_BACKEND_BASE: process.env.HOMEAI_VITE_DEV_BACKEND_BASE,
  };
  process.env.HOMEAI_VITE_DEV_BACKEND_PROXY = "1";
  process.env.HOMEAI_VITE_DEV_BACKEND_BASE = realBackendBaseUrl;
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(repoRoot, "vite.config.js"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "silent",
  });
  await vite.listen();
  const address = vite.httpServer.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await vite.close();
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

async function readFirstEventStreamChunk(response) {
  const reader = response.body.getReader();
  try {
    const { value } = await reader.read();
    return Buffer.from(value || new Uint8Array()).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text || "{}") };
  } catch (_error) {
    return { text, json: {} };
  }
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-vite-real-backend-"));
  const dataDir = path.join(tempDir, "data");
  const statePath = writeFixtureState(dataDir);
  const fakeGateway = await startFakeGatewayServer();
  const gatewayManifestPath = writeGatewayManifest(dataDir, fakeGateway.baseUrl);
  const serverPort = await freePort();
  let realServer = null;
  let viteServer = null;

  try {
    realServer = await startRealHomeAiServer({
      dataDir,
      port: serverPort,
      gatewayBaseUrl: fakeGateway.baseUrl,
      gatewayManifestPath,
    });
    viteServer = await startViteServer(realServer.baseUrl);

    const eventResponse = await fetch(`${viteServer.baseUrl}/api/events?key=${encodeURIComponent(TEST_OWNER_KEY)}&clientVersion=vite-dev-real-backend`);
    assert.equal(eventResponse.status, 200);
    assert.equal(eventResponse.headers.get("x-homeai-vite-dev-backend-proxy"), VITE_PROXY_HEADER);
    assert.equal(eventResponse.headers.get("x-homeai-vite-dev-mock"), null);
    const eventChunk = await readFirstEventStreamChunk(eventResponse);
    assert.match(eventChunk, /"type":"snapshot"/);
    assert.match(eventChunk, new RegExp(TEST_THREAD_ID));

    const sendResponse = await fetch(`${viteServer.baseUrl}/api/threads/${TEST_THREAD_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Web-Key": TEST_OWNER_KEY,
        "X-Hermes-Web-Client-Version": "vite-dev-real-backend",
      },
      body: JSON.stringify({
        text: "Vite dev real backend parity plain message",
        workspaceId: "owner",
        singleWindowMode: "chat",
        taskGroupId: "group-chat",
        messageKind: "plain",
        reasoning_effort: "medium",
      }),
    });
    const { text: sendText, json: sendPayload } = await readJsonResponse(sendResponse);
    assert.equal(sendResponse.status, 201, sendText);
    assert.equal(sendResponse.headers.get("x-homeai-vite-dev-backend-proxy"), VITE_PROXY_HEADER);
    assert.equal(sendResponse.headers.get("x-homeai-vite-dev-mock"), null);
    assert.equal(sendPayload.ok, true);
    const responseMessages = Array.isArray(sendPayload.thread?.messages) ? sendPayload.thread.messages : [];
    const responseMessage = responseMessages[responseMessages.length - 1] || null;
    assert.ok(responseMessage, sendText);
    assert.equal(responseMessage.role, "user");
    assert.equal(responseMessage.messageKind, "plain");
    assert.equal(responseMessage.taskGroupId, "group-chat");

    const persisted = readState(statePath);
    const thread = persisted.threads.find((item) => item.id === TEST_THREAD_ID);
    assert.ok(thread);
    assert.equal(thread.activeRunId || "", "");
    assert.deepEqual(thread.activeRunIds, []);
    assert.equal(thread.status, "idle");
    assert.equal(thread.messages.length, 1);
    assert.equal(thread.messages[0].role, "user");
    assert.equal(thread.messages[0].messageKind, "plain");
    assert.equal(thread.messages[0].taskGroupId, "group-chat");
    assert.match(thread.messages[0].content, /Vite dev real backend parity plain message/);
    assert.equal(fakeGateway.requests.responses.length, 0);

    const aiResponse = await fetch(`${viteServer.baseUrl}/api/threads/${TEST_THREAD_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Web-Key": TEST_OWNER_KEY,
        "X-Hermes-Web-Client-Version": "vite-dev-real-backend",
      },
      body: JSON.stringify({
        text: "Vite dev real backend parity AI message",
        workspaceId: "owner",
        singleWindowMode: "chat",
        taskGroupId: "chat",
        messageKind: "ai",
        reasoning_effort: "medium",
      }),
    });
    const { text: aiText, json: aiPayload } = await readJsonResponse(aiResponse);
    assert.equal(aiResponse.status, 202, aiText);
    assert.equal(aiResponse.headers.get("x-homeai-vite-dev-backend-proxy"), VITE_PROXY_HEADER);
    assert.equal(aiResponse.headers.get("x-homeai-vite-dev-mock"), null);
    assert.equal(aiPayload.run?.status, "started");
    assert.equal(aiPayload.thread?.id, TEST_THREAD_ID);

    await waitForCondition("fake Gateway response request", () => fakeGateway.requests.responses.length >= 1);
    assert.equal(fakeGateway.requests.responses[0].authorization, `Bearer ${TEST_GATEWAY_KEY}`);
    assert.equal(fakeGateway.requests.responses[0].body?.reasoning_effort, "medium");

    const runningAssistant = await waitForCondition("AI assistant running state", () => {
      const nextState = readState(statePath);
      const nextThread = nextState.threads.find((item) => item.id === TEST_THREAD_ID);
      const assistant = (nextThread?.messages || []).find((message) => (
        message.role === "assistant" && message.taskGroupId === "chat"
      ));
      return assistant?.status === "running" && /Vite fake Gateway partial output/.test(assistant.content || "")
        ? { thread: nextThread, assistant }
        : null;
    });
    assert.ok(runningAssistant.assistant.runId);
    assert.deepEqual(runningAssistant.thread.activeRunIds, [runningAssistant.assistant.runId]);

    const interruptResponse = await fetch(`${viteServer.baseUrl}/api/threads/${TEST_THREAD_ID}/interrupt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Web-Key": TEST_OWNER_KEY,
        "X-Hermes-Web-Client-Version": "vite-dev-real-backend",
      },
      body: JSON.stringify({ taskGroupId: "chat" }),
    });
    const { text: interruptText, json: interruptPayload } = await readJsonResponse(interruptResponse);
    assert.equal(interruptResponse.status, 200, interruptText);
    assert.equal(interruptResponse.headers.get("x-homeai-vite-dev-backend-proxy"), VITE_PROXY_HEADER);
    assert.equal(interruptResponse.headers.get("x-homeai-vite-dev-mock"), null);
    assert.equal(interruptPayload.ok, true);
    assert.deepEqual(interruptPayload.runIds, [runningAssistant.assistant.runId]);

    await waitForCondition("fake Gateway stream close after interrupt", () => fakeGateway.state.streamClosed);
    const cancelledAssistant = await waitForCondition("AI assistant cancelled state", () => {
      const nextState = readState(statePath);
      const nextThread = nextState.threads.find((item) => item.id === TEST_THREAD_ID);
      const assistant = (nextThread?.messages || []).find((message) => message.id === runningAssistant.assistant.id);
      return assistant?.status === "cancelled" && nextThread?.status === "idle"
        ? { thread: nextThread, assistant }
        : null;
    });
    assert.equal(cancelledAssistant.assistant.content, "Vite fake Gateway partial output");
    assert.deepEqual(cancelledAssistant.thread.activeRunIds, []);
  } finally {
    if (viteServer) await viteServer.close();
    if (realServer) await stopChild(realServer.child);
    await fakeGateway.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log("vite dev real backend parity smoke passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
