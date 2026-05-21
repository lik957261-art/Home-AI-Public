"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const defaultAssessmentExamService = require("./assessment-exam-service");
const defaultProgrammingAssessmentTemplateService = require("./programming-assessment-template-service");

const ASSESSMENT_CASE_MODES = new Set(["assessment-plan"]);
const DEFAULT_MAX_QUESTIONS = 40;
const DEFAULT_MODEL_TIMEOUT_MS = 180000;

function cleanString(value) {
  return String(value ?? "").trim();
}

function defaultCompactText(value, maxChars = 1000) {
  const text = String(value ?? "").trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function safeSlug(value, fallback = "assessment") {
  const slug = cleanString(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function defaultNormalizeAssessmentSubjectId(value = "") {
  const text = cleanString(value).toLowerCase();
  if (/programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|\u7f16\u7a0b|\u7a0b\u5f0f|\u7a0b\u5e8f|\u4ee3\u7801|\u4ee3\u78bc|\u7b97\u6cd5|\u5f00\u53d1|\u958b\u767c/.test(text)) return "programming";
  if (/math|\u6570\u5b66|\u6578\u5b78|amc/.test(text)) return "math";
  if (/english|\u82f1\u8bed|\u82f1\u6587|reading|language/.test(text)) return "english";
  if (/science|\u79d1\u5b66|\u79d1\u5b78|physics|chemistry|biology/.test(text)) return "science";
  if (/history|\u5386\u53f2|\u6b77\u53f2/.test(text)) return "history";
  if (/chinese|\u4e2d\u6587|\u8bed\u6587|\u8a9e\u6587/.test(text)) return "chinese";
  return safeSlug(text || "assessment", "assessment").slice(0, 40) || "assessment";
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function assessmentConfigLine(config = {}) {
  return `ASSESSMENT_CONFIG:${Buffer.from(JSON.stringify(config)).toString("base64url")}`;
}

function parseAssessmentConfigLine(text = "") {
  const match = String(text || "").match(/ASSESSMENT_CONFIG:([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function stripAssessmentConfigMarkers(text = "") {
  return String(text || "").replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, "");
}

function assessmentExamUrl(workspaceId, cardId) {
  const params = new URLSearchParams({
    view: "todos",
    workspaceId: String(workspaceId || "owner"),
    todoId: String(cardId || ""),
    assessmentExam: "1",
  });
  return `/?${params.toString()}`;
}

function isKanbanAssessmentCard(card = {}, options = {}) {
  const isStudyMode = typeof options.isKanbanStudyCaseMode === "function"
    ? options.isKanbanStudyCaseMode
    : (mode) => cleanString(mode) === "study-plan";
  const isAssessmentMode = typeof options.isKanbanAssessmentCaseMode === "function"
    ? options.isKanbanAssessmentCaseMode
    : (mode) => ASSESSMENT_CASE_MODES.has(cleanString(mode));
  const mode = cleanString(card?.kanbanCaseMode || card?.kanban_case_mode);
  const template = cleanString(card?.kanbanCaseTemplate || card?.kanban_case_template);
  return isAssessmentMode(mode) || (isStudyMode(mode) && template === "final-assessment");
}

function kanbanAssessmentArchived(card = {}) {
  const kanbanStatus = cleanString(card?.kanbanStatus || card?.kanban_status).toLowerCase();
  const status = cleanString(card?.status).toLowerCase();
  return kanbanStatus === "archived" || status === "cancelled";
}

function publicAssessmentExam(exam = {}, state = {}) {
  return {
    title: String(exam.title || "Formal assessment"),
    subject: String(exam.subject || ""),
    subjectId: String(exam.subjectId || ""),
    questionCount: Number(exam.questionCount || (Array.isArray(exam.questions) ? exam.questions.length : 0)) || 0,
    durationMinutes: Number(exam.durationMinutes || 30) || 30,
    passingScore: Number(exam.passingScore || 80) || 80,
    verification: String(exam.verification || ""),
    startedAt: String(state.startedAt || ""),
    status: String(state.status || "in_progress"),
    questions: (Array.isArray(exam.questions) ? exam.questions : []).map((item, index) => ({
      id: String(item.id || `q${index + 1}`),
      prompt: String(item.prompt || ""),
      choices: Array.isArray(item.choices) ? item.choices.map((choice) => String(choice || "")) : [],
      skill: String(item.skill || ""),
    })),
  };
}

function attemptsPublicTail(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((attempt) => ({
    submittedAt: attempt.submittedAt || "",
    score: Number(attempt.score || 0),
    passed: Boolean(attempt.passed),
  })).slice(-5);
}

function publicAssessmentSummaryFromState(workspaceId, cardId, state = {}, config = {}) {
  const attempts = Array.isArray(state?.attempts) ? state.attempts : [];
  const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  return {
    status: String(state?.status || "not_started"),
    startedAt: String(state?.startedAt || ""),
    completedAt: String(state?.completedAt || ""),
    completionError: String(state?.completionError || ""),
    examAvailable: Boolean(state?.exam),
    examUrl: assessmentExamUrl(workspaceId, cardId),
    questionCount: Number(state?.exam?.questionCount || config.questionCount || 20) || 20,
    durationMinutes: Number(state?.exam?.durationMinutes || config.durationMinutes || 30) || 30,
    passingScore: Number(state?.exam?.passingScore || config.passingScore || 80) || 80,
    finalExam: Boolean(config.finalExam),
    requiresRequirementInput: Boolean(config.requiresRequirementInput),
    requirementSubmitted: Boolean(state?.config?.sessionRequirement),
    verification: String(state?.exam?.verification || ""),
    lastAttempt: lastAttempt ? {
      submittedAt: lastAttempt.submittedAt || "",
      score: Number(lastAttempt.score || 0),
      correctCount: Number(lastAttempt.correctCount || 0),
      total: Number(lastAttempt.total || 0),
      passingScore: Number(lastAttempt.passingScore || config.passingScore || 80),
      passed: Boolean(lastAttempt.passed),
    } : null,
  };
}

function createAssessmentExamWorkflowService(deps = {}) {
  const assessmentExamService = deps.assessmentExamService || defaultAssessmentExamService;
  const programmingAssessmentTemplateService = deps.programmingAssessmentTemplateService || defaultProgrammingAssessmentTemplateService;
  const compactText = typeof deps.compactText === "function" ? deps.compactText : defaultCompactText;
  const normalizeAssessmentSubjectId = typeof deps.normalizeKanbanAssessmentSubjectId === "function"
    ? deps.normalizeKanbanAssessmentSubjectId
    : defaultNormalizeAssessmentSubjectId;
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const nowMs = typeof deps.nowMs === "function" ? deps.nowMs : () => Date.now();
  const randomHex = typeof deps.randomHex === "function"
    ? deps.randomHex
    : (bytes = 3) => crypto.randomBytes(bytes).toString("hex");
  const safeFileName = typeof deps.safeFileName === "function"
    ? deps.safeFileName
    : (value) => path.basename(String(value || "file")).replace(/[^A-Za-z0-9_.-]+/g, "_") || "file";
  const maxQuestions = clampInt(deps.maxQuestions, 5, DEFAULT_MAX_QUESTIONS, DEFAULT_MAX_QUESTIONS);
  const modelTimeoutMs = Number(deps.modelTimeoutMs || DEFAULT_MODEL_TIMEOUT_MS);
  const automationCreateModel = deps.automationCreateModel || deps.model || "automation-create";
  const artifactService = deps.artifactService || {};
  const kanbanCardProvider = deps.kanbanCardProvider || {};
  const logger = deps.logger || {};
  const learningCoinAwardService = deps.learningCoinAwardService || null;

  function optionalFunction(name, fallback = null) {
    return typeof deps[name] === "function" ? deps[name] : fallback;
  }

  function requireFunction(name) {
    if (typeof deps[name] !== "function") throw new Error(`assessment exam workflow service requires ${name}`);
    return deps[name];
  }

  const extractJsonObject = optionalFunction("extractJsonObject");
  const hermesModelText = optionalFunction("hermesModelText");
  const findWorkspace = optionalFunction("findWorkspace", () => null);
  const sanitizePolicy = optionalFunction("sanitizePolicy", (policy) => policy || {});
  const publicTodo = optionalFunction("publicTodo", (value) => value);
  const kanbanWorkflowStateCompleted = optionalFunction("kanbanWorkflowStateCompleted", (state, cardDone) => {
    return cleanString(state?.status).toLowerCase() === "completed" || Boolean(cardDone);
  });
  const maybeReconcileKanbanDependencyBlocks = optionalFunction("maybeReconcileKanbanDependencyBlocks", async () => null);

  function awardAssessmentExamPassed(workspaceId, cardId, currentCard, result = {}) {
    if (!learningCoinAwardService || typeof learningCoinAwardService.safeAwardEvent !== "function") return null;
    return learningCoinAwardService.safeAwardEvent("assessment_exam_passed", {
      workspaceId,
      executorWorkspaceId: result.executorWorkspaceId || "",
      cardId,
      card: currentCard,
      exam: result.exam,
      config: result.config,
      score: result.score,
      correctCount: result.correctCount,
      total: result.total,
      passed: true,
    });
  }

  function readAssessmentExamState(workspaceId, cardId, currentCard = null) {
    if (typeof deps.readAssessmentExamState === "function") {
      return deps.readAssessmentExamState(workspaceId, cardId, currentCard);
    }
    if (typeof artifactService.readAssessmentExamState === "function") {
      return artifactService.readAssessmentExamState(workspaceId, cardId, currentCard);
    }
    return null;
  }

  function writeAssessmentExamState(workspaceId, cardId, currentCard, state) {
    if (typeof deps.writeAssessmentExamState === "function") {
      return deps.writeAssessmentExamState(workspaceId, cardId, currentCard, state);
    }
    if (typeof artifactService.writeAssessmentExamState === "function") {
      return artifactService.writeAssessmentExamState(workspaceId, cardId, currentCard, state);
    }
    return Object.assign({ schemaVersion: 1, updatedAt: nowIso() }, state || {});
  }

  function publicKanbanAssessmentExam(exam = {}, state = {}) {
    if (typeof deps.publicAssessmentExam === "function") return deps.publicAssessmentExam(exam, state);
    if (typeof artifactService.publicAssessmentExam === "function") return artifactService.publicAssessmentExam(exam, state);
    return publicAssessmentExam(exam, state);
  }

  function isAssessmentCard(card = {}) {
    return isKanbanAssessmentCard(card, {
      isKanbanAssessmentCaseMode: deps.isKanbanAssessmentCaseMode,
      isKanbanStudyCaseMode: deps.isKanbanStudyCaseMode,
    });
  }

  function assessmentConfigFromCard(card = {}, state = null) {
    if (state?.config && typeof state.config === "object") {
      return normalizeAssessmentConfig(state.config, card);
    }
    return normalizeAssessmentConfig({}, card);
  }

  function normalizeAssessmentConfig(input = {}, card = {}) {
    const parsed = Object.assign({}, parseAssessmentConfigLine([
      card.kanbanCaseCardGoal,
      card.kanban_case_card_goal,
      card.description,
      card.kanbanCaseSourceText,
      card.kanban_case_source_text,
    ].filter(Boolean).join("\n")) || {}, input || {});
    const subject = compactText(parsed.subject || card.kanbanCaseTemplate || card.kanban_case_template || "assessment", 80);
    const subjectId = normalizeAssessmentSubjectId(parsed.subjectId || parsed.subject_id || subject);
    const template = compactText(parsed.template || parsed.assessmentTemplate || parsed.assessment_template || "", 60);
    const programming = programmingAssessmentTemplateService.isProgrammingAssessmentConfig(Object.assign({}, parsed, {
      subject,
      subjectId,
      template,
    }), card);
    const requiresRequirementInput = parsed.requiresRequirementInput ?? parsed.requires_requirement_input;
    return {
      subject,
      subjectId,
      template: template || (programming ? "programming" : "assessment"),
      learnerName: compactText(parsed.learnerName || parsed.learner_name || "\u5b66\u4e60\u8005", 80),
      courseLevel: compactText(parsed.courseLevel || parsed.course_level || "\u9636\u6bb5\u68c0\u6d4b", 80),
      questionCount: clampInt(parsed.questionCount || parsed.question_count, 5, maxQuestions, 20),
      durationMinutes: clampInt(parsed.durationMinutes || parsed.duration_minutes, 5, 180, 30),
      passingScore: clampInt(parsed.passingScore || parsed.passing_score, 50, 100, 80),
      difficulty: compactText(parsed.difficulty || "\u57fa\u784030% / \u4e2d\u7b4950% / \u6311\u621820%", 160),
      retakeUntilPass: parsed.retakeUntilPass !== false && parsed.retake_until_pass !== false,
      examIndex: Number(parsed.examIndex || parsed.exam_index || card.kanbanCaseCardIndex || card.kanban_case_card_index || 1) || 1,
      examCount: Number(parsed.examCount || parsed.exam_count || card.kanbanCaseCardCount || card.kanban_case_card_count || 1) || 1,
      finalExam: Boolean(parsed.finalExam || parsed.final_exam),
      requiresRequirementInput: requiresRequirementInput === undefined ? programming : Boolean(requiresRequirementInput),
      sessionRequirement: parsed.sessionRequirement || parsed.session_requirement || null,
    };
  }

  function normalizeKanbanAssessmentExam(raw = {}, config = {}) {
    return assessmentExamService.normalizeAssessmentExam(raw, config, {
      compactText,
      maxQuestions,
    });
  }

  function assessmentSeedText(workspaceId, cardId, currentCard = {}, config = {}) {
    return [
      workspaceId,
      cardId,
      currentCard?.updatedAt || "",
      currentCard?.content || "",
      currentCard?.kanbanCaseSourceText || "",
      currentCard?.kanbanCaseCardGoal || "",
      currentCard?.kanbanRevisionRequest || "",
      config.courseLevel || "",
      config.difficulty || "",
      JSON.stringify(config.sessionRequirement || {}),
    ].join("\0");
  }

  function generateVerifiedMathAssessmentQuestions(config = {}, seedText = "") {
    return assessmentExamService.generateVerifiedMathAssessmentQuestions(config, seedText, {
      maxQuestions,
    });
  }

  function buildAssessmentExamPrompt(workspaceId, currentCard = {}, config = {}) {
    const programming = programmingAssessmentTemplateService.isProgrammingAssessmentConfig(config, currentCard);
    const programmingRequirement = programming
      ? programmingAssessmentTemplateService.normalizeProgrammingRequirement(config.sessionRequirement || config.requirement || {}, { compactText })
      : null;
    return [
      "Generate a formal assessment exam as JSON only. No Markdown, no comments, no code fences.",
      "The exam must use single-answer multiple-choice questions.",
      "Questions should be more comprehensive and harder than a daily practice quiz.",
      "Do not copy copyrighted exam questions. Create original questions or generic skill checks.",
      "Every question needs exactly 4 choices, one 0-based answerIndex, one concise skill tag, and a brief explanation.",
      "The answer key must be internally consistent. Avoid questions that require external images, audio, or ambiguous current events.",
      "Use this schema: {\"title\":\"...\",\"subject\":\"...\",\"verification\":\"model-generated\",\"questions\":[{\"id\":\"q1\",\"skill\":\"...\",\"prompt\":\"...\",\"choices\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\"}]}",
      `Subject: ${config.subject || ""}`,
      `Learner: ${config.learnerName || ""}`,
      `Course level: ${config.courseLevel || ""}`,
      `Question count: ${config.questionCount || 20}`,
      `Duration minutes: ${config.durationMinutes || 30}`,
      `Passing score: ${config.passingScore || 80}`,
      `Difficulty blueprint: ${config.difficulty || ""}`,
      programming ? programmingAssessmentTemplateService.buildProgrammingAssessmentPromptLines(programmingRequirement).join("\n") : "",
      currentCard?.kanbanCaseCardGoal ? `Current card instruction:\n${compactText(stripAssessmentConfigMarkers(currentCard.kanbanCaseCardGoal), 1200)}` : "",
      currentCard?.kanbanCaseSourceText ? `Plan blueprint:\n${compactText(stripAssessmentConfigMarkers(currentCard.kanbanCaseSourceText), 5000)}` : "",
    ].filter(Boolean).join("\n\n");
  }

  async function generateKanbanAssessmentExam(workspaceId, cardId, currentCard = {}, config = {}) {
    const normalizedConfig = normalizeAssessmentConfig(config, currentCard);
    const seedText = assessmentSeedText(workspaceId, cardId, currentCard, normalizedConfig);
    if (normalizeAssessmentSubjectId(normalizedConfig.subjectId || normalizedConfig.subject) === "math") {
      return normalizeKanbanAssessmentExam({
        title: `${normalizedConfig.subject || "\u6570\u5b66"}\u6b63\u5f0f\u6d4b\u8bd5`,
        subject: normalizedConfig.subject || "\u6570\u5b66",
        subjectId: "math",
        verification: "deterministic-template",
        questions: generateVerifiedMathAssessmentQuestions(normalizedConfig, seedText),
      }, normalizedConfig);
    }
    if (typeof hermesModelText !== "function") {
      throw new Error("assessment exam workflow service requires hermesModelText for non-deterministic exam generation");
    }
    if (typeof extractJsonObject !== "function") {
      throw new Error("assessment exam workflow service requires extractJsonObject for non-deterministic exam generation");
    }
    const output = await hermesModelText({
      input: buildAssessmentExamPrompt(workspaceId, currentCard, normalizedConfig),
      stream: false,
      store: false,
      model: automationCreateModel,
      reasoning_effort: "medium",
      conversation: `hermes_web_assessment_exam_${nowMs()}_${randomHex(3)}`,
      instructions: "Generate a formal multiple-choice assessment exam as JSON.",
      access_policy_context: sanitizePolicy(findWorkspace(workspaceId)?.policy || {}),
    }, modelTimeoutMs);
    return normalizeKanbanAssessmentExam(extractJsonObject(output || ""), normalizedConfig);
  }

  async function readingContextForCard(workspaceId, cardId) {
    if (typeof deps.readingContextForCard === "function") {
      return deps.readingContextForCard(workspaceId, cardId);
    }
    if (typeof kanbanCardProvider.listCards !== "function") {
      throw new Error("assessment exam workflow service requires readingContextForCard or kanbanCardProvider.listCards");
    }
    const visibleKanbanCaseCards = optionalFunction("visibleKanbanCaseCards", (items) => items);
    const kanbanCardRevisionOf = optionalFunction("kanbanCardRevisionOf", (card) => cleanString(card?.kanbanRevisionOf || card?.kanban_revision_of));
    const kanbanCardEffectiveCaseIndex = optionalFunction("kanbanCardEffectiveCaseIndex", (card) => Number(card?.kanbanCaseCardIndex || card?.kanban_case_card_index || 0));
    const listed = await kanbanCardProvider.listCards({
      workspaceId,
      includeCompleted: true,
      scope: "mine",
      limit: 500,
    });
    const cards = Array.isArray(listed?.data) ? listed.data : [];
    const rawCurrent = cards.find((card) => String(card.id) === String(cardId)) || null;
    const caseId = cleanString(rawCurrent?.kanbanCaseId || rawCurrent?.kanban_case_id);
    const rawSiblings = caseId
      ? cards
        .filter((card) => cleanString(card.kanbanCaseId || card.kanban_case_id) === caseId)
        .sort((a, b) => (Number(a.kanbanCaseCardIndex || a.kanban_case_card_index || 0) - Number(b.kanbanCaseCardIndex || b.kanban_case_card_index || 0)) || String(a.id).localeCompare(String(b.id)))
      : [];
    const siblings = visibleKanbanCaseCards(rawSiblings);
    const replacement = rawCurrent && !kanbanCardRevisionOf(rawCurrent)
      ? siblings.find((card) => kanbanCardRevisionOf(card) === String(rawCurrent.id))
      : null;
    const current = siblings.find((card) => String(card.id) === String(cardId)) || replacement || rawCurrent;
    const byId = new Map(rawSiblings.map((card) => [String(card.id || ""), card]));
    const currentIndex = kanbanCardEffectiveCaseIndex(current, byId) || Number(current?.kanbanCaseCardIndex || current?.kanban_case_card_index || 0) || 0;
    const prior = siblings.filter((card) => kanbanCardEffectiveCaseIndex(card, byId) < currentIndex);
    return { current, siblings, rawSiblings, prior };
  }

  function kanbanAssessmentStateCompleted(workspaceId, card = {}) {
    const cardId = cleanString(card?.id || card?.cardId);
    if (!cardId || !isAssessmentCard(card)) return false;
    const state = readAssessmentExamState(workspaceId, cardId, card);
    if (cleanString(state?.status).toLowerCase() === "completed" && !state?.completionError) return true;
    const status = cleanString(card?.kanbanStatus || card?.kanban_status || card?.status).toLowerCase();
    return kanbanWorkflowStateCompleted(state || {}, status === "done" || status === "completed");
  }

  function kanbanAssessmentPriorComplete(workspaceId, priorCards = []) {
    return (priorCards || [])
      .filter((card) => isAssessmentCard(card))
      .every((card) => kanbanAssessmentStateCompleted(workspaceId, card));
  }

  function kanbanAssessmentCanStart(card = {}, state = null, priorCards = [], workspaceId = "owner") {
    if (state?.exam) return true;
    if (kanbanAssessmentArchived(card)) return false;
    if (!kanbanAssessmentPriorComplete(workspaceId, priorCards)) return false;
    return true;
  }

  function reportDirectory(workspaceId, cardId, currentCard = {}) {
    if (typeof deps.reportDirectory === "function") return deps.reportDirectory(workspaceId, cardId, currentCard);
    if (typeof artifactService.assessmentExamReportDirectory === "function") {
      return artifactService.assessmentExamReportDirectory(workspaceId, cardId, currentCard);
    }
    if (typeof artifactService.readingArtifactDirectory === "function") {
      return artifactService.readingArtifactDirectory(workspaceId, currentCard?.kanbanCaseId || "assessment-plan", cardId);
    }
    return path.join(process.cwd(), "kanban-study-artifacts", cleanString(workspaceId || "owner"), cleanString(currentCard?.kanbanCaseId || "assessment-plan"), cleanString(cardId || "card"));
  }

  function writeTextFile(filePath, text) {
    if (typeof deps.writeTextFile === "function") return deps.writeTextFile(filePath, text);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
    return filePath;
  }

  function assessmentExamReportPath(workspaceId, cardId, currentCard = {}, exam = {}, attempt = {}) {
    if (typeof deps.writeAssessmentExamReport === "function") {
      return deps.writeAssessmentExamReport(workspaceId, cardId, currentCard, exam, attempt);
    }
    const dir = reportDirectory(workspaceId, cardId, currentCard);
    const programming = programmingAssessmentTemplateService.isProgrammingAssessmentConfig(exam || {}, currentCard);
    const mdPath = path.join(dir, `${nowMs()}-${safeFileName(currentCard?.content || cardId)}-${programming ? "programming-log" : "assessment-report"}.md`);
    const markdown = programming
      ? programmingAssessmentTemplateService.buildProgrammingAssessmentLogMarkdown({
        cardId,
        cardTitle: currentCard?.content || exam.title || "Programming Assessment Log",
        exam,
        attempt,
        requirement: attempt.sessionRequirement || {},
      })
      : assessmentExamService.buildAssessmentExamReportMarkdown({
        cardId,
        cardTitle: currentCard?.content || exam.title || "Assessment Report",
        exam,
        attempt,
      });
    writeTextFile(mdPath, markdown);
    return mdPath;
  }

  function completedAssessmentResult(state = {}) {
    const attempts = Array.isArray(state.attempts) ? state.attempts : [];
    const last = attempts.length ? attempts[attempts.length - 1] : null;
    if (!last || !last.passed) return null;
    return {
      passed: true,
      status: "completed",
      score: Number(last.score || 0),
      correctCount: Number(last.correctCount || 0),
      total: Number(last.total || 0),
      passingScore: Number(last.passingScore || state.exam?.passingScore || state.config?.passingScore || 80),
      results: (Array.isArray(last.results) ? last.results : []).map((item) => ({
        id: item.id,
        skill: item.skill,
        correct: Boolean(item.correct),
        explanation: item.explanation || "",
      })),
    };
  }

  async function mutateCard(payload) {
    if (typeof deps.mutateKanbanCard === "function") return deps.mutateKanbanCard(payload);
    if (typeof kanbanCardProvider.mutateCard === "function") return kanbanCardProvider.mutateCard(payload);
    return { ok: false, error: "Kanban card mutation is not configured" };
  }

  async function startKanbanAssessmentExam(workspaceId, cardId, body = {}) {
    const context = await readingContextForCard(workspaceId, cardId);
    const currentCard = context.current || { id: cardId, content: cardId };
    if (!isAssessmentCard(currentCard)) {
      return { ok: false, status: 404, error: "Assessment exam is not available for this card" };
    }
    const canonicalCardId = String(currentCard.id || cardId);
    const existing = readAssessmentExamState(workspaceId, canonicalCardId, currentCard);
    if (!kanbanAssessmentCanStart(currentCard, existing, context.prior || [], workspaceId)) {
      return { ok: false, status: 409, error: "Assessment exam is not open yet" };
    }
    if (existing?.exam) {
      return {
        ok: true,
        exam: publicKanbanAssessmentExam(existing.exam, existing),
        status: existing.status || "in_progress",
        attempts: attemptsPublicTail(existing.attempts),
        result: completedAssessmentResult(existing),
      };
    }
    const config = assessmentConfigFromCard(currentCard);
    const programming = programmingAssessmentTemplateService.isProgrammingAssessmentConfig(config, currentCard);
    let sessionRequirement = null;
    if (programming) {
      sessionRequirement = programmingAssessmentTemplateService.normalizeProgrammingRequirement(body, { compactText });
      if (config.requiresRequirementInput !== false && !programmingAssessmentTemplateService.programmingRequirementHasContent(sessionRequirement)) {
        return {
          ok: false,
          status: 409,
          code: "programming_requirement_required",
          error: "Programming assessment requires a current requirement before generating questions.",
        };
      }
    }
    const generationConfig = programming
      ? Object.assign({}, config, { sessionRequirement })
      : config;
    const exam = await generateKanbanAssessmentExam(workspaceId, canonicalCardId, currentCard, generationConfig);
    const state = writeAssessmentExamState(workspaceId, canonicalCardId, currentCard, {
      status: "in_progress",
      workspaceId,
      cardId: canonicalCardId,
      cardTitle: currentCard.content || cardId,
      config: generationConfig,
      exam,
      startedAt: nowIso(),
      attempts: [],
    });
    return { ok: true, exam: publicKanbanAssessmentExam(exam, state), status: state.status, attempts: [] };
  }

  async function getKanbanAssessmentExam(workspaceId, cardId) {
    return startKanbanAssessmentExam(workspaceId, cardId, {});
  }

  async function submitKanbanAssessmentExam(workspaceId, cardId, body = {}) {
    const context = await readingContextForCard(workspaceId, cardId);
    const currentCard = context.current || { id: cardId, content: cardId };
    if (!isAssessmentCard(currentCard)) {
      return { ok: false, status: 404, error: "Assessment exam is not available for this card" };
    }
    const canonicalCardId = String(currentCard.id || cardId);
    let state = readAssessmentExamState(workspaceId, canonicalCardId, currentCard);
    if (!state?.exam && (body.generateOnly || body.generate_only)) {
      return startKanbanAssessmentExam(workspaceId, canonicalCardId, body);
    }
    if (!state?.exam) {
      const generated = await getKanbanAssessmentExam(workspaceId, canonicalCardId);
      if (!generated.ok) return generated;
      state = readAssessmentExamState(workspaceId, canonicalCardId, currentCard);
    }
    const exam = state.exam;
    const graded = assessmentExamService.gradeAssessmentExam(exam, state, body, { nowIso });
    if (!graded.ok) return graded;
    const { attempt, correctCount, passed, passingScore, results, score, total } = graded;
    attempt.sessionRequirement = state.config?.sessionRequirement || null;
    const reportPath = assessmentExamReportPath(workspaceId, canonicalCardId, currentCard, exam, attempt);
    const nextState = Object.assign({}, state, {
      status: passed ? "in_progress" : "retake_required",
      attempts: [...(Array.isArray(state.attempts) ? state.attempts : []), attempt].slice(-20),
      lastReportPath: reportPath,
      completedAt: state.completedAt || "",
    });
    const resultComment = [
      `Formal assessment scored ${score}/100; passing score ${passingScore}/100.`,
      passed ? "Assessment passed. Completing this card." : "Assessment did not pass. Retake is required; this card remains open.",
      `MEDIA: ${reportPath}`,
    ].join("\n");
    await mutateCard({
      action: "comment",
      workspaceId,
      cardId: canonicalCardId,
      comment: resultComment,
      author: "Hermes Mobile",
    }).catch((err) => {
      if (typeof logger.warn === "function") logger.warn("Assessment exam comment mutation failed", { error: err?.message || String(err) });
      return null;
    });
    if (!passed) {
      writeAssessmentExamState(workspaceId, canonicalCardId, currentCard, nextState);
      return {
        ok: true,
        passed: false,
        status: "retake_required",
        score,
        correctCount,
        total,
        passingScore,
        reportPath,
        results: results.map((item) => ({
          id: item.id,
          skill: item.skill,
          correct: item.correct,
          explanation: item.correct ? "" : item.explanation,
        })),
        exam: publicKanbanAssessmentExam(exam, nextState),
      };
    }
    const completed = await mutateCard({
      action: "complete",
      workspaceId,
      cardId: canonicalCardId,
      result: [
        `Formal assessment passed with ${score}/100.`,
        `Correct: ${correctCount}/${total}.`,
        `MEDIA: ${reportPath}`,
      ].join("\n"),
      author: "Hermes Mobile",
    });
    if (!completed?.ok) {
      writeAssessmentExamState(workspaceId, canonicalCardId, currentCard, Object.assign({}, nextState, {
        status: "retake_required",
        completionError: completed?.error || "Assessment card completion failed",
      }));
      return { ok: false, error: completed?.error || "Assessment card completion failed", score };
    }
    writeAssessmentExamState(workspaceId, canonicalCardId, currentCard, Object.assign({}, nextState, {
      status: "completed",
      completedAt: nowIso(),
      completionError: "",
    }));
    const coinAward = awardAssessmentExamPassed(workspaceId, canonicalCardId, currentCard, {
      exam,
      config: state.config,
      score,
      correctCount,
      total,
      executorWorkspaceId: body.executorWorkspaceId || body.executor_workspace_id || "",
    });
    await maybeReconcileKanbanDependencyBlocks(workspaceId, { force: true, limit: 500 }).catch((err) => {
      if (typeof logger.warn === "function") logger.warn("Assessment exam dependency reconciliation failed", { error: err?.message || String(err) });
      return null;
    });
    return {
      ok: true,
      passed: true,
      status: "completed",
      score,
      correctCount,
      total,
      passingScore,
      reportPath,
      coinAward,
      results: results.map((item) => ({
        id: item.id,
        skill: item.skill,
        correct: item.correct,
        explanation: item.explanation || "",
      })),
      card: publicTodo(completed),
    };
  }

  function publicKanbanAssessmentSummary(workspaceId, card = {}) {
    if (!isAssessmentCard(card)) return null;
    const cardId = cleanString(card?.id || card?.cardId);
    if (!cardId) return null;
    const state = readAssessmentExamState(workspaceId, cardId, card);
    const config = assessmentConfigFromCard(card, state);
    return publicAssessmentSummaryFromState(workspaceId, cardId, state || {}, config);
  }

  return {
    assessmentConfigFromCard,
    assessmentExamReportPath,
    assessmentExamUrl,
    buildAssessmentExamPrompt,
    generateKanbanAssessmentExam,
    generateVerifiedMathAssessmentQuestions,
    getKanbanAssessmentExam,
    isKanbanAssessmentCard: isAssessmentCard,
    kanbanAssessmentArchived,
    kanbanAssessmentCanStart,
    kanbanAssessmentPriorComplete,
    kanbanAssessmentStateCompleted,
    normalizeKanbanAssessmentExam,
    publicKanbanAssessmentExam,
    publicKanbanAssessmentSummary,
    readAssessmentExamState,
    startKanbanAssessmentExam,
    submitKanbanAssessmentExam,
    writeAssessmentExamState,
  };
}

module.exports = {
  assessmentConfigLine,
  assessmentExamUrl,
  createAssessmentExamWorkflowService,
  defaultNormalizeAssessmentSubjectId,
  isKanbanAssessmentCard,
  kanbanAssessmentArchived,
  parseAssessmentConfigLine,
  publicAssessmentExam,
  publicAssessmentSummaryFromState,
  stripAssessmentConfigMarkers,
};
