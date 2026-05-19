"use strict";

const X_SEARCH_FIX_ID = "narrow-x-search-invocation";

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function uniquePush(items, value, maxItems = 8) {
  const text = cleanText(value)
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length < 3) return;
  const clipped = text.length > 260 ? `${text.slice(0, 257)}...` : text;
  if (items.some((item) => item.toLowerCase() === clipped.toLowerCase())) return;
  if (items.length < maxItems) items.push(clipped);
}

function parseFrontmatter(content) {
  const text = cleanText(content);
  if (!text.startsWith("---\n")) return { data: {}, body: text, hasFrontmatter: false };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { data: {}, body: text, hasFrontmatter: false };
  const raw = text.slice(4, end);
  const data = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(end + 4).trim(), hasFrontmatter: true, rawFrontmatter: raw, rest: text.slice(end + 4) };
}

function splitSections(content) {
  const sections = [];
  let current = { title: "", lines: [] };
  for (const line of cleanText(content).split("\n")) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: match[2].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.title || current.lines.length) sections.push(current);
  return sections;
}

function compactLines(text, maxItems = 6) {
  const items = [];
  for (const line of cleanText(text).split("\n")) {
    const stripped = line.trim();
    if (!stripped || /^```/.test(stripped) || /^---+$/.test(stripped)) continue;
    uniquePush(items, stripped, maxItems);
  }
  return items;
}

function sectionLines(sections, titlePattern, maxItems = 6) {
  const items = [];
  for (const section of sections) {
    if (!titlePattern.test(section.title || "")) continue;
    for (const line of compactLines(section.lines.join("\n"), maxItems)) uniquePush(items, line, maxItems);
  }
  return items;
}

function matchingLines(content, patterns, maxItems = 8) {
  const items = [];
  for (const line of compactLines(content, 200)) {
    if (patterns.some((pattern) => pattern.test(line))) uniquePush(items, line, maxItems);
  }
  return items;
}

function firstParagraph(content) {
  for (const block of cleanText(content).split(/\n{2,}/)) {
    const lines = compactLines(block, 3);
    if (lines.length) return lines.join(" ");
  }
  return "";
}

function chineseLine(value, prefix = "") {
  let text = cleanText(value);
  const replacements = [
    [/^Use this skill when\s+/i, "适用："],
    [/^Use when\s+/i, "适用："],
    [/^This skill should be used when\s+/i, "适用："],
    [/^Do not use\s*/i, "不要用于："],
    [/^Never\s+/i, "不要："],
    [/^Avoid\s+/i, "避免："],
    [/^Input:\s*/i, "输入："],
    [/^Output:\s*/i, "输出："],
    [/\bX search\b/gi, "X 搜索"],
    [/\bX account\b/gi, "X 账号"],
    [/\bX posts?\b/gi, "X 帖子"],
    [/\bTwitter\b/gi, "X/Twitter"],
    [/\bsocial-media briefs?\b/gi, "社媒简报"],
    [/\blocal data lookup\b/gi, "本地数据查询"],
    [/\bgeneral answer\b/gi, "一般回答"],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return prefix && !text.startsWith(prefix) ? `${prefix}${text}` : text;
}

function chineseLines(items, prefix = "", maxItems = 8) {
  return (items || []).reduce((out, item) => {
    uniquePush(out, chineseLine(item, prefix), maxItems);
    return out;
  }, []);
}

function inferModificationNotes(analysis) {
  const notes = [];
  if (!analysis.invocationConditions.length) {
    uniquePush(notes, "调用条件没有明确写出；应先收窄 frontmatter description，或补充 Use when / Do not use 规则。", 6);
  }
  if (!analysis.nonInvocationConditions.length) {
    uniquePush(notes, "缺少“不要调用”边界，容易在相邻场景被模型泛化加载。", 6);
  }
  const combined = [
    analysis.summary,
    ...analysis.invocationConditions,
    ...analysis.capabilities,
  ].join(" ").toLowerCase();
  if (/\bx\b|twitter|social|monitor|search/.test(combined)) {
    uniquePush(notes, "这个 Skill 接近 X/social/search 语义；如果只希望 X 搜索时调用，应把触发条件限定到 X 搜索、X 趋势、X 帖子、X 账号监控等。", 6);
  }
  if (/all|any|general|default|whenever|always/.test(combined)) {
    uniquePush(notes, "存在较宽泛的触发词；修改时应改成可判定的任务类型。", 6);
  }
  if (!notes.length) {
    uniquePush(notes, "优先检查 description、Use when / Do not use、Workflow 三块；这些最影响模型是否加载该 Skill。", 6);
  }
  return notes;
}

function isXSearchSkill(detail, analysis) {
  const text = [
    detail?.id,
    detail?.label,
    detail?.namespace,
    detail?.path,
    analysis?.summary,
    ...(analysis?.invocationConditions || []),
    ...(analysis?.capabilities || []),
  ].join(" ").toLowerCase();
  return /\bx\b|twitter|social|monitor|x-social|x_search/.test(text);
}

function suggestedFixes(detail, analysis) {
  if (!isXSearchSkill(detail, analysis)) return [];
  return [{
    id: X_SEARCH_FIX_ID,
    label: "收窄 X 搜索调用条件",
    description: "把 description 和 Do not use 边界改成只在明确需要 X/Twitter 作为信源时调用，避免本地数据、普通问答、非 X 网络搜索误触发。",
    risk: "low",
    ownerOnly: true,
  }];
}

function xSearchDescription() {
  return "Use only when the user explicitly asks to search X/Twitter, inspect X posts/accounts, monitor X trends, or build an X-sourced social brief. Do not use for local data, general Q&A, or non-X web search.";
}

function replaceFrontmatterDescription(content) {
  const text = String(content || "").replace(/\r\n/g, "\n").trimEnd();
  if (!text.startsWith("---\n")) {
    return `---\ndescription: ${xSearchDescription()}\n---\n\n${text}`;
  }
  const end = text.indexOf("\n---", 4);
  if (end < 0) return `---\ndescription: ${xSearchDescription()}\n---\n\n${text}`;
  const lines = text.slice(4, end).split("\n");
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (!/^description\s*:/i.test(line)) return line;
    replaced = true;
    return `description: ${xSearchDescription()}`;
  });
  if (!replaced) nextLines.push(`description: ${xSearchDescription()}`);
  return `---\n${nextLines.join("\n")}\n---${text.slice(end + 4)}`;
}

function ensureDoNotUseSection(content) {
  const text = String(content || "").replace(/\r\n/g, "\n").trimEnd();
  const bullets = [
    "- Do not use for ordinary local data lookup, general Q&A, or non-X web search.",
    "- Do not use just because the message mentions social media or search unless the requested evidence source is X/Twitter.",
  ];
  if (!/^##\s+Do not use\b/im.test(text)) return `${text}\n\n## Do not use\n\n${bullets.join("\n")}\n`;
  let next = text;
  for (const bullet of bullets) {
    if (!next.toLowerCase().includes(bullet.toLowerCase())) next += `\n${bullet}`;
  }
  return `${next}\n`;
}

function applyXSearchFix(content) {
  return ensureDoNotUseSection(replaceFrontmatterDescription(content));
}

function createSkillAnalysisService() {
  function analyze(detail) {
    const content = cleanText(detail?.content);
    if (!content) {
      const err = new Error("Skill content is empty");
      err.status = 422;
      throw err;
    }
    const parsed = parseFrontmatter(content);
    const sections = splitSections(parsed.body || content);
    const rawSummary = parsed.data.description || firstParagraph(parsed.body || content) || "SKILL.md 没有可提取的功能描述。";
    const capabilities = chineseLines([
      ...sectionLines(sections, /capabilit|what it does|workflow|core|功能|能力|用途|流程/i, 6),
      ...matchingLines(content, [/^use this skill/i, /^this skill/i, /can\s+/i, /用于|能力|负责/], 6),
    ], "", 6);
    const invocationConditions = chineseLines([
      ...(parsed.data.description ? [parsed.data.description] : []),
      ...sectionLines(sections, /trigger|use when|when to use|适用|触发|调用/i, 8),
      ...matchingLines(content, [/use when/i, /should be used when/i, /when the user/i, /applies when/i, /适用|触发|调用/], 8),
    ], "", 8);
    const nonInvocationConditions = chineseLines([
      ...sectionLines(sections, /do not|never|avoid|out of scope|不要|不应|禁止|边界/i, 8),
      ...matchingLines(content, [/do not/i, /never/i, /avoid/i, /out of scope/i, /不要|不应|禁止|不能/], 8),
    ], "", 8);
    const inputsOutputs = chineseLines([
      ...sectionLines(sections, /input|output|requires|artifact|files|tools|输入|输出|工具|文件/i, 8),
      ...matchingLines(content, [/input|output|requires|artifact|file|tool|输入|输出|工具|文件/i], 8),
    ], "", 8);
    const analysis = {
      skill: {
        id: detail?.id || "",
        label: detail?.label || detail?.id || "",
        namespace: detail?.namespace || "",
        path: detail?.path || "",
      },
      summary: chineseLine(rawSummary, "功能："),
      capabilities: capabilities.length ? capabilities : ["未找到明确的功能列表；需要人工阅读正文确认。"],
      invocationConditions,
      nonInvocationConditions,
      inputsOutputs,
      modificationNotes: [],
      fixes: [],
      source: {
        frontmatterKeys: Object.keys(parsed.data),
        sectionTitles: sections.map((section) => section.title).filter(Boolean).slice(0, 20),
        totalChars: detail?.totalChars || content.length,
        truncated: Boolean(detail?.truncated),
      },
    };
    analysis.modificationNotes = inferModificationNotes(analysis);
    analysis.fixes = suggestedFixes(detail, analysis);
    return analysis;
  }

  function applyFix(detail, fixId) {
    const id = String(fixId || "").trim();
    if (id !== X_SEARCH_FIX_ID) {
      const err = new Error("Unknown Skill fix");
      err.status = 400;
      throw err;
    }
    const content = String(detail?.content || "");
    const analysis = analyze(detail);
    if (!isXSearchSkill(detail, analysis)) {
      const err = new Error("This fix applies only to X/Twitter search skills");
      err.status = 422;
      throw err;
    }
    const nextContent = applyXSearchFix(content);
    const fix = suggestedFixes(detail, analysis).find((item) => item.id === id) || { id };
    return { fix, content: nextContent, changed: nextContent !== content };
  }

  return { analyze, applyFix };
}

module.exports = {
  X_SEARCH_FIX_ID,
  createSkillAnalysisService,
};
