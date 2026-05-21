"use strict";

const crypto = require("node:crypto");
const {
  assertNoPrivateLearningPayload,
  compactLearningSummary,
} = require("./learning-record-privacy-service");
const { createLearningTemplateRegistryService } = require("./learning-template-registry-service");

const VERSION = "learning-task-series-recommendation-v1";

function cleanString(value) {
  return String(value ?? "").trim();
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && cleanString(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values, limit = 12) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))].slice(0, limit);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function defaultExtractJsonObject(text) {
  const raw = cleanString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (__) {
        return null;
      }
    }
  }
  return null;
}

function templateSummary(template = {}) {
  return {
    templateId: template.id,
    domain: template.domain,
    skillIds: uniqueStrings(template.skillIds, 12),
    title: template.title,
    activityType: template.activityType,
    taskCardType: template.taskCardType,
    interactionMode: template.interactionMode,
    outputContract: template.outputContract,
  };
}

function repositorySummary(repository, input = {}) {
  const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
  const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
  const limit = clampInt(input.limit, 40, 500, 160);
  const safeList = (name, filters) => {
    try {
      return typeof repository?.[name] === "function" ? repository[name](filters) : [];
    } catch (_) {
      return [];
    }
  };
  const profile = typeof repository?.getLearnerProfile === "function" ? repository.getLearnerProfile(learnerId) : null;
  const sources = safeList("listSources", { workspaceId, learnerId, limit: 80 });
  const goals = safeList("listGoals", { workspaceId, learnerId, limit: 20 });
  const programs = safeList("listPrograms", { workspaceId, learnerId, limit: 30 });
  const taskCards = safeList("listTaskCards", { workspaceId, learnerId, limit });
  const evaluations = safeList("listEvaluations", { workspaceId, learnerId, limit });
  const skillStates = safeList("listSkillStates", { workspaceId, learnerId, limit: 60 });
  return {
    privacyLevel: "summary_only",
    workspaceId,
    learnerId,
    profile: profile ? {
      learnerId: profile.learnerId,
      gradeBand: profile.gradeBand,
      languageLevel: profile.languageLevel,
      summary: compactLearningSummary(profile.summary || profile.profileSummary || "", 500),
      strengths: uniqueStrings(profile.strengths, 8),
      weaknesses: uniqueStrings(profile.weaknesses || profile.gaps, 8),
    } : null,
    sources: sources.slice(0, 30).map((source) => ({
      sourceRef: compactLearningSummary(source.sourceRef || source.sourceId || "", 120),
      sourceType: compactLearningSummary(source.sourceType || source.type || "", 80),
      title: compactLearningSummary(source.title || "", 160),
      summary: compactLearningSummary(source.summary || "", 360),
      tags: uniqueStrings(source.tags, 8),
    })),
    goals: goals.slice(0, 12).map((goal) => ({
      goalId: goal.goalId,
      title: compactLearningSummary(goal.title || "", 160),
      summary: compactLearningSummary(goal.summary || goal.goalSummary || "", 360),
      focusAreas: uniqueStrings(goal.focusAreas, 8),
    })),
    programs: programs.slice(0, 16).map((program) => ({
      programId: program.programId,
      title: compactLearningSummary(program.title || "", 160),
      status: program.status,
      focusAreas: uniqueStrings(program.focusAreas, 8),
      goalSummary: compactLearningSummary(program.goalSummary || "", 320),
    })),
    recentTasks: taskCards.slice(0, 40).map((task) => ({
      taskCardId: task.taskCardId,
      title: compactLearningSummary(task.title || "", 160),
      status: task.status,
      templateId: task.templateId,
      skillIds: uniqueStrings(task.skillIds, 8),
      score: task.latestEvaluation?.score,
      completedAt: task.completedAt || task.updatedAt,
    })),
    evaluations: evaluations.slice(0, 40).map((evaluation) => ({
      evaluationId: evaluation.evaluationId,
      taskCardId: evaluation.taskCardId,
      score: evaluation.score,
      passed: Boolean(evaluation.passed),
      confidence: evaluation.confidence,
      summary: compactLearningSummary(evaluation.summary, 320),
      skillResults: asArray(evaluation.skillResults).slice(0, 8).map((result) => ({
        skillId: result.skillId,
        score: result.score,
        summary: compactLearningSummary(result.summary, 180),
      })),
    })),
    skillStates: skillStates.slice(0, 40).map((state) => ({
      skillId: state.skillId,
      level: state.level,
      confidence: state.confidence,
      summary: compactLearningSummary(state.summary || state.evidenceSummary || "", 220),
    })),
  };
}

