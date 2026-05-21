"use strict";

const SENSITIVE_NAME_RE = /(^|[-_])(auth|authorization|api[-_]?key|access[-_]?key|key|token|secret|password|passwd|credential|cookie|session|signature|sig)([-_]|$)/i;

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function normalizeId(value) {
  return cleanString(value, 160);
}

function dedupe(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = cleanString(value, 160);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",");
  return value ? [value] : [];
}

function normalizeWorkspaceIdList(value) {
  return dedupe(listFrom(value));
}

function isSensitiveName(value) {
  return SENSITIVE_NAME_RE.test(cleanString(value).toLowerCase());
}

function entriesFromHeaders(headers) {
  if (!headers || typeof headers !== "object") return [];
  if (headers instanceof Map) return [...headers.entries()];
  if (Array.isArray(headers)) return headers;
  return Object.entries(headers);
}

function normalizeHeaderMetadata(headers) {
  const names = [];
  const redactedNames = [];
  for (const [rawName] of entriesFromHeaders(headers)) {
    const name = cleanString(rawName, 120).toLowerCase();
    if (!name) continue;
    names.push(name);
    if (isSensitiveName(name)) redactedNames.push(name);
  }
  return {
    headerNames: dedupe(names),
    redactedHeaderNames: dedupe(redactedNames),
  };
}

function entriesFromQuery(query) {
  if (!query) return [];
  if (query instanceof URLSearchParams) return [...query.entries()];
  if (Array.isArray(query)) return query;
  if (typeof query === "object") {
    const out = [];
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) out.push([key, item]);
      } else {
        out.push([key, value]);
      }
    }
    return out;
  }
  return [];
}

function addQueryEntry(target, key, value) {
  const safeKey = cleanString(key, 120);
  if (!safeKey) return;
  const safeValue = cleanString(value, 500);
  if (Object.hasOwn(target, safeKey)) {
    if (Array.isArray(target[safeKey])) target[safeKey].push(safeValue);
    else target[safeKey] = [target[safeKey], safeValue];
  } else {
    target[safeKey] = safeValue;
  }
}

function sanitizeQuery(query) {
  const safeQuery = {};
  const redactedQueryKeys = [];
  for (const [rawKey, rawValue] of entriesFromQuery(query)) {
    const key = cleanString(rawKey, 120);
    if (!key) continue;
    if (isSensitiveName(key)) {
      redactedQueryKeys.push(key);
      continue;
    }
    addQueryEntry(safeQuery, key, rawValue);
  }
  return {
    query: safeQuery,
    redactedQueryKeys: dedupe(redactedQueryKeys),
  };
}

function parseUrlInput(input) {
  const source = input || "";
  if (typeof source === "string") {
    try {
      const parsed = new URL(source, "http://localhost");
      return {
        path: parsed.pathname || "/",
        query: parsed.searchParams,
      };
    } catch (_) {
      const [pathPart, queryPart] = source.split("?", 2);
      return {
        path: cleanString(pathPart || "/", 500) || "/",
        query: new URLSearchParams(queryPart || ""),
      };
    }
  }
  if (source instanceof URL) {
    return {
      path: source.pathname || "/",
      query: source.searchParams,
    };
  }
  if (source && typeof source === "object") {
    if (source.url || source.href) return parseUrlInput(source.url || source.href);
    const path = cleanString(source.pathname || source.path || source.routePath || "/", 500) || "/";
    return {
      path,
      query: source.query || source.searchParams || {},
    };
  }
  return { path: "/", query: {} };
}

