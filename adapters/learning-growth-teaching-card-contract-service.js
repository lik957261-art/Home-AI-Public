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

function compactKeyPoints(value, limit = 5) {
  return compactList(value, limit, 180);
}

function compactPrerequisites(value, limit = 5) {
  return asArray(value).map((item, index) => {
    const raw = item && typeof item === "object" ? item : { label: item };
    const label = cleanString(raw.label || raw.title || raw.name || raw.id || raw, 160);
    if (!label) return null;
    return {
      id: cleanString(raw.id || `prereq_${index + 1}`, 80),
      label,
      evidence: cleanString(raw.evidence || raw.status || "unknown", 40),
    };
  }).filter(Boolean).slice(0, limit);
}

function compactExampleSteps(value, limit = 5) {
  return asArray(value).map((item, index) => {
    const raw = item && typeof item === "object" ? item : { text: item };
    const text = cleanString(raw.text || raw.content || raw.explanation || raw.code || raw.output || raw, 360);
    if (!text) return null;
    return {
      label: cleanString(raw.label || raw.title || `Step ${index + 1}`, 80),
      text,
    };
  }).filter(Boolean).slice(0, limit);
}

function exampleStepText(step) {
  if (!step || typeof step !== "object") return cleanString(step, 260);
  return cleanString([step.label, step.text].filter(Boolean).join(": "), 300);
}

function compactFallback(value, fallback, limit = 1200) {
  return cleanString(value, limit) || cleanString(fallback, limit);
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
  const learningTarget = compactFallback(
    source.learningTarget || source.target || source.lesson?.title || source.lessonTitle,
    task.title || "Learning point",
    180,
  );
  const microLesson = source.microLesson && typeof source.microLesson === "object" ? source.microLesson : {};
  const workedExample = source.workedExample && typeof source.workedExample === "object" ? source.workedExample : {};
  const workedSteps = compactExampleSteps(workedExample.steps || workedExample.exampleSteps || source.exampleSteps);
  const instruction = cleanString(
    microLesson.learnerFacingText
      || microLesson.text
      || microLesson.explanation
      || source.lesson?.explanation
      || source.explanation
      || task.learnerInstruction
      || task.instruction
      || task.taskModel?.learnerInstruction
      || task.summary
      || task.title,
    1100,
  );
  const microSummary = cleanString(microLesson.summary || source.summary || instruction, 360);
  const directExamples = compactList(source.lesson?.examples || source.examples, 4, 220);
  const workedExampleTexts = workedSteps.map(exampleStepText).filter(Boolean).slice(0, 4);
  const examples = directExamples.length ? directExamples
    : workedExampleTexts.length ? workedExampleTexts
      : compactList(
          task.focusSignals
            || task.learningGrowthJitGeneration?.focusSignals
            || task.deliverables
            || task.taskModel?.deliverables,
          4,
          220,
        );
  const guidedPrompt = cleanString(
    source.guidedPractice?.instruction
      || source.guidedPractice?.prompt
      || source.guidedPracticePrompt
      || source.practice?.instruction
      || source.practice?.prompt
      || task.guidedPracticePrompt
      || task.taskModel?.guidedPracticePrompt
      || "Follow the example and write a short guided attempt.",
    700,
  );
  const quickCheckPrompt = cleanString(
    source.quickCheck?.instruction
      || source.quickCheck?.prompt
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
  const tooHardFallback = source.tooHardFallback && typeof source.tooHardFallback === "object"
    ? {
        action: cleanString(source.tooHardFallback.action || "prerequisite_repair", 80),
        reason: cleanString(source.tooHardFallback.reason || source.tooHardFallback.summary || "", 220),
      }
    : null;
  return {
    version: "learning-growth-teaching-flow-v1",
    cardRole: role,
    generationSource: cleanString(source.generationSource || source.source || source.generatedBy, 80),
    learningTarget,
    whyItMatters: cleanString(source.whyItMatters || source.why || source.context, 260),
    prerequisites: compactPrerequisites(source.prerequisites || source.requiredBefore || source.prerequisiteSignals),
    microLesson: {
      format: cleanString(microLesson.format || "text", 40),
      summary: microSummary,
      learnerFacingText: instruction,
      keyPoints: compactKeyPoints(microLesson.keyPoints || source.keyPoints),
    },
    workedExample: {
      instruction: cleanString(workedExample.instruction || source.workedExampleInstruction || "Read this worked example.", 260),
      steps: workedSteps,
    },
    lesson: {
      title: learningTarget,
      explanation: instruction,
      examples,
    },
    guidedPractice: {
      mode: cleanString(source.guidedPractice?.mode || source.guidedPracticeMode || "short_answer", 40),
      instruction: guidedPrompt,
      hints: compactList(source.guidedPractice?.hints || source.hints || task.focusSignals || task.learningGrowthJitGeneration?.focusSignals, 4, 200),
    },
    quickCheck: {
      mode: cleanString(source.quickCheck?.mode || source.quickCheckMode || "short_answer", 40),
      instruction: quickCheckPrompt,
      completionCriteria,
      expectedEvidence: compactList(source.quickCheck?.expectedEvidence || source.expectedEvidence, 5, 180),
    },
    tooHardFallback,
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
