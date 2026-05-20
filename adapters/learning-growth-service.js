"use strict";

const { createLearningV1ReadinessService } = require("./learning-v1-readiness-service");
const { buildLearningLaunchOperations } = require("./learning-launch-operations-service");

const LEARNING_GROWTH_MODULE_ID = "fanfan-growth";

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function normalizeLearningGrowthRequest(input = {}) {
  const workspaceId = cleanString(input.workspaceId) || "owner";
  const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
  const learnerName = cleanString(input.learnerName || input.displayName)
    || (learnerId === "weixin_stephen" ? "\u51e1\u51e1" : learnerId);
  return {
    workspaceId,
    learnerId,
    studentId: learnerId,
    learnerName,
    limit: normalizeLimit(input.limit),
  };
}

function normalizeViewerRole(input = {}) {
  const explicit = cleanString(input.viewerRole || input.role).toLowerCase();
  if (explicit === "owner") return "owner";
  if (explicit === "executor" || explicit === "learner" || explicit === "student") return "executor";
  if (input.owner === false || input.isOwner === false) return "executor";
  return "owner";
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function copyFields(source, fields) {
  const record = source && typeof source === "object" ? source : {};
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined) {
      out[field] = record[field];
    }
  }
  return out;
}

function projectProgramForExecutor(program) {
  return copyFields(program, [
    "programId",
    "learnerId",
    "workspaceId",
    "title",
    "status",
    "domain",
    "focusAreas",
    "minutesPerDay",
    "daysPerWeek",
    "startDate",
    "endDate",
    "timeOfDay",
    "createdAt",
    "updatedAt",
  ]);
}

function projectTaskCardForExecutor(task) {
  return copyFields(task, [
    "taskCardId",
    "programId",
    "draftId",
    "learnerId",
    "workspaceId",
    "kanbanCardId",
    "title",
    "status",
    "taskCardType",
    "taskModel",
    "domain",
    "plannedDate",
    "plannedMinutes",
    "skillIds",
    "templateId",
    "summary",
    "createdAt",
    "updatedAt",
  ]);
}

function projectExecutableTaskForExecutor(task) {
  return copyFields(task, [
    "taskCardId",
    "todoId",
    "source",
    "kanbanCardId",
    "title",
    "status",
    "executionStatus",
    "kanbanStatus",
    "taskCardType",
    "taskModel",
    "domain",
    "workspaceId",
    "learnerId",
    "assignee",
    "plannedDate",
    "plannedMinutes",
    "dueAt",
    "dueLocal",
    "skillIds",
    "kanbanCaseTemplate",
    "kanbanStudyKind",
    "kanbanCaseMode",
    "kanbanCaseCardId",
    "hasInstruction",
    "openUrl",
    "summary",
    "templateId",
    "privacyLevel",
  ]);
}

function projectInteractionSessionForExecutor(session) {
  return copyFields(session, [
    "sessionId",
    "taskCardId",
    "learnerId",
    "workspaceId",
    "status",
    "currentStep",
    "summary",
    "updatedAt",
  ]);
}

function projectEvaluationForExecutor(evaluation) {
  return copyFields(evaluation, [
    "evaluationId",
    "taskCardId",
    "learnerId",
    "workspaceId",
    "status",
    "score",
    "passed",
    "summary",
    "skillId",
    "createdAt",
  ]);
}

function projectTaskSubmissionForExecutor(submission) {
  return copyFields(submission, [
    "submissionId",
    "taskCardId",
    "sessionId",
    "learnerId",
    "workspaceId",
    "stage",
    "submissionKind",
    "attemptNo",
    "status",
    "summary",
    "textDigest",
    "textChars",
    "textWords",
    "kanbanCardId",
    "submittedAt",
    "withdrawnAt",
    "updatedAt",
  ]);
}

function projectTaskReflectionForExecutor(reflection) {
  return copyFields(reflection, [
    "reflectionId",
    "taskCardId",
    "sessionId",
    "evaluationId",
    "learnerId",
    "workspaceId",
    "status",
    "mode",
    "score",
    "maxScore",
    "summary",
    "transcriptDigest",
    "audioDigest",
    "evidenceRefs",
    "submittedAt",
    "updatedAt",
  ]);
}

function projectSkillStateForExecutor(skill) {
  return copyFields(skill, [
    "skillId",
    "domain",
    "level",
    "confidence",
    "summary",
    "updatedAt",
  ]);
}

