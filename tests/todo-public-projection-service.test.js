"use strict";

const assert = require("node:assert/strict");
const {
  createTodoPublicProjectionService,
  kanbanHasPassedAttempt,
  kanbanWorkflowStateCompleted,
  normalizeStringList,
  projectedWorkflowKanbanStatus,
  publicTodoOptions,
} = require("../adapters/todo-public-projection-service");

function createService(overrides = {}) {
  const calls = {
    covers: [],
    outputs: [],
    workflowInputs: [],
  };
  const service = createTodoPublicProjectionService(Object.assign({
    publicKanbanOutputsFromText(workspaceId, text) {
      calls.outputs.push({ workspaceId, text });
      return text ? [{ name: "result.pdf", workspaceId, source: text }] : [];
    },
    publicKanbanCoverFile(workspaceId, cover) {
      calls.covers.push({ workspaceId, cover });
      if (!cover) return null;
      return { role: "cover", workspaceId, path: typeof cover === "string" ? cover : cover.path };
    },
    publicKanbanReadingSubmissionSummary(_workspaceId, card) {
      if (String(card.id) === "study-complete") return { status: "completed" };
      if (String(card.id) === "study-passed-attempt") return { status: "quiz_pending", attempts: [{ passed: true }] };
      return { status: "submitted", completionError: "" };
    },
    publicKanbanAssessmentSummary(_workspaceId, card) {
      if (String(card.id) === "assessment-complete") return { status: "completed" };
      if (String(card.id) === "assessment-passed-attempt") return { status: "retake_required", attempts: [{ passed: true }] };
      if (String(card.id) === "assessment-locked") return { status: "pending", examAvailable: false };
      return { status: "retake_required", examAvailable: true };
    },
    deriveKanbanWorkflowState(input) {
      calls.workflowInputs.push(input);
      const card = input.card || {};
      if (card.assessmentExam) {
        const assessment = card.assessmentExam || {};
        let phase = "locked";
        if (assessment.status === "completed") phase = "completed";
        else if (assessment.status === "retake_required") phase = "retake_required";
        else if (assessment.examAvailable || assessment.status === "in_progress") phase = "in_progress";
        else if (input.priorComplete === true) phase = "exam_open";
        return {
          kind: card.kanbanCaseTemplate === "final-assessment" ? "final-assessment" : "assessment",
          phase,
          completed: phase === "completed",
          priorContextComplete: input.priorComplete,
        };
      }
      if (card.readingSubmission) {
        return { kind: "study", priorContextComplete: input.priorComplete };
      }
      return { kind: "" };
    },
    isKanbanStudyCaseMode(mode) {
      return String(mode || "") === "study-plan";
    },
    isKanbanAssessmentCaseMode(mode) {
      return String(mode || "") === "assessment-plan";
    },
    visibleKanbanCaseCards(rows) {
      return rows.slice();
    },
    kanbanCardEffectiveCaseIndex(card) {
      return Number(card.kanban_case_card_index || card.kanbanCaseCardIndex || 0);
    },
  }, overrides));
  return { service, calls };
}

function row(id, extra = {}) {
  return Object.assign({
    id,
    workspace_id: "student-a",
    content: `Card ${id}`,
    status: "open",
    assignee_principal_id: "student-a",
    assignee_label: "Student A",
    created_by_principal: "owner",
    due_at: "2026-05-15T10:00:00Z",
    due_local: "2026-05-15 18:00",
    timezone: "Asia/Shanghai",
    reminder_lead_minutes: "30",
    recurrence_kind: "weekly",
    recurrence_label: "Weekly",
    recurrence_days: "1,3",
    recurrence_series_id: "series-1",
    recurrence_template: 1,
    source: "kanban",
    kanban_board: "workspace-student-a",
    kanban_status: "ready",
    kanban_assignee: "lowgw5",
    kanban_priority: "4",
    kanban_tenant: "tenant-a",
    kanban_workspace_kind: "user",
    kanban_created_by: "owner",
    kanban_started_at: "2026-05-15T09:00:00Z",
    kanban_completed_at: "",
    kanban_result: "MEDIA:/tmp/result.pdf",
    kanban_block_reason: "",
    kanban_max_retries: "3",
    kanban_skills: ["reading", "", "math", "extra1", "extra2", "extra3", "extra4", "extra5", "extra6"],
    kanban_case_id: "case-1",
    kanban_case_mode: "",
    kanban_case_template: "",
    kanban_case_source_text: "source",
    kanban_case_summary: "summary",
    kanban_case_cover: { path: "cover.png", name: "Cover" },
    kanban_case_card_id: id,
    kanban_case_card_index: "1",
    kanban_case_card_count: "3",
    kanban_case_depends_on: ["a", "", "b"],
    kanban_case_deliverables: ["report", "quiz"],
    kanban_case_acceptance: ["done"],
    kanban_case_card_goal: "goal",
    kanban_revision_count: "2",
    created_at: "2026-05-15T08:00:00Z",
    updated_at: "2026-05-15T09:30:00Z",
  }, extra);
}

