const SHARED_DIRECTORY_MODEL_VERSION = "20260705-vite-shared-directory-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function cleanId(value) {
  return cleanString(value, 240);
}

function normalizePermission(value) {
  return cleanString(value, 80) === "read_only" ? "read_only" : "read_write";
}

function normalizeScope(value) {
  return cleanString(value, 80) === "selected_workspaces" ? "selected_workspaces" : "all_workspaces";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function sharedDirectoryAccessControlsPlan(item = {}, workspaces = []) {
  const targetIds = new Set(arrayValue(item.targetWorkspaceIds).map(cleanId).filter(Boolean));
  const allWorkspaces = normalizeScope(item.scope) === "all_workspaces";
  return Object.freeze({
    visible: Boolean(item.canManage),
    id: cleanId(item.id),
    permission: normalizePermission(item.permission),
    allWorkspaces,
    targetsHidden: allWorkspaces,
    workspaceChoices: Object.freeze(arrayValue(workspaces).map((workspace) => Object.freeze({
      id: cleanId(workspace?.id),
      label: cleanString(workspace?.label || workspace?.id || "", 240),
      checked: targetIds.has(cleanId(workspace?.id)),
    })).filter((workspace) => workspace.id)),
  });
}

function sharedDirectoryRowPlan(item = {}, options = {}) {
  const id = cleanId(item.id);
  const editingAccess = Boolean(options.editingAccessId && cleanId(options.editingAccessId) === id);
  const controls = item.canManage && editingAccess
    ? sharedDirectoryAccessControlsPlan(item, options.workspaces)
    : Object.freeze({ visible: false });
  return Object.freeze({
    id,
    label: cleanString(item.label || "共享目录", 500),
    createdByLabel: cleanString(item.createdByLabel || item.createdBy || "Unknown", 240),
    permissionLabel: cleanString(item.permissionLabel || "所有工作区 · 读写", 240),
    targetLabels: Object.freeze(arrayValue(item.targetLabels).map((label) => cleanString(label, 240)).filter(Boolean)),
    canManage: Boolean(item.canManage),
    canUnshare: Boolean(item.canUnshare),
    editingAccess,
    permissionActionLabel: editingAccess ? "收起" : "权限",
    unshareActionLabel: "取消共享",
    controls,
  });
}

function sharedDirectoryManagerViewPlan(input = {}) {
  if (input.loading) {
    return Object.freeze({ state: "loading", statusText: "Loading shared directories...", rows: Object.freeze([]) });
  }
  if (input.error) {
    return Object.freeze({ state: "error", statusText: cleanString(input.error, 1000), rows: Object.freeze([]) });
  }
  const rows = arrayValue(input.items).map((item) => sharedDirectoryRowPlan(item, {
    workspaces: input.workspaces,
    editingAccessId: input.editingAccessId,
  }));
  return Object.freeze({
    state: rows.length ? "ready" : "empty",
    title: "共享目录",
    subtitle: "仅 Owner 或原共享者可以取消共享。",
    closeLabel: "完成",
    emptyText: "暂无共享目录",
    rows: Object.freeze(rows),
  });
}

function sharedDirectoryTargetsVisibilityPlan(input = {}) {
  return Object.freeze({
    hidden: Boolean(input.allWorkspaces),
  });
}

function directoryEntryMenuPlan(entry = {}) {
  const type = cleanString(entry.type || "file", 80);
  const path = cleanString(entry.path, 4000);
  const name = cleanString(entry.name || "item", 500);
  const actions = [];
  if (type === "directory") {
    actions.push(Object.freeze({
      kind: "start-task",
      label: "开启话题",
      path,
      name,
    }));
  }
  actions.push(Object.freeze({
    kind: "rename",
    label: "改名",
    path,
    name,
    type,
  }));
  actions.push(Object.freeze({
    kind: "delete",
    label: "删除",
    path,
    name,
    type,
    danger: true,
  }));
  return Object.freeze({
    visible: actions.length > 0,
    buttonLabel: "更多操作",
    actions: Object.freeze(actions),
  });
}

function helperFn(helpers = {}, name, fallback) {
  return typeof helpers[name] === "function" ? helpers[name] : fallback;
}

function directoryEntryRowPlan(entry = {}, options = {}, helpers = {}) {
  const type = cleanString(entry.type || "file", 80);
  const name = cleanString(entry.name || "item", 500);
  const path = cleanString(entry.path, 4000);
  const kind = cleanString(helperFn(helpers, "directoryEntryKind", () => type === "directory" ? "dir" : "file")(entry), 120);
  const meta = cleanString(helperFn(helpers, "directoryEntryMeta", () => "")(entry), 500);
  const selectingServerFile = Boolean(options.selectingServerFile);
  const linkHref = type === "directory" ? "" : cleanString(helperFn(helpers, "directoryEntryHref", () => "#")(entry), 4000);
  const documentAttrs = type === "directory" ? "" : String(helperFn(helpers, "directoryEntryDocumentAttrs", () => "")(entry) || "");
  return Object.freeze({
    entry,
    type,
    name,
    path,
    kind,
    meta,
    selectingServerFile,
    mainKind: type === "directory" ? "open-directory" : (selectingServerFile ? "attach-server-file" : "document-link"),
    href: linkHref,
    documentAttrs,
    menu: selectingServerFile ? Object.freeze({ visible: false, actions: Object.freeze([]) }) : directoryEntryMenuPlan(entry),
  });
}

function directoryEntriesViewPlan(input = {}, helpers = {}) {
  if (input.loading) {
    return Object.freeze({ state: "loading", statusText: cleanString(input.error || "Loading directory...", 1000), rows: Object.freeze([]) });
  }
  if (input.error) {
    return Object.freeze({ state: "error", statusText: cleanString(input.error, 1000), rows: Object.freeze([]) });
  }
  if (!cleanString(input.activePath, 4000)) {
    return Object.freeze({ state: input.sharedManagerOpen ? "shared-manager" : "project-root", rows: Object.freeze([]) });
  }
  const directorySearchMatches = helperFn(helpers, "directorySearchMatches", () => true);
  const entries = arrayValue(input.previewEntries);
  const search = cleanString(input.search, 1000).toLowerCase();
  const rows = entries
    .filter((entry) => directorySearchMatches(entry, search))
    .map((entry) => directoryEntryRowPlan(entry, { selectingServerFile: input.selectingServerFile }, helpers));
  if (!rows.length) {
    return Object.freeze({
      state: "empty",
      statusText: entries.length && search ? "No matching items." : "空目录",
      rows: Object.freeze([]),
    });
  }
  return Object.freeze({ state: "ready", rows: Object.freeze(rows) });
}

function deletedDirectoryWasRootListProjectPlan(input = {}, helpers = {}) {
  const comparableDirectoryPath = helperFn(helpers, "comparableDirectoryPath", (value) => cleanString(value, 4000).replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase());
  const canDeleteDirectoryRootProject = helperFn(helpers, "canDeleteDirectoryRootProject", () => false);
  const target = comparableDirectoryPath(input.pathText);
  if (!target) return false;
  return arrayValue(input.projects).some((project) => canDeleteDirectoryRootProject(project) && comparableDirectoryPath(project?.root) === target);
}

function deleteDirectoryEntryPlan(input = {}) {
  const path = cleanString(input.path, 4000);
  const type = cleanString(input.type || "file", 80);
  const name = cleanString(input.name || "item", 500);
  if (!path) {
    return Object.freeze({
      ok: false,
      errorMessage: "删除失败：缺少文件路径",
    });
  }
  const message = type === "directory"
    ? `删除目录“${name}”？如果目录非空，需要 Owner 高权限批准后才会递归删除。`
    : `删除文件“${name}”？`;
  const now = Math.max(0, Number(input.now) || 0);
  const armedUntil = Math.max(0, Number(input.armedUntil) || 0);
  if (!armedUntil || armedUntil < now) {
    return Object.freeze({
      ok: true,
      action: "arm",
      confirmUntil: now + 5000,
      confirmLabel: "再点删除",
      message,
    });
  }
  return Object.freeze({
    ok: true,
    action: "delete",
    progressText: type === "directory" ? "正在删除目录..." : "正在删除文件...",
    buttonText: "删除中...",
    restoreText: "删除",
    successText: "已删除",
  });
}

function directoryDeleteRequestPlan(input = {}) {
  const body = {
    threadId: cleanString(input.threadId, 240),
    path: cleanString(input.path, 4000),
  };
  const token = cleanString(input.ownerElevationOnceToken, 1000);
  if (token) body.ownerElevationOnceToken = token;
  return Object.freeze(body);
}

function renameDirectoryPromptPlan(input = {}) {
  const type = cleanString(input.type || "file", 80);
  const label = type === "directory" ? "目录" : "文件";
  return Object.freeze({
    title: `重命名${label}`,
    inputLabel: `新的${label}名称`,
    defaultValue: cleanString(input.oldName || "item", 500),
    confirmLabel: "保存",
    progressText: type === "directory" ? "正在改名目录..." : "正在改名文件...",
  });
}

function directoryRenameRequestPlan(input = {}) {
  return Object.freeze({
    threadId: cleanString(input.threadId, 240),
    path: cleanString(input.path, 4000),
    name: cleanString(input.nextName, 500),
  });
}

function shareRootDirectoryProjectPlan(input = {}, helpers = {}) {
  const project = input.project || {};
  const directoryRootProjectLabel = helperFn(helpers, "directoryRootProjectLabel", (item) => cleanString(item?.label || item?.id || "Project", 240));
  const name = directoryRootProjectLabel(project);
  return Object.freeze({
    ok: Boolean(project?.root),
    title: "共享目录",
    message: `共享目录“${name}”？共享后所有工作区都能看到这个目录。`,
    confirmLabel: "共享",
    requestName: name,
    requestPath: cleanString(project?.root, 4000),
  });
}

function sharedDirectoryAccessTogglePlan(input = {}) {
  const id = cleanId(input.id);
  return Object.freeze({
    nextEditingId: cleanId(input.currentEditingId) === id ? "" : id,
  });
}

function sharedDirectoryAccessUpdateRequestPlan(input = {}) {
  const allWorkspaces = Boolean(input.allWorkspaces);
  return Object.freeze({
    workspaceId: cleanId(input.workspaceId),
    id: cleanId(input.id),
    permission: normalizePermission(input.permission),
    scope: allWorkspaces ? "all_workspaces" : "selected_workspaces",
    targetWorkspaceIds: Object.freeze(arrayValue(input.targetWorkspaceIds).map(cleanId).filter(Boolean)),
  });
}

function unshareDirectoryRequestPlan(input = {}) {
  return Object.freeze({
    workspaceId: cleanId(input.workspaceId),
    id: cleanId(input.id),
  });
}

export {
  SHARED_DIRECTORY_MODEL_VERSION,
  cleanString,
  deleteDirectoryEntryPlan,
  deletedDirectoryWasRootListProjectPlan,
  directoryDeleteRequestPlan,
  directoryEntriesViewPlan,
  directoryEntryMenuPlan,
  directoryEntryRowPlan,
  directoryRenameRequestPlan,
  renameDirectoryPromptPlan,
  shareRootDirectoryProjectPlan,
  sharedDirectoryAccessControlsPlan,
  sharedDirectoryAccessTogglePlan,
  sharedDirectoryAccessUpdateRequestPlan,
  sharedDirectoryManagerViewPlan,
  sharedDirectoryRowPlan,
  sharedDirectoryTargetsVisibilityPlan,
  unshareDirectoryRequestPlan,
};
