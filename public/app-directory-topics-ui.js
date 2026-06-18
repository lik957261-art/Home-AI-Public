"use strict";

function directoryTopicOwnerWorkspaceKey(group, route = null) {
  return String(
    route?.workspaceId
    || route?.workspace_id
    || route?.ownerWorkspaceId
    || route?.owner_workspace_id
    || route?.actorWorkspaceId
    || route?.actor_workspace_id
    || (typeof taskGroupOwnerWorkspaceId === "function" ? taskGroupOwnerWorkspaceId(group) : "")
    || "",
  ).trim();
}

function directoryTopicRouteKey(route, group = null) {
  if (!route) return "";
  const root = typeof comparableDirectoryPath === "function"
    ? comparableDirectoryPath(route.root || route.path || "")
    : String(route.root || route.path || "").trim().replaceAll("\\", "/").toLowerCase();
  const routeId = String(route.projectId || route.id || "").trim();
  if (!routeId && !root) return "";
  return [directoryTopicOwnerWorkspaceKey(group, route), routeId, route.subprojectId || "", root].join("|");
}

function directoryTopicRouteLabel(route) {
  if (typeof directoryRouteDisplayPath === "function") {
    return directoryRouteDisplayPath(route, route?.label || route?.projectId || "");
  }
  return route?.label || route?.projectId || "";
}

function directoryTopicPrimaryRoute(group) {
  if (!group || group.pluginTopic || group.sharedTopic || group.sourceThreadId) return null;
  if (typeof isPluginTopicTaskGroup === "function" && isPluginTopicTaskGroup(group)) return null;
  if (group.directoryRoute?.root || group.directoryRoute?.path) return group.directoryRoute;
  const routes = typeof taskDirectoryRoutes === "function" ? taskDirectoryRoutes(group) : [];
  return routes.find((route) => route?.projectId && (route.root || route.path)) || null;
}

function directoryTopicUpdatedValue(group) {
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
    .map((collection) => Object.assign(collection, {
      groups: collection.groups.sort((a, b) => directoryTopicUpdatedValue(b) - directoryTopicUpdatedValue(a)),
    }))
    .sort((a, b) => directoryTopicUpdatedValue(b.defaultGroup) - directoryTopicUpdatedValue(a.defaultGroup));
}

function directoryTopicCollectionGroupIds(collections = []) {
  const ids = new Set();
  for (const collection of collections || []) {
    for (const group of collection.groups || []) {
      if (group?.id) ids.add(group.id);
    }
  }
  return ids;
}

function directoryTopicDisplayParts(group) {
  const baseTitle = String(group?.title || "").trim();
  const receiptTitle = typeof topicReceiptSummaryTitleFromGroup === "function"
    ? topicReceiptSummaryTitleFromGroup(group, { max: 120 })
    : "";
  const title = baseTitle || receiptTitle || "\u6682\u65e0\u56de\u6267\u6982\u8981";
  const summary = baseTitle && receiptTitle && receiptTitle !== baseTitle ? receiptTitle : "";
  return {
    title,
    summary,
    fullTitle: summary ? `${title}\uFF5C${summary}` : title,
  };
}

function directoryTopicDisplayTitle(group) {
  return directoryTopicDisplayParts(group).fullTitle;
}

const DIRECTORY_TOPIC_COLLAPSED_STORAGE_KEY = "hermesDirectoryTopicCollapsed";
const DIRECTORY_TOPIC_EXPANDED_STORAGE_KEY = "hermesDirectoryTopicExpanded";
const DIRECTORY_TOPIC_ROOT_COLLAPSED_STORAGE_KEY = "hermesDirectoryTopicRootCollapsed";
const DIRECTORY_TOPIC_DEFAULT_EXPANDED_LIMIT = 3;

function readDirectoryTopicStorageSet(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const values = JSON.parse(raw || "[]");
    return new Set(Array.isArray(values) ? values.map((value) => String(value || "")) : []);
  } catch (_) {
    return new Set();
  }
}

function readCollapsedDirectoryTopics() {
  return readDirectoryTopicStorageSet(DIRECTORY_TOPIC_COLLAPSED_STORAGE_KEY);
}

function readExpandedDirectoryTopics() {
  return readDirectoryTopicStorageSet(DIRECTORY_TOPIC_EXPANDED_STORAGE_KEY);
}

function writeDirectoryTopicStorageSet(storageKey, values) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...values].filter(Boolean)));
  } catch (_) {}
}

function writeCollapsedDirectoryTopics(collapsed) {
  writeDirectoryTopicStorageSet(DIRECTORY_TOPIC_COLLAPSED_STORAGE_KEY, collapsed);
}

