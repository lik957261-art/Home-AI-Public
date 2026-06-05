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
  if (driveIndex >= 0) return state.displayConfig.ownerRootFallbackLabel || "Owner";
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
  if (!directoryActivePath()) {
    if (state.directoryReturnRoute) {
      restoreDirectoryReturnRoute();
      return true;
    }
    return false;
  }
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

function directoryEntryDocumentAttrs(entry) {
  if (entry?.type === "directory") return "";
  return ` data-task-doc data-artifact-name="${escapeHtml(entry?.name || "item")}" data-artifact-mime="${escapeHtml(entry?.mime || "")}"`;
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
