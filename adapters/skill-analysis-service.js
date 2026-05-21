"use strict";

const X_SEARCH_FIX_ID = "narrow-x-search-invocation";
const MODEL_REWRITE_FIX_ID = "model-suggested-skill-rewrite";

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

function parseJsonObject(text, extractJsonObject) {
  const raw = cleanText(text);
  if (!raw) return null;
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.unshift(raw.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_err) {
      // Try the next candidate.
    }
  }
  if (typeof extractJsonObject === "function") {
    try {
      return extractJsonObject(raw);
    } catch (_err) {
      return null;
    }
  }
  return null;
}

function compactSkillContent(content, maxChars) {
  const text = cleanText(content);
  const limit = Math.max(2000, Number(maxChars || 16000));
  if (text.length <= limit) return text;
  const head = Math.floor(limit * 0.7);
  const tail = limit - head;
  return `${text.slice(0, head)}\n\n[...SKILL.md middle omitted for analysis size...]\n\n${text.slice(-tail)}`;
}

function normalizeArray(items, maxItems = 8) {
  const out = [];
  for (const item of Array.isArray(items) ? items : [items]) {
    if (typeof item === "string") {
      uniquePush(out, item, maxItems);
    } else if (item && typeof item === "object") {
      const text = [item.title, item.text, item.description, item.condition, item.action, item.reason]
        .filter(Boolean)
        .join("：");
      uniquePush(out, text, maxItems);
    }
  }
  return out;
}

function buildModelPrompt(detail, content, maxChars) {
  const skillName = cleanText(detail?.path || detail?.id || detail?.label || "unknown-skill");
  return [
    "你是 Hermes Mobile 的 Skill 审阅器。请用中文分析下面的 SKILL.md。",
    "目标不是逐字翻译，而是提炼对“这个 Skill 做什么、何时调用、何时不要调用、输入输出、修改建议”有用的关键内容。",
    "必须保留重要的英文命令、工具名、路径名、错误码、字段名和文件名，但解释文字必须是中文。",
    "不要输出 Markdown。只返回严格 JSON 对象。",
    "JSON schema:",
    "{",
    '  "summary": "一句中文总结，要覆盖这个 Skill 的核心用途和关键边界",',
    '  "capabilities": ["4 到 8 条中文能力归纳，保留关键命令/路径/产物名"],',
    '  "invocationConditions": ["3 到 6 条中文调用条件"],',
    '  "nonInvocationConditions": ["3 到 8 条中文不应调用或禁止事项"],',
    '  "inputsOutputs": ["2 到 6 条中文输入输出、证据、产物或目录规则"],',
    '  "modificationNotes": ["2 到 6 条中文修改建议，指出触发条件是否过宽、是否需要拆分或补充边界"]',
    "}",
    "分析时优先关注：访问路径/命令选择、目标类型、前置验证、证据字段、产物交付、失败降级、目录持久化、覆盖口径、不要做什么。",
    `Skill: ${skillName}`,
    "SKILL.md:",
    compactSkillContent(content, maxChars),
  ].join("\n");
}

function mergeFixes(...groups) {
  const out = [];
  const seen = new Set();
  for (const group of groups) {
    for (const fix of Array.isArray(group) ? group : []) {
      if (!fix?.id || seen.has(fix.id)) continue;
      seen.add(fix.id);
      out.push(fix);
    }
  }
  return out;
}

function modelRewriteFix() {
  return {
    id: MODEL_REWRITE_FIX_ID,
    label: "按模型分析修改 Skill",
    description: "根据本次模型分析重写 SKILL.md 的描述、调用边界和工作流说明，保留原有关键命令、路径、证据字段和禁止事项。",
    risk: "medium",
    ownerOnly: true,
    modelAssisted: true,
  };
}

