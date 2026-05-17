"use strict";

function sharedProjectOwnerLabel(project) {
  return String(project?.sharedByLabel || project?.createdByLabel || project?.sharedBy || project?.createdBy || "").trim();
}

function sharedProjectRootOwnerLabel(project) {
  const root = String(project?.root || "").replaceAll("\\", "/");
  const parts = root.split("/").filter(Boolean);
  const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
  if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0) return state.displayConfig.ownerRootFallbackLabel || "Hermes Owner";
  return "";
}

function projectDisplayLabel(project) {
  return project?.label || project?.id || "Project";
}

function routeLabelParts(label) {
  return String(label || "")
    .split(/\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeChildParts(child) {
  const parts = routeLabelParts(child?.label || child?.id);
  const subProject = parts[0] || child?.label || child?.id || "Item";
  return { subProject };
}

function routeGroups(project = currentProject()) {
  const groups = new Map();
  for (const child of project?.children || []) {
    const parts = routeChildParts(child);
    const key = directoryAliasKey(parts.subProject);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: parts.subProject,
        rootChild: null,
      });
    }
    const group = groups.get(key);
    if (
      !group.rootChild ||
      comparableDirectoryPath(child.root).length < comparableDirectoryPath(group.rootChild.root).length
    ) {
      group.rootChild = child;
    }
  }
  return [...groups.values()];
}

function selectDefaultRouteItem(group) {
  if (!group) return "";
  return group.rootChild?.id || "";
}

function persistSelectedSubproject(value) {
  state.selectedSubprojectId = value || "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
}

function currentSearchText() {
  return $("threadSearch")?.value.trim() || "";
}

function updateSearchButton() {
  const button = $("searchButton");
  if (!button) return;
  const search = currentSearchText();
  button.classList.toggle("active", Boolean(search));
  button.textContent = search ? "⌕*" : "⌕";
  button.title = search ? `Search: ${search}` : "Search";
}

async function openSearchPrompt() {
  const next = window.prompt("Search", currentSearchText());
  if (next == null) return;
  $("threadSearch").value = String(next || "").trim();
  updateSearchButton();
  await loadSelectedView();
}

function focusWorkspaceEntry() {
  const select = $("workspaceSelect");
  select?.scrollIntoView({ block: "center", behavior: "smooth" });
  select?.focus();
}

function currentDirectoryTarget() {
  const project = currentProject();
  const target = currentSubproject() || project;
  if (target?.root) return target;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return null;
}

async function openCurrentDirectoryEntry() {
  const target = currentDirectoryTarget();
  if (!target?.root) throw new Error("No directory is selected.");
  await openDirectoryPathInManager(target.root, target.label || target.id || "");
}

function directoryRouteOptions(project = currentProject()) {
  return routeGroups(project)
    .map((group) => ({ id: selectDefaultRouteItem(group), label: group.label }))
    .filter((item) => item.id);
}

