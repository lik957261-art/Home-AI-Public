"use strict";

const assert = require("node:assert/strict");
const {
  actorRoleForStudyAssessmentPlan,
  buildStudyAssessmentPlanContract,
  deriveExamWorkflowState,
  deriveStudyAssessmentCardContract,
  deriveSubmissionWorkflowState,
  isAssessmentExamComplete,
  isStudyQuizComplete,
  normalizeKanbanAssessmentPlan,
  normalizeKanbanAssessmentSubjectId,
  normalizeKanbanStudyPlan,
  normalizeReadingPlanStartDate,
  normalizeReadingPlanTime,
  normalizeStudyPlanSchedule,
  normalizeStudyPlanScheduleFrequency,
  normalizeStudyPlanWeekdays,
  permissionsForStudyAssessmentRole,
  readingPlanDueTime,
  readingPlanScheduleDueTime,
  studyAssessmentCanActor,
} = require("../adapters/study-assessment-service");

const NOW = "2026-05-14T12:00:00.000Z";

function caseRecord(extra = {}) {
  return Object.assign({
    caseId: "generic-study-case",
    caseMode: "study-plan",
    ownerWorkspaceId: "parent",
    performerWorkspaceIds: ["learner"],
    viewerWorkspaceIds: ["observer"],
  }, extra);
}

