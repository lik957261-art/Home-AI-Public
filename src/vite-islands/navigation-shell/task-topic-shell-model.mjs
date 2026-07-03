const DEFAULT_EMPTY_TOPIC_TEXT = "还没有话题。发送消息后会在这里形成话题。";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function comparableDirectoryPath(value = "") {
  return cleanString(value, 500).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
}

function stableJson(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function stableHash(value) {
  const text = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function directoryTopicOwnerWorkspaceKey(group = {}, route = null) {
  return cleanString(
    route?.workspaceId
    || route?.workspace_id
    || route?.ownerWorkspaceId
    || route?.owner_workspace_id
    || route?.actorWorkspaceId
    || route?.actor_workspace_id
    || group?.ownerWorkspaceId
    || group?.workspaceId
    || group?.actorWorkspaceId
    || "",
    120,
  );
}

function directoryTopicRouteKey(route, group = null) {
  if (!route) return "";
  const root = comparableDirectoryPath(route.root || route.path || "");
  const routeId = cleanString(route.projectId || route.id || "", 160);
  if (!routeId && !root) return "";
  return [
    directoryTopicOwnerWorkspaceKey(group || {}, route),
    routeId,
    cleanString(route.subprojectId || "", 160),
    root,
  ].join("|");
}

function directoryTopicRouteLabel(route = {}) {
  return cleanString(route.label || route.projectLabel || route.projectId || route.id || route.root || route.path || "目录", 160) || "目录";
}

function directoryTopicPrimaryRoute(group = {}) {
  if (!group || group.pluginTopic || group.sharedTopic || group.sourceThreadId) return null;
  if (group.directoryRoute?.root || group.directoryRoute?.path) return group.directoryRoute;
  const routes = Array.isArray(group.directoryRoutes) ? group.directoryRoutes : [];
  return routes.find((route) => route?.projectId && (route.root || route.path)) || null;
}

function directoryTopicUpdatedValue(group = {}) {
  const value = Date.parse(group?.updatedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function directoryTopicCollectionsForGroups(groups = []) {
  const byKey = new Map();
  for (const group of groups || []) {
    const route = directoryTopicPrimaryRoute(group);
    const key = directoryTopicRouteKey(route, group);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        route,
        label: directoryTopicRouteLabel(route),
        groups: [],
        defaultGroup: null,
        updatedAt: "",
      });
    }
    const collection = byKey.get(key);
    collection.groups.push(group);
    if (!collection.defaultGroup || directoryTopicUpdatedValue(group) >= directoryTopicUpdatedValue(collection.defaultGroup)) {
      collection.defaultGroup = group;
      collection.updatedAt = group.updatedAt || collection.updatedAt || "";
    }
  }
  return [...byKey.values()]
    .map((collection) => Object.freeze(Object.assign(collection, {
      groups: collection.groups.slice().sort((a, b) => directoryTopicUpdatedValue(b) - directoryTopicUpdatedValue(a)),
    })))
    .sort((a, b) => directoryTopicUpdatedValue(b.defaultGroup) - directoryTopicUpdatedValue(a.defaultGroup));
}

function directoryTopicCollectionGroupIds(collections = []) {
  const ids = new Set();
  for (const collection of collections || []) {
    for (const group of collection.groups || []) {
      if (group?.id) ids.add(String(group.id));
    }
  }
  return ids;
}

function directoryTopicRenderSignature(threadId = "", groups = [], collections = null) {
  if (Array.isArray(collections)) {
    const entries = collections.map((collection) => [
      collection?.key || "",
      collection?.updatedAt || "",
      (collection?.groups || []).map((group) => group?.id || "").join(","),
    ].join(":")).sort();
    return [threadId || "", entries.join("|")].join("::");
  }
  const entries = (groups || []).map((group) => [
    group?.id || "",
    directoryTopicRouteKey(directoryTopicPrimaryRoute(group), group),
    group?.pluginTopic ? "plugin" : "",
    group?.sharedTopic ? "shared" : "",
    group?.sourceThreadId || "",
  ].join(":")).sort();
  return [threadId || "", entries.join("|")].join("::");
}

function groupMatchesSearch(group = {}, search = "") {
  const normalized = cleanString(search, 160).toLowerCase();
  if (!normalized) return true;
  return [
    group.id,
    group.title,
    group.prompt,
    group.summary,
    group.status,
  ].map((value) => cleanString(value, 500).toLowerCase()).join("\n").includes(normalized);
}

function groupMatchesDirectoryFilter(group = {}, filter = null) {
  if (!filter?.projectId) return true;
  const projectId = cleanString(filter.projectId, 160);
  const route = directoryTopicPrimaryRoute(group);
  return cleanString(route?.projectId || route?.id || "", 160) === projectId;
}

function topicGroupVisibleInTaskList(group = {}) {
  const caseId = cleanString(group.kanbanCaseId || group.caseId || "", 120);
  const caseMode = cleanString(group.kanbanCaseMode || "", 80);
  return !(caseId || caseMode);
}

function taskListGroupsForThread(thread = {}) {
  return Array.isArray(thread.taskGroups) ? thread.taskGroups : [];
}

function sharedCaseTopicGroupsForTaskList(thread = {}) {
  return Array.isArray(thread.sharedTopicGroups) ? thread.sharedTopicGroups : [];
}

function pluginTopicGroupsForTaskList(thread = {}) {
  return Array.isArray(thread.pluginTopicGroups) ? thread.pluginTopicGroups : [];
}

function buildTaskTopicShellModel(thread = {}, state = {}, options = {}) {
  const threadId = cleanString(thread.id || state.currentThreadId || "", 160);
  const search = cleanString(options.search ?? state.searchText ?? "", 160).toLowerCase();
  const filter = options.taskDirectoryFilter ?? state.taskDirectoryFilter ?? null;
  const sourceGroups = taskListGroupsForThread(thread);
  const sharedGroups = sharedCaseTopicGroupsForTaskList(thread);
  const pluginGroups = pluginTopicGroupsForTaskList(thread);
  const groups = sourceGroups
    .filter(topicGroupVisibleInTaskList)
    .concat(sharedGroups)
    .concat(pluginGroups)
    .filter((group) => groupMatchesDirectoryFilter(group, filter))
    .filter((group) => groupMatchesSearch(group, search))
    .sort((a, b) => cleanString(b.updatedAt).localeCompare(cleanString(a.updatedAt)));
  const indexedDirectoryTopicCollections = Array.isArray(thread.directoryTopicCollections)
    ? thread.directoryTopicCollections
    : null;
  const directoryTopicSourceGroups = groups.filter((group) => !group.pluginTopic);
  const computedDirectoryTopicCollections = !indexedDirectoryTopicCollections
    ? directoryTopicCollectionsForGroups(directoryTopicSourceGroups)
    : null;
  const rawDirectoryTopicCollections = indexedDirectoryTopicCollections || computedDirectoryTopicCollections || [];
  const directoryTopicSignature = directoryTopicRenderSignature(threadId, groups, indexedDirectoryTopicCollections);
  const directoryCollectionsReady = options.directoryTopicCollectionsReady === true
    || Boolean(indexedDirectoryTopicCollections)
    || Boolean(computedDirectoryTopicCollections)
    || state.directoryTopicCollectionsReadySignature === directoryTopicSignature;
  const directoryGroupIds = directoryTopicCollectionGroupIds(rawDirectoryTopicCollections);
  const regularGroups = groups.filter((group) => {
    if (group.pluginTopic) return false;
    const hasDirectoryTopicRoute = Boolean(directoryTopicPrimaryRoute(group));
    return directoryCollectionsReady ? !directoryGroupIds.has(String(group.id || "")) : !hasDirectoryTopicRoute;
  });
  const pluginCards = pluginGroups.map((group) => ({
    id: cleanString(group.id, 160),
    pluginId: cleanString(group.pluginId, 80),
    title: cleanString(group.title || group.pluginTitle || "插件话题", 180),
    updatedAt: cleanString(group.updatedAt, 80),
  }));
  const directoryCollections = rawDirectoryTopicCollections.map((collection) => ({
    key: cleanString(collection.key, 240),
    label: cleanString(collection.label || directoryTopicRouteLabel(collection.route), 180),
    updatedAt: cleanString(collection.updatedAt, 80),
    topicCount: (collection.groups || []).length,
    defaultGroupId: cleanString(collection.defaultGroup?.id || "", 160),
    groupIds: (collection.groups || []).map((group) => cleanString(group.id, 160)).filter(Boolean),
  }));
  const visibleRegularGroups = regularGroups.map((group) => ({
    id: cleanString(group.id, 160),
    title: cleanString(group.title || group.summary || "话题", 180),
    status: cleanString(group.status || "", 80),
    updatedAt: cleanString(group.updatedAt || "", 80),
    sharedTopic: Boolean(group.sharedTopic),
    sourceThreadId: cleanString(group.sourceThreadId || "", 160),
  }));
  const renderSignature = stableHash({
    threadId,
    search,
    filter,
    pluginCards,
    directoryCollections,
    visibleRegularGroups,
  });
  return Object.freeze({
    threadId,
    search,
    filter,
    renderSignature,
    directoryTopicSignature,
    directoryCollectionsReady,
    shouldDeferDirectoryTopics: !directoryCollectionsReady && !indexedDirectoryTopicCollections && !computedDirectoryTopicCollections,
    sourceGroupCount: sourceGroups.length,
    sharedGroupCount: sharedGroups.length,
    pluginGroupCount: pluginGroups.length,
    visibleGroupCount: groups.length,
    regularGroupCount: visibleRegularGroups.length,
    directoryCollectionCount: directoryCollections.length,
    directoryTopicCount: directoryCollections.reduce((total, collection) => total + collection.topicCount, 0),
    pluginCards,
    directoryCollections,
    visibleRegularGroups,
    emptyStateText: filter ? "这个目录下还没有话题。" : DEFAULT_EMPTY_TOPIC_TEXT,
  });
}

export {
  DEFAULT_EMPTY_TOPIC_TEXT,
  buildTaskTopicShellModel,
  cleanString,
  comparableDirectoryPath,
  directoryTopicCollectionGroupIds,
  directoryTopicCollectionsForGroups,
  directoryTopicOwnerWorkspaceKey,
  directoryTopicPrimaryRoute,
  directoryTopicRenderSignature,
  directoryTopicRouteKey,
  directoryTopicRouteLabel,
  directoryTopicUpdatedValue,
  groupMatchesDirectoryFilter,
  groupMatchesSearch,
  stableHash,
  stableJson,
  taskListGroupsForThread,
  topicGroupVisibleInTaskList,
};
