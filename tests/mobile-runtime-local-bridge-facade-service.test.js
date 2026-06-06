"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeLocalBridgeFacadeService } = require("../adapters/mobile-runtime-local-bridge-facade-service");

let createCalls = 0;
const capturedOptions = [];

const facade = createMobileRuntimeLocalBridgeFacadeService({
  bridgeCommandProvider: { name: "bridge-command-provider" },
  bridgeHostKeyPath: "/secret/bridge-host.key",
  bridgeHostUrl: () => "http://127.0.0.1:8798",
  compactText: (value) => String(value || "").slice(0, 10),
  createAutomationId: () => "auto_fixture",
  createLocalBridgeRuntimeService(options) {
    createCalls += 1;
    capturedOptions.push(options);
    return {
      runCronBridge: (payload) => ({ kind: "cron", payload }),
      runDirectoryBridge: (payload) => ({ kind: "directory", payload }),
      runProcessText: (command, args, runOptions) => ({ command, args, runOptions }),
      runTodoBridge: (payload) => ({ kind: "todo", payload }),
    };
  },
  cronBridgeScript: "cron_bridge.py",
  cronStdoutLimitBytes: 200,
  cronTimeoutMs: 300,
  directoryBridgeScript: "directory_bridge.py",
  directoryStdoutLimitBytes: 400,
  directoryTimeoutMs: 500,
  env: { NODE_ENV: "test" },
  formatLocalDateTime: () => "2026-06-07 00:00",
  kanbanTodoBridge: () => ({ run: () => ({ ok: true }) }),
  localAutomationStorePath: "/data/automation.json",
  localTodoStorePath: "/data/todos.json",
  mobileSqliteStore: () => ({ db: true }),
  nowIso: () => "2026-06-07T00:00:00.000Z",
  readJsonStore: () => ({}),
  sortJobs: (jobs) => jobs,
  spawn: () => {},
  todoBridgeScript: "todo_bridge.py",
  todoStdoutLimitBytes: 600,
  todoTimeoutMs: 700,
  useKanbanTodoBackend: () => false,
  useLocalAutomationBackend: () => true,
  useLocalTodoBackend: () => true,
  useSqliteServiceStore: () => true,
  writeJsonStore: () => {},
});

assert.equal(createCalls, 0);
assert.deepEqual(facade.runTodoBridge({ title: "A" }), { kind: "todo", payload: { title: "A" } });
assert.deepEqual(facade.runCronBridge({ action: "list" }), { kind: "cron", payload: { action: "list" } });
assert.deepEqual(facade.runDirectoryBridge({ path: "/drive" }), { kind: "directory", payload: { path: "/drive" } });
assert.deepEqual(facade.runProcessText("git", ["status"], { cwd: "/repo" }), {
  command: "git",
  args: ["status"],
  runOptions: { cwd: "/repo" },
});
assert.equal(facade.getLocalBridgeRuntimeService(), facade.getLocalBridgeRuntimeService());
assert.equal(createCalls, 1);

const options = capturedOptions[0];
assert.equal(options.bridgeHostKeyPath, "/secret/bridge-host.key");
assert.equal(options.bridgeHostUrl(), "http://127.0.0.1:8798");
assert.equal(options.createAutomationId(), "auto_fixture");
assert.equal(options.cronBridgeScript, "cron_bridge.py");
assert.equal(options.directoryBridgeScript, "directory_bridge.py");
assert.equal(options.todoBridgeScript, "todo_bridge.py");
assert.equal(options.todoStdoutLimitBytes, 600);
assert.equal(options.todoTimeoutMs, 700);
assert.equal(options.useSqliteServiceStore(), true);

assert.throws(() => createMobileRuntimeLocalBridgeFacadeService({}), /requires createLocalBridgeRuntimeService/);

console.log("mobile runtime local bridge facade service tests passed");
