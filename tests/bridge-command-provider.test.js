"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { createBridgeCommandProvider } = require("../adapters/bridge-command-provider");

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

testDefaultScriptPath();
testConfiguredScriptPath();
testWindowsWslCommandUsesEnvAndPathConversions();
testWslAbsoluteAndUncPathsArePreservedForWsl();
testNonWindowsCommand();
console.log("bridge-command-provider tests passed");
