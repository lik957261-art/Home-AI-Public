const THREAD_DIRECTORY_MODEL_VERSION = "20260705-vite-thread-directory-model-v1";

function cleanString(value, max = 1000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 1000));
}

function normalizeAlias(alias = {}, extra = {}) {
  const normalized = Object.assign({
    label: cleanString(alias.label || alias.name, 400),
    path: cleanString(alias.path || alias.root, 2000),
    projectId: cleanString(alias.projectId, 240),
    subprojectId: cleanString(alias.subprojectId, 240),
  }, extra);
  return normalized.label || normalized.path ? Object.freeze(normalized) : null;
}

function aliasKey(alias = {}) {
  return [
    cleanString(alias.label, 400),
    cleanString(alias.path, 2000),
    cleanString(alias.source, 80),
    cleanString(alias.referenceKind, 80),
  ].join("|");
}

function uniqueAliasesPlan(aliases = []) {
  const unique = new Map();
  for (const alias of aliases || []) {
    const extra = {};
    const source = cleanString(alias?.source, 80);
    const referenceKind = cleanString(alias?.referenceKind, 80);
    const messageId = cleanString(alias?.messageId, 240);
    if (source) extra.source = source;
    if (referenceKind) extra.referenceKind = referenceKind;
    if (messageId) extra.messageId = messageId;
    const normalized = normalizeAlias(alias, extra);
    if (!normalized) continue;
    const key = aliasKey(normalized);
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    aliases: Object.freeze([...unique.values()]),
  });
}

function messageDirectoryAliasesPlan(message = {}) {
  const aliases = [];
  if (Array.isArray(message?.directoryAliases)) aliases.push(...message.directoryAliases);
  if (message?.directoryRoute) aliases.push(message.directoryRoute);
  return uniqueAliasesPlan(aliases.map((alias) => normalizeAlias(alias, { source: "bound" })).filter(Boolean));
}

function messageExtractedDirectoryAliasesPlan(input = {}) {
  const messageId = cleanString(input.messageId, 240);
  const aliases = [];
  for (const alias of input.extractedAliases || []) {
    const normalized = normalizeAlias(alias, {
      messageId,
      source: "extracted",
      referenceKind: cleanString(alias?.referenceKind, 80),
    });
    if (normalized) aliases.push(normalized);
  }
  for (const alias of input.mediaAliases || []) {
    const normalized = normalizeAlias(alias, {
      messageId: cleanString(alias?.messageId || messageId, 240),
      source: cleanString(alias?.source || "media", 80),
      referenceKind: cleanString(alias?.referenceKind, 80),
    });
    if (normalized) aliases.push(normalized);
  }
  return uniqueAliasesPlan(aliases);
}

function explicitTaskDirectoryAliasesPlan(input = {}) {
  const aliases = [];
  if (input.groupDirectoryRoute) {
    const route = normalizeAlias(input.groupDirectoryRoute, { source: "bound" });
    if (route) aliases.push(route);
  }
  for (const item of input.messageAliases || []) {
    const alias = normalizeAlias(item, {
      messageId: cleanString(item?.messageId, 240),
      source: cleanString(item?.source || "bound", 80),
    });
    if (alias) aliases.push(alias);
  }
  return uniqueAliasesPlan(aliases);
}

function isDeliveryDirectoryAliasPlan(input = {}) {
  const alias = input.alias || {};
  const route = input.route || {};
  const label = cleanString(alias.label, 400).toLowerCase();
  const pathValue = cleanString(alias.path || route.root, 2000).toLowerCase();
  const projectId = cleanString(route.projectId || alias.projectId, 240);
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    delivery: Boolean(
      alias.referenceKind === "delivery"
      || projectId === "hermes-sync-folder"
      || pathValue.includes("hermes同步文件夹")
      || label.includes("主交付")
      || label.includes("同步根")
      || label.includes("附加任务目录")
      || /sync(root|directory|folder)/i.test(label)
    ),
  });
}

