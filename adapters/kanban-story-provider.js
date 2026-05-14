"use strict";

const KANBAN_STATUSES = new Set(["triage", "todo", "ready", "running", "blocked", "done", "archived"]);
const DONE_STATUSES = new Set(["done", "completed"]);
const ARCHIVED_STATUSES = new Set(["archived", "cancelled", "canceled"]);
const CASE_ROLES = new Set(["manager", "performer", "viewer"]);

function own(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function cleanString(value) {
  return String(value ?? "").trim();
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

function firstNumber(source, names, fallback = 0) {
  if (!source || typeof source !== "object") return fallback;
  for (const name of names) {
    if (!own(source, name)) continue;
    const value = Number(source[name]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function arrayFromValue(value, limit = 100) {
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;]+/);
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

function firstArray(source, names, limit = 100) {
  if (!source || typeof source !== "object") return [];
  for (const name of names) {
    if (!own(source, name)) continue;
    const values = arrayFromValue(source[name], limit);
    if (values.length) return values;
  }
  return [];
}

function uniqueStrings(values, limit = 100) {
  return arrayFromValue(Array.isArray(values) ? values : [values], limit);
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeStatus(raw = {}) {
  const kanbanStatus = firstString(raw, ["kanbanStatus", "kanban_status"]).toLowerCase();
  if (KANBAN_STATUSES.has(kanbanStatus)) return kanbanStatus;
  const compatible = firstString(raw, ["status", "state"]).toLowerCase();
  if (KANBAN_STATUSES.has(compatible)) return compatible;
  if (DONE_STATUSES.has(compatible)) return "done";
  if (ARCHIVED_STATUSES.has(compatible)) return "archived";
  return kanbanStatus || compatible || "todo";
}

function isDoneStatus(status) {
  return DONE_STATUSES.has(cleanString(status).toLowerCase());
}

function isArchivedStatus(status) {
  return ARCHIVED_STATUSES.has(cleanString(status).toLowerCase());
}

function timestampValue(raw = {}) {
  const candidates = [
    raw.kanbanCompletedAt,
    raw.kanban_completed_at,
    raw.completedAt,
    raw.completed_at,
    raw.cancelledAt,
    raw.cancelled_at,
    raw.updatedAt,
    raw.updated_at,
    raw.createdAt,
    raw.created_at,
    raw.dueAt,
    raw.due_at,
    raw.dueLocal,
    raw.due_local,
  ];
  for (const value of candidates) {
    const text = cleanString(value).replace(" ", "T");
    if (!text) continue;
    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function descriptionSection(description, heading) {
  const text = String(description || "");
  const marker = `${heading}:\n`;
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const rest = text.slice(start + marker.length);
  const next = rest.search(/\n\n(?:Multi-Agent plan|Source request|Card goal|Expected deliverables|Acceptance criteria|Dependencies|Concurrency rule):/);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function descriptionList(description, heading, limit = 12) {
  return descriptionSection(description, heading)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function parsedPlanDescription(raw = {}) {
  const description = firstString(raw, ["description", "body"]);
  if (!description) return {};
  return {
    summary: description.match(/(?:^|\n)Multi-Agent plan:\s*([^\n]+)/)?.[1]?.trim() || "",
    sourceText: descriptionSection(description, "Source request"),
    cardGoal: descriptionSection(description, "Card goal"),
    deliverables: descriptionList(description, "Expected deliverables", 8),
    acceptance: descriptionList(description, "Acceptance criteria", 8),
    dependsOn: descriptionList(description, "Dependencies", 12),
  };
}

function unwrapCard(raw) {
  if (raw && typeof raw === "object" && raw.todo && typeof raw.todo === "object") {
    return Object.assign({}, raw.todo, raw.info && typeof raw.info === "object" ? raw.info : {});
  }
  return raw && typeof raw === "object" ? raw : {};
}

function caseFieldsFromRecord(rawInput = {}, options = {}, context = {}) {
  const raw = unwrapCard(rawInput);
  const parsed = parsedPlanDescription(raw);
  const hasCards = Boolean(context.hasCards);
  const explicitCaseId = firstString(raw, [
    "caseId",
    "case_id",
    "kanbanCaseId",
    "kanban_case_id",
  ]);
  const recordIdAsCaseId = hasCards || context.recordIdAsCaseId ? firstString(raw, ["id"]) : "";
  const cardId = firstString(raw, ["id", "todoId", "todo_id", "cardId", "card_id"]);
  const content = firstString(raw, ["content", "title", "name"], cardId);
  const sourceText = firstString(raw, [
    "caseSourceText",
    "case_source_text",
    "kanbanCaseSourceText",
    "kanban_case_source_text",
  ], parsed.sourceText);
  const summary = firstString(raw, [
    "caseSummary",
    "case_summary",
    "kanbanCaseSummary",
    "kanban_case_summary",
    "summary",
  ], parsed.summary || sourceText || content);
  const explicitMode = firstString(raw, [
    "caseMode",
    "case_mode",
    "kanbanCaseMode",
    "kanban_case_mode",
    "mode",
  ]);
  const declaredCount = firstNumber(raw, [
    "cardCount",
    "card_count",
    "caseCardCount",
    "case_card_count",
    "kanbanCaseCardCount",
    "kanban_case_card_count",
  ]);
  let caseId = explicitCaseId || recordIdAsCaseId;
  if (!caseId) {
    if (sourceText || parsed.summary) {
      caseId = `parsed-plan-${stableHash(`${summary}\0${sourceText}`)}`;
    } else {
      caseId = `single-card-${cardId || stableHash(summary || content || "card")}`;
    }
  }
  const inferredSingleCard = caseId.startsWith("single-card-");
  const caseMode = explicitMode || (inferredSingleCard ? "single-card" : "multi-agent");
  const ownerWorkspaceId = firstString(raw, [
    "ownerWorkspaceId",
    "owner_workspace_id",
    "kanbanCaseOwnerWorkspaceId",
    "kanban_case_owner_workspace_id",
    "kanbanShareOwnerWorkspaceId",
    "workspaceId",
    "workspace_id",
  ], cleanString(options.ownerWorkspaceId) || "owner") || "owner";
  const performerWorkspaceIds = uniqueStrings([
    ...firstArray(raw, [
      "performerWorkspaceIds",
      "performer_workspace_ids",
      "targetWorkspaceIds",
      "target_workspace_ids",
    ]),
    firstString(raw, [
      "performerWorkspaceId",
      "performer_workspace_id",
      "targetWorkspaceId",
      "target_workspace_id",
    ]),
  ].filter(Boolean));
  const viewerWorkspaceIds = uniqueStrings(firstArray(raw, [
    "viewerWorkspaceIds",
    "viewer_workspace_ids",
    "readonlyWorkspaceIds",
    "readonly_workspace_ids",
    "sharedViewerWorkspaceIds",
    "shared_viewer_workspace_ids",
  ]));
  const managerWorkspaceIds = uniqueStrings(firstArray(raw, [
    "managerWorkspaceIds",
    "manager_workspace_ids",
  ]));
  return {
    caseId,
    caseMode,
    ownerWorkspaceId,
    performerWorkspaceId: firstString(raw, [
      "performerWorkspaceId",
      "performer_workspace_id",
      "targetWorkspaceId",
      "target_workspace_id",
    ], performerWorkspaceIds[0] || ""),
    performerWorkspaceIds,
    viewerWorkspaceIds,
    managerWorkspaceIds,
    topicThreadId: firstString(raw, ["topicThreadId", "topic_thread_id"]),
    topicTaskGroupId: firstString(raw, ["topicTaskGroupId", "topic_task_group_id"]),
    sharedDirectoryPath: firstString(raw, ["sharedDirectoryPath", "shared_directory_path"]),
    caseDirectoryPath: firstString(raw, ["caseDirectoryPath", "case_directory_path"]),
    cardCount: declaredCount,
    title: firstString(raw, ["title", "caseTitle", "case_title"], summary || content || caseId),
    summary,
    sourceText,
    caseTemplate: firstString(raw, ["caseTemplate", "case_template", "kanbanCaseTemplate", "kanban_case_template"]),
    caseCover: raw.caseCover || raw.case_cover || raw.kanbanCaseCover || raw.kanban_case_cover || null,
  };
}

function normalizeKanbanCaseCard(rawInput = {}, options = {}) {
  const raw = unwrapCard(rawInput);
  const defaults = options.caseDefaults && typeof options.caseDefaults === "object" ? options.caseDefaults : {};
  const fields = caseFieldsFromRecord(raw, options, { hasCards: false });
  const rawHasCaseContext = Boolean(
    firstString(raw, ["caseId", "case_id", "kanbanCaseId", "kanban_case_id"])
    || firstString(raw, ["caseMode", "case_mode", "kanbanCaseMode", "kanban_case_mode", "mode"])
    || firstString(raw, ["caseSourceText", "case_source_text", "kanbanCaseSourceText", "kanban_case_source_text"])
    || firstNumber(raw, ["caseCardCount", "case_card_count", "kanbanCaseCardCount", "kanban_case_card_count"])
  );
  const id = firstString(raw, ["id", "todoId", "todo_id", "cardId", "card_id"]);
  const kanbanStatus = normalizeStatus(raw);
  const parsed = parsedPlanDescription(raw);
  const caseCardId = firstString(raw, [
    "caseCardId",
    "case_card_id",
    "kanbanCaseCardId",
    "kanban_case_card_id",
  ], id);
  return {
    id,
    content: firstString(raw, ["content", "title", "name"], id),
    description: firstString(raw, ["description", "body"]),
    status: firstString(raw, ["status"], isDoneStatus(kanbanStatus) ? "completed" : (isArchivedStatus(kanbanStatus) ? "cancelled" : "open")),
    kanbanStatus,
    workspaceId: firstString(raw, ["workspaceId", "workspace_id"], defaults.ownerWorkspaceId || fields.ownerWorkspaceId),
    caseId: rawHasCaseContext ? fields.caseId : (defaults.caseId || fields.caseId || ""),
    caseMode: rawHasCaseContext ? fields.caseMode : (defaults.caseMode || fields.caseMode || ""),
    caseTemplate: fields.caseTemplate || defaults.caseTemplate || "",
    caseSummary: rawHasCaseContext ? fields.summary : (defaults.summary || fields.summary || ""),
    caseSourceText: rawHasCaseContext ? fields.sourceText : (defaults.sourceText || fields.sourceText || ""),
    caseCardId,
    caseCardIndex: firstNumber(raw, [
      "caseCardIndex",
      "case_card_index",
      "kanbanCaseCardIndex",
      "kanban_case_card_index",
    ]),
    caseCardCount: firstNumber(raw, [
      "caseCardCount",
      "case_card_count",
      "kanbanCaseCardCount",
      "kanban_case_card_count",
    ]),
    dependsOn: firstArray(raw, [
      "caseDependsOn",
      "case_depends_on",
      "kanbanCaseDependsOn",
      "kanban_case_depends_on",
    ], 12).length ? firstArray(raw, [
        "caseDependsOn",
        "case_depends_on",
        "kanbanCaseDependsOn",
        "kanban_case_depends_on",
      ], 12) : parsed.dependsOn,
    deliverables: firstArray(raw, [
      "caseDeliverables",
      "case_deliverables",
      "kanbanCaseDeliverables",
      "kanban_case_deliverables",
    ], 8).length ? firstArray(raw, [
        "caseDeliverables",
        "case_deliverables",
        "kanbanCaseDeliverables",
        "kanban_case_deliverables",
      ], 8) : parsed.deliverables,
    acceptance: firstArray(raw, [
      "caseAcceptance",
      "case_acceptance",
      "kanbanCaseAcceptance",
      "kanban_case_acceptance",
    ], 8).length ? firstArray(raw, [
        "caseAcceptance",
        "case_acceptance",
        "kanbanCaseAcceptance",
        "kanban_case_acceptance",
      ], 8) : parsed.acceptance,
    cardGoal: firstString(raw, [
      "caseCardGoal",
      "case_card_goal",
      "kanbanCaseCardGoal",
      "kanban_case_card_goal",
    ], parsed.cardGoal),
    revisionOf: firstString(raw, ["revisionOf", "revision_of", "kanbanRevisionOf", "kanban_revision_of"]),
    revisionRequest: firstString(raw, ["revisionRequest", "revision_request", "kanbanRevisionRequest", "kanban_revision_request"]),
    revisionRequestedAt: firstString(raw, ["revisionRequestedAt", "revision_requested_at", "kanbanRevisionRequestedAt", "kanban_revision_requested_at"]),
    revisionRequestedBy: firstString(raw, ["revisionRequestedBy", "revision_requested_by", "kanbanRevisionRequestedBy", "kanban_revision_requested_by"]),
    revisionCount: firstNumber(raw, ["revisionCount", "revision_count", "kanbanRevisionCount", "kanban_revision_count"]),
    createdAt: firstString(raw, ["createdAt", "created_at"]),
    updatedAt: firstString(raw, ["updatedAt", "updated_at"]),
    completedAt: firstString(raw, ["completedAt", "completed_at", "kanbanCompletedAt", "kanban_completed_at"]),
    cancelledAt: firstString(raw, ["cancelledAt", "cancelled_at"]),
  };
}

function cardSortIndex(card = {}, byId = new Map()) {
  const original = card.revisionOf ? byId.get(card.revisionOf) : null;
  return Number(original?.caseCardIndex || card.caseCardIndex || 0) || 0;
}

function compareCaseCards(left = {}, right = {}, byId = new Map()) {
  const leftIndex = cardSortIndex(left, byId) || 999999;
  const rightIndex = cardSortIndex(right, byId) || 999999;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  const timeDelta = timestampValue(left) - timestampValue(right);
  if (timeDelta) return timeDelta;
  return String(left.id || left.caseCardId || "").localeCompare(String(right.id || right.caseCardId || ""));
}

function visibleRevisionCards(cards = []) {
  const byId = new Map();
  for (const card of cards) {
    if (card.id) byId.set(card.id, card);
  }
  const baseCards = cards.filter((card) => !card.revisionOf);
  const baseIds = new Set(baseCards.map((card) => card.id).filter(Boolean));
  const revisionsByOriginal = new Map();
  for (const card of cards) {
    if (!card.revisionOf) continue;
    const previous = revisionsByOriginal.get(card.revisionOf);
    const previousRank = Number(previous?.revisionCount || 0) || 0;
    const nextRank = Number(card.revisionCount || 0) || 0;
    if (!previous || nextRank > previousRank || (
      nextRank === previousRank
      && timestampValue(card) >= timestampValue(previous)
    )) {
      revisionsByOriginal.set(card.revisionOf, card);
    }
  }
  const visible = baseCards.map((card) => revisionsByOriginal.get(card.id) || card);
  for (const card of cards) {
    if (card.revisionOf && !baseIds.has(card.revisionOf)) visible.push(card);
  }
  return visible.sort((left, right) => compareCaseCards(left, right, byId));
}

function progressFromCards(cards = [], declaredTotal = 0) {
  const counts = {
    triage: 0,
    todo: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    done: 0,
    archived: 0,
  };
  for (const card of cards) {
    const status = normalizeStatus(card);
    if (own(counts, status)) counts[status] += 1;
    else counts.todo += 1;
  }
  const known = cards.length;
  const total = Math.max(Number(declaredTotal || 0) || 0, known);
  const closed = counts.done + counts.archived;
  const remaining = Math.max(0, total - known);
  const open = Math.max(0, known - closed);
  return {
    total,
    known,
    remaining,
    open,
    triage: counts.triage,
    todo: counts.todo,
    ready: counts.ready,
    running: counts.running,
    blocked: counts.blocked,
    done: counts.done,
    archived: counts.archived,
    closed,
    percent: total > 0 ? Math.round((closed / total) * 100) : 0,
  };
}

function normalizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const total = Number(value.total || 0) || 0;
  return {
    total,
    known: Number(value.known || 0) || 0,
    remaining: Number(value.remaining || 0) || 0,
    open: Number(value.open || 0) || 0,
    triage: Number(value.triage || 0) || 0,
    todo: Number(value.todo || 0) || 0,
    ready: Number(value.ready || 0) || 0,
    running: Number(value.running || 0) || 0,
    blocked: Number(value.blocked || 0) || 0,
    done: Number(value.done || 0) || 0,
    archived: Number(value.archived || 0) || 0,
    closed: Number(value.closed || value.done || 0) || 0,
    percent: Number(value.percent || 0) || 0,
  };
}

function archiveStateFromProgress(progress = {}) {
  const total = Number(progress.total || 0) || 0;
  if (total <= 0) return "empty";
  const known = Number(progress.known || 0) || 0;
  if (known < total) return "active";
  const open = Number(progress.open || 0) || 0;
  const archived = Number(progress.archived || 0) || 0;
  if (archived >= total) return "archived";
  if (open === 0 && Number(progress.closed || 0) >= total) return "ready-to-archive";
  return "active";
}

function caseLatestTimestamp(cards = []) {
  return Math.max(0, ...cards.map((card) => timestampValue(card)));
}

function kanbanCaseKey(record = {}) {
  const normalized = record && record.caseId && record.caseMode && record.ownerWorkspaceId
    ? record
    : normalizeKanbanCaseRecord(record);
  return [
    cleanString(normalized.ownerWorkspaceId) || "owner",
    cleanString(normalized.caseMode) || "case",
    cleanString(normalized.caseId) || "case",
  ].join(":");
}

function normalizeKanbanCaseRecord(record = {}, options = {}) {
  const rawCards = Array.isArray(record?.cards)
    ? record.cards
    : (Array.isArray(record?.visibleCards) ? record.visibleCards : []);
  const recordLooksLikeCard = Boolean(
    own(record, "content")
    || own(record, "title")
    || own(record, "status")
    || own(record, "kanbanStatus")
    || own(record, "kanban_status")
    || own(record, "caseCardId")
    || own(record, "case_card_id")
    || own(record, "kanbanCaseCardId")
    || own(record, "kanban_case_card_id")
  );
  const fields = caseFieldsFromRecord(record, options, {
    hasCards: rawCards.length > 0,
    recordIdAsCaseId: !recordLooksLikeCard && Boolean(
      own(record || {}, "mode")
      || own(record || {}, "caseMode")
      || own(record || {}, "case_mode")
    ),
  });
  const cardDefaults = Object.assign({}, fields);
  let cards = rawCards.map((card) => normalizeKanbanCaseCard(card, Object.assign({}, options, { caseDefaults: cardDefaults })));
  if (!cards.length && record && typeof record === "object" && recordLooksLikeCard) {
    cards = [normalizeKanbanCaseCard(record, Object.assign({}, options, { caseDefaults: cardDefaults }))];
  }
  const byId = new Map(cards.map((card) => [card.id, card]).filter(([id]) => id));
  const sortedCards = [...cards].sort((left, right) => compareCaseCards(left, right, byId));
  const visibleCards = visibleRevisionCards(sortedCards);
  const declaredCount = Math.max(
    fields.cardCount,
    ...sortedCards.map((card) => Number(card.caseCardCount || 0) || 0),
  );
  const baseCount = sortedCards.filter((card) => !card.revisionOf).length;
  const suppliedProgress = normalizeProgress(record?.progress);
  const cardCount = Math.max(declaredCount, Number(suppliedProgress?.total || 0) || 0, baseCount, visibleCards.length, sortedCards.length ? 1 : 0);
  const progress = suppliedProgress || progressFromCards(visibleCards, cardCount);
  const archiveState = cleanString(record?.archiveState || record?.archive_state) || archiveStateFromProgress(progress);
  const normalized = {
    caseId: fields.caseId,
    caseMode: fields.caseMode,
    ownerWorkspaceId: fields.ownerWorkspaceId,
    performerWorkspaceId: fields.performerWorkspaceId || fields.performerWorkspaceIds[0] || "",
    performerWorkspaceIds: fields.performerWorkspaceIds,
    viewerWorkspaceIds: fields.viewerWorkspaceIds,
    managerWorkspaceIds: fields.managerWorkspaceIds,
    topicThreadId: fields.topicThreadId,
    topicTaskGroupId: fields.topicTaskGroupId,
    sharedDirectoryPath: fields.sharedDirectoryPath,
    caseDirectoryPath: fields.caseDirectoryPath,
    cardCount,
    progress,
    archiveState,
    title: fields.title,
    summary: fields.summary,
    sourceText: fields.sourceText,
    caseTemplate: fields.caseTemplate,
    caseCover: fields.caseCover,
    cards: sortedCards,
    visibleCards,
    latest: caseLatestTimestamp(sortedCards),
  };
  return Object.assign({ key: kanbanCaseKeyShallow(normalized) }, normalized);
}

function kanbanCaseKeyShallow(record = {}) {
  return [
    cleanString(record.ownerWorkspaceId) || "owner",
    cleanString(record.caseMode) || "case",
    cleanString(record.caseId) || "case",
  ].join(":");
}

function mergeGroupField(group, field, value) {
  if (!group[field] && value) group[field] = value;
}

function mergeWorkspaceLists(left = [], right = []) {
  return uniqueStrings([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]);
}

function groupKanbanCaseCards(cards = [], options = {}) {
  const groups = new Map();
  for (const rawCard of Array.isArray(cards) ? cards : []) {
    const card = normalizeKanbanCaseCard(rawCard, options);
    const fields = caseFieldsFromRecord(rawCard, options, { hasCards: false });
    const key = kanbanCaseKeyShallow(fields);
    if (!groups.has(key)) {
      groups.set(key, Object.assign({ cards: [] }, fields));
    }
    const group = groups.get(key);
    group.cards.push(card);
    mergeGroupField(group, "title", fields.title);
    mergeGroupField(group, "summary", fields.summary);
    mergeGroupField(group, "sourceText", fields.sourceText);
    mergeGroupField(group, "caseTemplate", fields.caseTemplate);
    mergeGroupField(group, "topicThreadId", fields.topicThreadId);
    mergeGroupField(group, "topicTaskGroupId", fields.topicTaskGroupId);
    mergeGroupField(group, "sharedDirectoryPath", fields.sharedDirectoryPath);
    mergeGroupField(group, "caseDirectoryPath", fields.caseDirectoryPath);
    group.cardCount = Math.max(Number(group.cardCount || 0) || 0, Number(fields.cardCount || 0) || 0);
    group.performerWorkspaceIds = mergeWorkspaceLists(group.performerWorkspaceIds, fields.performerWorkspaceIds);
    group.performerWorkspaceId = group.performerWorkspaceId || fields.performerWorkspaceId || group.performerWorkspaceIds[0] || "";
    group.viewerWorkspaceIds = mergeWorkspaceLists(group.viewerWorkspaceIds, fields.viewerWorkspaceIds);
    group.managerWorkspaceIds = mergeWorkspaceLists(group.managerWorkspaceIds, fields.managerWorkspaceIds);
  }
  return [...groups.values()]
    .map((group) => normalizeKanbanCaseRecord(group, options))
    .sort((left, right) => {
      const delta = Number(right.latest || 0) - Number(left.latest || 0);
      if (delta) return delta;
      return kanbanCaseKeyShallow(right).localeCompare(kanbanCaseKeyShallow(left));
    });
}

function normalizeActorWorkspaceIds(actor) {
  if (!actor) return [];
  if (typeof actor === "string") return actor ? [actor] : [];
  if (Array.isArray(actor)) return uniqueStrings(actor);
  if (typeof actor !== "object") return [];
  return uniqueStrings([
    firstString(actor, ["workspaceId", "workspace_id", "actorWorkspaceId", "actor_workspace_id", "id"]),
    ...firstArray(actor, ["workspaceIds", "workspace_ids", "actorWorkspaceIds", "actor_workspace_ids"]),
  ].filter(Boolean));
}

function normalizedExistingRole(record = {}) {
  const role = firstString(record, ["kanbanActorRole", "actorRole", "role"]).toLowerCase();
  return CASE_ROLES.has(role) ? role : "";
}

function actorRoleForKanbanCase(record = {}, actor = null) {
  const directRole = !actor ? normalizedExistingRole(record) : "";
  if (directRole) return directRole;
  const normalized = normalizeKanbanCaseRecord(record);
  if (actor && typeof actor === "object" && Boolean(actor.isOwner || actor.owner || actor.is_owner)) return "manager";
  const actorIds = normalizeActorWorkspaceIds(actor);
  if (!actorIds.length) return "";
  if (actorIds.includes(normalized.ownerWorkspaceId)) return "manager";
  if (actorIds.some((id) => normalized.managerWorkspaceIds.includes(id))) return "manager";
  if (actorIds.some((id) => normalized.performerWorkspaceIds.includes(id))) return "performer";
  if (actorIds.some((id) => normalized.viewerWorkspaceIds.includes(id))) return "viewer";
  return "";
}

function permissionsForRole(role) {
  const normalized = cleanString(role).toLowerCase();
  if (normalized === "manager") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canModify: true,
      canRevise: true,
      canDelete: true,
      canManage: true,
    };
  }
  if (normalized === "performer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
      canModify: false,
      canRevise: false,
      canDelete: false,
      canManage: false,
    };
  }
  if (normalized === "viewer") {
    return {
      canView: true,
      canComment: true,
      canSubmitStudy: false,
      canAnswerQuiz: false,
      canModify: false,
      canRevise: false,
      canDelete: false,
      canManage: false,
    };
  }
  return {
    canView: false,
    canComment: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
    canModify: false,
    canRevise: false,
    canDelete: false,
    canManage: false,
  };
}

function capabilityKey(capability) {
  const text = cleanString(capability).replace(/^can/i, "");
  const normalized = text.slice(0, 1).toLowerCase() + text.slice(1);
  if (["view", "read"].includes(normalized)) return "canView";
  if (["comment", "reply"].includes(normalized)) return "canComment";
  if (["submit", "submitStudy", "complete", "answerStudy"].includes(normalized)) return "canSubmitStudy";
  if (["answer", "answerQuiz", "quiz", "startExam", "answerExam"].includes(normalized)) return "canAnswerQuiz";
  if (["delete", "remove"].includes(normalized)) return "canDelete";
  if (["modify", "edit", "update", "postpone", "block", "unblock"].includes(normalized)) return "canModify";
  if (["revise", "requestChanges", "request_changes"].includes(normalized)) return "canRevise";
  if (["manage", "archive", "share"].includes(normalized)) return "canManage";
  return "canManage";
}

function looksLikeCapability(value) {
  if (typeof value !== "string") return false;
  return capabilityKey(value) !== "canManage" || ["manage", "archive", "share"].includes(cleanString(value));
}

function kanbanCaseCanActor(record = {}, actor = null, capability = "view") {
  let resolvedActor = actor;
  let resolvedCapability = capability;
  if (capability === "view" && looksLikeCapability(actor)) {
    resolvedActor = null;
    resolvedCapability = actor;
  }
  const role = actorRoleForKanbanCase(record, resolvedActor);
  const permissions = permissionsForRole(role);
  return Boolean(permissions[capabilityKey(resolvedCapability)]);
}

function publicCardSummary(card = {}) {
  return {
    id: card.id,
    content: card.content,
    status: card.status,
    kanbanStatus: card.kanbanStatus,
    caseCardId: card.caseCardId,
    caseCardIndex: card.caseCardIndex,
    caseCardCount: card.caseCardCount,
    dependsOn: card.dependsOn,
    revisionOf: card.revisionOf,
    revisionCount: card.revisionCount,
    updatedAt: card.updatedAt,
    completedAt: card.completedAt,
  };
}

function publicKanbanCaseSummary(record = {}, actor = null, options = {}) {
  const normalized = normalizeKanbanCaseRecord(record, options);
  const role = actorRoleForKanbanCase(normalized, actor);
  const summary = {
    key: kanbanCaseKeyShallow(normalized),
    caseId: normalized.caseId,
    caseMode: normalized.caseMode,
    ownerWorkspaceId: normalized.ownerWorkspaceId,
    performerWorkspaceId: normalized.performerWorkspaceId,
    viewerWorkspaceIds: normalized.viewerWorkspaceIds,
    topicThreadId: normalized.topicThreadId,
    topicTaskGroupId: normalized.topicTaskGroupId,
    sharedDirectoryPath: normalized.sharedDirectoryPath,
    caseDirectoryPath: normalized.caseDirectoryPath,
    cardCount: normalized.cardCount,
    progress: normalized.progress,
    archiveState: normalized.archiveState,
    title: normalized.title,
    summary: normalized.summary,
    caseTemplate: normalized.caseTemplate,
    cards: normalized.visibleCards.map(publicCardSummary),
  };
  if (options.includeSourceText) summary.sourceText = normalized.sourceText;
  if (role) {
    summary.actorRole = role;
    summary.actorPermissions = permissionsForRole(role);
  }
  return summary;
}

module.exports = {
  actorRoleForKanbanCase,
  groupKanbanCaseCards,
  kanbanCaseCanActor,
  kanbanCaseKey,
  normalizeKanbanCaseRecord,
  publicKanbanCaseSummary,
};
