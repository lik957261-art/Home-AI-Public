"use strict";

const { CURRENT_SCHEMA_VERSION } = require("./mobile-sqlite-store");

const CASE_SHARE_FIELDS = [
  "schemaVersion",
  "ownerWorkspaceId",
  "workspaceId",
  "caseId",
  "caseMode",
  "performerWorkspaceId",
  "performerWorkspaceIds",
  "viewerWorkspaceIds",
  "managerWorkspaceIds",
  "topicThreadId",
  "topicTaskGroupId",
  "sharedDirectoryPath",
  "caseDirectoryPath",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "deletedAt",
];

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function own(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function stringList(value, limit = 100) {
  let source = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        source = JSON.parse(trimmed);
      } catch (_) {
        source = trimmed;
      }
    }
  }
  const raw = Array.isArray(source)
    ? source
    : (source && typeof source === "object" ? Object.values(source) : String(source || "").split(/[,\n;\s]+/));
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function firstString(source, names, fallback = "") {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = cleanString(source[name]);
    if (value) return value;
  }
  return fallback;
}

function firstList(source, names, fallback = []) {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const values = stringList(source[name]);
    if (values.length) return values;
  }
  return fallback;
}

function increment(map, rawKey) {
  const key = cleanString(rawKey) || "unknown";
  map[key] = (map[key] || 0) + 1;
}

function caseShareKey(ownerWorkspaceId, caseId) {
  return `${cleanString(ownerWorkspaceId) || "owner"}::${cleanString(caseId)}`;
}

function caseShareKeyParts(value) {
  const text = cleanString(value);
  const match = text.match(/^([^:]+)::(.+)$/);
  return match ? { ownerWorkspaceId: match[1], caseId: match[2] } : { ownerWorkspaceId: "", caseId: text };
}

function publicCaseShare(row = {}) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const field of CASE_SHARE_FIELDS) {
    if (!own(row, field)) continue;
    out[field] = Array.isArray(row[field]) ? stringList(row[field]) : cleanString(row[field]);
  }
  out.schemaVersion = Number(out.schemaVersion || 1);
  out.ownerWorkspaceId = cleanString(out.ownerWorkspaceId || out.workspaceId || "owner");
  out.workspaceId = cleanString(out.workspaceId || out.ownerWorkspaceId || "owner");
  out.caseId = cleanString(out.caseId);
  out.caseMode = cleanString(out.caseMode);
  out.performerWorkspaceIds = stringList(out.performerWorkspaceIds);
  out.performerWorkspaceId = cleanString(out.performerWorkspaceId || out.performerWorkspaceIds[0] || "");
  if (out.performerWorkspaceId && !out.performerWorkspaceIds.includes(out.performerWorkspaceId)) {
    out.performerWorkspaceIds.unshift(out.performerWorkspaceId);
  }
  out.viewerWorkspaceIds = stringList(out.viewerWorkspaceIds)
    .filter((id) => id !== out.ownerWorkspaceId && !out.performerWorkspaceIds.includes(id));
  out.managerWorkspaceIds = stringList(out.managerWorkspaceIds)
    .filter((id) => id !== out.ownerWorkspaceId && !out.performerWorkspaceIds.includes(id));
  out.topicThreadId = cleanString(out.topicThreadId);
  out.topicTaskGroupId = cleanString(out.topicTaskGroupId);
  out.sharedDirectoryPath = cleanString(out.sharedDirectoryPath);
  out.caseDirectoryPath = cleanString(out.caseDirectoryPath);
  out.createdAt = cleanString(out.createdAt);
  out.updatedAt = cleanString(out.updatedAt);
  out.archivedAt = cleanString(out.archivedAt);
  out.deletedAt = cleanString(out.deletedAt);
  return out;
}

