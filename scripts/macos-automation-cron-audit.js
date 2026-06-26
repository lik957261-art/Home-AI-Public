"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function readJsonWithIssue(filePath, issueCode) {
  try {
    return { value: JSON.parse(fs.readFileSync(filePath, "utf8")), issue: null };
  } catch (err) {
    return {
      value: null,
      issue: {
        code: issueCode || "json_unreadable",
        path: filePath,
        detail: err && err.code ? err.code : "read_failed",
      },
    };
  }
}

function clean(value) {
  return String(value || "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? [text] : [];
}

function loadSkillNames(root) {
  const names = new Set();
  function visit(dir, depth = 0) {
    if (!dir || depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(filePath, depth + 1);
        continue;
      }
      if (entry.name !== "SKILL.md") continue;
      const text = fs.readFileSync(filePath, "utf8");
      const frontmatterName = text.match(/^---[\s\S]*?\nname:\s*([^\n]+)\n[\s\S]*?---/m)?.[1];
      const skillName = clean(frontmatterName).replace(/^["']|["']$/g, "") || path.basename(path.dirname(filePath));
      if (skillName) names.add(skillName);
      const rel = path.relative(root, path.dirname(filePath)).split(path.sep).join("/");
      if (rel) names.add(rel);
    }
  }
  visit(root);
  return names;
}

function loadSkillAudit(root) {
  const issues = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    issues.push({
      code: "cron_skill_store_unreadable",
      path: root,
      detail: err && err.code ? err.code : "read_failed",
    });
    return { names: new Set(), issues };
  }
  void entries;
  return { names: loadSkillNames(root), issues };
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function auditRuntimeScripts(appRoot, hermesHome) {
  const issues = [];
  const scripts = ["homeai-disaster-backup-cron.sh"];
  for (const name of scripts) {
    const source = path.join(appRoot, "scripts", name);
    const installed = path.join(hermesHome, "scripts", name);
    let sourceStat = null;
    let installedStat = null;
    try {
      sourceStat = fs.statSync(source);
    } catch (err) {
      issues.push({ code: "cron_runtime_script_source_unreadable", script: name, detail: err && err.code ? err.code : "read_failed" });
      continue;
    }
    try {
      installedStat = fs.statSync(installed);
    } catch (err) {
      issues.push({ code: "cron_runtime_script_installed_unreadable", script: name, detail: err && err.code ? err.code : "read_failed" });
      continue;
    }
    if (!sourceStat.isFile() || !installedStat.isFile()) {
      issues.push({ code: "cron_runtime_script_not_file", script: name });
      continue;
    }
    if ((installedStat.mode & 0o111) === 0) {
      issues.push({ code: "cron_runtime_script_not_executable", script: name });
    }
    try {
      if (sha256(source) !== sha256(installed)) {
        issues.push({ code: "cron_runtime_script_drift", script: name });
      }
    } catch (err) {
      issues.push({ code: "cron_runtime_script_hash_failed", script: name, detail: err && err.code ? err.code : "hash_failed" });
    }
  }
  return issues;
}

function isAgentJob(job) {
  if (!job || job.enabled === false) return false;
  if (job.no_agent === true || clean(job.script)) return false;
  return true;
}

function jobIssues(job, skillNames) {
  const issues = [];
  if (isAgentJob(job) && !clean(job.profile)) issues.push("missing_profile");
  const deliver = clean(job.deliver || "local");
  const deliverParts = deliver.split(",").map((item) => item.trim()).filter(Boolean);
  if (deliverParts.includes("origin") && !clean(job.origin)) issues.push("origin_delivery_without_target");
  for (const skill of list(job.skills || job.skill)) {
    if (!skillNames.has(skill) && !skillNames.has(`productivity/${skill}`)) issues.push(`missing_skill:${skill}`);
  }
  const lastError = clean(job.last_error || job.lastError);
  if (/No inference provider configured/i.test(lastError)) issues.push("last_error_no_inference_provider");
  return issues;
}

function parseTime(value) {
  const text = clean(value);
  if (!text) return 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

function latestJobStatusTime(job) {
  return Math.max(
    parseTime(job?.last_finished_at || job?.lastFinishedAt),
    parseTime(job?.last_run_at || job?.lastRunAt),
    parseTime(job?.last_started_at || job?.lastStartedAt),
  );
}

function statusIssue(job) {
  if (!job || job.enabled === false) return "";
  const status = clean(job.last_status || job.lastStatus).toLowerCase();
  if (["error", "failed", "failure"].includes(status)) return `last_status_${status}`;
  return "";
}

function buildAudit(options = {}) {
  const root = path.resolve(options.root || process.env.HERMES_MOBILE_ROOT || "/Users/example/path");
  const appRoot = path.resolve(options.appRoot || path.join(root, "app"));
  const hermesHome = path.resolve(options.hermesHome || path.join(root, "data", "hermes-home"));
  const jobsPath = path.resolve(options.jobsPath || path.join(hermesHome, "cron", "jobs.json"));
  const skillRoot = path.resolve(options.skillRoot || path.join(hermesHome, "skills"));
  const strictConfig = Boolean(options.strictConfig);
  const strictSource = Boolean(options.strictSource || strictConfig);
  const strictStatus = Boolean(options.strictStatus);
  const statusSinceMs = parseTime(options.statusSince);
  const jobsRead = readJsonWithIssue(jobsPath, "cron_jobs_store_unreadable");
  const jobs = Array.isArray(jobsRead.value?.jobs) ? jobsRead.value.jobs : [];
  const skillAudit = loadSkillAudit(skillRoot);
  const skillNames = skillAudit.names;
  const rows = jobs.filter((job) => job && typeof job === "object").map((job) => ({
    id: clean(job.id),
    name: clean(job.name),
    enabled: job.enabled !== false,
    profile: clean(job.profile),
    deliver: clean(job.deliver || "local"),
    noAgent: Boolean(job.no_agent || job.script),
    skills: list(job.skills || job.skill),
    lastStatus: clean(job.last_status || job.lastStatus),
    issues: jobIssues(job, skillNames),
  }));
  const sourceIssues = [jobsRead.issue, ...skillAudit.issues, ...auditRuntimeScripts(appRoot, hermesHome)].filter(Boolean);
  const configIssuePrefixes = ["missing_profile", "origin_delivery_without_target", "missing_skill:"];
  const configIssues = rows.flatMap((row) => row.issues
    .filter((issue) => configIssuePrefixes.some((prefix) => issue.startsWith(prefix)))
    .map((issue) => `${row.id}:${issue}`));
  const statusIssues = jobs.filter((job) => job && typeof job === "object")
    .map((job) => ({ id: clean(job.id), issue: statusIssue(job), statusTime: latestJobStatusTime(job) }))
    .filter((row) => !statusSinceMs || row.statusTime >= statusSinceMs)
    .filter((row) => row.issue && row.id)
    .map((row) => `${row.id}:${row.issue}`);
  return {
    ok: (!strictSource || sourceIssues.length === 0)
      && (!strictConfig || configIssues.length === 0)
      && (!strictStatus || statusIssues.length === 0),
    jobCount: rows.length,
    skillCount: skillNames.size,
    sourceIssueCount: sourceIssues.length,
    sourceIssues,
    configIssueCount: configIssues.length,
    configIssues,
    statusIssueCount: statusIssues.length,
    statusIssues,
    statusSince: statusSinceMs ? new Date(statusSinceMs).toISOString() : "",
    rows,
  };
}

function main() {
  const root = path.resolve(argValue("--root", process.env.HERMES_MOBILE_ROOT || "/Users/example/path"));
  const hermesHome = path.resolve(argValue("--hermes-home", path.join(root, "data", "hermes-home")));
  const jobsPath = path.resolve(argValue("--jobs", path.join(hermesHome, "cron", "jobs.json")));
  const skillRoot = path.resolve(argValue("--skills-root", path.join(hermesHome, "skills")));
  const appRoot = path.resolve(argValue("--app", path.join(root, "app")));
  const payload = buildAudit({
    root,
    appRoot,
    hermesHome,
    jobsPath,
    skillRoot,
    strictConfig: hasFlag("--strict-config"),
    strictSource: hasFlag("--strict-source"),
    strictStatus: hasFlag("--strict-status"),
    statusSince: argValue("--status-since", ""),
  });
  const json = hasFlag("--json");
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`automation cron audit: jobs=${payload.jobCount} skills=${payload.skillCount} sourceIssues=${payload.sourceIssueCount} configIssues=${payload.configIssueCount} statusIssues=${payload.statusIssueCount}`);
    for (const issue of payload.sourceIssues) console.log(`${issue.code}:${issue.detail}`);
    for (const issue of payload.configIssues) console.log(issue);
    for (const issue of payload.statusIssues) console.log(issue);
  }
  if (!payload.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  buildAudit,
  jobIssues,
  loadSkillNames,
  loadSkillAudit,
  auditRuntimeScripts,
  statusIssue,
  parseTime,
  latestJobStatusTime,
};