function renderDirectorySubprojectOptions(project = currentProject()) {
  const options = directoryRouteOptions(project);
  return [
    `<option value="">Root</option>`,
    ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`),
  ].join("");
}

function resetDirectoryPath(path = "", options = {}) {
  state.directoryPath = path || "";
  state.directoryRootPath = Object.prototype.hasOwnProperty.call(options, "rootPath") ? (options.rootPath || "") : (path || "");
  state.directoryPreview = null;
  state.directoryError = "";
  if (!options.keepSharedManager) state.sharedDirectoryManagerOpen = false;
}

function directoryActivePath() {
  return state.directoryPreview?.path || state.directoryPath || "";
}

function directoryParentPath(pathText) {
  const normalized = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!normalized || normalized === "/") return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") || "/";
}

function directoryRootCreateBasePath() {
  const workspace = currentWorkspace();
  const workspaceRoot = String(workspace?.defaultWorkspace || "").trim();
  const rootProjects = directoryRootProjects().filter((project) => {
    if (!project?.root || project.hidden || project.singleWindow || isDirectorySharedRootProject(project)) return false;
    if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
    const source = String(project.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory/.test(source)
      || project.remote === "wsl";
  });
  if (workspaceRoot && rootProjects.some((project) => pathMatchesDirectoryRoot(project.root, workspaceRoot))) {
    return workspaceRoot;
  }
  const parentCounts = new Map();
  for (const project of rootProjects) {
    const parent = directoryParentPath(project.root);
    if (!parent) continue;
    const key = comparableDirectoryPath(parent);
    if (!key) continue;
    const existing = parentCounts.get(key) || { path: parent, count: 0 };
    existing.count += 1;
    parentCounts.set(key, existing);
  }
  const commonParent = [...parentCounts.values()].sort((a, b) => b.count - a.count || a.path.length - b.path.length)[0];
  return commonParent?.path || workspaceRoot || "";
}

function directoryCreateBasePath() {
  return directoryActivePath() || directoryRootCreateBasePath();
}

function matchingDirectoryProject(pathText) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  const selected = currentProject();
  if (selected?.root && pathMatchesDirectoryRoot(active, selected.root)) return selected;
  return (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(active, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
}

function ensureDirectoryRootForPath(pathText) {
  const active = String(pathText || "").trim();
  if (!active) {
    state.directoryRootPath = "";
    return;
  }
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) return;
  const project = matchingDirectoryProject(active);
  state.directoryRootPath = project?.root || currentDirectoryTarget()?.root || active;
}

function directoryRootForPath(pathText, fallbackPath = "") {
  const active = String(pathText || "").trim();
  if (!active) return fallbackPath || "";
  const project = matchingDirectoryProject(active);
  if (project?.root) return project.root;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return workspace.defaultWorkspace;
  }
  const target = currentDirectoryTarget();
  if (target?.root && pathMatchesDirectoryRoot(active, target.root)) return target.root;
  return fallbackPath || active;
}

function isDirectoryAtRouteRoot(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  if (!target?.root) return true;
  const active = comparableDirectoryPath(pathText);
  const root = comparableDirectoryPath(target.root);
  return !active || active === root;
}

function directoryBoundaryTarget(pathText = directoryActivePath()) {
  const active = String(pathText || "").trim();
  if (!active) return null;
  if (state.directoryRootPath && pathMatchesDirectoryRoot(active, state.directoryRootPath)) {
    const project = (state.projects || []).find((item) => comparableDirectoryPath(item?.root) === comparableDirectoryPath(state.directoryRootPath));
    return {
      id: project?.id || "directory-root",
      label: project?.label || project?.id || "Directory",
      root: state.directoryRootPath,
    };
  }
  const project = matchingDirectoryProject(active);
  if (project?.root) return project;
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(active, workspace.defaultWorkspace)) {
    return {
      id: workspace.id || "workspace",
      label: workspace.label || workspace.id || "Workspace",
      root: workspace.defaultWorkspace,
    };
  }
  return currentDirectoryTarget();
}

function parentDirectoryPath(pathText = directoryActivePath()) {
  const target = directoryBoundaryTarget(pathText);
  const active = String(pathText || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (!active || !target?.root || isDirectoryAtRouteRoot(pathText)) return "";
  const parts = active.split("/");
  if (parts.length <= 1) return "";
  const parent = parts.slice(0, -1).join("/") || "/";
  if (!pathMatchesDirectoryRoot(parent, target.root)) return target.root;
  return parent;
}

function shouldAnimateDirectoryNavigation() {
  return isMobileLayout() && !prefersReducedMotion();
}

function resetDirectorySwipeShell(shell) {
  if (!shell) return;
  shell.classList.remove("directory-dragging", "directory-settling", "directory-entering");
  shell.style.transform = "";
  shell.style.opacity = "";
}

function settleDirectorySwipeShell(shell, accepted) {
  if (!shell) return Promise.resolve();
  if (accepted) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  if (!shouldAnimateDirectoryNavigation()) {
    resetDirectorySwipeShell(shell);
    return Promise.resolve();
  }
  shell.classList.remove("directory-dragging");
  shell.classList.add("directory-settling");
  shell.style.transform = "";
  shell.style.opacity = "";
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resetDirectorySwipeShell(shell);
      resolve();
    }, 180);
  });
}

function animateDirectoryEntry() {
  if (!shouldAnimateDirectoryNavigation()) return;
  requestAnimationFrame(() => {
    const shell = document.querySelector(".directory-shell");
    if (!shell) return;
    shell.classList.add("directory-entering");
    window.setTimeout(() => shell.classList.remove("directory-entering"), 320);
  });
}

async function navigateDirectoryUp(options = {}) {
  if (state.viewMode !== "projects" || state.directoryLoading) return false;
  if (!directoryActivePath()) return false;
  const exitShell = options.exitShell || (options.animateEntry ? document.querySelector(".directory-shell") : null);
  if (exitShell) {
    await settleDirectorySwipeShell(exitShell, true);
  }
  if (state.directoryReturnRoute && isDirectoryAtRouteRoot()) {
    restoreDirectoryReturnRoute();
    return true;
  }
  if (isDirectoryAtRouteRoot()) {
    state.directoryPath = "";
    state.directoryRootPath = "";
    state.directoryPreview = null;
    state.directoryError = "";
    state.sharedDirectoryManagerOpen = false;
    persistSelectedSubproject("");
    await loadDirectoryView();
    if (options.animateEntry) animateDirectoryEntry();
    return true;
  }
  const parent = parentDirectoryPath();
  state.directoryPath = parent || "";
  if (parent) {
    ensureDirectoryRootForPath(parent);
    syncDirectoryRouteFromPath(parent);
  } else {
    state.directoryRootPath = "";
    persistSelectedSubproject("");
  }
  await loadDirectoryView();
  if (options.animateEntry) animateDirectoryEntry();
  return true;
}

async function ensureDirectoryThread() {
  if (state.directoryThreadId && state.directoryThreadWorkspaceId === state.selectedWorkspaceId) {
    return state.directoryThreadId;
  }
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId }),
  });
  state.directoryThreadId = result.thread?.id || "";
  state.directoryThreadWorkspaceId = state.selectedWorkspaceId;
  if (!state.directoryThreadId) throw new Error("Directory thread is unavailable.");
  return state.directoryThreadId;
}

function renderDirectorySidebar() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
}

function scrollDirectoryViewToStart() {
  requestAnimationFrame(() => {
    const conversation = $("conversation");
    if (conversation) conversation.scrollTop = 0;
    const shell = document.querySelector(".directory-shell");
    if (shell) shell.scrollTop = 0;
  });
}

async function loadDirectoryView(options = {}) {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (options.resetPath || !state.directoryPath) {
    resetDirectoryPath();
  } else {
    state.sharedDirectoryManagerOpen = false;
  }
  renderDirectorySidebar();
  setComposerEnabled(false);
  if (!state.directoryPath) {
    state.directoryPreview = null;
    state.directoryLoading = false;
    state.directoryError = "";
    renderDirectoryView();
    if (!options.preserveScroll) scrollDirectoryViewToStart();
    return;
  }
  const requestedWorkspaceId = state.selectedWorkspaceId;
  const requestedPath = state.directoryPath;
  state.directoryLoading = true;
  state.directoryError = "";
  renderDirectoryView();
  try {
    const threadId = await ensureDirectoryThread();
    const params = new URLSearchParams({ threadId, path: requestedPath });
    const result = await api(`/api/directories/preview?${params.toString()}`);
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = result;
    state.directoryPath = result.path || requestedPath;
  } catch (err) {
    if (state.viewMode !== "projects" || state.selectedWorkspaceId !== requestedWorkspaceId) return;
    state.directoryPreview = null;
    state.directoryError = err.message || String(err);
  } finally {
    if (state.viewMode === "projects" && state.selectedWorkspaceId === requestedWorkspaceId) {
      state.directoryLoading = false;
      renderDirectorySidebar();
      renderDirectoryView();
      if (!options.preserveScroll) scrollDirectoryViewToStart();
    }
  }
}

function directoryHeaderDisplayPath() {
  if (!directoryActivePath()) return "";
  const preview = state.directoryPreview;
  if (preview?.workspacePath || preview?.displayPath) return preview.workspacePath || preview.displayPath;
  const target = currentDirectoryTarget();
  return logicalDirectoryDisplayPath(directoryActivePath(), target?.label || target?.id || "Directory");
}

function syncDirectoryRouteFromPath(pathText) {
  const value = String(pathText || "").trim();
  if (!value) {
    persistSelectedSubproject("");
    return;
  }
  const project = (state.projects || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  if (!project) return;
  state.selectedProjectId = project.id;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const child = (project.children || [])
    .filter((item) => item?.root && pathMatchesDirectoryRoot(value, item.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0] || null;
  persistSelectedSubproject(child?.id || "");
  renderSubprojects();
}

function directoryAttachmentFromRoute(projectId, subprojectId = "", pathText = "", label = "") {
  const project = (state.projects || []).find((item) => item.id === projectId);
  if (!project?.root) return null;
  const child = subprojectId ? (project.children || []).find((item) => item.id === subprojectId) : null;
  const routeRoot = child?.root || project.root;
  const requestedPath = String(pathText || "").trim();
  const directoryPath = requestedPath && pathMatchesDirectoryRoot(requestedPath, routeRoot) ? requestedPath : routeRoot;
  const routeLabel = label || directoryRouteDisplayPath(
    { projectId: project.id, subprojectId: child?.id || "", label: child?.label || project.label || project.id, root: routeRoot },
    child ? `${projectDisplayLabel(project)} / ${child.label || child.id}` : projectDisplayLabel(project),
  );
  return {
    projectId: project.id,
    subprojectId: child?.id || "",
    label: routeLabel,
    path: directoryPath,
    root: routeRoot,
  };
}

function directoryAttachmentForFilter(filter = state.taskDirectoryFilter) {
  if (!filter?.projectId) return null;
  if (filter.directory?.projectId && (filter.directory.root || filter.directory.path)) {
    return filter.directory;
  }
  return directoryAttachmentFromRoute(filter.projectId, filter.subprojectId || "", "", filter.label || "");
}

function directoryBreadcrumbItems() {
  const items = [{ label: "目录", path: "" }];
  const active = directoryActivePath();
  if (!active) return items;
  const normalizedActive = String(active || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  const projectMatches = (state.projects || [])
    .filter((project) => project?.root && pathMatchesDirectoryRoot(normalizedActive, project.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const project = projectMatches[0] || null;
  if (!project) {
    items.push({ label: logicalDirectoryDisplayPath(normalizedActive, "Directory"), path: normalizedActive });
    return items;
  }
  items.push({ label: projectDisplayLabel(project), path: project.root });
  const childMatches = (project.children || [])
    .filter((child) => child?.root && pathMatchesDirectoryRoot(normalizedActive, child.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  const child = childMatches[0] || null;
  const baseRoot = child?.root || project.root;
  if (child) items.push({ label: child.label || child.id || "Folder", path: child.root });
  const tail = relativeDisplayTailForDirectory(normalizedActive, baseRoot);
  const pathParts = relativeDisplayTailForDirectory(normalizedActive, baseRoot)
    ? String(normalizedActive).slice(String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "").length + 1).split("/").filter(Boolean)
    : [];
  let cursor = String(baseRoot || "").replaceAll("\\", "/").replace(/\/+$/g, "");
  for (const segment of pathParts) {
    cursor = `${cursor}/${segment}`;
    items.push({ label: segment, path: cursor });
  }
  if (!tail && items.length === 1) items.push({ label: projectDisplayLabel(project), path: project.root });
  return items;
}

function renderDirectoryBreadcrumb() {
  const items = directoryBreadcrumbItems();
  const crumbs = items.map((item, index) => {
    const isLast = index === items.length - 1;
    const label = escapeHtml(item.label || "Directory");
    return `${index ? `<span class="directory-breadcrumb-separator">/</span>` : ""}<button type="button" data-directory-crumb="${escapeHtml(item.path || "")}"${isLast ? " disabled" : ""}>${label}</button>`;
  }).join("");
  return `<nav class="directory-breadcrumb" aria-label="Directory path">${crumbs}</nav>`;
}

function renderDirectoryControls() {
  const uploadDisabled = directoryActivePath() ? "" : " disabled";
  return `<section class="directory-commandbar">
    ${renderDirectoryBreadcrumb()}
    <div class="directory-command-actions" aria-label="Directory actions">
      <button class="directory-icon-action" type="button" data-directory-refresh aria-label="刷新" title="刷新"><span aria-hidden="true">&#8635;</span></button>
      <button class="directory-icon-action directory-upload-action" type="button" data-directory-upload${uploadDisabled} aria-label="上传" title="上传"><span aria-hidden="true">&#8679;</span></button>
    </div>
    <input id="directoryUploadInput" class="hidden" type="file" multiple>
  </section>`;
}

function directoryEntryKind(entry) {
  if (entry?.type === "directory") return "dir";
  return artifactKind({ name: entry?.name, mime: entry?.mime });
}

function directoryEntryHref(entry) {
  if (entry?.type === "directory") return "#";
  return artifactHref({ url: entry?.url, name: entry?.name, mime: entry?.mime, size: entry?.size });
}

function directoryEntryMeta(entry) {
  if (entry?.type === "directory") return formatTime(entry?.mtime);
  return [formatBytes(entry?.size), formatTime(entry?.mtime)].filter(Boolean).join(" | ");
}

function directorySearchMatches(entry, search) {
  if (!search) return true;
  return [
    entry?.name,
    entry?.displayPath,
    entry?.workspacePath,
    entry?.mime,
  ].filter(Boolean).join("\n").toLowerCase().includes(search);
}

function isDirectorySharedRootProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared)
    || source === "hermes-web-shared-directory"
    || /^shared-allowed-root/.test(source);
}

function orderDirectoryRootProjects(projects) {
  return (projects || [])
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const labelDelta = String(directoryRootProjectLabel(a.project))
        .localeCompare(String(directoryRootProjectLabel(b.project)), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
      return labelDelta || a.index - b.index;
    })
    .map((item) => item.project);
}

function directoryRootProjects() {
  const projects = state.projects || [];
  const managed = projects.filter((project) => {
    const source = String(project?.source || "");
    return /^project-directory-map/.test(source)
      || /^workspace-directory|^shared-allowed-root/.test(source)
      || source === "hermes-web-shared-directory"
      || project?.remote === "wsl";
  });
  const special = projects.filter((project) => project?.source === "acl" && ["sync", "download"].includes(project?.id));
  if (managed.length) return orderDirectoryRootProjects([...managed, ...special]);
  const visible = projects.filter((project) => project?.source !== "workspace-default");
  return orderDirectoryRootProjects(visible.length ? visible : projects);
}

function directoryRootProjectLabel(project) {
  if (project?.id === "sync") return "同步文件夹";
  if (project?.id === "download") return "下载";
  return projectDisplayLabel(project);
}

function renderDirectorySharedBadge(project) {
  return isDirectorySharedRootProject(project) ? `<span class="directory-shared-badge">共享</span>` : "";
}

function isShareableRootProject(project) {
  if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  const source = String(project.source || "");
  return source === "project-directory-map"
    || source === "project-directory-map-top"
    || source === "workspace-directory"
    || source === "workspace-directory-wsl";
}

function canDeleteDirectoryRootProject(project) {
  if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(String(project.id || ""))) return false;
  const source = String(project.source || "");
  return source === "workspace-directory" || source === "workspace-directory-wsl";
}

function renderDirectoryRootProjectMenu(project) {
  const canStartTask = Boolean(project?.root && !project.hidden && !project.singleWindow && !["general", "sync", "download"].includes(String(project.id || "")));
  const canShare = isShareableRootProject(project);
  const canDelete = canDeleteDirectoryRootProject(project);
  if (!canStartTask && !canShare && !canDelete) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${canStartTask ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-project="${escapeHtml(project.id || "")}">开启话题</button>` : ""}
      ${canShare ? `<button class="directory-entry-menu-item" type="button" data-share-root-project="${escapeHtml(project.id || "")}">共享</button>` : ""}
      ${canDelete ? `<button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${escapeHtml(project.root || "")}" data-delete-directory-name="${escapeHtml(directoryRootProjectLabel(project))}" data-delete-directory-type="directory">删除</button>` : ""}
    </div>
  </div>`;
}

function renderDirectoryProjectEntries() {
  const search = currentSearchText().toLowerCase();
  const rootProjects = directoryRootProjects();
  const projects = rootProjects.filter((project) => {
    if (!search) return true;
    return [
      directoryRootProjectLabel(project),
      project.id,
      ...(project.aliases || []),
    ].filter(Boolean).join("\n").toLowerCase().includes(search);
  });
  if (!projects.length) {
    return `<div class="directory-status">${rootProjects.length && search ? "No matching directories." : "No directories."}</div>`;
  }
  return `<div class="directory-entry-list">${projects.map((project) => {
    const sharedClass = isDirectorySharedRootProject(project) ? " shared-root" : "";
    return `<article class="directory-entry dir${sharedClass}">
      <button class="directory-entry-main" type="button" data-open-project-directory="${escapeHtml(project.id || "")}">
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${renderDirectorySharedBadge(project)}<span class="directory-entry-label">${escapeHtml(directoryRootProjectLabel(project))}</span></span>
        </span>
        <span class="directory-entry-chevron">›</span>
      </button>
      ${renderDirectoryRootProjectMenu(project)}
    </article>`;
  }).join("")}</div>`;
}

function renderSharedDirectoryManager() {
  if (state.sharedDirectoriesLoading) {
    return `<section class="shared-directory-manager"><div class="directory-status">Loading shared directories...</div></section>`;
  }
  if (state.sharedDirectoriesError) {
    return `<section class="shared-directory-manager"><div class="directory-status error">${escapeHtml(state.sharedDirectoriesError)}</div></section>`;
  }
  const items = Array.isArray(state.sharedDirectories) ? state.sharedDirectories : [];
  const rows = items.length ? items.map((item) => {
    const targetIds = new Set(Array.isArray(item.targetWorkspaceIds) ? item.targetWorkspaceIds : []);
    const allWorkspaces = item.scope === "all_workspaces";
    const workspaceChoices = state.workspaces.map((workspace) => {
      const checked = targetIds.has(workspace.id) ? " checked" : "";
      return `<label class="shared-directory-target">
        <input type="checkbox" value="${escapeHtml(workspace.id || "")}" data-share-target${checked}>
        <span>${escapeHtml(workspace.label || workspace.id)}</span>
      </label>`;
    }).join("");
    const editingAccess = state.sharedDirectoryAccessId === item.id;
    const controls = item.canManage && editingAccess
      ? `<div class="shared-directory-controls" data-share-controls>
          <label class="shared-directory-field">
            <span>权限</span>
            <select data-share-permission>
              <option value="read_write"${item.permission !== "read_only" ? " selected" : ""}>读写</option>
              <option value="read_only"${item.permission === "read_only" ? " selected" : ""}>只读</option>
            </select>
          </label>
          <label class="shared-directory-target all">
            <input type="checkbox" data-share-all${allWorkspaces ? " checked" : ""}>
            <span>所有工作区</span>
          </label>
          <div class="shared-directory-targets"${allWorkspaces ? " hidden" : ""}>${workspaceChoices}</div>
          <button class="shared-directory-save" type="button" data-save-share-directory-id="${escapeHtml(item.id || "")}">保存权限</button>
        </div>`
      : "";
    const permissionAction = item.canManage
      ? `<button class="shared-directory-permission" type="button" data-edit-share-directory-id="${escapeHtml(item.id || "")}">${editingAccess ? "收起" : "权限"}</button>`
      : "";
    const action = item.canUnshare
      ? `<button class="shared-directory-unshare" type="button" data-unshare-directory-id="${escapeHtml(item.id || "")}">取消共享</button>`
      : "";
    return `<article class="shared-directory-row">
      <span class="directory-entry-icon" aria-hidden="true"></span>
      <span class="shared-directory-text">
        <span class="shared-directory-name">${escapeHtml(item.label || "共享目录")}</span>
        <span class="shared-directory-meta">共享者：${escapeHtml(item.createdByLabel || item.createdBy || "Unknown")}</span>
        <span class="shared-directory-meta">权限：${escapeHtml(item.permissionLabel || "所有工作区 · 读写")}</span>
        ${Array.isArray(item.targetLabels) && item.targetLabels.length ? `<span class="shared-directory-meta">共享给：${escapeHtml(item.targetLabels.join("、"))}</span>` : ""}
        ${controls}
      </span>
      <span class="shared-directory-actions">${permissionAction}${action}</span>
    </article>`;
  }).join("") : `<div class="directory-status">暂无共享目录</div>`;
  return `<section class="shared-directory-manager">
    <header class="shared-directory-header">
      <div>
        <div class="shared-directory-title">共享目录</div>
        <div class="shared-directory-subtitle">仅 Owner 或原共享者可以取消共享。</div>
      </div>
      <button class="shared-directory-close" type="button" data-close-shared-directory-manager>完成</button>
    </header>
    <div class="shared-directory-list">${rows}</div>
  </section>`;
}

function renderDirectoryEntryMenu(entry) {
  const itemPath = escapeHtml(entry.path || "");
  const itemName = escapeHtml(entry.name || "item");
  const itemType = escapeHtml(entry.type || "file");
  const taskAction = entry.type === "directory"
    ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-path="${itemPath}" data-start-directory-task-label="${itemName}">开启话题</button>`
    : "";
  const deleteAction = `<button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${itemPath}" data-delete-directory-name="${itemName}" data-delete-directory-type="${itemType}">删除</button>`;
  if (!taskAction && !deleteAction) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${taskAction}
      ${deleteAction}
    </div>
  </div>`;
}

function renderDirectoryEntries() {
  if (state.directoryLoading) return `<div class="directory-status">${escapeHtml(state.directoryError || "Loading directory...")}</div>`;
  if (state.directoryError) return `<div class="directory-status error">${escapeHtml(state.directoryError)}</div>`;
  if (!directoryActivePath()) return state.sharedDirectoryManagerOpen ? renderSharedDirectoryManager() : renderDirectoryProjectEntries();
  const preview = state.directoryPreview;
  const entries = Array.isArray(preview?.entries) ? preview.entries : [];
  const search = currentSearchText().toLowerCase();
  const visible = entries.filter((entry) => directorySearchMatches(entry, search));
  if (!visible.length) {
    return `<div class="directory-status">${entries.length && search ? "No matching items." : "空目录"}</div>`;
  }
  return `<div class="directory-entry-list">${visible.map((entry) => {
    const kind = directoryEntryKind(entry);
    const meta = directoryEntryMeta(entry);
    const main = entry.type === "directory"
      ? `<button class="directory-entry-main" type="button" data-open-directory-path="${escapeHtml(entry.path || "")}">`
      : `<a class="directory-entry-main" href="${escapeHtml(directoryEntryHref(entry))}" target="_self" rel="noopener">`;
    const close = entry.type === "directory" ? "</button>" : "</a>";
    return `<article class="directory-entry ${escapeHtml(kind)}">
      ${main}
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${escapeHtml(entry.name || "item")}</span>
          ${meta ? `<span class="directory-entry-meta">${escapeHtml(meta)}</span>` : ""}
        </span>
        <span class="directory-entry-chevron">›</span>
      ${close}
      ${renderDirectoryEntryMenu(entry)}
    </article>`;
  }).join("")}</div>`;
}

function renderDirectoryView() {
  if (state.viewMode !== "projects") return;
  const conversation = $("conversation");
  $("threadTitle").textContent = "目录";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  configureComposer({ enabled: false, placeholder: "Directory management" });
  conversation.innerHTML = `<section class="directory-shell">
    ${renderDirectoryControls()}
    ${renderDirectoryEntries()}
  </section>`;
  wireDirectoryView(conversation);
  ensureVerticalScrollAffordance(conversation);
}

async function createDirectoryFolder() {
  const name = window.prompt("新建目录名称");
  if (!name || !name.trim()) return;
  const basePath = directoryCreateBasePath();
  if (!basePath) throw new Error("No directory is selected.");
  const creatingAtRoot = !directoryActivePath();
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/create", {
    method: "POST",
    body: JSON.stringify({ threadId, path: basePath, name: name.trim() }),
  });
  if (creatingAtRoot) {
    await loadProjects();
    resetDirectoryPath();
  }
  await loadDirectoryView();
}

async function uploadDirectoryFiles(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  const threadId = await ensureDirectoryThread();
  try {
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      state.directoryLoading = true;
      state.directoryError = `Uploading ${index + 1}/${list.length}: ${file.name}`;
      renderDirectoryView();
      await api("/api/directories/upload", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          path: directoryActivePath(),
          filename: file.name,
          dataBase64: await fileToBase64(file),
        }),
      });
    }
  } catch (err) {
    state.directoryError = err.message || String(err);
    renderDirectoryView();
    throw err;
  } finally {
    state.directoryLoading = false;
  }
  await loadDirectoryView();
}

function deletedDirectoryWasRootListProject(pathText) {
  const target = comparableDirectoryPath(pathText);
  if (!target) return false;
  return (state.projects || []).some((project) =>
    canDeleteDirectoryRootProject(project) && comparableDirectoryPath(project.root) === target);
}

async function deleteDirectoryEntry(button) {
  const path = button?.dataset?.deleteDirectoryPath || "";
  if (!path) return;
  const wasRootListProject = deletedDirectoryWasRootListProject(path);
  const name = button.dataset.deleteDirectoryName || "item";
  const type = button.dataset.deleteDirectoryType || "file";
  const message = type === "directory"
    ? `删除目录“${name}”？如果目录非空，需要 Owner 高权限批准后才会递归删除。`
    : `删除文件“${name}”？`;
  if (!window.confirm(message)) return;
  const threadId = await ensureDirectoryThread();
  const body = { threadId, path };
  try {
    await api("/api/directories/delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (!shouldOfferOwnerElevation(err)) throw err;
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: ownerElevationConfirmMessage(err),
      detail: err.elevationReason || "",
    });
    if (!ok) return;
    let ownerElevationOnceRequested = false;
    try {
      let onceToken = "";
      if (!ownerElevationActive()) {
        await activateOwnerElevationOnce({ confirm: false });
        onceToken = state.ownerElevationOnceToken;
        ownerElevationOnceRequested = true;
      }
      const elevatedBody = Object.assign({}, body);
      if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
      await api("/api/directories/delete", {
        method: "POST",
        body: JSON.stringify(elevatedBody),
      });
    } finally {
      if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    }
  }
  if (!directoryActivePath() || wasRootListProject) await loadProjects();
  await loadDirectoryView();
}

function closeDirectoryEntryMenus(root = document) {
  root.querySelectorAll(".directory-entry-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".directory-entry")?.classList.remove("menu-open");
    wrap.querySelector(".directory-entry-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".directory-entry-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleDirectoryEntryMenu(button) {
  const wrap = button?.closest?.(".directory-entry-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeDirectoryEntryMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".directory-entry")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".directory-entry-menu");
  if (menu) menu.hidden = false;
}

async function loadSharedDirectories() {
  state.sharedDirectoriesLoading = true;
  state.sharedDirectoriesError = "";
  renderDirectoryView();
  try {
    const result = await api(`/api/directories/shared?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
    state.sharedDirectories = result.data || [];
    if (state.sharedDirectoryAccessId && !state.sharedDirectories.some((item) => item.id === state.sharedDirectoryAccessId)) {
      state.sharedDirectoryAccessId = "";
    }
  } catch (err) {
    state.sharedDirectoriesError = err.message || String(err);
  } finally {
    state.sharedDirectoriesLoading = false;
    renderDirectoryView();
  }
}

