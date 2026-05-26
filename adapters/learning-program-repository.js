"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const {
  CARD_ROLES,
  defaultCompletionPolicyForRole,
  defaultDurationRangeForRole,
  defaultMasteryEvidenceWeightForRole,
  defaultRewardCoinsForRole,
  normalizeCardRole,
  withGrowthCardRoleDefaults,
} = require("./learning-growth-card-role-service");
const {
  withTeachingFlow,
} = require("./learning-growth-teaching-card-contract-service");

const CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION = 11;

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function stableJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function stableId(prefix, parts) {
  const digest = crypto.createHash("sha256").update(parts.map(cleanString).join("|")).digest("hex").slice(0, 18);
  return `${prefix}_${digest}`;
}

function stripPrivateLearningFields(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((item) => stripPrivateLearningFields(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const blocked = new Set([
    "answer",
    "answers",
    "answerText",
    "rawAnswer",
    "rawAnswers",
    "rawResponse",
    "learnerAnswer",
    "learnerAnswers",
    "learnerResponse",
    "childAnswer",
    "childResponse",
    "submissionText",
    "rawTranscript",
    "transcript",
    "fullTranscript",
    "audioTranscript",
    "recordingTranscript",
    "question",
    "questionText",
    "questions",
    "answerKey",
    "solution",
    "solutions",
    "prompt",
    "rawPrompt",
    "apiKey",
    "accessKey",
    "authorization",
    "cookie",
    "pushEndpoint",
    "endpoint",
    "filePath",
    "localPath",
    "mediaPath",
    "recordingPath",
    "attachmentPath",
  ]);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = stripPrivateLearningFields(item, depth + 1);
  }
  return out;
}

function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function publicProgramFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    programId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    title: row.title,
    domain: row.domain,
    focusAreas: parseJson(row.focus_areas_json, []),
    goalSummary: row.goal_summary,
    startDate: row.start_date,
    endDate: row.end_date,
    daysPerWeek: Number(row.days_per_week || 0),
    minutesPerDay: Number(row.minutes_per_day || 0),
    intensity: row.intensity,
    status: row.status,
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    curriculumRefs: parseJson(row.curriculum_refs_json, []),
    constraints: parseJson(row.constraints_json, {}),
    reviewPolicy: parseJson(row.review_policy_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  });
}

function publicDraftFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    draftId: row.id,
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    dailyPlans: parseJson(row.daily_plans_json, []),
    taskCount: Number(row.task_count || 0),
    reliability: parseJson(row.reliability_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || "",
  });
}

function publicReviewItemFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    reviewId: row.id,
    programId: row.program_id,
    draftId: row.draft_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    reason: row.reason,
    summary: row.summary,
    riskFlags: parseJson(row.risk_flags_json, []),
    allowedActions: parseJson(row.allowed_actions_json, []),
    decision: parseJson(row.decision_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at || "",
  });
}

function publicPublicationFromRow(row) {
  if (!row) return null;
  return {
    publicationId: row.id,
    programId: row.program_id,
    draftId: row.draft_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    kanbanResult: parseJson(row.kanban_result_json, null),
    createdAt: row.created_at,
  };
}

function publicSourceFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    sourceId: row.id,
    sourceRef: `${row.source_type}:${row.id}`,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    sourceType: row.source_type,
    title: row.title,
    summary: row.summary,
    confidence: Number(row.confidence || 0),
    sourceDate: row.source_date,
    tags: parseJson(row.tags_json, []),
    refs: parseJson(row.refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  });
}

function publicGoalFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    goalId: row.id,
    goalRef: `goal:${row.id}`,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    title: row.title,
    domain: row.domain,
    focusAreas: parseJson(row.focus_areas_json, []),
    targetSummary: row.target_summary,
    priority: Number(row.priority || 0),
    horizon: row.horizon,
    startDate: row.start_date,
    targetDate: row.target_date,
    status: row.status,
    successMetrics: parseJson(row.success_metrics_json, []),
    constraints: parseJson(row.constraints_json, {}),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || "",
  });
}

function publicLearnerProfileFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    profileId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    profileSummary: row.profile_summary,
    strengths: parseJson(row.strengths_json, []),
    weaknesses: parseJson(row.weaknesses_json, []),
    priorities: parseJson(row.priorities_json, []),
    skillStateSummary: parseJson(row.skill_state_summary_json, []),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicSkillStateFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    skillStateId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    skillId: row.skill_id,
    domain: row.domain,
    level: row.level,
    confidence: Number(row.confidence || 0),
    lastEvidenceRef: row.last_evidence_ref,
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    updatedAt: row.updated_at,
  });
}

function publicGrowthMasteryStateFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    masteryStateId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    taxonomyVersion: row.taxonomy_version,
    domain: row.domain,
    strand: row.strand,
    skillId: row.skill_id,
    microSkillId: row.micro_skill_id || "",
    parentSkillId: row.parent_skill_id || "",
    nodeLevel: row.node_level || "skill",
    status: row.status,
    stability: row.stability || "",
    confidence: Number(row.confidence || 0),
    evidenceCount: Number(row.evidence_count || 0),
    positiveEvidenceCount: Number(row.positive_evidence_count || 0),
    negativeEvidenceCount: Number(row.negative_evidence_count || 0),
    recentSuccessCount: Number(row.recent_success_count || 0),
    recentFailureCount: Number(row.recent_failure_count || 0),
    gradeReference: row.grade_reference || "",
    externalLevelReference: row.external_level_reference || "",
    difficultyBand: row.difficulty_band || "",
    supportLevel: row.support_level || "",
    transferLevel: row.transfer_level || "",
    lastEvidenceRef: row.last_evidence_ref || "",
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    strengths: parseJson(row.strengths_json, []),
    weaknesses: parseJson(row.weaknesses_json, []),
    errorPatterns: parseJson(row.error_patterns_json, []),
    evidenceSummary: parseJson(row.evidence_summary_json, []),
    childSkillRollup: parseJson(row.child_skill_rollup_json, {}),
    nextRecommendation: parseJson(row.next_recommendation_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicGrowthCardTrajectoryFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    trajectoryId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    sequenceGroupId: row.sequence_group_id,
    taskCardId: row.task_card_id,
    sequenceIndex: Number(row.sequence_index || 0),
    strategy: row.strategy,
    difficultyBand: row.difficulty_band || "",
    gradeReference: row.grade_reference || "",
    targetSkillIds: parseJson(row.target_skill_ids_json, []),
    supportSkillIds: parseJson(row.support_skill_ids_json, []),
    performanceSummary: row.performance_summary || "",
    confirmedStrengths: parseJson(row.confirmed_strengths_json, []),
    remainingWeaknesses: parseJson(row.remaining_weaknesses_json, []),
    masteryChanges: parseJson(row.mastery_changes_json, []),
    nextRecommendation: parseJson(row.next_recommendation_json, {}),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicCurriculumReferenceFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    referenceId: row.id,
    domain: row.domain,
    title: row.title,
    stage: row.stage,
    summary: row.summary,
    focusAreas: parseJson(row.focus_areas_json, []),
    tags: parseJson(row.tags_json, []),
    sourceType: row.source_type,
    copyrightPolicy: row.copyright_policy,
    updatedAt: row.updated_at,
  });
}

function publicTaskCardFromRow(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json, {}) || {};
  const cardRole = normalizeCardRole(row.card_role || raw.cardRole || raw.card_role, CARD_ROLES.STAGE_ASSESSMENT);
  const duration = defaultDurationRangeForRole(cardRole);
  const defaultRewardCoins = Number(row.default_reward_coins || raw.defaultRewardCoins || defaultRewardCoinsForRole(cardRole)) || defaultRewardCoinsForRole(cardRole);
  const configuredRewardCoins = Number(row.configured_reward_coins || raw.configuredRewardCoins || raw.rewardPolicy?.maxCoins || raw.rewardPolicy?.rewardCapCoins || defaultRewardCoins) || defaultRewardCoins;
  const rewardCapCoins = Number(row.reward_cap_coins || configuredRewardCoins || raw.rewardCapCoins || raw.rewardPolicy?.maxCoins || raw.rewardPolicy?.rewardCapCoins || defaultRewardCoins) || defaultRewardCoins;
  const expectedDurationMinutes = {
    min: Number(row.expected_duration_minutes_min || raw.expectedDurationMinutes?.min || duration.min) || duration.min,
    max: Number(row.expected_duration_minutes_max || raw.expectedDurationMinutes?.max || duration.max) || duration.max,
  };
  return Object.assign(raw, {
    taskCardId: row.id,
    programId: row.program_id,
    draftId: row.draft_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    kanbanCardId: row.kanban_card_id || "",
    title: row.title,
    domain: row.domain,
    taskCardType: row.task_card_type,
    status: row.status,
    plannedDate: row.planned_date,
    plannedMinutes: Number(row.planned_minutes || 0),
    skillIds: parseJson(row.skill_ids_json, []),
    templateId: row.template_id,
    interactionStateMachine: parseJson(row.interaction_state_machine_json, []),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    curriculumRefs: parseJson(row.curriculum_refs_json, []),
    privacyLevel: row.privacy_level,
    cardRole,
    completionPolicy: parseJson(row.completion_policy_json, raw.completionPolicy || defaultCompletionPolicyForRole(cardRole)),
    masteryEvidenceWeight: Number(row.mastery_evidence_weight || raw.masteryEvidenceWeight || defaultMasteryEvidenceWeightForRole(cardRole)) || defaultMasteryEvidenceWeightForRole(cardRole),
    capabilityClusterId: row.capability_cluster_id || raw.capabilityClusterId || "",
    defaultRewardCoins,
    configuredRewardCoins,
    expectedDurationMinutes,
    stageAssessment: {
      cycleId: row.stage_assessment_cycle_id || raw.stageAssessmentCycleId || raw.stageAssessment?.cycleId || "",
      activationState: row.activation_state || raw.activationState || raw.stageAssessment?.activationState || "",
      activationReason: row.activation_reason || raw.activationReason || raw.stageAssessment?.activationReason || "",
      activationSource: row.activation_source || raw.activationSource || raw.stageAssessment?.activationSource || "",
      cooldownUntil: row.cooldown_until || raw.cooldownUntil || raw.stageAssessment?.cooldownUntil || "",
    },
    stageAssessmentCycleId: row.stage_assessment_cycle_id || raw.stageAssessmentCycleId || raw.stageAssessment?.cycleId || "",
    activationState: row.activation_state || raw.activationState || "",
    activationReason: row.activation_reason || raw.activationReason || "",
    activationSource: row.activation_source || raw.activationSource || "",
    cooldownUntil: row.cooldown_until || raw.cooldownUntil || "",
    teachingFlow: parseJson(row.teaching_flow_json, raw.teachingFlow || null),
    experienceSummary: parseJson(row.experience_summary_json, raw.experienceSummary || null),
    rewardCapCoins,
    rewardPolicy: Object.assign({}, raw.rewardPolicy || {}, {
      maxCoins: rewardCapCoins,
      rewardCapCoins,
      defaultCoins: defaultRewardCoins,
    }),
    reliability: parseJson(row.reliability_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicExperienceSignalFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    signalId: row.id,
    taskCardId: row.task_card_id,
    programId: row.program_id,
    learnerId: row.learner_id,
    learnerWorkspaceId: row.learner_workspace_id,
    workspaceId: row.workspace_id,
    cardRole: row.card_role,
    capabilityClusterId: row.capability_cluster_id,
    signalType: row.signal_type,
    intensity: Number(row.intensity || 0),
    summary: row.summary,
    actorPrincipalId: row.actor_principal_id,
    createdAt: row.created_at,
  });
}

function publicStageAssessmentCycleFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    cycleId: row.id,
    learnerId: row.learner_id,
    learnerWorkspaceId: row.learner_workspace_id,
    workspaceId: row.workspace_id,
    programId: row.program_id,
    taskCardId: row.task_card_id,
    capabilityClusterId: row.capability_cluster_id,
    status: row.status,
    triggerType: row.trigger_type,
    activationReason: row.activation_reason,
    activatedByPrincipalId: row.activated_by_principal_id,
    activatedAt: row.activated_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicInteractionSessionFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    sessionId: row.id,
    taskCardId: row.task_card_id,
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    currentStep: row.current_step,
    stepHistory: parseJson(row.step_history_json, []),
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicEvaluationFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    evaluationId: row.id,
    taskCardId: row.task_card_id,
    sessionId: row.session_id,
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    score: Number(row.score || 0),
    passed: Boolean(Number(row.passed || 0)),
    confidence: Number(row.confidence || 0),
    summary: row.summary,
    skillResults: parseJson(row.skill_results_json, []),
    rewardPolicy: parseJson(row.reward_policy_json, null),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    createdAt: row.created_at,
  });
}

function publicTaskSubmissionFromRow(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json, {}) || {};
  const nestedAudio = raw.raw?.audio || null;
  const audio = raw.audio && nestedAudio && typeof raw.audio === "object" && typeof nestedAudio === "object"
    ? Object.assign({}, nestedAudio, raw.audio)
    : (raw.audio || nestedAudio || null);
  return Object.assign(raw, {
    submissionId: row.id,
    taskCardId: row.task_card_id,
    sessionId: row.session_id,
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    stage: row.stage,
    submissionKind: row.submission_kind,
    attemptNo: Number(row.attempt_no || 0),
    status: row.status,
    summary: row.summary,
    textDigest: row.text_digest || "",
    textChars: Number(row.text_chars || 0),
    textWords: Number(row.text_words || 0),
    kanbanCardId: row.kanban_card_id || "",
    kanbanCommentRef: row.kanban_comment_ref || "",
    submittedAt: row.submitted_at || "",
    withdrawnAt: row.withdrawn_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audio: audio ? Object.assign({}, audio, {
      url: audio.url || audio.href || `/api/learning/task-submissions/${encodeURIComponent(row.id)}/audio`,
    }) : null,
  });
}

function publicGrowthEvaluationJobFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    jobId: row.id,
    submissionId: row.submission_id,
    taskCardId: row.task_card_id,
    learnerId: row.learner_id || "",
    workspaceId: row.workspace_id,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    leaseOwner: row.lease_owner || "",
    leaseUntil: row.lease_until || "",
    lastError: row.last_error || "",
    availableAt: row.available_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || "",
  });
}

function publicTaskReflectionFromRow(row) {
  if (!row) return null;
  const raw = parseJson(row.raw_json, {}) || {};
  const nestedAudio = raw.raw?.audio || null;
  const audio = raw.audio && nestedAudio && typeof raw.audio === "object" && typeof nestedAudio === "object"
    ? Object.assign({}, nestedAudio, raw.audio)
    : (raw.audio || nestedAudio || null);
  return Object.assign(raw, {
    reflectionId: row.id,
    taskCardId: row.task_card_id,
    sessionId: row.session_id,
    evaluationId: row.evaluation_id || "",
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    status: row.status,
    mode: row.mode,
    score: Number(row.score || 0),
    maxScore: Number(row.max_score || 0),
    summary: row.summary,
    transcriptDigest: row.transcript_digest || "",
    audioDigest: row.audio_digest || "",
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    submittedAt: row.submitted_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audio: audio ? Object.assign({}, audio, {
      url: audio.url || audio.href || `/api/learning/task-reflections/${encodeURIComponent(row.id)}/audio`,
    }) : null,
  });
}

function publicTaskArtifactFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    artifactId: row.id,
    taskCardId: row.task_card_id,
    sessionId: row.session_id || "",
    evaluationId: row.evaluation_id || "",
    submissionId: row.submission_id || "",
    reflectionId: row.reflection_id || "",
    programId: row.program_id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    artifactType: row.artifact_type,
    title: row.title,
    name: row.name,
    mime: row.mime,
    size: Number(row.size || 0),
    refDigest: row.ref_digest || "",
    refName: row.ref_name || "",
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicReviewRequestFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    reviewRequestId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    programId: row.program_id,
    requestType: row.request_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    idempotencyKey: row.idempotency_key || "",
    status: row.status,
    reason: row.reason,
    summary: row.summary,
    riskFlags: parseJson(row.risk_flags_json, []),
    allowedActions: parseJson(row.allowed_actions_json, []),
    sourceBasisRefs: parseJson(row.source_basis_refs_json, []),
    decision: parseJson(row.decision_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at || "",
  });
}

function publicRewardSettlementFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    rewardSettlementId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    programId: row.program_id,
    taskCardId: row.task_card_id,
    sessionId: row.session_id,
    evaluationId: row.evaluation_id,
    status: row.status,
    coinAmount: Number(row.coin_amount || 0),
    reason: row.reason,
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key || "",
    reviewRequestId: row.review_request_id || "",
    ledgerEntry: parseJson(row.ledger_entry_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settledAt: row.settled_at || "",
  });
}

function publicTaskSeriesRecommendationFromRow(row) {
  if (!row) return null;
  return Object.assign(parseJson(row.raw_json, {}) || {}, {
    recommendationRunId: row.id,
    learnerId: row.learner_id,
    workspaceId: row.workspace_id,
    domain: row.domain,
    modelStatus: row.model_status,
    requestedByPrincipalId: row.requested_by_principal_id || "",
    createdAt: row.created_at,
  });
}

