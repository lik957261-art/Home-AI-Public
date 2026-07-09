const RICH_TEXT_DIRECTORY_MODEL_VERSION = "20260705-vite-rich-text-directory-model-v1";

const ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS = 900;
const ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES = 6;
const ASSISTANT_RECEIPT_LABEL_PATTERN = /^(结论|关键结论|重点|重点结论|摘要|总结|结果|处理结果|状态|当前状态|已完成|完成|修复|变更|改动|修改|处理|影响|影响范围|验证|验证结果|测试|测试结果|本地验证|生产验证|部署|生产|已部署|文件|代码|路径|下一步|后续|后续步骤|建议|待办|待确认|风险|注意|限制|原因|诊断|发现|问题|说明|summary|result|status|done|completed|changed?|impact|validation|tests?|deploy(?:ed|ment)?|files?|paths?|next|todo|risk|warning|note|diagnosis|issue)\s*[：:]\s*(.*)$/i;
const INLINE_IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|webp|gif|avif)$/i;
const INLINE_IMAGE_MIME_PATTERN = /^image\/(?:png|jpe?g|webp|gif|avif)$/i;
const INLINE_IMAGE_TRAILING_PUNCTUATION_PATTERN = /[)\]},.，。！？!?:;；：、]+$/;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function cleanDisplayTextPlan(value) {
  return String(value || "")
    .replace(/<!--\s*homeai-note(?:-[a-z]+)?[\s\S]*?-->/gi, "")
    .replace(/<!--\s*homeai-plugin-conversation-action\b[\s\S]*?-->/gi, "")
    .split(/\n/)
    .filter((line) => !/^\s*MEDIA:\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function streamingReceiptPreviewTextPlan(value, options = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const maxChars = Math.max(1, Number(options.maxChars || ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS) || ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS);
  const maxLines = Math.max(1, Number(options.maxLines || ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES) || ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES);
  const previewSlice = text.length > maxChars ? text.slice(-maxChars) : text;
  const lines = previewSlice
    .split(/\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line.trim() || all[index - 1]?.trim() || all[index + 1]?.trim());
  return lines.slice(-maxLines).join("\n").trim();
}

function assistantReceiptTonePlan(label) {
  const value = String(label || "").toLowerCase();
  if (/风险|注意|限制|warning|risk/.test(value)) return "warn";
  if (/问题|issue/.test(value)) return "danger";
  if (/完成|已完成|修复|验证|测试|部署|生产|done|completed|validation|test|deploy/.test(value)) return "success";
  if (/下一步|后续|建议|待办|next|todo/.test(value)) return "next";
  if (/文件|路径|files?|paths?/.test(value)) return "file";
  if (/原因|诊断|发现|diagnosis/.test(value)) return "diagnostic";
  return "focus";
}

function assistantReceiptLabelForTextPlan(value) {
  const lines = String(value || "").split(/\n/);
  const match = String(lines[0] || "").trim().match(ASSISTANT_RECEIPT_LABEL_PATTERN);
  if (!match) return null;
  const label = match[1].trim();
  const body = [match[2] || "", ...lines.slice(1)].map((line) => String(line || "").trimEnd()).join("\n").trim();
  return Object.freeze({ label, body, tone: assistantReceiptTonePlan(label) });
}

function sanitizeInlineMarkdownImageSrcPlan(src) {
  const raw = String(src ?? "").trim();
  if (!raw) return "#";
  const withoutControls = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  const lower = withoutControls.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:") ||
    withoutControls.startsWith("#")
  ) {
    return "#";
  }
  if (withoutControls.startsWith("/") || withoutControls.startsWith("./") || withoutControls.startsWith("../")) return withoutControls;
  try {
    const parsed = new URL(withoutControls);
    return ["http:", "https:"].includes(parsed.protocol) ? withoutControls : "#";
  } catch (_error) {
    return /^https?:\/\//i.test(withoutControls) ? withoutControls : "#";
  }
}

function inlineImageBaseOrigin(options = {}) {
  const origin = cleanString(options.baseOrigin || options.currentOrigin || "http://localhost", 1000);
  try {
    return new URL(origin).origin;
  } catch (_error) {
    return "http://localhost";
  }
}

function normalizeInlineMarkdownImageSrcPlan(src, options = {}) {
  const safeSrc = sanitizeInlineMarkdownImageSrcPlan(src);
  if (safeSrc === "#") return "#";
  const baseOrigin = inlineImageBaseOrigin(options);
  const currentOrigin = cleanString(options.currentOrigin || baseOrigin, 1000);
  try {
    const parsed = new URL(safeSrc, baseOrigin);
    if (!["http:", "https:"].includes(parsed.protocol)) return "#";
    const sameOrigin = Boolean(currentOrigin && parsed.origin === currentOrigin);
    if (sameOrigin && parsed.pathname.startsWith("/api/v1/music/")) {
      const proxy = new URL(`/api/hermes-plugins/music/proxy${parsed.pathname}`, baseOrigin);
      parsed.searchParams.forEach((value, key) => {
        proxy.searchParams.append(key, value);
      });
      if (!proxy.searchParams.get("workspaceId") && !proxy.searchParams.get("workspace_id")) {
        const workspaceId = cleanString(options.workspaceId, 240);
        if (workspaceId) proxy.searchParams.set("workspaceId", workspaceId);
      }
      proxy.hash = parsed.hash;
      return `${proxy.pathname}${proxy.search}${proxy.hash}`;
    }
    if (sameOrigin && parsed.pathname === "/api/files/preview") {
      parsed.pathname = "/api/files";
    }
    return sameOrigin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href;
  } catch (_error) {
    return safeSrc;
  }
}

function inlineMarkdownImageRequiresAuthenticatedFetchPlan(src, options = {}) {
  try {
    const baseOrigin = inlineImageBaseOrigin(options);
    const currentOrigin = cleanString(options.currentOrigin || baseOrigin, 1000);
    const parsed = new URL(src, baseOrigin);
    if (!currentOrigin || parsed.origin !== currentOrigin) return false;
    return parsed.pathname.startsWith("/api/");
  } catch (_error) {
    return false;
  }
}

function inlineMarkdownImagePlan(input = {}) {
  const safeSrc = normalizeInlineMarkdownImageSrcPlan(input.src, input);
  if (safeSrc === "#") return Object.freeze({ visible: false });
  const authenticatedFetch = inlineMarkdownImageRequiresAuthenticatedFetchPlan(safeSrc, input);
  return Object.freeze({
    visible: true,
    src: safeSrc,
    displaySrc: authenticatedFetch ? cleanString(input.placeholderSrc, 1000) : safeSrc,
    authenticatedFetch,
    alt: String(input.alt ?? ""),
    title: String(input.title ?? ""),
    state: authenticatedFetch ? "pending" : "",
  });
}

function splitInlineImageUrlCandidatePlan(value) {
  const raw = String(value || "");
  const match = raw.match(INLINE_IMAGE_TRAILING_PUNCTUATION_PATTERN);
  if (!match) return Object.freeze({ url: raw, trailing: "" });
  return Object.freeze({
    url: raw.slice(0, -match[0].length),
    trailing: match[0],
  });
}

function inlineImageUrlLooksRenderablePlan(value, options = {}) {
  const safeSrc = normalizeInlineMarkdownImageSrcPlan(value, options);
  if (safeSrc === "#") return false;
  try {
    const parsed = new URL(safeSrc, inlineImageBaseOrigin(options));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (INLINE_IMAGE_EXTENSION_PATTERN.test(parsed.pathname || "")) return true;
    const mime = parsed.searchParams.get("mime") || parsed.searchParams.get("contentType") || "";
    if (INLINE_IMAGE_MIME_PATTERN.test(mime)) return true;
    const named = parsed.searchParams.get("name")
      || parsed.searchParams.get("filename")
      || parsed.searchParams.get("file")
      || parsed.searchParams.get("path")
      || "";
    return INLINE_IMAGE_EXTENSION_PATTERN.test(named);
  } catch (_error) {
    return false;
  }
}

function parentDirectoryFromFilePathPlan(pathText) {
  const value = String(pathText || "").trim().replace(/^`+|`+$/g, "");
  if (!value) return "";
  return value.replace(/[\\/][^\\/]+$/g, "");
}

function cleanDirectoryAliasLabelPlan(value) {
  return String(value || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function directoryAliasKeyPlan(value) {
  return String(value || "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function comparableDirectoryPathPlan(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function isSkillLibraryAliasEntryPlan(entry = {}) {
  const label = directoryAliasKeyPlan(entry.label || "");
  const pathValue = comparableDirectoryPathPlan(entry.path || "");
  return pathValue.includes(".hermes/skills") || label.includes("技能库") || label.includes("skilllibrary");
}

function parseDirectoryAliasEntriesPlan(block) {
  const blockHasExplicitPath = String(block || "").includes("=");
  return Object.freeze(String(block || "")
    .split(/[;；]/)
    .map((entry) => {
      const [rawLabel, ...pathParts] = entry.split("=");
      const label = cleanDirectoryAliasLabelPlan(rawLabel);
      const rawPath = pathParts.join("=").trim();
      const pathValue = rawPath.replace(/^`+|`+$/g, "").replace(/[。.,，]+$/g, "").trim();
      return Object.freeze({ label, path: pathValue });
    })
    .filter((entry) => entry.label && (!blockHasExplicitPath || entry.path) && !isSkillLibraryAliasEntryPlan(entry) && !/主交付|交付目录|交付文件|同步根|delivery|sync\s*root/i.test(entry.label)));
}

function extractDirectoryAliasesPlan(text) {
  const aliases = [];
  const lines = String(text || "").split(/\r?\n/);
  const cleaned = [];
  for (const line of lines) {
    const match = line.match(/^(.*?)(?:[-*]\s*)?目录别名\s*[:：]\s*(.*)$/);
    if (!match) {
      cleaned.push(line);
      continue;
    }
    const prefix = match[1].trim();
    const tail = match[2] || "";
    const hasPath = tail.includes("=");
    const endIndex = hasPath ? tail.indexOf("。") : -1;
    const aliasBlock = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
    const remainder = endIndex >= 0 ? tail.slice(endIndex + 1).trimStart() : "";
    aliases.push(...parseDirectoryAliasEntriesPlan(aliasBlock));
    const restored = [prefix, remainder].filter(Boolean).join(" ");
    if (restored) cleaned.push(restored);
  }
  return Object.freeze({ text: cleaned.join("\n").replace(/^\s+/, ""), aliases: Object.freeze(aliases) });
}

function extractMediaDirectoryAliasesPlan(input = {}) {
  const aliases = [];
  const mediaPattern = /^MEDIA:\s*(`?)(.+?)\1\s*$/gm;
  let match = null;
  while ((match = mediaPattern.exec(String(input.text || "")))) {
    const mediaPath = String(match[2] || "").trim();
    const directoryPath = parentDirectoryFromFilePathPlan(mediaPath);
    if (!directoryPath) continue;
    aliases.push(Object.freeze({
      messageId: cleanString(input.messageId, 240),
      label: "交付目录",
      path: directoryPath,
      source: "reference",
      referenceKind: "delivery",
    }));
  }
  return Object.freeze(aliases);
}

function shortDirectoryAliasLabelPlan(label) {
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(label || "").trim();
}

function pathMatchesDirectoryRootPlan(candidatePath, rootPath) {
  const candidate = comparableDirectoryPathPlan(candidatePath);
  const root = comparableDirectoryPathPlan(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function relativeDisplayTailForDirectoryPlan(rawPath, rootPath) {
  const raw = String(rawPath || "").trim().replaceAll("\\", "/");
  const root = String(rootPath || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  const comparableRaw = comparableDirectoryPathPlan(rawPath);
  const comparableRoot = comparableDirectoryPathPlan(rootPath);
  if (comparableRaw && comparableRoot && comparableRaw.startsWith(`${comparableRoot}/`)) {
    return comparableRaw.slice(comparableRoot.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function ownerDriveRootIndexForParts(parts = [], ownerDriveRootNames = []) {
  const names = new Set((ownerDriveRootNames.length ? ownerDriveRootNames : ["ChatGPT-Drive"]).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean));
  return (parts || []).findIndex((part) => names.has(String(part || "").toLowerCase()));
}

function pathContainsOwnerDriveRootPlan(input = {}) {
  const parts = String(input.rawPath || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  return ownerDriveRootIndexForParts(parts, input.ownerDriveRootNames || []) >= 0;
}

function logicalUserPathFallbackPlan(input = {}) {
  const normalized = String(input.rawPath || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const driveIndex = ownerDriveRootIndexForParts(parts, input.ownerDriveRootNames || []);
  if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
  const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
  if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
  const documentsIndex = lowerParts.findIndex((part) => part === "documents");
  const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
  if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
  if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
  const usersIndex = lowerParts.findIndex((part) => part === "users");
  if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["用户目录", ...parts.slice(usersIndex + 2)].join(" / ");
  return input.fallbackLabel || parts[parts.length - 1] || "";
}

function projectLabelCandidatesPlan(input = {}) {
  const project = input.project || {};
  const labels = [
    project.label,
    ...(Array.isArray(project.aliases) ? project.aliases : []),
  ].filter(Boolean);
  if (input.parentLabel && project.label) labels.push(`${input.parentLabel} / ${project.label}`);
  const expanded = [];
  for (const label of labels) {
    expanded.push(label, shortDirectoryAliasLabelPlan(label));
  }
  return Object.freeze(expanded.filter(Boolean));
}

function directoryProjectCandidatesPlan(input = {}) {
  const candidates = [];
  for (const project of Array.isArray(input.projects) ? input.projects : []) {
    if (!project || project.hidden) continue;
    candidates.push(Object.freeze({
      projectId: project.id,
      subprojectId: "",
      label: project.label || project.id,
      root: project.root || "",
      labels: projectLabelCandidatesPlan({ project }),
    }));
    for (const child of Array.isArray(project.children) ? project.children : []) {
      candidates.push(Object.freeze({
        projectId: project.id,
        subprojectId: child.id,
        label: child.label || child.id,
        root: child.root || "",
        labels: projectLabelCandidatesPlan({ project: child, parentLabel: project.label || "" }),
      }));
    }
  }
  return Object.freeze(candidates);
}

function directoryRouteDisplayPathPlan(input = {}) {
  const route = input.route || {};
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const project = projects.find((item) => item.id === route.projectId);
  const child = route.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
  const projectLabel = project ? (project.label || project.id || "Project") : (route.label || input.fallbackLabel || "");
  if (child) return `${projectLabel} / ${child.label || child.id || route.label || input.fallbackLabel || ""}`;
  return projectLabel || route.label || input.fallbackLabel || "";
}

function logicalDirectoryDisplayPathPlan(input = {}) {
  const value = String(input.rawPath || "").trim();
  if (!value) return input.fallbackLabel || "";
  const matches = directoryProjectCandidatesPlan({ projects: input.projects })
    .filter((candidate) => candidate.root && pathMatchesDirectoryRootPlan(value, candidate.root))
    .sort((a, b) => comparableDirectoryPathPlan(b.root).length - comparableDirectoryPathPlan(a.root).length);
  if (matches.length) {
    const route = matches[0];
    const base = directoryRouteDisplayPathPlan({ route, projects: input.projects, fallbackLabel: route.label || input.fallbackLabel });
    const tail = relativeDisplayTailForDirectoryPlan(value, route.root);
    return [base, tail].filter(Boolean).join(" / ");
  }
  const workspace = input.workspace || {};
  if (workspace.defaultWorkspace && pathMatchesDirectoryRootPlan(value, workspace.defaultWorkspace)) {
    const tail = relativeDisplayTailForDirectoryPlan(value, workspace.defaultWorkspace);
    return [workspace.label || "工作区", tail].filter(Boolean).join(" / ");
  }
  return logicalUserPathFallbackPlan({
    rawPath: value,
    fallbackLabel: input.fallbackLabel,
    ownerDriveRootNames: input.ownerDriveRootNames,
  });
}

function rewriteDirectoryPathsForDisplayPlan(input = {}) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\[^\\\s]+\\|\/\/wsl(?:\.localhost|\$)?\/[^/\s]+\/)[^\s`<>"']+/gi;
  return String(input.text || "").replace(pathPattern, (match) => {
    const suffixMatch = match.match(/[)\].,;:，。；、）】》]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const core = suffix ? match.slice(0, -suffix.length) : match;
    const logical = logicalDirectoryDisplayPathPlan({ ...input, rawPath: core });
    return logical ? `${logical}${suffix}` : match;
  });
}

function isGenericDefaultDirectoryAliasPlan(alias = {}) {
  const label = directoryAliasKeyPlan(alias.label);
  return [
    "默认目录",
    "默认资料根",
    "资料根",
    "资料根目录",
    "defaultdirectory",
    "defaultdataroot",
  ].includes(label);
}

function isOperationalTaskDirectoryAliasPlan(input = {}) {
  const alias = input.alias || {};
  const route = input.route || null;
  const label = directoryAliasKeyPlan(alias.label || "");
  const pathValue = comparableDirectoryPathPlan(alias.path || route?.root || "");
  return Boolean(
    (label.includes("agent") && (label.includes("workspace") || label.includes("工作区")))
    || label.includes("hermesweb")
    || pathValue.includes("/documents/agent")
    || pathValue.includes("/documents/hermes-mobile-source")
    || pathValue.includes("/programdata/hermesmobile/app")
    || pathValue.includes("/workspace/hermes-web")
    || pathValue.includes("/tools/cli/hermes-web")
  );
}

function isGenericCurrentBoundDirectoryAliasPlan(alias = {}) {
  const label = directoryAliasKeyPlan(alias.label);
  return [
    "当前绑定目录",
    "当前绑定工作区",
    "绑定目录",
    "任务绑定目录",
    "本任务目录",
    "currentbounddirectory",
    "bounddirectory",
    "attacheddirectory",
    "currentdirectory",
  ].includes(label);
}

function resolveDirectoryProjectRoutePlan(input = {}) {
  const alias = input.alias || {};
  const aliasLabel = directoryAliasKeyPlan(alias.label);
  const aliasPath = alias.path || alias.root || "";
  const candidates = Array.isArray(input.candidates) ? input.candidates : directoryProjectCandidatesPlan(input);
  const requestedProjectId = String(alias.projectId || "").trim();
  const requestedSubprojectId = String(alias.subprojectId || "").trim();
  if (requestedProjectId) {
    const projectMatches = candidates
      .filter((candidate) => candidate.projectId === requestedProjectId && (!requestedSubprojectId || candidate.subprojectId === requestedSubprojectId));
    if (aliasPath) {
      const pathScopedProjectMatches = projectMatches
        .filter((candidate) => (
          candidate.root
          && (
            pathMatchesDirectoryRootPlan(aliasPath, candidate.root)
            || pathMatchesDirectoryRootPlan(candidate.root, aliasPath)
          )
        ))
        .sort((a, b) => comparableDirectoryPathPlan(b.root).length - comparableDirectoryPathPlan(a.root).length);
      if (pathScopedProjectMatches.length) return pathScopedProjectMatches[0];
    }
    const exactProject = projectMatches.find((candidate) =>
      String(candidate.subprojectId || "") === requestedSubprojectId);
    if (exactProject) return exactProject;
    if (!requestedSubprojectId) {
      const rootProject = projectMatches.find((candidate) => !candidate.subprojectId);
      if (rootProject) return rootProject;
    }
    const sortedProjectMatches = projectMatches
      .sort((a, b) => comparableDirectoryPathPlan(b.root).length - comparableDirectoryPathPlan(a.root).length);
    if (sortedProjectMatches.length) return sortedProjectMatches[0];
  }
  const pathMatches = aliasPath
    ? candidates
      .filter((candidate) => pathMatchesDirectoryRootPlan(aliasPath, candidate.root))
      .sort((a, b) => comparableDirectoryPathPlan(b.root).length - comparableDirectoryPathPlan(a.root).length)
    : [];
  if (pathMatches.length) return pathMatches[0];
  if (!aliasLabel) return null;
  const exact = candidates.filter((candidate) =>
    (candidate.labels || []).some((label) => directoryAliasKeyPlan(label) === aliasLabel));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => comparableDirectoryPathPlan(b.root).length - comparableDirectoryPathPlan(a.root).length)[0];
  }
  return null;
}

function isGenericOwnerTopicRoutePlan(input = {}) {
  const route = input.route || {};
  const projectId = String(route.projectId || "");
  const ids = Array.isArray(input.genericOwnerTopicRouteIds) ? input.genericOwnerTopicRouteIds : [];
  const prefixes = Array.isArray(input.genericOwnerTopicRoutePrefixes) ? input.genericOwnerTopicRoutePrefixes : [];
  return ids.includes(projectId) || prefixes.some((prefix) => projectId.startsWith(prefix));
}

function isContextAnchorDirectoryRoutePlan(input = {}) {
  const route = input.route || {};
  if (!route.root) return false;
  if (route.subprojectId) return false;
  if (route.projectId === "single-window") return false;
  if (isGenericOwnerTopicRoutePlan(input)) return false;
  return true;
}

function coalesceDirectoryAliasItemsPlan(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const anchors = items.filter((item) => isContextAnchorDirectoryRoutePlan({ ...input, route: item.route }));
  if (!anchors.length) return Object.freeze(items);
  return Object.freeze(items.filter((item) => {
    if (!isGenericOwnerTopicRoutePlan({ ...input, route: item.route })) return true;
    return anchors.some((anchor) => pathMatchesDirectoryRootPlan(item.route?.root, anchor.route?.root));
  }));
}

function uniqueDirectoryAliasItemsPlan(items = []) {
  const unique = new Map();
  for (const item of items || []) {
    const route = item.route || {};
    const displayAlias = item.displayAlias || {};
    const key = route.projectId
      ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPathPlan(displayAlias.path || route.root || "")}`
      : `${displayAlias.label || ""}|${comparableDirectoryPathPlan(displayAlias.path || "")}`;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return Object.freeze([...unique.values()]);
}

function directoryAliasChipPlans(input = {}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const referenceOption = Boolean(input.reference);
  return Object.freeze(items.map((item) => {
    const displayAlias = item.displayAlias || {};
    const route = item.route || null;
    let directoryPath = displayAlias.path || route?.root || "";
    if (route?.root && directoryPath && !pathMatchesDirectoryRootPlan(directoryPath, route.root)) directoryPath = route.root;
    const reference = Boolean(referenceOption || displayAlias.referenceKind || displayAlias.source === "reference");
    if (route) {
      const pathIsNested = Boolean(
        route.root
        && directoryPath
        && pathMatchesDirectoryRootPlan(directoryPath, route.root)
        && comparableDirectoryPathPlan(directoryPath) !== comparableDirectoryPathPlan(route.root)
      );
      const baseLabel = pathIsNested && displayAlias.label
        ? displayAlias.label
        : (reference || pathIsNested
          ? logicalDirectoryDisplayPathPlan({ ...input, rawPath: directoryPath, fallbackLabel: route.label || displayAlias.label })
          : directoryRouteDisplayPathPlan({ route, projects: input.projects, fallbackLabel: route.label || displayAlias.label }));
      const label = reference ? `交付 · ${baseLabel}` : baseLabel;
      return Object.freeze({
        kind: "route",
        reference,
        label,
        title: label,
        directoryPath,
        projectId: route.projectId,
        subprojectId: route.subprojectId || "",
      });
    }
    const fallbackLabel = reference ? `交付 · ${shortDirectoryAliasLabelPlan(displayAlias.label)}` : shortDirectoryAliasLabelPlan(displayAlias.label);
    return Object.freeze({
      kind: "path",
      reference,
      label: fallbackLabel,
      title: fallbackLabel,
      directoryPath,
      directoryLabel: displayAlias.label || "",
    });
  }));
}

export {
  ASSISTANT_RECEIPT_LABEL_PATTERN,
  ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS,
  ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES,
  RICH_TEXT_DIRECTORY_MODEL_VERSION,
  assistantReceiptLabelForTextPlan,
  assistantReceiptTonePlan,
  cleanDirectoryAliasLabelPlan,
  cleanDisplayTextPlan,
  coalesceDirectoryAliasItemsPlan,
  comparableDirectoryPathPlan,
  directoryAliasChipPlans,
  directoryAliasKeyPlan,
  directoryProjectCandidatesPlan,
  directoryRouteDisplayPathPlan,
  extractDirectoryAliasesPlan,
  extractMediaDirectoryAliasesPlan,
  inlineImageUrlLooksRenderablePlan,
  inlineMarkdownImagePlan,
  inlineMarkdownImageRequiresAuthenticatedFetchPlan,
  isContextAnchorDirectoryRoutePlan,
  isGenericCurrentBoundDirectoryAliasPlan,
  isGenericDefaultDirectoryAliasPlan,
  isGenericOwnerTopicRoutePlan,
  isOperationalTaskDirectoryAliasPlan,
  logicalDirectoryDisplayPathPlan,
  logicalUserPathFallbackPlan,
  normalizeInlineMarkdownImageSrcPlan,
  parentDirectoryFromFilePathPlan,
  parseDirectoryAliasEntriesPlan,
  pathContainsOwnerDriveRootPlan,
  pathMatchesDirectoryRootPlan,
  projectLabelCandidatesPlan,
  relativeDisplayTailForDirectoryPlan,
  resolveDirectoryProjectRoutePlan,
  sanitizeInlineMarkdownImageSrcPlan,
  shortDirectoryAliasLabelPlan,
  splitInlineImageUrlCandidatePlan,
  streamingReceiptPreviewTextPlan,
  uniqueDirectoryAliasItemsPlan,
};
