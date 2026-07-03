"use strict";

function isMinimalWindowView() {
  return isTaskDetailView() || isTodoDetailView() || isSkillDetailView();
}

function activeThreadRunIds(thread = state.currentThread) {
  if (!thread) return [];
  return thread.activeRunIds || (thread.activeRunId ? [thread.activeRunId] : []);
}

function activeTaskRunIds() {
  if (!isTaskDetailView()) return [];
  const pluginGroups = typeof pluginTopicGroupsForTaskList === "function" ? pluginTopicGroupsForTaskList(state.currentThread) : [];
  const selected = taskListGroupsForThread(state.currentThread).concat(pluginGroups).find((group) => group.id === state.currentTaskGroupId);
  const messages = typeof taskGroupMessagesForThread === "function"
    ? taskGroupMessagesForThread(state.currentThread, state.currentTaskGroupId, selected?.messages || [])
    : (selected?.messages || []);
  return messages
    .filter((message) => ["queued", "running"].includes(message.status))
    .map((message) => message.runId)
    .filter(Boolean);
}

function activeComposerRunIds() {
  if (isTaskDetailView()) return activeTaskRunIds();
  return composerStatusMessages()
    .filter((message) => (
      message?.role === "assistant"
      && ["queued", "running"].includes(String(message.status || ""))
    ))
    .map((message) => message.runId)
    .filter(Boolean);
}

function composerWorkspaceLabel() {
  const workspace = currentWorkspace();
  return String(workspace?.label || workspace?.id || state.selectedWorkspaceId || "").trim();
}

function composerPermissionLabel() {
  if (state.auth?.isOwner) return "Owner";
  if (state.auth?.workspaceId) return "\u4f4e\u6743\u9650";
  return "\u672a\u767b\u5f55";
}

function composerTargetLabel() {
  return "";
}

function activeComposerAssistantMessage() {
  return [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
  )) || null;
}

function composerReasoningCompactText(value = "") {
  const effort = validTaskReasoningEffort(value || "") || String(value || "").trim().toLowerCase();
  return effort ? taskReasoningCompactLabel({ value: effort }) : defaultReasoningCompactLabel();
}

function composerModelReasoningLabel() {
  if (isChatSearchMode()) return "";
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return "";
  const active = activeComposerAssistantMessage();
  if (active) {
    const model = String(active.model || active.runOptions?.model || state.defaultModel || assistantDisplayLabel()).trim();
    const effort = String(active.reasoningEffort || active.reasoning_effort || active.runOptions?.reasoning_effort || state.defaultReasoningEffort || "").trim();
    return [model, composerReasoningCompactText(effort)].filter(Boolean).join(" · ");
  }
  const text = getComposerText();
  const mentionInfo = composerAiMentionInfo(text);
  const selected = mentionInfo.modelExplicit
    ? composerModelOptions().find((option) => option.model === mentionInfo.model && option.provider === mentionInfo.provider) || composerModelOptions()[0]
    : selectedDefaultComposerModelOption();
  const model = String(selected.label || selected.model || state.defaultModel || assistantDisplayLabel()).trim();
  const effort = selectedComposerReasoningEffort(text) || state.defaultReasoningEffort || "";
  return [model, composerReasoningCompactText(effort)].filter(Boolean).join(" · ");
}

function composerModelLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const mentionInfo = composerAiMentionInfo(getComposerText());
  const selected = mentionInfo.modelExplicit
    ? composerModelOptions().find((option) => option.model === mentionInfo.model && option.provider === mentionInfo.provider) || composerModelOptions()[0]
    : selectedDefaultComposerModelOption();
  if (!mentionInfo.modelExplicit && selected.id === DEFAULT_COMPOSER_MODEL_ID) return null;
  return { label: `\u6a21\u578b ${selected.label}`, tone: selected.model ? "active" : "" };
}

function composerSearchSourceLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeInfo = activeRunSearchSourceInfo();
  if (!activeInfo || activeInfo.source === "local") return null;
  return { label: `\u4fe1\u6e90 ${activeInfo.label}`, tone: "active" };
}

function activeRunSearchSourceInfo() {
  const active = [...composerStatusMessages()].reverse().find((message) => (
    message?.role === "assistant"
    && ["queued", "running"].includes(message.status)
    && (message.searchSource || message.runOptions?.searchSource)
  ));
  if (!active) return null;
  const source = active.searchSource || active.runOptions?.searchSource || "";
  const option = composerSearchSourceOption(source);
  if (option.source === COMPOSER_SEARCH_SOURCE_LOCAL) return null;
  return option;
}

function messageUsesHighPermissionGateway(message = {}) {
  const securityLevel = String(message.gatewaySecurityLevel || message.gateway_security_level || "").trim();
  return Boolean(
    message.gatewayMaintenance
    || message.gateway_maintenance
    || /^owner[-_]maintenance$/i.test(securityLevel)
  );
}

