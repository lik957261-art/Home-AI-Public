"use strict";

const {
  applyAiTaskFeedback,
  buildTaskFeedbackPrompt,
  createLearningGrowthTaskFeedbackService,
  normalizeFeedback,
  parseJsonObject,
} = require("./learning-growth-task-feedback-service");

function applyAiWritingFeedback(evaluation = {}, aiFeedback = {}) {
  const merged = applyAiTaskFeedback(evaluation, aiFeedback);
  return Object.assign({}, merged, {
    evidenceRefs: [...new Set([...(Array.isArray(merged.evidenceRefs) ? merged.evidenceRefs : []), "learning-growth-writing-ai-feedback:v1"])],
  });
}

function buildWritingFeedbackPrompt(input = {}) {
  return buildTaskFeedbackPrompt(input);
}

function createLearningGrowthWritingAiFeedbackService(options = {}) {
  return createLearningGrowthTaskFeedbackService(options);
}

module.exports = {
  applyAiWritingFeedback,
  buildWritingFeedbackPrompt,
  createLearningGrowthWritingAiFeedbackService,
  normalizeFeedback,
  parseJsonObject,
};
