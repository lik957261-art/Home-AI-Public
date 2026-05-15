"use strict";

const AUTO_DISPATCH_CASE_MODES = new Set(["multi-agent", "manual-revision"]);
const MANUAL_ONLY_CASE_MODES = new Set(["single-card"]);

function bool(value) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function firstValue(payload = {}, keys = []) {
  for (const key of keys) {
    if (Object.hasOwn(payload, key)) return payload[key];
  }
  return undefined;
}

function createKanbanTaskDispatchPolicy(options = {}) {
  const autoDispatchCaseModes = new Set(
    (options.autoDispatchCaseModes || [...AUTO_DISPATCH_CASE_MODES]).map(lower).filter(Boolean),
  );
  const manualOnlyCaseModes = new Set(
    (options.manualOnlyCaseModes || [...MANUAL_ONLY_CASE_MODES]).map(lower).filter(Boolean),
  );

  function manualOnlyForPayload(payload = {}) {
    if (bool(firstValue(payload, ["auto_dispatch", "autoDispatch"]))) return false;
    if (bool(firstValue(payload, ["manual_only", "manualOnly", "reminder_only", "reminderOnly"]))) return true;

    const caseMode = lower(firstValue(payload, ["case_mode", "caseMode"]));
    const caseId = text(firstValue(payload, ["case_id", "caseId"]));
    if (!caseMode && !caseId) return true;
    if (manualOnlyCaseModes.has(caseMode)) return true;
    if (autoDispatchCaseModes.has(caseMode)) return false;
    return false;
  }

  function resolveKanbanDispatch(payload = {}, context = {}) {
    const requestedAssignee = text(context.requestedAssignee || payload.assignee || payload.source_principal);
    const executableAssignee = text(context.executableAssignee || payload.kanban_assignee || payload.kanbanAssignee);
    const manualOnly = manualOnlyForPayload(payload);
    return Object.freeze({
      manualOnly,
      dispatchMode: manualOnly ? "manual" : "auto",
      requestedAssignee,
      officialAssignee: manualOnly ? "" : (executableAssignee || requestedAssignee),
      includeCompletionContract: !manualOnly,
    });
  }

  return Object.freeze({
    manualOnlyForPayload,
    resolveKanbanDispatch,
  });
}

module.exports = {
  createKanbanTaskDispatchPolicy,
};
