"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function bounded(value) {
  return String(value || "").slice(-2000);
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

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hm-runtime-startup-"));
  const env = Object.assign({}, process.env, {
    HERMES_WEB_HOST: "127.0.0.1",
    HERMES_WEB_PORT: "0",
    HERMES_WEB_DATA_DIR: path.join(tempDir, "data"),
    HERMES_WEB_DISABLE_AUTH: "1",
  });
  delete env.HERMES_WEB_KEY;

  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let ready = false;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`mobile runtime startup timeout\nstdout=${bounded(stdout)}\nstderr=${bounded(stderr)}`));
      }, 10000);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
        if (!ready && stdout.includes("Hermes Mobile listening on")) {
          ready = true;
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("exit", (code, signal) => {
        if (ready) return;
        clearTimeout(timer);
        reject(new Error(`mobile runtime exited before startup code=${code} signal=${signal}\nstdout=${bounded(stdout)}\nstderr=${bounded(stderr)}`));
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    assert.match(stdout, /Hermes Mobile listening on http:\/\/127\.0\.0\.1:0/);
    assert.doesNotMatch(stderr, /ReferenceError|before initialization|Cannot access/);
  } finally {
    await stopChild(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main()
  .then(() => console.log("mobile server runtime startup smoke passed"))
  .catch(async (err) => {
    console.error(err.stack || err.message || String(err));
    process.exitCode = 1;
  });
