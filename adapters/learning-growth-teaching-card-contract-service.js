"use strict";

const { CARD_ROLES, normalizeCardRole } = require("./learning-growth-card-role-service");

function cleanString(value, limit = 1200) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  const max = Math.max(1, Number(limit || 1200) || 1200);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3)).trim()}...` : text;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;]+/);
}

function compactList(value, limit = 5, itemLimit = 260) {
  return asArray(value).map((item) => cleanString(item, itemLimit)).filter(Boolean).slice(0, limit);
}

function firstQuestionPrompt(task = {}) {
  const items = asArray(task.questionItems || task.taskModel?.questionItems || task.learningGrowthJitGeneration?.questionItems);
  const item = items.find((entry) => entry && typeof entry === "object" && cleanString(entry.stem || entry.title || entry.answerFormat));
  if (!item) return "";
  return cleanString([item.stem || item.title, item.answerFormat].filter(Boolean).join(" "), 700);
}

function normalizeTeachingFlow(flow = {}, task = {}) {
  const source = flow && typeof flow === "object" ? flow : {};
  const role = normalizeCardRole(task.cardRole || source.cardRole || CARD_ROLES.TEACHING);
  if (role === CARD_ROLES.STAGE_ASSESSMENT) return null;
  const instruction = cleanString(
    source.lesson?.explanation
      || source.explanation
      || task.learnerInstruction
      || task.instruction
      || task.taskModel?.learnerInstruction
      || task.summary
      || task.title,
    1100,
  );
  const examples = compactList(
    source.lesson?.examples
      || source.examples
      || task.focusSignals
      || task.learningGrowthJitGeneration?.focusSignals
      || task.deliverables
      || task.taskModel?.deliverables,
    4,
    220,
  );
  const guidedPrompt = cleanString(
    source.guidedPractice?.prompt
      || source.guidedPracticePrompt
      || source.practice?.prompt
      || task.guidedPracticePrompt
      || task.taskModel?.guidedPracticePrompt
      || "Follow the example and write a short guided attempt.",
    700,
  );
  const quickCheckPrompt = cleanString(
    source.quickCheck?.prompt
      || source.quickCheckPrompt
      || firstQuestionPrompt(task)
      || compactList(task.acceptance || task.taskModel?.acceptance, 3, 180).join(" ")
      || "Write one short check to show what you understood.",
    700,
  );
  const completionCriteria = compactList(
    source.completionCriteria
      || source.quickCheck?.completionCriteria
      || task.acceptance
      || task.taskModel?.acceptance,
    5,
    220,
  );
  return {
    version: "learning-growth-teaching-flow-v1",
    cardRole: role,
    lesson: {
      title: cleanString(source.lesson?.title || source.lessonTitle || task.title || "Learning point", 160),
      explanation: instruction,
      examples,
    },
    guidedPractice: {
      instruction: guidedPrompt,
      hints: compactList(source.guidedPractice?.hints || source.hints || task.focusSignals || task.learningGrowthJitGeneration?.focusSignals, 4, 200),
    },
    quickCheck: {
      instruction: quickCheckPrompt,
      completionCriteria,
    },
  };
}

function withTeachingFlow(card = {}) {
  const flow = normalizeTeachingFlow(card.teachingFlow || card.teaching_flow, card);
  return flow ? Object.assign({}, card, { teachingFlow: flow }) : card;
}

module.exports = {
  normalizeTeachingFlow,
  withTeachingFlow,
};
