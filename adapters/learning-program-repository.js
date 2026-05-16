"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION = 1;

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

function stripPrivateLearningFields(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((item) => stripPrivateLearningFields(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const blocked = new Set([
    "answer",
    "answers",
    "answerText",
    "rawAnswer",
    "rawAnswers",
    "rawResponse",
    "rawTranscript",
    "transcript",
    "fullTranscript",
    "questionText",
    "questions",
    "answerKey",
    "solution",
    "solutions",
    "prompt",
    "rawPrompt",
    "apiKey",
    "accessKey",
    "authorization",
    "cookie",
    "pushEndpoint",
    "endpoint",
    "filePath",
    "localPath",
  ]);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = stripPrivateLearningFields(item, depth + 1);
  }
  return out;
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

function publicProgramFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    programId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    title: row.title,
    domain: row.domain,
    focusAreas: parseJson(row.focus_areas_json, []),
    goalSummary: row.goal_summary,
    startDate: row.start_date,
    endDate: row.end_date,
    daysPerWeek: Number(row.days_per_week || 0),
    minutesPerDay: Number(row.minutes_per_day || 0),
    intensity: row.intensity,
    status: row.status,
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    curriculumRefs: parseJson(row.curriculum_refs_json, []),
    constraints: parseJson(row.constraints_json, {}),
    reviewPolicy: parseJson(row.review_policy_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  });
}

function publicDraftFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    draftId: row.id,
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    dailyPlans: parseJson(row.daily_plans_json, []),
    taskCount: Number(row.task_count || 0),
    reliability: parseJson(row.reliability_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || "",
  });
}

function publicReviewItemFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    reviewId: row.id,
    programId: row.program_id,
    draftId: row.draft_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    reason: row.reason,
    summary: row.summary,
    riskFlags: parseJson(row.risk_flags_json, []),
    allowedActions: parseJson(row.allowed_actions_json, []),
    decision: parseJson(row.decision_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at || "",
  });
}

function publicPublicationFromRow(row) {
  if (!row) return null;
  return {
    publicationId: row.id,
    programId: row.program_id,
    draftId: row.draft_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    kanbanResult: parseJson(row.kanban_result_json, null),
    createdAt: row.created_at,
  };
}

