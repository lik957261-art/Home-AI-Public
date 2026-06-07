"use strict";

function requireFunction(value, label) {
  if (typeof value !== "function") throw new Error(`MobileRuntimeWorkspaceIdentityFacadeService requires ${label}`);
  return value;
}

function createMobileRuntimeWorkspaceIdentityFacadeService(options = {}) {
  const findWorkspace = requireFunction(options.findWorkspace, "findWorkspace");
  const loadCatalog = requireFunction(options.loadCatalog, "loadCatalog");
  const workspacePrincipal = requireFunction(options.workspacePrincipal, "workspacePrincipal");
  const workspaceFacade = typeof options.workspaceFacade === "function" ? options.workspaceFacade : (() => options.workspaceFacade || null);

  function callFacade(methodName, args) {
    const facade = workspaceFacade();
    const method = facade?.[methodName];
    return typeof method === "function" ? method.apply(facade, args) : undefined;
  }

  function workspaceLabel(workspaceId) {
    const delegated = callFacade("workspaceLabel", [workspaceId]);
    if (delegated !== undefined) return delegated;
    const workspace = findWorkspace(String(workspaceId || ""));
    return workspace?.label || workspace?.id || String(workspaceId || "");
  }

  function senderInfoForWorkspace(workspaceId) {
    const delegated = callFacade("senderInfoForWorkspace", [workspaceId]);
    if (delegated !== undefined) return delegated;
    const id = String(workspaceId || "owner").trim() || "owner";
    return { senderWorkspaceId: id, senderPrincipalId: workspacePrincipal(id), senderLabel: workspaceLabel(id) };
  }

  function workspaceIdForPrincipal(principalId) {
    const delegated = callFacade("workspaceIdForPrincipal", [principalId]);
    if (delegated !== undefined) return delegated;
    const principal = String(principalId || "owner").trim() || "owner";
    const catalog = loadCatalog() || {};
    const workspaces = Array.isArray(catalog.workspaces) ? catalog.workspaces : [];
    const workspace = workspaces.find((item) => {
      const itemPrincipal = String(item?.policy?.principal_id || item?.id || "").trim() || "owner";
      return item.id === principal || itemPrincipal === principal;
    });
    return workspace?.id || (principal === "owner" ? "owner" : principal);
  }

  return Object.freeze({
    senderInfoForWorkspace,
    workspaceIdForPrincipal,
    workspaceLabel,
  });
}

module.exports = {
  createMobileRuntimeWorkspaceIdentityFacadeService,
};
