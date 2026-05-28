"use strict";

function cleanString(value) {
  return String(value || "").trim();
}

function defaultDedupe(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

const TOOLSET_KEYWORDS = Object.freeze([
  {
    toolsets: ["x_search"],
    pattern: /(?:\bX\b|Twitter|tweet|tweets|xAI|Grok|XSearch|X\s*Search|\u63a8\u7279|\u63a8\u6587|X\s*\u4e0a|X\s*\u641c|\u7528\s*X\s*\u641c|\u53bb\s*X\s*\u4e0a)/i,
  },
  {
    toolsets: ["web", "search"],
    pattern: /(?:\bweb\b|\bgoogle\b|\bbing\b|\bsearch\b|\bnews\b|\blatest\b|\btoday\b|\bwebsite\b|\burl\b|\u7f51\u9875|\u7f51\u7ad9|\u641c\u7d22|\u67e5\u4e00\u4e0b|\u67e5\u627e|\u6700\u65b0|\u65b0\u95fb|\u4eca\u5929|\u94fe\u63a5)/i,
  },
  {
    toolsets: ["http"],
    pattern: /(?:\bHTTP\b|\bAPI\b|\brequest\b|\bendpoint\b|\bbase64\b|\bcodex(?:\s*mobile)?\b|\bmux\b|\u63a5\u53e3|\u8bf7\u6c42|\u4fdd\u5b58\s*base64|\u534f\u4f5c\u6d41|\u5bf9\u63a5\s*Codex)/i,
  },
  {
    toolsets: ["wardrobe", "vision", "file"],
    pattern: /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\bwear\s*count\b|\bwearcount\b|\bLoro\s+Piana\b|\bLP\b.{0,24}(?:item|product|wardrobe|closet|outfit)|(?:\u5546\u54c1|\u8863\u6a71|\u5165\u5e93).{0,24}\bLP\b|\u8863\u6a71|\u7a7f\u642d|\u5355\u54c1|\u5165\u5e93|\u7a7f\u7740\u5386\u53f2|\u642d\u914d|\u5957\u88c5|\u8863\u670d|\u978b|\u8155\u8868|\u5546\u54c1\u7167|\u8d2d\u7269\u5355)/i,
  },
  {
    toolsets: ["file"],
    pattern: /(?:\bfile\b|\bfolder\b|\bdirectory\b|\bpath\b|\bPDF\b|\bDOCX\b|\bMarkdown\b|\bMEDIA:|\bMP3\b|\bM4A\b|\bWAV\b|\u6587\u4ef6|\u76ee\u5f55|\u8def\u5f84|\u6253\u5f00|\u8bfb\u53d6|\u4fdd\u5b58|\u9644\u4ef6|\u4ea4\u4ed8|\u6587\u6863|\u5f55\u97f3|\u8f6c\u5199|\u56fe\u7247)/i,
  },
  {
    toolsets: ["vision"],
    pattern: /(?:\bimage\b|\bphoto\b|\bocr\b|\bscreenshot\b|\u56fe\u7247|\u7167\u7247|\u622a\u56fe|\u770b\u56fe|\u8bc6\u56fe|\u626b\u63cf|\u8bc6\u522b)/i,
  },
  {
    toolsets: ["video"],
    pattern: /(?:\bvideo\b|\u89c6\u9891|\u5f71\u7247)/i,
  },
  {
    toolsets: ["image_gen"],
    pattern: /(?:\bimage\s*(?:generate|edit|erase)\b|\bP\s*\u56fe\b|\u751f\u6210\u56fe|\u4fee\u56fe|\u6293\u56fe|\u53bb\u6389\u80cc\u666f|\u64e6\u9664)/i,
  },
  {
    toolsets: ["weather"],
    pattern: /(?:\bweather\b|\bforecast\b|\u5929\u6c14|\u9884\u62a5|\u964d\u96e8|\u6c14\u6e29)/i,
  },
  {
    toolsets: ["cronjob", "http"],
    pattern: /(?:\bcron\b|\bautomation\b|\bschedule\b|\bjob\b|\u81ea\u52a8\u5316|\u5b9a\u65f6|\u8ba1\u5212\u4efb\u52a1|\u91cd\u8dd1|\u89e6\u53d1)/i,
  },
  {
    toolsets: ["todo", "kanban"],
    pattern: /(?:\btodo\b|\bkanban\b|\bcard\b|\btask\b|\u770b\u677f|\u5361\u7247|\u4efb\u52a1|\u6210\u957f|\u5b66\u4e60|\u63d0\u4ea4|\u6279\u6539|\u53cd\u601d|\u5956\u52b1|\u91d1\u5e01)/i,
  },
  {
    toolsets: ["skills"],
    pattern: /(?:\bskill\b|\bSKILL\.md\b|\u6280\u80fd|\u754c\u9762\s*Skill|\u6743\u9650\s*Skill|\u6a21\u677f\s*Skill|\u67b6\u6784\s*Skill|\u5de5\u5177\u96c6|\u5de5\u5177\s*\u8def\u7531)/i,
  },
  {
    toolsets: ["memory", "session_search"],
    pattern: /(?:\bmemory\b|\bsession\b|\bhistory\b|\u8bb0\u5fc6|\u5386\u53f2|\u4e4b\u524d|\u4ee5\u524d|\u4e0a\u6b21|\u4f1a\u8bdd\u641c\u7d22|\u627e\u4e00\u4e0b\u524d\u9762)/i,
  },
]);

