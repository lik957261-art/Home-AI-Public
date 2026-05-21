"use strict";

(function attachHermesMarkdownRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HermesMarkdownRenderer = api;
})(typeof window !== "undefined" ? window : globalThis, function createHermesMarkdownRenderer() {
  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
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
    if (!raw) return "#";

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

  function normalizeFontScale(fontScale, fallback = DEFAULT_BASE_FONT_SCALE) {
    const scale = String(fontScale || fallback).toLowerCase();
    if (FONT_SCALE_CLASS.has(scale)) return scale;
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

  function safeClassNames(value) {
    return String(value || "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/[^A-Za-z0-9_-]/g, ""))
      .filter(Boolean);
  }

  function renderMarkdownDocument(markdown, options = {}) {
    const fontScale = normalizeFontScale(options.fontScale, markdownFontScaleForBase(options.baseFontScale));
    const classes = [
      "hermes-markdown-doc",
      "hermes-markdown-mobile",
      markdownFontScaleClass(fontScale),
    ];
    if (options.className) classes.push(...safeClassNames(options.className));
    return `<article class="${classes.join(" ")}" data-font-scale="${escapeAttribute(fontScale)}">${renderMarkdownToHtml(markdown, options)}</article>`;
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
        if (index < lines.length) index += 1;
        const language = fenceMatch[1] && options.codeFenceLanguage !== false
          ? ` data-language="${escapeAttribute(fenceMatch[1])}"`
          : "";
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

      if (/^[-*_]{3,}$/.test(line.trim())) {
        html.push("<hr>");
        index += 1;
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
        !isTableStart(lines, index) &&
        !/^[-*_]{3,}$/.test(lines[index].trim())
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
      if (!match) break;
      let body = match[1];
      let itemClass = "";
      const taskMatch = body.match(/^\[( |x|X)\]\s+(.+)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === "x";
        hasTask = true;
        itemClass = options.taskListCompatibility
          ? ' class="task-list-item hermes-markdown-task-item"'
          : ' class="hermes-markdown-task-item"';
        const renderedTask = renderInline(taskMatch[2], options);
        body = options.taskListCompatibility
          ? `<input class="hermes-markdown-task-checkbox" type="checkbox" disabled${checked ? " checked" : ""}><span>${renderedTask}</span>`
          : `<input class="hermes-markdown-task-checkbox" type="checkbox" disabled${checked ? " checked" : ""}> ${renderedTask}`;
      } else {
        body = renderInline(body, options);
      }
      items.push(`<li${itemClass}>${body}</li>`);
      index += 1;
    }

    const listClass = ordered || !hasTask
      ? "hermes-markdown-list"
      : (options.taskListCompatibility
        ? "hermes-markdown-list task-list hermes-markdown-task-list"
        : "hermes-markdown-list hermes-markdown-task-list");
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
    let text = String(value ?? "").replace(/`([^`]+)`/g, (_match, code) => {
      const token = `\u0000CODE${codeTokens.length}\u0000`;
      codeTokens.push(`<code>${escapeHtml(code)}</code>`);
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
    return text;
  }

  return {
    escapeHtml,
    markdownFontScaleForBase,
    markdownFontScaleClass,
    renderMarkdownDocument,
    renderMarkdownToHtml,
    sanitizeLinkHref,
  };
});
