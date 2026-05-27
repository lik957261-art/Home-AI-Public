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
  wardrobe: "Read, write, and verify the current workspace wardrobe database through the Wardrobe MCP.",
  weather: "Query weather information.",
  web: "Open or fetch public web pages.",
  x_search: "Search X/Twitter content.",
});
const PERMISSION_BOUNDARY_SKILL = "productivity/hermes-mobile-permission-boundary-check";
const PERMISSION_APPROVAL_MARKER = "HERMES_PERMISSION_APPROVAL_REQUIRED";

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

function routingSuggestedToolsets(request = {}, allowedToolsets = [], dedupe = defaultDedupe) {
  const policy = objectValue(request.runPolicy || request.body?.access_policy_context, {});
  const routing = objectValue(request.toolsetRouting || policy.toolset_routing || policy.toolsetRouting, {});
  const allowed = new Set(dedupe(allowedToolsets));
  return normalizeToolsetList(routing.suggested_toolsets || routing.suggestedToolsets, dedupe)
    .filter((item) => allowed.has(item));
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

function extractBalancedJsonCandidates(text) {
  const value = cleanString(text);
  const out = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return out;
}

function parseSelectionJson(text) {
  const candidates = extractBalancedJsonCandidates(text);
  const fallback = extractJsonCandidate(text);
  if (fallback && !candidates.includes(fallback)) candidates.unshift(fallback);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      return objectValue(parsed, null);
    } catch (_) {}
  }
  return null;
}

function parsePermissionApprovalMarker(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const markerIndex = line.indexOf(PERMISSION_APPROVAL_MARKER);
    if (markerIndex < 0) continue;
    const trailing = line.slice(markerIndex + PERMISSION_APPROVAL_MARKER.length).trim();
    let parsed = {};
    if (trailing.startsWith("{")) {
      try {
        parsed = JSON.parse(trailing);
      } catch (_) {
        parsed = {};
      }
    }
    return {
      elevationRequired: true,
      elevationScope: cleanString(parsed.scope || parsed.elevationScope) || "owner_high_privilege",
      elevationReason: boundedText(parsed.reason || parsed.message || "Model permission boundary requested Owner approval.", 240),
      elevationSource: "model_toolset_permission_selector",
    };
  }
  return null;
}

function parsePermissionDecision(parsed, originalText = "") {
  const marker = parsePermissionApprovalMarker(originalText);
  if (marker) return marker;
  const source = objectValue(parsed?.permission || parsed, null);
  if (!source) return null;
  const decision = cleanString(source.decision || source.permissionDecision || source.permission_decision || source.status).toLowerCase();
  const needsElevation = [
    "needs_elevation",
    "needs_owner",
    "owner_elevation",
    "permission_required",
    "requires_permission",
  ].includes(decision);
  if (!needsElevation) return null;
  return {
    elevationRequired: true,
    elevationScope: cleanString(source.scope || source.elevationScope || source.elevation_scope) || "owner_high_privilege",
    elevationReason: boundedText(source.reason || source.message || "Model permission boundary requested Owner approval.", 240),
    elevationSource: "model_toolset_permission_selector",
  };
}

