"use strict";

function focusAutomationCreateSoon() { setTimeout(() => $("automationNaturalText")?.focus(), 40); }

function openAutomationCreate() {
  closeTopMoreMenu();
  Object.assign(state, { selectedAutomationId: "", automationRouteTargetId: "", automationRouteTargetPending: false, automationEditOpen: false, automationEditJobId: "", automationOutputHistoryOpen: false, automationCreateOpen: true });
  renderAutomationView();
  focusAutomationCreateSoon();
}

async function createAutomationFromForm(root) {
  const input = root.querySelector("#automationNaturalText");
  const text = input?.value?.trim() || "";
  if (!text) throw new Error("请输入自动化任务描述");
  const submit = root.querySelector("#automationCreateForm button[type='submit']");
  if (submit) submit.disabled = true;
  $("connectionState").textContent = "正在理解自动化";
  try {
    const result = await api("/api/automations", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        text,
      }),
    });
    state.automationCreateOpen = false;
    state.selectedAutomationId = result?.job?.id || result?.data?.id || "";
    state.automationRouteTargetId = "";
    state.automationRouteTargetPending = false;
    await loadAutomations({ detail: "full", refresh: true });
    $("connectionState").textContent = "Home AI OK";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function focusAutomationEditSoon() { setTimeout(() => $("automationEditName")?.focus(), 40); }

function openAutomationEdit() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  state.automationCreateOpen = false;
  state.automationEditOpen = true;
  state.automationEditJobId = job.id;
  renderAutomationView();
  focusAutomationEditSoon();
}

async function postAutomationAction(jobId, action, payload = {}) {
  if (!jobId || !action) return null;
  $("connectionState").textContent = "Automation...";
  try {
    const result = await api(`/api/automations/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify(Object.assign({ workspaceId: state.selectedWorkspaceId || "owner" }, payload)),
    });
    $("connectionState").textContent = "Home AI OK";
    return result;
  } catch (err) {
    $("connectionState").textContent = "Home AI error";
    throw err;
  }
}

async function toggleAutomationPause() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const action = automationStatusLabel(job) === "paused" ? "resume" : "pause";
  await postAutomationAction(job.id, action);
  state.selectedAutomationId = job.id;
  state.automationRouteTargetId = "";
  state.automationRouteTargetPending = false;
  await loadAutomations({ detail: "full", refresh: true });
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  state.selectedAutomationId = "";
  state.automationRouteTargetId = "";
  state.automationRouteTargetPending = false;
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  await loadAutomations({ detail: "full", refresh: true });
}

async function updateAutomationFromForm(root) {
  const form = root.querySelector("#automationEditForm");
  const jobId = form?.dataset?.automationEditId || state.automationEditJobId || state.selectedAutomationId;
  if (!jobId) return;
  const name = root.querySelector("#automationEditName")?.value?.trim() || "";
  const schedule = root.querySelector("#automationEditSchedule")?.value?.trim() || "";
  const prompt = root.querySelector("#automationEditPrompt")?.value?.trim() || "";
  if (!name) throw new Error("\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0");
  if (!schedule) throw new Error("\u8bf7\u8f93\u5165\u6267\u884c\u8ba1\u5212");
  if (!prompt) throw new Error("\u8bf7\u8f93\u5165\u4efb\u52a1\u76ee\u6807");
  const submit = root.querySelector("#automationEditForm button[type='submit']");
  if (submit) submit.disabled = true;
  try {
    const result = await postAutomationAction(jobId, "update", { name, schedule, prompt });
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.selectedAutomationId = result?.job?.id || jobId;
    state.automationRouteTargetId = "";
    state.automationRouteTargetPending = false;
    await loadAutomations({ detail: "full", refresh: true });
  } finally {
    if (submit) submit.disabled = false;
  }
}
