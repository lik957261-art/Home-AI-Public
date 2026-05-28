"use strict";

(function initLearningGrowthTeachingController(global) {
  function ensureTeachingState() {
    state.learningGrowthTeachingStepByCardId = state.learningGrowthTeachingStepByCardId || {};
    state.learningGrowthTeachingDrafts = state.learningGrowthTeachingDrafts || {};
    state.learningGrowthExperienceSignalBusy = state.learningGrowthExperienceSignalBusy || {};
    state.learningGrowthExperienceSignalSubmitted = state.learningGrowthExperienceSignalSubmitted || {};
    state.learningGrowthTeachingCheckBusy = state.learningGrowthTeachingCheckBusy || {};
    state.learningGrowthStageAssessmentActivating = state.learningGrowthStageAssessmentActivating || {};
  }

  function setStep(taskCardId, step) {
    const id = String(taskCardId || "").trim();
    const value = String(step || "").trim();
    if (!id || !["lesson", "guided_practice", "quick_check"].includes(value)) return;
    ensureTeachingState();
    state.learningGrowthTeachingStepByCardId[id] = value;
    renderLearningCoinsView();
  }

  function updateDraft(taskCardId, field, value) {
    const id = String(taskCardId || "").trim();
    const key = String(field || "").trim();
    if (!id || !key) return;
    ensureTeachingState();
    state.learningGrowthTeachingDrafts[id] = Object.assign({}, state.learningGrowthTeachingDrafts[id] || {}, {
      [key]: String(value || ""),
    });
  }

  function selectedTask(taskCardId) {
    const id = String(taskCardId || state.selectedLearningTaskCardId || "").trim();
    if (!id) return null;
    const overview = state.learningGrowth || {};
    const programs = overview.programs || {};
    const lists = [programs.taskCards, programs.executableTasks, overview.board?.cards];
    for (const list of lists) {
      const found = Array.isArray(list) ? list.find((task) => String(task?.taskCardId || task?.id || "") === id) : null;
      if (found) return found;
    }
    return null;
  }

  async function shareGrowthCard(taskCardId, button = null) {
    const id = String(taskCardId || "").trim();
    const task = selectedTask(id);
    if (!task) throw new Error("Learning card was not found");
    if (typeof shareLearningGrowthCardImage !== "function") throw new Error("Learning card image sharing is unavailable");
    const previousText = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.classList.add("is-busy");
      button.textContent = "\u751f\u6210\u4e2d";
    }
    try {
      await shareLearningGrowthCardImage(task);
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("is-busy");
        button.textContent = previousText || "\u5206\u4eab";
      }
    }
  }

  async function submitCheck(event, form) {
    event.preventDefault();
    const taskCardId = String(form?.dataset?.learningGrowthTeachingCheckForm || "").trim();
    if (!taskCardId) return;
    ensureTeachingState();
    const draft = Object.assign({}, state.learningGrowthTeachingDrafts[taskCardId] || {});
    form.querySelectorAll("[data-learning-growth-teaching-draft]").forEach((input) => {
      const field = String(input.dataset.field || "").trim();
      if (field) draft[field] = String(input.value || "");
    });
    const quickCheckText = String(draft.quickCheckText || "").trim();
    const guidedPracticeText = String(draft.guidedPracticeText || "").trim();
    if (!quickCheckText && !guidedPracticeText) {
      showPushToast("先写一句跟做或检查内容。", "error");
      return;
    }
    state.learningGrowthTeachingCheckBusy[taskCardId] = true;
    renderLearningCoinsView();
    try {
      await api(`/api/learning-growth/cards/${encodeURIComponent(taskCardId)}/teaching-check`, {
        method: "POST",
        body: JSON.stringify({ guidedPracticeText, quickCheckText, summary: quickCheckText || guidedPracticeText }),
      });
      delete state.learningGrowthTeachingDrafts[taskCardId];
      state.learningGrowthTeachingStepByCardId[taskCardId] = "quick_check";
      showPushToast("学习卡已完成", "success");
      await loadLearningCoins({ limit: 80 });
      renderLearningCoinsView();
    } finally {
      state.learningGrowthTeachingCheckBusy[taskCardId] = false;
    }
  }

  async function recordSignal(taskCardId, signalType) {
    const id = String(taskCardId || "").trim();
    const type = String(signalType || "").trim();
    if (!id || !type) return;
    ensureTeachingState();
    if (state.learningGrowthExperienceSignalBusy[id]) return;
    if (state.learningGrowthExperienceSignalSubmitted[id]) return;
    const current = selectedTask(id);
    if (current?.experienceSummary?.latestSignalType) return;
    state.learningGrowthExperienceSignalBusy[id] = type;
    renderLearningCoinsView();
    try {
      await api(`/api/learning-growth/cards/${encodeURIComponent(id)}/experience-signal`, {
        method: "POST",
        body: JSON.stringify({ signalType: type }),
      });
      state.learningGrowthExperienceSignalSubmitted[id] = type;
      showPushToast("学习反馈已记录", "success");
      await loadLearningCoins({ limit: 80 });
      renderLearningCoinsView();
    } finally {
      delete state.learningGrowthExperienceSignalBusy[id];
    }
  }

  async function startChallenge(sourceTaskCardId) {
    const source = selectedTask(sourceTaskCardId) || {};
    const id = String(sourceTaskCardId || "manual").trim();
    ensureTeachingState();
    if (state.learningGrowthStageAssessmentActivating[id]) return;
    state.learningGrowthStageAssessmentActivating[id] = true;
    try {
      const result = await api("/api/learning-growth/stage-assessments/challenge", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: learningGrowthLearnerWorkspaceId(),
          learnerId: learningCoinStudentId(),
          programId: source.programId || "",
          domain: source.domain || "english",
          skillIds: source.skillIds || source.taskModel?.skillIds || [],
          capabilityClusterId: source.capabilityClusterId || "",
          title: `${String(source.title || "Stage assessment").trim()} - 能力挑战`,
          reason: "executor_ready",
        }),
      });
      const nextTaskId = result?.taskCard?.taskCardId || "";
      showPushToast("能力测验已生成", "success");
      await loadLearningCoins({ limit: 80 });
      if (nextTaskId) state.selectedLearningTaskCardId = nextTaskId;
      renderLearningCoinsView();
    } finally {
      state.learningGrowthStageAssessmentActivating[id] = false;
    }
  }

  function wireTeachingCards(root) {
    const scope = root || document;
    scope.querySelectorAll?.("[data-learning-growth-teaching-step]").forEach((button) => {
      button.addEventListener("click", () => setStep(button.dataset.learningGrowthTeachingStep, button.dataset.step));
    });
    scope.querySelectorAll?.("[data-learning-growth-teaching-draft]").forEach((input) => {
      const update = () => updateDraft(input.dataset.learningGrowthTeachingDraft, input.dataset.field, input.value);
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    scope.querySelectorAll?.("[data-learning-growth-teaching-check-form]").forEach((form) => {
      form.addEventListener("submit", (event) => submitCheck(event, form).catch(showError));
    });
    scope.querySelectorAll?.("[data-learning-growth-experience-signal]").forEach((button) => {
      button.addEventListener("click", () => recordSignal(button.dataset.learningGrowthExperienceSignal, button.dataset.signalType).catch(showError));
    });
    scope.querySelectorAll?.("[data-learning-growth-card-share]").forEach((button) => {
      button.addEventListener("click", () => shareGrowthCard(button.dataset.learningGrowthCardShare, button).catch(showError));
    });
    scope.querySelectorAll?.("[data-learning-growth-stage-assessment-challenge]").forEach((button) => {
      button.addEventListener("click", () => startChallenge(button.dataset.learningGrowthStageAssessmentChallenge).catch(showError));
    });
  }

  global.HermesLearningGrowthTeachingController = {
    wireTeachingCards,
  };
}(typeof window !== "undefined" ? window : globalThis));
