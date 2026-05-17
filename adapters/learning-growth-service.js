"use strict";

const { createLearningV1ReadinessService } = require("./learning-v1-readiness-service");

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
    || (learnerId === "weixin_stephen" ? "凡凡" : learnerId);
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
    "learnerId",
    "workspaceId",
    "title",
    "status",
    "taskCardType",
    "domain",
    "plannedDate",
    "plannedMinutes",
    "skillIds",
    "createdAt",
    "updatedAt",
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
    counts: copyFields(programs.counts, ["programs", "taskCards", "evaluations", "skillStates"]),
    programs: arrayValue(programs.programs).map(projectProgramForExecutor),
    dailyPlan: programs.dailyPlan || null,
    taskCards: arrayValue(programs.taskCards).map(projectTaskCardForExecutor),
    interactionSessions: arrayValue(programs.interactionSessions).map(projectInteractionSessionForExecutor),
    evaluations: arrayValue(programs.evaluations).map(projectEvaluationForExecutor),
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
      title: "目标与学习数据",
      status: "foundation",
      description: "沉淀学校、私教、历史清洗数据和长期目标，作为后续 AI 计划的事实来源。",
    },
    {
      id: "curriculum-reference",
      title: "公开课程参考",
      status: "planned",
      description: "按年龄、年级、学校环境和公开样题风格建立难度阶梯，避免只围绕近期错题补洞。",
    },
    {
      id: "ai-task-orchestration",
      title: "AI 任务下发",
      status: "platform-reuse",
      description: "复用 Hermes Mobile 看板、主题、聊天、文件和 Web Push，把方案转成可执行学习任务。",
    },
    {
      id: "guided-interaction",
      title: "互动辅导闭环",
      status: "active",
      description: "阅读、AMC8、Python 等卡片进入提示、作答、追问、复盘、变式和修复流程。",
    },
    {
      id: "ai-reliability-guard",
      title: "AI 可靠性护栏",
      status: "guardrail",
      description: "把来源依据、结构化校验、置信度、异常拦截和家长审核作为学习闭环的一等工程边界。",
    },
    {
      id: "coin-incentive",
      title: "金币激励",
      status: metrics.availableCoins > 0 || metrics.earnedCoins > 0 ? "active" : "ready",
      description: "金币、成长档案、兑换申请和家长确认收敛在成长系统内，不再作为通用工作台模块扩散。",
    },
    {
      id: "parent-review",
      title: "家长审核与结算",
      status: "planned",
      description: "后续补审批、完成、拒绝、审计、撤销和真实结算扩展点。",
    },
  ];
}

function learningGrowthPlatformCapabilities() {
  return [
    { id: "chat", title: "聊天与主题", owner: "Hermes Mobile Platform" },
    { id: "kanban", title: "看板任务", owner: "Hermes Mobile Platform" },
    { id: "files", title: "目录与交付文件", owner: "Hermes Mobile Platform" },
    { id: "push", title: "Web Push 提醒", owner: "Hermes Mobile Platform" },
    { id: "gateway", title: "Hermes Gateway 执行", owner: "Hermes Mobile Platform" },
    { id: "skills", title: "学习模板 Skills", owner: "Learning Growth Domain" },
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
  const programs = learningProgramService && typeof learningProgramService.overview === "function"
    ? learningProgramService.overview({
        workspaceId: request.workspaceId,
        learnerId: request.learnerId,
        studentId: request.learnerId,
        limit: request.limit,
      })
    : null;
  const metrics = coinMetric(coins || {});
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
      title: "凡凡成长系统",
      hostView: "learning",
      currentEntry: "成长标签",
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
    programs,
    coins,
    nextModules: [
      { id: "learning-profile", title: "学习档案与目标录入", status: "next" },
      { id: "learning-plan-generator", title: "AI 学习方案生成", status: "next" },
      { id: "ai-reliability-guard-service", title: "AI 可靠性与家长审核护栏", status: "next" },
      { id: "learning-interaction-templates", title: "阅读/AMC8/Python 互动模板", status: "next" },
      { id: "coin-parent-admin", title: "金币兑换家长后台", status: "next" },
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