function normalizeModelAnalysis(value, detail, deterministic) {
  if (!value || typeof value !== "object") return null;
  const summary = cleanText(value.summary);
  const analysis = Object.assign({}, deterministic, {
    summary: summary || deterministic.summary,
    capabilities: normalizeArray(value.capabilities, 8),
    invocationConditions: normalizeArray(value.invocationConditions || value.whenToUse || value.triggers, 8),
    nonInvocationConditions: normalizeArray(value.nonInvocationConditions || value.doNotUse || value.boundaries, 8),
    inputsOutputs: normalizeArray(value.inputsOutputs || value.inputsAndOutputs || value.artifacts, 8),
    modificationNotes: normalizeArray(value.modificationNotes || value.recommendations, 8),
    analysisMethod: "model_assisted",
    modelStatus: "completed",
  });
  if (!analysis.capabilities.length) analysis.capabilities = deterministic.capabilities;
  if (!analysis.invocationConditions.length) analysis.invocationConditions = deterministic.invocationConditions;
  if (!analysis.nonInvocationConditions.length) analysis.nonInvocationConditions = deterministic.nonInvocationConditions;
  if (!analysis.inputsOutputs.length) analysis.inputsOutputs = deterministic.inputsOutputs;
  if (!analysis.modificationNotes.length) analysis.modificationNotes = deterministic.modificationNotes;
  analysis.fixes = mergeFixes([modelRewriteFix()], suggestedFixes(detail, analysis));
  return analysis;
}

function stripCodeFence(value) {
  const text = cleanText(value);
  const fenced = text.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return fenced?.[1] ? fenced[1].trim() : text;
}