function studyCard(extra = {}) {
  return Object.assign({
    id: "study-1",
    kanbanCaseId: "generic-study-case",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "reading",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 3,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function assessmentCard(extra = {}) {
  return Object.assign({
    id: "exam-1",
    kanbanCaseId: "generic-assessment-case",
    kanbanCaseMode: "assessment-plan",
    kanbanCaseTemplate: "assessment",
    kanbanCaseCardIndex: 1,
    kanbanCaseCardCount: 2,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function finalExamCard(extra = {}) {
  return Object.assign({
    id: "final-exam",
    kanbanCaseId: "generic-study-case",
    kanbanCaseMode: "study-plan",
    kanbanCaseTemplate: "final-assessment",
    kanbanCaseCardIndex: 3,
    kanbanCaseCardCount: 3,
    performerWorkspaceId: "learner",
    viewerWorkspaceIds: ["observer"],
    kanbanStatus: "todo",
  }, extra);
}

function testRolePermissions() {
  const record = caseRecord();
  assert.equal(actorRoleForStudyAssessmentPlan(record, "parent"), "manager");
  assert.equal(actorRoleForStudyAssessmentPlan(record, "learner"), "performer");
  assert.equal(actorRoleForStudyAssessmentPlan(record, "observer"), "viewer");
  assert.equal(studyAssessmentCanActor(record, "learner", "submitStudy"), true);
  assert.equal(studyAssessmentCanActor(record, "learner", "modify"), false);
  assert.equal(studyAssessmentCanActor(record, "observer", "answerQuiz"), false);
  assert.equal(studyAssessmentCanActor(record, "parent", "delete"), true);
  assert.equal(permissionsForStudyAssessmentRole("performer").canRetakeFinalExam, true);
}

function testSubmissionThreeStepWorkflow() {
  const initial = deriveSubmissionWorkflowState({});
  assert.equal(initial.phase, "submission_open");
  assert.equal(initial.steps.submit.active, true);
  assert.equal(initial.steps.analyze.status, "locked");
  assert.equal(initial.steps.quiz.status, "locked");

  const analysisPending = deriveSubmissionWorkflowState({ status: "analyzing", submittedAt: "2026-05-14T10:00:00.000Z" });
  assert.equal(analysisPending.phase, "analysis_pending");
  assert.equal(analysisPending.steps.submit.status, "done");
  assert.equal(analysisPending.steps.analyze.active, true);
  assert.equal(analysisPending.steps.quiz.status, "locked");

  const quizPending = deriveSubmissionWorkflowState({ status: "quiz_pending", quiz: { itemCount: 3 } });
  assert.equal(quizPending.phase, "quiz_pending");
  assert.equal(quizPending.steps.analyze.status, "done");
  assert.equal(quizPending.steps.quiz.active, true);

  const retry = deriveSubmissionWorkflowState({
    status: "quiz_pending",
    quiz: { itemCount: 3 },
    attempts: [{ correctCount: 2, questionCount: 3 }],
  });
  assert.equal(retry.phase, "quiz_retry_required");
  assert.equal(retry.retryRequired, true);

  const completed = deriveSubmissionWorkflowState({
    status: "completed",
    quiz: { itemCount: 3 },
    attempts: [{ correctCount: 3, questionCount: 3 }],
  });
  assert.equal(completed.phase, "completed");
  assert.equal(completed.completed, true);
  assert.equal(completed.steps.quiz.status, "done");
}

function testQuizAndExamCompletionEvidence() {
  assert.equal(isStudyQuizComplete({ status: "completed", quiz: { itemCount: 2 } }), false);
  assert.equal(isStudyQuizComplete({
    status: "quiz_pending",
    attempts: [{ correctCount: 2, questionCount: 2 }],
  }), true);
  assert.equal(isStudyQuizComplete({
    status: "completed",
    attempts: [{ correctCount: 2, questionCount: 2 }],
    completionError: "kanban completion failed",
  }), false);
  assert.equal(isAssessmentExamComplete({ status: "completed" }), false);
  assert.equal(isAssessmentExamComplete({ attempts: [{ score: 75, passScore: 70 }] }), true);
  assert.equal(isAssessmentExamComplete({ attempts: [{ score: 65, passScore: 70 }] }), false);
}

function testCardOpenRules() {
  const record = caseRecord();
  const first = deriveStudyAssessmentCardContract({
    card: studyCard(),
    caseRecord: record,
    actor: "learner",
    now: NOW,
  });
  assert.equal(first.visible, true);
  assert.equal(first.open, true);
  assert.equal(first.action, "submitStudy");
  assert.equal(first.reason, "open");

  const lockedByPrior = deriveStudyAssessmentCardContract({
    card: studyCard({ id: "study-2", kanbanCaseCardIndex: 2 }),
    caseRecord: record,
    actor: "learner",
    priorCards: [studyCard({ id: "study-1", readingSubmission: { status: "quiz_pending" } })],
    now: NOW,
  });
  assert.equal(lockedByPrior.open, false);
  assert.equal(lockedByPrior.reason, "prior_incomplete");

  const scheduled = deriveStudyAssessmentCardContract({
    card: studyCard({ id: "study-2", kanbanCaseCardIndex: 2, dueAt: "2026-05-15T12:00:00.000Z" }),
    caseRecord: record,
    actor: "learner",
    priorCards: [studyCard({
      id: "study-1",
      readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
    })],
    now: NOW,
  });
  assert.equal(scheduled.visible, true);
  assert.equal(scheduled.open, false);
  assert.equal(scheduled.reason, "scheduled");

  const viewer = deriveStudyAssessmentCardContract({
    card: studyCard(),
    caseRecord: record,
    actor: "observer",
    now: NOW,
  });
  assert.equal(viewer.visible, true);
  assert.equal(viewer.open, false);
  assert.equal(viewer.reason, "permission_denied");

  const analysisPending = deriveStudyAssessmentCardContract({
    card: studyCard({ readingSubmission: { status: "analyzing", submittedAt: "2026-05-14T10:00:00.000Z" } }),
    caseRecord: record,
    actor: "learner",
    now: NOW,
  });
  assert.equal(analysisPending.open, false);
  assert.equal(analysisPending.reason, "analysis_pending");
}

function testFinalExamRetakeUntilPassed() {
  const failedFinal = deriveExamWorkflowState(finalExamCard({
    assessmentExam: { status: "completed", attempts: [{ score: 60, passScore: 80, passed: false }] },
  }));
  assert.equal(failedFinal.phase, "retake_required");
  assert.equal(failedFinal.completed, false);
  assert.equal(failedFinal.mustRetakeUntilPassed, true);

  const retakeOpen = deriveStudyAssessmentCardContract({
    card: finalExamCard({
      assessmentExam: { status: "retake_required", attempts: [{ score: 60, passScore: 80, passed: false }] },
    }),
    caseRecord: caseRecord(),
    actor: "learner",
    priorCards: [
      studyCard({
        id: "study-1",
        readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
      }),
      assessmentCard({
        id: "exam-1",
        assessmentExam: { status: "completed", attempts: [{ score: 85, passScore: 70 }] },
      }),
    ],
    now: NOW,
  });
  assert.equal(retakeOpen.open, true);
  assert.equal(retakeOpen.action, "retakeFinalExam");
  assert.equal(retakeOpen.reason, "retake_required");
  assert.equal(retakeOpen.workflow.mustRetakeUntilPassed, true);

  const passedFinal = deriveExamWorkflowState(finalExamCard({
    assessmentExam: { status: "completed", attempts: [{ score: 90, passScore: 80 }] },
  }));
  assert.equal(passedFinal.phase, "completed");
  assert.equal(passedFinal.completed, true);
  assert.equal(passedFinal.mustRetakeUntilPassed, false);
}

function testPlanContractSequencing() {
  const cards = [
    studyCard({
      id: "study-1",
      kanbanCaseCardIndex: 1,
      readingSubmission: { status: "completed", attempts: [{ correctCount: 2, questionCount: 2 }] },
    }),
    assessmentCard({
      id: "exam-1",
      kanbanCaseId: "generic-study-case",
      kanbanCaseCardIndex: 2,
      assessmentExam: { status: "completed", attempts: [{ score: 75, passScore: 70 }] },
    }),
    finalExamCard({
      id: "final-exam",
      kanbanCaseCardIndex: 3,
      assessmentExam: { status: "retake_required", attempts: [{ score: 60, passScore: 80, passed: false }] },
    }),
  ];
  const plan = buildStudyAssessmentPlanContract({
    cards,
    caseRecord: caseRecord(),
    actor: "learner",
    now: NOW,
  });
  assert.equal(plan.actorRole, "performer");
  assert.equal(plan.counts.total, 3);
  assert.equal(plan.counts.completed, 2);
  assert.equal(plan.counts.retakeRequired, 1);
  assert.deepEqual(plan.cards.map((item) => item.cardId), ["study-1", "exam-1", "final-exam"]);
  assert.equal(plan.cards[2].open, true);
  assert.equal(plan.cards[2].action, "retakeFinalExam");
}

function testStudyPlanScheduleHelpersMatchServerBehavior() {
  const now = new Date(2026, 4, 15, 9, 30, 0, 0);

  assert.equal(normalizeReadingPlanTime("7\uFF1A5"), "07:05");
  assert.equal(normalizeReadingPlanTime("invalid"), "21:00");
  assert.equal(normalizeReadingPlanStartDate("2026-5-7", { now }), "2026-05-07");
  assert.equal(normalizeReadingPlanStartDate("", { now }), "2026-05-15");
  assert.equal(readingPlanDueTime("2026-05-15", "19:15", 2, { now }), "2026-05-17 19:15");

  assert.equal(normalizeStudyPlanScheduleFrequency("\u6BCF\u9031"), "weekly");
  assert.equal(normalizeStudyPlanScheduleFrequency("\u6708"), "monthly");
  assert.equal(normalizeStudyPlanScheduleFrequency("anything else"), "daily");
  assert.deepEqual(normalizeStudyPlanWeekdays("\u5468\u4E00 \u9031\u4E09 7 0", "2026-05-15", { now }), [1, 3, 0]);
  assert.deepEqual(normalizeStudyPlanWeekdays("", "2026-05-15", { now }), [5]);

  const weekly = normalizeStudyPlanSchedule({
    scheduleFrequency: "\u6BCF\u5468",
    scheduleWeekdays: "\u5468\u4E00 \u5468\u4E09",
  }, "2026-05-15", "08:00", { now });
  assert.deepEqual(weekly, {
    frequency: "weekly",
    weekdays: [1, 3],
    weekdaysOneBased: [1, 3],
    monthDay: 15,
    label: "\u6BCF\u5468 \u5468\u4E00\u3001\u5468\u4E09",
    startDate: "2026-05-15",
    timeOfDay: "08:00",
  });
  assert.equal(readingPlanScheduleDueTime(weekly, 0, { now }), "2026-05-18 08:00");
  assert.equal(readingPlanScheduleDueTime(weekly, 1, { now }), "2026-05-20 08:00");

  const monthly = normalizeStudyPlanSchedule({ scheduleFrequency: "\u6BCF\u6708", monthDay: 31 }, "2026-01-31", "20:30", { now });
  assert.equal(monthly.label, "\u6BCF\u6708 31 \u65E5");
  assert.equal(readingPlanScheduleDueTime(monthly, 1, { now }), "2026-02-28 20:30");
}

function testStudyPlanNormalizationMatchesServerPayload() {
  const normalizeWorkspaceIdList = (value) => {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s;]+/);
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      const text = String(item || "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  };
  const plan = normalizeKanbanStudyPlan({
    studyTemplate: "reading",
    contentTitle: "Charlotte's Web",
    learnerName: "Learner A",
    sessions: 4,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
    scheduleFrequency: "weekly",
    scheduleWeekdays: "1 3",
    reminderLeadMinutes: 20,
    sourceText: "Read chapters and retell the key ideas.",
    performerWorkspaceIds: ["child", "owner", "child"],
    viewerWorkspaceIds: "viewer child owner",
  }, "owner", {
    maxSessions: 2,
    now: new Date(2026, 4, 15, 9, 30, 0, 0),
    nowMs: () => 1778818102000,
    randomBytes: () => Buffer.from("a1b2c3", "hex"),
    normalizeWorkspaceIdList,
  });

  assert.deepEqual(Object.assign({}, plan, { cards: undefined }), {
    id: "study-plan-1778818102000-a1b2c3",
    mode: "study-plan",
    template: "reading",
    workspaceId: "owner",
    bookTitle: "Charlotte's Web",
    contentTitle: "Charlotte's Web",
    readerName: "Learner A",
    learnerName: "Learner A",
    subject: "\u82F1\u8BED\u9605\u8BFB",
    activity: "\u9605\u8BFB\u590D\u8FF0",
    submissionLabel: "\u590D\u8FF0\u5F55\u97F3",
    sessions: 2,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
    scheduleFrequency: "weekly",
    scheduleWeekdays: [1, 3],
    scheduleMonthDay: 15,
    scheduleLabel: "\u6BCF\u5468 \u5468\u4E00\u3001\u5468\u4E09",
    reminderLeadMinutes: 20,
    sourceText: "Read chapters and retell the key ideas.",
    summary: "Learner A\uFF1A\u82F1\u8BED\u9605\u8BFB - Charlotte's Web",
    performerWorkspaceIds: ["child"],
    viewerWorkspaceIds: ["viewer"],
    cards: undefined,
  });
  assert.equal(plan.cards.length, 2);
  assert.deepEqual(plan.cards[0], {
    clientId: "reading-session-1",
    title: "Learner A\u9605\u8BFB\u300ACharlotte's Web\u300B\u7B2C 1/2 \u6B21\uFF1A\u5F55\u97F3\u590D\u8FF0",
    day: 1,
    dueTime: "2026-05-18 19:15",
    description: [
      "学习计划：Learner A：英语阅读 - Charlotte's Web",
      "第 1 次，共 2 次。",
      "执行频率：每周 周一、周三，开始时间 2026-05-15 19:15。",
      "领域/科目：英语阅读",
      "当天任务：阅读复述",
      "提交要求：复述录音",
      "当天阅读完成后，需要上传语音复述或总结录音。Hermes Mobile 会先转写录音，再结合前面已完成卡片的反馈生成评价、针对性单选考卷和下一次指导；答卷 10 题全对后，本卡片才会完成。",
      "整体要求：\nRead chapters and retell the key ideas.",
    ].join("\n\n"),
    deliverables: ["\u8BFB\u540E\u590D\u8FF0\u5F55\u97F3", "AI\u9605\u8BFB\u8BC4\u4EF7", "\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377", "\u4E0B\u4E00\u6B21\u9605\u8BFB\u6307\u5BFC"],
    acceptance: ["\u5DF2\u4E0A\u4F20\u5F53\u5929\u5F55\u97F3", "\u5DF2\u751F\u6210\u8F6C\u5199\u548CAI\u8BC4\u4EF7", "10\u9898\u5355\u9009\u8003\u5377\u5168\u5BF9", "\u5361\u7247\u5B8C\u6210\u7ED3\u679C\u5305\u542B\u5206\u6790\u6587\u4EF6"],
  });
  assert.equal(plan.cards[1].clientId, "reading-session-2");
  assert.equal(plan.cards[1].dueTime, "2026-05-20 19:15");
}

function testStudyPlanNormalizationCustomDefaultsAndRequiredTitle() {
  assert.throws(
    () => normalizeKanbanStudyPlan({ learnerName: "Learner A" }, "owner"),
    /Study plan contentTitle is required/,
  );

  const plan = normalizeKanbanStudyPlan({
    id: "custom-study-1",
    title: "Fractions Project",
    learner_name: "Learner B",
    template: "custom",
    sessions: 1,
    start_date: "2026-05-15",
  }, "owner", { now: new Date(2026, 4, 15, 9, 30, 0, 0) });

  assert.equal(plan.template, "custom");
  assert.equal(plan.subject, "\u5B66\u4E60");
  assert.equal(plan.activity, "\u63D0\u4EA4\u6210\u679C\u5E76\u8003\u6838");
  assert.equal(plan.submissionLabel, "\u5B66\u4E60\u6210\u679C\u6587\u4EF6\u6216\u6587\u5B57");
  assert.equal(plan.cards[0].clientId, "custom-session-1");
  assert.equal(plan.cards[0].title, "Learner B\u5B66\u4E60\u7B2C 1/1 \u6B21\uFF1A\u63D0\u4EA4\u6210\u679C");
  assert.deepEqual(plan.cards[0].deliverables, ["\u5B66\u4E60\u6210\u679C\u63D0\u4EA4", "AI\u8BC4\u4EF7", "\u9488\u5BF9\u6027\u5355\u9009\u8003\u5377", "\u4E0B\u4E00\u6B21\u5B66\u4E60\u6307\u5BFC"]);
}

function testAssessmentPlanSubjectNormalization() {
  assert.equal(normalizeKanbanAssessmentSubjectId("AMC math"), "math");
  assert.equal(normalizeKanbanAssessmentSubjectId("\u82f1\u6587 reading"), "english");
  assert.equal(normalizeKanbanAssessmentSubjectId("\u79d1\u5b66 physics"), "science");
  assert.equal(normalizeKanbanAssessmentSubjectId("\u5386\u53f2"), "history");
  assert.equal(normalizeKanbanAssessmentSubjectId("\u8bed\u6587"), "chinese");
  assert.equal(normalizeKanbanAssessmentSubjectId("Python \u7f16\u7a0b"), "programming");
  assert.equal(normalizeKanbanAssessmentSubjectId("Custom Domain"), "custom-domain");
}

function testAssessmentPlanNormalizationMatchesServerPayload() {
  const plan = normalizeKanbanAssessmentPlan({
    id: "assessment-case-1",
    subject: "Math",
    learnerName: "Learner A",
    courseLevel: "Grade 6",
    title: "Fractions Check",
    examCount: 2,
    questionCount: 12,
    durationMinutes: 45,
    passingScore: 85,
    intervalDays: 7,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
    reminderLeadMinutes: 20,
    difficulty: "foundation 30 / standard 50 / stretch 20",
    blueprint: "Use fraction concepts.",
    performerWorkspaceIds: ["child", "owner", "child"],
    viewerWorkspaceIds: "viewer child owner",
  }, "owner");

  assert.deepEqual(Object.assign({}, plan, { cards: undefined }), {
    id: "assessment-case-1",
    mode: "assessment-plan",
    template: "math",
    workspaceId: "owner",
    subject: "Math",
    subjectId: "math",
    learnerName: "Learner A",
    courseLevel: "Grade 6",
    title: "Fractions Check",
    examCount: 2,
    questionCount: 12,
    durationMinutes: 45,
    passingScore: 85,
    intervalDays: 7,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
    reminderLeadMinutes: 20,
    difficulty: "foundation 30 / standard 50 / stretch 20",
    blueprint: "Use fraction concepts.",
    retakeUntilPass: true,
    summary: "Learner A\uFF1AMath Grade 6 - Fractions Check",
    performerWorkspaceIds: ["child"],
    viewerWorkspaceIds: ["viewer"],
    cards: undefined,
  });
  assert.equal(plan.cards.length, 2);
  assert.deepEqual(plan.cards[0], {
    clientId: "assessment-exam-1",
    title: "Learner AMath\u7b2c 1/2 \u6b21\u6b63\u5f0f\u6d4b\u8bd5",
    dueTime: "2026-05-15 19:15",
    description: [
      "\u8003\u8bd5\u8ba1\u5212\uFF1ALearner A\uFF1AMath Grade 6 - Fractions Check",
      "\u79d1\u76ee\uFF1AMath",
      "\u9636\u6bb5\uFF1AGrade 6",
      "\u9898\u91cf\uFF1A12 \u9898",
      "\u65f6\u957f\uFF1A45 \u5206\u949f",
      "\u901a\u8fc7\u7ebf\uFF1A85 \u5206",
      "\u96be\u5ea6\uFF1Afoundation 30 / standard 50 / stretch 20",
      "\u8fd9\u662f\u6b63\u5f0f\u68c0\u6d4b\u5361\u7247\uFF0C\u96be\u5ea6\u9ad8\u4e8e\u6bcf\u65e5\u5c0f\u6d4b\uFF1B\u4f4e\u4e8e\u901a\u8fc7\u7ebf\u65f6\u4e0d\u5b8c\u6210\u5361\u7247\uFF0C\u7ee7\u7eed\u4fdd\u6301\u91cd\u8003\u72b6\u6001\u3002",
      "\u8003\u8bd5\u84dd\u56fe\uFF1A\nUse fraction concepts.",
    ].join("\n\n"),
    config: {
      schemaVersion: 1,
      kind: "assessment-plan",
      template: "assessment",
      subject: "Math",
      subjectId: "math",
      learnerName: "Learner A",
      courseLevel: "Grade 6",
      questionCount: 12,
      durationMinutes: 45,
      passingScore: 85,
      difficulty: "foundation 30 / standard 50 / stretch 20",
      retakeUntilPass: true,
      requiresRequirementInput: false,
      examIndex: 1,
      examCount: 2,
      finalExam: false,
    },
    deliverables: ["\u6b63\u5f0f\u8003\u5377", "\u81ea\u52a8\u8bc4\u5206", "\u80fd\u529b\u8bca\u65ad", "\u9519\u9898\u4e0e\u8865\u5f3a\u5efa\u8bae"],
    acceptance: [
      "\u5b8c\u6210 12 \u9898\u6b63\u5f0f\u6d4b\u8bd5",
      "\u5f97\u5206\u8fbe\u5230 85/100",
      "\u672a\u8fbe\u6807\u5219\u4fdd\u7559\u4e3a\u91cd\u8003\u72b6\u6001",
      "\u751f\u6210\u8003\u8bd5\u62a5\u544a\u548c\u4e0b\u4e00\u6b65\u8865\u5f3a\u5efa\u8bae",
    ],
  });
  assert.equal(plan.cards[1].clientId, "assessment-exam-2");
  assert.equal(plan.cards[1].title, "Learner AMath\u7b2c 2/2 \u6b21\u6b63\u5f0f\u6d4b\u8bd5");
  assert.equal(plan.cards[1].dueTime, "2026-05-22 19:15");
  assert.equal(plan.cards[1].config.examIndex, 2);
}

function testProgrammingAssessmentPlanRequiresPerCardInput() {
  const plan = normalizeKanbanAssessmentPlan({
    id: "programming-case-1",
    subject: "Python \u7f16\u7a0b",
    learnerName: "Learner P",
    courseLevel: "\u521d\u7ea7 Python",
    title: "\u7f16\u7a0b\u6545\u4e8b",
    examCount: 1,
    questionCount: 10,
    startDate: "2026-05-15",
    timeOfDay: "20:00",
    blueprint: "\u6bcf\u5f20\u5361\u7247\u5f00\u653e\u540e\u586b\u5199\u672c\u6b21\u9700\u6c42\u518d\u51fa\u9898\u3002",
  }, "owner");

  assert.equal(plan.template, "programming");
  assert.equal(plan.subjectId, "programming");
  assert.equal(plan.cards.length, 1);
  assert.equal(plan.cards[0].config.template, "programming");
  assert.equal(plan.cards[0].config.requiresRequirementInput, true);
  assert.match(plan.cards[0].title, /\u7f16\u7a0b\u6d4b\u9a8c/);
  assert.match(plan.cards[0].description, /\u5148\u586b\u5199\u672c\u6b21\u7f16\u7a0b\u9700\u6c42/);
  assert.deepEqual(plan.cards[0].deliverables, [
    "\u672c\u6b21\u7f16\u7a0b\u9700\u6c42",
    "\u9488\u5bf9\u6027\u7f16\u7a0b\u6d4b\u9a8c",
    "\u81ea\u52a8\u8bc4\u5206",
    "\u9898\u76ee\u8bb2\u89e3\u548c\u7f16\u7a0b\u65e5\u5fd7",
  ]);
  assert.match(plan.cards[0].acceptance.join("\n"), /\u7f16\u7a0b\u65e5\u5fd7/);
}

function testProgrammingStudyTemplateReusesAssessmentPlanSchedule() {
  const plan = normalizeKanbanStudyPlan({
    id: "programming-study-case-1",
    studyTemplate: "programming",
    subjectDomain: "Python \u7f16\u7a0b",
    learnerName: "Learner P",
    activityTitle: "\u6bcf\u5468 Python \u7ec3\u4e60",
    sessions: 3,
    startDate: "2026-05-15",
    timeOfDay: "20:00",
    scheduleFrequency: "weekly",
    scheduleWeekdays: [5, 7],
    sourceText: "\u6309\u8001\u5e08\u5f53\u5929\u91cd\u70b9\u51fa\u9898\u3002",
  }, "owner", { now: new Date(2026, 4, 14, 12, 0, 0, 0) });

  assert.equal(plan.mode, "assessment-plan");
  assert.equal(plan.template, "programming");
  assert.equal(plan.subjectId, "programming");
  assert.equal(plan.examCount, 3);
  assert.equal(plan.questionCount, 10);
  assert.equal(plan.scheduleFrequency, "weekly");
  assert.deepEqual(plan.scheduleWeekdays, [5, 7]);
  assert.equal(plan.cards[0].dueTime, "2026-05-15 20:00");
  assert.equal(plan.cards[1].dueTime, "2026-05-17 20:00");
  assert.equal(plan.cards[0].config.requiresRequirementInput, true);
  assert.match(plan.cards[0].title, /\u7f16\u7a0b\u6d4b\u9a8c/);
}

function testLinkedStudyAssessmentPlanFinalCard() {
  const plan = normalizeKanbanAssessmentPlan({
    id: "study-case-1",
    subject: "Math",
    learnerName: "Learner A",
    courseLevel: "Grade 6",
    examCount: 2,
    startDate: "2026-05-15",
    timeOfDay: "19:15",
  }, "owner", { linkedStudyPlan: true });

  assert.equal(plan.mode, "study-plan");
  assert.equal(plan.template, "final-assessment");
  assert.equal(plan.cards[0].clientId, "assessment-exam-1");
  assert.equal(plan.cards[0].config.kind, "final-study-assessment");
  assert.equal(plan.cards[0].config.finalExam, false);
  assert.equal(plan.cards[1].clientId, "final-assessment");
  assert.equal(plan.cards[1].title, "Learner AMath\u9636\u6bb5\u7ed3\u675f\u7efc\u5408\u8003\u8bd5");
  assert.equal(plan.cards[1].config.kind, "final-study-assessment");
  assert.equal(plan.cards[1].config.finalExam, true);
  assert.match(plan.cards[1].description, /\u8fd9\u662f\u5b66\u4e60\u8ba1\u5212\u7684\u6700\u7ec8\u9636\u6bb5\u8003\u8bd5/);
}

testRolePermissions();
testSubmissionThreeStepWorkflow();
testQuizAndExamCompletionEvidence();
testCardOpenRules();
testFinalExamRetakeUntilPassed();
testPlanContractSequencing();
testStudyPlanScheduleHelpersMatchServerBehavior();
testStudyPlanNormalizationMatchesServerPayload();
testStudyPlanNormalizationCustomDefaultsAndRequiredTitle();
testAssessmentPlanSubjectNormalization();
testAssessmentPlanNormalizationMatchesServerPayload();
testProgrammingAssessmentPlanRequiresPerCardInput();
testProgrammingStudyTemplateReusesAssessmentPlanSchedule();
testLinkedStudyAssessmentPlanFinalCard();

console.log("study-assessment-service tests passed");
