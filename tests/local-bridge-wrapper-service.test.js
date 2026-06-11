"use strict";

const assert = require("node:assert/strict");
const {
  CRON_BRIDGE_ENV_NAMES,
  DIRECTORY_BRIDGE_ENV_NAMES,
  TODO_BRIDGE_ENV_NAMES,
  createLocalBridgeWrapperService,
} = require("../adapters/local-bridge-wrapper-service");

function makeProvider(calls, result = { ok: true, backend: "python" }) {
  return {
    python(scriptPath, envNames) {
      calls.push({ type: "python", scriptPath, envNames: [...envNames] });
      return { command: "python3", args: [scriptPath] };
    },
    runJsonCommand(commandSpec, payload, options) {
      calls.push({ type: "json", commandSpec, payload, options });
      return result;
    },
  };
}

function makeService(overrides = {}) {
  const calls = [];
  const compactText = (value) => String(value || "").slice(0, 10);
  const spawn = () => {};
  const service = createLocalBridgeWrapperService(Object.assign({
    bridgeCommandProvider: makeProvider(calls),
    compactText,
    spawn,
    todoBridgeScript: "/opt/todo_bridge.py",
    cronBridgeScript: "/opt/cron_bridge.py",
    directoryBridgeScript: "/opt/directory_bridge.py",
    todoTimeoutMs: 111,
    cronTimeoutMs: 222,
    directoryTimeoutMs: 333,
    todoStdoutLimitBytes: 44,
    cronStdoutLimitBytes: 55,
    directoryStdoutLimitBytes: 66,
  }, overrides));
  return { calls, compactText, service, spawn };
}

async function testTodoPrefersKanbanBeforeLocalHostAndPython() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostEnabled: true,
    kanbanTodoBridge: {
      run(payload) {
        calls.push({ type: "kanban", payload });
        return { ok: true, backend: "kanban" };
      },
    },
    runBridgeHost() {
      calls.push({ type: "host" });
      return { ok: true, backend: "host" };
    },
    runLocalTodoBridge() {
      calls.push({ type: "local" });
      return { ok: true, backend: "local" };
    },
    useKanbanTodoBackend: () => true,
    useLocalTodoBackend: () => true,
  });

  assert.deepEqual(await service.runTodoBridge({ action: "list" }), { ok: true, backend: "kanban" });
  assert.deepEqual(calls, [{ type: "kanban", payload: { action: "list" } }]);
}

async function testTodoUsesLocalBeforeHostAndPython() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostEnabled: true,
    runBridgeHost() {
      calls.push({ type: "host" });
      return { ok: true, backend: "host" };
    },
    runLocalTodoBridge(payload) {
      calls.push({ type: "local", payload });
      return { ok: true, backend: "local" };
    },
    useKanbanTodoBackend: () => false,
    useLocalTodoBackend: () => true,
  });

  assert.deepEqual(await service.runTodoBridge({ action: "add" }), { ok: true, backend: "local" });
  assert.deepEqual(calls, [{ type: "local", payload: { action: "add" } }]);
}

async function testCronUsesLocalAutomationBeforeHostAndPython() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostEnabled: true,
    runBridgeHost() {
      calls.push({ type: "host" });
      return { ok: true, backend: "host" };
    },
    runLocalCronBridge(payload) {
      calls.push({ type: "local-cron", payload });
      return { ok: true, backend: "local-cron" };
    },
    useLocalAutomationBackend: () => true,
  });

  assert.deepEqual(await service.runCronBridge({ action: "list" }), { ok: true, backend: "local-cron" });
  assert.deepEqual(calls, [{ type: "local-cron", payload: { action: "list" } }]);
}

async function testCronRejectsUnsupportedAutomationBackend() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    automationBackend: "native_cron",
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostEnabled: true,
    runBridgeHost() {
      calls.push({ type: "host" });
      return { ok: true, backend: "host" };
    },
    runLocalCronBridge(payload) {
      calls.push({ type: "local-cron", payload });
      return { ok: true, backend: "local-cron" };
    },
    useLocalAutomationBackend: () => true,
  });

  const result = await service.runCronBridge({ action: "create" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.source.name, "native_cron");
  assert.match(result.error, /Unsupported Automation backend/);
  assert.deepEqual(calls, []);
}