function run() {
  assert.deepEqual(publicTodoOptions(2, ["a", "b"]), { listIndex: 2, listRows: ["a", "b"] });
  assert.deepEqual(publicTodoOptions({ skipWorkflow: true }), { skipWorkflow: true });
  assert.deepEqual(publicTodoOptions("ignored"), {});
  assert.deepEqual(normalizeStringList(["a", "", "b", "c"], 2), ["a", "b"]);
  assert.equal(kanbanHasPassedAttempt({ attempts: [{ passed: false }], lastAttempt: { passed: true } }), true);
  assert.equal(kanbanWorkflowStateCompleted({ status: "completed" }, false), true);
  assert.equal(kanbanWorkflowStateCompleted({ status: "completed", completionError: "failed" }, false), false);
  assert.equal(kanbanWorkflowStateCompleted({ attempts: [{ passed: true }] }, true), true);
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "reading", phase: "submission_open" }), "todo");
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "study", phase: "analysis_pending" }), "running");
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "reading", phase: "quiz_pending" }), "running");
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "study", phase: "quiz_retry_required" }), "running");
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "reading", phase: "locked" }), "blocked");
  assert.equal(projectedWorkflowKanbanStatus({}, { kind: "reading", phase: "completed" }), "");

  const { service, calls } = createService();
  const projected = service.publicTodo(row("basic"));
  assert.equal(projected.id, "basic");
  assert.equal(projected.workspaceId, "student-a");
  assert.equal(projected.assignee, "student-a");
  assert.equal(projected.assigneeLabel, "Student A");
  assert.equal(projected.createdBy, "owner");
  assert.equal(projected.reminderLeadMinutes, 30);
  assert.equal(projected.recurrenceTemplate, true);
  assert.equal(projected.kanbanPriority, 4);
  assert.equal(projected.kanbanMaxRetries, 3);
  assert.deepEqual(projected.kanbanSkills, ["reading", "math", "extra1", "extra2", "extra3", "extra4", "extra5", "extra6"]);
  assert.deepEqual(projected.kanbanCaseDependsOn, ["a", "b"]);
  assert.equal(projected.kanbanOutputs.length, 1);
  assert.deepEqual(calls.outputs.at(-1), { workspaceId: "student-a", text: "MEDIA:/tmp/result.pdf" });
  assert.deepEqual(calls.covers.at(-1), { workspaceId: "student-a", cover: { path: "cover.png", name: "Cover" } });

  const skipped = service.publicTodo(row("study-complete", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "reading",
    kanban_status: "done",
    status: "completed",
  }), { skipWorkflow: true });
  assert.equal(skipped.workflowState, undefined);
  assert.equal(skipped.readingSubmission.status, "completed");
  assert.equal(service.publicTodoWorkflowCompleted(skipped), true);

  const blockedStudy = service.publicTodo(row("study-incomplete", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "reading",
    kanban_status: "done",
    status: "completed",
    kanban_completed_at: "2026-05-15T10:00:00Z",
    completed_at: "2026-05-15T10:00:00Z",
  }));
  assert.equal(blockedStudy.status, "open");
  assert.equal(blockedStudy.kanbanStatus, "blocked");
  assert.equal(blockedStudy.completedAt, "");
  assert.deepEqual(blockedStudy.kanbanOutputs, []);
  assert.equal(blockedStudy.studyWorkflow.kind, "study");

  const blockedAssessment = service.publicTodo(row("assessment-incomplete", {
    kanban_case_mode: "assessment-plan",
    kanban_case_template: "exam",
    kanban_status: "done",
    status: "completed",
    kanban_completed_at: "2026-05-15T10:00:00Z",
    completed_at: "2026-05-15T10:00:00Z",
  }));
  assert.equal(blockedAssessment.status, "open");
  assert.equal(blockedAssessment.kanbanStatus, "running");
  assert.equal(blockedAssessment.kanbanAssessmentKind, "exam");
  assert.equal(blockedAssessment.assessmentWorkflow.kind, "assessment");

  const lockedAssessment = service.publicTodo(row("assessment-locked", {
    kanban_case_mode: "assessment-plan",
    kanban_case_template: "exam",
    kanban_status: "ready",
    status: "open",
  }));
  assert.equal(lockedAssessment.kanbanStatus, "blocked");
  assert.equal(lockedAssessment.assessmentWorkflow.phase, "locked");

  const rows = [
    row("study-complete", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 1,
      kanban_status: "done",
      status: "completed",
    }),
    row("study-incomplete", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 2,
      kanban_status: "ready",
      status: "open",
    }),
    row("study-current", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 3,
      kanban_status: "ready",
      status: "open",
    }),
  ];
  const current = service.publicTodo(rows[2], 2, rows);
  assert.equal(current.studyWorkflow.priorContextComplete, false);
  assert.equal(calls.workflowInputs.at(-1).priorComplete, false);

  const finalRows = [
    row("study-complete", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 1,
      kanban_status: "done",
      status: "completed",
    }),
    row("assessment-incomplete", {
      kanban_case_mode: "assessment-plan",
      kanban_case_template: "exam",
      kanban_case_card_index: 2,
      kanban_status: "ready",
      status: "open",
    }),
    row("final-current", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "final-assessment",
      kanban_case_card_index: 3,
      kanban_status: "ready",
      status: "open",
    }),
  ];
  const final = service.publicTodo(finalRows[2], 2, finalRows);
  assert.equal(final.assessmentWorkflow.kind, "final-assessment");
  assert.equal(final.assessmentWorkflow.priorContextComplete, false);

  const studyProjectionService = createTodoPublicProjectionService({
    publicKanbanOutputsFromText(workspaceId, text) {
      return text ? [{ name: "result.md", path: text.replace(/^MEDIA:\s*/, ""), workspaceId }] : [];
    },
    publicKanbanReadingSubmissionSummary(_workspaceId, card) {
      if (String(card.id) === "study-done") return { status: "completed" };
      if (String(card.id) === "study-submitted") return { status: "submitted" };
      if (String(card.id) === "study-quiz") return { status: "quiz_pending", quiz: { questions: [] } };
      return { status: "not_started" };
    },
  });
  const studyRows = [
    row("study-done", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 1,
      kanban_status: "done",
      status: "completed",
    }),
    row("study-next", {
      kanban_case_mode: "study-plan",
      kanban_case_template: "reading",
      kanban_case_card_index: 2,
      kanban_status: "blocked",
      status: "open",
    }),
  ];
  const projectedStudyNext = studyProjectionService.publicTodo(studyRows[1], 1, studyRows);
  assert.equal(projectedStudyNext.workflowState.phase, "submission_open");
  assert.equal(projectedStudyNext.kanbanStatus, "todo");

  const projectedStudySubmitted = studyProjectionService.publicTodo(row("study-submitted", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "reading",
    kanban_case_card_index: 1,
    kanban_status: "blocked",
    status: "open",
  }));
  assert.equal(projectedStudySubmitted.workflowState.phase, "analysis_pending");
  assert.equal(projectedStudySubmitted.kanbanStatus, "running");

  const projectedStudyQuiz = studyProjectionService.publicTodo(row("study-quiz", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "reading",
    kanban_case_card_index: 1,
    kanban_status: "blocked",
    status: "open",
  }));
  assert.equal(projectedStudyQuiz.workflowState.phase, "quiz_pending");
  assert.equal(projectedStudyQuiz.kanbanStatus, "running");

  const projectedLearningGrowth = studyProjectionService.publicTodo(row("learning-growth-task", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "learning-growth",
    kanban_status: "ready",
    status: "open",
    learning_task_model: {
      version: "learning-task-model-v1",
      skillId: "english_short_writing",
      activityType: "writing",
      taskCardType: "single_subject",
      interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback", "learner_rewrites"],
      submissionContract: { firstSubmissionKind: "writing_draft", revisionSubmissionKind: "writing_revision" },
      completionPolicy: { firstSubmissionCompletesTask: false, completeAfterStep: "ai_evaluation", requiresFinalEvaluation: true },
    },
  }));
  assert.equal(projectedLearningGrowth.kanbanStudyKind, "learning-growth");
  assert.equal(projectedLearningGrowth.learningGrowthTaskModel.skillId, "english_short_writing");
  assert.equal(projectedLearningGrowth.learningGrowthNextAction, "submit_first_attempt");
  assert.equal(projectedLearningGrowth.readingSubmission, undefined);
  assert.equal(projectedLearningGrowth.studyWorkflow, undefined);
  assert.equal(projectedLearningGrowth.workflowState, undefined);

  const projectedLearningGrowthSubmitted = studyProjectionService.publicTodo(row("learning-growth-submitted", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "learning-growth",
    kanban_status: "ready",
    status: "open",
    learning_growth_submission_status: "submitted",
    learning_growth_submission_kind: "writing",
    learning_growth_submission_at: "2026-05-17T15:00:00.000Z",
    learning_growth_evaluation_status: "pending",
  }));
  assert.deepEqual(projectedLearningGrowthSubmitted.learningGrowthSubmission, {
    status: "submitted",
    kind: "writing",
    submittedAt: "2026-05-17T15:00:00.000Z",
    evaluationStatus: "pending",
    evaluationAt: "",
    analysisAvailable: false,
    nextStep: "pending_evaluation",
  });
  const projectedLearningGrowthEvaluated = studyProjectionService.publicTodo(row("learning-growth-evaluated", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "learning-growth",
    kanban_status: "ready",
    status: "open",
    learning_growth_submission_status: "submitted",
    learning_growth_submission_kind: "writing",
    learning_growth_submission_at: "2026-05-17T15:00:00.000Z",
    learning_growth_evaluation_status: "needs_revision",
    learning_growth_evaluation_at: "2026-05-17T15:10:00.000Z",
    learning_growth_score: 62,
    learning_growth_max_score: 100,
    learning_growth_passed: false,
    learning_growth_feedback_summary: "Needs more details.",
    learning_growth_revision_requirements: ["Add one example."],
    learning_growth_reward_status: "not_eligible",
  }));
  assert.equal(projectedLearningGrowthEvaluated.learningGrowthSubmission.analysisAvailable, true);
  assert.equal(projectedLearningGrowthEvaluated.learningGrowthSubmission.nextStep, "revise_and_resubmit");
  assert.deepEqual(projectedLearningGrowthEvaluated.learningGrowthEvaluation, {
    status: "needs_revision",
    score: 62,
    maxScore: 100,
    passed: false,
    summary: "Needs more details.",
    revisionRequirements: ["Add one example."],
    feedbackSections: {
      strengths: [],
      focusAreas: [],
      rewriteChecklist: [],
      reflectionPrompts: [],
    },
    nextStep: "revise_and_resubmit",
    evaluatedAt: "2026-05-17T15:10:00.000Z",
    report: null,
    reward: {
      status: "not_eligible",
      coinAmount: 0,
      entryId: "",
    },
  });
  const projectedLearningGrowthDraftFeedback = studyProjectionService.publicTodo(row("learning-growth-draft-feedback", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "learning-growth",
    kanban_status: "ready",
    status: "open",
    learning_growth_submission_status: "submitted",
    learning_growth_submission_kind: "writing_draft",
    learning_growth_submission_at: "2026-05-17T15:00:00.000Z",
    learning_growth_evaluation_status: "draft_feedback",
    learning_growth_evaluation_at: "2026-05-17T15:10:00.000Z",
    learning_growth_score: 79,
    learning_growth_max_score: 100,
    learning_growth_feedback_summary: "Draft feedback ready.",
    learning_growth_revision_requirements: ["Add one concrete example."],
    learning_growth_next_step: "rewrite_and_reflect",
    learning_growth_report_path: "C:\\reports\\draft-feedback.md",
    learning_growth_report_name: "draft-feedback.md",
    learning_growth_strengths: ["Clear topic."],
    learning_growth_focus_areas: ["Add one example."],
    learning_growth_rewrite_checklist: ["Rewrite two sentences."],
    learning_growth_reflection_prompts: ["What did I change?"],
    learning_growth_reward_status: "not_eligible",
    learning_task_model: {
      version: "learning-task-model-v1",
      skillId: "english_short_writing",
      activityType: "writing",
      taskCardType: "single_subject",
      interactionStateMachine: ["receive_task", "learner_drafts", "ai_feedback", "learner_rewrites"],
      submissionContract: { firstSubmissionKind: "writing_draft", revisionSubmissionKind: "writing_revision" },
      completionPolicy: { firstSubmissionCompletesTask: false, completeAfterStep: "ai_evaluation", requiresFinalEvaluation: true },
    },
  }));
  assert.equal(projectedLearningGrowthDraftFeedback.learningGrowthSubmission.analysisAvailable, true);
  assert.equal(projectedLearningGrowthDraftFeedback.learningGrowthSubmission.nextStep, "rewrite_and_reflect");
  assert.equal(projectedLearningGrowthDraftFeedback.learningGrowthNextAction, "submit_revision_and_reflection");
  assert.equal(projectedLearningGrowthDraftFeedback.learningGrowthEvaluation.report.name, "draft-feedback.md");
  assert.equal(projectedLearningGrowthDraftFeedback.learningGrowthEvaluation.feedbackSections.rewriteChecklist[0], "Rewrite two sentences.");
  assert.equal(projectedLearningGrowthDraftFeedback.kanbanOutputs.at(-1).role, "learning-growth-writing-report");
  const projectedLearningGrowthLegacySubmitted = studyProjectionService.publicTodo(row("learning-growth-legacy-submitted", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "learning-growth",
    kanban_case_card_goal: "Write a short school-life paragraph and rewrite it after feedback.",
    kanban_case_deliverables: ["\u5b66\u4e60\u6210\u679c\u63d0\u4ea4"],
    kanban_case_acceptance: ["study output", "AI feedback", "targeted quiz", "next study guidance"],
    kanban_last_comment_at: "2026-05-17T15:05:00.000Z",
  }));
  assert.equal(projectedLearningGrowthLegacySubmitted.learningGrowthSubmission.status, "submitted");
  assert.equal(projectedLearningGrowthLegacySubmitted.learningGrowthSubmission.submittedAt, "2026-05-17T15:05:00.000Z");
  assert.equal(projectedLearningGrowthLegacySubmitted.learningTaskModel.skillId, "english_short_writing");
  assert.equal(projectedLearningGrowthLegacySubmitted.kanbanCaseDeliverables[0], "first English draft");
  assert.equal(projectedLearningGrowthLegacySubmitted.kanbanCaseAcceptance[0], "first draft contains 6-8 English sentences");
  assert.equal(projectedLearningGrowthLegacySubmitted.learningGrowthTaskModel.activityType, "writing");
  assert.equal(projectedLearningGrowthLegacySubmitted.learningGrowthNextAction, "wait_for_feedback");

  const revisionService = createTodoPublicProjectionService({
    publicKanbanAssessmentSummary() {
      return { status: "pending", examAvailable: false };
    },
  });
  const revisionRows = [
    row("assessment-1", {
      kanban_case_id: "assessment-revision-case",
      kanban_case_mode: "assessment-plan",
      kanban_case_template: "math",
      kanban_case_card_id: "assessment-exam-1",
      kanban_case_card_index: 1,
      kanban_case_card_count: 10,
      kanban_status: "blocked",
      status: "open",
    }),
    row("assessment-2", {
      kanban_case_id: "assessment-revision-case",
      kanban_case_mode: "assessment-plan",
      kanban_case_template: "math",
      kanban_case_card_id: "assessment-exam-2",
      kanban_case_card_index: 2,
      kanban_case_card_count: 10,
      kanban_case_depends_on: ["assessment-exam-1"],
      kanban_status: "blocked",
      status: "open",
    }),
    row("assessment-1-revision", {
      kanban_case_id: "assessment-revision-case",
      kanban_case_mode: "assessment-plan",
      kanban_case_template: "math",
      kanban_case_card_id: "assessment-exam-1-revision-1",
      kanban_case_card_index: 11,
      kanban_case_card_count: 11,
      kanban_case_depends_on: ["assessment-exam-1"],
      kanban_revision_of: "assessment-1",
      kanban_revision_count: 1,
      kanban_status: "blocked",
      status: "open",
    }),
  ];
  const projectedRevision = revisionService.publicTodo(revisionRows[2], 2, revisionRows);
  assert.equal(projectedRevision.assessmentWorkflow.phase, "exam_open");
  assert.equal(projectedRevision.assessmentWorkflow.priorContextComplete, true);
  assert.equal(projectedRevision.kanbanStatus, "todo");
  const projectedSecondAfterRevision = revisionService.publicTodo(revisionRows[1], 1, revisionRows);
  assert.equal(projectedSecondAfterRevision.assessmentWorkflow.phase, "locked");
  assert.equal(projectedSecondAfterRevision.kanbanStatus, "blocked");

  const passedStudy = service.publicTodo(row("study-passed-attempt", {
    kanban_case_mode: "study-plan",
    kanban_case_template: "reading",
    kanban_status: "done",
    status: "completed",
  }), { skipWorkflow: true });
  assert.equal(service.publicTodoWorkflowCompleted(passedStudy), true);
}

run();
console.log("todo-public-projection-service contract passed.");
