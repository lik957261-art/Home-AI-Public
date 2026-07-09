const DIRECTORY_AUTOMATION_MODEL_VERSION = "20260705-vite-directory-automation-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function normalizePath(value) {
  return cleanString(value, 4000).replaceAll("\\", "/").replace(/\/+$/g, "");
}

function comparablePath(value) {
  return normalizePath(value).toLowerCase();
}

function pathMatchesRoot(pathText, rootText) {
  const pathValue = comparablePath(pathText);
  const rootValue = comparablePath(rootText);
  return Boolean(pathValue && rootValue && (pathValue === rootValue || pathValue.startsWith(`${rootValue}/`)));
}

function helperFn(helpers = {}, name, fallback) {
  return typeof helpers[name] === "function" ? helpers[name] : fallback;
}

function sharedProjectOwnerLabel(project = {}) {
  return cleanString(project.sharedByLabel || project.createdByLabel || project.sharedBy || project.createdBy, 240);
}

function sharedProjectRootOwnerLabel(project = {}, helpers = {}) {
  const root = normalizePath(project.root);
  const parts = root.split("/").filter(Boolean);
  const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
  if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
  const ownerDriveRootIndexForParts = helperFn(helpers, "ownerDriveRootIndexForParts", () => -1);
  if (ownerDriveRootIndexForParts(parts) >= 0) return cleanString(helpers.ownerRootFallbackLabel, 120);
  return "";
}

function projectDisplayLabel(project = {}) {
  return cleanString(project.label || project.id || "Project", 240);
}

