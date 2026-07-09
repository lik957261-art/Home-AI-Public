"use strict";

export const LEARNING_GROWTH_TASK_MODEL_VERSION = "20260705-learning-growth-task-model-v1";

export function taskModel(todo = {}) {
  const model = todo?.learningTaskModel || null;
  if (model && typeof model === "object") return model;
  const summary = todo?.learningGrowthTaskModel || null;
  return summary && typeof summary === "object" ? summary : null;
}

export function activityLabel(value) {
  const activity = String(value || "").trim();
  if (activity === "writing") return "写作";
  if (activity === "reading") return "阅读";
  if (activity === "listening") return "听力";
  if (activity === "speaking") return "口语";
  if (activity === "pronunciation") return "发音";
  if (activity === "vocabulary") return "词汇";
  if (activity === "grammar") return "语法";
  if (activity === "rewriting") return "改写";
  if (activity === "presentation") return "演讲";
  if (activity === "weekly_challenge") return "周挑战";
  return activity || "练习";
}

export function nextActionLabel(action) {
  const value = String(action || "").trim();
  if (value === "submit_first_attempt") return "提交第一次作答";
  if (value === "wait_for_feedback") return "等待 AI 批改";
  if (value === "submit_revision") return "提交修改版";
  if (value === "submit_revision_and_reflection") return "提交修改版";
  if (value === "submit_spoken_reflection") return "录音复盘";
  if (value === "review_feedback") return "查看反馈";
  return value || "开始任务";
}

export function submissionPrompt(evaluation = {}, todo = {}) {
  const nextStep = String(evaluation.nextStep || "");
  if (nextStep === "rewrite_and_reflect") return "按 AI 批改写下修改后的版本，保留明显修改，然后提交。";
  if (nextStep === "revise_and_resubmit") return "按批改报告再改一版，然后提交。";
  const activity = String(taskModel(todo)?.activityType || "").trim();
  if (activity === "vocabulary") return "写下本次词汇造句，尽量用学校或生活场景。";
  if (activity === "grammar") return "写下修改后的句子和一句规则总结。";
  if (activity === "reading") return "写下阅读答案、理由和不确定的地方。";
  if (activity === "listening") return "写下听到的 3-5 个要点，再标出最不确定的一处。";
  if (activity === "speaking") return "写下复述稿或口语复述要点：主旨、两个细节和一句复盘。";
  if (activity === "pronunciation") return "写下跟读句子、觉得最难的发音点，以及修复后的重读句。";
  if (activity === "rewriting") return "写下改写版、修改理由和一个变式修复句。";
  if (activity === "presentation") return "写下演讲提纲：开场、两个要点、结尾，并补一句排练反思。";
  if (activity === "weekly_challenge") return "写下本周综合作答：一个完整回答、一个改进句和一句复盘。";
  return "写下本次学习任务作答。";
}

export const DEFAULT_SUBMISSION_GUARDS = Object.freeze({
  default: Object.freeze({ minWords: 40, minChars: 200 }),
  writing: Object.freeze({ minWords: 80, minChars: 300 }),
  rewriting: Object.freeze({ minWords: 70, minChars: 380 }),
  vocabulary: Object.freeze({ minWords: 40, minChars: 220 }),
  grammar: Object.freeze({ minWords: 35, minChars: 180 }),
  reading: Object.freeze({ minWords: 50, minChars: 250 }),
  listening: Object.freeze({ minWords: 35, minChars: 180 }),
  speaking: Object.freeze({ minWords: 45, minChars: 220 }),
  pronunciation: Object.freeze({ minWords: 20, minChars: 100 }),
  presentation: Object.freeze({ minWords: 60, minChars: 320 }),
  weekly_challenge: Object.freeze({ minWords: 80, minChars: 450 }),
});

