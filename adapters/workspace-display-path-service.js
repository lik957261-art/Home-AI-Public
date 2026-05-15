"use strict";

const path = require("node:path");

function stringList(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(",") : (value ? [value] : []));
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function defaultComparablePath(value) {
  let p = String(value || "").trim().replaceAll("\\", "/");
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  p = p.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  p = p.replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  if (/^[a-z]:\//i.test(p)) {
    p = path.win32.normalize(p)
      .replaceAll("\\", "/")
      .replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  } else if (p.startsWith("/")) {
    p = path.posix.normalize(p);
  } else {
    p = path.posix.normalize(p);
  }
  return p.replace(/\/+$/g, "").toLowerCase();
}

function defaultPathInsideAnyRoot(candidate, roots, comparablePath = defaultComparablePath) {
  const normalized = comparablePath(candidate);
  if (!normalized) return false;
  return (roots || []).some((root) => {
    const r = comparablePath(root);
    return r && (normalized === r || normalized.startsWith(`${r}/`));
  });
}

function createWorkspaceDisplayPathService(options = {}) {
  const comparablePath = typeof options.comparablePath === "function" ? options.comparablePath : defaultComparablePath;
  const pathInsideAnyRoot = typeof options.pathInsideAnyRoot === "function"
    ? options.pathInsideAnyRoot
    : (candidate, roots) => defaultPathInsideAnyRoot(candidate, roots, comparablePath);
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : (value) => String(value || "");

  function ownerDriveRootNames() {
    return stringList(
      typeof options.ownerDriveRootNames === "function"
        ? options.ownerDriveRootNames()
        : (options.ownerDriveRootNames || "ChatGPT-Drive"),
    );
  }

  function ownerRootFallbackLabel() {
    return cleanText(
      typeof options.ownerRootFallbackLabel === "function"
        ? options.ownerRootFallbackLabel()
        : (options.ownerRootFallbackLabel || "Hermes Owner"),
      "Hermes Owner",
    );
  }

  function allProjectsForWorkspaceSync(workspaceId) {
    if (typeof options.allProjectsForWorkspaceSync === "function") {
      return options.allProjectsForWorkspaceSync(workspaceId) || [];
    }
    if (typeof options.loadCatalog === "function") {
      return (options.loadCatalog().projects || []).filter((item) => item.workspaceId === workspaceId);
    }
    return [];
  }

  function findWorkspace(workspaceId) {
    if (typeof options.findWorkspace === "function") return options.findWorkspace(workspaceId);
    if (typeof options.loadCatalog === "function") {
      return (options.loadCatalog().workspaces || []).find((item) => item.id === workspaceId) || null;
    }
    return null;
  }

  function ownerDriveRootIndex(parts) {
    const roots = new Set(ownerDriveRootNames()
      .map((name) => String(name || "").trim().toLowerCase())
      .filter(Boolean));
    return (parts || []).findIndex((part) => roots.has(String(part || "").trim().toLowerCase()));
  }

  function sharedProjectOwnerLabel(project) {
    return cleanText(project?.sharedByLabel || project?.createdByLabel || project?.sharedBy || project?.createdBy);
  }

  function sharedProjectRootOwnerLabel(project) {
    const root = String(project?.root || "").replaceAll("\\", "/");
    const parts = root.split("/").filter(Boolean);
    const volumeIndex = parts.findIndex((part) => part.toLowerCase() === "volume1");
    if (volumeIndex >= 0 && parts[volumeIndex + 1]) return parts[volumeIndex + 1];
    const driveIndex = ownerDriveRootIndex(parts);
    if (driveIndex >= 0) return ownerRootFallbackLabel();
    return "";
  }

  function sharedProjectDisplayLabel(project) {
    return project?.label || project?.id || "Project";
  }

  function routeSuffixParts(...items) {
    const suffixes = [];
    for (const item of items.filter(Boolean)) {
      const permission = String(item.permission || item.accessMode || item.access_mode || "").trim().toLowerCase();
      if (
        item.readOnly === true
        || item.readonly === true
        || permission === "read_only"
        || permission === "read-only"
        || permission === "readonly"
      ) {
        suffixes.push("read-only");
      }
      const source = String(item.source || item.direction || item.kind || item.referenceKind || "").trim().toLowerCase();
      if (
        item.inbound === true
        || item.isInbound === true
        || item.externalIngress
        || source === "inbound"
        || source.includes("inbound")
      ) {
        suffixes.push("inbound");
      }
    }
    return [...new Set(suffixes)];
  }

  function appendRouteSuffix(label, suffixes) {
    let out = cleanText(label);
    for (const suffix of suffixes || []) {
      if (!suffix) continue;
      const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(?:^|[\\s(,/.-])${escaped}(?:$|[\\s),/.-])`, "i").test(out)) continue;
      out = out ? `${out} (${suffix})` : suffix;
    }
    return out;
  }

  function directoryRouteDisplayLabel(project, child = null) {
    const projectLabel = sharedProjectDisplayLabel(project);
    const label = child ? `${projectLabel} / ${child.label || child.id || "Directory"}` : projectLabel;
    return appendRouteSuffix(label, routeSuffixParts(project, child));
  }

  function directoryRouteDisplayPath(route, projects = [], fallbackLabel = "") {
    const project = (projects || []).find((item) => item.id === route?.projectId) || null;
    const child = route?.subprojectId
      ? (project?.children || []).find((item) => item.id === route.subprojectId) || null
      : null;
    if (project && child) {
      return appendRouteSuffix(directoryRouteDisplayLabel(project, child), routeSuffixParts(route));
    }
    if (project) return appendRouteSuffix(directoryRouteDisplayLabel(project), routeSuffixParts(route));
    const label = route?.label || fallbackLabel || "";
    return appendRouteSuffix(label, routeSuffixParts(route));
  }

  function directoryRouteCandidatesForWorkspace(workspaceId) {
    const candidates = [];
    for (const project of allProjectsForWorkspaceSync(workspaceId).filter((item) => !item.hidden)) {
      if (project.source === "workspace-default") continue;
      if (project.root) {
        candidates.push({
          root: project.root,
          label: directoryRouteDisplayLabel(project),
          projectId: project.id,
          subprojectId: "",
          project,
        });
      }
      for (const child of project.children || []) {
        if (!child.root) continue;
        candidates.push({
          root: child.root,
          label: directoryRouteDisplayLabel(project, child),
          projectId: project.id,
          subprojectId: child.id || "",
          project,
          child,
        });
      }
    }
    return candidates.sort((a, b) => comparablePath(b.root).length - comparablePath(a.root).length);
  }

  function relativeDisplayTail(rawPath, rootPath) {
    const rawLocal = normalizeLocalPath(rawPath);
    const rootLocal = normalizeLocalPath(rootPath);
    if (rawLocal && rootLocal) {
      const relative = path.relative(rootLocal, rawLocal);
      if (relative && relative !== "." && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(/[\\/]+/g).filter(Boolean).join(" / ");
      }
    }
    const raw = String(rawPath || "").replaceAll("\\", "/");
    const root = String(rootPath || "").replaceAll("\\", "/").replace(/\/+$/g, "");
    if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
      return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
    }
    return "";
  }

  function logicalUserPathFallback(rawPath, fallbackLabel = "") {
    const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    const lowerParts = parts.map((part) => part.toLowerCase());
    const driveIndex = ownerDriveRootIndex(parts);
    if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
    const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
    if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
    const documentsIndex = lowerParts.findIndex((part) => part === "documents");
    const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
    if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
    if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
    const usersIndex = lowerParts.findIndex((part) => part === "users");
    if (usersIndex >= 0 && parts.length > usersIndex + 2) {
      return ["\u7528\u6237\u76ee\u5f55", ...parts.slice(usersIndex + 2)].join(" / ");
    }
    return fallbackLabel || path.basename(normalizeLocalPath(rawPath) || normalized) || "";
  }

  function logicalDirectoryDisplayPath(thread, rawPath, fallbackLabel = "") {
    const value = cleanText(rawPath);
    if (!value) return fallbackLabel || "";
    for (const candidate of directoryRouteCandidatesForWorkspace(thread?.workspaceId)) {
      if (
        !pathInsideAnyRoot(value, [candidate.root])
        && !pathInsideAnyRoot(normalizeLocalPath(value), [normalizeLocalPath(candidate.root)])
      ) {
        continue;
      }
      const tail = relativeDisplayTail(value, candidate.root);
      return [candidate.label, tail].filter(Boolean).join(" / ");
    }
    const workspace = findWorkspace(thread?.workspaceId);
    const workspaceRoot = workspace?.defaultWorkspace || workspace?.policy?.default_workspace || "";
    if (
      workspaceRoot
      && (
        pathInsideAnyRoot(value, [workspaceRoot])
        || pathInsideAnyRoot(normalizeLocalPath(value), [normalizeLocalPath(workspaceRoot)])
      )
    ) {
      const tail = relativeDisplayTail(value, workspaceRoot);
      return tail || fallbackLabel || workspace.label || "\u76ee\u5f55";
    }
    return logicalUserPathFallback(value, fallbackLabel);
  }

  return {
    appendRouteSuffix,
    comparablePath,
    directoryRouteCandidatesForWorkspace,
    directoryRouteDisplayLabel,
    directoryRouteDisplayPath,
    logicalDirectoryDisplayPath,
    logicalUserPathFallback,
    ownerDriveRootIndex,
    pathInsideAnyRoot,
    relativeDisplayTail,
    routeSuffixParts,
    sharedProjectDisplayLabel,
    sharedProjectOwnerLabel,
    sharedProjectRootOwnerLabel,
  };
}

module.exports = {
  createWorkspaceDisplayPathService,
  defaultComparablePath,
  defaultPathInsideAnyRoot,
};