function normalizeRewrittenSkillContent(value, originalContent) {
  const text = stripCodeFence(value);
  if (text.length < 20) {
    const err = new Error("Model rewrite returned empty Skill content");
    err.status = 502;
    throw err;
  }
  const original = String(originalContent || "");
  if (original.trimStart().startsWith("---") && !text.trimStart().startsWith("---")) {
    const err = new Error("Model rewrite removed Skill frontmatter");
    err.status = 502;
    throw err;
  }
  if (!/#\s+/.test(text)) {
    const err = new Error("Model rewrite returned content without Skill headings");
    err.status = 502;
    throw err;
  }
  return `${text.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function buildRewritePrompt(detail, analysis, content, maxChars) {
  const notes = [
    analysis?.summary,
    ...(analysis?.capabilities || []),
    ...(analysis?.invocationConditions || []),
    ...(analysis?.nonInvocationConditions || []),
    ...(analysis?.inputsOutputs || []),
    ...(analysis?.modificationNotes || []),
  ].filter(Boolean).join("\n- ");
  return [
    "你是 Hermes Mobile 的 Skill 编辑器。请根据模型分析结果，重写下面的 SKILL.md。",
    "目标：让 Skill 的功能、调用条件、不要调用边界、工作流和产物规则更清晰，减少误触发。",
    "必须保留原有关键命令、工具名、路径名、错误信息、字段名、证据字段、目录规则和禁止事项。",
    "不要删除 frontmatter。不要编造不存在的工具或凭据。不要加入秘密、token、endpoint 或私有长日志。",
    "只返回严格 JSON 对象：",
    '{"content":"完整的新 SKILL.md 内容","changeSummary":["中文变更摘要"]}',
    `Skill: ${cleanText(detail?.path || detail?.id || detail?.label || "unknown-skill")}`,
    "模型分析要点：",
    notes ? `- ${notes}` : "- 无额外要点；按正文自行提炼。",
    "原始 SKILL.md：",
    compactSkillContent(content, maxChars),
  ].join("\n");
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function isXSearchText(value) {
  return /\bx\b|x\/twitter|twitter|x-social|x_search|social[-\s]?media|monitoring brief|social brief/i.test(String(value || ""));
}

function skillLabel(detail) {
  return cleanText(detail?.label || detail?.id || detail?.namespace || "这个 Skill");
}

function fallbackChineseLine(context, detail) {
  if (isXSearchText(skillLabel(detail)) || isXSearchText(detail?.path)) {
    if (context === "summary") return "功能：用于按用户要求执行 X/Twitter 信源搜索、账号/帖子核查、趋势监控和社媒简报。";
    if (context === "invocation") return "适用：用户明确要求把 X/Twitter 作为信源时调用，包括 X 搜索、X 账号或帖子查看、趋势监控或社媒简报。";
    if (context === "nonInvocation") return "不要调用：本地数据查询、普通问答或非 X 网络搜索不应使用该 Skill。";
    if (context === "capability") return "能力：围绕 X 信源执行检索、核查、归纳和简报生成。";
    if (context === "inputsOutputs") return "输入输出：输入查询词、时间范围和可选目标账号；输出带来源的简洁简报。";
  }
  if (context === "summary") return `功能：根据 Skill 描述，该 Skill 用于与 ${skillLabel(detail)} 相关的任务。`;
  if (context === "invocation") return "适用：仅在用户请求与该 Skill 描述一致的任务时调用。";
  if (context === "nonInvocation") return "不要调用：该规则定义了排除场景，避免在相邻任务中误触发。";
  if (context === "capability") return "能力：按 Skill 工作流执行任务步骤；具体步骤应以 Skill 正文为准。";
  if (context === "inputsOutputs") return "输入输出：输入、输出和工具边界以 Skill 正文为准；分析页只显示归纳信息。";
  return "分析：已按 Skill 正文归纳为中文说明。";
}

function chineseLine(value, context = "general", detail = null) {
  const text = cleanText(value);
  if (!text) return fallbackChineseLine(context, detail);
  const lower = text.toLowerCase();
  const xRelated = isXSearchText(text) || isXSearchText(skillLabel(detail)) || isXSearchText(detail?.path);
  if (xRelated) {
    if (context === "summary") return fallbackChineseLine("summary", detail);
    if (context === "invocation" && /use when|use this skill|should be used|explicitly asks|when the user|description|task needs/.test(lower)) {
      return fallbackChineseLine("invocation", detail);
    }
    if (/^input\s*:|timeframe|target account/.test(lower) || (context === "inputsOutputs" && /\bquery\b/.test(lower))) {
      return "输入：查询词、时间范围，以及可选目标账号。";
    }
    if (/output\s*:|compact brief|with sources|sources/.test(lower)) {
      return "输出：带来源的简洁简报。";
    }
    if (/do not|never|avoid|out of scope/.test(lower)) {
      if (/general answer|general q&a|ordinary|local data|non-x|web search/.test(lower)) {
        return "不要调用：本地数据查询、普通问答或非 X 网络搜索不应使用该 Skill。";
      }
      if (/social media|search|twitter|evidence source/.test(lower)) {
        return "不要调用：不要因为消息提到社交媒体或搜索就调用，除非用户明确要求 X/Twitter 作为证据来源。";
      }
      return fallbackChineseLine("nonInvocation", detail);
    }
    if (/bounded query|search x|x posts?|x account|inspect|monitor|trend/.test(lower)) {
      return "能力：用有边界的关键词搜索 X，并保留来源线索。";
    }
    if (/summarize|claims|uncertainty|brief/.test(lower)) {
      return "能力：汇总主张、证据来源和不确定性。";
    }
    if (/use when|use this skill|should be used|explicitly asks|when the user|description/.test(lower) || context === "summary" || context === "invocation") {
      if (context === "summary") return fallbackChineseLine("summary", detail);
      return fallbackChineseLine("invocation", detail);
    }
    return fallbackChineseLine(context, detail);
  }
  if (hasCjk(text) && !/[A-Za-z]{4,}/.test(text)) {
    return context === "summary" && !/^功能[：:]/.test(text) ? `功能：${text}` : text;
  }
  if (/^input\s*:/i.test(text)) return fallbackChineseLine("inputsOutputs", detail);
  if (/^output\s*:/i.test(text)) return fallbackChineseLine("inputsOutputs", detail);
  if (/do not|never|avoid|out of scope/i.test(text)) return fallbackChineseLine("nonInvocation", detail);
  if (/use when|use this skill|should be used|when the user/i.test(text)) return fallbackChineseLine("invocation", detail);
  if (context === "summary") return `功能：${text.replace(/^#+\s*/, "")}`;
  return fallbackChineseLine(context, detail);
}

function chineseLines(items, context = "general", detail = null, maxItems = 8) {
  return (items || []).reduce((out, item) => {
    uniquePush(out, chineseLine(item, context, detail), maxItems);
    return out;
  }, []);
}

function inferModificationNotes(analysis) {
  const notes = [];
  if (!analysis.invocationConditions.length) {
    uniquePush(notes, "调用条件没有明确写出；应先收窄元数据描述，或补充“适用/不要调用”规则。", 6);
  }
  if (!analysis.nonInvocationConditions.length) {
    uniquePush(notes, "缺少“不要调用”的边界，容易在相邻场景被模型泛化加载。", 6);
  }
  const combined = [
    analysis.summary,
    ...analysis.invocationConditions,
    ...analysis.capabilities,
  ].join(" ").toLowerCase();
  if (/\bx\b|twitter|social|monitor|search/.test(combined)) {
    uniquePush(notes, "这个 Skill 接近 X、社媒或搜索语义；如果只希望 X 搜索时调用，应把触发条件限定到 X 搜索、X 趋势、X 帖子、X 账号监控等。", 6);
  }
  if (/all|any|general|default|whenever|always/.test(combined)) {
    uniquePush(notes, "存在较宽泛的触发词；修改时应改成可判定的任务类型。", 6);
  }
  if (!notes.length) {
    uniquePush(notes, "优先检查描述、适用/不要调用、工作流三块；这些最影响模型是否加载该 Skill。", 6);
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
    description: "把描述和排除边界改成只在明确需要 X/Twitter 作为信源时调用，避免本地数据、普通问答、非 X 网络搜索误触发。",
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

function createSkillAnalysisService(options = {}) {
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : null;
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const model = cleanText(options.model || options.automationCreateModel || "automation-create");
  const analysisTimeoutMs = Math.max(15000, Number(options.analysisTimeoutMs || options.skillAnalysisTimeoutMs || 90000));
  const rewriteTimeoutMs = Math.max(
    analysisTimeoutMs,
    Number(options.rewriteTimeoutMs || options.skillRewriteTimeoutMs || options.skillAnalysisRewriteTimeoutMs || 240000),
  );
  const maxPromptChars = Math.max(2000, Number(options.maxPromptChars || 16000));

  function analyzeDeterministic(detail) {
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
    ], "capability", detail, 6);
    const invocationConditions = chineseLines([
      ...(parsed.data.description ? [parsed.data.description] : []),
      ...sectionLines(sections, /trigger|use when|when to use|适用|触发|调用/i, 8),
      ...matchingLines(content, [/use when/i, /should be used when/i, /when the user/i, /applies when/i, /适用|触发|调用/], 8),
    ], "invocation", detail, 8);
    const nonInvocationConditions = chineseLines([
      ...sectionLines(sections, /do not|never|avoid|out of scope|不要|不应|禁止|边界/i, 8),
      ...matchingLines(content, [/do not/i, /never/i, /avoid/i, /out of scope/i, /不要|不应|禁止|不能/], 8),
    ], "nonInvocation", detail, 8);
    const inputsOutputs = chineseLines([
      ...sectionLines(sections, /input|output|requires|artifact|files|tools|输入|输出|工具|文件/i, 8),
      ...matchingLines(content, [/input|output|requires|artifact|file|tool|输入|输出|工具|文件/i], 8),
    ], "inputsOutputs", detail, 8);
    const analysis = {
      skill: {
        id: detail?.id || "",
        label: detail?.label || detail?.id || "",
        namespace: detail?.namespace || "",
        path: detail?.path || "",
      },
      summary: chineseLine(rawSummary, "summary", detail),
      capabilities: capabilities.length ? capabilities : ["未找到明确的功能列表；需要人工阅读正文确认。"],
      invocationConditions,
      nonInvocationConditions,
      inputsOutputs,
      modificationNotes: [],
      fixes: [],
      analysisMethod: "deterministic_fallback",
      modelStatus: hermesModelText ? "not_used" : "unavailable",
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

  async function analyze(detail) {
    const deterministic = analyzeDeterministic(detail);
    const content = cleanText(detail?.content);
    if (!hermesModelText) return deterministic;
    try {
      const workspaceId = cleanText(detail?.workspaceId || "owner") || "owner";
      const output = await hermesModelText({
        input: buildModelPrompt(detail, content, maxPromptChars),
        stream: true,
        store: false,
        model,
        reasoning_effort: "medium",
        conversation: `skill_analysis_${Date.now()}`,
        instructions: "Return strict JSON only. The analysis language must be Chinese.",
        access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
      }, analysisTimeoutMs);
      const parsed = parseJsonObject(output, extractJsonObject);
      const modelAnalysis = normalizeModelAnalysis(parsed, detail, deterministic);
      if (modelAnalysis) return modelAnalysis;
      return Object.assign({}, deterministic, { modelStatus: "parse_error" });
    } catch (err) {
      return Object.assign({}, deterministic, {
        modelStatus: "error",
        modelError: cleanText(err?.message || String(err)).slice(0, 240),
      });
    }
  }

  async function applyModelRewriteFix(detail) {
    if (!hermesModelText) {
      const err = new Error("Model-assisted Skill rewrite is not configured");
      err.status = 503;
      throw err;
    }
    const content = String(detail?.content || "");
    const analysis = analyzeDeterministic(detail);
    const fix = modelRewriteFix();
    const workspaceId = cleanText(detail?.workspaceId || "owner") || "owner";
    const output = await hermesModelText({
      input: buildRewritePrompt(detail, analysis, content, maxPromptChars),
      stream: true,
      store: false,
      model,
      reasoning_effort: "medium",
      conversation: `skill_rewrite_${Date.now()}`,
      instructions: "Return strict JSON only. The rewritten SKILL.md content may be Markdown inside the JSON string.",
      access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
    }, rewriteTimeoutMs);
    const parsed = parseJsonObject(output, extractJsonObject);
    const nextContent = normalizeRewrittenSkillContent(parsed?.content || parsed?.fullContent || parsed?.skill || "", content);
    const nextAnalysis = analyzeDeterministic(Object.assign({}, detail, {
      content: nextContent,
      totalChars: nextContent.length,
      truncated: false,
    }));
    return {
      fix: Object.assign({}, fix, { changeSummary: normalizeArray(parsed?.changeSummary || parsed?.changes, 6) }),
      content: nextContent,
      changed: nextContent !== content,
      analysis: Object.assign({}, nextAnalysis, {
        analysisMethod: "deterministic_after_rewrite",
        modelStatus: "rewrite_completed",
      }),
    };
  }

  async function applyFix(detail, fixId) {
    const id = String(fixId || "").trim();
    if (id === MODEL_REWRITE_FIX_ID) {
      return await applyModelRewriteFix(detail);
    }
    if (id !== X_SEARCH_FIX_ID) {
      const err = new Error("Unknown Skill fix");
      err.status = 400;
      throw err;
    }
    const content = String(detail?.content || "");
    const analysis = analyzeDeterministic(detail);
    if (!isXSearchSkill(detail, analysis)) {
      const err = new Error("This fix applies only to X/Twitter search skills");
      err.status = 422;
      throw err;
    }
    const nextContent = applyXSearchFix(content);
    const nextAnalysis = analyzeDeterministic(Object.assign({}, detail, {
      content: nextContent,
      totalChars: nextContent.length,
      truncated: false,
    }));
    const fix = suggestedFixes(detail, analysis).find((item) => item.id === id) || { id };
    return { fix, content: nextContent, changed: nextContent !== content, analysis: nextAnalysis };
  }

  return { analyze, applyFix };
}

module.exports = {
  MODEL_REWRITE_FIX_ID,
  X_SEARCH_FIX_ID,
  createSkillAnalysisService,
};
