"use strict";

const CODEX_MUX_TASK_GROUP_ID = "codex-mux";
const CODEX_MUX_OWNER_WORKSPACE_ID = "owner";
const CODEX_MUX_WORKER_ID = "codex-hermes-main";

function codexMuxOwnerAllowed() {
  return Boolean(state.auth?.isOwner);
}

function isCodexMuxView() {
  return state.viewMode === "codex-mux";
}

function codexMuxSettingsEntryHtml() {
  return "";
}

function codexMuxTaskTitle(task) {
  return String(task?.title || task?.taskId || "Codex 协作任务").trim();
}

function codexMuxTaskStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (["done", "completed", "success"].includes(value)) return "已完成";
  if (["failed", "error"].includes(value)) return "失败";
  if (["blocked", "waiting"].includes(value)) return "等待处理";
  if (["running", "processing"].includes(value)) return "处理中";
  return "已交给 Codex";
}

function codexMuxEventTimestamp(event) {
  const value = event?.createdAt || event?.updatedAt || event?.timestamp || "";
  if (typeof value === "number") return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  return String(value || "");
}

function codexMuxMeaningfulText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 1800) return `${text.slice(0, 1800)}...`;
  if (/^\s*[{[]/.test(text)) return "";
  return text;
}

function codexMuxList(values, limit = 6) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => codexMuxMeaningfulText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function codexMuxPayloadLines(payload = {}) {
  const lines = [];
  const conflicts = codexMuxList(payload.conflicts, 4);
  if (conflicts.length) lines.push(`阻塞原因：${conflicts.join("；")}`);
  const changedFiles = codexMuxList(payload.changedFiles || payload.changed_files || payload.files, 8);
  if (changedFiles.length) lines.push(`改动文件：${changedFiles.join("，")}`);
  const tests = codexMuxList(payload.tests || payload.validation || payload.checks, 8);
  if (tests.length) lines.push(`验证：${tests.join("；")}`);
  const nextSteps = codexMuxList(payload.nextSteps || payload.next_steps || payload.followUps || payload.follow_ups, 5);
  if (nextSteps.length) lines.push(`后续建议：${nextSteps.join("；")}`);
  const contextRead = Array.isArray(payload.contextRead) ? payload.contextRead : [];
  const missing = contextRead
    .filter((item) => item && item.exists === false && item.path)
    .map((item) => String(item.path || "").trim())
    .filter(Boolean)
    .slice(0, 4);
  if (missing.length) lines.push(`缺失上下文：${missing.join("；")}`);
  if (payload.gitStatusBranch) lines.push(`代码状态：${codexMuxMeaningfulText(payload.gitStatusBranch)}`);
  if (payload.workspaceOk === false) lines.push("工作区校验：不匹配");
  return lines;
}

function codexMuxEventMilestone(event) {
  const type = String(event?.type || "").toLowerCase();
  if (!type) return null;
  if (type.includes("heartbeat") || type.includes("tool") || type.includes("progress") || type.includes("poll")) return null;
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const explicitSummary = codexMuxMeaningfulText(
    event?.summary
      || payload.summary
      || payload.result
      || payload.message
      || payload.final
      || payload.conclusion
      || payload.report,
  );
  const detailLines = codexMuxPayloadLines(payload);
  const needsHermes = Boolean(
    type.includes("task.final")
      || type.includes("assistance.result")
      || type.includes("approval.requested")
      || type.includes("blocked")
      || payload.activateHermes
      || payload.activate_hermes
      || payload.hermesFollowUp
      || payload.hermes_follow_up,
  );
  if (type.includes("result") || type.includes("completed") || type.includes("done") || type.includes("task.final")) {
    return {
      label: "Codex 回报",
      summary: explicitSummary || "Codex 已返回阶段性结果。",
      detailLines,
      needsHermes,
      eventId: event?.eventId || "",
      taskId: event?.taskId || "",
      type,
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("failed") || type.includes("error") || type.includes("blocked")) {
    return {
      label: "需要处理",
      summary: explicitSummary || "Codex 侧报告失败或阻塞，需要 Hermes 或 Owner 继续处理。",
      detailLines,
      needsHermes,
      eventId: event?.eventId || "",
      taskId: event?.taskId || "",
      type,
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("accepted") || type.includes("started") || type.includes("running")) {
    return {
      label: "Codex 已接收",
      summary: explicitSummary || "Codex 已接收任务并开始处理。",
      eventId: event?.eventId || "",
      taskId: event?.taskId || "",
      type,
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("task.requested") || type.includes("created")) {
    const capsule = payload.capsule && typeof payload.capsule === "object" ? payload.capsule : {};
    const title = codexMuxMeaningfulText(payload.title || capsule.title || event?.title);
    const intent = codexMuxMeaningfulText(payload.instruction || capsule.userIntent || capsule.intent || "");
    return {
      label: "已交给 Codex",
      summary: title ? `任务：${title}` : "Hermes 已把需要代码处理的事项交给 Codex。",
      detailLines: intent ? [`任务要点：${intent}`] : [],
      eventId: event?.eventId || "",
      taskId: event?.taskId || "",
      type,
      time: codexMuxEventTimestamp(event),
    };
  }
  if (!explicitSummary) return null;
  return {
    label: "阶段结论",
    summary: explicitSummary,
    detailLines,
    needsHermes,
    eventId: event?.eventId || "",
    taskId: event?.taskId || "",
    type,
    time: codexMuxEventTimestamp(event),
  };
}

function renderCodexMuxMilestone(item) {
  return `<article class="codex-mux-event">
    <div class="codex-mux-event-head">
      <strong>${escapeHtml(item.label || "阶段结论")}</strong>
      <span>${escapeHtml(formatTime(item.time || ""))}</span>
    </div>
    <p>${escapeHtml(item.summary || "")}</p>
    ${Array.isArray(item.detailLines) && item.detailLines.length ? `<ul class="codex-mux-event-details">${item.detailLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    ${item.needsHermes ? `<div class="codex-mux-followup">需要 Hermes 跟进</div>` : ""}
  </article>`;
}

function codexMuxTaskMilestones() {
  return (state.codexMuxTasks || []).map((task) => ({
    label: codexMuxTaskStatusLabel(task?.status),
    summary: codexMuxTaskTitle(task),
    time: task?.updatedAt || task?.createdAt || "",
  }));
}

function renderCodexMuxMilestones() {
  const items = [
    ...codexMuxTaskMilestones(),
    ...(state.codexMuxEvents || []).map(codexMuxEventMilestone).filter(Boolean),
  ]
    .filter((item) => item.summary)
    .sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")))
    .slice(0, 40);
  return items.length
    ? items.map(renderCodexMuxMilestone).join("")
    : `<div class="empty-state small">暂无 Codex 阶段性结论。</div>`;
}

function codexMuxShouldActivateHermes(event = {}) {
  const type = String(event?.type || "").toLowerCase();
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  return Boolean(
    type.includes("task.final")
      || type.includes("assistance.result")
      || type.includes("approval.requested")
      || payload.activateHermes
      || payload.activate_hermes
      || payload.hermesFollowUp
      || payload.hermes_follow_up,
  );
}

function codexMuxActivationKey(event = {}) {
  return `codex-mux-activated:${event?.taskId || ""}:${event?.eventId || ""}`;
}

function codexMuxActivationAlreadyVisible(event = {}) {
  const eventId = String(event?.eventId || "");
  if (!eventId) return true;
  return (state.currentThread?.messages || []).some((message) => String(message?.content || "").includes(`Codex 事件：${eventId}`));
}

async function maybeActivateHermesForCodexMuxEvents() {
  if (!isCodexMuxView() || !codexMuxOwnerAllowed() || state.codexMuxSubmitting) return;
  const event = [...(state.codexMuxEvents || [])].reverse().find(codexMuxShouldActivateHermes);
  if (!event?.eventId || codexMuxActivationAlreadyVisible(event)) return;
  const key = codexMuxActivationKey(event);
  if (localStorage.getItem(key) === "1") return;
  const milestone = codexMuxEventMilestone(event);
  if (!milestone?.summary) return;
  localStorage.setItem(key, "1");
  const detail = Array.isArray(milestone.detailLines) && milestone.detailLines.length
    ? `\n\n关键细节：\n${milestone.detailLines.map((line) => `- ${line}`).join("\n")}`
    : "";
  const text = [
    `Codex 已回报，需要 Hermes 继续判断和跟进。`,
    ``,
    `Codex 事件：${event.eventId}`,
    `任务：${event.taskId || ""}`,
    `结论：${milestone.summary}${detail}`,
  ].join("\n");
  await sendCodexMuxHermesMessage(text, { skipActivationCheck: true });
}

function codexMuxCoordinatorInstructions() {
  return [
    "You are Hermes Mobile inside the Owner-only Hermes-Codex Mux collaboration stream.",
    "The user is speaking to Hermes first. Do not treat the message as an automatic instruction to Codex.",
    "Clarify, analyze, and decide the next step in this same conversation. Use Codex only when code/workspace execution or verification is needed.",
    `When Codex is needed, call the codex_mobile function through the HTTP/API toolset with assignedWorker=${CODEX_MUX_WORKER_ID}, workerMode=sticky, requiresSameThread=true, and a bounded task capsule.`,
    "If a Codex event says it needs Hermes follow-up, continue from that event in this same collaboration stream and decide the next concrete action.",
    "When Codex reports back, summarize meaningful intermediate conclusions in Chinese. Do not show raw payloads, low-level tool calls, heartbeats, or polling details to the user.",
    "Keep coordinating in this same conversation and do not expose secrets.",
  ].join("\n");
}

function renderCodexMuxMessage(message) {
  return renderMessage(message);
}

function renderCodexMuxConversation() {
  const messages = (state.currentThread?.messages || [])
    .filter((message) => message.taskGroupId === CODEX_MUX_TASK_GROUP_ID);
  return messages.length
    ? messages.map(renderCodexMuxMessage).join("")
    : `<div class="empty-state small">先在底部输入框告诉 Hermes 你的需求；Hermes 判断需要代码处理时，会再调用 Codex。</div>`;
}

function renderCodexMuxView() {
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = "";
  $("threadTitle").textContent = "Hermes 协作流";
  $("threadMeta").textContent = codexMuxOwnerAllowed() ? "Owner-only Mux" : "Owner only";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: codexMuxOwnerAllowed(), placeholder: "发给 Hermes 协作流..." });
  const conversation = $("conversation");
  if (!conversation) return;
  if (!codexMuxOwnerAllowed()) {
    conversation.innerHTML = `<section class="codex-mux-shell"><div class="automation-warning">Codex Mux is Owner-only.</div></section>`;
    updateNavigationControls();
    return;
  }
  conversation.innerHTML = `<section class="codex-mux-shell" data-codex-mux-page>
    <div class="codex-mux-intro">
      <strong>Hermes 协作流</strong>
      <span>底部输入框先发给 Hermes；Hermes 需要代码执行或工作区验证时，再调用固定 Codex 线程。</span>
    </div>
    ${state.codexMuxError ? `<div class="automation-warning">${escapeHtml(state.codexMuxError)}</div>` : ""}
    ${state.codexMuxLoading ? `<div class="automation-loading" role="status"><span class="automation-loading-spinner" aria-hidden="true"></span><span>刷新协作流</span></div>` : ""}
    <div class="codex-mux-stack">
      <section class="codex-mux-panel codex-mux-hermes-panel">
        <div class="automation-section-title">Hermes</div>
        <div class="codex-mux-chat" data-codex-mux-chat>${renderCodexMuxConversation()}</div>
      </section>
      <section class="codex-mux-panel codex-mux-codex-panel">
        <div class="automation-section-title">Codex</div>
        <div class="codex-mux-event-list">${renderCodexMuxMilestones()}</div>
      </section>
    </div>
  </section>`;
  wireCodexMuxView();
  wireQuoteButtons(conversation);
  wireMessageRevokeButtons(conversation);
  wireMessageScrollButtons(conversation);
  wireMessageReplyActionButtons(conversation);
  wireArtifactWeixinButtons(conversation);
  wireSkillLinks(conversation);
  wireUsagePanels(conversation);
  wireLongMessageButtons(conversation);
  syncRunProgressTicker(conversation);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}

function renderCodexMuxViewSoon() {
  if (!isCodexMuxView()) return false;
  requestAnimationFrame(() => {
    if (isCodexMuxView()) renderCodexMuxView();
  });
  return true;
}

async function ensureCodexMuxThread() {
  if (state.currentThread?.singleWindow && state.currentThreadId && state.currentTaskGroupId === CODEX_MUX_TASK_GROUP_ID) {
    return state.currentThread;
  }
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: CODEX_MUX_OWNER_WORKSPACE_ID,
      messageMode: "chat",
      taskGroupId: CODEX_MUX_TASK_GROUP_ID,
      codexMuxMode: true,
      messageLimit: 80,
    }),
  });
  if (result?.thread) {
    state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread.id || "";
    state.currentTaskGroupId = CODEX_MUX_TASK_GROUP_ID;
  }
  return state.currentThread;
}

async function loadCodexMux(options = {}) {
  if (!codexMuxOwnerAllowed()) {
    renderCodexMuxView();
    return;
  }
  state.codexMuxLoading = true;
  state.codexMuxError = "";
  if (!options.silent) renderCodexMuxView();
  try {
    await ensureCodexMuxThread();
    const result = await api(`/api/codex-mux/tasks?assignedWorker=${encodeURIComponent(CODEX_MUX_WORKER_ID)}&limit=50`);
    state.codexMuxTasks = Array.isArray(result?.tasks) ? result.tasks : [];
    if (!state.codexMuxTaskId && state.codexMuxTasks[0]?.taskId) state.codexMuxTaskId = state.codexMuxTasks[0].taskId;
    await loadCodexMuxEvents({ render: false, skipActivationCheck: Boolean(options.skipActivationCheck) });
  } catch (err) {
    state.codexMuxError = err.message || String(err);
  } finally {
    state.codexMuxLoading = false;
    renderCodexMuxView();
  }
}

async function loadCodexMuxEvents(options = {}) {
  const taskId = String(state.codexMuxTaskId || "").trim();
  if (!taskId) {
    state.codexMuxEvents = [];
    if (options.render !== false) renderCodexMuxView();
    return;
  }
  const result = await api(`/api/codex-mux/tasks/${encodeURIComponent(taskId)}/events?limit=200`);
  state.codexMuxEvents = Array.isArray(result?.events) ? result.events : [];
  if (!options.skipActivationCheck) maybeActivateHermesForCodexMuxEvents().catch(showError);
  if (options.render !== false) renderCodexMuxView();
}

async function createCodexMuxTaskFromDraft(text) {
  return sendCodexMuxHermesMessage(text);
}

async function sendCodexMuxHermesMessage(text, options = {}) {
  const message = String(text || "").trim();
  const artifacts = Array.isArray(options.artifacts) ? options.artifacts : [];
  if (!message && !artifacts.length) {
    state.codexMuxError = "Message text is required.";
    renderCodexMuxView();
    return null;
  }
  state.codexMuxSubmitting = true;
  state.codexMuxError = "";
  renderCodexMuxView();
  try {
    const thread = await ensureCodexMuxThread();
    if (!thread?.id) throw new Error("Codex Mux thread is unavailable.");
    const result = await api(`/api/threads/${encodeURIComponent(thread.id)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        text: message,
        artifacts,
        workspaceId: CODEX_MUX_OWNER_WORKSPACE_ID,
        singleWindowMode: "chat",
        taskGroupId: CODEX_MUX_TASK_GROUP_ID,
        codexMuxMode: true,
        messageLimit: 80,
        instructions: codexMuxCoordinatorInstructions(),
        access_policy_context: {
          allowed_toolsets: ["http"],
        },
      }),
    });
    if (result?.thread) state.currentThread = mergeCurrentThread(result.thread);
    state.currentThreadId = state.currentThread?.id || thread.id;
    state.currentTaskGroupId = CODEX_MUX_TASK_GROUP_ID;
    await loadCodexMux({ silent: true, skipActivationCheck: Boolean(options.skipActivationCheck) });
    return result;
  } catch (err) {
    state.codexMuxError = err.message || String(err);
    renderCodexMuxView();
    throw err;
  } finally {
    state.codexMuxSubmitting = false;
    renderCodexMuxView();
  }
}

function wireCodexMuxView() {
  const conversation = $("conversation");
  conversation?.querySelector("[data-codex-mux-refresh]")?.addEventListener("click", () => loadCodexMux().catch(showError));
}

async function openCodexMuxPage() {
  closeSettings();
  closeTopMoreMenu();
  closeSidebar();
  clearQuotedReply({ render: false });
  state.viewMode = "codex-mux";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  await loadSelectedView();
}
