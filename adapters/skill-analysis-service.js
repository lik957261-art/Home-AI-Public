"use strict";

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
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { data: {}, body: text };
  const raw = text.slice(4, end);
  const data = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(end + 4).trim() };
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
    for (const line of compactLines(section.lines.join("\n"), maxItems)) {
      uniquePush(items, line, maxItems);
    }
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

function inferModificationNotes(analysis) {
  const notes = [];
  if (!analysis.invocationConditions.length) {
    uniquePush(notes, "调用条件没有在 SKILL.md 中明确写出；如果误触发，应先收窄 frontmatter description 或增加 Do not use 规则。", 6);
  }
  if (!analysis.nonInvocationConditions.length) {
    uniquePush(notes, "缺少不要调用条件；容易在相邻场景被模型泛化调用。", 6);
  }
  const combined = [
    analysis.summary,
    ...analysis.invocationConditions,
    ...analysis.capabilities,
  ].join(" ").toLowerCase();
  if (/\bx\b|twitter|social|monitor|search/.test(combined)) {
    uniquePush(notes, "这个 Skill 与 X/social/search 语义接近；如果只希望显式 X 搜索时调用，需要把触发条件限定为 X 搜索、X 趋势、X 帖子/账号监控等场景。", 6);
  }
  if (/all|any|general|default|whenever|always/.test(combined)) {
    uniquePush(notes, "存在较宽泛的触发词；修改时应把适用范围改成可判定的任务类型。", 6);
  }
  if (!notes.length) {
    uniquePush(notes, "修改时优先检查 description、Use when/Do not use、Workflow 三块；这些最影响模型是否加载该 Skill。", 6);
  }
  return notes;
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
    const summary = parsed.data.description || firstParagraph(parsed.body || content) || "SKILL.md 未提供可提取的功能描述。";
    const capabilities = [
      ...sectionLines(sections, /capabilit|what it does|workflow|core|功能|能力|用途|流程/i, 6),
      ...matchingLines(content, [/^use this skill/i, /^this skill/i, /can\s+/i, /用于|能力|负责/], 6),
    ].slice(0, 6);
    const invocationConditions = [
      ...(parsed.data.description ? [parsed.data.description] : []),
      ...sectionLines(sections, /trigger|use when|when to use|适用|触发|调用/i, 8),
      ...matchingLines(content, [/use when/i, /should be used when/i, /when the user/i, /applies when/i, /适用|触发|调用/], 8),
    ].reduce((items, item) => {
      uniquePush(items, item, 8);
      return items;
    }, []);
    const nonInvocationConditions = [
      ...sectionLines(sections, /do not|never|avoid|out of scope|不要|不应|禁止|边界/i, 8),
      ...matchingLines(content, [/do not/i, /never/i, /avoid/i, /out of scope/i, /不要|不应|禁止|不能/], 8),
    ].reduce((items, item) => {
      uniquePush(items, item, 8);
      return items;
    }, []);
    const inputsOutputs = [
      ...sectionLines(sections, /input|output|requires|artifact|files|tools|输入|输出|工具|文件/i, 8),
      ...matchingLines(content, [/input|output|requires|artifact|file|tool|输入|输出|工具|文件/i], 8),
    ].reduce((items, item) => {
      uniquePush(items, item, 8);
      return items;
    }, []);
    const analysis = {
      skill: {
        id: detail?.id || "",
        label: detail?.label || detail?.id || "",
        namespace: detail?.namespace || "",
        path: detail?.path || "",
      },
      summary,
      capabilities: capabilities.length ? capabilities : ["未找到明确的功能列表；需要人工阅读正文确认。"],
      invocationConditions,
      nonInvocationConditions,
      inputsOutputs,
      modificationNotes: [],
      source: {
        frontmatterKeys: Object.keys(parsed.data),
        sectionTitles: sections.map((section) => section.title).filter(Boolean).slice(0, 20),
        totalChars: detail?.totalChars || content.length,
        truncated: Boolean(detail?.truncated),
      },
    };
    analysis.modificationNotes = inferModificationNotes(analysis);
    return analysis;
  }

  return { analyze };
}

module.exports = {
  createSkillAnalysisService,
};