function normalizeCaseShareInput(ownerWorkspaceId, caseId, input = {}, previous = {}) {
  let source = input && typeof input === "object" ? input : {};
  let owner = cleanString(ownerWorkspaceId);
  let targetCaseId = cleanString(caseId);
  if (arguments.length === 1 && ownerWorkspaceId && typeof ownerWorkspaceId === "object") {
    source = ownerWorkspaceId;
    owner = "";
    targetCaseId = "";
  }
  const topic = source.topic && typeof source.topic === "object" ? source.topic : {};
  const idParts = caseShareKeyParts(source.id);
  const performerIds = firstList(source, [
    "performerWorkspaceIds",
    "performer_workspace_ids",
    "performer_workspace_ids_json",
  ], []);
  const performerId = firstString(source, [
    "performerWorkspaceId",
    "performer_workspace_id",
    "assigneeWorkspaceId",
    "assignee_workspace_id",
  ], performerIds[0] || previous.performerWorkspaceId || "");
  const normalized = publicCaseShare({
    schemaVersion: 1,
    ownerWorkspaceId: owner || firstString(source, ["ownerWorkspaceId", "owner_workspace_id", "workspaceId", "workspace_id"], previous.ownerWorkspaceId || idParts.ownerWorkspaceId || "owner"),
    workspaceId: firstString(source, ["workspaceId", "workspace_id", "ownerWorkspaceId", "owner_workspace_id"], previous.workspaceId || previous.ownerWorkspaceId || owner || "owner"),
    caseId: targetCaseId || firstString(source, ["caseId", "case_id", "kanbanCaseId", "kanban_case_id"], previous.caseId || idParts.caseId),
    caseMode: firstString(source, ["caseMode", "case_mode", "kanbanCaseMode", "kanban_case_mode", "mode"], previous.caseMode),
    performerWorkspaceId: performerId,
    performerWorkspaceIds: performerIds.length ? performerIds : stringList(previous.performerWorkspaceIds),
    viewerWorkspaceIds: firstList(source, ["viewerWorkspaceIds", "viewer_workspace_ids", "viewer_workspace_ids_json"], previous.viewerWorkspaceIds || []),
    managerWorkspaceIds: firstList(source, ["managerWorkspaceIds", "manager_workspace_ids", "manager_workspace_ids_json"], previous.managerWorkspaceIds || []),
    topicThreadId: firstString(source, ["topicThreadId", "topic_thread_id"], firstString(topic, ["topicThreadId", "threadId", "thread_id"], previous.topicThreadId)),
    topicTaskGroupId: firstString(source, ["topicTaskGroupId", "topic_task_group_id"], firstString(topic, ["topicTaskGroupId", "taskGroupId", "task_group_id"], previous.topicTaskGroupId)),
    sharedDirectoryPath: firstString(source, ["sharedDirectoryPath", "shared_directory_path"], firstString(topic, ["sharedDirectoryPath", "shared_directory_path"], previous.sharedDirectoryPath)),
    caseDirectoryPath: firstString(source, ["caseDirectoryPath", "case_directory_path"], firstString(topic, ["caseDirectoryPath", "case_directory_path"], previous.caseDirectoryPath)),
    createdAt: firstString(source, ["createdAt", "created_at"], previous.createdAt),
    updatedAt: firstString(source, ["updatedAt", "updated_at"], previous.updatedAt),
    archivedAt: firstString(source, ["archivedAt", "archived_at"], previous.archivedAt),
    deletedAt: firstString(source, ["deletedAt", "deleted_at"], previous.deletedAt),
  });
  if (!normalized.caseId) {
    const err = new Error("Kanban case share requires a caseId");
    err.status = 400;
    throw err;
  }
  return normalized;
}

function caseShareActorCanSee(share, actorWorkspaceId) {
  const actor = cleanString(actorWorkspaceId);
  if (!actor) return true;
  return actor === share.ownerWorkspaceId
    || actor === share.workspaceId
    || actor === share.performerWorkspaceId
    || share.performerWorkspaceIds.includes(actor)
    || share.viewerWorkspaceIds.includes(actor)
    || share.managerWorkspaceIds.includes(actor);
}

function rowsFromCaseShareSnapshot(snapshot = {}) {
  const source = snapshot.kanbanCaseShares
    || snapshot.caseShares
    || snapshot.cases
    || snapshot.kanban_case_shares
    || {};
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object") {
    return Object.entries(source).map(([id, row]) => Object.assign({ id }, row || {}));
  }
  return [];
}

function makeJsonCaseShareState(snapshot = {}) {
  const rows = new Map();
  for (const row of rowsFromCaseShareSnapshot(snapshot)) {
    const share = normalizeCaseShareInput(row);
    rows.set(caseShareKey(share.ownerWorkspaceId, share.caseId), share);
  }
  return rows;
}

