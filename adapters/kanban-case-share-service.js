"use strict";

const path = require("node:path");

function cleanString(value) {
  return String(value ?? "").trim();
}

function pathApiForPath(...values) {
  return values.some((value) => /^[A-Za-z]:[\\/]/.test(cleanString(value)) || cleanString(value).includes("\\"))
    ? path.win32
    : path;
}

function pathInsideDirectory(rootPath, candidatePath) {
  const root = cleanString(rootPath);
  const candidate = cleanString(candidatePath);
  if (!root || !candidate) return false;
  const pathApi = pathApiForPath(root, candidate);
  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate));
  return !relative || (!relative.startsWith("..") && !pathApi.isAbsolute(relative));
}

function normalizeWorkspaceIdList(value, options = {}) {
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : null;
  const raw = Array.isArray(value)
    ? value
    : cleanString(value).split(/[,\s;，、；]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const id = cleanString(item);
    if (!id || seen.has(id)) continue;
    if (findWorkspace && !findWorkspace(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function kanbanCaseShareKey(ownerWorkspaceId, caseId) {
  return `${cleanString(ownerWorkspaceId) || "owner"}::${cleanString(caseId)}`;
}

function kanbanActorPermissions(role) {
  const normalized = cleanString(role);
  if (normalized === "manager") {
    return {
      canView: true,
      canManage: true,
      canRevise: true,
      canDelete: true,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
    };
  }
  if (normalized === "performer") {
    return {
      canView: true,
      canManage: false,
      canRevise: false,
      canDelete: false,
      canComment: true,
      canSubmitStudy: true,
      canAnswerQuiz: true,
    };
  }
  if (normalized === "viewer") {
    return {
      canView: true,
      canManage: false,
      canRevise: false,
      canDelete: false,
      canComment: true,
      canSubmitStudy: false,
      canAnswerQuiz: false,
    };
  }
  return {
    canView: false,
    canManage: false,
    canRevise: false,
    canDelete: false,
    canComment: false,
    canSubmitStudy: false,
    canAnswerQuiz: false,
  };
}

function kanbanPermissionAllows(role, capability) {
  const permissions = kanbanActorPermissions(role);
  if (capability === "view") return permissions.canView;
  if (capability === "submitStudy") return permissions.canSubmitStudy;
  if (capability === "answerQuiz") return permissions.canAnswerQuiz;
  if (capability === "comment") return permissions.canComment;
  if (capability === "revise") return permissions.canRevise;
  if (capability === "delete") return permissions.canDelete;
  return permissions.canManage;
}

function safeCaseStore(raw) {
  return {
    schemaVersion: 1,
    cases: raw?.cases && typeof raw.cases === "object" && !Array.isArray(raw.cases) ? raw.cases : {},
  };
}

function createKanbanCaseShareService(deps = {}) {
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const findWorkspace = typeof deps.findWorkspace === "function" ? deps.findWorkspace : () => true;
  const normalizeWorkspaceList = (value) => normalizeWorkspaceIdList(value, { findWorkspace });

  function jsonStore() {
    if (typeof deps.readJsonStore !== "function") return { schemaVersion: 1, cases: {} };
    return safeCaseStore(deps.readJsonStore(deps.sharePath, { schemaVersion: 1, cases: {} }));
  }

  function store() {
    const next = jsonStore();
    if (!deps.useSqliteServiceStore?.()) return next;
    const rows = deps.mobileSqliteStore?.().listKanbanCaseShares?.({ includeArchived: true, includeDeleted: true }) || [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const key = kanbanCaseShareKey(row.ownerWorkspaceId, row.caseId);
      if (!key.endsWith("::")) next.cases[key] = Object.assign({}, next.cases[key] || {}, row);
    }
    return next;
  }

  function syncToSqlite(nextStore) {
    if (!deps.useSqliteServiceStore?.()) return;
    const sqlite = deps.mobileSqliteStore?.();
    if (!sqlite) return;
    for (const share of Object.values(nextStore?.cases || {})) {
      if (!share || typeof share !== "object" || Array.isArray(share)) continue;
      const owner = cleanString(share.ownerWorkspaceId || share.owner_workspace_id || "owner") || "owner";
      const caseId = cleanString(share.caseId || share.case_id || share.kanbanCaseId || share.kanban_case_id);
      if (!caseId) continue;
      if (share.deletedAt || share.deleted_at) {
        sqlite.deleteKanbanCaseShare?.(owner, caseId, {
          soft: true,
          deletedAt: share.deletedAt || share.deleted_at || nowIso(),
        });
      } else {
        sqlite.upsertKanbanCaseShare?.(owner, caseId, share);
      }
    }
  }

  function saveStore(nextStore) {
    const normalized = Object.assign({ schemaVersion: 1, cases: {} }, nextStore || {});
    syncToSqlite(normalized);
    if (typeof deps.writeJsonStore === "function") deps.writeJsonStore(deps.sharePath, normalized);
  }

  function readShare(ownerWorkspaceId, caseId) {
    const share = store().cases[kanbanCaseShareKey(ownerWorkspaceId, caseId)];
    return share && typeof share === "object" && !Array.isArray(share) ? share : null;
  }

  function sharesForOwner(ownerWorkspaceId) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    return Object.values(store().cases || {}).filter((share) => {
      if (!share || typeof share !== "object" || Array.isArray(share)) return false;
      if (share.deletedAt || share.deleted_at) return false;
      return (cleanString(share.ownerWorkspaceId || share.owner_workspace_id || "owner") || "owner") === owner;
    });
  }

  function caseDirectoryPathForCase(ownerWorkspaceId, caseId) {
    return cleanString(readShare(ownerWorkspaceId, caseId)?.caseDirectoryPath);
  }

  function shareForCaseDirectoryPath(ownerWorkspaceId, rawPath) {
    const localPath = cleanString(rawPath);
    if (!localPath) return null;
    return sharesForOwner(ownerWorkspaceId).find((share) => (
      pathInsideDirectory(share.caseDirectoryPath || share.case_directory_path, localPath)
    )) || null;
  }

  function upsertShare(ownerWorkspaceId, caseId, input = {}) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const id = cleanString(caseId);
    if (!id) return null;
    const performerWorkspaceIds = normalizeWorkspaceList(
      input.performerWorkspaceIds
      || input.performer_workspace_ids
      || input.targetWorkspaceIds
      || input.target_workspace_ids
      || input.performerWorkspaceId
      || input.performer_workspace_id
      || input.targetWorkspaceId
      || input.target_workspace_id
      || "",
    ).filter((workspaceId) => workspaceId !== owner);
    const viewerWorkspaceIds = normalizeWorkspaceList(
      input.viewerWorkspaceIds
      || input.viewer_workspace_ids
      || input.readonlyWorkspaceIds
      || input.readonly_workspace_ids
      || input.sharedViewerWorkspaceIds
      || input.shared_viewer_workspace_ids
      || "",
    ).filter((workspaceId) => workspaceId !== owner && !performerWorkspaceIds.includes(workspaceId));
    const managerWorkspaceIds = normalizeWorkspaceList(
      input.managerWorkspaceIds
      || input.manager_workspace_ids
      || "",
    ).filter((workspaceId) => workspaceId !== owner);
    const topic = input.topic && typeof input.topic === "object" && !Array.isArray(input.topic) ? input.topic : input;
    const nextStore = store();
    const key = kanbanCaseShareKey(owner, id);
    const previous = nextStore.cases[key] && typeof nextStore.cases[key] === "object" ? nextStore.cases[key] : {};
    const share = {
      schemaVersion: 1,
      ownerWorkspaceId: owner,
      caseId: id,
      performerWorkspaceIds,
      viewerWorkspaceIds,
      managerWorkspaceIds,
      topicThreadId: cleanString(topic.topicThreadId || topic.topic_thread_id || previous.topicThreadId),
      topicTaskGroupId: cleanString(topic.topicTaskGroupId || topic.topic_task_group_id || previous.topicTaskGroupId),
      sharedDirectoryPath: cleanString(topic.sharedDirectoryPath || topic.shared_directory_path || previous.sharedDirectoryPath),
      caseDirectoryPath: cleanString(topic.caseDirectoryPath || topic.case_directory_path || previous.caseDirectoryPath),
      updatedAt: nowIso(),
      createdAt: previous.createdAt || nowIso(),
    };
    nextStore.cases[key] = share;
    saveStore(nextStore);
    return share;
  }

  function roleForAuth(auth, ownerWorkspaceId, caseId) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    if (deps.isOwnerAuth?.(auth) || deps.authCanAccessWorkspace?.(auth, owner)) return "manager";
    const actorWorkspaceId = cleanString(auth?.workspaceId);
    if (!actorWorkspaceId) return "";
    const share = readShare(owner, caseId);
    if (!share) return "";
    if (normalizeWorkspaceList(share.managerWorkspaceIds).includes(actorWorkspaceId)) return "manager";
    if (normalizeWorkspaceList(share.performerWorkspaceIds).includes(actorWorkspaceId)) return "performer";
    if (normalizeWorkspaceList(share.viewerWorkspaceIds).includes(actorWorkspaceId)) return "viewer";
    return "";
  }

  function roleForWorkspaceActor(actorWorkspaceId, ownerWorkspaceId, caseId, auth = null) {
    const owner = cleanString(ownerWorkspaceId) || "owner";
    const actor = cleanString(actorWorkspaceId);
    if (!actor) return roleForAuth(auth, owner, caseId);
    if (actor === owner) return "manager";
    const share = readShare(owner, caseId);
    if (!share) return deps.isOwnerAuth?.(auth) ? "manager" : "";
    if (normalizeWorkspaceList(share.managerWorkspaceIds).includes(actor)) return "manager";
    if (normalizeWorkspaceList(share.performerWorkspaceIds).includes(actor)) return "performer";
    if (normalizeWorkspaceList(share.viewerWorkspaceIds).includes(actor)) return "viewer";
    return deps.isOwnerAuth?.(auth) ? "manager" : "";
  }

  function annotateCardForAuth(card, auth, options = {}) {
    if (!card || typeof card !== "object") return card;
    const workspaceId = cleanString(card.workspaceId || card.workspace_id) || "owner";
    const caseId = cleanString(card.kanbanCaseId || card.kanban_case_id);
    const role = caseId
      ? (options.actorWorkspaceId
        ? roleForWorkspaceActor(options.actorWorkspaceId, workspaceId, caseId, auth)
        : roleForAuth(auth, workspaceId, caseId))
      : (deps.authCanAccessWorkspace?.(auth, workspaceId) ? "manager" : "");
    if (!role) return card;
    return Object.assign({}, card, {
      kanbanActorRole: role,
      kanbanActorPermissions: kanbanActorPermissions(role),
      kanbanShareOwnerWorkspaceId: workspaceId,
    });
  }

  function annotateCardsForAuth(cards, auth, options = {}) {
    return (Array.isArray(cards) ? cards : []).map((card) => annotateCardForAuth(card, auth, options));
  }

  function shareActorWorkspaceId(auth, selectedWorkspaceId = "") {
    const selected = cleanString(selectedWorkspaceId);
    return deps.isOwnerAuth?.(auth) && selected && selected !== "owner"
      ? selected
      : cleanString(auth?.workspaceId);
  }

  function sharesForActor(auth, selectedWorkspaceId = "") {
    const actorWorkspaceId = shareActorWorkspaceId(auth, selectedWorkspaceId);
    if (!actorWorkspaceId) return [];
    return Object.values(store().cases || {}).filter((share) => {
      if (!share || typeof share !== "object") return false;
      return normalizeWorkspaceList(share.managerWorkspaceIds).includes(actorWorkspaceId)
        || normalizeWorkspaceList(share.performerWorkspaceIds).includes(actorWorkspaceId)
        || normalizeWorkspaceList(share.viewerWorkspaceIds).includes(actorWorkspaceId);
    });
  }

  async function sharedCardsForAuth(auth, selectedWorkspaceId, listArgs = {}) {
    const actorWorkspaceId = shareActorWorkspaceId(auth, selectedWorkspaceId);
    const shares = sharesForActor(auth, selectedWorkspaceId).filter((share) => (
      cleanString(share.ownerWorkspaceId || "owner") !== cleanString(selectedWorkspaceId || "owner")
    ));
    if (!shares.length) return [];
    const byOwner = new Map();
    for (const share of shares) {
      const owner = cleanString(share.ownerWorkspaceId || "owner") || "owner";
      if (!byOwner.has(owner)) byOwner.set(owner, new Set());
      byOwner.get(owner).add(cleanString(share.caseId));
    }
    const out = [];
    for (const [ownerWorkspaceId, caseIds] of byOwner.entries()) {
      const result = await deps.kanbanCardProvider?.listCards?.(Object.assign({}, listArgs, {
        workspaceId: ownerWorkspaceId,
        includeCompleted: true,
        limit: Math.max(Number(listArgs.limit || 120), 500),
      })).catch((err) => ({ ok: false, error: err?.message || String(err) }));
      if (!result?.ok) continue;
      for (const card of result.data || []) {
        if (caseIds.has(cleanString(card.kanbanCaseId))) {
          out.push(annotateCardForAuth(card, auth, { actorWorkspaceId }));
        }
      }
    }
    return out;
  }

  return {
    jsonStore,
    store,
    syncToSqlite,
    saveStore,
    key: kanbanCaseShareKey,
    readShare,
    sharesForOwner,
    caseDirectoryPathForCase,
    shareForCaseDirectoryPath,
    upsertShare,
    roleForAuth,
    roleForWorkspaceActor,
    actorPermissions: kanbanActorPermissions,
    annotateCardForAuth,
    annotateCardsForAuth,
    shareActorWorkspaceId,
    sharesForActor,
    sharedCardsForAuth,
    permissionAllows: kanbanPermissionAllows,
    normalizeWorkspaceIdList: normalizeWorkspaceList,
  };
}

module.exports = {
  createKanbanCaseShareService,
  kanbanActorPermissions,
  kanbanCaseShareKey,
  kanbanPermissionAllows,
  normalizeWorkspaceIdList,
};
