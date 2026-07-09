function cleanPluginTopicValue(value = "", max = 160) {
  return String(value || "").trim().slice(0, Math.max(0, Number(max) || 0));
}

function normalizePluginTopicId(value = "") {
  return cleanPluginTopicValue(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pluginTopicGroupId(pluginId = "") {
  const id = normalizePluginTopicId(pluginId);
  return id ? `plugin:${id}` : "";
}

function normalizePluginTopicPath(value = "") {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function pluginTopicDirectoryRouteKeyPlan(route = null, group = null, options = {}) {
  const classicRouteKey = cleanPluginTopicValue(options.classicRouteKey, 600);
  if (classicRouteKey) return classicRouteKey;
  if (!route) return "";
  const owner = String(
    route.workspaceId
    || route.workspace_id
    || route.ownerWorkspaceId
    || route.owner_workspace_id
    || group?.ownerWorkspaceId
    || "",
  ).trim();
  const root = normalizePluginTopicPath(route.root || route.path || "");
  const routeId = cleanPluginTopicValue(route.projectId || route.id, 200);
  if (!routeId && !root) return "";
  return [owner, routeId, route.subprojectId || "", root].join("|");
}

function pluginTopicRouteInferenceTextPlan(route = {}) {
  return [
    route?.pluginId,
    route?.plugin_id,
    route?.contextPluginId,
    route?.context_plugin_id,
    route?.projectId,
    route?.project_id,
    route?.id,
    route?.root,
    route?.path,
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean).join("\n");
}

function pluginTopicDefinitionExists(pluginId = "", pluginDefs = []) {
  const id = normalizePluginTopicId(pluginId);
  return Boolean(id && pluginDefs.some((def) => normalizePluginTopicId(def?.id) === id));
}

function pluginTopicInferPluginIdFromRoutePlan(route = {}, group = {}, options = {}) {
  const pluginDefs = Array.isArray(options.pluginDefs) ? options.pluginDefs : [];
  const explicit = normalizePluginTopicId(
    route?.pluginId
    || route?.plugin_id
    || route?.contextPluginId
    || route?.context_plugin_id
    || group?.pluginId
    || group?.plugin_id
    || "",
  );
  if (explicit && pluginTopicDefinitionExists(explicit, pluginDefs)) return explicit;
  const text = pluginTopicRouteInferenceTextPlan(route);
  if (!text) return "";
  for (const def of pluginDefs) {
    if (def?.builtinKind) continue;
    const id = normalizePluginTopicId(def?.id);
    if (id && new RegExp(`(^|[/\\\\:_-])${id}($|[/\\\\:_-])`, "i").test(text)) return id;
    const hints = [def?.label, ...(Array.isArray(def?.deliveryHints) ? def.deliveryHints : [])]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    if (hints.some((hint) => hint && text.includes(hint))) return id;
  }
  return "";
}

function pluginTopicDefaultDirectoryClaimForRoutePlan(route = {}, group = null, options = {}) {
  const pluginId = pluginTopicInferPluginIdFromRoutePlan(route, group || {}, options);
  const key = pluginTopicDirectoryRouteKeyPlan(route, group, options);
  if (!pluginId || !key) return null;
  return Object.freeze({
    workspaceId: cleanPluginTopicValue(options.workspaceId, 120) || "owner",
    pluginId,
    directoryRouteKey: key,
    claimMode: "claimed_by_plugin",
    contextRole: "legacy_context",
    hideFromDirectoryTopicRoot: true,
    defaultTopicId: pluginTopicGroupId(pluginId),
  });
}

function normalizePluginTopicDirectoryClaimPlan(claim = null, options = {}) {
  if (!claim) return null;
  const key = cleanPluginTopicValue(options.directoryRouteKey || claim.directoryRouteKey || claim.directory_route_key, 600);
  if (!key) return null;
  return Object.freeze({
    workspaceId: cleanPluginTopicValue(claim.workspaceId || claim.workspace_id || options.workspaceId, 120) || "owner",
    pluginId: normalizePluginTopicId(claim.pluginId || claim.plugin_id || ""),
    directoryRouteKey: key,
    claimMode: cleanPluginTopicValue(claim.claimMode || claim.claim_mode || "claimed_by_plugin", 120),
    contextRole: cleanPluginTopicValue(claim.contextRole || claim.context_role || "legacy_context", 120),
    hideFromDirectoryTopicRoot: claim.hideFromDirectoryTopicRoot !== false && claim.hide_from_directory_topic_root !== false,
    defaultTopicId: cleanPluginTopicValue(claim.defaultTopicId || claim.default_topic_id, 200),
  });
}

function pluginTopicDirectoryClaimForRoutePlan(route = {}, group = null, options = {}) {
  const key = pluginTopicDirectoryRouteKeyPlan(route, group, options);
  if (!key) return null;
  const projection = options.bindingProjection && typeof options.bindingProjection === "object"
    ? options.bindingProjection
    : {};
  const claims = Array.isArray(projection.directoryClaims) ? projection.directoryClaims : [];
  const explicit = claims.find((claim) => String(claim?.directoryRouteKey || claim?.directory_route_key || "") === key);
  if (explicit) {
    return normalizePluginTopicDirectoryClaimPlan(explicit, {
      workspaceId: options.workspaceId,
      directoryRouteKey: key,
    });
  }
  return pluginTopicDefaultDirectoryClaimForRoutePlan(route, group, options);
}

function pluginTopicDirectoryClaimHidesRootPlan(_claim = null) {
  return false;
}

function pluginTopicCollectionRootVisibilityPlan(collections = [], options = {}) {
  const input = Array.isArray(collections) ? collections : [];
  const claimed = [];
  const root = [];
  for (const collection of input) {
    const claim = pluginTopicDirectoryClaimForRoutePlan(collection?.route, collection?.defaultGroup, options);
    if (pluginTopicDirectoryClaimHidesRootPlan(claim)) claimed.push(collection);
    else root.push(collection);
  }
  return Object.freeze({ claimed, root });
}

export {
  cleanPluginTopicValue,
  normalizePluginTopicId,
  pluginTopicCollectionRootVisibilityPlan,
  pluginTopicDefaultDirectoryClaimForRoutePlan,
  pluginTopicDirectoryClaimForRoutePlan,
  pluginTopicDirectoryClaimHidesRootPlan,
  pluginTopicDirectoryRouteKeyPlan,
  pluginTopicGroupId,
  pluginTopicInferPluginIdFromRoutePlan,
  pluginTopicRouteInferenceTextPlan,
};