export function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function submissionStage(evaluation = {}, todo = {}) {
  const explicit = String(evaluation.stage || evaluation.submissionStage || todo?.learningGrowthSubmissionStage || "").trim().toLowerCase();
  if (["final", "rewrite", "revision", "resubmission"].includes(explicit)) return "final";
  if (["draft", "first_draft", "initial"].includes(explicit)) return "draft";
  const status = String(evaluation.status || todo?.learningGrowthEvaluationStatus || "").trim().toLowerCase();
  if (["draft_feedback", "needs_revision", "review_required", "pending_review"].includes(status)) return "final";
  return "draft";
}

export function submissionGuard(modelOrTodo = {}, evaluation = {}) {
  const model = taskModel(modelOrTodo) || (modelOrTodo && typeof modelOrTodo === "object" ? modelOrTodo : {});
  const activity = String(model.activityType || "").trim().toLowerCase();
  const base = DEFAULT_SUBMISSION_GUARDS[activity] || DEFAULT_SUBMISSION_GUARDS.default;
  const contract = model && typeof model === "object" ? (model.submissionContract || {}) : {};
  const firstPass = submissionStage(evaluation, modelOrTodo) === "draft";
  const multiplier = firstPass ? 1 : 0.6;
  return Object.freeze({
    activityType: activity || "default",
    stage: firstPass ? "draft" : "final",
    minWords: positiveInt(contract.minSubmissionWords ?? contract.minimumWords ?? contract.minWords, Math.max(25, Math.round(base.minWords * multiplier))),
    minChars: positiveInt(contract.minSubmissionChars ?? contract.minimumChars ?? contract.minChars, Math.max(120, Math.round(base.minChars * multiplier))),
  });
}

export function submissionTextStats(text) {
  const value = String(text || "").trim();
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return Object.freeze({
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  });
}

export function validateSubmissionText(text, guard = {}) {
  const stats = submissionTextStats(text);
  const minWords = positiveInt(guard.minWords, 0);
  const minChars = positiveInt(guard.minChars, 0);
  if ((!minWords || stats.words >= minWords) && (!minChars || stats.chars >= minChars)) {
    return Object.freeze({ ok: true, stats, guard });
  }
  return Object.freeze({
    ok: false,
    stats,
    guard,
    message: `作答过短：至少 ${minWords} 个英文词、${minChars} 个有效字符后再提交。`,
  });
}

export function submissionRequirementLabel(guard = {}, stats = null) {
  const minWords = positiveInt(guard.minWords, 0);
  const minChars = positiveInt(guard.minChars, 0);
  const prefix = `至少 ${minWords} 个英文词 / ${minChars} 个有效字符`;
  if (!stats) return prefix;
  const missingWords = Math.max(0, minWords - Number(stats.words || 0));
  const missingChars = Math.max(0, minChars - Number(stats.chars || 0));
  if (!missingWords && !missingChars) return `已达标：${prefix}；当前 ${stats.words} 词 / ${stats.chars} 字符。`;
  const gaps = [];
  if (missingWords) gaps.push(`还差 ${missingWords} 个英文词`);
  if (missingChars) gaps.push(`还差 ${missingChars} 个有效字符`);
  return `未达标：${gaps.join("，")}；要求 ${prefix}；当前 ${stats.words} 词 / ${stats.chars} 字符。`;
}

export function canWithdrawSubmission(submitted = {}, todo = {}, evaluation = {}, nowMs = Date.now()) {
  const submittedAt = Date.parse(submitted.submittedAt || todo?.learningGrowthSubmissionAt || "");
  if (!Number.isFinite(submittedAt)) return false;
  const reward = evaluation.reward || {};
  const rewardStatus = String(reward.status || todo?.learningGrowthRewardStatus || "").trim().toLowerCase();
  const kanbanStatus = String(todo?.kanbanStatus || todo?.kanban_status || todo?.status || "").trim().toLowerCase();
  const completed = ["done", "archived", "cancelled", "canceled", "completed"].includes(kanbanStatus) || String(evaluation.nextStep || "").trim() === "completed";
  return nowMs - submittedAt >= 0 && nowMs - submittedAt <= 5 * 60 * 1000 && !completed && rewardStatus !== "settled" && !reward.entryId;
}

