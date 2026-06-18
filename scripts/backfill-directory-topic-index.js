"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createDirectoryTopicIndexService } = require("../adapters/directory-topic-index-service");

const DEFAULT_ROOT = "/Users/example/path";

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dbPath: "",
    write: false,
    json: false,
    sampleLimit: 20,
    scanLimitPerThread: 10000,
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
        "Usage: node scripts/backfill-directory-topic-index.js [options]",
        "  --root <dir>                 Mac production root, default /Users/example/path",
        "  --db <file>                  SQLite DB path, default <root>/data/hermes-mobile.sqlite3",
        "  --write                      Apply directory topic index updates",
        "  --scan-limit-per-thread <n>  Maximum raw messages scanned per thread, default 10000",
        "  --sample-limit <n>           Maximum bounded samples in output, default 20",
        "  --no-sync-state              Do not synchronize data/state.json taskGroupMeta in write mode",
        "  --json                       Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  if (!out.dbPath) out.dbPath = path.join(out.root, "data", "hermes-mobile.sqlite3");
  if (!Number.isFinite(out.sampleLimit) || out.sampleLimit < 0) out.sampleLimit = 20;
  if (!Number.isFinite(out.scanLimitPerThread) || out.scanLimitPerThread <= 0) out.scanLimitPerThread = 10000;
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

function nowIso() {
  return new Date().toISOString();
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
  const backupDir = path.join(root, "data", "backups", `directory-topic-index-backfill-${stamp}`);
  return ["", "-wal", "-shm"]
    .map((suffix) => copyIfExists(`${dbPath}${suffix}`, backupDir))
    .filter(Boolean)
    .map((file) => compactPath(file, root));
}

function backupStateFile(root, stamp) {
  const backupDir = path.join(root, "data", "backups", `directory-topic-index-backfill-${stamp}`);
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

function sqliteTableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(String(tableName || ""));
  return Boolean(row?.name);
}