function parseToolsetSelectionText(text, allowedToolsets = [], dedupe = defaultDedupe) {
  const allowed = new Set(dedupe(allowedToolsets));
  const parsed = parseSelectionJson(text);
  const permission = parsePermissionDecision(parsed, text);
  if (permission) {
    return Object.assign({
      ok: false,
      reason: "permission_approval_required",
      selectedToolsets: [],
      rejectedToolsets: [],
    }, permission);
  }
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

function selectionCoversAllAuthorized(selectedToolsets = [], allowedToolsets = [], dedupe = defaultDedupe) {
  const selected = new Set(dedupe(selectedToolsets));
  const allowed = dedupe(allowedToolsets);
  return allowed.length > 0 && selected.size >= allowed.length && allowed.every((item) => selected.has(item));
}

function selectionReasonLooksUncertain(reason = "") {
  return /(?:uncertain|ambiguous|unclear|not\s+sure|not\s+clear|unspecified|unknown|不明确|不清楚|不确定|未知|具体工具需求|工具需求)/i.test(cleanString(reason));
}

function inputLooksPlainProbe(text = "") {
  const value = cleanString(text);
  if (!value || value.length > 40) return false;
  if (/^(?:retry|try\s+again|rerun|run\s+again|\u91cd\u8bd5|\u518d\u8bd5(?:\u4e00\u4e0b)?|\u91cd\u65b0\u8bd5(?:\u4e00\u4e0b)?)[\s\u3002\uff01!,.]*$/i.test(value)) return false;
  return /^(?:test|testing|ping|pong|hi|hello|hey|ok|okay|收到|测试|重试|你好|嗨|好|好的|谢谢)[\s。！？!,.，]*$/i.test(value);
}

function constrainAllToolsetSelection(parsed = {}, { request = {}, allowedToolsets = [], dedupe = defaultDedupe } = {}) {
  if (!parsed?.ok) return parsed;
  const selected = normalizeToolsetList(parsed.selectedToolsets, dedupe);
  const suggested = routingSuggestedToolsets(request, allowedToolsets, dedupe);
  if (!suggested.length) return parsed;
  if (inputLooksPlainProbe(request.body?.input) && selected.length === 1 && selected[0] === "clarify" && suggested.length > 1) {
    return Object.assign({}, parsed, {
      reason: cleanString(parsed.reason) ? `${cleanString(parsed.reason)}; expanded_to_suggested_toolsets` : "expanded_to_suggested_toolsets",
      selectedToolsets: suggested,
      selectionConstrained: true,
    });
  }
  if (!selectionCoversAllAuthorized(selected, allowedToolsets, dedupe)) return parsed;
  if (suggested.length >= selected.length) return parsed;
  const reason = cleanString(parsed.reason);
  if (!selectionReasonLooksUncertain(reason) && !inputLooksPlainProbe(request.body?.input)) return parsed;
  return Object.assign({}, parsed, {
    reason: reason ? `${reason}; narrowed_to_suggested_toolsets` : "narrowed_to_suggested_toolsets",
    selectedToolsets: suggested,
    selectionConstrained: true,
  });
}

function buildSelectorInstructions({ allowedToolsets = [], request = {} } = {}) {
  const catalog = buildCapabilityCatalog(allowedToolsets);
  const routing = objectValue(request.gatewayRouting);
  const policy = objectValue(request.runPolicy || request.body?.access_policy_context);
  const suggestedToolsets = routingSuggestedToolsets(request, allowedToolsets);
  const summary = {
    access_policy: {
      access_mode: cleanString(policy.access_mode || policy.accessMode || "restricted"),
      principal_id: cleanString(policy.principal_id || policy.principalId),
      default_workspace: cleanString(policy.default_workspace || policy.defaultWorkspace),
      allowed_roots: Array.isArray(policy.allowed_roots || policy.allowedRoots) ? (policy.allowed_roots || policy.allowedRoots).slice(0, 8) : [],
      authorized_toolsets: allowedToolsets,
      blocked_toolsets: Array.isArray(policy.blocked_toolsets || policy.blockedToolsets) ? (policy.blocked_toolsets || policy.blockedToolsets).slice(0, 20) : [],
    },
    authorized_toolsets: catalog,
    search_source: cleanString(routing.searchSource),
    source_intent: cleanString(routing.sourceIntent),
    source_mode: cleanString(routing.sourceMode),
    suggested_toolsets: suggestedToolsets,
    suggested_reason: cleanString(request.toolsetRouting?.suggested_reason || request.toolsetRouting?.suggestedReason || policy.toolset_routing?.suggested_reason || policy.toolsetRouting?.suggestedReason),
    rule: "First decide permission, then choose the smallest execution toolset set that can reasonably handle the task. Do not perform the user task.",
  };
  return [
    "You are doing the model-side permission and toolset preflight for a Hermes Mobile run.",
    "This is an internal preflight, not a user-facing answer. Do not browse, search, call tools, or load skills.",
    `Apply the embedded Hermes Mobile permission-boundary Skill rules (${PERMISSION_BOUNDARY_SKILL}) from the access-policy summary before selecting tools.`,
    "Return only compact JSON in one of these shapes:",
    "{\"decision\":\"allowed\",\"toolsets\":[\"toolset_id\"],\"reason\":\"short reason\"}",
    "{\"decision\":\"needs_elevation\",\"scope\":\"owner_high_privilege\",\"reason\":\"short reason\"}",
    "Use only toolset ids from authorized_toolsets. Do not request blocked developer, shell, source, process, broad MCP, or cross-workspace tools.",
    `If and only if the permission decision needs Owner elevation, you may alternatively output ${PERMISSION_APPROVAL_MARKER} with compact JSON.`,
    "If the task may need a toolset and you are not sure, include that plausible toolset, but do not select every authorized toolset merely because the task is ambiguous or unspecified.",
    "For ping, greeting, acknowledgement, or plain test messages, use suggested_toolsets when it is non-empty; choose clarify alone only when no suggested_toolsets are available. For retry/rerun messages, use suggested_toolsets when they reflect recent task context.",
    JSON.stringify(summary),
  ].join("\n");
}

function buildSelectionBody({
  request = {},
  allowedToolsets = [],
  selectorModel = "",
  selectorProvider = "",
  selectorReasoningEffort = "low",
} = {}) {
  const body = {
    input: boundedText(request.body?.input, 2000),
    stream: true,
    store: false,
    conversation: `${cleanString(request.body?.conversation) || "hermes"}:toolset-selection`,
    conversation_history: [],
    instructions: buildSelectorInstructions({ allowedToolsets, request }),
    tool_choice: "none",
    parallel_tool_calls: false,
    access_policy_context: {
      toolset_selection_only: true,
      allowed_toolsets: [],
      authorized_toolsets: allowedToolsets,
      toolset_routing: { mode: "model_first_selector" },
    },
  };
  const model = cleanString(selectorModel) || cleanString(request.body?.model);
  const provider = cleanString(selectorProvider) || cleanString(request.body?.provider);
  if (model) body.model = model;
  if (provider) body.provider = provider;
  body.reasoning_effort = selectorReasoningEffort;
  return body;
}

function selectorRunIdFromEvent(event = {}) {
  return cleanString(event.response?.id || event.response_id || event.responseId || event.id);
}

function stopSelectorRun({ runner, gatewayTarget = {}, selectorRunId = "", stopTimeoutMs = 1000 } = {}) {
  const runId = cleanString(selectorRunId);
  if (!runId || !runner || typeof runner.stopRun !== "function") return;
  try {
    const pending = runner.stopRun(runId, {
      apiBase: gatewayTarget.apiBase,
      apiKey: gatewayTarget.apiKey,
      timeoutMs: stopTimeoutMs,
    });
    if (pending && typeof pending.catch === "function") void pending.catch(() => {});
  } catch (_) {}
}

function createGatewayRunModelToolsetSelectionService(options = {}) {
  const dedupe = typeof options.dedupe === "function" ? options.dedupe : defaultDedupe;
  const enabled = normalizeBoolean(options.enabled, true);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 45000) || 45000);
  const stopTimeoutMs = Math.max(500, Number(options.stopTimeoutMs || 2000) || 2000);
  const nowMs = typeof options.nowMs === "function" ? options.nowMs : (() => Date.now());
  const selectorModel = cleanString(options.selectorModel) || "gpt-5.4-mini";
  const selectorProvider = cleanString(options.selectorProvider);
  const selectorReasoningEffort = cleanString(options.selectorReasoningEffort) || "low";

  function gatewayPool() {
    return typeof options.gatewayPool === "function" ? options.gatewayPool() : options.gatewayPool;
  }

  async function selectToolsetsForRun(context = {}) {
    const request = objectValue(context.request);
    const gatewayTarget = objectValue(context.gatewayTarget);
    const allowedToolsets = allowedToolsetsFromPolicy(request.runPolicy || request.body?.access_policy_context, dedupe);
    const startedAt = nowMs();
    let runner = null;
    let selectorRunId = "";
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
      const body = buildSelectionBody({
        request,
        allowedToolsets,
        selectorModel,
        selectorProvider,
        selectorReasoningEffort,
      });
      const chunks = [];
      runner = pool.runnerFor(gatewayTarget);
      if (!runner || typeof runner.streamResponses !== "function") {
        return { enabled: true, ok: false, reason: "missing_gateway_runner", selectedToolsets: allowedToolsets, durationMs: nowMs() - startedAt };
      }
      await runner.streamResponses(body, {
        gatewayUrl: gatewayTarget.apiBase,
        apiKey: gatewayTarget.apiKey,
        timeoutMs,
        onEvent: (event) => {
          selectorRunId = selectorRunId || selectorRunIdFromEvent(event);
          const text = selectorTextFromEvent(event);
          if (text) chunks.push(text);
        },
      });
      const parsed = constrainAllToolsetSelection(
        parseToolsetSelectionText(chunks.join(""), allowedToolsets, dedupe),
        { request, allowedToolsets, dedupe },
      );
      return Object.assign({}, parsed, {
        enabled: true,
        mode: "model_first",
        authorizedToolsets: allowedToolsets,
        durationMs: nowMs() - startedAt,
      });
    } catch (err) {
      stopSelectorRun({ runner, gatewayTarget, selectorRunId, stopTimeoutMs });
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
