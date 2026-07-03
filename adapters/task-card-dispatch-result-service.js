"use strict";

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cardIdsFromTaskCardResult(result = {}) {
  if (Array.isArray(result.cardIds)) return result.cardIds.map((item) => clean(item, 160)).filter(Boolean);
  if (Array.isArray(result.taskCardIds)) return result.taskCardIds.map((item) => clean(item, 160)).filter(Boolean);
  if (result.cardId) return [clean(result.cardId, 160)].filter(Boolean);
  return [];
}

function exceptionTaskCardResult(err, fallback = "task_card_dispatch_exception") {
  return {
    ok: false,
    error: clean(err && err.message ? err.message : err || fallback, 180) || fallback,
  };
}

function taskCardDispatchFailure(result = {}, context = {}) {
  const cardIds = cardIdsFromTaskCardResult(result);
  const missingId = !cardIds.length;
  return {
    code: clean(result?.error || (missingId ? "task_card_dispatch_card_id_missing" : "task_card_dispatch_failed"), 180),
    status: Number(result?.status || result?.statusCode || result?.status_code || 0) || 0,
    targetWorkspaceId: clean(context.targetWorkspaceId || context.target_workspace_id || "", 120),
    targetWorkspace: clean(context.targetWorkspace || context.target_workspace || "", 500),
    targetThreadId: clean(context.targetThreadId || context.target_thread_id || "", 180),
    targetThreadTitle: clean(context.targetThreadTitle || context.target_thread_title || "", 180),
  };
}

function normalizeTaskCardDispatchResult(result = {}, context = {}) {
  const cardIds = cardIdsFromTaskCardResult(result);
  if (result && result.ok !== false && cardIds.length) {
    return {
      ok: true,
      cardIds,
      failure: null,
    };
  }
  return {
    ok: false,
    cardIds,
    failure: taskCardDispatchFailure(result, context),
  };
}

module.exports = {
  cardIdsFromTaskCardResult,
  exceptionTaskCardResult,
  normalizeTaskCardDispatchResult,
  taskCardDispatchFailure,
};
