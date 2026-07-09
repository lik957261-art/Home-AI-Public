export const KANBAN_RENDER_MODEL_VERSION = "20260706-kanban-render-model-v1";

export function kanbanComposerMessagePlan(message = {}) {
  const role = String(message?.role || "assistant");
  return {
    role,
    label: role === "user" ? "你" : "Home AI",
    content: String(message?.content || ""),
  };
}

export function kanbanPlanDependencyLabels(card = {}, plan = {}) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const byId = new Map(cards.map((item, index) => [String(item?.clientId || `card-${index + 1}`), item]));
  return (Array.isArray(card?.dependsOn) ? card.dependsOn : [])
    .map((id) => byId.get(String(id || ""))?.title || String(id || "").trim())
    .filter(Boolean);
}

export function kanbanPlanCardViewPlan(card = {}, index = 0, plan = {}) {
  const deps = kanbanPlanDependencyLabels(card, plan);
  const status = card?.initialRunnable
    ? "首批执行"
    : deps.length
      ? "等待依赖"
      : "等待并行位";
  return {
    number: index + 1,
    title: card?.title || `Card ${index + 1}`,
    description: card?.description || "",
    deps,
    status,
    deliverables: Array.isArray(card?.deliverables) ? card.deliverables.filter(Boolean).slice(0, 4) : [],
    acceptance: Array.isArray(card?.acceptance) ? card.acceptance.filter(Boolean).slice(0, 4) : [],
  };
}

export function kanbanPlanDraftViewPlan(plan = {}, options = {}) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  return {
    summary: String(plan?.summary || ""),
    maxParallel: options.maxParallel,
    disabled: Boolean(options.disabled),
    cards: cards.map((card, index) => kanbanPlanCardViewPlan(card, index, plan)),
  };
}

export function kanbanReasoningOptionPlans(baseOptions = [], configuredOptions = [], selected = "", defaultLabel = "Default") {
  const known = new Map();
  const add = (item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    if (known.has(value)) return;
    known.set(value, item);
  };
  (Array.isArray(baseOptions) ? baseOptions : []).forEach(add);
  (Array.isArray(configuredOptions) ? configuredOptions : []).forEach(add);
  const selectedValue = String(selected || "").trim().toLowerCase();
  return [...known.values()].map((item) => {
    const value = String(item?.value || "").trim().toLowerCase();
    return {
      value,
      selected: value === selectedValue,
      label: value ? String(item?.label || value) : `Default (${defaultLabel})`,
    };
  });
}

export function kanbanMultiAgentControlsPlan(state = {}, options = {}) {
  const rawReasoningEffort = String(state?.reasoningEffort || "").trim().toLowerCase();
  return {
    disabled: Boolean(options.disabled),
    maxParallel: String(options.maxParallel || ""),
    maxAllowed: options.maxAllowed,
    reasoningEffort: ["low", "medium", "high", "xhigh"].includes(rawReasoningEffort) ? rawReasoningEffort : "",
  };
}

export function kanbanComposerProgressPlan(state = {}, options = {}) {
  if (!state?.busy && !state?.planCreating) return null;
  const steps = Array.isArray(options.steps) ? options.steps : [];
  const current = Math.max(0, Math.min(Math.max(steps.length - 1, 0), Number(state?.step || 0)));
  const startedAt = Number(state?.startedAt || 0);
  const now = Number(options.now || 0);
  const elapsed = startedAt && now ? Math.max(1, Math.round((now - startedAt) / 1000)) : 0;
  const kind = String(state?.kind || "");
  const title = kind === "reading"
    ? "正在创建学习计划"
    : (kind === "assessment"
      ? "正在创建考试计划"
      : (kind === "create" ? "正在创建并启动任务" : "正在拆解任务"));
  return {
    title,
    elapsed,
    steps: steps.map((label, index) => ({
      label: String(label || ""),
      index,
      number: index + 1,
      stateClass: index < current ? "done" : (index === current ? "active" : ""),
    })),
  };
}

export function kanbanComposerModePlan(modeValue, multiAgent = false) {
  const mode = String(modeValue || "");
  if (mode === "reading") return "study";
  if (["single", "multi", "study", "assessment"].includes(mode)) return mode;
  return multiAgent ? "multi" : "single";
}

export function kanbanComposerPanelModePlan(options = {}) {
  const mode = kanbanComposerModePlan(options.mode, options.multiAgent);
  const studyActive = mode === "study";
  const assessmentActive = mode === "assessment";
  const multiActive = mode === "multi";
  const programmingStudyActive = Boolean(studyActive && options.programmingStudy);
  const submitLabel = assessmentActive
    ? "创建考试计划"
    : (studyActive
      ? (programmingStudyActive ? "创建编程测验计划" : "创建学习计划")
      : (multiActive ? (options.hasPlanDraft ? "重新拆解" : "拆解任务") : "创建任务"));
  const placeholder = assessmentActive
    ? "补充考试范围、题型比例、教材章节或薄弱点"
    : (studyActive
      ? (programmingStudyActive ? "补充编程项目、课堂重点、练习范围或出题要求，或留空" : "补充学习范围、分段要求、评价重点，或留空")
      : "输入任务需求");
  const caption = assessmentActive
    ? "固定正式考试模板；未达通过线会保留重考"
    : (studyActive
      ? (programmingStudyActive ? "按学习计划日期开放编程测验卡；每张卡开放后填写本次要求再出题" : "每次学习一张卡片，每日小测通过后完成；最后有综合考试")
      : (multiActive ? `最大并行 ${options.maxAgents}` : "直接进入 todo"));
  return {
    mode,
    singleActive: mode === "single",
    multiActive,
    studyActive,
    assessmentActive,
    programmingStudyActive,
    submitLabel,
    placeholder,
    caption,
    rows: studyActive || assessmentActive ? "4" : "7",
  };
}
