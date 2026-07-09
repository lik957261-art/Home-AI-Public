"use strict";

(function initLearningGrowthSettingsController(global) {
  const LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_ESM_PATH = "/vite-islands/learning-growth-settings-controller-model/learning-growth-settings-controller-model.js";
  let learningGrowthSettingsControllerModel = null;
  let learningGrowthSettingsControllerModelPromise = null;

  function importLearningGrowthSettingsControllerModel(rootRef = global) {
    if (learningGrowthSettingsControllerModel) return Promise.resolve(learningGrowthSettingsControllerModel);
    if (!learningGrowthSettingsControllerModelPromise) {
      const importer = typeof rootRef.__homeAiImportLearningGrowthSettingsControllerModel === "function"
        ? rootRef.__homeAiImportLearningGrowthSettingsControllerModel
        : (path) => import(path);
      learningGrowthSettingsControllerModelPromise = Promise.resolve()
        .then(() => importer(LEARNING_GROWTH_SETTINGS_CONTROLLER_MODEL_ESM_PATH))
        .then((model) => {
          learningGrowthSettingsControllerModel = model || null;
          return learningGrowthSettingsControllerModel;
        })
        .catch((error) => {
          learningGrowthSettingsControllerModelPromise = null;
          throw error;
        });
    }
    return learningGrowthSettingsControllerModelPromise;
  }

  function currentLearningGrowthSettingsControllerModel() {
    return learningGrowthSettingsControllerModel;
  }

  function learningGrowthSettingsControllerModelFunction(name) {
    const model = currentLearningGrowthSettingsControllerModel();
    return model && typeof model[name] === "function" ? model[name] : null;
  }

  if (typeof window !== "undefined") {
    importLearningGrowthSettingsControllerModel().catch(() => null);
  }

  function openSettingsTaskPatch(taskCardId) {
    const modelFn = learningGrowthSettingsControllerModelFunction("openSettingsTaskPatchPlan");
    if (modelFn) return modelFn(taskCardId);
    const id = String(taskCardId || "").trim();
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

  function closeSettingsTaskPatch() {
    const modelFn = learningGrowthSettingsControllerModelFunction("closeSettingsTaskPatchPlan");
    if (modelFn) return modelFn();
    return {
      learningGrowthSettingsTaskId: "",
      learningGrowthActiveTab: "tasks",
    };
  }

  function settingsSwipeBackAllowed() {
    const modelFn = learningGrowthSettingsControllerModelFunction("settingsSwipeBackAllowedPlan");
    const input = {
      isMobile: isMobileLayout(),
      viewMode: state.viewMode,
      settingsOpen: state.learningGrowthSettingsOpen,
      settingsTaskId: state.learningGrowthSettingsTaskId,
    };
    return modelFn
      ? modelFn(input)
      : Boolean(input.isMobile && input.viewMode === "learning" && input.settingsOpen && input.settingsTaskId);
  }

  function settingsSwipeStart(input) {
    const modelFn = learningGrowthSettingsControllerModelFunction("settingsSwipeStartPlan");
    if (modelFn) return modelFn(input);
    if (!input.canSwipeBack || input.touchCount !== 1 || input.targetIsInteractive) return { start: false, clear: true, swipe: null };
    return {
      start: true,
      clear: false,
      swipe: {
        startX: Number(input.clientX || 0),
        startY: Number(input.clientY || 0),
        startedAt: Number(input.now || 0),
        dragging: false,
        accepted: false,
      },
    };
  }

  function settingsSwipeMove(input) {
    const modelFn = learningGrowthSettingsControllerModelFunction("settingsSwipeMovePlan");
    if (modelFn) return modelFn(input);
    const swipe = input.swipe;
    if (!swipe || !input.canSwipeBack || input.touchCount !== 1) return { apply: false };
    const dx = Number(input.clientX || 0) - Number(swipe.startX || 0);
    const dy = Number(input.clientY || 0) - Number(swipe.startY || 0);
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return { apply: false };
    const elapsed = Math.max(1, Number(input.now || 0) - (Number(swipe.startedAt || 0) || Number(input.now || 0)));
    return {
      apply: true,
      patch: {
        dragging: true,
        accepted: dx > 58 || (dx / elapsed) > 0.55,
      },
      transform: `translate3d(${Math.min(64, dx * 0.42)}px, 0, 0)`,
    };
  }

  function settingsSwipeEnd(swipe) {
    const modelFn = learningGrowthSettingsControllerModelFunction("settingsSwipeEndPlan");
    if (modelFn) return modelFn(swipe);
    return {
      clear: true,
      resetStyle: Boolean(swipe?.dragging),
      shouldClose: Boolean(swipe?.dragging && swipe?.accepted),
    };
  }

  function settingsSwipeCancel(swipe) {
    const modelFn = learningGrowthSettingsControllerModelFunction("settingsSwipeCancelPlan");
    if (modelFn) return modelFn(swipe);
    return {
      clear: true,
      resetStyle: Boolean(swipe?.dragging),
    };
  }

  function openSettingsTask(taskCardId) {
    const plan = openSettingsTaskPatch(taskCardId);
    if (!plan.ok) return;
    Object.assign(state, plan.patch);
    renderLearningCoinsView();
  }

  function closeSettingsTask() {
    Object.assign(state, closeSettingsTaskPatch());
    renderLearningCoinsView();
  }

  function wireSettingsTaskSwipe(root) {
    const shell = root?.querySelector?.("[data-learning-settings-task-detail]");
    if (!shell || shell.dataset.learningSettingsSwipeBound) return;
    shell.dataset.learningSettingsSwipeBound = "1";
    const interactiveSelector = currentLearningGrowthSettingsControllerModel()?.LEARNING_GROWTH_SETTINGS_INTERACTIVE_SELECTOR || "button, a, input, select, textarea, [contenteditable='true']";
    const clearSwipe = () => { state.learningGrowthSettingsSwipe = null; };
    const canSwipeBack = () => settingsSwipeBackAllowed();
    shell.addEventListener("touchstart", (event) => {
      const point = event.touches[0] || {};
      const plan = settingsSwipeStart({
        canSwipeBack: canSwipeBack(),
        touchCount: event.touches.length,
        targetIsInteractive: Boolean(event.target?.closest?.(interactiveSelector)),
        clientX: point.clientX,
        clientY: point.clientY,
        now: performance.now(),
      });
      if (!plan.start) {
        clearSwipe();
        return;
      }
      state.learningGrowthSettingsSwipe = Object.assign({}, plan.swipe, { shell });
    }, { passive: true });
    shell.addEventListener("touchmove", (event) => {
      const swipe = state.learningGrowthSettingsSwipe;
      if (!swipe || !canSwipeBack() || event.touches.length !== 1) return;
      const point = event.touches[0];
      const plan = settingsSwipeMove({
        swipe,
        canSwipeBack: true,
        touchCount: event.touches.length,
        clientX: point.clientX,
        clientY: point.clientY,
        now: performance.now(),
      });
      if (!plan.apply) return;
      Object.assign(swipe, plan.patch);
      shell.classList.add("learning-settings-task-dragging");
      shell.style.transform = plan.transform;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }, { passive: false });
    shell.addEventListener("touchend", () => {
      const swipe = state.learningGrowthSettingsSwipe;
      const plan = settingsSwipeEnd(swipe);
      clearSwipe();
      if (!plan.resetStyle) return;
      swipe.shell.classList.remove("learning-settings-task-dragging");
      swipe.shell.style.transform = "";
      if (plan.shouldClose) closeSettingsTask();
    }, { passive: true });
    shell.addEventListener("touchcancel", () => {
      const swipe = state.learningGrowthSettingsSwipe;
      const plan = settingsSwipeCancel(swipe);
      clearSwipe();
      if (!plan.resetStyle) return;
      swipe.shell.classList.remove("learning-settings-task-dragging");
      swipe.shell.style.transform = "";
    }, { passive: true });
  }

  global.HermesLearningGrowthSettingsController = {
    closeSettingsTask,
    closeSettingsTaskPatch,
    currentLearningGrowthSettingsControllerModel,
    importLearningGrowthSettingsControllerModel,
    openSettingsTask,
    openSettingsTaskPatch,
    settingsSwipeBackAllowed,
    settingsSwipeCancel,
    settingsSwipeEnd,
    settingsSwipeMove,
    settingsSwipeStart,
    wireSettingsTaskSwipe,
  };
}(typeof window !== "undefined" ? window : globalThis));
