"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createLocalProcessRunnerService, runProcessText } = require("../adapters/local-process-runner-service");

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    ended: false,
    written: undefined,
    end(value) {
      this.ended = true;
      this.written = value;
    },
  };
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

function createManualTimers() {
  const timers = [];
  const cleared = [];
  return {
    timers,
    cleared,
    setTimeout(callback, ms) {
      const token = { callback, ms };
      timers.push(token);
      return token;
    },
    clearTimeout(token) {
      cleared.push(token);
      if (token) token.cleared = true;
    },
  };
}

async function testResolvesTextAndForwardsCurrentSpawnOptions() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const calls = [];
  const env = { HERMES_TEST_ENV: "1" };
  const service = createLocalProcessRunnerService({
    env,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("hello "));
        child.stdout.emit("data", Buffer.from("world"));
        child.stderr.emit("data", Buffer.from("warning"));
        child.emit("close", 0);
      });
      return child;
    },
  });

  const result = await service.runProcessText("tool", [1, true, "x"], {
    cwd: "C:\\work",
    env,
    timeoutMs: 500,
  });

  assert.deepEqual(result, { stdout: "hello world", stderr: "warning", code: 0 });
  assert.deepEqual(calls, [{
    command: "tool",
    args: ["1", "true", "x"],
    options: {
      cwd: "C:\\work",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  }]);
  assert.equal(timers.timers[0].ms, 1000);
  assert.equal(timers.cleared[0], timers.timers[0]);
  assert.equal(child.stdin.ended, true);
  assert.equal(child.stdin.written, undefined);
}

async function testUsesDefaultEnvAndSpawnOptionsExtension() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const defaultEnv = { DEFAULT_ENV: "yes" };
  let observed = null;
  const service = createLocalProcessRunnerService({
    env: defaultEnv,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn(_command, _args, options) {
      observed = options;
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
  });

  await service.runProcessText("tool", [], {
    spawnOptions: {
      shell: true,
      windowsHide: false,
    },
  });

  assert.deepEqual(observed, {
    shell: true,
    windowsHide: false,
    cwd: undefined,
    env: defaultEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function testKeepsTrailingBufferedOutput() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const stdout = "o".repeat(9000);
  const stderr = "e".repeat(9001);
  const service = createLocalProcessRunnerService({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn() {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from(stdout));
        child.stderr.emit("data", Buffer.from(stderr));
        child.emit("close", 0);
      });
      return child;
    },
  });

  const result = await service.runProcessText("tool", [], { maxOutputBytes: 10 });

  assert.equal(result.stdout, stdout.slice(-8192));
  assert.equal(result.stderr, stderr.slice(-8192));
}

async function testRejectsNonZeroExitWithCurrentErrorShape() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const service = createLocalProcessRunnerService({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn() {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("partial out"));
        child.stderr.emit("data", Buffer.from("partial err"));
        child.emit("close", 7);
      });
      return child;
    },
  });

  await assert.rejects(
    service.runProcessText("bad-tool", [], { timeoutMs: 30000 }),
    (err) => {
      assert.equal(err.message, "bad-tool exited with code 7");
      assert.equal(err.code, 7);
      assert.equal(err.stdout, "partial out");
      assert.equal(err.stderr, "partial err");
      return true;
    },
  );
  assert.equal(timers.cleared.length, 1);
}

async function testRejectsSpawnErrorWithBufferedOutput() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const spawnError = new Error("spawn failed");
  const service = createLocalProcessRunnerService({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn() {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("before error"));
        child.stderr.emit("data", Buffer.from("stderr before error"));
        child.emit("error", spawnError);
      });
      return child;
    },
  });

  await assert.rejects(
    service.runProcessText("missing-tool", []),
    (err) => {
      assert.equal(err, spawnError);
      assert.equal(err.stdout, "before error");
      assert.equal(err.stderr, "stderr before error");
      return true;
    },
  );
  assert.equal(timers.cleared.length, 1);
}

async function testTimeoutKillsChildAndReturnsBufferedOutput() {
  const child = createFakeChild();
  const timers = createManualTimers();
  const service = createLocalProcessRunnerService({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn() {
      return child;
    },
  });

  const promise = service.runProcessText("slow-tool", [], { timeoutMs: 20, maxOutputBytes: 8192 });
  child.stdout.emit("data", Buffer.from("out before timeout"));
  child.stderr.emit("data", Buffer.from("err before timeout"));
  assert.equal(timers.timers[0].ms, 1000);
  timers.timers[0].callback();

  await assert.rejects(
    promise,
    (err) => {
      assert.equal(err.message, "slow-tool timed out after 1000ms");
      assert.equal(err.code, "ETIMEDOUT");
      assert.equal(err.stdout, "out before timeout");
      assert.equal(err.stderr, "err before timeout");
      return true;
    },
  );
  assert.equal(child.killed, true);
}

async function testPipeInputEndsStdinAndKeepsCustomStdio() {
  const child = createFakeChild();
  const timers = createManualTimers();
  let observed = null;
  const service = createLocalProcessRunnerService({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    spawn(_command, _args, options) {
      observed = options;
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
  });

  await service.runProcessText("cat", [], {
    input: "payload",
    spawnOptions: {
      stdio: ["pipe", "pipe", "pipe"],
    },
  });

  assert.deepEqual(observed.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(child.stdin.ended, true);
  assert.equal(child.stdin.written, "payload");
}

function testDefaultHelperIsExported() {
  assert.equal(typeof runProcessText, "function");
}

async function run() {
  await testResolvesTextAndForwardsCurrentSpawnOptions();
  await testUsesDefaultEnvAndSpawnOptionsExtension();
  await testKeepsTrailingBufferedOutput();
  await testRejectsNonZeroExitWithCurrentErrorShape();
  await testRejectsSpawnErrorWithBufferedOutput();
  await testTimeoutKillsChildAndReturnsBufferedOutput();
  await testPipeInputEndsStdinAndKeepsCustomStdio();
  testDefaultHelperIsExported();
  console.log("local process runner service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
