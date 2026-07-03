"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ACTION_KEY = "wardrobeOutfitWearIntent";
const LOCAL_EXECUTE_TOOL = "wardrobe.execute_outfit_wear_intent";
const LOCAL_PREPARE_TOOL = "wardrobe.prepare_outfit_wear_intent";
const GATEWAY_EXECUTE_TOOL = "mcp_wardrobe_wardrobe_execute_outfit_wear_intent";
const GATEWAY_PREPARE_TOOL = "mcp_wardrobe_wardrobe_prepare_outfit_wear_intent";
const INTENT_TYPE = "outfit_wear_intent";
const VALID_STATUSES = new Set(["ready", "running", "needs_confirmation", "stored", "expired", "blocked", "error"]);

function cleanString(value, max = 4000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJsonObject(value) {
  if (isObject(value)) return value;
  const text = cleanString(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isObject(parsed) ? parsed : null;
  } catch (_) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return isObject(parsed) ? parsed : null;
    } catch (_nested) {
      return null;
    }
  }
}

function normalizedStatus(value, defaultStatus = "ready") {
  const status = cleanString(value, 80).toLowerCase();
  return VALID_STATUSES.has(status) ? status : defaultStatus;
}

function normalizeIntent(value) {
  const input = isObject(value) ? value : {};
  const items = Array.isArray(input.items)
    ? input.items.map((item) => ({
      role: cleanString(item?.role, 80),
      code: cleanString(item?.code, 160),
    })).filter((item) => item.role || item.code)
    : [];
  const sourceMessage = isObject(input.source_message || input.sourceMessage)
    ? (input.source_message || input.sourceMessage)
    : {};
  const action = isObject(input.action) ? input.action : {};
  const normalized = {
    type: cleanString(input.type, 80),
    schema_version: Number(input.schema_version || input.schemaVersion || 0) || 0,
    plugin_id: cleanString(input.plugin_id || input.pluginId, 80),
    principal_id: cleanString(input.principal_id || input.principalId, 120),
    workspace_id: cleanString(input.workspace_id || input.workspaceId, 120),
    wear_date: cleanString(input.wear_date || input.wearDate, 40),
    timezone: cleanString(input.timezone, 80),
    items,
    source_message: {
      message_id: cleanString(sourceMessage.message_id || sourceMessage.messageId, 180),
      thread_id: cleanString(sourceMessage.thread_id || sourceMessage.threadId, 180),
      run_id: cleanString(sourceMessage.run_id || sourceMessage.runId, 180),
      request_id: cleanString(sourceMessage.request_id || sourceMessage.requestId, 180),
    },
    idempotency_key: cleanString(input.idempotency_key || input.idempotencyKey, 220),
    expires_at: cleanString(input.expires_at || input.expiresAt, 80),
  };
  normalized.source_message = Object.fromEntries(
    Object.entries(normalized.source_message).filter(([, value]) => value),
  );
  if (action.mcp_tool || action.mcpTool || action.default_mode || action.defaultMode || action.confirm_mode || action.confirmMode) {
    normalized.action = {
      mcp_tool: cleanString(action.mcp_tool || action.mcpTool, 120),
      default_mode: cleanString(action.default_mode || action.defaultMode, 80),
      confirm_mode: cleanString(action.confirm_mode || action.confirmMode, 80),
    };
  }
  return normalized;
}

function findIntentCandidate(value) {
  if (!isObject(value)) return null;
  if (value.type === INTENT_TYPE) return value;
  if (isObject(value.intent) && value.intent.type === INTENT_TYPE) return value.intent;
  if (isObject(value.outfit_wear_intent)) return findIntentCandidate(value.outfit_wear_intent);
  if (isObject(value.outfitWearIntent)) return findIntentCandidate(value.outfitWearIntent);
  if (isObject(value.structuredContent)) return findIntentCandidate(value.structuredContent);
  if (isObject(value.result)) return findIntentCandidate(value.result);
  if (Array.isArray(value.content)) {
    for (const part of value.content) {
      const parsed = parseJsonObject(part?.text || part?.content || "");
      const found = findIntentCandidate(parsed);
      if (found) return found;
    }
  }
  return null;
}

