"use strict";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const FONT_SCALE_ORDER = ["small", "standard", "large", "xlarge"];
const FONT_SCALE_CLASS = new Map([
  ["small", "hermes-markdown-font-small"],
  ["standard", "hermes-markdown-font-standard"],
  ["large", "hermes-markdown-font-large"],
  ["xlarge", "hermes-markdown-font-xlarge"],
]);
const DEFAULT_BASE_FONT_SCALE = "standard";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sanitizeLinkHref(href) {
  const raw = String(href ?? "").trim();
  if (!raw) {
    return "#";
  }

  const withoutControls = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  const lower = withoutControls.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:")
  ) {
    return "#";
  }

  if (
    withoutControls.startsWith("#") ||
    withoutControls.startsWith("/") ||
    withoutControls.startsWith("./") ||
    withoutControls.startsWith("../")
  ) {
    return withoutControls;
  }

  try {
    const parsed = new URL(withoutControls);
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol) ? withoutControls : "#";
  } catch (_error) {
    return /^[A-Za-z0-9._~/?#[\]@!$&'()*+,;=:%-]+$/.test(withoutControls)
      ? withoutControls
      : "#";
  }
}

function sanitizeImageSrc(src) {
  const raw = String(src ?? "").trim();
  if (!raw) {
    return "#";
  }

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

  if (
    withoutControls.startsWith("/") ||
    withoutControls.startsWith("./") ||
    withoutControls.startsWith("../")
  ) {
    return withoutControls;
  }

  try {
    const parsed = new URL(withoutControls);
    return SAFE_IMAGE_PROTOCOLS.has(parsed.protocol) ? withoutControls : "#";
  } catch (_error) {
    return /^[A-Za-z0-9._~/?#[\]@!$&'()*+,;=:%-]+$/.test(withoutControls)
      ? withoutControls
      : "#";
  }
}

function renderMarkdownImage(alt, src, title = "") {
  const safeSrc = sanitizeImageSrc(src);
  if (safeSrc === "#") {
    return "";
  }
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : "";
  return `<img class="hermes-markdown-image" src="${escapeAttribute(safeSrc)}" alt="${escapeAttribute(alt)}"${titleAttr} loading="lazy" decoding="async">`;
}

function normalizeFontScale(fontScale, fallback = DEFAULT_BASE_FONT_SCALE) {
  const scale = String(fontScale || fallback).toLowerCase();
  if (FONT_SCALE_CLASS.has(scale)) {
    return scale;
  }
  const fallbackScale = String(fallback || DEFAULT_BASE_FONT_SCALE).toLowerCase();
  return FONT_SCALE_CLASS.has(fallbackScale) ? fallbackScale : DEFAULT_BASE_FONT_SCALE;
}

function markdownFontScaleForBase(baseFontScale) {
  const base = normalizeFontScale(baseFontScale, DEFAULT_BASE_FONT_SCALE);
  const index = FONT_SCALE_ORDER.indexOf(base);
  return FONT_SCALE_ORDER[Math.min(FONT_SCALE_ORDER.length - 1, Math.max(0, index))] || base;
}

function markdownFontScaleClass(fontScale) {
  return FONT_SCALE_CLASS.get(normalizeFontScale(fontScale, markdownFontScaleForBase())) || FONT_SCALE_CLASS.get(DEFAULT_BASE_FONT_SCALE);
}

function renderMarkdownDocument(markdown, options = {}) {
  const fontScale = normalizeFontScale(options.fontScale, markdownFontScaleForBase(options.baseFontScale));
  const classes = [
    "hermes-markdown-doc",
    "hermes-markdown-mobile",
    markdownFontScaleClass(fontScale),
  ];
  if (options.className) {
    classes.push(
      ...String(options.className)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/[^A-Za-z0-9_-]/g, ""))
        .filter(Boolean),
    );
  }
  return `<article class="${classes.join(" ")}" data-font-scale="${escapeAttribute(fontScale)}">${renderMarkdownToHtml(markdown, options)}</article>`;
}

