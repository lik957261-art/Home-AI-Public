"use strict";

const ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS = 900;
const ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES = 6;

function assistantReceiptMessageIsActive(message = {}) {
  if (typeof assistantMessageIsActive === "function") return assistantMessageIsActive(message);
  return ["queued", "running"].includes(String(message?.status || ""));
}

function renderText(text, message = {}) {
  const directoryAliases = extractDirectoryAliases(text || "");
  const cleaned = cleanDisplayText(rewriteDirectoryPathsForDisplay(directoryAliases.text));
  const aliases = renderDirectoryAliases(directoryAliases.aliases, message);
  if (message?.role === "assistant") {
    if (assistantReceiptMessageIsActive(message)) return renderAssistantStreamingReceiptPreview(cleaned, aliases);
    if (shouldRenderLongMessagePreview(cleaned, message)) return renderLongMessagePreview(cleaned, aliases, message);
    const collapse = shouldOfferLongMessageCollapse(cleaned, message) ? renderLongMessageCollapseButton(message) : "";
    return `<div class="text-content message-prose assistant-receipt">${aliases}${renderRichText(cleaned, { assistantReceipt: true })}${collapse}</div>`;
  }
  return `<div class="text-content plain-text">${aliases}${escapeHtml(cleaned)}</div>`;
}

