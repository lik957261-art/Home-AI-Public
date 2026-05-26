"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const defaultDataDir = process.env.HERMES_WEB_DATA_DIR
    || process.env.HERMES_MOBILE_DATA_DIR
    || (process.platform === "win32" ? "C:\\ProgramData\\HermesMobile\\data" : "");
  const out = {
    dataDir: defaultDataDir,
    dryRun: false,
    backup: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] || "";
    if (arg === "--data-dir") out.dataDir = next();
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--no-backup") out.backup = false;
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage: node scripts/unlink-kanban-case-topics.js --data-dir <HermesMobileDataDir> [options]",
    "",
    "Options:",
    "  --dry-run       Count unlink operations without writing data.",
    "  --no-backup     Skip file backups before writing. Not recommended for production.",
    "",
    "This script removes card-to-topic bindings while preserving cards, topic threads, messages, and shared directories.",
  ].join("\n"));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseJson(text, fallback = null) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function topicFieldPresent(item = {}) {
  return Boolean(
    cleanString(item.topicThreadId)
    || cleanString(item.topic_thread_id)
    || cleanString(item.topicTaskGroupId)
    || cleanString(item.topic_task_group_id)
  );
}

function clearTopicFields(item = {}) {
  let changed = false;
  for (const key of ["topicThreadId", "topic_thread_id", "topicTaskGroupId", "topic_task_group_id"]) {
    if (Object.prototype.hasOwnProperty.call(item, key) && item[key]) {
      item[key] = "";
      changed = true;
    }
  }
  if (item.topic && typeof item.topic === "object") {
    for (const key of ["threadId", "thread_id", "taskGroupId", "task_group_id", "topicThreadId", "topicTaskGroupId"]) {
      if (Object.prototype.hasOwnProperty.call(item.topic, key) && item.topic[key]) {
        item.topic[key] = "";
        changed = true;
      }
    }
  }
  return changed;
}