function routeLabelParts(label) {
  return cleanString(label, 1000)
    .split(/\s*\/\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function routeChildParts(child = {}) {
  const parts = routeLabelParts(child.label || child.id);
  const subProject = parts[0] || cleanString(child.label || child.id || "Item", 240);
  return Object.freeze({ subProject });
}

function routeGroupsPlan(input = {}) {
  const project = input.project && typeof input.project === "object" ? input.project : {};
  const helpers = input.helpers || {};
  const directoryAliasKey = helperFn(helpers, "directoryAliasKey", (value) => cleanString(value, 240).toLowerCase());
  const comparePath = helperFn(helpers, "comparableDirectoryPath", comparablePath);
  const groups = new Map();
  for (const child of Array.isArray(project.children) ? project.children : []) {
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
    if (!group.rootChild || comparePath(child.root).length < comparePath(group.rootChild.root).length) {
      group.rootChild = child;
    }
  }
  return Object.freeze([...groups.values()].map((group) => Object.freeze(group)));
}

function selectDefaultRouteItem(group = {}) {
  return cleanString(group.rootChild?.id, 240);
}

function directoryRouteOptionsPlan(input = {}) {
  return Object.freeze(routeGroupsPlan(input)
    .map((group) => Object.freeze({ id: selectDefaultRouteItem(group), label: cleanString(group.label, 240) }))
    .filter((item) => item.id));
}

function directoryActivePathPlan(input = {}) {
  return cleanString(input.previewPath || input.directoryPreview?.path || input.directoryPath, 4000);
}

function directoryParentPathPlan(pathText) {
  const normalized = normalizePath(pathText);
  if (!normalized || normalized === "/") return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") || "/";
}

function managedRootProject(project = {}) {
  const source = cleanString(project.source, 240);
  return /^project-directory-map/.test(source)
    || /^workspace-directory/.test(source)
    || project.remote === "wsl";
}

function rootProjectCanSeedCreateBase(project = {}) {
  if (!project.root || project.hidden || project.singleWindow || isDirectorySharedRootProjectPlan(project)) return false;
  if (["general", "sync", "download"].includes(cleanString(project.id, 120))) return false;
  return managedRootProject(project);
}

function directoryRootCreateBasePathPlan(input = {}) {
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  const comparePath = helperFn(helpers, "comparableDirectoryPath", comparablePath);
  const workspaceRoot = cleanString(input.workspace?.defaultWorkspace, 4000);
  const rootProjects = (Array.isArray(input.rootProjects) ? input.rootProjects : [])
    .filter(rootProjectCanSeedCreateBase);
  if (workspaceRoot && rootProjects.some((project) => matchesRoot(project.root, workspaceRoot))) return workspaceRoot;
  const parentCounts = new Map();
  for (const project of rootProjects) {
    const parent = directoryParentPathPlan(project.root);
    if (!parent) continue;
    const key = comparePath(parent);
    if (!key) continue;
    const existing = parentCounts.get(key) || { path: parent, count: 0 };
    existing.count += 1;
    parentCounts.set(key, existing);
  }
  const commonParent = [...parentCounts.values()].sort((a, b) => b.count - a.count || a.path.length - b.path.length)[0];
  return commonParent?.path || workspaceRoot || "";
}

function directoryCreateBasePathPlan(input = {}) {
  return cleanString(input.activePath, 4000) || directoryRootCreateBasePathPlan(input);
}

function matchingDirectoryProjectPlan(input = {}) {
  const active = cleanString(input.pathText, 4000);
  if (!active) return null;
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  const comparePath = helperFn(helpers, "comparableDirectoryPath", comparablePath);
  const selected = input.selectedProject || null;
  if (selected?.root && matchesRoot(active, selected.root)) return selected;
  return (Array.isArray(input.projects) ? input.projects : [])
    .filter((item) => item?.root && matchesRoot(active, item.root))
    .sort((a, b) => comparePath(b.root).length - comparePath(a.root).length)[0] || null;
}

function directoryBoundaryTargetPlan(input = {}) {
  const active = cleanString(input.pathText, 4000);
  if (!active) return null;
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  const comparePath = helperFn(helpers, "comparableDirectoryPath", comparablePath);
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const directoryRootPath = cleanString(input.directoryRootPath, 4000);
  if (directoryRootPath && matchesRoot(active, directoryRootPath)) {
    const project = projects.find((item) => comparePath(item?.root) === comparePath(directoryRootPath));
    return Object.freeze({
      id: cleanString(project?.id || "directory-root", 120),
      label: cleanString(project?.label || project?.id || "Directory", 240),
      root: directoryRootPath,
    });
  }
  const project = matchingDirectoryProjectPlan(input);
  if (project?.root) return project;
  const workspace = input.workspace || {};
  if (workspace.defaultWorkspace && matchesRoot(active, workspace.defaultWorkspace)) {
    return Object.freeze({
      id: cleanString(workspace.id || "workspace", 120),
      label: cleanString(workspace.label || workspace.id || "Workspace", 240),
      root: cleanString(workspace.defaultWorkspace, 4000),
    });
  }
  return input.currentTarget || null;
}

function isDirectoryAtRouteRootPlan(input = {}) {
  const target = directoryBoundaryTargetPlan(input);
  if (!target?.root) return true;
  const active = comparablePath(input.pathText);
  const root = comparablePath(target.root);
  return !active || active === root;
}

function parentDirectoryPathPlan(input = {}) {
  const target = directoryBoundaryTargetPlan(input);
  const active = normalizePath(input.pathText);
  if (!active || !target?.root || isDirectoryAtRouteRootPlan(input)) return "";
  const parts = active.split("/");
  if (parts.length <= 1) return "";
  const parent = parts.slice(0, -1).join("/") || "/";
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  if (!matchesRoot(parent, target.root)) return target.root;
  return parent;
}

function directoryAttachmentFromRoutePlan(input = {}) {
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  const routeDisplayPath = helperFn(helpers, "directoryRouteDisplayPath", (_route, fallback) => fallback);
  const project = input.project || null;
  if (!project?.root) return null;
  const subprojectId = cleanString(input.subprojectId, 240);
  const child = subprojectId ? (Array.isArray(project.children) ? project.children : []).find((item) => item.id === subprojectId) : null;
  const routeRoot = child?.root || project.root;
  const requestedPath = cleanString(input.pathText, 4000);
  const directoryPath = requestedPath && matchesRoot(requestedPath, routeRoot) ? requestedPath : routeRoot;
  const fallbackLabel = child
    ? `${projectDisplayLabel(project)} / ${cleanString(child.label || child.id, 240)}`
    : projectDisplayLabel(project);
  const routeLabel = cleanString(input.label, 500) || routeDisplayPath({
    projectId: project.id,
    subprojectId: child?.id || "",
    label: child?.label || project.label || project.id,
    root: routeRoot,
  }, fallbackLabel);
  return Object.freeze({
    projectId: cleanString(project.id, 240),
    subprojectId: cleanString(child?.id, 240),
    label: routeLabel,
    path: directoryPath,
    root: routeRoot,
  });
}

function directoryAttachmentForFilterPlan(input = {}) {
  const filter = input.filter || {};
  if (!filter.projectId) return null;
  if (filter.directory?.projectId && (filter.directory.root || filter.directory.path)) return filter.directory;
  const project = (Array.isArray(input.projects) ? input.projects : []).find((item) => item.id === filter.projectId);
  return directoryAttachmentFromRoutePlan({
    project,
    subprojectId: filter.subprojectId || "",
    pathText: "",
    label: filter.label || "",
    helpers: input.helpers,
  });
}

function relativeTail(activePath, rootPath) {
  const active = normalizePath(activePath);
  const root = normalizePath(rootPath);
  if (!active || !root || comparablePath(active) === comparablePath(root)) return "";
  if (!pathMatchesRoot(active, root)) return "";
  return active.slice(root.length + 1);
}

function directoryBreadcrumbItemsPlan(input = {}) {
  const active = cleanString(input.activePath, 4000);
  const items = [{ label: "目录", path: "" }];
  if (!active) return Object.freeze(items.map((item) => Object.freeze(item)));
  const normalizedActive = normalizePath(active);
  const helpers = input.helpers || {};
  const matchesRoot = helperFn(helpers, "pathMatchesDirectoryRoot", pathMatchesRoot);
  const comparePath = helperFn(helpers, "comparableDirectoryPath", comparablePath);
  const logicalDisplay = helperFn(helpers, "logicalDirectoryDisplayPath", (pathValue, label) => label || pathValue);
  const relativeDisplayTail = helperFn(helpers, "relativeDisplayTailForDirectory", relativeTail);
  const projectMatches = (Array.isArray(input.projects) ? input.projects : [])
    .filter((project) => project?.root && matchesRoot(normalizedActive, project.root))
    .sort((a, b) => comparePath(b.root).length - comparePath(a.root).length);
  const project = projectMatches[0] || null;
  if (!project) {
    items.push({ label: logicalDisplay(normalizedActive, "Directory"), path: normalizedActive });
    return Object.freeze(items.map((item) => Object.freeze(item)));
  }
  items.push({ label: projectDisplayLabel(project), path: project.root });
  const childMatches = (Array.isArray(project.children) ? project.children : [])
    .filter((child) => child?.root && matchesRoot(normalizedActive, child.root))
    .sort((a, b) => comparePath(b.root).length - comparePath(a.root).length);
  const child = childMatches[0] || null;
  const baseRoot = child?.root || project.root;
  if (child) items.push({ label: cleanString(child.label || child.id || "Folder", 240), path: child.root });
  const tail = relativeDisplayTail(normalizedActive, baseRoot);
  const pathParts = tail
    ? String(normalizedActive).slice(normalizePath(baseRoot).length + 1).split("/").filter(Boolean)
    : [];
  let cursor = normalizePath(baseRoot);
  for (const segment of pathParts) {
    cursor = `${cursor}/${segment}`;
    items.push({ label: segment, path: cursor });
  }
  if (!tail && items.length === 1) items.push({ label: projectDisplayLabel(project), path: project.root });
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

function directoryEntryKindPlan(input = {}) {
  const entry = input.entry || {};
  if (entry.type === "directory") return "dir";
  const artifactKind = helperFn(input.helpers || {}, "artifactKind", () => "");
  return artifactKind({ name: entry.name, mime: entry.mime });
}

function directoryEntryHrefPlan(input = {}) {
  const entry = input.entry || {};
  if (entry.type === "directory") return "#";
  const artifactHref = helperFn(input.helpers || {}, "artifactHref", () => "");
  return artifactHref({ url: entry.url, name: entry.name, mime: entry.mime, size: entry.size });
}

function directoryEntryDocumentAttrsPlan(input = {}) {
  const entry = input.entry || {};
  if (entry.type === "directory") return Object.freeze({ enabled: false, name: "", mime: "" });
  return Object.freeze({
    enabled: true,
    name: cleanString(entry.name || "item", 500),
    mime: cleanString(entry.mime, 500),
  });
}

function directoryEntryMetaPlan(input = {}) {
  const entry = input.entry || {};
  const helpers = input.helpers || {};
  const formatBytes = helperFn(helpers, "formatBytes", (value) => cleanString(value, 80));
  const formatTime = helperFn(helpers, "formatTime", (value) => cleanString(value, 120));
  if (entry.type === "directory") return formatTime(entry.mtime);
  return [formatBytes(entry.size), formatTime(entry.mtime)].filter(Boolean).join(" | ");
}

function directorySearchMatchesPlan(input = {}) {
  const entry = input.entry || {};
  const search = cleanString(input.search, 1000).toLowerCase();
  if (!search) return true;
  return [entry.name, entry.displayPath, entry.workspacePath, entry.mime]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes(search);
}

function isDirectorySharedRootProjectPlan(project = {}) {
  const source = cleanString(project.source, 240);
  return Boolean(project.shared) || source === "hermes-web-shared-directory" || /^shared-allowed-root/.test(source);
}

function directoryRootProjectLabelPlan(project = {}) {
  if (project.id === "sync") return "同步文件夹";
  if (project.id === "download") return "下载";
  return projectDisplayLabel(project);
}

function isShareableRootProjectPlan(project = {}) {
  if (!project.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(cleanString(project.id, 120))) return false;
  const source = cleanString(project.source, 240);
  return source === "project-directory-map"
    || source === "project-directory-map-top"
    || source === "workspace-directory"
    || source === "workspace-directory-wsl";
}

function canDeleteDirectoryRootProjectPlan(project = {}) {
  if (!project.root || project.hidden || project.singleWindow || project.shared) return false;
  if (["general", "sync", "download"].includes(cleanString(project.id, 120))) return false;
  const source = cleanString(project.source, 240);
  return source === "workspace-directory" || source === "workspace-directory-wsl";
}

export {
  DIRECTORY_AUTOMATION_MODEL_VERSION,
  canDeleteDirectoryRootProjectPlan,
  cleanString,
  directoryActivePathPlan,
  directoryAttachmentForFilterPlan,
  directoryAttachmentFromRoutePlan,
  directoryBoundaryTargetPlan,
  directoryBreadcrumbItemsPlan,
  directoryCreateBasePathPlan,
  directoryEntryDocumentAttrsPlan,
  directoryEntryHrefPlan,
  directoryEntryKindPlan,
  directoryEntryMetaPlan,
  directoryParentPathPlan,
  directoryRootCreateBasePathPlan,
  directoryRootProjectLabelPlan,
  directoryRouteOptionsPlan,
  directorySearchMatchesPlan,
  isDirectoryAtRouteRootPlan,
  isDirectorySharedRootProjectPlan,
  isShareableRootProjectPlan,
  matchingDirectoryProjectPlan,
  parentDirectoryPathPlan,
  projectDisplayLabel,
  routeChildParts,
  routeGroupsPlan,
  routeLabelParts,
  selectDefaultRouteItem,
  sharedProjectOwnerLabel,
  sharedProjectRootOwnerLabel,
};