function normalizeActionState(value = {}, baseIntent = null, options = {}) {
  const input = isObject(value) ? value : {};
  const intent = normalizeIntent(findIntentCandidate(input) || baseIntent || input.intent || {});
  const status = normalizedStatus(input.status || input.state || (intent.type === INTENT_TYPE ? "ready" : ""), "ready");
  return {
    kind: "outfit_wear_intent",
    pluginId: "wardrobe",
    status,
    executable: input.executable !== false && status === "ready",
    intent,
    updatedAt: cleanString(input.updatedAt || input.updated_at || options.updatedAt || "", 80),
    error: cleanString(input.error || "", 180),
    reason: cleanString(input.reason || "", 180),
    confirmMode: cleanString(input.confirmMode || input.confirm_mode || "", 80),
    existingOutfitId: cleanString(input.existingOutfitId || input.existing_outfit_id || "", 120),
    outfitId: cleanString(input.outfitId || input.outfit_id || "", 120),
    readbackVerified: Boolean(input.readbackVerified || input.readback_verified),
  };
}

function actionStateFromMessage(message = {}) {
  const raw = message.pluginActions?.[ACTION_KEY]
    || message.plugin_actions?.[ACTION_KEY]
    || message.pluginActions?.outfit_wear_intent
    || message.plugin_actions?.outfit_wear_intent
    || message[ACTION_KEY]
    || message.outfit_wear_intent
    || message.outfitWearIntent
    || message.metadata?.[ACTION_KEY]
    || message.metadata?.outfit_wear_intent
    || message.metadata?.outfitWearIntent
    || message.rawJson?.pluginActions?.[ACTION_KEY]
    || message.rawJson?.pluginActions?.outfit_wear_intent
    || message.rawJson?.plugin_actions?.[ACTION_KEY]
    || message.rawJson?.plugin_actions?.outfit_wear_intent
    || message.rawJson?.[ACTION_KEY]
    || message.rawJson?.outfit_wear_intent
    || message.rawJson?.outfitWearIntent
    || null;
  if (!raw) return null;
  return normalizeActionState(raw);
}

function validateIntentForExecution(intent, options = {}) {
  const normalized = normalizeIntent(intent);
  if (normalized.type !== INTENT_TYPE) return { ok: false, status: "blocked", error: "invalid_intent_type", intent: normalized };
  if (normalized.schema_version !== 1) return { ok: false, status: "blocked", error: "invalid_intent_schema", intent: normalized };
  if (normalized.plugin_id !== "wardrobe") return { ok: false, status: "blocked", error: "invalid_plugin_id", intent: normalized };
  const workspaceId = cleanString(options.workspaceId, 120);
  const principalId = cleanString(options.principalId, 120);
  if (!workspaceId) return { ok: false, status: "blocked", error: "workspace_required", intent: normalized };
  if (!principalId) return { ok: false, status: "blocked", error: "principal_required", intent: normalized };
  if (!normalized.workspace_id || normalized.workspace_id !== workspaceId) {
    return { ok: false, status: "blocked", error: "workspace_mismatch", intent: normalized };
  }
  if (!normalized.principal_id || normalized.principal_id !== principalId) {
    return { ok: false, status: "blocked", error: "principal_mismatch", intent: normalized };
  }
  if (!normalized.items.length || normalized.items.some((item) => !item.role || !item.code)) {
    return { ok: false, status: "blocked", error: "item_codes_not_locked", intent: normalized };
  }
  if (!normalized.idempotency_key.startsWith("wardrobe:outfit_wear_intent:")) {
    return { ok: false, status: "blocked", error: "invalid_idempotency_key", intent: normalized };
  }
  const expiresAtMs = Date.parse(normalized.expires_at || "");
  const nowMs = Date.parse(cleanString(options.nowIso || "") || new Date().toISOString());
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= (Number.isFinite(nowMs) ? nowMs : Date.now())) {
    return { ok: false, status: "expired", error: "expired", intent: normalized };
  }
  return { ok: true, status: "ready", intent: normalized };
}

