"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_MAX_THREADS = 24;
const DEFAULT_MAX_MESSAGES_PER_THREAD = 14;
const DEFAULT_MAX_EXCERPT_CHARS = 260;
const SUPPORTED_CONTEXT_TYPES = Object.freeze(["discussion_activity_daily"]);

function cleanString(value, maxLength = 4000) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function compactText(value, maxChars = 240) {
  const text = cleanString(value, Math.max(maxChars * 2, maxChars))
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

function dateKeyInShanghai(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function previousShanghaiDateKey(now = new Date()) {
  const current = dateKeyInShanghai(now);
  const [year, month, day] = current.split("-").map(Number);
  return dateKeyInShanghai(new Date(Date.UTC(year, month - 1, day, 12) - 24 * 60 * 60 * 1000));
}

function shanghaiDayUtcRange(dateKey) {
  const text = cleanString(dateKey, 40);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("date must use YYYY-MM-DD");
  const [year, month, day] = text.split("-").map(Number);
  return {
    startIso: new Date(Date.UTC(year, month - 1, day - 1, 16)).toISOString(),
    endIso: new Date(Date.UTC(year, month - 1, day, 16)).toISOString(),
  };
}

function normalizeContextType(value) {
  const type = cleanString(value, 120);
  if (!SUPPORTED_CONTEXT_TYPES.includes(type)) {
    const err = new Error(`Unsupported data context type: ${type || "(empty)"}`);
    err.code = "unsupported_data_context_type";
    err.status = 400;
    throw err;
  }
  return type;
}

function normalizeDate(value, now) {
  const text = cleanString(value, 40);
  if (!text || text === "previous_day" || text === "yesterday") return previousShanghaiDateKey(now);
  if (text === "today") return dateKeyInShanghai(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("data context date must be YYYY-MM-DD, previous_day, or today");
  return text;
}

function isNoiseMessage(row) {
  const status = cleanString(row.status, 80).toLowerCase();
  if (["withdrawn", "deleted", "revoked"].includes(status)) return true;
  const kind = cleanString(row.message_kind, 80).toLowerCase();
  if (["system", "internal", "automation_internal"].includes(kind)) return true;
  const role = cleanString(row.role, 80).toLowerCase();
  if (role === "system" || role === "tool") return true;
  return !cleanString(row.content || row.error, 20_000);
}

function readDiscussionMessages(db, range) {
  return db.prepare(`
    SELECT m.id, m.thread_id, COALESCE(t.workspace_id, m.workspace_id, '') AS workspace_id,
           COALESCE(w.label, '') AS workspace_label, COALESCE(t.title, '') AS thread_title,
           m.position, m.role, m.status, m.message_kind, m.sender_label, m.content, m.error,
           m.created_at
    FROM messages m
    LEFT JOIN threads t ON t.id = m.thread_id
    LEFT JOIN workspaces w ON w.id = COALESCE(t.workspace_id, m.workspace_id)
    WHERE datetime(m.created_at) >= datetime(?)
      AND datetime(m.created_at) < datetime(?)
    ORDER BY workspace_id, m.thread_id, m.position, m.created_at
  `).all(range.startIso, range.endIso);
}

function readDiscussionArtifacts(db, range) {
  return db.prepare(`
    SELECT COALESCE(a.workspace_id, t.workspace_id, '') AS workspace_id,
           COALESCE(w.label, '') AS workspace_label,
           a.thread_id, COALESCE(t.title, '') AS thread_title,
           a.name, a.mime, a.size, a.created_at
    FROM artifacts a
    LEFT JOIN threads t ON t.id = a.thread_id
    LEFT JOIN workspaces w ON w.id = COALESCE(a.workspace_id, t.workspace_id)
    WHERE datetime(a.created_at) >= datetime(?)
      AND datetime(a.created_at) < datetime(?)
    ORDER BY a.created_at
    LIMIT 80
  `).all(range.startIso, range.endIso);
}

function discussionActivityDailyProvider(options) {
  const dbPath = options.dbPath;
  if (!dbPath) throw new Error("data context dbPath is required");
  const targetDate = normalizeDate(options.date || options.scope?.date, options.now);
  const range = shanghaiDayUtcRange(targetDate);
  const maxThreads = Number(options.maxThreads || options.scope?.maxThreads || DEFAULT_MAX_THREADS);
  const maxMessagesPerThread = Number(options.maxMessagesPerThread || options.scope?.maxMessagesPerThread || DEFAULT_MAX_MESSAGES_PER_THREAD);
  const maxExcerptChars = Number(options.maxExcerptChars || options.scope?.maxExcerptChars || DEFAULT_MAX_EXCERPT_CHARS);
  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    const rawMessages = readDiscussionMessages(db, range);
    const included = rawMessages.filter((row) => !isNoiseMessage(row));
    const threadMap = new Map();
    for (const row of included) {
      const threadId = row.thread_id || "unknown";
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, {
          threadId,
          workspaceId: row.workspace_id || "unknown",
          workspaceLabel: row.workspace_label || "",
          title: row.thread_title || "",
          counts: {},
          messages: [],
        });
      }
      const thread = threadMap.get(threadId);
      const role = cleanString(row.role || "unknown", 80) || "unknown";
      thread.counts[role] = (thread.counts[role] || 0) + 1;
      if (thread.messages.length < maxMessagesPerThread) {
        thread.messages.push({
          at: row.created_at || "",
          role,
          sender: row.sender_label || "",
          excerpt: compactText(row.content || row.error, maxExcerptChars),
        });
      }
    }
    const workspaceMap = new Map();
    for (const thread of threadMap.values()) {
      const workspaceId = thread.workspaceId || "unknown";
      if (!workspaceMap.has(workspaceId)) {
        workspaceMap.set(workspaceId, {
          workspaceId,
          workspaceLabel: thread.workspaceLabel || "",
          threadCount: 0,
          messageCount: 0,
          roleCounts: {},
        });
      }
      const workspace = workspaceMap.get(workspaceId);
      workspace.threadCount += 1;
      for (const [role, count] of Object.entries(thread.counts)) {
        workspace.roleCounts[role] = (workspace.roleCounts[role] || 0) + count;
        workspace.messageCount += count;
      }
    }
    const allThreads = [...threadMap.values()];
    const threads = allThreads.slice(0, maxThreads);
    return {
      type: "discussion_activity_daily",
      generatedAt: new Date().toISOString(),
      targetDate,
      timezone: "Asia/Shanghai",
      utcRange: range,
      source: { store: "home_ai_runtime_sqlite", tables: ["workspaces", "threads", "messages", "artifacts"] },
      audit: {
        rawMessageCount: rawMessages.length,
        includedMessageCount: included.length,
        excludedNoiseOrOutOfScopeCount: rawMessages.length - included.length,
        workspaceCount: workspaceMap.size,
        threadCount: threadMap.size,
        emittedThreadCount: threads.length,
        omittedThreadCount: Math.max(0, allThreads.length - threads.length),
      },
      workspaces: [...workspaceMap.values()].sort((a, b) => a.workspaceId.localeCompare(b.workspaceId)),
      threads,
      artifacts: readDiscussionArtifacts(db, range).map((item) => ({
        workspaceId: item.workspace_id || "",
        workspaceLabel: item.workspace_label || "",
        threadId: item.thread_id || "",
        threadTitle: item.thread_title || "",
        name: compactText(item.name, 120),
        mime: item.mime || "",
        size: Number(item.size || 0),
        createdAt: item.created_at || "",
      })),
    };
  } finally {
    db.close();
  }
}

