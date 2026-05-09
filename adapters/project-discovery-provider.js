"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function trace(label) {
  const tracePath = process.env.HERMES_MOBILE_BOOT_TRACE_PATH || process.env.HERMES_WEB_BOOT_TRACE_PATH || "";
  if (!tracePath) return;
  try {
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, `${new Date().toISOString()} pid=${process.pid} ${label}\n`, "utf8");
  } catch (_) {}
}

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function hashId(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function comparablePath(value) {
  return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
}

function pathInsideAnyRoot(candidate, roots) {
  const key = comparablePath(candidate);
  if (!key) return false;
  return (roots || []).some((root) => {
    const rootKey = comparablePath(root);
    return rootKey && (key === rootKey || key.startsWith(`${rootKey}/`));
  });
}

function joinDisplayPath(parent, name) {
  const base = String(parent || "");
  if (base.includes("/") && !base.includes("\\")) return `${base.replace(/\/+$/, "")}/${name}`;
  return path.join(base, name);
}

function isUserProjectDirectory(name) {
  const text = String(name || "").trim();
  if (!text) return false;
  if (text.startsWith(".") || text.startsWith("@") || text.startsWith("#")) return false;
  if (/^(__pycache__|node_modules|pydeps)$/i.test(text)) return false;
  if (/^\.?venv/i.test(text)) return false;
  return true;
}

function projectLabel(entry, fallback = "") {
  const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter(Boolean) : [];
  if (aliases.length) return String(aliases[0]);
  return String(fallback || entry.project_key || "Project");
}

function normalizeDriveRootNames(value) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  const names = raw.map((item) => String(item || "").trim()).filter(Boolean);
  return names.length ? names : ["ChatGPT-Drive"];
}

function ownerDriveRootIndex(parts, ownerDriveRootNames) {
  const roots = new Set(normalizeDriveRootNames(ownerDriveRootNames).map((item) => item.toLowerCase()));
  return (parts || []).findIndex((part) => roots.has(String(part || "").trim().toLowerCase()));
}

