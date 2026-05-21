"use strict";

const crypto = require("node:crypto");
const {
  isLearningGrowthKanbanCard,
} = require("./learning-growth-kanban-task-service");
const {
  createLearningGrowthSubmissionRecordService,
  digestText,
  submissionStats,
} = require("./learning-growth-submission-record-service");
const { compactLearningSummary } = require("./learning-record-privacy-service");

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function bool(value) {
  if (value === true || value === 1) return true;
  const text = cleanString(value).toLowerCase();
  return ["true", "1", "yes", "y", "passed", "done", "completed"].includes(text);
}

function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stableId(prefix, parts = []) {
  const digest = crypto.createHash("sha256")
    .update(parts.map((part) => cleanString(part, 700)).join(":"))
    .digest("hex")
    .slice(0, 18);
  return `${prefix}_${digest}`;
}

function cardId(card = {}) {
  return cleanString(card.id || card.todoId || card.todo_id || card.cardId);
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function arrayField(card = {}, ...keys) {
  for (const key of keys) {
    const value = card[key];
    if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  }
  return [];
}

function taskCardIdFromCard(card = {}) {
  return cardField(card, "learningTaskCardId", "learning_task_card_id", "kanbanCaseCardId", "kanban_case_card_id");
}

function resolveTask(programService, card = {}) {
  if (!programService) return null;
  const taskCardId = taskCardIdFromCard(card);
  if (taskCardId && typeof programService.getTaskCard === "function") {
    const task = programService.getTaskCard(taskCardId);
    if (task) return task;
  }
  const kanbanCardId = cardId(card);
  if (kanbanCardId && typeof programService.getTaskCardForKanbanCard === "function") {
    const task = programService.getTaskCardForKanbanCard(kanbanCardId, {
      workspaceId: cardField(card, "workspaceId", "workspace_id"),
      learnerId: cardField(card, "learnerId", "studentId", "workspaceId", "workspace_id"),
      programId: cardField(card, "learningProgramId", "learning_program_id"),
      draftId: cardField(card, "learningDraftId", "learning_draft_id"),
    });
    if (task) return task;
  }
  return null;
}

function extractCards(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.cards)) return result.cards;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.todos)) return result.todos;
  return [];
}

async function loadKanbanCards(provider, input = {}) {
  if (Array.isArray(input.cards)) return input.cards;
  if (!provider || typeof provider.listCards !== "function") return [];
  const result = await provider.listCards({
    workspaceId: cleanString(input.workspaceId) || "owner",
    scope: input.scope || "mine",
    includeCompleted: input.includeCompleted ?? true,
    limit: Math.max(1, Math.min(500, Number(input.limit || 200) || 200)),
  });
  return extractCards(result);
}

function evaluationFromCard(card = {}) {
  const status = cardField(card, "learningGrowthEvaluationStatus", "learning_growth_evaluation_status");
  if (!status) return null;
  const score = numberValue(card.learningGrowthScore ?? card.learning_growth_score, 0);
  const maxScore = numberValue(card.learningGrowthMaxScore ?? card.learning_growth_max_score, 100);
  const reportPath = cardField(card, "learningGrowthReportPath", "learning_growth_report_path");
  const reportName = cardField(card, "learningGrowthReportName", "learning_growth_report_name");
  return {
    evaluationId: cardField(card, "learningGrowthEvaluationId", "learning_growth_evaluation_id")
      || stableId("leval", [cardId(card), status, score, cardField(card, "learningGrowthEvaluationAt", "learning_growth_evaluation_at")]),
    status,
    score,
    maxScore,
    passed: bool(card.learningGrowthPassed ?? card.learning_growth_passed) || score >= 80,
    confidence: 0.72,
    summary: compactLearningSummary(cardField(card, "learningGrowthFeedbackSummary", "learning_growth_feedback_summary") || status, 700),
    activityType: cardField(card, "learningGrowthActivityType", "activityType", "activity_type"),
    nextStep: cardField(card, "learningGrowthNextStep", "learning_growth_next_step"),
    feedbackMethod: cardField(card, "learningGrowthFeedbackMethod", "learning_growth_feedback_method"),
    feedbackSections: {
      strengths: arrayField(card, "learningGrowthStrengths", "learning_growth_strengths"),
      focusAreas: arrayField(card, "learningGrowthFocusAreas", "learning_growth_focus_areas"),
      rewriteChecklist: arrayField(card, "learningGrowthRewriteChecklist", "learning_growth_rewrite_checklist"),
      reflectionPrompts: arrayField(card, "learningGrowthReflectionPrompts", "learning_growth_reflection_prompts"),
      nextPractice: cardField(card, "learningGrowthNextPractice", "learning_growth_next_practice"),
      parentNote: cardField(card, "learningGrowthParentNote", "learning_growth_parent_note"),
    },
    report: reportPath || reportName ? {
      path: reportPath,
      name: reportName || "growth-feedback-report.md",
      mime: "text/markdown",
    } : null,
  };
}

