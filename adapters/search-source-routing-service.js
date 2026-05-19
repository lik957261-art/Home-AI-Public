"use strict";

const SEARCH_SOURCE_LOCAL = "local";
const SEARCH_SOURCE_WEB = "web";
const SEARCH_SOURCE_X = "x";

const SEARCH_SOURCE_OPTIONS = Object.freeze([
  Object.freeze({
    source: SEARCH_SOURCE_LOCAL,
    sourceIntent: "local_data",
    label: "Local data",
    allowedToolsets: Object.freeze([]),
  }),
  Object.freeze({
    source: SEARCH_SOURCE_WEB,
    sourceIntent: "web_search",
    label: "Web search",
    allowedToolsets: Object.freeze(["web", "search"]),
  }),
  Object.freeze({
    source: SEARCH_SOURCE_X,
    sourceIntent: "x_search",
    label: "X search",
    allowedToolsets: Object.freeze(["x_search", "web", "search"]),
  }),
]);

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function dedupe(values = []) {
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

function compactKey(value) {
  return cleanString(value).toLowerCase().replace(/[\s_\-:：]+/g, "");
}

function normalizeSearchSource(value) {
  const raw = compactKey(value);
  if (!raw) return SEARCH_SOURCE_LOCAL;
  if (raw === SEARCH_SOURCE_WEB
    || raw === "network"
    || raw === "internet"
    || raw === "online"
    || raw === "www"
    || raw === "websearch"
    || raw === "networksearch"
    || raw === "\u7f51\u7edc"
    || raw === "\u7f51\u7edc\u641c\u7d22"
    || raw === "\u7f51\u9875"
    || raw === "\u7f51\u9875\u641c\u7d22"
    || raw === "\u8054\u7f51"
    || raw === "\u8054\u7f51\u641c\u7d22") {
    return SEARCH_SOURCE_WEB;
  }
  if (raw === SEARCH_SOURCE_X
    || raw === "xsearch"
    || raw === "twitter"
    || raw === "twittersearch"
    || raw === "xai"
    || raw === "\u0078\u641c\u7d22"
    || raw === "\u63a8\u7279"
    || raw === "\u63a8\u7279\u641c\u7d22") {
    return SEARCH_SOURCE_X;
  }
  if (raw === SEARCH_SOURCE_LOCAL
    || raw === "localdata"
    || raw === "default"
    || raw === "\u672c\u5730"
    || raw === "\u672c\u5730\u6570\u636e"
    || raw === "\u9ed8\u8ba4") {
    return SEARCH_SOURCE_LOCAL;
  }
  if (raw === "web_search") return SEARCH_SOURCE_WEB;
  if (raw === "x_search") return SEARCH_SOURCE_X;
  if (raw === "local_data") return SEARCH_SOURCE_LOCAL;
  return SEARCH_SOURCE_LOCAL;
}

function searchSourceOption(source) {
  const normalized = normalizeSearchSource(source);
  return SEARCH_SOURCE_OPTIONS.find((option) => option.source === normalized) || SEARCH_SOURCE_OPTIONS[0];
}

function searchSourceFromBody(body = {}) {
  const source = body && typeof body === "object" ? body : {};
  const raw = cleanString(
    source.searchSource
    || source.search_source
    || source.sourceIntent
    || source.source_intent
    || source.source,
  );
  if (!raw) return { source: SEARCH_SOURCE_LOCAL, explicit: false };
  return { source: normalizeSearchSource(raw), explicit: true };
}

function sourceCommandPatterns() {
  const boundary = "(?=$|[\\s)\\]}\\u3000\\uff09\\uff3d\\u3011\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])";
  const prefix = "(^|[\\s([{\\u3000\\uff08\\uff3b\\u3010\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])[#\\uff03]\\s*";
  return [
    {
      source: SEARCH_SOURCE_X,
      pattern: new RegExp(`${prefix}(?:x|twitter|\\u63a8\\u7279)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i"),
    },
    {
      source: SEARCH_SOURCE_WEB,
      pattern: new RegExp(`${prefix}(?:web|internet|online|\\u7f51\\u7edc|\\u7f51\\u9875|\\u8054\\u7f51)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i"),
    },
    {
      source: SEARCH_SOURCE_LOCAL,
      pattern: new RegExp(`${prefix}(?:local|default|\\u672c\\u5730|\\u672c\\u5730\\u6570\\u636e|\\u9ed8\\u8ba4)\\s*(?:data|\\u6570\\u636e)?${boundary}`, "i"),
    },
  ];
}

function searchSourceFromCommand(text = "") {
  const value = String(text || "").replace(/\u00a0/g, " ");
  if (!value.trim()) return { source: SEARCH_SOURCE_LOCAL, explicit: false };
  for (const item of sourceCommandPatterns()) {
    if (item.pattern.test(value)) return { source: item.source, explicit: true };
  }
  return { source: SEARCH_SOURCE_LOCAL, explicit: false };
}

function searchSourceAccessPolicyContext(source) {
  const option = searchSourceOption(source);
  if (!option.allowedToolsets.length) return null;
  return { allowed_toolsets: dedupe(option.allowedToolsets) };
}

function searchSourceInstructions(source) {
  const normalized = normalizeSearchSource(source);
  if (normalized === SEARCH_SOURCE_WEB) {
    return [
      "Source selected for this one user message: Web search.",
      "First use the current run's public web/search callable functions for factual lookup, preferring `mobile_web_search` and `mobile_web_extract` when available.",
      "Use local conversation/workspace context as supporting context, but do not present the answer as web-verified unless web/search was actually available and used.",
      "If web/search tools are unavailable in this Gateway run, say that web search is unavailable for this run instead of answering as if it was searched.",
    ].join("\n");
  }
  if (normalized === SEARCH_SOURCE_X) {
    return [
      "Source selected for this one user message: X search.",
      "First use `x_search` if it is present in the current run's callable functions. Treat X search as the primary evidence source for current public discussion on X.",
      "Local data and ordinary web/search may be used only as supplemental context after the X search attempt; explicitly say when ordinary web/search was used as a supplement.",
      "If `x_search` is unavailable or the Gateway profile lacks xAI OAuth/API credentials, say that X search is unavailable for this run instead of answering as if X was searched.",
    ].join("\n");
  }
  return "";
}

function resolveSearchSourceForMessage(body = {}, text = "") {
  const command = searchSourceFromCommand(text);
  const fromBody = searchSourceFromBody(body);
  const source = command.explicit ? command.source : fromBody.source;
  const explicit = Boolean(command.explicit || fromBody.explicit);
  const option = searchSourceOption(source);
  return {
    source: option.source,
    sourceIntent: option.sourceIntent,
    label: option.label,
    explicit,
    commandExplicit: Boolean(command.explicit),
    bodyExplicit: Boolean(fromBody.explicit),
    accessPolicyContext: searchSourceAccessPolicyContext(option.source),
    instructions: searchSourceInstructions(option.source),
  };
}

module.exports = {
  SEARCH_SOURCE_LOCAL,
  SEARCH_SOURCE_WEB,
  SEARCH_SOURCE_X,
  SEARCH_SOURCE_OPTIONS,
  normalizeSearchSource,
  searchSourceAccessPolicyContext,
  searchSourceFromBody,
  searchSourceFromCommand,
  searchSourceInstructions,
  searchSourceOption,
  resolveSearchSourceForMessage,
};