async function openSharedDirectoryManager() {
  closeTopMoreMenu();
  if (state.viewMode !== "projects") return;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function closeSharedDirectoryManager() {
  state.sharedDirectoryManagerOpen = false;
  state.sharedDirectoriesError = "";
  state.sharedDirectoryAccessId = "";
  renderDirectoryView();
}

async function shareRootDirectoryProject(button) {
  const projectId = button?.dataset?.shareRootProject || "";
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.root || !isShareableRootProject(project)) return;
  const name = directoryRootProjectLabel(project);
  if (!window.confirm(`共享目录“${name}”？共享后所有工作区都能看到这个目录。`)) return;
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/share", {
    method: "POST",
    body: JSON.stringify({ threadId, path: project.root, name }),
  });
  await loadProjects();
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function selectDirectoryAttachmentRoute(attachment) {
  if (!attachment?.projectId) return;
  state.selectedProjectId = attachment.projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  persistSelectedSubproject(attachment.subprojectId || "");
  renderSubprojects();
}

async function openTaskComposerForDirectoryAttachment(attachment) {
  if (!attachment?.projectId) return;
  closeDirectoryEntryMenus();
  clearQuotedReply({ render: false });
  selectDirectoryAttachmentRoute(attachment);
  state.pendingTaskDirectory = attachment;
  state.taskDirectoryFilter = {
    projectId: attachment.projectId,
    subprojectId: attachment.subprojectId || "",
    label: attachment.label || "",
    directory: attachment,
  };
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  applyViewMode();
  await loadSingleWindow();
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function startTaskFromRootProject(button) {
  const projectId = button?.dataset?.startDirectoryTaskProject || "";
  const project = (state.projects || []).find((item) => item.id === projectId);
  const attachment = directoryAttachmentFromRoute(project?.id || "", "", project?.root || "", project ? directoryRootProjectLabel(project) : "");
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function startTaskFromDirectoryPath(button) {
  const pathText = button?.dataset?.startDirectoryTaskPath || "";
  const label = button?.dataset?.startDirectoryTaskLabel || "";
  const route = resolveDirectoryProjectRoute({ label, path: pathText });
  if (!route) throw new Error("No directory route is available for this folder.");
  const attachment = directoryAttachmentFromRoute(route.projectId, route.subprojectId || "", pathText, logicalDirectoryDisplayPath(pathText, label));
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function unshareDirectory(button) {
  const id = button?.dataset?.unshareDirectoryId || "";
  if (!id) return;
  if (!window.confirm("取消共享这个目录？其他工作区将不再看到它。")) return;
  await api("/api/directories/unshare", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, id }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function toggleSharedDirectoryAccess(button) {
  const id = button?.dataset?.editShareDirectoryId || "";
  state.sharedDirectoryAccessId = state.sharedDirectoryAccessId === id ? "" : id;
  renderDirectoryView();
}

function toggleShareTargetControls(input) {
  const controls = input?.closest?.("[data-share-controls]");
  const targets = controls?.querySelector?.(".shared-directory-targets");
  if (targets) targets.hidden = Boolean(input.checked);
}

async function updateSharedDirectoryAccess(button) {
  const id = button?.dataset?.saveShareDirectoryId || "";
  const controls = button?.closest?.("[data-share-controls]");
  if (!id || !controls) return;
  const allWorkspaces = Boolean(controls.querySelector("[data-share-all]")?.checked);
  const targetWorkspaceIds = [...controls.querySelectorAll("[data-share-target]:checked")]
    .map((input) => input.value)
    .filter(Boolean);
  await api("/api/directories/share/update", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      id,
      permission: controls.querySelector("[data-share-permission]")?.value || "read_write",
      scope: allWorkspaces ? "all_workspaces" : "selected_workspaces",
      targetWorkspaceIds,
    }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function wireDirectorySwipe(root) {
  const shell = root.querySelector(".directory-shell");
  if (!shell) return;
  if (shell.dataset.directorySwipeBound) return;
  shell.dataset.directorySwipeBound = "1";
  const interactiveSelector = ".directory-entry-menu-wrap, .directory-commandbar, input, select, textarea, [contenteditable='true']";
  const clearSwipe = () => {
    state.directorySwipe = null;
  };
  const canSwipeDirectoryUp = () => (
    isMobileLayout()
    && state.viewMode === "projects"
    && !state.directoryLoading
    && Boolean(directoryActivePath())
  );
  shell.addEventListener("touchstart", (event) => {
    if (!canSwipeDirectoryUp() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      clearSwipe();
      return;
    }
    const point = event.touches[0];
    state.directorySwipe = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      dragging: false,
      accepted: false,
      shell,
    };
  }, { passive: true });
  shell.addEventListener("touchmove", (event) => {
    const swipe = state.directorySwipe;
    if (!swipe || !canSwipeDirectoryUp() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - swipe.startX;
    const dy = point.clientY - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    swipe.dragging = true;
    swipe.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const velocity = dx / elapsed;
    swipe.accepted = dx > 58 || velocity > 0.55;
    const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
    shell.classList.add("directory-dragging");
    shell.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
    shell.style.opacity = "";
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false });
  shell.addEventListener("touchend", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (!swipe?.dragging) return;
    if (swipe.accepted) {
      navigateDirectoryUp({ exitShell: swipe.shell, animateEntry: true }).catch(showError);
    } else {
      settleDirectorySwipeShell(swipe.shell, false);
    }
  }, { passive: true });
  shell.addEventListener("touchcancel", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (swipe?.dragging) settleDirectorySwipeShell(swipe.shell, false);
  }, { passive: true });
}

function wireDirectoryView(root) {
  wireDirectorySwipe(root);
  root.querySelector("[data-directory-refresh]")?.addEventListener("click", () => loadDirectoryView().catch(showError));
  root.querySelector("[data-directory-new]")?.addEventListener("click", () => createDirectoryFolder().catch(showError));
  const uploadInput = root.querySelector("#directoryUploadInput");
  root.querySelector("[data-directory-upload]")?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", () => uploadDirectoryFiles(uploadInput.files).catch(showError));
  root.querySelectorAll("[data-directory-entry-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDirectoryEntryMenu(button);
    });
  });
  root.querySelectorAll(".directory-entry-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  root.querySelectorAll("[data-directory-crumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.directoryCrumb || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-project-directory]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.openProjectDirectory || "";
      const project = state.projects.find((item) => item.id === projectId);
      if (!project?.root) return;
      state.selectedProjectId = project.id;
      localStorage.setItem("hermesWebProject", state.selectedProjectId);
      if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
      persistSelectedSubproject("");
      renderSubprojects();
      state.directoryPath = project.root;
      state.directoryRootPath = project.root;
      state.sharedDirectoryManagerOpen = false;
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-directory-path]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.openDirectoryPath || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-share-root-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      shareRootDirectoryProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromRootProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromDirectoryPath(button).catch(showError);
    });
  });
  root.querySelector("[data-close-shared-directory-manager]")?.addEventListener("click", () => {
    closeSharedDirectoryManager();
  });
  root.querySelectorAll("[data-unshare-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      unshareDirectory(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-edit-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSharedDirectoryAccess(button);
    });
  });
  root.querySelectorAll("[data-share-all]").forEach((input) => {
    input.addEventListener("change", () => toggleShareTargetControls(input));
  });
  root.querySelectorAll("[data-save-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateSharedDirectoryAccess(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-delete-directory-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      deleteDirectoryEntry(button).catch(showError);
    });
  });
}

