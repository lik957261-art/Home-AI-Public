"use strict";

const {
  TAXONOMY_VERSION,
  createLearningGrowthCapabilityTaxonomyService,
} = require("./learning-growth-capability-taxonomy-service");

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compactUnique(values, limit = 12) {
  return [...new Set(asArray(values).map((item) => cleanString(item, 160)).filter(Boolean))].slice(0, limit);
}

function scoreSignal(score) {
  if (score >= 85) return "strength";
  if (score < 70) return "weakness";
  return "stability";
}

function statusFromCounts({ positive, negative, confidence, existingStatus }) {
  if (negative >= 2 && negative >= positive) return "needs_repair";
  if (positive >= 2 && confidence >= 0.76) return "mastered";
  if (positive || negative) return "practicing";
  return cleanString(existingStatus) || "observed";
}

function stabilityFromCounts({ success, failure }) {
  if (success > 0 && failure > 0) return "inconsistent";
  if (success >= 2) return "stable";
  if (failure >= 2) return "fragile";
  return "emerging";
}

function taskSkillCandidates(taskCard = {}) {
  return compactUnique([
    ...asArray(taskCard.skillIds),
    taskCard.skillId,
    taskCard.taskModel?.skillId,
    taskCard.taskModel?.primarySkillId,
    ...asArray(taskCard.taskModel?.skillIds),
  ], 8);
}

function templateSkillCandidates(taskCard = {}) {
  const templateId = cleanString(taskCard.templateId || taskCard.taskModel?.templateId).toLowerCase();
  if (/short-writing|writing/.test(templateId)) return ["english_short_writing", "english_grammar_in_expression"];
  if (/retell|speaking/.test(templateId)) return ["english_speaking_retell", "english_transition_cohesion"];
  if (/reading/.test(templateId)) return ["english_reading"];
  if (/science/.test(templateId)) return ["science_explanation"];
  if (/python|programming|computer/.test(templateId)) return ["python_debugging"];
  return [];
}

function summaryEvidenceText(evaluation = {}, reflection = {}) {
  return cleanString([
    evaluation.summary,
    asArray(evaluation.remainingWeaknesses).slice(0, 3).join("; "),
    asArray(evaluation.revisionRequirements).slice(0, 3).join("; "),
    reflection.summary,
  ].filter(Boolean).join(" "), 360);
}