function normalizeRequestMetadata(input = {}) {
  const request = input.request && typeof input.request === "object" ? input.request : {};
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const parsedUrl = parseUrlInput(input.url || metadata.url || request.url || request.path || "");
  const querySource = input.query || metadata.query || request.query || parsedUrl.query;
  const query = sanitizeQuery(querySource);
  const headers = normalizeHeaderMetadata(input.headers || metadata.headers || request.headers || {});
  const credentialSourceTypes = dedupe([
    headers.redactedHeaderNames.length ? "header" : "",
    query.redactedQueryKeys.length ? "query" : "",
    cleanString(metadata.credentialSource || request.credentialSource, 80),
  ].filter(Boolean));
  return {
    method: cleanString(input.method || metadata.method || request.method || "GET", 20).toUpperCase() || "GET",
    path: cleanString(parsedUrl.path || "/", 500) || "/",
    query: query.query,
    redactedQueryKeys: query.redactedQueryKeys,
    headerNames: headers.headerNames,
    redactedHeaderNames: headers.redactedHeaderNames,
    hasCredentials: Boolean(credentialSourceTypes.length),
    credentialSourceTypes,
    requestId: cleanString(input.requestId || metadata.requestId || request.requestId || request.id || "", 160),
    clientVersion: cleanString(input.clientVersion || metadata.clientVersion || request.clientVersion || "", 120),
  };
}

function normalizeRequestActor(input = {}) {
  const hasWrappedAuth = Boolean(input.auth && typeof input.auth === "object");
  const hasWrappedActor = Boolean(input.actor && typeof input.actor === "object");
  const source = hasWrappedAuth
    ? input.auth
    : (hasWrappedActor ? input.actor : input);
  const workspace = input.workspace && typeof input.workspace === "object" ? input.workspace : {};
  const sourceRole = cleanString(source.role || source.kind || "", 80).toLowerCase();
  const sourceOk = source.ok !== false;
  const sourceOwner = Boolean(source.isOwner || source.is_owner || sourceRole === "owner");
  const hasAuthSignal = Boolean(
    hasWrappedAuth
    || hasWrappedActor
    || Object.hasOwn(source, "ok")
    || source.role
    || source.kind
    || source.isOwner
    || source.is_owner
    || source.workspaceId
    || source.workspace_id
    || source.principalId
    || source.principal_id
  );
  const workspaceIdCandidate = normalizeId(
    source.workspaceId || source.workspace_id || (sourceOwner ? "owner" : ((hasWrappedAuth || hasWrappedActor) ? workspace.id : "")),
  );
  const authenticated = Boolean(
    sourceOk
    && hasAuthSignal
    && (sourceOwner || workspaceIdCandidate || source.principalId || source.principal_id)
  );
  if (!authenticated) {
    return {
      kind: "unknown",
      role: "unknown",
      authenticated: false,
      isOwner: false,
      workspaceId: "",
      principalId: "",
      label: "",
      keySource: "",
    };
  }
  const isOwner = Boolean(sourceOwner);
  const workspaceId = isOwner ? "owner" : workspaceIdCandidate;
  const principalId = normalizeId(
    source.principalId
    || source.principal_id
    || workspace.policy?.principal_id
    || workspace.policy?.principalId
    || workspaceId,
  );
  const workspaceIds = normalizeWorkspaceIdList(
    source.workspaceIds
    || source.workspace_ids
    || source.workspaces,
  );
  return {
    kind: isOwner ? "owner" : "workspace",
    role: isOwner ? "owner" : "workspace",
    authenticated: true,
    isOwner,
    workspaceId,
    workspaceIds: workspaceIds.length ? workspaceIds : (workspaceId ? [workspaceId] : []),
    principalId: principalId || workspaceId,
    label: cleanString(source.label || source.name || workspace.label || workspace.name || workspaceId, 160),
    keySource: cleanString(source.keySource || source.key_source || "", 80),
  };
}

