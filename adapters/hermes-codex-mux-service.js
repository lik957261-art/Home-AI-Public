"use strict";

const crypto = require("node:crypto");

const DEFAULT_WORKER_ID = "codex-hermes-main";
const DEFAULT_BRIDGE_ID = "hermes-mobile-codex-main";
const DEFAULT_WORKSPACE = "C:\\Users\\xuxin\\Documents\\Agent";
const EVENT_TYPES = new Set([
  "task.requested",
  "task.accepted",
  "worker.preflight.started",
  "worker.preflight.completed",
  "progress",
  "plan.proposed",
  "assistance.requested",
  "assistance.result",
  "approval.requested",
  "approval.result",
  "patch.proposed",
  "validation.started",
  "validation.result",
  "deploy.started",
  "deploy.result",
  "artifact.created",
  "task.final",
  "task.error",
  "worker.blocked.context_conflict",
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  const text = String(value == null ? "" : value).trim();
  return text || fallback;
}

function parseJson(value, fallback = null) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch (_) {
    return fallback;
  }
}

function stableJson(value) {
  return JSON.stringify(value == null ? null : value);
}

function idWithPrefix(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeStatus(value, fallback = "open") {
  const status = normalizeText(value, fallback).toLowerCase();
  if (["open", "running", "waiting", "completed", "failed", "cancelled", "blocked"].includes(status)) return status;
  return fallback;
}

function clampText(value, limit = 4000) {
  const text = String(value == null ? "" : value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...[truncated ${text.length - limit} chars]`;
}

function sanitizePayload(value, depth = 0) {
  if (value == null) return value;
  if (depth > 5) return "[max-depth]";
  if (typeof value === "string") return clampText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      if (/^(secret|token|accessKey|access_key|oauth|password|pushEndpoint|push_endpoint)$/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizePayload(raw, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function normalizeTask(input = {}, fallback = {}) {
  const capsule = parseJson(input.capsule || input.taskCapsule || input.capsuleJson || input.task_capsule_json, null);
  const taskId = normalizeText(input.taskId || input.task_id || capsule?.taskId, fallback.taskId || idWithPrefix("mux"));
  const workspace = normalizeText(input.workspace || capsule?.workspace, fallback.workspace || DEFAULT_WORKSPACE);
  const assignedWorker = normalizeText(
    input.assignedWorker || input.assigned_worker || capsule?.assignedWorker,
    fallback.assignedWorker || DEFAULT_WORKER_ID,
  );
  const now = normalizeText(input.updatedAt || input.updated_at, nowIso());
  return {
    taskId,
    title: normalizeText(input.title || capsule?.title, fallback.title || taskId),
    status: normalizeStatus(input.status, fallback.status || "open"),
    workspace,
    assignedWorker,
    sourceThreadId: normalizeText(input.sourceThreadId || input.source_thread_id || capsule?.source?.threadId, fallback.sourceThreadId || ""),
    capsule: capsule || input.capsule || input.taskCapsule || fallback.capsule || null,
    createdAt: normalizeText(input.createdAt || input.created_at, fallback.createdAt || now),
    updatedAt: now,
  };
}

function normalizeEvent(input = {}, fallback = {}) {
  const type = normalizeText(input.type, fallback.type || "progress");
  if (!EVENT_TYPES.has(type)) {
    const err = new Error(`Unsupported Mux event type: ${type}`);
    err.status = 400;
    throw err;
  }
  const eventId = normalizeText(input.eventId || input.event_id, fallback.eventId || idWithPrefix("evt"));
  const taskId = normalizeText(input.taskId || input.task_id, fallback.taskId);
  if (!taskId) {
    const err = new Error("Mux event requires taskId");
    err.status = 400;
    throw err;
  }
  const payload = sanitizePayload(input.payload || input.data || {});
  const requestId = normalizeText(input.requestId || input.request_id || payload?.requestId, "");
  return {
    schema: "hermes-codex-mux.event.v1",
    eventId,
    taskId,
    type,
    from: normalizeText(input.from, fallback.from || ""),
    to: normalizeText(input.to, fallback.to || "mux"),
    workerId: normalizeText(input.workerId || input.worker_id, fallback.workerId || ""),
    requestId,
    status: normalizeText(input.status, fallback.status || ""),
    summary: clampText(input.summary || ""),
    artifactRefs: Array.isArray(input.artifactRefs) ? input.artifactRefs.slice(0, 50) : [],
    payload,
    createdAt: normalizeText(input.createdAt || input.created_at, nowIso()),
  };
}

function rowTask(row) {
  if (!row) return null;
  return {
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    workspace: row.workspace,
    assignedWorker: row.assigned_worker,
    sourceThreadId: row.source_thread_id,
    capsule: parseJson(row.capsule_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowEvent(row) {
  if (!row) return null;
  return {
    schema: "hermes-codex-mux.event.v1",
    eventId: row.event_id,
    taskId: row.task_id,
    type: row.type,
    from: row.from_party,
    to: row.to_party,
    workerId: row.worker_id,
    requestId: row.request_id,
    status: row.status,
    summary: row.summary,
    artifactRefs: parseJson(row.artifact_refs_json, []),
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at,
  };
}

function rowHeartbeat(row) {
  if (!row) return null;
  return {
    workerId: row.worker_id,
    bridgeId: row.bridge_id,
    workspace: row.workspace,
    mode: row.mode,
    capabilities: parseJson(row.capabilities_json, []),
    currentTaskId: row.current_task_id,
    observedAt: row.observed_at,
    payload: parseJson(row.payload_json, {}),
  };
}

function createMemoryStore() {
  return {
    tasks: new Map(),
    events: [],
    heartbeats: new Map(),
  };
}

function createHermesCodexMuxService(options = {}) {
  const memory = createMemoryStore();
  const openDatabase = typeof options.openDatabase === "function"
    ? options.openDatabase
    : (typeof options.mobileStore?.open === "function" ? () => options.mobileStore.open() : null);
  let initialized = false;

  function db() {
    return openDatabase ? openDatabase() : null;
  }

  function ensureSchema() {
    const database = db();
    if (!database || initialized) return database;
    database.exec(`
      CREATE TABLE IF NOT EXISTS codex_mux_tasks (
        task_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        workspace TEXT NOT NULL DEFAULT '',
        assigned_worker TEXT NOT NULL DEFAULT '',
        source_thread_id TEXT NOT NULL DEFAULT '',
        capsule_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS codex_mux_events (
        event_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        from_party TEXT NOT NULL DEFAULT '',
        to_party TEXT NOT NULL DEFAULT '',
        worker_id TEXT NOT NULL DEFAULT '',
        request_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        artifact_refs_json TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_codex_mux_events_task_created ON codex_mux_events(task_id, created_at, event_id);
      CREATE INDEX IF NOT EXISTS idx_codex_mux_tasks_worker_status ON codex_mux_tasks(assigned_worker, status, updated_at);
      CREATE TABLE IF NOT EXISTS codex_mux_worker_heartbeats (
        worker_id TEXT PRIMARY KEY,
        bridge_id TEXT NOT NULL DEFAULT '',
        workspace TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        capabilities_json TEXT,
        current_task_id TEXT NOT NULL DEFAULT '',
        observed_at TEXT NOT NULL,
        payload_json TEXT
      );
    `);
    initialized = true;
    return database;
  }

  function upsertTask(input = {}) {
    const database = ensureSchema();
    const task = normalizeTask(input);
    if (!database) {
      memory.tasks.set(task.taskId, task);
      return task;
    }
    database.prepare(`
      INSERT INTO codex_mux_tasks(task_id, title, status, workspace, assigned_worker, source_thread_id, capsule_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        workspace = excluded.workspace,
        assigned_worker = excluded.assigned_worker,
        source_thread_id = excluded.source_thread_id,
        capsule_json = excluded.capsule_json,
        updated_at = excluded.updated_at
    `).run(
      task.taskId,
      task.title,
      task.status,
      task.workspace,
      task.assignedWorker,
      task.sourceThreadId,
      stableJson(task.capsule),
      task.createdAt,
      task.updatedAt,
    );
    return task;
  }

  function getTask(taskId) {
    const id = normalizeText(taskId);
    if (!id) return null;
    const database = ensureSchema();
    if (!database) return memory.tasks.get(id) || null;
    return rowTask(database.prepare("SELECT * FROM codex_mux_tasks WHERE task_id = ?").get(id));
  }

  function listTasks(filters = {}) {
    const assignedWorker = normalizeText(filters.assignedWorker || filters.assigned_worker);
    const statuses = String(filters.status || "")
      .split(",")
      .map((status) => normalizeText(status).toLowerCase())
      .filter(Boolean);
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const database = ensureSchema();
    if (!database) {
      return [...memory.tasks.values()]
        .filter((task) => !assignedWorker || task.assignedWorker === assignedWorker)
        .filter((task) => !statuses.length || statuses.includes(task.status))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, limit);
    }
    const clauses = [];
    const values = [];
    if (assignedWorker) {
      clauses.push("assigned_worker = ?");
      values.push(assignedWorker);
    }
    if (statuses.length) {
      clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      values.push(...statuses);
    }
    values.push(limit);
    const sql = `SELECT * FROM codex_mux_tasks${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return database.prepare(sql).all(...values).map(rowTask);
  }

  function appendEvent(taskId, input = {}) {
    const event = normalizeEvent(input, { taskId });
    const database = ensureSchema();
    if (!getTask(event.taskId) && event.type === "task.requested") {
      upsertTask({
        taskId: event.taskId,
        title: event.summary || event.taskId,
        status: "open",
        capsule: input.payload?.capsule || input.capsule || null,
      });
    }
    if (!database) {
      memory.events = memory.events.filter((existing) => existing.eventId !== event.eventId);
      memory.events.push(event);
      return event;
    }
    database.prepare(`
      INSERT INTO codex_mux_events(event_id, task_id, type, from_party, to_party, worker_id, request_id, status, summary, artifact_refs_json, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        status = excluded.status,
        summary = excluded.summary,
        artifact_refs_json = excluded.artifact_refs_json,
        payload_json = excluded.payload_json
    `).run(
      event.eventId,
      event.taskId,
      event.type,
      event.from,
      event.to,
      event.workerId,
      event.requestId,
      event.status,
      event.summary,
      stableJson(event.artifactRefs),
      stableJson(event.payload),
      event.createdAt,
    );
    return event;
  }

  function listEvents(taskId, filters = {}) {
    const id = normalizeText(taskId);
    const limit = Math.max(1, Math.min(500, Number(filters.limit || 200) || 200));
    const database = ensureSchema();
    if (!database) {
      return memory.events
        .filter((event) => event.taskId === id)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.eventId).localeCompare(String(b.eventId)))
        .slice(-limit);
    }
    return database.prepare("SELECT * FROM codex_mux_events WHERE task_id = ? ORDER BY created_at, event_id LIMIT ?")
      .all(id, limit)
      .map(rowEvent);
  }

  function recordHeartbeat(workerId, input = {}) {
    const normalizedWorkerId = normalizeText(workerId || input.workerId || input.worker_id, DEFAULT_WORKER_ID);
    const heartbeat = {
      workerId: normalizedWorkerId,
      bridgeId: normalizeText(input.bridgeId || input.bridge_id, DEFAULT_BRIDGE_ID),
      workspace: normalizeText(input.workspace, DEFAULT_WORKSPACE),
      mode: normalizeText(input.mode, "sticky"),
      capabilities: Array.isArray(input.capabilities) ? input.capabilities.slice(0, 50).map(String) : [],
      currentTaskId: normalizeText(input.currentTaskId || input.current_task_id, ""),
      observedAt: normalizeText(input.observedAt || input.observed_at, nowIso()),
      payload: sanitizePayload(input.payload || {}),
    };
    const database = ensureSchema();
    if (!database) {
      memory.heartbeats.set(heartbeat.workerId, heartbeat);
      return heartbeat;
    }
    database.prepare(`
      INSERT INTO codex_mux_worker_heartbeats(worker_id, bridge_id, workspace, mode, capabilities_json, current_task_id, observed_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(worker_id) DO UPDATE SET
        bridge_id = excluded.bridge_id,
        workspace = excluded.workspace,
        mode = excluded.mode,
        capabilities_json = excluded.capabilities_json,
        current_task_id = excluded.current_task_id,
        observed_at = excluded.observed_at,
        payload_json = excluded.payload_json
    `).run(
      heartbeat.workerId,
      heartbeat.bridgeId,
      heartbeat.workspace,
      heartbeat.mode,
      stableJson(heartbeat.capabilities),
      heartbeat.currentTaskId,
      heartbeat.observedAt,
      stableJson(heartbeat.payload),
    );
    return heartbeat;
  }

  function getHeartbeat(workerId) {
    const id = normalizeText(workerId);
    if (!id) return null;
    const database = ensureSchema();
    if (!database) return memory.heartbeats.get(id) || null;
    return rowHeartbeat(database.prepare("SELECT * FROM codex_mux_worker_heartbeats WHERE worker_id = ?").get(id));
  }

  return {
    appendEvent,
    getHeartbeat,
    getTask,
    listEvents,
    listTasks,
    recordHeartbeat,
    upsertTask,
  };
}

module.exports = {
  DEFAULT_BRIDGE_ID,
  DEFAULT_WORKER_ID,
  DEFAULT_WORKSPACE,
  EVENT_TYPES,
  createHermesCodexMuxService,
  normalizeEvent,
  normalizeTask,
  sanitizePayload,
};
