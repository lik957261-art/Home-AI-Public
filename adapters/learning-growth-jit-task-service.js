"use strict";

const crypto = require("node:crypto");

const VERSION = "learning-growth-jit-task-v1";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;]+/);
}

function uniqueStrings(value, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const item of asArray(value)) {
    const text = cleanString(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function compactText(value, limit = 160) {
  const text = cleanString(value).replace(/\s+/g, " ");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function sourceRef(source = {}) {
  return cleanString(source.sourceRef || source.ref || (source.sourceType && source.sourceId ? `${source.sourceType}:${source.sourceId}` : source.sourceId));
}

function sourceSignal(source = {}) {
  const tags = uniqueStrings(source.tags || source.focusAreas || source.skillIds, 4).join(", ");
  const summary = compactText(source.summary || source.title, 130);
  return compactText([tags ? `[${tags}]` : "", summary].filter(Boolean).join(" "), 160);
}

function scoreSource(source = {}, program = {}, task = {}) {
  const text = [
    source.sourceType,
    source.title,
    source.summary,
    asArray(source.tags).join(" "),
  ].join(" ").toLowerCase();
  const skillIds = uniqueStrings(task.skillIds || task.taskModel?.skillId || task.taskModel?.skillIds, 8)
    .map((item) => item.toLowerCase());
  let score = 0;
  if (/progress|evaluation|assessment|reflection|cleaned|history|mistake|revision|feedback/.test(text)) score += 5;
  if (/weak|mistake|error|retry|repair|revision|missed|gap|improve|grammar|vocab|pronunciation/.test(text)) score += 4;
  if (/pass|passed|strong|master|accurate|improved|completed/.test(text)) score += 2;
  for (const skillId of skillIds) {
    if (skillId && text.includes(skillId.replace(/^english_/, "").replace(/_/g, " "))) score += 3;
  }
  for (const focus of uniqueStrings(program.focusAreas, 12)) {
    const normalized = focus.toLowerCase().replace(/_/g, " ");
    if (normalized && text.includes(normalized)) score += 1;
  }
  return score;
}

function difficultyBand(signals = []) {
  const text = signals.join(" ").toLowerCase();
  if (/weak|mistake|error|retry|repair|revision|missed|gap|confus|needs? improve|low score/.test(text)) return "repair";
  if (/strong|master|accurate|passed|high score|improved|completed/.test(text)) return "stretch";
  return "steady";
}

function bandInstruction(band) {
  if (band === "repair") return "Keep the scope narrow and repair the most recent weak point before increasing difficulty.";
  if (band === "stretch") return "Use one slightly harder sentence, answer, or explanation than the previous successful attempt.";
  return "Keep today's output specific, complete, and easy to evaluate.";
}

function baseInstruction(task = {}) {
  return compactText(
    task.learnerInstruction
      || task.instruction
      || task.taskModel?.learnerInstruction
      || task.summary
      || task.title
      || "Complete this Growth task in the guided task flow.",
    900,
  );
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

function deterministicSeed(input = {}) {
  const program = input.program || {};
  const task = input.task || {};
  const state = input.recentLearningState || {};
  const ranked = asArray(state.sources)
    .map((source) => Object.assign({}, source, { score: scoreSource(source, program, task) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const signals = ranked.map(sourceSignal).filter(Boolean).slice(0, 3);
  return {
    baseInstruction: baseInstruction(task),
    sourceRefs: uniqueStrings(ranked.map((source) => source.sourceRef), 6),
    focusSignals: signals,
    skillTargets: uniqueStrings(task.skillIds || task.taskModel?.skillId || task.taskModel?.skillIds, 5),
    difficultyBand: difficultyBand(signals),
  };
}

function buildModelPrompt(input = {}, seed = {}) {
  const program = input.program || {};
  const task = input.task || {};
  const state = input.recentLearningState || {};
  const safeSources = asArray(state.sources).slice(0, 12).map((source) => ({
    sourceRef: compactText(source.sourceRef, 120),
    sourceType: compactText(source.sourceType, 80),
    title: compactText(source.title, 80),
    summary: compactText(source.summary, 220),
    tags: uniqueStrings(source.tags, 8),
  }));
  const payload = {
    program: {
      domain: compactText(program.domain || "english", 60),
      goalSummary: compactText(program.goalSummary, 500),
      focusAreas: uniqueStrings(program.focusAreas, 12),
    },
    card: {
      title: compactText(task.title, 120),
      skillIds: uniqueStrings(task.skillIds || task.taskModel?.skillId || task.taskModel?.skillIds, 8),
      activityType: compactText(task.taskModel?.activityType, 80),
      taskCardType: compactText(task.taskCardType || task.taskModel?.taskCardType, 80),
      plannedMinutes: Number(task.plannedMinutes || 0) || 0,
      baseInstruction: seed.baseInstruction,
      deliverables: uniqueStrings(task.deliverables || task.taskModel?.deliverables, 8),
      acceptance: uniqueStrings(task.acceptance || task.taskModel?.acceptance, 8),
    },
    recentLearningState: {
      privacyLevel: "summary_only",
      sources: safeSources,
      deterministicFocusSignals: seed.focusSignals,
      deterministicDifficultyBand: seed.difficultyBand,
    },
  };
  return [
    "Generate the concrete learner-facing Growth task for this card as strict JSON only.",
    "The model must adapt the task to recent summary-only learning state. Do not merely repeat the template.",
    "Use Chinese for explanations/instructions unless the learner output itself must be English.",
    "Do not include raw prompts, answer keys, full transcripts, full learner history, endpoints, local paths, secrets, or copied copyrighted questions.",
    "If you create an exercise, make it original and bounded to this card. Do not provide the hidden answer key.",
    "If the card needs structured questions, return questionItems with stem, choices, and answerFormat. Use stem, not prompt/question/questionText. Do not include answers.",
    "Return schema: {\"learnerInstruction\":\"...\",\"focusSignals\":[\"...\"],\"difficultyBand\":\"repair|steady|stretch\",\"skillTargets\":[\"...\"],\"deliverables\":[\"...\"],\"acceptance\":[\"...\"],\"questionItems\":[{\"id\":\"q1\",\"type\":\"multiple_choice|written\",\"stem\":\"...\",\"choices\":[{\"id\":\"A\",\"text\":\"...\"}],\"answerFormat\":\"...\"}],\"teacherRationale\":\"...\"}",
    JSON.stringify(payload),
  ].join("\n\n");
}

function normalizeModelOutput(parsed = {}, seed = {}, task = {}) {
  const safe = parsed && typeof parsed === "object" ? parsed : {};
  const learnerInstruction = compactText(safe.learnerInstruction || safe.instruction || seed.baseInstruction, 1400);
  const focusSignals = uniqueStrings(safe.focusSignals || seed.focusSignals, 5).map((item) => compactText(item, 180));
  const difficulty = cleanString(safe.difficultyBand || seed.difficultyBand).toLowerCase();
  const difficultyBandValue = ["repair", "steady", "stretch"].includes(difficulty) ? difficulty : seed.difficultyBand;
  const skillTargets = uniqueStrings(safe.skillTargets || seed.skillTargets, 6);
  const deliverables = uniqueStrings(safe.deliverables || task.deliverables || task.taskModel?.deliverables, 8);
  const acceptance = uniqueStrings(safe.acceptance || task.acceptance || task.taskModel?.acceptance, 8);
  const questionItems = normalizeQuestionItems(safe.questionItems || safe.structuredQuestionItems || task.questionItems || task.taskModel?.questionItems);
  return {
    learnerInstruction,
    focusSignals,
    difficultyBand: difficultyBandValue,
    skillTargets,
    deliverables,
    acceptance,
    questionItems,
    teacherRationale: compactText(safe.teacherRationale || safe.rationale, 360),
  };
}

function normalizeQuestionChoice(choice = {}, index = 0) {
  const raw = choice && typeof choice === "object" ? choice : { text: choice };
  const fallbackId = String.fromCharCode(65 + index);
  const id = compactText(raw.id || raw.key || raw.label || fallbackId, 8).replace(/[^A-Za-z0-9_-]/g, "") || fallbackId;
  const text = compactText(raw.text || raw.value || raw.content || raw.label, 240);
  if (!text) return null;
  return { id, text };
}

function normalizeQuestionItems(value) {
  return asArray(value).slice(0, 6).map((item, index) => {
    const raw = item && typeof item === "object" ? item : { stem: item };
    const stem = compactText(raw.stem || raw.body || raw.text || raw.title, 900);
    if (!stem) return null;
    const choices = asArray(raw.choices || raw.options).map(normalizeQuestionChoice).filter(Boolean).slice(0, 6);
    const type = choices.length >= 2 || /choice|select/i.test(raw.type || "") ? "multiple_choice" : "written";
    return {
      id: compactText(raw.id || raw.questionId || `q${index + 1}`, 40) || `q${index + 1}`,
      type,
      title: compactText(raw.title || raw.label || `Question ${index + 1}`, 120),
      stem,
      choices: type === "multiple_choice" ? choices : [],
      requiresReason: raw.requiresReason !== false,
      answerFormat: compactText(raw.answerFormat || (type === "multiple_choice" ? "选择一个选项，并用 1-2 句说明理由。" : "写出推理过程和最终结论。"), 180),
    };
  }).filter(Boolean);
}

function createLearningGrowthJitTaskService(options = {}) {
  const listSources = typeof options.listSources === "function" ? options.listSources : () => [];
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const hermesModelText = typeof options.hermesModelText === "function" ? options.hermesModelText : null;
  const extractJsonObject = typeof options.extractJsonObject === "function" ? options.extractJsonObject : defaultExtractJsonObject;
  const sanitizePolicy = typeof options.sanitizePolicy === "function" ? options.sanitizePolicy : (policy) => policy || {};
  const findWorkspace = typeof options.findWorkspace === "function" ? options.findWorkspace : () => null;
  const model = cleanString(options.model || options.automationCreateModel || "gpt-5.5") || "gpt-5.5";
  const requestedReasoningEffort = cleanString(options.reasoningEffort || options.reasoning_effort || "xhigh").toLowerCase();
  const reasoningEffort = ["low", "medium", "high", "xhigh"].includes(requestedReasoningEffort) ? requestedReasoningEffort : "xhigh";
  const timeoutMs = Math.max(10000, Number(options.timeoutMs || 120000) || 120000);
  const requireModel = options.requireModel === true;

  function recentLearningState(input = {}) {
    const program = input.program || {};
    const draft = input.draft || {};
    const workspaceId = cleanString(input.workspaceId || program.workspaceId || draft.workspaceId);
    const learnerId = cleanString(input.learnerId || program.learnerId || draft.learnerId || workspaceId);
    let sources = [];
    try {
      sources = listSources({ workspaceId, learnerId, limit: Math.max(1, Math.min(80, Number(input.limit || 40) || 40)) }) || [];
    } catch (_) {
      sources = [];
    }
    const bounded = asArray(sources).slice(0, 80).map((source) => ({
      sourceRef: sourceRef(source),
      sourceType: cleanString(source.sourceType),
      title: compactText(source.title, 80),
      summary: compactText(source.summary, 220),
      tags: uniqueStrings(source.tags, 8),
      updatedAt: cleanString(source.updatedAt || source.sourceDate || source.createdAt),
    })).filter((source) => source.sourceRef || source.summary || source.title);
    return {
      version: VERSION,
      workspaceId,
      learnerId,
      generatedAt: nowIso(),
      sources: bounded,
      privacyLevel: "summary_only",
    };
  }

  async function prepareTaskForCard(input = {}) {
    const program = input.program || {};
    const task = input.task || {};
    const state = input.recentLearningState || recentLearningState(input);
    const seed = deterministicSeed({ program, task, recentLearningState: state });
    if (!hermesModelText && requireModel) {
      const err = new Error("Growth JIT task generation requires model assistance");
      err.status = 503;
      throw err;
    }
    let modelOutput = null;
    let modelStatus = "not_configured";
    let modelError = "";
    if (hermesModelText) {
      try {
        const workspaceId = cleanString(input.workspaceId || program.workspaceId || state.workspaceId || "owner") || "owner";
        const output = await hermesModelText({
          input: buildModelPrompt({ program, task, recentLearningState: state }, seed),
          stream: false,
          store: false,
          model,
          reasoning_effort: reasoningEffort,
          conversation: `learning_growth_jit_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
          instructions: "Return strict JSON for one learner-facing Growth task card.",
          access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
        }, timeoutMs);
        modelOutput = normalizeModelOutput(extractJsonObject(output || ""), seed, task);
        modelStatus = modelOutput.learnerInstruction ? "completed" : "parse_error";
      } catch (err) {
        modelStatus = "error";
        modelError = compactText(err.message || err, 240);
      }
    }
    if ((!modelOutput || modelStatus !== "completed") && requireModel) {
      const err = new Error(modelError || "Growth JIT model generation failed");
      err.status = 502;
      throw err;
    }
    const normalized = modelOutput || normalizeModelOutput({}, seed, task);
    const learnerInstruction = normalized.learnerInstruction;
    const jitGeneration = {
      status: "ready",
      ready: true,
      version: VERSION,
      mode: modelOutput ? "model_assisted_summary_state_at_card_creation" : "deterministic_summary_state_at_card_creation",
      generatedAt: nowIso(),
      sourceRefs: seed.sourceRefs,
      focusSignals: normalized.focusSignals,
      skillTargets: normalized.skillTargets,
      difficultyBand: normalized.difficultyBand,
      modelStatus,
      model,
      reasoningEffort,
      privacyLevel: "summary_only",
      materialPolicy: "bounded_instruction_summary_only",
      sequenceIndex: Number(input.sequenceIndex || 0) || 0,
      teacherRationale: normalized.teacherRationale,
    };
    const taskModel = task.taskModel && typeof task.taskModel === "object" ? task.taskModel : {};
    const questionItems = normalized.questionItems;
    return Object.assign({}, task, {
      learnerInstruction,
      instruction: learnerInstruction,
      deliverables: normalized.deliverables,
      acceptance: normalized.acceptance,
      questionItems: questionItems.length ? questionItems : task.questionItems,
      summary: compactText(`${cleanString(task.title) || "Growth task"}. JIT-ready card instruction generated from summary-only recent learning state.`, 260),
      learningGrowthJitGeneration: jitGeneration,
      taskModel: Object.assign({}, taskModel, {
        learnerInstruction,
        deliverables: normalized.deliverables,
        acceptance: normalized.acceptance,
        questionItems: questionItems.length ? questionItems : taskModel.questionItems,
        jitGeneration,
      }),
    });
  }

  return {
    recentLearningState,
    prepareTaskForCard,
  };
}

module.exports = {
  VERSION,
  buildModelPrompt,
  createLearningGrowthJitTaskService,
  normalizeQuestionItems,
};
