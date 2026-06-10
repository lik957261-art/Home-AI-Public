"use strict";

function messageDirectoryAliases(message) {
  const aliases = [];
  if (Array.isArray(message?.directoryAliases)) aliases.push(...message.directoryAliases);
  if (message?.directoryRoute) aliases.push(message.directoryRoute);
  return aliases
    .map((item) => ({
      label: item?.label || item?.name || "",
      path: item?.path || item?.root || "",
      projectId: item?.projectId || "",
      subprojectId: item?.subprojectId || "",
      source: "bound",
    }))
    .filter((item) => item.label || item.path);
}

function extractedTaskDirectoryAliases(group) {
  const aliases = [];
  for (const message of group?.messages || []) {
    aliases.push(...messageExtractedDirectoryAliases(message));
  }
  return aliases;
}

function messageExtractedDirectoryAliases(message) {
  const aliases = [];
  const extracted = extractDirectoryAliases(message?.content || "");
  for (const alias of extracted.aliases || []) {
    aliases.push(Object.assign({ messageId: message?.id || "", source: "extracted" }, alias));
  }
  aliases.push(...extractMediaDirectoryAliases(message?.content || "", message?.id || ""));
  return aliases;
}

function explicitTaskDirectoryAliases(group) {
  const aliases = [];
  if (group?.directoryRoute) aliases.push(Object.assign({ source: "bound" }, group.directoryRoute));
  for (const message of group?.messages || []) {
    aliases.push(...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)));
  }
  return aliases;
}

function uniqueAliases(aliases) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  return [...unique.values()];
}

function directoryAliasItemKey(item) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return route.projectId
    ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
    : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
}

function aliasFromDirectoryItem(item, extra = {}) {
  const route = item?.route || {};
  const displayAlias = item?.displayAlias || {};
  return Object.assign({}, displayAlias, {
    projectId: route.projectId || displayAlias.projectId || "",
    subprojectId: route.subprojectId || displayAlias.subprojectId || "",
    path: displayAlias.path || route.root || "",
  }, extra);
}

function isDeliveryDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
  const projectId = String(route?.projectId || alias?.projectId || "");
  return Boolean(
    alias?.referenceKind === "delivery"
    || projectId === "hermes-sync-folder"
    || pathValue.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939")
    || label.includes("\u4e3b\u4ea4\u4ed8")
    || label.includes("\u540c\u6b65\u6839")
    || label.includes("\u9644\u52a0\u4efb\u52a1\u76ee\u5f55")
    || /sync(root|directory|folder)/i.test(label)
  );
}

function isTaskBindingDirectoryItem(item) {
  return Boolean(
    item?.route
    && !isDeliveryDirectoryAlias(item.displayAlias, item.route)
    && !isGenericDefaultDirectoryAlias(item.displayAlias)
    && !isOperationalTaskDirectoryAlias(item.displayAlias, item.route)
  );
}

function usableTaskBindingAliases(aliases) {
  return (aliases || []).filter((alias) => (
    alias
    && !alias.referenceKind
    && !isDeliveryDirectoryAlias(alias)
    && !isGenericDefaultDirectoryAlias(alias)
    && !isOperationalTaskDirectoryAlias(alias)
  ));
}

function selectTaskBindingAlias(candidates, context) {
  const items = directoryAliasItemsForAliases(candidates, context, { includeGenericDefault: false });
  const bindingItems = items.filter(isTaskBindingDirectoryItem);
  const primary = bindingItems.find((item) => isContextAnchorDirectoryRoute(item.route)) || bindingItems[0] || null;
  if (primary) return aliasFromDirectoryItem(primary, { source: "bound" });
  const fallback = usableTaskBindingAliases(candidates).find((alias) => alias.label || alias.path);
  return fallback ? Object.assign({}, fallback, { source: "bound" }) : null;
}

function taskPrimaryDirectoryAlias(group) {
  const context = taskDirectoryContext(group);
  for (const message of group?.messages || []) {
    const candidates = usableTaskBindingAliases([
      ...messageDirectoryAliases(message).map((alias) => Object.assign({ messageId: message.id }, alias)),
      ...messageExtractedDirectoryAliases(message),
    ]);
    const primary = selectTaskBindingAlias(candidates, context);
    if (primary) return primary;
  }
  const candidates = [
    ...explicitTaskDirectoryAliases(group),
    ...usableTaskBindingAliases(extractedTaskDirectoryAliases(group)),
  ];
  return selectTaskBindingAlias(candidates, context);
}