function sqliteColumnNames(db, tableName) {
  if (!sqliteTableExists(db, tableName)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info("${String(tableName).replaceAll('"', '""')}")`).all()
    .map((row) => String(row?.name || ""))
    .filter(Boolean));
}

function sqliteTableCount(db, tableName) {
  if (!sqliteTableExists(db, tableName)) return 0;
  const row = db.prepare(`SELECT COUNT(*) AS count FROM "${String(tableName).replaceAll('"', '""')}"`).get();
  return Number(row?.count || 0);
}

function updateRuntimeStateSaveMeta(db) {
  if (!sqliteTableExists(db, "meta")) return { checked: false, changed: false, reason: "missing-meta-table" };
  const savedAt = nowIso();
  const counts = {
    threads: sqliteTableCount(db, "threads"),
    messages: sqliteTableCount(db, "messages"),
    artifacts: sqliteTableCount(db, "artifacts"),
    pushSubscriptions: sqliteTableCount(db, "push_subscriptions"),
    pushReceipts: sqliteTableCount(db, "push_receipts"),
    pushDeliveries: sqliteTableCount(db, "push_deliveries"),
    voiceInputCorrections: sqliteTableCount(db, "voice_input_corrections"),
    voiceInputPhrases: sqliteTableCount(db, "voice_input_phrasebook"),
    voiceInputAudit: sqliteTableCount(db, "voice_input_audit"),
  };
  db.prepare(`
    INSERT INTO meta(key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run("lastRuntimeStateSave", JSON.stringify({ savedAt, counts }), savedAt);
  return { checked: true, changed: true, savedAt, counts };
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

function messageFromRow(row = {}) {
  const raw = parseJson(row.raw_json, null);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return Object.assign({}, raw, {
    id: String(raw.id || row.id || ""),
    taskGroupId: String(raw.taskGroupId || row.task_group_id || ""),
    directoryRoute: raw.directoryRoute || parseJson(row.directory_route_json, null),
  });
  return {
    id: String(row.id || ""),
    role: String(row.role || ""),
    status: String(row.status || ""),
    taskGroupId: String(row.task_group_id || ""),
    messageKind: String(row.message_kind || ""),
    senderWorkspaceId: String(row.sender_workspace_id || ""),
    senderPrincipalId: String(row.sender_principal_id || ""),
    senderLabel: String(row.sender_label || ""),
    replyToMessageId: String(row.reply_to_message_id || ""),
    runId: String(row.run_id || ""),
    taskId: String(row.task_id || ""),
    reasoningEffort: String(row.reasoning_effort || ""),
    content: String(row.content || ""),
    artifacts: parseJson(row.artifacts_json, []),
    directoryRoute: parseJson(row.directory_route_json, null),
    directoryAliases: parseJson(row.directory_aliases_json, []),
    usage: parseJson(row.usage_json, null),
    runOptions: parseJson(row.run_options_json, null),
    error: String(row.error || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    submittedAt: String(row.submitted_at || ""),
    queuedAt: String(row.queued_at || ""),
    startedAt: String(row.started_at || ""),
    firstFeedbackAt: String(row.first_feedback_at || ""),
    completedAt: String(row.completed_at || ""),
    failedAt: String(row.failed_at || ""),
    cancelledAt: String(row.cancelled_at || ""),
    revokedAt: String(row.revoked_at || ""),
  };
}

function loadMessagesByThread(db) {
  if (!sqliteTableExists(db, "messages")) return new Map();
  const out = new Map();
  const columns = sqliteColumnNames(db, "messages");
  const orderColumns = ["thread_id", "position", "created_at", "id"]
    .filter((name) => columns.has(name))
    .map((name) => `"${name}"`);
  const rows = db.prepare(`SELECT * FROM messages${orderColumns.length ? ` ORDER BY ${orderColumns.join(", ")}` : ""}`).all();
  for (const row of rows) {
    const threadId = String(row.thread_id || "");
    if (!threadId) continue;
    const list = out.get(threadId) || [];
    list.push(messageFromRow(row));
    out.set(threadId, list);
  }
  return out;
}

function backfill(options) {
  const service = createDirectoryTopicIndexService({
    isConversationTaskGroupId: (value) => ["chat", "group-chat", "weixin-chat"].includes(String(value || "")),
  });
  const db = new DatabaseSync(options.dbPath, { open: true, readOnly: !options.write });
  const stats = {
    scannedThreads: 0,
    scannedMessages: 0,
    changedThreads: 0,
    changedIndexRows: 0,
  };
  const samples = [];
  const changedRows = [];
  try {
    const messagesByThread = loadMessagesByThread(db);
    const rows = db.prepare(`
      SELECT id, workspace_id, task_group_meta_json, raw_json
      FROM threads
      WHERE COALESCE(raw_json, '') <> ''
      ORDER BY updated_at DESC
    `).all();
    for (const row of rows) {
      stats.scannedThreads += 1;
      const thread = normalizeThread(row);
      const sqliteMessages = messagesByThread.get(row.id) || [];
      if (sqliteMessages.length) thread.messages = sqliteMessages;
      const before = JSON.stringify(thread.taskGroupMeta || {});
      const result = service.repairThreadIndexFromMessages(thread, { limit: options.scanLimitPerThread });
      stats.scannedMessages += result.scanned;
      if (!result.updated) continue;
      const after = JSON.stringify(thread.taskGroupMeta || {});
      if (before === after) continue;
      stats.changedThreads += 1;
      stats.changedIndexRows += result.updated;
      changedRows.push({
        id: row.id,
        taskGroupMeta: thread.taskGroupMeta,
        taskGroupMetaJson: after,
        rawJson: JSON.stringify(Object.assign({}, parseJson(row.raw_json, {}) || {}, { taskGroupMeta: thread.taskGroupMeta })),
      });
      if (samples.length < options.sampleLimit) {
        const collections = service.listCollections(thread, { limitDirectories: 5, topicsPerDirectory: 3 });
        samples.push({
          threadId: row.id,
          workspaceId: thread.workspaceId || row.workspace_id || "",
          changedIndexRows: result.updated,
          collections: collections.map((collection) => ({
            key: collection.key,
            label: collection.label,
            topicCount: collection.topicCount,
            sampleTopicIds: collection.groups.map((group) => group.id),
          })),
        });
      }
    }
    let backups = [];
    let stateBackups = [];
    let stateSync = { checked: false, changed: false };
    let runtimeStateMeta = { checked: false, changed: false };
    const shouldSyncStateFile = options.syncStateFile !== false;
    if (options.write && changedRows.length) {
      const stamp = timestamp();
      backups = backupDatabaseFiles(options.dbPath, options.root, stamp);
      if (shouldSyncStateFile) stateBackups = backupStateFile(options.root, stamp);
      db.exec("BEGIN IMMEDIATE");
      try {
        const update = db.prepare("UPDATE threads SET task_group_meta_json = ?, raw_json = ? WHERE id = ?");
        for (const row of changedRows) update.run(row.taskGroupMetaJson, row.rawJson, row.id);
        runtimeStateMeta = updateRuntimeStateSaveMeta(db);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch (_) {}
        throw error;
      }
      if (shouldSyncStateFile) stateSync = syncStateFileTaskGroupMeta(options.root, changedRows);
    }
    return {
      ok: true,
      mode: options.write ? "write" : "dry-run",
      wrote: Boolean(options.write && changedRows.length),
      changed: changedRows.length > 0,
      dbPath: compactPath(options.dbPath, options.root),
      stats,
      backups,
      stateBackups,
      stateSync,
      runtimeStateMeta,
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
    else console.log(`ok=${result.ok} mode=${result.mode} changedThreads=${result.stats.changedThreads} changedIndexRows=${result.stats.changedIndexRows}`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  backfill,
  compactPath,
  normalizeThread,
  parseArgs,
  updateRuntimeStateSaveMeta,
};