function publicActionState(value = null, options = {}) {
  const state = value ? normalizeActionState(value) : null;
  if (!state?.intent?.type) return null;
  if (["expired", "blocked"].includes(state.status)) return null;
  if (state.status === "ready") {
    const validation = validateIntentForExecution(state.intent, options);
    if (!validation.ok) return null;
  }
  return {
    kind: "outfit_wear_intent",
    pluginId: "wardrobe",
    status: state.status,
    executable: state.status === "ready" || state.status === "needs_confirmation",
    intent: state.intent,
    updatedAt: state.updatedAt,
    error: state.error,
    reason: state.reason,
    confirmMode: state.confirmMode,
    existingOutfitId: state.existingOutfitId,
    outfitId: state.outfitId,
    readbackVerified: state.readbackVerified,
  };
}

function publicActionFilterDiagnostic(value = null, options = {}) {
  const state = value ? normalizeActionState(value) : null;
  if (!state?.intent?.type) return "invalid_action_metadata";
  if (state.status === "expired") return "expired";
  if (state.status === "blocked") return state.error || state.reason || "blocked";
  if (state.status === "ready") {
    const validation = validateIntentForExecution(state.intent, options);
    if (!validation.ok) return validation.error || validation.status || "not_executable";
  }
  return "";
}

function publicPluginActions(pluginActions = {}, options = {}) {
  const out = {};
  const wardrobe = publicActionState(pluginActions?.[ACTION_KEY] || pluginActions?.outfit_wear_intent, options);
  if (wardrobe) out[ACTION_KEY] = wardrobe;
  return Object.keys(out).length ? out : null;
}

function publicPluginActionsFromMessage(message = {}, options = {}) {
  const out = {};
  const wardrobe = publicActionState(actionStateFromMessage(message), options);
  if (wardrobe) out[ACTION_KEY] = wardrobe;
  return Object.keys(out).length ? out : null;
}

function publicPluginActionDiagnostics(message = {}, options = {}) {
  const rawAction = actionStateFromMessage(message);
  const diagnostics = {};
  const action = rawAction ? publicActionState(rawAction, options) : null;
  if (rawAction && !action) {
    diagnostics[ACTION_KEY] = {
      code: "renderer_filtered",
      reason: publicActionFilterDiagnostic(rawAction, options),
    };
  } else if (!rawAction && options.prepareToolLoaded) {
    diagnostics[ACTION_KEY] = {
      code: "intent_metadata_missing",
      reason: "prepare_tool_output_not_attached",
    };
  }
  return Object.keys(diagnostics).length ? diagnostics : null;
}

function isPrepareToolName(name) {
  const text = cleanString(name, 160);
  return text === LOCAL_PREPARE_TOOL || text === GATEWAY_PREPARE_TOOL;
}

function extractPreparedIntentFromCompletedResponse(event = {}) {
  const output = Array.isArray(event.response?.output) ? event.response.output : [];
  const callsById = new Map();
  for (const item of output) {
    if (cleanString(item?.type).toLowerCase() !== "function_call") continue;
    const callId = cleanString(item.call_id || item.callId || item.id, 180);
    const name = cleanString(item.name || item.function?.name || item.tool_name || item.toolName, 180);
    if (callId && name) callsById.set(callId, name);
  }
  for (const item of output) {
    if (cleanString(item?.type).toLowerCase() !== "function_call_output") continue;
    const callId = cleanString(item.call_id || item.callId || item.id, 180);
    if (!isPrepareToolName(callsById.get(callId))) continue;
    const parsed = parseJsonObject(item.output || item.text || "");
    const intent = findIntentCandidate(parsed);
    if (intent) return normalizeIntent(intent);
  }
  return null;
}

