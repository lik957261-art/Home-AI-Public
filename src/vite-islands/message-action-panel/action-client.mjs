import {
  cleanString,
  wardrobeOutfitWearActionState,
} from "./model.mjs";

const WARDROBE_OUTFIT_WEAR_ACTION_ENDPOINT = "/api/plugin-conversation/actions/wardrobe/outfit-wear-intent";
const MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID = "thread_vite_message_action_preview";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createActionError(code, message = code) {
  const error = new Error(message || code || "message_action_failed");
  error.code = code || "message_action_failed";
  return error;
}

function runtimeApi(runtime) {
  if (typeof runtime?.api === "function") return runtime.api;
  throw createActionError("runtime_api_unavailable", "Vite action client requires runtime.api");
}

function buildWardrobeOutfitWearRequestBody(input = {}) {
  const message = isObject(input.message) ? input.message : {};
  const messageId = cleanString(input.messageId || message.id || message.messageId, 180);
  const threadId = cleanString(input.threadId || input.thread_id || MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID, 180);
  const workspaceId = cleanString(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
  const confirmReplace = Boolean(input.confirmReplace || input.confirm_replace);
  const mode = confirmReplace ? "replace" : cleanString(input.mode || "create_only", 80);
  if (!messageId) throw createActionError("message_id_required", "Message id is required for wardrobe action execution");
  if (!threadId) throw createActionError("thread_id_required", "Thread id is required for wardrobe action execution");
  return Object.freeze({
    threadId,
    messageId,
    workspaceId,
    confirmReplace,
    mode,
  });
}

function actionStateFromResult(result = {}) {
  return result?.actionState
    || result?.message?.pluginActions?.wardrobeOutfitWearIntent
    || result?.message?.pluginActions?.outfit_wear_intent
    || result?.message?.plugin_actions?.wardrobeOutfitWearIntent
    || result?.message?.plugin_actions?.outfit_wear_intent
    || null;
}

function applyWardrobeOutfitWearActionResult(message = {}, result = {}) {
  const returnedMessage = isObject(result.message) ? result.message : {};
  const actionState = actionStateFromResult(result);
  const next = Object.assign({}, message, returnedMessage);
  const pluginActions = Object.assign(
    {},
    isObject(message.pluginActions) ? message.pluginActions : {},
    isObject(returnedMessage.pluginActions) ? returnedMessage.pluginActions : {},
  );
  if (actionState) pluginActions.wardrobeOutfitWearIntent = actionState;
  if (Object.keys(pluginActions).length) next.pluginActions = pluginActions;
  return Object.freeze(next);
}

async function executeWardrobeOutfitWearAction(input = {}) {
  const api = runtimeApi(input.runtime);
  const body = buildWardrobeOutfitWearRequestBody(input);
  const result = await api(WARDROBE_OUTFIT_WEAR_ACTION_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const actionState = actionStateFromResult(result) || wardrobeOutfitWearActionState(input.message || {});
  return Object.freeze({
    ok: result?.ok !== false,
    endpoint: WARDROBE_OUTFIT_WEAR_ACTION_ENDPOINT,
    requestBody: body,
    result,
    actionState,
    message: applyWardrobeOutfitWearActionResult(input.message || {}, result),
    thread: result?.thread || null,
  });
}

async function executeWardrobeOutfitWearActionWorkflow(input = {}) {
  const first = await executeWardrobeOutfitWearAction(Object.assign({}, input, { confirmReplace: false, mode: "create_only" }));
  const firstStatus = cleanString(first.actionState?.status, 80);
  if (firstStatus !== "needs_confirmation") return first;
  const confirm = typeof input.confirm === "function" ? input.confirm : null;
  if (!confirm) return first;
  const confirmed = await confirm({
    actionState: first.actionState,
    result: first.result,
    requestBody: first.requestBody,
  });
  if (!confirmed) {
    return Object.freeze(Object.assign({}, first, {
      ok: false,
      canceled: true,
      cancelReason: "owner_cancelled_confirmation",
    }));
  }
  return executeWardrobeOutfitWearAction(Object.assign({}, input, {
    message: first.message,
    confirmReplace: true,
    mode: "replace",
  }));
}

export {
  MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
  WARDROBE_OUTFIT_WEAR_ACTION_ENDPOINT,
  actionStateFromResult,
  applyWardrobeOutfitWearActionResult,
  buildWardrobeOutfitWearRequestBody,
  executeWardrobeOutfitWearAction,
  executeWardrobeOutfitWearActionWorkflow,
};