export function reportHistory(todo = {}, evaluation = {}) {
  const raw = Array.isArray(evaluation.reportHistory) && evaluation.reportHistory.length
    ? evaluation.reportHistory
    : (Array.isArray(todo.learningGrowthReportHistory) && todo.learningGrowthReportHistory.length ? todo.learningGrowthReportHistory : []);
  const fromOutputs = Array.isArray(todo.kanbanOutputs)
    ? todo.kanbanOutputs.filter((item) => String(item?.role || "").includes("learning-growth") && /report|feedback|批改|评价/i.test(String(item?.role || item?.name || "")))
    : [];
  const seen = new Set();
  return raw.concat(fromOutputs).filter((item) => item && typeof item === "object").map((item, index) => Object.assign({ attemptIndex: index + 1 }, item)).filter((item) => {
    const key = String(item.path || item.url || item.name || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(-12);
}

export function outcomeText(evaluation = {}, interactionState = {}) {
  const status = String(evaluation.status || "").trim();
  const nextStep = String(evaluation.nextStep || interactionState.nextStep || "").trim();
  const passLine = Number(evaluation.finalPassingScore || evaluation.passingScore || interactionState.finalPassingScore || 80) || 80;
  const score = Number(evaluation.score);
  const scoreReachedPassLine = Number.isFinite(score) && score >= passLine;
  const completionPolicy = Object.assign({}, interactionState.completionPolicy || {}, evaluation.completionPolicy || {});
  const completionDecision = String(evaluation.completionDecision || interactionState.completionDecision || "").trim();
  const completedBySeriousAttempts = completionPolicy.threeSeriousSubmissionsComplete === true
    || (completionDecision === "complete_current_card" && Number(completionPolicy.attemptNo || 0) >= 3);
  if (nextStep === "spoken_reflection_required" || status === "reflection_required" || interactionState.requiresReflection || interactionState.canSubmitReflection) {
    if (completedBySeriousAttempts || !scoreReachedPassLine) {
      return Object.freeze({
        kind: "reflection",
        title: "三次认真提交已完成，待录音复盘",
        body: "本卡按三次认真提交机制进入复盘；确定分数仍保留为本页显示的真实分。录音复盘提交后完成结算，薄弱点会进入后续练习。",
      });
    }
    return Object.freeze({
      kind: "reflection",
      title: "最终评分已达标，待录音复盘",
      body: `最终分数已达到 ${passLine} 分线，先看本页最近批改和复盘提示，再用录音说明错误、原因和下次改进。复盘通过后再结算分数和金币。`,
    });
  }
  if (evaluation.passed || nextStep === "completed" || status === "completed") return Object.freeze({ kind: "passed", title: "本次已通过", body: "按本页最近批改的要点完成后续复盘或结算。" });
  if ((nextStep === "rewrite_and_reflect" || status === "draft_feedback") && scoreReachedPassLine) {
    return Object.freeze({
      kind: "reflection",
      title: "初稿批改已达标，待反思和修改复盘",
      body: `这个 ${scoreReachedPassLine ? `${passLine} 分线` : "阶段"} 已达到，但本卡还没有最终完成。下一步需要先看 AI 批改，再按提示做修改和反思；复盘完成后，系统才会进入最终完成和结算。`,
    });
  }
  if (nextStep === "rewrite_and_reflect" || nextStep === "revise_and_resubmit" || status === "needs_revision" || status === "draft_feedback") return Object.freeze({ kind: "revision", title: "本次还需要修改", body: "先看本页下方的详细批改信息，按重点修改后再提交。批改历史会继续保留在交付目录中。" });
  if (status === "pending") return Object.freeze({ kind: "pending", title: "正在等待 AI 批改", body: "作答已保存，请等待本次批改完成。" });
  return Object.freeze({ kind: "review", title: "批改结果", body: "查看本次批改和历史记录，再按下一步提交。" });
}

export function deterministicScoreText(evaluation = {}) {
  const score = Number(evaluation.score);
  if (!Number.isFinite(score)) return "未返回确定分数";
  const maxScore = Number(evaluation.maxScore || evaluation.totalScore || 100);
  const boundedMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 100;
  const cleanScore = Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, "");
  const cleanMax = Number.isInteger(boundedMax) ? String(boundedMax) : boundedMax.toFixed(1).replace(/\.0$/, "");
  return `确定分数 ${cleanScore}/${cleanMax}`;
}

export function feedbackHistoryPlan(todo = {}, evaluation = {}) {
  const outcome = outcomeText(evaluation, todo.learningGrowthInteractionState || {});
  const history = reportHistory(todo, evaluation);
  return Object.freeze({
    outcome,
    history,
    historyCountLabel: history.length ? `${history.length} 次批改` : "",
    scoreText: deterministicScoreText(evaluation),
  });
}

export function growthCardRole(task = {}) {
  const role = String(task.cardRole || task.card_role || task.learningGrowthCardRole || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (role === "teaching" || role === "practice" || role === "integration_practice" || role === "stage_assessment") return role;
  const type = String(task.taskCardType || task.task_card_type || task.taskModel?.taskCardType || "").trim().toLowerCase();
  const activity = String(task.activityType || task.taskModel?.activityType || "").trim().toLowerCase();
  if (type === "challenge_card" || activity === "weekly_challenge") return "stage_assessment";
  return "stage_assessment";
}

export function isTeachingCardRole(role) {
  return role === "teaching" || role === "practice" || role === "integration_practice";
}

export function growthCardRoleLabel(role) {
  if (role === "teaching") return "教学卡";
  if (role === "practice") return "练习卡";
  if (role === "integration_practice") return "综合练习";
  if (role === "stage_assessment") return "能力测验";
  return "成长卡";
}

export function teachingFlow(task = {}) {
  const flow = task.teachingFlow && typeof task.teachingFlow === "object" ? task.teachingFlow : {};
  const model = task.taskModel && typeof task.taskModel === "object" ? task.taskModel : {};
  const lesson = flow.lesson && typeof flow.lesson === "object" ? flow.lesson : {};
  const microLesson = flow.microLesson && typeof flow.microLesson === "object" ? flow.microLesson : {};
  const workedExample = flow.workedExample && typeof flow.workedExample === "object" ? flow.workedExample : {};
  const guided = flow.guidedPractice && typeof flow.guidedPractice === "object" ? flow.guidedPractice : {};
  const quick = flow.quickCheck && typeof flow.quickCheck === "object" ? flow.quickCheck : {};
  const workedSteps = Array.isArray(workedExample.steps) ? workedExample.steps : [];
  const examples = Array.isArray(lesson.examples) && lesson.examples.length
    ? lesson.examples
    : workedSteps.length
      ? workedSteps.map((step) => [step?.label, step?.text].filter(Boolean).join(": "))
      : (Array.isArray(task.deliverables) ? task.deliverables : (Array.isArray(model.deliverables) ? model.deliverables : []));
  const criteria = Array.isArray(quick.completionCriteria) && quick.completionCriteria.length
    ? quick.completionCriteria
    : (Array.isArray(task.acceptance) ? task.acceptance : (Array.isArray(model.acceptance) ? model.acceptance : []));
  return Object.freeze({
    lesson: Object.freeze({
      title: lesson.title || task.title || "学习重点",
      explanation: lesson.explanation || task.learnerInstruction || task.instruction || model.learnerInstruction || task.summary || "先看讲解，再做一个很小的检查。",
      whyItMatters: flow.whyItMatters || flow.why || "",
      keyPoints: Object.freeze((Array.isArray(microLesson.keyPoints) ? microLesson.keyPoints : []).slice(0, 5)),
      examples: Object.freeze(examples.slice(0, 4)),
      workedExample: Object.freeze({
        instruction: workedExample.instruction || "",
        steps: Object.freeze(workedSteps.slice(0, 5)),
      }),
    }),
    guidedPractice: Object.freeze({
      instruction: guided.instruction || guided.prompt || task.guidedPracticePrompt || "照着讲解做一小步，不需要一次写得很完整。",
      hints: Object.freeze((Array.isArray(guided.hints) ? guided.hints : []).slice(0, 4)),
    }),
    quickCheck: Object.freeze({
      instruction: quick.instruction || quick.prompt || "用 1-3 句话说明你刚才学会了什么，或者写一个最小答案。",
      completionCriteria: Object.freeze(criteria.slice(0, 5)),
    }),
  });
}

export function experienceSignalActionsPlan(task = {}, state = {}) {
  const cardId = String(task.taskCardId || task.id || "");
  if (String(task.status || "").trim().toLowerCase() !== "completed") {
    return Object.freeze({ show: false, cardId, selected: "", busy: "", locked: false, actions: Object.freeze([]) });
  }
  const summary = task.experienceSummary && typeof task.experienceSummary === "object" ? task.experienceSummary : {};
  const submitted = state.learningGrowthExperienceSignalSubmitted?.[cardId] || "";
  const busy = state.learningGrowthExperienceSignalBusy?.[cardId] || "";
  const selected = String(summary.latestSignalType || submitted || "").trim();
  const locked = Boolean(selected || busy);
  const actions = [
    ["too_easy", "太简单"],
    ["right_level", "正合适"],
    ["too_hard", "有点难"],
  ].map(([type, label]) => Object.freeze({
    type,
    label,
    isPending: busy === type,
    isSelected: selected === type || busy === type,
  }));
  return Object.freeze({ show: true, cardId, selected, busy, locked, actions: Object.freeze(actions) });
}

export function teachingFeedbackPlan(task = {}, state = {}) {
  const summary = task.experienceSummary || {};
  const reward = Number(task.learningGrowthRewardCoins || task.latestRewardSettlement?.coinAmount || task.rewardPolicy?.maxCoins || 0) || 0;
  const completed = String(task.status || "").trim().toLowerCase() === "completed";
  const show = completed || Boolean(summary.latestAt || summary.lastCompletionAt);
  return Object.freeze({
    show,
    completed,
    reward,
    title: completed ? "本卡已完成" : "学习反馈已记录",
    body: reward ? `奖励 ${reward} 金币；这张卡只作为低压力学习证据，不当作正式能力测验。` : "这张卡只作为低压力学习证据，不当作正式能力测验。",
    experiencePrompt: completed ? "完成后，选一个感受，帮我下次把难度调得更合适。" : "",
    experienceActions: experienceSignalActionsPlan(task, state),
  });
}

export function teachingCardDetailPlan(task = {}, options = {}) {
  const cardId = String(task.taskCardId || task.id || "");
  const state = options.state || {};
  const role = growthCardRole(task);
  const completed = String(task.status || "").trim().toLowerCase() === "completed";
  return Object.freeze({
    cardId,
    role,
    roleLabel: growthCardRoleLabel(role),
    flow: teachingFlow(task),
    state,
    draft: Object.freeze(Object.assign({}, state.learningGrowthTeachingDrafts?.[cardId] || {})),
    step: state.learningGrowthTeachingStepByCardId?.[cardId] || (completed ? "quick_check" : "lesson"),
    busy: Boolean(state.learningGrowthTeachingCheckBusy?.[cardId]),
    duration: task.expectedDurationMinutes || {},
    reward: Number(task.rewardPolicy?.maxCoins || task.configuredRewardCoins || task.defaultRewardCoins || 100) || 100,
    completed,
    feedback: teachingFeedbackPlan(task, state),
  });
}

export function learningGrowthTaskSubmissionPlan({ todo = {}, evaluation = {}, text = "" } = {}) {
  const guard = submissionGuard(todo, evaluation);
  const stats = submissionTextStats(text);
  return Object.freeze({
    taskModel: taskModel(todo),
    prompt: submissionPrompt(evaluation, todo),
    guard,
    stats,
    validation: validateSubmissionText(text, guard),
    requirementLabel: submissionRequirementLabel(guard, stats),
    nextActionLabel: nextActionLabel(evaluation.nextAction || evaluation.nextStep || ""),
  });
}
