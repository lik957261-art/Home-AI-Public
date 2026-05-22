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
  if (text.length > 900) return "";
  if (/^\s*[{[]/.test(text)) return "";
  return text;
}

function codexMuxEventMilestone(event) {
  const type = String(event?.type || "").toLowerCase();
  if (!type) return null;
  if (type.includes("heartbeat") || type.includes("tool") || type.includes("progress") || type.includes("poll")) return null;
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const explicitSummary = codexMuxMeaningfulText(event?.summary || payload.summary || payload.result || payload.message);
  if (type.includes("result") || type.includes("completed") || type.includes("done")) {
    return {
      label: "Codex 回报",
      summary: explicitSummary || "Codex 已返回阶段性结果。",
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("failed") || type.includes("error") || type.includes("blocked")) {
    return {
      label: "需要处理",
      summary: explicitSummary || "Codex 侧报告失败或阻塞，需要 Hermes 或 Owner 继续处理。",
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("accepted") || type.includes("started") || type.includes("running")) {
    return {
      label: "Codex 已接收",
      summary: explicitSummary || "Codex 已接收任务并开始处理。",
      time: codexMuxEventTimestamp(event),
    };
  }
  if (type.includes("task.requested") || type.includes("created")) {
    const title = codexMuxMeaningfulText(payload.title || event?.title);
    return {
      label: "已交给 Codex",
      summary: title ? `任务：${title}` : "Hermes 已把需要代码处理的事项交给 Codex。",
      time: codexMuxEventTimestamp(event),
    };
  }
  if (!explicitSummary) return null;
  return {
    label: "阶段结论",
    summary: explicitSummary,
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

function codexMuxCoordinatorInstructions() {
  return [
    "You are Hermes Mobile inside the Owner-only Hermes-Codex Mux collaboration stream.",
    "The user is speaking to Hermes first. Do not treat the message as an automatic instruction to Codex.",
    "Clarify, analyze, and decide the next step in this same conversation. Use Codex only when code/workspace execution or verification is needed.",
    `When Codex is needed, call the codex_mobile function through the HTTP/API toolset with assignedWorker=${CODEX_MUX_WORKER_ID}, workerMode=sticky, requiresSameThread=true, and a bounded task capsule.`,
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
    await loadCodexMuxEvents({ render: false });
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
    await loadCodexMux({ silent: true });
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
