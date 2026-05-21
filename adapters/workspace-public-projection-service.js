"use strict";

function defaultDedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function requireFunction(deps, name) {
  if (typeof deps[name] !== "function") {
    throw new TypeError(`workspace public projection service requires ${name}`);
  }
}

function createWorkspacePublicProjectionService(options = {}) {
  for (const name of [
    "isOwnerAuth",
    "loadCatalog",
    "publicWorkspaceAccessKeyStatus",
    "publicWorkspaceBindings",
    "rootConflictsWithProtected",
    "filterRoots",
  ]) {
    requireFunction(options, name);
  }

  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;

  function workspacePolicy(workspace) {
    return workspace?.policy && typeof workspace.policy === "object" ? workspace.policy : {};
  }

  function publicWorkspaceWorkDirectories(workspace) {
    const policy = workspacePolicy(workspace);
    return dedupe([
      workspace?.defaultWorkspace,
      policy.default_workspace,
      policy.sync_root,
      policy.download_root,
      ...(Array.isArray(policy.allowed_roots) ? policy.allowed_roots : []),
      ...(Array.isArray(policy.delivery_roots) ? policy.delivery_roots : []),
    ].filter(Boolean))
      .filter((item) => !options.rootConflictsWithProtected(item))
      .map((item) => ({ path: item }));
  }

  function publicWorkspaceLocalConfig(workspace) {
    if (workspace?.source !== "local-workspace") return null;
    const policy = workspacePolicy(workspace);
    return {
      defaultWorkspace: String(workspace.defaultWorkspace || policy.default_workspace || ""),
      allowedRoots: Array.isArray(policy.allowed_roots) ? options.filterRoots(policy.allowed_roots) : [],
      allowedToolsets: Array.isArray(policy.allowed_toolsets) ? policy.allowed_toolsets : [],
      connectorProfiles: policy.connector_profiles && typeof policy.connector_profiles === "object" ? policy.connector_profiles : {},
    };
  }

  function publicWorkspace(workspace) {
    const policy = workspacePolicy(workspace);
    return {
      id: workspace.id,
      label: workspace.label,
      role: workspace.role,
      source: workspace.source || "",
      accessMode: workspace.accessMode,
      defaultWorkspace: workspace.defaultWorkspace,
      accessKey: String(policy.principal_id || workspace.id || ""),
      principalId: String(policy.principal_id || workspace.id || ""),
      accountId: workspace.accountId || policy.source_chat_id_alt || "",
      userId: workspace.userId || policy.source_user_id || "",
      chatId: workspace.chatId || policy.source_chat_id || "",
      target: workspace.target || "",
      contextTokenAvailable: workspace.contextTokenAvailable,
      outboundStatus: workspace.outboundStatus || "",
      workDirectories: publicWorkspaceWorkDirectories(workspace),
      accessKeyStatus: options.publicWorkspaceAccessKeyStatus(workspace),
      bindings: options.publicWorkspaceBindings(workspace),
      aliases: workspace.aliases || [],
      sessionMode: workspace.sessionMode || "",
      responseStyle: workspace.responseStyle || "",
      showTaskId: workspace.showTaskId,
      maxParallelTasks: workspace.maxParallelTasks || 0,
      localConfig: publicWorkspaceLocalConfig(workspace),
    };
  }

  function publicWorkspacesForAuth(auth) {
    const workspaces = options.loadCatalog().workspaces;
    if (options.isOwnerAuth(auth)) return workspaces;
    const allowed = new Set(
      []
        .concat(Array.isArray(auth?.workspaceIds) ? auth.workspaceIds : [])
        .concat(Array.isArray(auth?.workspaces) ? auth.workspaces : [])
        .concat(auth?.workspaceId ? [auth.workspaceId] : []),
    );
    return workspaces.filter((workspace) => allowed.has(workspace.id));
  }

  return {
    publicWorkspace,
    publicWorkspaceLocalConfig,
    publicWorkspaceWorkDirectories,
    publicWorkspacesForAuth,
  };
}

module.exports = {
  createWorkspacePublicProjectionService,
};
