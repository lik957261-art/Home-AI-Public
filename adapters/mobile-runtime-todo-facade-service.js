"use strict";

const {
  createDirectKanbanCreateService: defaultCreateDirectKanbanCreateService,
  defaultFormatLocalDateTime,
} = require("./direct-kanban-create-service");

function requiredFunction(options, name) {
  const value = options[name];
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeTodoFacadeService requires ${name}`);
}

function stripPrincipalLabelPrefixes(value, prefixes = []) {
  let text = String(value || "").trim();
  for (const prefix of prefixes) {
    if (prefix && text.startsWith(prefix)) text = text.slice(String(prefix).length);
  }
  return text;
}

function createMobileRuntimeTodoFacadeService(options = {}) {
  const createDirectKanbanCreateService = options.createDirectKanbanCreateService || defaultCreateDirectKanbanCreateService;
  const findWorkspace = requiredFunction(options, "findWorkspace");
  const loadCatalog = requiredFunction(options, "loadCatalog");
  const useKanbanTodoBackend = requiredFunction(options, "useKanbanTodoBackend");
  const principalLabelPrefixes = Array.isArray(options.principalLabelPrefixes) ? options.principalLabelPrefixes : [];

  function workspacePrincipal(workspaceId) {
    const workspace = findWorkspace(workspaceId || "owner");
    return String(workspace?.policy?.principal_id || workspace?.id || "owner");
  }

  function todoAssigneesForWorkspace(workspaceId) {
    const catalog = loadCatalog();
    const source = workspacePrincipal(workspaceId);
    const allowedMap = catalog.routeMap?.principal_allowed_targets || {};
    let allowed = allowedMap[source];
    if (!Array.isArray(allowed)) allowed = allowed ? [allowed] : [source];
    const allowAll = allowed.includes("*") || source === "owner";
    const ids = new Set(allowAll ? catalog.workspaces.map((item) => item.id) : allowed.map(String));
    ids.add(source);
    return catalog.workspaces
      .filter((item) => ids.has(item.id))
      .map((item) => ({
        id: item.id,
        label: item.label || item.id,
        role: item.role || "user",
      }));
  }

  function todoAssigneeLabel(workspaceId, principalId) {
    return todoAssigneesForWorkspace(workspaceId).find((item) => item.id === principalId)?.label || principalId;
  }

  function resolveTodoAssigneeFromText(text, workspaceId) {
    const source = workspacePrincipal(workspaceId);
    const candidates = [];
    for (const item of todoAssigneesForWorkspace(workspaceId)) {
      const labels = [
        item.label,
        item.id,
        stripPrincipalLabelPrefixes(item.id, principalLabelPrefixes),
      ].filter(Boolean);
      for (const label of labels) candidates.push({ id: item.id, label: String(label) });
    }
    candidates.sort((a, b) => b.label.length - a.label.length);
    const rawText = String(text || "");
    const matched = candidates.find((item) => item.label && rawText.includes(item.label));
    return matched?.id || source;
  }

  const directKanbanCreateService = createDirectKanbanCreateService({
    formatLocalDateTime: defaultFormatLocalDateTime,
    resolveTodoAssigneeFromText,
    todoAssigneeLabel,
    stripPrincipalLabelPrefixes: (value) => stripPrincipalLabelPrefixes(value, principalLabelPrefixes),
    useKanbanTodoBackend,
  });

  return Object.freeze({
    detectDirectKanbanCreateRequest: (...args) => directKanbanCreateService.detectDirectKanbanCreateRequest(...args),
    detectDirectTodoCreateIntentForWeb: (...args) => directKanbanCreateService.detectDirectTodoCreateIntentForWeb(...args),
    directTodoCreateNeedsKanbanFields: (...args) => directKanbanCreateService.directTodoCreateNeedsKanbanFields(...args),
    formatDirectTodoCreateSuccessMessage: (...args) => directKanbanCreateService.formatDirectTodoCreateSuccessMessage(...args),
    formatLocalDateTime: defaultFormatLocalDateTime,
    parseWebTodoDueFromText: (...args) => directKanbanCreateService.parseWebTodoDueFromText(...args),
    resolveTodoAssigneeFromText,
    todoAssigneeLabel,
    todoAssigneesForWorkspace,
    verifyDirectTodoCreateResult: (...args) => directKanbanCreateService.verifyDirectTodoCreateResult(...args),
    workspacePrincipal,
  });
}

module.exports = {
  createMobileRuntimeTodoFacadeService,
  stripPrincipalLabelPrefixes,
};
