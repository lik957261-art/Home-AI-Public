const CHAT_COMPOSER_CONTEXT_MODEL_VERSION = "20260704-vite-chat-composer-context-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function activeRunStatus(status) {
  return status === "queued" || status === "running";
}

function createActiveThreadRunIdsPlan(input = {}) {
  const thread = input.thread && typeof input.thread === "object" ? input.thread : null;
  const runIds = thread
    ? (Array.isArray(thread.activeRunIds) ? thread.activeRunIds : (thread.activeRunId ? [thread.activeRunId] : []))
    : [];
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    runIds: Object.freeze(runIds.map((runId) => cleanString(runId, 160)).filter(Boolean)),
  });
}

function createActiveComposerRunIdsPlan(input = {}) {
  const assistantOnly = input.assistantOnly !== false;
  const runIds = arrayFrom(input.messages)
    .filter((message) => (
      (!assistantOnly || message?.role === "assistant")
      && activeRunStatus(String(message.status || ""))
    ))
    .map((message) => cleanString(message.runId, 160))
    .filter(Boolean);
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    runIds: Object.freeze(runIds),
  });
}

function activeComposerAssistantMessagePlan(input = {}) {
  const message = [...arrayFrom(input.messages)].reverse().find((item) => (
    item?.role === "assistant"
    && activeRunStatus(String(item.status || ""))
  )) || null;
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    message,
  });
}

function composerRunCountsPlan(input = {}) {
  const counts = { queued: 0, running: 0 };
  arrayFrom(input.messages).forEach((message) => {
    const status = String(message?.status || "");
    if (status === "running") counts.running += 1;
    if (status === "queued") counts.queued += 1;
  });
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    counts: Object.freeze(counts),
  });
}

function composerPermissionLabelPlan(input = {}) {
  const auth = input.auth && typeof input.auth === "object" ? input.auth : {};
  const label = auth.isOwner ? "Owner" : (auth.workspaceId ? "\u4f4e\u6743\u9650" : "\u672a\u767b\u5f55");
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    label,
  });
}

function composerModelReasoningLabelPlan(input = {}) {
  const model = cleanString(input.model, 240);
  const reasoning = cleanString(input.reasoning, 120);
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    label: [model, reasoning].filter(Boolean).join(" \u00b7 "),
  });
}

function composerContextItemsPlan(input = {}) {
  if (input.chatSearchMode) {
    return Object.freeze({
      version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
      items: Object.freeze([]),
    });
  }
  const counts = input.counts && typeof input.counts === "object" ? input.counts : {};
  const items = [];
  const workspaceLabel = cleanString(input.workspaceLabel, 240);
  const permissionLabel = cleanString(input.permissionLabel, 120);
  if (workspaceLabel) items.push({ label: `${workspaceLabel} \u00b7 ${permissionLabel}`, tone: "primary" });
  const gatewayPermissionLabel = normalizeItem(input.gatewayPermissionLabel);
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
  const searchSourceLabel = normalizeItem(input.searchSourceLabel);
  if (searchSourceLabel?.label) items.push(searchSourceLabel);
  const directoryLabel = cleanString(input.directoryLabel, 240);
  if (directoryLabel) items.push({ label: `\u76ee\u5f55 ${directoryLabel}`, tone: "directory" });
  const pendingArtifactCount = Math.max(0, Math.trunc(Number(input.pendingArtifactCount) || 0));
  if (pendingArtifactCount) items.push({ label: `\u9644\u4ef6 ${pendingArtifactCount}`, tone: "active" });
  if (input.quotedReply) items.push({ label: "\u5f15\u7528\u56de\u590d", tone: "active" });
  const running = Math.max(0, Math.trunc(Number(counts.running) || 0));
  const queued = Math.max(0, Math.trunc(Number(counts.queued) || 0));
  if (running) items.push({ label: `\u8fd0\u884c\u4e2d ${running}`, tone: "active" });
  if (queued) items.push({ label: `\u6392\u961f ${queued}`, tone: "active" });
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    items: Object.freeze(items.slice(0, 8).map((item) => Object.freeze({
      label: cleanString(item.label, 240),
      tone: cleanString(item.tone, 80),
    }))),
  });
}

function normalizeItem(value) {
  if (!value || typeof value !== "object") return null;
  const label = cleanString(value.label, 240);
  if (!label) return null;
  return {
    label,
    tone: cleanString(value.tone, 80),
  };
}

function shouldShowComposerContextPlan(input = {}) {
  const items = arrayFrom(input.items);
  const counts = input.counts && typeof input.counts === "object" ? input.counts : {};
  const viewMode = cleanString(input.viewMode, 80);
  const running = Math.max(0, Math.trunc(Number(counts.running) || 0));
  const queued = Math.max(0, Math.trunc(Number(counts.queued) || 0));
  const visible = Boolean(
    items.length
    && !input.chatSearchMode
    && (viewMode === "single" || viewMode === "tasks")
    && (
      input.composerFocused
      || input.hasDraft
      || Math.max(0, Math.trunc(Number(input.pendingArtifactCount) || 0))
      || input.activeRunSearchSource
      || input.quotedReply
      || input.pendingTaskDirectoryProjectId
      || input.taskDirectoryFilterProjectId
      || running
      || queued
    )
  );
  return Object.freeze({
    version: CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
    visible,
  });
}

export {
  CHAT_COMPOSER_CONTEXT_MODEL_VERSION,
  activeComposerAssistantMessagePlan,
  composerContextItemsPlan,
  composerModelReasoningLabelPlan,
  composerPermissionLabelPlan,
  composerRunCountsPlan,
  createActiveComposerRunIdsPlan,
  createActiveThreadRunIdsPlan,
  shouldShowComposerContextPlan,
};
