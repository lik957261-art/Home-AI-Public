"use strict";

const NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
let nativeEnvironmentSnapshotRefreshInFlight = null;
let nativeEnvironmentSnapshotLastUploadedAt = 0;
let nativeEnvironmentSnapshotAutoRefreshInstalled = false;

function nativeEnvironmentContextBridgeAvailable() {
  try {
    const capability = window.HomeAINativeEnvironmentCapability || {};
    const bridge = window.HomeAINativeEnvironment || {};
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search || "");
    const nativeShell = params.get("nativeShell") === "ios"
      || root?.dataset?.nativeShell === "ios"
      || root?.classList?.contains("native-shell-ios")
      || localStorage.getItem("homeAI.nativeShell") === "ios";
    const enabled = capability.environmentContext === true
      || capability.nativeEnvironmentContext === true
      || root?.dataset?.nativeEnvironmentContext === "1"
      || localStorage.getItem("homeAI.nativeEnvironmentContext") === "1"
      || typeof bridge.getContext === "function";
    return Boolean(nativeShell && enabled && typeof bridge.getContext === "function");
  } catch (_) {
    return false;
  }
}

function nativeEnvironmentContextTargetAt(text = "") {
  const value = String(text || "");
  const now = new Date();
  const target = new Date(now.getTime());
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
  return target.toISOString();
}

function nativeEnvironmentContextPurpose(body = {}, text = "") {
  const taskGroupId = String(body.taskGroupId || "");
  if (taskGroupId === "plugin:wardrobe" || /(?:\bwardrobe\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d|\u914d\u4e00?\u5957|\u7a7f\u4ec0\u4e48)/i.test(text)) {
    return "wardrobe_outfit";
  }
  if (/(?:\bweather\b|\bforecast\b|\u5929\u6c14|\u9884\u62a5|\u6e29\u5ea6|\u964d\u96e8|\u51fa\u95e8|\u8fd0\u52a8)/i.test(text)) {
    return "general_environment";
  }
  return "";
}

async function requestNativeEnvironmentContextForSend(body = {}, text = "") {
  if (!nativeEnvironmentContextBridgeAvailable()) return null;
  const purpose = nativeEnvironmentContextPurpose(body, text);
  if (!purpose) return null;
  const request = {
    targetAt: nativeEnvironmentContextTargetAt(text),
    forceRefresh: false,
    precise: false,
    purpose,
  };
  const bridgePromise = window.HomeAINativeEnvironment.getContext(request);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), 1200);
  });
  try {
    const context = await Promise.race([bridgePromise, timeoutPromise]);
    if (!context || typeof context !== "object") return null;
    return Object.assign({}, context, {
      purpose,
      targetAt: context.targetAt || request.targetAt,
    });
  } catch (_) {
    return null;
  }
}

function nativeEnvironmentSnapshotWorkspaceId() {
  try {
    return state?.selectedWorkspaceId || "owner";
  } catch (_) {
    return "owner";
  }
}

async function refreshNativeEnvironmentSnapshotForSend(options = {}) {
  if (!nativeEnvironmentContextBridgeAvailable()) return null;
  const forceUpload = options.forceUpload === true || options.force === true;
  const now = Date.now();
  if (!forceUpload && nativeEnvironmentSnapshotLastUploadedAt > 0
    && now - nativeEnvironmentSnapshotLastUploadedAt < NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS) {
    return null;
  }
  if (nativeEnvironmentSnapshotRefreshInFlight) return nativeEnvironmentSnapshotRefreshInFlight;
  const bridgePromise = window.HomeAINativeEnvironment.getContext({
    forceRefresh: options.forceRefresh === true,
    precise: false,
    purpose: options.purpose || "model_tool_snapshot",
  });
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), 1200);
  });
  nativeEnvironmentSnapshotRefreshInFlight = (async () => {
    const context = await Promise.race([bridgePromise, timeoutPromise]);
    if (!context || typeof context !== "object") return null;
    const body = {
      workspaceId: nativeEnvironmentSnapshotWorkspaceId(),
      deviceId: "native-ios-current",
      environmentContext: Object.assign({}, context, { purpose: context.purpose || options.purpose || "model_tool_snapshot" }),
    };
    await api("/api/native/environment-context", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 2500,
    });
    nativeEnvironmentSnapshotLastUploadedAt = Date.now();
    return context;
  })();
  try {
    return await nativeEnvironmentSnapshotRefreshInFlight;
  } catch (_) {
    return null;
  } finally {
    nativeEnvironmentSnapshotRefreshInFlight = null;
  }
}

function scheduleNativeEnvironmentSnapshotRefresh(reason = "scheduled", options = {}) {
  setTimeout(() => {
    refreshNativeEnvironmentSnapshotForSend(Object.assign({
      reason,
      forceRefresh: false,
      forceUpload: false,
      purpose: "model_tool_snapshot",
    }, options)).catch(() => {});
  }, 0);
}

function installNativeEnvironmentSnapshotAutoRefresh() {
  if (nativeEnvironmentSnapshotAutoRefreshInstalled) return;
  nativeEnvironmentSnapshotAutoRefreshInstalled = true;
  window.addEventListener("homeai:native-environment-refresh", (event) => {
    scheduleNativeEnvironmentSnapshotRefresh("native_event", {
      forceRefresh: false,
      forceUpload: true,
      purpose: event?.detail?.purpose || "model_tool_snapshot",
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleNativeEnvironmentSnapshotRefresh("visible");
    }
  });
  window.addEventListener("focus", () => {
    scheduleNativeEnvironmentSnapshotRefresh("focus");
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      scheduleNativeEnvironmentSnapshotRefresh("foreground_interval");
    }
  }, NATIVE_ENVIRONMENT_SNAPSHOT_REFRESH_INTERVAL_MS);
  scheduleNativeEnvironmentSnapshotRefresh("script_loaded", { forceUpload: true });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    installNativeEnvironmentSnapshotAutoRefresh();
  } catch (_) {
    // Ignore native environment snapshot refresh setup failures on non-native clients.
  }
}
