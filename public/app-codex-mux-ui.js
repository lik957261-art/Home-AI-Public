"use strict";

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

function codexMuxNewTaskId() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return `mux_${Array.from(bytes).map((item) => item.toString(16).padStart(2, "0")).join("")}`;
  }
  return `mux_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`;
}

function codexMuxSettingsEntryHtml() {
  if (!codexMuxOwnerAllowed()) return "";
  return `<div class="settings-row-title">Owner</div>
      <div class="settings-account-actions">
        <button class="settings-logout-button" type="button" data-open-codex-mux>Codex Mux</button>
        <span>Owner-only fixed-thread coordination stream between Hermes Mobile and Codex Mobile.</span>
      </div>`;
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
  const payload = event?.payload && typeof event.payload === "object"
    ? JSON.stringify(event.payload, null, 2)
    : "";
  return `<article class="codex-mux-event">
    <div class="codex-mux-event-head">
      <strong>${escapeHtml(event?.type || "event")}</strong>
      <span>${escapeHtml(event?.createdAt || "")}</span>
    </div>
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
    ${payload && payload !== "{}" ? `<pre>${escapeHtml(payload)}</pre>` : ""}
  </article>`;
}

function renderCodexMuxView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  if (list) list.innerHTML = "";
  $("threadTitle").textContent = "Codex Mux";
  $("threadMeta").textContent = codexMuxOwnerAllowed() ? "Owner coordination stream" : "Owner only";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Codex Mux" });
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
  const events = selected
    ? (state.codexMuxEvents.length ? state.codexMuxEvents.map(renderCodexMuxEvent).join("") : `<div class="empty-state small">No events recorded.</div>`)
    : `<div class="empty-state small">Select a Mux task to inspect the event stream.</div>`;
  conversation.innerHTML = `<section class="codex-mux-shell" data-codex-mux-page>
    <form class="codex-mux-create" data-codex-mux-create-form>
      <label class="automation-create-label" for="codexMuxInstruction">New request</label>
      <textarea id="codexMuxInstruction" class="automation-create-input" rows="4" data-codex-mux-draft placeholder="Describe one Codex coordination request for the fixed worker thread.">${escapeHtml(state.codexMuxDraft || "")}</textarea>
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
        <div class="automation-section-title">${escapeHtml(selected ? codexMuxTaskTitle(selected) : "Events")}</div>
        <div class="codex-mux-event-list">${events}</div>
      </section>
    </div>
  </section>`;
  wireCodexMuxView();
  updateNavigationControls();
  ensureVerticalScrollAffordance();
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
    const result = await api("/api/codex-mux/tasks?assignedWorker=codex-hermes-main&limit=50");
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
  const instruction = String(text || "").trim();
  if (!instruction) {
    state.codexMuxError = "Request text is required.";
    renderCodexMuxView();
    return;
  }
  const taskId = codexMuxNewTaskId();
  const title = instruction.split(/\r?\n/)[0].slice(0, 80) || taskId;
  const capsule = {
    schema: "hermes-codex-mux.task.v1",
    taskId,
    title,
    userIntent: instruction,
    bridgeId: "hermes-mobile-codex-main",
    assignedWorker: "codex-hermes-main",
    workerMode: "sticky",
    requiresSameThread: true,
    handoverAllowed: false,
    source: { channel: "hermes-mobile-mux-window" },
  };
  state.codexMuxSubmitting = true;
  state.codexMuxError = "";
  renderCodexMuxView();
  try {
    await api("/api/codex-mux/tasks", {
      method: "POST",
      body: JSON.stringify({
        taskId,
        title,
        status: "open",
        assignedWorker: "codex-hermes-main",
        capsule,
        event: {
          type: "task.requested",
          from: "hermes-mobile",
          to: "codex-hermes-main",
          workerId: "codex-hermes-main",
          status: "open",
          summary: title,
          payload: { instruction, capsule },
        },
      }),
    });
    state.codexMuxDraft = "";
    state.codexMuxTaskId = taskId;
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
  conversation?.querySelector("[data-codex-mux-create-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createCodexMuxTaskFromDraft(conversation.querySelector("[data-codex-mux-draft]")?.value || "").catch(showError);
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
