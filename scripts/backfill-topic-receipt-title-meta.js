"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROOT = "/Users/example/path";
const CONVERSATION_GROUP_IDS = new Set(["chat", "group-chat", "weixin-chat"]);

function cleanString(value) {
  return String(value || "").trim();
}

function compactText(value, max = 160) {
  const text = cleanString(value).replace(/\s+/g, " ");
  if (!text || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}...`;
}

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dbPath: "",
    write: false,
    json: false,
    sampleLimit: 20,
    scanLimitPerThread: 20000,
    syncStateFile: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--db") out.dbPath = argv[++index] || out.dbPath;
    else if (arg === "--write") out.write = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--sample-limit") out.sampleLimit = Number(argv[++index] || out.sampleLimit);
    else if (arg === "--scan-limit-per-thread") out.scanLimitPerThread = Number(argv[++index] || out.scanLimitPerThread);
    else if (arg === "--no-sync-state") out.syncStateFile = false;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/backfill-topic-receipt-title-meta.js [options]",
        "  --root <dir>                 Mac production root, default /Users/example/path",
        "  --db <file>                  SQLite DB path, default <root>/data/hermes-mobile.sqlite3",
        "  --write                      Apply taskGroupMeta last receipt updates",
        "  --scan-limit-per-thread <n>  Maximum raw messages scanned per thread, default 20000",
        "  --sample-limit <n>           Maximum bounded samples in output, default 20",
        "  --no-sync-state              Do not synchronize data/state.json taskGroupMeta in write mode",
        "  --json                       Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = cleanString(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  if (!out.dbPath) out.dbPath = path.join(out.root, "data", "hermes-mobile.sqlite3");
  if (!Number.isFinite(out.sampleLimit) || out.sampleLimit < 0) out.sampleLimit = 20;
  if (!Number.isFinite(out.scanLimitPerThread) || out.scanLimitPerThread <= 0) out.scanLimitPerThread = 20000;
  return out;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch (_) {
    return fallback;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function compactPath(value, root = DEFAULT_ROOT) {
  const text = String(value || "").replace(/\\/g, "/");
  if (!text) return "";
  const cleanRoot = String(root || DEFAULT_ROOT).replace(/\\/g, "/").replace(/\/+$/, "");
  return text
    .replace(`${cleanRoot}/data/drive/users/`, "$DRIVE/users/")
    .replace(cleanRoot, "<root>");
}

function copyIfExists(file, backupDir) {
  if (!fs.existsSync(file)) return "";
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, path.basename(file));
  fs.copyFileSync(file, target);
  return target;
}

function backupDatabaseFiles(dbPath, root, stamp) {
  const backupDir = path.join(root, "data", "backups", `topic-receipt-title-backfill-${stamp}`);
  return ["", "-wal", "-shm"]
    .map((suffix) => copyIfExists(`${dbPath}${suffix}`, backupDir))
    .filter(Boolean)
    .map((file) => compactPath(file, root));
}

function backupStateFile(root, stamp) {
  const backupDir = path.join(root, "data", "backups", `topic-receipt-title-backfill-${stamp}`);
  const statePath = path.join(root, "data", "state.json");
  const backup = copyIfExists(statePath, backupDir);
  return backup ? [compactPath(backup, root)] : [];
}

function syncStateFileTaskGroupMeta(root, changedRows = []) {
  const statePath = path.join(root, "data", "state.json");
  if (!fs.existsSync(statePath) || !changedRows.length) return { checked: false, changed: false };
  const state = parseJson(fs.readFileSync(statePath, "utf8"), null);
  if (!state || typeof state !== "object" || !Array.isArray(state.threads)) {
    return { checked: true, changed: false };
  }
  const metaByThread = new Map(changedRows.map((row) => [row.id, row.taskGroupMeta]));
  let changed = 0;
  for (const thread of state.threads) {
    const meta = metaByThread.get(thread?.id);
    if (!meta) continue;
    const before = JSON.stringify(thread.taskGroupMeta || {});
    thread.taskGroupMeta = meta;
    if (JSON.stringify(thread.taskGroupMeta || {}) !== before) changed += 1;
  }
  if (changed) fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  return { checked: true, changed: Boolean(changed), changedThreads: changed };
}

function messageTimestamp(message = {}) {
  return message.completedAt || message.failedAt || message.cancelledAt || message.submittedAt || message.updatedAt || message.createdAt || "";
}

function isConversationTaskGroupId(value) {
  const text = cleanString(value);
  return !text || CONVERSATION_GROUP_IDS.has(text);
}

function normalizeThread(row = {}) {
  const raw = parseJson(row.raw_json, {}) || {};
  raw.id = raw.id || row.id;
  raw.workspaceId = raw.workspaceId || row.workspace_id || "";
  raw.taskGroupMeta = Object.assign(
    {},
    parseJson(row.task_group_meta_json, {}) || {},
    raw.taskGroupMeta && typeof raw.taskGroupMeta === "object" && !Array.isArray(raw.taskGroupMeta) ? raw.taskGroupMeta : {},
  );
  raw.messages = Array.isArray(raw.messages) ? raw.messages : [];
  return raw;
}

function latestTopicSignals(thread = {}, scanLimit = 20000) {
  const latestByGroup = new Map();
  let scanned = 0;
  for (const message of thread.messages || []) {
    if (scanned >= scanLimit) break;
    scanned += 1;
    const taskGroupId = cleanString(message.taskGroupId);
    if (isConversationTaskGroupId(taskGroupId)) continue;
    const role = cleanString(message.role);
    if (role !== "assistant" && role !== "user") continue;
    const content = compactText(message.content || "", 160);
    if (!content) continue;
    const timestampValue = messageTimestamp(message);
    const current = latestByGroup.get(taskGroupId) || {};
    const next = Object.assign({}, current, {
      taskGroupId,
      scanned,
      updatedAt: timestampValue || current.updatedAt || "",
    });
    if (role === "assistant" && (!current.lastReceiptAt || String(timestampValue || "") >= String(current.lastReceiptAt || ""))) {
      next.lastReceiptTitle = content;
      next.lastReceiptAt = timestampValue || "";
      next.lastMessageId = cleanString(message.id || current.lastMessageId);
    }
    if (role === "user" && (!current.lastUserPromptAt || String(timestampValue || "") >= String(current.lastUserPromptAt || ""))) {
      next.lastUserPromptTitle = content;
      next.lastUserPromptAt = timestampValue || "";
      if (!next.lastMessageId) next.lastMessageId = cleanString(message.id || "");
    }
    latestByGroup.set(taskGroupId, next);
  }
  return { scanned, groups: latestByGroup };
}

function applySignalsToMeta(thread = {}, signals = new Map()) {
  let changed = 0;
  if (!thread.taskGroupMeta || typeof thread.taskGroupMeta !== "object" || Array.isArray(thread.taskGroupMeta)) {
    thread.taskGroupMeta = {};
  }
  for (const [taskGroupId, signal] of signals.entries()) {
    if (!signal.lastReceiptTitle && !signal.lastUserPromptTitle) continue;
    const existing = thread.taskGroupMeta[taskGroupId] && typeof thread.taskGroupMeta[taskGroupId] === "object"
      ? thread.taskGroupMeta[taskGroupId]
      : {};
    const next = Object.assign({}, existing, {
      pluginTopic: Boolean(existing.pluginTopic || taskGroupId.startsWith("plugin:")),
      updatedAt: signal.lastReceiptAt || signal.lastUserPromptAt || signal.updatedAt || existing.updatedAt || "",
      createdAt: existing.createdAt || signal.lastUserPromptAt || signal.lastReceiptAt || signal.updatedAt || "",
    });
    if (signal.lastReceiptTitle) next.lastReceiptTitle = signal.lastReceiptTitle;
    if (signal.lastUserPromptTitle) next.lastUserPromptTitle = signal.lastUserPromptTitle;
    if (signal.lastMessageId) next.lastMessageId = signal.lastMessageId;
    if (JSON.stringify(existing) === JSON.stringify(next)) continue;
    thread.taskGroupMeta[taskGroupId] = next;
    changed += 1;
  }
  return changed;
}

function backfill(options) {
  const db = new DatabaseSync(options.dbPath, { open: true, readOnly: !options.write });
  const stats = {
    scannedThreads: 0,
    scannedMessages: 0,
    changedThreads: 0,
    changedTaskGroups: 0,
  };
  const samples = [];
  const changedRows = [];
  const stateRows = [];
  try {
    const rows = db.prepare(`
      SELECT id, workspace_id, task_group_meta_json, raw_json
      FROM threads
      WHERE COALESCE(raw_json, '') <> ''
      ORDER BY updated_at DESC
    `).all();
    for (const row of rows) {
      stats.scannedThreads += 1;
      const thread = normalizeThread(row);
      const before = JSON.stringify(thread.taskGroupMeta || {});
      const signals = latestTopicSignals(thread, options.scanLimitPerThread);
      stats.scannedMessages += signals.scanned;
      const changedTaskGroups = applySignalsToMeta(thread, signals.groups);
      stateRows.push({ id: row.id, taskGroupMeta: thread.taskGroupMeta || {} });
      if (!changedTaskGroups) continue;
      const after = JSON.stringify(thread.taskGroupMeta || {});
      if (before === after) continue;
      stats.changedThreads += 1;
      stats.changedTaskGroups += changedTaskGroups;
      changedRows.push({
        id: row.id,
        taskGroupMeta: thread.taskGroupMeta,
        taskGroupMetaJson: after,
        rawJson: JSON.stringify(Object.assign({}, parseJson(row.raw_json, {}) || {}, { taskGroupMeta: thread.taskGroupMeta })),
      });
      if (samples.length < options.sampleLimit) {
        samples.push({
          threadId: row.id,
          workspaceId: thread.workspaceId || row.workspace_id || "",
          changedTaskGroups,
          sampleGroups: [...signals.groups.values()]
            .filter((item) => item.lastReceiptTitle || item.lastUserPromptTitle)
            .slice(0, 5)
            .map((item) => ({
              taskGroupId: item.taskGroupId,
              lastReceiptTitle: item.lastReceiptTitle || "",
              lastUserPromptTitle: item.lastUserPromptTitle || "",
            })),
        });
      }
    }
    let backups = [];
    let stateSync = { checked: false, changed: false };
    if (options.write && (changedRows.length || options.syncStateFile)) {
      const stamp = timestamp();
      backups = changedRows.length ? backupDatabaseFiles(options.dbPath, options.root, stamp) : [];
      if (options.syncStateFile) backups.push(...backupStateFile(options.root, stamp));
      if (changedRows.length) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const update = db.prepare("UPDATE threads SET task_group_meta_json = ?, raw_json = ? WHERE id = ?");
          for (const row of changedRows) update.run(row.taskGroupMetaJson, row.rawJson, row.id);
          db.exec("COMMIT");
        } catch (error) {
          try {
            db.exec("ROLLBACK");
          } catch (_) {}
          throw error;
        }
      }
      if (options.syncStateFile) stateSync = syncStateFileTaskGroupMeta(options.root, stateRows);
    }
    return {
      ok: true,
      mode: options.write ? "write" : "dry-run",
      wrote: Boolean(options.write && changedRows.length),
      changed: changedRows.length > 0,
      dbPath: compactPath(options.dbPath, options.root),
      stats,
      backups,
      stateSync,
      samples,
    };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = backfill(options);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`ok=${result.ok} mode=${result.mode} changedThreads=${result.stats.changedThreads} changedTaskGroups=${result.stats.changedTaskGroups}`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  applySignalsToMeta,
  backfill,
  compactPath,
  latestTopicSignals,
  normalizeThread,
  parseArgs,
};
