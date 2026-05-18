"use strict";

const { buildLearningTaskModel } = require("./learning-task-model-service");

const DAY_MS = 24 * 60 * 60 * 1000;
const LEARNING_GROWTH_CARD_CREATION_SKILL_ID = "learning-growth-card-creation";

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
  LEARNING_GROWTH_CARD_CREATION_SKILL_ID,
  createLearningPlanDecompositionService,
};
