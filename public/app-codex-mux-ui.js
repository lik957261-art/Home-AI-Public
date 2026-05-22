"use strict";

const CODEX_MUX_TASK_GROUP_ID = "codex-mux";
const CODEX_MUX_OWNER_WORKSPACE_ID = "owner";
const CODEX_MUX_WORKER_ID = "codex-hermes-main";

function codexMuxOwnerAllowed() {
  return Boolean(state.auth?.isOwner);
}

function codexMuxTaskTitle(task) {
  return String(task?.title || task?.taskId || "Codex Mux task").trim();
}

function codexMuxTaskMeta(task) {
  return [task?.status || "open", task?.assignedWorker || "", task?.updatedAt || task?.createdAt || ""]
    .filter(Boolean)
    .join(" | ");
}

function codexMuxEventSummary(event) {
  return String(event?.summary || event?.payload?.instruction || event?.payload?.message || event?.type || "").trim();
}

function codexMuxEventIsDecisionLevel(event) {
  const type = String(event?.type || "").toLowerCase();
  if (!type) return false;
  if (type.includes("heartbeat") || type.includes("tool") || type.includes("progress") || type.includes("poll")) return false;
  return Boolean(codexMuxEventSummary(event));
}

function codexMuxSettingsEntryHtml() {
  return "";
}

function renderCodexMuxTaskCard(task) {
  const active = task?.taskId && task.taskId === state.codexMuxTaskId;
  return `<button class="codex-mux-task${active ? " active" : ""}" type="button" data-codex-mux-task="${escapeHtml(task?.taskId || "")}">
    <span class="codex-mux-task-title">${escapeHtml(codexMuxTaskTitle(task))}</span>
    <span class="codex-mux-task-meta">${escapeHtml(codexMuxTaskMeta(task))}</span>
  </button>`;
}

function renderCodexMuxEvent(event) {
  const summary = codexMuxEventSummary(event);
  return `<article class="codex-mux-event">
    <div class="codex-mux-event-head">
      <strong>${escapeHtml(event?.type || "event")}</strong>
      <span>${escapeHtml(event?.createdAt || "")}</span>
    </div>
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
  </article>`;
}

function codexMuxCoordinatorInstructions() {
  return [
    "You are Hermes Mobile inside the Owner-only Hermes-Codex Mux collaboration stream.",
    "The user is speaking to Hermes first. Do not treat the message as an automatic instruction to Codex.",
    "Clarify, analyze, and decide the next step in this same conversation. Use Codex only when code/workspace execution or verification is needed.",
    `When Codex is needed, call the codex_mobile function through the HTTP/API toolset with assignedWorker=${CODEX_MUX_WORKER_ID}, workerMode=sticky, requiresSameThread=true, and a bounded task capsule.`,
    "After Codex reports back, summarize the result here and continue coordinating follow-up work with the user. Keep the user-facing stream readable and do not expose secrets.",
  ].join("\n");
}

function renderCodexMuxMessage(message) {
  return renderMessage(message);
}

function renderCodexMuxConversation() {
  const messages = (state.currentThread?.messages || []).filter((message) => message.taskGroupId === CODEX_MUX_TASK_GROUP_ID);
  return messages.length
    ? messages.map(renderCodexMuxMessage).join("")
    : `<div class="empty-state small">向 Hermes 描述需求；Hermes 需要 Codex 配合时会在这里发起并跟进。</div>`;
}

