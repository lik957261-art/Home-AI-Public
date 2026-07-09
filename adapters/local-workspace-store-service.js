"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  mediaAccountPublicFields,
  normalizeAllowedOwnerSpecialPlugins,
  normalizeMediaAccountType,
} = require("./restricted-media-account-service");

function defaultNormalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[;\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultNormalizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) continue;
    out[cleanKey] = item && typeof item === "object" && !Array.isArray(item) ? Object.assign({}, item) : item;
  }
  return out;
}

function hashValue(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function workspaceIdSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function workspaceIdFromUsername(value) {
  const raw = String(value || "").trim();
  const slug = workspaceIdSlug(raw);
  if (slug) return slug;
  if (!raw) return "";
  return `user-${hashValue(raw).slice(0, 8)}`;
}

function titleCaseWorkspaceId(value) {
  const parts = String(value || "")
    .replace(/^user[-_]+/i, "")
    .split(/[-_\s.]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((part) => {
    if (part.length <= 2) return part.toUpperCase();
    return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
  }).join(" ");
}

function defaultWorkspaceLabel(value, workspaceId) {
  const raw = String(value || "").trim();
  if (raw && /[^\x00-\x7F]/.test(raw)) return raw.slice(0, 80);
  return titleCaseWorkspaceId(raw || workspaceId) || workspaceId || "User";
}

function safeWorkspaceFolderName(value, fallback = "workspace") {
  const text = String(value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return text || fallback;
}

function cleanPath(value) {
  return String(value || "").trim();
}

function pathEquals(a, b) {
  if (!cleanPath(a) || !cleanPath(b)) return false;
  return path.resolve(a) === path.resolve(b);
}

function canonicalWorkspaceUsersRoot(ownerDefaultWorkspace) {
  const root = cleanPath(ownerDefaultWorkspace);
  if (!root) return "";
  const normalized = path.normalize(root);
  const base = path.basename(normalized);
  if (base === "drive") return path.join(root, "users");
  if (base === "users" && path.basename(path.dirname(normalized)) === "drive") return root;
  return "";
}

function canonicalWorkspaceDataRoot(ownerDefaultWorkspace, workspaceId) {
  const usersRoot = canonicalWorkspaceUsersRoot(ownerDefaultWorkspace);
  const id = workspaceIdSlug(workspaceId);
  return usersRoot && id ? path.join(usersRoot, id) : "";
}

function legacyAutoWorkspaceRootCandidates(ownerDefaultWorkspace, labels = [], workspaceId = "") {
  const root = cleanPath(ownerDefaultWorkspace);
  if (!root || !canonicalWorkspaceUsersRoot(root)) return [];
  const values = [];
  const seen = new Set();
  for (const label of labels.concat(workspaceId)) {
    const folder = safeWorkspaceFolderName(label, workspaceId || "workspace");
    if (!folder || seen.has(folder)) continue;
    seen.add(folder);
    values.push(path.join(root, folder));
  }
  return values;
}

function isLegacyAutoWorkspaceRoot(value, ownerDefaultWorkspace, labels = [], workspaceId = "") {
  const root = cleanPath(value);
  if (!root) return false;
  return legacyAutoWorkspaceRootCandidates(ownerDefaultWorkspace, labels, workspaceId)
    .some((candidate) => pathEquals(candidate, root));
}

function createLocalWorkspaceStoreService(options = {}) {
  const storagePath = String(options.storagePath || "").trim();
  const ownerDefaultWorkspace = String(options.ownerDefaultWorkspace || "").trim();
  const normalizeStringList = typeof options.normalizeStringList === "function"
    ? options.normalizeStringList
    : defaultNormalizeStringList;
  const normalizeStringMap = typeof options.normalizeStringMap === "function"
    ? options.normalizeStringMap
    : defaultNormalizeStringMap;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : (() => {});
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : (() => null);
  const deleteWorkspaceAccessKey = typeof options.deleteWorkspaceAccessKey === "function"
    ? options.deleteWorkspaceAccessKey
    : (() => {});
  const invalidateCatalogCache = typeof options.invalidateCatalogCache === "function"
    ? options.invalidateCatalogCache
    : (() => {});
  const clearDynamicProjectCache = typeof options.clearDynamicProjectCache === "function"
    ? options.clearDynamicProjectCache
    : (() => {});
  const rootConflictsWithProtected = typeof options.rootConflictsWithProtected === "function"
    ? options.rootConflictsWithProtected
    : (() => false);
  const filterRoots = typeof options.filterRoots === "function"
    ? options.filterRoots
    : ((roots) => roots);

  function requireStoragePath() {
    if (!storagePath) throw new Error("Local workspace storage path is required");
    return storagePath;
  }

  function localWorkspaceDefaults(input = {}, previous = {}) {
    const username = String(input.username || input.userName || input.workspaceId || input.workspace_id || input.id || previous.id || "").trim();
    const id = workspaceIdFromUsername(input.workspaceId || input.workspace_id || input.id || username) || previous.id || "";
    const label = String(input.label || input.name || "").trim()
      || String(previous.label || "").trim()
      || defaultWorkspaceLabel(username, id);
    const folderName = safeWorkspaceFolderName(label, id || "workspace");
    const explicitDefaultWorkspace = String(input.defaultWorkspace || input.default_workspace || input.root || "").trim();
    const previousDefaultWorkspace = String(previous.defaultWorkspace || "").trim();
    const canonicalDefaultWorkspace = canonicalWorkspaceDataRoot(ownerDefaultWorkspace, id);
    const legacyLabels = [label, previous.label, username];
    const previousWasLegacyAutoRoot = previousDefaultWorkspace
      && canonicalDefaultWorkspace
      && isLegacyAutoWorkspaceRoot(previousDefaultWorkspace, ownerDefaultWorkspace, legacyLabels, id);
    const defaultWorkspace = explicitDefaultWorkspace
      || (previousWasLegacyAutoRoot ? "" : previousDefaultWorkspace)
      || canonicalDefaultWorkspace
      || path.join(ownerDefaultWorkspace, folderName);
    const previousAllowedRoots = normalizeStringList(previous.allowedRoots || []);
    const previousAllowedRootsWereLegacy = previousWasLegacyAutoRoot
      && previousAllowedRoots.length > 0
      && previousAllowedRoots.every((root) => isLegacyAutoWorkspaceRoot(root, ownerDefaultWorkspace, legacyLabels, id));
    const allowedRoots = normalizeStringList(
      input.allowedRoots
        || input.allowed_roots
        || input.root
        || input.defaultWorkspace
        || input.default_workspace
        || (previousAllowedRootsWereLegacy ? [] : previous.allowedRoots)
        || defaultWorkspace,
    );
    if (rootConflictsWithProtected(defaultWorkspace)) {
      const err = new Error("Workspace root is blocked by the Hermes Mobile security boundary");
      err.status = 403;
      throw err;
    }
    const safeAllowedRoots = filterRoots(allowedRoots) || allowedRoots;
    if (allowedRoots.length && !safeAllowedRoots.length) {
      const err = new Error("Workspace allowed roots are blocked by the Hermes Mobile security boundary");
      err.status = 403;
      throw err;
    }
    return {
      workspaceId: id,
      label,
      defaultWorkspace,
      allowedRoots: safeAllowedRoots.length ? safeAllowedRoots : [defaultWorkspace],
      allowedToolsets: normalizeStringList(input.allowedToolsets || input.allowed_toolsets || previous.allowedToolsets || []),
      connectorProfiles: normalizeStringMap(input.connectorProfiles || input.connector_profiles || previous.connectorProfiles || {}),
      accountType: normalizeMediaAccountType(input) || normalizeMediaAccountType(previous),
      allowedOwnerSpecialPlugins: normalizeAllowedOwnerSpecialPlugins(input).length
        ? normalizeAllowedOwnerSpecialPlugins(input)
        : normalizeAllowedOwnerSpecialPlugins(previous),
    };
  }

  function normalizeLocalWorkspaceRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    const id = workspaceIdSlug(source.id || source.workspaceId || source.workspace_id);
    if (!id || id === "owner") return null;
    const label = String(source.label || source.name || id).trim() || id;
    const defaultWorkspace = String(source.defaultWorkspace || source.default_workspace || source.root || "").trim();
    const allowedRoots = normalizeStringList(source.allowedRoots || source.allowed_roots || defaultWorkspace);
    if (rootConflictsWithProtected(defaultWorkspace)) return null;
    const safeAllowedRoots = filterRoots(allowedRoots) || allowedRoots;
    const mediaFields = mediaAccountPublicFields(source);
    return {
      id,
      label,
      accessMode: String(source.accessMode || source.access_mode || "restricted").trim() || "restricted",
      defaultWorkspace,
      allowedRoots: safeAllowedRoots,
      aliases: normalizeStringList(source.aliases),
      allowedToolsets: normalizeStringList(source.allowedToolsets || source.allowed_toolsets),
      connectorProfiles: normalizeStringMap(source.connectorProfiles || source.connector_profiles),
      accountType: mediaFields.accountType,
      allowedOwnerSpecialPlugins: mediaFields.allowedOwnerSpecialPlugins,
      createdAt: String(source.createdAt || ""),
      updatedAt: String(source.updatedAt || source.createdAt || ""),
      createdBy: String(source.createdBy || "owner"),
    };
  }

  function normalizeLocalWorkspaceStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const raw = Array.isArray(source.workspaces) ? source.workspaces : [];
    const workspaces = [];
    const seen = new Set();
    for (const item of raw) {
      const record = normalizeLocalWorkspaceRecord(item);
      if (!record || seen.has(record.id)) continue;
      seen.add(record.id);
      workspaces.push(record);
    }
    return {
      schemaVersion: 1,
      workspaces,
      updatedAt: String(source.updatedAt || ""),
    };
  }

  function loadLocalWorkspaceStore() {
    ensureDataDir();
    try {
      return normalizeLocalWorkspaceStore(JSON.parse(fs.readFileSync(requireStoragePath(), "utf8")));
    } catch (_) {
      return normalizeLocalWorkspaceStore({});
    }
  }

  function saveLocalWorkspaceStore(store) {
    ensureDataDir();
    const normalized = normalizeLocalWorkspaceStore(Object.assign({}, store, { updatedAt: nowIso() }));
    const target = requireStoragePath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  function localWorkspaceRecords() {
    return loadLocalWorkspaceStore().workspaces || [];
  }

  function upsertLocalWorkspace(input, actor = "owner") {
    const rawId = input.workspaceId || input.workspace_id || input.id || "";
    const id = workspaceIdFromUsername(rawId || input.username || input.userName);
    if (!id) {
      const err = new Error("Workspace id is required");
      err.status = 400;
      throw err;
    }
    if (id === "owner") {
      const err = new Error("Owner workspace already exists");
      err.status = 409;
      throw err;
    }
    const existing = findWorkspace(id);
    if (existing && existing.source !== "local-workspace") {
      const err = new Error("Workspace id is already managed by the external workspace provider");
      err.status = 409;
      throw err;
    }
    const now = nowIso();
    const store = loadLocalWorkspaceStore();
    const previous = store.workspaces.find((item) => item.id === id) || {};
    const defaults = localWorkspaceDefaults(Object.assign({}, input, { workspaceId: id }), previous);
    const record = normalizeLocalWorkspaceRecord(Object.assign({}, previous, input, {
      id,
      label: defaults.label,
      defaultWorkspace: defaults.defaultWorkspace,
      allowedRoots: defaults.allowedRoots,
      allowedToolsets: defaults.allowedToolsets,
      connectorProfiles: defaults.connectorProfiles,
      accountType: defaults.accountType,
      allowedOwnerSpecialPlugins: defaults.allowedOwnerSpecialPlugins,
      createdAt: previous.createdAt || now,
      updatedAt: now,
      createdBy: previous.createdBy || actor || "owner",
    }));
    if (!record) {
      const err = new Error("Invalid workspace");
      err.status = 400;
      throw err;
    }
    const next = store.workspaces.filter((item) => item.id !== id);
    next.push(record);
    saveLocalWorkspaceStore(Object.assign({}, store, { workspaces: next }));
    invalidateCatalogCache();
    clearDynamicProjectCache(id);
    return record;
  }

  function deleteLocalWorkspace(workspaceId) {
    const id = workspaceIdSlug(workspaceId);
    if (!id || id === "owner") {
      const err = new Error("Invalid workspace");
      err.status = 400;
      throw err;
    }
    const workspace = findWorkspace(id);
    if (workspace && workspace.source !== "local-workspace") {
      const err = new Error("Workspace is managed by the external workspace provider");
      err.status = 409;
      throw err;
    }
    const store = loadLocalWorkspaceStore();
    const previousCount = store.workspaces.length;
    const next = store.workspaces.filter((item) => item.id !== id);
    if (next.length === previousCount) {
      const err = new Error("Local workspace not found");
      err.status = 404;
      throw err;
    }
    saveLocalWorkspaceStore(Object.assign({}, store, { workspaces: next }));
    deleteWorkspaceAccessKey(id);
    invalidateCatalogCache();
    clearDynamicProjectCache(id);
    return { id };
  }

  return {
    canonicalWorkspaceDataRoot,
    canonicalWorkspaceUsersRoot,
    defaultWorkspaceLabel,
    deleteLocalWorkspace,
    loadLocalWorkspaceStore,
    localWorkspaceDefaults,
    localWorkspaceRecords,
    normalizeLocalWorkspaceRecord,
    normalizeLocalWorkspaceStore,
    safeWorkspaceFolderName,
    saveLocalWorkspaceStore,
    titleCaseWorkspaceId,
    upsertLocalWorkspace,
    workspaceIdFromUsername,
    workspaceIdSlug,
  };
}

module.exports = {
  canonicalWorkspaceDataRoot,
  canonicalWorkspaceUsersRoot,
  createLocalWorkspaceStoreService,
  defaultWorkspaceLabel,
  safeWorkspaceFolderName,
  titleCaseWorkspaceId,
  workspaceIdFromUsername,
  workspaceIdSlug,
};
