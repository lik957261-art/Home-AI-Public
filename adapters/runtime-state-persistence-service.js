"use strict";

const fs = require("fs");
const path = require("path");
const {
  DEFAULT_RUNTIME_STATE,
  decideBackupPruning,
  safeCloneJson,
  shouldRefuseMessageCountOverwrite,
} = require("./runtime-state-store-service");

function stateMessageCount(value) {
  const threads = Array.isArray(value?.threads) ? value.threads : [];
  return threads.reduce((total, thread) => total + (Array.isArray(thread?.messages) ? thread.messages.length : 0), 0);
}

function stateThreadCount(value) {
  return Array.isArray(value?.threads) ? value.threads.length : 0;
}

function safeStateBackupReason(reason = "save") {
  return String(reason || "save")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "save";
}

function stateBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function defaultPushSubscriptionScopeSignature(items) {
  return JSON.stringify(Array.isArray(items) ? items : []);
}

function defaultNormalizeState(value) {
  return safeCloneJson(value && typeof value === "object" ? value : DEFAULT_RUNTIME_STATE, DEFAULT_RUNTIME_STATE);
}

function sleepSync(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function createRuntimeStatePersistenceService(options = {}) {
  const fsImpl = options.fs || fs;
  const pathImpl = options.path || path;
  const statePath = String(options.statePath || pathImpl.join(options.dataDir || process.cwd(), "state.json"));
  const dataDir = String(options.dataDir || pathImpl.dirname(statePath));
  const stateBackupDir = String(options.stateBackupDir || pathImpl.join(dataDir, "backups", "state"));
  const pid = options.pid || process.pid;
  const maxStateBackups = Number.isFinite(Number(options.maxStateBackups))
    ? Number(options.maxStateBackups)
    : 80;
  const stateBackupMinIntervalMs = Math.max(0, Number(options.stateBackupMinIntervalMs || 0) || 0);
  const bootTrace = typeof options.bootTrace === "function" ? options.bootTrace : (() => {});
  const logError = typeof options.logError === "function" ? options.logError : (() => {});
  const nowDate = typeof options.nowDate === "function" ? options.nowDate : (() => new Date());
  const defaultState = typeof options.defaultState === "function"
    ? options.defaultState
    : (() => safeCloneJson(options.defaultState || DEFAULT_RUNTIME_STATE, DEFAULT_RUNTIME_STATE));
  const normalizeState = typeof options.normalizeState === "function" ? options.normalizeState : defaultNormalizeState;
  const pushSubscriptionScopeSignature = typeof options.pushSubscriptionScopeSignature === "function"
    ? options.pushSubscriptionScopeSignature
    : defaultPushSubscriptionScopeSignature;
  const useSqliteServiceStore = typeof options.useSqliteServiceStore === "function"
    ? options.useSqliteServiceStore
    : (() => false);
  const mobileSqliteStore = typeof options.mobileSqliteStore === "function"
    ? options.mobileSqliteStore
    : (() => null);
  const ensureDataDir = typeof options.ensureDataDir === "function"
    ? options.ensureDataDir
    : (() => fsImpl.mkdirSync(dataDir, { recursive: true }));
  const renameRetryDelaysMs = Array.isArray(options.renameRetryDelaysMs)
    ? options.renameRetryDelaysMs.map((value) => Math.max(0, Number(value) || 0))
    : [25, 75, 150, 300, 600];

  let lastStateBackupAt = 0;

  function ensureStateBackupDir() {
    fsImpl.mkdirSync(stateBackupDir, { recursive: true });
  }

  function readStateFileIfValid() {
    try {
      if (!fsImpl.existsSync(statePath)) return null;
      return JSON.parse(fsImpl.readFileSync(statePath, "utf8"));
    } catch (_) {
      return null;
    }
  }

  function shouldRefuseStateOverwrite(previous, next, saveOptions = {}) {
    return shouldRefuseMessageCountOverwrite(previous, next, {
      allowMessageDrop: saveOptions.allowMessageDrop,
      minExistingMessages: 5,
      minDrop: 6,
      dropRatio: 0.4,
    }).refuse;
  }

  function pruneStateBackups() {
    if (!Number.isFinite(maxStateBackups) || maxStateBackups <= 0) return;
    let entries = [];
    try {
      entries = fsImpl.readdirSync(stateBackupDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^state-auto-.*\.json$/i.test(entry.name))
        .map((entry) => {
          const filePath = pathImpl.join(stateBackupDir, entry.name);
          const stat = fsImpl.statSync(filePath);
          return { filePath, mtimeMs: stat.mtimeMs };
        });
    } catch (_) {
      return;
    }
    const decision = decideBackupPruning(entries, { maxBackups: maxStateBackups });
    for (const entry of decision.prune) {
      try {
        fsImpl.unlinkSync(entry.filePath);
      } catch (_) {
        // Best-effort retention cleanup only.
      }
    }
  }

  function backupStateFile(reason = "save", backupOptions = {}) {
    ensureDataDir();
    if (!fsImpl.existsSync(statePath)) return null;
    const nowMs = nowDate().getTime();
    if (!backupOptions.force && lastStateBackupAt && nowMs - lastStateBackupAt < stateBackupMinIntervalMs) return null;
    let raw = "";
    try {
      raw = fsImpl.readFileSync(statePath, "utf8");
    } catch (_) {
      return null;
    }
    if (!raw.trim()) return null;
    let summary = "unreadable";
    if (!backupOptions.rawFallback) {
      try {
        const parsed = JSON.parse(raw);
        summary = `${stateThreadCount(parsed)}t-${stateMessageCount(parsed)}m`;
      } catch (_) {
        summary = "unreadable";
      }
    }
    ensureStateBackupDir();
    const filePath = pathImpl.join(
      stateBackupDir,
      `state-auto-${stateBackupTimestamp(nowDate())}-${safeStateBackupReason(reason)}-${summary}.json`,
    );
    try {
      fsImpl.writeFileSync(filePath, raw, "utf8");
      lastStateBackupAt = nowMs;
      pruneStateBackups();
      return filePath;
    } catch (err) {
      logError(`Hermes Mobile state backup failed: ${err.message || String(err)}`);
      return null;
    }
  }

  function writeStateFile(next) {
    ensureDataDir();
    const tmp = `${statePath}.${pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    fsImpl.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
    let lastErr = null;
    for (let attempt = 0; attempt <= renameRetryDelaysMs.length; attempt += 1) {
      try {
        fsImpl.renameSync(tmp, statePath);
        return;
      } catch (err) {
        lastErr = err;
        if (!err || !["EPERM", "EACCES", "EBUSY"].includes(err.code) || attempt >= renameRetryDelaysMs.length) break;
        sleepSync(renameRetryDelaysMs[attempt]);
      }
    }
    try {
      fsImpl.unlinkSync(tmp);
    } catch (_) {
      // Best-effort cleanup for a failed snapshot write.
    }
    throw lastErr;
  }

  function loadStateFromSqlite() {
    bootTrace("loadState sqlite enter");
    const store = mobileSqliteStore();
    if (!store) throw new Error("SQLite service store is not available");
    bootTrace("loadState sqlite store ready");
    const counts = store.runtimeStateCounts();
    bootTrace(`loadState sqlite counts ${JSON.stringify(counts)}`);
    const hasRuntimeRows = Object.values(counts || {}).some((value) => Number(value || 0) > 0);
    if (!hasRuntimeRows) {
      bootTrace("loadState sqlite empty runtime");
      const existing = readStateFileIfValid();
      if (existing) {
        bootTrace("loadState sqlite import state-file source");
        backupStateFile("sqlite-import-source", { force: true });
        const normalized = normalizeState(existing, { skipCatalogLookups: true });
        bootTrace("loadState sqlite state-file normalized");
        store.replaceRuntimeState(normalized);
        bootTrace("loadState sqlite state-file imported");
        writeStateFile(normalized);
        bootTrace("loadState sqlite state-file snapshot written");
        return normalized;
      }
      const fresh = defaultState();
      bootTrace("loadState sqlite writing fresh state");
      store.replaceRuntimeState(fresh);
      bootTrace("loadState sqlite fresh imported");
      writeStateFile(fresh);
      bootTrace("loadState sqlite fresh snapshot written");
      return fresh;
    }
    bootTrace("loadState sqlite before exportRuntimeState");
    const exported = store.exportRuntimeState();
    bootTrace("loadState sqlite after exportRuntimeState");
    const normalized = normalizeState(exported, { skipCatalogLookups: true });
    bootTrace("loadState sqlite after normalizeState");
    writeStateFile(normalized);
    bootTrace("loadState sqlite snapshot written");
    return normalized;
  }

  function saveState(next, saveOptions = {}) {
    ensureDataDir();
    const previous = readStateFileIfValid();
    if (previous && shouldRefuseStateOverwrite(previous, next, saveOptions)) {
      const backupPath = backupStateFile(`refused-${saveOptions.reason || "message-drop"}`, { force: true });
      const previousMessages = stateMessageCount(previous);
      const nextMessages = stateMessageCount(next);
      throw new Error(`Refusing to overwrite Hermes Mobile state: message count would drop from ${previousMessages} to ${nextMessages}.${backupPath ? ` Backup: ${backupPath}` : ""}`);
    }
    const previousMessages = previous ? stateMessageCount(previous) : 0;
    const nextMessages = stateMessageCount(next);
    if (previousMessages && previousMessages !== nextMessages) {
      backupStateFile(saveOptions.reason || "message-count-change", { force: saveOptions.forceBackup });
    } else {
      backupStateFile(saveOptions.reason || "periodic-save");
    }
    if (useSqliteServiceStore()) {
      const store = mobileSqliteStore();
      if (!store) throw new Error("SQLite service store is not available");
      store.replaceRuntimeState(next);
    }
    writeStateFile(next);
  }

  function loadState() {
    bootTrace("loadState enter");
    ensureDataDir();
    bootTrace("loadState ensured data dir");
    if (useSqliteServiceStore()) return loadStateFromSqlite();
    bootTrace("loadState json mode");
    let raw = "";
    let parsed = null;
    try {
      raw = fsImpl.readFileSync(statePath, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") {
        const fresh = defaultState();
        writeStateFile(fresh);
        return fresh;
      }
      throw err;
    }
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      backupStateFile("parse-failed", { force: true, rawFallback: true });
      logError(`Hermes Mobile state parse failed; wrote fresh state after backup: ${err.message || String(err)}`);
      const fresh = defaultState();
      writeStateFile(fresh);
      return fresh;
    }
    backupStateFile("startup", { force: true });
    try {
      const normalized = normalizeState(parsed, { skipCatalogLookups: true });
      if (pushSubscriptionScopeSignature(parsed.pushSubscriptions) !== pushSubscriptionScopeSignature(normalized.pushSubscriptions)) {
        saveState(normalized, { reason: "normalize-push-subscriptions" });
      }
      return normalized;
    } catch (err) {
      backupStateFile("normalize-failed", { force: true, rawFallback: true });
      throw err;
    }
  }

  return Object.freeze({
    backupStateFile,
    loadState,
    loadStateFromSqlite,
    pruneStateBackups,
    readStateFileIfValid,
    saveState,
    shouldRefuseStateOverwrite,
    writeStateFile,
  });
}

module.exports = {
  createRuntimeStatePersistenceService,
  safeStateBackupReason,
  stateBackupTimestamp,
  stateMessageCount,
  stateThreadCount,
};
