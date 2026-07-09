export const LEARNING_PROGRAM_MODEL_VERSION = "20260706-learning-program-model-v1";

export const ENGLISH_FOCUS_IDS = Object.freeze([
  "english_reading_comprehension",
  "english_listening_input",
  "english_speaking_retell",
  "english_pronunciation_shadowing",
  "english_short_writing",
  "english_vocabulary_active_use",
  "english_grammar_in_expression",
  "english_presentation",
]);

export const DEFAULT_OWNER_PROGRAM = Object.freeze({
  title: "英语快速提升计划",
  goalSummary: "围绕七年级和语言水平 5.5-6 / B1 过渡，用 8 周快速提升阅读理解、口语复述、写作表达、词汇和语法输出。",
  durationDays: 56,
  daysPerWeek: 5,
  minutesPerDay: 30,
  timeOfDay: "19:30",
  focusAreas: [
    "english_reading_comprehension",
    "english_listening_input",
    "english_speaking_retell",
    "english_short_writing",
    "english_vocabulary_active_use",
    "english_grammar_in_expression",
  ],
});

export function arrayPlan(value) {
  return Array.isArray(value) ? value : [];
}

export function programStatusTextPlan(status, { isOwner = false } = {}) {
  const value = String(status || "");
  if (value === "active") return "进行中";
  if (value === "draft") return "草稿";
  if (value === "review_required") return isOwner ? "待家长审核" : "待确认";
  if (value === "published") return isOwner ? "已下发" : "待执行";
  if (value === "blocked") return isOwner ? "已拦截" : "暂不可执行";
  return value || "未定";
}

export function taskStatusTextPlan(status, { isOwner = false } = {}) {
  const value = String(status || "");
  if (value === "planned") return "待执行";
  if (value === "published") return isOwner ? "已下发" : "待执行";
  if (value === "active") return "进行中";
  if (value === "completed") return "已完成";
  if (value === "needs_review") return "待复盘";
  if (value === "review_required") return isOwner ? "待家长审核" : "待确认";
  if (value === "blocked") return isOwner ? "已拦截" : "暂不可执行";
  return value || "待执行";
}

export function taskRewardPolicyPlan(task = {}) {
  const policy = task.rewardPolicy || {};
  const maxCoins = Number(task.rewardCapCoins || policy.maxCoins || policy.rewardCapCoins || 100);
  const minCoins = Number(policy.minCoins || 40);
  return {
    maxCoins: Number.isFinite(maxCoins) && maxCoins > 0 ? Math.round(maxCoins) : 100,
    minCoins: Number.isFinite(minCoins) && minCoins > 0 ? Math.round(minCoins) : 40,
    accuracyBonusMax: Number(policy.accuracyBonusMax || 30) || 30,
    timelinessBonusMax: Number(policy.timelinessBonusMax || 15) || 15,
    interactionBonusMax: Number(policy.interactionBonusMax || 15) || 15,
  };
}

export function evaluationStatusTextPlan(status) {
  const value = String(status || "");
  if (value === "passed") return "已通过";
  if (value === "needs_repair") return "需修复";
  if (value === "needs_review") return "待复盘";
  if (value === "recorded") return "已记录";
  return value || "未记录";
}

export function reviewStatusTextPlan(status) {
  const value = String(status || "");
  if (value === "pending") return "待家长审核";
  if (value === "approved") return "已通过";
  if (value === "rejected") return "已拒绝";
  if (value === "returned_for_revision") return "已返回修改";
  if (value === "cancelled") return "已取消";
  return value || "未定";
}

export function parentReviewTypeTextPlan(type) {
  const value = String(type || "");
  if (value === "evaluation_review") return "评价复核";
  if (value === "reward_settlement_review") return "奖励结算复核";
  return value || "家长审核";
}

export function settlementStatusTextPlan(status) {
  const value = String(status || "");
  if (value === "settled") return "已结算";
  if (value === "pending_review") return "待家长复核";
  if (value === "blocked") return "已拦截";
  if (value === "skipped") return "已跳过";
  return value || "未定";
}

