"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const CURRENT_FAMILY_PROFILE_SCHEMA_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function stableJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function stableId(prefix, parts) {
  const digest = crypto.createHash("sha256").update(parts.map(cleanString).join("|")).digest("hex").slice(0, 18);
  return `${prefix}_${digest}`;
}

function publicRecordFromRow(row) {
  if (!row) return null;
  return {
    recordId: row.id,
    workspaceId: row.workspace_id,
    subjectWorkspaceId: row.subject_workspace_id,
    sourceWorkspaceId: row.source_workspace_id,
    domain: row.domain,
    claimType: row.claim_type,
    claim: row.claim,
    summary: row.summary,
    sensitivity: row.sensitivity,
    visibility: row.visibility,
    confidence: Number(row.confidence || 0),
    status: row.status,
    idempotencyKey: row.idempotency_key || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  };
}

function publicEvidenceFromRow(row) {
  if (!row) return null;
  return {
    evidenceId: row.id,
    recordId: row.record_id,
    sourceWorkspaceId: row.source_workspace_id,
    sourceDomain: row.source_domain,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    summary: row.summary,
    sensitivity: row.sensitivity,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

function publicInsightFromRow(row) {
  if (!row) return null;
  return {
    insightId: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    summary: row.summary,
    insightType: row.insight_type,
    domains: parseJson(row.domains_json, []),
    sourceWorkspaceIds: parseJson(row.source_workspace_ids_json, []),
    affectedWorkspaceIds: parseJson(row.affected_workspace_ids_json, []),
    evidenceRecordIds: parseJson(row.evidence_record_ids_json, []),
    sensitivity: row.sensitivity,
    visibility: row.visibility,
    confidence: Number(row.confidence || 0),
    status: row.status,
    idempotencyKey: row.idempotency_key || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  };
}

function publicSnapshotFromRow(row) {
  if (!row) return null;
  return {
    snapshotId: row.id,
    workspaceId: row.workspace_id,
    profileVersion: Number(row.profile_version || 0),
    summary: row.summary,
    domains: parseJson(row.domains_json, []),
    payload: parseJson(row.payload_json, {}),
    idempotencyKey: row.idempotency_key || "",
    createdAt: row.created_at,
  };
}

function publicHouseholdProfileFromRow(row) {
  if (!row) return null;
  return {
    householdProfileId: row.id,
    profileVersion: Number(row.profile_version || 0),
    summary: row.summary,
    memberWorkspaceIds: parseJson(row.member_workspace_ids_json, []),
    domains: parseJson(row.domains_json, []),
    payload: parseJson(row.payload_json, {}),
    visibility: row.visibility,
    idempotencyKey: row.idempotency_key || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function appendWhere(clauses, params, column, value) {
  const text = cleanString(value);
  if (!text) return;
  clauses.push(`${column} = ?`);
  params.push(text);
}

function limitFrom(value, fallback = 50, max = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.trunc(number), max);
}

function createFamilyProfileRepository(options = {}) {
  let database = options.database || null;
  let ownsDatabase = false;
  const clock = typeof options.nowIso === "function" ? options.nowIso : nowIso;
  const makeId = typeof options.makeId === "function" ? options.makeId : stableId;

  function open() {
    if (database) return database;
    const dbPath = options.dbPath || path.join(options.dataDir || path.join(process.cwd(), "data"), "family-profile.sqlite");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    database = new DatabaseSync(dbPath);
    ownsDatabase = true;
    return database;
  }

  function migrate() {
    const db = open();
    db.exec(`
      CREATE TABLE IF NOT EXISTS family_profile_schema_migrations (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS family_profile_records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subject_workspace_id TEXT NOT NULL,
        source_workspace_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        claim_type TEXT NOT NULL,
        claim TEXT NOT NULL,
        summary TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        visibility TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_profile_records_idempotency
        ON family_profile_records(idempotency_key)
        WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_family_profile_records_workspace ON family_profile_records(workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_family_profile_records_subject ON family_profile_records(subject_workspace_id, visibility, status);
      CREATE INDEX IF NOT EXISTS idx_family_profile_records_source ON family_profile_records(source_workspace_id, domain);

      CREATE TABLE IF NOT EXISTS family_profile_evidence_refs (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        source_workspace_id TEXT NOT NULL,
        source_domain TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL DEFAULT '',
        source_ref TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(record_id) REFERENCES family_profile_records(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_profile_evidence_source
        ON family_profile_evidence_refs(record_id, source_domain, source_type, source_id)
        WHERE source_id <> '';
      CREATE INDEX IF NOT EXISTS idx_family_profile_evidence_record ON family_profile_evidence_refs(record_id);

      CREATE TABLE IF NOT EXISTS family_profile_insights (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        insight_type TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        source_workspace_ids_json TEXT NOT NULL,
        affected_workspace_ids_json TEXT NOT NULL,
        evidence_record_ids_json TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        visibility TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_profile_insights_idempotency
        ON family_profile_insights(idempotency_key)
        WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_family_profile_insights_workspace ON family_profile_insights(workspace_id, visibility, status);

      CREATE TABLE IF NOT EXISTS family_profile_snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        profile_version INTEGER NOT NULL,
        summary TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_profile_snapshots_idempotency
        ON family_profile_snapshots(idempotency_key)
        WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_family_profile_snapshots_workspace ON family_profile_snapshots(workspace_id, profile_version DESC);

      CREATE TABLE IF NOT EXISTS family_household_profiles (
        id TEXT PRIMARY KEY,
        profile_version INTEGER NOT NULL,
        summary TEXT NOT NULL,
        member_workspace_ids_json TEXT NOT NULL,
        domains_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_family_household_profiles_idempotency
        ON family_household_profiles(idempotency_key)
        WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_family_household_profiles_version ON family_household_profiles(profile_version DESC);
    `);
    db.prepare(`
      INSERT INTO family_profile_schema_migrations (id, schema_version, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version, updated_at = excluded.updated_at
    `).run(CURRENT_FAMILY_PROFILE_SCHEMA_VERSION, clock());
  }

  function upsertProfileRecord(input = {}) {
    migrate();
    const db = open();
    const existing = input.idempotencyKey
      ? db.prepare("SELECT * FROM family_profile_records WHERE idempotency_key = ?").get(input.idempotencyKey)
      : null;
    const timestamp = clock();
    const recordId = existing?.id || cleanString(input.recordId) || makeId("family_record", [
      input.workspaceId,
      input.subjectWorkspaceId,
      input.sourceWorkspaceId,
      input.domain,
      input.claimType,
      input.claim,
      input.idempotencyKey,
    ]);
    db.prepare(`
      INSERT INTO family_profile_records (
        id, workspace_id, subject_workspace_id, source_workspace_id, domain, claim_type,
        claim, summary, sensitivity, visibility, confidence, status, idempotency_key,
        metadata_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        subject_workspace_id = excluded.subject_workspace_id,
        source_workspace_id = excluded.source_workspace_id,
        domain = excluded.domain,
        claim_type = excluded.claim_type,
        claim = excluded.claim,
        summary = excluded.summary,
        sensitivity = excluded.sensitivity,
        visibility = excluded.visibility,
        confidence = excluded.confidence,
        status = excluded.status,
        idempotency_key = excluded.idempotency_key,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `).run(
      recordId,
      input.workspaceId,
      input.subjectWorkspaceId,
      input.sourceWorkspaceId,
      input.domain,
      input.claimType,
      input.claim,
      input.summary,
      input.sensitivity,
      input.visibility,
      Number(input.confidence || 0),
      input.status,
      cleanString(input.idempotencyKey),
      stableJson(input.metadata || {}),
      input.createdAt || existing?.created_at || timestamp,
      timestamp,
      input.archivedAt || null,
    );
    return getProfileRecord(recordId);
  }

  function getProfileRecord(recordId) {
    migrate();
    const row = open().prepare("SELECT * FROM family_profile_records WHERE id = ?").get(cleanString(recordId));
    return publicRecordFromRow(row);
  }

  function listProfileRecords(filters = {}) {
    migrate();
    const clauses = [];
    const params = [];
    appendWhere(clauses, params, "workspace_id", filters.workspaceId);
    appendWhere(clauses, params, "subject_workspace_id", filters.subjectWorkspaceId);
    appendWhere(clauses, params, "source_workspace_id", filters.sourceWorkspaceId);
    appendWhere(clauses, params, "domain", filters.domain);
    appendWhere(clauses, params, "visibility", filters.visibility);
    appendWhere(clauses, params, "status", filters.status || "active");
    const sql = `SELECT * FROM family_profile_records${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...params, limitFrom(filters.limit)).map(publicRecordFromRow);
  }

  function addEvidenceRef(input = {}) {
    migrate();
    const db = open();
    const existing = input.sourceId
      ? db.prepare(`
        SELECT * FROM family_profile_evidence_refs
        WHERE record_id = ? AND source_domain = ? AND source_type = ? AND source_id = ?
      `).get(input.recordId, input.sourceDomain, input.sourceType, input.sourceId)
      : null;
    const evidenceId = existing?.id || cleanString(input.evidenceId) || makeId("family_evidence", [
      input.recordId,
      input.sourceWorkspaceId,
      input.sourceDomain,
      input.sourceType,
      input.sourceId,
      input.sourceRef,
    ]);
    db.prepare(`
      INSERT INTO family_profile_evidence_refs (
        id, record_id, source_workspace_id, source_domain, source_type, source_id,
        source_ref, summary, sensitivity, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_workspace_id = excluded.source_workspace_id,
        source_domain = excluded.source_domain,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_ref = excluded.source_ref,
        summary = excluded.summary,
        sensitivity = excluded.sensitivity,
        metadata_json = excluded.metadata_json
    `).run(
      evidenceId,
      input.recordId,
      input.sourceWorkspaceId,
      input.sourceDomain,
      input.sourceType,
      cleanString(input.sourceId),
      cleanString(input.sourceRef),
      input.summary,
      input.sensitivity,
      stableJson(input.metadata || {}),
      input.createdAt || clock(),
    );
    return publicEvidenceFromRow(db.prepare("SELECT * FROM family_profile_evidence_refs WHERE id = ?").get(evidenceId));
  }

  function listEvidenceRefs(recordId) {
    migrate();
    return open().prepare(`
      SELECT * FROM family_profile_evidence_refs
      WHERE record_id = ?
      ORDER BY created_at ASC
    `).all(cleanString(recordId)).map(publicEvidenceFromRow);
  }

  function upsertInsight(input = {}) {
    migrate();
    const db = open();
    const existing = input.idempotencyKey
      ? db.prepare("SELECT * FROM family_profile_insights WHERE idempotency_key = ?").get(input.idempotencyKey)
      : null;
    const timestamp = clock();
    const insightId = existing?.id || cleanString(input.insightId) || makeId("family_insight", [
      input.workspaceId,
      input.title,
      input.summary,
      input.insightType,
      input.idempotencyKey,
    ]);
    db.prepare(`
      INSERT INTO family_profile_insights (
        id, workspace_id, title, summary, insight_type, domains_json, source_workspace_ids_json,
        affected_workspace_ids_json, evidence_record_ids_json, sensitivity, visibility, confidence,
        status, idempotency_key, metadata_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        summary = excluded.summary,
        insight_type = excluded.insight_type,
        domains_json = excluded.domains_json,
        source_workspace_ids_json = excluded.source_workspace_ids_json,
        affected_workspace_ids_json = excluded.affected_workspace_ids_json,
        evidence_record_ids_json = excluded.evidence_record_ids_json,
        sensitivity = excluded.sensitivity,
        visibility = excluded.visibility,
        confidence = excluded.confidence,
        status = excluded.status,
        idempotency_key = excluded.idempotency_key,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at
    `).run(
      insightId,
      input.workspaceId,
      input.title,
      input.summary,
      input.insightType,
      stableJson(asArray(input.domains)),
      stableJson(asArray(input.sourceWorkspaceIds)),
      stableJson(asArray(input.affectedWorkspaceIds)),
      stableJson(asArray(input.evidenceRecordIds)),
      input.sensitivity,
      input.visibility,
      Number(input.confidence || 0),
      input.status,
      cleanString(input.idempotencyKey),
      stableJson(input.metadata || {}),
      input.createdAt || existing?.created_at || timestamp,
      timestamp,
      input.archivedAt || null,
    );
    return getInsight(insightId);
  }

  function getInsight(insightId) {
    migrate();
    return publicInsightFromRow(open().prepare("SELECT * FROM family_profile_insights WHERE id = ?").get(cleanString(insightId)));
  }

  function listInsights(filters = {}) {
    migrate();
    const clauses = [];
    const params = [];
    appendWhere(clauses, params, "workspace_id", filters.workspaceId);
    appendWhere(clauses, params, "visibility", filters.visibility);
    appendWhere(clauses, params, "status", filters.status || "active");
    const sql = `SELECT * FROM family_profile_insights${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...params, limitFrom(filters.limit)).map(publicInsightFromRow);
  }

  function updateInsightVisibility(insightId, visibility, options = {}) {
    migrate();
    open().prepare(`
      UPDATE family_profile_insights
      SET visibility = ?, updated_at = ?, metadata_json = COALESCE(?, metadata_json)
      WHERE id = ?
    `).run(visibility, clock(), options.metadata ? stableJson(options.metadata) : null, cleanString(insightId));
    return getInsight(insightId);
  }

  function updateInsightStatus(insightId, status) {
    migrate();
    open().prepare(`
      UPDATE family_profile_insights
      SET status = ?, updated_at = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END
      WHERE id = ?
    `).run(status, clock(), status, clock(), cleanString(insightId));
    return getInsight(insightId);
  }

  function upsertPersonalProfileSnapshot(input = {}) {
    migrate();
    const db = open();
    const existing = input.idempotencyKey
      ? db.prepare("SELECT * FROM family_profile_snapshots WHERE idempotency_key = ?").get(input.idempotencyKey)
      : null;
    const snapshotId = existing?.id || cleanString(input.snapshotId) || makeId("family_snapshot", [
      input.workspaceId,
      input.profileVersion,
      input.summary,
      input.idempotencyKey,
    ]);
    db.prepare(`
      INSERT INTO family_profile_snapshots (
        id, workspace_id, profile_version, summary, domains_json, payload_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        profile_version = excluded.profile_version,
        summary = excluded.summary,
        domains_json = excluded.domains_json,
        payload_json = excluded.payload_json,
        idempotency_key = excluded.idempotency_key
    `).run(
      snapshotId,
      input.workspaceId,
      Number(input.profileVersion || 1),
      input.summary,
      stableJson(asArray(input.domains)),
      stableJson(input.payload || {}),
      cleanString(input.idempotencyKey),
      input.createdAt || existing?.created_at || clock(),
    );
    return publicSnapshotFromRow(db.prepare("SELECT * FROM family_profile_snapshots WHERE id = ?").get(snapshotId));
  }

  function latestPersonalProfileSnapshot(workspaceId) {
    migrate();
    return publicSnapshotFromRow(open().prepare(`
      SELECT * FROM family_profile_snapshots
      WHERE workspace_id = ?
      ORDER BY profile_version DESC, created_at DESC
      LIMIT 1
    `).get(cleanString(workspaceId)));
  }

  function upsertHouseholdProfile(input = {}) {
    migrate();
    const db = open();
    const existing = input.idempotencyKey
      ? db.prepare("SELECT * FROM family_household_profiles WHERE idempotency_key = ?").get(input.idempotencyKey)
      : null;
    const timestamp = clock();
    const profileId = existing?.id || cleanString(input.householdProfileId) || makeId("family_household", [
      input.profileVersion,
      input.summary,
      input.idempotencyKey,
    ]);
    db.prepare(`
      INSERT INTO family_household_profiles (
        id, profile_version, summary, member_workspace_ids_json, domains_json, payload_json,
        visibility, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profile_version = excluded.profile_version,
        summary = excluded.summary,
        member_workspace_ids_json = excluded.member_workspace_ids_json,
        domains_json = excluded.domains_json,
        payload_json = excluded.payload_json,
        visibility = excluded.visibility,
        idempotency_key = excluded.idempotency_key,
        updated_at = excluded.updated_at
    `).run(
      profileId,
      Number(input.profileVersion || 1),
      input.summary,
      stableJson(asArray(input.memberWorkspaceIds)),
      stableJson(asArray(input.domains)),
      stableJson(input.payload || {}),
      input.visibility,
      cleanString(input.idempotencyKey),
      input.createdAt || existing?.created_at || timestamp,
      timestamp,
    );
    return publicHouseholdProfileFromRow(db.prepare("SELECT * FROM family_household_profiles WHERE id = ?").get(profileId));
  }

  function getHouseholdProfile() {
    migrate();
    return publicHouseholdProfileFromRow(open().prepare(`
      SELECT * FROM family_household_profiles
      ORDER BY profile_version DESC, updated_at DESC
      LIMIT 1
    `).get());
  }

  function integrityReport() {
    migrate();
    const db = open();
    const migration = db.prepare("SELECT schema_version FROM family_profile_schema_migrations WHERE id = 1").get();
    const quick = db.prepare("PRAGMA quick_check").get();
    return {
      schemaVersion: Number(migration?.schema_version || 0),
      quickCheck: quick?.quick_check || Object.values(quick || {})[0] || "",
    };
  }

  function close() {
    if (database && ownsDatabase && typeof database.close === "function") database.close();
    database = null;
    ownsDatabase = false;
  }

  return {
    close,
    getHouseholdProfile,
    getInsight,
    getProfileRecord,
    integrityReport,
    latestPersonalProfileSnapshot,
    listEvidenceRefs,
    listInsights,
    listProfileRecords,
    migrate,
    open,
    addEvidenceRef,
    updateInsightStatus,
    updateInsightVisibility,
    upsertHouseholdProfile,
    upsertInsight,
    upsertPersonalProfileSnapshot,
    upsertProfileRecord,
  };
}

module.exports = {
  CURRENT_FAMILY_PROFILE_SCHEMA_VERSION,
  createFamilyProfileRepository,
};
