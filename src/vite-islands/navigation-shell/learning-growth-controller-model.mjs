"use strict";

export const LEARNING_GROWTH_CONTROLLER_MODEL_VERSION = "20260705-learning-growth-controller-model-v1";

function cleanToken(value) {
  return String(value || "").trim();
}

function cleanList(values) {
  return Array.isArray(values) ? values.map(cleanToken).filter(Boolean) : [];
}

export function learningGrowthLearnerWorkspaceIdPlan({
  selectedWorkspaceId = "",
  authWorkspaceId = "",
  listedWorkspaceIds = [],
  accessibleWorkspaceIds = [],
  isOwner = false,
  scopedWorkspaceId = "",
  defaultLearnerWorkspaceId = "",
} = {}) {
  const selected = cleanToken(selectedWorkspaceId);
  const authWorkspace = cleanToken(authWorkspaceId);
  const listed = cleanList(listedWorkspaceIds);
  const accessible = cleanList(accessibleWorkspaceIds);
  const allowed = accessible.length ? accessible : (authWorkspace ? [authWorkspace] : []);
  const scoped = cleanToken(scopedWorkspaceId);
  const defaultLearner = cleanToken(defaultLearnerWorkspaceId);
  if (!isOwner) {
    if (selected && (allowed.includes(selected) || listed.includes(selected))) return selected;
    return authWorkspace || selected;
  }
  if (scoped && (!selected || selected === "owner")) return scoped;
  if (!selected || selected === "owner") return listed.includes(defaultLearner) ? defaultLearner : "";
  return selected || authWorkspace || defaultLearner;
}

export function learningGrowthScopeKeyPlan({ workspaceId = "", learnerId = "" } = {}) {
  return `${cleanToken(workspaceId)}:${cleanToken(learnerId)}`;
}

export function learningCoinRequestParamsPlan({ workspaceId = "", studentId = "", limit = 30 } = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", cleanToken(workspaceId));
  params.set("studentId", cleanToken(studentId));
  params.set("limit", String(limit || 30));
  return params;
}

export function learningGrowthMasteryRequestParamsPlan({ workspaceId = "", learnerId = "", limit = 80 } = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", cleanToken(workspaceId));
  params.set("learnerId", cleanToken(learnerId));
  params.set("limit", String(limit || 80));
  return params;
}

export function resetLearningGrowthStatePatchPlan(scopeKey = "") {
  return {
    learningGrowth: null,
    learningGrowthBoardLane: "",
    selectedLearningTaskCardId: "",
    learningGrowthSettingsTaskId: "",
    learningGrowthHistoryTaskCardId: "",
    learningGrowthTeachingStepByCardId: {},
    learningGrowthTeachingDrafts: {},
    learningGrowthExperienceSignalBusy: {},
    learningGrowthExperienceSignalSubmitted: {},
    learningGrowthTeachingCheckBusy: {},
    learningGrowthStageAssessmentActivating: {},
    learningGrowthSettingsOpen: false,
    learningCoins: null,
    learningCoinsError: "",
    learningGrowthMasteryProfile: null,
    learningGrowthMasteryError: "",
    learningGrowthMasteryLoading: false,
    learningParentReport: null,
    learningParentReportError: "",
    learningParentReportLoading: false,
    learningCoinScopeKey: cleanToken(scopeKey),
  };
}

export function learningInputListPlan(value = "") {
  return String(value || "").split(/\r?\n|[,;]+/).map((item) => item.trim()).filter(Boolean);
}

export function learningSplitLinesPlan(value = "") {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function learningCsvListPlan(value = "") {
  return String(value || "").split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
}

export function learningLearnerBodyPlan({ workspaceId = "", learnerId = "", learnerName = "" } = {}) {
  return {
    workspaceId: cleanToken(workspaceId),
    learnerId: cleanToken(learnerId),
    learnerName: cleanToken(learnerName),
  };
}

export function learningProgramFormBodyPlan(input = {}, scope = {}) {
  return {
    workspaceId: cleanToken(scope.workspaceId),
    learnerId: cleanToken(scope.learnerId),
    learnerName: cleanToken(scope.learnerName),
    title: cleanToken(input.title),
    domain: cleanToken(input.domain) || "english",
    focusAreas: cleanList(input.focusAreas),
    goalSummary: cleanToken(input.goalSummary),
    requirements: cleanToken(input.requirements || input.goalSummary),
    startDate: cleanToken(input.startDate),
    durationDays: Number(input.durationDays || 28),
    daysPerWeek: Number(input.daysPerWeek || 5),
    minutesPerDay: Number(input.minutesPerDay || 30),
    timeOfDay: cleanToken(input.timeOfDay) || "19:30",
    sourceBasisRefs: cleanList(input.sourceBasisRefs),
  };
}

export function learningFoundationImportBodyPlan(input = {}, scope = {}) {
  const base = learningLearnerBodyPlan(scope);
  const sources = learningSplitLinesPlan(input.sourcesText).map((line) => {
    const parts = line.split("|").map((value) => value.trim());
    return Object.assign({}, base, {
      sourceType: parts[0] || "manual_note",
      title: parts[1] || parts[0] || "",
      summary: parts[2] || parts[1] || parts[0] || "",
      tags: learningCsvListPlan(parts[3] || ""),
      confidence: 0.7,
    });
  });
  const goals = learningSplitLinesPlan(input.goalsText).map((line) => {
    const parts = line.split("|").map((value) => value.trim());
    return Object.assign({}, base, {
      domain: parts[0] || "english",
      title: parts[1] || parts[0] || "",
      targetSummary: parts[2] || parts[1] || parts[0] || "",
      focusAreas: learningCsvListPlan(parts[3] || ""),
      priority: 80,
    });
  });
  const profileSummary = cleanToken(input.profileSummary);
  return Object.assign({}, base, {
    sources,
    goals,
    profile: profileSummary ? { profileSummary, displayName: cleanToken(scope.learnerName) || base.learnerId } : null,
  });
}

export function learningSourceFormBodyPlan(input = {}, scope = {}) {
  return Object.assign(learningLearnerBodyPlan(scope), {
    sourceType: cleanToken(input.sourceType) || "manual_note",
    title: cleanToken(input.title),
    summary: cleanToken(input.summary),
    tags: cleanList(input.tags),
    confidence: 0.75,
  });
}

export function learningGoalFormBodyPlan(input = {}, scope = {}) {
  return Object.assign(learningLearnerBodyPlan(scope), {
    title: cleanToken(input.title),
    targetSummary: cleanToken(input.targetSummary),
    domain: cleanToken(input.domain) || "english",
    priority: Number(input.priority || 80),
    targetDate: cleanToken(input.targetDate),
    focusAreas: cleanList(input.focusAreas),
  });
}

export function learningRewardFormBodyPlan(input = {}) {
  const rmbValue = input.rmbValue;
  return {
    title: cleanToken(input.title),
    coinCost: Number(input.coinCost || 0),
    description: cleanToken(input.description),
    rmbCents: rmbValue === "" || rmbValue == null ? null : Math.round(Number(rmbValue) * 100),
  };
}
