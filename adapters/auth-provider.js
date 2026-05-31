"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function timingSafeEquals(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function keyHash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function generateWebAccessKey() {
  return `hwk_${crypto.randomBytes(27).toString("base64url")}`;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function normalizeAccessKeyStore(value) {
  const workspaceKeys = {};
  const source = value && typeof value === "object" ? value : {};
  const raw = source.workspaceKeys && typeof source.workspaceKeys === "object" ? source.workspaceKeys : {};
  for (const [workspaceId, record] of Object.entries(raw)) {
    const id = String(workspaceId || "").trim();
    const hash = String(record?.hash || "").trim();
    if (!id || !/^[a-f0-9]{64}$/i.test(hash)) continue;
    workspaceKeys[id] = {
      hash: hash.toLowerCase(),
      createdAt: String(record?.createdAt || ""),
      updatedAt: String(record?.updatedAt || record?.createdAt || ""),
      createdBy: String(record?.createdBy || "owner"),
    };
  }
  return {
    schemaVersion: 1,
    workspaceKeys,
    updatedAt: String(source.updatedAt || ""),
  };
}

function createAuthProvider(options = {}) {
  const disableAuth = () => Boolean(typeof options.disableAuth === "function" ? options.disableAuth() : options.disableAuth);
  const authKeyPath = () => path.resolve(String(typeof options.authKeyPath === "function" ? options.authKeyPath() : options.authKeyPath));
  const accessKeysPath = () => path.resolve(String(typeof options.accessKeysPath === "function" ? options.accessKeysPath() : options.accessKeysPath));
  const envKey = () => String(typeof options.envKey === "function" ? options.envKey() : (options.envKey || "")).trim();
  const allowMemoryKey = () => Boolean(typeof options.allowMemoryKey === "function" ? options.allowMemoryKey() : options.allowMemoryKey);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const ensureDataDir = typeof options.ensureDataDir === "function" ? options.ensureDataDir : () => {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const workspacePrincipal = typeof options.workspacePrincipal === "function" ? options.workspacePrincipal : (workspaceId) => workspaceId || "owner";
  const listWorkspaces = typeof options.listWorkspaces === "function" ? options.listWorkspaces : () => [];
  const allowQueryAccessKey = () => {
    if (typeof options.allowQueryAccessKey === "function") return Boolean(options.allowQueryAccessKey());
    return options.allowQueryAccessKey !== false;
  };

  let ownerKeyState = disableAuth() ? { key: "", source: "disabled" } : loadOwnerKeyState();

  function workspaceAccessIds(workspace) {
    const policy = workspace?.policy && typeof workspace.policy === "object" ? workspace.policy : {};
    const raw = []
      .concat(Array.isArray(policy.accessible_workspace_ids) ? policy.accessible_workspace_ids : [])
      .concat(Array.isArray(policy.workspace_ids) ? policy.workspace_ids : [])
      .concat(Array.isArray(policy.workspaces) ? policy.workspaces : []);
    return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function loadOwnerKeyState() {
    const direct = envKey();
    if (direct) return { key: direct, source: "env" };
    try {
      const value = fs.readFileSync(authKeyPath(), "utf8").trim();
      if (value) return { key: value, source: "file" };
    } catch (_) {
      // Fall through to first-run setup.
    }
    if (allowMemoryKey()) {
      return { key: crypto.randomBytes(18).toString("base64url"), source: "memory" };
    }
    return { key: "", source: "unconfigured" };
  }

  function currentGlobalAuthKey() {
    return ownerKeyState?.key || "";
  }

  function ownerKeySource() {
    return ownerKeyState?.source || "unknown";
  }

  function authKeyDisplayPath() {
    return path.basename(authKeyPath()) || "owner-key";
  }

  function ownerSetupStatus() {
    const ownerKeyConfigured = Boolean(currentGlobalAuthKey());
    const setupRequired = !disableAuth() && ownerKeyState?.source === "unconfigured" && !ownerKeyConfigured;
    return {
      setupRequired,
      authRequired: !disableAuth(),
      ownerKeyConfigured,
      ownerKeySource: ownerKeySource(),
      canCreateOwner: setupRequired,
    };
  }

  function createInitialOwnerKey() {
    const status = ownerSetupStatus();
    if (!status.setupRequired) {
      const err = new Error(status.ownerKeyConfigured ? "Owner key is already configured" : "Owner setup is not available");
      err.status = 409;
      throw err;
    }
    const key = generateWebAccessKey();
    fs.mkdirSync(path.dirname(authKeyPath()), { recursive: true });
    fs.writeFileSync(authKeyPath(), `${key}\n`, { encoding: "utf8", mode: 0o600 });
    ownerKeyState = { key, source: "file", updatedAt: nowIso() };
    return {
      key,
      auth: { source: "file", path: authKeyDisplayPath(), updatedAt: ownerKeyState.updatedAt },
    };
  }

  function requestAccessKey(req) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    return req.headers["x-hermes-web-key"]
      || (allowQueryAccessKey() ? url.searchParams.get("key") : "")
      || parseCookies(req.headers.cookie).hermes_web_key;
  }

  function loadAccessKeyStore() {
    ensureDataDir();
    try {
      return normalizeAccessKeyStore(JSON.parse(fs.readFileSync(accessKeysPath(), "utf8")));
    } catch (_) {
      return normalizeAccessKeyStore({});
    }
  }

  function saveAccessKeyStore(store) {
    ensureDataDir();
    const normalized = normalizeAccessKeyStore(Object.assign({}, store, { updatedAt: nowIso() }));
    fs.writeFileSync(accessKeysPath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    return normalized;
  }

  function authenticateRequest(req) {
    if (disableAuth()) {
      return { ok: true, role: "owner", workspaceId: "owner", principalId: "owner", isOwner: true, keySource: "disabled" };
    }
    if (req.auth) return req.auth;
    const key = requestAccessKey(req);
    const globalKey = currentGlobalAuthKey();
    if (key && globalKey && timingSafeEquals(key, globalKey)) {
      req.auth = { ok: true, role: "owner", workspaceId: "owner", principalId: "owner", isOwner: true, keySource: ownerKeySource() || "global" };
      return req.auth;
    }
    const hash = keyHash(key);
    const store = loadAccessKeyStore();
    for (const [workspaceId, record] of Object.entries(store.workspaceKeys || {})) {
      if (!record?.hash || !timingSafeEquals(hash, record.hash)) continue;
      const workspace = findWorkspace(workspaceId);
      if (!workspace) continue;
      req.auth = {
        ok: true,
        role: "workspace",
        workspaceId,
        principalId: workspacePrincipal(workspaceId),
        workspaceIds: [...new Set([workspaceId, ...workspaceAccessIds(workspace)])],
        workspaces: [...new Set([workspaceId, ...workspaceAccessIds(workspace)])],
        isOwner: false,
        keySource: "workspace",
      };
      return req.auth;
    }
    req.auth = { ok: false, role: "anonymous", workspaceId: "", principalId: "", isOwner: false, keySource: "" };
    return req.auth;
  }

  function isOwnerAuth(auth) {
    return disableAuth() || Boolean(auth?.isOwner || auth?.role === "owner");
  }

  function authCanAccessWorkspace(auth, workspaceId) {
    if (isOwnerAuth(auth)) return true;
    const id = String(workspaceId || "owner").trim() || "owner";
    const allowed = new Set(
      []
        .concat(Array.isArray(auth?.workspaceIds) ? auth.workspaceIds : [])
        .concat(Array.isArray(auth?.workspaces) ? auth.workspaces : [])
        .concat(auth?.workspaceId ? [auth.workspaceId] : []),
    );
    return Boolean(auth?.ok && allowed.has(id));
  }

  function publicWorkspaceAccessKeyStatus(workspace) {
    if (!workspace || workspace.id === "owner") {
      return {
        kind: "owner",
        label: "Owner Key",
        hasKey: Boolean(currentGlobalAuthKey()),
        source: ownerKeySource(),
        canRotate: ownerKeySource() !== "env",
        updatedAt: ownerKeyState.updatedAt || "",
      };
    }
    const store = loadAccessKeyStore();
    const record = store.workspaceKeys?.[workspace.id] || null;
    return {
      kind: "workspace",
      label: "Workspace Key",
      hasKey: Boolean(record?.hash),
      canRotate: true,
      updatedAt: record?.updatedAt || record?.createdAt || "",
    };
  }

  function publicAccessKeyStatus(workspace, record = null) {
    return {
      workspaceId: workspace.id,
      workspaceLabel: workspace.label || workspace.id,
      role: workspace.role || "",
      principalId: workspacePrincipal(workspace.id),
      hasKey: Boolean(record?.hash),
      createdAt: record?.createdAt || "",
      updatedAt: record?.updatedAt || "",
    };
  }

  function listWorkspaceAccessKeyStatuses(auth, optionsArg = {}) {
    const store = loadAccessKeyStore();
    const requestedWorkspaceId = String(optionsArg.workspaceId || "").trim();
    const workspaces = isOwnerAuth(auth)
      ? listWorkspaces().filter((workspace) =>
        workspace.id !== "owner" && (!requestedWorkspaceId || workspace.id === requestedWorkspaceId))
      : listWorkspaces().filter((workspace) => workspace.id === auth?.workspaceId && workspace.id !== "owner");
    return workspaces
      .map((workspace) => publicAccessKeyStatus(workspace, store.workspaceKeys?.[workspace.id] || null));
  }

  function workspaceRequired(workspaceId) {
    const workspace = findWorkspace(workspaceId);
    if (!workspace) {
      const err = new Error("Unknown workspace");
      err.status = 400;
      throw err;
    }
    if (workspace.id === "owner") {
      const err = new Error("Use the Hermes Mobile key rotation for Owner access");
      err.status = 400;
      throw err;
    }
    return workspace;
  }

  function rotateWorkspaceAccessKey(workspaceId, optionsArg = {}) {
    const workspace = workspaceRequired(workspaceId);
    const key = generateWebAccessKey();
    const now = nowIso();
    if (optionsArg.dryRun) {
      return { key, record: publicAccessKeyStatus(workspace, { createdAt: now, updatedAt: now, hash: keyHash(key) }), dryRun: true };
    }
    const store = loadAccessKeyStore();
    const previous = store.workspaceKeys?.[workspace.id] || {};
    store.workspaceKeys = store.workspaceKeys || {};
    store.workspaceKeys[workspace.id] = {
      hash: keyHash(key),
      createdAt: previous.createdAt || now,
      updatedAt: now,
      createdBy: String(optionsArg.actor || "owner"),
    };
    const saved = saveAccessKeyStore(store);
    return { key, record: publicAccessKeyStatus(workspace, saved.workspaceKeys[workspace.id]), dryRun: false };
  }

  function revokeWorkspaceAccessKey(workspaceId, optionsArg = {}) {
    const workspace = workspaceRequired(workspaceId);
    const store = loadAccessKeyStore();
    const previous = store.workspaceKeys?.[workspace.id] || null;
    if (!optionsArg.dryRun && previous) {
      delete store.workspaceKeys[workspace.id];
      saveAccessKeyStore(store);
    }
    return {
      workspace: publicAccessKeyStatus(workspace, null),
      revoked: Boolean(previous),
      dryRun: Boolean(optionsArg.dryRun),
    };
  }

  function deleteWorkspaceAccessKey(workspaceId) {
    const id = String(workspaceId || "").trim();
    if (!id) return false;
    const store = loadAccessKeyStore();
    const previous = store.workspaceKeys?.[id] || null;
    if (previous) {
      delete store.workspaceKeys[id];
      saveAccessKeyStore(store);
    }
    return Boolean(previous);
  }

  function rotateGlobalAccessKey(optionsArg = {}) {
    const key = generateWebAccessKey();
    const now = nowIso();
    if (optionsArg.dryRun) {
      return {
        key,
        auth: { source: ownerKeySource(), canPersist: ownerKeySource() !== "env", updatedAt: now },
        dryRun: true,
      };
    }
    if (ownerKeyState.source === "env") {
      const err = new Error("Hermes Mobile key is configured by HERMES_WEB_KEY; remove or update the environment variable before rotating from Web");
      err.status = 409;
      throw err;
    }
    fs.writeFileSync(authKeyPath(), `${key}\n`, { encoding: "utf8", mode: 0o600 });
    ownerKeyState = { key, source: "file", updatedAt: now };
    return {
      key,
      auth: { source: "file", path: authKeyDisplayPath(), updatedAt: now },
      dryRun: false,
    };
  }

  return {
    authCanAccessWorkspace,
    authenticateRequest,
    createInitialOwnerKey,
    currentGlobalAuthKey,
    deleteWorkspaceAccessKey,
    generateWebAccessKey,
    isOwnerAuth,
    keyHash,
    listWorkspaceAccessKeyStatuses,
    loadAccessKeyStore,
    normalizeAccessKeyStore,
    ownerKeySource,
    ownerSetupStatus,
    publicAccessKeyStatus,
    publicWorkspaceAccessKeyStatus,
    requestAccessKey,
    revokeWorkspaceAccessKey,
    rotateGlobalAccessKey,
    rotateWorkspaceAccessKey,
    saveAccessKeyStore,
  };
}

module.exports = {
  createAuthProvider,
  generateWebAccessKey,
  keyHash,
  normalizeAccessKeyStore,
  parseCookies,
  timingSafeEquals,
};
