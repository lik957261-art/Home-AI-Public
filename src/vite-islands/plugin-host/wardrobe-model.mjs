import {
  cleanString,
  pluginAvailable,
  pluginUsesLaunchToken,
} from "./model.mjs";

const WARDROBE_MODEL_VERSION = "20260705-vite-wardrobe-model-v1";
const WARDROBE_ROUTE_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d)/i;
const WARDROBE_DIRECTORY_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\u8863\u6a71)/i;

function textParts(values = []) {
  return values.map((value) => cleanString(value, 500)).filter(Boolean);
}

function wardrobeRouteText(item = {}) {
  return textParts([
    item.id,
    item.projectId,
    item.subprojectId,
    item.label,
    item.name,
    item.root,
    item.path,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ]).join(" ");
}

function wardrobeChildRouteText(child = {}) {
  const rootTail = cleanString(child.root || child.path, 1000)
    .replaceAll("\\", "/")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
  return textParts([
    child.id,
    child.projectId,
    child.subprojectId,
    child.label,
    child.name,
    rootTail,
    ...(Array.isArray(child.aliases) ? child.aliases : []),
  ]).join(" ");
}

function itemLooksWardrobe(item = {}) {
  return WARDROBE_ROUTE_PATTERN.test(wardrobeRouteText(item));
}

function itemLooksWardrobeDirectory(item = {}) {
  return WARDROBE_DIRECTORY_PATTERN.test(wardrobeRouteText(item));
}

