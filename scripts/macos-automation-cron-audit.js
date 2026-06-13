"use strict";

const fs = require("node:fs");
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

function main() {
  const root = path.resolve(argValue("--root", process.env.HERMES_MOBILE_ROOT || "/Users/hermes-host/HermesMobile"));
  const hermesHome = path.resolve(argValue("--hermes-home", path.join(root, "data", "hermes-home")));
  const jobsPath = path.resolve(argValue("--jobs", path.join(hermesHome, "cron", "jobs.json")));
  const skillRoot = path.resolve(argValue("--skills-root", path.join(hermesHome, "skills")));
  const strictConfig = hasFlag("--strict-config");
  const json = hasFlag("--json");
  const jobs = readJson(jobsPath, {}).jobs || [];
  const skillNames = loadSkillNames(skillRoot);
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
  const configIssuePrefixes = ["missing_profile", "origin_delivery_without_target", "missing_skill:"];
  const configIssues = rows.flatMap((row) => row.issues
    .filter((issue) => configIssuePrefixes.some((prefix) => issue.startsWith(prefix)))
    .map((issue) => `${row.id}:${issue}`));
  const payload = {
    ok: !strictConfig || configIssues.length === 0,
    jobCount: rows.length,
    skillCount: skillNames.size,
    configIssueCount: configIssues.length,
    configIssues,
    rows,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`automation cron audit: jobs=${payload.jobCount} skills=${payload.skillCount} configIssues=${payload.configIssueCount}`);
    for (const issue of configIssues) console.log(issue);
  }
  if (!payload.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  jobIssues,
  loadSkillNames,
};