const COMMON_WEB_COMPANION_TOOLSETS = Object.freeze(["web", "search", "browser"]);
const DEFAULT_LIGHT_CHAT_TOOLSETS = Object.freeze(["web", "search", "browser", "x_search", "http", "clarify"]);

function hasAttachmentSignal(userMessage = {}) {
  return [
    userMessage.attachments,
    userMessage.artifacts,
    userMessage.files,
    userMessage.uploads,
  ].some((value) => Array.isArray(value) && value.length > 0);
}

function taskDirectoryLooksWardrobe(taskDirectory = {}) {
  const directory = taskDirectory && typeof taskDirectory === "object" ? taskDirectory : {};
  const text = [
    directory.projectId,
    directory.subprojectId,
    directory.label,
    directory.path,
    directory.root,
  ].map(cleanString).join(" ");
  return /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d)/i.test(text);
}

function requestedToolsetsFromOptions(runOptions = {}) {
  const out = [];
  const searchSource = cleanString(runOptions.searchSource).toLowerCase();
  const sourceIntent = cleanString(runOptions.sourceIntent).toLowerCase();
  const sourceMode = cleanString(runOptions.sourceMode).toLowerCase();
  const source = `${searchSource} ${sourceIntent} ${sourceMode}`;
  if (searchSource === "x" || sourceIntent === "x_search" || /\btwitter\b|\bgrok\b/.test(source)) out.push("x_search");
  if (searchSource === "web" || sourceIntent === "web_search" || sourceIntent === "search") out.push("web", "search");
  if (/\bhttp\b|\bapi\b|\bcodex\b|\bmux\b/.test(source)) out.push("http");
  return out;
}

function addCommonWebCompanions(toolsets = []) {
  const values = defaultDedupe(toolsets);
  if (!values.some((item) => COMMON_WEB_COMPANION_TOOLSETS.includes(item))) return values;
  return defaultDedupe([...values, ...COMMON_WEB_COMPANION_TOOLSETS]);
}

function hasExplicitWebIntent(text) {
  return /(?:\bweb\b|\bgoogle\b|\bbing\b|\bnews\b|\blatest\b|\bwebsite\b|\burl\b|\u7f51\u9875|\u7f51\u7ad9|\u516c\u5f00\u7f51\u7edc|\u5168\u7f51|\u6700\u65b0|\u65b0\u95fb|\u4eca\u5929|\u94fe\u63a5)/i.test(cleanString(text));
}

function looksLikePlainChat(text) {
  const value = cleanString(text);
  if (!value) return true;
  if (value.length > 120) return false;
  if (/^(?:test|testing|hi|hello|hey|thanks|thank you|ok|okay)$/i.test(value)) return true;
  if (/^(?:\u6d4b\u8bd5|\u4f60\u597d|\u55e8|\u597d|\u597d\u7684|\u8c22\u8c22|\u6536\u5230|ok|OK)[\u3002\uff01!,.，\s]*$/.test(value)) return true;
  if (/(?:\u65b9\u6848|\u98ce\u9669|\u5408\u7406|\u5224\u65ad|\u5efa\u8bae|\u5206\u6790|plan|risk|reasonable|suggest|review)/i.test(value)) return false;
  const hasAction = /(?:\u641c|\u67e5|\u6253\u5f00|\u4fee|\u6539|\u751f\u6210|\u90e8\u7f72|\u63d0\u4ea4|\u4fdd\u5b58|\u8bfb|\u770b|\u5206\u6790|\u8fd0\u884c|\u89e6\u53d1|search|open|read|write|run|fix|deploy|generate|analy[sz]e)/i.test(value);
  return !hasAction;
}

function looksLikeRetryMessage(text) {
  return /^(?:retry|try\s+again|rerun|run\s+again|\u91cd\u8bd5|\u518d\u8bd5(?:\u4e00\u4e0b)?|\u91cd\u65b0\u8bd5(?:\u4e00\u4e0b)?)[\s\u3002\uff01!,.]*$/i.test(cleanString(text));
}

