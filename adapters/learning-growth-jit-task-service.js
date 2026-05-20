"use strict";

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

function createLearningGrowthJitTaskService(options = {}) {
  const listSources = typeof options.listSources === "function" ? options.listSources : () => [];
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

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

  function prepareTaskForCard(input = {}) {
    const program = input.program || {};
    const task = input.task || {};
    const state = input.recentLearningState || recentLearningState(input);
    const ranked = asArray(state.sources)
      .map((source) => Object.assign({}, source, { score: scoreSource(source, program, task) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const signals = ranked.map(sourceSignal).filter(Boolean).slice(0, 3);
    const band = difficultyBand(signals);
    const skillTargets = uniqueStrings(task.skillIds || task.taskModel?.skillId || task.taskModel?.skillIds, 5);
    const instructionParts = [
      baseInstruction(task),
      signals.length ? `Personalized focus for this card: ${signals.join(" / ")}.` : "",
      bandInstruction(band),
      "Use only the current card instructions and submit the actual answer, not a completion note.",
    ].filter(Boolean);
    const learnerInstruction = compactText(instructionParts.join(" "), 1400);
    const jitGeneration = {
      status: "ready",
      ready: true,
      version: VERSION,
      mode: "summary_state_at_card_creation",
      generatedAt: nowIso(),
      sourceRefs: uniqueStrings(ranked.map((source) => source.sourceRef), 6),
      focusSignals: signals,
      skillTargets,
      difficultyBand: band,
      privacyLevel: "summary_only",
      materialPolicy: "bounded_instruction_summary_only",
      sequenceIndex: Number(input.sequenceIndex || 0) || 0,
    };
    const taskModel = task.taskModel && typeof task.taskModel === "object" ? task.taskModel : {};
    return Object.assign({}, task, {
      learnerInstruction,
      instruction: learnerInstruction,
      summary: compactText(`${cleanString(task.title) || "Growth task"}. JIT-ready card instruction generated from summary-only recent learning state.`, 260),
      learningGrowthJitGeneration: jitGeneration,
      taskModel: Object.assign({}, taskModel, {
        learnerInstruction,
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
  createLearningGrowthJitTaskService,
};
