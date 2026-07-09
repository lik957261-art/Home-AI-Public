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

function waitFor(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  return fs.existsSync(filePath);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-cron-manual-run-"));
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

def _jobs_path():
    return _home() / "cron" / "jobs.json"

def _read_doc():
    return json.loads(_jobs_path().read_text(encoding="utf-8"))

def _write_doc(doc):
    _jobs_path().write_text(json.dumps(doc, indent=2), encoding="utf-8")

def load_jobs():
    return _read_doc()["jobs"]

def get_due_jobs():
    return [
        job for job in load_jobs()
        if job.get("enabled", True) and job.get("next_run_at")
    ]

def advance_next_run(job_id):
    (_home() / "advanced.json").write_text(json.dumps({"job_id": job_id}), encoding="utf-8")

def mark_job_run(job_id, success, error=None, delivery_error=None):
    doc = _read_doc()
    for job in doc["jobs"]:
        if job.get("id") == job_id:
            job["last_status"] = "ok" if success else "error"
            job["last_error"] = error
            job["last_delivery_error"] = delivery_error
            if job.get("resume_during_run"):
                job["enabled"] = True
                job["state"] = "scheduled"
                job["paused_at"] = None
                job["paused_reason"] = None
                job["next_run_at"] = "2026-07-09T02:00:00.000Z"
            break
    _write_doc(doc)

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
        "enabled": job.get("enabled"),
        "state": job.get("state"),
        "manual_run_requested_at": job.get("manual_run_requested_at"),
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

const fixture = makeFixture();
try {
  writeJobs(fixture.hermesHome, [{
    id: "paused_manual_job",
    name: "Paused manual job",
    enabled: false,
    state: "paused",
    paused_at: "2026-07-09T00:00:00.000Z",
    paused_reason: "owner_pause",
    next_run_at: null,
    manual_run_requested_at: "2026-07-09T01:00:00.000Z",
    no_agent: true,
  }]);
  const result = spawnSync(python, [dispatcher, "--dispatch"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HERMES_HOME: fixture.hermesHome,
      HERMES_MOBILE_NETWORK_MODE: "direct",
      PYTHONPATH: fixture.fakeCron,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /dispatched job paused_manual_job/);
  assert.equal(fs.existsSync(path.join(fixture.hermesHome, "advanced.json")), false);
  const schedulerCalled = path.join(fixture.hermesHome, "scheduler-called.json");
  assert.equal(waitFor(schedulerCalled), true, "manual paused run was not consumed by dispatcher");
  const called = JSON.parse(fs.readFileSync(schedulerCalled, "utf8"));
  assert.equal(called.job_id, "paused_manual_job");
  assert.equal(called.enabled, true);
  assert.equal(called.state, "scheduled");
  assert.equal(called.manual_run_requested_at, "2026-07-09T01:00:00.000Z");
  const persisted = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "cron", "jobs.json"), "utf8"));
  const job = persisted.jobs.find((item) => item.id === "paused_manual_job");
  assert.equal(job.enabled, false);
  assert.equal(job.state, "paused");
  assert.equal(job.paused_at, "2026-07-09T00:00:00.000Z");
  assert.equal(job.paused_reason, "owner_pause");
  assert.equal(job.next_run_at, null);
  assert.equal(Object.hasOwn(job, "manual_run_requested_at"), false);
  assert.equal(job.last_status, "ok");
} finally {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

const resumedFixture = makeFixture();
try {
  writeJobs(resumedFixture.hermesHome, [{
    id: "paused_then_resumed_job",
    name: "Paused then resumed job",
    enabled: false,
    state: "paused",
    paused_at: "2026-07-09T00:00:00.000Z",
    paused_reason: "owner_pause",
    next_run_at: null,
    manual_run_requested_at: "2026-07-09T01:00:00.000Z",
    resume_during_run: true,
    no_agent: true,
  }]);
  const result = spawnSync(python, [dispatcher, "--dispatch"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HERMES_HOME: resumedFixture.hermesHome,
      HERMES_MOBILE_NETWORK_MODE: "direct",
      PYTHONPATH: resumedFixture.fakeCron,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const schedulerCalled = path.join(resumedFixture.hermesHome, "scheduler-called.json");
  assert.equal(waitFor(schedulerCalled), true, "manual paused run was not consumed after resume simulation");
  const persisted = JSON.parse(fs.readFileSync(path.join(resumedFixture.hermesHome, "cron", "jobs.json"), "utf8"));
  const job = persisted.jobs.find((item) => item.id === "paused_then_resumed_job");
  assert.equal(job.enabled, true);
  assert.equal(job.state, "scheduled");
  assert.equal(job.paused_at, null);
  assert.equal(job.paused_reason, null);
  assert.equal(job.next_run_at, "2026-07-09T02:00:00.000Z");
  assert.equal(Object.hasOwn(job, "manual_run_requested_at"), false);
} finally {
  fs.rmSync(resumedFixture.root, { recursive: true, force: true });
}

console.log("cron dispatcher manual run harness tests passed");
