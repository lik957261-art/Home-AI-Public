"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = "homeai.aiOpsDiagnostic.v1";
const DEFAULT_CASE_LIMIT = 80;
const MAX_BREADCRUMBS = 80;
const MAX_EVIDENCE_KEYS = 100;
const MAX_STRING = 240;
const MAX_NOTE = 360;
const SEVERITY_RANK = Object.freeze({ info: 0, H4: 1, H3: 2, H2: 3, H1: 4 });
const CASE_STATUSES = new Set([
  "inbox_waiting",
  "card_candidate",
  "card_sent",
  "remediation_waiting",
  "verification_waiting",
  "closed",
  "suppressed",
  "expired",
  "reopened",
]);

const SENSITIVE_KEY_RE = /authorization|cookie|password|passwd|secret|token|access[_ .-]?key|workspace[_ .-]?key|launch[_ .-]?key|oauth|bearer|vapid|private[_ .-]?key/i;
const PRIVATE_CONTENT_KEY_RE = /(^|[_.-])(message|prompt|completion|transcript|markdown|html|raw|body|content|image|screenshot|payload|providerPayload|fileContent|title|artist|album|track|url|path|filePath|mediaPath)([_.-]|$)|message(Text|Body|Content)|prompt(Text|Body|Content)|completion(Text|Body|Content)|image(Content|Data|Base64)|screenshot(Data|Base64)|providerPayload|fileContent|rawPayload|filePath|mediaPath/i;
const SECRET_VALUE_RE = /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}|(sk-[A-Za-z0-9_-]{12,})|((?:token|key|password|secret)\s*[:= ]\s*)[A-Za-z0-9._~+/=-]{12,}/gi;

function cleanString(value, maxLength = MAX_STRING) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, fallback = "unknown", maxLength = 96) {
  const text = cleanString(value, maxLength).replace(/[^A-Za-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
  return text || fallback;
}

function defaultDataDir(env = process.env) {
  return cleanString(env.HERMES_WEB_DATA_DIR, 400)
    || cleanString(env.HERMES_MOBILE_DATA_DIR, 400)
    || path.join(process.cwd(), "workspace", "hermes-web");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function hashIdentifier(value, salt = "homeai-diagnostic-v1") {
  const text = cleanString(value, 400);
  if (!text) return "";
  return sha256(`${salt}:${text}`).slice(0, 24);
}

function normalizeSeverity(value) {
  const raw = cleanString(value || "H3", 20).toUpperCase();
  if (raw === "H1" || raw === "H2" || raw === "H3" || raw === "H4") return raw;
  if (raw === "INFO" || raw === "LOW") return "info";
  return "H3";
}

function strongerSeverity(a, b) {
  return (SEVERITY_RANK[b] || 0) > (SEVERITY_RANK[a] || 0) ? b : a;
}

function normalizeStatus(value, fallback = "inbox_waiting") {
  const status = cleanString(value, 80);
  return CASE_STATUSES.has(status) ? status : fallback;
}

function redactString(value, maxLength = MAX_STRING) {
  return cleanString(value, maxLength).replace(SECRET_VALUE_RE, (match, bearerPrefix, sk, assignmentPrefix) => {
    if (bearerPrefix) return `${bearerPrefix}[REDACTED]`;
    if (assignmentPrefix) return `${assignmentPrefix}[REDACTED]`;
    return "[REDACTED]";
  });
}

function sanitizeDiagnosticValue(value, key = "", depth = 0) {
  const normalizedKey = cleanString(key, 80);
  if (SENSITIVE_KEY_RE.test(normalizedKey)) return "[REDACTED]";
  if (PRIVATE_CONTENT_KEY_RE.test(normalizedKey)) return "[REDACTED]";
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
  if (typeof value === "string") {
    const maxLength = normalizedKey === "userAgent" ? 320 : MAX_STRING;
    return redactString(value, maxLength);
  }
  if (depth >= 5) return null;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_BREADCRUMBS).map((item) => sanitizeDiagnosticValue(item, normalizedKey, depth + 1));
  }
  if (typeof value !== "object") return redactString(value);
  const out = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_EVIDENCE_KEYS)) {
    const safeKey = safeToken(childKey, "", 80);
    if (!safeKey) continue;
    out[safeKey] = sanitizeDiagnosticValue(childValue, safeKey, depth + 1);
  }
  return out;
}

function sanitizeUserNote(value) {
  return redactString(value, MAX_NOTE);
}

