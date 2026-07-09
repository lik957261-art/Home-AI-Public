"use strict";

export const KANBAN_ACTIONS_MODEL_VERSION = "20260706-kanban-actions-model-v1";

export function kanbanComposerDraftStoragePatch(text) {
  const value = String(text || "");
  return value
    ? { action: "set", key: "hermesKanbanComposerDraft", value }
    : { action: "remove", key: "hermesKanbanComposerDraft", value: "" };
}

export function kanbanComposerModeSelectionPlan(mode) {
  return {
    mode: String(mode || ""),
    kanbanPlanDraft: null,
    preserveScroll: true,
  };
}

export function kanbanComposerDocumentRemovalPlan(documents = [], index) {
  const parsed = Number(index);
  const items = Array.isArray(documents) ? documents : [];
  if (!Number.isFinite(parsed)) return { ok: false, documents: items, preserveScroll: false };
  return {
    ok: true,
    documents: items.filter((_, itemIndex) => itemIndex !== parsed),
    preserveScroll: true,
  };
}

export function kanbanStatusSelectionPlan(value, tabOrder = [], options = {}) {
  const status = String(value || "").trim().toLowerCase();
  const validStatuses = Array.isArray(tabOrder) ? tabOrder.map((item) => String(item || "").trim().toLowerCase()) : [];
  const valid = Boolean(status) && validStatuses.includes(status);
  const needsCompleted = typeof options.needsCompleted === "function"
    ? Boolean(options.needsCompleted(status))
    : ["done", "archived", "cancelled", "canceled", "completed"].includes(status);
  return {
    ok: valid,
    status: valid ? status : "",
    storageKey: "hermesTodoKanbanStatus",
    shouldLoadCompleted: valid && needsCompleted && !options.completedLoaded,
  };
}

export function kanbanStoryExpandedPatch(expanded = {}, key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return { ok: false, expanded: Object.assign({}, expanded || {}) };
  return {
    ok: true,
    expanded: Object.assign({}, expanded || {}, { [normalizedKey]: !expanded?.[normalizedKey] }),
  };
}

export function kanbanChoiceSelectionPatch(existingAnswers = [], index, value) {
  const parsedIndex = Number(index);
  if (!Number.isFinite(parsedIndex)) return { ok: false, answers: Array.isArray(existingAnswers) ? existingAnswers : [] };
  const answers = Array.isArray(existingAnswers) ? existingAnswers.slice() : [];
  answers[parsedIndex] = Number(value);
  return { ok: true, answers };
}

export function kanbanPreviousStepPlan(currentStep) {
  return Math.max(0, Number(currentStep || 0) - 1);
}

export function kanbanNextStepPlan(currentStep, total, fallbackTotal = 1) {
  const max = Math.max(0, Number(total || fallbackTotal || 1) - 1);
  return Math.min(max, Number(currentStep || 0) + 1);
}