function publicCaseShareList(rows, filters = {}) {
  const includeDeleted = Boolean(filters.includeDeleted);
  const ownerWorkspaceId = cleanString(filters.ownerWorkspaceId || filters.owner_workspace_id);
  const actorWorkspaceId = cleanString(filters.actorWorkspaceId || filters.actor_workspace_id);
  const caseMode = cleanString(filters.caseMode || filters.case_mode);
  return Array.from(rows)
    .map(publicCaseShare)
    .filter((share) => includeDeleted || !share.deletedAt)
    .filter((share) => !ownerWorkspaceId || share.ownerWorkspaceId === ownerWorkspaceId)
    .filter((share) => !caseMode || share.caseMode === caseMode)
    .filter((share) => caseShareActorCanSee(share, actorWorkspaceId))
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "") || a.caseId.localeCompare(b.caseId));
}

function summarizeJsonRuntimeSnapshot(snapshot = {}) {
  const threads = asArray(snapshot.threads);
  const stateArtifacts = asArray(snapshot.artifacts);
  const summary = {
    threads: {
      total: 0,
      singleWindow: 0,
      groupChat: 0,
      withActiveRun: 0,
      byWorkspace: {},
      byStatus: {},
    },
    messages: {
      total: 0,
      withArtifacts: 0,
      withError: 0,
      byWorkspace: {},
      byRole: {},
      byStatus: {},
      byKind: {},
    },
    artifacts: {
      total: 0,
      byWorkspace: {},
      byMime: {},
      bySource: {},
    },
    health: {
      ok: true,
      warnings: [],
    },
  };
  const threadIds = new Set();
  const messageIds = new Set();
  for (const thread of threads) {
    const threadId = cleanString(thread?.id);
    if (!threadId) summary.health.warnings.push("thread_without_id");
    if (threadId && threadIds.has(threadId)) summary.health.warnings.push("duplicate_thread_id");
    if (threadId) threadIds.add(threadId);
    summary.threads.total += 1;
    if (thread?.singleWindow) summary.threads.singleWindow += 1;
    if (thread?.chatGroup?.enabled) summary.threads.groupChat += 1;
    if (cleanString(thread?.activeRunId) || stringList(thread?.activeRunIds).length) summary.threads.withActiveRun += 1;
    increment(summary.threads.byWorkspace, thread?.workspaceId || thread?.workspace_id);
    increment(summary.threads.byStatus, thread?.status || thread?.state);
    for (const message of asArray(thread?.messages)) {
      const messageId = cleanString(message?.id);
      if (!messageId) summary.health.warnings.push("message_without_id");
      if (messageId && messageIds.has(messageId)) summary.health.warnings.push("duplicate_message_id");
      if (messageId) messageIds.add(messageId);
      summary.messages.total += 1;
      if (asArray(message?.artifacts).length) summary.messages.withArtifacts += 1;
      if (cleanString(message?.error)) summary.messages.withError += 1;
      increment(summary.messages.byWorkspace, message?.workspaceId || message?.workspace_id || message?.senderWorkspaceId || message?.sender_workspace_id || thread?.workspaceId);
      increment(summary.messages.byRole, message?.role);
      increment(summary.messages.byStatus, message?.status || message?.state);
      increment(summary.messages.byKind, message?.messageKind || message?.message_kind);
      for (const artifact of asArray(message?.artifacts)) {
        summary.artifacts.total += 1;
        increment(summary.artifacts.byWorkspace, artifact?.workspaceId || artifact?.workspace_id || thread?.workspaceId);
        increment(summary.artifacts.byMime, artifact?.mime || artifact?.mimeType || artifact?.mime_type);
        increment(summary.artifacts.bySource, artifact?.source);
      }
    }
  }
  for (const artifact of stateArtifacts) {
    summary.artifacts.total += 1;
    increment(summary.artifacts.byWorkspace, artifact?.workspaceId || artifact?.workspace_id);
    increment(summary.artifacts.byMime, artifact?.mime || artifact?.mimeType || artifact?.mime_type);
    increment(summary.artifacts.bySource, artifact?.source);
  }
  summary.health.ok = summary.health.warnings.length === 0;
  return summary;
}

function sqliteGroupedCounts(database, table, column) {
  const rows = database.prepare(`
    SELECT ${column} AS key, COUNT(*) AS count
    FROM ${table}
    GROUP BY ${column}
    ORDER BY count DESC, key
  `).all();
  const counts = {};
  for (const row of rows) {
    counts[cleanString(row.key) || "unknown"] = Number(row.count || 0);
  }
  return counts;
}