function createLearningGrowthMasteryProfileService(options = {}) {
  const repository = options.repository;
  if (!repository || typeof repository.upsertMasteryState !== "function") {
    throw new Error("learning growth mastery profile service requires repository");
  }
  const taxonomy = options.capabilityTaxonomyService
    || options.taxonomyService
    || createLearningGrowthCapabilityTaxonomyService();
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

  function normalizeSkillCandidates(taskCard = {}) {
    return compactUnique(taskSkillCandidates(taskCard).concat(templateSkillCandidates(taskCard)), 10)
      .map((skillId) => taxonomy.normalizeSkillId(skillId))
      .filter(Boolean);
  }

  function evidenceItemsFromTask({ learnerId, workspaceId, taskCard = {}, evaluation = {}, reflection = {} }) {
    const normalizedLearnerId = cleanString(learnerId || taskCard.learnerId || taskCard.studentId || taskCard.workspaceId);
    const normalizedWorkspaceId = cleanString(workspaceId || taskCard.workspaceId);
    const skillIds = normalizeSkillCandidates(taskCard);
    const score = numberValue(evaluation.score, 0);
    const signal = scoreSignal(score);
    const confidence = Math.max(0.35, Math.min(0.95, numberValue(evaluation.confidence, score >= 85 ? 0.82 : score < 70 ? 0.72 : 0.64)));
    const summary = summaryEvidenceText(evaluation, reflection) || `Growth task evidence, score ${score || 0}/100.`;
    const sourceRef = evaluation.evaluationId || evaluation.id
      ? `evaluation:${cleanString(evaluation.evaluationId || evaluation.id)}`
      : `task:${cleanString(taskCard.taskCardId || taskCard.id)}`;
    return skillIds.map((skillId) => {
      const node = taxonomy.assertKnownSkill(skillId);
      return {
        evidenceId: `${sourceRef}:${skillId}`,
        sourceRef,
        taskCardId: cleanString(taskCard.taskCardId || taskCard.id),
        sequenceGroupId: cleanString(taskCard.sequenceGroupId || taskCard.programId || taskCard.draftId),
        taxonomyVersion: TAXONOMY_VERSION,
        learnerId: normalizedLearnerId,
        workspaceId: normalizedWorkspaceId,
        domain: node.domain,
        strand: node.strand,
        skillId: node.skillId,
        parentSkillId: node.parentSkillId,
        nodeLevel: node.nodeLevel,
        signal,
        confidence,
        score,
        difficultyBand: cleanString(taskCard.difficultyBand || taskCard.taskModel?.difficultyBand || evaluation.difficultyBand),
        supportLevel: cleanString(evaluation.supportLevel || taskCard.taskModel?.supportLevel),
        transferLevel: cleanString(evaluation.transferLevel || taskCard.taskModel?.transferLevel),
        summary,
        strengths: signal === "strength" ? compactUnique([node.displayName, ...asArray(evaluation.strengths)], 4) : [],
        weaknesses: signal === "weakness" ? compactUnique([node.displayName, ...asArray(evaluation.remainingWeaknesses), ...asArray(evaluation.revisionRequirements)], 5) : compactUnique(asArray(evaluation.remainingWeaknesses).slice(0, 2), 2),
        sourceBasisRefs: compactUnique([sourceRef, ...asArray(taskCard.sourceBasisRefs)], 12),
        createdAt: nowIso(),
      };
    });
  }

  function mergeEvidenceSummary(existing = [], item = {}) {
    return [{
      evidenceId: cleanString(item.evidenceId),
      sourceRef: cleanString(item.sourceRef),
      taskCardId: cleanString(item.taskCardId),
      signal: cleanString(item.signal),
      confidence: numberValue(item.confidence),
      score: numberValue(item.score),
      summary: cleanString(item.summary, 360),
      createdAt: cleanString(item.createdAt) || nowIso(),
    }].concat(asArray(existing)).slice(0, 12);
  }

  function updateSkillStatesFromEvidence({ learnerId, workspaceId, evidenceItems = [] } = {}) {
    const changes = [];
    for (const item of asArray(evidenceItems)) {
      const node = taxonomy.assertKnownSkill(item.skillId);
      const existing = repository.getMasteryState({
        learnerId: cleanString(item.learnerId || learnerId),
        workspaceId: cleanString(item.workspaceId || workspaceId),
        taxonomyVersion: TAXONOMY_VERSION,
        domain: node.domain,
        strand: node.strand,
        skillId: node.skillId,
        microSkillId: cleanString(item.microSkillId),
      }) || {};
      const positive = numberValue(existing.positiveEvidenceCount) + (item.signal === "strength" || item.signal === "stability" ? 1 : 0);
      const negative = numberValue(existing.negativeEvidenceCount) + (item.signal === "weakness" || item.signal === "regression" ? 1 : 0);
      const success = numberValue(existing.recentSuccessCount) + (item.signal === "strength" || item.score >= 80 ? 1 : 0);
      const failure = numberValue(existing.recentFailureCount) + (item.signal === "weakness" || item.score < 70 ? 1 : 0);
      const evidenceCount = numberValue(existing.evidenceCount) + 1;
      const confidence = Math.max(numberValue(existing.confidence), numberValue(item.confidence));
      const nextStatus = statusFromCounts({ positive, negative, confidence, existingStatus: existing.status });
      const saved = repository.upsertMasteryState({
        learnerId: cleanString(item.learnerId || learnerId),
        workspaceId: cleanString(item.workspaceId || workspaceId),
        taxonomyVersion: TAXONOMY_VERSION,
        domain: node.domain,
        strand: node.strand,
        skillId: node.skillId,
        microSkillId: cleanString(item.microSkillId),
        parentSkillId: node.parentSkillId,
        nodeLevel: node.nodeLevel,
        status: nextStatus,
        stability: stabilityFromCounts({ success, failure }),
        confidence,
        evidenceCount,
        positiveEvidenceCount: positive,
        negativeEvidenceCount: negative,
        recentSuccessCount: Math.min(5, success),
        recentFailureCount: Math.min(5, failure),
        difficultyBand: cleanString(item.difficultyBand || existing.difficultyBand),
        supportLevel: cleanString(item.supportLevel || existing.supportLevel),
        transferLevel: cleanString(item.transferLevel || existing.transferLevel),
        externalLevelReference: cleanString(existing.externalLevelReference || node.externalReferences?.[0]?.framework || ""),
        lastEvidenceRef: cleanString(item.sourceRef),
        sourceBasisRefs: compactUnique(asArray(existing.sourceBasisRefs).concat(asArray(item.sourceBasisRefs)), 20),
        strengths: compactUnique(asArray(item.strengths).concat(asArray(existing.strengths)), 10),
        weaknesses: compactUnique(asArray(item.weaknesses).concat(asArray(existing.weaknesses)), 10),
        evidenceSummary: mergeEvidenceSummary(existing.evidenceSummary, item),
        nextRecommendation: {
          strategy: nextStatus === "needs_repair" ? "repair" : nextStatus === "mastered" ? "stretch" : "stabilize",
          reason: cleanString(item.summary, 180),
        },
        updatedAt: nowIso(),
      });
      changes.push({
        skillId: saved.skillId,
        fromStatus: existing.status || "",
        toStatus: saved.status,
        confidence: saved.confidence,
        evidenceCount: saved.evidenceCount,
      });
    }
    return changes;
  }

  function recordTaskEvidence(input = {}) {
    const evidenceItems = evidenceItemsFromTask(input);
    const masteryChanges = updateSkillStatesFromEvidence({
      learnerId: input.learnerId,
      workspaceId: input.workspaceId,
      evidenceItems,
    });
    return { evidenceItems, masteryChanges };
  }

  function getMasteryProfile({ learnerId, workspaceId, domain = "" } = {}) {
    const states = repository.listMasteryStates({
      learnerId,
      workspaceId,
      domain,
      taxonomyVersion: TAXONOMY_VERSION,
      limit: 300,
    });
    return {
      taxonomyVersion: TAXONOMY_VERSION,
      learnerId: cleanString(learnerId),
      workspaceId: cleanString(workspaceId),
      domain: cleanString(domain),
      skillStates: states,
      strengths: states.filter((state) => ["mastered", "practicing"].includes(state.status) && state.positiveEvidenceCount > state.negativeEvidenceCount).slice(0, 12),
      weaknesses: states.filter((state) => state.status === "needs_repair" || state.negativeEvidenceCount > 0).slice(0, 12),
      updatedAt: nowIso(),
    };
  }

  function getMasteryProfileByStrand({ learnerId, workspaceId, domain, strand } = {}) {
    return repository.listMasteryStates({
      learnerId,
      workspaceId,
      domain,
      strand,
      taxonomyVersion: TAXONOMY_VERSION,
      limit: 120,
    });
  }

  function listWeaknesses({ learnerId, workspaceId, domain, limit = 8 } = {}) {
    return getMasteryProfile({ learnerId, workspaceId, domain }).weaknesses
      .sort((a, b) => (b.negativeEvidenceCount - a.negativeEvidenceCount) || (a.confidence - b.confidence))
      .slice(0, limit);
  }

  function listStrengths({ learnerId, workspaceId, domain, limit = 8 } = {}) {
    return getMasteryProfile({ learnerId, workspaceId, domain }).strengths
      .sort((a, b) => (b.positiveEvidenceCount - a.positiveEvidenceCount) || (b.confidence - a.confidence))
      .slice(0, limit);
  }

  function listTransferCandidates({ learnerId, workspaceId, domain, limit = 8 } = {}) {
    return repository.listMasteryStates({ learnerId, workspaceId, domain, taxonomyVersion: TAXONOMY_VERSION, status: "mastered", limit })
      .filter((state) => state.stability === "stable" || state.confidence >= 0.76);
  }

  function listReviewDueSkills({ learnerId, workspaceId, domain, nowMs = Date.now(), limit = 8 } = {}) {
    const beforeIso = new Date(Number(nowMs) - 14 * 24 * 60 * 60 * 1000).toISOString();
    return repository.listMasteryStatesDueForReview({ learnerId, workspaceId, domain, beforeIso, limit });
  }

  function projectForNextCard({ learnerId, workspaceId, sequenceGroupId, domain = "", recentLimit = 6 } = {}) {
    const profile = getMasteryProfile({ learnerId, workspaceId, domain });
    return {
      taxonomyVersion: TAXONOMY_VERSION,
      skillStates: profile.skillStates.slice(0, 40).map((state) => ({
        skillId: state.skillId,
        status: state.status,
        stability: state.stability,
        confidence: state.confidence,
        strengths: asArray(state.strengths).slice(0, 3),
        weaknesses: asArray(state.weaknesses).slice(0, 3),
        nextRecommendation: state.nextRecommendation || {},
      })),
      strengths: listStrengths({ learnerId, workspaceId, domain, limit: 6 }).map((state) => state.skillId),
      weaknesses: listWeaknesses({ learnerId, workspaceId, domain, limit: 6 }).map((state) => state.skillId),
      reviewDue: listReviewDueSkills({ learnerId, workspaceId, domain, limit: 6 }).map((state) => state.skillId),
      recentTrajectory: repository.listCardTrajectories({ learnerId, workspaceId, sequenceGroupId, limit: recentLimit }),
    };
  }

  return {
    evidenceItemsFromTask,
    getMasteryProfile,
    getMasteryProfileByStrand,
    listReviewDueSkills,
    listStrengths,
    listTransferCandidates,
    listWeaknesses,
    projectForNextCard,
    recordTaskEvidence,
    updateSkillStatesFromEvidence,
  };
}

module.exports = {
  createLearningGrowthMasteryProfileService,
};
