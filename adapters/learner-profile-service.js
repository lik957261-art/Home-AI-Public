"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRequest(input = {}) {
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
  return {
    workspaceId,
    learnerId,
    displayName: cleanString(input.displayName || input.learnerName) || (learnerId === "weixin_stephen" ? "Fanfan" : learnerId),
  };
}

function collectFocusCounts(items = []) {
  const counts = new Map();
  for (const item of items) {
    for (const focus of asArray(item.focusAreas)) {
      const key = cleanString(focus);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function buildSkillStates({ request, focusCounts, sourceRefs, goals }) {
  const goalDomains = new Map();
  for (const goal of goals) {
    for (const focus of asArray(goal.focusAreas)) {
      goalDomains.set(focus, goal.domain || "english");
    }
  }
  return [...focusCounts.entries()].map(([skillId, count]) => ({
    learnerId: request.learnerId,
    workspaceId: request.workspaceId,
    skillId,
    domain: goalDomains.get(skillId) || (skillId.startsWith("english_") ? "english" : "general"),
    level: count >= 3 ? "tracked" : "baseline",
    confidence: Math.min(0.95, 0.45 + count * 0.1 + Math.min(sourceRefs.length, 5) * 0.04),
    lastEvidenceRef: sourceRefs[0] || "",
    sourceBasisRefs: sourceRefs.slice(0, 20),
  }));
}

function createLearnerProfileService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertLearnerProfile !== "function") {
    throw new Error("learner profile service requires repository");
  }

  function get(input = {}) {
    const request = normalizeRequest(input);
    const profile = repository.getLearnerProfile(request.learnerId);
    return {
      profile,
      skillStates: repository.listSkillStates({ learnerId: request.learnerId, limit: 100 }),
    };
  }

  function rebuild(input = {}) {
    const request = normalizeRequest(input);
    const sources = repository.listSources({ learnerId: request.learnerId, workspaceId: request.workspaceId, limit: 120 });
    const goals = repository.listGoals({ learnerId: request.learnerId, workspaceId: request.workspaceId, limit: 80 });
    const programs = repository.listPrograms({ learnerId: request.learnerId, workspaceId: request.workspaceId, limit: 80 });
    const sourceRefs = sources.map((source) => source.sourceRef).filter(Boolean);
    const goalRefs = goals.map((goal) => goal.goalRef).filter(Boolean);
    const focusCounts = collectFocusCounts(goals.concat(programs));
    const priorities = goals.slice(0, 8).map((goal) => ({
      goalId: goal.goalId,
      title: goal.title,
      domain: goal.domain,
      priority: goal.priority,
      focusAreas: goal.focusAreas,
    }));
    const skillStates = buildSkillStates({ request, focusCounts, sourceRefs, goals })
      .map((state) => repository.upsertSkillState(state));
    const profileSummary = [
      `sources=${sources.length}`,
      `activeGoals=${goals.filter((goal) => goal.status === "active").length}`,
      `programs=${programs.length}`,
      `trackedSkills=${skillStates.length}`,
    ].join("; ");
    const profile = repository.upsertLearnerProfile({
      learnerId: request.learnerId,
      workspaceId: request.workspaceId,
      displayName: request.displayName,
      profileSummary,
      strengths: skillStates.filter((state) => state.confidence >= 0.75).slice(0, 8).map((state) => state.skillId),
      weaknesses: skillStates.filter((state) => state.confidence < 0.65).slice(0, 8).map((state) => state.skillId),
      priorities,
      skillStateSummary: skillStates.slice(0, 30).map((state) => ({
        skillId: state.skillId,
        domain: state.domain,
        level: state.level,
        confidence: state.confidence,
      })),
      sourceBasisRefs: sourceRefs.concat(goalRefs).slice(0, 60),
    });
    return { profile, skillStates };
  }

  return {
    get,
    rebuild,
  };
}

module.exports = {
  createLearnerProfileService,
  normalizeRequest,
};
