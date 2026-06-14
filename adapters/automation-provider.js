"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  automationBackendStatus,
  isCanonicalAutomationBackend,
  isLocalAutomationBackend,
} = require("./mobile-runtime-backend-policy-service");

const CRON_MEDIA_LINE_PATTERN = /^\s*(?:[-*]\s*)?(?:.*?[:：]\s*)?MEDIA:\s*(.+?)\s*$/gim;
const CRON_MEDIA_PATH_PATTERN = /(\\\\wsl(?:\.localhost|\$)\\[^\r\n]+?\.(?:pdf|docx|doc|md)|[a-z]:\\[^\r\n]+?\.(?:pdf|docx|doc|md)|\/(?:mnt\/[a-z]|home\/[^/]+)\/[^\r\n]+?\.(?:pdf|docx|doc|md))(?=$|[\s)>"'，,。；;])/gi;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function dedupe(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function queryValue(query, name) {
  if (query && typeof query.get === "function") return query.get(name);
  return query?.[name];
}

function createAutomationProvider(options = {}) {
  const runBridge = options.runBridge;
  if (typeof runBridge !== "function") throw new TypeError("runBridge is required");

  const cacheTtlMs = Number(options.cacheTtlMs ?? 12000);
  const listCache = new Map();
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : (value) => String(value || "");
  const mimeFor = typeof options.mimeFor === "function" ? options.mimeFor : () => "application/octet-stream";
  const isPathAllowed = typeof options.isPathAllowed === "function" ? options.isPathAllowed : () => false;
  const isPathProtected = typeof options.isPathProtected === "function" ? options.isPathProtected : () => false;
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => ({});
  const authCanAccessWorkspace = typeof options.authCanAccessWorkspace === "function"
    ? options.authCanAccessWorkspace
    : () => true;
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner");
  const jobMatchesOwner = typeof options.jobMatchesOwner === "function"
    ? options.jobMatchesOwner
    : (job, ownerPrincipalId) => String(job?.ownerPrincipalId || "owner") === String(ownerPrincipalId || "owner");
  const actionInboxService = options.actionInboxService || null;
  const automationBackend = String(options.automationBackend || "hermes_cron").trim().toLowerCase();
  const allowLocalAutomationWrites = options.allowLocalAutomationWrites !== undefined
    ? Boolean(options.allowLocalAutomationWrites)
    : isLocalAutomationBackend(automationBackend);

  function clearListCache() {
    listCache.clear();
  }

  function blockedMutationResult(action) {
    const backendStatus = automationBackendStatus(automationBackend);
    if (!backendStatus.ok) {
      return {
        ok: false,
        status: backendStatus.status || 503,
        error: backendStatus.error,
        code: "automation_backend_unsupported",
        source: { name: backendStatus.backend || automationBackend, available: false, action },
      };
    }
    if (isLocalAutomationBackend(automationBackend) && !allowLocalAutomationWrites) {
      return {
        ok: false,
        status: 503,
        error: "Local Automation writes are disabled. Set HERMES_WEB_AUTOMATION_BACKEND=local only for explicit test/import mode.",
        code: "automation_local_write_disabled",
        source: { name: automationBackend, available: false, action },
      };
    }
    if (!isCanonicalAutomationBackend(automationBackend) && !isLocalAutomationBackend(automationBackend)) {
      return {
        ok: false,
        status: 503,
        error: `Unsupported Automation backend "${automationBackend}".`,
        code: "automation_backend_unsupported",
        source: { name: automationBackend, available: false, action },
      };
    }
    return null;
  }

  async function runMutationBridge(payload) {
    try {
      return await runBridge(payload);
    } catch (err) {
      err.status = err.status || 503;
      throw err;
    }
  }

  async function listJobs(args = {}) {
    const includeDisabled = Boolean(args.includeDisabled);
    const bypassCache = Boolean(args.bypassCache) || cacheTtlMs <= 0;
    const ownerPrincipalId = String(args.ownerPrincipalId || args.owner_principal_id || "").trim();
    const detail = String(args.detail || args.fields || "full").toLowerCase() === "summary" ? "summary" : "full";
    const cacheKey = `${includeDisabled ? "includeDisabled" : "enabledOnly"}:${ownerPrincipalId || "*"}:${detail}`;
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
      detail,
      include_disabled: includeDisabled,
      limit: positiveNumber(args.limit, 0),
      owner_principal_id: ownerPrincipalId,
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
    const blocked = blockedMutationResult("create");
    if (blocked) return blocked;
    return runMutationBridge({
      action: "create",
      dry_run: Boolean(args.dryRun),
      text: args.text || "",
      job: args.job || null,
      owner_principal_id: args.ownerPrincipalId || args.owner_principal_id || "owner",
      access_policy_context: args.accessPolicyContext || args.access_policy_context || {},
    });
  }

  function mutateJob(args = {}) {
    const action = args.action || "";
    const blocked = blockedMutationResult(action);
    if (blocked) return blocked;
    return runMutationBridge({
      action,
      job_id: args.jobId || args.job_id || "",
      owner_principal_id: args.ownerPrincipalId || args.owner_principal_id || "owner",
      dry_run: Boolean(args.dryRun),
      patch: args.patch || {},
      reason: String(args.reason || ""),
    });
  }

  function deliverableRoots() {
    const extraRoots = typeof options.extraDeliverableRoots === "function"
      ? options.extraDeliverableRoots()
      : (options.extraDeliverableRoots || []);
    const roots = dedupe([
      options.cronOutputRoot,
      options.runLogRoot,
      ...(Array.isArray(extraRoots) ? extraRoots : [extraRoots]),
    ]);
    return roots
      .map(normalizeLocalPath)
      .filter(Boolean)
      .map((item) => {
        try {
          return fs.realpathSync.native(item);
        } catch (_) {
          return path.resolve(item);
        }
      });
  }

  function pathInsideResolvedRoots(filePath, roots) {
    let target;
    try {
      target = fs.realpathSync.native(filePath);
    } catch (_) {
      target = path.resolve(filePath);
    }
    const normTarget = target.toLowerCase();
    return (roots || []).some((root) => {
      const normRoot = String(root || "").toLowerCase();
      return normTarget === normRoot || normTarget.startsWith(`${normRoot}${path.sep}`);
    });
  }

  function isDeliverablePathAllowed(filePath) {
    if (isPathProtected(filePath)) return false;
    return isPathAllowed(filePath) || pathInsideResolvedRoots(filePath, deliverableRoots());
  }

  function resolveOutputFile(query) {
    const jobId = String(queryValue(query, "jobId") || "").trim();
    const fileName = String(queryValue(query, "file") || "").trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) return { status: 400, error: "Invalid automation job id" };
    if (!fileName || fileName !== path.basename(fileName) || /[\\/]/.test(fileName)) {
      return { status: 400, error: "Invalid automation output file" };
    }
    const displayRoot = `${String(options.cronOutputRoot || "").replace(/\/+$/, "")}/${jobId}`;
    const displayPath = `${displayRoot}/${fileName}`;
    const localRoot = normalizeLocalPath(displayRoot);
    const localPath = normalizeLocalPath(displayPath);
    if (isPathProtected(displayPath) || isPathProtected(localRoot) || isPathProtected(localPath)) {
      return { status: 403, error: "Automation output is blocked by the security boundary" };
    }
    if (!localRoot || !localPath || !fs.existsSync(localPath)) return { status: 404, error: "Automation output not found" };
    let rootReal;
    let targetReal;
    try {
      rootReal = fs.realpathSync.native(localRoot);
      targetReal = fs.realpathSync.native(localPath);
    } catch (_) {
      return { status: 404, error: "Automation output not found" };
    }
    const rootKey = rootReal.toLowerCase();
    const targetKey = targetReal.toLowerCase();
    if (!(targetKey === rootKey || targetKey.startsWith(`${rootKey}${path.sep}`))) {
      return { status: 403, error: "Automation output is outside the job output directory" };
    }
    const stat = fs.statSync(targetReal);
    if (!stat.isFile()) return { status: 400, error: "Automation output is not a file" };
    return {
      file: {
        localPath: targetReal,
        displayPath: `CRON output / ${jobId} / ${fileName}`,
        name: fileName,
        mime: mimeFor(targetReal),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  function deliverablePathValues(text) {
    const values = [];
    for (const match of String(text || "").matchAll(CRON_MEDIA_LINE_PATTERN)) {
      const payload = String(match[1] || "").trim();
      const matches = [...payload.matchAll(CRON_MEDIA_PATH_PATTERN)].map((item) => item[1]).filter(Boolean);
      values.push(...(matches.length ? matches : [payload]));
    }
    const seen = new Set();
    return values
      .map((item) => String(item || "").trim().replace(/^[`'"<]+|[\s`'">)，,。；;]+$/g, ""))
      .filter((item) => {
        if (!/\.(pdf|docx|doc|md)$/i.test(item)) return false;
        const localPath = normalizeLocalPath(item);
        if (!localPath || !path.isAbsolute(localPath) || !fs.existsSync(localPath)) return false;
        if (isPathProtected(item) || isPathProtected(localPath)) return false;
        let key = localPath.toLowerCase();
        try {
          key = fs.realpathSync.native(localPath).toLowerCase();
        } catch (_) {}
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aMarkdown = /\.md$/i.test(a) ? 0 : 1;
        const bMarkdown = /\.md$/i.test(b) ? 0 : 1;
        return aMarkdown - bMarkdown;
      });
  }

  function resolveDeliverableFile(query) {
    const jobId = String(queryValue(query, "jobId") || "").trim();
    const runName = String(queryValue(query, "run") || "").trim();
    const indexText = String(queryValue(query, "index") || "0").trim();
    const index = Number(indexText || "0");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) return { status: 400, error: "Invalid automation job id" };
    if (!runName || runName !== path.basename(runName) || /[\\/]/.test(runName) || path.extname(runName).toLowerCase() !== ".md") {
      return { status: 400, error: "Invalid automation run output" };
    }
    if (!Number.isInteger(index) || index < 0 || index > 999) return { status: 400, error: "Invalid automation deliverable index" };
    const runOutput = resolveOutputFile({ jobId, file: runName });
    if (!runOutput.file) return runOutput;
    let values;
    try {
      values = deliverablePathValues(fs.readFileSync(runOutput.file.localPath, "utf8"));
    } catch (_) {
      return { status: 404, error: "Automation deliverable not found" };
    }
    const rawPath = values[index];
    if (!rawPath) return { status: 404, error: "Automation deliverable not found" };
    const localPath = normalizeLocalPath(rawPath);
    if (!localPath || !path.isAbsolute(localPath) || !fs.existsSync(localPath)) {
      return { status: 404, error: "Automation deliverable not found" };
    }
    let targetReal;
    try {
      targetReal = fs.realpathSync.native(localPath);
    } catch (_) {
      return { status: 404, error: "Automation deliverable not found" };
    }
    const ext = path.extname(targetReal).toLowerCase();
    if (![".pdf", ".docx", ".doc", ".md"].includes(ext)) return { status: 415, error: "Unsupported automation deliverable type" };
    if (!isDeliverablePathAllowed(targetReal)) return { status: 403, error: "Automation deliverable is outside allowed roots" };
    const stat = fs.statSync(targetReal);
    if (!stat.isFile()) return { status: 400, error: "Automation deliverable is not a file" };
    return {
      file: {
        localPath: targetReal,
        displayPath: `CRON delivery / ${jobId} / ${path.basename(targetReal)}`,
        name: path.basename(targetReal),
        mime: mimeFor(targetReal),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  function sourceRefUrlMatches(sourceRef = {}, args = {}) {
    const kind = String(args.kind || "output");
    const jobId = String(args.jobId || "").trim();
    if (!jobId) return false;
    const candidates = [
      sourceRef.reportUrl,
      sourceRef.report_url,
      sourceRef.latestDeliverable?.url,
      sourceRef.latest_deliverable?.url,
      sourceRef.latestDeliverableUrl,
      sourceRef.latest_deliverable_url,
    ].map((item) => String(item || "").trim()).filter(Boolean);
    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate, "http://localhost");
        if (kind === "deliverable" && parsed.pathname !== "/api/automations/deliverable") continue;
        if (kind === "output" && parsed.pathname !== "/api/automations/output") continue;
        if (String(parsed.searchParams.get("jobId") || "") !== jobId) continue;
        if (kind === "deliverable") {
          if (String(parsed.searchParams.get("run") || "") !== String(args.run || "")) continue;
          if (String(parsed.searchParams.get("index") || "0") !== String(args.index || "0")) continue;
        } else if (String(parsed.searchParams.get("file") || "") !== String(args.file || "")) {
          continue;
        }
        return true;
      } catch (_) {}
    }
    return false;
  }

  function actionInboxAllowsArchivedAutomationFile(query, args = {}) {
    if (!actionInboxService || typeof actionInboxService.listItems !== "function") return false;
    const workspaceId = String(queryValue(query, "workspaceId") || "owner");
    const jobId = String(queryValue(query, "jobId") || "").trim();
    if (!jobId) return false;
    let result;
    try {
      result = actionInboxService.listItems({
        workspaceId,
        sourceType: "automation",
        includeDone: true,
        limit: 500,
      });
    } catch (_) {
      return false;
    }
    const items = Array.isArray(result?.items) ? result.items : [];
    return items.some((item) => {
      const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
      const refJobId = String(sourceRef.automationId || sourceRef.automation_id || sourceRef.jobId || sourceRef.job_id || "").trim();
      if (refJobId !== jobId) return false;
      return sourceRefUrlMatches(sourceRef, Object.assign({ jobId }, args));
    });
  }

  async function resolveAuthorizedFile(args = {}) {
    const query = args.query || {};
    const workspaceId = String(queryValue(query, "workspaceId") || "owner");
    if (!findWorkspace(workspaceId)) return { status: 400, error: "Unknown workspace" };
    if (args.auth && !authCanAccessWorkspace(args.auth, workspaceId)) {
      return { status: 403, error: "Workspace access is not allowed" };
    }

    const jobId = String(queryValue(query, "jobId") || "").trim();
    const ownerPrincipalId = workspacePrincipal(workspaceId);
    let result;
    try {
      result = await listJobs({ includeDisabled: true, bypassCache: true, limit: 0 });
    } catch (err) {
      return { status: 503, error: `Hermes CRON source unavailable: ${err.message || String(err)}` };
    }
    if (!result?.ok) return { status: 503, error: result?.error || "Hermes CRON bridge failed" };
    const allowed = (result.jobs || []).some((job) => String(job?.id || "") === jobId && jobMatchesOwner(job, ownerPrincipalId));
    const archivedAllowed = allowed ? false : actionInboxAllowsArchivedAutomationFile(query, args.kind === "deliverable"
      ? {
        kind: "deliverable",
        run: String(queryValue(query, "run") || ""),
        index: String(queryValue(query, "index") || "0"),
      }
      : {
        kind: "output",
        file: String(queryValue(query, "file") || ""),
      });
    if (!allowed && !archivedAllowed) return { status: 404, error: "Automation output not found" };
    const localResult = args.kind === "deliverable" ? resolveDeliverableFile(query) : resolveOutputFile(query);
    if (localResult.file || typeof runBridge !== "function") return localResult;
    try {
      const bridgePayload = args.kind === "deliverable"
        ? {
          action: "read_deliverable",
          job_id: jobId,
          owner_principal_id: ownerPrincipalId,
          run: String(queryValue(query, "run") || ""),
          index: String(queryValue(query, "index") || "0"),
        }
        : {
          action: "read_output",
          job_id: jobId,
          owner_principal_id: ownerPrincipalId,
          file: String(queryValue(query, "file") || ""),
        };
      const bridgeResult = await runBridge(bridgePayload);
      if (bridgeResult?.ok && bridgeResult.file?.contentBase64) {
        return {
          bridgeFile: bridgeResult.file,
          source: bridgeResult.source || null,
        };
      }
      if (bridgeResult?.error) {
        return { status: bridgeResult.status || localResult.status || 404, error: bridgeResult.error };
      }
    } catch (err) {
      return { status: 503, error: `Hermes CRON bridge failed: ${err.message || String(err)}` };
    }
    return localResult;
  }

  function resolveAuthorizedOutputFile(args = {}) {
    return resolveAuthorizedFile(Object.assign({}, args, { kind: "output" }));
  }

  function resolveAuthorizedDeliverableFile(args = {}) {
    return resolveAuthorizedFile(Object.assign({}, args, { kind: "deliverable" }));
  }

  return {
    clearListCache,
    createJob,
    deliverablePathValues,
    listJobs,
    mutateJob,
    resolveAuthorizedDeliverableFile,
    resolveAuthorizedOutputFile,
    resolveDeliverableFile,
    resolveOutputFile,
  };
}

module.exports = {
  createAutomationProvider,
};