function chatGptDriveParts(root, ownerDriveRootNames) {
  const parts = String(root || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  const index = ownerDriveRootIndex(parts, ownerDriveRootNames);
  if (index < 0) return [];
  return parts.slice(index + 1);
}

function chatGptDriveRootWithParts(root, countAfterDrive, ownerDriveRootNames) {
  const normalized = String(root || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const index = ownerDriveRootIndex(parts, ownerDriveRootNames);
  const count = Math.max(1, Number(countAfterDrive || 1));
  const end = index + 1 + count;
  if (index < 0 || parts.length < end) return "";
  return `${normalized.startsWith("/") ? "/" : ""}${parts.slice(0, end).join("/")}`;
}

function chatGptDriveTopRoot(root, ownerDriveRootNames) {
  return chatGptDriveRootWithParts(root, 1, ownerDriveRootNames);
}

function chatGptDriveRootFromEntries(projectEntries, ownerDriveRootNames) {
  for (const entry of projectEntries || []) {
    const root = String(entry.wsl_root || entry.windows_root || "").trim().replaceAll("\\", "/");
    const parts = root.split("/").filter(Boolean);
    const index = ownerDriveRootIndex(parts, ownerDriveRootNames);
    if (index >= 0) return `${root.startsWith("/") ? "/" : ""}${parts.slice(0, index + 1).join("/")}`;
  }
  return "";
}

function createProjectDiscoveryProvider(options = {}) {
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : (value) => String(value || "");
  const runDirectoryBridge = typeof options.runDirectoryBridge === "function"
    ? options.runDirectoryBridge
    : async () => ({ ok: false, entries: [] });
  const sharedProjectsForWorkspace = typeof options.sharedProjectsForWorkspace === "function"
    ? options.sharedProjectsForWorkspace
    : () => [];
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : (workspaceId) => String(workspaceId || "owner");
  const findWorkspace = typeof options.findWorkspace === "function"
    ? options.findWorkspace
    : () => null;
  const makeId = typeof options.makeId === "function" ? options.makeId : (prefix) => `${prefix}-${hashId(`${prefix}:${Date.now()}`)}`;
  const singleWindowProjectId = String(options.singleWindowProjectId || "single-window");
  const singleWindowThreadTitle = String(options.singleWindowThreadTitle || "Single Window");
  const ownerDriveRootNames = normalizeDriveRootNames(options.ownerDriveRootNames || ["ChatGPT-Drive"]);
  const repoRoot = String(options.repoRoot || "");

  function singleWindowProjectForWorkspace(workspace, projectEntries) {
    return {
      id: singleWindowProjectId,
      workspaceId: workspace.id,
      label: singleWindowThreadTitle,
      root: workspace.id === "owner"
        ? (chatGptDriveRootFromEntries(projectEntries, ownerDriveRootNames) || workspace.defaultWorkspace || repoRoot)
        : (workspace.defaultWorkspace || ""),
      aliases: ["single", "inbox", "weixin", "stream"],
      source: "single-window",
      hidden: true,
      singleWindow: true,
    };
  }

  function workspaceSpecialRoots(policy) {
    return new Set([
      comparablePath(policy.sync_root || ""),
      comparablePath(policy.download_root || ""),
      ...(policy.cache_roots || []).map(comparablePath),
    ].filter(Boolean));
  }

  function explicitSharedRootKeys(policy, defaultRoot, specialRoots) {
    return new Set(dedupe(policy.allowed_roots || [])
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean)
      .filter((candidate) => !specialRoots.has(comparablePath(candidate)))
      .filter((candidate) => !defaultRoot || comparablePath(candidate) !== comparablePath(defaultRoot))
      .map(comparablePath));
  }

  function workspaceDirectoryChildren(workspaceId, displayRoot, localRoot, policy) {
    let entries = [];
    try {
      trace(`projectDiscovery.workspaceDirectoryChildren before readdir ${workspaceId}`);
      entries = fs.readdirSync(localRoot, { withFileTypes: true });
      trace(`projectDiscovery.workspaceDirectoryChildren after readdir ${workspaceId} entries=${entries.length}`);
    } catch (_) {
      trace(`projectDiscovery.workspaceDirectoryChildren readdir failed ${workspaceId}`);
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() && isUserProjectDirectory(entry.name))
      .map((entry) => {
        const childRoot = joinDisplayPath(displayRoot, entry.name);
        if (!pathInsideAnyRoot(childRoot, policy.allowed_roots || [displayRoot])) return null;
        return {
          id: `dir-${hashId(childRoot)}`,
          workspaceId,
          label: entry.name,
          root: childRoot,
          aliases: [entry.name],
          source: "workspace-directory-child",
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "zh-Hans-CN"));
  }

  function workspaceDirectoryProject(workspaceId, label, displayRoot, localPath, policy, source, workspaceRecord = null) {
    const sourceName = String(source || "");
    const shared = sourceName === "shared-allowed-root" || sourceName.startsWith("shared-allowed-root-");
    const workspace = shared ? (workspaceRecord || findWorkspace(workspaceId)) : null;
    const principalId = shared ? String(workspace?.policy?.principal_id || workspace?.id || workspaceId || "") : "";
    const project = {
      id: `dir-${hashId(displayRoot)}`,
      workspaceId,
      label,
      root: displayRoot,
      aliases: [label],
      source,
      shared,
      children: workspaceDirectoryChildren(workspaceId, displayRoot, localPath, policy),
    };
    if (shared) {
      project.sharedBy = workspaceId;
      project.sharedByPrincipalId = principalId;
      project.sharedByLabel = workspace?.label || workspaceId || principalId;
    }
    return project;
  }

  function sharedAllowedRootProjects(workspace, policy, defaultRoot, specialRoots) {
    const roots = dedupe(policy.allowed_roots || [])
      .filter((candidate) => {
        const value = String(candidate || "").trim();
        if (!value || specialRoots.has(comparablePath(value))) return false;
        if (defaultRoot && comparablePath(value) === comparablePath(defaultRoot)) return false;
        return true;
      });
    return roots
      .map((displayRoot) => {
        const localRoot = normalizeLocalPath(displayRoot);
        if (!localRoot) return null;
        let stat = null;
        try {
          trace(`projectDiscovery.sharedAllowedRoot before stat ${workspace.id}`);
          stat = fs.statSync(localRoot);
          trace(`projectDiscovery.sharedAllowedRoot after stat ${workspace.id}`);
        } catch (_) {
          trace(`projectDiscovery.sharedAllowedRoot stat failed ${workspace.id}`);
          return null;
        }
        if (!stat.isDirectory()) return null;
        const label = path.basename(localRoot) || displayRoot.split(/[\\/]/).filter(Boolean).pop() || "Shared";
        if (!isUserProjectDirectory(label)) return null;
        return workspaceDirectoryProject(workspace.id, label, displayRoot, localRoot, policy, "shared-allowed-root", workspace);
      })
      .filter(Boolean);
  }

  function workspaceDirectoryProjects(workspace, policy) {
    const projects = [];
    const root = String(workspace.defaultWorkspace || policy.default_workspace || "").trim();
    const localRoot = normalizeLocalPath(root);
    const specialRoots = workspaceSpecialRoots(policy);
    const sharedRootKeys = explicitSharedRootKeys(policy, root, specialRoots);
    if (root && localRoot && pathInsideAnyRoot(root, policy.allowed_roots || [root])) {
      let entries = [];
      try {
        trace(`projectDiscovery.workspaceDirectory before readdir ${workspace.id}`);
        entries = fs.readdirSync(localRoot, { withFileTypes: true });
        trace(`projectDiscovery.workspaceDirectory after readdir ${workspace.id} entries=${entries.length}`);
      } catch (_) {
        trace(`projectDiscovery.workspaceDirectory readdir failed ${workspace.id}`);
        entries = [];
      }
      projects.push(...entries
        .filter((entry) => entry.isDirectory() && isUserProjectDirectory(entry.name))
        .map((entry) => {
          const displayRoot = joinDisplayPath(root, entry.name);
          if (specialRoots.has(comparablePath(displayRoot))) return null;
          const localPath = path.join(localRoot, entry.name);
          if (!pathInsideAnyRoot(displayRoot, policy.allowed_roots || [root])) return null;
          const source = sharedRootKeys.has(comparablePath(displayRoot)) ? "shared-allowed-root" : "workspace-directory";
          return workspaceDirectoryProject(workspace.id, entry.name, displayRoot, localPath, policy, source, workspace);
        })
        .filter(Boolean));
    }
    projects.push(...sharedAllowedRootProjects(workspace, policy, root, specialRoots));
    return dedupeProjects(projects)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "zh-Hans-CN"));
  }

  function remoteWorkspaceDirectoryChildren(workspaceId, displayRoot, entries, policy) {
    return (entries || [])
      .filter((entry) => entry?.type === "directory" && isUserProjectDirectory(entry.name))
      .map((entry) => {
        const childRoot = String(entry.path || joinDisplayPath(displayRoot, entry.name));
        if (!pathInsideAnyRoot(childRoot, policy.allowed_roots || [displayRoot])) return null;
        return {
          id: `dir-${hashId(childRoot)}`,
          workspaceId,
          label: String(entry.name || path.posix.basename(childRoot) || "Directory"),
          root: childRoot,
          aliases: [String(entry.name || "")].filter(Boolean),
          source: "workspace-directory-child-wsl",
          remote: "wsl",
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "zh-Hans-CN"));
  }

  async function remoteWorkspaceDirectoryProjects(workspace) {
    const policy = workspace.policy || {};
    const root = String(workspace.defaultWorkspace || policy.default_workspace || "").trim();
    if (!root.startsWith("/volume1/")) return [];
    let result;
    try {
      result = await runDirectoryBridge({ action: "tree", path: root });
    } catch (_) {
      return [];
    }
    if (!result?.ok || !Array.isArray(result.entries)) return [];
    const specialRoots = workspaceSpecialRoots(policy);
    const sharedRootKeys = explicitSharedRootKeys(policy, root, specialRoots);
    const allowedRoots = policy.allowed_roots || [root];
    const projects = [];
    for (const entry of result.entries) {
      if (entry?.type !== "directory" || !isUserProjectDirectory(entry.name)) continue;
      const displayRoot = String(entry.path || joinDisplayPath(root, entry.name));
      if (specialRoots.has(comparablePath(displayRoot))) continue;
      if (!pathInsideAnyRoot(displayRoot, allowedRoots)) continue;
      const source = sharedRootKeys.has(comparablePath(displayRoot)) ? "shared-allowed-root-wsl" : "workspace-directory-wsl";
      const shared = source === "shared-allowed-root-wsl";
      const principalId = shared ? workspacePrincipal(workspace.id) : "";
      const project = {
        id: `dir-${hashId(displayRoot)}`,
        workspaceId: workspace.id,
        label: String(entry.name || path.posix.basename(displayRoot) || "Directory"),
        root: displayRoot,
        aliases: [String(entry.name || "")].filter(Boolean),
        source,
        shared,
        remote: "wsl",
        children: remoteWorkspaceDirectoryChildren(workspace.id, displayRoot, entry.children || [], policy),
      };
      if (shared) {
        project.sharedBy = workspace.id;
        project.sharedByPrincipalId = principalId;
        project.sharedByLabel = workspace.label || workspace.id || principalId;
      }
      projects.push(project);
    }
    return dedupeProjects(projects)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "zh-Hans-CN"));
  }

  function projectFromEntry(entry, workspaceId, labelOverride = "") {
    return {
      id: String(entry.project_key || `project-${hashId(entry.wsl_root || entry.windows_root || JSON.stringify(entry))}`),
      workspaceId,
      label: labelOverride || projectLabel(entry),
      root: String(entry.wsl_root || entry.windows_root || "").trim(),
      aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String) : [],
      source: "project-directory-map",
    };
  }

  function mergeOwnerSubdirectory(group, entry, workspaceId, topSegment, parts, projectRoot) {
    const subSegment = parts[1];
    if (!subSegment) return;
    const subRoot = chatGptDriveRootWithParts(projectRoot, 2, ownerDriveRootNames) || projectRoot;
    const key = comparablePath(subRoot);
    const aliases = dedupe([
      subSegment,
      `${topSegment} / ${subSegment}`,
      ...(Array.isArray(entry.aliases) ? entry.aliases.map(String) : []),
    ]);
    const existing = (group.children || []).find((child) => comparablePath(child.root) === key);
    if (existing) {
      existing.aliases = dedupe([...(existing.aliases || []), ...aliases]);
      if (parts.length === 2 && entry.project_key) existing.id = String(entry.project_key);
      return;
    }
    const child = projectFromEntry(Object.assign({}, entry, {
      project_key: parts.length === 2 ? entry.project_key : `sub-${hashId(subRoot)}`,
      wsl_root: subRoot,
      windows_root: "",
      aliases,
    }), workspaceId, subSegment);
    child.source = "project-directory-map-subdirectory";
    group.children.push(child);
  }

  function addPhysicalOwnerTopLevelProjects(groups, workspaceId, projectEntries, fallbackDriveRoot = "") {
    const driveRoot = chatGptDriveRootFromEntries(projectEntries, ownerDriveRootNames)
      || String(fallbackDriveRoot || "").trim();
    if (!driveRoot) return;
    const localRoot = normalizeLocalPath(driveRoot);
    let entries = [];
    try {
      trace(`projectDiscovery.ownerPhysical before readdir ${workspaceId}`);
      entries = fs.readdirSync(localRoot, { withFileTypes: true });
      trace(`projectDiscovery.ownerPhysical after readdir ${workspaceId} entries=${entries.length}`);
    } catch (_) {
      trace(`projectDiscovery.ownerPhysical readdir failed ${workspaceId}`);
      return;
    }
    const displayBase = driveRoot.replace(/[\\/]+$/g, "");
    for (const entry of entries) {
      if (!entry.isDirectory() || !isUserProjectDirectory(entry.name)) continue;
      const displayRoot = `${displayBase}/${entry.name}`;
      const groupKey = comparablePath(displayRoot);
      if (!groupKey || groups.has(groupKey)) continue;
      groups.set(groupKey, {
        id: `dir-${hashId(displayRoot)}`,
        workspaceId,
        label: entry.name,
        root: displayRoot,
        aliases: [entry.name],
        source: "workspace-directory",
        children: [],
      });
    }
  }

  function ownerTopLevelProjects(workspaceId, projectEntries, fallbackDriveRoot = "") {
    const groups = new Map();
    for (const entry of projectEntries || []) {
      const projectRoot = String(entry.wsl_root || entry.windows_root || "").trim();
      if (!projectRoot) continue;
      const parts = chatGptDriveParts(projectRoot, ownerDriveRootNames);
      if (!parts.length) continue;
      const topSegment = parts[0];
      const topRoot = chatGptDriveTopRoot(projectRoot, ownerDriveRootNames);
      const groupKey = comparablePath(topRoot || topSegment);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: `top-${hashId(topSegment)}`,
          workspaceId,
          label: topSegment,
          root: topRoot || projectRoot,
          aliases: [topSegment],
          source: "project-directory-map-top",
          children: [],
        });
      }
      const group = groups.get(groupKey);
      if (parts.length === 1) {
        group.id = String(entry.project_key || group.id);
        group.label = projectLabel(entry, topSegment);
        group.root = projectRoot;
        group.aliases = dedupe([topSegment, ...(group.aliases || []), ...(Array.isArray(entry.aliases) ? entry.aliases.map(String) : [])]);
        group.source = "project-directory-map-top";
        continue;
      }
      mergeOwnerSubdirectory(group, entry, workspaceId, topSegment, parts, projectRoot);
    }
    addPhysicalOwnerTopLevelProjects(groups, workspaceId, projectEntries, fallbackDriveRoot);
    return [...groups.values()].map((project) => {
      project.children = dedupeProjects(project.children || []);
      return project;
    });
  }

  function isSharedProject(project) {
    const source = String(project?.source || "");
    return Boolean(project?.shared)
      || source === "hermes-web-shared-directory"
      || source.startsWith("shared-allowed-root");
  }

  function isProjectRootDedupeExempt(project) {
    const id = String(project?.id || "");
    const source = String(project?.source || "");
    return Boolean(project?.hidden || project?.singleWindow)
      || ["general", "sync", "download", singleWindowProjectId].includes(id)
      || source === "workspace-default"
      || source === "single-window"
      || source === "acl";
  }

  function projectRootDedupeKey(project) {
    const root = comparablePath(project?.root || "");
    if (!root) return "";
    return `${String(project?.workspaceId || "")}:${root}`;
  }

  function dedupeProjects(projects) {
    const list = (projects || []).filter(Boolean);
    const sharedRootKeys = new Set(list
      .filter((project) => isSharedProject(project) && !isProjectRootDedupeExempt(project))
      .map(projectRootDedupeKey)
      .filter(Boolean));
    const seenIds = new Set();
    const seenSharedRoots = new Set();
    return list.filter((project) => {
      const key = `${project.workspaceId}:${project.id}`;
      if (seenIds.has(key)) return false;
      const rootKey = projectRootDedupeKey(project);
      const dedupeSharedRoot = rootKey && sharedRootKeys.has(rootKey) && !isProjectRootDedupeExempt(project);
      if (dedupeSharedRoot && !isSharedProject(project)) return false;
      if (dedupeSharedRoot && seenSharedRoots.has(rootKey)) return false;
      seenIds.add(key);
      if (dedupeSharedRoot) seenSharedRoots.add(rootKey);
      return true;
    });
  }

  function projectsForWorkspace(workspace, projectEntries, workspaces = null) {
    trace(`projectDiscovery.projectsForWorkspace enter ${workspace.id}`);
    const singleWindowProject = singleWindowProjectForWorkspace(workspace, projectEntries);
    const sharedProjects = sharedProjectsForWorkspace(workspace.id, workspaces);
    if (workspace.id === "owner") {
      const ownerProjects = ownerTopLevelProjects(workspace.id, projectEntries, workspace.defaultWorkspace);
      if (ownerProjects.length) return dedupeProjects([singleWindowProject, ...ownerProjects, ...sharedProjects]);
    }

    const out = [];
    const root = workspace.defaultWorkspace || "";
    out.push({ id: "general", workspaceId: workspace.id, label: "根目录", root, aliases: [], source: "workspace-default" });
    out.push(singleWindowProject);
    out.push(...sharedProjects);
    const policy = workspace.policy || {};
    const unrestricted = workspace.id === "owner" || policy.access_mode === "unrestricted";
    for (const entry of projectEntries) {
      const projectRoot = String(entry.wsl_root || entry.windows_root || "").trim();
      if (!projectRoot) continue;
      if (!unrestricted && !pathInsideAnyRoot(projectRoot, policy.allowed_roots || [])) continue;
      out.push({
        id: String(entry.project_key || makeId("project")),
        workspaceId: workspace.id,
        label: projectLabel(entry),
        root: projectRoot,
        aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String) : [],
        source: "project-directory-map",
      });
    }
    if (!unrestricted) out.push(...workspaceDirectoryProjects(workspace, policy));
    if (policy.sync_root) out.push({ id: "sync", workspaceId: workspace.id, label: "同步文件夹", root: policy.sync_root, aliases: [], source: "acl" });
    if (policy.download_root) out.push({ id: "download", workspaceId: workspace.id, label: "下载", root: policy.download_root, aliases: [], source: "acl" });
    return dedupeProjects(out);
  }

  function isShareableRootProject(project) {
    if (!project?.root || project.hidden || project.singleWindow || project.shared) return false;
    const id = String(project.id || "");
    if (["general", "sync", "download", singleWindowProjectId].includes(id)) return false;
    const source = String(project.source || "");
    return source === "project-directory-map"
      || source === "project-directory-map-top"
      || source === "workspace-directory"
      || source === "workspace-directory-wsl";
  }

  return {
    comparablePath,
    dedupeProjects,
    isShareableRootProject,
    isUserProjectDirectory,
    ownerTopLevelProjects,
    projectsForWorkspace,
    remoteWorkspaceDirectoryProjects,
    workspaceDirectoryProjects,
  };
}

module.exports = {
  createProjectDiscoveryProvider,
};
