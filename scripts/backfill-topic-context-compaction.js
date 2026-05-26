"use strict";

const path = require("node:path");
const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const { createTopicContextCompactionService } = require("../adapters/topic-context-compaction-service");

function argValue(args, name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => String(arg || "").startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function defaultDbPath(args) {
  const explicit = argValue(args, "--db-path", "");
  if (explicit) return path.resolve(explicit);
  const dataDir = argValue(args, "--data-dir", process.env.HERMES_WEB_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web"));
  return path.resolve(process.env.HERMES_WEB_DB_PATH || path.join(dataDir, "hermes-mobile.sqlite3"));
}

function cleanString(value) {
  return String(value || "").trim();
}

function taskGroupsForThread(thread = {}) {
  const groups = new Map();
  for (const message of Array.isArray(thread.messages) ? thread.messages : []) {
    if (message.status === "running") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (!cleanString(message.content)) continue;
    const groupId = cleanString(message.taskGroupId) || "chat";
    groups.set(groupId, (groups.get(groupId) || 0) + 1);
  }
  return [...groups.entries()].map(([taskGroupId, messageCount]) => ({ taskGroupId, messageCount }));
}

function main() {
  const args = process.argv.slice(2);
  const write = hasFlag(args, "--write");
  const dbPath = defaultDbPath(args);
  const workspaceFilter = cleanString(argValue(args, "--workspace-id", ""));
  const threadFilter = cleanString(argValue(args, "--thread-id", ""));
  const taskGroupFilter = cleanString(argValue(args, "--task-group-id", ""));
  const limit = Math.max(1, Math.min(5000, Number(argValue(args, "--limit", "500")) || 500));
  const store = createMobileSqliteStore({ dbPath });
  if (write) store.migrate();
  const state = store.exportRuntimeState();
  const service = createTopicContextCompactionService({
    store: write ? store : null,
    nowIso: () => new Date().toISOString(),
  });
  const rows = [];
  let scannedThreads = 0;
  let scannedGroups = 0;
  let changed = 0;
  let skipped = 0;
  for (const thread of Array.isArray(state.threads) ? state.threads : []) {
    if (workspaceFilter && cleanString(thread.workspaceId) !== workspaceFilter) continue;
    if (threadFilter && cleanString(thread.id) !== threadFilter) continue;
    if (scannedThreads >= limit) break;
    scannedThreads += 1;
    for (const group of taskGroupsForThread(thread)) {
      if (taskGroupFilter && group.taskGroupId !== taskGroupFilter) continue;
      scannedGroups += 1;
      const result = service.compactTaskGroup(thread, group.taskGroupId, { reason: "manual-backfill", force: write });
      if (result.changed) changed += 1;
      else skipped += 1;
      rows.push({
        threadId: cleanString(thread.id),
        workspaceId: cleanString(thread.workspaceId),
        singleWindow: Boolean(thread.singleWindow),
        taskGroupId: group.taskGroupId,
        messageCount: group.messageCount,
        action: write ? (result.changed ? "written" : result.reason || "skipped") : "dry-run",
      });
    }
  }
  const output = {
    ok: true,
    mode: write ? "write" : "dry-run",
    dbPath,
    scannedThreads,
    scannedGroups,
    changed,
    skipped,
    rows: rows.slice(0, 80),
    truncatedRows: Math.max(0, rows.length - 80),
  };
  console.log(JSON.stringify(output, null, 2));
  store.close();
}

if (require.main === module) {
  main();
}

module.exports = {
  taskGroupsForThread,
};
