"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const CURRENT_SCHEMA_VERSION = 6;

function nowIso() {
  return new Date().toISOString();
}

function stableJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function parseJson(text, fallback = null) {
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

function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function normalizeIso(value) {
  return String(value || "");
}

function normalizeId(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeStringList(value) {
  const input = typeof value === "string" && value.trim().startsWith("[")
    ? parseJson(value, value)
    : value;
  const raw = Array.isArray(input)
    ? input
    : (input && typeof input === "object" ? Object.values(input) : String(input || "").split(/[,\n;]/));
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function publicTodoFromRow(row) {
  const raw = parseJson(row?.raw_json, null);
  if (raw && typeof raw === "object") return raw;
  return {
    id: String(row?.id || ""),
    content: String(row?.content || ""),
    status: String(row?.status || ""),
    assignee_principal_id: String(row?.assignee || ""),
    assignee_label: String(row?.assignee || ""),
    created_by_principal: String(row?.principal_id || ""),
    due_at: String(row?.due_at || ""),
    due_local: String(row?.due_at || ""),
    created_at: String(row?.created_at || ""),
    updated_at: String(row?.updated_at || ""),
  };
}

function publicAutomationFromRow(row) {
  const raw = parseJson(row?.raw_json, null);
  if (raw && typeof raw === "object") return raw;
  return {
    id: String(row?.id || ""),
    name: String(row?.name || ""),
    status: String(row?.status || ""),
    state: String(row?.status || ""),
    schedule: String(row?.schedule || ""),
    ownerPrincipalId: String(row?.principal_id || ""),
    updatedAt: String(row?.updated_at || ""),
    createdAt: String(row?.created_at || ""),
  };
}

function publicActionInboxItemFromRow(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json, {});
  const sourceRef = parseJson(row.source_ref_json, {});
  return Object.assign({}, raw && typeof raw === "object" ? raw : {}, {
    id: String(row.id || ""),
    workspaceId: String(row.workspace_id || ""),
    assigneeWorkspaceId: String(row.assignee_workspace_id || ""),
    sourceType: String(row.source_type || ""),
    sourceId: String(row.source_id || ""),
    sourceRef: sourceRef && typeof sourceRef === "object" ? sourceRef : {},
    itemType: String(row.item_type || ""),
    status: String(row.status || ""),
    priority: String(row.priority || ""),
    title: String(row.title || ""),
    summary: String(row.summary || ""),
    actionLabel: String(row.action_label || ""),
    deepLink: String(row.deep_link || ""),
    dedupeKey: String(row.dedupe_key || ""),
    dueAt: String(row.due_at || ""),
    availableAt: String(row.available_at || ""),
    completedAt: String(row.completed_at || ""),
    dismissedAt: String(row.dismissed_at || ""),
    lastEventAt: String(row.last_event_at || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  });
}

function publicActionInboxEventFromRow(row) {
  if (!row) return null;
  const payload = parseJson(row.payload_json, {});
  return {
    id: String(row.id || ""),
    itemId: String(row.item_id || ""),
    eventType: String(row.event_type || ""),
    actorWorkspaceId: String(row.actor_workspace_id || ""),
    actorPrincipalId: String(row.actor_principal_id || ""),
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: String(row.created_at || ""),
  };
}

function publicTopicContextSummaryFromRow(row) {
  if (!row) return null;
  const summary = parseJson(row.summary_json, {});
  return Object.assign({}, summary && typeof summary === "object" ? summary : {}, {
    topicId: String(row.topic_id || ""),
    taskGroupId: String(row.task_group_id || ""),
    workspaceId: String(row.workspace_id || ""),
    summaryVersion: Number(row.summary_version || summary?.summaryVersion || 0),
    lastCompactedMessageId: String(row.last_compacted_message_id || summary?.lastCompactedMessageId || ""),
    lastCompactedEventId: String(row.last_compacted_event_id || summary?.lastCompactedEventId || ""),
    inputHash: String(row.input_hash || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  });
}

function publicTopicWorkingStateFromRow(row) {
  if (!row) return null;
  const state = parseJson(row.state_json, {});
  return Object.assign({}, state && typeof state === "object" ? state : {}, {
    topicId: String(row.topic_id || ""),
    taskGroupId: String(row.task_group_id || ""),
    workspaceId: String(row.workspace_id || ""),
    stateVersion: Number(row.state_version || state?.stateVersion || 0),
    status: String(row.status || state?.status || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  });
}

function publicTopicContextRefFromRow(row) {
  if (!row) return null;
  const ref = parseJson(row.ref_json, {});
  return Object.assign({}, ref && typeof ref === "object" ? ref : {}, {
    refId: String(row.ref_id || ""),
    topicId: String(row.topic_id || ""),
    taskGroupId: String(row.task_group_id || ""),
    workspaceId: String(row.workspace_id || ""),
    refType: String(row.ref_type || ref?.refType || ""),
    targetId: String(row.target_id || ref?.targetId || ""),
    role: String(row.role || ref?.role || ""),
    createdAt: String(row.created_at || ref?.createdAt || ""),
    updatedAt: String(row.updated_at || ""),
  });
}

function publicKanbanCaseShareFromRow(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json, {});
  const performerWorkspaceIds = normalizeStringList(row.performer_workspace_ids_json)
    .concat(normalizeStringList(row.performer_workspace_id))
    .filter((value, index, all) => all.indexOf(value) === index);
  const fallback = {
    schemaVersion: 1,
    ownerWorkspaceId: String(row.owner_workspace_id || row.workspace_id || "owner"),
    workspaceId: String(row.workspace_id || row.owner_workspace_id || "owner"),
    caseId: String(row.case_id || ""),
    caseMode: String(row.case_mode || ""),
    performerWorkspaceId: String(row.performer_workspace_id || performerWorkspaceIds[0] || ""),
    performerWorkspaceIds,
    viewerWorkspaceIds: normalizeStringList(row.viewer_workspace_ids_json),
    managerWorkspaceIds: normalizeStringList(row.manager_workspace_ids_json),
    topicThreadId: String(row.topic_thread_id || ""),
    topicTaskGroupId: String(row.topic_task_group_id || ""),
    sharedDirectoryPath: String(row.shared_directory_path || ""),
    caseDirectoryPath: String(row.case_directory_path || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    archivedAt: String(row.archived_at || ""),
    deletedAt: String(row.deleted_at || ""),
  };
  return Object.assign({}, raw && typeof raw === "object" ? raw : {}, fallback);
}

function sha256File(filePath) {
  try {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  } catch (_) {
    return "";
  }
}

function sqlQuoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

const TABLES = [
  "platform_currency_ledger_entries",
  "platform_currency_wallets",
  "voice_input_audit",
  "voice_input_phrasebook",
  "voice_input_corrections",
  "audit_log",
  "action_inbox_events",
  "action_inbox_items",
  "automation_jobs",
  "topic_context_refs",
  "topic_working_states",
  "topic_context_summaries",
  "todo_items",
  "kanban_case_shares",
  "shared_directories",
  "push_deliveries",
  "push_receipts",
  "push_subscriptions",
  "artifacts",
  "messages",
  "threads",
  "access_keys",
  "workspaces",
  "meta",
  "schema_migrations",
];

const TABLE_COUNT_COLUMNS = {
  schema_migrations: "version",
  meta: "key",
  workspaces: "id",
  access_keys: "workspace_id",
  threads: "id",
  messages: "id",
  artifacts: "id",
  push_subscriptions: "id",
  push_receipts: "id",
  push_deliveries: "id",
  shared_directories: "id",
  kanban_case_shares: "id",
  todo_items: "id",
  automation_jobs: "id",
  action_inbox_items: "id",
  action_inbox_events: "id",
  topic_context_summaries: "topic_id",
  topic_working_states: "topic_id",
  topic_context_refs: "ref_id",
  audit_log: "id",
  voice_input_corrections: "id",
  voice_input_phrasebook: "id",
  voice_input_audit: "id",
  platform_currency_wallets: "wallet_id",
  platform_currency_ledger_entries: "entry_id",
};

function createMobileSqliteStore(options = {}) {
  const dbPath = path.resolve(String(options.dbPath || path.join(process.cwd(), "hermes-mobile.sqlite3")));
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

  function exec(sql) {
    open().exec(sql);
  }

  function generatedId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
  }

  function migrate() {
    exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        principal_id TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        owner_workspace_id TEXT NOT NULL DEFAULT '',
        root_label TEXT NOT NULL DEFAULT '',
        policy_json TEXT,
        local_config_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS access_keys (
        workspace_id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        raw_json TEXT
      );

      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        workspace_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        project_id TEXT NOT NULL DEFAULT '',
        subproject_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        single_window INTEGER NOT NULL DEFAULT 0,
        hermes_session_id TEXT NOT NULL DEFAULT '',
        active_run_id TEXT NOT NULL DEFAULT '',
        active_run_ids_json TEXT,
        chat_group_json TEXT,
        task_group_meta_json TEXT,
        events_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id, subproject_id);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        workspace_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        task_group_id TEXT NOT NULL DEFAULT '',
        message_kind TEXT NOT NULL DEFAULT '',
        sender_workspace_id TEXT NOT NULL DEFAULT '',
        sender_principal_id TEXT NOT NULL DEFAULT '',
        sender_label TEXT NOT NULL DEFAULT '',
        reply_to_message_id TEXT NOT NULL DEFAULT '',
        run_id TEXT NOT NULL DEFAULT '',
        task_id TEXT NOT NULL DEFAULT '',
        reasoning_effort TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        artifacts_json TEXT,
        directory_route_json TEXT,
        directory_aliases_json TEXT,
        usage_json TEXT,
        run_options_json TEXT,
        error TEXT NOT NULL DEFAULT '',
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        submitted_at TEXT NOT NULL DEFAULT '',
        queued_at TEXT NOT NULL DEFAULT '',
        started_at TEXT NOT NULL DEFAULT '',
        first_feedback_at TEXT NOT NULL DEFAULT '',
        completed_at TEXT NOT NULL DEFAULT '',
        failed_at TEXT NOT NULL DEFAULT '',
        cancelled_at TEXT NOT NULL DEFAULT '',
        revoked_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_task_group ON messages(task_group_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        thread_id TEXT NOT NULL DEFAULT '',
        message_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        mime TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT '',
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_thread ON artifacts(thread_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_message ON artifacts(message_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        workspace_id TEXT NOT NULL DEFAULT '',
        principal_ids_json TEXT,
        workspace_ids_json TEXT,
        endpoint_hash TEXT NOT NULL DEFAULT '',
        disabled INTEGER NOT NULL DEFAULT 0,
        last_success_at TEXT NOT NULL DEFAULT '',
        last_failure_at TEXT NOT NULL DEFAULT '',
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS push_receipts (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        subscription_id TEXT NOT NULL DEFAULT '',
        principal_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        message_type TEXT NOT NULL DEFAULT '',
        mark_key TEXT NOT NULL DEFAULT '',
        shown INTEGER NOT NULL DEFAULT 0,
        foreground INTEGER NOT NULL DEFAULT 0,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_push_receipts_mark_key ON push_receipts(mark_key);
      CREATE INDEX IF NOT EXISTS idx_push_receipts_principal ON push_receipts(principal_id);

      CREATE TABLE IF NOT EXISTS push_deliveries (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        principal_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        message_type TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        attempted INTEGER NOT NULL DEFAULT 0,
        sent INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_push_deliveries_type ON push_deliveries(message_type, created_at);

      CREATE TABLE IF NOT EXISTS shared_directories (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL DEFAULT '',
        root_path TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        owner_workspace_id TEXT NOT NULL DEFAULT '',
        owner_principal_id TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        target_workspace_ids_json TEXT,
        permissions_json TEXT,
        aliases_json TEXT,
        workspace_labels_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_shared_root ON shared_directories(root_path);
      CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_directories(owner_workspace_id);

      CREATE TABLE IF NOT EXISTS kanban_case_shares (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        owner_workspace_id TEXT NOT NULL DEFAULT '',
        case_mode TEXT NOT NULL DEFAULT '',
        topic_thread_id TEXT NOT NULL DEFAULT '',
        topic_task_group_id TEXT NOT NULL DEFAULT '',
        shared_directory_path TEXT NOT NULL DEFAULT '',
        case_directory_path TEXT NOT NULL DEFAULT '',
        performer_workspace_id TEXT NOT NULL DEFAULT '',
        performer_workspace_ids_json TEXT,
        viewer_workspace_ids_json TEXT,
        manager_workspace_ids_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        archived_at TEXT NOT NULL DEFAULT '',
        deleted_at TEXT NOT NULL DEFAULT ''
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_case_shares_owner_case
        ON kanban_case_shares(owner_workspace_id, case_id);
      CREATE INDEX IF NOT EXISTS idx_kanban_case_shares_owner
        ON kanban_case_shares(owner_workspace_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_kanban_case_shares_topic
        ON kanban_case_shares(topic_thread_id, topic_task_group_id);

      CREATE TABLE IF NOT EXISTS todo_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '',
        principal_id TEXT NOT NULL DEFAULT '',
        assignee TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS automation_jobs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '',
        principal_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        schedule TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        latest_deliverable_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS action_inbox_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '',
        assignee_workspace_id TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT '',
        source_id TEXT NOT NULL DEFAULT '',
        source_ref_json TEXT,
        item_type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        title TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        action_label TEXT NOT NULL DEFAULT '',
        deep_link TEXT NOT NULL DEFAULT '',
        dedupe_key TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL DEFAULT '',
        available_at TEXT NOT NULL DEFAULT '',
        completed_at TEXT NOT NULL DEFAULT '',
        dismissed_at TEXT NOT NULL DEFAULT '',
        last_event_at TEXT NOT NULL DEFAULT '',
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_action_inbox_items_workspace_status
        ON action_inbox_items(workspace_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_action_inbox_items_assignee_status
        ON action_inbox_items(assignee_workspace_id, status, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_action_inbox_items_dedupe
        ON action_inbox_items(workspace_id, dedupe_key)
        WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';
      CREATE INDEX IF NOT EXISTS idx_action_inbox_items_source
        ON action_inbox_items(source_type, source_id);

      CREATE TABLE IF NOT EXISTS action_inbox_events (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT '',
        actor_workspace_id TEXT NOT NULL DEFAULT '',
        actor_principal_id TEXT NOT NULL DEFAULT '',
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_action_inbox_events_item
        ON action_inbox_events(item_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_action_inbox_events_type
        ON action_inbox_events(event_type, created_at);

      CREATE TABLE IF NOT EXISTS topic_context_summaries (
        topic_id TEXT NOT NULL,
        task_group_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL DEFAULT '',
        summary_json TEXT NOT NULL,
        summary_version INTEGER NOT NULL DEFAULT 0,
        last_compacted_message_id TEXT NOT NULL DEFAULT '',
        last_compacted_event_id TEXT NOT NULL DEFAULT '',
        input_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(topic_id, task_group_id)
      );

      CREATE INDEX IF NOT EXISTS idx_topic_context_summaries_workspace
        ON topic_context_summaries(workspace_id, updated_at);

      CREATE TABLE IF NOT EXISTS topic_working_states (
        topic_id TEXT NOT NULL,
        task_group_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL DEFAULT '',
        state_json TEXT NOT NULL,
        state_version INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(topic_id, task_group_id)
      );

      CREATE INDEX IF NOT EXISTS idx_topic_working_states_workspace
        ON topic_working_states(workspace_id, updated_at);

      CREATE TABLE IF NOT EXISTS topic_context_refs (
        ref_id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        task_group_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL DEFAULT '',
        ref_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        ref_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE INDEX IF NOT EXISTS idx_topic_context_refs_topic
        ON topic_context_refs(topic_id, task_group_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_topic_context_refs_target
        ON topic_context_refs(ref_type, target_id);

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        actor_workspace_id TEXT NOT NULL DEFAULT '',
        actor_principal_id TEXT NOT NULL DEFAULT '',
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        payload_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_input_corrections (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        surface_type TEXT NOT NULL DEFAULT '',
        plugin_id TEXT NOT NULL DEFAULT '',
        thread_id TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        from_text TEXT NOT NULL DEFAULT '',
        to_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        support_count INTEGER NOT NULL DEFAULT 0,
        rejection_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT '',
        last_applied_at TEXT NOT NULL DEFAULT '',
        raw_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_voice_input_corrections_scope
        ON voice_input_corrections(workspace_id, actor_id, surface_type, plugin_id, thread_id, language);

      CREATE TABLE IF NOT EXISTS voice_input_phrasebook (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        surface_type TEXT NOT NULL DEFAULT '',
        plugin_id TEXT NOT NULL DEFAULT '',
        thread_id TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT '',
        term TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        support_count INTEGER NOT NULL DEFAULT 0,
        aliases_json TEXT,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL DEFAULT '',
        last_applied_at TEXT NOT NULL DEFAULT '',
        raw_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_voice_input_phrasebook_scope
        ON voice_input_phrasebook(workspace_id, actor_id, surface_type, plugin_id, thread_id, language, source);
      CREATE INDEX IF NOT EXISTS idx_voice_input_phrasebook_term
        ON voice_input_phrasebook(workspace_id, term);

      CREATE TABLE IF NOT EXISTS voice_input_audit (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL DEFAULT '',
        actor_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL DEFAULT '',
        surface_type TEXT NOT NULL DEFAULT '',
        plugin_id TEXT NOT NULL DEFAULT '',
        thread_id TEXT NOT NULL DEFAULT '',
        backend TEXT NOT NULL DEFAULT '',
        payload_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_voice_input_audit_scope
        ON voice_input_audit(workspace_id, actor_id, event_type, created_at);

      CREATE TABLE IF NOT EXISTS platform_currency_wallets (
        wallet_id TEXT PRIMARY KEY,
        workspace_id TEXT UNIQUE NOT NULL,
        currency TEXT NOT NULL DEFAULT 'TONGBAO',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS platform_currency_ledger_entries (
        entry_id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'TONGBAO',
        amount_delta INTEGER NOT NULL DEFAULT 0,
        available_delta INTEGER NOT NULL DEFAULT 0,
        held_delta INTEGER NOT NULL DEFAULT 0,
        entry_type TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT '',
        source_id TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        metadata_json TEXT,
        created_by_principal_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT '',
        reversal_of_entry_id TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(wallet_id) REFERENCES platform_currency_wallets(wallet_id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_currency_ledger_idempotency
        ON platform_currency_ledger_entries(wallet_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_platform_currency_ledger_workspace
        ON platform_currency_ledger_entries(workspace_id, created_at);
    `);

    ensureColumn("threads", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("messages", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("artifacts", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("push_subscriptions", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("push_receipts", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("push_deliveries", "position", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("kanban_case_shares", "workspace_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn("kanban_case_shares", "case_mode", "TEXT NOT NULL DEFAULT ''");
    ensureColumn("kanban_case_shares", "performer_workspace_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn("kanban_case_shares", "performer_workspace_ids_json", "TEXT");
    ensureColumn("kanban_case_shares", "viewer_workspace_ids_json", "TEXT");
    ensureColumn("kanban_case_shares", "manager_workspace_ids_json", "TEXT");
    ensureColumn("kanban_case_shares", "archived_at", "TEXT NOT NULL DEFAULT ''");
    ensureColumn("kanban_case_shares", "deleted_at", "TEXT NOT NULL DEFAULT ''");

    markMigration(1, "initial_mobile_service_layer");
    markMigration(2, "kanban_case_shares");
    markMigration(3, "topic_context");
    markMigration(4, "action_inbox");
    markMigration(5, "platform_currency");
    markMigration(6, "voice_input_learning_state");
    setMeta("schemaVersion", CURRENT_SCHEMA_VERSION);
  }

  function markMigration(version, name) {
    const row = open().prepare("SELECT version FROM schema_migrations WHERE version = ?").get(version);
    if (row) return;
    open().prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
      version,
      name,
      nowIso(),
    );
  }

  function ensureColumn(table, column, definition) {
    const rows = open().prepare(`PRAGMA table_info(${sqlQuoteIdent(table)})`).all();
    if (rows.some((row) => row.name === column)) return;
    open().exec(`ALTER TABLE ${sqlQuoteIdent(table)} ADD COLUMN ${sqlQuoteIdent(column)} ${definition};`);
  }

  function clearImportedData() {
    const database = open();
    database.exec("PRAGMA foreign_keys = OFF;");
    for (const table of TABLES) {
      if (table === "schema_migrations") continue;
      database.prepare(`DELETE FROM ${sqlQuoteIdent(table)}`).run();
    }
    database.exec("PRAGMA foreign_keys = ON;");
    setMeta("schemaVersion", CURRENT_SCHEMA_VERSION);
  }

  function setMeta(key, value) {
    open().prepare(`
      INSERT INTO meta(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(key), JSON.stringify(value), nowIso());
  }

  function getMeta(key, fallback = null) {
    const row = open().prepare("SELECT value FROM meta WHERE key = ?").get(String(key));
    return row ? parseJson(row.value, fallback) : fallback;
  }

  function importWorkspace(row = {}) {
    const id = normalizeId(row.id, "owner");
    open().prepare(`
      INSERT INTO workspaces(id, label, role, principal_id, source, owner_workspace_id, root_label,
        policy_json, local_config_json, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        role = excluded.role,
        principal_id = excluded.principal_id,
        source = excluded.source,
        owner_workspace_id = excluded.owner_workspace_id,
        root_label = excluded.root_label,
        policy_json = excluded.policy_json,
        local_config_json = excluded.local_config_json,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(row.label || row.name || id),
      String(row.role || ""),
      String(row.principalId || row.principal_id || id),
      String(row.source || ""),
      String(row.ownerWorkspaceId || row.owner_workspace_id || ""),
      String(row.rootLabel || row.root_label || ""),
      stableJson(row.policy || row.accessPolicy || null),
      stableJson(row.localConfig || null),
      stableJson(row),
      normalizeIso(row.createdAt),
      normalizeIso(row.updatedAt || row.createdAt),
    );
  }

  function importAccessKey(workspaceId, row = {}) {
    const id = normalizeId(workspaceId);
    const hash = String(row.hash || "").trim().toLowerCase();
    if (!id || !hash) return false;
    open().prepare(`
      INSERT INTO access_keys(workspace_id, hash, created_at, updated_at, created_by, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        hash = excluded.hash,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        created_by = excluded.created_by,
        raw_json = excluded.raw_json
    `).run(
      id,
      hash,
      normalizeIso(row.createdAt),
      normalizeIso(row.updatedAt || row.createdAt),
      String(row.createdBy || ""),
      stableJson(row),
    );
    return true;
  }

  function importThread(thread = {}, position = 0) {
    const id = normalizeId(thread.id);
    if (!id) return false;
    open().prepare(`
      INSERT INTO threads(id, position, workspace_id, title, project_id, subproject_id, status, single_window,
        hermes_session_id, active_run_id, active_run_ids_json, chat_group_json, task_group_meta_json,
        events_json, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        project_id = excluded.project_id,
        subproject_id = excluded.subproject_id,
        status = excluded.status,
        single_window = excluded.single_window,
        hermes_session_id = excluded.hermes_session_id,
        active_run_id = excluded.active_run_id,
        active_run_ids_json = excluded.active_run_ids_json,
        chat_group_json = excluded.chat_group_json,
        task_group_meta_json = excluded.task_group_meta_json,
        events_json = excluded.events_json,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      Number(position) || 0,
      String(thread.workspaceId || "owner"),
      String(thread.title || ""),
      String(thread.projectId || ""),
      String(thread.subprojectId || ""),
      String(thread.status || ""),
      thread.singleWindow ? 1 : 0,
      String(thread.hermesSessionId || ""),
      String(thread.activeRunId || ""),
      stableJson(thread.activeRunIds || []),
      stableJson(thread.chatGroup || null),
      stableJson(thread.taskGroupMeta || {}),
      stableJson(thread.events || []),
      stableJson(thread),
      normalizeIso(thread.createdAt),
      normalizeIso(thread.updatedAt || thread.createdAt),
    );
    return true;
  }

  function importMessage(thread, message = {}, position = 0) {
    const id = normalizeId(message.id);
    const threadId = normalizeId(thread?.id);
    if (!id || !threadId) return false;
    open().prepare(`
      INSERT INTO messages(id, thread_id, position, workspace_id, role, status, task_group_id, message_kind,
        sender_workspace_id, sender_principal_id, sender_label, reply_to_message_id, run_id, task_id,
        reasoning_effort, content, artifacts_json, directory_route_json, directory_aliases_json,
        usage_json, run_options_json, error, raw_json, created_at, updated_at, submitted_at,
        queued_at, started_at, first_feedback_at, completed_at, failed_at, cancelled_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        thread_id = excluded.thread_id,
        position = excluded.position,
        workspace_id = excluded.workspace_id,
        role = excluded.role,
        status = excluded.status,
        task_group_id = excluded.task_group_id,
        message_kind = excluded.message_kind,
        sender_workspace_id = excluded.sender_workspace_id,
        sender_principal_id = excluded.sender_principal_id,
        sender_label = excluded.sender_label,
        reply_to_message_id = excluded.reply_to_message_id,
        run_id = excluded.run_id,
        task_id = excluded.task_id,
        reasoning_effort = excluded.reasoning_effort,
        content = excluded.content,
        artifacts_json = excluded.artifacts_json,
        directory_route_json = excluded.directory_route_json,
        directory_aliases_json = excluded.directory_aliases_json,
        usage_json = excluded.usage_json,
        run_options_json = excluded.run_options_json,
        error = excluded.error,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        failed_at = excluded.failed_at,
        cancelled_at = excluded.cancelled_at,
        revoked_at = excluded.revoked_at
    `).run(
      id,
      threadId,
      Number(position) || 0,
      String(message.senderWorkspaceId || thread.workspaceId || "owner"),
      String(message.role || ""),
      String(message.status || ""),
      String(message.taskGroupId || ""),
      String(message.messageKind || ""),
      String(message.senderWorkspaceId || ""),
      String(message.senderPrincipalId || ""),
      String(message.senderLabel || ""),
      String(message.replyToMessageId || ""),
      String(message.runId || ""),
      String(message.taskId || ""),
      String(message.reasoningEffort || ""),
      String(message.content || ""),
      stableJson(message.artifacts || []),
      stableJson(message.directoryRoute || null),
      stableJson(message.directoryAliases || []),
      stableJson(message.usage || null),
      stableJson(message.runOptions || null),
      String(message.error || ""),
      stableJson(message),
      normalizeIso(message.createdAt || thread.createdAt),
      normalizeIso(message.updatedAt || message.createdAt || thread.updatedAt),
      normalizeIso(message.submittedAt),
      normalizeIso(message.queuedAt),
      normalizeIso(message.startedAt),
      normalizeIso(message.firstFeedbackAt),
      normalizeIso(message.completedAt),
      normalizeIso(message.failedAt),
      normalizeIso(message.cancelledAt),
      normalizeIso(message.revokedAt),
    );
    return true;
  }

  function artifactKey(threadId, messageId, artifact, index) {
    return normalizeId(
      artifact?.id || artifact?.artifactId || artifact?.key,
      crypto.createHash("sha1").update([
        threadId,
        messageId,
        artifact?.name || artifact?.filename || "",
        artifact?.path || artifact?.url || "",
        index,
      ].join("\0")).digest("hex"),
    );
  }

  function importArtifact(thread, message, artifact = {}, index = 0) {
    const threadId = normalizeId(thread?.id);
    const messageId = normalizeId(message?.id);
    const id = artifactKey(threadId, messageId, artifact, index);
    if (!id) return false;
    open().prepare(`
      INSERT INTO artifacts(id, position, thread_id, message_id, workspace_id, name, mime, url, path, size, source, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        thread_id = excluded.thread_id,
        message_id = excluded.message_id,
        workspace_id = excluded.workspace_id,
        name = excluded.name,
        mime = excluded.mime,
        url = excluded.url,
        path = excluded.path,
        size = excluded.size,
        source = excluded.source,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      Number(index) || 0,
      threadId,
      messageId,
      String(message?.senderWorkspaceId || thread?.workspaceId || "owner"),
      String(artifact.name || artifact.filename || artifact.label || ""),
      String(artifact.mime || artifact.mimeType || ""),
      String(artifact.url || ""),
      String(artifact.path || ""),
      Number.isFinite(Number(artifact.size)) ? Number(artifact.size) : 0,
      String(artifact.source || ""),
      stableJson(artifact),
      normalizeIso(artifact.createdAt || message?.createdAt || thread?.createdAt),
      normalizeIso(artifact.updatedAt || message?.updatedAt || thread?.updatedAt),
    );
    return true;
  }

  function importPushSubscription(row = {}, index = 0) {
    const id = normalizeId(row.id || row.subscriptionId, `push_subscription_${index}`);
    const endpoint = String(row.endpoint || row.subscription?.endpoint || "");
    open().prepare(`
      INSERT INTO push_subscriptions(id, position, workspace_id, principal_ids_json, workspace_ids_json, endpoint_hash,
        disabled, last_success_at, last_failure_at, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        workspace_id = excluded.workspace_id,
        principal_ids_json = excluded.principal_ids_json,
        workspace_ids_json = excluded.workspace_ids_json,
        endpoint_hash = excluded.endpoint_hash,
        disabled = excluded.disabled,
        last_success_at = excluded.last_success_at,
        last_failure_at = excluded.last_failure_at,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      Number(index) || 0,
      String(row.workspaceId || row.workspace_id || ""),
      stableJson(row.principalIds || row.principal_ids || []),
      stableJson(row.workspaceIds || row.workspace_ids || []),
      endpoint ? crypto.createHash("sha256").update(endpoint).digest("hex") : "",
      row.disabled ? 1 : 0,
      normalizeIso(row.lastSuccessAt || row.last_success_at),
      normalizeIso(row.lastFailureAt || row.last_failure_at),
      stableJson(row),
      normalizeIso(row.createdAt),
      normalizeIso(row.updatedAt || row.createdAt),
    );
    return true;
  }

  function importPushReceipt(row = {}, index = 0) {
    const id = normalizeId(row.id || row.receiptId, `push_receipt_${index}`);
    open().prepare(`
      INSERT INTO push_receipts(id, position, subscription_id, principal_id, workspace_id, message_type, mark_key,
        shown, foreground, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        subscription_id = excluded.subscription_id,
        principal_id = excluded.principal_id,
        workspace_id = excluded.workspace_id,
        message_type = excluded.message_type,
        mark_key = excluded.mark_key,
        shown = excluded.shown,
        foreground = excluded.foreground,
        raw_json = excluded.raw_json,
        created_at = excluded.created_at
    `).run(
      id,
      Number(index) || 0,
      String(row.subscriptionId || row.subscription_id || ""),
      String(row.principalId || row.principal_id || row.data?.principalId || ""),
      String(row.workspaceId || row.workspace_id || row.data?.workspaceId || ""),
      String(row.messageType || row.message_type || row.data?.messageType || ""),
      String(row.markKey || row.mark_key || row.data?.markKey || ""),
      row.shown ? 1 : 0,
      row.foreground ? 1 : 0,
      stableJson(row),
      normalizeIso(row.createdAt || row.receivedAt || row.time),
    );
    return true;
  }

  function importPushDelivery(row = {}, index = 0) {
    const id = normalizeId(row.id || row.deliveryId, `push_delivery_${index}`);
    open().prepare(`
      INSERT INTO push_deliveries(id, position, principal_id, workspace_id, message_type, title, tag, attempted, sent, failed, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        position = excluded.position,
        principal_id = excluded.principal_id,
        workspace_id = excluded.workspace_id,
        message_type = excluded.message_type,
        title = excluded.title,
        tag = excluded.tag,
        attempted = excluded.attempted,
        sent = excluded.sent,
        failed = excluded.failed,
        raw_json = excluded.raw_json,
        created_at = excluded.created_at
    `).run(
      id,
      Number(index) || 0,
      String(row.principalId || row.principal_id || ""),
      String(row.workspaceId || row.workspace_id || ""),
      String(row.messageType || row.message_type || ""),
      String(row.title || ""),
      String(row.tag || ""),
      Number(row.attempted || row.attemptedCount || 0) || 0,
      Number(row.sent || row.sentCount || 0) || 0,
      Number(row.failed || row.failedCount || 0) || 0,
      stableJson(row),
      normalizeIso(row.createdAt || row.sentAt || row.time),
    );
    return true;
  }

  function importVoiceInputCorrection(row = {}, index = 0) {
    const id = normalizeId(row.id, `voice_correction_${index}`);
    if (!id) return false;
    open().prepare(`
      INSERT INTO voice_input_corrections(id, actor_id, workspace_id, surface_type, plugin_id, thread_id,
        language, from_text, to_text, status, support_count, rejection_count, created_at, updated_at,
        last_seen_at, last_applied_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        actor_id = excluded.actor_id,
        workspace_id = excluded.workspace_id,
        surface_type = excluded.surface_type,
        plugin_id = excluded.plugin_id,
        thread_id = excluded.thread_id,
        language = excluded.language,
        from_text = excluded.from_text,
        to_text = excluded.to_text,
        status = excluded.status,
        support_count = excluded.support_count,
        rejection_count = excluded.rejection_count,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at,
        last_applied_at = excluded.last_applied_at,
        raw_json = excluded.raw_json
    `).run(
      id,
      String(row.actorId || row.actor_id || ""),
      String(row.workspaceId || row.workspace_id || ""),
      String(row.surfaceType || row.surface_type || ""),
      String(row.pluginId || row.plugin_id || ""),
      String(row.threadId || row.thread_id || ""),
      String(row.language || ""),
      String(row.from || row.fromText || row.from_text || ""),
      String(row.to || row.toText || row.to_text || ""),
      String(row.status || ""),
      Number(row.supportCount || row.support_count || 0) || 0,
      Number(row.rejectionCount || row.rejection_count || 0) || 0,
      normalizeIso(row.createdAt || row.created_at),
      normalizeIso(row.updatedAt || row.updated_at || row.createdAt || row.created_at),
      normalizeIso(row.lastSeenAt || row.last_seen_at),
      normalizeIso(row.lastAppliedAt || row.last_applied_at),
      stableJson(row),
    );
    return true;
  }

  function importVoiceInputPhrase(row = {}, index = 0) {
    const id = normalizeId(row.id, `voice_phrase_${index}`);
    const term = String(row.term || "").trim();
    if (!id || !term) return false;
    open().prepare(`
      INSERT INTO voice_input_phrasebook(id, actor_id, workspace_id, surface_type, plugin_id, thread_id,
        language, term, source, status, support_count, aliases_json, created_at, updated_at,
        last_seen_at, last_applied_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        actor_id = excluded.actor_id,
        workspace_id = excluded.workspace_id,
        surface_type = excluded.surface_type,
        plugin_id = excluded.plugin_id,
        thread_id = excluded.thread_id,
        language = excluded.language,
        term = excluded.term,
        source = excluded.source,
        status = excluded.status,
        support_count = excluded.support_count,
        aliases_json = excluded.aliases_json,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at,
        last_applied_at = excluded.last_applied_at,
        raw_json = excluded.raw_json
    `).run(
      id,
      String(row.actorId || row.actor_id || ""),
      String(row.workspaceId || row.workspace_id || ""),
      String(row.surfaceType || row.surface_type || ""),
      String(row.pluginId || row.plugin_id || ""),
      String(row.threadId || row.thread_id || ""),
      String(row.language || ""),
      term,
      String(row.source || ""),
      String(row.status || ""),
      Number(row.supportCount || row.support_count || 0) || 0,
      stableJson(asArray(row.aliases || parseJson(row.aliases_json, []))),
      normalizeIso(row.createdAt || row.created_at),
      normalizeIso(row.updatedAt || row.updated_at || row.createdAt || row.created_at),
      normalizeIso(row.lastSeenAt || row.last_seen_at),
      normalizeIso(row.lastAppliedAt || row.last_applied_at),
      stableJson(row),
    );
    return true;
  }

  function importVoiceInputAudit(row = {}, index = 0) {
    const id = normalizeId(row.id, `voice_audit_${index}`);
    if (!id) return false;
    const payload = Object.assign({}, row);
    delete payload.id;
    delete payload.createdAt;
    delete payload.created_at;
    open().prepare(`
      INSERT INTO voice_input_audit(id, event_type, actor_id, workspace_id, surface_type, plugin_id,
        thread_id, backend, payload_json, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        event_type = excluded.event_type,
        actor_id = excluded.actor_id,
        workspace_id = excluded.workspace_id,
        surface_type = excluded.surface_type,
        plugin_id = excluded.plugin_id,
        thread_id = excluded.thread_id,
        backend = excluded.backend,
        payload_json = excluded.payload_json,
        raw_json = excluded.raw_json,
        created_at = excluded.created_at
    `).run(
      id,
      String(row.event || row.eventType || row.event_type || ""),
      String(row.actorId || row.actor_id || ""),
      String(row.workspaceId || row.workspace_id || ""),
      String(row.surfaceType || row.surface_type || ""),
      String(row.pluginId || row.plugin_id || ""),
      String(row.threadId || row.thread_id || ""),
      String(row.backend || ""),
      stableJson(payload),
      stableJson(row),
      normalizeIso(row.createdAt || row.created_at),
    );
    return true;
  }

  function importVoiceInputState(voiceInput = {}) {
    const source = voiceInput && typeof voiceInput === "object" && !Array.isArray(voiceInput) ? voiceInput : {};
    const stats = { corrections: 0, phrasebook: 0, audit: 0 };
    setMeta("voiceInputSettings", source.settings && typeof source.settings === "object" && !Array.isArray(source.settings) ? source.settings : {});
    asArray(source.corrections).forEach((row, index) => {
      if (importVoiceInputCorrection(row, index)) stats.corrections += 1;
    });
    asArray(source.phrasebook).forEach((row, index) => {
      if (importVoiceInputPhrase(row, index)) stats.phrasebook += 1;
    });
    asArray(source.audit).forEach((row, index) => {
      if (importVoiceInputAudit(row, index)) stats.audit += 1;
    });
    return stats;
  }

  function importSharedDirectory(row = {}, index = 0) {
    const id = normalizeId(row.id, crypto.createHash("sha1").update([
      row.root || row.rootPath || row.path || "",
      row.label || "",
      index,
    ].join("\0")).digest("hex"));
    open().prepare(`
      INSERT INTO shared_directories(id, label, root_path, source, owner_workspace_id, owner_principal_id,
        created_by, target_workspace_ids_json, permissions_json, aliases_json, workspace_labels_json,
        raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        root_path = excluded.root_path,
        source = excluded.source,
        owner_workspace_id = excluded.owner_workspace_id,
        owner_principal_id = excluded.owner_principal_id,
        created_by = excluded.created_by,
        target_workspace_ids_json = excluded.target_workspace_ids_json,
        permissions_json = excluded.permissions_json,
        aliases_json = excluded.aliases_json,
        workspace_labels_json = excluded.workspace_labels_json,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(row.label || row.name || ""),
      String(row.root || row.rootPath || row.path || ""),
      String(row.source || ""),
      String(row.ownerWorkspaceId || row.owner_workspace_id || row.workspaceId || ""),
      String(row.ownerPrincipalId || row.owner_principal_id || row.principalId || ""),
      String(row.createdBy || row.created_by || ""),
      stableJson(row.targetWorkspaceIds || row.target_workspace_ids || []),
      stableJson(row.permissions || {}),
      stableJson(row.aliases || []),
      stableJson(row.workspaceLabels || row.workspace_labels || {}),
      stableJson(row),
      normalizeIso(row.createdAt),
      normalizeIso(row.updatedAt || row.createdAt),
    );
    return true;
  }

  function kanbanCaseShareKey(ownerWorkspaceId, caseId) {
    return `${normalizeId(ownerWorkspaceId, "owner")}::${normalizeId(caseId)}`;
  }

  function existingKanbanCaseShare(ownerWorkspaceId, caseId) {
    const id = kanbanCaseShareKey(ownerWorkspaceId, caseId);
    const row = open().prepare("SELECT * FROM kanban_case_shares WHERE id = ?").get(id);
    return row ? publicKanbanCaseShareFromRow(row) : null;
  }

  function normalizeKanbanCaseShareInput(ownerWorkspaceId, caseId, input = {}) {
    const source = ownerWorkspaceId && typeof ownerWorkspaceId === "object" && !Array.isArray(ownerWorkspaceId)
      ? ownerWorkspaceId
      : Object.assign({}, input || {}, {
        ownerWorkspaceId,
        caseId,
      });
    const owner = normalizeId(
      source.ownerWorkspaceId
        || source.owner_workspace_id
        || source.workspaceId
        || source.workspace_id,
      "owner",
    );
    const caseValue = normalizeId(
      source.caseId
        || source.case_id
        || source.kanbanCaseId
        || source.kanban_case_id
        || (String(source.id || "").includes("::") ? String(source.id).split("::").slice(1).join("::") : source.id),
    );
    if (!caseValue) return null;
    const previous = existingKanbanCaseShare(owner, caseValue) || {};
    const performerWorkspaceIds = normalizeStringList(
      source.performerWorkspaceIds
        || source.performer_workspace_ids
        || source.targetWorkspaceIds
        || source.target_workspace_ids
        || source.performerWorkspaceId
        || source.performer_workspace_id
        || source.targetWorkspaceId
        || source.target_workspace_id
        || previous.performerWorkspaceIds
        || previous.performerWorkspaceId
        || "",
    ).filter((workspaceId) => workspaceId !== owner);
    const requestedPerformerWorkspaceId = String(source.performerWorkspaceId || source.performer_workspace_id || "").trim();
    const viewerWorkspaceIds = normalizeStringList(
      source.viewerWorkspaceIds
        || source.viewer_workspace_ids
        || source.readonlyWorkspaceIds
        || source.readonly_workspace_ids
        || source.sharedViewerWorkspaceIds
        || source.shared_viewer_workspace_ids
        || previous.viewerWorkspaceIds
        || "",
    ).filter((workspaceId) => workspaceId !== owner && !performerWorkspaceIds.includes(workspaceId));
    const managerWorkspaceIds = normalizeStringList(
      source.managerWorkspaceIds
        || source.manager_workspace_ids
        || previous.managerWorkspaceIds
        || "",
    ).filter((workspaceId) => workspaceId !== owner);
    const topic = source.topic && typeof source.topic === "object" && !Array.isArray(source.topic) ? source.topic : source;
    const now = nowIso();
    return {
      schemaVersion: 1,
      ownerWorkspaceId: owner,
      workspaceId: normalizeId(source.workspaceId || source.workspace_id || owner, owner),
      caseId: caseValue,
      caseMode: String(source.caseMode || source.case_mode || source.kanbanCaseMode || source.kanban_case_mode || source.mode || previous.caseMode || "").trim(),
      performerWorkspaceId: performerWorkspaceIds.includes(requestedPerformerWorkspaceId)
        ? requestedPerformerWorkspaceId
        : String(performerWorkspaceIds[0] || ""),
      performerWorkspaceIds,
      viewerWorkspaceIds,
      managerWorkspaceIds,
      topicThreadId: String(topic.topicThreadId || topic.topic_thread_id || previous.topicThreadId || "").trim(),
      topicTaskGroupId: String(topic.topicTaskGroupId || topic.topic_task_group_id || previous.topicTaskGroupId || "").trim(),
      sharedDirectoryPath: String(topic.sharedDirectoryPath || topic.shared_directory_path || previous.sharedDirectoryPath || "").trim(),
      caseDirectoryPath: String(topic.caseDirectoryPath || topic.case_directory_path || previous.caseDirectoryPath || "").trim(),
      createdAt: normalizeIso(source.createdAt || source.created_at || previous.createdAt || now),
      updatedAt: normalizeIso(source.updatedAt || source.updated_at || now),
      archivedAt: normalizeIso(source.archivedAt || source.archived_at || previous.archivedAt),
      deletedAt: normalizeIso(source.deletedAt || source.deleted_at || previous.deletedAt),
    };
  }

  function upsertKanbanCaseShare(ownerWorkspaceId, caseId, input = {}) {
    migrate();
    const share = normalizeKanbanCaseShareInput(ownerWorkspaceId, caseId, input);
    if (!share) return null;
    const id = kanbanCaseShareKey(share.ownerWorkspaceId, share.caseId);
    open().prepare(`
      INSERT INTO kanban_case_shares(id, case_id, workspace_id, owner_workspace_id, case_mode,
        topic_thread_id, topic_task_group_id, shared_directory_path, case_directory_path,
        performer_workspace_id, performer_workspace_ids_json, viewer_workspace_ids_json,
        manager_workspace_ids_json, raw_json, created_at, updated_at, archived_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        case_id = excluded.case_id,
        workspace_id = excluded.workspace_id,
        owner_workspace_id = excluded.owner_workspace_id,
        case_mode = excluded.case_mode,
        topic_thread_id = excluded.topic_thread_id,
        topic_task_group_id = excluded.topic_task_group_id,
        shared_directory_path = excluded.shared_directory_path,
        case_directory_path = excluded.case_directory_path,
        performer_workspace_id = excluded.performer_workspace_id,
        performer_workspace_ids_json = excluded.performer_workspace_ids_json,
        viewer_workspace_ids_json = excluded.viewer_workspace_ids_json,
        manager_workspace_ids_json = excluded.manager_workspace_ids_json,
        raw_json = excluded.raw_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at,
        deleted_at = excluded.deleted_at
    `).run(
      id,
      share.caseId,
      share.workspaceId,
      share.ownerWorkspaceId,
      share.caseMode,
      share.topicThreadId,
      share.topicTaskGroupId,
      share.sharedDirectoryPath,
      share.caseDirectoryPath,
      share.performerWorkspaceId,
      stableJson(share.performerWorkspaceIds),
      stableJson(share.viewerWorkspaceIds),
      stableJson(share.managerWorkspaceIds),
      stableJson(share),
      share.createdAt,
      share.updatedAt,
      share.archivedAt,
      share.deletedAt,
    );
    return getKanbanCaseShare(share.ownerWorkspaceId, share.caseId);
  }

  function importKanbanCaseShare(row = {}, index = 0) {
    return Boolean(upsertKanbanCaseShare(Object.assign({}, row, {
      caseId: row.caseId || row.case_id || row.kanbanCaseId || row.kanban_case_id || (row.id ? "" : `kanban_case_${index}`),
    })));
  }

  function getKanbanCaseShare(ownerWorkspaceId, caseId) {
    const source = ownerWorkspaceId && typeof ownerWorkspaceId === "object" && !Array.isArray(ownerWorkspaceId)
      ? normalizeKanbanCaseShareInput(ownerWorkspaceId)
      : normalizeKanbanCaseShareInput({ ownerWorkspaceId, caseId });
    if (!source) return null;
    const row = open().prepare("SELECT * FROM kanban_case_shares WHERE id = ?").get(
      kanbanCaseShareKey(source.ownerWorkspaceId, source.caseId),
    );
    return row ? publicKanbanCaseShareFromRow(row) : null;
  }

  function listKanbanCaseShares(args = {}) {
    migrate();
    const clauses = [];
    const values = [];
    const owner = normalizeId(args.ownerWorkspaceId || args.owner_workspace_id || args.workspaceId || args.workspace_id);
    const caseMode = String(args.caseMode || args.case_mode || "").trim();
    const topicThreadId = String(args.topicThreadId || args.topic_thread_id || "").trim();
    const topicTaskGroupId = String(args.topicTaskGroupId || args.topic_task_group_id || "").trim();
    if (owner) {
      clauses.push("owner_workspace_id = ?");
      values.push(owner);
    }
    if (caseMode) {
      clauses.push("case_mode = ?");
      values.push(caseMode);
    }
    if (topicThreadId) {
      clauses.push("topic_thread_id = ?");
      values.push(topicThreadId);
    }
    if (topicTaskGroupId) {
      clauses.push("topic_task_group_id = ?");
      values.push(topicTaskGroupId);
    }
    const sql = `SELECT * FROM kanban_case_shares${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC, case_id`;
    let rows = open().prepare(sql).all(...values).map(publicKanbanCaseShareFromRow);
    if (!args.includeArchived && !args.include_archived) {
      rows = rows.filter((row) => !row.archivedAt);
    }
    if (!args.includeDeleted && !args.include_deleted) {
      rows = rows.filter((row) => !row.deletedAt);
    }
    const actor = normalizeId(args.actorWorkspaceId || args.actor_workspace_id);
    if (actor) {
      rows = rows.filter((row) => (
        row.ownerWorkspaceId === actor
        || normalizeStringList(row.managerWorkspaceIds).includes(actor)
        || normalizeStringList(row.performerWorkspaceIds).includes(actor)
        || normalizeStringList(row.viewerWorkspaceIds).includes(actor)
      ));
    }
    const limit = args.limit === undefined ? rows.length : Math.max(1, Math.min(1000, Number(args.limit) || 100));
    return rows.slice(0, limit);
  }

  function deleteKanbanCaseShare(ownerWorkspaceId, caseId, options = {}) {
    migrate();
    const before = getKanbanCaseShare(ownerWorkspaceId, caseId);
    if (!before) return null;
    if (options.soft || options.markDeleted || options.deletedAt || options.deleted_at) {
      const deletedAt = normalizeIso(options.deletedAt || options.deleted_at || nowIso());
      const updated = Object.assign({}, before, { deletedAt, updatedAt: deletedAt });
      open().prepare("UPDATE kanban_case_shares SET deleted_at = ?, updated_at = ?, raw_json = ? WHERE id = ?").run(
        deletedAt,
        updated.updatedAt,
        stableJson(updated),
        kanbanCaseShareKey(before.ownerWorkspaceId, before.caseId),
      );
      return updated;
    }
    open().prepare("DELETE FROM kanban_case_shares WHERE id = ?").run(
      kanbanCaseShareKey(before.ownerWorkspaceId, before.caseId),
    );
    return before;
  }

  function importTodoItem(row = {}, index = 0) {
    const id = normalizeId(row.id, `todo_${index}`);
    open().prepare(`
      INSERT INTO todo_items(id, workspace_id, principal_id, assignee, status, content, due_at, source, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        principal_id = excluded.principal_id,
        assignee = excluded.assignee,
        status = excluded.status,
        content = excluded.content,
        due_at = excluded.due_at,
        source = excluded.source,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(row.workspaceId || row.workspace_id || ""),
      String(row.principalId || row.principal_id || row.created_by_principal || ""),
      String(row.assignee || row.assignee_principal_id || ""),
      String(row.status || ""),
      String(row.content || row.text || ""),
      normalizeIso(row.dueAt || row.due_at || row.dueLocal || row.due_local),
      String(row.source || "local_json"),
      stableJson(row),
      normalizeIso(row.createdAt || row.created_at),
      normalizeIso(row.updatedAt || row.updated_at || row.createdAt || row.created_at),
    );
    return true;
  }

  function getTodoItem(todoId) {
    const row = open().prepare("SELECT * FROM todo_items WHERE id = ?").get(String(todoId || ""));
    return row ? publicTodoFromRow(row) : null;
  }

  function deleteTodoItem(todoId) {
    const before = getTodoItem(todoId);
    open().prepare("DELETE FROM todo_items WHERE id = ?").run(String(todoId || ""));
    return before;
  }

  function listTodoItems(args = {}) {
    const source = String(args.sourcePrincipal || args.source_principal || "owner").trim() || "owner";
    const sourceFilter = String(args.source || "").trim();
    const workspaceFilter = String(args.workspaceId || args.workspace_id || "").trim();
    const statusFilter = String(args.status || "").trim();
    const includeCompleted = Boolean(args.includeCompleted || args.include_completed);
    const assignee = String(args.assignee || "").trim();
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 80));
    const scanLimit = sourceFilter || workspaceFilter || statusFilter ? Math.max(1000, limit * 10) : limit * 4;
    let rows = open().prepare("SELECT * FROM todo_items ORDER BY due_at, created_at LIMIT ?").all(scanLimit)
      .filter((row) => !sourceFilter || String(row.source || "") === sourceFilter)
      .filter((row) => !workspaceFilter || String(row.workspace_id || "") === workspaceFilter)
      .filter((row) => !statusFilter || String(row.status || "") === statusFilter)
      .map(publicTodoFromRow);
    if (source !== "owner") {
      rows = rows.filter((row) => {
        const createdBy = String(row.created_by_principal || row.createdByPrincipal || row.principalId || "");
        const assignedTo = String(row.assignee_principal_id || row.assignee || "");
        return createdBy === source || assignedTo === source;
      });
    }
    if (!includeCompleted) {
      rows = rows.filter((row) => String(row.status || "") === "open");
    }
    if (assignee) {
      rows = rows.filter((row) => String(row.assignee_principal_id || row.assignee || "") === assignee);
    }
    return rows.slice(0, limit);
  }

  function importAutomationJob(row = {}, index = 0) {
    const id = normalizeId(row.id, `automation_${index}`);
    open().prepare(`
      INSERT INTO automation_jobs(id, workspace_id, principal_id, name, status, schedule, source,
        latest_deliverable_json, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        principal_id = excluded.principal_id,
        name = excluded.name,
        status = excluded.status,
        schedule = excluded.schedule,
        source = excluded.source,
        latest_deliverable_json = excluded.latest_deliverable_json,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      String(row.workspaceId || row.workspace_id || ""),
      String(row.principalId || row.principal_id || row.ownerPrincipalId || ""),
      String(row.name || row.title || id),
      String(row.status || row.state || ""),
      String(row.schedule || row.scheduleText || row.schedule_text || ""),
      String(row.source || "local_json"),
      stableJson(row.latestDeliverable || row.latest_deliverable || row.outputDocuments || []),
      stableJson(row),
      normalizeIso(row.createdAt || row.created_at),
      normalizeIso(row.updatedAt || row.updated_at || row.createdAt || row.created_at),
    );
    return true;
  }

  function getAutomationJob(jobId) {
    const row = open().prepare("SELECT * FROM automation_jobs WHERE id = ?").get(String(jobId || ""));
    return row ? publicAutomationFromRow(row) : null;
  }

  function deleteAutomationJob(jobId) {
    const before = getAutomationJob(jobId);
    open().prepare("DELETE FROM automation_jobs WHERE id = ?").run(String(jobId || ""));
    return before;
  }

  function listAutomationJobs(args = {}) {
    const principal = String(args.ownerPrincipalId || args.owner_principal_id || "owner").trim() || "owner";
    const includeDisabled = Boolean(args.includeDisabled || args.include_disabled);
    let rows = open().prepare("SELECT * FROM automation_jobs ORDER BY updated_at DESC, created_at DESC").all()
      .map(publicAutomationFromRow);
    if (principal !== "owner") {
      rows = rows.filter((row) => String(row.ownerPrincipalId || row.owner_principal_id || row.principalId || "") === principal);
    }
    if (!includeDisabled) {
      rows = rows.filter((row) => row.enabled !== false && String(row.state || row.status || "") !== "paused");
    }
    return rows;
  }

  function getActionInboxItem(itemId) {
    migrate();
    const row = open().prepare("SELECT * FROM action_inbox_items WHERE id = ?").get(String(itemId || ""));
    return publicActionInboxItemFromRow(row);
  }

  function getActionInboxItemByDedupe(workspaceId, dedupeKey) {
    migrate();
    const workspace = String(workspaceId || "").trim();
    const dedupe = String(dedupeKey || "").trim();
    if (!workspace || !dedupe) return null;
    const row = open().prepare("SELECT * FROM action_inbox_items WHERE workspace_id = ? AND dedupe_key = ?").get(workspace, dedupe);
    return publicActionInboxItemFromRow(row);
  }

  function upsertActionInboxItem(input = {}) {
    migrate();
    const workspaceId = String(input.workspaceId || input.workspace_id || "owner").trim() || "owner";
    const dedupeKey = String(input.dedupeKey || input.dedupe_key || "").trim();
    const requestedId = String(input.id || input.itemId || input.item_id || "").trim();
    const before = requestedId ? getActionInboxItem(requestedId) : getActionInboxItemByDedupe(workspaceId, dedupeKey);
    const id = before?.id || requestedId || generatedId("ainb");
    const createdAt = normalizeIso(before?.createdAt || input.createdAt || input.created_at || nowIso());
    const updatedAt = normalizeIso(input.updatedAt || input.updated_at || nowIso());
    const sourceRef = input.sourceRef || input.source_ref || input.sourceRefJson || {};
    const raw = Object.assign({}, input.rawJson && typeof input.rawJson === "object" ? input.rawJson : {}, input.raw_json && typeof input.raw_json === "object" ? input.raw_json : {});
    open().prepare(`
      INSERT INTO action_inbox_items(id, workspace_id, assignee_workspace_id, source_type, source_id, source_ref_json,
        item_type, status, priority, title, summary, action_label, deep_link, dedupe_key, due_at, available_at,
        completed_at, dismissed_at, last_event_at, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        assignee_workspace_id = excluded.assignee_workspace_id,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_ref_json = excluded.source_ref_json,
        item_type = excluded.item_type,
        status = excluded.status,
        priority = excluded.priority,
        title = excluded.title,
        summary = excluded.summary,
        action_label = excluded.action_label,
        deep_link = excluded.deep_link,
        dedupe_key = excluded.dedupe_key,
        due_at = excluded.due_at,
        available_at = excluded.available_at,
        completed_at = excluded.completed_at,
        dismissed_at = excluded.dismissed_at,
        last_event_at = excluded.last_event_at,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      workspaceId,
      String(input.assigneeWorkspaceId || input.assignee_workspace_id || workspaceId).trim(),
      String(input.sourceType || input.source_type || "manual").trim(),
      String(input.sourceId || input.source_id || "").trim(),
      stableJson(sourceRef && typeof sourceRef === "object" ? sourceRef : {}),
      String(input.itemType || input.item_type || "todo").trim(),
      String(input.status || "open").trim(),
      String(input.priority || "normal").trim(),
      String(input.title || "").trim(),
      String(input.summary || "").trim(),
      String(input.actionLabel || input.action_label || "").trim(),
      String(input.deepLink || input.deep_link || "").trim(),
      dedupeKey,
      normalizeIso(input.dueAt || input.due_at),
      normalizeIso(input.availableAt || input.available_at),
      normalizeIso(input.completedAt || input.completed_at),
      normalizeIso(input.dismissedAt || input.dismissed_at),
      normalizeIso(input.lastEventAt || input.last_event_at || updatedAt),
      stableJson(raw && Object.keys(raw).length ? raw : input),
      createdAt,
      updatedAt,
    );
    return getActionInboxItem(id);
  }

  function updateActionInboxItem(itemId, patch = {}) {
    migrate();
    const before = getActionInboxItem(itemId);
    if (!before) return null;
    return upsertActionInboxItem(Object.assign({}, before, patch, {
      id: before.id,
      workspaceId: patch.workspaceId || before.workspaceId,
      createdAt: before.createdAt,
      updatedAt: patch.updatedAt || nowIso(),
    }));
  }

  function addActionInboxEvent(input = {}) {
    migrate();
    const itemId = String(input.itemId || input.item_id || "").trim();
    if (!itemId) return null;
    const createdAt = normalizeIso(input.createdAt || input.created_at || nowIso());
    const id = String(input.id || input.eventId || input.event_id || "").trim() || generatedId("ainbe");
    open().prepare(`
      INSERT INTO action_inbox_events(id, item_id, event_type, actor_workspace_id, actor_principal_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      itemId,
      String(input.eventType || input.event_type || "event").trim(),
      String(input.actorWorkspaceId || input.actor_workspace_id || "").trim(),
      String(input.actorPrincipalId || input.actor_principal_id || "").trim(),
      stableJson(input.payload && typeof input.payload === "object" ? input.payload : {}),
      createdAt,
    );
    open().prepare("UPDATE action_inbox_items SET last_event_at = ?, updated_at = ? WHERE id = ?").run(createdAt, createdAt, itemId);
    return publicActionInboxEventFromRow(open().prepare("SELECT * FROM action_inbox_events WHERE id = ?").get(id));
  }

  function listActionInboxEvents(itemId, args = {}) {
    migrate();
    const limit = Math.max(1, Math.min(200, Number(args.limit || 50)));
    return open().prepare("SELECT * FROM action_inbox_events WHERE item_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(String(itemId || ""), limit)
      .map(publicActionInboxEventFromRow)
      .filter(Boolean);
  }

  function listActionInboxItems(args = {}) {
    migrate();
    const workspaceId = String(args.workspaceId || args.workspace_id || "owner").trim() || "owner";
    const status = String(args.status || "").trim();
    const sourceType = String(args.sourceType || args.source_type || "").trim();
    const excludedSourceTypes = (Array.isArray(args.excludedSourceTypes) ? args.excludedSourceTypes : (Array.isArray(args.excluded_source_types) ? args.excluded_source_types : []))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const itemType = String(args.itemType || args.item_type || "").trim();
    const excludedItemTypes = (Array.isArray(args.excludedItemTypes) ? args.excludedItemTypes : (Array.isArray(args.excluded_item_types) ? args.excluded_item_types : []))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const search = String(args.search || "").trim().toLowerCase();
    const includeDone = Boolean(args.includeDone || args.include_done);
    const limit = Math.max(1, Math.min(500, Number(args.limit || 100)));
    const clauses = ["(workspace_id = ? OR assignee_workspace_id = ?)"];
    const values = [workspaceId, workspaceId];
    if (status && status !== "all") {
      clauses.push("status = ?");
      values.push(status);
    } else if (!includeDone && status !== "all") {
      clauses.push("status IN ('open', 'waiting')");
    }
    if (sourceType) {
      clauses.push("source_type = ?");
      values.push(sourceType);
    } else if (excludedSourceTypes.length) {
      clauses.push(`source_type NOT IN (${excludedSourceTypes.map(() => "?").join(", ")})`);
      values.push(...excludedSourceTypes);
    }
    if (itemType) {
      clauses.push("item_type = ?");
      values.push(itemType);
    } else if (excludedItemTypes.length) {
      clauses.push(`item_type NOT IN (${excludedItemTypes.map(() => "?").join(", ")})`);
      values.push(...excludedItemTypes);
    }
    const rows = open().prepare(`
      SELECT * FROM action_inbox_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
        COALESCE(NULLIF(due_at, ''), NULLIF(last_event_at, ''), updated_at, created_at) DESC
      LIMIT ?
    `).all(...values, search ? Math.max(limit * 5, 100) : limit)
      .map(publicActionInboxItemFromRow)
      .filter(Boolean)
      .filter((item) => {
        if (!search) return true;
        return [item.title, item.summary, item.sourceType, item.itemType, item.status].join("\n").toLowerCase().includes(search);
      });
    return rows.slice(0, limit);
  }

  function listDueActionInboxItems(args = {}) {
    migrate();
    const status = String(args.status || "waiting").trim() || "waiting";
    const itemType = String(args.itemType || args.item_type || "").trim();
    const sourceType = String(args.sourceType || args.source_type || "").trim();
    const availableBefore = normalizeIso(args.availableBefore || args.available_before || nowIso());
    const limit = Math.max(1, Math.min(500, Number(args.limit || 100)));
    const clauses = ["status = ?", "available_at <> ''", "datetime(available_at) <= datetime(?)"];
    const values = [status, availableBefore];
    if (itemType) {
      clauses.push("item_type = ?");
      values.push(itemType);
    }
    if (sourceType) {
      clauses.push("source_type = ?");
      values.push(sourceType);
    }
    return open().prepare(`
      SELECT * FROM action_inbox_items
      WHERE ${clauses.join(" AND ")}
      ORDER BY datetime(available_at) ASC, updated_at ASC
      LIMIT ?
    `).all(...values, limit)
      .map(publicActionInboxItemFromRow)
      .filter(Boolean);
  }

  function actionInboxCounts(workspaceId, args = {}) {
    migrate();
    const workspace = String(workspaceId || "owner").trim() || "owner";
    const excludedSourceTypes = (Array.isArray(args.excludedSourceTypes) ? args.excludedSourceTypes : (Array.isArray(args.excluded_source_types) ? args.excluded_source_types : []))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const excludedItemTypes = (Array.isArray(args.excludedItemTypes) ? args.excludedItemTypes : (Array.isArray(args.excluded_item_types) ? args.excluded_item_types : []))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const clauses = ["(workspace_id = ? OR assignee_workspace_id = ?)"];
    const values = [workspace, workspace];
    if (excludedSourceTypes.length) {
      clauses.push(`source_type NOT IN (${excludedSourceTypes.map(() => "?").join(", ")})`);
      values.push(...excludedSourceTypes);
    }
    if (excludedItemTypes.length) {
      clauses.push(`item_type NOT IN (${excludedItemTypes.map(() => "?").join(", ")})`);
      values.push(...excludedItemTypes);
    }
    const rows = open().prepare(`
      SELECT status, source_type, item_type, COUNT(*) AS count
      FROM action_inbox_items
      WHERE ${clauses.join(" AND ")}
      GROUP BY status, source_type, item_type
    `).all(...values);
    const byStatus = {};
    const bySourceType = {};
    const byItemType = {};
    for (const row of rows) {
      const count = Number(row.count || 0);
      const status = String(row.status || "");
      const sourceType = String(row.source_type || "");
      const itemType = String(row.item_type || "");
      byStatus[status] = (byStatus[status] || 0) + count;
      bySourceType[sourceType] = (bySourceType[sourceType] || 0) + count;
      byItemType[itemType] = (byItemType[itemType] || 0) + count;
    }
    return { byStatus, bySourceType, byItemType };
  }

  function getTopicContextSummary(topicId, taskGroupId) {
    const row = open().prepare("SELECT * FROM topic_context_summaries WHERE topic_id = ? AND task_group_id = ?").get(
      String(topicId || ""),
      String(taskGroupId || ""),
    );
    return publicTopicContextSummaryFromRow(row);
  }

  function upsertTopicContextSummary(input = {}) {
    const topicId = String(input.topicId || input.topic_id || "").trim();
    const taskGroupId = String(input.taskGroupId || input.task_group_id || "").trim();
    if (!topicId || !taskGroupId) return null;
    const before = getTopicContextSummary(topicId, taskGroupId);
    const createdAt = before?.createdAt || nowIso();
    const updatedAt = nowIso();
    const summary = input.summary && typeof input.summary === "object" ? input.summary : {};
    open().prepare(`
      INSERT INTO topic_context_summaries(topic_id, task_group_id, workspace_id, summary_json, summary_version,
        last_compacted_message_id, last_compacted_event_id, input_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id, task_group_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        summary_json = excluded.summary_json,
        summary_version = excluded.summary_version,
        last_compacted_message_id = excluded.last_compacted_message_id,
        last_compacted_event_id = excluded.last_compacted_event_id,
        input_hash = excluded.input_hash,
        updated_at = excluded.updated_at
    `).run(
      topicId,
      taskGroupId,
      String(input.workspaceId || input.workspace_id || ""),
      stableJson(summary),
      Number(input.summaryVersion || input.summary_version || summary.summaryVersion || 0),
      String(input.lastCompactedMessageId || input.last_compacted_message_id || summary.lastCompactedMessageId || ""),
      String(input.lastCompactedEventId || input.last_compacted_event_id || summary.lastCompactedEventId || ""),
      String(input.inputHash || input.input_hash || ""),
      createdAt,
      updatedAt,
    );
    return getTopicContextSummary(topicId, taskGroupId);
  }

  function getTopicWorkingState(topicId, taskGroupId) {
    const row = open().prepare("SELECT * FROM topic_working_states WHERE topic_id = ? AND task_group_id = ?").get(
      String(topicId || ""),
      String(taskGroupId || ""),
    );
    return publicTopicWorkingStateFromRow(row);
  }

  function upsertTopicWorkingState(input = {}) {
    const topicId = String(input.topicId || input.topic_id || "").trim();
    const taskGroupId = String(input.taskGroupId || input.task_group_id || "").trim();
    if (!topicId || !taskGroupId) return null;
    const before = getTopicWorkingState(topicId, taskGroupId);
    const createdAt = before?.createdAt || nowIso();
    const updatedAt = nowIso();
    const state = input.state && typeof input.state === "object" ? input.state : {};
    open().prepare(`
      INSERT INTO topic_working_states(topic_id, task_group_id, workspace_id, state_json, state_version, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id, task_group_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        state_json = excluded.state_json,
        state_version = excluded.state_version,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      topicId,
      taskGroupId,
      String(input.workspaceId || input.workspace_id || ""),
      stableJson(state),
      Number(input.stateVersion || input.state_version || state.stateVersion || 0),
      String(input.status || state.status || ""),
      createdAt,
      updatedAt,
    );
    return getTopicWorkingState(topicId, taskGroupId);
  }

  function listTopicContextRefs(args = {}) {
    const topicId = String(args.topicId || args.topic_id || "").trim();
    const taskGroupId = String(args.taskGroupId || args.task_group_id || "").trim();
    if (!topicId || !taskGroupId) return [];
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 80));
    return open().prepare(`
      SELECT * FROM topic_context_refs
      WHERE topic_id = ? AND task_group_id = ?
      ORDER BY created_at DESC, updated_at DESC, ref_id DESC
      LIMIT ?
    `).all(topicId, taskGroupId, limit)
      .map(publicTopicContextRefFromRow)
      .reverse();
  }

  function replaceTopicContextRefs(input = {}) {
    const topicId = String(input.topicId || input.topic_id || "").trim();
    const taskGroupId = String(input.taskGroupId || input.task_group_id || "").trim();
    if (!topicId || !taskGroupId) return [];
    const workspaceId = String(input.workspaceId || input.workspace_id || "");
    const refs = asArray(input.refs).slice(-Math.max(1, Math.min(500, Number(input.limit) || 80)));
    const database = open();
    database.prepare("DELETE FROM topic_context_refs WHERE topic_id = ? AND task_group_id = ?").run(topicId, taskGroupId);
    const stmt = database.prepare(`
      INSERT INTO topic_context_refs(ref_id, topic_id, task_group_id, workspace_id, ref_type, target_id, role, ref_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updatedAt = nowIso();
    for (const ref of refs) {
      const refId = String(ref.refId || ref.ref_id || `${topicId}:${taskGroupId}:${ref.refType || "ref"}:${ref.targetId || updatedAt}`).trim();
      if (!refId) continue;
      stmt.run(
        refId,
        topicId,
        taskGroupId,
        workspaceId,
        String(ref.refType || ref.ref_type || ""),
        String(ref.targetId || ref.target_id || ""),
        String(ref.role || ""),
        stableJson(ref),
        String(ref.createdAt || ref.created_at || updatedAt),
        updatedAt,
      );
    }
    return listTopicContextRefs({ topicId, taskGroupId, limit: refs.length || 1 });
  }

  function importState(state = {}) {
    const stats = {
      threads: 0,
      messages: 0,
      artifacts: 0,
      pushSubscriptions: 0,
      pushReceipts: 0,
      pushDeliveries: 0,
    };
    const threads = asArray(state.threads);
    for (const [threadIndex, thread] of threads.entries()) {
      if (!importThread(thread, threadIndex)) continue;
      stats.threads += 1;
      for (const [messageIndex, message] of asArray(thread.messages).entries()) {
        if (!importMessage(thread, message, messageIndex)) continue;
        stats.messages += 1;
        asArray(message.artifacts).forEach((artifact, index) => {
          if (importArtifact(thread, message, artifact, index)) stats.artifacts += 1;
        });
      }
    }
    asArray(state.artifacts).forEach((artifact, index) => {
      const thread = { id: artifact.threadId || artifact.thread_id || "", workspaceId: artifact.workspaceId || "" };
      const message = { id: artifact.messageId || artifact.message_id || "" };
      if (importArtifact(thread, message, artifact, index)) stats.artifacts += 1;
    });
    asArray(state.pushSubscriptions).forEach((row, index) => {
      if (importPushSubscription(row, index)) stats.pushSubscriptions += 1;
    });
    asArray(state.pushReceipts).forEach((row, index) => {
      if (importPushReceipt(row, index)) stats.pushReceipts += 1;
    });
    asArray(state.pushDeliveries).forEach((row, index) => {
      if (importPushDelivery(row, index)) stats.pushDeliveries += 1;
    });
    const voiceInput = importVoiceInputState(state.voiceInput);
    stats.voiceInputCorrections = voiceInput.corrections;
    stats.voiceInputPhrases = voiceInput.phrasebook;
    stats.voiceInputAudit = voiceInput.audit;
    return stats;
  }

  function runtimeStateCounts() {
    const database = open();
    return {
      threads: Number(database.prepare("SELECT COUNT(*) AS count FROM threads").get()?.count || 0),
      messages: Number(database.prepare("SELECT COUNT(*) AS count FROM messages").get()?.count || 0),
      artifacts: Number(database.prepare("SELECT COUNT(*) AS count FROM artifacts").get()?.count || 0),
      pushSubscriptions: Number(database.prepare("SELECT COUNT(*) AS count FROM push_subscriptions").get()?.count || 0),
      pushReceipts: Number(database.prepare("SELECT COUNT(*) AS count FROM push_receipts").get()?.count || 0),
      pushDeliveries: Number(database.prepare("SELECT COUNT(*) AS count FROM push_deliveries").get()?.count || 0),
      voiceInputCorrections: Number(database.prepare("SELECT COUNT(*) AS count FROM voice_input_corrections").get()?.count || 0),
      voiceInputPhrases: Number(database.prepare("SELECT COUNT(*) AS count FROM voice_input_phrasebook").get()?.count || 0),
      voiceInputAudit: Number(database.prepare("SELECT COUNT(*) AS count FROM voice_input_audit").get()?.count || 0),
    };
  }

  function replaceRuntimeState(nextState = {}) {
    migrate();
    const database = open();
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.prepare("DELETE FROM messages").run();
      database.prepare("DELETE FROM threads").run();
      database.prepare("DELETE FROM artifacts").run();
      database.prepare("DELETE FROM push_subscriptions").run();
      database.prepare("DELETE FROM push_receipts").run();
      database.prepare("DELETE FROM push_deliveries").run();
      database.prepare("DELETE FROM voice_input_corrections").run();
      database.prepare("DELETE FROM voice_input_phrasebook").run();
      database.prepare("DELETE FROM voice_input_audit").run();
      importState(nextState);
      setMeta("automationPushMarks", nextState.automationPushMarks || {});
      setMeta("lastRuntimeStateSave", { savedAt: nowIso(), counts: runtimeStateCounts() });
      database.exec("COMMIT;");
    } catch (err) {
      try {
        database.exec("ROLLBACK;");
      } catch (_) {}
      throw err;
    }
  }

  function rowJson(row, fallback = {}) {
    const parsed = parseJson(row?.raw_json, null);
    return parsed && typeof parsed === "object" ? parsed : Object.assign({}, fallback);
  }

  function voiceCorrectionFromRow(row) {
    return rowJson(row, {
      id: String(row.id || ""),
      actorId: String(row.actor_id || ""),
      workspaceId: String(row.workspace_id || ""),
      surfaceType: String(row.surface_type || ""),
      pluginId: String(row.plugin_id || ""),
      threadId: String(row.thread_id || ""),
      language: String(row.language || ""),
      from: String(row.from_text || ""),
      to: String(row.to_text || ""),
      status: String(row.status || ""),
      supportCount: Number(row.support_count || 0),
      rejectionCount: Number(row.rejection_count || 0),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      lastSeenAt: String(row.last_seen_at || ""),
      lastAppliedAt: String(row.last_applied_at || ""),
    });
  }

  function voicePhraseFromRow(row) {
    const raw = rowJson(row, {});
    return Object.assign({}, raw, {
      id: String(row.id || raw.id || ""),
      actorId: String(row.actor_id || raw.actorId || ""),
      workspaceId: String(row.workspace_id || raw.workspaceId || ""),
      surfaceType: String(row.surface_type || raw.surfaceType || ""),
      pluginId: String(row.plugin_id || raw.pluginId || ""),
      threadId: String(row.thread_id || raw.threadId || ""),
      language: String(row.language || raw.language || ""),
      term: String(row.term || raw.term || ""),
      source: String(row.source || raw.source || ""),
      status: String(row.status || raw.status || ""),
      supportCount: Number(row.support_count || raw.supportCount || 0),
      aliases: parseJson(row.aliases_json, Array.isArray(raw.aliases) ? raw.aliases : []),
      createdAt: String(row.created_at || raw.createdAt || ""),
      updatedAt: String(row.updated_at || raw.updatedAt || ""),
      lastSeenAt: String(row.last_seen_at || raw.lastSeenAt || ""),
      lastAppliedAt: String(row.last_applied_at || raw.lastAppliedAt || ""),
    });
  }

  function voiceAuditFromRow(row) {
    return rowJson(row, Object.assign({
      id: String(row.id || ""),
      event: String(row.event_type || ""),
      actorId: String(row.actor_id || ""),
      workspaceId: String(row.workspace_id || ""),
      surfaceType: String(row.surface_type || ""),
      pluginId: String(row.plugin_id || ""),
      threadId: String(row.thread_id || ""),
      backend: String(row.backend || ""),
      createdAt: String(row.created_at || ""),
    }, parseJson(row.payload_json, {})));
  }

  function exportVoiceInputState() {
    const database = open();
    return {
      settings: getMeta("voiceInputSettings", {}),
      corrections: database.prepare("SELECT * FROM voice_input_corrections ORDER BY updated_at DESC, id").all().map(voiceCorrectionFromRow),
      phrasebook: database.prepare("SELECT * FROM voice_input_phrasebook ORDER BY updated_at DESC, id").all().map(voicePhraseFromRow),
      audit: database.prepare("SELECT * FROM voice_input_audit ORDER BY created_at DESC, id LIMIT 200").all().map(voiceAuditFromRow),
    };
  }

  function exportRuntimeState() {
    migrate();
    const database = open();
    const messageRowsByThread = new Map();
    const messageRows = database.prepare("SELECT * FROM messages ORDER BY thread_id, position, created_at, id").all();
    for (const row of messageRows) {
      const list = messageRowsByThread.get(row.thread_id) || [];
      list.push(row);
      messageRowsByThread.set(row.thread_id, list);
    }
    const threadRows = database.prepare("SELECT * FROM threads ORDER BY position, updated_at DESC, id").all();
    const threads = threadRows.map((row) => {
      const thread = rowJson(row, {
        id: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
        projectId: row.project_id,
        subprojectId: row.subproject_id,
        status: row.status,
        singleWindow: Boolean(row.single_window),
        hermesSessionId: row.hermes_session_id,
        activeRunId: row.active_run_id || null,
        activeRunIds: parseJson(row.active_run_ids_json, []),
        chatGroup: parseJson(row.chat_group_json, null),
        taskGroupMeta: parseJson(row.task_group_meta_json, {}),
        events: parseJson(row.events_json, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
      thread.messages = (messageRowsByThread.get(row.id) || []).map((messageRow) => rowJson(messageRow, {
        id: messageRow.id,
        role: messageRow.role,
        status: messageRow.status,
        taskGroupId: messageRow.task_group_id,
        messageKind: messageRow.message_kind,
        senderWorkspaceId: messageRow.sender_workspace_id,
        senderPrincipalId: messageRow.sender_principal_id,
        senderLabel: messageRow.sender_label,
        replyToMessageId: messageRow.reply_to_message_id,
        runId: messageRow.run_id,
        taskId: messageRow.task_id,
        reasoningEffort: messageRow.reasoning_effort,
        content: messageRow.content,
        artifacts: parseJson(messageRow.artifacts_json, []),
        directoryRoute: parseJson(messageRow.directory_route_json, null),
        directoryAliases: parseJson(messageRow.directory_aliases_json, []),
        usage: parseJson(messageRow.usage_json, null),
        runOptions: parseJson(messageRow.run_options_json, null),
        error: messageRow.error,
        createdAt: messageRow.created_at,
        updatedAt: messageRow.updated_at,
        submittedAt: messageRow.submitted_at,
        queuedAt: messageRow.queued_at,
        startedAt: messageRow.started_at,
        firstFeedbackAt: messageRow.first_feedback_at,
        completedAt: messageRow.completed_at,
        failedAt: messageRow.failed_at,
        cancelledAt: messageRow.cancelled_at,
        revokedAt: messageRow.revoked_at,
      }));
      return thread;
    });
    const artifacts = database.prepare("SELECT * FROM artifacts ORDER BY position, created_at, id").all()
      .map((row) => rowJson(row, {
        id: row.id,
        threadId: row.thread_id,
        messageId: row.message_id,
        workspaceId: row.workspace_id,
        name: row.name,
        mime: row.mime,
        url: row.url,
        path: row.path,
        size: row.size,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    const pushSubscriptions = database.prepare("SELECT * FROM push_subscriptions ORDER BY position, created_at, id").all()
      .map((row) => rowJson(row, {
        id: row.id,
        workspaceId: row.workspace_id,
        principalIds: parseJson(row.principal_ids_json, []),
        workspaceIds: parseJson(row.workspace_ids_json, []),
        endpointHash: row.endpoint_hash,
        disabledAt: row.disabled ? row.updated_at : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    const pushReceipts = database.prepare("SELECT * FROM push_receipts ORDER BY position, created_at, id").all()
      .map((row) => rowJson(row, {
        id: row.id,
        principalId: row.principal_id,
        workspaceId: row.workspace_id,
        messageType: row.message_type,
        markKey: row.mark_key,
        shown: Boolean(row.shown),
        foreground: Boolean(row.foreground),
        receivedAt: row.created_at,
      }));
    const pushDeliveries = database.prepare("SELECT * FROM push_deliveries ORDER BY position, created_at, id").all()
      .map((row) => rowJson(row, {
        id: row.id,
        principalId: row.principal_id,
        workspaceId: row.workspace_id,
        messageType: row.message_type,
        title: row.title,
        tag: row.tag,
        attempted: row.attempted,
        sent: row.sent,
        failed: row.failed,
        sentAt: row.created_at,
      }));
    return {
      schemaVersion: 1,
      threads,
      artifacts,
      pushSubscriptions,
      pushReceipts: pushReceipts.slice(-200),
      pushDeliveries: pushDeliveries.slice(-200),
      voiceInput: exportVoiceInputState(),
      automationPushMarks: getMeta("automationPushMarks", {}),
    };
  }

  function importFromDataDir(dataDir, options = {}) {
    const root = path.resolve(String(dataDir || ""));
    if (!root || !fs.existsSync(root)) {
      const err = new Error(`Data directory does not exist: ${root}`);
      err.status = 400;
      throw err;
    }
    migrate();
    if (options.reset !== false) clearImportedData();
    const manifest = {
      importedAt: nowIso(),
      dataDirKind: options.dataDirKind || "json-data-dir",
      files: {},
      counts: {},
      warnings: [],
    };

    const statePath = path.join(root, "state.json");
    const accessPath = path.join(root, "access-keys.json");
    const sharedPath = path.join(root, "shared-directories.json");
    const kanbanCaseSharesPath = path.join(root, "kanban-case-shares.json");
    const workspacesPath = path.join(root, "workspaces.json");
    const runtimePath = path.join(root, "runtime-config.json");
    const todosPath = path.join(root, "todos.json");
    const automationsPath = path.join(root, "automations.json");

    const state = readJsonIfExists(statePath, null);
    if (state) {
      manifest.files.state = { exists: true, sha256: sha256File(statePath), bytes: fs.statSync(statePath).size };
      manifest.counts = Object.assign(manifest.counts, importState(state));
    } else {
      manifest.files.state = { exists: false };
      manifest.warnings.push("state.json was not found or could not be parsed");
    }

    const access = readJsonIfExists(accessPath, null);
    let accessKeyCount = 0;
    if (access?.workspaceKeys && typeof access.workspaceKeys === "object") {
      for (const [workspaceId, row] of Object.entries(access.workspaceKeys)) {
        if (importAccessKey(workspaceId, row)) accessKeyCount += 1;
      }
    }
    manifest.files.accessKeys = fs.existsSync(accessPath)
      ? { exists: true, sha256: sha256File(accessPath), bytes: fs.statSync(accessPath).size }
      : { exists: false };
    manifest.counts.accessKeys = accessKeyCount;

    const shared = readJsonIfExists(sharedPath, null);
    let sharedCount = 0;
    const sharedRows = asArray(shared?.directories || shared?.sharedDirectories || shared);
    sharedRows.forEach((row, index) => {
      if (importSharedDirectory(row, index)) sharedCount += 1;
    });
    manifest.files.sharedDirectories = fs.existsSync(sharedPath)
      ? { exists: true, sha256: sha256File(sharedPath), bytes: fs.statSync(sharedPath).size }
      : { exists: false };
    manifest.counts.sharedDirectories = sharedCount;

    const kanbanCaseShares = readJsonIfExists(kanbanCaseSharesPath, null);
    let kanbanCaseShareCount = 0;
    const caseShareSource = kanbanCaseShares?.cases || kanbanCaseShares?.caseShares || kanbanCaseShares?.kanbanCaseShares || kanbanCaseShares;
    const caseShareRows = caseShareSource && typeof caseShareSource === "object" && !Array.isArray(caseShareSource)
      ? Object.entries(caseShareSource).map(([id, row]) => Object.assign({ id }, row || {}))
      : asArray(caseShareSource);
    caseShareRows.forEach((row, index) => {
      if (importKanbanCaseShare(row, index)) kanbanCaseShareCount += 1;
    });
    manifest.files.kanbanCaseShares = fs.existsSync(kanbanCaseSharesPath)
      ? { exists: true, sha256: sha256File(kanbanCaseSharesPath), bytes: fs.statSync(kanbanCaseSharesPath).size }
      : { exists: false };
    manifest.counts.kanbanCaseShares = kanbanCaseShareCount;

    const workspaces = options.workspaceCatalog || readJsonIfExists(workspacesPath, null);
    let workspaceCount = 0;
    const rows = asArray(workspaces?.workspaces || workspaces);
    for (const workspace of rows) {
      if (!workspace?.id) continue;
      importWorkspace(workspace);
      workspaceCount += 1;
    }
    if (!workspaceCount) {
      const workspaceIds = new Set(["owner"]);
      const stateThreads = asArray(state?.threads);
      for (const thread of stateThreads) {
        const id = normalizeId(thread.workspaceId);
        if (id) workspaceIds.add(id);
        for (const message of asArray(thread.messages)) {
          const senderId = normalizeId(message.senderWorkspaceId);
          if (senderId) workspaceIds.add(senderId);
        }
      }
      for (const workspaceId of workspaceIds) {
        importWorkspace({
          id: workspaceId,
          label: workspaceId === "owner" ? "Owner" : workspaceId,
          role: workspaceId === "owner" ? "owner" : "workspace",
          source: "inferred-from-state",
          createdAt: manifest.importedAt,
          updatedAt: manifest.importedAt,
        });
      }
      workspaceCount = workspaceIds.size;
      manifest.warnings.push("workspaces.json was not found; workspace rows were inferred from state only");
    }
    manifest.files.workspaces = options.workspaceCatalog
      ? { exists: true, source: "provided-catalog" }
      : fs.existsSync(workspacesPath)
      ? { exists: true, sha256: sha256File(workspacesPath), bytes: fs.statSync(workspacesPath).size }
      : { exists: false };
    manifest.counts.workspaces = workspaceCount;

    const runtimeConfig = readJsonIfExists(runtimePath, null);
    manifest.files.runtimeConfig = fs.existsSync(runtimePath)
      ? { exists: true, sha256: sha256File(runtimePath), bytes: fs.statSync(runtimePath).size }
      : { exists: false };
    if (runtimeConfig) setMeta("runtimeConfig", runtimeConfig);

    const todos = readJsonIfExists(todosPath, null);
    let todoCount = 0;
    asArray(todos?.todos || todos).forEach((row, index) => {
      if (importTodoItem(row, index)) todoCount += 1;
    });
    manifest.files.todos = fs.existsSync(todosPath)
      ? { exists: true, sha256: sha256File(todosPath), bytes: fs.statSync(todosPath).size }
      : { exists: false };
    manifest.counts.todoItems = todoCount;

    const automations = readJsonIfExists(automationsPath, null);
    let automationCount = 0;
    asArray(automations?.jobs || automations?.automations || automations).forEach((row, index) => {
      if (importAutomationJob(row, index)) automationCount += 1;
    });
    manifest.files.automations = fs.existsSync(automationsPath)
      ? { exists: true, sha256: sha256File(automationsPath), bytes: fs.statSync(automationsPath).size }
      : { exists: false };
    manifest.counts.automationJobs = automationCount;

    setMeta("lastImport", manifest);
    return manifest;
  }

  function tableCounts() {
    const counts = {};
    for (const table of TABLES) {
      const column = TABLE_COUNT_COLUMNS[table] || "*";
      const row = open().prepare(`SELECT COUNT(${column === "*" ? "*" : sqlQuoteIdent(column)}) AS count FROM ${sqlQuoteIdent(table)}`).get();
      counts[table] = Number(row?.count || 0);
    }
    return counts;
  }

  function integrityReport() {
    const database = open();
    const fk = database.prepare("PRAGMA foreign_key_check").all();
    const quick = database.prepare("PRAGMA quick_check").get();
    const counts = tableCounts();
    return {
      ok: fk.length === 0 && quick?.quick_check === "ok",
      schemaVersion: getMeta("schemaVersion", 0),
      quickCheck: quick?.quick_check || "",
      foreignKeyIssues: fk,
      counts,
      lastImport: getMeta("lastImport", null),
    };
  }

  function audit(eventType, payload = {}) {
    const payloadJson = Object.assign({}, payload.payload || {}, {
      eventId: payload.eventId || payload.event_id || "",
      timestamp: payload.timestamp || payload.createdAt || payload.created_at || "",
      action: payload.action || payload.operation || "",
      decision: payload.decision || "",
      reason: payload.reason || "",
      traceId: payload.traceId || payload.trace_id || "",
    });
    open().prepare(`
      INSERT INTO audit_log(event_type, actor_workspace_id, actor_principal_id, target_type, target_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(eventType || "event"),
      String(payload.actorWorkspaceId || ""),
      String(payload.actorPrincipalId || ""),
      String(payload.targetType || ""),
      String(payload.targetId || ""),
      stableJson(payloadJson),
      normalizeIso(payload.createdAt || payload.timestamp || nowIso()),
    );
  }

  function publicPlatformCurrencyWallet(row) {
    if (!row) return null;
    const availableBalance = Number(row.available_balance || 0);
    const heldBalance = Number(row.held_balance || 0);
    return {
      walletId: String(row.wallet_id || ""),
      workspaceId: String(row.workspace_id || ""),
      currency: String(row.currency || "TONGBAO"),
      status: String(row.status || "active"),
      availableBalance,
      heldBalance,
      totalBalance: availableBalance + heldBalance,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function ensurePlatformCurrencyWallet(workspaceId, options = {}) {
    migrate();
    const normalizedWorkspaceId = normalizeId(workspaceId, "owner");
    const walletId = normalizeId(options.walletId, `wallet:${normalizedWorkspaceId}`);
    const currency = normalizeId(options.currency, "TONGBAO");
    const timestamp = normalizeIso(options.nowIso || nowIso());
    open().prepare(`
      INSERT INTO platform_currency_wallets(wallet_id, workspace_id, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        updated_at = CASE
          WHEN platform_currency_wallets.updated_at IS NULL OR platform_currency_wallets.updated_at = ''
          THEN excluded.updated_at
          ELSE platform_currency_wallets.updated_at
        END
    `).run(walletId, normalizedWorkspaceId, currency, timestamp, timestamp);
    return getPlatformCurrencyWallet(normalizedWorkspaceId);
  }

  function getPlatformCurrencyWallet(workspaceId) {
    migrate();
    const normalizedWorkspaceId = normalizeId(workspaceId, "owner");
    const row = open().prepare(`
      SELECT
        wallet.wallet_id,
        wallet.workspace_id,
        wallet.currency,
        wallet.status,
        wallet.created_at,
        wallet.updated_at,
        COALESCE(SUM(ledger.available_delta), 0) AS available_balance,
        COALESCE(SUM(ledger.held_delta), 0) AS held_balance
      FROM platform_currency_wallets wallet
      LEFT JOIN platform_currency_ledger_entries ledger ON ledger.wallet_id = wallet.wallet_id
      WHERE wallet.workspace_id = ?
      GROUP BY wallet.wallet_id
    `).get(normalizedWorkspaceId);
    return publicPlatformCurrencyWallet(row);
  }

  function listPlatformCurrencyLedger(workspaceId, options = {}) {
    migrate();
    const normalizedWorkspaceId = normalizeId(workspaceId, "owner");
    const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit || 50) || 50)));
    return open().prepare(`
      SELECT *
      FROM platform_currency_ledger_entries
      WHERE workspace_id = ?
      ORDER BY created_at DESC, entry_id DESC
      LIMIT ?
    `).all(normalizedWorkspaceId, limit).map((row) => ({
      entryId: String(row.entry_id || ""),
      walletId: String(row.wallet_id || ""),
      workspaceId: String(row.workspace_id || ""),
      currency: String(row.currency || "TONGBAO"),
      amountDelta: Number(row.amount_delta || 0),
      availableDelta: Number(row.available_delta || 0),
      heldDelta: Number(row.held_delta || 0),
      entryType: String(row.entry_type || ""),
      sourceType: String(row.source_type || ""),
      sourceId: String(row.source_id || ""),
      reason: String(row.reason || ""),
      createdAt: String(row.created_at || ""),
      reversalOfEntryId: String(row.reversal_of_entry_id || ""),
    }));
  }

  return {
    actionInboxCounts,
    addActionInboxEvent,
    audit,
    clearImportedData,
    close,
    dbPath,
    getMeta,
    importAccessKey,
    importFromDataDir,
    importMessage,
    importKanbanCaseShare,
    importSharedDirectory,
    importState,
    importThread,
    importTodoItem,
    importAutomationJob,
    importWorkspace,
    integrityReport,
    ensurePlatformCurrencyWallet,
    deleteAutomationJob,
    updateActionInboxItem,
    deleteKanbanCaseShare,
    deleteTodoItem,
    getAutomationJob,
    getActionInboxItem,
    getActionInboxItemByDedupe,
    getKanbanCaseShare,
    getTodoItem,
    getPlatformCurrencyWallet,
    getTopicContextSummary,
    getTopicWorkingState,
    exportRuntimeState,
    listAutomationJobs,
    listActionInboxEvents,
    listActionInboxItems,
    listDueActionInboxItems,
    listKanbanCaseShares,
    listPlatformCurrencyLedger,
    listTopicContextRefs,
    listTodoItems,
    migrate,
    replaceRuntimeState,
    runtimeStateCounts,
    open,
    setMeta,
    tableCounts,
    upsertTopicContextSummary,
    upsertTopicWorkingState,
    upsertActionInboxItem,
    upsertKanbanCaseShare,
    replaceTopicContextRefs,
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  createMobileSqliteStore,
  parseJson,
  stableJson,
};
