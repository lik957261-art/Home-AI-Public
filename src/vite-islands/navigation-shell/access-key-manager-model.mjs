const ACCESS_KEY_MANAGER_MODEL_VERSION = "20260705-vite-access-key-manager-model-v1";

const DEFAULT_WORKSPACE_ONBOARDING_PLUGIN_IDS = Object.freeze([
  "wardrobe",
  "health",
  "finance",
  "email",
  "note",
  "growth",
]);

function cleanAccessKeyManagerString(value = "", max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function cleanList(values = []) {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze(values.map((item) => cleanAccessKeyManagerString(item, 240)).filter(Boolean));
}

function workspaceRootLabelPlan(workspace = {}) {
  return cleanAccessKeyManagerString(workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "", 1000);
}

function workspaceToolsetsPlan(workspace = {}) {
  const values = workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  return cleanList(values);
}

function workspaceKeyRecordPlan(input = {}) {
  const workspace = input.workspace && typeof input.workspace === "object" ? input.workspace : {};
  const keyRecord = input.keyRecord && typeof input.keyRecord === "object" ? input.keyRecord : {};
  const workspaceId = cleanAccessKeyManagerString(workspace.id || keyRecord.workspaceId || "", 160);
  if (!workspaceId) return Object.freeze({ workspaceId: "", workspaceLabel: "", hasKey: false, updatedAt: "" });
  return Object.freeze({
    workspaceId,
    workspaceLabel: cleanAccessKeyManagerString(keyRecord.workspaceLabel || workspace.label || workspaceId, 240),
    hasKey: Boolean(keyRecord.hasKey || workspace?.accessKeyStatus?.hasKey),
    updatedAt: cleanAccessKeyManagerString(keyRecord.updatedAt || workspace?.accessKeyStatus?.updatedAt || "", 120),
  });
}

function generatedAccessKeyTargetPlan(input = {}) {
  const generated = input.generatedAccessKey && typeof input.generatedAccessKey === "object"
    ? input.generatedAccessKey
    : null;
  if (!generated) return Object.freeze({ visible: false, kind: "", workspaceId: "" });
  const generatedKind = cleanAccessKeyManagerString(generated.kind || "workspace", 40) || "workspace";
  const targetKind = cleanAccessKeyManagerString(input.targetKind || input.target?.kind || "workspace", 40) || "workspace";
  const generatedWorkspaceId = cleanAccessKeyManagerString(generated.workspaceId || "", 160);
  const targetWorkspaceId = cleanAccessKeyManagerString(input.workspaceId || input.target?.workspaceId || "", 160);
  const visible = generatedKind === targetKind
    && (targetKind !== "workspace" || !targetWorkspaceId || generatedWorkspaceId === targetWorkspaceId);
  return Object.freeze({
    visible,
    kind: generatedKind,
    workspaceId: generatedWorkspaceId,
    targetKind,
    targetWorkspaceId,
  });
}

function generatedAccessKeyPlacementPlan(input = {}) {
  const generated = input.generatedAccessKey && typeof input.generatedAccessKey === "object"
    ? input.generatedAccessKey
    : null;
  if (!generated) {
    return Object.freeze({
      visibleAsLooseBlock: false,
      generatedInWorkspaceRow: false,
      generatedInOwnerRow: false,
      generatedKind: "",
      generatedWorkspaceId: "",
    });
  }
  const generatedKind = cleanAccessKeyManagerString(generated.kind || "workspace", 40) || "workspace";
  const generatedWorkspaceId = cleanAccessKeyManagerString(generated.workspaceId || "", 160);
  const workspaceIds = new Set(cleanList(input.workspaceIds));
  const generatedInWorkspaceRow = Boolean(
    generatedKind === "workspace"
    && generatedWorkspaceId
    && workspaceIds.has(generatedWorkspaceId),
  );
  const generatedInOwnerRow = Boolean(generatedKind === "owner" && input.ownerVisible);
  return Object.freeze({
    visibleAsLooseBlock: Boolean(!generatedInWorkspaceRow && !generatedInOwnerRow),
    generatedInWorkspaceRow,
    generatedInOwnerRow,
    generatedKind,
    generatedWorkspaceId,
  });
}

function accessKeyManagerViewPlan(input = {}) {
  const isOwnerAccessManager = Boolean(input.isOwnerAccessManager);
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces : [];
  const accessKeys = Array.isArray(input.accessKeys) ? input.accessKeys : [];
  const localWorkspaces = isOwnerAccessManager
    ? workspaces.filter((workspace) => workspace?.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? workspaces.filter((workspace) => workspace?.id !== "owner" && workspace?.source !== "local-workspace")
    : [];
  const workspaceIds = workspaces.map((workspace) => cleanAccessKeyManagerString(workspace?.id || "", 160)).filter(Boolean);
  const workspaceIdSet = new Set(workspaceIds);
  const orphanAccessKeys = isOwnerAccessManager
    ? accessKeys.filter((item) => {
      const workspaceId = cleanAccessKeyManagerString(item?.workspaceId || "", 160);
      return workspaceId && !workspaceIdSet.has(workspaceId);
    })
    : [];
  const placement = generatedAccessKeyPlacementPlan({
    generatedAccessKey: input.generatedAccessKey,
    workspaceIds,
    ownerVisible: isOwnerAccessManager,
  });
  return Object.freeze({
    isOwnerAccessManager,
    localWorkspaces: Object.freeze(localWorkspaces),
    deploymentWorkspaces: Object.freeze(deploymentWorkspaces),
    workspaceIds: Object.freeze(workspaceIds),
    orphanAccessKeys: Object.freeze(orphanAccessKeys),
    generatedAccessKeyPlacement: placement,
    subtitle: isOwnerAccessManager
      ? "账号、根目录、接口和登录 Key"
      : "只能查看并更换当前账号的 Home AI 登录 Key。",
    title: isOwnerAccessManager ? "Owner 管理" : "Access Key",
    emptyText: "还没有可管理的账号。",
  });
}

function workspaceOnboardingStatusLabelPlan(status = "") {
  return ({
    planned: "计划中",
    pending: "等待回执",
    running: "执行中",
    ok: "完成",
    failed: "失败",
    blocked: "阻断",
    manual_required: "需人工处理",
    skipped: "已跳过",
  }[status] || status || "未知");
}

function workspaceOnboardingStatusTonePlan(status = "") {
  if (status === "ok") return "ok";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "manual_required") return "manual";
  if (status === "running") return "running";
  return "pending";
}

function workspaceOnboardingEvidenceTitlePlan(input = {}) {
  if (input.status === "running") return "开通运行中";
  return input.hasResult ? "开通结果" : "开通计划";
}

function slugWorkspaceOnboardingIdPlan(value = "") {
  return cleanAccessKeyManagerString(value, 200)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function workspaceOnboardingPayloadPlan(input = {}) {
  const rawWorkspaceId = cleanAccessKeyManagerString(input.rawWorkspaceId || input.workspaceId || "", 200);
  const workspaceId = slugWorkspaceOnboardingIdPlan(rawWorkspaceId);
  const displayName = cleanAccessKeyManagerString(input.displayName || rawWorkspaceId || workspaceId, 200);
  const pluginIds = cleanList(input.pluginIds);
  if (!workspaceId) {
    return Object.freeze({
      ok: false,
      errorMessage: "请输入工作区 ID",
      payload: null,
    });
  }
  return Object.freeze({
    ok: true,
    errorMessage: "",
    payload: Object.freeze({
      workspaceId,
      displayName,
      label: displayName,
      pluginIds: Object.freeze(pluginIds),
      runSmokes: true,
    }),
  });
}

function rememberWorkspaceOnboardingDraftPlan(payload = {}) {
  return Object.freeze({
    workspaceId: cleanAccessKeyManagerString(payload.workspaceId || "", 160),
    displayName: cleanAccessKeyManagerString(payload.displayName || payload.label || payload.workspaceId || "", 200),
    pluginIds: cleanList(payload.pluginIds),
  });
}

function workspaceOnboardingPlanMatchesPayloadPlan(input = {}) {
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const planPlugins = Array.isArray(plan.pluginIds) ? plan.pluginIds : [];
  const payloadPlugins = Array.isArray(payload.pluginIds) ? payload.pluginIds : [];
  return String(plan.workspaceId || "") === String(payload.workspaceId || "")
    && String(plan.displayName || plan.label || plan.workspaceId || "") === String(payload.displayName || payload.label || payload.workspaceId || "")
    && planPlugins.length === payloadPlugins.length
    && planPlugins.every((pluginId, index) => pluginId === payloadPlugins[index]);
}

function createWorkspaceOnboardingRunStatePlan(input = {}) {
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  return Object.freeze({
    ok: false,
    status: "running",
    workspaceId: cleanAccessKeyManagerString(payload.workspaceId || plan.workspaceId || "", 160),
    displayName: cleanAccessKeyManagerString(payload.displayName || plan.displayName || payload.workspaceId || "", 200),
    macUser: cleanAccessKeyManagerString(plan.macUser || "", 160),
    paths: Object.freeze(plan.paths && typeof plan.paths === "object" ? Object.assign({}, plan.paths) : {}),
    pluginIds: cleanList(Array.isArray(payload.pluginIds) ? payload.pluginIds : plan.pluginIds),
    progressMessage: "请求已发送，后端会按下面步骤顺序执行；完成后会显示每一步真实结果。",
    steps: Object.freeze(steps.map((step, index) => Object.freeze(Object.assign({}, step, {
      status: index === 0 ? "running" : "pending",
      progressHint: index === 0 ? "已开始" : "等待后端回执",
    })))),
  });
}

function failWorkspaceOnboardingRunStatePlan(input = {}) {
  const activeRun = input.run && typeof input.run === "object" ? input.run : {};
  const message = cleanAccessKeyManagerString(input.error || "工作区开通请求失败", 500) || "工作区开通请求失败";
  const steps = Array.isArray(activeRun.steps) ? activeRun.steps : [];
  return Object.freeze(Object.assign({}, activeRun, {
    status: "failed",
    error: message,
    progressMessage: "请求未完成，请查看错误信息后重试。",
    steps: Object.freeze(steps.map((step) => (
      step.status === "running"
        ? Object.freeze(Object.assign({}, step, { status: "failed", error: message }))
        : step
    ))),
  }));
}

function redactedWorkspaceOnboardingResultPlan(result = {}) {
  const safe = Object.assign({}, result && typeof result === "object" ? result : {});
  if (safe.credentials && typeof safe.credentials === "object") {
    safe.credentials = Object.freeze({
      homeAiAccessKey: Boolean(safe.credentials.homeAiAccessKey),
    });
  }
  return Object.freeze(safe);
}

function accessKeyListRequestPlan(input = {}) {
  const workspaceId = cleanAccessKeyManagerString(input.workspaceId || "", 160);
  const requestAllWorkspaceKeys = workspaceId === "owner";
  const path = workspaceId && !requestAllWorkspaceKeys
    ? `/api/access-keys?workspaceId=${encodeURIComponent(workspaceId)}`
    : "/api/access-keys";
  return Object.freeze({ path, workspaceId, requestAllWorkspaceKeys });
}

function workspaceExistsPlan(input = {}) {
  const workspaceId = cleanAccessKeyManagerString(input.workspaceId || "", 160);
  const canonicalWorkspaceId = cleanAccessKeyManagerString(input.canonicalWorkspaceId || workspaceId, 160);
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces : [];
  return workspaces.some((workspace) => {
    const id = cleanAccessKeyManagerString(workspace?.id || "", 160);
    return id === workspaceId || id === canonicalWorkspaceId;
  });
}

function workspaceAccessKeyConfirmationPlan(input = {}) {
  const action = cleanAccessKeyManagerString(input.action || "", 40);
  const label = cleanAccessKeyManagerString(input.label || input.workspaceId || "workspace", 200);
  if (action === "rotate") {
    return Object.freeze({
      title: "更换 Workspace Key",
      message: `更换 ${label} 的 Home AI Access Key？`,
      detail: "旧 key 会立即失效，该账号需要使用新 key 重新登录。",
      confirmLabel: "更换 Key",
      danger: true,
    });
  }
  if (action === "revoke") {
    return Object.freeze({
      title: "撤销 Workspace Key",
      message: `撤销 ${label} 的 Home AI Access Key？`,
      detail: "该账号会在下次请求时需要重新登录。",
      confirmLabel: "撤销 Key",
      danger: true,
    });
  }
  return Object.freeze({
    title: "确认操作",
    message: "",
    detail: "",
    confirmLabel: "确认",
    danger: false,
  });
}

function ownerAccessKeyConfirmationPlan() {
  return Object.freeze({
    title: "更换 Owner Key",
    message: "更换 Home AI Owner Access Key？",
    detail: "旧 Owner key 会立即失效。当前设备会保存新 key，其他设备需要重新登录。",
    confirmLabel: "更换 Key",
    danger: true,
  });
}

function deleteWorkspaceConfirmationPlan(input = {}) {
  const label = cleanAccessKeyManagerString(input.label || input.workspaceId || "", 200);
  return Object.freeze({
    title: "删除本地用户工作区",
    message: `删除本地用户工作区 ${label}？`,
    detail: "该账号的 Workspace Access Key 也会撤销。历史消息不会被删除。",
    confirmLabel: "删除",
    danger: true,
  });
}

export {
  ACCESS_KEY_MANAGER_MODEL_VERSION,
  DEFAULT_WORKSPACE_ONBOARDING_PLUGIN_IDS,
  accessKeyListRequestPlan,
  accessKeyManagerViewPlan,
  cleanAccessKeyManagerString,
  createWorkspaceOnboardingRunStatePlan,
  deleteWorkspaceConfirmationPlan,
  failWorkspaceOnboardingRunStatePlan,
  generatedAccessKeyPlacementPlan,
  generatedAccessKeyTargetPlan,
  ownerAccessKeyConfirmationPlan,
  redactedWorkspaceOnboardingResultPlan,
  rememberWorkspaceOnboardingDraftPlan,
  slugWorkspaceOnboardingIdPlan,
  workspaceAccessKeyConfirmationPlan,
  workspaceExistsPlan,
  workspaceKeyRecordPlan,
  workspaceOnboardingEvidenceTitlePlan,
  workspaceOnboardingPayloadPlan,
  workspaceOnboardingPlanMatchesPayloadPlan,
  workspaceOnboardingStatusLabelPlan,
  workspaceOnboardingStatusTonePlan,
  workspaceRootLabelPlan,
  workspaceToolsetsPlan,
};
