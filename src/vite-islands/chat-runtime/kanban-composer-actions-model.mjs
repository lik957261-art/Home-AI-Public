const KANBAN_COMPOSER_ACTIONS_MODEL_VERSION = "20260704-vite-kanban-composer-actions-model-v1";
const DEFAULT_KANBAN_COMPOSER_MESSAGE_LIMIT = 20;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createKanbanComposerMessagePlan(input = {}) {
  const nowMs = finiteNumber(input.nowMs, Date.now());
  const randomSuffix = cleanString(input.randomSuffix, 80) || "0";
  const limit = Math.max(1, Math.min(100, Math.trunc(finiteNumber(
    input.limit,
    DEFAULT_KANBAN_COMPOSER_MESSAGE_LIMIT,
  ))));
  const message = Object.freeze({
    id: `kanban-${nowMs}-${randomSuffix}`,
    role: cleanString(input.role, 80),
    content: String(input.content || ""),
    at: new Date(nowMs).toISOString(),
  });
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    message,
    messages: Object.freeze([...arrayFrom(input.messages), message].slice(-limit)),
  });
}

function kanbanPlanSummaryTextPlan(input = {}) {
  const plan = isObject(input.plan) ? input.plan : {};
  const cards = arrayFrom(plan.cards);
  const firstWave = cards.filter((card) => Boolean(card?.initialRunnable)).length;
  const maxParallel = Math.max(1, Math.trunc(finiteNumber(input.maxParallel ?? plan.maxParallel, 1)));
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    cardCount: cards.length,
    firstWave,
    maxParallel,
    text: `\u5df2\u751f\u6210 ${cards.length} \u5f20\u5361\u7247\u7684\u591a Agent \u62c6\u89e3\u8349\u6848\uff1b\u9996\u6279\u6267\u884c ${firstWave}\uff0c\u6700\u5927\u5e76\u884c ${maxParallel}\u3002`,
  });
}

function kanbanComposerDocumentPreviewRequestPlan(input = {}) {
  const file = isObject(input.file) ? input.file : {};
  const body = {
    workspaceId: cleanString(input.workspaceId, 160),
    filename: cleanString(file.name || "kanban-source.txt", 240) || "kanban-source.txt",
    type: cleanString(file.type, 240),
    dataBase64: String(input.dataBase64 || ""),
  };
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    body: Object.freeze(body),
    serializedBody: JSON.stringify(body),
  });
}

function kanbanComposerDocumentStatePlan(input = {}) {
  const result = isObject(input.result) ? input.result : {};
  const doc = isObject(result.document) ? result.document : {};
  const file = isObject(input.file) ? input.file : {};
  const document = Object.freeze({
    name: cleanString(doc.name || file.name || "kanban-source", 240) || "kanban-source",
    mime: cleanString(doc.mime || file.type, 240),
    kind: cleanString(doc.kind, 120),
    size: finiteNumber(doc.size || file.size, 0),
    text: String(result.text || ""),
    totalChars: finiteNumber(result.totalChars, 0),
    truncated: Boolean(result.truncated),
  });
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    document,
    documents: Object.freeze([...arrayFrom(input.documents), document]),
  });
}

function createKanbanComposerSubmissionPlan(input = {}) {
  const mode = cleanString(input.mode, 40);
  const rawText = cleanString(input.rawText, 240000);
  const text = cleanString(input.text, 240000);
  const documentNames = cleanString(input.documentNames, 4000);
  const documentLine = documentNames ? `Documents: ${documentNames}` : "";
  const fallbackBody = rawText || documentLine || text;
  const studyPlan = mode === "study";
  const assessmentPlan = mode === "assessment";
  const multiAgent = mode === "multi";
  const programmingStudyAssessment = Boolean(input.programmingStudyAssessment);
  const readingTitle = cleanString(input.readingTitle, 4000);
  const assessmentTitle = cleanString(input.assessmentTitle, 4000);
  const userMessageContent = studyPlan
    ? [readingTitle, rawText || documentLine].filter(Boolean).join("\n").trim()
    : (assessmentPlan
      ? [assessmentTitle, rawText || documentLine].filter(Boolean).join("\n").trim()
      : fallbackBody);
  const progressKind = (assessmentPlan || programmingStudyAssessment)
    ? "assessment"
    : (studyPlan ? "reading" : (multiAgent ? "plan" : "create"));
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    mode,
    multiAgent,
    studyPlan,
    assessmentPlan,
    programmingStudyAssessment,
    userMessageContent,
    progressKind,
  });
}

function kanbanPlanDraftBatchRequestPlan(input = {}) {
  const body = {
    workspaceId: cleanString(input.workspaceId, 160),
    plan: isObject(input.plan) ? input.plan : {},
    maxParallel: Math.max(1, Math.trunc(finiteNumber(input.maxParallel, 1))),
    reasoning_effort: cleanString(input.reasoningEffort, 80),
  };
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    body: Object.freeze(body),
    serializedBody: JSON.stringify(body),
  });
}

function kanbanBatchCreateSummaryTextPlan(input = {}) {
  const cards = arrayFrom(input.cards);
  const blocked = cards.filter((item) => Boolean(item?.blocked)).length;
  const runnable = Math.max(0, cards.length - blocked);
  return Object.freeze({
    version: KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
    cardCount: cards.length,
    blocked,
    runnable,
    text: `\u5df2\u521b\u5efa ${cards.length} \u5f20\u591a Agent \u770b\u677f\u5361\u7247\uff1b${runnable} \u5f20\u9996\u6279\u6267\u884c\uff0c${blocked} \u5f20\u7b49\u5f85\u4f9d\u8d56\u6216\u5e76\u884c\u4f4d\u3002`,
  });
}

export {
  DEFAULT_KANBAN_COMPOSER_MESSAGE_LIMIT,
  KANBAN_COMPOSER_ACTIONS_MODEL_VERSION,
  createKanbanComposerMessagePlan,
  createKanbanComposerSubmissionPlan,
  kanbanBatchCreateSummaryTextPlan,
  kanbanComposerDocumentPreviewRequestPlan,
  kanbanComposerDocumentStatePlan,
  kanbanPlanDraftBatchRequestPlan,
  kanbanPlanSummaryTextPlan,
};
