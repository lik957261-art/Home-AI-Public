"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLocalBridgeRuntimeService } = require("../adapters/local-bridge-runtime-service");

function makeProvider(calls, result = { ok: true, backend: "python" }) {
  return {
    python(scriptPath, envNames) {
      calls.push({ type: "python", scriptPath, envNames: [...envNames] });
      return { command: "python3", args: [scriptPath] };
    },
    runJsonCommand(commandSpec, payload, options) {
      calls.push({ type: "json", commandSpec, payload, label: options.label });
      return result;
    },
  };
}

function makeRuntime(overrides = {}) {
  const calls = [];
  const runtime = createLocalBridgeRuntimeService(Object.assign({
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostKeyPath: "",
    bridgeHostUrl: "",
    compactText: (value) => String(value || "").slice(0, 120),
    cronBridgeScript: "/tmp/cron.py",
    cronTimeoutMs: 200,
    directoryBridgeScript: "/tmp/directory.py",
    directoryTimeoutMs: 300,
    env: {},
    formatLocalDateTime: () => "2026-05-16 09:30",
    localAutomationStorePath: "automations.json",
    localTodoStorePath: "todos.json",
    mobileSqliteStore: () => null,
    nowIso: () => "2026-05-15T00:00:00.000Z",
    readJsonStore: () => ({}),
    spawn: () => {},
    todoBridgeScript: "/tmp/todo.py",
    todoTimeoutMs: 100,
    useKanbanTodoBackend: () => false,
    useLocalAutomationBackend: () => false,
    useLocalTodoBackend: () => false,
    useSqliteServiceStore: () => false,
    writeJsonStore: () => {},
  }, overrides));
  return { calls, runtime };
}

async function testBridgeHostUsesEnvKeyAndPreservesRouteShape() {
  const requests = [];
  const { runtime } = makeRuntime({
    bridgeHostUrl: "http://bridge.local/",
    env: {
      HERMES_MOBILE_BRIDGE_HOST_KEY: "env-secret",
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { ok: true, backend: "host" };
        },
      };
    },
    setTimeout(callback, ms) {
      return { callback, ms };
    },
    clearTimeout() {},
  });

  assert.deepEqual(await runtime.runBridgeHost("todo", { action: "list" }, 1234), { ok: true, backend: "host" });
  assert.equal(requests[0].url, "http://bridge.local/bridge/todo");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer env-secret");
  assert.equal(requests[0].options.body, JSON.stringify({ action: "list" }));
}

async function testBridgeHostReadsAndCachesKeyFile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-runtime-"));
  const keyPath = path.join(root, "bridge.secret");
  fs.writeFileSync(keyPath, "file-secret\n", "utf8");
  const seen = [];
  const { runtime } = makeRuntime({
    bridgeHostKeyPath: keyPath,
    bridgeHostUrl: "http://bridge.local",
    fetch: async (_url, options) => {
      seen.push(options.headers.Authorization);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  fs.writeFileSync(keyPath, "changed-secret\n", "utf8");
  await runtime.runBridgeHost("cron", {}, 1000);
  await runtime.runBridgeHost("cron", {}, 1000);
  assert.deepEqual(seen, ["Bearer changed-secret", "Bearer changed-secret"]);
}

async function testBridgeHostTimeoutMessage() {
  const abortError = new Error("aborted");
  abortError.name = "AbortError";
  const { runtime } = makeRuntime({
    bridgeHostUrl: "http://bridge.local",
    env: { HERMES_WEB_BRIDGE_HOST_KEY: "key" },
    fetch: async () => {
      throw abortError;
    },
  });
  await assert.rejects(
    () => runtime.runBridgeHost("directory", {}, 1000),
    /directory bridge host timed out/,
  );
}

async function testRuntimePreservesBridgeSelectionOrder() {
  const localTodoWrites = [];
  const localAutomationWrites = [];
  const kanbanCalls = [];
  const { runtime } = makeRuntime({
    kanbanTodoBridge: {
      run(payload) {
        kanbanCalls.push(payload);
        return { ok: true, backend: "kanban" };
      },
    },
    readJsonStore(filePath, fallback) {
      if (filePath === "todos.json") return { todos: [], pushMarks: {} };
      if (filePath === "automations.json") return { jobs: [], updatedAt: "" };
      return fallback;
    },
    useKanbanTodoBackend: () => true,
    useLocalAutomationBackend: () => true,
    useLocalTodoBackend: () => true,
    writeJsonStore(filePath, value) {
      if (filePath === "todos.json") localTodoWrites.push(value);
      if (filePath === "automations.json") localAutomationWrites.push(value);
    },
  });

  assert.deepEqual(await runtime.runTodoBridge({ action: "list" }), { ok: true, backend: "kanban" });
  assert.deepEqual(kanbanCalls, [{ action: "list" }]);
  const created = await runtime.runCronBridge({
    action: "create",
    owner_principal_id: "owner",
    text: "digest",
    job: { name: "Digest" },
  });
  assert.equal(created.ok, true);
  assert.equal(localAutomationWrites.length, 1);
}

async function testRuntimeRejectsUnsupportedAutomationBackendBeforeLocalFallback() {
  const writes = [];
  const { runtime } = makeRuntime({
    automationBackend: "native_cron",
    readJsonStore() {
      return { jobs: [], updatedAt: "" };
    },
    useLocalAutomationBackend: () => true,
    writeJsonStore(filePath, value) {
      writes.push({ filePath, value });
    },
  });

  const result = await runtime.runCronBridge({ action: "create", job: { name: "Bad" } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.source.name, "native_cron");
  assert.deepEqual(writes, []);
}

async function testDirectoryFallsBackToPythonBridge() {
  const { calls, runtime } = makeRuntime();
  assert.deepEqual(await runtime.runDirectoryBridge({ action: "tree" }), { ok: true, backend: "python" });
  assert.equal(calls[0].scriptPath, "/tmp/directory.py");
  assert.equal(calls[1].label, "Directory bridge");
}

async function run() {
  await testBridgeHostUsesEnvKeyAndPreservesRouteShape();
  await testBridgeHostReadsAndCachesKeyFile();
  await testBridgeHostTimeoutMessage();
  await testRuntimePreservesBridgeSelectionOrder();
  await testRuntimeRejectsUnsupportedAutomationBackendBeforeLocalFallback();
  await testDirectoryFallsBackToPythonBridge();
  console.log("local-bridge-runtime-service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