export function formatCoinAmountPlan(value) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount : 0} 金币`;
}

export function rewardSettlementTimePlan(settlement = {}) {
  return String(settlement.settledAt || settlement.updatedAt || settlement.createdAt || "").trim();
}

export function latestRewardSettlementForTaskPlan(rewardSettlements = [], task = {}) {
  const taskCardId = String(task?.taskCardId || "").trim();
  const evaluationId = String(task?.latestEvaluation?.evaluationId || "").trim();
  let latest = null;
  arrayPlan(rewardSettlements).forEach((item) => {
    const matchesTask = taskCardId && String(item?.taskCardId || "").trim() === taskCardId;
    const matchesEvaluation = evaluationId && String(item?.evaluationId || "").trim() === evaluationId;
    if (!matchesTask && !matchesEvaluation) return;
    if (!latest || rewardSettlementTimePlan(item) > rewardSettlementTimePlan(latest)) latest = item;
  });
  return latest;
}

export function rewardSettlementDisplayTextPlan(settlement = null) {
  const coinAmount = Number(settlement?.coinAmount || 0);
  const amount = Number.isFinite(coinAmount) && coinAmount > 0 ? Math.round(coinAmount) : 0;
  const status = String(settlement?.status || "");
  if (amount && status === "settled") return `已得 ${amount} 金币`;
  if (amount && (status === "ready" || status === "pending_review")) return `待结算 ${amount} 金币`;
  return "";
}

export function compactRiskFlagsPlan(flags = []) {
  return arrayPlan(flags).map((flag) => (flag && typeof flag === "object" ? (flag.code || flag.reason || "") : flag)).filter(Boolean).join(" / ");
}

export function focusLabelPlan(id) {
  const labels = {
    english_reading_comprehension: "阅读",
    english_listening_input: "听力",
    english_speaking_retell: "口语复述",
    english_pronunciation_shadowing: "发音跟读",
    english_short_writing: "写作",
    english_vocabulary_active_use: "词汇活用",
    english_grammar_in_expression: "语法表达",
    english_presentation: "演讲项目",
  };
  return labels[id] || id;
}

export function firstItemPlan(items = []) {
  return arrayPlan(items).find(Boolean) || null;
}

export function latestDraftForProgramPlan(program = {}, drafts = []) {
  const programId = String(program.programId || "");
  return arrayPlan(drafts).find((draft) => String(draft.programId || "") === programId) || null;
}

export function taskCardsForDraftPlan(taskCards = [], draft = {}) {
  const draftId = String(draft?.draftId || "");
  return arrayPlan(taskCards).filter((task) => String(task?.draftId || "") === draftId);
}

export function hasLegacyCurriculumRefPlan(ref) {
  const text = String(ref || "").toLowerCase();
  return text.includes("grade4-5")
    || text.includes("upper-primary")
    || text.includes("cambridge-primary")
    || text.includes("cefr-a2-b1")
    || text.includes("school-english-current-grade");
}

export function draftNeedsRebuildPlan(data = {}, draft = {}) {
  if (!draft) return false;
  const taskRefs = taskCardsForDraftPlan(data.taskCards || [], draft).flatMap((task) => arrayPlan(task.curriculumRefs));
  const draftRefs = arrayPlan(draft.curriculumRefs);
  return draftRefs.concat(taskRefs).some(hasLegacyCurriculumRefPlan);
}

export function draftCanBeRebuiltPlan(data = {}, draft = {}) {
  if (!draft) return false;
  if (["published", "publish_failed"].includes(String(draft.status || ""))) return false;
  return taskCardsForDraftPlan(data.taskCards || [], draft)
    .every((task) => ["planned", "review_required", "blocked"].includes(String(task.status || "")));
}

export function learnerFactsPlan(data = {}) {
  const profile = data.learnerProfile || {};
  const refs = arrayPlan(data.curriculumReferences);
  const sources = arrayPlan(data.sources);
  const programs = arrayPlan(data.programs);
  const refText = refs.concat(programs).map((item) => JSON.stringify(item || {})).join(" ").toLowerCase();
  const sourceText = sources.map((item) => JSON.stringify(item || {})).join(" ").toLowerCase();
  const grade = refText.includes("grade7") || sourceText.includes("grade7") ? "七年级" : "待确认";
  const level = refText.includes("5_5-6") || refText.includes("5.5-6") || sourceText.includes("5.5-6")
    ? "5.5-6 / B1 过渡"
    : "待确认";
  return {
    displayName: profile.displayName || profile.learnerId || "学习者",
    grade,
    level,
    sourceCount: sources.length,
    goalCount: arrayPlan(data.goals).length,
    programCount: programs.length,
  };
}

export function sourceRefsForProgramPlan(data = {}, program = {}) {
  const refs = arrayPlan(program.sourceBasisRefs);
  if (refs.length) return refs.join("\n");
  return arrayPlan(data.sources).map((source) => source.sourceRef || source.sourceId).filter(Boolean).slice(0, 20).join("\n");
}

export function compactFocusPlan(focusAreas = []) {
  return arrayPlan(focusAreas).map((id) => focusLabelPlan(id)).join(" / ");
}

export function formatPercentPlan(value) {
  const number = Number(value || 0);
  return `${Math.round(Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0)) * 100)}%`;
}