async function testBridgeHostKindsAndTimeouts() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    bridgeCommandProvider: makeProvider(calls),
    bridgeHostEnabled: () => true,
    runBridgeHost(kind, payload, timeoutMs) {
      calls.push({ type: "host", kind, payload, timeoutMs });
      return { ok: true, kind, timeoutMs };
    },
    todoTimeoutMs: 100,
    cronTimeoutMs: 200,
    directoryTimeoutMs: 300,
  });

  assert.deepEqual(await service.runTodoBridge({ a: 1 }), { ok: true, kind: "todo", timeoutMs: 100 });
  assert.deepEqual(await service.runCronBridge({ b: 2 }), { ok: true, kind: "cron", timeoutMs: 200 });
  assert.deepEqual(await service.runDirectoryBridge({ c: 3 }), { ok: true, kind: "directory", timeoutMs: 300 });
  assert.deepEqual(calls, [
    { type: "host", kind: "todo", payload: { a: 1 }, timeoutMs: 100 },
    { type: "host", kind: "cron", payload: { b: 2 }, timeoutMs: 200 },
    { type: "host", kind: "directory", payload: { c: 3 }, timeoutMs: 300 },
  ]);
}

async function testPythonTodoBridgeOptions() {
  const { calls, compactText, service, spawn } = makeService();

  assert.deepEqual(await service.runTodoBridge({ action: "list" }), { ok: true, backend: "python" });
  assert.deepEqual(calls[0], {
    type: "python",
    scriptPath: "/opt/todo_bridge.py",
    envNames: TODO_BRIDGE_ENV_NAMES,
  });
  assert.deepEqual(calls[1], {
    type: "json",
    commandSpec: { command: "python3", args: ["/opt/todo_bridge.py"] },
    payload: { action: "list" },
    options: {
      spawn,
      label: "Todo bridge",
      timeoutMs: 111,
      stdoutLimitBytes: 44,
      compactText,
    },
  });
}

async function testPythonCronBridgeOptions() {
  const { calls, compactText, service, spawn } = makeService();

  assert.deepEqual(await service.runCronBridge({ action: "create" }), { ok: true, backend: "python" });
  assert.deepEqual(calls[0], {
    type: "python",
    scriptPath: "/opt/cron_bridge.py",
    envNames: CRON_BRIDGE_ENV_NAMES,
  });
  assert.deepEqual(calls[1], {
    type: "json",
    commandSpec: { command: "python3", args: ["/opt/cron_bridge.py"] },
    payload: { action: "create" },
    options: {
      spawn,
      label: "Cron bridge",
      timeoutMs: 222,
      stdoutLimitBytes: 55,
      compactText,
    },
  });
}

async function testPythonDirectoryBridgeOptions() {
  const { calls, compactText, service, spawn } = makeService();

  assert.deepEqual(await service.runDirectoryBridge({ action: "tree" }), { ok: true, backend: "python" });
  assert.deepEqual(calls[0], {
    type: "python",
    scriptPath: "/opt/directory_bridge.py",
    envNames: DIRECTORY_BRIDGE_ENV_NAMES,
  });
  assert.deepEqual(calls[1], {
    type: "json",
    commandSpec: { command: "python3", args: ["/opt/directory_bridge.py"] },
    payload: { action: "tree" },
    options: {
      spawn,
      label: "Directory bridge",
      timeoutMs: 333,
      stdoutLimitBytes: 66,
      compactText,
    },
  });
}

async function testPythonStructuredErrorResultPassesThrough() {
  const calls = [];
  const service = createLocalBridgeWrapperService({
    bridgeCommandProvider: makeProvider(calls, { ok: false, error: "known bridge error", stderr: "warning" }),
    directoryBridgeScript: "/opt/directory_bridge.py",
  });

  assert.deepEqual(await service.runDirectoryBridge({ action: "stat" }), {
    ok: false,
    error: "known bridge error",
    stderr: "warning",
  });
}

async function main() {
  await testTodoPrefersKanbanBeforeLocalHostAndPython();
  await testTodoUsesLocalBeforeHostAndPython();
  await testCronUsesLocalAutomationBeforeHostAndPython();
  await testCronRejectsUnsupportedAutomationBackend();
  await testBridgeHostKindsAndTimeouts();
  await testPythonTodoBridgeOptions();
  await testPythonCronBridgeOptions();
  await testPythonDirectoryBridgeOptions();
  await testPythonStructuredErrorResultPassesThrough();
  console.log("local-bridge-wrapper-service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