function createLearningProgramRepository(options = {}) {
  const dataDir = path.resolve(String(options.dataDir || process.env.HERMES_WEB_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web")));
  const dbPath = path.resolve(String(options.dbPath || process.env.HERMES_MOBILE_LEARNING_DB_PATH || process.env.HERMES_WEB_LEARNING_DB_PATH || path.join(dataDir, "learning-growth.sqlite3")));
  const readonly = Boolean(options.readonly);
  let db = null;

  function open() {
    if (db) return db;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath, { open: true, readOnly: readonly });
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
    return db;
  }

  function close() {
    if (!db) return;
    db.close();
    db = null;
  }

  function ensureColumn(tableName, columnName, ddl) {
    const exists = open().prepare(`PRAGMA table_info(${tableName})`).all()
      .some((column) => column.name === columnName);
    if (!exists) open().exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl};`);
  }

  function migrate() {
    const database = open();
    database.exec(`
      CREATE TABLE IF NOT EXISTS learning_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_programs (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        focus_areas_json TEXT NOT NULL,
        goal_summary TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days_per_week INTEGER NOT NULL,
        minutes_per_day INTEGER NOT NULL,
        intensity TEXT NOT NULL,
        status TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        curriculum_refs_json TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        review_policy_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS learning_plan_drafts (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        daily_plans_json TEXT NOT NULL,
        task_count INTEGER NOT NULL,
        reliability_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_parent_review_items (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        summary TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        decision_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
        FOREIGN KEY(draft_id) REFERENCES learning_plan_drafts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_publications (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        kanban_result_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
        FOREIGN KEY(draft_id) REFERENCES learning_plan_drafts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_sources (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        confidence REAL NOT NULL,
        source_date TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        refs_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS learning_goals (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        focus_areas_json TEXT NOT NULL,
        target_summary TEXT NOT NULL,
        priority INTEGER NOT NULL,
        horizon TEXT NOT NULL,
        start_date TEXT NOT NULL,
        target_date TEXT NOT NULL,
        status TEXT NOT NULL,
        success_metrics_json TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS learner_profiles (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        profile_summary TEXT NOT NULL,
        strengths_json TEXT NOT NULL,
        weaknesses_json TEXT NOT NULL,
        priorities_json TEXT NOT NULL,
        skill_state_summary_json TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learner_skill_states (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        level TEXT NOT NULL,
        confidence REAL NOT NULL,
        last_evidence_ref TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_curriculum_references (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        title TEXT NOT NULL,
        stage TEXT NOT NULL,
        summary TEXT NOT NULL,
        focus_areas_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        source_type TEXT NOT NULL,
        copyright_policy TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_task_cards (
        id TEXT PRIMARY KEY,
        program_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        kanban_card_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        domain TEXT NOT NULL,
        task_card_type TEXT NOT NULL,
        status TEXT NOT NULL,
        planned_date TEXT NOT NULL,
        planned_minutes INTEGER NOT NULL,
        skill_ids_json TEXT NOT NULL,
        template_id TEXT NOT NULL,
        interaction_state_machine_json TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        curriculum_refs_json TEXT NOT NULL,
        privacy_level TEXT NOT NULL,
        card_role TEXT NOT NULL DEFAULT '',
        completion_policy_json TEXT NOT NULL DEFAULT '{}',
        mastery_evidence_weight REAL NOT NULL DEFAULT 1,
        capability_cluster_id TEXT NOT NULL DEFAULT '',
        default_reward_coins INTEGER NOT NULL DEFAULT 100,
        configured_reward_coins INTEGER NOT NULL DEFAULT 100,
        expected_duration_minutes_min INTEGER NOT NULL DEFAULT 10,
        expected_duration_minutes_max INTEGER NOT NULL DEFAULT 15,
        stage_assessment_cycle_id TEXT NOT NULL DEFAULT '',
        activation_state TEXT NOT NULL DEFAULT '',
        activation_reason TEXT NOT NULL DEFAULT '',
        activation_source TEXT NOT NULL DEFAULT '',
        cooldown_until TEXT NOT NULL DEFAULT '',
        teaching_flow_json TEXT,
        experience_summary_json TEXT,
        reward_cap_coins INTEGER NOT NULL DEFAULT 100,
        reliability_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE,
        FOREIGN KEY(draft_id) REFERENCES learning_plan_drafts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_growth_experience_signals (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        learner_workspace_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        card_role TEXT NOT NULL DEFAULT '',
        capability_cluster_id TEXT NOT NULL DEFAULT '',
        signal_type TEXT NOT NULL,
        intensity REAL NOT NULL DEFAULT 1,
        summary TEXT NOT NULL DEFAULT '',
        actor_principal_id TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_growth_stage_assessment_cycles (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        learner_workspace_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        task_card_id TEXT NOT NULL DEFAULT '',
        capability_cluster_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'scheduled',
        trigger_type TEXT NOT NULL DEFAULT '',
        activation_reason TEXT NOT NULL DEFAULT '',
        activated_by_principal_id TEXT NOT NULL DEFAULT '',
        activated_at TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_interaction_sessions (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_step TEXT NOT NULL,
        step_history_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_evaluations (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        score REAL NOT NULL,
        passed INTEGER NOT NULL,
        confidence REAL NOT NULL,
        summary TEXT NOT NULL,
        skill_results_json TEXT NOT NULL,
        reward_policy_json TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES learning_interaction_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_task_submissions (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        stage TEXT NOT NULL DEFAULT '',
        submission_kind TEXT NOT NULL DEFAULT '',
        attempt_no INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        text_digest TEXT NOT NULL DEFAULT '',
        text_chars INTEGER NOT NULL DEFAULT 0,
        text_words INTEGER NOT NULL DEFAULT 0,
        kanban_card_id TEXT NOT NULL DEFAULT '',
        kanban_comment_ref TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        submitted_at TEXT NOT NULL,
        withdrawn_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES learning_interaction_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_task_reflections (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        evaluation_id TEXT NOT NULL DEFAULT '',
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'spoken',
        score REAL NOT NULL DEFAULT 0,
        max_score REAL NOT NULL DEFAULT 100,
        summary TEXT NOT NULL DEFAULT '',
        transcript_digest TEXT NOT NULL DEFAULT '',
        audio_digest TEXT NOT NULL DEFAULT '',
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        raw_json TEXT NOT NULL DEFAULT '{}',
        submitted_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES learning_interaction_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_task_artifacts (
        id TEXT PRIMARY KEY,
        task_card_id TEXT NOT NULL,
        session_id TEXT NOT NULL DEFAULT '',
        evaluation_id TEXT NOT NULL DEFAULT '',
        submission_id TEXT NOT NULL DEFAULT '',
        reflection_id TEXT NOT NULL DEFAULT '',
        program_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL DEFAULT '',
        mime TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        ref_digest TEXT NOT NULL DEFAULT '',
        ref_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_parent_review_requests (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        summary TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        source_basis_refs_json TEXT NOT NULL,
        decision_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        decided_at TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS learning_reward_settlements (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        program_id TEXT NOT NULL,
        task_card_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        evaluation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        coin_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL DEFAULT '',
        review_request_id TEXT NOT NULL DEFAULT '',
        ledger_entry_json TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        settled_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(evaluation_id) REFERENCES learning_evaluations(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES learning_interaction_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE,
        FOREIGN KEY(program_id) REFERENCES learning_programs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_task_series_recommendations (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        model_status TEXT NOT NULL,
        requested_by_principal_id TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS learning_growth_evaluation_jobs (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL,
        task_card_id TEXT NOT NULL,
        learner_id TEXT NOT NULL DEFAULT '',
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT NOT NULL DEFAULT '',
        lease_until TEXT NOT NULL DEFAULT '',
        last_error TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        available_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(submission_id) REFERENCES learning_task_submissions(id) ON DELETE CASCADE,
        FOREIGN KEY(task_card_id) REFERENCES learning_task_cards(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS learning_growth_mastery_states (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        taxonomy_version TEXT NOT NULL,
        domain TEXT NOT NULL,
        strand TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        micro_skill_id TEXT NOT NULL DEFAULT '',
        parent_skill_id TEXT NOT NULL DEFAULT '',
        node_level TEXT NOT NULL DEFAULT 'skill',
        status TEXT NOT NULL,
        stability TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        evidence_count INTEGER NOT NULL DEFAULT 0,
        positive_evidence_count INTEGER NOT NULL DEFAULT 0,
        negative_evidence_count INTEGER NOT NULL DEFAULT 0,
        recent_success_count INTEGER NOT NULL DEFAULT 0,
        recent_failure_count INTEGER NOT NULL DEFAULT 0,
        grade_reference TEXT NOT NULL DEFAULT '',
        external_level_reference TEXT NOT NULL DEFAULT '',
        difficulty_band TEXT NOT NULL DEFAULT '',
        support_level TEXT NOT NULL DEFAULT '',
        transfer_level TEXT NOT NULL DEFAULT '',
        last_evidence_ref TEXT NOT NULL DEFAULT '',
        source_basis_refs_json TEXT NOT NULL DEFAULT '[]',
        strengths_json TEXT NOT NULL DEFAULT '[]',
        weaknesses_json TEXT NOT NULL DEFAULT '[]',
        error_patterns_json TEXT NOT NULL DEFAULT '[]',
        evidence_summary_json TEXT NOT NULL DEFAULT '[]',
        child_skill_rollup_json TEXT NOT NULL DEFAULT '{}',
        next_recommendation_json TEXT NOT NULL DEFAULT '{}',
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(learner_id, workspace_id, taxonomy_version, domain, strand, skill_id, micro_skill_id)
      );

      CREATE TABLE IF NOT EXISTS learning_growth_card_trajectories (
        id TEXT PRIMARY KEY,
        learner_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        sequence_group_id TEXT NOT NULL,
        task_card_id TEXT NOT NULL,
        sequence_index INTEGER NOT NULL DEFAULT 0,
        strategy TEXT NOT NULL,
        difficulty_band TEXT NOT NULL DEFAULT '',
        grade_reference TEXT NOT NULL DEFAULT '',
        target_skill_ids_json TEXT NOT NULL DEFAULT '[]',
        support_skill_ids_json TEXT NOT NULL DEFAULT '[]',
        performance_summary TEXT NOT NULL DEFAULT '',
        confirmed_strengths_json TEXT NOT NULL DEFAULT '[]',
        remaining_weaknesses_json TEXT NOT NULL DEFAULT '[]',
        mastery_changes_json TEXT NOT NULL DEFAULT '[]',
        next_recommendation_json TEXT NOT NULL DEFAULT '{}',
        source_basis_refs_json TEXT NOT NULL DEFAULT '[]',
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(task_card_id)
      );

      CREATE INDEX IF NOT EXISTS idx_learning_programs_learner ON learning_programs(learner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_drafts_program ON learning_plan_drafts(program_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_reviews_status ON learning_parent_review_items(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_publications_draft ON learning_publications(draft_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_sources_learner ON learning_sources(learner_id, source_type, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_goals_learner ON learning_goals(learner_id, status, priority);
      CREATE INDEX IF NOT EXISTS idx_learning_profiles_learner ON learner_profiles(learner_id, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_skill_states_unique ON learner_skill_states(learner_id, skill_id);
      CREATE INDEX IF NOT EXISTS idx_learning_curriculum_domain ON learning_curriculum_references(domain, stage);
      CREATE INDEX IF NOT EXISTS idx_learning_task_cards_learner ON learning_task_cards(learner_id, status, planned_date);
      CREATE INDEX IF NOT EXISTS idx_learning_task_cards_draft ON learning_task_cards(draft_id, planned_date);
      CREATE INDEX IF NOT EXISTS idx_learning_sessions_task ON learning_interaction_sessions(task_card_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_sessions_learner ON learning_interaction_sessions(learner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_evaluations_task ON learning_evaluations(task_card_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_evaluations_learner ON learning_evaluations(learner_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_submissions_task ON learning_task_submissions(task_card_id, submitted_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_submissions_learner ON learning_task_submissions(learner_id, status, submitted_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_reflections_task ON learning_task_reflections(task_card_id, submitted_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_reflections_learner ON learning_task_reflections(learner_id, status, submitted_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_artifacts_task ON learning_task_artifacts(task_card_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_task_artifacts_learner ON learning_task_artifacts(learner_id, artifact_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_parent_review_requests_learner ON learning_parent_review_requests(learner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_parent_review_requests_resource ON learning_parent_review_requests(resource_type, resource_id, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_parent_review_requests_idempotency ON learning_parent_review_requests(idempotency_key) WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_learning_reward_settlements_learner ON learning_reward_settlements(learner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_reward_settlements_evaluation ON learning_reward_settlements(evaluation_id, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_reward_settlements_unique_evaluation ON learning_reward_settlements(evaluation_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_reward_settlements_idempotency ON learning_reward_settlements(idempotency_key) WHERE idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_learning_task_series_recommendations_latest ON learning_task_series_recommendations(learner_id, workspace_id, domain, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_growth_evaluation_jobs_submission ON learning_growth_evaluation_jobs(submission_id);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_evaluation_jobs_status ON learning_growth_evaluation_jobs(status, available_at, lease_until);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_mastery_lookup ON learning_growth_mastery_states(learner_id, workspace_id, domain, strand, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_mastery_review_due ON learning_growth_mastery_states(learner_id, workspace_id, domain, stability, last_evidence_ref);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_card_trajectories_sequence ON learning_growth_card_trajectories(learner_id, workspace_id, sequence_group_id, sequence_index);
    `);
    ensureColumn("learning_task_cards", "reward_cap_coins", "reward_cap_coins INTEGER NOT NULL DEFAULT 100");
    ensureColumn("learning_task_cards", "card_role", "card_role TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "completion_policy_json", "completion_policy_json TEXT NOT NULL DEFAULT '{}'");
    ensureColumn("learning_task_cards", "mastery_evidence_weight", "mastery_evidence_weight REAL NOT NULL DEFAULT 1");
    ensureColumn("learning_task_cards", "capability_cluster_id", "capability_cluster_id TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "default_reward_coins", "default_reward_coins INTEGER NOT NULL DEFAULT 100");
    ensureColumn("learning_task_cards", "configured_reward_coins", "configured_reward_coins INTEGER NOT NULL DEFAULT 100");
    ensureColumn("learning_task_cards", "expected_duration_minutes_min", "expected_duration_minutes_min INTEGER NOT NULL DEFAULT 10");
    ensureColumn("learning_task_cards", "expected_duration_minutes_max", "expected_duration_minutes_max INTEGER NOT NULL DEFAULT 15");
    ensureColumn("learning_task_cards", "stage_assessment_cycle_id", "stage_assessment_cycle_id TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "activation_state", "activation_state TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "activation_reason", "activation_reason TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "activation_source", "activation_source TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "cooldown_until", "cooldown_until TEXT NOT NULL DEFAULT ''");
    ensureColumn("learning_task_cards", "teaching_flow_json", "teaching_flow_json TEXT");
    ensureColumn("learning_task_cards", "experience_summary_json", "experience_summary_json TEXT");
    ensureColumn("learning_growth_evaluation_jobs", "learner_id", "learner_id TEXT NOT NULL DEFAULT ''");
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_learning_task_cards_role ON learning_task_cards(learner_id, workspace_id, card_role, status, planned_date);
      CREATE INDEX IF NOT EXISTS idx_learning_task_cards_cluster ON learning_task_cards(capability_cluster_id, activation_state, planned_date);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_experience_signals_task ON learning_growth_experience_signals(learner_workspace_id, task_card_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_experience_signals_cluster ON learning_growth_experience_signals(capability_cluster_id, signal_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_learning_growth_stage_cycles_lookup ON learning_growth_stage_assessment_cycles(learner_workspace_id, capability_cluster_id, status, updated_at);
    `);
    const row = database.prepare("SELECT version FROM learning_schema_migrations WHERE version = ?").get(CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION);
    if (!row) {
      database.prepare("INSERT INTO learning_schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
        CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
        "learning growth teaching card schema v1.0",
        nowIso(),
      );
    }
  }

  function upsertProgram(program) {
    migrate();
    const now = nowIso();
    const current = getProgram(program.programId);
    const createdAt = current?.createdAt || program.createdAt || now;
    const updatedAt = program.updatedAt || now;
    const row = Object.assign({}, program, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_programs(
        id, learner_id, workspace_id, title, domain, focus_areas_json, goal_summary,
        start_date, end_date, days_per_week, minutes_per_day, intensity, status,
        source_basis_refs_json, curriculum_refs_json, constraints_json, review_policy_json,
        raw_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        title=excluded.title,
        domain=excluded.domain,
        focus_areas_json=excluded.focus_areas_json,
        goal_summary=excluded.goal_summary,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        days_per_week=excluded.days_per_week,
        minutes_per_day=excluded.minutes_per_day,
        intensity=excluded.intensity,
        status=excluded.status,
        source_basis_refs_json=excluded.source_basis_refs_json,
        curriculum_refs_json=excluded.curriculum_refs_json,
        constraints_json=excluded.constraints_json,
        review_policy_json=excluded.review_policy_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        archived_at=excluded.archived_at
    `).run(
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.title,
      row.domain,
      stableJson(row.focusAreas || []),
      row.goalSummary,
      row.startDate,
      row.endDate,
      Number(row.daysPerWeek || 0),
      Number(row.minutesPerDay || 0),
      row.intensity,
      row.status || "active",
      stableJson(row.sourceBasisRefs || []),
      stableJson(row.curriculumRefs || []),
      stableJson(row.constraints || {}),
      stableJson(row.reviewPolicy || {}),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.archivedAt || "",
    );
    return getProgram(row.programId);
  }

  function getProgram(programId) {
    migrate();
    return publicProgramFromRow(open().prepare("SELECT * FROM learning_programs WHERE id = ?").get(cleanString(programId)));
  }

  function listPrograms(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (!filters.includeArchived) where.push("archived_at = ''");
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_programs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicProgramFromRow);
  }

  function savePlanDraft(draft) {
    migrate();
    const now = nowIso();
    const current = getPlanDraft(draft.draftId);
    const createdAt = current?.createdAt || draft.createdAt || now;
    const updatedAt = draft.updatedAt || now;
    const taskCount = asArray(draft.dailyPlans).reduce((sum, day) => sum + asArray(day.tasks).length, 0);
    const row = Object.assign({}, draft, { createdAt, updatedAt, taskCount });
    open().prepare(`
      INSERT INTO learning_plan_drafts(
        id, program_id, learner_id, workspace_id, status, week_start, week_end,
        daily_plans_json, task_count, reliability_json, raw_json, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        daily_plans_json=excluded.daily_plans_json,
        task_count=excluded.task_count,
        reliability_json=excluded.reliability_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        published_at=excluded.published_at
    `).run(
      row.draftId,
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.status || "draft",
      row.weekStart || "",
      row.weekEnd || "",
      stableJson(row.dailyPlans || []),
      row.taskCount,
      stableJson(row.reliability || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.publishedAt || "",
    );
    return getPlanDraft(row.draftId);
  }

  function getPlanDraft(draftId) {
    migrate();
    return publicDraftFromRow(open().prepare("SELECT * FROM learning_plan_drafts WHERE id = ?").get(cleanString(draftId)));
  }

  function latestDraftForProgram(programId) {
    migrate();
    return publicDraftFromRow(open().prepare("SELECT * FROM learning_plan_drafts WHERE program_id = ? ORDER BY created_at DESC LIMIT 1").get(cleanString(programId)));
  }

  function deletePlanDraft(draftId) {
    migrate();
    const existing = getPlanDraft(draftId);
    if (!existing) return null;
    open().prepare("DELETE FROM learning_plan_drafts WHERE id = ?").run(cleanString(draftId));
    return existing;
  }

  function listPlanDrafts(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 20) || 20));
    const sql = `SELECT * FROM learning_plan_drafts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicDraftFromRow);
  }

  function saveReviewItem(item) {
    migrate();
    const now = nowIso();
    const current = getReviewItem(item.reviewId);
    const createdAt = current?.createdAt || item.createdAt || now;
    const updatedAt = item.updatedAt || now;
    const row = Object.assign({}, item, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_parent_review_items(
        id, program_id, draft_id, learner_id, workspace_id, status, reason, summary,
        risk_flags_json, allowed_actions_json, decision_json, raw_json, created_at, updated_at, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        reason=excluded.reason,
        summary=excluded.summary,
        risk_flags_json=excluded.risk_flags_json,
        allowed_actions_json=excluded.allowed_actions_json,
        decision_json=excluded.decision_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        decided_at=excluded.decided_at
    `).run(
      row.reviewId,
      row.programId,
      row.draftId,
      row.learnerId,
      row.workspaceId,
      row.status || "pending",
      row.reason || "",
      row.summary || "",
      stableJson(row.riskFlags || []),
      stableJson(row.allowedActions || []),
      stableJson(row.decision || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.decidedAt || "",
    );
    return getReviewItem(row.reviewId);
  }

  function getReviewItem(reviewId) {
    migrate();
    return publicReviewItemFromRow(open().prepare("SELECT * FROM learning_parent_review_items WHERE id = ?").get(cleanString(reviewId)));
  }

  function listReviewItems(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_parent_review_items ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicReviewItemFromRow);
  }

  function savePublication(publication) {
    migrate();
    const createdAt = publication.createdAt || nowIso();
    open().prepare(`
      INSERT INTO learning_publications(id, program_id, draft_id, learner_id, workspace_id, status, kanban_result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      publication.publicationId,
      publication.programId,
      publication.draftId,
      publication.learnerId,
      publication.workspaceId,
      publication.status || "published",
      stableJson(publication.kanbanResult || null),
      createdAt,
    );
    return publicPublicationFromRow(open().prepare("SELECT * FROM learning_publications WHERE id = ?").get(publication.publicationId));
  }

  function listPublications(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.draftId) {
      where.push("draft_id = ?");
      values.push(cleanString(filters.draftId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_publications ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicPublicationFromRow);
  }

  function upsertSource(source) {
    migrate();
    const now = nowIso();
    const current = getSource(source.sourceId);
    const createdAt = current?.createdAt || source.createdAt || now;
    const updatedAt = source.updatedAt || now;
    const row = Object.assign({}, source, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_sources(
        id, learner_id, workspace_id, source_type, title, summary, confidence, source_date,
        tags_json, refs_json, raw_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        source_type=excluded.source_type,
        title=excluded.title,
        summary=excluded.summary,
        confidence=excluded.confidence,
        source_date=excluded.source_date,
        tags_json=excluded.tags_json,
        refs_json=excluded.refs_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        archived_at=excluded.archived_at
    `).run(
      row.sourceId,
      row.learnerId,
      row.workspaceId,
      row.sourceType,
      row.title,
      row.summary,
      Number(row.confidence || 0),
      row.sourceDate || "",
      stableJson(row.tags || []),
      stableJson(row.refs || []),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.archivedAt || "",
    );
    return getSource(row.sourceId);
  }

  function getSource(sourceId) {
    migrate();
    return publicSourceFromRow(open().prepare("SELECT * FROM learning_sources WHERE id = ?").get(cleanString(sourceId)));
  }

  function listSources(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.sourceType) {
      where.push("source_type = ?");
      values.push(cleanString(filters.sourceType));
    }
    if (!filters.includeArchived) where.push("archived_at = ''");
    const limit = Math.max(1, Math.min(300, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learning_sources ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicSourceFromRow);
  }

  function upsertGoal(goal) {
    migrate();
    const now = nowIso();
    const current = getGoal(goal.goalId);
    const createdAt = current?.createdAt || goal.createdAt || now;
    const updatedAt = goal.updatedAt || now;
    const row = Object.assign({}, goal, { createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_goals(
        id, learner_id, workspace_id, title, domain, focus_areas_json, target_summary,
        priority, horizon, start_date, target_date, status, success_metrics_json,
        constraints_json, source_basis_refs_json, raw_json, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        title=excluded.title,
        domain=excluded.domain,
        focus_areas_json=excluded.focus_areas_json,
        target_summary=excluded.target_summary,
        priority=excluded.priority,
        horizon=excluded.horizon,
        start_date=excluded.start_date,
        target_date=excluded.target_date,
        status=excluded.status,
        success_metrics_json=excluded.success_metrics_json,
        constraints_json=excluded.constraints_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        archived_at=excluded.archived_at
    `).run(
      row.goalId,
      row.learnerId,
      row.workspaceId,
      row.title,
      row.domain,
      stableJson(row.focusAreas || []),
      row.targetSummary,
      Number(row.priority || 0),
      row.horizon || "",
      row.startDate || "",
      row.targetDate || "",
      row.status || "active",
      stableJson(row.successMetrics || []),
      stableJson(row.constraints || {}),
      stableJson(row.sourceBasisRefs || []),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.archivedAt || "",
    );
    return getGoal(row.goalId);
  }

  function getGoal(goalId) {
    migrate();
    return publicGoalFromRow(open().prepare("SELECT * FROM learning_goals WHERE id = ?").get(cleanString(goalId)));
  }

  function listGoals(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (!filters.includeArchived) where.push("archived_at = ''");
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 80) || 80));
    const sql = `SELECT * FROM learning_goals ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY priority DESC, updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicGoalFromRow);
  }

  function upsertLearnerProfile(profile) {
    migrate();
    const now = nowIso();
    const current = getLearnerProfile(profile.learnerId);
    const createdAt = current?.createdAt || profile.createdAt || now;
    const updatedAt = profile.updatedAt || now;
    const row = Object.assign({}, profile, {
      profileId: profile.profileId || `profile:${profile.learnerId}`,
      createdAt,
      updatedAt,
    });
    open().prepare(`
      INSERT INTO learner_profiles(
        id, learner_id, workspace_id, display_name, profile_summary, strengths_json,
        weaknesses_json, priorities_json, skill_state_summary_json, source_basis_refs_json,
        raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        display_name=excluded.display_name,
        profile_summary=excluded.profile_summary,
        strengths_json=excluded.strengths_json,
        weaknesses_json=excluded.weaknesses_json,
        priorities_json=excluded.priorities_json,
        skill_state_summary_json=excluded.skill_state_summary_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.profileId,
      row.learnerId,
      row.workspaceId,
      row.displayName || row.learnerId,
      row.profileSummary || "",
      stableJson(row.strengths || []),
      stableJson(row.weaknesses || []),
      stableJson(row.priorities || []),
      stableJson(row.skillStateSummary || []),
      stableJson(row.sourceBasisRefs || []),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
    );
    return getLearnerProfile(row.learnerId);
  }

  function getLearnerProfile(learnerId) {
    migrate();
    return publicLearnerProfileFromRow(open().prepare("SELECT * FROM learner_profiles WHERE learner_id = ? ORDER BY updated_at DESC LIMIT 1").get(cleanString(learnerId)));
  }

  function upsertSkillState(state) {
    migrate();
    const updatedAt = state.updatedAt || nowIso();
    const row = Object.assign({}, state, { skillStateId: state.skillStateId || `${state.learnerId}:${state.skillId}` });
    open().prepare(`
      INSERT INTO learner_skill_states(
        id, learner_id, workspace_id, skill_id, domain, level, confidence, last_evidence_ref,
        source_basis_refs_json, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id=excluded.workspace_id,
        domain=excluded.domain,
        level=excluded.level,
        confidence=excluded.confidence,
        last_evidence_ref=excluded.last_evidence_ref,
        source_basis_refs_json=excluded.source_basis_refs_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.skillStateId,
      row.learnerId,
      row.workspaceId,
      row.skillId,
      row.domain || "",
      row.level || "baseline",
      Number(row.confidence || 0),
      row.lastEvidenceRef || "",
      stableJson(row.sourceBasisRefs || []),
      stableJson(stripPrivateLearningFields(row)),
      updatedAt,
    );
    return publicSkillStateFromRow(open().prepare("SELECT * FROM learner_skill_states WHERE id = ?").get(row.skillStateId));
  }

  function listSkillStates(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.domain) {
      where.push("domain = ?");
      values.push(cleanString(filters.domain));
    }
    const limit = Math.max(1, Math.min(300, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learner_skill_states ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicSkillStateFromRow);
  }

  function upsertCurriculumReference(reference) {
    migrate();
    const updatedAt = reference.updatedAt || nowIso();
    const row = Object.assign({}, reference);
    open().prepare(`
      INSERT INTO learning_curriculum_references(
        id, domain, title, stage, summary, focus_areas_json, tags_json,
        source_type, copyright_policy, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        domain=excluded.domain,
        title=excluded.title,
        stage=excluded.stage,
        summary=excluded.summary,
        focus_areas_json=excluded.focus_areas_json,
        tags_json=excluded.tags_json,
        source_type=excluded.source_type,
        copyright_policy=excluded.copyright_policy,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.referenceId || row.id,
      row.domain,
      row.title,
      row.stage || "",
      row.summary || "",
      stableJson(row.focusAreas || []),
      stableJson(row.tags || []),
      row.sourceType || "public_reference",
      row.copyrightPolicy || "reference_only_no_copied_questions",
      stableJson(stripPrivateLearningFields(row)),
      updatedAt,
    );
    return publicCurriculumReferenceFromRow(open().prepare("SELECT * FROM learning_curriculum_references WHERE id = ?").get(row.referenceId || row.id));
  }

  function listCurriculumReferences(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.domain) {
      where.push("domain = ?");
      values.push(cleanString(filters.domain));
    }
    if (filters.stage) {
      where.push("stage = ?");
      values.push(cleanString(filters.stage));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learning_curriculum_references ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY domain ASC, stage ASC, id ASC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicCurriculumReferenceFromRow);
  }

  function upsertTaskCard(card) {
    migrate();
    const now = nowIso();
    const normalizedCard = withTeachingFlow(withGrowthCardRoleDefaults(card));
    const cardId = cleanString(normalizedCard.taskCardId || normalizedCard.id);
    const current = getTaskCard(cardId);
    const createdAt = current?.createdAt || normalizedCard.createdAt || now;
    const updatedAt = normalizedCard.updatedAt || now;
    const row = Object.assign({}, normalizedCard, { taskCardId: cardId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_task_cards(
        id, program_id, draft_id, learner_id, workspace_id, kanban_card_id,
        title, domain, task_card_type, status, planned_date, planned_minutes,
        skill_ids_json, template_id, interaction_state_machine_json,
        source_basis_refs_json, curriculum_refs_json, privacy_level,
        card_role, completion_policy_json, mastery_evidence_weight, capability_cluster_id,
        default_reward_coins, configured_reward_coins,
        expected_duration_minutes_min, expected_duration_minutes_max,
        stage_assessment_cycle_id, activation_state, activation_reason, activation_source, cooldown_until,
        teaching_flow_json, experience_summary_json,
        reward_cap_coins, reliability_json, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        program_id=excluded.program_id,
        draft_id=excluded.draft_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        kanban_card_id=excluded.kanban_card_id,
        title=excluded.title,
        domain=excluded.domain,
        task_card_type=excluded.task_card_type,
        status=excluded.status,
        planned_date=excluded.planned_date,
        planned_minutes=excluded.planned_minutes,
        skill_ids_json=excluded.skill_ids_json,
        template_id=excluded.template_id,
        interaction_state_machine_json=excluded.interaction_state_machine_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        curriculum_refs_json=excluded.curriculum_refs_json,
        privacy_level=excluded.privacy_level,
        card_role=excluded.card_role,
        completion_policy_json=excluded.completion_policy_json,
        mastery_evidence_weight=excluded.mastery_evidence_weight,
        capability_cluster_id=excluded.capability_cluster_id,
        default_reward_coins=excluded.default_reward_coins,
        configured_reward_coins=excluded.configured_reward_coins,
        expected_duration_minutes_min=excluded.expected_duration_minutes_min,
        expected_duration_minutes_max=excluded.expected_duration_minutes_max,
        stage_assessment_cycle_id=excluded.stage_assessment_cycle_id,
        activation_state=excluded.activation_state,
        activation_reason=excluded.activation_reason,
        activation_source=excluded.activation_source,
        cooldown_until=excluded.cooldown_until,
        teaching_flow_json=excluded.teaching_flow_json,
        experience_summary_json=excluded.experience_summary_json,
        reward_cap_coins=excluded.reward_cap_coins,
        reliability_json=excluded.reliability_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.taskCardId,
      row.programId,
      row.draftId,
      row.learnerId,
      row.workspaceId,
      row.kanbanCardId || "",
      row.title || "",
      row.domain || "",
      row.taskCardType || "",
      row.status || "planned",
      row.plannedDate || "",
      Number(row.plannedMinutes || 0),
      stableJson(row.skillIds || []),
      row.templateId || "",
      stableJson(row.interactionStateMachine || []),
      stableJson(row.sourceBasisRefs || []),
      stableJson(row.curriculumRefs || []),
      row.privacyLevel || "summary_only",
      row.cardRole || "",
      stableJson(row.completionPolicy || {}),
      Number(row.masteryEvidenceWeight || 0),
      row.capabilityClusterId || "",
      Number(row.defaultRewardCoins || 100),
      Number(row.configuredRewardCoins || row.rewardPolicy?.maxCoins || row.rewardCapCoins || 100) || 100,
      Number(row.expectedDurationMinutes?.min || row.expectedDurationMinutesMin || 10) || 10,
      Number(row.expectedDurationMinutes?.max || row.expectedDurationMinutesMax || 15) || 15,
      row.stageAssessmentCycleId || row.stageAssessment?.cycleId || "",
      row.activationState || row.stageAssessment?.activationState || "",
      row.activationReason || row.stageAssessment?.activationReason || "",
      row.activationSource || row.stageAssessment?.activationSource || "",
      row.cooldownUntil || row.stageAssessment?.cooldownUntil || "",
      stableJson(row.teachingFlow || null),
      stableJson(row.experienceSummary || null),
      Number(row.rewardCapCoins || row.rewardPolicy?.maxCoins || row.rewardPolicy?.rewardCapCoins || 100) || 100,
      stableJson(row.reliability || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
    );
    return getTaskCard(row.taskCardId);
  }

  function getTaskCard(taskCardId) {
    migrate();
    return publicTaskCardFromRow(open().prepare("SELECT * FROM learning_task_cards WHERE id = ?").get(cleanString(taskCardId)));
  }

  function listTaskCards(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.draftId) {
      where.push("draft_id = ?");
      values.push(cleanString(filters.draftId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.kanbanCardId) {
      where.push("kanban_card_id = ?");
      values.push(cleanString(filters.kanbanCardId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (filters.cardRole) {
      where.push("card_role = ?");
      values.push(normalizeCardRole(filters.cardRole));
    }
    if (filters.capabilityClusterId) {
      where.push("capability_cluster_id = ?");
      values.push(cleanString(filters.capabilityClusterId));
    }
    if (filters.activationState) {
      where.push("activation_state = ?");
      values.push(cleanString(filters.activationState));
    }
    if (filters.plannedDateFrom) {
      where.push("planned_date >= ?");
      values.push(cleanString(filters.plannedDateFrom));
    }
    if (filters.plannedDateTo) {
      where.push("planned_date <= ?");
      values.push(cleanString(filters.plannedDateTo));
    }
    const limit = Math.max(1, Math.min(300, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learning_task_cards ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY planned_date ASC, created_at ASC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicTaskCardFromRow);
  }

  function saveExperienceSignal(signal) {
    migrate();
    const now = nowIso();
    const signalId = cleanString(signal.signalId || signal.id);
    const createdAt = signal.createdAt || now;
    const row = Object.assign({}, signal, { signalId, createdAt });
    open().prepare(`
      INSERT INTO learning_growth_experience_signals(
        id, task_card_id, program_id, learner_id, learner_workspace_id, workspace_id,
        card_role, capability_cluster_id, signal_type, intensity, summary,
        actor_principal_id, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        signal_type=excluded.signal_type,
        intensity=excluded.intensity,
        summary=excluded.summary,
        actor_principal_id=excluded.actor_principal_id,
        raw_json=excluded.raw_json,
        created_at=excluded.created_at
    `).run(
      row.signalId,
      row.taskCardId,
      row.programId || "",
      row.learnerId,
      row.learnerWorkspaceId || row.learnerId || row.workspaceId,
      row.workspaceId,
      row.cardRole || "",
      row.capabilityClusterId || "",
      row.signalType || "",
      Number(row.intensity || 0),
      row.summary || "",
      row.actorPrincipalId || "",
      stableJson(stripPrivateLearningFields(row.raw || row)),
      createdAt,
    );
    return publicExperienceSignalFromRow(open().prepare("SELECT * FROM learning_growth_experience_signals WHERE id = ?").get(signalId));
  }

  function listExperienceSignals(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.capabilityClusterId) {
      where.push("capability_cluster_id = ?");
      values.push(cleanString(filters.capabilityClusterId));
    }
    if (filters.signalType) {
      where.push("signal_type = ?");
      values.push(cleanString(filters.signalType));
    }
    const limit = Math.max(1, Math.min(300, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learning_growth_experience_signals ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicExperienceSignalFromRow);
  }

  function summarizeExperienceSignals(filters = {}) {
    const rows = listExperienceSignals(filters);
    const counts = {};
    for (const row of rows) counts[row.signalType] = (counts[row.signalType] || 0) + 1;
    return {
      total: rows.length,
      counts,
      latestSignalType: rows[0]?.signalType || "",
      latestSummary: rows[0]?.summary || "",
      latestAt: rows[0]?.createdAt || "",
    };
  }

  function upsertStageAssessmentCycle(cycle) {
    migrate();
    const now = nowIso();
    const cycleId = cleanString(cycle.cycleId || cycle.id);
    const current = getStageAssessmentCycle(cycleId);
    const createdAt = current?.createdAt || cycle.createdAt || now;
    const updatedAt = cycle.updatedAt || now;
    const row = Object.assign({}, cycle, { cycleId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_growth_stage_assessment_cycles(
        id, learner_id, learner_workspace_id, workspace_id, program_id, task_card_id,
        capability_cluster_id, status, trigger_type, activation_reason,
        activated_by_principal_id, activated_at, due_at, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        capability_cluster_id=excluded.capability_cluster_id,
        status=excluded.status,
        trigger_type=excluded.trigger_type,
        activation_reason=excluded.activation_reason,
        activated_by_principal_id=excluded.activated_by_principal_id,
        activated_at=excluded.activated_at,
        due_at=excluded.due_at,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.cycleId,
      row.learnerId,
      row.learnerWorkspaceId || row.learnerId || row.workspaceId,
      row.workspaceId,
      row.programId,
      row.taskCardId || "",
      row.capabilityClusterId || "",
      row.status || "scheduled",
      row.triggerType || "",
      row.activationReason || "",
      row.activatedByPrincipalId || "",
      row.activatedAt || "",
      row.dueAt || "",
      stableJson(stripPrivateLearningFields(row.raw || row)),
      createdAt,
      updatedAt,
    );
    return getStageAssessmentCycle(row.cycleId);
  }

  function getStageAssessmentCycle(cycleId) {
    migrate();
    return publicStageAssessmentCycleFromRow(open().prepare("SELECT * FROM learning_growth_stage_assessment_cycles WHERE id = ?").get(cleanString(cycleId)));
  }

  function listStageAssessmentCycles(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.capabilityClusterId) {
      where.push("capability_cluster_id = ?");
      values.push(cleanString(filters.capabilityClusterId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_growth_stage_assessment_cycles ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicStageAssessmentCycleFromRow);
  }

  function saveInteractionSession(session) {
    migrate();
    const now = nowIso();
    const sessionId = cleanString(session.sessionId || session.id);
    const current = getInteractionSession(sessionId);
    const createdAt = current?.createdAt || session.createdAt || now;
    const updatedAt = session.updatedAt || now;
    const row = Object.assign({}, session, { sessionId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_interaction_sessions(
        id, task_card_id, program_id, learner_id, workspace_id, status,
        current_step, step_history_json, summary, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        program_id=excluded.program_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        status=excluded.status,
        current_step=excluded.current_step,
        step_history_json=excluded.step_history_json,
        summary=excluded.summary,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.sessionId,
      row.taskCardId,
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.status || "active",
      row.currentStep || "",
      stableJson(row.stepHistory || []),
      row.summary || "",
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
    );
    return getInteractionSession(row.sessionId);
  }

  function getInteractionSession(sessionId) {
    migrate();
    return publicInteractionSessionFromRow(open().prepare("SELECT * FROM learning_interaction_sessions WHERE id = ?").get(cleanString(sessionId)));
  }

  function listInteractionSessions(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_interaction_sessions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicInteractionSessionFromRow);
  }

  function saveEvaluation(evaluation) {
    migrate();
    const createdAt = evaluation.createdAt || nowIso();
    const row = Object.assign({}, evaluation, {
      evaluationId: cleanString(evaluation.evaluationId || evaluation.id),
      createdAt,
    });
    open().prepare(`
      INSERT INTO learning_evaluations(
        id, task_card_id, session_id, program_id, learner_id, workspace_id,
        status, score, passed, confidence, summary, skill_results_json,
        reward_policy_json, source_basis_refs_json, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        score=excluded.score,
        passed=excluded.passed,
        confidence=excluded.confidence,
        summary=excluded.summary,
        skill_results_json=excluded.skill_results_json,
        reward_policy_json=excluded.reward_policy_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        raw_json=excluded.raw_json,
        created_at=excluded.created_at
    `).run(
      row.evaluationId,
      row.taskCardId,
      row.sessionId,
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.status || "recorded",
      Number(row.score || 0),
      row.passed ? 1 : 0,
      Number(row.confidence || 0),
      row.summary || "",
      stableJson(row.skillResults || []),
      stableJson(row.rewardPolicy || {}),
      stableJson(row.sourceBasisRefs || []),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
    );
    return getEvaluation(row.evaluationId);
  }

  function getEvaluation(evaluationId) {
    migrate();
    return publicEvaluationFromRow(open().prepare("SELECT * FROM learning_evaluations WHERE id = ?").get(cleanString(evaluationId)));
  }

  function listEvaluations(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.sessionId) {
      where.push("session_id = ?");
      values.push(cleanString(filters.sessionId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_evaluations ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicEvaluationFromRow);
  }

  function saveTaskSubmission(submission) {
    migrate();
    const now = nowIso();
    const submissionId = cleanString(submission.submissionId || submission.id);
    const current = getTaskSubmission(submissionId);
    const createdAt = current?.createdAt || submission.createdAt || now;
    const updatedAt = submission.updatedAt || now;
    const submittedAt = submission.submittedAt || now;
    const row = Object.assign({}, submission, {
      submissionId,
      createdAt,
      updatedAt,
      submittedAt,
    });
    open().prepare(`
      INSERT INTO learning_task_submissions(
        id, task_card_id, session_id, program_id, learner_id, workspace_id,
        stage, submission_kind, attempt_no, status, summary, text_digest,
        text_chars, text_words, kanban_card_id, kanban_comment_ref, raw_json,
        submitted_at, withdrawn_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        session_id=excluded.session_id,
        program_id=excluded.program_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        stage=excluded.stage,
        submission_kind=excluded.submission_kind,
        attempt_no=excluded.attempt_no,
        status=excluded.status,
        summary=excluded.summary,
        text_digest=excluded.text_digest,
        text_chars=excluded.text_chars,
        text_words=excluded.text_words,
        kanban_card_id=excluded.kanban_card_id,
        kanban_comment_ref=excluded.kanban_comment_ref,
        raw_json=excluded.raw_json,
        submitted_at=excluded.submitted_at,
        withdrawn_at=excluded.withdrawn_at,
        updated_at=excluded.updated_at
    `).run(
      row.submissionId,
      row.taskCardId,
      row.sessionId,
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.stage || "",
      row.submissionKind || "",
      Number(row.attemptNo || 1),
      row.status || "submitted",
      row.summary || "",
      row.textDigest || "",
      Number(row.textChars || 0),
      Number(row.textWords || 0),
      row.kanbanCardId || "",
      row.kanbanCommentRef || "",
      stableJson(stripPrivateLearningFields(row)),
      submittedAt,
      row.withdrawnAt || "",
      createdAt,
      updatedAt,
    );
    return getTaskSubmission(row.submissionId);
  }

  function getTaskSubmission(submissionId) {
    migrate();
    return publicTaskSubmissionFromRow(open().prepare("SELECT * FROM learning_task_submissions WHERE id = ?").get(cleanString(submissionId)));
  }

  function listTaskSubmissions(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.sessionId) {
      where.push("session_id = ?");
      values.push(cleanString(filters.sessionId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_task_submissions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY submitted_at DESC, updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicTaskSubmissionFromRow);
  }

  function saveGrowthEvaluationJob(job = {}) {
    migrate();
    const now = nowIso();
    const submissionId = cleanString(job.submissionId);
    const taskCardId = cleanString(job.taskCardId);
    const learnerId = cleanString(job.learnerId || job.studentId || job.workspaceId);
    const workspaceId = cleanString(job.workspaceId);
    const jobId = cleanString(job.jobId || job.id) || (submissionId ? `lgjob_${submissionId}` : `lgjob_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`);
    const current = getGrowthEvaluationJob(jobId) || (submissionId ? getGrowthEvaluationJobForSubmission(submissionId) : null);
    const createdAt = current?.createdAt || job.createdAt || now;
    const updatedAt = job.updatedAt || now;
    const row = Object.assign({}, job, { jobId, submissionId, taskCardId, learnerId, workspaceId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_growth_evaluation_jobs(
        id, submission_id, task_card_id, learner_id, workspace_id, status, attempt_count,
        lease_owner, lease_until, last_error, raw_json, available_at,
        created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(submission_id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        status=CASE
          WHEN learning_growth_evaluation_jobs.status = 'done' THEN learning_growth_evaluation_jobs.status
          ELSE excluded.status
        END,
        raw_json=excluded.raw_json,
        available_at=excluded.available_at,
        updated_at=excluded.updated_at
    `).run(
      row.jobId,
      row.submissionId,
      row.taskCardId,
      row.learnerId,
      row.workspaceId,
      cleanString(row.status || "pending"),
      Number(row.attemptCount || 0),
      cleanString(row.leaseOwner),
      cleanString(row.leaseUntil),
      cleanString(row.lastError),
      stableJson(stripPrivateLearningFields(row)),
      cleanString(row.availableAt) || now,
      createdAt,
      updatedAt,
      cleanString(row.completedAt),
    );
    return submissionId ? getGrowthEvaluationJobForSubmission(submissionId) : getGrowthEvaluationJob(jobId);
  }

  function getGrowthEvaluationJob(jobId) {
    migrate();
    return publicGrowthEvaluationJobFromRow(open().prepare("SELECT * FROM learning_growth_evaluation_jobs WHERE id = ?").get(cleanString(jobId)));
  }

  function getGrowthEvaluationJobForSubmission(submissionId) {
    migrate();
    return publicGrowthEvaluationJobFromRow(open().prepare("SELECT * FROM learning_growth_evaluation_jobs WHERE submission_id = ?").get(cleanString(submissionId)));
  }

  function listGrowthEvaluationJobs(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status.map(cleanString).filter(Boolean) : [cleanString(filters.status)].filter(Boolean);
      if (statuses.length === 1) {
        where.push("status = ?");
        values.push(statuses[0]);
      } else if (statuses.length > 1) {
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        values.push(...statuses);
      }
    }
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.availableBefore) {
      where.push("available_at <= ?");
      values.push(cleanString(filters.availableBefore));
    }
    const limit = Math.max(1, Math.min(100, Number(filters.limit || 20) || 20));
    const sql = `SELECT * FROM learning_growth_evaluation_jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY available_at ASC, created_at ASC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicGrowthEvaluationJobFromRow);
  }

  function claimGrowthEvaluationJob(jobId, input = {}) {
    migrate();
    const now = cleanString(input.nowIso) || nowIso();
    const leaseUntil = cleanString(input.leaseUntil) || new Date(Date.parse(now) + 10 * 60 * 1000).toISOString();
    const leaseOwner = cleanString(input.leaseOwner) || "learning-growth-evaluator";
    const result = open().prepare(`
      UPDATE learning_growth_evaluation_jobs
      SET status = 'processing',
          attempt_count = attempt_count + 1,
          lease_owner = ?,
          lease_until = ?,
          updated_at = ?
      WHERE id = ?
        AND status IN ('pending', 'retry', 'processing')
        AND (status <> 'processing' OR lease_until = '' OR lease_until <= ?)
        AND available_at <= ?
    `).run(leaseOwner, leaseUntil, now, cleanString(jobId), now, now);
    if (!result.changes) return null;
    return getGrowthEvaluationJob(jobId);
  }

  function completeGrowthEvaluationJob(jobId, input = {}) {
    migrate();
    const now = cleanString(input.completedAt || input.nowIso) || nowIso();
    open().prepare(`
      UPDATE learning_growth_evaluation_jobs
      SET status = 'done',
          lease_owner = '',
          lease_until = '',
          last_error = '',
          completed_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, cleanString(jobId));
    return getGrowthEvaluationJob(jobId);
  }

  function failGrowthEvaluationJob(jobId, input = {}) {
    migrate();
    const now = cleanString(input.nowIso) || nowIso();
    const status = cleanString(input.status || "retry");
    const availableAt = cleanString(input.availableAt) || now;
    open().prepare(`
      UPDATE learning_growth_evaluation_jobs
      SET status = ?,
          lease_owner = '',
          lease_until = '',
          last_error = ?,
          available_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, cleanString(input.error), availableAt, now, cleanString(jobId));
    return getGrowthEvaluationJob(jobId);
  }

  function saveTaskReflection(reflection) {
    migrate();
    const now = nowIso();
    const reflectionId = cleanString(reflection.reflectionId || reflection.id);
    const current = getTaskReflection(reflectionId);
    const createdAt = current?.createdAt || reflection.createdAt || now;
    const updatedAt = reflection.updatedAt || now;
    const submittedAt = reflection.submittedAt || now;
    const row = Object.assign({}, reflection, {
      reflectionId,
      createdAt,
      updatedAt,
      submittedAt,
    });
    open().prepare(`
      INSERT INTO learning_task_reflections(
        id, task_card_id, session_id, evaluation_id, program_id, learner_id, workspace_id,
        status, mode, score, max_score, summary, transcript_digest, audio_digest,
        evidence_refs_json, raw_json, submitted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        session_id=excluded.session_id,
        evaluation_id=excluded.evaluation_id,
        program_id=excluded.program_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        status=excluded.status,
        mode=excluded.mode,
        score=excluded.score,
        max_score=excluded.max_score,
        summary=excluded.summary,
        transcript_digest=excluded.transcript_digest,
        audio_digest=excluded.audio_digest,
        evidence_refs_json=excluded.evidence_refs_json,
        raw_json=excluded.raw_json,
        submitted_at=excluded.submitted_at,
        updated_at=excluded.updated_at
    `).run(
      row.reflectionId,
      row.taskCardId,
      row.sessionId,
      row.evaluationId || "",
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.status || "submitted",
      row.mode || "spoken",
      Number(row.score || 0),
      Number(row.maxScore || 100),
      row.summary || "",
      row.transcriptDigest || "",
      row.audioDigest || "",
      stableJson(row.evidenceRefs || []),
      stableJson(stripPrivateLearningFields(row)),
      submittedAt,
      createdAt,
      updatedAt,
    );
    return getTaskReflection(row.reflectionId);
  }

  function getTaskReflection(reflectionId) {
    migrate();
    return publicTaskReflectionFromRow(open().prepare("SELECT * FROM learning_task_reflections WHERE id = ?").get(cleanString(reflectionId)));
  }

  function listTaskReflections(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.sessionId) {
      where.push("session_id = ?");
      values.push(cleanString(filters.sessionId));
    }
    if (filters.evaluationId) {
      where.push("evaluation_id = ?");
      values.push(cleanString(filters.evaluationId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_task_reflections ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY submitted_at DESC, updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicTaskReflectionFromRow);
  }

  function saveTaskArtifact(artifact) {
    migrate();
    const now = nowIso();
    const artifactId = cleanString(artifact.artifactId || artifact.id);
    const current = getTaskArtifact(artifactId);
    const createdAt = current?.createdAt || artifact.createdAt || now;
    const updatedAt = artifact.updatedAt || now;
    const row = Object.assign({}, artifact, { artifactId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_task_artifacts(
        id, task_card_id, session_id, evaluation_id, submission_id, reflection_id,
        program_id, learner_id, workspace_id, artifact_type, title, name, mime, size,
        ref_digest, ref_name, status, summary, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_card_id=excluded.task_card_id,
        session_id=excluded.session_id,
        evaluation_id=excluded.evaluation_id,
        submission_id=excluded.submission_id,
        reflection_id=excluded.reflection_id,
        program_id=excluded.program_id,
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        artifact_type=excluded.artifact_type,
        title=excluded.title,
        name=excluded.name,
        mime=excluded.mime,
        size=excluded.size,
        ref_digest=excluded.ref_digest,
        ref_name=excluded.ref_name,
        status=excluded.status,
        summary=excluded.summary,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      row.artifactId,
      row.taskCardId,
      row.sessionId || "",
      row.evaluationId || "",
      row.submissionId || "",
      row.reflectionId || "",
      row.programId,
      row.learnerId,
      row.workspaceId,
      row.artifactType || "",
      row.title || "",
      row.name || "",
      row.mime || "",
      Number(row.size || 0),
      row.refDigest || "",
      row.refName || "",
      row.status || "available",
      row.summary || "",
      stableJson(stripPrivateLearningFields(row.raw || row)),
      createdAt,
      updatedAt,
    );
    return getTaskArtifact(row.artifactId);
  }

  function getTaskArtifact(artifactId) {
    migrate();
    return publicTaskArtifactFromRow(open().prepare("SELECT * FROM learning_task_artifacts WHERE id = ?").get(cleanString(artifactId)));
  }

  function listTaskArtifacts(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.sessionId) {
      where.push("session_id = ?");
      values.push(cleanString(filters.sessionId));
    }
    if (filters.evaluationId) {
      where.push("evaluation_id = ?");
      values.push(cleanString(filters.evaluationId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.artifactType) {
      where.push("artifact_type = ?");
      values.push(cleanString(filters.artifactType));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_task_artifacts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicTaskArtifactFromRow);
  }

  function saveReviewRequest(request) {
    migrate();
    const now = nowIso();
    const requestId = cleanString(request.reviewRequestId || request.id);
    const current = getReviewRequest(requestId);
    const createdAt = current?.createdAt || request.createdAt || now;
    const updatedAt = request.updatedAt || now;
    const row = Object.assign({}, request, { reviewRequestId: requestId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_parent_review_requests(
        id, learner_id, workspace_id, program_id, request_type, resource_type, resource_id,
        idempotency_key, status, reason, summary, risk_flags_json, allowed_actions_json,
        source_basis_refs_json, decision_json, raw_json, created_at, updated_at, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        program_id=excluded.program_id,
        request_type=excluded.request_type,
        resource_type=excluded.resource_type,
        resource_id=excluded.resource_id,
        idempotency_key=excluded.idempotency_key,
        status=excluded.status,
        reason=excluded.reason,
        summary=excluded.summary,
        risk_flags_json=excluded.risk_flags_json,
        allowed_actions_json=excluded.allowed_actions_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        decision_json=excluded.decision_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        decided_at=excluded.decided_at
    `).run(
      row.reviewRequestId,
      row.learnerId,
      row.workspaceId,
      row.programId || "",
      row.requestType || "",
      row.resourceType || "",
      row.resourceId || "",
      row.idempotencyKey || "",
      row.status || "pending",
      row.reason || "",
      row.summary || "",
      stableJson(row.riskFlags || []),
      stableJson(row.allowedActions || []),
      stableJson(row.sourceBasisRefs || []),
      stableJson(row.decision || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.decidedAt || "",
    );
    return getReviewRequest(row.reviewRequestId);
  }

  function getReviewRequest(reviewRequestId) {
    migrate();
    return publicReviewRequestFromRow(open().prepare("SELECT * FROM learning_parent_review_requests WHERE id = ?").get(cleanString(reviewRequestId)));
  }

  function listReviewRequests(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (filters.resourceType) {
      where.push("resource_type = ?");
      values.push(cleanString(filters.resourceType));
    }
    if (filters.requestType) {
      where.push("request_type = ?");
      values.push(cleanString(filters.requestType));
    }
    if (filters.resourceId) {
      where.push("resource_id = ?");
      values.push(cleanString(filters.resourceId));
    }
    if (filters.idempotencyKey) {
      where.push("idempotency_key = ?");
      values.push(cleanString(filters.idempotencyKey));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_parent_review_requests ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicReviewRequestFromRow);
  }

  function saveRewardSettlement(settlement) {
    migrate();
    const now = nowIso();
    const settlementId = cleanString(settlement.rewardSettlementId || settlement.id);
    const current = getRewardSettlement(settlementId);
    const createdAt = current?.createdAt || settlement.createdAt || now;
    const updatedAt = settlement.updatedAt || now;
    const row = Object.assign({}, settlement, { rewardSettlementId: settlementId, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_reward_settlements(
        id, learner_id, workspace_id, program_id, task_card_id, session_id, evaluation_id,
        status, coin_amount, reason, source_type, source_id, idempotency_key,
        review_request_id, ledger_entry_json, raw_json, created_at, updated_at, settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        program_id=excluded.program_id,
        task_card_id=excluded.task_card_id,
        session_id=excluded.session_id,
        evaluation_id=excluded.evaluation_id,
        status=excluded.status,
        coin_amount=excluded.coin_amount,
        reason=excluded.reason,
        source_type=excluded.source_type,
        source_id=excluded.source_id,
        idempotency_key=excluded.idempotency_key,
        review_request_id=excluded.review_request_id,
        ledger_entry_json=excluded.ledger_entry_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at,
        settled_at=excluded.settled_at
    `).run(
      row.rewardSettlementId,
      row.learnerId,
      row.workspaceId,
      row.programId || "",
      row.taskCardId || "",
      row.sessionId || "",
      row.evaluationId || "",
      row.status || "ready",
      Number(row.coinAmount || 0),
      row.reason || "",
      row.sourceType || "",
      row.sourceId || "",
      row.idempotencyKey || "",
      row.reviewRequestId || "",
      stableJson(row.ledgerEntry || null),
      stableJson(stripPrivateLearningFields(row)),
      createdAt,
      updatedAt,
      row.settledAt || "",
    );
    return getRewardSettlement(row.rewardSettlementId);
  }

  function getRewardSettlement(rewardSettlementId) {
    migrate();
    return publicRewardSettlementFromRow(open().prepare("SELECT * FROM learning_reward_settlements WHERE id = ?").get(cleanString(rewardSettlementId)));
  }

  function listRewardSettlements(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.programId) {
      where.push("program_id = ?");
      values.push(cleanString(filters.programId));
    }
    if (filters.taskCardId) {
      where.push("task_card_id = ?");
      values.push(cleanString(filters.taskCardId));
    }
    if (filters.sessionId) {
      where.push("session_id = ?");
      values.push(cleanString(filters.sessionId));
    }
    if (filters.evaluationId) {
      where.push("evaluation_id = ?");
      values.push(cleanString(filters.evaluationId));
    }
    if (filters.status) {
      where.push("status = ?");
      values.push(cleanString(filters.status));
    }
    if (filters.idempotencyKey) {
      where.push("idempotency_key = ?");
      values.push(cleanString(filters.idempotencyKey));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_reward_settlements ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicRewardSettlementFromRow);
  }

  function masteryStateId(input = {}) {
    return cleanString(input.masteryStateId || input.id) || stableId("lgms", [
      input.learnerId,
      input.workspaceId,
      input.taxonomyVersion,
      input.domain,
      input.strand,
      input.skillId,
      input.microSkillId || "",
    ]);
  }

  function upsertMasteryState(input = {}) {
    migrate();
    const now = nowIso();
    const id = masteryStateId(input);
    const createdAt = cleanString(input.createdAt) || now;
    const updatedAt = cleanString(input.updatedAt) || now;
    const row = Object.assign({}, stripPrivateLearningFields(input) || {}, { masteryStateId: id, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_growth_mastery_states(
        id, learner_id, workspace_id, taxonomy_version, domain, strand, skill_id, micro_skill_id,
        parent_skill_id, node_level, status, stability, confidence, evidence_count,
        positive_evidence_count, negative_evidence_count, recent_success_count, recent_failure_count,
        grade_reference, external_level_reference, difficulty_band, support_level, transfer_level,
        last_evidence_ref, source_basis_refs_json, strengths_json, weaknesses_json,
        error_patterns_json, evidence_summary_json, child_skill_rollup_json, next_recommendation_json,
        raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(learner_id, workspace_id, taxonomy_version, domain, strand, skill_id, micro_skill_id) DO UPDATE SET
        status=excluded.status,
        stability=excluded.stability,
        confidence=excluded.confidence,
        evidence_count=excluded.evidence_count,
        positive_evidence_count=excluded.positive_evidence_count,
        negative_evidence_count=excluded.negative_evidence_count,
        recent_success_count=excluded.recent_success_count,
        recent_failure_count=excluded.recent_failure_count,
        grade_reference=excluded.grade_reference,
        external_level_reference=excluded.external_level_reference,
        difficulty_band=excluded.difficulty_band,
        support_level=excluded.support_level,
        transfer_level=excluded.transfer_level,
        last_evidence_ref=excluded.last_evidence_ref,
        source_basis_refs_json=excluded.source_basis_refs_json,
        strengths_json=excluded.strengths_json,
        weaknesses_json=excluded.weaknesses_json,
        error_patterns_json=excluded.error_patterns_json,
        evidence_summary_json=excluded.evidence_summary_json,
        child_skill_rollup_json=excluded.child_skill_rollup_json,
        next_recommendation_json=excluded.next_recommendation_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      id,
      cleanString(row.learnerId),
      cleanString(row.workspaceId),
      cleanString(row.taxonomyVersion),
      cleanString(row.domain),
      cleanString(row.strand),
      cleanString(row.skillId),
      cleanString(row.microSkillId),
      cleanString(row.parentSkillId),
      cleanString(row.nodeLevel || "skill"),
      cleanString(row.status || "observed"),
      cleanString(row.stability),
      Number(row.confidence || 0),
      Number(row.evidenceCount || 0),
      Number(row.positiveEvidenceCount || 0),
      Number(row.negativeEvidenceCount || 0),
      Number(row.recentSuccessCount || 0),
      Number(row.recentFailureCount || 0),
      cleanString(row.gradeReference),
      cleanString(row.externalLevelReference),
      cleanString(row.difficultyBand),
      cleanString(row.supportLevel),
      cleanString(row.transferLevel),
      cleanString(row.lastEvidenceRef),
      stableJson(row.sourceBasisRefs || []),
      stableJson(row.strengths || []),
      stableJson(row.weaknesses || []),
      stableJson(row.errorPatterns || []),
      stableJson(row.evidenceSummary || []),
      stableJson(row.childSkillRollup || {}),
      stableJson(row.nextRecommendation || {}),
      stableJson(row),
      createdAt,
      updatedAt,
    );
    return getMasteryState(row);
  }

  function getMasteryState(filters = {}) {
    migrate();
    const learnerId = cleanString(filters.learnerId);
    const workspaceId = cleanString(filters.workspaceId);
    const taxonomyVersion = cleanString(filters.taxonomyVersion);
    const domain = cleanString(filters.domain);
    const strand = cleanString(filters.strand);
    const skillId = cleanString(filters.skillId);
    const microSkillId = cleanString(filters.microSkillId);
    if (!learnerId || !workspaceId || !taxonomyVersion || !domain || !strand || !skillId) return null;
    return publicGrowthMasteryStateFromRow(open().prepare(`
      SELECT * FROM learning_growth_mastery_states
      WHERE learner_id = ? AND workspace_id = ? AND taxonomy_version = ? AND domain = ? AND strand = ? AND skill_id = ? AND micro_skill_id = ?
    `).get(learnerId, workspaceId, taxonomyVersion, domain, strand, skillId, microSkillId));
  }

  function listMasteryStates(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    for (const [field, column] of [
      ["learnerId", "learner_id"],
      ["workspaceId", "workspace_id"],
      ["taxonomyVersion", "taxonomy_version"],
      ["domain", "domain"],
      ["strand", "strand"],
      ["status", "status"],
      ["skillId", "skill_id"],
    ]) {
      if (filters[field]) {
        where.push(`${column} = ?`);
        values.push(cleanString(filters[field]));
      }
    }
    const limit = Math.max(1, Math.min(500, Number(filters.limit || 100) || 100));
    const sql = `SELECT * FROM learning_growth_mastery_states ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicGrowthMasteryStateFromRow);
  }

  function listMasteryStatesByStrategy(filters = {}) {
    const states = listMasteryStates(filters);
    const nextStrategy = cleanString(filters.nextStrategy);
    if (!nextStrategy) return states;
    return states.filter((state) => cleanString(state.nextRecommendation?.strategy) === nextStrategy);
  }

  function listMasteryStatesDueForReview(filters = {}) {
    migrate();
    const learnerId = cleanString(filters.learnerId);
    const workspaceId = cleanString(filters.workspaceId);
    const domain = cleanString(filters.domain);
    const beforeIso = cleanString(filters.beforeIso || filters.nowIso || nowIso());
    const values = [learnerId, workspaceId, beforeIso];
    const where = ["learner_id = ?", "workspace_id = ?", "updated_at <= ?"];
    if (domain) {
      where.push("domain = ?");
      values.push(domain);
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    return open().prepare(`
      SELECT * FROM learning_growth_mastery_states
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at ASC LIMIT ?
    `).all(...values, limit).map(publicGrowthMasteryStateFromRow);
  }

  function upsertCardTrajectory(input = {}) {
    migrate();
    const now = nowIso();
    const taskCardId = cleanString(input.taskCardId);
    const id = cleanString(input.trajectoryId || input.id) || stableId("lgtraj", [taskCardId || now, input.learnerId, input.workspaceId]);
    const createdAt = cleanString(input.createdAt) || now;
    const updatedAt = cleanString(input.updatedAt) || now;
    const row = Object.assign({}, stripPrivateLearningFields(input) || {}, { trajectoryId: id, createdAt, updatedAt });
    open().prepare(`
      INSERT INTO learning_growth_card_trajectories(
        id, learner_id, workspace_id, sequence_group_id, task_card_id, sequence_index,
        strategy, difficulty_band, grade_reference, target_skill_ids_json, support_skill_ids_json,
        performance_summary, confirmed_strengths_json, remaining_weaknesses_json, mastery_changes_json,
        next_recommendation_json, source_basis_refs_json, raw_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_card_id) DO UPDATE SET
        learner_id=excluded.learner_id,
        workspace_id=excluded.workspace_id,
        sequence_group_id=excluded.sequence_group_id,
        sequence_index=excluded.sequence_index,
        strategy=excluded.strategy,
        difficulty_band=excluded.difficulty_band,
        grade_reference=excluded.grade_reference,
        target_skill_ids_json=excluded.target_skill_ids_json,
        support_skill_ids_json=excluded.support_skill_ids_json,
        performance_summary=excluded.performance_summary,
        confirmed_strengths_json=excluded.confirmed_strengths_json,
        remaining_weaknesses_json=excluded.remaining_weaknesses_json,
        mastery_changes_json=excluded.mastery_changes_json,
        next_recommendation_json=excluded.next_recommendation_json,
        source_basis_refs_json=excluded.source_basis_refs_json,
        raw_json=excluded.raw_json,
        updated_at=excluded.updated_at
    `).run(
      id,
      cleanString(row.learnerId),
      cleanString(row.workspaceId),
      cleanString(row.sequenceGroupId),
      taskCardId,
      Number(row.sequenceIndex || 0),
      cleanString(row.strategy || "stabilize"),
      cleanString(row.difficultyBand),
      cleanString(row.gradeReference),
      stableJson(row.targetSkillIds || []),
      stableJson(row.supportSkillIds || []),
      cleanString(row.performanceSummary, 500),
      stableJson(row.confirmedStrengths || []),
      stableJson(row.remainingWeaknesses || []),
      stableJson(row.masteryChanges || []),
      stableJson(row.nextRecommendation || {}),
      stableJson(row.sourceBasisRefs || []),
      stableJson(row),
      createdAt,
      updatedAt,
    );
    return publicGrowthCardTrajectoryFromRow(open().prepare("SELECT * FROM learning_growth_card_trajectories WHERE task_card_id = ?").get(taskCardId));
  }

  function listCardTrajectories(filters = {}) {
    migrate();
    const values = [];
    const where = [];
    if (filters.learnerId) {
      where.push("learner_id = ?");
      values.push(cleanString(filters.learnerId));
    }
    if (filters.workspaceId) {
      where.push("workspace_id = ?");
      values.push(cleanString(filters.workspaceId));
    }
    if (filters.sequenceGroupId) {
      where.push("sequence_group_id = ?");
      values.push(cleanString(filters.sequenceGroupId));
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit || 50) || 50));
    const sql = `SELECT * FROM learning_growth_card_trajectories ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sequence_index DESC, created_at DESC LIMIT ?`;
    return open().prepare(sql).all(...values, limit).map(publicGrowthCardTrajectoryFromRow);
  }

  function counts(filters = {}) {
    migrate();
    const learnerId = cleanString(filters.learnerId);
    const suffix = learnerId ? " WHERE learner_id = ?" : "";
    const args = learnerId ? [learnerId] : [];
    const count = (table) => Number(open().prepare(`SELECT COUNT(*) AS count FROM ${table}${suffix}`).get(...args)?.count || 0);
    const pending = Number(open().prepare(`SELECT COUNT(*) AS count FROM learning_parent_review_items WHERE status = 'pending'${learnerId ? " AND learner_id = ?" : ""}`).get(...args)?.count || 0);
    const curriculumReferences = Number(open().prepare("SELECT COUNT(*) AS count FROM learning_curriculum_references").get()?.count || 0);
    return {
      programs: count("learning_programs"),
      drafts: count("learning_plan_drafts"),
      reviewItems: count("learning_parent_review_items"),
      pendingReviewItems: pending,
      publications: count("learning_publications"),
      sources: count("learning_sources"),
      goals: count("learning_goals"),
      profiles: count("learner_profiles"),
      skillStates: count("learner_skill_states"),
      curriculumReferences,
      taskCards: count("learning_task_cards"),
      interactionSessions: count("learning_interaction_sessions"),
      evaluations: count("learning_evaluations"),
      taskSubmissions: count("learning_task_submissions"),
      growthEvaluationJobs: count("learning_growth_evaluation_jobs"),
      growthExperienceSignals: count("learning_growth_experience_signals"),
      growthStageAssessmentCycles: count("learning_growth_stage_assessment_cycles"),
      growthMasteryStates: count("learning_growth_mastery_states"),
      growthCardTrajectories: count("learning_growth_card_trajectories"),
      taskReflections: count("learning_task_reflections"),
      taskArtifacts: count("learning_task_artifacts"),
      reviewRequests: count("learning_parent_review_requests"),
      rewardSettlements: count("learning_reward_settlements"),
      taskSeriesRecommendations: count("learning_task_series_recommendations"),
    };
  }

  function saveTaskSeriesRecommendation(recommendation = {}) {
    migrate();
    const createdAt = recommendation.createdAt || nowIso();
    const id = cleanString(recommendation.recommendationRunId || recommendation.id) || `ltsr_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    const row = Object.assign({}, stripPrivateLearningFields(recommendation) || {}, {
      recommendationRunId: id,
      createdAt,
    });
    open().prepare(`
      INSERT INTO learning_task_series_recommendations(
        id, learner_id, workspace_id, domain, model_status, requested_by_principal_id, raw_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanString(row.learnerId),
      cleanString(row.workspaceId),
      cleanString(row.domain || "english"),
      cleanString(row.modelStatus || "completed"),
      cleanString(row.requestedByPrincipalId),
      stableJson(row),
      createdAt,
    );
    return publicTaskSeriesRecommendationFromRow(open().prepare("SELECT * FROM learning_task_series_recommendations WHERE id = ?").get(id));
  }

  function latestTaskSeriesRecommendation(filters = {}) {
    migrate();
    const learnerId = cleanString(filters.learnerId || filters.studentId);
    const workspaceId = cleanString(filters.workspaceId);
    const domain = cleanString(filters.domain || "english");
    if (!learnerId || !workspaceId) return null;
    return publicTaskSeriesRecommendationFromRow(open().prepare(`
      SELECT * FROM learning_task_series_recommendations
      WHERE learner_id = ? AND workspace_id = ? AND domain = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(learnerId, workspaceId, domain));
  }

  function integritySummary() {
    migrate();
    const database = open();
    return {
      schemaVersion: CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
      quickCheck: database.prepare("PRAGMA quick_check").get()?.quick_check || "unknown",
      foreignKeyIssues: database.prepare("PRAGMA foreign_key_check").all().length,
      counts: counts(),
    };
  }

  return {
    close,
    counts,
    dbPath,
    deletePlanDraft,
    claimGrowthEvaluationJob,
    completeGrowthEvaluationJob,
    failGrowthEvaluationJob,
    getEvaluation,
    getGoal,
    getGrowthEvaluationJob,
    getGrowthEvaluationJobForSubmission,
    getInteractionSession,
    getLearnerProfile,
    getMasteryState,
    getPlanDraft,
    getProgram,
    getReviewItem,
    getReviewRequest,
    getRewardSettlement,
    getSource,
    getStageAssessmentCycle,
    getTaskArtifact,
    getTaskCard,
    getTaskReflection,
    getTaskSubmission,
    integritySummary,
    latestDraftForProgram,
    latestTaskSeriesRecommendation,
    listCardTrajectories,
    listCurriculumReferences,
    listEvaluations,
    listExperienceSignals,
    listGrowthEvaluationJobs,
    listGoals,
    listInteractionSessions,
    listMasteryStates,
    listMasteryStatesByStrategy,
    listMasteryStatesDueForReview,
    listPlanDrafts,
    listPrograms,
    listPublications,
    listReviewItems,
    listReviewRequests,
    listRewardSettlements,
    listSkillStates,
    listSources,
    listStageAssessmentCycles,
    listTaskArtifacts,
    listTaskCards,
    listTaskReflections,
    listTaskSubmissions,
    migrate,
    open,
    saveEvaluation,
    saveExperienceSignal,
    saveGrowthEvaluationJob,
    saveInteractionSession,
    savePlanDraft,
    savePublication,
    saveReviewItem,
    saveReviewRequest,
    saveRewardSettlement,
    saveTaskArtifact,
    saveTaskReflection,
    saveTaskSubmission,
    saveTaskSeriesRecommendation,
    summarizeExperienceSignals,
    upsertCardTrajectory,
    upsertStageAssessmentCycle,
    upsertTaskCard,
    upsertCurriculumReference,
    upsertGoal,
    upsertLearnerProfile,
    upsertMasteryState,
    upsertProgram,
    upsertSkillState,
    upsertSource,
  };
}

module.exports = {
  CURRENT_LEARNING_PROGRAM_SCHEMA_VERSION,
  createLearningProgramRepository,
  publicCurriculumReferenceFromRow,
  publicDraftFromRow,
  publicEvaluationFromRow,
  publicExperienceSignalFromRow,
  publicGoalFromRow,
  publicGrowthCardTrajectoryFromRow,
  publicGrowthMasteryStateFromRow,
  publicInteractionSessionFromRow,
  publicLearnerProfileFromRow,
  publicProgramFromRow,
  publicReviewItemFromRow,
  publicReviewRequestFromRow,
  publicRewardSettlementFromRow,
  publicSourceFromRow,
  publicStageAssessmentCycleFromRow,
  publicTaskSeriesRecommendationFromRow,
  publicTaskArtifactFromRow,
  publicTaskCardFromRow,
  publicTaskReflectionFromRow,
  publicTaskSubmissionFromRow,
  stripPrivateLearningFields,
};
