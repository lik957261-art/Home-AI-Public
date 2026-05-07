"use strict";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createAutomationProvider(options = {}) {
  const runBridge = options.runBridge;
  if (typeof runBridge !== "function") throw new TypeError("runBridge is required");

  const cacheTtlMs = Number(options.cacheTtlMs ?? 12000);
  const listCache = new Map();

  function clearListCache() {
    listCache.clear();
  }

  async function listJobs(args = {}) {
    const includeDisabled = Boolean(args.includeDisabled);
    const bypassCache = Boolean(args.bypassCache) || cacheTtlMs <= 0;
    const cacheKey = includeDisabled ? "includeDisabled" : "enabledOnly";
    const now = Date.now();
    const cached = listCache.get(cacheKey);

    if (!bypassCache && cached?.result && now - cached.loadedAt < cacheTtlMs) {
      return Object.assign({}, cached.result, {
        source: Object.assign({}, cached.result.source || {}, { cache: "hit", cacheAgeMs: now - cached.loadedAt }),
      });
    }
    if (!bypassCache && cached?.promise) {
      const result = await cached.promise;
      return Object.assign({}, result, {
        source: Object.assign({}, result.source || {}, { cache: "shared" }),
      });
    }

    const promise = runBridge({
      action: "list",
      include_disabled: includeDisabled,
      limit: positiveNumber(args.limit, 0),
    }).then((result) => {
      listCache.set(cacheKey, { loadedAt: Date.now(), result });
      return result;
    }).catch((err) => {
      listCache.delete(cacheKey);
      throw err;
    });

    if (!bypassCache) listCache.set(cacheKey, { loadedAt: now, promise });
    const result = await promise;
    if (bypassCache) return result;
    return Object.assign({}, result, {
      source: Object.assign({}, result.source || {}, { cache: "miss" }),
    });
  }

  function createJob(args = {}) {
    return runBridge({
      action: "create",
      dry_run: Boolean(args.dryRun),
      text: args.text || "",
      job: args.job || null,
      owner_principal_id: args.ownerPrincipalId || args.owner_principal_id || "owner",
      access_policy_context: args.accessPolicyContext || args.access_policy_context || {},
    });
  }

  function mutateJob(args = {}) {
    return runBridge({
      action: args.action || "",
      job_id: args.jobId || args.job_id || "",
      owner_principal_id: args.ownerPrincipalId || args.owner_principal_id || "owner",
      dry_run: Boolean(args.dryRun),
      patch: args.patch || {},
      reason: String(args.reason || ""),
    });
  }

  return {
    clearListCache,
    createJob,
    listJobs,
    mutateJob,
  };
}

module.exports = {
  createAutomationProvider,
};
