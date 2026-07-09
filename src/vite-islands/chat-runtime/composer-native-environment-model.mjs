const CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION = "20260704-vite-chat-composer-native-environment-model-v1";
const DEFAULT_NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateFromInput(input = {}) {
  const nowMs = Number(input.nowMs);
  if (Number.isFinite(nowMs)) return new Date(nowMs);
  const nowIso = cleanString(input.nowIso, 80);
  if (nowIso) {
    const parsed = new Date(nowIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function nativeEnvironmentBridgeAvailabilityPlan(input = {}) {
  const nativeShell = input.nativeShellQuery === "ios"
    || input.documentNativeShell === "ios"
    || input.documentNativeShellClass === true
    || input.storageNativeShell === "ios";
  const enabled = input.capabilityEnvironmentContext === true
    || input.capabilityNativeEnvironmentContext === true
    || input.documentNativeEnvironmentContext === "1"
    || input.storageNativeEnvironmentContext === "1"
    || input.hasGetContext === true;
  const hasGetContext = input.hasGetContext === true;
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    available: Boolean(nativeShell && enabled && hasGetContext),
    nativeShell: Boolean(nativeShell),
    enabled: Boolean(enabled),
    hasGetContext,
  });
}

function nativeEnvironmentContextTargetAtPlan(input = {}) {
  const value = cleanString(input.text, 240000);
  const target = dateFromInput(input);
  if (/(?:\u540e\u5929|day after tomorrow)/i.test(value)) {
    target.setDate(target.getDate() + 2);
  } else if (/(?:\u660e\u5929|tomorrow)/i.test(value)) {
    target.setDate(target.getDate() + 1);
  }
  if (/(?:\u65e9\u4e0a|\u65e9\u6668|\u4e0a\u5348|morning)/i.test(value)) {
    target.setHours(9, 0, 0, 0);
  } else if (/(?:\u4e2d\u5348|\u5348\u996d|noon)/i.test(value)) {
    target.setHours(12, 0, 0, 0);
  } else if (/(?:\u4e0b\u5348|afternoon)/i.test(value)) {
    target.setHours(15, 0, 0, 0);
  } else if (/(?:\u665a\u4e0a|\u4eca\u665a|\u660e\u665a|evening|tonight)/i.test(value)) {
    target.setHours(19, 0, 0, 0);
  }
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    targetAt: target.toISOString(),
  });
}

function nativeEnvironmentContextPurposePlan(input = {}) {
  const body = isObject(input.body) ? input.body : {};
  const taskGroupId = cleanString(body.taskGroupId, 180);
  const text = cleanString(input.text, 240000);
  if (taskGroupId === "plugin:wardrobe" || /(?:\bwardrobe\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d|\u914d\u4e00?\u5957|\u7a7f\u4ec0\u4e48)/i.test(text)) {
    return Object.freeze({
      version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
      purpose: "wardrobe_outfit",
    });
  }
  if (/(?:\bweather\b|\bforecast\b|\u5929\u6c14|\u9884\u62a5|\u6e29\u5ea6|\u964d\u96e8|\u51fa\u95e8|\u8fd0\u52a8)/i.test(text)) {
    return Object.freeze({
      version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
      purpose: "general_environment",
    });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    purpose: "",
  });
}

function createNativeEnvironmentContextRequestPlan(input = {}) {
  const purpose = nativeEnvironmentContextPurposePlan(input).purpose;
  if (!purpose) {
    return Object.freeze({
      version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
      shouldRequest: false,
      purpose: "",
      targetAt: "",
      request: null,
    });
  }
  const targetAt = nativeEnvironmentContextTargetAtPlan(input).targetAt;
  const request = Object.freeze({
    targetAt,
    forceRefresh: false,
    precise: false,
    purpose,
  });
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    shouldRequest: true,
    purpose,
    targetAt,
    request,
  });
}

function nativeEnvironmentSnapshotRefreshPlan(input = {}) {
  const forceUpload = input.forceUpload === true || input.force === true;
  const lastUploadedAt = finiteNumber(input.lastUploadedAt, 0);
  const nowMs = finiteNumber(input.nowMs, Date.now());
  const intervalMs = Math.max(1, finiteNumber(
    input.intervalMs,
    DEFAULT_NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS,
  ));
  if (input.inFlight === true) {
    return Object.freeze({
      version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
      shouldRefresh: false,
      forceUpload,
      reason: "in_flight",
    });
  }
  if (!forceUpload && lastUploadedAt > 0 && nowMs - lastUploadedAt < intervalMs) {
    return Object.freeze({
      version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
      shouldRefresh: false,
      forceUpload,
      reason: "throttled",
    });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    shouldRefresh: true,
    forceUpload,
    reason: forceUpload ? "force_upload" : "due",
  });
}

function nativeEnvironmentSnapshotUploadBodyPlan(input = {}) {
  const context = isObject(input.context) ? input.context : {};
  const purpose = cleanString(context.purpose || input.purpose || "model_tool_snapshot", 120) || "model_tool_snapshot";
  const body = {
    workspaceId: cleanString(input.workspaceId || "owner", 160) || "owner",
    deviceId: cleanString(input.deviceId || "native-ios-current", 160) || "native-ios-current",
    environmentContext: Object.assign({}, context, { purpose }),
  };
  return Object.freeze({
    version: CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
    body: Object.freeze(body),
    serializedBody: JSON.stringify(body),
  });
}

export {
  CHAT_COMPOSER_NATIVE_ENVIRONMENT_MODEL_VERSION,
  DEFAULT_NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS,
  createNativeEnvironmentContextRequestPlan,
  nativeEnvironmentBridgeAvailabilityPlan,
  nativeEnvironmentContextPurposePlan,
  nativeEnvironmentContextTargetAtPlan,
  nativeEnvironmentSnapshotRefreshPlan,
  nativeEnvironmentSnapshotUploadBodyPlan,
};