function buildRecommendationPrompt(summary = {}, templates = []) {
  const payload = {
    version: VERSION,
    learnerSummary: summary,
    availableTemplates: templates.map(templateSummary),
    constraints: {
      outputPrivacy: "summary_only",
      requireRegisteredTemplateId: true,
      requireRegisteredSkillId: true,
      doNotCreateRawQuestionsOrAnswerKeys: true,
      directPublish: false,
      draftOnly: true,
      readingRetellMinimumReadingMinutes: "10-15",
    },
  };
  return [
    "Analyze the learner's summary-only Growth history and recommend task series as strict JSON only.",
    "Every recommendation must use one templateId and one skillId from availableTemplates. Do not invent templates or skills.",
    "Do not include raw prompts, full learner answers, full transcripts, full reading passages, questions, answer keys, endpoints, local paths, or secrets.",
    "For reading retell or speaking retell series, require enough original reading material for 10-15 minutes of reading before recording.",
    "Return schema: {\"analysisSummary\":\"...\",\"weakSignals\":[\"...\"],\"recommendedSeries\":[{\"title\":\"...\",\"templateId\":\"...\",\"skillId\":\"...\",\"rationale\":\"...\",\"requirements\":\"...\",\"sequenceMode\":\"evergreen_jit\",\"durationDays\":28,\"daysPerWeek\":5,\"minutesPerDay\":30,\"recommendedReadingMinutes\":12,\"rewardCapCoins\":100,\"sourceSignalRefs\":[\"...\"]}],\"riskFlags\":[\"...\"]}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function fallbackRecommendation(summary = {}, templates = []) {
  const retell = templates.find((template) => template.id === "english-speaking-retell-v1") || templates[0];
  const skillId = retell?.skillIds?.[0] || "english_speaking_retell";
  return {
    analysisSummary: "No model recommendation was available. Use the strongest registered English Growth template path and keep the first draft review-only.",
    weakSignals: ["recent_summary_requires_owner_review"],
    recommendedSeries: [{
      title: "英语随机阅读复述强化",
      templateId: retell?.id || "english-speaking-retell-v1",
      skillId,
      rationale: "Use summary-only learner history to continue reading input and oral retell practice.",
      requirements: "Generate original reading material suitable for 10-15 minutes of reading, then require an audio retell with main idea, ordered details, and repair after AI feedback.",
      sequenceMode: "evergreen_jit",
      durationDays: 28,
      daysPerWeek: 5,
      minutesPerDay: 35,
      recommendedReadingMinutes: 12,
      rewardCapCoins: 100,
      sourceSignalRefs: uniqueStrings(summary.sources?.map((source) => source.sourceRef), 5),
    }],
    riskFlags: ["deterministic_fallback"],
  };
}

function normalizeSeries(item = {}, templateRegistry) {
  const templateId = pickFirst(item.templateId, item.template_id, item.template);
  const skillId = pickFirst(item.skillId, item.skill_id, item.skill);
  const template = templateRegistry.assertRegisteredTask({
    domain: cleanString(item.domain) || "english",
    templateId,
    skillId,
  });
  const normalizedSkillId = cleanString(skillId);
  const title = compactLearningSummary(item.title || template.title || skillId, 120);
  return {
    recommendationId: cleanString(item.recommendationId) || `lrec_${crypto.randomBytes(6).toString("hex")}`,
    title,
    domain: template.domain || "english",
    templateId: template.id,
    skillId: normalizedSkillId,
    activityType: template.activityType,
    taskCardType: template.taskCardType,
    interactionMode: template.interactionMode,
    outputContract: template.outputContract,
    skillPath: template.skillPath,
    sequenceMode: cleanString(pickFirst(item.sequenceMode, item.sequence_mode)) || "evergreen_jit",
    durationDays: clampInt(pickFirst(item.durationDays, item.duration_days), 7, 366, 28),
    daysPerWeek: clampInt(pickFirst(item.daysPerWeek, item.days_per_week), 1, 7, 5),
    minutesPerDay: clampInt(pickFirst(item.minutesPerDay, item.minutes_per_day), 10, 90, template.activityType === "speaking" ? 35 : 30),
    recommendedReadingMinutes: clampInt(pickFirst(item.recommendedReadingMinutes, item.recommended_reading_minutes, item.readingMinutes, item.reading_minutes), 0, 45, template.activityType === "speaking" ? 12 : 0),
    rewardCapCoins: clampInt(pickFirst(item.rewardCapCoins, item.reward_cap_coins, item.maxCoins, item.max_coins), 1, 1000, 100),
    rationale: compactLearningSummary(item.rationale || "", 420),
    requirements: compactLearningSummary(item.requirements || item.goalSummary || item.goal_summary || "", 700),
    sourceSignalRefs: uniqueStrings(item.sourceSignalRefs || item.source_signal_refs || item.sourceRefs || item.source_refs, 8),
  };
}

function normalizeRecommendation(parsed = {}, templateRegistry, fallback = {}) {
  assertNoPrivateLearningPayload(parsed, "learning task series recommendation");
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const series = asArray(source.recommendedSeries || source.recommended_series || source.recommendedTaskSeries || source.recommended_task_series || source.taskSeries || source.task_series || source.series || source.tasks);
  let normalized = series.map((item) => normalizeSeries(item, templateRegistry));
  let modelStatus = fallback.modelStatus;
  if (!normalized.length) {
    if (!fallback.fallbackRecommendation) {
      const err = new Error("Learning task recommendation returned no supported task series");
      err.status = 502;
      throw err;
    }
    normalized = asArray(fallback.fallbackRecommendation.recommendedSeries).map((item) => normalizeSeries(item, templateRegistry));
    modelStatus = fallback.modelStatus === "completed" ? "model_empty_series_fallback" : fallback.modelStatus;
  }
  return {
    ok: true,
    version: VERSION,
    privacyLevel: "summary_only",
    generatedAt: fallback.generatedAt,
    modelStatus,
    analysisSummary: compactLearningSummary(source.analysisSummary || source.analysis_summary || source.summary || fallback.fallbackRecommendation?.analysisSummary || "", 900),
    weakSignals: uniqueStrings(source.weakSignals || source.weak_signals || source.gaps || fallback.fallbackRecommendation?.weakSignals, 10),
    riskFlags: uniqueStrings(source.riskFlags || source.risk_flags, 10),
    recommendedSeries: normalized.slice(0, 8),
    generationPolicy: {
      mode: modelStatus === "completed" ? "model_assisted_registry_bounded_recommendation" : "deterministic_registry_bounded_recommendation",
      registryRequired: true,
      draftOnly: true,
      privacyLevel: "summary_only",
    },
  };
}

function createLearningTaskSeriesRecommendationService(options = {}) {
  const repository = options.repository;
  const templateRegistry = options.templateRegistry || createLearningTemplateRegistryService();
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : defaultExtractJsonObject;
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const model = cleanString(options.model || options.automationCreateModel || "automation-create");
  const requireModel = options.requireModel === true;
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000) || 120000);

  async function recommendTaskSeries(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const domain = cleanString(input.domain) || "english";
    const summary = repositorySummary(repository, Object.assign({}, input, { workspaceId, learnerId }));
    const templates = templateRegistry.listTemplates({ domain });
    if (!templates.length) {
      const err = new Error("No registered learning templates are available for this domain");
      err.status = 422;
      throw err;
    }
    if (!hermesModelText && requireModel) {
      const err = new Error("Learning task series recommendation requires model assistance");
      err.status = 503;
      throw err;
    }
    const generatedAt = nowIso();
    let parsed = null;
    let modelStatus = "not_configured";
    if (hermesModelText) {
      try {
        const output = await hermesModelText({
          input: buildRecommendationPrompt(summary, templates),
          stream: false,
          store: false,
          model,
          reasoning_effort: "medium",
          conversation: `learning_growth_recommend_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          instructions: "Return strict JSON for summary-only Growth task-series recommendations.",
          access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
        }, timeoutMs);
        parsed = extractJsonObject(output || "");
        modelStatus = parsed ? "completed" : "parse_error";
      } catch (err) {
        if (requireModel) {
          const wrapped = new Error(`Learning task series model recommendation failed: ${err.message || err}`);
          wrapped.status = err.status || 502;
          throw wrapped;
        }
        modelStatus = "error";
      }
    }
    const templateFallback = fallbackRecommendation(summary, templates);
    const recommendation = normalizeRecommendation(
      parsed || templateFallback,
      templateRegistry,
      { generatedAt, modelStatus, fallbackRecommendation: templateFallback },
    );
    return Object.assign(recommendation, {
      workspaceId,
      learnerId,
      availableTemplates: templates.map(templateSummary),
    });
  }

  function programInputFromRecommendation(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "weixin_stephen";
    const learnerId = cleanString(input.learnerId || input.studentId) || workspaceId;
    const series = normalizeSeries(input.recommendation || input.series || {}, templateRegistry);
    const readingRequirement = series.recommendedReadingMinutes
      ? ` For reading-retell cards, generate original reading material for ${series.recommendedReadingMinutes} minutes of reading before recording.`
      : "";
    return {
      workspaceId,
      learnerId,
      learnerName: cleanString(input.learnerName),
      title: series.title,
      domain: series.domain,
      focusAreas: [series.skillId],
      goalSummary: series.rationale || series.title,
      requirements: `${series.requirements || series.rationale || series.title}${readingRequirement}`,
      durationDays: series.durationDays,
      daysPerWeek: series.daysPerWeek,
      minutesPerDay: series.minutesPerDay,
      sourceBasisRefs: series.sourceSignalRefs,
      constraints: {
        noRawChildContentInLogs: true,
        directDatabase: "sqlite",
        recommendedByAiSummary: true,
        templateId: series.templateId,
        sequenceMode: series.sequenceMode,
        recommendedReadingMinutes: series.recommendedReadingMinutes,
        rewardCapCoins: series.rewardCapCoins,
      },
      reviewPolicy: {
        parentReviewRequired: true,
        blockOnMissingSource: true,
        blockOnUnsupportedTaskType: true,
      },
      recommendation: series,
    };
  }

  return {
    programInputFromRecommendation,
    recommendTaskSeries,
  };
}

module.exports = {
  VERSION,
  buildRecommendationPrompt,
  createLearningTaskSeriesRecommendationService,
  normalizeRecommendation,
};