function markdownForContext(context) {
  const lines = [];
  lines.push(`# ${context.type} Data Context`);
  lines.push("");
  lines.push("This is a bounded Home AI data context generated by the host. Use it as the primary evidence source for analysis; do not search unrelated filesystem paths.");
  lines.push("");
  lines.push("## Audit");
  lines.push("");
  lines.push(`- Target date: ${context.targetDate}`);
  lines.push(`- Timezone: ${context.timezone}`);
  lines.push(`- UTC range: ${context.utcRange.startIso} to ${context.utcRange.endIso}`);
  lines.push(`- Workspaces: ${context.audit.workspaceCount}`);
  lines.push(`- Threads: ${context.audit.threadCount}`);
  lines.push(`- Included messages: ${context.audit.includedMessageCount}`);
  lines.push(`- Excluded noise/out-of-scope messages: ${context.audit.excludedNoiseOrOutOfScopeCount}`);
  if (context.audit.omittedThreadCount) lines.push(`- Omitted threads due to cap: ${context.audit.omittedThreadCount}`);
  lines.push("");
  lines.push("## Workspace Counts");
  lines.push("");
  if (!context.workspaces.length) lines.push("- No included messages.");
  for (const workspace of context.workspaces) {
    const label = workspace.workspaceLabel ? ` (${workspace.workspaceLabel})` : "";
    lines.push(`- ${workspace.workspaceId}${label}: ${workspace.threadCount} thread(s), ${workspace.messageCount} message(s), roles=${JSON.stringify(workspace.roleCounts)}`);
  }
  lines.push("");
  lines.push("## Thread Excerpts");
  lines.push("");
  if (!context.threads.length) lines.push("- No included thread excerpts.");
  for (const thread of context.threads) {
    const label = thread.workspaceLabel ? ` / ${thread.workspaceLabel}` : "";
    lines.push(`### ${thread.workspaceId}${label} / ${thread.title || thread.threadId}`);
    lines.push("");
    lines.push(`- Thread ID: ${thread.threadId}`);
    lines.push(`- Role counts: ${JSON.stringify(thread.counts)}`);
    for (const message of thread.messages) {
      const sender = message.sender ? ` ${message.sender}` : "";
      lines.push(`- ${message.at} ${message.role}${sender}: ${message.excerpt}`);
    }
    lines.push("");
  }
  lines.push("## Artifacts");
  lines.push("");
  if (!context.artifacts.length) lines.push("- No artifacts in range.");
  for (const artifact of context.artifacts.slice(0, 40)) {
    const label = artifact.workspaceLabel ? ` (${artifact.workspaceLabel})` : "";
    lines.push(`- ${artifact.createdAt} ${artifact.workspaceId}${label}: ${artifact.name} ${artifact.mime ? `(${artifact.mime})` : ""}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createDataContextService(options = {}) {
  const dbPath = options.dbPath || path.join(options.dataDir || path.join(process.cwd(), "data"), "hermes-mobile.sqlite3");
  function prepare(input = {}) {
    const type = normalizeContextType(input.type || input.contextType);
    const context = discussionActivityDailyProvider({
      dbPath,
      now: options.now ? options.now() : new Date(),
      date: input.date,
      scope: input.scope,
      maxThreads: input.maxThreads,
      maxMessagesPerThread: input.maxMessagesPerThread,
      maxExcerptChars: input.maxExcerptChars,
    });
    const markdown = markdownForContext(context);
    const outputPath = cleanString(input.outputPath || input.out, 1000);
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, markdown, "utf8");
    }
    return { ok: true, type, context, markdown, outputPath };
  }
  return {
    prepare,
    supportedTypes: () => [...SUPPORTED_CONTEXT_TYPES],
  };
}

module.exports = {
  createDataContextService,
  dateKeyInShanghai,
  markdownForContext,
  previousShanghaiDateKey,
  shanghaiDayUtcRange,
};