function renderCodexMuxView() {
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = "";
  $("threadTitle").textContent = "Hermes 协作流";
  $("threadMeta").textContent = codexMuxOwnerAllowed() ? "Owner-only Mux" : "Owner only";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Hermes 协作流" });
  const conversation = $("conversation");
  if (!conversation) return;
  if (!codexMuxOwnerAllowed()) {
    conversation.innerHTML = `<section class="codex-mux-shell"><div class="automation-warning">Codex Mux is Owner-only.</div></section>`;
    updateNavigationControls();
    return;
  }
  const selected = state.codexMuxTasks.find((task) => task.taskId === state.codexMuxTaskId) || null;
  const taskList = state.codexMuxTasks.length
    ? state.codexMuxTasks.map(renderCodexMuxTaskCard).join("")
    : `<div class="empty-state small">No Mux tasks yet.</div>`;
  const decisionEvents = state.codexMuxEvents.filter(codexMuxEventIsDecisionLevel).slice(-40);
  const events = selected
    ? (decisionEvents.length ? decisionEvents.map(renderCodexMuxEvent).join("") : `<div class="empty-state small">No decision-level events yet.</div>`)
    : `<div class="empty-state small">Select a Mux task to inspect the event stream.</div>`;
  conversation.innerHTML = `<section class="codex-mux-shell" data-codex-mux-page>
    <div class="codex-mux-intro">
      <strong>Hermes 协作流</strong>
      <span>先和 Hermes 沟通；只有需要代码执行或工作区验证时，Hermes 才会调用固定 Codex 线程。</span>
    </div>
    <div class="codex-mux-chat" data-codex-mux-chat>${renderCodexMuxConversation()}</div>
    <form class="codex-mux-create" data-codex-mux-message-form>
      <label class="automation-create-label" for="codexMuxInstruction">发给 Hermes</label>
      <textarea id="codexMuxInstruction" class="automation-create-input" rows="4" data-codex-mux-draft placeholder="描述你要 Hermes 协调的需求；Hermes 会判断是否需要 Codex 参与。">${escapeHtml(state.codexMuxDraft || "")}</textarea>
      <div class="automation-create-actions">
        <button class="secondary-small" type="button" data-codex-mux-refresh ${state.codexMuxLoading ? "disabled" : ""}>Refresh</button>
        <button class="primary-small" type="submit" ${state.codexMuxSubmitting ? "disabled" : ""}>Send</button>
      </div>
    </form>
    ${state.codexMuxError ? `<div class="automation-warning">${escapeHtml(state.codexMuxError)}</div>` : ""}
    ${state.codexMuxLoading ? `<div class="automation-loading" role="status"><span class="automation-loading-spinner" aria-hidden="true"></span><span>Refreshing Mux stream</span></div>` : ""}
    <div class="codex-mux-grid">
      <section class="codex-mux-panel">
        <div class="automation-section-title">Tasks | ${state.codexMuxTasks.length}</div>
        <div class="codex-mux-task-list">${taskList}</div>
      </section>
      <section class="codex-mux-panel">
        <div class="automation-section-title">${escapeHtml(selected ? codexMuxTaskTitle(selected) : "Milestones")}</div>
        <div class="codex-mux-event-list">${events}</div>
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

async function sendCodexMuxHermesMessage(text) {
  const message = String(text || "").trim();
  if (!message) {
    state.codexMuxError = "Message text is required.";
    renderCodexMuxView();
    return;
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
    state.codexMuxDraft = "";
    await loadCodexMux({ silent: true });
  } catch (err) {
    state.codexMuxError = err.message || String(err);
  } finally {
    state.codexMuxSubmitting = false;
    renderCodexMuxView();
  }
}

function wireCodexMuxView() {
  const conversation = $("conversation");
  conversation?.querySelector("[data-codex-mux-draft]")?.addEventListener("input", (event) => {
    state.codexMuxDraft = event.target.value || "";
  });
  conversation?.querySelector("[data-codex-mux-message-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCodexMuxHermesMessage(conversation.querySelector("[data-codex-mux-draft]")?.value || "").catch(showError);
  });
  conversation?.querySelector("[data-codex-mux-refresh]")?.addEventListener("click", () => loadCodexMux().catch(showError));
  conversation?.querySelectorAll("[data-codex-mux-task]").forEach((button) => {
    button.addEventListener("click", () => {
      state.codexMuxTaskId = button.dataset.codexMuxTask || "";
      loadCodexMuxEvents().catch(showError);
    });
  });
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