function summarizeSqliteRuntimeStore(store) {
  const database = store.open();
  const threadCounts = store.tableCounts ? store.tableCounts() : {};
  const threadRows = database.prepare(`
    SELECT
      SUM(CASE WHEN single_window = 1 THEN 1 ELSE 0 END) AS single_window,
      SUM(CASE WHEN active_run_id <> '' OR (active_run_ids_json IS NOT NULL AND active_run_ids_json <> '' AND active_run_ids_json <> '[]') THEN 1 ELSE 0 END) AS with_active_run
    FROM threads
  `).get();
  const groupChatRows = database.prepare("SELECT chat_group_json FROM threads WHERE chat_group_json IS NOT NULL AND chat_group_json <> ''").all();
  const messageRows = database.prepare(`
    SELECT
      SUM(CASE WHEN artifacts_json IS NOT NULL AND artifacts_json <> '' AND artifacts_json <> '[]' THEN 1 ELSE 0 END) AS with_artifacts,
      SUM(CASE WHEN error <> '' THEN 1 ELSE 0 END) AS with_error
    FROM messages
  `).get();
  return {
    threads: {
      total: Number(threadCounts.threads || 0),
      singleWindow: Number(threadRows?.single_window || 0),
      groupChat: groupChatRows.filter((row) => {
        try {
          return Boolean(JSON.parse(row.chat_group_json)?.enabled);
        } catch (_) {
          return false;
        }
      }).length,
      withActiveRun: Number(threadRows?.with_active_run || 0),
      byWorkspace: sqliteGroupedCounts(database, "threads", "workspace_id"),
      byStatus: sqliteGroupedCounts(database, "threads", "status"),
    },
    messages: {
      total: Number(threadCounts.messages || 0),
      withArtifacts: Number(messageRows?.with_artifacts || 0),
      withError: Number(messageRows?.with_error || 0),
      byWorkspace: sqliteGroupedCounts(database, "messages", "workspace_id"),
      byRole: sqliteGroupedCounts(database, "messages", "role"),
      byStatus: sqliteGroupedCounts(database, "messages", "status"),
      byKind: sqliteGroupedCounts(database, "messages", "message_kind"),
    },
    artifacts: {
      total: Number(threadCounts.artifacts || 0),
      byWorkspace: sqliteGroupedCounts(database, "artifacts", "workspace_id"),
      byMime: sqliteGroupedCounts(database, "artifacts", "mime"),
      bySource: sqliteGroupedCounts(database, "artifacts", "source"),
    },
    health: {
      ok: true,
      warnings: [],
    },
  };
}

function publicIntegritySummary(report = {}) {
  const counts = report.counts && typeof report.counts === "object" ? report.counts : {};
  return {
    ok: Boolean(report.ok),
    schemaVersion: Number(report.schemaVersion || 0),
    quickCheck: cleanString(report.quickCheck),
    foreignKeyIssueCount: Array.isArray(report.foreignKeyIssues) ? report.foreignKeyIssues.length : 0,
    counts: Object.assign({}, counts),
  };
}

