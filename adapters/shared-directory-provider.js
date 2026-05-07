"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const READ_ONLY_LABEL = "\u53ea\u8bfb";
const READ_WRITE_LABEL = "\u8bfb\u5199";
const WORKSPACE_LABEL = "\u5de5\u4f5c\u533a";
const ALL_WORKSPACES_LABEL = "\u6240\u6709\u5de5\u4f5c\u533a";
const MIDDLE_DOT = "\u00b7";

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function hashId(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function comparablePath(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
}

function pathInsideAnyRoot(candidate, roots) {
  const key = comparablePath(candidate);
  if (!key) return false;
  return (roots || []).some((root) => {
    const rootKey = comparablePath(root);
    return rootKey && (key === rootKey || key.startsWith(`${rootKey}/`));
  });
}

function sharedDirectoryLabel(rawPath) {
  const text = String(rawPath || "").trim().replace(/[\\/]+$/g, "");
  return text.split(/[\\/]/).filter(Boolean).pop() || "Shared";
}

function normalizeSharePermission(value) {
  return String(value || "").trim() === "read_only" ? "read_only" : "read_write";
}

function normalizeShareTargets(value) {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(value?.targetWorkspaceIds) ? value.targetWorkspaceIds
      : Array.isArray(value?.workspaceIds) ? value.workspaceIds
        : Array.isArray(value?.sharedWith) ? value.sharedWith
          : [];
  return dedupe(raw.map((item) => String(item || "").trim()).filter(Boolean));
}

function normalizeShareScope(value, targets) {
  const text = String(value || "").trim();
  if (text === "selected_workspaces" || text === "workspace_acl") return text;
  if (text === "all_workspaces") return text;
  return targets?.length ? "selected_workspaces" : "all_workspaces";
}

function pathSegmentsForComparison(value) {
  return comparablePath(value).split("/").filter(Boolean);
}

function pathSegmentsBelowRoot(candidate, root) {
  const candidateParts = pathSegmentsForComparison(candidate);
  const rootParts = pathSegmentsForComparison(root);
  if (!candidateParts.length || !rootParts.length || candidateParts.length <= rootParts.length) return null;
  for (let index = 0; index < rootParts.length; index += 1) {
    if (candidateParts[index] !== rootParts[index]) return null;
  }
  return candidateParts.slice(rootParts.length);
}

function sharedAclRootLabel(root, defaultRoot) {
  const parts = defaultRoot ? pathSegmentsBelowRoot(root, defaultRoot) : null;
  if (parts?.length) {
    const rawParts = String(root || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
    return rawParts[rawParts.length - parts.length] || sharedDirectoryLabel(root);
  }
  return sharedDirectoryLabel(root);
}

function workspaceSpecialRoots(policy) {
  return new Set([
    comparablePath(policy.sync_root || ""),
    comparablePath(policy.download_root || ""),
    ...(policy.cache_roots || []).map(comparablePath),
  ].filter(Boolean));
}

function createSharedDirectoryProvider(options = {}) {
  const storagePath = String(options.storagePath || "");
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : () => {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner");
  const loadCatalog = typeof options.loadCatalog === "function" ? options.loadCatalog : () => ({ workspaces: [] });
  const readJsonFirst = typeof options.readJsonFirst === "function" ? options.readJsonFirst : () => ({ data: { users: [] }, path: "" });
  const usersPaths = options.usersPaths || [];

  function normalizeRecord(item) {
    const root = String(item?.path || item?.root || "").trim();
    if (!root) return null;
    const label = String(item?.label || sharedDirectoryLabel(root)).trim() || sharedDirectoryLabel(root);
    const permission = normalizeSharePermission(item?.permission || item?.access);
    const targetWorkspaceIds = normalizeShareTargets(item);
    const scope = normalizeShareScope(item?.scope, targetWorkspaceIds);
    const source = String(item?.source || "").trim();
    const aliases = Array.isArray(item?.aliases)
      ? dedupe(item.aliases.map((value) => String(value || "").trim()).filter(Boolean))
      : [];
    const workspaceLabels = {};
    if (item?.workspaceLabels && typeof item.workspaceLabels === "object" && !Array.isArray(item.workspaceLabels)) {
      for (const [key, value] of Object.entries(item.workspaceLabels)) {
        const workspaceId = String(key || "").trim();
        const workspaceLabel = String(value || "").trim();
        if (workspaceId && workspaceLabel) workspaceLabels[workspaceId] = workspaceLabel;
      }
    }
    const out = {
      path: root,
      label,
      createdAt: String(item?.createdAt || nowIso()),
      createdBy: String(item?.createdBy || ""),
      createdByPrincipalId: String(item?.createdByPrincipalId || item?.createdByPrincipal || ""),
      permission,
      scope,
      targetWorkspaceIds,
    };
    if (aliases.length) out.aliases = aliases;
    if (Object.keys(workspaceLabels).length) out.workspaceLabels = workspaceLabels;
    if (source) out.source = source;
    return out;
  }

  function loadRecords() {
    try {
      if (!storagePath || !fs.existsSync(storagePath)) return [];
      const parsed = JSON.parse(fs.readFileSync(storagePath, "utf8"));
      const list = Array.isArray(parsed?.directories) ? parsed.directories : Array.isArray(parsed) ? parsed : [];
      return list.map(normalizeRecord).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function saveRecords(records) {
    ensureDataDir();
    const directories = [];
    const seen = new Set();
    for (const record of records || []) {
      const normalized = normalizeRecord(record);
      if (!normalized) continue;
      const key = comparablePath(normalized.path);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      directories.push(normalized);
    }
    const payload = { schemaVersion: 1, directories };
    const tmp = `${storagePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, storagePath);
  }

  function roots(workspaceId = "", actorPrincipalOverride = "") {
    return loadRecords()
      .filter((item) => !workspaceId || appliesToWorkspace(item, workspaceId, actorPrincipalOverride))
      .map((item) => item.path)
      .filter(Boolean);
  }

  function id(record) {
    if (String(record?.source || "") === "acl-allowed-root") {
      return `acl-share-${hashId(`${record?.createdBy || ""}:${record?.path || ""}`)}`;
    }
    return `share-${hashId(record?.path || "")}`;
  }

  function permissionLabel(record) {
    const permission = String(record?.permission || "read_write");
    const scope = String(record?.scope || "all_workspaces");
    const accessLabel = permission === "read_only" ? READ_ONLY_LABEL : READ_WRITE_LABEL;
    if (scope === "workspace_acl") return `${WORKSPACE_LABEL} ACL / ${accessLabel}`;
    if (scope === "selected_workspaces") {
      const count = normalizeShareTargets(record).length;
      return `${count || 0} ${WORKSPACE_LABEL} / ${accessLabel}`;
    }
    const scopeLabel = scope === "all_workspaces" ? ALL_WORKSPACES_LABEL : scope;
    return `${scopeLabel} ${MIDDLE_DOT} ${accessLabel}`;
  }

  function workspaceFromList(workspaces, workspaceId) {
    const workspaceIdText = String(workspaceId || "").trim();
    return (workspaces || []).find((item) => String(item?.id || "") === workspaceIdText) || null;
  }

  function workspacePrincipalFromList(workspaces, workspaceId) {
    const workspace = workspaceFromList(workspaces, workspaceId);
    const fallback = String(workspaceId || "owner").trim() || "owner";
    return String(workspace?.policy?.principal_id || workspace?.id || fallback);
  }

  function creator(record, workspaces = null) {
    const workspaceId = String(record?.createdBy || "").trim();
    const workspace = workspaceId
      ? (workspaces ? workspaceFromList(workspaces, workspaceId) : findWorkspace(workspaceId))
      : null;
    const principalId = String(record?.createdByPrincipalId || workspace?.policy?.principal_id || workspaceId || "").trim();
    return {
      workspaceId,
      principalId,
      label: workspace?.label || workspaceId || principalId || "Unknown",
    };
  }

  function appliesToWorkspace(record, workspaceId, actorPrincipalOverride = "") {
    const actorWorkspaceId = String(workspaceId || "owner").trim() || "owner";
    if (actorWorkspaceId === "owner") return true;
    const actorPrincipal = String(actorPrincipalOverride || workspacePrincipal(actorWorkspaceId));
    const creatorWorkspaceId = String(record?.createdBy || "").trim();
    const creatorPrincipalId = String(record?.createdByPrincipalId || creatorWorkspaceId || "").trim();
    if (creatorWorkspaceId && actorWorkspaceId === creatorWorkspaceId) return true;
    if (creatorPrincipalId && actorPrincipal === creatorPrincipalId) return true;
    const scope = String(record?.scope || "all_workspaces");
    if (scope === "all_workspaces") return true;
    const targets = normalizeShareTargets(record);
    return targets.includes(actorWorkspaceId) || targets.includes(actorPrincipal);
  }

  function canManage(record, workspaceId) {
    const actorWorkspaceId = String(workspaceId || "owner").trim() || "owner";
    const actorPrincipal = workspacePrincipal(actorWorkspaceId);
    const source = creator(record);
    return actorPrincipal === "owner"
      || actorWorkspaceId === source.workspaceId
      || (source.principalId && actorPrincipal === source.principalId);
  }

  function publicRecord(record, workspaceId = "owner") {
    const normalized = normalizeRecord(record);
    if (!normalized) return null;
    const source = creator(normalized);
    return {
      id: id(normalized),
      label: normalized.label,
      createdAt: normalized.createdAt,
      createdBy: source.workspaceId,
      createdByPrincipalId: source.principalId,
      createdByLabel: source.label,
      permission: normalized.permission,
      scope: normalized.scope,
      targetWorkspaceIds: normalizeShareTargets(normalized),
      targetLabels: normalizeShareTargets(normalized).map((workspaceIdText) => findWorkspace(workspaceIdText)?.label || workspaceIdText),
      permissionLabel: permissionLabel(normalized),
      source: normalized.source || "hermes-web-shared-directory",
      canUnshare: canManage(normalized, workspaceId),
      canManage: canManage(normalized, workspaceId),
    };
  }

  function aclRecords() {
    const catalog = loadCatalog();
    const explicitSharedKeys = new Set(roots().map(comparablePath).filter(Boolean));
    const records = [];
    const seen = new Set();
    for (const workspace of catalog.workspaces || []) {
      const policy = workspace.policy || {};
      if (!policy || policy.access_mode === "unrestricted") continue;
      const defaultRoot = String(workspace.defaultWorkspace || policy.default_workspace || "").trim();
      const specialRoots = workspaceSpecialRoots(policy);
      for (const root of dedupe(policy.allowed_roots || [])) {
        const key = comparablePath(root);
        if (!key || seen.has(`${workspace.id}:${key}`)) continue;
        if (explicitSharedKeys.has(key) || specialRoots.has(key)) continue;
        if (defaultRoot && key === comparablePath(defaultRoot)) continue;
        const belowDefault = defaultRoot ? pathSegmentsBelowRoot(root, defaultRoot) : null;
        if (belowDefault && belowDefault.length !== 1) continue;
        seen.add(`${workspace.id}:${key}`);
        records.push({
          path: root,
          label: sharedAclRootLabel(root, defaultRoot),
          createdAt: String(policy.updated_at || ""),
          createdBy: workspace.id,
          createdByPrincipalId: String(policy.principal_id || workspace.id || ""),
          permission: "read_write",
          scope: "workspace_acl",
          targetWorkspaceIds: [workspace.id],
          source: "acl-allowed-root",
        });
      }
    }
    return records;
  }

  function directoriesForWorkspace(workspaceId = "owner") {
    const actorWorkspaceId = String(workspaceId || "owner").trim() || "owner";
    const actorPrincipal = workspacePrincipal(actorWorkspaceId);
    const actorIsOwner = actorPrincipal === "owner";
    const workspace = findWorkspace(actorWorkspaceId);
    const actorRoots = workspace?.policy?.allowed_roots || [];
    const explicit = loadRecords().filter((record) => (
      actorIsOwner || canManage(record, actorWorkspaceId) || appliesToWorkspace(record, actorWorkspaceId)
    ));
    const acl = aclRecords().filter((record) => (
      actorIsOwner || canManage(record, actorWorkspaceId) || pathInsideAnyRoot(record.path, actorRoots)
    ));
    const out = [];
    const seen = new Set();
    for (const record of [...explicit, ...acl]) {
      const normalized = normalizeRecord(record);
      if (!normalized) continue;
      const source = normalized.source || "hermes-web-shared-directory";
      const key = `${source}:${normalized.createdBy || ""}:${comparablePath(normalized.path)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
    return out.sort((a, b) => String(a.createdBy || "").localeCompare(String(b.createdBy || ""), "zh-Hans-CN")
      || String(a.label || "").localeCompare(String(b.label || ""), "zh-Hans-CN"));
  }

  function writeJsonAtomic(filePath, data) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  }

  function removeAcl(identifier, workspaceId = "owner") {
    const value = String(identifier || "").trim();
    const record = aclRecords().find((item) => id(item) === value || comparablePath(item.path) === comparablePath(value));
    if (!record) return null;
    if (!canManage(record, workspaceId)) {
      const err = new Error("Only the owner or the original sharer can cancel this share");
      err.status = 403;
      throw err;
    }
    const usersRead = readJsonFirst(usersPaths, { users: [] });
    const users = Array.isArray(usersRead.data?.users) ? usersRead.data.users : [];
    const targetPrincipal = String(record.createdByPrincipalId || record.createdBy || "").trim();
    const user = users.find((item) => String(item?.principal_id || "").trim() === targetPrincipal);
    if (!usersRead.path || !user) {
      const err = new Error("ACL shared directory source was not found");
      err.status = 404;
      throw err;
    }
    const rootKey = comparablePath(record.path);
    const removeRoot = (values) => (Array.isArray(values) ? values.filter((item) => comparablePath(item) !== rootKey) : values);
    const beforeAllowed = Array.isArray(user.allowed_roots) ? user.allowed_roots.length : 0;
    const beforeDelivery = Array.isArray(user.delivery_roots) ? user.delivery_roots.length : 0;
    user.allowed_roots = removeRoot(user.allowed_roots);
    user.delivery_roots = removeRoot(user.delivery_roots);
    const changed = (Array.isArray(user.allowed_roots) ? user.allowed_roots.length : 0) !== beforeAllowed
      || (Array.isArray(user.delivery_roots) ? user.delivery_roots.length : 0) !== beforeDelivery;
    if (!changed) {
      const err = new Error("Shared directory not found");
      err.status = 404;
      throw err;
    }
    writeJsonAtomic(usersRead.path, usersRead.data);
    return record;
  }

  function removeRecord(identifier, workspaceId = "owner") {
    const value = String(identifier || "").trim();
    const records = loadRecords();
    const index = records.findIndex((record) => id(record) === value || comparablePath(record.path) === comparablePath(value));
    if (index < 0) {
      const aclRecord = removeAcl(value, workspaceId);
      if (aclRecord) return aclRecord;
      const err = new Error("Shared directory not found");
      err.status = 404;
      throw err;
    }
    const record = records[index];
    if (!canManage(record, workspaceId)) {
      const err = new Error("Only the owner or the original sharer can cancel this share");
      err.status = 403;
      throw err;
    }
    records.splice(index, 1);
    saveRecords(records);
    if (String(record.source || "") === "acl-allowed-root") return removeAcl(record.path, workspaceId) || record;
    return record;
  }

  function upsert(record) {
    const normalized = normalizeRecord(record);
    if (!normalized) {
      const err = new Error("Missing shared directory path");
      err.status = 400;
      throw err;
    }
    const records = loadRecords();
    const key = comparablePath(normalized.path);
    const existing = records.find((item) => comparablePath(item.path) === key);
    if (existing) {
      existing.label = normalized.label || existing.label;
      existing.createdBy = existing.createdBy || normalized.createdBy || "";
      existing.createdByPrincipalId = existing.createdByPrincipalId || normalized.createdByPrincipalId || "";
      existing.permission = normalized.permission || existing.permission || "read_write";
      existing.scope = normalized.scope || existing.scope || "all_workspaces";
      existing.targetWorkspaceIds = normalizeShareTargets(normalized);
      existing.source = normalized.source || existing.source || "";
      saveRecords(records);
      return existing;
    }
    records.push(normalized);
    saveRecords(records);
    return normalized;
  }

  function updateAccess(identifier, workspaceId = "owner", updates = {}) {
    const value = String(identifier || "").trim();
    const explicit = loadRecords();
    let record = explicit.find((item) => id(item) === value || comparablePath(item.path) === comparablePath(value));
    if (!record) record = aclRecords().find((item) => id(item) === value || comparablePath(item.path) === comparablePath(value));
    if (!record) {
      const err = new Error("Shared directory not found");
      err.status = 404;
      throw err;
    }
    if (!canManage(record, workspaceId)) {
      const err = new Error("Only the owner or the original sharer can manage this share");
      err.status = 403;
      throw err;
    }
    const targetWorkspaceIds = normalizeShareTargets(updates);
    const scope = normalizeShareScope(updates.scope, targetWorkspaceIds);
    if (scope === "selected_workspaces" && !targetWorkspaceIds.length) {
      const err = new Error("Select at least one workspace to share with");
      err.status = 400;
      throw err;
    }
    return upsert(Object.assign({}, record, {
      permission: normalizeSharePermission(updates.permission || record.permission),
      scope,
      targetWorkspaceIds: scope === "all_workspaces" ? [] : targetWorkspaceIds,
      source: record.source || "hermes-web-shared-directory",
    }));
  }

  function projectsForWorkspace(workspaceId, workspaces = null) {
    const actorPrincipal = workspaces ? workspacePrincipalFromList(workspaces, workspaceId) : "";
    return loadRecords()
      .map((record) => normalizeRecord(record))
      .filter((record) => record && appliesToWorkspace(record, workspaceId, actorPrincipal))
      .map((record) => {
        const source = creator(record, workspaces);
        const label = record.workspaceLabels?.[workspaceId] || record.label || sharedDirectoryLabel(record.path);
        return {
          id: `dir-${hashId(record.path)}`,
          shareId: id(record),
          workspaceId,
          label,
          root: record.path,
          aliases: dedupe([label, ...(record.aliases || []), record.label, sharedDirectoryLabel(record.path)]),
          source: "hermes-web-shared-directory",
          shared: true,
          sharedBy: source.workspaceId || source.principalId || "",
          sharedByPrincipalId: source.principalId,
          sharedByLabel: source.label,
          permission: record.permission || "read_write",
          permissionLabel: permissionLabel(record),
          children: [],
        };
      });
  }

  function isWriteAllowed(thread, localPath, displayPath = "") {
    const workspaceId = thread?.workspaceId || "";
    const matches = loadRecords().filter((record) => (
      appliesToWorkspace(record, workspaceId)
      && (pathInsideAnyRoot(displayPath || localPath, [record.path]) || pathInsideAnyRoot(localPath, [record.path]))
    ));
    if (!matches.length) return true;
    return matches.some((record) => normalizeSharePermission(record.permission) === "read_write");
  }

  return {
    aclRecords,
    appliesToWorkspace,
    canManage,
    creator,
    directoriesForWorkspace,
    id,
    isWriteAllowed,
    label: sharedDirectoryLabel,
    loadRecords,
    normalizePermission: normalizeSharePermission,
    normalizeRecord,
    normalizeScope: normalizeShareScope,
    normalizeTargets: normalizeShareTargets,
    permissionLabel,
    projectsForWorkspace,
    publicRecord,
    removeAcl,
    removeRecord,
    roots,
    saveRecords,
    updateAccess,
    upsert,
  };
}

module.exports = {
  createSharedDirectoryProvider,
};
