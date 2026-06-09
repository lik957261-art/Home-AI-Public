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
  if (!route?.projectId) return "";
  const root = typeof comparableDirectoryPath === "function"
    ? comparableDirectoryPath(route.root || route.path || "")
    : String(route.root || route.path || "").trim().replaceAll("\\", "/").toLowerCase();
  return [directoryTopicOwnerWorkspaceKey(group, route), route.projectId, route.subprojectId || "", root].join("|");
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
  if (group.directoryRoute?.projectId && (group.directoryRoute.root || group.directoryRoute.path)) return group.directoryRoute;
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

function directoryTopicDisplayTitle(group) {
  const title = typeof taskShortTitle === "function" ? taskShortTitle(group) : "";
  return title || (typeof taskTitle === "function" ? taskTitle(group) : "") || "\u8bdd\u9898";
}

const DIRECTORY_TOPIC_COLLAPSED_STORAGE_KEY = "hermesDirectoryTopicCollapsed";
const DIRECTORY_TOPIC_EXPANDED_STORAGE_KEY = "hermesDirectoryTopicExpanded";
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
  if (!visible.length) return "";
  const associated = options.associatedWithDirectoryPlugin === true;
  const collapsedDirectories = readCollapsedDirectoryTopics();
  const expandedDirectories = readExpandedDirectoryTopics();
  return `<section class="directory-topic-launcher${associated ? " directory-topic-associated" : ""}" aria-label="\u76ee\u5f55\u8bdd\u9898">
    <div class="directory-topic-grid">
      ${visible.map((collection, index) => {
        const defaultGroup = collection.defaultGroup;
        const topics = collection.groups || [];
        const collapsed = directoryTopicIsCollapsed(collection, index, collapsedDirectories, expandedDirectories);
        return `<article class="directory-topic-card${collapsed ? " collapsed" : ""}" data-directory-topic-card="${escapeHtml(collection.key)}">
          <div class="directory-topic-card-main-row">
            <button class="directory-topic-card-main directory-topic-directory-main" type="button" data-directory-topic-toggle="${escapeHtml(collection.key)}" aria-expanded="${collapsed ? "false" : "true"}" aria-label="${escapeHtml(`${collapsed ? "\u5c55\u5f00" : "\u6536\u8d77"}${collection.label}\u8bdd\u9898`)}">
            <span class="directory-topic-chevron" aria-hidden="true"></span>
            <span class="plugin-topic-app-icon directory directory-topic-folder-icon" data-plugin-icon="" aria-hidden="true"></span>
            <span class="directory-topic-text">
              <span class="directory-topic-title">${escapeHtml(collection.label || "\u76ee\u5f55")}</span>
              <span class="directory-topic-meta">${escapeHtml(`${topics.length} \u4e2a\u8bdd\u9898\u3000${formatTime(collection.updatedAt)}`)}</span>
            </span>
            </button>
          </div>
          <div class="directory-topic-bound-list" aria-label="${escapeHtml(`${collection.label}\u7684\u8bdd\u9898`)}">
            ${topics.map((group) => {
              const title = directoryTopicDisplayTitle(group);
              const fullTitle = typeof taskTitle === "function" ? taskTitle(group) : title;
              return `<button class="directory-topic-chip${group.id === defaultGroup.id ? " default" : ""}" type="button" data-directory-topic-open-topic="${escapeHtml(group.id)}" title="${escapeHtml(fullTitle || title || "")}">
                <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
                <span class="directory-topic-chip-title">${escapeHtml(title || "\u8bdd\u9898")}</span>
              </button>`;
            }).join("")}
          </div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function wireDirectoryTopicCards(root) {
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
