"use strict";

function directoryTopicRouteKey(route) {
  if (!route?.projectId) return "";
  const root = typeof comparableDirectoryPath === "function"
    ? comparableDirectoryPath(route.root || route.path || "")
    : String(route.root || route.path || "").trim().replaceAll("\\", "/").toLowerCase();
  return [route.projectId, route.subprojectId || "", root].join("|");
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
    const key = directoryTopicRouteKey(route);
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

function renderDirectoryTopicCards(collections = [], options = {}) {
  const visible = (collections || []).filter((collection) => collection?.defaultGroup && collection.groups?.length);
  if (!visible.length) return "";
  const associated = options.associatedWithDirectoryPlugin === true;
  return `<section class="directory-topic-launcher${associated ? " directory-topic-associated" : ""}" aria-label="\u76ee\u5f55\u8bdd\u9898">
    ${associated ? `<div class="directory-topic-association-label" aria-hidden="true">
      <span class="directory-topic-association-icon"></span>
      <span>\u76ee\u5f55\u7ed1\u5b9a\u8bdd\u9898</span>
    </div>` : ""}
    <div class="directory-topic-grid">
      ${visible.map((collection) => {
        const defaultGroup = collection.defaultGroup;
        const topics = collection.groups || [];
        const route = collection.route || {};
        const path = route.path || route.root || "";
        const defaultTitle = directoryTopicDisplayTitle(defaultGroup);
        return `<article class="directory-topic-card" data-directory-topic-card="${escapeHtml(collection.key)}">
          <div class="directory-topic-card-main-row">
            <button class="directory-topic-card-main" type="button" data-directory-topic-open-default="${escapeHtml(defaultGroup.id)}" aria-label="${escapeHtml(`\u6253\u5f00${collection.label}\u7684\u9ed8\u8ba4\u8bdd\u9898`)}">
            <span class="directory-topic-topic-icon" aria-hidden="true"></span>
            <span class="directory-topic-text">
              <span class="directory-topic-title">${escapeHtml(collection.label || "\u76ee\u5f55")}</span>
              <span class="directory-topic-subtitle">${escapeHtml(defaultTitle || "\u9ed8\u8ba4\u8bdd\u9898")}</span>
              <span class="directory-topic-meta">${escapeHtml(`${topics.length} \u4e2a\u8bdd\u9898\u3000${formatTime(collection.updatedAt)}`)}</span>
            </span>
            </button>
            <div class="directory-topic-actions" aria-label="${escapeHtml(`${collection.label}\u5feb\u6377\u64cd\u4f5c`)}">
            <button class="directory-topic-action" type="button" data-directory-topic-open-directory data-project-id="${escapeHtml(route.projectId || "")}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(path)}" aria-label="${escapeHtml(`\u6253\u5f00${collection.label}\u76ee\u5f55`)}" title="\u76ee\u5f55">
              <span class="plugin-topic-action-icon folder" aria-hidden="true"></span>
            </button>
            </div>
          </div>
          ${topics.length > 1 ? `<div class="directory-topic-bound-list" aria-label="${escapeHtml(`${collection.label}\u7684\u8bdd\u9898`)}">
            ${topics.slice(0, 4).map((group) => {
              const title = directoryTopicDisplayTitle(group);
              const fullTitle = typeof taskTitle === "function" ? taskTitle(group) : title;
              return `<button class="directory-topic-chip${group.id === defaultGroup.id ? " default" : ""}" type="button" data-directory-topic-open-topic="${escapeHtml(group.id)}" title="${escapeHtml(fullTitle || title || "")}">
                <span class="plugin-topic-action-icon chat" aria-hidden="true"></span>
                <span class="directory-topic-chip-title">${escapeHtml(title || "\u8bdd\u9898")}</span>
                ${group.id === defaultGroup.id ? `<span class="directory-topic-chip-badge">\u9ed8\u8ba4</span>` : ""}
              </button>`;
            }).join("")}
          </div>` : ""}
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function wireDirectoryTopicCards(root) {
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