function safeRoute(value) {
  const text = redactString(value, 240);
  if (!text) return "";
  try {
    const url = new URL(text, "http://home-ai.local");
    const params = new URLSearchParams();
    for (const key of ["view", "plugin", "pluginId", "pluginRoute", "workspaceId"]) {
      const found = url.searchParams.get(key);
      if (found) params.set(key, cleanString(found, 80));
    }
    const query = params.toString();
    return `${url.pathname || "/"}${query ? `?${query}` : ""}`;
  } catch (_) {
    return text.split(/[?#]/)[0].slice(0, 160);
  }
}

function normalizeBreadcrumbs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BREADCRUMBS).map((item) => {
    if (!item || typeof item !== "object") return sanitizeDiagnosticValue(item);
    return sanitizeDiagnosticValue({
      at: item.at || item.time || item.t || "",
      kind: item.kind || item.type || "event",
      code: item.code || item.name || "",
      status: item.status || "",
      duration_bucket: item.duration_bucket || item.durationBucket || "",
      fields: item.fields || item.meta || item.metadata || {},
    });
  });
}

function normalizeResourceHash(value) {
  const text = cleanString(value, 120);
  if (!text || text === "[REDACTED]") return "";
  const token = safeToken(text, "", 96);
  if (!token || token === "unknown" || token === "null" || token === "undefined") return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{5,95}$/.test(token)) return "";
  return token;
}

function firstResourceHashFromObject(value = {}) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["resource_hash", "resourceHash", "item_hash", "itemHash", "collection_hash", "collectionHash", "source_hash", "sourceHash"]) {
    const found = normalizeResourceHash(value[key]);
    if (found) return found;
  }
  return "";
}

function extractPluginDiagnosticResourceHash(payload = {}, evidence = {}) {
  const contextHash = firstResourceHashFromObject(payload.context || {});
  if (contextHash) return contextHash;
  const breadcrumbs = Array.isArray(evidence.breadcrumbs) ? evidence.breadcrumbs : [];
  for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
    const fieldsHash = firstResourceHashFromObject(breadcrumbs[index]?.fields || {});
    if (fieldsHash) return fieldsHash;
  }
  return "";
}

function confidenceFor(input = {}) {
  const explicit = Number(input.evidenceConfidence ?? input.evidence_confidence);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit));
  const breadcrumbs = Array.isArray(input.breadcrumbs) ? input.breadcrumbs.length : 0;
  const hasCode = Boolean(input.error_code || input.errorCode || input.status_code || input.statusCode);
  if (breadcrumbs >= 5 && hasCode) return 0.75;
  if (breadcrumbs >= 2 || hasCode) return 0.55;
  return 0.35;
}

function statusForNewCase(severity, confidence) {
  if ((severity === "H1" || severity === "H2") && confidence >= 0.7) return "card_candidate";
  return "inbox_waiting";
}

function parseJsonRow(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch (_) {
    return fallback;
  }
}