function extractPreparedIntentFromOutputItemEvent(event = {}, options = {}) {
  const item = event.item || event.output_item || event.outputItem || event;
  if (cleanString(item?.type).toLowerCase() !== "function_call_output") return null;
  const name = cleanString(
    options.functionName
      || options.toolName
      || options.name
      || item.name
      || item.function?.name
      || item.tool_name
      || item.toolName,
    180,
  );
  if (!isPrepareToolName(name)) return null;
  const parsed = parseJsonObject(item.output || item.text || item.content || event.output || event.text || "");
  const intent = findIntentCandidate(parsed);
  return intent ? normalizeIntent(intent) : null;
}

function attachPreparedIntentToMessage(message, intent, options = {}) {
  if (!message || !intent) return null;
  if (!message.pluginActions || typeof message.pluginActions !== "object" || Array.isArray(message.pluginActions)) {
    message.pluginActions = {};
  }
  const updatedAt = cleanString(options.updatedAt || new Date().toISOString(), 80);
  const action = normalizeActionState({
    status: "ready",
    executable: true,
    intent,
    updatedAt,
  });
  message.pluginActions[ACTION_KEY] = action;
  return action;
}

function limitedFindWorkspaceRoot(workspaceId, options = {}) {
  const id = cleanString(workspaceId, 120);
  if (!id || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return "";
  const roots = [
    options.wardrobeUserDriveRoot,
    process.env.HERMES_MOBILE_WARDROBE_USER_DRIVE_ROOT,
    options.dataDir ? path.join(options.dataDir, "drive", "users") : "",
    "/Users/example/path",
    "/Users/example/path",
  ].map((item) => cleanString(item, 1000)).filter(Boolean);
  const seen = new Set();
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    const userRoot = path.join(root, id);
    const found = findFirstConfigParent(userRoot, 6);
    if (found) return found;
  }
  return "";
}

function findFirstConfigParent(root, maxDepth) {
  if (!root || maxDepth < 0) return "";
  let entries = [];
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) return "";
    if (fs.existsSync(path.join(root, ".hermes-wardrobe", "config.json"))) return root;
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (_) {
    return "";
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "backups" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const found = findFirstConfigParent(path.join(root, entry.name), maxDepth - 1);
    if (found) return found;
  }
  return "";
}

function defaultMcpPath(options = {}) {
  const candidates = [
    options.mcpPath,
    process.env.HERMES_MOBILE_WARDROBE_MCP_PATH,
    "/Users/example/path",
    "/Users/example/path",
  ].map((item) => cleanString(item, 1000)).filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function defaultPython(options = {}) {
  const candidates = [
    options.python,
    process.env.HERMES_MOBILE_WARDROBE_MCP_PYTHON,
    "/opt/hermes-gateway-runtime/venv/bin/python",
    "python3",
  ].map((item) => cleanString(item, 1000)).filter(Boolean);
  return candidates.find((candidate) => candidate === "python3" || fs.existsSync(candidate)) || "python3";
}

function ndjsonRequest(id, method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

function parseNdjsonResponses(text) {
  return String(text || "").split(/\r?\n/).map((line) => parseJsonObject(line)).filter(Boolean);
}

function runWardrobeMcpNdjson(input, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(options.python, [options.mcpPath, "--workspace", options.workspaceRoot, "--no-workspace-override"], {
      env: Object.assign({}, process.env, {
        PYTHONPATH: process.env.PYTHONPATH || "/opt/hermes-gateway-runtime/official-clean",
      }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({ ok: false, error: "wardrobe_mcp_timeout" });
    }, Math.max(1000, Number(options.timeoutMs || 15000) || 15000));
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, error: err?.code || "wardrobe_mcp_spawn_failed" });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const responses = parseNdjsonResponses(stdout);
      resolve({ ok: true, responses, stderr: stderr ? "stderr_redacted" : "" });
    });
    child.stdin.end(input);
  });
}