function createLearningProgramRepository(options = {}) {
  const dataDir = path.resolve(String(options.dataDir || process.env.HERMES_WEB_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web")));
  const dbPath = path.resolve(String(options.dbPath || process.env.HERMES_MOBILE_LEARNING_DB_PATH || process.env.HERMES_WEB_LEARNING_DB_PATH || path.join(dataDir, "learning-growth.sqlite3")));
  const readonly = Boolean(options.readonly);
  let db = null;

  function open() {
    if (db) return db;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath, { open: true, readOnly: readonly });
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    return db;
  }

  function close() {
    if (!db) return;
    db.close();
    db = null;
  }

  function migrate() {
    const database = open();
    database.exec(`
      CREATE TABLE IF NOT EXISTS learning_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_programs (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        focus_areas_json TEXT NOT NULL,
        goal_summary TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days_per_week INTEGER NOT NULL,
        minutes_per_day INTEGER NOT NULL,
        intensity TEXT NOT NULL,
        status TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        curriculum_refs_json TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        review_policy_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS learning_plan_drafts (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        daily_plans_json TEXT NOT NULL,
        task_count INTEGER NOT NULL,
        reliability_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_parent_review_items (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        summary TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        decision_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
        FOREIGN KEY(draft_id) REFERENCES learning_plan_drafts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_publications (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        kanban_result_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
        FOREIGN KEY(draft_id) REFERENCES learning_plan_drafts(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_learning_programs_learner ON learning_programs(learner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_drafts_program ON learning_plan_drafts(program_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_reviews_status ON learning_parent_review_items(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_publications_draft ON learning_publications(draft_id, created_at);
    `);
    const row = database.prepare("SELECT version FROM learning_schema_migrations WHERE version = ?").get(CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION);
    if (!row) {
      database.prepare("INSERT INTO learning_schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
        CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
        "learning program v0.1",
        nowIso(),
      );
    }
  }

  function upsertProgram(program) {
    migrate();
    const now = nowIso();
    const current = getProgram(program.programId);
    const createdAt = current?.createdAt || program.createdAt || now;
    const updatedAt = program.updatedAt || now;
    const row = Object.assign({}, program, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_programs(
        id, learner_id, workspace_id, title, domain, focus_areas_json, goal_summary,
        start_date, end_date, days_per_week, minutes_per_day, intensity, status,
        source_basis_refs_json, curriculum_refs_json, constraints_json, review_policy_json,
        raw_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        title=excluded.title,
        domain=excluded.domain,
        focus_areas_json=excluded.focus_areas_json,
        goal_summary=excluded.goal_summary,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        days_per_week=excluded.days_per_week,
        minutes_per_day=excluded.minutes_per_day,
        intensity=excluded.intensity,
        status=excluded.status,
        source_basis_refs_json=excluded.source_basis_refs_json,
        curriculum_refs_json=excluded.curriculum_refs_json,
        constraints_json=excluded.constraints_json,
        review_policy_json=excluded.review_policy_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        archived_at=excluded.archived_at
    `).run(
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.title,
      row.domain,
      stableJson(row.focusAreas || []),
      row.goalSummary,
      row.startDate,
      row.endDate,
      Number(row.daysPerWeek || 0),
      Number(row.minutesPerDay || 0),
      row.intensity,
      row.status || "active",
      stableJson(row.sourceBasisRefs || []),
      stableJson(row.curriculumRefs || []),
      stableJson(row.constraints || {}),
      stableJson(row.reviewPolicy || {}),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.archivedAt || "",
    );
    return getProgram(row.programId);
  }

  function getProgram(programId) {
    migrate();
    return publicProgramFromRow(open().prepare("SELECT * FROM learning_programs WHERE id = ?").get(cleanString(programId)));
  }

  function listPrograms(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (!filters.includeArchived) where.push("archived_at = ''");
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_programs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicProgramFromRow);
  }

  function savePlanDraft(draft) {
    migrate();
    const now = nowIso();
    const current = getPlanDraft(draft.draftId);
    const createdAt = current?.createdAt || draft.createdAt || now;
    const updatedAt = draft.updatedAt || now;
    const taskCount = asArray(draft.dailyPlans).reduce((sum, day) => sum + asArray(day.tasks).length, 0);
    const row = Object.assign({}, draft, { createdAt, updatedAt, taskCount });
    open().prepare(`
      INSERT INTO learning_plan_drafts(
        id, program_id, learner_id, workspace_id, status, week_start, week_end,
        daily_plans_json, task_count, reliability_json, raw_json, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        daily_plans_json=excluded.daily_plans_json,
        task_count=excluded.task_count,
        reliability_json=excluded.reliability_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        published_at=excluded.published_at
    `).run(
      row.draftId,
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.status || "draft",
      row.weekStart || "",
      row.weekEnd || "",
      stableJson(row.dailyPlans || []),
      row.taskCount,
      stableJson(row.reliability || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.publishedAt || "",
    );
    return getPlanDraft(row.draftId);
  }

  function getPlanDraft(draftId) {
    migrate();
    return publicDraftFromRow(open().prepare("SELECT * FROM learning_plan_drafts WHERE id = ?").get(cleanString(draftId)));
  }

  function latestDraftForProgram(programId) {
    migrate();
    return publicDraftFromRow(open().prepare("SELECT * FROM learning_plan_drafts WHERE program_id = ? ORDER BY created_at DESC LIMIT 1").get(cleanString(programId)));
  }

  function listPlanDrafts(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 20) || 20));
    const sql = `SELECT * FROM learning_plan_drafts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicDraftFromRow);
  }

  function saveReviewItem(item) {
    migrate();
    const now = nowIso();
    const current = getReviewItem(item.reviewId);
    const createdAt = current?.createdAt || item.createdAt || now;
    const updatedAt = item.updatedAt || now;
    const row = Object.assign({}, item, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_parent_review_items(
        id, program_id, draft_id, learner_id, workspace_id, status, reason, summary,
        risk_flags_json, allowed_actions_json, decision_json, raw_json, created_at, updated_at, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        reason=excluded.reason,
        summary=excluded.summary,
        risk_flags_json=excluded.risk_flags_json,
        allowed_actions_json=excluded.allowed_actions_json,
        decision_json=excluded.decision_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        decided_at=excluded.decided_at
    `).run(
      row.reviewId,
      row.programId,
      row.draftId,
      row.learnerId,
      row.workspaceId,
      row.status || "pending",
      row.reason || "",
      row.summary || "",
      stableJson(row.riskFlags || []),
      stableJson(row.allowedActions || []),
      stableJson(row.decision || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.decidedAt || "",
    );
    return getReviewItem(row.reviewId);
  }

  function getReviewItem(reviewId) {
    migrate();
    return publicReviewItemFromRow(open().prepare("SELECT * FROM learning_parent_review_items WHERE id = ?").get(cleanString(reviewId)));
  }

  function listReviewItems(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_parent_review_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicReviewItemFromRow);
  }

  function savePublication(publication) {
    migrate();
    const createdAt = publication.createdAt || nowIso();
    open().prepare(`
      INSERT INTO learning_publications(id, program_id, draft_id, learner_id, workspace_id, status, kanban_result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      publication.publicationId,
      publication.programId,
      publication.draftId,
      publication.learnerId,
      publication.workspaceId,
      publication.status || "published",
      stableJson(publication.kanbanResult || null),
      createdAt,
    );
    return publicPublicationFromRow(open().prepare("SELECT * FROM learning_publications WHERE id = ?").get(publication.publicationId));
  }

  function counts(filters = {}) {
    migrate();
    const learnerId = cleanString(filters.learnerId);
    const suffix = learnerId ? " WHERE learner_id = ?" : "";
    const args = learnerId ? [learnerId] : [];
    const count = (table) => Number(open().prepare(`SELECT COUNT(*) AS count FROM ${table}${suffix}`).get(...args)?.count || 0);
    const pending = Number(open().prepare(`SELECT COUNT(*) AS count FROM learning_parent_review_items WHERE status = 'pending'${learnerId ? " AND learner_id = ?" : ""}`).get(...args)?.count || 0);
    return {
      programs: count("learning_programs"),
      drafts: count("learning_plan_drafts"),
      reviewItems: count("learning_parent_review_items"),
      pendingReviewItems: pending,
      publications: count("learning_publications"),
    };
  }

  function integritySummary() {
    migrate();
    const database = open();
    return {
      schemaVersion: CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
      quickCheck: database.prepare("PRAGMA quick_check").get()?.quick_check || "unknown",
      foreignKeyIssues: database.prepare("PRAGMA foreign_key_check").all().length,
      counts: counts(),
    };
  }

  return {
    close,
    counts,
    dbPath,
    getPlanDraft,
    getProgram,
    getReviewItem,
    integritySummary,
    latestDraftForProgram,
    listPlanDrafts,
    listPrograms,
    listReviewItems,
    migrate,
    open,
    savePlanDraft,
    savePublication,
    saveReviewItem,
    upsertProgram,
  };
}

module.exports = {
  CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
  createLearningProgramRepository,
  publicDraftFromRow,
  publicProgramFromRow,
  publicReviewItemFromRow,
  stripPrivateLearningFields,
};