function renderWeixinMarkdownForwardHtml(title, sourcePath, markdown, options = {}) {
  const rendered = renderMarkdownToHtml(markdown, Object.assign({ tableLabels: true }, options));
  const safeTitle = escapeHtml(title || "Markdown");
  const safeSource = escapeHtml(sourcePath || "");
  const kicker = escapeHtml(options.kicker || "Hermes Mobile / Weixin readable PDF");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
@page { size: 88mm 190mm; margin: 6mm 5.5mm 7mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #17222b; background: #fffaf2; }
body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", Arial, sans-serif; font-size: 11.8pt; line-height: 1.68; }
main { width: 100%; }
.document-cover { margin: 0 0 5mm; padding: 0 0 4mm; border-bottom: 1px solid rgba(36, 53, 48, 0.14); }
.document-kicker { color: #1f7768; font-size: 8pt; font-weight: 600; letter-spacing: 0; margin: 0 0 1.6mm; }
.document-title { color: #111b22; font-size: 17pt; line-height: 1.24; font-weight: 600; letter-spacing: 0; margin: 0; overflow-wrap: anywhere; }
.source { color: #667085; font-size: 7.8pt; line-height: 1.35; margin: 2mm 0 0; overflow-wrap: anywhere; }
article { width: 100%; overflow-wrap: anywhere; word-break: break-word; }
h1, h2, h3, h4, h5, h6 { color: #111b22; line-height: 1.28; letter-spacing: 0; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 16pt; margin: 5.2mm 0 2.2mm; }
h2 { font-size: 13.6pt; margin: 4.8mm 0 2mm; padding-bottom: 1.1mm; border-bottom: 1px solid rgba(36, 53, 48, 0.14); }
h3 { font-size: 12.2pt; margin: 4mm 0 1.5mm; }
h4, h5, h6 { font-size: 11.4pt; margin: 3.2mm 0 1.2mm; }
p, ul, ol, blockquote, pre, .markdown-table-wrap { margin: 2.5mm 0; }
ul, ol { padding-left: 5.3mm; }
li + li { margin-top: 1.1mm; }
strong { font-weight: 600; color: #111b22; }
em { color: #34444e; }
a { color: #1f7768; text-decoration: none; overflow-wrap: anywhere; }
blockquote { padding: 0.4mm 0 0.4mm 3mm; color: #40515c; border-left: 3px solid rgba(31, 119, 104, 0.32); background: rgba(31, 119, 104, 0.045); }
code { padding: 0.2mm 0.9mm; color: #102027; background: rgba(20, 32, 39, 0.08); border-radius: 3px; font-family: "Cascadia Code", Consolas, monospace; font-size: 0.86em; }
pre { overflow-wrap: anywhere; white-space: pre-wrap; padding: 2.5mm; color: #142027; background: rgba(20, 32, 39, 0.075); border: 1px solid rgba(36, 53, 48, 0.1); border-radius: 6px; line-height: 1.52; }
pre code { padding: 0; background: transparent; border-radius: 0; font-size: 0.9em; }
img, .hermes-markdown-image { display: block; max-width: 100%; height: auto; border-radius: 6px; }
.hermes-markdown-task-checkbox { margin-right: 1.4mm; }
hr { margin: 4mm 0; border: 0; border-top: 1px solid rgba(36, 53, 48, 0.16); }
.markdown-table-wrap { border: 0; border-radius: 0; background: transparent; }
table, thead, tbody, tr, th, td { display: block; width: 100%; }
thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
tr { margin: 0 0 2.6mm; border: 1px solid rgba(36, 53, 48, 0.14); border-radius: 6px; background: rgba(255, 255, 255, 0.68); overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
td { display: grid; grid-template-columns: minmax(18mm, 36%) minmax(0, 1fr); gap: 2mm; align-items: start; padding: 2mm 2.2mm; border: 0; border-bottom: 1px solid rgba(36, 53, 48, 0.11); overflow-wrap: anywhere; word-break: break-word; }
td:last-child { border-bottom: 0; }
td::before { content: attr(data-label); color: #42515c; font-size: 0.82em; font-weight: 600; line-height: 1.35; }
td[data-label=""] { grid-template-columns: 1fr; }
td[data-label=""]::before { content: none; }
</style>
</head>
<body>
<main>
<section class="document-cover">
<div class="document-kicker">${kicker}</div>
<h1 class="document-title">${safeTitle}</h1>
<div class="source">${safeSource}</div>
</section>
<article>
${rendered}
</article>
</main>
</body>
</html>`;
}

function renderMarkdownToHtml(markdown, options = {}) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^```([A-Za-z0-9_+.-]*)\s*$/);
    if (fenceMatch) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const language = fenceMatch[1] ? ` data-language="${escapeAttribute(fenceMatch[1])}"` : "";
      html.push(`<pre class="hermes-markdown-code"${language}><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2], options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index, options);
      html.push(parsed.html);
      index = parsed.nextIndex;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"), options)}</blockquote>`);
      continue;
    }

    if (isListLine(line)) {
      const parsed = parseList(lines, index, options);
      html.push(parsed.html);
      index = parsed.nextIndex;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !isListLine(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "), options)}</p>`);
  }

  return html.join("\n");
}

function isListLine(line) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function parseList(lines, startIndex, options) {
  const ordered = /^\s*\d+[.)]\s+/.test(lines[startIndex]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;
  let hasTask = false;
  const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;

  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) {
      break;
    }
    let body = match[1];
    let itemClass = "";
    const taskMatch = body.match(/^\[( |x|X)\]\s+(.+)$/);
    if (taskMatch) {
      const checked = taskMatch[1].toLowerCase() === "x";
      hasTask = true;
      itemClass = ' class="hermes-markdown-task-item"';
      body = `<input class="hermes-markdown-task-checkbox" type="checkbox" disabled${checked ? " checked" : ""}> ${renderInline(taskMatch[2], options)}`;
    } else {
      body = renderInline(body, options);
    }
    items.push(`<li${itemClass}>${body}</li>`);
    index += 1;
  }

  const listClass = ordered || !hasTask ? "hermes-markdown-list" : "hermes-markdown-list hermes-markdown-task-list";
  return {
    html: `<${tag} class="${listClass}">\n${items.join("\n")}\n</${tag}>`,
    nextIndex: index,
  };
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
  );
}

function parseTable(lines, startIndex, options) {
  const headers = splitTableRow(lines[startIndex]);
  const alignments = splitTableRow(lines[startIndex + 1]).map((cell) => {
    const trimmed = cell.trim();
    if (/^:-+:$/.test(trimmed)) return "center";
    if (/^-+:$/.test(trimmed)) return "right";
    if (/^:-+$/.test(trimmed)) return "left";
    return "";
  });
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const headerHtml = headers
    .map((header, column) => tableCell("th", header, alignments[column], options))
    .join("");
  const rowsHtml = rows
    .map((row) => `<tr>${headers.map((header, column) => tableCell("td", row[column] || "", alignments[column], options, header)).join("")}</tr>`)
    .join("\n");

  return {
    html: `<div class="markdown-table-wrap hermes-markdown-table-wrapper table-wrapper"><table class="hermes-markdown-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`,
    nextIndex: index,
  };
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function tableCell(tag, value, align, options, label = "") {
  const alignAttr = align ? ` data-align="${align}"` : "";
  const labelAttr = tag === "td" && options.tableLabels !== false ? ` data-label="${escapeAttribute(label)}"` : "";
  return `<${tag}${alignAttr}${labelAttr}>${renderInline(value, options)}</${tag}>`;
}

function renderInline(value, options = {}) {
  const codeTokens = [];
  const imageTokens = [];
  let text = String(value ?? "").replace(/`([^`]+)`/g, (_match, code) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = text.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (match, alt, src, title = "") => {
    const imageHtml = renderMarkdownImage(alt, src, title);
    if (!imageHtml) {
      return match;
    }
    const token = `\u0000IMAGE${imageTokens.length}\u0000`;
    imageTokens.push(imageHtml);
    return token;
  });

  text = escapeHtml(text);
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label, href) => {
    const safeHref = sanitizeLinkHref(href);
    const target = options.linkTarget ? ` target="${escapeAttribute(options.linkTarget)}"` : "";
    const rel = options.linkTarget ? ' rel="noopener noreferrer"' : "";
    return `<a href="${escapeAttribute(safeHref)}"${target}${rel}>${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, "$1<em>$2</em>");

  codeTokens.forEach((html, tokenIndex) => {
    text = text.replace(new RegExp(`\\u0000CODE${tokenIndex}\\u0000`, "g"), html);
  });
  imageTokens.forEach((html, tokenIndex) => {
    text = text.replace(new RegExp(`\\u0000IMAGE${tokenIndex}\\u0000`, "g"), html);
  });
  return text;
}

module.exports = {
  escapeHtml,
  markdownFontScaleForBase,
  markdownFontScaleClass,
  renderMarkdownDocument,
  renderMarkdownToHtml,
  renderWeixinMarkdownForwardHtml,
  sanitizeImageSrc,
  sanitizeLinkHref,
};
