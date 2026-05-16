"use strict";

const DEFAULT_STUDENT_FOR_OWNER = "fanfan";

const DEFAULT_LEARNING_COIN_AWARD_RULES = Object.freeze({
  reading_submission_analyzed: Object.freeze({
    coinAmount: 10,
    reason: "\u5b66\u4e60\u6210\u679c\u5df2\u63d0\u4ea4\u5e76\u5b8c\u6210\u5206\u6790",
    sourceType: "kanban-reading-submission",
    stage: "submission-analyzed",
  }),
  reading_quiz_passed: Object.freeze({
    coinAmount: 20,
    reason: "\u5b66\u4e60\u6d4b\u9a8c\u901a\u8fc7",
    sourceType: "kanban-reading-quiz",
    stage: "quiz-passed",
  }),
  assessment_attempt_submitted: Object.freeze({
    coinAmount: 5,
    reason: "\u6b63\u5f0f\u6d4b\u9a8c\u5df2\u63d0\u4ea4",
    sourceType: "kanban-assessment-attempt",
    stage: "assessment-attempt",
  }),
  assessment_exam_passed: Object.freeze({
    coinAmount: 25,
    reason: "\u6b63\u5f0f\u6d4b\u9a8c\u901a\u8fc7",
    sourceType: "kanban-assessment-exam",
    stage: "assessment-passed",
  }),
  programming_assessment_passed: Object.freeze({
    coinAmount: 25,
    reason: "\u7f16\u7a0b\u6d4b\u9a8c\u901a\u8fc7",
    sourceType: "kanban-programming-assessment",
    stage: "programming-assessment-passed",
  }),
});