function messagesBefore(thread = {}, userMessage = {}, maxCount = 6) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const currentId = cleanString(userMessage.id);
  const index = currentId ? messages.findIndex((message) => cleanString(message.id) === currentId) : -1;
  const end = index >= 0 ? index : messages.length;
  const before = messages.slice(0, end);
  const taskGroupId = cleanString(userMessage.taskGroupId);
  const out = [];
  const seen = new Set();
  for (const message of taskGroupId
    ? before.filter((item) => cleanString(item.taskGroupId) === taskGroupId).slice(-maxCount)
    : []) {
    const id = cleanString(message.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(message);
  }
  for (const message of before.slice(-maxCount)) {
    const id = cleanString(message.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(message);
  }
  return out;
}

function retryContextText(context = {}, latestText = "") {
  if (!looksLikeRetryMessage(latestText)) return "";
  const chunks = [];
  for (const message of messagesBefore(context.thread, context.userMessage, 8)) {
    if (message?.toolsetEscalationRequired) {
      chunks.push((message.toolsetEscalationToolsets || []).join(" "));
      chunks.push(message.toolsetEscalationReason || "");
    }
    const content = cleanString(message?.content);
    if (content) chunks.push(content);
  }
  return chunks.join("\n").slice(-2400);
}

function retryEscalationToolsets(context = {}, latestText = "") {
  if (!looksLikeRetryMessage(latestText)) return [];
  const out = [];
  for (const message of messagesBefore(context.thread, context.userMessage, 8)) {
    if (!message?.toolsetEscalationRequired) continue;
    out.push(...(Array.isArray(message.toolsetEscalationToolsets) ? message.toolsetEscalationToolsets : []));
  }
  return defaultDedupe(out);
}

function createGatewayRunToolsetRoutingService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;

  function keepAllowed(toolsets, baseAllowed) {
    const allowed = new Set(dedupe(baseAllowed));
    return dedupe(toolsets).filter((item) => allowed.has(item));
  }

  function selectToolsets(context = {}) {
    const policy = context.policy && typeof context.policy === "object" ? context.policy : {};
    const baseAllowed = dedupe(policy.allowed_toolsets || policy.allowedToolsets || []);
    const text = cleanString(context.userMessage?.content || context.latestText || "");
    const retryRequested = retryEscalationToolsets(context, text);
    const intentText = [text, retryRequested.length ? "" : retryContextText(context, text)].filter(Boolean).join("\n");
    const requested = [...requestedToolsetsFromOptions(context.runOptions || {}), ...retryRequested];
    const matched = [];
    for (const rule of TOOLSET_KEYWORDS) {
      if (rule.pattern.test(intentText)) matched.push(...rule.toolsets);
    }
    const hadIntentMatch = matched.length > 0;
    if (matched.includes("x_search") && !hasExplicitWebIntent(intentText)) {
      for (let i = matched.length - 1; i >= 0; i -= 1) {
        if (matched[i] === "web" || matched[i] === "search") matched.splice(i, 1);
      }
    }
    if (taskDirectoryLooksWardrobe(context.taskDirectory)) matched.push("wardrobe", "vision", "file");
    if (hasAttachmentSignal(context.userMessage)) matched.push("file", "vision");
    if (context.taskDirectory?.path) matched.push("file");
    if (context.groupChat?.groupChatDeliveryRoot) matched.push("file");

    const selected = keepAllowed(addCommonWebCompanions([...requested, ...matched]), baseAllowed);
    if (selected.length || requested.length || hadIntentMatch) {
      return {
        allowed_toolsets: selected,
        mode: "intent",
        reason: "matched_intent",
      };
    }
    if (looksLikePlainChat(text) && !hasAttachmentSignal(context.userMessage) && !context.taskDirectory?.path) {
      return {
        allowed_toolsets: keepAllowed(DEFAULT_LIGHT_CHAT_TOOLSETS, baseAllowed),
        mode: "minimal",
        reason: "plain_chat_light_tools",
      };
    }
    return {
      allowed_toolsets: baseAllowed,
      mode: "compatible",
      reason: "ambiguous_fail_open",
    };
  }

  function routePolicy(context = {}) {
    const policy = context.policy && typeof context.policy === "object" ? context.policy : {};
    const baseAllowed = dedupe(policy.allowed_toolsets || policy.allowedToolsets || []);
    const selected = selectToolsets(context);
    return {
      policy: Object.assign({}, policy, {
        allowed_toolsets: baseAllowed,
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          suggested_toolsets: selected.allowed_toolsets,
          suggested_mode: selected.mode,
          suggested_reason: selected.reason,
        },
      }),
      routing: {
        allowed_toolsets: baseAllowed,
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        suggested_toolsets: selected.allowed_toolsets,
        suggested_mode: selected.mode,
        suggested_reason: selected.reason,
      },
    };
  }

  return {
    routePolicy,
    selectToolsets,
  };
}

module.exports = {
  createGatewayRunToolsetRoutingService,
};