function createRuntimeStateRepository(options = {}) {
  const store = options.store || null;
  const backendKind = store ? "sqlite-runtime-store" : "json-snapshot";
  let snapshot = cloneJson(options.snapshot || {});
  let jsonCaseShares = makeJsonCaseShareState(options.kanbanCaseShares || snapshot);

  function requireStoreMethod(name) {
    if (!store || typeof store[name] !== "function") {
      throw new Error(`SQLite runtime store does not implement ${name}`);
    }
    return store[name].bind(store);
  }

  function readSchemaSummary() {
    if (store) {
      const report = requireStoreMethod("integrityReport")();
      return {
        backendKind,
        expectedSchemaVersion: CURRENT_SCHEMA_VERSION,
        schemaVersion: Number(report.schemaVersion || 0),
        ok: Number(report.schemaVersion || 0) === CURRENT_SCHEMA_VERSION,
      };
    }
    return {
      backendKind,
      expectedSchemaVersion: 1,
      schemaVersion: Number(snapshot.schemaVersion || 1),
      ok: Number(snapshot.schemaVersion || 1) >= 1,
    };
  }

  function readIntegritySummary() {
    if (store) return publicIntegritySummary(requireStoreMethod("integrityReport")());
    const runtime = summarizeJsonRuntimeSnapshot(snapshot);
    return {
      ok: runtime.health.ok,
      schemaVersion: Number(snapshot.schemaVersion || 1),
      quickCheck: runtime.health.ok ? "ok" : "warnings",
      foreignKeyIssueCount: 0,
      counts: {
        kanban_case_shares: jsonCaseShares.size,
        threads: runtime.threads.total,
        messages: runtime.messages.total,
        artifacts: runtime.artifacts.total,
      },
      warnings: runtime.health.warnings.slice(0, 20),
    };
  }

  function readRuntimeHealthSummary() {
    const runtime = store ? summarizeSqliteRuntimeStore(store) : summarizeJsonRuntimeSnapshot(snapshot);
    return Object.assign({ backendKind }, runtime);
  }

  function listKanbanCaseShares(filters = {}) {
    if (store) return requireStoreMethod("listKanbanCaseShares")(filters).map(publicCaseShare);
    return publicCaseShareList(jsonCaseShares.values(), filters);
  }

  function getKanbanCaseShare(ownerWorkspaceId, caseId) {
    if (store) {
      const row = ownerWorkspaceId && typeof ownerWorkspaceId === "object"
        ? requireStoreMethod("getKanbanCaseShare")(ownerWorkspaceId)
        : requireStoreMethod("getKanbanCaseShare")(ownerWorkspaceId, caseId);
      return row ? publicCaseShare(row) : null;
    }
    const source = normalizeCaseShareInput({ ownerWorkspaceId, caseId });
    return publicCaseShare(jsonCaseShares.get(caseShareKey(source.ownerWorkspaceId, source.caseId)) || null);
  }

  function upsertKanbanCaseShare(ownerWorkspaceId, caseId, input = {}) {
    if (store) {
      const row = ownerWorkspaceId && typeof ownerWorkspaceId === "object"
        ? requireStoreMethod("upsertKanbanCaseShare")(ownerWorkspaceId)
        : requireStoreMethod("upsertKanbanCaseShare")(ownerWorkspaceId, caseId, input);
      return publicCaseShare(row);
    }
    const probe = normalizeCaseShareInput(ownerWorkspaceId, caseId, input);
    const key = caseShareKey(probe.ownerWorkspaceId, probe.caseId);
    const next = normalizeCaseShareInput(ownerWorkspaceId, caseId, input, jsonCaseShares.get(key) || {});
    jsonCaseShares.set(key, next);
    return publicCaseShare(next);
  }

  function deleteKanbanCaseShare(ownerWorkspaceId, caseId, options = {}) {
    if (store) {
      const row = ownerWorkspaceId && typeof ownerWorkspaceId === "object"
        ? requireStoreMethod("deleteKanbanCaseShare")(ownerWorkspaceId.ownerWorkspaceId, ownerWorkspaceId.caseId, caseId || {})
        : requireStoreMethod("deleteKanbanCaseShare")(ownerWorkspaceId, caseId, options);
      return row ? publicCaseShare(row) : null;
    }
    const source = normalizeCaseShareInput({ ownerWorkspaceId, caseId });
    const key = caseShareKey(source.ownerWorkspaceId, source.caseId);
    const previous = jsonCaseShares.get(key);
    if (!previous) return null;
    if (options.soft) {
      const next = publicCaseShare(Object.assign({}, previous, {
        deletedAt: cleanString(options.deletedAt || options.deleted_at || new Date().toISOString()),
        updatedAt: cleanString(options.updatedAt || options.updated_at || options.deletedAt || new Date().toISOString()),
      }));
      jsonCaseShares.set(key, next);
      return next;
    }
    jsonCaseShares.delete(key);
    return publicCaseShare(previous);
  }

  function replaceRuntimeState(nextSnapshot = {}) {
    if (store) return requireStoreMethod("replaceRuntimeState")(nextSnapshot);
    snapshot = cloneJson(nextSnapshot || {});
    jsonCaseShares = makeJsonCaseShareState(snapshot);
    return readRuntimeHealthSummary();
  }

  function exportKanbanCaseShares() {
    const cases = {};
    for (const share of listKanbanCaseShares({ includeDeleted: true })) {
      cases[caseShareKey(share.ownerWorkspaceId, share.caseId)] = share;
    }
    return { schemaVersion: 1, cases };
  }

  return {
    backendKind,
    deleteKanbanCaseShare,
    exportKanbanCaseShares,
    getKanbanCaseShare,
    listKanbanCaseShares,
    readIntegritySummary,
    readRuntimeHealthSummary,
    readSchemaSummary,
    replaceRuntimeState,
    upsertKanbanCaseShare,
  };
}

module.exports = {
  createRuntimeStateRepository,
  normalizeCaseShareInput,
  publicCaseShare,
  summarizeJsonRuntimeSnapshot,
  summarizeSqliteRuntimeStore,
};
