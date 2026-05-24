"use strict";

const assert = require("node:assert/strict");
const { createLocalAutomationBridgeService } = require("../adapters/local-automation-bridge-service");

function makeJsonStore(initial = {}) {
  let data = JSON.parse(JSON.stringify(initial));
  const writes = [];
  return {
    readJsonStore(path, fallback) {
      assert.equal(path, "automations.json");
      return data || fallback;
    },
    writeJsonStore(path, value) {
      assert.equal(path, "automations.json");
      data = JSON.parse(JSON.stringify(value));
      writes.push(data);
    },
    writes,
    data: () => data,
  };
}

function makeSqliteStore(jobs = []) {
  const rows = jobs.map((job) => Object.assign({}, job));
  return {
    deleted: [],
    imported: [],
    getAutomationJob(jobId) {
      return rows.find((job) => String(job.id || "") === String(jobId || "")) || null;
    },
    importAutomationJob(job) {
      this.imported.push(Object.assign({}, job));
      const index = rows.findIndex((item) => String(item.id || "") === String(job.id || ""));
      if (index >= 0) rows[index] = Object.assign({}, job);
      else rows.push(Object.assign({}, job));
      return true;
    },
    deleteAutomationJob(jobId) {
      this.deleted.push(jobId);
      const index = rows.findIndex((job) => String(job.id || "") === String(jobId || ""));
      if (index >= 0) rows.splice(index, 1);
      return true;
    },
    listAutomationJobs(args = {}) {
      return rows
        .filter((job) => !args.ownerPrincipalId || String(job.ownerPrincipalId || "owner") === String(args.ownerPrincipalId))
        .filter((job) => args.includeDisabled || job.enabled !== false)
        .map((job) => Object.assign({}, job));
    },
    rows,
  };
}

function makeService(overrides = {}) {
  const json = makeJsonStore(overrides.initialJson || {});
  const sqlite = makeSqliteStore(overrides.initialSqlite || []);
  let sqliteMode = Boolean(overrides.sqliteMode);
  let id = 0;
  const service = createLocalAutomationBridgeService({
    storePath: "automations.json",
    readJsonStore: json.readJsonStore,
    writeJsonStore: json.writeJsonStore,
    sqliteStore: () => sqlite,
    useSqliteServiceStore: () => sqliteMode,
    compactText(value, maxChars) {
      return String(value || "").slice(0, maxChars || 1000);
    },
    nowIso: () => "2026-05-15T01:00:00.000Z",
    createId: () => `auto-test-${++id}`,
    sortJobs: (left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
  });
  return {
    json,
    service,
    setSqliteMode(value) {
      sqliteMode = Boolean(value);
    },
    sqlite,
  };
}

async function testLocalListCreateMutateAndDelete() {
  const { json, service } = makeService({
    initialJson: {
      jobs: [
        { id: "enabled", name: "Enabled", enabled: true, ownerPrincipalId: "owner-a", prompt: "keep" },
        { id: "paused", name: "Paused", enabled: false, ownerPrincipalId: "owner-a", prompt: "skip" },
      ],
    },
  });

  const listed = await service.runBridge({ action: "list", include_disabled: false });
  assert.deepEqual(listed.jobs.map((job) => job.id), ["enabled"]);
  assert.equal(listed.jobs[0].detailLevel, "full");
  assert.deepEqual(listed.source, { name: "local_automations", available: true, pathKind: "local", jobCount: 1 });

  const summary = await service.runBridge({ action: "list", include_disabled: true, detail: "summary" });
  assert.equal(summary.jobs[0].detailLevel, "summary");
  assert.equal(Object.hasOwn(summary.jobs[0], "prompt"), false);
  assert.equal(Object.hasOwn(summary.jobs[0], "outputDocuments"), false);

  const dryRun = await service.runBridge({
    action: "create",
    dry_run: true,
    text: "weekly summary",
    owner_principal_id: "owner-a",
    job: { name: "Weekly", schedule: "weekly", skills: "a,b", model: "gpt" },
  });
  assert.equal(dryRun.job.id, "auto-test-1");
  assert.deepEqual(dryRun.job.skills, ["a", "b"]);
  assert.equal(json.writes.length, 0);

  const created = await service.runBridge({
    action: "create",
    text: "daily digest",
    owner_principal_id: "owner-a",
    job: { title: "Daily", schedule_text: "daily" },
  });
  assert.equal(created.job.id, "auto-test-2");
  assert.equal(json.writes.length, 1);
  assert.equal(json.data().jobs.at(-1).id, "auto-test-2");

  const pause = await service.runBridge({ action: "pause", job_id: "enabled", owner_principal_id: "owner-a" });
  assert.equal(pause.job.enabled, false);
  assert.equal(pause.job.status, "paused");

  const update = await service.runBridge({
    action: "update",
    job_id: "enabled",
    owner_principal_id: "owner-a",
    patch: { name: "Updated", schedule: "monthly", skills: ["math"] },
  });
  assert.equal(update.job.name, "Updated");
  assert.equal(update.job.schedule, "monthly");
  assert.deepEqual(update.job.skills, ["math"]);

  const run = await service.runBridge({ action: "run", job_id: "enabled", owner_principal_id: "owner-a" });
  assert.equal(run.ok, true);
  assert.equal(run.job.status, "scheduled");
  assert.equal(run.source.action, "run");
  assert.equal(json.data().jobs.find((job) => job.id === "enabled").nextRunAt, "2026-05-15T01:00:00.000Z");

  const wrongOwner = await service.runBridge({ action: "delete", job_id: "enabled", owner_principal_id: "owner-b" });
  assert.deepEqual(wrongOwner, { ok: false, error: "Automation job is not owned by this workspace" });

  const deleted = await service.runBridge({ action: "delete", job_id: "enabled", owner_principal_id: "owner-a" });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.deletedJob.id, "enabled");
  assert.equal(json.data().jobs.some((job) => job.id === "enabled"), false);
}