function renderSubprojects() {
  const subprojectSelect = $("subprojectSelect");
  const project = currentProject();
  const options = directoryRouteOptions(project);
  if (!options.length) {
    persistSelectedSubproject("");
    subprojectSelect.innerHTML = `<option value="">Root</option>`;
    subprojectSelect.disabled = true;
    return;
  }
  if (!options.some((item) => item.id === state.selectedSubprojectId)) {
    persistSelectedSubproject("");
  }
  subprojectSelect.disabled = false;
  subprojectSelect.innerHTML = renderDirectorySubprojectOptions(project);
  subprojectSelect.value = state.selectedSubprojectId || "";
}

function applyViewMode() {
  const single = state.viewMode === "single";
  const tasks = state.viewMode === "tasks";
  const directory = state.viewMode === "projects";
  const automation = state.viewMode === "automation";
  const learning = state.viewMode === "learning";
  const todos = state.viewMode === "todos";
  if (!(single && state.singleWindowMode === "chat")) renderChatScopeHeader(null);
  $("app")?.classList.toggle("todo-mode", todos);
  $("app")?.classList.toggle("automation-mode", automation);
  $("app")?.classList.toggle("learning-mode", learning);
  $("app")?.classList.toggle("projects-mode", directory);
  $("chatManagementMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("taskManagementMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("bottomChatMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("bottomTasksMode")?.classList.toggle("active", tasks || (single && state.singleWindowMode === "task"));
  $("singleMode")?.classList.toggle("active", single && state.singleWindowMode === "chat");
  $("singleTaskMode")?.classList.toggle("active", single && state.singleWindowMode === "task");
  $("tasksMode")?.classList.toggle("active", tasks);
  $("projectsMode").classList.toggle("active", directory);
  $("bottomProjectsMode")?.classList.toggle("active", directory);
  $("automationMode")?.classList.toggle("active", automation);
  $("bottomAutomationMode")?.classList.toggle("active", automation);
  $("learningMode")?.classList.toggle("active", learning);
  $("bottomLearningMode")?.classList.toggle("active", learning);
  $("todosMode").classList.toggle("active", todos);
  $("bottomTodosMode")?.classList.toggle("active", todos);
  $("taskModeControls")?.classList.add("hidden");
  $("routeFields").classList.add("hidden");
  $("directoryEntry")?.classList.add("hidden");
  $("directoryEntry")?.parentElement?.classList.add("hidden");
  $("newThread").classList.toggle("hidden", single || tasks || automation || learning || directory || todos);
  $("newThread").disabled = single || tasks || automation || learning || directory || todos;
  $("newThread").textContent = todos ? "新建看板卡片" : "新建话题";
  $("threadSearch").placeholder = single ? (state.singleWindowMode === "chat" ? "Search chat" : "Search topic stream") : tasks ? "Search topics" : todos ? "Search Kanban" : automation ? "Search automations" : learning ? "Search growth" : "Search directories";
  updateSearchButton();
}

async function loadSelectedView() {
  if (state.viewMode !== "projects") state.directoryReturnRoute = null;
  if (state.viewMode !== "todos") clearTodoAutoRefresh();
  applyViewMode();
  if (state.viewMode !== "tasks") state.skillDetail = null;
  if (state.viewMode === "single" || state.viewMode === "tasks") {
    if (state.viewMode === "tasks" && !state.currentTaskGroupId && restoreTaskListThreadFromCache({ stickToBottom: true })) {
      scheduleTaskListWindowRefresh();
      return;
    }
    await loadSingleWindow();
  } else if (state.viewMode === "todos") {
    await loadTodos({ preferCache: true });
    if (state.pendingReadingQuizTodoId && state.pendingReadingQuizTodoId === state.selectedTodoId) {
      const todoId = state.pendingReadingQuizTodoId;
      state.pendingReadingQuizTodoId = "";
      await loadReadingQuiz(todoId);
    }
    if (state.pendingAssessmentExamTodoId && state.pendingAssessmentExamTodoId === state.selectedTodoId) {
      const todoId = state.pendingAssessmentExamTodoId;
      state.pendingAssessmentExamTodoId = "";
      await loadAssessmentExam(todoId);
    }
  } else if (state.viewMode === "automation") {
    await loadAutomations();
  } else if (state.viewMode === "learning") {
    await loadLearningCoins();
  } else if (state.viewMode === "projects") {
    await loadDirectoryView();
  } else {
    await loadThreads();
  }
}

function renderAutomationPlaceholderView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) {
    list.innerHTML = `<div class="empty-state small">自动化管理入口已预留；后续接入 Hermes CRON / automation API。</div>`;
  }
  $("threadTitle").textContent = "自动化";
  $("threadMeta").textContent = "Automation management";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Automation management" });
  $("conversation").innerHTML = `
    <div class="empty-state">
      自动化入口已独立出来。当前版本尚未接入任务创建、暂停、运行接口；后续应直接桥接 Hermes CRON 的任务列表、运行状态和触发操作。
    </div>`;
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}
