"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const VALID_MODES = new Set(["reading-quiz", "assessment-exam", "programming-assessment"]);
const VALID_ACTIONS = new Set(["load", "hint", "reflection", "review", "reset-question"]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function compactText(value, maxChars = 1000) {
  const text = cleanString(value).replace(/\s+/g, " ");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function normalizeMode(value) {
  const mode = cleanString(value).toLowerCase().replace(/_/g, "-");
  if (mode === "reading" || mode === "study-quiz") return "reading-quiz";
  if (mode === "exam" || mode === "formal-assessment") return "assessment-exam";
  if (mode === "programming" || mode === "coding") return "programming-assessment";
  return VALID_MODES.has(mode) ? mode : "";
}

function normalizeAction(value) {
  const action = cleanString(value).toLowerCase().replace(/_/g, "-") || "load";
  return VALID_ACTIONS.has(action) ? action : "";
}

function safeStorageSegment(value) {
  return cleanString(value).replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80) || "item";
}

function stableQuestionId(question = {}, index = 0) {
  const direct = compactText(question.id || question.questionId || question.question_id || "", 80);
  if (direct) return direct;
  return `q${Math.max(0, Number(index) || 0) + 1}`;
}

function questionHash(question = {}) {
  const text = [
    question.prompt || "",
    question.skill || "",
    ...(Array.isArray(question.choices) ? question.choices : []),
  ].map((item) => cleanString(item)).join("\n");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function normalizeQuestion(input = {}) {
  const question = input && typeof input === "object" ? input : {};
  const index = Math.max(0, Number(question.index ?? question.questionIndex ?? question.question_index ?? 0) || 0);
  return {
    id: stableQuestionId(question, index),
    index,
    skill: compactText(question.skill || "", 120),
    promptPreview: compactText(question.prompt || question.question || "", 240),
    hash: questionHash(question),
  };
}

function guidanceStorePath(artifactService, workspaceId, cardId, currentCard = null) {
  const caseId = cleanString(currentCard?.kanbanCaseId || currentCard?.kanban_case_id || "learning-card");
  const dir = artifactService.readingArtifactDirectory(workspaceId || "owner", caseId, cardId || "card");
  return path.join(dir, "latest-learning-guidance.json");
}

function emptyStore(workspaceId, cardId, nowIso) {
  return {
    schemaVersion: 1,
    workspaceId: cleanString(workspaceId || "owner"),
    cardId: cleanString(cardId || ""),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    modes: {},
  };
}

function normalizeStore(raw, workspaceId, cardId, nowIso) {
  const base = raw && typeof raw === "object" ? raw : emptyStore(workspaceId, cardId, nowIso);
  const modes = base.modes && typeof base.modes === "object" ? base.modes : {};
  return Object.assign(emptyStore(workspaceId, cardId, nowIso), base, {
    schemaVersion: 1,
    workspaceId: cleanString(base.workspaceId || workspaceId || "owner"),
    cardId: cleanString(base.cardId || cardId || ""),
    modes,
  });
}

function emptyModeState(mode, nowIso) {
  return {
    mode,
    phase: "guidance",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    questions: {},
    interactions: [],
  };
}

function normalizeQuestionState(raw = {}, question = {}, nowIso) {
  return Object.assign({
    questionId: question.id,
    questionIndex: question.index,
    questionHash: question.hash,
    skill: question.skill,
    promptPreview: question.promptPreview,
    hintCount: 0,
    lastHint: "",
    reflection: "",
    selectedAnswerIndex: null,
    reviewedAt: "",
    updatedAt: nowIso(),
  }, raw || {}, {
    questionId: cleanString(raw.questionId || question.id),
    questionIndex: Math.max(0, Number(raw.questionIndex ?? question.index) || 0),
    questionHash: cleanString(raw.questionHash || question.hash),
    skill: compactText(raw.skill || question.skill || "", 120),
    promptPreview: compactText(raw.promptPreview || question.promptPreview || "", 240),
    hintCount: Math.max(0, Number(raw.hintCount || 0) || 0),
    lastHint: compactText(raw.lastHint || "", 600),
    reflection: compactText(raw.reflection || "", 1000),
    selectedAnswerIndex: raw.selectedAnswerIndex === null || raw.selectedAnswerIndex === undefined
      ? null
      : Math.max(0, Number(raw.selectedAnswerIndex) || 0),
    reviewedAt: cleanString(raw.reviewedAt || ""),
    updatedAt: cleanString(raw.updatedAt || nowIso()),
  });
}

function modeLabel(mode) {
  if (mode === "reading-quiz") return "\u9605\u8bfb\u7ec3\u4e60";
  if (mode === "programming-assessment") return "\u7f16\u7a0b\u6d4b\u9a8c";
  return "\u6b63\u5f0f\u6d4b\u9a8c";
}

function buildHint(mode, question, nextCount) {
  const skill = question.skill ? `\u8fd9\u9898\u7684\u91cd\u70b9\u662f\u300c${question.skill}\u300d\u3002` : "";
  if (mode === "reading-quiz") {
    if (nextCount <= 1) {
      return `${skill}\u5148\u56de\u5230\u4eca\u5929\u5206\u6790\u91cc\u7684\u8584\u5f31\u70b9\uff1a\u770b\u6e05\u9898\u5e72\u95ee\u7684\u662f\u987a\u5e8f\u3001\u65f6\u6001\u3001\u8bcd\u4e49\u8fd8\u662f\u6545\u4e8b\u7ec6\u8282\uff0c\u518d\u6392\u9664\u4e24\u4e2a\u660e\u663e\u4e0d\u7b26\u7684\u9009\u9879\u3002`;
    }
    return `${skill}\u4e0d\u8981\u76f4\u63a5\u731c\u7b54\u6848\u3002\u5148\u7528\u4e00\u53e5\u8bdd\u5199\u51fa\u201c\u6211\u4e3a\u4ec0\u4e48\u9009\u8fd9\u4e2a\u201d\uff0c\u518d\u5bf9\u7167\u9898\u5e72\u91cc\u7684\u5173\u952e\u8bcd\u548c\u4eca\u5929\u590d\u8ff0\u7684\u9519\u56e0\u3002`;
  }
  if (mode === "programming-assessment") {
    if (nextCount <= 1) {
      return `${skill}\u5148\u5199\u51fa\u8f93\u5165\u3001\u4e2d\u95f4\u72b6\u6001\u548c\u76ee\u6807\u8f93\u51fa\u3002\u5982\u679c\u662f\u4ee3\u7801\u9898\uff0c\u5148\u8ddf\u8e2a\u5faa\u73af\u8fb9\u754c\u3001\u53d8\u91cf\u53d8\u5316\u6216\u51fd\u6570\u8fd4\u56de\u503c\u3002`;
    }
    return `${skill}\u628a\u4f60\u7684\u9009\u9879\u548c\u4e00\u4e2a\u53cd\u4f8b\u6216\u8fb9\u754c\u60c5\u51b5\u5bf9\u7167\u4e00\u4e0b\u3002\u5982\u679c\u8fb9\u754c\u60c5\u51b5\u4e0d\u6210\u7acb\uff0c\u8fd9\u4e2a\u9009\u9879\u5c31\u9700\u8981\u91cd\u770b\u3002`;
  }
  if (nextCount <= 1) {
    return `${skill}\u5148\u628a\u9898\u5e72\u91cc\u7684\u5df2\u77e5\u6761\u4ef6\u548c\u8981\u6c42\u5199\u6210\u4e00\u53e5\u8bdd\uff0c\u518d\u5224\u65ad\u9700\u8981\u7528\u54ea\u4e2a\u65b9\u6cd5\u6216\u6982\u5ff5\u3002`;
  }
  return `${skill}\u68c0\u67e5\u4f60\u662f\u5426\u628a\u201c\u95ee\u7684\u76ee\u6807\u201d\u548c\u201c\u4e2d\u95f4\u7ed3\u679c\u201d\u6df7\u5728\u4e00\u8d77\u3002\u5148\u7b97\u6216\u5224\u65ad\u4e2d\u95f4\u6b65\u9aa4\uff0c\u6700\u540e\u518d\u5bf9\u7167\u9009\u9879\u3002`;
}

function publicQuestionState(state = {}) {
  return {
    questionId: cleanString(state.questionId),
    questionIndex: Math.max(0, Number(state.questionIndex || 0) || 0),
    skill: compactText(state.skill || "", 120),
    hintCount: Math.max(0, Number(state.hintCount || 0) || 0),
    lastHint: compactText(state.lastHint || "", 600),
    reflection: compactText(state.reflection || "", 1000),
    selectedAnswerIndex: state.selectedAnswerIndex === null || state.selectedAnswerIndex === undefined ? null : Number(state.selectedAnswerIndex),
    reviewedAt: cleanString(state.reviewedAt || ""),
    updatedAt: cleanString(state.updatedAt || ""),
  };
}

function publicModeState(modeState = {}) {
  const questions = Object.values(modeState.questions || {})
    .map(publicQuestionState)
    .sort((left, right) => left.questionIndex - right.questionIndex || left.questionId.localeCompare(right.questionId));
  return {
    mode: cleanString(modeState.mode || ""),
    phase: cleanString(modeState.phase || "guidance"),
    updatedAt: cleanString(modeState.updatedAt || ""),
    hintCount: questions.reduce((sum, item) => sum + item.hintCount, 0),
    reflectionCount: questions.filter((item) => item.reflection).length,
    reviewedCount: questions.filter((item) => item.reviewedAt).length,
    questions,
  };
}

function createLearningCardGuidanceService(deps = {}) {
  const artifactService = deps.artifactService;
  if (!artifactService || typeof artifactService.readingArtifactDirectory !== "function") {
    throw new Error("learning card guidance service requires artifactService.readingArtifactDirectory");
  }
  const readJsonStore = typeof deps.readJsonStore === "function" ? deps.readJsonStore : () => null;
  const writeJsonStore = typeof deps.writeJsonStore === "function" ? deps.writeJsonStore : () => {};
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const maxInteractions = Math.max(20, Number(deps.maxInteractions || 120) || 120);

  function readStore(workspaceId, cardId, currentCard = null) {
    const filePath = guidanceStorePath(artifactService, workspaceId, cardId, currentCard);
    return {
      filePath,
      store: normalizeStore(readJsonStore(filePath, null), workspaceId, cardId, nowIso),
    };
  }

  function writeStore(filePath, store) {
    const payload = Object.assign({}, store, { updatedAt: nowIso() });
    writeJsonStore(filePath, payload);
    return payload;
  }

  function modeStateFor(store, mode) {
    const existing = store.modes?.[mode] && typeof store.modes[mode] === "object" ? store.modes[mode] : null;
    const state = Object.assign(emptyModeState(mode, nowIso), existing || {}, {
      mode,
      questions: existing?.questions && typeof existing.questions === "object" ? existing.questions : {},
      interactions: Array.isArray(existing?.interactions) ? existing.interactions : [],
    });
    store.modes[mode] = state;
    return state;
  }

  function getSession(input = {}) {
    const mode = normalizeMode(input.mode);
    if (!mode) return { ok: false, status: 400, error: "Unsupported guidance mode" };
    const workspaceId = cleanString(input.workspaceId || "owner");
    const cardId = cleanString(input.cardId || "");
    if (!cardId) return { ok: false, status: 400, error: "Missing card id" };
    const { store } = readStore(workspaceId, cardId, input.card || null);
    const state = store.modes?.[mode] || emptyModeState(mode, nowIso);
    return {
      ok: true,
      workspaceId,
      cardId,
      label: modeLabel(mode),
      guidance: publicModeState(state),
    };
  }

  function applyAction(input = {}) {
    const mode = normalizeMode(input.mode);
    const action = normalizeAction(input.action);
    if (!mode) return { ok: false, status: 400, error: "Unsupported guidance mode" };
    if (!action) return { ok: false, status: 400, error: "Unsupported guidance action" };
    const workspaceId = cleanString(input.workspaceId || "owner");
    const cardId = cleanString(input.cardId || "");
    if (!cardId) return { ok: false, status: 400, error: "Missing card id" };
    const { filePath, store } = readStore(workspaceId, cardId, input.card || null);
    const modeState = modeStateFor(store, mode);
    const question = normalizeQuestion(input.question || input);
    const key = `${question.id || "q"}:${question.index}`;
    let questionState = normalizeQuestionState(modeState.questions[key], question, nowIso);

    if (action === "reset-question") {
      delete modeState.questions[key];
      modeState.interactions = modeState.interactions.concat({
        at: nowIso(),
        action,
        mode,
        questionId: question.id,
        questionIndex: question.index,
      }).slice(-maxInteractions);
      modeState.updatedAt = nowIso();
      store.modes[mode] = modeState;
      const saved = writeStore(filePath, store);
      return {
        ok: true,
        workspaceId,
        cardId,
        label: modeLabel(mode),
        action,
        guidance: publicModeState(saved.modes[mode]),
      };
    }

    if (action === "hint") {
      questionState.hintCount += 1;
      questionState.lastHint = buildHint(mode, question, questionState.hintCount);
    } else if (action === "reflection") {
      questionState.reflection = compactText(input.reflection || input.thought || "", 1000);
    } else if (action === "review") {
      const selected = Number(input.selectedAnswerIndex ?? input.answerIndex);
      questionState.selectedAnswerIndex = Number.isInteger(selected) && selected >= 0 ? selected : null;
      questionState.reviewedAt = nowIso();
    }

    questionState.updatedAt = nowIso();
    modeState.questions[key] = questionState;
    modeState.interactions = modeState.interactions.concat({
      at: nowIso(),
      action,
      mode,
      questionId: question.id,
      questionIndex: question.index,
    }).slice(-maxInteractions);
    modeState.updatedAt = nowIso();
    store.modes[mode] = modeState;
    const saved = writeStore(filePath, store);
    return {
      ok: true,
      workspaceId,
      cardId,
      label: modeLabel(mode),
      action,
      guidance: publicModeState(saved.modes[mode]),
      question: publicQuestionState(questionState),
    };
  }

  return {
    applyAction,
    getSession,
    normalizeMode,
  };
}

module.exports = {
  createLearningCardGuidanceService,
  normalizeMode,
};