function reflectionFromCard(card = {}) {
  const status = cardField(card, "learningGrowthReflectionStatus", "learning_growth_reflection_status");
  if (!status) return null;
  const transcriptDigest = cardField(card, "learningGrowthReflectionTranscriptDigest", "learning_growth_reflection_transcript_digest");
  const audioDigest = cardField(card, "learningGrowthReflectionAudioDigest", "learning_growth_reflection_audio_digest");
  return {
    status,
    mode: cardField(card, "learningGrowthReflectionMode", "learning_growth_reflection_mode") || "spoken",
    score: numberValue(card.learningGrowthReflectionScore ?? card.learning_growth_reflection_score, 0),
    maxScore: 100,
    summary: compactLearningSummary(cardField(card, "learningGrowthReflectionSummary", "learning_growth_reflection_summary") || status, 700),
    transcriptDigest,
    evidenceRefs: arrayField(card, "learningGrowthReflectionEvidenceRefs", "learning_growth_reflection_evidence_refs"),
    submittedAt: cardField(card, "learningGrowthReflectionAt", "learning_growth_reflection_at"),
    audio: {
      name: cardField(card, "learningGrowthReflectionAudioName", "learning_growth_reflection_audio_name"),
      mime: cardField(card, "learningGrowthReflectionAudioMime", "learning_growth_reflection_audio_mime"),
      size: numberValue(card.learningGrowthReflectionAudioSize ?? card.learning_growth_reflection_audio_size, 0),
      durationMs: numberValue(card.learningGrowthReflectionAudioDurationMs ?? card.learning_growth_reflection_audio_duration_ms, 0),
      digest: audioDigest,
    },
  };
}

function createLearningGrowthNativeBackfillService(options = {}) {
  const learningProgramService = options.learningProgramService || options.programService || null;
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const recordService = options.submissionRecordService || createLearningGrowthSubmissionRecordService({
    learningProgramService,
    repository: options.repository || learningProgramService?.repository,
  });

  async function backfill(input = {}) {
    const dryRun = input.dryRun !== false;
    const cards = (await loadKanbanCards(kanbanCardProvider, input))
      .filter((card) => isLearningGrowthKanbanCard(card));
    const counts = {
      scanned: cards.length,
      matched: 0,
      submissions: 0,
      evaluations: 0,
      reflections: 0,
      artifacts: 0,
      skipped: 0,
      errors: 0,
      dryRun,
    };
    const results = [];
    for (const card of cards) {
      const kanbanCardId = cardId(card);
      const task = resolveTask(learningProgramService, card);
      if (!task) {
        counts.skipped += 1;
        results.push({ kanbanCardId, status: "skipped", reason: "missing-native-task" });
        continue;
      }
      counts.matched += 1;
      const submissionText = cardField(card, "learningGrowthSubmissionText", "learning_growth_submission_text");
      const evaluation = evaluationFromCard(card);
      const reflection = reflectionFromCard(card);
      try {
        let nativeSubmission = null;
        if (submissionText) {
          counts.submissions += 1;
          if (!dryRun) {
            nativeSubmission = recordService.recordSubmission({
              task,
              workspaceId: task.workspaceId,
              author: "learning-growth-backfill",
              kanbanCardId,
              kanbanCommentRef: `kanban:${kanbanCardId}:${digestText(submissionText).slice(0, 12)}`,
              stage: "kanban_backfill",
              submissionKind: cardField(card, "learningGrowthSubmissionKind", "learning_growth_submission_kind") || "learner_attempt",
              status: cardField(card, "learningGrowthSubmissionStatus", "learning_growth_submission_status") || "submitted",
              summary: "Backfilled Growth learner attempt from Kanban compatibility metadata.",
              text: submissionText,
              stats: submissionStats(submissionText),
              submittedAt: cardField(card, "learningGrowthSubmissionAt", "learning_growth_submission_at"),
            });
          }
        }
        if (evaluation) {
          counts.evaluations += 1;
          if (!dryRun) {
            const saved = recordService.recordEvaluation({
              task,
              session: nativeSubmission?.session,
              evaluation,
              status: evaluation.status,
              summary: evaluation.summary,
            });
            if (evaluation.report) {
              counts.artifacts += 1;
              recordService.recordArtifact({
                task,
                session: saved?.session || nativeSubmission?.session,
                submissionId: nativeSubmission?.record?.submissionId,
                evaluationId: evaluation.evaluationId,
                artifact: evaluation.report,
                artifactType: "feedback_report",
                status: "generated",
                summary: "Backfilled Growth feedback report reference.",
              });
            } else {
              counts.artifacts += 0;
            }
          } else if (evaluation.report) {
            counts.artifacts += 1;
          }
        }
        if (reflection) {
          counts.reflections += 1;
          if (!dryRun) {
            recordService.recordReflection({
              task,
              session: nativeSubmission?.session,
              evaluationId: evaluation?.evaluationId,
              reflection,
            });
          }
        }
        results.push({
          kanbanCardId,
          taskCardId: task.taskCardId,
          status: dryRun ? "would-backfill" : "backfilled",
          hasSubmission: Boolean(submissionText),
          hasEvaluation: Boolean(evaluation),
          hasReflection: Boolean(reflection),
          hasArtifact: Boolean(evaluation?.report),
        });
      } catch (err) {
        counts.errors += 1;
        results.push({ kanbanCardId, taskCardId: task.taskCardId, status: "error", error: cleanString(err.message || err, 240) });
      }
    }
    return { ok: counts.errors === 0, counts, results };
  }

  return { backfill };
}

module.exports = {
  createLearningGrowthNativeBackfillService,
  evaluationFromCard,
  reflectionFromCard,
};
