"use strict";

const path = require("node:path");

const DEFAULT_PROVIDER = "openai-codex";
const SAFE_PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function cleanString(value) {
  return String(value || "").trim();
}

function safeProfileId(value) {
  const text = cleanString(value);
  return SAFE_PROFILE_ID_PATTERN.test(text) ? text : "";
}

function normalizeList(value) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of raw) {
    const text = cleanString(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function lowerSet(value) {
  return new Set(normalizeList(value).map((item) => item.toLowerCase()));
}

function workerProfile(worker = {}) {
  return safeProfileId(worker.profile || worker.name || worker.id);
}

function workerProvider(worker = {}, defaultProvider = DEFAULT_PROVIDER) {
  return cleanString(worker.provider || worker.modelProvider || worker.model_provider || defaultProvider) || defaultProvider;
}

function workerWorkspaceIds(worker = {}) {
  return normalizeList(
    worker.allowedWorkspaceIds
    || worker.allowed_workspace_ids
    || worker.workspaceIds
    || worker.workspace_ids
    || worker.skillWorkspaceIds
    || worker.skill_workspace_ids,
  );
}

function workerToolsets(worker = {}) {
  return normalizeList(
    worker.toolsets
    || worker.enabledToolsets
    || worker.enabled_toolsets
    || worker.allowedToolsets
    || worker.allowed_toolsets
    || worker.toolsetIds
    || worker.toolset_ids,
  );
}

function workspaceMatches(worker = {}, workspaceId = "") {
  const expected = cleanString(workspaceId || "owner");
  const ids = workerWorkspaceIds(worker);
  if (!ids.length) return true;
  return ids.some((item) => item === "*" || item.toLowerCase() === "all" || item === expected);
}

function toolsetsMatch(worker = {}, requestedToolsets = []) {
  const requested = normalizeList(requestedToolsets);
  if (!requested.length) return true;
  const available = lowerSet(workerToolsets(worker));
  if (!available.size) return false;
  return requested.every((item) => available.has(String(item).toLowerCase()));
}

function normalizeManifestWorkers(manifest) {
  if (Array.isArray(manifest)) return manifest;
  if (manifest && Array.isArray(manifest.workers)) return manifest.workers;
  if (manifest && Array.isArray(manifest.profiles)) return manifest.profiles;
  return [];
}

function defaultManifestPaths(options = {}) {
  const value = typeof options.manifestPaths === "function" ? options.manifestPaths() : options.manifestPaths;
  return normalizeList(value);
}

function readJsonIfExists(fs, filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_err) {
    return null;
  }
}

function requestedToolsetsFromJob(job = {}) {
  return normalizeList(job.enabled_toolsets || job.enabledToolsets || job.toolsets);
}

function compareWorker(left, right) {
  const leftRunning = left.expectedRunning === true || left.running === true ? 0 : 1;
  const rightRunning = right.expectedRunning === true || right.running === true ? 0 : 1;
  if (leftRunning !== rightRunning) return leftRunning - rightRunning;
  return 0;
}

function findMatchingWorker(workers = [], options = {}) {
  const workspaceId = cleanString(options.workspaceId || options.workspace_id || "owner");
  const defaultProvider = cleanString(options.defaultProvider || DEFAULT_PROVIDER) || DEFAULT_PROVIDER;
  const provider = cleanString(options.provider || options.modelProvider || options.model_provider || defaultProvider) || defaultProvider;
  const requestedToolsets = normalizeList(options.enabledToolsets || options.enabled_toolsets || options.toolsets);
  return workers
    .filter((worker) => worker && typeof worker === "object")
    .filter((worker) => worker.enabled !== false)
    .filter((worker) => workerProfile(worker))
    .filter((worker) => cleanString(worker.securityLevel || worker.security_level || "user").toLowerCase() === "user")
    .filter((worker) => workerProvider(worker, defaultProvider) === provider)
    .filter((worker) => workspaceMatches(worker, workspaceId))
    .filter((worker) => toolsetsMatch(worker, requestedToolsets))
    .map((worker, index) => ({ worker, index }))
    .sort((left, right) => compareWorker(left.worker, right.worker) || left.index - right.index)[0]?.worker || null;
}

function createAutomationCronProfileService(options = {}) {
  const fs = options.fs || require("node:fs");
  const defaultProvider = cleanString(options.defaultProvider || DEFAULT_PROVIDER) || DEFAULT_PROVIDER;

  function loadWorkers() {
    for (const filePath of defaultManifestPaths(options)) {
      const manifest = readJsonIfExists(fs, path.resolve(filePath));
      const workers = normalizeManifestWorkers(manifest);
      if (workers.length) return workers;
    }
    return [];
  }

  function resolveProfile(args = {}) {
    const preferred = safeProfileId(args.preferredProfile || args.profile || args.job?.profile);
    if (preferred) return preferred;
    const job = args.job && typeof args.job === "object" ? args.job : {};
    const worker = findMatchingWorker(loadWorkers(), {
      workspaceId: args.workspaceId || args.workspace_id,
      provider: args.provider || job.provider,
      defaultProvider,
      enabledToolsets: args.enabledToolsets || args.enabled_toolsets || requestedToolsetsFromJob(job),
    });
    return workerProfile(worker || {});
  }

  return {
    resolveProfile,
    loadWorkers,
  };
}

module.exports = {
  DEFAULT_PROVIDER,
  SAFE_PROFILE_ID_PATTERN,
  createAutomationCronProfileService,
  findMatchingWorker,
  normalizeList,
  safeProfileId,
  workerProfile,
  workerToolsets,
  workerWorkspaceIds,
};