function backupFiles(dataDir, files) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const backupDir = path.join(dataDir, "backups", `unlink-kanban-case-topics-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const copied = [];
  for (const filePath of files) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const name = path.basename(filePath);
    const target = path.join(backupDir, name);
    fs.copyFileSync(filePath, target);
    copied.push(target);
  }
  return { backupDir, copied };
}

function topicRows(db) {
  return db.prepare(`
    SELECT id, topic_thread_id, topic_task_group_id, raw_json
    FROM kanban_case_shares
    WHERE COALESCE(topic_thread_id, '') <> ''
       OR COALESCE(topic_task_group_id, '') <> ''
  `).all();
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(",");
}

function clearTaskGroupMetaJson(text, taskGroupIds) {
  const meta = parseJson(text, null);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return { text, removed: 0 };
  let removed = 0;
  for (const id of taskGroupIds) {
    if (Object.prototype.hasOwnProperty.call(meta, id)) {
      delete meta[id];
      removed += 1;
    }
  }
  return { text: JSON.stringify(meta), removed };
}

function countJsonBindings(dataDir) {
  const todoMeta = readJson(path.join(dataDir, "kanban-todo-meta.json"), {});
  const caseShares = readJson(path.join(dataDir, "kanban-case-shares.json"), {});
  const cache = readJson(path.join(dataDir, "kanban-card-list-cache.json"), {});
  let todoMetaBindings = 0;
  for (const todo of Object.values(todoMeta.todos || {})) {
    if (topicFieldPresent(todo)) todoMetaBindings += 1;
  }
  let caseShareBindings = 0;
  for (const share of Object.values(caseShares.cases || {})) {
    if (topicFieldPresent(share)) caseShareBindings += 1;
  }
  let cacheBindings = 0;
  for (const entry of Object.values(cache.entries || {})) {
    const payload = entry?.payload || {};
    const arrays = [payload.cards, payload.todos, payload.items, payload.result?.todos, payload.data]
      .filter(Array.isArray);
    for (const array of arrays) {
      for (const item of array) {
        if (topicFieldPresent(item)) cacheBindings += 1;
      }
    }
  }
  return { todoMetaBindings, caseShareBindings, cacheBindings };
}

function clearJsonStores(dataDir, dryRun) {
  const counts = countJsonBindings(dataDir);
  if (dryRun) return Object.assign({ cacheDeleted: false }, counts);

  const todoMetaPath = path.join(dataDir, "kanban-todo-meta.json");
  const todoMeta = readJson(todoMetaPath, null);
  if (todoMeta && todoMeta.todos) {
    for (const todo of Object.values(todoMeta.todos)) clearTopicFields(todo);
    todoMeta.updatedAt = new Date().toISOString();
    writeJson(todoMetaPath, todoMeta);
  }

  const caseSharesPath = path.join(dataDir, "kanban-case-shares.json");
  const caseShares = readJson(caseSharesPath, null);
  if (caseShares && caseShares.cases) {
    for (const share of Object.values(caseShares.cases)) clearTopicFields(share);
    caseShares.updatedAt = new Date().toISOString();
    writeJson(caseSharesPath, caseShares);
  }

  const cachePath = path.join(dataDir, "kanban-card-list-cache.json");
  let cacheDeleted = false;
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
    cacheDeleted = true;
  }

  return Object.assign({ cacheDeleted }, counts);
}

function unlinkSqlite(dataDir, dryRun) {
  const dbPath = path.join(dataDir, "hermes-mobile.sqlite3");
  const db = new DatabaseSync(dbPath);
  try {
    const rows = topicRows(db);
    const pairs = rows
      .map((row) => ({
        threadId: cleanString(row.topic_thread_id),
        groupId: cleanString(row.topic_task_group_id),
      }))
      .filter((row) => row.threadId || row.groupId);
    const taskGroupIds = Array.from(new Set(pairs.map((row) => row.groupId).filter(Boolean)));
    const topicPairRows = pairs.filter((row) => row.threadId && row.groupId);

    let topicContextSummaries = 0;
    let topicContextRefs = 0;
    let messageRows = 0;
    let threadMetaEntries = 0;
    if (topicPairRows.length) {
      for (const pair of topicPairRows) {
        topicContextSummaries += db.prepare(
          "SELECT COUNT(*) AS count FROM topic_context_summaries WHERE topic_id = ? AND task_group_id = ?",
        ).get(pair.threadId, pair.groupId).count;
        topicContextRefs += db.prepare(
          "SELECT COUNT(*) AS count FROM topic_context_refs WHERE topic_id = ? AND task_group_id = ?",
        ).get(pair.threadId, pair.groupId).count;
      }
    }
    if (taskGroupIds.length) {
      const groupSql = placeholders(taskGroupIds.length);
      messageRows = db.prepare(`SELECT COUNT(*) AS count FROM messages WHERE task_group_id IN (${groupSql})`)
        .get(...taskGroupIds).count;
      const threadRows = db.prepare("SELECT id, task_group_meta_json FROM threads WHERE COALESCE(task_group_meta_json, '') <> ''")
        .all();
      for (const thread of threadRows) {
        threadMetaEntries += clearTaskGroupMetaJson(thread.task_group_meta_json, taskGroupIds).removed;
      }
    }

    const summary = {
      shareRows: rows.length,
      taskGroupIds: taskGroupIds.length,
      topicContextSummaries,
      topicContextRefs,
      messageRows,
      threadMetaEntries,
    };
    if (dryRun || !rows.length) return summary;

    db.exec("BEGIN IMMEDIATE;");
    try {
      const now = new Date().toISOString();
      const updateShare = db.prepare(`
        UPDATE kanban_case_shares
        SET topic_thread_id = '',
            topic_task_group_id = '',
            raw_json = ?,
            updated_at = ?
        WHERE id = ?
      `);
      for (const row of rows) {
        const raw = parseJson(row.raw_json, {});
        clearTopicFields(raw);
        updateShare.run(JSON.stringify(raw), now, row.id);
      }

      if (taskGroupIds.length) {
        const updateThread = db.prepare("UPDATE threads SET task_group_meta_json = ?, updated_at = ? WHERE id = ?");
        const threadRows = db.prepare("SELECT id, task_group_meta_json FROM threads WHERE COALESCE(task_group_meta_json, '') <> ''")
          .all();
        for (const thread of threadRows) {
          const cleared = clearTaskGroupMetaJson(thread.task_group_meta_json, taskGroupIds);
          if (cleared.removed) updateThread.run(cleared.text, now, thread.id);
        }
        const groupSql = placeholders(taskGroupIds.length);
        db.prepare(`UPDATE messages SET task_group_id = '', updated_at = ? WHERE task_group_id IN (${groupSql})`)
          .run(now, ...taskGroupIds);
      }

      for (const pair of topicPairRows) {
        db.prepare("DELETE FROM topic_context_summaries WHERE topic_id = ? AND task_group_id = ?")
          .run(pair.threadId, pair.groupId);
        db.prepare("DELETE FROM topic_context_refs WHERE topic_id = ? AND task_group_id = ?")
          .run(pair.threadId, pair.groupId);
      }
      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
    return summary;
  } finally {
    db.close();
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.dataDir) throw new Error("--data-dir is required");
  const dataDir = path.resolve(args.dataDir);
  const files = [
    path.join(dataDir, "hermes-mobile.sqlite3"),
    path.join(dataDir, "hermes-mobile.sqlite3-wal"),
    path.join(dataDir, "hermes-mobile.sqlite3-shm"),
    path.join(dataDir, "kanban-todo-meta.json"),
    path.join(dataDir, "kanban-case-shares.json"),
    path.join(dataDir, "kanban-card-list-cache.json"),
  ];
  const backup = (!args.dryRun && args.backup) ? backupFiles(dataDir, files) : null;
  const sqlite = unlinkSqlite(dataDir, args.dryRun);
  const json = clearJsonStores(dataDir, args.dryRun);
  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    dataDir,
    backupDir: backup?.backupDir || "",
    backupFileCount: backup?.copied?.length || 0,
    sqlite,
    json,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    process.exit(1);
  }
}
