"use strict";

(function initLearningGrowthSettingsController(global) {
  function openSettingsTask(taskCardId) {
    const id = String(taskCardId || "").trim();
    if (!id) return;
    state.learningGrowthSettingsOpen = true;
    state.learningGrowthActiveTab = "tasks";
    state.selectedLearningTaskCardId = "";
    state.learningGrowthSettingsTaskId = id;
    renderLearningCoinsView();
  }

  function closeSettingsTask() {
    state.learningGrowthSettingsTaskId = "";
    state.learningGrowthActiveTab = "tasks";
    renderLearningCoinsView();
  }

  function wireSettingsTaskSwipe(root) {
    const shell = root?.querySelector?.("[data-learning-settings-task-detail]");
    if (!shell || shell.dataset.learningSettingsSwipeBound) return;
    shell.dataset.learningSettingsSwipeBound = "1";
    const interactiveSelector = "button, a, input, select, textarea, [contenteditable='true']";
    const clearSwipe = () => { state.learningGrowthSettingsSwipe = null; };
    const canSwipeBack = () => (
      isMobileLayout()
      && state.viewMode === "learning"
      && state.learningGrowthSettingsOpen
      && Boolean(state.learningGrowthSettingsTaskId)
    );
    shell.addEventListener("touchstart", (event) => {
      if (!canSwipeBack() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
        clearSwipe();
        return;
      }
      const point = event.touches[0];
      state.learningGrowthSettingsSwipe = {
        startX: point.clientX,
        startY: point.clientY,
        startedAt: performance.now(),
        dragging: false,
        accepted: false,
        shell,
      };
    }, { passive: true });
    shell.addEventListener("touchmove", (event) => {
      const swipe = state.learningGrowthSettingsSwipe;
      if (!swipe || !canSwipeBack() || event.touches.length !== 1) return;
      const point = event.touches[0];
      const dx = point.clientX - swipe.startX;
      const dy = point.clientY - swipe.startY;
      const horizontal = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return;
      swipe.dragging = true;
      const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
      swipe.accepted = dx > 58 || (dx / elapsed) > 0.55;
      shell.classList.add("learning-settings-task-dragging");
      shell.style.transform = `translate3d(${Math.min(64, dx * 0.42)}px, 0, 0)`;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }, { passive: false });
    shell.addEventListener("touchend", () => {
      const swipe = state.learningGrowthSettingsSwipe;
      clearSwipe();
      if (!swipe?.dragging) return;
      swipe.shell.classList.remove("learning-settings-task-dragging");
      swipe.shell.style.transform = "";
      if (swipe.accepted) closeSettingsTask();
    }, { passive: true });
    shell.addEventListener("touchcancel", () => {
      const swipe = state.learningGrowthSettingsSwipe;
      clearSwipe();
      if (!swipe?.dragging) return;
      swipe.shell.classList.remove("learning-settings-task-dragging");
      swipe.shell.style.transform = "";
    }, { passive: true });
  }

  global.HermesLearningGrowthSettingsController = {
    closeSettingsTask,
    openSettingsTask,
    wireSettingsTaskSwipe,
  };
}(typeof window !== "undefined" ? window : globalThis));