function createAiOpsDiagnosticIntakeService(options = {}) {
  const env = options.env || process.env;
  const dataDir = path.resolve(cleanString(options.dataDir, 400) || defaultDataDir(env));
  const rootDir = path.resolve(cleanString(options.rootDir, 400) || cleanString(env.HOMEAI_AI_OPS_DIAGNOSTIC_DIR, 400) || path.join(dataDir, "ai-ops", "diagnostics"));
  const dbPath = path.resolve(cleanString(options.dbPath, 400) || cleanString(env.HOMEAI_AI_OPS_DIAGNOSTIC_DB_PATH, 400) || path.join(rootDir, "diagnostics.sqlite"));
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const hashSalt = cleanString(options.hashSalt || env.HOMEAI_DIAGNOSTIC_HASH_SALT || "homeai-diagnostic-v1", 200);
  let db = null;

  function ensureDb() {
    if (db) return db;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_ops_diagnostic_cases (
        case_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        status TEXT NOT NULL,
        severity TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        workspace_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        source_surface TEXT NOT NULL,
        diagnostic_type TEXT NOT NULL,
        category TEXT NOT NULL,
        route TEXT NOT NULL,
        build_id TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        summary TEXT NOT NULL,
        routing_json TEXT NOT NULL,
        latest_event_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_ops_diagnostic_events (
        event_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        source_surface TEXT NOT NULL,
        diagnostic_type TEXT NOT NULL,
        category TEXT NOT NULL,
        route TEXT NOT NULL,
        build_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        privacy_class TEXT NOT NULL,
        thread_id_hash TEXT NOT NULL,
        turn_id_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        confidence REAL NOT NULL,
        payload_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES ai_ops_diagnostic_cases(case_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_ops_diagnostic_cases_updated ON ai_ops_diagnostic_cases(updated_at);
      CREATE INDEX IF NOT EXISTS idx_ai_ops_diagnostic_cases_status ON ai_ops_diagnostic_cases(status);
      CREATE INDEX IF NOT EXISTS idx_ai_ops_diagnostic_events_case ON ai_ops_diagnostic_events(case_id, created_at);
    `);
    return db;
  }

  function normalizeEvent(input = {}, context = {}) {
    const workspaceId = safeToken(context.workspaceId || input.workspaceId || input.workspace_id || "owner", "owner", 120);
    const pluginId = safeToken(input.pluginId || input.plugin_id || context.pluginId || "home-ai", "home-ai", 80);
    const sourceSurface = safeToken(input.sourceSurface || input.source_surface || input.surface || "web", "web", 80);
    const diagnosticType = safeToken(input.diagnosticType || input.diagnostic_type || input.type || "user_report", "user_report", 100);
    const category = safeToken(input.category || input.issueCategory || input.issue_category || diagnosticType, diagnosticType, 100);
    const severity = normalizeSeverity(input.severity || input.severityHint || input.severity_hint);
    const route = safeRoute(input.route || input.url || input.context?.route || context.route || "");
    const buildId = safeToken(input.buildId || input.build_id || input.clientVersion || input.client_version || context.clientVersion || "unknown", "unknown", 160);
    const confidence = confidenceFor(input);
    const threadHash = hashIdentifier(input.threadId || input.thread_id || input.context?.threadId || "", hashSalt);
    const turnHash = hashIdentifier(input.turnId || input.turn_id || input.context?.turnId || "", hashSalt);
    const userNote = sanitizeUserNote(input.userNote || input.user_note || input.note || "");
    const privacyClass = userNote ? "user_note" : "metadata_only";
    const breadcrumbs = normalizeBreadcrumbs(input.breadcrumbs || input.recentEvents || input.recent_events || []);
    const payload = sanitizeDiagnosticValue({
      category,
      user_note: userNote,
      error_code: input.errorCode || input.error_code || "",
      status_code: input.statusCode || input.status_code || "",
      duration_bucket: input.durationBucket || input.duration_bucket || "",
      counts: input.counts || {},
      context: input.context || {},
    });
    const evidence = sanitizeDiagnosticValue({
      breadcrumbs,
      dom: input.dom || input.domState || input.dom_state || {},
      frontend_state: input.frontendState || input.frontend_state || {},
      runtime: input.runtime || {},
      redaction: {
        raw_content_included: false,
        raw_secrets_included: false,
        raw_images_included: false,
      },
    });
    const pluginResourceHash = pluginId === "home-ai" ? "" : extractPluginDiagnosticResourceHash(payload, evidence);
    const errorClass = safeToken(payload.error_code || category, category, 120);
    const dedupeMaterial = {
      workspaceId,
      pluginId,
      sourceSurface,
      diagnosticType,
      category,
      errorClass,
      resourceHash: pluginResourceHash,
      route,
      buildId,
      threadHash,
    };
    const dedupeKey = sha256(JSON.stringify(dedupeMaterial)).slice(0, 32);
    const caseId = `diagcase_${dedupeKey.slice(0, 20)}`;
    const eventHash = sha256(JSON.stringify({
      dedupeMaterial,
      severity,
      payload,
      evidence,
      turnHash,
    })).slice(0, 32);
    return {
      caseId,
      eventId: `diagevt_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      schemaVersion: SCHEMA_VERSION,
      createdAt: nowIso(),
      workspaceId,
      pluginId,
      sourceSurface,
      diagnosticType,
      category,
      route,
      buildId,
      severity,
      privacyClass,
      threadIdHash: threadHash,
      turnIdHash: turnHash,
      eventHash,
      dedupeKey,
      confidence,
      summary: cleanString(input.summary || category.replace(/_/g, " "), 180),
      payload,
      evidence,
    };
  }

  function publicEvent(row) {
    if (!row) return null;
    return {
      event_id: row.event_id,
      case_id: row.case_id,
      schema_version: row.schema_version,
      created_at: row.created_at,
      workspace_id: row.workspace_id,
      plugin_id: row.plugin_id,
      source_surface: row.source_surface,
      diagnostic_type: row.diagnostic_type,
      category: row.category,
      route: row.route,
      build_id: row.build_id,
      severity: row.severity,
      privacy_class: row.privacy_class,
      thread_id_hash: row.thread_id_hash,
      turn_id_hash: row.turn_id_hash,
      event_hash: row.event_hash,
      dedupe_key: row.dedupe_key,
      confidence: Number(row.confidence || 0),
      payload: parseJsonRow(row.payload_json, {}),
      evidence: parseJsonRow(row.evidence_json, {}),
    };
  }

  function publicCase(row) {
    if (!row) return null;
    return {
      case_id: row.case_id,
      schema_version: row.schema_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      status: row.status,
      severity: row.severity,
      event_count: Number(row.event_count || 0),
      workspace_id: row.workspace_id,
      plugin_id: row.plugin_id,
      source_surface: row.source_surface,
      diagnostic_type: row.diagnostic_type,
      category: row.category,
      route: row.route,
      build_id: row.build_id,
      dedupe_key: row.dedupe_key,
      summary: row.summary,
      routing: parseJsonRow(row.routing_json, {}),
      latest_event_id: row.latest_event_id,
    };
  }

  function recordStateTransition(caseId, fromStatus, toStatus, reason = "event_received", actor = "system") {
    ensureDb().prepare(`
      INSERT INTO ai_ops_diagnostic_state_transitions
        (transition_id, case_id, created_at, from_status, to_status, reason, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `diagtr_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      caseId,
      nowIso(),
      fromStatus || "",
      toStatus,
      cleanString(reason, 120),
      cleanString(actor, 80),
    );
  }

  function ensureTransitionTable() {
    ensureDb().exec(`
      CREATE TABLE IF NOT EXISTS ai_ops_diagnostic_state_transitions (
        transition_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        reason TEXT NOT NULL,
        actor TEXT NOT NULL,
        FOREIGN KEY(case_id) REFERENCES ai_ops_diagnostic_cases(case_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_ops_diagnostic_state_case ON ai_ops_diagnostic_state_transitions(case_id, created_at);
    `);
  }

  function insertEventRow(dbHandle, event) {
    dbHandle.prepare(`
      INSERT INTO ai_ops_diagnostic_events (
        event_id, case_id, schema_version, created_at, workspace_id, plugin_id,
        source_surface, diagnostic_type, category, route, build_id, severity,
        privacy_class, thread_id_hash, turn_id_hash, event_hash, dedupe_key,
        confidence, payload_json, evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.caseId,
      event.schemaVersion,
      event.createdAt,
      event.workspaceId,
      event.pluginId,
      event.sourceSurface,
      event.diagnosticType,
      event.category,
      event.route,
      event.buildId,
      event.severity,
      event.privacyClass,
      event.threadIdHash,
      event.turnIdHash,
      event.eventHash,
      event.dedupeKey,
      event.confidence,
      JSON.stringify(event.payload),
      JSON.stringify(event.evidence),
    );
  }

  function ingestEvent(input = {}, context = {}) {
    ensureTransitionTable();
    const event = normalizeEvent(input, context);
    const dbHandle = ensureDb();
    const existing = dbHandle.prepare("SELECT * FROM ai_ops_diagnostic_cases WHERE case_id = ?").get(event.caseId);
    const newStatus = existing
      ? (existing.status === "closed" ? "reopened" : existing.status)
      : statusForNewCase(event.severity, event.confidence);
    const routing = {
      mode: newStatus,
      auto_card_eligible: newStatus === "card_candidate",
      return_card_required: true,
      task_card_status: "not_sent",
      target: "",
    };
    if (existing) {
      insertEventRow(dbHandle, event);
      const severity = strongerSeverity(existing.severity, event.severity);
      dbHandle.prepare(`
        UPDATE ai_ops_diagnostic_cases
        SET updated_at = ?, last_seen_at = ?, status = ?, severity = ?,
            event_count = event_count + 1, latest_event_id = ?,
            summary = ?, routing_json = ?
        WHERE case_id = ?
      `).run(
        event.createdAt,
        event.createdAt,
        newStatus,
        severity,
        event.eventId,
        event.summary,
        JSON.stringify(Object.assign({}, parseJsonRow(existing.routing_json, {}), routing, { mode: newStatus })),
        event.caseId,
      );
      if (newStatus !== existing.status) recordStateTransition(event.caseId, existing.status, newStatus, "new_event");
    } else {
      dbHandle.prepare(`
        INSERT INTO ai_ops_diagnostic_cases (
          case_id, schema_version, created_at, updated_at, first_seen_at, last_seen_at,
          status, severity, event_count, workspace_id, plugin_id, source_surface,
          diagnostic_type, category, route, build_id, dedupe_key, summary,
          routing_json, latest_event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.caseId,
        event.schemaVersion,
        event.createdAt,
        event.createdAt,
        event.createdAt,
        event.createdAt,
        newStatus,
        event.severity,
        1,
        event.workspaceId,
        event.pluginId,
        event.sourceSurface,
        event.diagnosticType,
        event.category,
        event.route,
        event.buildId,
        event.dedupeKey,
        event.summary,
        JSON.stringify(routing),
        event.eventId,
      );
      insertEventRow(dbHandle, event);
      recordStateTransition(event.caseId, "", newStatus, "created");
    }
    const currentCase = getCase(event.caseId);
    return {
      ok: true,
      diagnostic_id: event.eventId,
      event_id: event.eventId,
      case_id: event.caseId,
      status: currentCase.status,
      event_count: currentCase.event_count,
      deduped: Boolean(existing),
      routing: currentCase.routing,
      privacy: {
        class: event.privacyClass,
        raw_content_included: false,
        raw_secrets_included: false,
        raw_images_included: false,
      },
    };
  }

  function getCase(caseId) {
    ensureTransitionTable();
    return publicCase(ensureDb().prepare("SELECT * FROM ai_ops_diagnostic_cases WHERE case_id = ?").get(cleanString(caseId, 120)));
  }

  function listCases(input = {}) {
    ensureTransitionTable();
    const limit = Math.max(1, Math.min(500, Number(input.limit || DEFAULT_CASE_LIMIT) || DEFAULT_CASE_LIMIT));
    const status = normalizeStatus(input.status, "");
    const pluginId = cleanString(input.pluginId || input.plugin_id, 80);
    const where = [];
    const params = [];
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (pluginId) {
      where.push("plugin_id = ?");
      params.push(pluginId);
    }
    const sql = `SELECT * FROM ai_ops_diagnostic_cases ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
    return {
      ok: true,
      cases: ensureDb().prepare(sql).all(...params, limit).map(publicCase),
    };
  }

  function listEvents(input = {}) {
    ensureTransitionTable();
    const caseId = cleanString(input.caseId || input.case_id, 120);
    const limit = Math.max(1, Math.min(500, Number(input.limit || DEFAULT_CASE_LIMIT) || DEFAULT_CASE_LIMIT));
    const rows = caseId
      ? ensureDb().prepare("SELECT * FROM ai_ops_diagnostic_events WHERE case_id = ? ORDER BY created_at DESC LIMIT ?").all(caseId, limit)
      : ensureDb().prepare("SELECT * FROM ai_ops_diagnostic_events ORDER BY created_at DESC LIMIT ?").all(limit);
    return { ok: true, events: rows.map(publicEvent) };
  }

  function updateCaseStatus(input = {}) {
    ensureTransitionTable();
    const caseId = cleanString(input.caseId || input.case_id, 120);
    const nextStatus = normalizeStatus(input.status, "");
    if (!caseId || !nextStatus) {
      const err = new Error("diagnostic_case_status_required");
      err.status = 400;
      throw err;
    }
    const current = getCase(caseId);
    if (!current) {
      const err = new Error("diagnostic_case_not_found");
      err.status = 404;
      throw err;
    }
    ensureDb().prepare("UPDATE ai_ops_diagnostic_cases SET status = ?, updated_at = ? WHERE case_id = ?")
      .run(nextStatus, nowIso(), caseId);
    recordStateTransition(caseId, current.status, nextStatus, input.reason || "manual_update", input.actor || "owner");
    return { ok: true, case: getCase(caseId) };
  }

  function close() {
    if (db) db.close();
    db = null;
  }

  return Object.freeze({
    dbPath,
    ingestEvent,
    listCases,
    getCase,
    listEvents,
    updateCaseStatus,
    normalizeEvent,
    sanitizeDiagnosticValue,
    close,
  });
}

module.exports = {
  SCHEMA_VERSION,
  createAiOpsDiagnosticIntakeService,
  sanitizeDiagnosticValue,
};
