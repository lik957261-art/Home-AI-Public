"use strict";

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  comparablePath,
  normalizePathForBoundary,
  pathInsideAnyRoot,
} = require("./path-boundary-service");

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function shouldSkipRealpath(value) {
  const text = String(value || "").trim();
  return /^\\\\/.test(text) || /^\/\//.test(text);
}

function realPathIfExists(value, cache = null) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (shouldSkipRealpath(text)) return text;
  if (cache?.has(text)) return cache.get(text);
  try {
    const real = fs.realpathSync.native(text);
    if (cache) cache.set(text, real);
    return real;
  } catch (_) {
    if (cache) cache.set(text, text);
    return text;
  }
}

function pathModuleForBoundary(value) {
  const text = String(value || "").trim();
  if (/^[a-zA-Z]:[\\/]/.test(text) || /^\\\\/.test(text)) return path.win32;
  if (/^\//.test(text)) return path.posix;
  return path;
}

function decision(allowed, reason, details = {}) {
  return Object.assign({ allowed: Boolean(allowed), reason }, details);
}

function auditSafeDecision(result = {}) {
  const out = Object.assign({}, result);
  const pathText = [out.localPath, out.originalPath].filter(Boolean).join("\n");
  delete out.localPath;
  delete out.originalPath;
  if (pathText) {
    out.pathFingerprint = crypto.createHash("sha256").update(pathText).digest("hex").slice(0, 16);
  }
  return out;
}

function createPathPolicyProvider(options = {}) {
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function" ? options.normalizeLocalPath : (value) => String(value || "");
  const isProtectedPath = typeof options.isProtectedPath === "function" ? options.isProtectedPath : () => false;
  const isGloballyAllowedPath = typeof options.isGloballyAllowedPath === "function" ? options.isGloballyAllowedPath : () => false;
  const uploadRootsForThread = typeof options.uploadRootsForThread === "function" ? options.uploadRootsForThread : () => [];
  const policyForThread = typeof options.policyForThread === "function" ? options.policyForThread : () => ({});
  const ownerRootsForThread = typeof options.ownerRootsForThread === "function" ? options.ownerRootsForThread : () => [];
  const directoryOwnerRootsForThread = typeof options.directoryOwnerRootsForThread === "function" ? options.directoryOwnerRootsForThread : ownerRootsForThread;
  const restrictedRootsForPolicy = typeof options.restrictedRootsForPolicy === "function"
    ? options.restrictedRootsForPolicy
    : (policy) => dedupe([
      ...(policy.allowed_roots || []),
      ...(policy.delivery_roots || []),
      ...(policy.cache_roots || []),
      policy.sync_root,
      policy.download_root,
    ]);
  const audit = typeof options.audit === "function" ? options.audit : () => {};
  const realpathCache = new Map();

  function cachedRealPath(value) {
    if (realpathCache.size > 1000) realpathCache.clear();
    return realPathIfExists(value, realpathCache);
  }

  function auditDeny(eventType, result) {
    if (result && !result.allowed) audit(eventType, Object.assign({}, auditSafeDecision(result), { decision: "deny" }));
  }

  function protectedDecision(localPath, originalPath = "") {
    const candidates = candidatePaths(localPath, originalPath);
    if (isProtectedPath(localPath) || isProtectedPath(originalPath) || candidates.some((candidate) => isProtectedPath(candidate))) {
      return decision(false, "protected_path", { localPath, originalPath });
    }
    return null;
  }

  function candidatePaths(localPath, originalPath = "") {
    const local = String(localPath || "").trim();
    const original = String(originalPath || local || "").trim();
    const bases = dedupe([local, original].flatMap((item) => [
      normalizeLocalPath(item),
      item,
    ]));
    const normalized = dedupe(bases.map(normalizePathForBoundary));
    return dedupe([
      ...normalized,
      ...normalized.map((item) => cachedRealPath(item)),
    ].filter(Boolean));
  }

  function normalizedCandidatePaths(localPath, originalPath = "") {
    const local = String(localPath || "").trim();
    const original = String(originalPath || local || "").trim();
    const bases = dedupe([local, original].flatMap((item) => [
      normalizeLocalPath(item),
      item,
    ]));
    return dedupe(bases.map(normalizePathForBoundary).filter(Boolean));
  }

  function anyCandidateInside(localPath, originalPath, roots) {
    const normalizedRoots = dedupe((roots || []).flatMap((root) => {
      const bases = dedupe([root, normalizeLocalPath(root)]);
      return bases.map(normalizePathForBoundary);
    }).filter(Boolean));
    const realRoots = dedupe(normalizedRoots.map((item) => cachedRealPath(item)).filter(Boolean));
    const allRoots = dedupe([...normalizedRoots, ...realRoots]);
    return normalizedCandidatePaths(localPath, originalPath).some((candidate) => {
      if (!pathInsideAnyRoot(candidate, normalizedRoots)) return false;
      const realCandidate = cachedRealPath(candidate);
      return pathInsideAnyRoot(realCandidate, allRoots);
    });
  }

  function anyCandidateGloballyAllowed(localPath, originalPath) {
    return normalizedCandidatePaths(localPath, originalPath).some((candidate) => (
      isGloballyAllowedPath(candidate) && isGloballyAllowedPath(cachedRealPath(candidate))
    ));
  }

  function canReadForThread(thread, localPath, originalPath = "") {
    const protectedResult = protectedDecision(localPath, originalPath);
    if (protectedResult) {
      auditDeny("path_read_decision", protectedResult);
      return protectedResult;
    }
    const uploadRoots = uploadRootsForThread(thread);
    if (uploadRoots.length && anyCandidateInside(localPath, originalPath, uploadRoots)) {
      const result = decision(true, "thread_upload_root", { rootType: "upload" });
      return result;
    }
    const policy = policyForThread(thread) || {};
    if (policy.access_mode === "unrestricted" || policy.principal_id === "owner") {
      const ownerRoots = dedupe(ownerRootsForThread(thread));
      const allowed = anyCandidateGloballyAllowed(localPath, originalPath)
        || anyCandidateInside(localPath, originalPath, ownerRoots);
      const result = decision(allowed, allowed ? "owner_or_global_root" : "outside_owner_roots", { rootType: "owner" });
      auditDeny("path_read_decision", result);
      return result;
    }
    const roots = restrictedRootsForPolicy(policy);
    const allowed = roots.length && anyCandidateInside(localPath, originalPath, roots);
    const result = decision(Boolean(allowed), allowed ? "workspace_allowed_root" : "outside_workspace_roots", { rootType: "workspace" });
    auditDeny("path_read_decision", result);
    return result;
  }

  function canBrowseDirectoryForThread(thread, localPath, originalPath = "") {
    const read = canReadForThread(thread, localPath, originalPath);
    if (read.allowed) return read;
    const protectedResult = protectedDecision(localPath, originalPath);
    if (protectedResult) return protectedResult;
    const policy = policyForThread(thread) || {};
    if (!(policy.access_mode === "unrestricted" || policy.principal_id === "owner")) return read;
    const ownerRoots = dedupe(directoryOwnerRootsForThread(thread)).filter((root) => root && !isProtectedPath(root));
    const allowed = anyCandidateInside(localPath, originalPath, ownerRoots);
    return decision(Boolean(allowed), allowed ? "owner_directory_root" : "outside_owner_directory_roots", { rootType: "owner-directory" });
  }

  function assertChildPathInside(parentPath, childPath) {
    const pathApi = pathModuleForBoundary(parentPath || childPath);
    const parent = pathApi.resolve(normalizePathForBoundary(parentPath));
    const child = pathApi.resolve(normalizePathForBoundary(childPath));
    const relative = pathApi.relative(parent, child);
    if (relative === "" || relative.startsWith("..") || pathApi.isAbsolute(relative)) {
      const err = new Error("Target path escapes the current directory");
      err.status = 400;
      throw err;
    }
    const realParent = cachedRealPath(parent);
    if (realParent && comparablePath(realParent) !== comparablePath(parent)) {
      const err = new Error("Target directory must not be a symlink or junction");
      err.status = 400;
      throw err;
    }
    const childParent = pathApi.dirname(child);
    const realChildParent = cachedRealPath(childParent);
    if (realChildParent && comparablePath(realChildParent) !== comparablePath(childParent)) {
      const err = new Error("Target parent directory must not be a symlink or junction");
      err.status = 400;
      throw err;
    }
    return true;
  }

  return {
    canReadForThread,
    canBrowseDirectoryForThread,
    assertChildPathInside,
    pathInsideAnyRoot,
    comparablePath,
  };
}

module.exports = {
  createPathPolicyProvider,
  comparablePath,
  pathInsideAnyRoot,
};
