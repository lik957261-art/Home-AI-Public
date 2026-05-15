"use strict";

const { spawn: defaultSpawn } = require("node:child_process");

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function createLocalProcessRunnerService(deps = {}) {
  const spawn = typeof deps.spawn === "function" ? deps.spawn : defaultSpawn;
  const setTimer = typeof deps.setTimeout === "function" ? deps.setTimeout : setTimeout;
  const clearTimer = typeof deps.clearTimeout === "function" ? deps.clearTimeout : clearTimeout;
  const defaultEnv = deps.env || process.env;

  function buildSpawnOptions(options) {
    const spawnOptions = Object.assign({}, options.spawnOptions || {});
    const hasInput = hasOwn(options, "input") || hasOwn(options, "stdin");
    const input = hasOwn(options, "input") ? options.input : options.stdin;

    spawnOptions.cwd = hasOwn(options, "cwd") ? (options.cwd || undefined) : spawnOptions.cwd;
    spawnOptions.env = hasOwn(options, "env") ? (options.env || defaultEnv) : (spawnOptions.env || defaultEnv);
    spawnOptions.stdio = spawnOptions.stdio || (hasInput ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]);
    if (!hasOwn(spawnOptions, "windowsHide")) spawnOptions.windowsHide = true;

    return { spawnOptions, hasInput, input };
  }

  function runProcessText(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const timeoutMs = Math.max(1000, Number(options.timeoutMs || 30000));
      const maxOutputBytes = Math.max(8192, Number(options.maxOutputBytes || 2_000_000));
      const built = buildSpawnOptions(options);
      const child = spawn(command, args.map(String), built.spawnOptions);
      let stdout = "";
      let stderr = "";
      let settled = false;
      const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-maxOutputBytes);
      const timer = setTimer(() => {
        if (settled) return;
        settled = true;
        child.kill();
        const err = new Error(`${command} timed out after ${timeoutMs}ms`);
        err.code = "ETIMEDOUT";
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }, timeoutMs);

      if (child.stdout && typeof child.stdout.on === "function") {
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
      }
      if (child.stderr && typeof child.stderr.on === "function") {
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      }
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        if (code === 0) {
          resolve({ stdout, stderr, code });
          return;
        }
        const err = new Error(`${command} exited with code ${code}`);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      });
      if (child.stdin && typeof child.stdin.end === "function") {
        if (built.hasInput) child.stdin.end(built.input);
        else child.stdin.end();
      }
    });
  }

  return {
    runProcessText,
  };
}

const defaultService = createLocalProcessRunnerService();

function runProcessText(command, args = [], options = {}) {
  return defaultService.runProcessText(command, args, options);
}

module.exports = {
  createLocalProcessRunnerService,
  runProcessText,
};
