"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const python = process.platform === "win32" ? "python" : "python3";
const dispatcher = path.join(repoRoot, "scripts", "hermes-mobile-cron-dispatcher.py");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-cron-proxy-"));
  const hermesHome = path.join(root, "home");
  const fakeCron = path.join(root, "fake-cron");
  fs.mkdirSync(path.join(hermesHome, "cron"), { recursive: true });
  writeFile(path.join(fakeCron, "cron", "__init__.py"), "");
  writeFile(path.join(fakeCron, "cron", "jobs.py"), `
import json
import os
from pathlib import Path

def _home():
    return Path(os.environ["HERMES_HOME"])

def load_jobs():
    return json.loads((_home() / "cron" / "jobs.json").read_text(encoding="utf-8"))["jobs"]

def mark_job_run(job_id, success, error=None, delivery_error=None):
    (_home() / "mark.json").write_text(json.dumps({
        "job_id": job_id,
        "success": success,
        "error": error,
        "delivery_error": delivery_error,
    }), encoding="utf-8")

def save_job_output(job_id, output):
    path = _home() / f"{job_id}.out"
    path.write_text(output or "", encoding="utf-8")
    return str(path)
`);
  writeFile(path.join(fakeCron, "cron", "scheduler.py"), `
import json
import os
from pathlib import Path

SILENT_MARKER = "[SILENT]"

def run_job(job):
    home = Path(os.environ["HERMES_HOME"])
    (home / "scheduler-called.json").write_text(json.dumps({
        "job_id": job.get("id"),
        "https_proxy": os.environ.get("HTTPS_PROXY", ""),
        "http_proxy": os.environ.get("HTTP_PROXY", ""),
        "all_proxy": os.environ.get("ALL_PROXY", ""),
    }), encoding="utf-8")
    return True, "output", "final", None

def _deliver_result(job, deliver_content, adapters=None, loop=None):
    return None
`);
  return { root, hermesHome, fakeCron };
}

function writeJobs(hermesHome, jobs) {
  writeFile(path.join(hermesHome, "cron", "jobs.json"), JSON.stringify({ jobs }, null, 2));
}

function baseEnvWithoutProxy() {
  const env = { ...process.env };
  for (const key of [
    "HERMES_MOBILE_CRON_MODEL_PROXY_URL",
    "HERMES_WEB_CRON_MODEL_PROXY_URL",
    "HERMES_MOBILE_OUTBOUND_PROXY_URL",
    "HERMES_WEB_OUTBOUND_PROXY_URL",
    "HERMES_MOBILE_CRON_TICK_SIDE",
    "HERMES_MOBILE_CRON_MODEL_PROXY_PORT",
    "HERMES_MOBILE_WINDOWS_HOST_GATEWAY",
    "HERMES_WEB_WINDOWS_HOST_GATEWAY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "https_proxy",
    "http_proxy",
    "all_proxy",
  ]) {
    delete env[key];
  }
  return env;
}

function runJob(fixture, jobId, extraEnv = {}) {
  return spawnSync(python, [dispatcher, "--run-job", jobId], {
    cwd: repoRoot,
    env: {
      ...baseEnvWithoutProxy(),
      HERMES_HOME: fixture.hermesHome,
      PYTHONPATH: fixture.fakeCron,
      HERMES_MOBILE_CRON_REQUIRE_PROXY_HEALTH: "0",
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

{
  const fixture = makeFixture();
  try {
    writeJobs(fixture.hermesHome, [{ id: "model_job", name: "Model job", no_agent: false }]);
    const result = runJob(fixture, "model_job");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const mark = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "mark.json"), "utf8"));
    assert.equal(mark.success, false);
    assert.match(mark.error, /cron_model_proxy_required/);
    assert.equal(fs.existsSync(path.join(fixture.hermesHome, "scheduler-called.json")), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeJobs(fixture.hermesHome, [{ id: "model_job", name: "Model job", no_agent: false }]);
    const result = runJob(fixture, "model_job", {
      HERMES_MOBILE_NETWORK_MODE: "direct",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const called = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "scheduler-called.json"), "utf8"));
    assert.equal(called.https_proxy, "");
    assert.equal(called.http_proxy, "");
    assert.equal(called.all_proxy, "");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeJobs(fixture.hermesHome, [{ id: "model_job", name: "Model job", no_agent: false }]);
    const result = runJob(fixture, "model_job", {
      HERMES_MOBILE_CRON_MODEL_PROXY_URL: "http://127.0.0.1:7890",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const called = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "scheduler-called.json"), "utf8"));
    assert.equal(called.https_proxy, "http://127.0.0.1:7890");
    assert.equal(called.http_proxy, "http://127.0.0.1:7890");
    assert.equal(called.all_proxy, "http://127.0.0.1:7890");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeJobs(fixture.hermesHome, [{ id: "script_job", name: "Script job", no_agent: true }]);
    const result = runJob(fixture, "script_job");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const called = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "scheduler-called.json"), "utf8"));
    assert.equal(called.job_id, "script_job");
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

console.log("cron dispatcher proxy harness tests passed");