function projectLearnerProfileForExecutor(profile) {
  return copyFields(profile, [
    "learnerId",
    "workspaceId",
    "profileSummary",
    "updatedAt",
  ]);
}

function projectProgramOverviewForExecutor(programs) {
  if (!programs || typeof programs !== "object") return programs || null;
  return {
    counts: copyFields(programs.counts, ["programs", "taskCards", "evaluations", "taskSubmissions", "taskReflections", "skillStates"]),
    programs: arrayValue(programs.programs).map(projectProgramForExecutor),
    dailyPlan: programs.dailyPlan || null,
    executableTasks: arrayValue(programs.executableTasks).map(projectExecutableTaskForExecutor),
    taskCards: arrayValue(programs.taskCards).map(projectTaskCardForExecutor),
    interactionSessions: arrayValue(programs.interactionSessions).map(projectInteractionSessionForExecutor),
    evaluations: arrayValue(programs.evaluations).map(projectEvaluationForExecutor),
    taskSubmissions: arrayValue(programs.taskSubmissions).map(projectTaskSubmissionForExecutor),
    taskReflections: arrayValue(programs.taskReflections).map(projectTaskReflectionForExecutor),
    learnerProfile: projectLearnerProfileForExecutor(programs.learnerProfile),
    skillStates: arrayValue(programs.skillStates).map(projectSkillStateForExecutor),
  };
}

function projectCoinSummaryForExecutor(coins) {
  if (!coins || typeof coins !== "object") return coins || null;
  return copyFields(coins, [
    "studentId",
    "workspaceId",
    "balances",
    "growth",
    "rewards",
    "redemptions",
    "ledger",
  ]);
}