function sharedTopicPermissionsForRole(role) {
  const normalized = cleanString(role, 40).toLowerCase();
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

function normalizeSharedTopicInput(input = {}) {
  if (!input || typeof input !== "object") return {};
  const source = input.sharedTopic || input.topic || input.share;
  if (source && typeof source === "object") return source;
  return input;
}

function requestContextRoleForSharedTopic(contextOrActor, topicInput = {}) {
  const actor = contextOrActor?.actor || contextOrActor || {};
  const topic = normalizeSharedTopicInput(topicInput);
  const ownerWorkspaceId = normalizeId(
    topic.ownerWorkspaceId
    || topic.owner_workspace_id
    || topic.kanbanCaseOwnerWorkspaceId
    || topic.kanban_case_owner_workspace_id
    || topic.workspaceId
    || topic.workspace_id
    || "owner",
  ) || "owner";
  const actorWorkspaceId = normalizeId(actor.workspaceId || actor.workspace_id || "");
  if (!actor.authenticated || !actorWorkspaceId) return "none";
  if (actor.isOwner || actor.role === "owner" || actorWorkspaceId === ownerWorkspaceId) return "manager";
  if (normalizeWorkspaceIdList(topic.managerWorkspaceIds || topic.manager_workspace_ids || topic.managers).includes(actorWorkspaceId)) return "manager";
  if (normalizeWorkspaceIdList(topic.performerWorkspaceIds || topic.performer_workspace_ids || topic.performers).includes(actorWorkspaceId)) return "performer";
  if (normalizeWorkspaceIdList(topic.viewerWorkspaceIds || topic.viewer_workspace_ids || topic.viewers).includes(actorWorkspaceId)) return "viewer";
  return "none";
}

function normalizeSharedTopicScope(input = {}) {
  const actor = input.actor || {};
  const topic = normalizeSharedTopicInput(input);
  const active = Boolean(
    topic.sharedTopic
    || topic.shared
    || topic.caseId
    || topic.case_id
    || topic.kanbanCaseId
    || topic.kanban_case_id
    || topic.topicThreadId
    || topic.topic_thread_id
    || topic.topicTaskGroupId
    || topic.topic_task_group_id
  );
  if (!active) {
    return {
      active: false,
      role: "none",
      permissions: sharedTopicPermissionsForRole("none"),
    };
  }
  const ownerWorkspaceId = normalizeId(
    topic.ownerWorkspaceId
    || topic.owner_workspace_id
    || topic.kanbanCaseOwnerWorkspaceId
    || topic.kanban_case_owner_workspace_id
    || topic.workspaceId
    || topic.workspace_id
    || "owner",
  ) || "owner";
  const role = requestContextRoleForSharedTopic({ actor }, { sharedTopic: topic });
  return {
    active: true,
    ownerWorkspaceId,
    caseId: normalizeId(topic.caseId || topic.case_id || topic.kanbanCaseId || topic.kanban_case_id),
    topicThreadId: normalizeId(topic.topicThreadId || topic.topic_thread_id),
    topicTaskGroupId: normalizeId(topic.topicTaskGroupId || topic.topic_task_group_id),
    sharedDirectoryPath: cleanString(topic.sharedDirectoryPath || topic.shared_directory_path || "", 500),
    caseDirectoryPath: cleanString(topic.caseDirectoryPath || topic.case_directory_path || "", 500),
    role,
    permissions: sharedTopicPermissionsForRole(role),
    managerWorkspaceIds: normalizeWorkspaceIdList(topic.managerWorkspaceIds || topic.manager_workspace_ids || topic.managers),
    performerWorkspaceIds: normalizeWorkspaceIdList(topic.performerWorkspaceIds || topic.performer_workspace_ids || topic.performers),
    viewerWorkspaceIds: normalizeWorkspaceIdList(topic.viewerWorkspaceIds || topic.viewer_workspace_ids || topic.viewers),
  };
}

function normalizeWorkspaceScope(input = {}) {
  const actor = input.actor || {};
  const workspace = input.workspace && typeof input.workspace === "object" ? input.workspace : {};
  const requestedWorkspaceId = normalizeId(
    input.requestedWorkspaceId
    || input.requested_workspace_id
    || input.selectedWorkspaceId
    || input.selected_workspace_id
    || workspace.id
    || actor.workspaceId,
  );
  const actorWorkspaceId = normalizeId(actor.workspaceId || "");
  const selectedWorkspaceId = requestedWorkspaceId || actorWorkspaceId || "";
  const actorWorkspaceIds = normalizeWorkspaceIdList(actor.workspaceIds || actor.workspace_ids || actor.workspaces || actorWorkspaceId);
  const canAccessSelectedWorkspace = Boolean(
    actor.isOwner
    || (actor.authenticated && selectedWorkspaceId && actorWorkspaceIds.includes(selectedWorkspaceId)),
  );
  return {
    requestedWorkspaceId,
    selectedWorkspaceId,
    effectiveWorkspaceId: canAccessSelectedWorkspace ? selectedWorkspaceId : actorWorkspaceId,
    actorWorkspaceId,
    workspaceLabel: cleanString(workspace.label || workspace.name || "", 160),
    selectedIsOwnerWorkspace: selectedWorkspaceId === "owner",
    canAccessSelectedWorkspace,
  };
}

function requestContextHasOwnerScope(context) {
  const actor = context?.actor || context || {};
  return Boolean(actor.authenticated && (actor.isOwner || actor.role === "owner" || actor.kind === "owner"));
}

function requestContextHasWorkspaceScope(context, workspaceId = "") {
  const actor = context?.actor || context || {};
  const target = normalizeId(workspaceId || context?.workspace?.selectedWorkspaceId || "");
  if (!actor.authenticated) return false;
  if (requestContextHasOwnerScope(context)) return true;
  return normalizeWorkspaceIdList(actor.workspaceIds || actor.workspace_ids || actor.workspaces || actor.workspaceId).includes(target);
}

function publicRequestContext(contextOrInput = {}) {
  const context = contextOrInput.schemaVersion === 1 ? contextOrInput : buildRequestContext(contextOrInput);
  const request = context.request || {};
  return {
    schemaVersion: 1,
    actor: {
      kind: context.actor.kind,
      role: context.actor.role,
      authenticated: Boolean(context.actor.authenticated),
      isOwner: Boolean(context.actor.isOwner),
      workspaceId: context.actor.workspaceId,
      principalId: context.actor.principalId,
      label: context.actor.label,
      keySource: context.actor.keySource,
    },
    workspace: Object.assign({}, context.workspace),
    request: {
      method: request.method,
      path: request.path,
      query: Object.assign({}, request.query || {}),
      redactedQueryParamCount: (request.redactedQueryKeys || []).length,
      redactedHeaderCount: (request.redactedHeaderNames || []).length,
      hasCredentials: Boolean(request.hasCredentials),
      credentialSourceTypes: dedupe(request.credentialSourceTypes || []),
      requestId: request.requestId,
      clientVersion: request.clientVersion,
    },
    sharedTopic: context.sharedTopic ? Object.assign({}, context.sharedTopic) : null,
    scopes: Object.assign({}, context.scopes || {}),
  };
}

function buildRequestContext(input = {}) {
  const request = normalizeRequestMetadata(input);
  const actor = normalizeRequestActor({
    auth: input.auth,
    actor: input.actor,
    workspace: input.workspace,
  });
  const requestedWorkspaceId = normalizeId(
    input.selectedWorkspaceId
    || input.selected_workspace_id
    || input.workspaceId
    || input.workspace_id
    || request.query.workspaceId
    || request.query.workspace_id,
  );
  const workspace = normalizeWorkspaceScope({
    actor,
    workspace: input.workspace,
    requestedWorkspaceId,
  });
  const sharedTopic = normalizeSharedTopicScope({
    actor,
    sharedTopic: input.sharedTopic,
    topic: input.topic,
    share: input.share,
  });
  const context = {
    schemaVersion: 1,
    actor,
    workspace,
    request,
    sharedTopic,
    scopes: {
      owner: false,
      workspace: false,
      sharedTopic: Boolean(sharedTopic.active && sharedTopic.permissions.canView),
      sharedTopicRole: sharedTopic.role,
    },
  };
  context.scopes.owner = requestContextHasOwnerScope(context);
  context.scopes.workspace = requestContextHasWorkspaceScope(context, workspace.selectedWorkspaceId);
  return context;
}

module.exports = {
  buildRequestContext,
  isSensitiveName,
  normalizeRequestActor,
  normalizeRequestMetadata,
  normalizeSharedTopicScope,
  normalizeWorkspaceScope,
  publicRequestContext,
  requestContextHasOwnerScope,
  requestContextHasWorkspaceScope,
  requestContextRoleForSharedTopic,
  sharedTopicPermissionsForRole,
};