function taskDirectoryAliases(group) {
  const primary = taskPrimaryDirectoryAlias(group);
  return primary ? [primary] : [];
}

function taskReferenceDirectoryAliases(group) {
  const context = taskDirectoryContext(group);
  const primaryKeys = new Set(directoryAliasItemsForAliases(taskDirectoryAliases(group), context, { includeGenericDefault: false }).map(directoryAliasItemKey));
  const referenceAliases = extractedTaskDirectoryAliases(group)
    .filter((alias) => alias.referenceKind || isDeliveryDirectoryAlias(alias));
  const referenceItems = directoryAliasItemsForAliases(referenceAliases, context, { coalesce: false });
  return uniqueAliases(referenceItems
    .filter((item) => !primaryKeys.has(directoryAliasItemKey(item)))
    .map((item) => aliasFromDirectoryItem(item, { source: "reference", referenceKind: item.displayAlias?.referenceKind || "reference" })));
}

function directoryAliasItemsForAliases(aliases, context = null, options = {}) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const key = `${alias.label || ""}|${alias.path || ""}|${alias.source || ""}|${alias.referenceKind || ""}`;
    if ((alias.label || alias.path) && !unique.has(key)) unique.set(key, alias);
  }
  const items = [...unique.values()].map((alias) => {
    const genericDefault = isGenericDefaultDirectoryAlias(alias);
    const genericCurrentBound = isGenericCurrentBoundDirectoryAlias(alias);
    if (genericDefault && options.includeGenericDefault === false) return null;
    const boundRoute = genericCurrentBound ? explicitDirectoryRouteForContext(context) : null;
    if (genericCurrentBound && !boundRoute) return null;
    const semanticRoute = genericDefault ? semanticDirectoryRouteForMessage(context) : null;
    if (genericDefault && !semanticRoute) return null;
    const contextRoute = boundRoute || semanticRoute;
    const displayAlias = Object.assign({}, alias, contextRoute ? { label: contextRoute.label, path: contextRoute.root } : null);
    const route = contextRoute || resolveDirectoryProjectRoute(displayAlias);
    return { displayAlias, route };
  }).filter(Boolean);
  return uniqueDirectoryAliasItems(options.coalesce === false ? items : coalesceDirectoryAliasItems(items));
}

function directoryRoutesForAliases(aliases, context = null) {
  return directoryAliasItemsForAliases(aliases, context).filter((item) => item.route);
}

function taskDirectoryRoutes(group) {
  return directoryRoutesForAliases(taskDirectoryAliases(group), taskDirectoryContext(group)).map((item) => item.route);
}

function taskDirectoryRouteMatchesFilter(route, filter = state.taskDirectoryFilter) {
  if (!filter || !route) return true;
  if (String(route.projectId || "") !== String(filter.projectId || "")) return false;
  if (!filter.subprojectId) return true;
  return String(route.subprojectId || "") === String(filter.subprojectId || "");
}

function taskMatchesDirectoryFilter(group) {
  if (!state.taskDirectoryFilter) return true;
  return taskDirectoryRoutes(group).some((route) => taskDirectoryRouteMatchesFilter(route));
}

function taskDirectoryFilterLabel(filter = state.taskDirectoryFilter) {
  if (!filter) return "";
  if (filter.label) return filter.label;
  const project = state.projects.find((item) => item.id === filter.projectId);
  const subproject = (project?.children || []).find((item) => item.id === filter.subprojectId);
  if (project && subproject) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: subproject.id, label: projectDisplayLabel(project), root: subproject.root || project.root },
      `${projectDisplayLabel(project)} / ${subproject.label || subproject.id}`
    );
  }
  if (project) {
    return directoryRouteDisplayPath(
      { projectId: project.id, subprojectId: "", label: projectDisplayLabel(project), root: project.root },
      projectDisplayLabel(project)
    );
  }
  return filter.projectId || "";
}