function cleanDisplayText(value) {
  return String(value || "")
    .replace(/<!--\s*homeai-note(?:-[a-z]+)?[\s\S]*?-->/gi, "")
    .split(/\n/)
    .filter((line) => !/^\s*MEDIA:\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function streamingReceiptPreviewText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const charWindow = text.length > ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS
    ? text.slice(-ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_CHARS)
    : text;
  const lines = charWindow
    .split(/\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line.trim() || all[index - 1]?.trim() || all[index + 1]?.trim());
  return lines.slice(-ASSISTANT_STREAMING_RECEIPT_PREVIEW_MAX_LINES).join("\n").trim();
}

function renderAssistantStreamingReceiptPreview(text, aliases = "") {
  const preview = streamingReceiptPreviewText(text);
  if (!preview) {
    return `<div class="text-content message-prose assistant-receipt streaming-receipt empty" data-streaming-receipt="1" hidden>${aliases}</div>`;
  }
  return `<div class="text-content message-prose assistant-receipt streaming-receipt" data-streaming-receipt="1">
    ${aliases}
    <div class="assistant-streaming-receipt" aria-live="polite">
      <div class="assistant-streaming-receipt-kicker">\u6b63\u5728\u751f\u6210</div>
      <div class="assistant-streaming-receipt-text">${escapeHtml(preview)}</div>
    </div>
  </div>`;
}

function escapeMarkdownAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sanitizeInlineMarkdownImageSrc(src) {
  const renderer = typeof globalThis !== "undefined" ? globalThis.HermesMarkdownRenderer : null;
  if (renderer && typeof renderer.sanitizeImageSrc === "function") return renderer.sanitizeImageSrc(src);
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
  if (withoutControls.startsWith("/") || withoutControls.startsWith("./") || withoutControls.startsWith("../")) {
    return withoutControls;
  }
  try {
    const UrlCtor = typeof URL === "function" ? URL : null;
    if (!UrlCtor) {
      if (/^https?:\/\//i.test(withoutControls)) return withoutControls;
      return !withoutControls.includes(":") && /^[A-Za-z0-9._~/?#[\]@!$&'()*+,;=:%-]+$/.test(withoutControls)
        ? withoutControls
        : "#";
    }
    const parsed = new UrlCtor(withoutControls);
    return ["http:", "https:"].includes(parsed.protocol) ? withoutControls : "#";
  } catch (_error) {
    return /^[A-Za-z0-9._~/?#[\]@!$&'()*+,;=:%-]+$/.test(withoutControls)
      ? withoutControls
      : "#";
  }
}

function renderInlineMarkdownImage(alt, src, title = "") {
  const safeSrc = sanitizeInlineMarkdownImageSrc(src);
  if (safeSrc === "#") return "";
  const titleAttr = title ? ` title="${escapeMarkdownAttribute(title)}"` : "";
  return `<img class="hermes-markdown-image" src="${escapeMarkdownAttribute(safeSrc)}" alt="${escapeMarkdownAttribute(alt)}"${titleAttr} loading="lazy" decoding="async">`;
}

function renderInlineMarkdown(value) {
  const codeTokens = [];
  const imageTokens = [];
  let text = String(value ?? "").replace(/`([^`\n]+)`/g, (_match, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title = "") => {
    const imageHtml = renderInlineMarkdownImage(alt, src, title);
    if (!imageHtml) return match;
    const token = `\u0000IMAGE${imageTokens.length}\u0000`;
    imageTokens.push(imageHtml);
    return token;
  });
  text = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  codeTokens.forEach((html, tokenIndex) => {
    text = text.replace(new RegExp(`\\u0000CODE${tokenIndex}\\u0000`, "g"), html);
  });
  imageTokens.forEach((html, tokenIndex) => {
    text = text.replace(new RegExp(`\\u0000IMAGE${tokenIndex}\\u0000`, "g"), html);
  });
  return text;
}

const ASSISTANT_RECEIPT_LABEL_PATTERN = /^(结论|关键结论|重点|重点结论|摘要|总结|结果|处理结果|状态|当前状态|已完成|完成|修复|变更|改动|修改|处理|影响|影响范围|验证|验证结果|测试|测试结果|本地验证|生产验证|部署|生产|已部署|文件|代码|路径|下一步|后续|后续步骤|建议|待办|待确认|风险|注意|限制|原因|诊断|发现|问题|说明|summary|result|status|done|completed|changed?|impact|validation|tests?|deploy(?:ed|ment)?|files?|paths?|next|todo|risk|warning|note|diagnosis|issue)\s*[：:]\s*(.*)$/i;

function assistantReceiptLabelForText(value) {
  const lines = String(value || "").split(/\n/);
  const match = String(lines[0] || "").trim().match(ASSISTANT_RECEIPT_LABEL_PATTERN);
  if (!match) return null;
  const label = match[1].trim();
  const body = [match[2] || "", ...lines.slice(1)].map((line) => String(line || "").trimEnd()).join("\n").trim();
  return { label, body, tone: assistantReceiptTone(label) };
}

function assistantReceiptTone(label) {
  const value = String(label || "").toLowerCase();
  if (/风险|注意|限制|warning|risk/.test(value)) return "warn";
  if (/问题|issue/.test(value)) return "danger";
  if (/完成|已完成|修复|验证|测试|部署|生产|done|completed|validation|test|deploy/.test(value)) return "success";
  if (/下一步|后续|建议|待办|next|todo/.test(value)) return "next";
  if (/文件|路径|files?|paths?/.test(value)) return "file";
  if (/原因|诊断|发现|diagnosis/.test(value)) return "diagnostic";
  return "focus";
}

function renderAssistantReceiptInline(value) { return String(value || "").split(/\n/).map(renderInlineMarkdown).join("<br>"); }

function renderAssistantReceiptCallout(labelInfo) {
  const body = labelInfo.body ? renderAssistantReceiptInline(labelInfo.body) : "";
  return `<div class="assistant-receipt-callout tone-${escapeHtml(labelInfo.tone)}"><div class="assistant-receipt-callout-main"><div class="assistant-receipt-kicker">${escapeHtml(labelInfo.label)}</div>${body ? `<div class="assistant-receipt-callout-body">${body}</div>` : ""}</div></div>`;
}

function renderAssistantReceiptParagraph(paragraph, options = {}) {
  const labelInfo = options.assistantReceipt ? assistantReceiptLabelForText(paragraph.join("\n")) : null;
  return labelInfo ? renderAssistantReceiptCallout(labelInfo) : `<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`;
}

function assistantReceiptHeadingClass(text, options = {}) {
  if (!options.assistantReceipt) return "";
  const labelInfo = assistantReceiptLabelForText(`${String(text || "").replace(/[：:]\s*$/, "")}:`);
  return ` class="assistant-receipt-heading tone-${escapeHtml(labelInfo?.tone || "focus")}"`;
}

function renderAssistantReceiptListItem(item, options = {}) {
  const labelInfo = options.assistantReceipt ? assistantReceiptLabelForText(item) : null;
  if (!labelInfo) return `<li>${renderInlineMarkdown(item)}</li>`;
  const body = labelInfo.body ? renderAssistantReceiptInline(labelInfo.body) : "";
  return `<li class="assistant-receipt-list-item tone-${escapeHtml(labelInfo.tone)}"><span class="assistant-receipt-list-label">${escapeHtml(labelInfo.label)}</span>${body}</li>`;
}

function renderTable(lines) {
  const rows = lines.map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())).filter((row) => row.length > 1);
  if (!rows.length) return "";
  const isSeparator = (row) => row.every((cell) => /^:?-{3,}:?$/.test(cell));
  const hasHeader = rows.length > 1 && isSeparator(rows[1]);
  const header = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(2) : rows;
  const headerHtml = header.length ? `<thead><tr>${header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>` : "";
  const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<div class="prose-table-wrap"><table>${headerHtml}${bodyHtml}</table></div>`;
}

function renderRichText(text, options = {}) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let tableLines = [];
  let codeLines = null;

  const flushParagraph = () => { if (paragraph.length) { out.push(renderAssistantReceiptParagraph(paragraph, options)); paragraph = []; } };
  const flushList = () => { if (listItems.length) { const tag = listType === "ol" ? "ol" : "ul"; out.push(`<${tag}>${listItems.map((item) => renderAssistantReceiptListItem(item, options)).join("")}</${tag}>`); listType = ""; listItems = []; } };
  const flushTable = () => { if (tableLines.length) { out.push(renderTable(tableLines)); tableLines = []; } };
  const flushBlocks = () => { flushParagraph(); flushList(); flushTable(); };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushBlocks();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = Math.min(4, heading[1].length + 1);
      out.push(`<h${level}${assistantReceiptHeadingClass(heading[2], options)}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushBlocks();
      out.push("<hr>");
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(numbered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushBlocks();
      out.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  if (codeLines) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushBlocks();
  return out.join("") || "";
}

function extractDirectoryAliases(text) {
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
    aliases.push(...parseDirectoryAliasEntries(aliasBlock));
    const restored = [prefix, remainder].filter(Boolean).join(" ");
    if (restored) cleaned.push(restored);
  }
  return { text: cleaned.join("\n").replace(/^\s+/, ""), aliases };
}

function parentDirectoryFromFilePath(pathText) {
  const value = String(pathText || "").trim().replace(/^`+|`+$/g, "");
  if (!value) return "";
  return value.replace(/[\\/][^\\/]+$/g, "");
}

function extractMediaDirectoryAliases(text, messageId = "") {
  const aliases = [];
  const mediaPattern = /^MEDIA:\s*(`?)(.+?)\1\s*$/gm;
  let match = null;
  while ((match = mediaPattern.exec(String(text || "")))) {
    const mediaPath = String(match[2] || "").trim();
    const directoryPath = parentDirectoryFromFilePath(mediaPath);
    if (!directoryPath) continue;
    aliases.push({
      messageId,
      label: "\u4ea4\u4ed8\u76ee\u5f55",
      path: directoryPath,
      source: "reference",
      referenceKind: "delivery",
    });
  }
  return aliases;
}

function parseDirectoryAliasEntries(block) {
  const blockHasExplicitPath = String(block || "").includes("=");
  return String(block || "")
    .split(/[;；]/)
    .map((entry) => {
      const [rawLabel, ...pathParts] = entry.split("=");
      const label = cleanDirectoryAliasLabel(rawLabel);
      const rawPath = pathParts.join("=").trim();
      const pathValue = rawPath.replace(/^`+|`+$/g, "").replace(/[。.,，]+$/g, "").trim();
      return { label, path: pathValue };
    })
    .filter((entry) => entry.label && (!blockHasExplicitPath || entry.path) && !isSkillLibraryAliasEntry(entry) && !/主交付|交付目录|交付文件|同步根|delivery|sync\s*root/i.test(entry.label));
}

function cleanDirectoryAliasLabel(value) {
  return String(value || "")
    .replace(/^[-*]\s*/, "")
    .replace(/^目录别名\s*[:：]\s*/, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function isSkillLibraryAliasEntry(entry) {
  const label = directoryAliasKey(entry?.label || "");
  const pathValue = comparableDirectoryPath(entry?.path || "");
  return pathValue.includes(".hermes/skills") || label.includes("\u6280\u80fd\u5e93") || label.includes("skilllibrary");
}

function shortDirectoryAliasLabel(label) {
  const parts = String(label || "").split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(label || "").trim();
}

function directoryAliasKey(value) {
  return String(value || "")
    .replace(/^`+|`+$/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function comparableDirectoryPath(value) {
  return String(value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function configuredOwnerDriveRootNames() {
  const names = Array.isArray(state.displayConfig?.ownerDriveRootNames)
    ? state.displayConfig.ownerDriveRootNames.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return names.length ? names : ["ChatGPT-Drive"];
}

function ownerDriveRootIndexForParts(parts) {
  const names = new Set(configuredOwnerDriveRootNames().map((item) => item.toLowerCase()));
  return (parts || []).findIndex((part) => names.has(String(part || "").toLowerCase()));
}

function pathContainsOwnerDriveRoot(rawPath) {
  const parts = String(rawPath || "").trim().replaceAll("\\", "/").split("/").filter(Boolean);
  return ownerDriveRootIndexForParts(parts) >= 0;
}

function pathMatchesDirectoryRoot(candidatePath, rootPath) {
  const candidate = comparableDirectoryPath(candidatePath);
  const root = comparableDirectoryPath(rootPath);
  if (!candidate || !root) return false;
  return candidate === root || candidate.startsWith(`${root}/`);
}

function relativeDisplayTailForDirectory(rawPath, rootPath) {
  const raw = String(rawPath || "").trim().replaceAll("\\", "/");
  const root = String(rootPath || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "");
  if (raw && root && raw.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return raw.slice(root.length + 1).split("/").filter(Boolean).join(" / ");
  }
  const comparableRaw = comparableDirectoryPath(rawPath);
  const comparableRoot = comparableDirectoryPath(rootPath);
  if (comparableRaw && comparableRoot && comparableRaw.startsWith(`${comparableRoot}/`)) {
    return comparableRaw.slice(comparableRoot.length + 1).split("/").filter(Boolean).join(" / ");
  }
  return "";
}

function logicalUserPathFallback(rawPath, fallbackLabel = "") {
  const normalized = String(rawPath || "").trim().replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const driveIndex = ownerDriveRootIndexForParts(parts);
  if (driveIndex >= 0 && parts.length > driveIndex + 1) return parts.slice(driveIndex + 1).join(" / ");
  const synologyIndex = lowerParts.findIndex((part) => part === "synologydrive");
  if (synologyIndex >= 0) return ["SynologyDrive", ...parts.slice(synologyIndex + 1)].join(" / ");
  const documentsIndex = lowerParts.findIndex((part) => part === "documents");
  const agentIndex = lowerParts.findIndex((part, index) => part === "agent" && index > documentsIndex);
  if (documentsIndex >= 0 && agentIndex >= 0) return ["Agent", ...parts.slice(agentIndex + 1)].join(" / ");
  if (documentsIndex >= 0) return ["Documents", ...parts.slice(documentsIndex + 1)].join(" / ");
  const usersIndex = lowerParts.findIndex((part) => part === "users");
  if (usersIndex >= 0 && parts.length > usersIndex + 2) return ["用户目录", ...parts.slice(usersIndex + 2)].join(" / ");
  return fallbackLabel || parts[parts.length - 1] || "";
}

function projectLabelCandidates(project, parentLabel = "") {
  const labels = [
    project?.label,
    ...(project?.aliases || []),
  ].filter(Boolean);
  if (parentLabel && project?.label) labels.push(`${parentLabel} / ${project.label}`);
  const expanded = [];
  for (const label of labels) {
    expanded.push(label, shortDirectoryAliasLabel(label));
  }
  return expanded.filter(Boolean);
}

function directoryProjectCandidates() {
  const candidates = [];
  for (const project of state.projects || []) {
    if (!project || project.hidden) continue;
    candidates.push({
      projectId: project.id,
      subprojectId: "",
      label: project.label || project.id,
      root: project.root || "",
      labels: projectLabelCandidates(project),
    });
    for (const child of project.children || []) {
      candidates.push({
        projectId: project.id,
        subprojectId: child.id,
        label: child.label || child.id,
        root: child.root || "",
        labels: projectLabelCandidates(child, project.label || ""),
      });
    }
  }
  return candidates;
}

function directoryRouteDisplayPath(route, fallbackLabel = "") {
  const project = (state.projects || []).find((item) => item.id === route?.projectId);
  const child = route?.subprojectId ? (project?.children || []).find((item) => item.id === route.subprojectId) : null;
  const projectLabel = project ? projectDisplayLabel(project) : (route?.label || fallbackLabel || "");
  if (child) return `${projectLabel} / ${child.label || child.id || route.label || fallbackLabel}`;
  return projectLabel || route?.label || fallbackLabel || "";
}

function logicalDirectoryDisplayPath(rawPath, fallbackLabel = "") {
  const value = String(rawPath || "").trim();
  if (!value) return fallbackLabel || "";
  const matches = directoryProjectCandidates()
    .filter((candidate) => candidate.root && pathMatchesDirectoryRoot(value, candidate.root))
    .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
  if (matches.length) {
    const route = matches[0];
    const base = directoryRouteDisplayPath(route, route.label || fallbackLabel);
    const tail = relativeDisplayTailForDirectory(value, route.root);
    return [base, tail].filter(Boolean).join(" / ");
  }
  const workspace = currentWorkspace();
  if (workspace?.defaultWorkspace && pathMatchesDirectoryRoot(value, workspace.defaultWorkspace)) {
    const tail = relativeDisplayTailForDirectory(value, workspace.defaultWorkspace);
    return [workspace.label || "工作区", tail].filter(Boolean).join(" / ");
  }
  return logicalUserPathFallback(value, fallbackLabel);
}

function rewriteDirectoryPathsForDisplay(text) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\/mnt\/[A-Za-z]\/|\\\\wsl(?:\.localhost|\$)?\\[^\\\s]+\\|\/\/wsl(?:\.localhost|\$)?\/[^/\s]+\/)[^\s`<>"']+/gi;
  return String(text || "").replace(pathPattern, (match) => {
    const suffixMatch = match.match(/[)\].,;:，。；、）】》]+$/);
    const suffix = suffixMatch ? suffixMatch[0] : "";
    const core = suffix ? match.slice(0, -suffix.length) : match;
    const logical = logicalDirectoryDisplayPath(core);
    return logical ? `${logical}${suffix}` : match;
  });
}

function isGenericDefaultDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "默认目录",
    "默认资料根",
    "资料根",
    "资料根目录",
    "defaultdirectory",
    "defaultdataroot",
  ].includes(label);
}

function isOperationalTaskDirectoryAlias(alias, route = null) {
  const label = directoryAliasKey(alias?.label || "");
  const pathValue = comparableDirectoryPath(alias?.path || route?.root || "");
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

function isGenericCurrentBoundDirectoryAlias(alias) {
  const label = directoryAliasKey(alias?.label);
  return [
    "\u5f53\u524d\u7ed1\u5b9a\u76ee\u5f55",
    "\u5f53\u524d\u7ed1\u5b9a\u5de5\u4f5c\u533a",
    "\u7ed1\u5b9a\u76ee\u5f55",
    "\u4efb\u52a1\u7ed1\u5b9a\u76ee\u5f55",
    "\u672c\u4efb\u52a1\u76ee\u5f55",
    "currentbounddirectory",
    "bounddirectory",
    "attacheddirectory",
    "currentdirectory",
  ].includes(label);
}

function explicitDirectoryRouteForContext(context = null) {
  const aliases = [];
  const isChatContext = isSingleWindowConversationTaskGroupId(context?.taskGroupId);
  if (!isChatContext && context?.taskGroupId && state.currentThread) {
    const group = taskGroupsForThread(state.currentThread).find((item) => item.id === context.taskGroupId);
    if (group) aliases.push(...explicitTaskDirectoryAliases(group));
  }
  aliases.push(...messageDirectoryAliases(context));
  for (const alias of aliases) {
    if (isGenericDefaultDirectoryAlias(alias) || isGenericCurrentBoundDirectoryAlias(alias) || isDeliveryDirectoryAlias(alias)) continue;
    const route = resolveDirectoryProjectRoute(alias);
    if (route) return route;
  }
  return null;
}

function messageTaskSearchText(message) {
  const group = isSingleWindowConversationTaskGroupId(message?.taskGroupId) ? null : messageTaskGroup(message);
  return [message?.content || "", ...(group?.messages || []).map((item) => item.content || "")]
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function semanticDirectoryRouteForMessage(message) {
  const text = messageTaskSearchText(message);
  if (!text) return null;
  const matches = [];
  for (const candidate of directoryProjectCandidates()) {
    for (const label of candidate.labels || []) {
      const key = directoryAliasKey(label);
      if (key.length >= 2 && text.includes(key)) {
        matches.push({
          candidate,
          score: key.length * 100 + comparableDirectoryPath(candidate.root).length,
        });
      }
    }
  }
  if (!matches.length) return null;
  return matches.sort((a, b) => b.score - a.score)[0].candidate;
}

function resolveDirectoryProjectRoute(alias) {
  const aliasLabel = directoryAliasKey(alias?.label);
  const aliasPath = alias?.path || alias?.root || "";
  const candidates = directoryProjectCandidates();
  const requestedProjectId = String(alias?.projectId || "").trim();
  const requestedSubprojectId = String(alias?.subprojectId || "").trim();
  if (requestedProjectId) {
    const projectMatches = candidates
      .filter((candidate) => candidate.projectId === requestedProjectId && (!requestedSubprojectId || candidate.subprojectId === requestedSubprojectId));
    if (aliasPath) {
      const pathScopedProjectMatches = projectMatches
        .filter((candidate) => (
          candidate.root
          && (
            pathMatchesDirectoryRoot(aliasPath, candidate.root)
            || pathMatchesDirectoryRoot(candidate.root, aliasPath)
          )
        ))
        .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
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
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length);
    if (sortedProjectMatches.length) return sortedProjectMatches[0];
  }
  const pathMatches = aliasPath
    ? candidates
      .filter((candidate) => pathMatchesDirectoryRoot(aliasPath, candidate.root))
      .sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)
    : [];
  if (pathMatches.length) return pathMatches[0];

  if (!aliasLabel) return null;
  const exact = candidates.filter((candidate) =>
    candidate.labels.some((label) => directoryAliasKey(label) === aliasLabel));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => comparableDirectoryPath(b.root).length - comparableDirectoryPath(a.root).length)[0];
  }
  return null;
}

function isGenericOwnerTopicRoute(route) {
  const projectId = String(route?.projectId || "");
  return GENERIC_OWNER_TOPIC_ROUTE_IDS.has(projectId)
    || GENERIC_OWNER_TOPIC_ROUTE_PREFIXES.some((prefix) => projectId.startsWith(prefix));
}

function isContextAnchorDirectoryRoute(route) {
  if (!route?.root) return false;
  if (route.subprojectId) return false;
  if (route.projectId === "single-window") return false;
  if (isGenericOwnerTopicRoute(route)) return false;
  return true;
}

function coalesceDirectoryAliasItems(items) {
  const anchors = (items || []).filter((item) => isContextAnchorDirectoryRoute(item.route));
  if (!anchors.length) return items || [];
  return (items || []).filter((item) => {
    if (!isGenericOwnerTopicRoute(item.route)) return true;
    return anchors.some((anchor) => pathMatchesDirectoryRoot(item.route.root, anchor.route.root));
  });
}

function uniqueDirectoryAliasItems(items) {
  const unique = new Map();
  for (const item of items || []) {
    const route = item.route || {};
    const displayAlias = item.displayAlias || {};
    const key = route.projectId
      ? `${route.projectId}|${route.subprojectId || ""}|${comparableDirectoryPath(displayAlias.path || route.root || "")}`
      : `${displayAlias.label || ""}|${comparableDirectoryPath(displayAlias.path || "")}`;
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function renderDirectoryAliases(aliases, message, options = {}) {
  const items = directoryAliasItemsForAliases(aliases, message, { coalesce: options.reference ? false : undefined });
  if (!items.length) return "";
  return `<div class="directory-aliases">${items.map(({ displayAlias, route }) => {
    let directoryPath = displayAlias.path || route?.root || "";
    if (route?.root && directoryPath && !pathMatchesDirectoryRoot(directoryPath, route.root)) directoryPath = route.root;
    const reference = Boolean(options.reference || displayAlias.referenceKind || displayAlias.source === "reference");
    const chipClass = `directory-alias-chip${reference ? " directory-alias-chip-reference" : ""}`;
    if (route) {
      const pathIsNested = Boolean(
        route.root
        && directoryPath
        && pathMatchesDirectoryRoot(directoryPath, route.root)
        && comparableDirectoryPath(directoryPath) !== comparableDirectoryPath(route.root)
      );
      const baseLabel = pathIsNested && displayAlias.label
        ? displayAlias.label
        : (reference || pathIsNested
        ? logicalDirectoryDisplayPath(directoryPath, route.label || displayAlias.label)
        : directoryRouteDisplayPath(route, route.label || displayAlias.label));
      const label = reference ? `\u4ea4\u4ed8 \u00b7 ${baseLabel}` : baseLabel;
      return `<span class="${chipClass} directory-alias-chip-mapped" title="${escapeHtml(label)}">
        <span class="directory-alias-text">${escapeHtml(label)}</span>
        <button class="directory-alias-open learning-growth-board-artifact-link" type="button" data-directory-project data-project-id="${escapeHtml(route.projectId)}" data-subproject-id="${escapeHtml(route.subprojectId || "")}" data-directory-path="${escapeHtml(directoryPath)}" aria-label="打开目录">
          <span class="directory-alias-icon learning-growth-board-artifact-icon" aria-hidden="true"></span>
        </button>
      </span>`;
    }
    const fallbackLabel = reference ? `\u4ea4\u4ed8 \u00b7 ${shortDirectoryAliasLabel(displayAlias.label)}` : shortDirectoryAliasLabel(displayAlias.label);
    return `<span class="${chipClass}" title="${escapeHtml(fallbackLabel)}">
      <span class="directory-alias-text">${escapeHtml(fallbackLabel)}</span>
      <button class="directory-alias-open learning-growth-board-artifact-link" type="button" data-directory-path-open data-directory-path="${escapeHtml(directoryPath)}" data-directory-label="${escapeHtml(displayAlias.label || "")}" aria-label="打开目录">
        <span class="directory-alias-icon learning-growth-board-artifact-icon" aria-hidden="true"></span>
      </button>
    </span>`;
  }).join("")}</div>`;
}

async function openDirectoryProjectRoute(projectId, subprojectId = "", pathText = "") {
  if (!projectId) return;
  if (!state.projects.some((project) => project.id === projectId)) return;
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.selectedProjectId = projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  const project = currentProject();
  const hasSubproject = Boolean(subprojectId && (project?.children || []).some((item) => item.id === subprojectId));
  state.selectedSubprojectId = hasSubproject ? subprojectId : "";
  localStorage.setItem("hermesWebSubproject", state.selectedSubprojectId);
  renderSubprojects();
  const directoryTarget = currentDirectoryTarget();
  const directoryRoot = project?.root || directoryTarget?.root || "";
  const requestedPath = String(pathText || "").trim();
  const targetPath = requestedPath && (!directoryRoot || pathMatchesDirectoryRoot(requestedPath, directoryRoot))
    ? requestedPath
    : (directoryTarget?.root || directoryRoot);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, directoryRoot || targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

async function openDirectoryPathInManager(pathText, label = "") {
  const targetPath = String(pathText || "").trim();
  if (!targetPath) throw new Error("No directory path is available.");
  const route = resolveDirectoryProjectRoute({ label, path: targetPath });
  if (route?.projectId) {
    await openDirectoryProjectRoute(route.projectId, route.subprojectId || "", targetPath);
    return;
  }
  const returnRoute = captureDirectoryReturnRoute();
  state.directoryReturnRoute = returnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  syncDirectoryRouteFromPath(targetPath);
  resetDirectoryPath(targetPath, { rootPath: directoryRootForPath(targetPath, targetPath) });
  if (!returnRoute) {
    state.currentThread = null;
    state.currentThreadId = "";
    state.currentTaskGroupId = "";
  }
  applyViewMode();
  if (returnRoute && $("threadSearch")) {
    $("threadSearch").value = "";
    updateSearchButton();
  }
  try {
    await loadDirectoryView();
  } catch (err) {
    if (returnRoute) restoreDirectoryReturnRoute();
    throw err;
  }
  if (isMobileLayout()) closeSidebar();
}

function wireDirectoryProjectLinks(root) {
  root?.querySelectorAll?.("[data-directory-project]").forEach((button) => {
    if (button.dataset.boundDirectoryProject) return;
    button.dataset.boundDirectoryProject = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryProjectRoute(
        button.dataset.projectId,
        button.dataset.subprojectId || "",
        button.dataset.directoryPath || ""
      ).catch(showError);
    });
  });
  root?.querySelectorAll?.("[data-directory-path-open]").forEach((button) => {
    if (button.dataset.boundDirectoryPathOpen) return;
    button.dataset.boundDirectoryPathOpen = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDirectoryPathInManager(button.dataset.directoryPath || "", button.dataset.directoryLabel || "").catch(showError);
    });
  });
}
