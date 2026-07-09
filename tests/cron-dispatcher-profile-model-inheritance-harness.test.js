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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-cron-profile-model-"));
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
    try:
        import hermes_constants
        home_override = hermes_constants.get_hermes_home_override()
    except Exception:
        home_override = None
    (_home() / "mark.json").write_text(json.dumps({
        "job_id": job_id,
        "success": success,
        "error": error,
        "delivery_error": delivery_error,
        "home_override": home_override,
    }), encoding="utf-8")

def save_job_output(job_id, output):
    path = _home() / f"{job_id}.out"
    path.write_text(output or "", encoding="utf-8")
    return str(path)
`);
  writeFile(path.join(fakeCron, "hermes_constants.py"), `
_home_override = None

def set_hermes_home_override(path):
    global _home_override
    _home_override = path

def get_hermes_home_override():
    return _home_override
`);
  writeFile(path.join(fakeCron, "cron", "scheduler.py"), `
import json
import os
from pathlib import Path
import hermes_constants

SILENT_MARKER = "[SILENT]"

def run_job(job):
    home = Path(os.environ["HERMES_HOME"])
    (home / "scheduler-called.json").write_text(json.dumps({
        "job_id": job.get("id"),
        "hermes_home": str(home),
        "model": job.get("model"),
        "provider": job.get("provider"),
        "model_provider": job.get("model_provider"),
        "base_url": job.get("base_url"),
        "baseUrl": job.get("baseUrl"),
        "profile": job.get("profile"),
        "home_override": hermes_constants.get_hermes_home_override(),
    }), encoding="utf-8")
    if not job.get("model"):
        return False, "", "", "no_model"
    return True, "output", "final", None

def _deliver_result(job, deliver_content, adapters=None, loop=None):
    home = Path(os.environ["HERMES_HOME"])
    (home / "deliver-called.json").write_text(json.dumps({
        "job_id": job.get("id"),
        "hermes_home": str(home),
        "home_override": hermes_constants.get_hermes_home_override(),
        "has_content": bool(deliver_content),
    }), encoding="utf-8")
    return None
`);
  return { root, hermesHome, fakeCron };
}

function writeJobs(hermesHome, jobs) {
  writeFile(path.join(hermesHome, "cron", "jobs.json"), JSON.stringify({ jobs }, null, 2));
}

function writeProfile(hermesHome, profileId, configYaml) {
  writeFile(path.join(hermesHome, "profiles", profileId, "config.yaml"), configYaml);
}

function profileHome(hermesHome, profileId) {
  return path.join(hermesHome, "profiles", profileId);
}

function runJob(fixture, jobId) {
  return spawnSync(python, [dispatcher, "--run-job", jobId], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HERMES_HOME: fixture.hermesHome,
      HERMES_MOBILE_NETWORK_MODE: "direct",
      PYTHONPATH: fixture.fakeCron,
    },
    encoding: "utf8",
  });
}

{
  const fixture = makeFixture();
  try {
    writeProfile(fixture.hermesHome, "hm-owner-openai-1", `
model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://model.example.invalid/v1
`);
    writeJobs(fixture.hermesHome, [{
      id: "profile_model_job",
      name: "Profile model job",
      profile: "hm-owner-openai-1",
      no_agent: false,
    }]);
    const result = runJob(fixture, "profile_model_job");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const profileDir = profileHome(fixture.hermesHome, "hm-owner-openai-1");
    const called = JSON.parse(fs.readFileSync(path.join(profileDir, "scheduler-called.json"), "utf8"));
    assert.equal(called.model, "gpt-5.5");
    assert.equal(called.provider, "openai-codex");
    assert.equal(called.base_url, "https://model.example.invalid/v1");
    assert.equal(called.hermes_home, profileDir);
    assert.equal(called.home_override, profileDir);
    const delivered = JSON.parse(fs.readFileSync(path.join(profileDir, "deliver-called.json"), "utf8"));
    assert.equal(delivered.hermes_home, profileDir);
    assert.equal(delivered.home_override, profileDir);
    assert.equal(fs.existsSync(path.join(fixture.hermesHome, "profile_model_job.out")), true);
    const mark = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "mark.json"), "utf8"));
    assert.equal(mark.success, true);
    assert.equal(mark.home_override, null);
    const persisted = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "cron", "jobs.json"), "utf8"));
    assert.equal(persisted.jobs[0].model, undefined);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeProfile(fixture.hermesHome, "hm-owner-openai-1", `
model:
  default: gpt-5.5
  provider: openai-codex
  base_url: https://model.example.invalid/v1
`);
    writeJobs(fixture.hermesHome, [{
      id: "override_job",
      name: "Override job",
      profile: "hm-owner-openai-1",
      model: "explicit-model",
      provider: "explicit-provider",
      base_url: "https://explicit.example.invalid/v1",
      no_agent: false,
    }]);
    const result = runJob(fixture, "override_job");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const profileDir = profileHome(fixture.hermesHome, "hm-owner-openai-1");
    const called = JSON.parse(fs.readFileSync(path.join(profileDir, "scheduler-called.json"), "utf8"));
    assert.equal(called.model, "explicit-model");
    assert.equal(called.provider, "explicit-provider");
    assert.equal(called.base_url, "https://explicit.example.invalid/v1");
    assert.equal(called.hermes_home, profileDir);
    assert.equal(called.home_override, profileDir);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeJobs(fixture.hermesHome, [{
      id: "missing_profile_job",
      name: "Missing profile job",
      profile: "hm-owner-openai-1",
      noAgent: false,
    }]);
    const result = runJob(fixture, "missing_profile_job");
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const called = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "scheduler-called.json"), "utf8"));
    assert.equal(called.model, null);
    const mark = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "mark.json"), "utf8"));
    assert.equal(mark.success, false);
    assert.equal(mark.error, "no_model");
    assert.equal(mark.home_override, null);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

{
  const fixture = makeFixture();
  try {
    writeProfile(fixture.hermesHome, "hm-owner-openai-1", `
model:
  default: gpt-5.5
`);
    writeJobs(fixture.hermesHome, [{
      id: "profile_no_agent_job",
      name: "Profile no-agent job",
      profile: "hm-owner-openai-1",
      no_agent: true,
      model: "script-model",
    }]);
    const result = runJob(fixture, "profile_no_agent_job");
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const called = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "scheduler-called.json"), "utf8"));
    assert.equal(called.hermes_home, fixture.hermesHome);
    assert.equal(called.home_override, null);
    assert.equal(fs.existsSync(path.join(profileHome(fixture.hermesHome, "hm-owner-openai-1"), "scheduler-called.json")), false);
    const mark = JSON.parse(fs.readFileSync(path.join(fixture.hermesHome, "mark.json"), "utf8"));
    assert.equal(mark.success, true);
    assert.equal(mark.home_override, null);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

console.log("cron dispatcher profile model inheritance harness passed");
