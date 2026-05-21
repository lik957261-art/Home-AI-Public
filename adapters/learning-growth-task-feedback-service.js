"use strict";

const {
  activityCoachingContract,
  coachingContractPrompt,
} = require("./learning-growth-task-coaching-contract-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, maxChars = 800) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > maxChars ? text.slice(0, maxChars).trim() : text;
}

function compactArray(value, maxItems = 5, maxChars = 240) {
  return asArray(value)
    .map((item) => compactText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJsonCandidate(candidate = "") {
  const text = cleanString(candidate);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function fencedJsonCandidate(raw = "") {
  const match = cleanString(raw).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : "";
}

function balancedJsonCandidate(raw = "") {
  const text = cleanString(raw);
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function parseJsonObject(text = "", extractJsonObject = null) {
  const raw = cleanString(text);
  if (!raw) return null;
  if (typeof extractJsonObject === "function") {
    try {
      const extracted = extractJsonObject(raw);
      if (extracted && typeof extracted === "object") return extracted;
      if (typeof extracted === "string") {
        const parsed = parseJsonCandidate(extracted);
        if (parsed) return parsed;
      }
    } catch (_) {
      // Fall through to the local tolerant parser.
    }
  }
  const direct = parseJsonCandidate(raw);
  if (direct) return direct;
  const fenced = parseJsonCandidate(fencedJsonCandidate(raw));
  if (fenced) return fenced;
  const balanced = parseJsonCandidate(balancedJsonCandidate(raw));
  if (balanced) return balanced;
  return null;
}

function taskModelFromCard(card = {}) {
  const model = card.learningTaskModel || card.learningGrowthTaskModel || {};
  return model && typeof model === "object" ? model : {};
}

function cardInstruction(card = {}) {
  const model = taskModelFromCard(card);
  return [
    model.learnerInstruction,
    card.kanbanCaseCardGoal,
    card.kanban_case_card_goal,
    card.description,
    card.content,
  ].map(cleanString).filter(Boolean).join("\n");
}

function normalizeSentenceFeedback(items = []) {
  return asArray(items)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const issue = compactText(item.issue, 160);
      const fix = compactText(item.fix || item.revision || item.suggestion, 220);
      const example = compactText(item.example || item.modelSentence, 180);
      const evidence = compactText(item.evidence || item.phrase || "", 120);
      const why = compactText(item.whyItMatters || item.why || "", 180);
      if (!issue && !fix && !example) return null;
      return { evidence, issue, whyItMatters: why, fix, example };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeCriterionFeedback(items = []) {
  return asArray(items)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const dimension = compactText(item.dimension || item.criterion || item.name, 120);
      const observation = compactText(item.observation || item.feedback || item.status, 220);
      const action = compactText(item.action || item.nextAction || item.revision, 240);
      if (!dimension && !observation && !action) return null;
      return { dimension, observation, action };
    })
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeFeedback(parsed = {}, stage = "draft") {
  const feedback = parsed.feedback && typeof parsed.feedback === "object" ? parsed.feedback : parsed;
  const summary = compactText(feedback.summary || parsed.summary, 360);
  const finalConclusion = compactText(feedback.finalConclusion || parsed.finalConclusion, 360);
  const nextPractice = compactText(feedback.nextPractice || parsed.nextPractice, 360);
  const parentNote = compactText(feedback.parentNote || parsed.parentNote, 360);
  const strengths = compactArray(feedback.strengths || parsed.strengths, 4, 220);
  const focusAreas = compactArray(feedback.focusAreas || feedback.revisionFocus || parsed.focusAreas, 5, 260);
  const rewriteChecklist = compactArray(feedback.rewriteChecklist || parsed.rewriteChecklist, 6, 260);
  const reflectionPrompts = compactArray(feedback.reflectionPrompts || parsed.reflectionPrompts, 3, 180);
  const sentenceFeedback = normalizeSentenceFeedback(feedback.sentenceFeedback || parsed.sentenceFeedback);
  const criterionFeedback = normalizeCriterionFeedback(feedback.criterionFeedback || feedback.rubricFeedback || parsed.criterionFeedback || parsed.rubricFeedback);
  return {
    modelAssisted: true,
    stage,
    summary,
    finalConclusion,
    nextPractice,
    parentNote,
    strengths,
    focusAreas,
    rewriteChecklist,
    reflectionPrompts,
    criterionFeedback,
    sentenceFeedback,
  };
}

function buildTaskFeedbackPrompt(input = {}) {
  const card = input.card || {};
  const model = taskModelFromCard(card);
  const evaluation = input.evaluation || {};
  const stage = cleanString(input.stage || evaluation.stage || "draft");
  const activityType = cleanString(model.activityType || evaluation.activityType || "practice") || "practice";
  const coachingContract = activityCoachingContract(activityType);
  const payload = {
    stage,
    deterministicScore: Number(evaluation.score || 0),
    deterministicStatus: cleanString(evaluation.status),
    deterministicIssues: asArray(evaluation.revisionRequirements).slice(0, 8),
    learnerProfile: {
      gradeBand: "grade7",
      languageLevel: "5.5-6 / B1 bridge",
      priority: "English fast improvement",
    },
    task: {
      title: cleanString(card.content || card.title),
      instruction: cardInstruction(card),
      activityType,
      skillId: cleanString(model.skillId),
      deliverables: asArray(model.deliverables || card.kanbanCaseDeliverables).slice(0, 8),
      acceptance: asArray(model.acceptance || card.kanbanCaseAcceptance).slice(0, 8),
    },
    coachingContract,
    studentAnswer: String(input.text || ""),
  };
  return [
    "You are an English learning coach for a Grade 7 learner at B1 bridge level.",
    `Analyze the student's current ${activityType} answer against the task. Give specific teaching feedback, not generic encouragement.`,
    "Use this activity-specific coaching contract as the rubric:",
    coachingContractPrompt(activityType),
    "Return strict JSON only. Do not use Markdown fences.",
    "Do not copy the full student answer. Evidence phrases must be short, at most 12 words each.",
    "Do not invent errors or content not supported by the answer and task.",
    "For draft stage: explain what to revise before final submission.",
    "For final stage: give a final conclusion, what improved, and the next practice focus.",
    "Use Chinese for explanations, but include short corrected English examples where useful.",
    "JSON schema: {\"summary\":\"...\",\"finalConclusion\":\"...\",\"strengths\":[\"...\"],\"focusAreas\":[\"...\"],\"criterionFeedback\":[{\"dimension\":\"...\",\"observation\":\"...\",\"action\":\"...\"}],\"sentenceFeedback\":[{\"evidence\":\"short phrase\",\"issue\":\"...\",\"whyItMatters\":\"...\",\"fix\":\"...\",\"example\":\"short corrected English example\"}],\"rewriteChecklist\":[\"...\"],\"reflectionPrompts\":[\"...\"],\"nextPractice\":\"...\",\"parentNote\":\"...\"}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function applyAiTaskFeedback(evaluation = {}, aiFeedback = {}) {
  if (!aiFeedback || !aiFeedback.modelAssisted) return evaluation;
  const sections = evaluation.feedbackSections || {};
  const strengths = asArray(aiFeedback.strengths);
  const focusAreas = asArray(aiFeedback.focusAreas);
  const criterionFeedback = asArray(aiFeedback.criterionFeedback);
  const rewriteChecklist = asArray(aiFeedback.rewriteChecklist);
  const reflectionPrompts = asArray(aiFeedback.reflectionPrompts);
  const sentenceFeedback = asArray(aiFeedback.sentenceFeedback);
  const merged = Object.assign({}, evaluation, {
    feedbackMethod: "model_assisted",
    aiFeedbackStatus: "completed",
    aiFeedbackAt: cleanString(aiFeedback.generatedAt || new Date().toISOString()),
    summary: aiFeedback.summary || aiFeedback.finalConclusion || evaluation.summary,
    feedbackSections: Object.assign({}, sections, {
      strengths: strengths.length ? strengths : asArray(sections.strengths),
      focusAreas: focusAreas.length ? focusAreas : asArray(sections.focusAreas),
      criterionFeedback: criterionFeedback.length ? criterionFeedback : asArray(sections.criterionFeedback),
      rewriteChecklist: rewriteChecklist.length ? rewriteChecklist : asArray(sections.rewriteChecklist),
      reflectionPrompts: reflectionPrompts.length ? reflectionPrompts : asArray(sections.reflectionPrompts),
      sentenceFeedback: sentenceFeedback.length ? sentenceFeedback : asArray(sections.sentenceFeedback),
      finalConclusion: aiFeedback.finalConclusion,
      nextPractice: aiFeedback.nextPractice,
      parentNote: aiFeedback.parentNote,
    }),
    evidenceRefs: [...new Set(asArray(evaluation.evidenceRefs).concat("learning-growth-task-ai-feedback:v1"))],
  });
  return merged;
}

function createLearningGrowthTaskFeedbackService(options = {}) {
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : null;
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000));
  const model = cleanString(options.model || options.automationCreateModel || "automation-create");

  async function analyze(input = {}) {
    if (!hermesModelText) return { ok: false, status: "unavailable", error: "model feedback service is not configured" };
    const workspaceId = cleanString(input.workspaceId || "owner") || "owner";
    const prompt = buildTaskFeedbackPrompt(input);
    const output = await hermesModelText({
      input: prompt,
      stream: true,
      store: false,
      model,
      reasoning_effort: "medium",
      conversation: `learning_growth_task_feedback_${Date.now()}`,
      instructions: "Return strict JSON learning task feedback only.",
      access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
    }, timeoutMs);
    const parsed = parseJsonObject(output, extractJsonObject);
    if (!parsed) return { ok: false, status: "parse_error", error: "model feedback was not valid JSON" };
    const feedback = normalizeFeedback(parsed, cleanString(input.stage || input.evaluation?.stage || "draft"));
    feedback.generatedAt = new Date().toISOString();
    return { ok: true, status: "completed", feedback };
  }

  return {
    analyze,
    buildTaskFeedbackPrompt,
  };
}

module.exports = {
  applyAiTaskFeedback,
  buildTaskFeedbackPrompt,
  createLearningGrowthTaskFeedbackService,
  normalizeFeedback,
  parseJsonObject,
};