function usableTaskBindingAliasesPlan(input = {}) {
  const aliases = (input.aliases || []).filter((alias) => (
    alias
    && !alias.referenceKind
    && !Boolean(alias.delivery)
    && !Boolean(alias.genericDefault)
    && !Boolean(alias.operational)
  ));
  return uniqueAliasesPlan(aliases.map((alias) => Object.assign({}, alias, { source: cleanString(alias.source, 80) })));
}

function taskDirectoryRouteMatchesFilterPlan(input = {}) {
  const route = input.route || null;
  const filter = input.filter || null;
  const matches = !filter || !route
    ? true
    : cleanString(route.projectId, 240) === cleanString(filter.projectId, 240)
      && (!filter.subprojectId || cleanString(route.subprojectId, 240) === cleanString(filter.subprojectId, 240));
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    matches,
  });
}

function taskDirectoryFilterLabelPlan(input = {}) {
  const filter = input.filter || null;
  if (!filter) return Object.freeze({ version: THREAD_DIRECTORY_MODEL_VERSION, label: "" });
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    label: cleanString(filter.label || input.displayPath || input.projectLabel || filter.projectId, 400),
  });
}

function setTaskDirectoryFilterPlan(input = {}) {
  const projectId = cleanString(input.projectId, 240);
  const subprojectId = cleanString(input.subprojectId, 240);
  const label = cleanString(input.label, 400);
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    ok: Boolean(projectId),
    patch: Object.freeze({
      taskDirectoryFilter: projectId ? Object.freeze({
        projectId,
        subprojectId,
        label,
        directory: input.directory || null,
      }) : null,
      pendingTaskDirectory: null,
      pendingTaskReasoningEffort: "",
      pendingTaskReasoningExplicit: false,
      viewMode: "tasks",
      currentTaskGroupId: "",
    }),
    storage: Object.freeze({ key: "hermesWebViewMode", value: "tasks" }),
    closeTopMoreMenu: true,
    closeSidebarWhenMobile: true,
    renderThreads: true,
    renderCurrentThreadOptions: Object.freeze({ stickToBottom: true }),
  });
}

function clearTaskDirectoryFilterPlan(input = {}) {
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    patch: Object.freeze({
      taskDirectoryFilter: null,
      pendingTaskDirectory: null,
      pendingTaskReasoningEffort: "",
      pendingTaskReasoningExplicit: false,
    }),
    closeTopMoreMenu: true,
    render: input.render !== false,
    renderCurrentThreadOptions: Object.freeze({ stickToBottom: true }),
  });
}

function taskDirectoryContextPlan(group = {}) {
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    context: Object.freeze({
      taskGroupId: cleanString(group?.id, 240),
      content: (group?.messages || []).map((message) => cleanString(message?.content, 4000)).join("\n"),
    }),
  });
}

function taskDirectoryFilterBannerViewPlan(input = {}) {
  const label = cleanString(input.label, 400);
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    visible: Boolean(input.active),
    label,
  });
}

function taskDirectoryBadgesViewPlan(input = {}) {
  const rendered = cleanString(input.rendered, 20000);
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    rendered,
    empty: !rendered && Boolean(input.empty),
    compact: Boolean(input.compact),
    visible: Boolean(rendered || input.empty),
  });
}

function taskDetailToolbarViewPlan(input = {}) {
  return Object.freeze({
    version: THREAD_DIRECTORY_MODEL_VERSION,
    sharedTopic: Boolean(input.group?.sharedTopic),
    aliasButtons: cleanString(input.aliasButtons, 20000),
    showMoreMenu: !Boolean(input.group?.sharedTopic),
  });
}

export {
  THREAD_DIRECTORY_MODEL_VERSION,
  clearTaskDirectoryFilterPlan,
  explicitTaskDirectoryAliasesPlan,
  isDeliveryDirectoryAliasPlan,
  messageDirectoryAliasesPlan,
  messageExtractedDirectoryAliasesPlan,
  setTaskDirectoryFilterPlan,
  taskDetailToolbarViewPlan,
  taskDirectoryBadgesViewPlan,
  taskDirectoryContextPlan,
  taskDirectoryFilterBannerViewPlan,
  taskDirectoryFilterLabelPlan,
  taskDirectoryRouteMatchesFilterPlan,
  uniqueAliasesPlan,
  usableTaskBindingAliasesPlan,
};