function writeExpandedDirectoryTopics(expanded) {
  writeDirectoryTopicStorageSet(DIRECTORY_TOPIC_EXPANDED_STORAGE_KEY, expanded);
}

function directoryTopicStorageWorkspaceId() {
  return String(
    (typeof state !== "undefined" && (state.selectedWorkspaceId || state.auth?.workspaceId))
    || "owner",
  ).trim() || "owner";
}

function directoryTopicRootCollapsedStorageKey(workspaceId = directoryTopicStorageWorkspaceId()) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return `${DIRECTORY_TOPIC_ROOT_COLLAPSED_STORAGE_KEY}:${id}`;
}

function readDirectoryTopicRootCollapsed(workspaceId = directoryTopicStorageWorkspaceId()) {
  try {
    return localStorage.getItem(directoryTopicRootCollapsedStorageKey(workspaceId)) === "1";
  } catch (_) {
    return false;
  }
}

function setDirectoryTopicRootCollapsed(collapsed, workspaceId = directoryTopicStorageWorkspaceId()) {
  try {
    localStorage.setItem(directoryTopicRootCollapsedStorageKey(workspaceId), collapsed ? "1" : "0");
  } catch (_) {}
}

function directoryTopicCollapsedByDefault(index) {
  return index >= DIRECTORY_TOPIC_DEFAULT_EXPANDED_LIMIT;
}

function directoryTopicIsCollapsed(collection, index, collapsedDirectories, expandedDirectories) {
  const key = collection?.key || "";
  if (!key) return true;
  if (collapsedDirectories.has(key)) return true;
  if (expandedDirectories.has(key)) return false;
  return directoryTopicCollapsedByDefault(index);
}

function setDirectoryTopicCollapsed(key, collapsed) {
  if (!key) return;
  const collapsedDirectories = readCollapsedDirectoryTopics();
  const expandedDirectories = readExpandedDirectoryTopics();
  if (collapsed) {
    collapsedDirectories.add(key);
    expandedDirectories.delete(key);
  } else {
    collapsedDirectories.delete(key);
    expandedDirectories.add(key);
  }
  writeCollapsedDirectoryTopics(collapsedDirectories);
  writeExpandedDirectoryTopics(expandedDirectories);
}

