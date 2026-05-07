"use strict";

function defaultStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function listFrom(value) {
  return typeof value === "function" ? value() : value;
}

function createWorkspaceProjectProvider(options = {}) {
  const readJsonFirst = options.readJsonFirst;
  const buildAccessPolicy = options.buildAccessPolicy;
  const projectsForWorkspace = options.projectsForWorkspace;
  if (typeof readJsonFirst !== "function") throw new TypeError("readJsonFirst is required");
  if (typeof buildAccessPolicy !== "function") throw new TypeError("buildAccessPolicy is required");
  if (typeof projectsForWorkspace !== "function") throw new TypeError("projectsForWorkspace is required");

  const normalizeStringList = options.normalizeStringList || defaultStringList;
  const cacheTtlMs = Number(options.cacheTtlMs ?? 5000);
  let catalogCache = { loadedAt: 0, value: null };

  function fallbackOwnerWorkspace() {
    const repoRoot = String(options.repoRoot || "");
    const fallbackPolicy = typeof options.fallbackOwnerPolicy === "function"
      ? options.fallbackOwnerPolicy()
      : buildAccessPolicy({
        principal_id: "owner",
        principal_label: "Owner",
        access_mode: "unrestricted",
        default_workspace: repoRoot,
      }, {}, null);
    return {
      id: "owner",
      label: "Owner",
      role: "admin",
      accessMode: "unrestricted",
      defaultWorkspace: repoRoot,
      aliases: normalizeStringList(typeof options.ownerAliases === "function" ? options.ownerAliases() : (options.ownerAliases || "owner")),
      sessionMode: "task_centric_stateless",
      responseStyle: "task_platform",
      showTaskId: true,
      maxParallelTasks: 0,
      policy: fallbackPolicy,
    };
  }

  function workspaceFromRoute(route, user) {
    const principalId = String(route.principal_id);
    const policy = buildAccessPolicy(route, user, null);
    return {
      id: principalId,
      label: String(route.principal_label || user.principal_label || route.principal_id),
      role: principalId === "owner" ? "admin" : "user",
      accessMode: String(route.access_mode || user.access_mode || "restricted"),
      defaultWorkspace: String(user.default_workspace || route.default_workspace || ""),
      accountId: String(route.adapter_account_id || user.account_id || ""),
      userId: String(route.user_id || user.user_id || ""),
      chatId: String(route.chat_id || user.chat_id || ""),
      target: String(route.target || user.target || ""),
      contextTokenAvailable: route.context_token_available === undefined && user.context_token_available === undefined
        ? null
        : Boolean(route.context_token_available ?? user.context_token_available),
      outboundStatus: String(route.outbound_status || user.outbound_status || ""),
      aliases: Array.isArray(route.aliases) ? route.aliases.map(String) : [],
      sessionMode: String(route.session_mode || user.session_mode || ""),
      responseStyle: String(route.response_style || user.response_style || ""),
      showTaskId: route.show_task_id !== undefined ? Boolean(route.show_task_id) : Boolean(user.show_task_id !== false),
      maxParallelTasks: Number(route.max_parallel_tasks || user.max_parallel_tasks || 0),
      policy,
    };
  }

  function workspaceFromLocalRecord(record) {
    const id = String(record?.id || record?.workspaceId || "").trim();
    const label = String(record?.label || id || "Workspace").trim();
    const defaultWorkspace = String(record?.defaultWorkspace || record?.default_workspace || "").trim();
    const accessMode = String(record?.accessMode || record?.access_mode || "restricted").trim() || "restricted";
    const allowedRoots = normalizeStringList(record?.allowedRoots || record?.allowed_roots || defaultWorkspace);
    const route = {
      principal_id: id,
      principal_label: label,
      access_mode: accessMode,
      default_workspace: defaultWorkspace,
      aliases: normalizeStringList(record?.aliases),
      show_task_id: record?.showTaskId !== false,
      max_parallel_tasks: Number(record?.maxParallelTasks || 0),
    };
    const user = {
      principal_id: id,
      principal_label: label,
      access_mode: accessMode,
      default_workspace: defaultWorkspace,
      allowed_roots: allowedRoots,
      delivery_roots: normalizeStringList(record?.deliveryRoots || record?.delivery_roots),
      sync_root: String(record?.syncRoot || record?.sync_root || "").trim(),
      download_root: String(record?.downloadRoot || record?.download_root || "").trim(),
      allowed_toolsets: normalizeStringList(record?.allowedToolsets || record?.allowed_toolsets),
    };
    const workspace = workspaceFromRoute(route, user);
    workspace.source = "local-workspace";
    return workspace;
  }

  function loadCatalog() {
    const now = Date.now();
    if (catalogCache.value && now - catalogCache.loadedAt < cacheTtlMs) return catalogCache.value;

    const usersRead = readJsonFirst(listFrom(options.usersPaths), { users: [] });
    const routesRead = readJsonFirst(listFrom(options.routeMapPaths), { routes: [], principal_allowed_targets: {} });
    const projectRead = readJsonFirst(listFrom(options.projectMapPaths), { entries: [] });

    const userByPrincipal = new Map();
    for (const user of Array.isArray(usersRead.data?.users) ? usersRead.data.users : []) {
      if (user && user.principal_id) userByPrincipal.set(String(user.principal_id), user);
    }

    const workspaces = [];
    for (const route of Array.isArray(routesRead.data?.routes) ? routesRead.data.routes : []) {
      if (!route || !route.principal_id) continue;
      const user = userByPrincipal.get(String(route.principal_id)) || {};
      workspaces.push(workspaceFromRoute(route, user));
    }
    const existingWorkspaceIds = new Set(workspaces.map((item) => item.id));
    const localRecords = typeof options.localWorkspaces === "function" ? options.localWorkspaces() : [];
    for (const record of Array.isArray(localRecords) ? localRecords : []) {
      const workspace = workspaceFromLocalRecord(record);
      if (!workspace.id || workspace.id === "owner" || existingWorkspaceIds.has(workspace.id)) continue;
      workspaces.push(workspace);
      existingWorkspaceIds.add(workspace.id);
    }
    if (!workspaces.some((item) => item.id === "owner")) {
      workspaces.unshift(fallbackOwnerWorkspace());
    }

    const projects = [];
    const projectEntries = Array.isArray(projectRead.data?.entries) ? projectRead.data.entries : [];
    for (const workspace of workspaces) {
      projects.push(...projectsForWorkspace(workspace, projectEntries, workspaces));
    }

    const catalog = {
      workspaces,
      projects,
      sources: {
        users: usersRead.path,
        routes: routesRead.path,
        projectMap: projectRead.path,
      },
      routeMap: routesRead.data,
    };
    catalogCache = { loadedAt: now, value: catalog };
    return catalog;
  }

  function invalidate() {
    catalogCache = { loadedAt: 0, value: null };
  }

  return {
    invalidate,
    loadCatalog,
  };
}

module.exports = {
  createWorkspaceProjectProvider,
};
