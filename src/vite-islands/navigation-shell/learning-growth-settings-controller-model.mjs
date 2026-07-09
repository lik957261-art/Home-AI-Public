"use strict";

export const LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_VERSION = "20260706-learning-growth-settings-controller-model-v1";

export const LEARNING_GROWTH_SETTINGS_INTERACTIVE_SELECTOR = "button, a, input, select, textarea, [contenteditable='true']";

function cleanToken(value) {
  return String(value || "").trim();
}

export function openSettingsTaskPatchPlan(taskCardId = "") {
  const id = cleanToken(taskCardId);
  if (!id) return { ok: false, patch: {} };
  return {
    ok: true,
    patch: {
      learningGrowthSettingsOpen: true,
      learningGrowthActiveTab: "tasks",
      selectedLearningTaskCardId: "",
      learningGrowthSettingsTaskId: id,
    },
  };
}

export function closeSettingsTaskPatchPlan() {
  return {
    learningGrowthSettingsTaskId: "",
    learningGrowthActiveTab: "tasks",
  };
}

export function settingsSwipeBackAllowedPlan({
  isMobile = false,
  viewMode = "",
  settingsOpen = false,
  settingsTaskId = "",
} = {}) {
  return Boolean(isMobile && viewMode === "learning" && settingsOpen && cleanToken(settingsTaskId));
}

export function settingsSwipeStartPlan({
  canSwipeBack = false,
  touchCount = 0,
  targetIsInteractive = false,
  clientX = 0,
  clientY = 0,
  now = 0,
} = {}) {
  if (!canSwipeBack || touchCount !== 1 || targetIsInteractive) {
    return { start: false, clear: true, swipe: null };
  }
  return {
    start: true,
    clear: false,
    swipe: {
      startX: Number(clientX || 0),
      startY: Number(clientY || 0),
      startedAt: Number(now || 0),
      dragging: false,
      accepted: false,
    },
  };
}

export function settingsSwipeMovePlan({
  swipe = null,
  canSwipeBack = false,
  touchCount = 0,
  clientX = 0,
  clientY = 0,
  now = 0,
} = {}) {
  if (!swipe || !canSwipeBack || touchCount !== 1) return { apply: false };
  const dx = Number(clientX || 0) - Number(swipe.startX || 0);
  const dy = Number(clientY || 0) - Number(swipe.startY || 0);
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);
  if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) {
    return { apply: false };
  }
  const elapsed = Math.max(1, Number(now || 0) - (Number(swipe.startedAt || 0) || Number(now || 0)));
  const accepted = dx > 58 || (dx / elapsed) > 0.55;
  return {
    apply: true,
    patch: {
      dragging: true,
      accepted,
    },
    transform: `translate3d(${Math.min(64, dx * 0.42)}px, 0, 0)`,
  };
}

export function settingsSwipeEndPlan(swipe = null) {
  return {
    clear: true,
    resetStyle: Boolean(swipe?.dragging),
    shouldClose: Boolean(swipe?.dragging && swipe?.accepted),
  };
}

export function settingsSwipeCancelPlan(swipe = null) {
  return {
    clear: true,
    resetStyle: Boolean(swipe?.dragging),
  };
}
