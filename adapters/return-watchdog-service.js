"use strict";

const DEFAULT_RETURN_WATCHDOG_STALE_MS = 4 * 60 * 60 * 1000;
const TERMINAL_SLICE_STATUSES = Object.freeze(["completed", "blocked", "redirected", "rejected", "partially_completed"]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function parseIsoMs(value) {
  const parsed = Date.parse(clean(value || "", 100));
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedReturnWatchdogStaleMs(input = {}, options = {}) {
  const raw = input.staleAfterMs ?? input.stale_after_ms ?? options.returnWatchdogStaleMs ?? DEFAULT_RETURN_WATCHDOG_STALE_MS;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_RETURN_WATCHDOG_STALE_MS;
  return Math.min(30 * 24 * 60 * 60 * 1000, numeric);
}

function isReturnWatchdogCandidate(slice = {}) {
  const dispatchStatus = clean(slice.dispatchStatus || slice.dispatch_status || "", 80);
  if (!["sent", "return_stale"].includes(dispatchStatus)) return false;
  if (!clean(slice.taskCardId || slice.task_card_id || "", 160)) return false;
  if (clean(slice.returnCardId || slice.return_card_id || "", 160)) return false;
  if (TERMINAL_SLICE_STATUSES.includes(clean(slice.status || "", 80))) return false;
  return true;
}

function returnWatchdogItemForSlice(slice = {}, nowMs = Date.now(), staleAfterMs = DEFAULT_RETURN_WATCHDOG_STALE_MS) {
  const referenceMs = parseIsoMs(slice.updatedAt || slice.updated_at) || parseIsoMs(slice.startedAt || slice.started_at) || parseIsoMs(slice.createdAt || slice.created_at);
  const ageMs = referenceMs ? Math.max(0, nowMs - referenceMs) : 0;
  const alreadyMarked = clean(slice.dispatchStatus || slice.dispatch_status || "", 80) === "return_stale";
  const stale = alreadyMarked || (referenceMs && ageMs >= staleAfterMs);
  return {
    caseId: clean(slice.caseId || slice.case_id || "", 160),
    sliceId: clean(slice.sliceId || slice.slice_id || "", 160),
    sliceKey: clean(slice.sliceKey || slice.slice_key || "", 160),
    ownerLayer: clean(slice.ownerLayer || slice.owner_layer || "", 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId || slice.target_workspace_id || "", 120),
    dispatchStatus: clean(slice.dispatchStatus || slice.dispatch_status || "", 80),
    taskCardId: clean(slice.taskCardId || slice.task_card_id || "", 160),
    ageMs,
    ageMinutes: Math.floor(ageMs / 60000),
    staleAfterMs,
    stale: Boolean(stale),
    alreadyMarked,
    code: stale ? "return_card_missing_after_sla" : "return_card_waiting",
    recommendedAction: stale
      ? "inspect_missing_return_then_record_terminal_return_or_reroute"
      : "observe_return_card",
    updatedAt: clean(slice.updatedAt || slice.updated_at || "", 80),
    startedAt: clean(slice.startedAt || slice.started_at || "", 80),
  };
}

function buildReturnWatchdogSummary(input = {}) {
  const staleAfterMs = boundedReturnWatchdogStaleMs(input, input.options || {});
  const now = clean(input.generatedAt || input.nowIso || new Date().toISOString(), 80);
  const nowMs = parseIsoMs(now) || Date.now();
  const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
  const limit = Math.max(1, Math.min(100, Number(input.limit || 50) || 50));
  const items = (Array.isArray(input.slices) ? input.slices : [])
    .filter((slice) => !workspaceId || clean(slice.workspaceId || slice.workspace_id || "owner", 120) === workspaceId)
    .filter(isReturnWatchdogCandidate)
    .map((slice) => returnWatchdogItemForSlice(slice, nowMs, staleAfterMs));
  const staleItems = items.filter((item) => item.stale);
  const counts = {
    tracked: items.length,
    waiting: items.length - staleItems.length,
    stale: staleItems.length,
    alreadyMarked: items.filter((item) => item.alreadyMarked).length,
  };
  return {
    ok: true,
    schemaVersion: 1,
    generatedAt: now,
    status: counts.stale ? "degraded" : "ok",
    workspaceId,
    staleAfterMs,
    counts,
    itemCount: Math.min(items.length, limit),
    items: items
      .sort((a, b) => Number(b.stale) - Number(a.stale) || b.ageMs - a.ageMs)
      .slice(0, limit),
    source: { name: "return-watchdog-service", storage: "sqlite" },
    policy: {
      ownerVisible: true,
      boundedMetadataOnly: true,
      noAutoRetry: true,
      terminalReturnStillAcceptedByTaskCardId: true,
    },
  };
}

function returnWatchdogMarkPatch(item = {}, summary = {}, detectedAt = "") {
  return {
    status: "dispatched",
    dispatchStatus: "return_stale",
    blockedReason: "return_card_watchdog_stale",
    returnWatchdog: {
      code: clean(item.code || "return_card_missing_after_sla", 120),
      staleAfterMs: Number(summary.staleAfterMs || item.staleAfterMs || DEFAULT_RETURN_WATCHDOG_STALE_MS),
      ageMs: Number(item.ageMs || 0) || 0,
      detectedAt: clean(detectedAt || summary.generatedAt || new Date().toISOString(), 80),
      taskCardId: clean(item.taskCardId || "", 160),
      policy: "no_auto_retry",
    },
  };
}

module.exports = {
  DEFAULT_RETURN_WATCHDOG_STALE_MS,
  boundedReturnWatchdogStaleMs,
  buildReturnWatchdogSummary,
  isReturnWatchdogCandidate,
  returnWatchdogItemForSlice,
  returnWatchdogMarkPatch,
};