function wardrobeDirectoryCandidatesPlan(projects = []) {
  const candidates = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    if (!project?.root) continue;
    if (itemLooksWardrobeDirectory(project)) {
      candidates.push({ project, child: null, score: 4 });
    }
    for (const child of Array.isArray(project.children) ? project.children : []) {
      if (!child?.root) continue;
      const text = wardrobeChildRouteText(child);
      if (!WARDROBE_DIRECTORY_PATTERN.test(text)) continue;
      candidates.push({ project, child, score: 4 });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function wardrobeDirectoryAttachmentPlan(input = {}) {
  const candidate = input.candidate || null;
  if (!candidate) return null;
  const project = candidate.project || {};
  const child = candidate.child || null;
  const projectLabel = cleanString(input.projectLabel || project.label || project.name || project.id, 500);
  const childLabel = cleanString(child?.label || child?.name || child?.id, 500);
  const label = child ? `${projectLabel} / ${childLabel}` : projectLabel;
  const root = cleanString(child?.root || project.root, 2000);
  return {
    projectId: cleanString(project.id, 180),
    subprojectId: cleanString(child?.id, 180),
    label,
    root,
    path: root,
  };
}

function workspaceToolsetsPlan(workspace = {}) {
  const values = [
    ...(Array.isArray(workspace?.localConfig?.allowedToolsets) ? workspace.localConfig.allowedToolsets : []),
    ...(Array.isArray(workspace?.bindings?.allowedToolsets) ? workspace.bindings.allowedToolsets : []),
  ];
  return [...new Set(values.map((item) => cleanString(item, 120)).filter(Boolean))];
}

function wardrobeEntryAvailabilityPlan(input = {}) {
  const workspaceId = cleanString(input.workspaceId || "owner", 120) || "owner";
  const pluginNavigationAvailable = Boolean(input.pluginNavigationAvailable);
  const ownerWorkspace = Boolean(input.isOwner && workspaceId === "owner");
  const directoryAttachmentAvailable = Boolean(input.directoryAttachmentAvailable);
  const workspaceAllowsToolset = Array.isArray(input.toolsets)
    ? input.toolsets.includes("wardrobe")
    : Boolean(input.workspaceAllowsToolset);
  return {
    available: pluginNavigationAvailable
      || (workspaceId === "owner" && (directoryAttachmentAvailable || workspaceAllowsToolset)),
    pluginNavigationAvailable,
    ownerWorkspace,
    directoryAttachmentAvailable,
    workspaceAllowsToolset,
  };
}

function wardrobeProxyEntryWorkspaceMatches(entryUrl = "", workspaceId = "", options = {}) {
  const targetWorkspaceId = cleanString(workspaceId || "owner", 120) || "owner";
  try {
    const parsed = new URL(cleanString(entryUrl, 2000), cleanString(options.baseUrl, 2000) || "http://home-ai.local/");
    if (!parsed.pathname.startsWith("/api/hermes-plugins/wardrobe/proxy")) return true;
    const entryWorkspaceId = parsed.searchParams.get("workspaceId") || parsed.searchParams.get("workspace_id") || "";
    return entryWorkspaceId === targetWorkspaceId;
  } catch (_error) {
    return false;
  }
}

function wardrobeManifestMatchesLaunchContextPlan(input = {}) {
  const manifest = input.manifest && typeof input.manifest === "object" ? input.manifest : null;
  const workspaceId = cleanString(input.workspaceId || "owner", 120) || "owner";
  const workspaceMatches = manifest?.workspaceId === workspaceId;
  const entryWorkspaceMatches = wardrobeProxyEntryWorkspaceMatches(manifest?.entry?.url, workspaceId, {
    baseUrl: input.baseUrl,
  });
  const matches = Boolean(manifest && workspaceMatches && entryWorkspaceMatches);
  return {
    matches,
    workspaceMatches,
    entryWorkspaceMatches,
  };
}

function wardrobePluginAvailable(manifest = {}) {
  return pluginAvailable(manifest);
}

function wardrobePluginUsesLaunchToken(manifest = {}) {
  return pluginUsesLaunchToken(manifest);
}

function wardrobeLaunchTokenFreshPlan(input = {}) {
  const fetchedAt = Number(input.fetchedAt || 0);
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : 0;
  const maxAgeMs = Math.max(1, Number(input.maxAgeMs || 60000) || 60000);
  return {
    fresh: Boolean(input.freshForFrame && fetchedAt > 0 && now - fetchedAt < maxAgeMs),
    fetchedAt,
    now,
    maxAgeMs,
  };
}

function wardrobePluginBlockedByPageSecurityPlan(input = {}) {
  const manifest = input.manifest && typeof input.manifest === "object" ? input.manifest : {};
  const frameAncestorBlocked = Boolean(manifest?.embed?.blockedByFrameAncestors);
  if (frameAncestorBlocked) {
    return { blocked: true, frameAncestorBlocked: true, mixedContentBlocked: false, parseFailed: false };
  }
  if (!wardrobePluginAvailable(manifest)) {
    return { blocked: false, frameAncestorBlocked: false, mixedContentBlocked: false, parseFailed: false };
  }
  try {
    const pageProtocol = cleanString(input.pageProtocol, 20);
    const entryProtocol = new URL(cleanString(manifest?.entry?.url, 2000), cleanString(input.baseUrl, 2000) || "http://home-ai.local/").protocol;
    const mixedContentBlocked = pageProtocol === "https:" && entryProtocol === "http:";
    return { blocked: mixedContentBlocked, frameAncestorBlocked: false, mixedContentBlocked, parseFailed: false };
  } catch (_error) {
    return { blocked: true, frameAncestorBlocked: false, mixedContentBlocked: false, parseFailed: true };
  }
}

function wardrobePluginEntryOriginPlan(input = {}) {
  const manifest = input.manifest && typeof input.manifest === "object" ? input.manifest : {};
  const value = cleanString(manifest?.entry?.origin || manifest?.entry?.url, 2000);
  if (!value) return "";
  try {
    return new URL(value, cleanString(input.baseUrl, 2000) || "http://home-ai.local/").origin;
  } catch (_error) {
    return "";
  }
}

function normalizeWardrobePluginOpenRoute(route = {}) {
  const value = route && typeof route === "object" ? route : {};
  const out = {};
  for (const key of ["pluginActionId", "pluginRoute", "pluginItemId", "pluginThreadId", "pluginTaskId", "sourceTurnId"]) {
    const text = cleanString(value[key], 180);
    if (text) out[key] = text;
  }
  return out;
}

function wardrobePluginEntryUrlForFramePlan(input = {}) {
  const entryUrl = cleanString(input.entryUrl, 2000);
  const route = normalizeWardrobePluginOpenRoute(input.route || {});
  if (!entryUrl || !Object.keys(route).length) return entryUrl;
  try {
    const parsed = new URL(entryUrl, cleanString(input.baseUrl, 2000) || "http://home-ai.local/");
    Object.entries(route).forEach(([key, value]) => parsed.searchParams.set(key, value));
    parsed.searchParams.set("pluginId", "wardrobe");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_error) {
    return entryUrl;
  }
}

function wardrobePluginMessageOriginAllowedPlan(input = {}) {
  const expectedOrigin = cleanString(input.expectedOrigin, 2000);
  const eventOrigin = cleanString(input.eventOrigin, 2000);
  return Boolean(expectedOrigin && eventOrigin === expectedOrigin);
}

function wardrobePluginFramePreservationPlan(input = {}) {
  const usesLaunchToken = Boolean(input.usesLaunchToken);
  const launchTokenFresh = Boolean(input.launchTokenFresh);
  const navigationLastAt = Number(input.navigationLastAt || 0);
  const currentFrameUsesEntry = Boolean(input.currentFrameUsesEntry);
  const preserve = !usesLaunchToken || launchTokenFresh || navigationLastAt > 0 || currentFrameUsesEntry;
  return {
    preserve,
    usesLaunchToken,
    launchTokenFresh,
    navigationLastAt,
    currentFrameUsesEntry,
  };
}

function wardrobePluginUnavailableViewPlan(input = {}) {
  const manifest = input.manifest && typeof input.manifest === "object" ? input.manifest : {};
  const security = input.security && typeof input.security === "object" ? input.security : {};
  const entryOrigin = cleanString(manifest?.entry?.origin || manifest?.entry?.url, 2000);
  const securityReason = security.frameAncestorBlocked
    ? "\u8863\u6a71\u63d2\u4ef6\u5165\u53e3\u8fd8\u6ca1\u6709\u5141\u8bb8\u5f53\u524d Home AI \u57df\u540d\u5d4c\u5165\u3002\u9700\u8981\u5728\u8863\u6a71\u63d2\u4ef6\u670d\u52a1\u91cc\u653e\u884c\u8fd9\u4e2a origin\u3002"
    : "\u5f53\u524d Home AI \u662f HTTPS \u9875\u9762\uff0c\u4e0d\u80fd\u5d4c\u5165 HTTP \u8863\u6a71\u5165\u53e3\u3002\u9700\u8981\u914d\u7f6e HTTPS \u63d2\u4ef6 manifest / entry\u3002";
  return {
    code: cleanString(manifest?.code || "wardrobe_plugin_unavailable", 120),
    warning: cleanString(manifest?.warning || "\u5f53\u524d\u8863\u6a71\u63d2\u4ef6 manifest \u4e0d\u53ef\u7528\u3002", 1000),
    securityNoticeVisible: Boolean(security.blocked),
    securityTitle: "\u63d2\u4ef6\u5165\u53e3\u672a\u5d4c\u5165",
    securityReason,
    entryOrigin,
    retryLabel: "\u91cd\u8bd5",
  };
}

export {
  WARDROBE_DIRECTORY_PATTERN,
  WARDROBE_MODEL_VERSION,
  WARDROBE_ROUTE_PATTERN,
  itemLooksWardrobe,
  itemLooksWardrobeDirectory,
  normalizeWardrobePluginOpenRoute,
  wardrobeChildRouteText,
  wardrobeDirectoryAttachmentPlan,
  wardrobeDirectoryCandidatesPlan,
  wardrobeEntryAvailabilityPlan,
  wardrobeLaunchTokenFreshPlan,
  wardrobeManifestMatchesLaunchContextPlan,
  wardrobePluginAvailable,
  wardrobePluginBlockedByPageSecurityPlan,
  wardrobePluginEntryOriginPlan,
  wardrobePluginEntryUrlForFramePlan,
  wardrobePluginFramePreservationPlan,
  wardrobePluginMessageOriginAllowedPlan,
  wardrobePluginUnavailableViewPlan,
  wardrobePluginUsesLaunchToken,
  wardrobeProxyEntryWorkspaceMatches,
  wardrobeRouteText,
  workspaceToolsetsPlan,
};
