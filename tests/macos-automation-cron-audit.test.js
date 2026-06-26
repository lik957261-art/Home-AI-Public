"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  auditRuntimeScripts,
  buildAudit,
  jobIssues,
  loadSkillNames,
  statusIssue,
} = require("../scripts/macos-automation-cron-audit");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-cron-audit-"));
try {
  const appRoot = path.join(tempRoot, "app");
  fs.mkdirSync(path.join(appRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "data", "hermes-home", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(appRoot, "scripts", "homeai-disaster-backup-cron.sh"), "#!/usr/bin/env bash\necho ok\n");
  fs.writeFileSync(path.join(tempRoot, "data", "hermes-home", "scripts", "homeai-disaster-backup-cron.sh"), "#!/usr/bin/env bash\necho ok\n");
  fs.chmodSync(path.join(tempRoot, "data", "hermes-home", "scripts", "homeai-disaster-backup-cron.sh"), 0o750);
  assert.deepEqual(auditRuntimeScripts(appRoot, path.join(tempRoot, "data", "hermes-home")), []);

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
  assert.equal(statusIssue({ enabled: true, last_status: "error" }), "last_status_error");
  assert.equal(statusIssue({ enabled: false, last_status: "error" }), "");

  const jobsPath = path.join(tempRoot, "data", "hermes-home", "cron", "jobs.json");
  fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
  fs.writeFileSync(jobsPath, JSON.stringify({
    jobs: [
      { id: "ok", enabled: true, profile: "hm-owner-openai-1", deliver: "local", skills: ["known-skill"] },
      { id: "bad", enabled: true, deliver: "origin", skills: ["missing-skill"] },
      { id: "failed-script", enabled: true, no_agent: true, script: "backup.sh", last_status: "error", last_run_at: "2026-06-24T10:00:00Z" },
      { id: "old-failed-script", enabled: true, no_agent: true, script: "backup.sh", last_status: "error", last_run_at: "2026-06-24T09:00:00Z" },
    ],
  }));
  const run = spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "macos-automation-cron-audit.js"),
    "--root",
    tempRoot,
    "--app",
    appRoot,
    "--strict-config",
    "--strict-status",
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
  assert.deepEqual(payload.statusIssues, ["failed-script:last_status_error", "old-failed-script:last_status_error"]);

  const boundedRun = spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "macos-automation-cron-audit.js"),
    "--root",
    tempRoot,
    "--app",
    appRoot,
    "--strict-status",
    "--status-since",
    "2026-06-24T09:30:00Z",
    "--json",
  ], { encoding: "utf8" });
  assert.equal(boundedRun.status, 1);
  const boundedPayload = JSON.parse(boundedRun.stdout);
  assert.equal(boundedPayload.statusSince, "2026-06-24T09:30:00.000Z");
  assert.deepEqual(boundedPayload.statusIssues, ["failed-script:last_status_error"]);

  const oldOnly = buildAudit({
    root: tempRoot,
    appRoot,
    strictStatus: true,
    statusSince: "2026-06-24T10:30:00Z",
  });
  assert.equal(oldOnly.ok, true);
  assert.deepEqual(oldOnly.statusIssues, []);

  fs.writeFileSync(path.join(tempRoot, "data", "hermes-home", "scripts", "homeai-disaster-backup-cron.sh"), "#!/usr/bin/env bash\necho drift\n");
  const drift = buildAudit({
    root: tempRoot,
    appRoot,
    strictSource: true,
  });
  assert.equal(drift.ok, false);
  assert.ok(drift.sourceIssues.some((issue) => issue.code === "cron_runtime_script_drift"));
  fs.writeFileSync(path.join(tempRoot, "data", "hermes-home", "scripts", "homeai-disaster-backup-cron.sh"), "#!/usr/bin/env bash\necho ok\n");

  const strictSource = buildAudit({
    root: tempRoot,
    appRoot,
    jobsPath: path.join(tempRoot, "missing", "jobs.json"),
    skillRoot: path.join(tempRoot, "missing", "skills"),
    strictSource: true,
  });
  assert.equal(strictSource.ok, false);
  assert.equal(strictSource.sourceIssueCount, 2);
  assert.ok(strictSource.sourceIssues.some((issue) => issue.code === "cron_jobs_store_unreadable"));
  assert.ok(strictSource.sourceIssues.some((issue) => issue.code === "cron_skill_store_unreadable"));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macos automation cron audit tests passed");
