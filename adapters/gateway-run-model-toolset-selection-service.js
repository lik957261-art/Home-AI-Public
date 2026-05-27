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

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (/^(0|false|no|off)$/i.test(String(value))) return false;
  if (/^(1|true|yes|on)$/i.test(String(value))) return true;
  return fallback;
}

const TOOLSET_LABELS = Object.freeze({
  clarify: "Ask clarifying questions without external data access.",
  cronjob: "Read or operate automation and scheduled jobs.",
  file: "Read permitted workspace files and document attachments.",
  http: "Call scoped HTTP bridge tools and approved APIs.",
  image_gen: "Generate or edit images.",
  kanban: "Read or update Kanban, Growth, and task cards.",
  memory: "Read durable assistant memory or prior-session summaries.",
  search: "Use general web search.",
  session_search: "Search previous assistant sessions.",
  skills: "Load or inspect approved skill instructions.",
  todo: "Read or update Todo items.",
  video: "Inspect video inputs.",
  vision: "Inspect image or screenshot inputs.",
  weather: "Query weather information.",
  web: "Open or fetch public web pages.",
  x_search: "Search X/Twitter content.",
});

function boundedText(value, maxChars = 1600) {
  const text = cleanString(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function normalizeToolsetList(value, dedupe = defaultDedupe) {
  if (Array.isArray(value)) return dedupe(value);
  if (typeof value === "string") return dedupe(value.split(/[\s,;|]+/));
  return [];
}

function allowedToolsetsFromPolicy(policy = {}, dedupe = defaultDedupe) {
  return normalizeToolsetList(policy.allowed_toolsets || policy.allowedToolsets || [], dedupe);
}

function buildCapabilityCatalog(toolsets = []) {
  return toolsets.map((id) => ({
    id,
    summary: TOOLSET_LABELS[id] || "Authorized project capability.",
  }));
}

function eventNameFromEvent(event = {}) {
  return cleanString(event.event || event.type || event.name);
}

function textFromOutputContent(content = []) {
  return (Array.isArray(content) ? content : [])
    .map((item) => cleanString(item?.text || item?.content || item?.output_text))
    .filter(Boolean)
    .join("\n");
}

function textFromResponseOutput(output = []) {
  const chunks = [];
  for (const item of Array.isArray(output) ? output : []) {
    if (item?.type === "message" || item?.role === "assistant") {
      const text = textFromOutputContent(item.content);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n");
}

function selectorTextFromEvent(event = {}) {
  const eventName = eventNameFromEvent(event);
  if (eventName === "response.output_text.delta" || eventName === "message.delta") {
    return cleanString(event.delta || event.text);
  }
  if (eventName === "response.output_text.done") {
    return cleanString(event.text || event.output_text);
  }
  if (event.output_text) return cleanString(event.output_text);
  if (event.response?.output) return textFromResponseOutput(event.response.output);
  if (event.output) return textFromResponseOutput(event.output);
  return "";
}

function extractJsonCandidate(text) {
  const value = cleanString(text);
  if (!value) return "";
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first >= 0 && last > first) return value.slice(first, last + 1);
  return value;
}

function parseSelectionJson(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    return objectValue(parsed, null);
  } catch (_) {
    return null;
  }
}

function parseToolsetSelectionText(text, allowedToolsets = [], dedupe = defaultDedupe) {
  const allowed = new Set(dedupe(allowedToolsets));
  const parsed = parseSelectionJson(text);
  if (!parsed) {
    return { ok: false, reason: "invalid_json", selectedToolsets: [], rejectedToolsets: [] };
  }
  const requested = normalizeToolsetList(
    parsed.toolsets || parsed.selected_toolsets || parsed.allowed_toolsets || parsed.selectedToolsets,
    dedupe,
  );
  const selectedToolsets = requested.filter((item) => allowed.has(item));
  const rejectedToolsets = requested.filter((item) => item && !allowed.has(item));
  if (!selectedToolsets.length) {
    return {
      ok: false,
      reason: requested.length ? "no_authorized_toolsets_selected" : "empty_selection",
      selectedToolsets: [],
      rejectedToolsets,
    };
  }
  return {
    ok: true,
    reason: cleanString(parsed.reason) || "model_selected",
    selectedToolsets,
    rejectedToolsets,
  };
}

function buildSelectorInstructions({ allowedToolsets = [], request = {} } = {}) {
  const catalog = buildCapabilityCatalog(allowedToolsets);
  const routing = objectValue(request.gatewayRouting);
  const summary = {
    authorized_toolsets: catalog,
    search_source: cleanString(routing.searchSource),
    source_intent: cleanString(routing.sourceIntent),
    source_mode: cleanString(routing.sourceMode),
    rule: "Select execution toolsets only. Do not perform the user task. If uncertain, select every authorized toolset.",
  };
  return [
    "You are selecting toolsets for a Hermes Mobile run.",
    "Return only compact JSON with this shape: {\"toolsets\":[\"toolset_id\"],\"reason\":\"short reason\"}.",
    "Use only toolset ids from authorized_toolsets. Do not request blocked developer, shell, source, process, broad MCP, or cross-workspace tools.",
    "If the task may need a toolset and you are not sure, include it. If the task is ambiguous, select every authorized toolset.",
    JSON.stringify(summary),
  ].join("\n");
}

function buildSelectionBody({ request = {}, allowedToolsets = [], selectorReasoningEffort = "low" } = {}) {
  const body = {
    input: boundedText(request.body?.input, 2000),
    stream: true,
    store: false,
    conversation: `${cleanString(request.body?.conversation) || "hermes"}:toolset-selection`,
    conversation_history: [],
    instructions: buildSelectorInstructions({ allowedToolsets, request }),
    access_policy_context: {
      toolset_selection_only: true,
      allowed_toolsets: [],
      authorized_toolsets: allowedToolsets,
      toolset_routing: { mode: "model_first_selector" },
    },
  };
  if (request.body?.model) body.model = request.body.model;
  if (request.body?.provider) body.provider = request.body.provider;
  body.reasoning_effort = selectorReasoningEffort;
  return body;
}

function createGatewayRunModelToolsetSelectionService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const enabled = normalizeBoolean(options.enabled, true);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 15000) || 15000);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const selectorReasoningEffort = cleanString(options.selectorReasoningEffort) || "low";

  function gatewayPool() {
    return typeof options.gatewayPool === "function" ? options.gatewayPool() : options.gatewayPool;
  }

  async function selectToolsetsForRun(context = {}) {
    const request = objectValue(context.request);
    const gatewayTarget = objectValue(context.gatewayTarget);
    const allowedToolsets = allowedToolsetsFromPolicy(request.runPolicy || request.body?.access_policy_context, dedupe);
    const startedAt = nowMs();
    if (!enabled) {
      return { enabled: false, ok: false, reason: "disabled", selectedToolsets: allowedToolsets, durationMs: 0 };
    }
    if (allowedToolsets.length <= 1) {
      return { enabled: true, ok: false, reason: "not_enough_toolsets", selectedToolsets: allowedToolsets, durationMs: 0 };
    }
    try {
      const pool = gatewayPool();
      if (!pool || typeof pool.runnerFor !== "function") {
        return { enabled: true, ok: false, reason: "missing_gateway_pool", selectedToolsets: allowedToolsets, durationMs: nowMs() - startedAt };
      }
      const body = buildSelectionBody({ request, allowedToolsets, selectorReasoningEffort });
      const chunks = [];
      await pool.runnerFor(gatewayTarget).streamResponses(body, {
        gatewayUrl: gatewayTarget.apiBase,
        apiKey: gatewayTarget.apiKey,
        timeoutMs,
        onEvent: (event) => {
          const text = selectorTextFromEvent(event);
          if (text) chunks.push(text);
        },
      });
      const parsed = parseToolsetSelectionText(chunks.join(""), allowedToolsets, dedupe);
      return Object.assign({}, parsed, {
        enabled: true,
        mode: "model_first",
        authorizedToolsets: allowedToolsets,
        durationMs: nowMs() - startedAt,
      });
    } catch (err) {
      return {
        enabled: true,
        ok: false,
        reason: "selector_error",
        error: boundedText(err?.message || String(err), 240),
        selectedToolsets: allowedToolsets,
        authorizedToolsets: allowedToolsets,
        durationMs: nowMs() - startedAt,
      };
    }
  }

  return {
    buildCapabilityCatalog,
    buildSelectionBody,
    parseToolsetSelectionText: (text, allowedToolsets) => parseToolsetSelectionText(text, allowedToolsets, dedupe),
    selectToolsetsForRun,
  };
}

module.exports = {
  buildCapabilityCatalog,
  buildSelectionBody,
  buildSelectorInstructions,
  createGatewayRunModelToolsetSelectionService,
  parseToolsetSelectionText,
};
