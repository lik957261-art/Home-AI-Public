"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningGrowthTaskUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function taskModel(todo = {}) {
    const model = todo?.learningTaskModel || null;
    if (model && typeof model === "object") return model;
    const summary = todo?.learningGrowthTaskModel || null;
    return summary && typeof summary === "object" ? summary : null;
  }

  function activityLabel(value) {
    const activity = String(value || "").trim();
    if (activity === "writing") return "\u5199\u4f5c";
    if (activity === "reading") return "\u9605\u8bfb";
    if (activity === "listening") return "\u542c\u529b";
    if (activity === "speaking") return "\u53e3\u8bed";
    if (activity === "pronunciation") return "\u53d1\u97f3";
    if (activity === "vocabulary") return "\u8bcd\u6c47";
    if (activity === "grammar") return "\u8bed\u6cd5";
    if (activity === "presentation") return "\u6f14\u8bb2";
    return activity || "\u7ec3\u4e60";
  }

  function nextActionLabel(action) {
    const value = String(action || "").trim();
    if (value === "submit_first_attempt") return "\u63d0\u4ea4\u7b2c\u4e00\u6b21\u4f5c\u7b54";
    if (value === "wait_for_feedback") return "\u7b49\u5f85 AI \u6279\u6539";
    if (value === "submit_revision") return "\u63d0\u4ea4\u4fee\u6539\u7248";
    if (value === "submit_revision_and_reflection") return "\u63d0\u4ea4\u6539\u5199\u548c\u590d\u76d8";
    if (value === "review_feedback") return "\u67e5\u770b\u53cd\u9988";
    return value || "\u5f00\u59cb\u4efb\u52a1";
  }

  function submissionPrompt(evaluation = {}, todo = {}) {
    const nextStep = String(evaluation.nextStep || "");
    if (nextStep === "rewrite_and_reflect") return "\u5199\u4e0b\u6539\u5199\u540e\u7684\u7248\u672c\uff0c\u5e76\u8865\u4e00\u53e5\u590d\u76d8\uff1a\u6211\u6539\u4e86\u4ec0\u4e48\uff0c\u4e3a\u4ec0\u4e48\u3002";
    if (nextStep === "revise_and_resubmit") return "\u6309\u6279\u6539\u62a5\u544a\u518d\u6539\u4e00\u7248\uff0c\u7136\u540e\u63d0\u4ea4\u3002";
    const activity = String(taskModel(todo)?.activityType || "").trim();
    if (activity === "vocabulary") return "\u5199\u4e0b\u672c\u6b21\u8bcd\u6c47\u9020\u53e5\uff0c\u5c3d\u91cf\u7528\u5b66\u6821\u6216\u751f\u6d3b\u573a\u666f\u3002";
    if (activity === "grammar") return "\u5199\u4e0b\u4fee\u6539\u540e\u7684\u53e5\u5b50\u548c\u4e00\u53e5\u89c4\u5219\u603b\u7ed3\u3002";
    if (activity === "reading") return "\u5199\u4e0b\u9605\u8bfb\u7b54\u6848\u3001\u7406\u7531\u548c\u4e0d\u786e\u5b9a\u7684\u5730\u65b9\u3002";
    if (activity === "listening") return "\u5199\u4e0b\u542c\u5230\u7684 3-5 \u4e2a\u8981\u70b9\uff0c\u518d\u6807\u51fa\u6700\u4e0d\u786e\u5b9a\u7684\u4e00\u5904\u3002";
    if (activity === "speaking") return "\u5199\u4e0b\u590d\u8ff0\u7a3f\u6216\u53e3\u8bed\u590d\u8ff0\u8981\u70b9\uff1a\u4e3b\u65e8\u3001\u4e24\u4e2a\u7ec6\u8282\u548c\u4e00\u53e5\u590d\u76d8\u3002";
    if (activity === "pronunciation") return "\u5199\u4e0b\u8ddf\u8bfb\u53e5\u5b50\u3001\u89c9\u5f97\u6700\u96be\u7684\u53d1\u97f3\u70b9\uff0c\u4ee5\u53ca\u4fee\u590d\u540e\u7684\u91cd\u8bfb\u53e5\u3002";
    if (activity === "presentation") return "\u5199\u4e0b\u6f14\u8bb2\u63d0\u7eb2\uff1a\u5f00\u573a\u3001\u4e24\u4e2a\u8981\u70b9\u3001\u7ed3\u5c3e\uff0c\u5e76\u8865\u4e00\u53e5\u6392\u7ec3\u53cd\u601d\u3002";
    return "\u5199\u4e0b\u672c\u6b21\u5b66\u4e60\u4efb\u52a1\u4f5c\u7b54\u3002";
  }

  return {
    activityLabel,
    nextActionLabel,
    submissionPrompt,
    taskModel,
  };
}));
