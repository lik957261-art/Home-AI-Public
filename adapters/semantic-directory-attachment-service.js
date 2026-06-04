"use strict";

const path = require("node:path");

function defaultDedupe(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function requireFunction(options, name) {
  if (typeof options[name] !== "function") {
    throw new TypeError(`semantic directory attachment service requires ${name}`);
  }
}

function defaultComparablePath(value) {
  let p = String(value || "").trim().replaceAll("\\", "/");
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  p = p.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  p = p.replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  if (/^[a-z]:\//i.test(p)) p = path.win32.normalize(p).replaceAll("\\", "/").replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  else if (p.startsWith("/")) p = path.posix.normalize(p);
  else p = path.posix.normalize(p);
  return p.replace(/\/+$/, "").toLowerCase();
}

function defaultSearchableText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function defaultTextIncludesPath(text, root, comparablePath = defaultComparablePath) {
  const raw = String(text || "").replaceAll("\\", "/").toLowerCase();
  const original = String(root || "").replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
  const comparable = comparablePath(root);
  return Boolean(
    (original && raw.includes(original))
      || (comparable && raw.includes(comparable))
  );
}

function pluginIdForTaskGroupId(taskGroupId = "") {
  const match = String(taskGroupId || "").trim().match(/^plugin:([a-z0-9_-]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function isPluginTaskGroupId(taskGroupId = "") {
  return Boolean(pluginIdForTaskGroupId(taskGroupId));
}

function createSemanticDirectoryAttachmentService(options = {}) {
  for (const name of [
    "allProjectsForWorkspaceSync",
    "isDirectoryBrowserPathAllowedForThread",
    "loadCatalog",
  ]) {
    requireFunction(options, name);
  }

  const comparablePath = typeof options.comparablePath === "function" ? options.comparablePath : defaultComparablePath;
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const directoryRouteDisplayLabel = typeof options.directoryRouteDisplayLabel === "function"
    ? options.directoryRouteDisplayLabel
    : ((project, child = null) => (child ? `${project?.label || project?.id || "Project"} / ${child.label || child.id || "Directory"}` : (project?.label || project?.id || "Project")));
  const effectiveProjectForThread = typeof options.effectiveProjectForThread === "function"
    ? options.effectiveProjectForThread
    : (() => ({}));
  const findProject = typeof options.findProject === "function" ? options.findProject : (() => null);
  const findSubproject = typeof options.findSubproject === "function" ? options.findSubproject : (() => null);
  const genericDirectoryAliasInstruction = String(options.genericDirectoryAliasInstruction || "If a semantic project match exists, do not emit a generic directory alias for the default directory; emit the matched project alias/path instead.");
  const genericOwnerTopicProjectIds = new Set((options.genericOwnerTopicProjectIds || ["hermes-sync-folder"]).map((item) => String(item || "")));
  const genericOwnerTopicProjectPrefixes = (options.genericOwnerTopicProjectPrefixes || ["owner-"]).map((item) => String(item || "")).filter(Boolean);
  const isSingleWindowConversationTaskGroupId = typeof options.isSingleWindowConversationTaskGroupId === "function"
    ? options.isSingleWindowConversationTaskGroupId
    : ((value) => ["chat", "group-chat"].includes(String(value || "")));
  const logicalDirectoryDisplayPath = typeof options.logicalDirectoryDisplayPath === "function"
    ? options.logicalDirectoryDisplayPath
    : ((_thread, rawPath, fallbackLabel = "") => rawPath || fallbackLabel);
  const normalizeLocalPath = typeof options.normalizeLocalPath === "function"
    ? options.normalizeLocalPath
    : ((value) => String(value || ""));
  const searchableText = typeof options.searchableText === "function" ? options.searchableText : defaultSearchableText;
  const singleWindowProjectId = String(options.singleWindowProjectId || "single-window");
  const textIncludesPath = typeof options.textIncludesPath === "function"
    ? options.textIncludesPath
    : ((text, root) => defaultTextIncludesPath(text, root, comparablePath));

  function pathInsideAnyRoot(candidate, roots) {
    const normalized = comparablePath(candidate);
    return (roots || []).some((root) => {
      const r = comparablePath(root);
      return Boolean(normalized && r && (normalized === r || normalized.startsWith(`${r}/`)));
    });
  }

  function directoryAliasLabels(project, parentLabel = "") {
    const labels = [
      project?.label,
      ...(Array.isArray(project?.aliases) ? project.aliases : []),
    ].filter(Boolean);
    if (parentLabel && project?.label) labels.push(`${parentLabel} / ${project.label}`);
    return labels;
  }

  function projectSearchLabels(project, parentLabel = "") {
    const labels = directoryAliasLabels(project, parentLabel);
    if (project?.label) labels.push(project.label);
    if (parentLabel && project?.label) labels.push(`${parentLabel}${project.label}`);
    return dedupe(labels.map(String).filter((label) => searchableText(label).length >= 2));
  }

  function isGenericOwnerTopicProjectId(projectId) {
    const value = String(projectId || "");
    return genericOwnerTopicProjectIds.has(value)
      || genericOwnerTopicProjectPrefixes.some((prefix) => value.startsWith(prefix));
  }

  function isDeliveryProjectMatch(match) {
    const projectId = String(match?.projectId || "");
    const root = comparablePath(match?.root || "");
    return isGenericOwnerTopicProjectId(projectId) || root.includes("hermes\u540c\u6b65\u6587\u4ef6\u5939");
  }

  function isContextAnchorProjectMatch(match) {
    if (!match?.root) return false;
    if (match.subprojectId) return false;
    if (isGenericOwnerTopicProjectId(match.projectId)) return false;
    if (match.projectId === singleWindowProjectId) return false;
    return true;
  }

  function suppressGenericOwnerTopicMatches(matches) {
    const anchors = (matches || []).filter(isContextAnchorProjectMatch);
    if (!anchors.length) return matches || [];
    return (matches || []).filter((match) => {
      if (!isGenericOwnerTopicProjectId(match.projectId)) return true;
      return anchors.some((anchor) => pathInsideAnyRoot(match.root, [anchor.root]));
    });
  }

  function semanticProjectMatches(thread, latestText) {
    const search = searchableText(latestText);
    if (!search) return [];
    const matches = [];
    const projects = (options.loadCatalog().projects || [])
      .filter((item) => item.workspaceId === thread?.workspaceId && !item.hidden);
    for (const project of projects) {
      for (const label of projectSearchLabels(project)) {
        const key = searchableText(label);
        if (key && search.includes(key)) {
          matches.push({
            projectId: project.id || "",
            subprojectId: "",
            label: project.label || label,
            alias: label,
            root: project.root || "",
            score: key.length * 100 + comparablePath(project.root).length,
          });
        }
      }
      for (const child of project.children || []) {
        const parentLabel = project.label || "";
        for (const label of projectSearchLabels(child, parentLabel)) {
          const key = searchableText(label);
          if (key && search.includes(key)) {
            matches.push({
              projectId: project.id || "",
              subprojectId: child.id || "",
              label: parentLabel ? `${parentLabel} / ${child.label || label}` : (child.label || label),
              alias: label,
              root: child.root || "",
              score: key.length * 100 + comparablePath(child.root).length,
            });
          }
        }
      }
    }
    const byRoot = new Map();
    for (const match of matches.filter((item) => item.root)) {
      const key = comparablePath(match.root);
      const prev = byRoot.get(key);
      if (!prev || match.score > prev.score) byRoot.set(key, match);
    }
    return suppressGenericOwnerTopicMatches([...byRoot.values()].sort((a, b) => b.score - a.score)).slice(0, 5);
  }

  function pathMatchesRoot(candidatePath, rootPath) {
    const candidate = comparablePath(candidatePath);
    const root = comparablePath(rootPath);
    return Boolean(candidate && root && (candidate === root || candidate.startsWith(`${root}/`)));
  }

  function directoryAttachmentCandidatesForThread(thread) {
    const candidates = [];
    for (const project of options.allProjectsForWorkspaceSync(thread?.workspaceId).filter((item) => !item.hidden)) {
      if (!project.root || project.id === singleWindowProjectId || project.source === "workspace-default") continue;
      candidates.push({
        projectId: project.id || "",
        subprojectId: "",
        label: directoryRouteDisplayLabel(project),
        root: project.root || "",
      });
      for (const child of project.children || []) {
        if (!child.root) continue;
        candidates.push({
          projectId: project.id || "",
          subprojectId: child.id || "",
          label: directoryRouteDisplayLabel(project, child),
          root: child.root || "",
        });
      }
    }
    return candidates.sort((a, b) => comparablePath(b.root).length - comparablePath(a.root).length);
  }

  function normalizeTaskDirectoryAttachment(thread, attachment) {
    if (!attachment?.root && !attachment?.path) return null;
    const root = String(attachment.root || attachment.path || "").trim();
    const requestedPath = String(attachment.path || root).trim();
    const pathValue = requestedPath && pathMatchesRoot(requestedPath, root) ? requestedPath : root;
    if (!options.isDirectoryBrowserPathAllowedForThread(thread, "", pathValue)) return null;
    const label = String(attachment.label || "").trim() || logicalDirectoryDisplayPath(thread, pathValue, "Directory");
    return {
      projectId: String(attachment.projectId || ""),
      subprojectId: String(attachment.subprojectId || ""),
      label,
      path: pathValue,
      root,
    };
  }

  function resolveTaskDirectoryAttachment(thread, raw = {}) {
    if (!raw || typeof raw !== "object") return null;
    const projectId = String(raw.projectId || "").trim();
    const subprojectId = String(raw.subprojectId || "").trim();
    const requestedPath = String(raw.path || "").trim();
    const rawRoot = String(raw.root || "").trim();
    const candidates = directoryAttachmentCandidatesForThread(thread);
    let match = null;
    if (projectId) {
      match = candidates.find((item) => item.projectId === projectId && (subprojectId ? item.subprojectId === subprojectId : !item.subprojectId))
        || candidates.find((item) => item.projectId === projectId && (!subprojectId || item.subprojectId === subprojectId));
    }
    if (!match && requestedPath) {
      match = candidates.find((item) => pathMatchesRoot(requestedPath, item.root));
    }
    if (!match && (rawRoot || requestedPath)) {
      return normalizeTaskDirectoryAttachment(thread, {
        projectId,
        subprojectId,
        label: String(raw.label || "").trim(),
        root: rawRoot || requestedPath,
        path: requestedPath || rawRoot,
      });
    }
    if (!match) return null;
    return normalizeTaskDirectoryAttachment(thread, Object.assign({}, match, {
      label: String(raw.label || "").trim() || match.label,
      path: requestedPath || match.root,
    }));
  }

  function semanticTaskDirectoryAttachment(thread, latestText) {
    if (!thread?.singleWindow) return null;
    const matches = semanticProjectMatches(thread, latestText);
    const match = matches.find((item) => !isDeliveryProjectMatch(item)) || matches[0];
    if (!match?.root) return null;
    return normalizeTaskDirectoryAttachment(thread, {
      projectId: match.projectId || "",
      subprojectId: match.subprojectId || "",
      label: match.label || match.alias || "",
      path: match.root,
      root: match.root,
    });
  }

  function uniqueTaskDirectoryAttachments(items) {
    const unique = new Map();
    for (const item of items || []) {
      if (!item?.root && !item?.path) continue;
      const key = [
        item.projectId || "",
        item.subprojectId || "",
        comparablePath(item.root || item.path || ""),
      ].join("|");
      if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
  }

  function messageTaskDirectoryHaystack(message) {
    const parts = [message?.content || ""];
    if (message?.directoryRoute) {
      parts.push(message.directoryRoute.label || "", message.directoryRoute.path || "", message.directoryRoute.root || "");
    }
    for (const alias of Array.isArray(message?.directoryAliases) ? message.directoryAliases : []) {
      parts.push(alias?.label || "", alias?.path || "", alias?.root || "");
    }
    for (const artifact of Array.isArray(message?.artifacts) ? message.artifacts : []) {
      parts.push(artifact?.name || "", artifact?.path || "", artifact?.displayPath || "", artifact?.url || "");
    }
    return parts.join("\n");
  }

  function taskDirectoryAttachmentCandidatesForMessage(thread, message) {
    const rawCandidates = [];
    if (message?.directoryRoute) rawCandidates.push(message.directoryRoute);
    for (const alias of Array.isArray(message?.directoryAliases) ? message.directoryAliases : []) {
      if (alias) rawCandidates.push(alias);
    }
    const haystack = messageTaskDirectoryHaystack(message);
    for (const candidate of directoryAttachmentCandidatesForThread(thread)) {
      if (textIncludesPath(haystack, candidate.root)) rawCandidates.push(candidate);
    }
    return uniqueTaskDirectoryAttachments(rawCandidates
      .map((raw) => resolveTaskDirectoryAttachment(thread, raw || {}))
      .filter(Boolean));
  }

  function taskDirectoryAttachmentForGroup(thread, taskGroupId) {
    if (!taskGroupId) return null;
    if (isPluginTaskGroupId(taskGroupId)) return null;
    for (const message of thread?.messages || []) {
      if (message.taskGroupId !== taskGroupId) continue;
      const candidates = taskDirectoryAttachmentCandidatesForMessage(thread, message);
      const binding = candidates.find((item) => !isDeliveryProjectMatch(item));
      if (binding) return binding;
    }
    return null;
  }

  function taskDirectoryAttachmentForMessage(thread, message) {
    if (isPluginTaskGroupId(message?.taskGroupId)) return null;
    const direct = normalizeTaskDirectoryAttachment(thread, message?.directoryRoute || {});
    if (direct) return direct;
    if (thread?.singleWindow && isSingleWindowConversationTaskGroupId(message?.taskGroupId)) return null;
    return taskDirectoryAttachmentForGroup(thread, message?.taskGroupId || "");
  }

  function semanticProjectRoutingInstructions(thread, latestText) {
    if (!thread?.singleWindow) return "";
    const matches = semanticProjectMatches(thread, latestText);
    if (!matches.length) return "";
    return [
      "Semantic project-directory matches from the latest user request:",
      ...matches.map((item) => `- ${item.label} (matched alias: ${item.alias}) => ${item.root}`),
      "Use the most specific matched project root for file search, report generation, and directory aliases.",
      genericDirectoryAliasInstruction,
    ].join("\n");
  }

  function projectForTaskDirectoryAttachment(thread, attachment) {
    if (!attachment) return effectiveProjectForThread(thread);
    const project = findProject(thread?.workspaceId, attachment.projectId);
    const child = findSubproject(project, attachment.subprojectId);
    const base = child
      ? Object.assign({}, child, { workspaceId: project.workspaceId, parentProjectId: project.id, parentLabel: project.label })
      : (project || {});
    return Object.assign({}, base, {
      id: attachment.subprojectId || attachment.projectId || base.id || "attached-directory",
      label: attachment.label || base.label || "Attached directory",
      root: attachment.path || attachment.root || base.root || "",
    });
  }

  return {
    comparablePath,
    directoryAliasLabels,
    directoryAttachmentCandidatesForThread,
    isContextAnchorProjectMatch,
    isDeliveryProjectMatch,
    isGenericOwnerTopicProjectId,
    isPluginTaskGroupId,
    messageTaskDirectoryHaystack,
    normalizeTaskDirectoryAttachment,
    pathInsideAnyRoot,
    pluginIdForTaskGroupId,
    pathMatchesRoot,
    projectForTaskDirectoryAttachment,
    projectSearchLabels,
    resolveTaskDirectoryAttachment,
    searchableText,
    semanticProjectMatches,
    semanticProjectRoutingInstructions,
    semanticTaskDirectoryAttachment,
    suppressGenericOwnerTopicMatches,
    taskDirectoryAttachmentCandidatesForMessage,
    taskDirectoryAttachmentForGroup,
    taskDirectoryAttachmentForMessage,
    uniqueTaskDirectoryAttachments,
  };
}

module.exports = {
  createSemanticDirectoryAttachmentService,
  defaultComparablePath,
};