function renderDirectoryTopicCards(collections = [], options = {}) {
  const visible = (collections || []).filter((collection) => collection?.defaultGroup && collection.groups?.length);
  const associated = options.associatedWithDirectoryPlugin === true;
  const collapsedDirectories = readCollapsedDirectoryTopics();
  const expandedDirectories = readExpandedDirectoryTopics();
  const rootCollapsed = readDirectoryTopicRootCollapsed();
  const topicCount = visible.reduce((total, collection) => total + (collection.groups?.length || 0), 0);
  const rootToggleAttrs = `data-directory-topic-root-toggle aria-expanded="${rootCollapsed ? "false" : "true"}" aria-label="${rootCollapsed ? "\u5c55\u5f00\u76ee\u5f55\u7ed1\u5b9a\u8bdd\u9898" : "\u6536\u8d77\u76ee\u5f55\u7ed1\u5b9a\u8bdd\u9898"}"`;
  return `<section class="directory-topic-launcher${associated ? " directory-topic-associated" : ""}${rootCollapsed ? " root-collapsed" : ""}" aria-label="\u76ee\u5f55\u8bdd\u9898">
    <div class="directory-topic-root-entry">
      <button class="directory-topic-root-icon-entry" type="button" data-directory-topic-open-root aria-label="\u6253\u5f00\u76ee\u5f55">
        <span class="plugin-topic-app-icon directory directory-topic-root-icon" data-plugin-icon="" aria-hidden="true"></span>
      </button>
      <button class="directory-topic-root-toggle" type="button" ${rootToggleAttrs}>
        <span class="directory-topic-text">
          <span class="directory-topic-title">\u76ee\u5f55</span>
          <span class="directory-topic-meta">${escapeHtml(`${visible.length} \u4e2a\u5b50\u76ee\u5f55\u3000${topicCount} \u4e2a\u8bdd\u9898`)}</span>
        </span>
      </button>
      <button class="directory-topic-root-chevron-button" type="button" ${rootToggleAttrs}>
        <span class="directory-topic-root-chevron directory-topic-chevron" aria-hidden="true"></span>
      </button>
    </div>
    <div class="directory-topic-grid">
      ${visible.map((collection, index) => {
        const defaultGroup = collection.defaultGroup;
        const topics = collection.groups || [];
        const collapsed = directoryTopicIsCollapsed(collection, index, collapsedDirectories, expandedDirectories);
        return `<article class="directory-topic-card${collapsed ? " collapsed" : ""}" data-directory-topic-card="${escapeHtml(collection.key)}">
          <div class="directory-topic-card-main-row">
            <button class="directory-topic-card-main directory-topic-directory-main" type="button" data-directory-topic-toggle="${escapeHtml(collection.key)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${escapeHtml(`${collapsed ? "\u5c55\u5f00" : "\u6536\u8d77"}${collection.label}\u8bdd\u9898`)}">
            <span class="directory-topic-chevron" aria-hidden="true"></span>
            <span class="directory-topic-text">
              <span class="directory-topic-title">${escapeHtml(collection.label || "\u76ee\u5f55")}</span>
              <span class="directory-topic-meta">${escapeHtml(`${topics.length} \u4e2a\u8bdd\u9898\u3000${formatTime(collection.updatedAt)}`)}</span>
            </span>
            </button>
          </div>
          <div class="directory-topic-bound-list" aria-label="${escapeHtml(`${collection.label}\u7684\u8bdd\u9898`)}">
            ${topics.map((group) => {
              const display = directoryTopicDisplayParts(group);
              const copyClass = `directory-topic-chip-copy${display.summary ? " has-summary" : ""}`;
              const summaryHtml = display.summary
                ? `<span class="directory-topic-chip-divider" aria-hidden="true">\uFF5C</span><span class="directory-topic-chip-summary">${escapeHtml(display.summary)}</span>`
                : "";
              return `<button class="directory-topic-chip${group.id === defaultGroup.id ? " default" : ""}" type="button" data-directory-topic-open-topic="${escapeHtml(group.id)}" title="${escapeHtml(display.fullTitle || display.title || "")}">
                <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
                <span class="${copyClass}">
                  <span class="directory-topic-chip-title">${escapeHtml(display.title || "\u8bdd\u9898")}</span>${summaryHtml}
                </span>
              </button>`;
            }).join("")}
          </div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function wireDirectoryTopicCards(root) {
  root?.querySelectorAll?.("[data-directory-topic-open-root]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicRoot) return;
    button.dataset.boundDirectoryTopicRoot = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof openBuiltInDirectoryPlugin === "function") openBuiltInDirectoryPlugin().catch(showError);
      else if (typeof openPluginTopicApp === "function") openPluginTopicApp("directory").catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-directory-topic-root-toggle]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicRootToggle) return;
    button.dataset.boundDirectoryTopicRootToggle = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const launcher = button.closest?.(".directory-topic-launcher");
      const nextCollapsed = !launcher?.classList.contains("root-collapsed");
      setDirectoryTopicRootCollapsed(nextCollapsed);
      launcher?.classList.toggle("root-collapsed", nextCollapsed);
      launcher?.querySelectorAll?.("[data-directory-topic-root-toggle]").forEach((toggle) => {
        toggle.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
        toggle.setAttribute("aria-label", nextCollapsed ? "\u5c55\u5f00\u76ee\u5f55\u7ed1\u5b9a\u8bdd\u9898" : "\u6536\u8d77\u76ee\u5f55\u7ed1\u5b9a\u8bdd\u9898");
      });
    });
  });
  root?.querySelectorAll?.("[data-directory-topic-toggle]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicToggle) return;
    button.dataset.boundDirectoryTopicToggle = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.directoryTopicToggle || "";
      if (!key) return;
      const card = button.closest?.("[data-directory-topic-card]");
      const isCollapsed = !card?.classList.contains("collapsed");
      setDirectoryTopicCollapsed(key, isCollapsed);
      card?.classList.toggle("collapsed", isCollapsed);
      button.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  });
  root?.querySelectorAll?.("[data-directory-topic-open-default]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicDefault) return;
    button.dataset.boundDirectoryTopicDefault = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTaskGroupFromList(button.dataset.directoryTopicOpenDefault);
    });
  });
  root?.querySelectorAll?.("[data-directory-topic-open-topic]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicOpen) return;
    button.dataset.boundDirectoryTopicOpen = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTaskGroupFromList(button.dataset.directoryTopicOpenTopic);
    });
  });
  root?.querySelectorAll?.("[data-directory-topic-open-directory]").forEach((button) => {
    if (button.dataset.boundDirectoryTopicDirectory) return;
    button.dataset.boundDirectoryTopicDirectory = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryProjectRoute(
        button.dataset.projectId,
        button.dataset.subprojectId || "",
        button.dataset.directoryPath || ""
      ).catch(showError);
    });
  });
}