function setTaskDirectoryFilter(projectId, subprojectId = "", label = "") {
  if (!projectId) return;
  const attachment = directoryAttachmentFromRoute(projectId, subprojectId || "", "", label || "");
  state.taskDirectoryFilter = { projectId, subprojectId: subprojectId || "", label: label || "", directory: attachment };
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  closeTopMoreMenu();
  if (isMobileLayout()) closeSidebar();
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

function clearTaskDirectoryFilter(options = {}) {
  state.taskDirectoryFilter = null;
  state.pendingTaskDirectory = null;
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  closeTopMoreMenu();
  if (options.render !== false) {
    renderThreads();
    renderCurrentThread({ stickToBottom: true });
  }
}

function renderTaskDirectoryFilterBanner() {
  if (!state.taskDirectoryFilter) return "";
  return `<div class="task-filter-banner">
    <span class="task-filter-label">资料目录：${escapeHtml(taskDirectoryFilterLabel())}</span>
    <span class="task-filter-actions">
      <button type="button" data-clear-task-directory-filter>清除</button>
    </span>
  </div>`;
}

function wireTaskDirectoryFilterControls(root) {
  root?.querySelectorAll?.("[data-task-reasoning-effort]").forEach((select) => {
    if (select.dataset.boundTaskReasoningEffort) return;
    select.dataset.boundTaskReasoningEffort = "1";
    select.addEventListener("change", () => {
      state.pendingTaskReasoningEffort = select.value || "";
    });
  });
  root?.querySelectorAll?.("[data-clear-task-directory-filter]").forEach((button) => {
    if (button.dataset.boundClearTaskDirectoryFilter) return;
    button.dataset.boundClearTaskDirectoryFilter = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTaskDirectoryFilter();
    });
  });
}

function taskDirectoryContext(group) {
  return {
    taskGroupId: group?.id || "",
    content: (group?.messages || []).map((message) => message.content || "").join("\n"),
  };
}

function renderTaskDirectoryBadges(group, options = {}) {
  const context = taskDirectoryContext(group);
  const rendered = renderDirectoryAliases(taskDirectoryAliases(group), context);
  if (!rendered && options.empty) {
    return `<div class="task-card-directories task-card-directories-empty"><span>未绑定目录</span></div>`;
  }
  if (!rendered) return "";
  return `<div class="task-card-directories${options.compact ? " compact" : ""}">${rendered}</div>`;
}

function renderTaskDetailToolbar(group) {
  const toolbar = $("taskDetailToolbar");
  if (!toolbar) return;
  const sharedTopic = Boolean(group?.sharedTopic);
  const context = Object.assign({ toolbar: true }, taskDirectoryContext(group));
  const aliasButtons = renderDirectoryAliases(taskDirectoryAliases(group), context);
  const pluginTopicSwitcher = typeof renderPluginTopicSwitcher === "function" ? renderPluginTopicSwitcher(group) : "";
  toolbar.innerHTML = `
    ${pluginTopicSwitcher}
    <div class="task-toolbar-meta">
      <div class="task-toolbar-directories">${aliasButtons || ""}</div>
    </div>
    ${sharedTopic ? "" : `<div class="task-more-wrap">
      <button class="task-more-button" type="button" data-task-more aria-label="Topic menu" aria-expanded="false">...</button>
      <div class="task-more-menu" hidden>
        <button class="task-more-delete" type="button" data-rename-current-task>改名</button>
        <button class="task-more-delete" type="button" data-delete-current-task>删除</button>
      </div>
    </div>`}
  `;
  const moreButton = toolbar.querySelector("[data-task-more]");
  const moreMenu = toolbar.querySelector(".task-more-menu");
  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = Boolean(moreMenu?.hidden);
    if (moreMenu) moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  moreMenu?.addEventListener("click", (event) => event.stopPropagation());
  toolbar.querySelector("[data-rename-current-task]")?.addEventListener("click", () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
    renameTaskGroup(group.id).catch(showError);
  });
  toolbar.querySelector("[data-delete-current-task]")?.addEventListener("click", () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute("aria-expanded", "false");
    deleteTaskGroup(group.id).catch(showError);
  });
  if (typeof wirePluginTopicSwitcher === "function") wirePluginTopicSwitcher(toolbar);
  wireDirectoryProjectLinks(toolbar);
}
