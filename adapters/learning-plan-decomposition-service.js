"use strict";

const crypto = require("node:crypto");
const { buildLearningTaskModel } = require("./learning-task-model-service");

const DAY_MS = 24 * 60 * 60 * 1000;
const LEARNING_GROWTH_CARD_CREATION_SKILL_ID = "learning-growth-card-creation";

function cleanString(value) {
  return String(value ?? "").trim();
}

function compactText(value, limit = 800) {
  const text = cleanString(value).replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;；、]+/);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
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
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value, fallback) {
  const text = cleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function focusIncludes(program, skillId) {
  return uniqueStrings(program.focusAreas).includes(skillId);
}

function taskId(programId, dayIndex, order) {
  return `${programId || "program"}-d${dayIndex + 1}-${order}`;
}

function titleForSkill(skillId) {
  if (skillId === "english_listening_input") return "Listening key points and replay";
  if (skillId === "english_speaking_retell") return "Oral retell and follow-up";
  if (skillId === "english_pronunciation_shadowing") return "Shadowing and pronunciation repair";
  if (skillId === "english_short_writing") return "Short writing with rewrite";
  if (skillId === "english_rewrite_improvement") return "Rewrite improvement";
  if (skillId === "english_vocabulary_active_use") return "Active vocabulary use";
  if (skillId === "english_grammar_in_expression") return "Grammar in expression repair";
  if (skillId === "english_presentation") return "Presentation outline and rehearsal";
  if (skillId === "english_weekly_challenge") return "Weekly integrated English challenge";
  return "Reading comprehension and explanation";
}

function templateForSkill(skillId, templates = []) {
  return templates.find((template) => Array.isArray(template.skillIds) && template.skillIds.length === 1 && template.skillIds[0] === skillId)
    || templates.find((template) => Array.isArray(template.skillIds) && template.skillIds.includes(skillId))
    || templates.find((template) => template.id === "english-mistake-repair-v1")
    || null;
}

function cardTypeForSkill(skillId, dayIndex) {
  if (skillId === "english_listening_input") return "review_card";
  if (skillId === "english_speaking_retell") return dayIndex % 3 === 2 ? "challenge_card" : "single_subject";
  if (skillId === "english_short_writing") return dayIndex % 2 === 1 ? "project_card" : "single_subject";
  if (skillId === "english_rewrite_improvement") return "mistake_repair_card";
  if (skillId === "english_pronunciation_shadowing" || skillId === "english_vocabulary_active_use") return "review_card";
  if (skillId === "english_grammar_in_expression") return "mistake_repair_card";
  if (skillId === "english_presentation") return "project_card";
  if (skillId === "english_weekly_challenge") return "challenge_card";
  return "single_subject";
}

function buildEnglishSkillRotation(program) {
  const focus = uniqueStrings(program.focusAreas);
  const rotation = [];
  if (!focus.length || focusIncludes(program, "english_reading_comprehension")) rotation.push("english_reading_comprehension");
  if (!focus.length || focusIncludes(program, "english_listening_input")) rotation.push("english_listening_input");
  if (!focus.length || focusIncludes(program, "english_speaking_retell")) rotation.push("english_speaking_retell");
  if (focusIncludes(program, "english_pronunciation_shadowing")) rotation.push("english_pronunciation_shadowing");
  if (!focus.length || focusIncludes(program, "english_short_writing")) rotation.push("english_short_writing");
  if (!focus.length || focusIncludes(program, "english_rewrite_improvement")) rotation.push("english_rewrite_improvement");
  if (!focus.length || focusIncludes(program, "english_vocabulary_active_use")) rotation.push("english_vocabulary_active_use");
  if (focusIncludes(program, "english_grammar_in_expression")) rotation.push("english_grammar_in_expression");
  if (focusIncludes(program, "english_presentation")) rotation.push("english_presentation");
  if (focusIncludes(program, "english_weekly_challenge")) rotation.push("english_weekly_challenge");
  return rotation.length ? rotation : ["english_reading_comprehension", "english_speaking_retell", "english_short_writing"];
}

function stateMachineForSkill(skillId) {
  if (skillId === "english_listening_input") {
    return ["receive_task", "ai_sets_listening_goal", "learner_listens", "learner_key_points", "ai_replays_gap", "learner_retries", "ai_evaluation", "next_task_feedback"];
  }
  if (skillId === "english_speaking_retell") {
    return ["receive_task", "ai_explains_goal", "learner_retells", "ai_hint", "learner_retries_retell", "ai_evaluation", "mistake_explanation", "next_task_feedback"];
  }
  if (skillId === "english_pronunciation_shadowing") {
    return ["receive_task", "ai_models_pronunciation", "learner_shadows", "ai_marks_pronunciation_gap", "learner_repeats", "ai_evaluation", "next_task_feedback"];
  }
  if (skillId === "english_short_writing") {
    return ["receive_task", "ai_explains_goal", "learner_drafts", "ai_feedback", "learner_rewrites", "ai_evaluation", "learner_reflects", "next_task_feedback"];
  }
  if (skillId === "english_rewrite_improvement") {
    return [
      "Rewrite the assigned sentence or short paragraph.",
      "Explain what changed and why.",
      "Complete one variant repair after AI feedback.",
    ].join(" ");
  }
  if (skillId === "english_vocabulary_active_use") {
    return ["receive_task", "ai_sets_word_context", "learner_uses_words", "ai_feedback", "learner_repairs_sentence", "ai_evaluation", "next_task_feedback"];
  }
  if (skillId === "english_grammar_in_expression") {
    return ["receive_task", "ai_spots_pattern", "learner_repairs_expression", "ai_explains_rule", "learner_variant_repair", "ai_evaluation", "next_task_feedback"];
  }
  if (skillId === "english_presentation") {
    return ["receive_task", "ai_sets_project_goal", "learner_outlines", "ai_feedback", "learner_rehearses", "ai_evaluation", "learner_reflects", "next_task_feedback"];
  }
  if (skillId === "english_weekly_challenge") {
    return [
      "Complete one integrated weekly English challenge using this week's reading, vocabulary, and expression repairs.",
      "Submit a short answer, one improved sentence, and one reflection.",
    ].join(" ");
  }
  return ["receive_task", "ai_explains_goal", "learner_attempt", "ai_hint", "learner_revision", "ai_evaluation", "mistake_explanation", "learner_restates_reason", "variant_repair", "reward_settlement", "next_task_feedback"];
}

function learnerPromptForSkill(skillId, program = {}, options = {}) {
  const goal = cleanString(program.goalSummary);
  const minutes = clampInt(options.minutes, 8, 45, 15);
  if (skillId === "english_short_writing") {
    return [
      "Write a first draft of 6-8 English sentences.",
      "Topic: one real school or daily-life moment from this week.",
      "Requirements: include one clear opinion, one reason, one concrete example, and at least three active vocabulary words.",
      "Submit the first draft in the Growth task flow, then rewrite it after AI feedback.",
      "Do not submit only a completion note; the answer must be the actual English draft.",
      goal ? `Focus for this program: ${goal}` : "",
    ].filter(Boolean).join(" ");
  }
  if (skillId === "english_vocabulary_active_use") {
    return [
      "Write 5 original English sentences using the target vocabulary in a school or daily-life context.",
      "Each sentence should be specific enough for AI feedback and later correction.",
      "After feedback, repair at least two sentences.",
    ].join(" ");
  }
  if (skillId === "english_grammar_in_expression") {
    return [
      "Repair the target grammar pattern in short English expressions.",
      "Write 4 corrected sentences, explain the pattern in one simple sentence, then complete one variant repair.",
    ].join(" ");
  }
  if (skillId === "english_listening_input") {
    return [
      "Listen to the assigned short input inside the Growth task flow.",
      "Write 3-5 key points in English, then retry the missed part after AI replay guidance.",
    ].join(" ");
  }
  if (skillId === "english_speaking_retell") {
    return [
      "Retell the assigned short material inside the Growth task flow.",
      "First give the main idea, then two details, then retry after AI hints.",
    ].join(" ");
  }
  if (skillId === "english_pronunciation_shadowing") {
    return [
      "Shadow the assigned sentence group inside the Growth task flow.",
      "Repeat after AI marks pronunciation gaps, then submit the repaired attempt.",
    ].join(" ");
  }
  if (skillId === "english_presentation") {
    return [
      "Prepare a short English presentation outline with opening, two main points, and closing.",
      "Rehearse it inside the Growth task flow and improve after AI feedback.",
    ].join(" ");
  }
  return [
    "Complete the assigned English comprehension task inside the Growth task flow.",
    `Spend about ${minutes} minutes, answer the task instruction, revise after hints, and finish the repair step.`,
  ].join(" ");
}

function deliverablesForSkill(skillId) {
  if (skillId === "english_short_writing") return ["first English draft", "AI feedback", "rewritten draft", "one-sentence reflection"];
  if (skillId === "english_rewrite_improvement") return ["rewritten text", "change explanation", "variant repair"];
  if (skillId === "english_vocabulary_active_use") return ["original vocabulary sentences", "AI feedback", "repaired sentences"];
  if (skillId === "english_grammar_in_expression") return ["grammar repair answers", "rule explanation", "variant repair"];
  if (skillId === "english_listening_input") return ["key-point notes", "gap replay feedback", "retry answer"];
  if (skillId === "english_speaking_retell") return ["retell attempt", "AI hint record", "retry retell"];
  if (skillId === "english_pronunciation_shadowing") return ["shadowing attempt", "pronunciation gap feedback", "repaired repeat"];
  if (skillId === "english_presentation") return ["presentation outline", "rehearsal attempt", "feedback-based repair"];
  if (skillId === "english_weekly_challenge") return ["integrated answer", "improved sentence", "one-sentence reflection"];
  return ["learner answer", "AI hint", "revision", "repair step"];
}

function acceptanceForSkill(skillId) {
  if (skillId === "english_short_writing") {
    return [
      "first draft contains 6-8 English sentences",
      "draft includes opinion, reason, example, and three active vocabulary words",
      "rewrite responds to AI feedback",
      "final evaluation and reward settlement are recorded",
    ];
  }
  if (skillId === "english_vocabulary_active_use") return ["5 original sentences submitted", "at least 2 sentences repaired after feedback", "evaluation recorded"];
  if (skillId === "english_rewrite_improvement") return ["rewrite improves clarity or accuracy", "change explanation submitted", "variant repair completed"];
  if (skillId === "english_grammar_in_expression") return ["4 corrected sentences submitted", "pattern explanation submitted", "variant repair completed"];
  if (skillId === "english_listening_input") return ["key points submitted", "missed part retried", "evaluation recorded"];
  if (skillId === "english_speaking_retell") return ["retell attempt submitted", "retry after hint completed", "evaluation recorded"];
  if (skillId === "english_pronunciation_shadowing") return ["shadowing attempt submitted", "pronunciation repair completed", "evaluation recorded"];
  if (skillId === "english_presentation") return ["outline submitted", "rehearsal completed", "feedback repair completed"];
  if (skillId === "english_weekly_challenge") return ["integrated answer uses this week's focus", "one sentence improved", "reflection submitted"];
  return ["answer submitted", "AI feedback generated", "revision completed", "evaluation recorded"];
}

function buildTask(program, options = {}) {
  const template = templateForSkill(options.skillId, options.templates);
  const sourceBasisRefs = uniqueStrings(program.sourceBasisRefs);
  const curriculumRefs = uniqueStrings(program.curriculumRefs);
  const minutes = clampInt(options.minutes, 8, 45, 15);
  const taskModelBase = buildLearningTaskModel({
    skillId: options.skillId,
    domain: program.domain || "english",
    dayIndex: options.dayIndex,
    plannedMinutes: minutes,
  });
  const goal = cleanString(program.goalSummary);
  const learnerPrompt = [
    taskModelBase.learnerInstruction || learnerPromptForSkill(options.skillId, program, { minutes }),
    goal ? `Focus for this program: ${goal}` : "",
  ].filter(Boolean).join(" ");
  const taskModel = Object.assign({}, taskModelBase, {
    learnerInstruction: learnerPrompt,
  });
  return {
    taskId: taskId(program.programId, options.dayIndex, options.order),
    title: taskModel.title || titleForSkill(options.skillId),
    domain: program.domain || "english",
    taskCardType: taskModel.taskCardType,
    involvedSubjects: ["english"],
    skillIds: [options.skillId],
    templateId: template?.id || "",
    skillPath: template?.skillPath || "",
    cardCreationSkillId: LEARNING_GROWTH_CARD_CREATION_SKILL_ID,
    plannedMinutes: minutes,
    interactionStateMachine: taskModel.interactionStateMachine,
    sourceBasisRefs,
    curriculumRefs,
    confidence: sourceBasisRefs.length && curriculumRefs.length ? 0.78 : 0.45,
    privacyLevel: "summary_only",
    aiInputContract: "learning_task_generation_input_v1",
    aiOutputContract: "learning_task_card_v1",
    learnerInstruction: learnerPrompt,
    instruction: learnerPrompt,
    deliverables: taskModel.deliverables,
    acceptance: taskModel.acceptance,
    taskModel,
    taskModelVersion: taskModel.version,
    summary: `${titleForSkill(options.skillId)}. Task instruction: ${learnerPrompt}`,
  };
}

function buildDeterministicDraft(program = {}, options = {}) {
  const templateRegistry = options.templateRegistry || null;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const start = parseDate(program.startDate, now());
  const daysPerWeek = clampInt(program.daysPerWeek, 1, 7, 5);
  const minutesPerDay = clampInt(program.minutesPerDay, 10, 90, 25);
  const tasksPerDay = minutesPerDay >= 45 ? 3 : (minutesPerDay >= 25 ? 2 : 1);
  const templates = templateRegistry && typeof templateRegistry.selectTemplatesForProgram === "function"
    ? templateRegistry.selectTemplatesForProgram(program)
    : [];
  const rotation = buildEnglishSkillRotation(program);
  const dailyPlans = [];
  let rotationIndex = 0;
  for (let dayIndex = 0; dayIndex < daysPerWeek; dayIndex += 1) {
    const date = new Date(start.getTime() + dayIndex * DAY_MS);
    const tasks = [];
    for (let order = 1; order <= tasksPerDay; order += 1) {
      const skillId = rotation[rotationIndex % rotation.length];
      rotationIndex += 1;
      tasks.push(buildTask(program, {
        dayIndex,
        order,
        skillId,
        templates,
        minutes: Math.max(8, Math.floor(minutesPerDay / tasksPerDay)),
      }));
    }
    if (dayIndex === daysPerWeek - 1) {
      tasks.push(buildTask(program, {
        dayIndex,
        order: tasks.length + 1,
        skillId: focusIncludes(program, "english_weekly_challenge") || !uniqueStrings(program.focusAreas).length
          ? "english_weekly_challenge"
          : "english_grammar_in_expression",
        templates,
        minutes: 10,
      }));
      if (tasks[tasks.length - 1].skillIds.includes("english_weekly_challenge")) {
        tasks[tasks.length - 1].taskCardType = "challenge_card";
        tasks[tasks.length - 1].title = "Weekly integrated English challenge";
      } else {
        tasks[tasks.length - 1].taskCardType = "mistake_repair_card";
        tasks[tasks.length - 1].title = "Weekly mistake repair and variant check";
      }
    }
    dailyPlans.push({
      date: isoDate(date),
      dayIndex: dayIndex + 1,
      plannedMinutes: Math.min(minutesPerDay + (dayIndex === daysPerWeek - 1 ? 10 : 0), 100),
      tasks,
    });
  }
  const end = new Date(start.getTime() + Math.max(0, daysPerWeek - 1) * DAY_MS);
  return {
    weekStart: isoDate(start),
    weekEnd: isoDate(end),
    dailyPlans,
    taskCount: dailyPlans.reduce((sum, day) => sum + day.tasks.length, 0),
    sourceBasisRefs: uniqueStrings(program.sourceBasisRefs),
    curriculumRefs: uniqueStrings(program.curriculumRefs),
    generationPolicy: {
      mode: "deterministic-seed-v0.1",
      directDatabase: "sqlite",
      noRawChildContent: true,
    },
  };
}

function templateSummaries(templates = []) {
  return templates.map((template) => ({
    id: compactText(template.id, 80),
    taskCardType: compactText(template.taskCardType, 80),
    skillIds: uniqueStrings(template.skillIds).slice(0, 6),
    activityType: compactText(template.activityType, 80),
  })).slice(0, 20);
}

function safeSourceSummaries(sources = []) {
  return (Array.isArray(sources) ? sources : []).map((source) => ({
    sourceRef: compactText(source.sourceRef || source.ref, 120),
    sourceType: compactText(source.sourceType, 80),
    title: compactText(source.title, 100),
    summary: compactText(source.summary, 260),
    tags: uniqueStrings(source.tags).slice(0, 8),
  })).filter((source) => source.sourceRef || source.summary || source.title).slice(0, 16);
}

function buildModelDraftPrompt(input = {}) {
  const program = input.program || {};
  const seedDraft = input.seedDraft || {};
  const templates = input.templates || [];
  const sources = input.sources || [];
  const payload = {
    program: {
      domain: compactText(program.domain || "english", 60),
      title: compactText(program.title, 160),
      goalSummary: compactText(program.goalSummary || program.requirements, 700),
      focusAreas: uniqueStrings(program.focusAreas).slice(0, 16),
      daysPerWeek: Number(program.daysPerWeek || 0) || 0,
      minutesPerDay: Number(program.minutesPerDay || 0) || 0,
      curriculumRefs: uniqueStrings(program.curriculumRefs).slice(0, 12),
      sourceBasisRefs: uniqueStrings(program.sourceBasisRefs).slice(0, 20),
    },
    availableTemplates: templateSummaries(templates),
    recentLearningState: {
      privacyLevel: "summary_only",
      sources: safeSourceSummaries(sources),
    },
    seedSchedule: {
      weekStart: seedDraft.weekStart,
      weekEnd: seedDraft.weekEnd,
      days: (seedDraft.dailyPlans || []).map((day) => ({
        date: day.date,
        dayIndex: day.dayIndex,
        plannedMinutes: day.plannedMinutes,
        tasks: (day.tasks || []).map((task) => ({
          taskId: task.taskId,
          title: task.title,
          skillIds: task.skillIds,
          activityType: task.taskModel?.activityType,
          taskCardType: task.taskCardType,
          plannedMinutes: task.plannedMinutes,
        })),
      })),
    },
  };
  return [
    "Create the Growth weekly learning plan as strict JSON only.",
    "The model must decide the concrete task sequence from summary-only learning state. Do not simply repeat the seed schedule.",
    "Preserve the same week dates and broadly the same daily time budget. Use only supported skill ids from availableTemplates or seedSchedule.",
    "Use Chinese for teacher-facing planning rationale and concise learner-facing instructions unless the learner output itself must be English.",
    "Do not include raw prompts, full learner answers, full transcripts, full questions, answer keys, endpoints, local paths, secrets, or copied copyrighted questions.",
    "Return schema: {\"dailyPlans\":[{\"date\":\"YYYY-MM-DD\",\"plannedMinutes\":25,\"tasks\":[{\"skillId\":\"english_short_writing\",\"title\":\"...\",\"learnerInstruction\":\"...\",\"plannedMinutes\":15,\"deliverables\":[\"...\"],\"acceptance\":[\"...\"],\"teacherRationale\":\"...\"}]}],\"rationale\":\"...\",\"riskFlags\":[\"...\"]}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function buildModelDraftRepairPrompt(input = {}) {
  const program = input.program || {};
  const seedDraft = input.seedDraft || {};
  const templates = input.templates || [];
  const sources = input.sources || [];
  const previousOutput = compactText(input.previousOutput, 5000);
  const payload = {
    program: {
      programId: cleanString(program.programId),
      learnerId: cleanString(program.learnerId),
      workspaceId: cleanString(program.workspaceId),
      title: compactText(program.title, 160),
      domain: cleanString(program.domain) || "english",
      goalSummary: compactText(program.goalSummary, 600),
      requirements: compactText(program.requirements, 900),
      focusAreas: uniqueStrings(program.focusAreas),
      startDate: cleanString(program.startDate),
      daysPerWeek: clampInt(program.daysPerWeek, 1, 7, 5),
      minutesPerDay: clampInt(program.minutesPerDay, 10, 90, 25),
    },
    availableTemplates: templates.map((template) => ({
      templateId: template.id,
      domain: template.domain,
      skillIds: uniqueStrings(template.skillIds),
      activityType: template.activityType,
      taskCardType: template.taskCardType,
    })),
    recentLearningState: {
      privacyLevel: "summary_only",
      sources: safeSourceSummaries(sources),
    },
    seedSchedule: {
      weekStart: seedDraft.weekStart,
      weekEnd: seedDraft.weekEnd,
      days: (seedDraft.dailyPlans || []).map((day) => ({
        date: day.date,
        dayIndex: day.dayIndex,
        plannedMinutes: day.plannedMinutes,
        taskCount: (day.tasks || []).length,
      })),
    },
    previousModelOutput: previousOutput,
    repairReason: compactText(input.reason || "Initial model output was not valid for the required plan schema.", 300),
  };
  return [
    "Repair the previous Growth weekly learning plan into strict JSON only.",
    "Do not add deterministic fallback content. Use the same program, dates, supported skill ids, and privacy limits.",
    "Return a dailyPlans array matching the seed schedule day count and each day's seed task count.",
    "Use only supported skill ids from availableTemplates or seedSchedule. Do not invent templates or skills.",
    "Use Chinese for teacher-facing planning rationale and concise learner-facing instructions unless the learner output itself must be English.",
    "Do not include raw prompts, full learner answers, full transcripts, full questions, answer keys, endpoints, local paths, secrets, or copied copyrighted questions.",
    "Return schema: {\"dailyPlans\":[{\"date\":\"YYYY-MM-DD\",\"plannedMinutes\":25,\"tasks\":[{\"skillId\":\"english_short_writing\",\"title\":\"...\",\"learnerInstruction\":\"...\",\"plannedMinutes\":15,\"deliverables\":[\"...\"],\"acceptance\":[\"...\"],\"teacherRationale\":\"...\"}]}],\"rationale\":\"...\",\"riskFlags\":[\"model_repair\"]}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function findTemplateSkill(modelTask = {}, fallbackTask = {}) {
  const candidates = uniqueStrings([
    modelTask.skillId,
    ...(modelTask.skillIds || []),
    ...(fallbackTask.skillIds || []),
  ]);
  return candidates.find((skillId) => /^english_[a-z0-9_]+$/.test(skillId)) || uniqueStrings(fallbackTask.skillIds)[0] || "english_reading_comprehension";
}

function normalizeModelDraft(parsed = {}, seedDraft = {}, program = {}, options = {}) {
  const templates = options.templates || [];
  const modelDays = Array.isArray(parsed?.dailyPlans) ? parsed.dailyPlans : [];
  if (!modelDays.length) return null;
  const dailyPlans = (seedDraft.dailyPlans || []).map((seedDay, dayIndex) => {
    const modelDay = modelDays[dayIndex] || {};
    const modelTasks = Array.isArray(modelDay.tasks) ? modelDay.tasks : [];
    const tasks = (seedDay.tasks || []).map((seedTask, taskIndex) => {
      const modelTask = modelTasks[taskIndex] || {};
      const skillId = findTemplateSkill(modelTask, seedTask);
      const base = buildTask(program, {
        dayIndex,
        order: taskIndex + 1,
        skillId,
        templates,
        minutes: clampInt(modelTask.plannedMinutes || seedTask.plannedMinutes, 8, 45, seedTask.plannedMinutes || 15),
      });
      const learnerInstruction = compactText(modelTask.learnerInstruction || modelTask.instruction || base.learnerInstruction, 1400);
      const deliverables = uniqueStrings(modelTask.deliverables).length ? uniqueStrings(modelTask.deliverables).slice(0, 8) : base.deliverables;
      const acceptance = uniqueStrings(modelTask.acceptance).length ? uniqueStrings(modelTask.acceptance).slice(0, 8) : base.acceptance;
      const taskModel = Object.assign({}, base.taskModel, {
        learnerInstruction,
        deliverables,
        acceptance,
        modelDecomposition: {
          mode: "model_assisted_summary_plan_decomposition",
          teacherRationale: compactText(modelTask.teacherRationale || modelTask.rationale, 360),
        },
      });
      return Object.assign({}, base, {
        taskId: seedTask.taskId,
        title: compactText(modelTask.title || base.title, 160),
        learnerInstruction,
        instruction: learnerInstruction,
        deliverables,
        acceptance,
        summary: `${compactText(modelTask.title || base.title, 160)}. Model-planned task instruction: ${learnerInstruction}`,
        taskModel,
      });
    });
    return {
      date: seedDay.date,
      dayIndex: seedDay.dayIndex,
      plannedMinutes: clampInt(modelDay.plannedMinutes || seedDay.plannedMinutes, 10, 100, seedDay.plannedMinutes),
      tasks,
    };
  });
  return Object.assign({}, seedDraft, {
    dailyPlans,
    taskCount: dailyPlans.reduce((sum, day) => sum + day.tasks.length, 0),
    generationPolicy: {
      mode: "model_assisted_summary_plan_decomposition",
      directDatabase: "sqlite",
      noRawChildContent: true,
      privacyLevel: "summary_only",
      modelStatus: "completed",
      rationale: compactText(parsed.rationale, 500),
      riskFlags: uniqueStrings(parsed.riskFlags).slice(0, 8),
    },
  });
}

function markDraftRepaired(draft = {}) {
  return Object.assign({}, draft, {
    generationPolicy: Object.assign({}, draft.generationPolicy || {}, {
      modelRepairApplied: true,
    }),
  });
}

function createLearningPlanDecompositionService(options = {}) {
  const templateRegistry = options.templateRegistry || null;
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : defaultExtractJsonObject;
  const listSources = typeof options.listSources === "function" ? options.listSources : () => [];
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const model = cleanString(options.model || options.automationCreateModel || "automation-create");
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000) || 120000);
  const requireModel = options.requireModel === true;

  async function buildDraft(program = {}) {
    const templates = templateRegistry && typeof templateRegistry.selectTemplatesForProgram === "function"
      ? templateRegistry.selectTemplatesForProgram(program)
      : [];
    const seedDraft = buildDeterministicDraft(program, { templateRegistry, now });
    if (!hermesModelText && requireModel) {
      const err = new Error("Learning plan decomposition requires model assistance");
      err.status = 503;
      throw err;
    }
    if (!hermesModelText) return seedDraft;
    const sources = listSources({
      workspaceId: program.workspaceId,
      learnerId: program.learnerId,
      limit: 20,
    });
    try {
      const output = await hermesModelText({
        input: buildModelDraftPrompt({ program, seedDraft, templates, sources }),
        stream: false,
        store: false,
        model,
        reasoning_effort: "medium",
        conversation: `learning_growth_plan_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        instructions: "Return strict JSON for one model-assisted Growth weekly plan draft.",
        access_policy_context: sanitizePolicy(findWorkspace(program.workspaceId || "owner")?.policy || {}),
      }, timeoutMs);
      const parsed = extractJsonObject(output || "");
      const draft = normalizeModelDraft(parsed, seedDraft, program, { templates });
      if (draft) return draft;
      const repairOutput = await hermesModelText({
        input: buildModelDraftRepairPrompt({
          program,
          seedDraft,
          templates,
          sources,
          previousOutput: output || "",
          reason: parsed ? "Parsed JSON did not match the required dailyPlans schema." : "Initial model output was not valid JSON.",
        }),
        stream: false,
        store: false,
        model,
        reasoning_effort: "medium",
        conversation: `learning_growth_plan_repair_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
        instructions: "Return strict JSON only for a repaired Growth weekly plan draft.",
        access_policy_context: sanitizePolicy(findWorkspace(program.workspaceId || "owner")?.policy || {}),
      }, timeoutMs);
      const repairedParsed = extractJsonObject(repairOutput || "");
      const repairedDraft = normalizeModelDraft(repairedParsed, seedDraft, program, { templates });
      if (repairedDraft) return markDraftRepaired(repairedDraft);
    } catch (err) {
      if (requireModel) {
        const wrapped = new Error(`Learning plan model decomposition failed: ${err.message || err}`);
        wrapped.status = err.status || 502;
        throw wrapped;
      }
    }
    if (requireModel) {
      const err = new Error("Learning plan model decomposition returned invalid JSON");
      err.status = 502;
      throw err;
    }
    return seedDraft;
  }

  return {
    buildDraft,
  };
}

module.exports = {
  LEARNING_GROWTH_CARD_CREATION_SKILL_ID,
  buildModelDraftPrompt,
  createLearningPlanDecompositionService,
};
