"use strict";

const {
  createLearningGrowthSubmissionService,
  evaluationComment,
  submissionStageForCard,
} = require("./learning-growth-submission-service");

function createLearningGrowthWritingSubmissionService(options = {}) {
  const service = createLearningGrowthSubmissionService(options);
  return Object.assign({}, service, {
    submitWriting: service.submitTask,
  });
}

module.exports = {
  createLearningGrowthWritingSubmissionService,
  evaluationComment,
  submissionStageForCard,
};
