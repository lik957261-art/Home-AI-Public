"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const python = process.platform === "win32" ? "python" : "python3";

function runBridge(env, request = { action: "list", include_disabled: true, limit: 0 }, expectedStatus = 0) {
  const result = spawnSync(python, [path.join(repoRoot, "cron_bridge.py")], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, env),
    input: JSON.stringify(request),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function touch(filePath, date) {
  fs.utimesSync(filePath, date, date);
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-cron-bridge-"));
  const hermesHome = path.join(tempRoot, "home");
  const outputRoot = path.join(tempRoot, "output");
  const jobRoot = path.join(outputRoot, "job_1");
  fs.mkdirSync(path.join(hermesHome, "cron"), { recursive: true });
  fs.mkdirSync(jobRoot, { recursive: true });

  fs.writeFileSync(path.join(hermesHome, "cron", "jobs.json"), JSON.stringify({
    jobs: [{
      id: "job_1",
      name: "Scan limit job",
      enabled: true,
      owner_principal_id: "owner",
      schedule: { kind: "cron", expr: "0 8 * * *", display: "0 8 * * *" },
      repeat: { times: null, completed: 0 },
    }],
  }));

  for (let index = 0; index < 6; index += 1) {
    const date = new Date(Date.UTC(2026, 0, 1, 0, index, 0));
    const pdfPath = path.join(jobRoot, `report-${index}.pdf`);
    fs.writeFileSync(pdfPath, `%PDF-1.7\nreport ${index}\n%%EOF\n`);
    touch(pdfPath, date);
  }

  const baseEnv = {
    HERMES_HOME: hermesHome,
    HERMES_WEB_HERMES_HOME: hermesHome,
    HERMES_WEB_CRON_OUTPUT_ROOT: outputRoot,
  };
  const jobsPath = path.join(hermesHome, "cron", "jobs.json");

  const limited = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "2",
  }));
  assert.equal(limited.ok, true);
  assert.deepEqual(
    limited.jobs[0].outputDocuments.map((item) => item.name),
    ["report-5.pdf", "report-4.pdf"],
  );

  const summary = runBridge(baseEnv, { action: "list", include_disabled: true, detail: "summary", limit: 0 });
  assert.equal(summary.ok, true);
  assert.equal(summary.jobs[0].detailLevel, "summary");
  assert.equal(Object.hasOwn(summary.jobs[0], "prompt"), false);
  assert.equal(Object.hasOwn(summary.jobs[0], "outputDocuments"), false);

  const full = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  assert.equal(full.ok, true);
  assert.deepEqual(
    full.jobs[0].outputDocuments.map((item) => item.name),
    ["report-5.pdf", "report-4.pdf", "report-3.pdf", "report-2.pdf", "report-1.pdf", "report-0.pdf"],
  );

  const triggered = runBridge(baseEnv, { action: "run", job_id: "job_1", owner_principal_id: "owner" });
  assert.equal(triggered.ok, true);
  assert.equal(triggered.source.action, "run");
  assert.equal(triggered.source.runMode, "next_tick");
  assert.equal(triggered.job.id, "job_1");
  assert.equal(triggered.job.enabled, true);
  const triggeredDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  const triggeredJob = triggeredDoc.jobs.find((job) => job.id === "job_1");
  assert.ok(triggeredJob.next_run_at);
  assert.ok(new Date(triggeredJob.next_run_at).getTime() <= Date.now());

  const deniedRun = runBridge(baseEnv, { action: "run", job_id: "job_1", owner_principal_id: "other" }, 2);
  assert.equal(deniedRun.ok, false);

  const createWithProfile = runBridge(baseEnv, {
    action: "create",
    dry_run: true,
    job: {
      name: "Profile-backed email job",
      prompt: "Analyze email through MCP",
      schedule: "0 11 * * *",
      profile: "hm-owner-openai-1",
      enabled_toolsets: ["email", "file", "skills"],
    },
    owner_principal_id: "owner",
  });
  assert.equal(createWithProfile.ok, true);
  assert.equal(createWithProfile.job.profile, "hm-owner-openai-1");
  assert.deepEqual(createWithProfile.job.enabledToolsets, ["email", "file", "skills"]);

  const workdir = path.join(hermesHome, "automation-workspaces", "email-job");
  const createWithWorkdir = runBridge(baseEnv, {
    action: "create",
    dry_run: false,
    job: {
      name: "Profile-backed email job with workdir",
      prompt: "Analyze email through MCP",
      schedule: "0 11 * * *",
      profile: "hm-owner-openai-1",
      enabled_toolsets: ["email", "file", "skills"],
      workdir,
    },
    owner_principal_id: "owner",
  });
  assert.equal(createWithWorkdir.ok, true);
  assert.equal(createWithWorkdir.job.workdir, "[path]");
  const persistedWorkdirDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  const persistedWorkdirJob = persistedWorkdirDoc.jobs.find((job) => job.name === "Profile-backed email job with workdir");
  assert.equal(persistedWorkdirJob.workdir, workdir);
  assert.equal(fs.statSync(workdir).isDirectory(), true);

  const invalidWorkdir = runBridge(baseEnv, {
    action: "create",
    dry_run: true,
    job: {
      name: "Invalid workdir job",
      prompt: "Invalid workdir should fail",
      schedule: "0 11 * * *",
      workdir: path.join(tempRoot, "outside-workdir"),
    },
  }, 1);
  assert.equal(invalidWorkdir.ok, false);
  assert.match(invalidWorkdir.error, /workdir is outside/);

  const invalidProfile = runBridge(baseEnv, {
    action: "create",
    dry_run: true,
    job: {
      name: "Invalid profile job",
      prompt: "Invalid profile should fail",
      schedule: "0 11 * * *",
      profile: "../bad-profile",
    },
  }, 1);
  assert.equal(invalidProfile.ok, false);
  assert.match(invalidProfile.error, /profile is invalid/);

  const profileUpdate = runBridge(baseEnv, {
    action: "update",
    job_id: "job_1",
    owner_principal_id: "owner",
    patch: { profile: "hm-owner-openai-1" },
  });
  assert.equal(profileUpdate.ok, true);
  assert.equal(profileUpdate.job.profile, "hm-owner-openai-1");
  const profileDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  assert.equal(profileDoc.jobs.find((job) => job.id === "job_1").profile, "hm-owner-openai-1");

  const profileClear = runBridge(baseEnv, {
    action: "update",
    job_id: "job_1",
    owner_principal_id: "owner",
    patch: { profile: "" },
  });
  assert.equal(profileClear.ok, true);
  assert.equal(profileClear.job.profile, "");
  const profileClearDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  assert.equal(Object.hasOwn(profileClearDoc.jobs.find((job) => job.id === "job_1"), "profile"), false);

  const dataContextUpdate = runBridge(baseEnv, {
    action: "update",
    job_id: "job_1",
    owner_principal_id: "owner",
    patch: { data_context: { type: "discussion_activity_daily", date: "previous_day", maxThreads: 12 } },
  });
  assert.equal(dataContextUpdate.ok, true);
  assert.deepEqual(dataContextUpdate.job.dataContext, { type: "discussion_activity_daily" });
  assert.equal(dataContextUpdate.job.hasDataContext, true);
  const dataContextDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  assert.equal(dataContextDoc.jobs.find((job) => job.id === "job_1").data_context.type, "discussion_activity_daily");

  const mdJobRoot = path.join(outputRoot, "job_md");
  const mdDelivery = path.join(tempRoot, "delivery.md");
  const pdfDelivery = path.join(tempRoot, "delivery.pdf");
  fs.mkdirSync(mdJobRoot, { recursive: true });
  fs.writeFileSync(mdDelivery, "# Delivery\n");
  fs.writeFileSync(pdfDelivery, "%PDF-1.7\n%%EOF\n");
  fs.writeFileSync(path.join(mdJobRoot, "run.md"), [
    `MEDIA: ${pdfDelivery}`,
    `MEDIA: ${mdDelivery}`,
  ].join("\n"));
  const jobsDoc = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  jobsDoc.jobs.push({
    id: "job_md",
    name: "Markdown delivery job",
    enabled: true,
    owner_principal_id: "owner",
    schedule: { kind: "cron", expr: "0 9 * * *", display: "0 9 * * *" },
    repeat: { times: null, completed: 0 },
  });
  fs.writeFileSync(jobsPath, JSON.stringify(jobsDoc));
  const markdownFirst = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  const mdJob = markdownFirst.jobs.find((job) => job.id === "job_md");
  assert.ok(mdJob);
  assert.deepEqual(
    mdJob.outputDocuments.map((item) => item.name),
    ["delivery.md", "delivery.pdf"],
  );
  assert.equal(mdJob.outputDocuments[0].source, "source-markdown");
  assert.match(mdJob.outputDocuments[0].url, /\/api\/automations\/deliverable\?/);

  const sourceJobRoot = path.join(outputRoot, "job_source");
  const sourceRoot = path.join(tempRoot, "source-docs");
  const sourceMarkdown = path.join(sourceRoot, "daily-report.md");
  const sourcePdf = path.join(tempRoot, "delivery", "daily-report.pdf");
  fs.mkdirSync(sourceJobRoot, { recursive: true });
  fs.mkdirSync(path.dirname(sourcePdf), { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(sourceMarkdown, "# Source report\n");
  fs.writeFileSync(sourcePdf, "%PDF-1.7\n%%EOF\n");
  fs.writeFileSync(path.join(sourceJobRoot, "run.md"), [
    "Markdown 源文件目录：" + sourceRoot,
    "## Response",
    `MEDIA:${sourcePdf}`,
  ].join("\n"));
  jobsDoc.jobs.push({
    id: "job_source",
    name: "Source Markdown inference job",
    enabled: true,
    owner_principal_id: "owner",
    schedule: { kind: "cron", expr: "0 10 * * *", display: "0 10 * * *" },
    repeat: { times: null, completed: 0 },
  });

  const silentJobRoot = path.join(outputRoot, "job_silent");
  fs.mkdirSync(silentJobRoot, { recursive: true });
  fs.writeFileSync(path.join(silentJobRoot, "run.md"), [
    "## Response",
    "[SILENT]",
  ].join("\n"));
  jobsDoc.jobs.push({
    id: "job_silent",
    name: "Silent run job",
    enabled: true,
    owner_principal_id: "owner",
    schedule: { kind: "cron", expr: "0 11 * * *", display: "0 11 * * *" },
    repeat: { times: null, completed: 0 },
  });
  fs.writeFileSync(jobsPath, JSON.stringify(jobsDoc));

  const sourceInference = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  const sourceJob = sourceInference.jobs.find((job) => job.id === "job_source");
  assert.ok(sourceJob);
  assert.deepEqual(
    sourceJob.outputDocuments.map((item) => item.name),
    ["daily-report.md", "daily-report.pdf"],
  );
  assert.equal(sourceJob.outputDocuments[0].source, "source-markdown");

  const workspaceJobRoot = path.join(outputRoot, "job_workspace_source");
  const workspaceRoot = path.join(tempRoot, "drive", "users", "owner", "Hermes");
  const workspaceSourceRoot = path.join(workspaceRoot, "qifan", "daily");
  const workspaceDeliveryRoot = path.join(workspaceRoot, "交付", "qifan-daily");
  const workspaceSourceMarkdown = path.join(workspaceSourceRoot, "2026-05-09_1104_qifan-daily.md");
  const workspacePdf = path.join(workspaceDeliveryRoot, "2026-05-09_1104_qifan-daily.pdf");
  fs.mkdirSync(workspaceJobRoot, { recursive: true });
  fs.mkdirSync(workspaceSourceRoot, { recursive: true });
  fs.mkdirSync(workspaceDeliveryRoot, { recursive: true });
  fs.writeFileSync(workspaceSourceMarkdown, "# Qifan daily\n");
  fs.writeFileSync(workspacePdf, "%PDF-1.7\n%%EOF\n");
  fs.writeFileSync(path.join(workspaceJobRoot, "run.md"), [
    "## Response",
    `MEDIA:${workspacePdf}`,
  ].join("\n"));
  jobsDoc.jobs.push({
    id: "job_workspace_source",
    name: "Workspace source Markdown job",
    enabled: true,
    owner_principal_id: "owner",
    schedule: { kind: "cron", expr: "0 10 * * *", display: "0 10 * * *" },
    repeat: { times: null, completed: 0 },
  });
  fs.writeFileSync(jobsPath, JSON.stringify(jobsDoc));
  const workspaceSourceInference = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  const workspaceSourceJob = workspaceSourceInference.jobs.find((job) => job.id === "job_workspace_source");
  assert.ok(workspaceSourceJob);
  assert.deepEqual(
    workspaceSourceJob.outputDocuments.map((item) => item.name),
    ["2026-05-09_1104_qifan-daily.pdf"],
  );

  const xJobRoot = path.join(outputRoot, "job_x");
  const xSourceRoot = path.join(tempRoot, "x", "Briefs");
  const xSourceMarkdown = path.join(xSourceRoot, "20260509_080054_12h_x-brief.md");
  const xPdf = path.join(tempRoot, "x", "delivery", "x-brief-2026-05-09-080054.pdf");
  fs.mkdirSync(xJobRoot, { recursive: true });
  fs.mkdirSync(path.dirname(xPdf), { recursive: true });
  fs.mkdirSync(xSourceRoot, { recursive: true });
  fs.writeFileSync(xSourceMarkdown, "# X brief\n");
  fs.writeFileSync(xPdf, "%PDF-1.7\n%%EOF\n");
  fs.writeFileSync(path.join(xJobRoot, "run.md"), [
    "X 项目 Markdown 源文件：" + xSourceRoot,
    "## Response",
    `MEDIA:${xPdf}`,
  ].join("\n"));
  jobsDoc.jobs.push({
    id: "job_x",
    name: "X brief source inference job",
    enabled: true,
    owner_principal_id: "owner",
    schedule: { kind: "cron", expr: "0 12 * * *", display: "0 12 * * *" },
    repeat: { times: null, completed: 0 },
  });
  fs.writeFileSync(jobsPath, JSON.stringify(jobsDoc));
  const xInference = runBridge(Object.assign({}, baseEnv, {
    HERMES_MOBILE_AUTOMATION_OUTPUT_SCAN_LIMIT: "0",
  }));
  const xJob = xInference.jobs.find((job) => job.id === "job_x");
  assert.ok(xJob);
  assert.deepEqual(
    xJob.outputDocuments.map((item) => item.name),
    ["20260509_080054_12h_x-brief.md", "x-brief-2026-05-09-080054.pdf"],
  );

  const silentJob = sourceInference.jobs.find((job) => job.id === "job_silent");
  assert.ok(silentJob);
  assert.deepEqual(silentJob.outputDocuments, []);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("cron-bridge tests passed");
}

main();