async function defaultCallWardrobeMcpTool(name, args = {}, options = {}) {
  const workspaceRoot = limitedFindWorkspaceRoot(args.workspace_id || args.workspaceId || options.workspaceId, options);
  const mcpPath = defaultMcpPath(options);
  const python = defaultPython(options);
  if (!workspaceRoot || !mcpPath) {
    return { ok: false, error: "wardrobe_mcp_unavailable" };
  }
  const input = [
    ndjsonRequest(1, "initialize", { protocolVersion: "2024-11-05" }),
    ndjsonRequest(2, "tools/list"),
    ndjsonRequest(3, "tools/call", { name, arguments: args }),
  ].join("");
  const run = await runWardrobeMcpNdjson(input, {
    mcpPath,
    python,
    workspaceRoot,
    timeoutMs: options.timeoutMs,
  });
  if (!run.ok) return run;
  const byId = new Map(run.responses.map((response) => [response.id, response]));
  const toolList = byId.get(2)?.result?.tools || [];
  if (!Array.isArray(toolList) || !toolList.some((tool) => tool?.name === name)) {
    return { ok: false, error: "wardrobe_mcp_schema_unavailable" };
  }
  const call = byId.get(3);
  if (call?.error) return { ok: false, error: cleanString(call.error.message || "wardrobe_mcp_call_failed", 180) };
  return { ok: true, result: call?.result || {} };
}

function mcpStructuredContent(callResult) {
  if (!callResult?.ok) return { ok: false, status: "error", error: callResult?.error || "wardrobe_mcp_call_failed" };
  const result = callResult.result || {};
  if (isObject(result.structuredContent)) return result.structuredContent;
  const parsed = findIntentCandidate(result);
  if (parsed) return { ok: true, status: "ready", intent: parsed };
  return isObject(result) ? result : {};
}

function stateFromMcpPayload(payload, intent, updatedAt) {
  const status = normalizedStatus(payload.status || (payload.ok ? "stored" : "error"), payload.ok ? "stored" : "error");
  const state = normalizeActionState({
    status: status === "needs_confirmation" ? "needs_confirmation" : status,
    executable: false,
    intent,
    updatedAt,
    error: payload.ok === false ? (payload.error || payload.status || "wardrobe_execute_failed") : "",
    reason: payload.reason || "",
    confirmMode: payload.confirm_mode || payload.confirmMode || "",
    existingOutfitId: payload.existing_outfit_id || payload.existingOutfitId || "",
    outfitId: payload.outfit_id || payload.outfitId || "",
    readbackVerified: payload.readback_verified || payload.readbackVerified,
  });
  if (payload.status === "needs_confirmation") {
    state.status = "needs_confirmation";
    state.executable = true;
  } else if (payload.status === "stored") {
    state.status = "stored";
    state.executable = false;
  } else if (["expired", "workspace_mismatch", "principal_mismatch", "not_executable"].includes(payload.status)) {
    state.status = payload.status === "expired" ? "expired" : "blocked";
    state.executable = false;
    state.error = payload.status;
  } else if (payload.ok === false) {
    state.status = "error";
    state.executable = false;
  }
  return state;
}