function projectGrowthOverviewForExecutor(overview) {
  return {
    viewerRole: "executor",
    module: copyFields(overview.module, ["id", "title", "hostView", "currentEntry", "standaloneReady"]),
    learner: copyFields(overview.learner, ["id", "studentId", "workspaceId", "displayName"]),
    metrics: overview.metrics || {},
    programs: projectProgramOverviewForExecutor(overview.programs),
    coins: projectCoinSummaryForExecutor(overview.coins),
  };
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function coinMetric(coins = {}) {
  const balances = coins.balances || {};
  const growth = coins.growth || {};
  const redemptions = Array.isArray(coins.redemptions) ? coins.redemptions : [];
  return {
    availableCoins: numberValue(balances.availableCoins),
    earnedCoins: numberValue(balances.earnedCoins),
    heldCoins: numberValue(balances.heldCoins),
    spentCoins: numberValue(balances.spentCoins),
    sevenDayCoins: numberValue(growth.sevenDayCoins),
    activeDaysInLast7: numberValue(growth.activeDaysInLast7),
    pendingRedemptions: redemptions.filter((item) => item && item.status === "requested").length,
  };
}

function learningGrowthCapabilityMap(metrics = {}) {
  return [
    {
      id: "learning-data-foundation",
      title: "\u76ee\u6807\u4e0e\u5b66\u4e60\u6570\u636e",
      status: "foundation",
      description: "\u6c89\u6dc0\u5b66\u6821\u3001\u79c1\u6559\u3001\u5386\u53f2\u6e05\u6d17\u6570\u636e\u548c\u957f\u671f\u76ee\u6807\uff0c\u4f5c\u4e3a\u540e\u7eed AI \u8ba1\u5212\u7684\u4e8b\u5b9e\u6765\u6e90\u3002",
    },
    {
      id: "curriculum-reference",
      title: "\u516c\u5f00\u8bfe\u7a0b\u53c2\u8003",
      status: "active",
      description: "\u6309\u5e74\u9f84\u3001\u5e74\u7ea7\u3001\u5b66\u6821\u73af\u5883\u548c\u516c\u5f00\u6837\u9898\u98ce\u683c\u5efa\u7acb\u96be\u5ea6\u9636\u68af\uff0c\u907f\u514d\u53ea\u56f4\u7ed5\u8fd1\u671f\u9519\u9898\u8865\u6d1e\u3002",
    },
    {
      id: "ai-task-orchestration",
      title: "AI \u4efb\u52a1\u4e0b\u53d1",
      status: "platform-reuse",
      description: "\u590d\u7528 Hermes Mobile \u770b\u677f\u3001\u4e3b\u9898\u3001\u804a\u5929\u3001\u6587\u4ef6\u548c Web Push\uff0c\u628a\u65b9\u6848\u8f6c\u6210\u53ef\u6267\u884c\u5b66\u4e60\u4efb\u52a1\u3002",
    },
    {
      id: "guided-interaction",
      title: "\u4e92\u52a8\u8f85\u5bfc\u95ed\u73af",
      status: "active",
      description: "\u9605\u8bfb\u3001\u5199\u4f5c\u3001\u53e3\u8bed\u3001\u542c\u529b\u3001\u8bcd\u6c47\u3001\u8bed\u6cd5\u548c\u9879\u76ee\u5361\u7247\u90fd\u8fdb\u5165\u63d0\u793a\u3001\u4f5c\u7b54\u3001\u8ffd\u95ee\u3001\u590d\u76d8\u3001\u53d8\u5f0f\u548c\u4fee\u590d\u6d41\u7a0b\u3002",
    },
    {
      id: "ai-reliability-guard",
      title: "AI \u53ef\u9760\u6027\u62a4\u680f",
      status: "guardrail",
      description: "\u628a\u6765\u6e90\u4f9d\u636e\u3001\u7ed3\u6784\u5316\u6821\u9a8c\u3001\u7f6e\u4fe1\u5ea6\u3001\u5f02\u5e38\u62e6\u622a\u548c\u5bb6\u957f\u5ba1\u6838\u4f5c\u4e3a\u5b66\u4e60\u95ed\u73af\u7684\u4e00\u7b49\u5de5\u7a0b\u8fb9\u754c\u3002",
    },
    {
      id: "coin-incentive",
      title: "\u91d1\u5e01\u6fc0\u52b1",
      status: metrics.availableCoins > 0 || metrics.earnedCoins > 0 ? "active" : "ready",
      description: "\u91d1\u5e01\u3001\u6210\u957f\u6863\u6848\u3001\u5151\u6362\u7533\u8bf7\u548c\u5bb6\u957f\u786e\u8ba4\u6536\u655b\u5728\u6210\u957f\u7cfb\u7edf\u5185\uff0c\u4e0d\u518d\u4f5c\u4e3a\u901a\u7528\u5de5\u4f5c\u53f0\u6a21\u5757\u6269\u6563\u3002",
    },
    {
      id: "parent-review",
      title: "\u5bb6\u957f\u5ba1\u6838\u4e0e\u7ed3\u7b97",
      status: "planned",
      description: "\u540e\u7eed\u8865\u5ba1\u6279\u3001\u5b8c\u6210\u3001\u62d2\u7edd\u3001\u5ba1\u8ba1\u3001\u64a4\u9500\u548c\u771f\u5b9e\u7ed3\u7b97\u6269\u5c55\u70b9\u3002",
    },
  ];
}
function learningGrowthPlatformCapabilities() {
  return [
    { id: "chat", title: "\u804a\u5929\u4e0e\u4e3b\u9898", owner: "Hermes Mobile Platform" },
    { id: "kanban", title: "\u770b\u677f\u4efb\u52a1", owner: "Hermes Mobile Platform" },
    { id: "files", title: "\u76ee\u5f55\u4e0e\u4ea4\u4ed8\u6587\u4ef6", owner: "Hermes Mobile Platform" },
    { id: "push", title: "Web Push \u63d0\u9192", owner: "Hermes Mobile Platform" },
    { id: "gateway", title: "Hermes Gateway \u6267\u884c", owner: "Hermes Mobile Platform" },
    { id: "skills", title: "\u5b66\u4e60\u6a21\u677f Skills", owner: "Learning Growth Domain" },
  ];
}
function learningGrowthReliabilitySummary() {
  return {
    phase: "phase-1-parent-audit",
    guardLevel: "ai-draft-system-verify-parent-audit",
    gates: [
      "source_basis",
      "schema_validation",
      "evaluation_verification",
      "parent_review",
    ],
    reviewTriggers: [
      "low_confidence",
      "missing_source_basis",
      "new_task_type_or_difficulty",
      "large_reward_or_redemption",
      "repeated_unrepaired_weakness",
      "child_distress_or_too_hard_feedback",
    ],
  };
}

function executableTaskKey(task = {}) {
  return cleanString(task.taskCardId || task.todoId || task.kanbanCardId);
}

function mergeExecutableTasks(primary = [], secondary = []) {
  const seen = new Set();
  const out = [];
  for (const task of arrayValue(primary).concat(arrayValue(secondary))) {
    const key = executableTaskKey(task);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}

function buildLearningGrowthOverview(input = {}, deps = {}) {
  const request = normalizeLearningGrowthRequest(input);
  const viewerRole = normalizeViewerRole(input);
  const learningCoinService = deps.learningCoinService || null;
  const learningProgramService = deps.learningProgramService || null;
  const readinessService = deps.readinessService || createLearningV1ReadinessService();
  const coins = learningCoinService && typeof learningCoinService.summary === "function"
    ? learningCoinService.summary({
        workspaceId: request.workspaceId,
        studentId: request.learnerId,
        limit: request.limit,
      })
    : null;
  const programOverview = learningProgramService && typeof learningProgramService.overview === "function"
    ? learningProgramService.overview({
        workspaceId: request.workspaceId,
        learnerId: request.learnerId,
        studentId: request.learnerId,
        limit: request.limit,
      })
    : null;
  const nativeExecutableTasks = arrayValue(programOverview?.executableTasks);
  const executableTasks = mergeExecutableTasks(nativeExecutableTasks, input.executableTasks);
  const metrics = coinMetric(coins || {});
  const launchOperations = programOverview
    ? buildLearningLaunchOperations({ programs: programOverview, coins, metrics })
    : null;
  const programs = programOverview && typeof programOverview === "object"
    ? Object.assign({}, programOverview, {
        executableTasks,
        counts: Object.assign({}, programOverview.counts || {}, { executableTasks: executableTasks.length }),
        launchOperations,
      })
    : (executableTasks.length ? {
        counts: { executableTasks: executableTasks.length },
        executableTasks,
        launchOperations,
      } : programOverview);
  const operationalReadiness = readinessService.evaluate({
    programs,
    coins,
    metrics,
    learnerId: request.learnerId,
    workspaceId: request.workspaceId,
    viewerRole,
  });
  const overview = {
    viewerRole,
    module: {
      id: LEARNING_GROWTH_MODULE_ID,
      title: "\u51e1\u51e1\u6210\u957f\u7cfb\u7edf",
      hostView: "learning",
      currentEntry: "\u6210\u957f\u6807\u7b7e",
      standaloneReady: true,
      architecture: "same-repo-same-deploy-independent-product-entry",
    },
    learner: {
      id: request.learnerId,
      studentId: request.learnerId,
      workspaceId: request.workspaceId,
      displayName: request.learnerName,
    },
    metrics,
    capabilities: learningGrowthCapabilityMap(metrics),
    platformCapabilities: learningGrowthPlatformCapabilities(),
    reliability: learningGrowthReliabilitySummary(),
    operationalReadiness,
    launchOperations,
    programs,
    coins,
    nextModules: [
      { id: "learning-profile", title: "\u5b66\u4e60\u6863\u6848\u4e0e\u76ee\u6807\u5f55\u5165", status: "next" },
      { id: "learning-plan-generator", title: "AI \u5b66\u4e60\u65b9\u6848\u751f\u6210", status: "next" },
      { id: "ai-reliability-guard-service", title: "AI \u53ef\u9760\u6027\u4e0e\u5bb6\u957f\u5ba1\u6838\u62a4\u680f", status: "next" },
      { id: "learning-interaction-templates", title: "\u82f1\u8bed/AMC8/Python \u4e92\u52a8\u6a21\u677f", status: "next" },
      { id: "coin-parent-admin", title: "\u91d1\u5e01\u5151\u6362\u5bb6\u957f\u540e\u53f0", status: "next" },
    ],
  };
  return viewerRole === "owner" ? overview : projectGrowthOverviewForExecutor(overview);
}

function createLearningGrowthService(options = {}) {
  const learningCoinService = options.learningCoinService || null;
  const learningProgramService = options.learningProgramService || null;
  const readinessService = options.readinessService || createLearningV1ReadinessService();
  return {
    overview(input = {}) {
      return buildLearningGrowthOverview(input, { learningCoinService, learningProgramService, readinessService });
    },
  };
}

module.exports = {
  LEARNING_GROWTH_MODULE_ID,
  buildLearningGrowthOverview,
  createLearningGrowthService,
  learningGrowthReliabilitySummary,
  normalizeLearningGrowthRequest,
  normalizeViewerRole,
  projectGrowthOverviewForExecutor,
  projectProgramOverviewForExecutor,
};
