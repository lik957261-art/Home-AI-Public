"use strict";

const { assertNoPrivateLearningPayload } = require("./learning-record-privacy-service");

const DEFAULT_WORKSPACE_ID = "weixin_stephen";
const DEFAULT_LEARNER_ID = "weixin_stephen";
const DEFAULT_LEARNER_STAGE = Object.freeze({
  gradeBand: "grade7",
  schoolStage: "middle_school",
  languageLevel: "5.5-6",
  cefrBand: "b1_bridge",
});
const DEFAULT_GRADE7_CURRICULUM_REFS = Object.freeze([
  "cefr-b1-grade7-english-growth",
  "language-level-5_5-6-growth-track",
  "school-english-grade7-current",
  "cefr-b1-reading-bridge",
  "school-english-grade7-writing",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
}

function sourceRefFor(source = {}) {
  return cleanString(source.sourceRef) || `${cleanString(source.sourceType) || "cleaned_history"}:${cleanString(source.sourceId)}`;
}

function normalizedScope(input = {}) {
  const workspaceId = cleanString(input.workspaceId) || DEFAULT_WORKSPACE_ID;
  const learnerId = cleanString(input.learnerId || input.studentId || input.performerWorkspaceId) || workspaceId;
  return {
    workspaceId,
    learnerId,
    learnerName: cleanString(input.learnerName || input.displayName) || (learnerId === DEFAULT_LEARNER_ID ? "\u51e1\u51e1" : learnerId),
  };
}

function defaultEnglishFocusAreas(input = {}) {
  const explicit = uniqueStrings(input.focusAreas || input.focus_areas || input.scope);
  if (explicit.length) return explicit;
  return [
    "english_reading_comprehension",
    "english_listening_input",
    "english_speaking_retell",
    "english_pronunciation_shadowing",
    "english_short_writing",
    "english_rewrite_improvement",
    "english_vocabulary_active_use",
    "english_grammar_in_expression",
    "english_presentation",
    "english_weekly_challenge",
  ];
}

function defaultGoalInput(input = {}, sourceRefs = []) {
  const scope = normalizedScope(input);
  const focusAreas = defaultEnglishFocusAreas(input);
  return Object.assign({}, scope, {
    title: cleanString(input.goalTitle || input.title) || "\u82f1\u8bed\u5feb\u901f\u63d0\u5347\u76ee\u6807",
    domain: cleanString(input.domain) || "english",
    focusAreas,
    targetSummary: cleanString(input.goalSummary || input.targetSummary || input.requirements) || "\u57fa\u4e8e\u5df2\u6e05\u6d17\u5b66\u4e60\u8d44\u6599\uff0c\u7cfb\u7edf\u63d0\u5347\u82f1\u8bed\u9605\u8bfb\u3001\u542c\u529b\u3001\u53e3\u8bed\u3001\u5199\u4f5c\u3001\u8bcd\u6c47\u548c\u8868\u8fbe\u80fd\u529b\u3002",
    priority: Number(input.priority || 90),
    horizon: cleanString(input.horizon) || "short_term",
    targetDate: cleanString(input.targetDate || input.endDate || input.end_date),
    successMetrics: uniqueStrings(input.successMetrics || [
      "\u6bcf\u5468\u5b8c\u6210\u81f3\u5c11 5 \u4e2a\u82f1\u8bed\u4efb\u52a1",
      "\u80fd\u7528\u82f1\u6587\u590d\u8ff0\u9605\u8bfb\u5185\u5bb9",
      "\u80fd\u5b8c\u6210\u77ed\u5199\u4f5c\u5e76\u4fee\u6539\u4e3b\u8981\u9519\u8bef",
      "\u65b0\u8bcd\u80fd\u8fdb\u5165\u4e3b\u52a8\u8868\u8fbe",
    ]),
    sourceBasisRefs: sourceRefs,
    constraints: {
      sourceDirectoryBootstrap: true,
      summaryOnly: true,
      learnerStage: DEFAULT_LEARNER_STAGE,
    },
  });
}

function defaultProgramInput(input = {}, goal, sourceRefs = []) {
  const scope = normalizedScope(input);
  return Object.assign({}, scope, {
    title: cleanString(input.programTitle || input.planTitle) || "\u82f1\u8bed\u5feb\u901f\u63d0\u5347\u8ba1\u5212",
    domain: cleanString(input.domain) || "english",
    focusAreas: defaultEnglishFocusAreas(input),
    goalSummary: cleanString(input.programSummary || input.goalSummary || input.requirements)
      || goal?.targetSummary
      || "\u57fa\u4e8e\u5b66\u4e60\u8d44\u6599\u6458\u8981\u751f\u6210\u82f1\u8bed\u5b66\u4e60\u8303\u56f4\uff0c\u5148\u7531\u5bb6\u957f\u5ba1\u6838\uff0c\u518d\u751f\u6210\u5468\u8ba1\u5212\u4e0e\u4efb\u52a1\u5361\u3002",
    requirements: cleanString(input.requirements)
      || "\u82f1\u8bed\u4e3a\u91cd\u70b9\uff0c\u540c\u65f6\u8986\u76d6\u9605\u8bfb\u7406\u89e3\u3001\u542c\u529b\u8f93\u5165\u3001\u53e3\u8bed\u590d\u8ff0\u3001\u8bed\u97f3\u8ddf\u8bfb\u3001\u77ed\u5199\u4f5c\u3001\u8bcd\u6c47\u6d3b\u7528\u548c\u8bed\u6cd5\u8868\u8fbe\u4fee\u590d\u3002",
    durationDays: Number(input.durationDays || input.duration_days || 28),
    daysPerWeek: Number(input.daysPerWeek || input.days_per_week || 5),
    minutesPerDay: Number(input.minutesPerDay || input.minutes_per_day || 30),
    timeOfDay: cleanString(input.timeOfDay || input.time_of_day) || "19:30",
    sourceBasisRefs: sourceRefs,
    curriculumRefs: uniqueStrings(input.curriculumRefs || input.curriculum_refs || DEFAULT_GRADE7_CURRICULUM_REFS),
    constraints: {
      sourceDirectoryBootstrap: true,
      summaryOnly: true,
      parentReviewBeforePublish: true,
      learnerStage: DEFAULT_LEARNER_STAGE,
    },
    reviewPolicy: {
      parentReviewRequired: true,
      blockOnMissingSource: true,
      blockOnUnsupportedTaskType: true,
    },
  });
}

function createLearningSourceBootstrapService(options = {}) {
  const sourceDirectoryService = options.sourceDirectoryService;
  const goalService = options.goalService;
  const learnerProfileService = options.learnerProfileService;
  const listPrograms = options.listPrograms;
  const createProgram = options.createProgram;
  const updateProgram = options.updateProgram;
  if (!sourceDirectoryService || typeof sourceDirectoryService.importSummaries !== "function") {
    throw new Error("learning source bootstrap service requires sourceDirectoryService");
  }
  if (!goalService || typeof goalService.save !== "function" || typeof goalService.list !== "function") {
    throw new Error("learning source bootstrap service requires goalService");
  }
  if (!learnerProfileService || typeof learnerProfileService.rebuild !== "function") {
    throw new Error("learning source bootstrap service requires learnerProfileService");
  }
  if (typeof listPrograms !== "function" || typeof createProgram !== "function") {
    throw new Error("learning source bootstrap service requires program list/create functions");
  }

  function bootstrap(input = {}) {
    assertNoPrivateLearningPayload(input, "learning source bootstrap");
    const scope = normalizedScope(input);
    const dryRun = Boolean(input.dryRun);
    const sourceImport = sourceDirectoryService.importSummaries(Object.assign({}, input, scope, { dryRun }));
    const sourceRefs = uniqueStrings(asArray(sourceImport.sources).map(sourceRefFor));
    if (!sourceRefs.length && input.allowEmptySource !== true) {
      const err = new Error("No cleaned learning-materials summaries were found for this learner");
      err.status = 409;
      throw err;
    }

    const activeGoals = goalService.list(Object.assign({}, scope, { status: "active", limit: 50 }));
    const existingEnglishGoal = activeGoals.find((goal) => cleanString(goal.domain) === "english") || activeGoals[0] || null;
    const plannedGoal = defaultGoalInput(input, sourceRefs);
    const goal = existingEnglishGoal || (dryRun ? plannedGoal : goalService.save(plannedGoal));
    const goalCreated = !existingEnglishGoal && !dryRun;

    const existingPrograms = listPrograms(Object.assign({}, scope, { limit: 50 }))
      .filter((program) => cleanString(program.status) !== "archived");
    const existingEnglishProgram = existingPrograms.find((program) => cleanString(program.domain) === "english") || null;
    const plannedProgram = defaultProgramInput(input, goal, sourceRefs);
    let program = existingEnglishProgram || (dryRun ? plannedProgram : createProgram(plannedProgram));
    const programCreated = !existingEnglishProgram && !dryRun;
    let programRefreshed = false;
    if (existingEnglishProgram && !dryRun && input.refreshProgram !== false && typeof updateProgram === "function") {
      program = updateProgram(existingEnglishProgram.programId, {
        curriculumRefs: plannedProgram.curriculumRefs,
        constraints: Object.assign({}, existingEnglishProgram.constraints || {}, plannedProgram.constraints || {}),
        sourceBasisRefs: uniqueStrings(asArray(existingEnglishProgram.sourceBasisRefs).concat(sourceRefs)),
      });
      programRefreshed = true;
    }

    const profile = dryRun || input.rebuildProfile === false
      ? null
      : learnerProfileService.rebuild(scope);

    return {
      ok: true,
      dryRun,
      workspaceId: scope.workspaceId,
      learnerId: scope.learnerId,
      sourceImport,
      goal,
      program,
      profile,
      created: {
        sources: sourceImport.counts?.importedSources || 0,
        goal: goalCreated ? 1 : 0,
        program: programCreated ? 1 : 0,
        profile: profile ? 1 : 0,
        programRefreshed: programRefreshed ? 1 : 0,
      },
      reused: {
        goal: existingEnglishGoal ? 1 : 0,
        program: existingEnglishProgram ? 1 : 0,
      },
      nextActions: [
        programCreated || !existingEnglishProgram ? "review_program_scope" : "review_existing_program",
        "generate_weekly_draft",
        "parent_review_before_publish",
      ],
    };
  }

  return {
    bootstrap,
  };
}

module.exports = {
  createLearningSourceBootstrapService,
  DEFAULT_GRADE7_CURRICULUM_REFS,
  DEFAULT_LEARNER_STAGE,
  defaultEnglishFocusAreas,
  defaultGoalInput,
  defaultProgramInput,
};