function messageGatewayDisplayName(message = {}) {
  const direct = String(
    message.gatewayName
    || message.gateway_name
    || message.gatewayProfile
    || message.gateway_profile
    || message.gatewaySource
    || message.gateway_source
    || "",
  ).trim();
  if (direct) return direct;
  const url = String(message.gatewayUrl || message.gateway_url || "").trim();
  if (!url) return "";
  try {
    return new URL(url).host || url;
  } catch (_err) {
    return url;
  }
}

function activeRunGatewayPermissionLabel() {
  const active = activeComposerAssistantMessage();
  if (!active) return null;
  const gatewayName = messageGatewayDisplayName(active);
  return gatewayName ? { label: gatewayName, tone: "active" } : null;
}

function composerGatewayPermissionLabel() {
  if (isChatSearchMode()) return null;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return null;
  const activeLabel = activeRunGatewayPermissionLabel();
  if (activeLabel) return activeLabel;
  return null;
}

function composerDirectoryLabel() {
  if (state.pendingTaskDirectory?.projectId) {
    return String(state.pendingTaskDirectory.label || state.pendingTaskDirectory.projectId || "").trim();
  }
  if (isTaskListView() && state.taskDirectoryFilter?.projectId) {
    return taskDirectoryFilterLabel(state.taskDirectoryFilter);
  }
  return "";
}

function composerStatusMessages() {
  if (isTaskDetailView()) {
    const group = currentTaskGroup();
    return typeof taskGroupMessagesForThread === "function"
      ? taskGroupMessagesForThread(state.currentThread, state.currentTaskGroupId, group?.messages || [])
      : (group?.messages || []);
  }
  if (isTaskWindowView()) return state.currentThread?.messages || [];
  if (isSingleWindowChatView()) return chatMessagesForThread(state.currentThread);
  if (isSingleWindowView()) return state.currentThread?.messages || [];
  return [];
}

function composerRunCounts() {
  const counts = { queued: 0, running: 0 };
  composerStatusMessages().forEach((message) => {
    if (message?.status === "running") counts.running += 1;
    if (message?.status === "queued") counts.queued += 1;
  });
  return counts;
}

function refreshComposerContextSoon(delay = 0) {
  window.setTimeout(() => {
    updateKeyboardContextMetrics();
    renderComposerContext();
  }, Math.max(0, delay));
}

function composerContextItems(counts = composerRunCounts()) {
  if (isChatSearchMode()) return [];
  const items = [];
  const workspaceLabel = composerWorkspaceLabel();
  if (workspaceLabel) {
    items.push({ label: `${workspaceLabel} \u00b7 ${composerPermissionLabel()}`, tone: "primary" });
  }
  const gatewayPermissionLabel = composerGatewayPermissionLabel();
  if (gatewayPermissionLabel?.label) items.push(gatewayPermissionLabel);
  const searchSourceLabel = composerSearchSourceLabel();
  if (searchSourceLabel?.label) items.push(searchSourceLabel);
  const directoryLabel = composerDirectoryLabel();
  if (directoryLabel) items.push({ label: `\u76ee\u5f55 ${directoryLabel}`, tone: "directory" });
  if (state.pendingArtifacts.length) {
    items.push({ label: `\u9644\u4ef6 ${state.pendingArtifacts.length}`, tone: "active" });
  }
  if (state.quotedReply) items.push({ label: "\u5f15\u7528\u56de\u590d", tone: "active" });
  if (counts.running) items.push({ label: `\u8fd0\u884c\u4e2d ${counts.running}`, tone: "active" });
  if (counts.queued) items.push({ label: `\u6392\u961f ${counts.queued}`, tone: "active" });
  return items.slice(0, 8);
}

function shouldShowComposerContext(items, counts) {
  if (!items.length || isChatSearchMode()) return false;
  if (state.viewMode !== "single" && state.viewMode !== "tasks") return false;
  return Boolean(
    state.composerFocused
    || composerHasDraft()
    || state.pendingArtifacts.length
    || Boolean(activeRunSearchSourceInfo())
    || state.quotedReply
    || state.pendingTaskDirectory?.projectId
    || (isTaskListView() && state.taskDirectoryFilter?.projectId)
    || counts.running
    || counts.queued
  );
}

function renderComposerContext() {
  const bar = $("composerContext");
  const composer = $("composer");
  if (!bar || !composer) return;
  updateKeyboardContextMetrics();
  const counts = composerRunCounts();
  const items = composerContextItems(counts);
  const visible = shouldShowComposerContext(items, counts);
  composer.classList.toggle("context-visible", visible);
  composer.classList.toggle("keyboard-context-mode", visible && state.keyboardContextMode);
  if (!visible) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = items.map((item) => {
    const tone = item.tone ? ` ${item.tone}` : "";
    return `<span class="composer-context-chip${tone}" title="${escapeHtml(item.label)}"><span>${escapeHtml(item.label)}</span></span>`;
  }).join("");
}
