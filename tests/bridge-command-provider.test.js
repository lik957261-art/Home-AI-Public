"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { createBridgeCommandProvider, runJsonBridgeCommand } = require("../adapters/bridge-command-provider");

function testDefaultScriptPath() {
  const provider = createBridgeCommandProvider({ env: {} });
  assert.equal(provider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", "todo_bridge.py"), path.resolve("todo_bridge.py"));
}

function testConfiguredScriptPath() {
  const provider = createBridgeCommandProvider({
    env: { HERMES_WEB_TODO_BRIDGE_SCRIPT: "/opt/hermes-mobile/todo.py" },
  });
  assert.equal(provider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", "todo_bridge.py"), "/opt/hermes-mobile/todo.py");
}

function testWindowsWslCommandUsesEnvAndPathConversions() {
  const provider = createBridgeCommandProvider({
    platform: "win32",
    env: {
      HERMES_WEB_HERMES_HOME: "/home/example/.hermes",
      HERMES_WEB_TODO_PLUGIN_NAME: "hermes_todos",
    },
    wslDistro: "Ubuntu-Test",
    windowsPathToWsl: (value) => {
      const match = String(value).match(/^([A-Za-z]):\\(.+)$/);
      return match ? `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}` : String(value);
    },
  });
  const command = provider.python("C:\\repo\\todo_bridge.py", ["HERMES_WEB_TODO_PLUGIN_NAME"]);
  assert.equal(command.command, "wsl.exe");
  assert.deepEqual(command.args.slice(0, 4), ["-d", "Ubuntu-Test", "--", "env"]);
  assert.ok(command.args.includes("HERMES_WEB_HERMES_HOME=/home/example/.hermes"));
  assert.ok(command.args.includes("HERMES_WEB_TODO_PLUGIN_NAME=hermes_todos"));
  assert.equal(command.args.at(-1), "/mnt/c/repo/todo_bridge.py");
}

function testWslAbsoluteAndUncPathsArePreservedForWsl() {
  const provider = createBridgeCommandProvider({
    platform: "win32",
    env: {},
    windowsPathToWsl: (value) => `/mnt/c/${value}`,
  });
  assert.equal(provider.scriptPathForWsl("/home/example/bridge.py"), "/home/example/bridge.py");
  assert.equal(
    provider.scriptPathForWsl("\\\\wsl.localhost\\Ubuntu-24.04\\home\\example\\bridge.py"),
    "/home/example/bridge.py",
  );
}

function testNonWindowsCommand() {
  const provider = createBridgeCommandProvider({ platform: "linux", env: {} });
  assert.deepEqual(provider.python("/opt/bridge.py"), {
    command: "python3",
    args: ["/opt/bridge.py"],
  });
}

function createFakeBridgeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    written: "",
    ended: false,
    end(value) {
      this.written += String(value || "");
      this.ended = true;
    },
  };
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

async function testRunJsonBridgeCommandParsesOutputAndWritesPayload() {
  const child = createFakeBridgeChild();
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(JSON.stringify({ ok: true, value: 7 })));
      child.stderr.emit("data", Buffer.from("warning text"));
      child.emit("close", 0);
    });
    return child;
  };

  const result = await runJsonBridgeCommand({
    spawn,
    commandSpec: { command: "python3", args: ["/tmp/bridge.py"] },
    payload: { action: "list" },
    label: "Test bridge",
    timeoutMs: 1000,
    compactText: (value, limit) => String(value).slice(0, limit),
    stderrPreviewBytes: 7,
  });

  assert.deepEqual(calls, [{
    command: "python3",
    args: ["/tmp/bridge.py"],
    options: { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  }]);
  assert.equal(child.stdin.ended, true);
  assert.equal(child.stdin.written, JSON.stringify({ action: "list" }));
  assert.deepEqual(result, { ok: true, value: 7, stderr: "warning" });
}

async function testProviderRunJsonCommandWrapper() {
  const provider = createBridgeCommandProvider({ env: {} });
  const child = createFakeBridgeChild();
  const resultPromise = provider.runJsonCommand(
    { command: "bridge", args: ["--json"] },
    { ping: true },
    {
      spawn: () => {
        queueMicrotask(() => {
          child.stdout.emit("data", Buffer.from('{"ok":true}'));
          child.emit("close", 0);
        });
        return child;
      },
      label: "Wrapped bridge",
      timeoutMs: 1000,
    },
  );

  assert.deepEqual(await resultPromise, { ok: true });
  assert.equal(child.stdin.written, JSON.stringify({ ping: true }));
}

async function testRunJsonBridgeCommandRejectsInvalidJson() {
  const child = createFakeBridgeChild();
  await assert.rejects(
    runJsonBridgeCommand({
      spawn: () => {
        queueMicrotask(() => {
          child.stdout.emit("data", Buffer.from("not json"));
          child.emit("close", 0);
        });
        return child;
      },
      commandSpec: { command: "bridge", args: [] },
      label: "Bad bridge",
      timeoutMs: 1000,
    }),
    /Bad bridge returned invalid JSON/,
  );
}

async function testRunJsonBridgeCommandRejectsNonZeroExitWithoutResultError() {
  const child = createFakeBridgeChild();
  await assert.rejects(
    runJsonBridgeCommand({
      spawn: () => {
        queueMicrotask(() => {
          child.stdout.emit("data", Buffer.from("{}"));
          child.stderr.emit("data", Buffer.from("fatal bridge error"));
          child.emit("close", 3);
        });
        return child;
      },
      commandSpec: { command: "bridge", args: [] },
      label: "Failing bridge",
      timeoutMs: 1000,
    }),
    /fatal bridge error/,
  );
}

async function testRunJsonBridgeCommandKeepsStructuredErrorResult() {
  const child = createFakeBridgeChild();
  const result = await runJsonBridgeCommand({
    spawn: () => {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from('{"ok":false,"error":"known"}'));
        child.emit("close", 2);
      });
      return child;
    },
    commandSpec: { command: "bridge", args: [] },
    label: "Structured bridge",
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { ok: false, error: "known" });
}

async function testRunJsonBridgeCommandTimesOutAndKillsChild() {
  const child = createFakeBridgeChild();
  await assert.rejects(
    runJsonBridgeCommand({
      spawn: () => child,
      commandSpec: { command: "bridge", args: [] },
      label: "Slow bridge",
      timeoutMs: 1,
    }),
    /Slow bridge timed out/,
  );
  assert.equal(child.killed, true);
}

async function main() {
  testDefaultScriptPath();
  testConfiguredScriptPath();
  testWindowsWslCommandUsesEnvAndPathConversions();
  testWslAbsoluteAndUncPathsArePreservedForWsl();
  testNonWindowsCommand();
  await testRunJsonBridgeCommandParsesOutputAndWritesPayload();
  await testProviderRunJsonCommandWrapper();
  await testRunJsonBridgeCommandRejectsInvalidJson();
  await testRunJsonBridgeCommandRejectsNonZeroExitWithoutResultError();
  await testRunJsonBridgeCommandKeepsStructuredErrorResult();
  await testRunJsonBridgeCommandTimesOutAndKillsChild();
  console.log("bridge-command-provider tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
