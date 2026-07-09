"use strict";

function focusAutomationCreateSoon() { setTimeout(() => $("automationNaturalText")?.focus(), 40); }

function currentAutomationActionsModel() {
  return typeof currentAutomationControllerModel === "function" ? currentAutomationControllerModel() : null;
}

function openAutomationCreate() {
  closeTopMoreMenu();
  const model = currentAutomationActionsModel();
  const patch = typeof model?.automationCreateOpenStatePlan === "function"
    ? model.automationCreateOpenStatePlan()
    : { selectedAutomationId: "", automationRouteTargetId: "", automationRouteTargetPending: false, automationEditOpen: false, automationEditJobId: "", automationOutputHistoryOpen: false, automationCreateOpen: true, automationCreateBusy: false, automationCreateDraftText: "", automationCreateProgressStep: "" };
  Object.assign(state, patch);
  renderAutomationView();
  focusAutomationCreateSoon();
}

async function createAutomationFromForm(root) {
  const input = root.querySelector("#automationNaturalText");
  const text = input?.value?.trim() || "";
  const model = currentAutomationActionsModel();
  const plan = typeof model?.automationCreateRequestPlan === "function"
    ? model.automationCreateRequestPlan({ text, workspaceId: state.selectedWorkspaceId || "owner" })
    : {
      ok: Boolean(text),
      errorMessage: text ? "" : "请输入自动化任务描述",
      url: "/api/automations",
      request: {
        method: "POST",
        body: {
          workspaceId: state.selectedWorkspaceId || "owner",
          text,
        },
      },
      busyPatch: {
        automationCreateBusy: true,
        automationCreateDraftText: text,
        automationCreateProgressStep: "understanding",
      },
    };
  if (!plan.ok) throw new Error(plan.errorMessage || "请输入自动化任务描述");
  Object.assign(state, plan.busyPatch || {});
  renderAutomationView({ preserveScroll: true });
  $("connectionState").textContent = "正在理解自动化";
  try {
    const result = await api(plan.url || "/api/automations", {
      method: plan.request?.method || "POST",
      body: JSON.stringify(plan.request?.body || {}),
    });
    const accepted = typeof model?.automationCreateAcceptedStatePlan === "function"
      ? model.automationCreateAcceptedStatePlan(result)
      : {
        automationCreateProgressStep: "saving",
        acceptedPatch: {
          automationCreateOpen: false,
          automationCreateDraftText: "",
          automationCreateProgressStep: "",
          selectedAutomationId: result?.job?.id || result?.data?.id || "",
          automationRouteTargetId: "",
          automationRouteTargetPending: false,
        },
      };
    state.automationCreateProgressStep = accepted.automationCreateProgressStep || "saving";
    renderAutomationView({ preserveScroll: true });
    Object.assign(state, accepted.acceptedPatch || {});
    await loadAutomations({ detail: "full", refresh: true });
    $("connectionState").textContent = "Home AI OK";
  } finally {
    const finalPlan = typeof model?.automationCreateFinallyPlan === "function"
      ? model.automationCreateFinallyPlan({
        automationCreateOpen: state.automationCreateOpen,
        viewMode: state.viewMode,
      })
      : {
        finalPatch: {
          automationCreateBusy: false,
          automationCreateProgressStep: "",
        },
        shouldRender: Boolean(state.automationCreateOpen && state.viewMode === "automation"),
      };
    Object.assign(state, finalPlan.finalPatch || {});
    if (finalPlan.shouldRender) renderAutomationView({ preserveScroll: true });
  }
}

function focusAutomationEditSoon() { setTimeout(() => $("automationEditName")?.focus(), 40); }

function openAutomationEdit() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const model = currentAutomationActionsModel();
  const patch = typeof model?.automationEditOpenStatePlan === "function"
    ? model.automationEditOpenStatePlan(job)
    : {
      automationCreateOpen: false,
      automationEditOpen: true,
      automationEditJobId: job.id,
    };
  if (!patch) return;
  Object.assign(state, patch);
  renderAutomationView();
  focusAutomationEditSoon();
}

async function postAutomationAction(jobId, action, payload = {}) {
  const model = currentAutomationActionsModel();
  const plan = typeof model?.automationActionRequestPlan === "function"
    ? model.automationActionRequestPlan({
      jobId,
      action,
      workspaceId: state.selectedWorkspaceId || "owner",
      payload,
    })
    : {
      ok: Boolean(jobId && action),
      url: `/api/automations/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`,
      request: {
        method: "POST",
        body: Object.assign({ workspaceId: state.selectedWorkspaceId || "owner" }, payload),
      },
    };
  if (!plan.ok) return null;
  $("connectionState").textContent = "Automation...";
  try {
    const result = await api(plan.url, {
      method: plan.request?.method || "POST",
      body: JSON.stringify(plan.request?.body || {}),
    });
    $("connectionState").textContent = "Home AI OK";
    return result;
  } catch (err) {
    $("connectionState").textContent = "Home AI error";
    throw err;
  }
}

function fallbackManualTriggerPatch(jobId, status, details = {}) {
  const cleanStatus = ["pending", "running", "success", "error"].includes(status) ? status : "pending";
  const rawIssue = details.issueCode || details.error?.code || details.error?.body?.code || details.error?.body?.result?.code || "";
  const issueCode = String(rawIssue || "").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120) || (details.error ? "automation_manual_trigger_failed" : "");
  const label = cleanStatus === "pending"
    ? "正在请求手动触发"
    : cleanStatus === "running"
      ? "调度已接收，等待执行"
      : cleanStatus === "success"
        ? "已请求下次执行"
        : issueCode ? `触发失败：${issueCode}` : "触发失败";
  return {
    automationManualTriggers: Object.assign({}, state.automationManualTriggers || {}, {
      [jobId]: {
        status: cleanStatus,
        label,
        issueCode: cleanStatus === "error" ? issueCode : "",
        runMode: String(details.result?.source?.runMode || details.result?.source?.run_mode || "").slice(0, 120),
        updatedAt: new Date().toISOString(),
      },
    }),
  };
}