async function testSqliteListCreateAndDryRun() {
  const { service, sqlite } = makeService({
    sqliteMode: true,
    initialSqlite: [
      { id: "old", name: "Old", enabled: true, ownerPrincipalId: "owner-a", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "new", name: "New", enabled: true, ownerPrincipalId: "owner-a", updatedAt: "2026-01-02T00:00:00Z" },
      { id: "other", name: "Other", enabled: true, ownerPrincipalId: "owner-b", updatedAt: "2026-01-03T00:00:00Z" },
    ],
  });

  const listed = await service.runBridge({ action: "list", include_disabled: true, owner_principal_id: "owner-a" });
  assert.deepEqual(listed.jobs.map((job) => job.id), ["old", "new"]);
  assert.deepEqual(listed.source, { name: "sqlite_automations", available: true, pathKind: "sqlite", jobCount: 2 });

  const dryRun = await service.runBridge({
    action: "create",
    dry_run: true,
    text: "sqlite dry",
    owner_principal_id: "owner-a",
    job: { name: "Dry" },
  });
  assert.equal(dryRun.job.id, "auto-test-1");
  assert.equal(sqlite.imported.length, 0);

  const created = await service.runBridge({
    action: "create",
    text: "sqlite create",
    owner_principal_id: "owner-a",
    job: { name: "Created" },
  });
  assert.equal(created.job.id, "auto-test-2");
  assert.equal(sqlite.imported.length, 1);

  const resume = await service.runBridge({ action: "resume", job_id: "old", owner_principal_id: "owner-a" });
  assert.equal(resume.job.status, "scheduled");
  assert.equal(sqlite.imported.at(-1).id, "old");

  const run = await service.runBridge({ action: "run", job_id: "old", owner_principal_id: "owner-a" });
  assert.equal(run.ok, true);
  assert.equal(run.source.runMode, "next_tick");
  assert.equal(sqlite.imported.at(-1).nextRunAt, "2026-05-15T01:00:00.000Z");

  const missing = await service.runBridge({ action: "pause", job_id: "missing", owner_principal_id: "owner-a" });
  assert.deepEqual(missing, { ok: false, error: "Automation job not found" });
}

async function testUnknownAction() {
  const { service } = makeService();
  assert.deepEqual(await service.runBridge({ action: "unknown" }), {
    ok: false,
    error: "unknown action: unknown",
  });
}

async function run() {
  await testLocalListCreateMutateAndDelete();
  await testSqliteListCreateAndDryRun();
  await testUnknownAction();
  console.log("local automation bridge service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
