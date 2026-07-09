"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { mediaAccountPublicFields } = require("./restricted-media-account-service");

function trace(label) {
  const tracePath = process.env.HERMES_MOBILE_BOOT_TRACE_PATH || process.env.HERMES_WEB_BOOT_TRACE_PATH || "";
  if (!tracePath) return;
  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, `${new Date().toISOString()} pid=${process.pid} ${label}\n`, "utf8");
  } catch (_) {}
}

function defaultStringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function defaultStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, rawValue]) => [String(key || "").trim(), String(rawValue || "").trim()])
    .filter(([key, rawValue]) => key && rawValue));
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
  const normalizeStringMap = options.normalizeStringMap || defaultStringMap;
  const cacheTtlMs = Number(options.cacheTtlMs ?? 5000);
  let catalogCache = { loadedAt: 0, value: null };

  function ownerLabel() {
    return String(
      typeof options.ownerLabel === "function" ? options.ownerLabel() : (options.ownerLabel || "Owner"),
    ).trim() || "Owner";
  }

  function fallbackOwnerWorkspace() {
    const repoRoot = String(options.repoRoot || "");
    const defaultOwnerWorkspace = String(
      typeof options.defaultOwnerWorkspace === "function"
        ? options.defaultOwnerWorkspace()
        : (options.defaultOwnerWorkspace || repoRoot),
    ).trim() || repoRoot;
    const label = ownerLabel();
    const fallbackPolicy = typeof options.fallbackOwnerPolicy === "function"
      ? options.fallbackOwnerPolicy()
      : buildAccessPolicy({
        principal_id: "owner",
        principal_label: label,
        access_mode: "unrestricted",
        default_workspace: defaultOwnerWorkspace,
      }, {}, null);
    return {
      id: "owner",
      label,
      role: "admin",
      accessMode: "unrestricted",
      defaultWorkspace: defaultOwnerWorkspace,
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
    const mediaFields = mediaAccountPublicFields({
      accountType: route.accountType || route.account_type || user.accountType || user.account_type,
      allowedOwnerSpecialPlugins: route.allowedOwnerSpecialPlugins
        || route.allowed_owner_special_plugins
        || user.allowedOwnerSpecialPlugins
        || user.allowed_owner_special_plugins,
      restrictedMedia: route.restrictedMedia === true || user.restrictedMedia === true,
      policy,
    });
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
      accountType: mediaFields.accountType,
      restrictedMedia: mediaFields.restrictedMedia,
      allowedOwnerSpecialPlugins: mediaFields.allowedOwnerSpecialPlugins,
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
      account_type: String(record?.accountType || record?.account_type || "").trim(),
      allowed_owner_special_plugins: normalizeStringList(record?.allowedOwnerSpecialPlugins || record?.allowed_owner_special_plugins),
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
      connector_profiles: normalizeStringMap(record?.connectorProfiles || record?.connector_profiles),
      account_type: String(record?.accountType || record?.account_type || "").trim(),
      allowed_owner_special_plugins: normalizeStringList(record?.allowedOwnerSpecialPlugins || record?.allowed_owner_special_plugins),
    };
    const workspace = workspaceFromRoute(route, user);
    workspace.source = "local-workspace";
    return workspace;
  }

  function loadCatalog() {
    trace("workspaceProject.loadCatalog enter");
    const now = Date.now();
    if (catalogCache.value && now - catalogCache.loadedAt < cacheTtlMs) {
      trace("workspaceProject.loadCatalog cache hit");
      return catalogCache.value;
    }

    trace("workspaceProject.loadCatalog before users");
    const usersRead = readJsonFirst(listFrom(options.usersPaths), { users: [] });
    trace("workspaceProject.loadCatalog after users");
    const routesRead = readJsonFirst(listFrom(options.routeMapPaths), { routes: [], principal_allowed_targets: {} });
    trace("workspaceProject.loadCatalog after routes");
    const projectRead = readJsonFirst(listFrom(options.projectMapPaths), { entries: [] });
    trace("workspaceProject.loadCatalog after project map");

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
      trace(`workspaceProject.loadCatalog before projects ${workspace.id}`);
      projects.push(...projectsForWorkspace(workspace, projectEntries, workspaces));
      trace(`workspaceProject.loadCatalog after projects ${workspace.id}`);
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
    trace(`workspaceProject.loadCatalog done workspaces=${workspaces.length} projects=${projects.length}`);
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