function compactText(value, maxChars = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 3))}...` : text;
}

function normalizeId(value, fallback = "") {
  const text = String(value ?? "").trim() || fallback;
  return text.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizePositiveInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

function textIncludesAny(text, patterns) {
  const value = String(text || "").toLowerCase();
  return patterns.some((pattern) => pattern.test(value));
}

function studentIdForLearningCard(card = {}, workspaceId = "owner") {
  const direct = firstText(
    card.studentId,
    card.student_id,
    card.learnerId,
    card.learner_id,
    card.kanbanCaseStudentId,
    card.kanban_case_student_id,
    card.kanbanCaseLearnerId,
    card.kanban_case_learner_id,
  );
  if (direct) return normalizeId(direct, DEFAULT_STUDENT_FOR_OWNER);
  const workspace = normalizeId(workspaceId, "owner");
  return workspace === "owner" ? DEFAULT_STUDENT_FOR_OWNER : workspace;
}

function learningTemplateForCard(card = {}) {
  const template = firstText(card.kanbanCaseTemplate, card.kanban_case_template, card.template);
  const mode = firstText(card.kanbanCaseMode, card.kanban_case_mode, card.mode);
  const subjectId = firstText(card.subjectId, card.subject_id, card.kanbanCaseSubjectId, card.kanban_case_subject_id);
  const source = `${template}\n${mode}\n${subjectId}\n${card.kanbanCaseCardGoal || ""}\n${card.kanban_case_card_goal || ""}`;
  if (textIncludesAny(source, [/reading/, /\u9605\u8bfb/, /\u82f1\u8bed/, /\u82f1\u6587/])) return "reading";
  if (textIncludesAny(source, [/programming/, /coding/, /python/, /javascript/, /typescript/, /\u7f16\u7a0b/, /\u4ee3\u7801/])) return "programming-assessment";
  if (textIncludesAny(mode, [/assessment/]) || textIncludesAny(template, [/assessment/, /exam/, /\u8003\u8bd5/, /\u6d4b\u9a8c/])) return "assessment";
  return "study";
}

function ruleForEvent(rules, eventType, card) {
  if (eventType === "assessment_exam_passed" && learningTemplateForCard(card) === "programming-assessment") {
    return rules.programming_assessment_passed || rules.assessment_exam_passed || null;
  }
  return rules[eventType] || null;
}

function learningCoinAwardKey(input = {}) {
  const workspaceId = normalizeId(input.workspaceId, "owner");
  const cardId = normalizeId(input.cardId || input.sourceId, "card");
  const stage = normalizeId(input.stage || input.eventType, "event");
  return `learning:${workspaceId}:${cardId}:${stage}`;
}

function awardMetadata(input = {}) {
  const card = input.card || {};
  const metadata = {
    caseId: normalizeId(input.caseId || card.kanbanCaseId || card.kanban_case_id, ""),
    cardId: normalizeId(input.cardId || card.id || card.cardId, ""),
    template: learningTemplateForCard(card),
    stage: normalizeId(input.stage || input.eventType, ""),
    subjectId: normalizeId(input.subjectId || input.exam?.subjectId || input.config?.subjectId, ""),
    score: Number(input.score || 0) || 0,
    correctCount: Number(input.correctCount || 0) || 0,
    total: Number(input.total || 0) || 0,
    passed: Boolean(input.passed),
    cardIndex: Number(card.kanbanCaseCardIndex || card.kanban_case_card_index || 0) || 0,
    cardCount: Number(card.kanbanCaseCardCount || card.kanban_case_card_count || 0) || 0,
  };
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== "" && value !== 0 && value !== false));
}

function normalizeAwardRules(input = {}) {
  return Object.assign({}, DEFAULT_LEARNING_COIN_AWARD_RULES, input || {});
}

function createLearningCoinAwardService(options = {}) {
  const learningCoinService = options.learningCoinService;
  const logger = options.logger || {};
  const onAward = typeof options.onAward === "function" ? options.onAward : () => {};
  const rules = normalizeAwardRules(options.rules);
  const enabled = options.enabled !== false;

  function requireCoinService() {
    if (!learningCoinService || typeof learningCoinService.grantCoins !== "function") {
      throw new Error("learning coin award service requires learningCoinService.grantCoins");
    }
    return learningCoinService;
  }

  function awardEvent(eventType, input = {}) {
    if (!enabled) return { ok: false, skipped: true, reason: "disabled" };
    const card = input.card || {};
    const rule = ruleForEvent(rules, eventType, card);
    if (!rule) return { ok: false, skipped: true, reason: "unsupported_event", eventType };
    const workspaceId = normalizeId(input.workspaceId, "owner");
    const cardId = normalizeId(input.cardId || card.id || card.cardId, "card");
    const studentId = normalizeId(input.studentId || studentIdForLearningCard(card, workspaceId), DEFAULT_STUDENT_FOR_OWNER);
    const stage = normalizeId(input.stage || rule.stage || eventType, eventType);
    const coinAmount = normalizePositiveInteger(input.coinAmount || rule.coinAmount, 0);
    if (!coinAmount) return { ok: false, skipped: true, reason: "zero_amount", eventType };

    const result = requireCoinService().grantCoins({
      studentId,
      workspaceId,
      coinAmount,
      reason: input.reason || rule.reason,
      sourceType: input.sourceType || rule.sourceType,
      sourceId: cardId,
      idempotencyKey: input.idempotencyKey || learningCoinAwardKey({ workspaceId, cardId, stage }),
      createdByPrincipalId: input.createdByPrincipalId || "system",
      metadata: awardMetadata(Object.assign({}, input, { card, cardId, eventType, stage, passed: input.passed ?? /passed/i.test(stage) })),
    });
    const award = {
      ok: true,
      eventType,
      stage,
      studentId,
      workspaceId,
      cardId,
      template: learningTemplateForCard(card),
      coinAmount,
      duplicate: Boolean(result.duplicate),
      entry: result.entry,
      balances: result.balances,
    };
    if (!award.duplicate) {
      try {
        onAward(award);
      } catch (err) {
        if (typeof logger.warn === "function") logger.warn("Learning coin award notification failed", { error: err?.message || String(err), eventType, workspaceId, cardId });
      }
    }
    return award;
  }

  function safeAwardEvent(eventType, input = {}) {
    try {
      return awardEvent(eventType, input);
    } catch (err) {
      if (typeof logger.warn === "function") logger.warn("Learning coin award failed", {
        error: err?.message || String(err),
        eventType,
        workspaceId: input.workspaceId,
        cardId: input.cardId || input.card?.id,
      });
      return { ok: false, error: compactText(err?.message || String(err), 240), eventType };
    }
  }

  return {
    awardEvent,
    safeAwardEvent,
    rules: () => Object.assign({}, rules),
  };
}

module.exports = {
  DEFAULT_LEARNING_COIN_AWARD_RULES,
  createLearningCoinAwardService,
  learningCoinAwardKey,
  learningTemplateForCard,
  studentIdForLearningCard,
};
