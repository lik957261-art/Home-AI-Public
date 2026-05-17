"use strict";

const crypto = require("node:crypto");
const { createLearningGoalService } = require("./learning-goal-service");
const { createLearningSourceService } = require("./learning-source-service");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function stableId(prefix, parts) {
  const digest = crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function normalizedScope(input = {}) {
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId || input.performerWorkspaceId) || workspaceId;
  return { workspaceId, learnerId };
}

function normalizeCurriculumReference(input = {}) {
  const domain = cleanString(input.domain || input.subject) || "english";
  const title = cleanString(input.title || input.name) || "Curriculum reference";
  return {
    referenceId: cleanString(input.referenceId || input.id) || stableId("lcref", [domain, title, input.stage || ""]),
    domain,
    title,
    stage: cleanString(input.stage || input.level),
    summary: compactLearningSummary(input.summary || input.description || title, 900),
    focusAreas: uniqueStrings(input.focusAreas || input.focus_areas || input.skills).slice(0, 40),
    tags: uniqueStrings(input.tags || input.labels).slice(0, 40),
    sourceType: cleanString(input.sourceType || input.type) || "public_reference",
    copyrightPolicy: cleanString(input.copyrightPolicy || input.copyright_policy) || "reference_only_no_copied_questions",
  };
}

function normalizeSkillState(input = {}, scope = {}) {
  const skillId = cleanString(input.skillId || input.skill || input.id);
  if (!skillId) return null;
  const confidence = Number(input.confidence);
  return {
    skillStateId: cleanString(input.skillStateId || input.id) || `${scope.learnerId}:${skillId}`,
    learnerId: scope.learnerId,
    workspaceId: scope.workspaceId,
    skillId,
    domain: cleanString(input.domain || input.subject) || (skillId.startsWith("english_") ? "english" : "general"),
    level: cleanString(input.level || input.status) || "baseline",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.65,
    lastEvidenceRef: cleanString(input.lastEvidenceRef || input.evidenceRef),
    sourceBasisRefs: uniqueStrings(input.sourceBasisRefs || input.source_basis_refs).slice(0, 40),
  };
}

function normalizeProfile(input = {}, scope = {}) {
  const displayName = cleanString(input.displayName || input.learnerName) || (scope.learnerId === "weixin_stephen" ? "Fanfan" : scope.learnerId);
  return {
    profileId: cleanString(input.profileId || input.id) || `profile:${scope.learnerId}`,
    learnerId: scope.learnerId,
    workspaceId: scope.workspaceId,
    displayName,
    profileSummary: compactLearningSummary(input.profileSummary || input.summary || "", 900),
    strengths: uniqueStrings(input.strengths).slice(0, 30),
    weaknesses: uniqueStrings(input.weaknesses || input.growthAreas).slice(0, 30),
    priorities: asArray(input.priorities).slice(0, 20).map((item) => {
      if (item && typeof item === "object") {
        return {
          title: compactLearningSummary(item.title || item.summary || "", 160),
          domain: cleanString(item.domain || item.subject),
          focusAreas: uniqueStrings(item.focusAreas || item.skills).slice(0, 12),
          priority: Number(item.priority || 0),
        };
      }
      return { title: compactLearningSummary(item, 160), domain: "", focusAreas: [], priority: 0 };
    }).filter((item) => item.title),
    skillStateSummary: asArray(input.skillStateSummary || input.skillStates).slice(0, 60).map((item) => {
      const state = normalizeSkillState(item, scope);
      return state ? {
        skillId: state.skillId,
        domain: state.domain,
        level: state.level,
        confidence: state.confidence,
      } : null;
    }).filter(Boolean),
    sourceBasisRefs: uniqueStrings(input.sourceBasisRefs || input.source_basis_refs).slice(0, 80),
  };
}

function createLearningFoundationImportService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertSource !== "function") {
    throw new Error("learning foundation import service requires repository");
  }
  const sourceService = options.sourceService || createLearningSourceService({ repository });
  const goalService = options.goalService || createLearningGoalService({ repository });

  function importFoundation(input = {}) {
    assertNoPrivateLearningPayload(input, "learning foundation import");
    const scope = normalizedScope(input);
    const dryRun = Boolean(input.dryRun);
    const counts = { sources: 0, goals: 0, curriculumReferences: 0, profiles: 0, skillStates: 0 };
    const imported = { sources: [], goals: [], curriculumReferences: [], profile: null, skillStates: [] };

    for (const rawSource of asArray(input.sources)) {
      const source = sourceService.normalize(Object.assign({}, rawSource, scope));
      source.sourceId = cleanString(rawSource.sourceId || rawSource.id) || stableId("lsource", [scope, source.sourceType, source.title, source.sourceDate, source.summary]);
      if (!dryRun) imported.sources.push(sourceService.save(source));
      counts.sources += 1;
    }

    for (const rawGoal of asArray(input.goals)) {
      const goal = goalService.normalize(Object.assign({}, rawGoal, scope));
      goal.goalId = cleanString(rawGoal.goalId || rawGoal.id) || stableId("lgoal", [scope, goal.domain, goal.title, goal.targetSummary, goal.startDate]);
      if (!dryRun) imported.goals.push(goalService.save(goal));
      counts.goals += 1;
    }

    for (const rawRef of asArray(input.curriculumReferences || input.curriculum || input.references)) {
      const reference = normalizeCurriculumReference(rawRef);
      if (!dryRun) imported.curriculumReferences.push(repository.upsertCurriculumReference(reference));
      counts.curriculumReferences += 1;
    }

    if (input.profile && typeof input.profile === "object") {
      const profile = normalizeProfile(input.profile, scope);
      if (!dryRun) imported.profile = repository.upsertLearnerProfile(profile);
      counts.profiles = 1;
    }

    const profileSkillStates = input.profile && typeof input.profile === "object" ? asArray(input.profile.skillStates) : [];
    for (const rawState of asArray(input.skillStates).concat(profileSkillStates)) {
      const state = normalizeSkillState(rawState, scope);
      if (!state) continue;
      if (!dryRun) imported.skillStates.push(repository.upsertSkillState(state));
      counts.skillStates += 1;
    }

    return {
      ok: true,
      dryRun,
      workspaceId: scope.workspaceId,
      learnerId: scope.learnerId,
      counts,
      imported,
    };
  }

  return {
    importFoundation,
    normalizeCurriculumReference,
    normalizeProfile,
    normalizeSkillState,
  };
}

module.exports = {
  createLearningFoundationImportService,
  normalizeCurriculumReference,
  normalizeProfile,
  normalizeSkillState,
};
