"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;；、]+/);
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map(cleanString).filter(Boolean))];
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
  if (skillId === "english_speaking_retell") return "Oral retell and follow-up";
  if (skillId === "english_pronunciation_shadowing") return "Shadowing and pronunciation repair";
  if (skillId === "english_short_writing") return "Short writing with rewrite";
  if (skillId === "english_vocabulary_active_use") return "Active vocabulary use";
  if (skillId === "english_grammar_in_expression") return "Grammar in expression repair";
  return "Reading comprehension and explanation";
}

function templateForSkill(skillId, templates = []) {
  return templates.find((template) => Array.isArray(template.skillIds) && template.skillIds.includes(skillId))
    || templates.find((template) => template.id === "english-mistake-repair-v1")
    || null;
}

function cardTypeForSkill(skillId, dayIndex) {
  if (skillId === "english_speaking_retell") return dayIndex % 3 === 2 ? "challenge_card" : "single_subject";
  if (skillId === "english_short_writing") return dayIndex % 2 === 1 ? "project_card" : "single_subject";
  if (skillId === "english_pronunciation_shadowing" || skillId === "english_vocabulary_active_use") return "review_card";
  if (skillId === "english_grammar_in_expression") return "mistake_repair_card";
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
  if (!focus.length || focusIncludes(program, "english_vocabulary_active_use")) rotation.push("english_vocabulary_active_use");
  if (focusIncludes(program, "english_grammar_in_expression")) rotation.push("english_grammar_in_expression");
  return rotation.length ? rotation : ["english_reading_comprehension", "english_speaking_retell", "english_short_writing"];
}

function buildTask(program, options = {}) {
  const template = templateForSkill(options.skillId, options.templates);
  const sourceBasisRefs = uniqueStrings(program.sourceBasisRefs);
  const curriculumRefs = uniqueStrings(program.curriculumRefs);
  const minutes = clampInt(options.minutes, 8, 45, 15);
  return {
    taskId: taskId(program.programId, options.dayIndex, options.order),
    title: titleForSkill(options.skillId),
    domain: program.domain || "english",
    taskCardType: cardTypeForSkill(options.skillId, options.dayIndex),
    involvedSubjects: ["english"],
    skillIds: [options.skillId],
    templateId: template?.id || "",
    skillPath: template?.skillPath || "",
    plannedMinutes: minutes,
    interactionStateMachine: [
      "receive_task",
      "ai_explains_goal",
      "learner_attempt",
      "ai_hint",
      "learner_revision",
      "ai_evaluation",
      "mistake_explanation",
      "learner_restates_reason",
      "variant_repair",
      "reward_settlement",
      "next_task_feedback",
    ],
    sourceBasisRefs,
    curriculumRefs,
    confidence: sourceBasisRefs.length && curriculumRefs.length ? 0.78 : 0.45,
    privacyLevel: "summary_only",
    aiInputContract: "learning_task_generation_input_v1",
    aiOutputContract: "learning_task_card_v1",
    summary: `${titleForSkill(options.skillId)}; use only referenced source summaries and curriculum references.`,
  };
}

function createLearningPlanDecompositionService(options = {}) {
  const templateRegistry = options.templateRegistry || null;
  const now = typeof options.now === "function" ? options.now : () => new Date();

  function buildDraft(program = {}) {
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
          skillId: "english_grammar_in_expression",
          templates,
          minutes: 10,
        }));
        tasks[tasks.length - 1].taskCardType = "mistake_repair_card";
        tasks[tasks.length - 1].title = "Weekly mistake repair and variant check";
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
        mode: "deterministic-v0.1",
        directDatabase: "sqlite",
        noRawChildContent: true,
      },
    };
  }

  return {
    buildDraft,
  };
}

module.exports = {
  createLearningPlanDecompositionService,
};