function createWardrobeOutfitWearIntentActionService(options = {}) {
  const callWardrobeMcpTool = typeof options.callWardrobeMcpTool === "function"
    ? options.callWardrobeMcpTool
    : (name, args) => defaultCallWardrobeMcpTool(name, args, options);
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : (() => new Date().toISOString());
  const saveState = typeof options.saveState === "function" ? options.saveState : (() => {});
  const broadcast = typeof options.broadcast === "function" ? options.broadcast : (() => {});
  const compactMessage = typeof options.compactMessage === "function" ? options.compactMessage : ((message) => message);
  const threadSummary = typeof options.threadSummary === "function" ? options.threadSummary : ((thread) => thread);

  function persistActionState(thread, message, state, reason = "wardrobe-outfit-wear-intent") {
    if (!message.pluginActions || typeof message.pluginActions !== "object" || Array.isArray(message.pluginActions)) {
      message.pluginActions = {};
    }
    message.pluginActions[ACTION_KEY] = normalizeActionState(state, null, { updatedAt: nowIso() });
    message.updatedAt = message.pluginActions[ACTION_KEY].updatedAt;
    if (thread) thread.updatedAt = message.updatedAt;
    saveState(undefined, { reason });
    if (thread) {
      broadcast({ type: "message.updated", threadId: thread.id, message: compactMessage(message, thread), thread: threadSummary(thread) });
      broadcast({ type: "thread.updated", threadId: thread.id, thread: threadSummary(thread) });
    }
    return message.pluginActions[ACTION_KEY];
  }

  async function execute(input = {}) {
    const thread = input.thread || null;
    const message = input.message || null;
    const workspaceId = cleanString(input.workspaceId || thread?.workspaceId, 120);
    const principalId = cleanString(input.principalId, 120);
    const currentState = actionStateFromMessage(message || {}) || normalizeActionState({ intent: input.intent });
    const validation = validateIntentForExecution(currentState.intent, {
      workspaceId,
      principalId,
      nowIso: input.nowIso || nowIso(),
    });
    if (!validation.ok) {
      if (message) persistActionState(thread, message, {
        status: validation.status,
        executable: false,
        intent: validation.intent,
        error: validation.error,
      }, "wardrobe-outfit-wear-intent-blocked");
      return {
        ok: false,
        status: 409,
        error: validation.error,
        actionState: message ? actionStateFromMessage(message) : null,
        message: message ? compactMessage(message, thread) : null,
        thread: thread ? threadSummary(thread) : null,
      };
    }
    const running = persistActionState(thread, message, {
      status: "running",
      executable: false,
      intent: validation.intent,
    }, "wardrobe-outfit-wear-intent-running");
    const confirmReplace = Boolean(input.confirmReplace || input.confirm_replace);
    const mode = confirmReplace ? "replace" : cleanString(input.mode || "create_only", 80);
    let callResult;
    try {
      callResult = await callWardrobeMcpTool(LOCAL_EXECUTE_TOOL, {
        workspace_id: workspaceId,
        principal_id: principalId,
        intent: validation.intent,
        confirm_replace: confirmReplace,
        mode,
      });
    } catch (err) {
      callResult = { ok: false, error: cleanString(err?.code || err?.message || "wardrobe_mcp_call_failed", 180) };
    }
    const payload = mcpStructuredContent(callResult);
    const nextState = stateFromMcpPayload(payload, validation.intent, nowIso());
    persistActionState(thread, message, nextState, "wardrobe-outfit-wear-intent-result");
    const ok = nextState.status === "stored" || nextState.status === "needs_confirmation";
    return {
      ok,
      status: ok ? 200 : 502,
      actionState: actionStateFromMessage(message) || nextState,
      message: message ? compactMessage(message, thread) : null,
      thread: thread ? threadSummary(thread) : null,
      mcpTool: GATEWAY_EXECUTE_TOOL,
      previousState: running.status,
    };
  }

  return Object.freeze({
    actionStateFromMessage,
    attachPreparedIntentToMessage,
    execute,
    extractPreparedIntentFromCompletedResponse,
    extractPreparedIntentFromOutputItemEvent,
    publicPluginActionDiagnostics,
    publicActionState,
    publicPluginActions,
    validateIntentForExecution,
  });
}

module.exports = {
  ACTION_KEY,
  GATEWAY_EXECUTE_TOOL,
  GATEWAY_PREPARE_TOOL,
  LOCAL_EXECUTE_TOOL,
  LOCAL_PREPARE_TOOL,
  actionStateFromMessage,
  attachPreparedIntentToMessage,
  createWardrobeOutfitWearIntentActionService,
  defaultCallWardrobeMcpTool,
  extractPreparedIntentFromCompletedResponse,
  extractPreparedIntentFromOutputItemEvent,
  normalizeIntent,
  publicPluginActionDiagnostics,
  publicActionState,
  publicPluginActions,
  publicPluginActionsFromMessage,
  validateIntentForExecution,
};