function setAutomationManualTriggerState(jobId, status, details = {}) {
  const model = currentAutomationActionsModel();
  const plan = typeof model?.automationManualTriggerStatePatchPlan === "function"
    ? model.automationManualTriggerStatePatchPlan({
      existing: state.automationManualTriggers || {},
      jobId,
      status,
      result: details.result || {},
      error: details.error || null,
      nowIso: new Date().toISOString(),
    })
    : { ok: true, patch: fallbackManualTriggerPatch(jobId, status, details) };
  if (!plan?.ok) return;
  Object.assign(state, plan.patch || {});
}

async function triggerAutomationJob(jobId = "") {
  const job = state.automations.find((item) => String(item?.id || "") === String(jobId || "")) || currentAutomation();
  if (!job?.id) return null;
  closeTopMoreMenu();
  const model = currentAutomationActionsModel();
  setAutomationManualTriggerState(job.id, "pending");
  renderAutomationView({ preserveScroll: true });
  $("connectionState").textContent = "Automation...";
  try {
    const plan = typeof model?.automationManualTriggerRequestPlan === "function"
      ? model.automationManualTriggerRequestPlan({
        jobId: job.id,
        workspaceId: state.selectedWorkspaceId || "owner",
      })
      : null;
    const result = plan?.ok
      ? await api(plan.url, {
        method: plan.request?.method || "POST",
        body: JSON.stringify(plan.request?.body || {}),
      })
      : await postAutomationAction(job.id, "run", { reason: "manual_ui" });
    setAutomationManualTriggerState(job.id, "success", { result });
    invalidateAutomationListCache();
    await loadAutomations({ detail: "full", refresh: true, silent: true });
    $("connectionState").textContent = "Home AI OK";
    renderAutomationView({ preserveScroll: true });
    return result;
  } catch (error) {
    setAutomationManualTriggerState(job.id, "error", { error });
    $("connectionState").textContent = "Home AI error";
    renderAutomationView({ preserveScroll: true });
    return null;
  }
}

async function toggleAutomationPause() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const model = currentAutomationActionsModel();
  const action = typeof model?.automationPauseActionPlan === "function"
    ? model.automationPauseActionPlan(job, automationStatusLabel(job))
    : automationStatusLabel(job) === "paused" ? "resume" : "pause";
  await postAutomationAction(job.id, action);
  const patch = typeof model?.automationSelectAfterActionPlan === "function"
    ? model.automationSelectAfterActionPlan(job.id)
    : { selectedAutomationId: job.id, automationRouteTargetId: "", automationRouteTargetPending: false };
  Object.assign(state, patch);
  await loadAutomations({ detail: "full", refresh: true });
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  const model = currentAutomationActionsModel();
  const patch = typeof model?.automationDeleteAcceptedStatePlan === "function"
    ? model.automationDeleteAcceptedStatePlan()
    : { selectedAutomationId: "", automationRouteTargetId: "", automationRouteTargetPending: false, automationEditOpen: false, automationEditJobId: "", automationOutputHistoryOpen: false };
  Object.assign(state, patch);
  await loadAutomations({ detail: "full", refresh: true });
}

async function updateAutomationFromForm(root) {
  const form = root.querySelector("#automationEditForm");
  const jobId = form?.dataset?.automationEditId || state.automationEditJobId || state.selectedAutomationId;
  if (!jobId) return;
  const name = root.querySelector("#automationEditName")?.value?.trim() || "";
  const schedule = root.querySelector("#automationEditSchedule")?.value?.trim() || "";
  const prompt = root.querySelector("#automationEditPrompt")?.value?.trim() || "";
  const model = currentAutomationActionsModel();
  const plan = typeof model?.automationUpdateFormPlan === "function"
    ? model.automationUpdateFormPlan({ jobId, name, schedule, prompt })
    : {
      ok: Boolean(jobId && name && schedule && prompt),
      skip: !jobId,
      errorMessage: !name
        ? "\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0"
        : !schedule
          ? "\u8bf7\u8f93\u5165\u6267\u884c\u8ba1\u5212"
          : !prompt
            ? "\u8bf7\u8f93\u5165\u4efb\u52a1\u76ee\u6807"
            : "",
      jobId,
      payload: { name, schedule, prompt },
    };
  if (plan.skip) return;
  if (!plan.ok) throw new Error(plan.errorMessage || "\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0");
  const submit = root.querySelector("#automationEditForm button[type='submit']");
  if (submit) submit.disabled = true;
  try {
    const result = await postAutomationAction(plan.jobId, "update", plan.payload || {});
    const patch = typeof model?.automationUpdateAcceptedStatePlan === "function"
      ? model.automationUpdateAcceptedStatePlan(result, plan.jobId)
      : {
        automationEditOpen: false,
        automationEditJobId: "",
        selectedAutomationId: result?.job?.id || plan.jobId,
        automationRouteTargetId: "",
        automationRouteTargetPending: false,
      };
    Object.assign(state, patch);
    await loadAutomations({ detail: "full", refresh: true });
  } finally {
    if (submit) submit.disabled = false;
  }
}
