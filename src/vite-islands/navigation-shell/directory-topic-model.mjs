const DIRECTORY_TOPIC_MODEL_VERSION = "20260704-directory-topic-model-v1";
const DIRECTORY_TOPIC_DEFAULT_EXPANDED_LIMIT = 1;

function text(value = "", max = 240) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 240));
}

function comparablePath(value = "") {
  return text(value, 800).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
}

function updatedValue(value = "") {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function asSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value.map((item) => text(item, 800)).filter(Boolean));
  return new Set();
}

function displayPathPartsPlan(label = "") {
  return text(label, 800).split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
}

function ownerWorkspaceKeyPlan(group = {}, route = null, options = {}) {
  return text(
    route?.workspaceId
    || route?.workspace_id
    || route?.ownerWorkspaceId
    || route?.owner_workspace_id
    || route?.actorWorkspaceId
    || route?.actor_workspace_id
    || options.ownerWorkspaceId
    || group?.ownerWorkspaceId
    || group?.workspaceId
    || group?.actorWorkspaceId
    || "",
    160,
  );
}

function routeKeyPlan(route = null, group = null, options = {}) {
  if (!route) return "";
  const root = text(options.comparableRoot, 800) || comparablePath(route.root || route.path || "");
  const routeId = text(route.projectId || route.id || "", 200);
  if (!routeId && !root) return "";
  return [
    ownerWorkspaceKeyPlan(group || {}, route, options),
    routeId,
    text(route.subprojectId || "", 200),
    root,
  ].join("|");
}

function routeLabelPlan(route = null, options = {}) {
  return text(options.displayLabel || route?.label || route?.projectLabel || route?.projectId || route?.id || route?.root || route?.path || "", 240);
}

function primaryRoutePlan(group = {}, options = {}) {
  if (!group || group.pluginTopic || group.sharedTopic || group.sourceThreadId || options.pluginTopicTaskGroup) return null;
  if (group.directoryRoute?.root || group.directoryRoute?.path) return group.directoryRoute;
  const routes = Array.isArray(options.taskDirectoryRoutes)
    ? options.taskDirectoryRoutes
    : (Array.isArray(group.directoryRoutes) ? group.directoryRoutes : []);
  return routes.find((route) => route?.projectId && (route.root || route.path)) || null;
}

function routeRootInfoPlan(collection = {}, options = {}) {
  const route = collection?.route || {};
  const ownerKey = ownerWorkspaceKeyPlan(collection?.defaultGroup || {}, route, options);
  const project = options.project && typeof options.project === "object" ? options.project : null;
  const projectId = text(route.projectId || route.id || "", 200);
  const displayLabel = text(options.displayLabel || collection?.label || routeLabelPlan(route), 240);
  const displayParts = displayPathPartsPlan(displayLabel);
  const projectLabel = text(options.projectLabel || project?.label || project?.id || "", 240);
  const rootLabel = projectLabel || displayParts[0] || displayLabel || "目录";
  const child = project && route.subprojectId
    ? (project.children || []).find((item) => text(item?.id, 200) === text(route.subprojectId, 200))
    : null;
  const childLabel = child
    ? text(child.label || child.id || "", 240)
    : (displayParts.length > 1 ? displayParts.slice(1).join(" / ") : "");
  const rootPath = project?.root || (!childLabel ? (route.root || route.path || "") : "");
  const comparableRoot = text(options.comparableRoot, 800) || comparablePath(rootPath || rootLabel);
  const rootKey = projectId
    ? [ownerKey, projectId, "", comparableRoot].join("|")
    : (childLabel ? [ownerKey, "label", rootLabel.toLowerCase()].join("|") : (collection?.key || ""));
  return Object.freeze({
    key: rootKey || collection?.key || "",
    label: rootLabel,
    childLabel,
    isChild: Boolean(childLabel || route.subprojectId),
  });
}

function updatedValueForGroup(group = {}) {
  return updatedValue(group?.updatedAt || "");
}

function collectionsForEntriesPlan(entries = []) {
  const byKey = new Map();
  for (const entry of entries || []) {
    const group = entry?.group || null;
    const route = entry?.route || null;
    const key = text(entry?.key || routeKeyPlan(route, group), 800);
    if (!group || !key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        route,
        label: text(entry?.label || routeLabelPlan(route), 240),
        groups: [],
        defaultGroup: null,
        updatedAt: "",
      });
    }
    const collection = byKey.get(key);
    collection.groups.push(group);
    if (!collection.defaultGroup || updatedValueForGroup(group) >= updatedValueForGroup(collection.defaultGroup)) {
      collection.defaultGroup = group;
      collection.updatedAt = group.updatedAt || collection.updatedAt || "";
    }
  }
  return [...byKey.values()]
    .map((collection) => Object.freeze(Object.assign(collection, {
      groups: collection.groups.slice().sort((a, b) => updatedValueForGroup(b) - updatedValueForGroup(a)),
    })))
    .sort((a, b) => updatedValueForGroup(b.defaultGroup) - updatedValueForGroup(a.defaultGroup));
}

