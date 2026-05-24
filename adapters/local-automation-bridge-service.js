"use strict";

function defaultCompactText(value, maxChars = 4000) {
  const text = String(value || "");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function defaultNormalizeSkills(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

function createLocalAutomationBridgeService(options = {}) {
  const storePath = String(options.storePath || "");
  const readJsonStore = typeof options.readJsonStore === "function" ? options.readJsonStore : (() => ({}));
  const writeJsonStore = typeof options.writeJsonStore === "function" ? options.writeJsonStore : (() => {});
  const sqliteStore = typeof options.sqliteStore === "function" ? options.sqliteStore : (() => null);
  const useSqliteServiceStore = typeof options.useSqliteServiceStore === "function"
    ? options.useSqliteServiceStore
    : (() => false);
  const compactText = typeof options.compactText === "function" ? options.compactText : defaultCompactText;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const createId = typeof options.createId === "function" ? options.createId : (() => `auto_${Date.now().toString(36)}`);
  const sortJobs = typeof options.sortJobs === "function" ? options.sortJobs : undefined;

  function localAutomationStore() {
    const raw = readJsonStore(storePath, {});
    return {
      schemaVersion: 1,
      jobs: Array.isArray(raw?.jobs) ? raw.jobs.filter((item) => item && typeof item === "object") : [],
      updatedAt: String(raw?.updatedAt || ""),
    };
  }

  function saveLocalAutomationStore(store) {
    writeJsonStore(storePath, Object.assign({}, store, {
      schemaVersion: 1,
      updatedAt: nowIso(),
    }));
  }

  function normalizeSkills(value) {
    return defaultNormalizeSkills(value);
  }

  function scheduleText(job) {
    return String(job?.scheduleText || job?.schedule || "").trim() || "manual";
  }

  function status(job) {
    if (!job?.enabled) return "paused";
    if (job.lastError) return "error";
    return job.status || "scheduled";
  }

  function publicJob(job, detail = "full") {
    const schedule = scheduleText(job || {});
    const payload = {
      id: String(job?.id || ""),
      name: compactText(job?.name || job?.id || "Automation", 120),
      promptPreview: compactText(job?.prompt || "", 220),
      schedule,
      scheduleText: schedule,
      scheduleKind: String(job?.scheduleKind || "local"),
      repeat: String(job?.repeat || "forever"),
      enabled: job?.enabled !== false,
      state: String(job?.state || (job?.enabled === false ? "paused" : "scheduled")),
      status: status(job || {}),
      nextRunAt: String(job?.nextRunAt || ""),
      lastRunAt: String(job?.lastRunAt || ""),
      lastStatus: String(job?.lastStatus || ""),
      lastError: compactText(job?.lastError || "", 400),
      lastDeliveryError: compactText(job?.lastDeliveryError || "", 400),
      deliver: compactText(job?.deliver || "local", 160),
      ownerPrincipalId: compactText(job?.ownerPrincipalId || "owner", 120),
    };
    if (String(detail || "").toLowerCase() === "summary") {
      payload.detailLevel = "summary";
      return payload;
    }
    Object.assign(payload, {
      prompt: compactText(job?.prompt || "", 4000),
      skills: normalizeSkills(job?.skills),
      model: compactText(job?.model || "", 80),
      provider: compactText(job?.provider || "", 80),
      workdir: compactText(job?.workdir || "", 600),
      hasScript: false,
      hasWorkdir: Boolean(job?.workdir),
      hasContextFrom: false,
      outputDocuments: Array.isArray(job?.outputDocuments) ? job.outputDocuments : [],
      detailLevel: "full",
    });
    return payload;
  }

  function draftJob(payload = {}, pathKind = "local") {
    const draft = payload.job && typeof payload.job === "object" ? payload.job : {};
    const ownerPrincipalId = String(payload.owner_principal_id || "owner").trim() || "owner";
    const schedule = String(draft.schedule || draft.scheduleText || draft.schedule_text || "").trim() || "manual";
    return {
      id: createId(),
      name: compactText(draft.name || draft.title || payload.text || "Automation", 120),
      prompt: String(draft.prompt || payload.text || "").trim(),
      schedule,
      scheduleText: schedule,
      scheduleKind: pathKind,
      repeat: String(draft.repeat || "forever"),
      enabled: true,
      state: "scheduled",
      status: "scheduled",
      nextRunAt: "",
      lastRunAt: "",
      lastStatus: "",
      lastError: "",
      lastDeliveryError: "",
      deliver: String(draft.deliver || "local"),
      ownerPrincipalId,
      workdir: String(draft.workdir || ""),
      skills: normalizeSkills(draft.skills),
      model: String(draft.model || ""),
      provider: String(draft.provider || ""),
      outputDocuments: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  function updateJobFields(job, patch = {}) {
    for (const [field, value] of Object.entries({
      name: patch.name,
      prompt: patch.prompt,
      schedule: patch.schedule,
      scheduleText: patch.schedule,
      deliver: patch.deliver,
      model: patch.model,
      provider: patch.provider,
      workdir: patch.workdir,
    })) {
      if (value !== undefined) job[field] = String(value || "");
    }
    if (patch.skills !== undefined) job.skills = normalizeSkills(patch.skills);
    job.updatedAt = nowIso();
  }

  function source(name, pathKind, extra = {}) {
    return Object.assign({
      name,
      available: true,
      pathKind,
    }, extra);
  }

  async function runSqliteCronBridge(payload = {}) {
    const action = String(payload.action || "").trim().toLowerCase();
    const store = sqliteStore();
    if (!store) return { ok: false, error: "SQLite automation store is not available" };

    if (action === "list") {
      const includeDisabled = Boolean(payload.include_disabled);
      const detail = String(payload.detail || payload.fields || "").toLowerCase() === "summary" ? "summary" : "full";
      let jobs = store.listAutomationJobs({
        ownerPrincipalId: payload.owner_principal_id || "owner",
        includeDisabled,
      }).map((job) => publicJob(job, detail));
      if (sortJobs) jobs = jobs.sort(sortJobs);
      return {
        ok: true,
        jobs,
        source: source("sqlite_automations", "sqlite", { jobCount: jobs.length }),
      };
    }

    if (action === "create") {
      const job = Object.assign(draftJob(payload, "sqlite"), { source: "sqlite" });
      if (!payload.dry_run) store.importAutomationJob(job);
      return {
        ok: true,
        job: publicJob(job),
        source: source("sqlite_automations", "sqlite"),
      };
    }

    const jobId = String(payload.job_id || "").trim();
    const job = store.getAutomationJob(jobId);
    if (["delete", "pause", "resume", "run", "update"].includes(action) && !job) {
      return { ok: false, error: "Automation job not found" };
    }
    if (job && String(job.ownerPrincipalId || "owner") !== String(payload.owner_principal_id || "owner")) {
      return { ok: false, error: "Automation job is not owned by this workspace" };
    }

    if (action === "delete") {
      if (!payload.dry_run) store.deleteAutomationJob(jobId);
      return {
        ok: true,
        deletedJob: publicJob(job),
        source: source("sqlite_automations", "sqlite"),
      };
    }
    if (action === "pause" || action === "resume") {
      job.enabled = action === "resume";
      job.state = job.enabled ? "scheduled" : "paused";
      job.status = job.state;
      job.updatedAt = nowIso();
      if (!payload.dry_run) store.importAutomationJob(job);
      return {
        ok: true,
        job: publicJob(job),
        source: source("sqlite_automations", "sqlite"),
      };
    }
    if (action === "run") {
      job.enabled = true;
      job.state = "scheduled";
      job.status = "scheduled";
      job.nextRunAt = nowIso();
      job.manualRunRequestedAt = nowIso();
      job.updatedAt = nowIso();
      if (!payload.dry_run) store.importAutomationJob(job);
      return {
        ok: true,
        job: publicJob(job),
        source: source("sqlite_automations", "sqlite", { action: "run", runMode: "next_tick" }),
      };
    }
    if (action === "update") {
      updateJobFields(job, payload.patch && typeof payload.patch === "object" ? payload.patch : {});
      if (!payload.dry_run) store.importAutomationJob(job);
      return {
        ok: true,
        job: publicJob(job),
        source: source("sqlite_automations", "sqlite"),
      };
    }

    return { ok: false, error: `unknown action: ${action}` };
  }

  async function runLocalCronBridge(payload = {}) {
    const action = String(payload.action || "").trim().toLowerCase();
    const store = localAutomationStore();

    if (action === "list") {
      const includeDisabled = Boolean(payload.include_disabled);
      const detail = String(payload.detail || payload.fields || "").toLowerCase() === "summary" ? "summary" : "full";
      let jobs = store.jobs.map((job) => publicJob(job, detail));
      if (!includeDisabled) jobs = jobs.filter((job) => job.enabled);
      return {
        ok: true,
        jobs,
        source: source("local_automations", "local", { jobCount: jobs.length }),
      };
    }

    if (action === "create") {
      const job = draftJob(payload, "local");
      if (!payload.dry_run) {
        store.jobs.push(job);
        saveLocalAutomationStore(store);
      }
      return {
        ok: true,
        job: publicJob(job),
        source: source("local_automations", "local"),
      };
    }

    const jobId = String(payload.job_id || "").trim();
    const index = store.jobs.findIndex((job) => String(job.id || "") === jobId);
    const job = index >= 0 ? store.jobs[index] : null;
    if (["delete", "pause", "resume", "run", "update"].includes(action) && !job) {
      return { ok: false, error: "Automation job not found" };
    }
    if (job && String(job.ownerPrincipalId || "owner") !== String(payload.owner_principal_id || "owner")) {
      return { ok: false, error: "Automation job is not owned by this workspace" };
    }

    if (action === "delete") {
      if (!payload.dry_run) {
        store.jobs.splice(index, 1);
        saveLocalAutomationStore(store);
      }
      return {
        ok: true,
        deletedJob: publicJob(job),
        source: source("local_automations", "local"),
      };
    }
    if (action === "pause" || action === "resume") {
      job.enabled = action === "resume";
      job.state = job.enabled ? "scheduled" : "paused";
      job.status = job.state;
      job.updatedAt = nowIso();
      if (!payload.dry_run) saveLocalAutomationStore(store);
      return {
        ok: true,
        job: publicJob(job),
        source: source("local_automations", "local"),
      };
    }
    if (action === "run") {
      job.enabled = true;
      job.state = "scheduled";
      job.status = "scheduled";
      job.nextRunAt = nowIso();
      job.manualRunRequestedAt = nowIso();
      job.updatedAt = nowIso();
      if (!payload.dry_run) saveLocalAutomationStore(store);
      return {
        ok: true,
        job: publicJob(job),
        source: source("local_automations", "local", { action: "run", runMode: "next_tick" }),
      };
    }
    if (action === "update") {
      updateJobFields(job, payload.patch && typeof payload.patch === "object" ? payload.patch : {});
      if (!payload.dry_run) saveLocalAutomationStore(store);
      return {
        ok: true,
        job: publicJob(job),
        source: source("local_automations", "local"),
      };
    }

    return { ok: false, error: `unknown action: ${action}` };
  }

  function runBridge(payload = {}) {
    if (useSqliteServiceStore()) return runSqliteCronBridge(payload);
    return runLocalCronBridge(payload);
  }

  return Object.freeze({
    localAutomationStore,
    normalizeSkills,
    publicJob,
    runBridge,
    runLocalCronBridge,
    runSqliteCronBridge,
    saveLocalAutomationStore,
  });
}

module.exports = {
  createLocalAutomationBridgeService,
};
