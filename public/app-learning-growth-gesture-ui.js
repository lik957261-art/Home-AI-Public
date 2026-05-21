"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningGrowthGestureUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function wireLearningGrowthBackSwipe(root, onBack) {
    const target = root?.querySelector?.("[data-learning-growth-task-focus]");
    if (!target || typeof onBack !== "function") return;
    let startX = 0;
    let startY = 0;
    let interactive = false;
    target.addEventListener("touchstart", (event) => {
      const touch = event.touches?.[0];
      startX = touch?.clientX || 0;
      startY = touch?.clientY || 0;
      interactive = Boolean(event.target?.closest?.("button,input,textarea,select,a,label,[role='button'],form"));
    }, { passive: true });
    target.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      const dx = (touch?.clientX || 0) - startX;
      const dy = Math.abs((touch?.clientY || 0) - startY);
      if (!interactive && dx > 88 && dy < 72) onBack();
    }, { passive: true });
  }

  return {
    wireLearningGrowthBackSwipe,
  };
}));