function collectionGroupIdsPlan(collections = []) {
  const ids = new Set();
  for (const collection of collections || []) {
    for (const group of collection.groups || []) {
      if (group?.id) ids.add(String(group.id));
    }
  }
  return ids;
}

function rootBucketsForCollectionsPlan(collections = []) {
  const buckets = new Map();
  for (const collection of collections || []) {
    if (!collection?.defaultGroup || !collection.groups?.length) continue;
    const root = collection.rootInfo || routeRootInfoPlan(collection);
    const key = root.key || collection.key || "";
    if (!key) continue;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: root.label || collection.label || "目录",
        collections: [],
        topicCount: 0,
        defaultGroup: null,
        updatedAt: "",
      });
    }
    const bucket = buckets.get(key);
    const topics = collection.groups || [];
    bucket.collections.push(Object.assign({}, collection, { rootInfo: root }));
    bucket.topicCount += topics.length;
    if (!bucket.defaultGroup || updatedValueForGroup(collection.defaultGroup) >= updatedValueForGroup(bucket.defaultGroup)) {
      bucket.defaultGroup = collection.defaultGroup;
      bucket.updatedAt = collection.updatedAt || bucket.updatedAt || "";
    }
  }
  return [...buckets.values()]
    .map((bucket) => Object.assign(bucket, {
      collections: bucket.collections.slice().sort((a, b) => {
        const aRoot = a.rootInfo || {};
        const bRoot = b.rootInfo || {};
        if (aRoot.isChild !== bRoot.isChild) return aRoot.isChild ? 1 : -1;
        return String(aRoot.childLabel || a.label || "").localeCompare(String(bRoot.childLabel || b.label || ""), "zh-Hans-CN");
      }),
    }))
    .sort((a, b) => updatedValueForGroup(b.defaultGroup) - updatedValueForGroup(a.defaultGroup));
}

function displayPartsPlan(group = {}, options = {}) {
  const baseTitle = text(group?.title || "", 240);
  const receiptTitle = text(options.receiptTitle || group?.lastReceiptTitle || "", 240);
  const title = baseTitle || receiptTitle || "暂无回执概要";
  const summary = baseTitle && receiptTitle && receiptTitle !== baseTitle ? receiptTitle : "";
  return Object.freeze({
    title,
    summary,
    fullTitle: summary ? `${title}｜${summary}` : title,
  });
}

function collapsedByDefaultPlan(index, defaultExpandedLimit = DIRECTORY_TOPIC_DEFAULT_EXPANDED_LIMIT) {
  return Number(index || 0) >= Math.max(0, Number(defaultExpandedLimit) || 0);
}

function isCollapsedPlan(input = {}) {
  const key = text(input.key || input.collection?.key || "", 800);
  if (!key) return true;
  const collapsedDirectories = asSet(input.collapsedDirectories);
  const expandedDirectories = asSet(input.expandedDirectories);
  if (collapsedDirectories.has(key)) return true;
  if (expandedDirectories.has(key)) return false;
  return collapsedByDefaultPlan(input.index, input.defaultExpandedLimit);
}

function storageSetMutationPlan(input = {}) {
  const key = text(input.key, 800);
  const collapsedDirectories = asSet(input.collapsedDirectories);
  const expandedDirectories = asSet(input.expandedDirectories);
  if (!key) return Object.freeze({ collapsedDirectories, expandedDirectories });
  if (input.collapsed) {
    collapsedDirectories.add(key);
    expandedDirectories.delete(key);
  } else {
    collapsedDirectories.delete(key);
    expandedDirectories.add(key);
  }
  return Object.freeze({ collapsedDirectories, expandedDirectories });
}

export {
  DIRECTORY_TOPIC_DEFAULT_EXPANDED_LIMIT,
  DIRECTORY_TOPIC_MODEL_VERSION,
  collectionGroupIdsPlan,
  collectionsForEntriesPlan,
  comparablePath,
  collapsedByDefaultPlan,
  displayPartsPlan,
  displayPathPartsPlan,
  isCollapsedPlan,
  ownerWorkspaceKeyPlan,
  primaryRoutePlan,
  rootBucketsForCollectionsPlan,
  routeKeyPlan,
  routeLabelPlan,
  routeRootInfoPlan,
  storageSetMutationPlan,
  text,
  updatedValueForGroup,
};
