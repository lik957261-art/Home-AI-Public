"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { jobIssues, loadSkillNames } = require("../scripts/macos-automation-cron-audit");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-cron-audit-"));
try {
  const skillDir = path.join(tempRoot, "data", "hermes-home", "skills", "productivity", "known-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: known-skill\n---\n# Known\n");
  const skillNames = loadSkillNames(path.join(tempRoot, "data", "hermes-home", "skills"));
  assert.equal(skillNames.has("known-skill"), true);
  assert.equal(skillNames.has("productivity/known-skill"), true);

  assert.deepEqual(jobIssues({
    id: "agent-missing",
    enabled: true,
    deliver: "origin",
    skills: ["missing-skill"],
    last_error: "No inference provider configured.",
  }, skillNames), [
    "missing_profile",
    "origin_delivery_without_target",
    "missing_skill:missing-skill",
    "last_error_no_inference_provider",
  ]);
  assert.deepEqual(jobIssues({
    id: "script-job",
    enabled: true,
    no_agent: true,
    script: "backup.sh",
    deliver: "local",
  }, skillNames), []);

  const jobsPath = path.join(tempRoot, "data", "hermes-home", "cron", "jobs.json");
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.writeFileSync(jobsPath, JSON.stringify({
    jobs: [
      { id: "ok", enabled: true, profile: "hm-owner-openai-1", deliver: "local", skills: ["known-skill"] },
      { id: "bad", enabled: true, deliver: "origin", skills: ["missing-skill"] },
    ],
  }));
  const run = spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "macos-automation-cron-audit.js"),
    "--root",
    tempRoot,
    "--strict-config",
    "--json",
  ], { encoding: "utf8" });
  assert.equal(run.status, 1);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.ok, false);
  assert.deepEqual(payload.configIssues, [
    "bad:missing_profile",
    "bad:origin_delivery_without_target",
    "bad:missing_skill:missing-skill",
  ]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macos automation cron audit tests passed");
