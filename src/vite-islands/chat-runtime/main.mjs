import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import { createEditableFocusLifecycleGuard } from "../../vite-app/runtime/focus-lifecycle-guard.mjs";
import {
  buildChatRuntimeViewModel,
  initialChatRuntimeState,
} from "./model.mjs";
import {
  applyChatEventStreamRecord,
} from "./event-stream-adapter.mjs";
import {
  createChatEventSourceClient,
} from "./live-event-source-client.mjs";
import {
  applyOptimisticSendPlan,
  clearOptimisticSendPlan,
  createOptimisticSendPlan,
} from "./composer-model.mjs";
import {
  buildChatDetailViewModel,
} from "./chat-detail-model.mjs";
import {
  createComposerController,
} from "./composer-controller.mjs";
import {
  createChatThreadReadbackController,
} from "./thread-readback-controller.mjs";
import {
  uploadComposerFiles,
} from "./attachment-upload-client.mjs";
import {
  attachServerFileToComposer,
} from "./attachment-server-file-client.mjs";
import {
  addPendingArtifact,
  buildComposerAttachmentState,
  removePendingArtifact,
} from "./attachment-model.mjs";
import {
  createNativeShareIntakeController,
} from "./attachment-native-share-client.mjs";

const PREVIEW_VERSION = "20260702-vite-chat-runtime-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
let previewTransportClient = null;
let previewTransportSource = null;
let runtimeTransportClient = null;
let mountedTarget = null;
let mountSubscriptions = [];
let previewFocusGuard = null;
let nativeShareReceiverInstalled = false;

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-chat-runtime-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    selectedWorkspaceId: "owner",
    chatRuntimePreview: true,
  },
  attachClassicCompatibility: true,
});

const initialThread = Object.freeze({
  id: "thread_vite_chat_runtime_preview",
  workspaceId: "owner",
  singleWindow: true,
  status: "running",
  activeRunId: "run_preview_1",
  activeRunIds: ["run_preview_1"],
  updatedAt: "2026-07-02T09:00:00.000Z",
  messages: [
    {
      id: "msg_user_1",
      role: "user",
      status: "done",
      content: "帮我总结今天的衣橱建议。",
      createdAt: "2026-07-02T09:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z",
    },
    {
      id: "msg_assistant_1",
      role: "assistant",
      status: "running",
      runId: "run_preview_1",
      content: "",
      createdAt: "2026-07-02T09:00:01.000Z",
      updatedAt: "2026-07-02T09:00:01.000Z",
    },
  ],
});

const eventScript = Object.freeze([
  {
    id: "delta_1",
    label: "delta 1",
    frame: {
      data: JSON.stringify({
        type: "message.delta",
        threadId: "thread_vite_chat_runtime_preview",
        messageId: "msg_assistant_1",
        delta: "建议保留轻薄外套，",
        updatedAt: "2026-07-02T09:00:02.000Z",
        firstFeedbackAt: "2026-07-02T09:00:02.000Z",
      }),
    },
  },
  {
    id: "delta_2",
    label: "delta 2",
    frame: {
      data: JSON.stringify({
        type: "message.delta",
        threadId: "thread_vite_chat_runtime_preview",
        messageId: "msg_assistant_1",
        delta: "鞋子选择低帮款，方便步行。",
        updatedAt: "2026-07-02T09:00:04.000Z",
      }),
    },
  },
  {
    id: "terminal_message",
    label: "terminal message",
    frame: {
      data: JSON.stringify({
        type: "message",
        threadId: "thread_vite_chat_runtime_preview",
        message: {
          id: "msg_assistant_1",
          role: "assistant",
          status: "done",
          runId: "run_preview_1",
          content: "建议保留轻薄外套，鞋子选择低帮款，方便步行。",
          usage: { total_tokens: 640 },
          updatedAt: "2026-07-02T09:00:06.000Z",
        },
        thread: {
          id: "thread_vite_chat_runtime_preview",
          status: "done",
          activeRunId: "",
          activeRunIds: [],
          updatedAt: "2026-07-02T09:00:06.000Z",
        },
      }),
    },
  },
  {
    id: "thread_terminal",
    label: "thread.updated",
    frame: {
      data: JSON.stringify({
        type: "thread.updated",
        thread: {
          id: "thread_vite_chat_runtime_preview",
          status: "done",
          activeRunId: "",
          activeRunIds: [],
          updatedAt: "2026-07-02T09:00:07.000Z",
        },
      }),
    },
  },
  {
    id: "invalid_json",
    label: "bad frame",
    frame: {
      data: "{\"type\":\"message.delta\"",
    },
  },
]);

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-chat-runtime-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-chat-runtime-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function defaultRuntimeState() {
  return initialChatRuntimeState({ thread: initialThread });
}

function chatRuntimeState() {
  return runtime.state?.get?.().chatRuntimePreviewState || defaultRuntimeState();
}

function composerDraft() {
  return String(runtime.state?.get?.().chatRuntimePreviewComposerDraft || "");
}

function composerApiStatus() {
  return runtime.state?.get?.().chatRuntimePreviewComposerApiStatus || {
    status: "idle",
    message: "dev mock 未发送",
    source: "",
  };
}

function pendingArtifacts() {
  const value = runtime.state?.get?.().chatRuntimePreviewPendingArtifacts;
  return Array.isArray(value) ? value : [];
}

function nativeSharedFiles() {
  const value = runtime.state?.get?.().chatRuntimePreviewNativeSharedFiles;
  return Array.isArray(value) ? value : [];
}

function attachmentState() {
  return buildComposerAttachmentState({
    pendingArtifacts: pendingArtifacts(),
    uploadQueue: runtime.state?.get?.().chatRuntimePreviewUploadQueue || [],
    nativeSharedFiles: nativeSharedFiles(),
    workspaceId: "owner",
  });
}

function attachmentUploadStatus() {
  return runtime.state?.get?.().chatRuntimePreviewAttachmentUploadStatus || {
    status: "idle",
    message: "尚未上传",
    count: 0,
    error: "",
  };
}

function threadReadbackStatus() {
  return runtime.state?.get?.().chatRuntimePreviewThreadReadbackStatus || {
    status: "idle",
    message: "尚未回读",
    source: "",
    threadId: "",
    messageCount: 0,
    error: "",
  };
}

function setThreadReadbackStatus(status = {}) {
  const nextStatus = Object.freeze({
    status: String(status.status || "idle"),
    message: String(status.message || ""),
    source: String(status.source || ""),
    threadId: String(status.threadId || ""),
    messageCount: Number(status.messageCount || 0) || 0,
    error: String(status.error || ""),
  });
  runtime.state?.set?.({ chatRuntimePreviewThreadReadbackStatus: nextStatus });
  runtime.events?.emit?.("chat-runtime-preview:readback", nextStatus);
  return nextStatus;
}

function setAttachmentUploadStatus(status = {}) {
  const nextStatus = Object.freeze({
    status: String(status.status || "idle"),
    message: String(status.message || ""),
    count: Number(status.count || 0) || 0,
    error: String(status.error || ""),
  });
  runtime.state?.set?.({ chatRuntimePreviewAttachmentUploadStatus: nextStatus });
  runtime.events?.emit?.("chat-runtime-preview:attachments", nextStatus);
  return nextStatus;
}

function setPendingArtifacts(artifacts = [], detail = {}) {
  runtime.state?.set?.({ chatRuntimePreviewPendingArtifacts: artifacts });
  runtime.events?.emit?.("chat-runtime-preview:attachments", Object.assign({
    artifactCount: artifacts.length,
  }, detail));
}

function setNativeSharedFiles(files = [], detail = {}) {
  runtime.state?.set?.({ chatRuntimePreviewNativeSharedFiles: files });
  runtime.events?.emit?.("chat-runtime-preview:attachments", Object.assign({
    nativeShareCount: files.length,
  }, detail));
}

const nativeShareIntake = createNativeShareIntakeController({
  native: runtime.native,
  workspaceId: "owner",
  getFiles: nativeSharedFiles,
  setFiles: setNativeSharedFiles,
  onStatus(status) {
    if (!["received", "empty", "error", "cleared"].includes(status.status)) return;
    setAttachmentUploadStatus({
      status: status.status,
      message: status.message,
      count: status.receivedCount,
      error: status.code,
    });
  },
});

function setComposerApiStatus(status = {}) {
  const nextStatus = Object.freeze({
    status: String(status.status || "idle"),
    message: String(status.message || ""),
    source: String(status.source || ""),
    runId: String(status.runId || ""),
    error: String(status.error || ""),
  });
  runtime.state?.set?.({ chatRuntimePreviewComposerApiStatus: nextStatus });
  runtime.events?.emit?.("chat-runtime-preview:composer", nextStatus);
  return nextStatus;
}

function focusGuardStatus() {
  return runtime.state?.get?.().chatRuntimePreviewFocusGuardStatus || {
    installed: false,
    lastAction: "idle",
    lastBlurred: false,
    lastReason: "",
    lastForced: false,
  };
}

function setFocusGuardStatus(status = {}) {
  const nextStatus = Object.freeze({
    installed: Boolean(status.installed),
    lastAction: String(status.lastAction || "idle"),
    lastBlurred: Boolean(status.lastBlurred),
    lastReason: String(status.lastReason || ""),
    lastForced: Boolean(status.lastForced),
  });
  runtime.state?.set?.({ chatRuntimePreviewFocusGuardStatus: nextStatus });
  runtime.events?.emit?.("chat-runtime-preview:focus-guard", nextStatus);
  return nextStatus;
}

function setComposerDraft(text = "") {
  runtime.state?.set?.({ chatRuntimePreviewComposerDraft: String(text || "") });
  runtime.events?.emit?.("chat-runtime-preview:composer", {
    draftLength: String(text || "").trim().length,
  });
}

function setChatRuntimeState(nextState, eventDetail = {}) {
  runtime.state?.set?.({ chatRuntimePreviewState: nextState });
  runtime.events?.emit?.("chat-runtime-preview:state", eventDetail);
}

function transportStatus() {
  return runtime.state?.get?.().chatRuntimePreviewTransportStatus || {
    status: "disconnected",
    url: "",
    lastEventType: "",
  };
}

function setTransportStatus(status) {
  runtime.state?.set?.({ chatRuntimePreviewTransportStatus: status });
  runtime.events?.emit?.("chat-runtime-preview:transport", status);
}

function resetPreviewState() {
  setChatRuntimeState(defaultRuntimeState(), { action: "reset" });
  runtime.state?.set?.({
    chatRuntimePreviewComposerDraft: "请继续完善这段回复。",
    chatRuntimePreviewComposerApiStatus: {
      status: "idle",
      message: "dev mock 未发送",
      source: "",
    },
    chatRuntimePreviewPendingArtifacts: [],
    chatRuntimePreviewNativeSharedFiles: [],
    chatRuntimePreviewAttachmentUploadStatus: {
      status: "idle",
      message: "尚未上传",
      count: 0,
      error: "",
    },
    chatRuntimePreviewThreadReadbackStatus: {
      status: "idle",
      message: "尚未回读",
      source: "",
      threadId: "",
      messageCount: 0,
      error: "",
    },
    chatRuntimePreviewUploadQueue: [],
    chatRuntimePreviewAttachmentIndex: 0,
    chatRuntimePreviewFocusGuardStatus: {
      installed: Boolean(previewFocusGuard),
      lastAction: "reset",
      lastBlurred: false,
      lastReason: "",
      lastForced: false,
    },
    chatRuntimePreviewOptimisticSendToken: null,
    chatRuntimePreviewTransportStatus: {
      status: "disconnected",
      url: "",
      lastEventType: "reset",
    },
    chatRuntimePreviewTransportNextIndex: 0,
  });
}

function setChatRuntimeThread(nextThread, detail = {}) {
  const current = chatRuntimeState();
  setChatRuntimeState(initialChatRuntimeState(Object.assign({}, current, {
    latestEventType: detail.eventType || current.latestEventType,
    thread: nextThread,
    renderPatches: (current.renderPatches || []).concat(detail.patch ? [detail.patch] : []),
    refreshRequests: current.refreshRequests || [],
    runEvents: current.runEvents || [],
    diagnostics: current.diagnostics || [],
  })), detail);
}

function simulateComposerSend() {
  const text = composerDraft().trim();
  const current = chatRuntimeState();
  const attachments = attachmentState();
  const nextIndex = Number(runtime.state?.get?.().chatRuntimePreviewOptimisticSendIndex || 0) || 0;
  const plan = createOptimisticSendPlan({
    thread: current.thread,
    threadId: current.thread.id,
    text,
    pendingArtifacts: attachments.composerArtifacts,
    viewMode: "single",
    singleWindowMode: "task",
    baseId: `local_send_vite_${nextIndex + 1}`,
    nowIso: "2026-07-02T09:00:09.000Z",
    queuedAt: "2026-07-02T09:00:10.000Z",
    body: {
      taskGroupId: "",
    },
  });
  if (!plan.ok) {
    const diagnostic = { code: `composer_${plan.code || "send_unavailable"}` };
    setChatRuntimeState(initialChatRuntimeState(Object.assign({}, current, {
      latestEventType: "composer.optimistic_send",
      diagnostics: (current.diagnostics || []).concat(diagnostic),
    })), { action: "composer_optimistic_send", ok: false, diagnostic });
    return plan;
  }
  runtime.state?.set?.({
    chatRuntimePreviewComposerDraft: "",
    chatRuntimePreviewOptimisticSendIndex: nextIndex + 1,
    chatRuntimePreviewOptimisticSendToken: plan.token,
  });
  setChatRuntimeThread(applyOptimisticSendPlan(current.thread, plan), {
    action: "composer_optimistic_send",
    eventType: "composer.optimistic_send",
    patch: {
      type: "composer_optimistic_send",
      messageCount: plan.messages.length,
      tokenId: plan.token.localPendingSendId,
    },
  });
  return plan;
}

function clearPreviewOptimisticSend() {
  const current = chatRuntimeState();
  const token = runtime.state?.get?.().chatRuntimePreviewOptimisticSendToken;
  if (!token) return null;
  runtime.state?.set?.({ chatRuntimePreviewOptimisticSendToken: null });
  setChatRuntimeThread(clearOptimisticSendPlan(current.thread, token), {
    action: "composer_optimistic_clear",
    eventType: "composer.optimistic_clear",
    patch: {
      type: "composer_optimistic_clear",
      tokenId: token.localPendingSendId || "",
    },
  });
  return token;
}

function composerDevMockEnabled() {
  return String(browserRoot?.location?.pathname || "").startsWith("/vite-chat-runtime-preview/");
}

function createPreviewComposerController() {
  return createComposerController({
    api: runtime.api,
    source: "vite_chat_runtime_preview",
    timeoutMs: 30000,
    baseIdPrefix: "local_send_api_vite",
    getThread: () => chatRuntimeState().thread,
    setThread: setChatRuntimeThread,
    getDraft: composerDraft,
    setDraft: setComposerDraft,
    getPendingArtifacts: () => attachmentState().composerArtifacts,
    clearPendingArtifacts: () => setPendingArtifacts([], { action: "composer_dev_mock_send_consumed_attachments" }),
    getNextIndex: () => Number(runtime.state?.get?.().chatRuntimePreviewOptimisticSendIndex || 0) || 0,
    setNextIndex: (value) => runtime.state?.set?.({ chatRuntimePreviewOptimisticSendIndex: value }),
    setOptimisticToken: (token) => runtime.state?.set?.({ chatRuntimePreviewOptimisticSendToken: token || null }),
    nowIso: () => "2026-07-02T09:00:11.000Z",
    queuedAtIso: () => "2026-07-02T09:00:12.000Z",
    onStatus: setComposerApiStatus,
    statusMessages: {
      sending: "正在发送到 Vite dev mock",
      sent: "dev mock 已返回 thread/run readback",
      sendFailed: "dev mock 发送失败",
      blocked: "dev mock 发送不可用",
      stopping: "正在停止 Vite dev mock run",
      stopped: "dev mock run 已停止",
      interruptFailed: "dev mock 停止失败",
    },
    eventNames: {
      sendStarted: "composer.dev_mock_send_started",
      sendResult: "composer.dev_mock_send_result",
      sendError: "composer.dev_mock_send_error",
      interruptResult: "composer.dev_mock_interrupt_result",
    },
    patchTypes: {
      sendStarted: "composer_dev_mock_send_started",
      sendResult: "composer_dev_mock_send_result",
      sendError: "composer_dev_mock_send_error",
      interruptResult: "composer_dev_mock_interrupt_result",
    },
  });
}

function createPreviewThreadReadbackController() {
  return createChatThreadReadbackController({
    api: runtime.api,
    source: "vite_chat_runtime_preview",
    timeoutMs: 30000,
    messageLimit: 30,
    getState: chatRuntimeState,
    setState: setChatRuntimeState,
    onStatus: (status) => {
      const messageMap = {
        reading: "正在回读线程",
        read: "线程已回读",
        error: "线程回读失败",
        blocked: "线程回读不可用",
      };
      return setThreadReadbackStatus(Object.assign({}, status, {
        message: messageMap[status.status] || status.message,
      }));
    },
  });
}

async function readbackThreadFromDevMock() {
  if (!composerDevMockEnabled()) {
    return setThreadReadbackStatus({
      status: "blocked",
      message: "仅 /vite-chat-runtime-preview/ 开发路由允许回读线程。",
      error: "vite_dev_mock_route_required",
    });
  }
  const result = await createPreviewThreadReadbackController().readLatest({ messageLimit: 30 });
  return result.status;
}

function nativeShellFocusActive() {
  return Boolean(runtime.native?.isIosShell || runtime.native?.nativeShellParam?.() === "ios");
}

function ensurePreviewFocusGuard() {
  if (previewFocusGuard || typeof document === "undefined") return previewFocusGuard;
  previewFocusGuard = createEditableFocusLifecycleGuard({
    root: browserRoot,
    documentRef: document,
    isNativeShell: nativeShellFocusActive,
    getComposerInput: () => mountedTarget?.querySelector?.("[data-cr-composer-draft]") || null,
    getComposerContainer: () => mountedTarget?.querySelector?.(".cr-composer-preview") || null,
    onStatus: setFocusGuardStatus,
    onComposerBlur: () => runtime.state?.set?.({ chatRuntimePreviewComposerFocused: false }),
  });
  return previewFocusGuard;
}

function blurPreviewFocusedEditable(reason = "manual_focus_cleanup", options = {}) {
  return ensurePreviewFocusGuard()?.blur?.(reason, options) || null;
}

async function sendComposerToDevMock() {
  if (!composerDevMockEnabled()) {
    return setComposerApiStatus({
      status: "blocked",
      message: "仅 /vite-chat-runtime-preview/ 开发路由允许发送到 dev mock。",
      error: "vite_dev_mock_route_required",
    });
  }
  const result = await createPreviewComposerController().send({
    body: {
      taskGroupId: "",
      singleWindowMode: "task",
      messageLimit: 30,
    },
    workspaceId: "owner",
    notificationChannel: "web_push",
    viewMode: "single",
    singleWindowMode: "task",
  });
  return result.status;
}

async function interruptComposerDevMock() {
  if (!composerDevMockEnabled()) {
    return setComposerApiStatus({
      status: "blocked",
      message: "仅 /vite-chat-runtime-preview/ 开发路由允许停止 dev mock。",
      error: "vite_dev_mock_route_required",
    });
  }
  const result = await createPreviewComposerController().interrupt({ body: {} });
  return result.status;
}

function applyPreviewFrame(frame, detail = {}) {
  const result = applyChatEventStreamRecord(chatRuntimeState(), frame, {
    userScrollProtected: Boolean(runtime.state?.get?.().chatRuntimePreviewUserScrollProtected),
    nowIso: "2026-07-02T09:00:08.000Z",
  });
  const next = result.state;
  setChatRuntimeState(next, Object.assign({ action: "event_stream_frame" }, detail, {
    ok: result.ok,
    eventType: result.eventType,
  }));
  return next;
}

function applyPreviewEvent(eventId) {
  const item = eventScript.find((entry) => entry.id === eventId);
  if (!item) return chatRuntimeState();
  return applyPreviewFrame(item.frame || item.event, { action: "event", eventId });
}

function setUserScrollProtected(value) {
  runtime.state?.set?.({
    chatRuntimePreviewUserScrollProtected: Boolean(value),
  });
  runtime.events?.emit?.("chat-runtime-preview:scroll-protection", {
    active: Boolean(value),
  });
}

function createPreviewEventSource(url) {
  const source = {
    url,
    readyState: 0,
    onopen: null,
    onmessage: null,
    onerror: null,
    close() {
      source.readyState = 2;
    },
    emitOpen() {
      source.readyState = 1;
      if (typeof source.onopen === "function") source.onopen({ type: "open", url });
    },
    emitFrame(frame) {
      if (typeof source.onmessage === "function") source.onmessage(frame);
    },
    emitError(message = "preview reconnect") {
      source.readyState = 0;
      if (typeof source.onerror === "function") source.onerror({ type: "error", message });
    },
  };
  previewTransportSource = source;
  return source;
}

function applyTransportFrame(frame) {
  const result = applyChatEventStreamRecord(chatRuntimeState(), frame, {
    userScrollProtected: Boolean(runtime.state?.get?.().chatRuntimePreviewUserScrollProtected),
    nowIso: "2026-07-02T09:00:08.000Z",
  });
  setChatRuntimeState(result.state, {
    action: "transport_frame",
    ok: result.ok,
    eventType: result.eventType,
  });
  return result;
}

function previewEventSourceClient() {
  if (previewTransportClient) return previewTransportClient;
  previewTransportClient = createChatEventSourceClient({
    endpoint: "/api/events",
    clientVersion: PREVIEW_VERSION,
    eventSourceFactory: createPreviewEventSource,
    onStatus: setTransportStatus,
    applyFrame: applyTransportFrame,
  });
  return previewTransportClient;
}

function runtimeEventSourceClient() {
  if (runtimeTransportClient) return runtimeTransportClient;
  runtimeTransportClient = createChatEventSourceClient({
    endpoint: "/api/events",
    key: runtime.auth?.getAccessKey?.() || "",
    clientVersion: runtime.clientVersion?.() || PREVIEW_VERSION,
    eventSourceFactory(url) {
      return runtime.eventStream?.createEventSource?.(url, {
        source: "vite_chat_runtime_preview",
      });
    },
    onStatus: setTransportStatus,
    applyFrame: applyTransportFrame,
  });
  return runtimeTransportClient;
}

function startPreviewTransport() {
  runtimeTransportClient?.close?.("preview_transport_start");
  const result = previewEventSourceClient().start();
  previewTransportSource?.emitOpen?.();
  return result;
}

function startRuntimeTransport() {
  previewEventSourceClient().close("runtime_transport_start");
  previewTransportSource = null;
  return runtimeEventSourceClient().start({
    key: runtime.auth?.getAccessKey?.() || "",
    clientVersion: runtime.clientVersion?.() || PREVIEW_VERSION,
  });
}

function emitNextPreviewTransportFrame() {
  if (!previewTransportSource || previewTransportSource.readyState === 2) startPreviewTransport();
  const liveEvents = eventScript.filter((entry) => entry.id !== "invalid_json");
  const currentIndex = Number(runtime.state?.get?.().chatRuntimePreviewTransportNextIndex || 0) || 0;
  const item = liveEvents[currentIndex % liveEvents.length];
  runtime.state?.set?.({ chatRuntimePreviewTransportNextIndex: currentIndex + 1 });
  previewTransportSource?.emitFrame?.(item.frame || item.event);
  return item;
}

function errorPreviewTransport() {
  if (!previewTransportSource || previewTransportSource.readyState === 2) startPreviewTransport();
  previewTransportSource?.emitError?.("preview reconnect");
}

function closePreviewTransport() {
  runtimeTransportClient?.close?.("preview_close");
  return previewEventSourceClient().close("preview_close");
}

function badges(model) {
  return [
    ["事件", String(model.appliedEventCount)],
    ["消息", String(model.messageCount)],
    ["刷新", String(model.refreshRequestCount)],
  ].map(([label, value]) => `<span class="cr-badge"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`).join("");
}

function messageRows(model) {
  const detail = buildChatDetailViewModel({
    thread: chatRuntimeState().thread,
    composer: {
      enabled: true,
      text: composerDraft(),
      pendingArtifacts: attachmentState().composerArtifacts,
      activeRunIds: chatRuntimeState().thread.activeRunIds || [],
      singleWindowView: true,
    },
  });
  const rows = detail.rows.length ? detail.rows : model.messages;
  return rows.map((message) => `
    <li class="cr-message ${message.role} ${message.active ? "active" : ""} ${message.terminal ? "terminal" : ""}">
      <span class="cr-message-meta">${escapeHtml(message.role)} · ${escapeHtml(message.status || "unknown")} · ${escapeHtml(message.id)}</span>
      <p>${escapeHtml(message.contentPreview || "(空)")}</p>
      <small>${escapeHtml(message.contentLength ? `${message.contentLength} chars` : "no content")}</small>
    </li>
  `).join("");
}

function factRows(model) {
  const rows = [
    ["thread", model.threadId],
    ["latest event", model.latestEventType || "none"],
    ["latest patch", model.latestPatchType || "none"],
    ["latest refresh", model.latestRefreshReason || "none"],
    ["readback", threadReadbackStatus().status || "idle"],
    ["transport", transportStatus().status || "disconnected"],
    ["composer", buildChatDetailViewModel({
      thread: chatRuntimeState().thread,
      composer: {
        enabled: true,
        text: composerDraft(),
        pendingArtifacts: attachmentState().composerArtifacts,
        activeRunIds: chatRuntimeState().thread.activeRunIds || [],
        singleWindowView: true,
      },
    }).composer.mode],
    ["active messages", String(model.activeMessageCount)],
    ["terminal messages", String(model.terminalMessageCount)],
  ];
  return rows.map(([label, value]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join("");
}

function refreshRows(model) {
  if (!model.refreshRequests.length) return `<li class="cr-empty">暂无刷新请求</li>`;
  return model.refreshRequests.map((request) => `
    <li>
      <strong>${escapeHtml(request.reason)}</strong>
      <span>${request.stickToBottom ? "stick" : "no-stick"} · ${request.protectedByUserScroll ? "scroll protected" : "free"}</span>
    </li>
  `).join("");
}

function diagnosticRows(model) {
  if (!model.diagnostics.length) return `<li class="cr-empty">暂无诊断</li>`;
  return model.diagnostics.map((diagnostic) => `
    <li>
      <strong>${escapeHtml(diagnostic.code || "diagnostic")}</strong>
      <span>${escapeHtml(diagnostic.eventType || diagnostic.source || "event-stream")}</span>
    </li>
  `).join("");
}

function readbackPanel(model) {
  const status = threadReadbackStatus();
  const devMockEnabled = composerDevMockEnabled();
  return `
    <section class="cr-transport" aria-label="线程回读">
      <span>线程回读：${escapeHtml(status.status || "idle")}</span>
      <small>${escapeHtml(status.message || "尚未回读")}${status.messageCount ? ` · messages ${escapeHtml(String(status.messageCount))}` : ""}${status.error ? ` · ${escapeHtml(status.error)}` : ""}</small>
      <button type="button" class="cr-event-button secondary" data-cr-thread-readback ${!devMockEnabled ? "disabled" : ""}>回读线程</button>
      <small>刷新请求 ${escapeHtml(String(model.refreshRequestCount || 0))}</small>
    </section>
  `;
}

function eventButtons() {
  return eventScript.map((entry) => `
    <button type="button" class="cr-event-button" data-cr-event="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</button>
  `).join("");
}

function transportControls() {
  const status = transportStatus();
  return `
    <section class="cr-transport" aria-label="模拟 SSE 连接">
      <span>模拟 SSE：${escapeHtml(status.status || "disconnected")}</span>
      <small>${escapeHtml(status.url || "/api/events")}</small>
      <button type="button" class="cr-event-button secondary" data-cr-transport-start>启动模拟 SSE</button>
      <button type="button" class="cr-event-button secondary" data-cr-runtime-transport-start>启动 runtime SSE</button>
      <button type="button" class="cr-event-button secondary" data-cr-transport-next>推送下一帧</button>
      <button type="button" class="cr-event-button secondary" data-cr-transport-error>模拟重连</button>
      <button type="button" class="cr-event-button secondary" data-cr-transport-close>关闭</button>
    </section>
  `;
}

function attachmentRows() {
  const attachments = attachmentState();
  if (!attachments.rows.length) return `<li class="cr-empty">暂无已附加文件</li>`;
  return attachments.rows.map((artifact, index) => `
    <li class="cr-attachment-row doc-${escapeHtml(artifact.kind)}">
      <span class="cr-attachment-icon" aria-hidden="true"></span>
      <span>
        <strong>${escapeHtml(artifact.name)}</strong>
        <small>${escapeHtml(artifact.sourceLabel)} · ${escapeHtml(artifact.kind)}${artifact.sizeLabel ? ` · ${escapeHtml(artifact.sizeLabel)}` : ""}</small>
      </span>
      <button type="button" class="cr-event-button secondary" data-cr-attachment-remove="${escapeHtml(String(index))}">移除</button>
    </li>
  `).join("");
}

function attachmentNativeRows() {
  const attachments = attachmentState();
  if (!attachments.nativeSharedFiles.length) return "";
  return `
    <ul class="cr-attachment-native" aria-label="系统分享待处理文件">
      ${attachments.nativeSharedFiles.map((file) => `
        <li>${escapeHtml(file.name)}${file.pathLabel ? ` · ${escapeHtml(file.pathLabel)}` : ""}</li>
      `).join("")}
    </ul>
  `;
}

function attachmentPanel() {
  const attachments = attachmentState();
  const uploadStatus = attachmentUploadStatus();
  return `
    <section class="cr-attachment-preview" aria-label="附件 ESM 预览">
      <div class="cr-attachment-head">
        <div>
          <strong>附件 ESM：${escapeHtml(attachments.summary)}</strong>
          <small>${escapeHtml(attachments.status)} · artifacts ${escapeHtml(String(attachments.artifactCount))} · share ${escapeHtml(String(attachments.nativeShareCount))} · upload ${escapeHtml(String(attachments.uploadQueueCount))}</small>
        </div>
        <div class="cr-attachment-actions">
          <button type="button" class="cr-event-button secondary" data-cr-attachment-add-upload>模拟系统文件</button>
          <button type="button" class="cr-event-button secondary" data-cr-attachment-upload-selected>上传选择文件</button>
          <button type="button" class="cr-event-button secondary" data-cr-attachment-add-server>模拟服务器文件</button>
          <button type="button" class="cr-event-button secondary" data-cr-attachment-native-receive>收到系统分享</button>
          <button type="button" class="cr-event-button secondary" data-cr-attachment-native-attach ${attachments.canAttachNativeShare ? "" : "disabled"}>附加分享</button>
          <button type="button" class="cr-event-button secondary" data-cr-attachment-clear ${attachments.canClear ? "" : "disabled"}>清空</button>
        </div>
      </div>
      <label class="cr-attachment-file-picker">
        <span>开发文件</span>
        <input type="file" multiple data-cr-attachment-file-input>
      </label>
      ${attachmentNativeRows()}
      <ul class="cr-attachment-list">${attachmentRows()}</ul>
      <p class="cr-composer-status">upload：${escapeHtml(uploadStatus.status)} · ${escapeHtml(uploadStatus.message || "尚未上传")}${uploadStatus.error ? ` · ${escapeHtml(uploadStatus.error)}` : ""}</p>
      <p class="cr-composer-status">bounded evidence：${escapeHtml(attachments.boundedEvidence.join(" · "))}</p>
    </section>
  `;
}

function nextAttachmentIndex() {
  const current = Number(runtime.state?.get?.().chatRuntimePreviewAttachmentIndex || 0) || 0;
  runtime.state?.set?.({ chatRuntimePreviewAttachmentIndex: current + 1 });
  return current + 1;
}

function addMockSystemUploadArtifact() {
  const index = nextAttachmentIndex();
  const next = addPendingArtifact(pendingArtifacts(), {
    id: `artifact_upload_preview_${index}`,
    name: `vite-upload-${index}.md`,
    mime: "text/markdown",
    size: 2048 + index,
    source: "system_upload",
  });
  setPendingArtifacts(next, { action: "mock_system_upload" });
  return attachmentState();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("file_reader_unavailable"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("file_read_failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedFilesToDevMock(files = []) {
  if (!composerDevMockEnabled()) {
    return setAttachmentUploadStatus({
      status: "blocked",
      message: "仅 /vite-chat-runtime-preview/ 开发路由允许上传到 dev mock。",
      error: "vite_dev_mock_route_required",
    });
  }
  const selectedFiles = Array.from(files || []).filter(Boolean).slice(0, 20);
  if (!selectedFiles.length) {
    return setAttachmentUploadStatus({
      status: "empty",
      message: "未选择文件",
    });
  }
  runtime.state?.set?.({
    chatRuntimePreviewUploadQueue: selectedFiles.map((file, index) => ({
      id: `upload_queue_${index}_${file.name || "file"}`,
      name: file.name || `upload-${index + 1}.bin`,
      mime: file.type || "",
      size: file.size || 0,
      source: "upload_queue",
      status: "uploading",
    })),
  });
  setAttachmentUploadStatus({
    status: "uploading",
    message: `正在上传 ${selectedFiles.length} 个文件到 dev mock`,
    count: selectedFiles.length,
  });
  try {
    const result = await uploadComposerFiles({
      api: runtime.api,
      threadId: chatRuntimeState().thread.id,
      workspaceId: "owner",
      files: selectedFiles,
      readFileAsDataUrl,
      onProgress(event = {}) {
        if (event.status === "uploading") {
          setAttachmentUploadStatus({
            status: "uploading",
            message: `正在上传 ${event.filename || "文件"}`,
            count: selectedFiles.length,
          });
        }
      },
    });
    runtime.state?.set?.({ chatRuntimePreviewUploadQueue: [] });
    setPendingArtifacts(mergeAttachmentRows(pendingArtifacts(), result.artifacts), { action: "dev_mock_file_upload" });
    return setAttachmentUploadStatus({
      status: "uploaded",
      message: `dev mock 已上传 ${result.count} 个文件`,
      count: result.count,
    });
  } catch (error) {
    runtime.state?.set?.({ chatRuntimePreviewUploadQueue: [] });
    return setAttachmentUploadStatus({
      status: "error",
      message: "dev mock 上传失败",
      error: error?.code || error?.message || "upload_failed",
    });
  }
}

async function attachServerFileToDevMock() {
  if (!composerDevMockEnabled()) {
    return setAttachmentUploadStatus({
      status: "blocked",
      message: "仅 /vite-chat-runtime-preview/ 开发路由允许附加服务器文件。",
      error: "vite_dev_mock_route_required",
    });
  }
  setAttachmentUploadStatus({
    status: "attaching",
    message: "正在附加服务器文件到 dev mock",
  });
  try {
    const result = await attachServerFileToComposer({
      api: runtime.api,
      threadId: chatRuntimeState().thread.id,
      workspaceId: "owner",
      entry: {
        path: "/系统分享/HomeAI/vite-runbook.pdf",
        name: "vite-runbook.pdf",
      },
    });
    const next = addPendingArtifact(pendingArtifacts(), result.artifact);
    setPendingArtifacts(next, { action: "dev_mock_server_file_attach", requestPath: result.request.path });
    return setAttachmentUploadStatus({
      status: "attached",
      message: "dev mock 已附加服务器文件",
      count: 1,
    });
  } catch (error) {
    return setAttachmentUploadStatus({
      status: "error",
      message: "dev mock 服务器文件附加失败",
      error: error?.code || error?.message || "server_file_attach_failed",
    });
  }
}

function receiveMockNativeShare() {
  const result = nativeShareIntake.receive({
    files: [
      {
        path: "/系统分享/HomeAI/native-note.md",
        name: "native-note.md",
        workspaceId: "owner",
        mime: "text/markdown",
        size: 3072,
      },
      {
        path: "/系统分享/HomeAI/native-photo.jpg",
        name: "native-photo.jpg",
        workspaceId: "owner",
        mime: "image/jpeg",
        size: 12288,
      },
    ],
  }, {
    action: "mock_native_share_receive",
    source: "vite_chat_runtime_preview",
  });
  return result.files;
}

function attachNativeSharedFilesToPreview() {
  const artifacts = nativeShareIntake.attachArtifacts();
  if (!artifacts.length) return attachmentState();
  setPendingArtifacts(mergeAttachmentRows(pendingArtifacts(), artifacts), { action: "native_share_attach" });
  nativeShareIntake.clear({ action: "native_share_clear", source: "vite_chat_runtime_preview" });
  return attachmentState();
}

function mergeAttachmentRows(current, rows) {
  let next = current;
  for (const artifact of rows) next = addPendingArtifact(next, artifact);
  return next;
}

function removePreviewAttachment(index) {
  setPendingArtifacts(removePendingArtifact(pendingArtifacts(), index), { action: "remove_attachment" });
  return attachmentState();
}

function clearPreviewAttachments() {
  setPendingArtifacts([], { action: "clear_attachments" });
  nativeShareIntake.clear({ action: "clear_native_share", source: "vite_chat_runtime_preview" });
  return attachmentState();
}

function composerControls() {
  const detail = buildChatDetailViewModel({
    thread: chatRuntimeState().thread,
    composer: {
      enabled: true,
      text: composerDraft(),
      pendingArtifacts: attachmentState().composerArtifacts,
      activeRunIds: chatRuntimeState().thread.activeRunIds || [],
      singleWindowView: true,
    },
  });
  const composer = detail.composer;
  const apiStatus = composerApiStatus();
  const focusStatus = focusGuardStatus();
  const devMockEnabled = composerDevMockEnabled();
  const activeRunCount = Array.isArray(chatRuntimeState().thread.activeRunIds)
    ? chatRuntimeState().thread.activeRunIds.length
    : 0;
  return `
    <section class="cr-composer-preview" aria-label="Composer ESM 预览">
      <div>
        <strong>Composer ESM：${escapeHtml(composer.label)}</strong>
        <small>${escapeHtml(composer.mode)} · ${composer.disabled ? "不可发送" : "可操作"} · pending ${escapeHtml(String(detail.pendingCount))} · ${devMockEnabled ? "dev mock 可用" : "静态预览阻断真实发送"}</small>
      </div>
      <textarea data-cr-composer-draft rows="2" maxlength="500" placeholder="开发态草稿">${escapeHtml(composerDraft())}</textarea>
      <button type="button" class="cr-event-button secondary" data-cr-composer-send ${composer.disabled || composer.mode === "stop" || composer.mode === "search" ? "disabled" : ""}>模拟发送</button>
      <button type="button" class="cr-event-button secondary" data-cr-composer-api-send ${!devMockEnabled || composer.disabled || composer.mode !== "send" ? "disabled" : ""}>发送到 dev mock</button>
      <button type="button" class="cr-event-button secondary" data-cr-composer-api-stop ${!devMockEnabled || !activeRunCount ? "disabled" : ""}>停止 dev mock</button>
      <button type="button" class="cr-event-button secondary" data-cr-composer-clear>清除模拟发送</button>
      <button type="button" class="cr-event-button secondary" data-cr-focus-blur>清理焦点</button>
      <p class="cr-composer-status">${escapeHtml(apiStatus.status)} · ${escapeHtml(apiStatus.message || "dev mock 未发送")}${apiStatus.runId ? ` · ${escapeHtml(apiStatus.runId)}` : ""}</p>
      <p class="cr-composer-status">Focus guard：${focusStatus.installed ? "已启用" : "未启用"} · ${escapeHtml(focusStatus.lastAction || "idle")} · ${focusStatus.lastBlurred ? "已 blur" : "未 blur"}${focusStatus.lastReason ? ` · ${escapeHtml(focusStatus.lastReason)}` : ""}</p>
    </section>
    ${attachmentPanel()}
  `;
}

function renderShell(root) {
  const model = buildChatRuntimeViewModel(chatRuntimeState());
  const scrollProtected = Boolean(runtime.state?.get?.().chatRuntimePreviewUserScrollProtected);
  root.innerHTML = `
    <div class="homeai-vite-chat-runtime">
      <div class="cr-shell">
        <header class="cr-topbar">
          <div>
            <p class="cr-eyebrow">Vite island 开发预览</p>
            <h1 class="cr-title">Chat Runtime 事件模型</h1>
            <p class="cr-subtitle">模拟 SSE message.delta、terminal message 和 thread.updated。当前页面只使用注入式 fake EventSource，不发送消息，不替换 classic shell。</p>
          </div>
          <div class="cr-badges">${badges(model)}</div>
        </header>

        <section class="cr-controls" aria-label="事件模拟">
          ${eventButtons()}
          <button type="button" class="cr-event-button secondary" data-cr-scroll="${scrollProtected ? "0" : "1"}">${scrollProtected ? "关闭滚动保护" : "开启滚动保护"}</button>
          <button type="button" class="cr-event-button secondary" data-cr-reset>重置</button>
        </section>
        ${transportControls()}
        ${composerControls()}
        ${readbackPanel(model)}

        <main class="cr-grid">
          <section class="cr-card">
            <h2>消息流</h2>
            <ol class="cr-messages">${messageRows(model)}</ol>
          </section>
          <section class="cr-card">
            <h2>状态证据</h2>
            <dl class="cr-facts">${factRows(model)}</dl>
            <h3>刷新请求</h3>
            <ul class="cr-refresh">${refreshRows(model)}</ul>
            <h3>事件诊断</h3>
            <ul class="cr-refresh">${diagnosticRows(model)}</ul>
          </section>
        </main>
      </div>
    </div>
  `;
  installStyles(root);
  previewFocusGuard?.blur?.("render");
}

function wire(root) {
  root.querySelectorAll("[data-cr-event]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPreviewEvent(button.dataset.crEvent || "");
      renderShell(root);
      wire(root);
    });
  });
  root.querySelector("[data-cr-scroll]")?.addEventListener("click", (event) => {
    setUserScrollProtected(event.currentTarget?.dataset?.crScroll === "1");
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-reset]")?.addEventListener("click", () => {
    resetPreviewState();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-transport-start]")?.addEventListener("click", () => {
    startPreviewTransport();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-runtime-transport-start]")?.addEventListener("click", () => {
    startRuntimeTransport();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-transport-next]")?.addEventListener("click", () => {
    emitNextPreviewTransportFrame();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-transport-error]")?.addEventListener("click", () => {
    errorPreviewTransport();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-transport-close]")?.addEventListener("click", () => {
    closePreviewTransport();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-thread-readback]")?.addEventListener("click", async () => {
    await readbackThreadFromDevMock();
    renderShell(root);
    wire(root);
  });
  const draftInput = root.querySelector("[data-cr-composer-draft]");
  draftInput?.addEventListener("input", () => {
    setComposerDraft(draftInput.value || "");
    const actionButton = root.querySelector("[data-cr-composer-send]");
    const detail = buildChatDetailViewModel({
      thread: chatRuntimeState().thread,
      composer: {
        enabled: true,
        text: composerDraft(),
        pendingArtifacts: attachmentState().composerArtifacts,
        activeRunIds: chatRuntimeState().thread.activeRunIds || [],
        singleWindowView: true,
      },
    });
    if (actionButton) actionButton.disabled = detail.composer.disabled || detail.composer.mode !== "send";
    const apiSendButton = root.querySelector("[data-cr-composer-api-send]");
    if (apiSendButton) {
      apiSendButton.disabled = !composerDevMockEnabled() || detail.composer.disabled || detail.composer.mode !== "send";
    }
  });
  root.querySelector("[data-cr-composer-send]")?.addEventListener("click", () => {
    simulateComposerSend();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-composer-api-send]")?.addEventListener("click", async () => {
    await sendComposerToDevMock();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-composer-api-stop]")?.addEventListener("click", async () => {
    await interruptComposerDevMock();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-composer-clear]")?.addEventListener("click", () => {
    clearPreviewOptimisticSend();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-focus-blur]")?.addEventListener("click", () => {
    blurPreviewFocusedEditable("manual_focus_cleanup", { force: true });
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-add-upload]")?.addEventListener("click", () => {
    addMockSystemUploadArtifact();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-upload-selected]")?.addEventListener("click", async () => {
    const input = root.querySelector("[data-cr-attachment-file-input]");
    await uploadSelectedFilesToDevMock(input?.files || []);
    if (input) input.value = "";
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-add-server]")?.addEventListener("click", async () => {
    await attachServerFileToDevMock();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-native-receive]")?.addEventListener("click", () => {
    receiveMockNativeShare();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-native-attach]")?.addEventListener("click", () => {
    attachNativeSharedFilesToPreview();
    renderShell(root);
    wire(root);
  });
  root.querySelector("[data-cr-attachment-clear]")?.addEventListener("click", () => {
    clearPreviewAttachments();
    renderShell(root);
    wire(root);
  });
  root.querySelectorAll("[data-cr-attachment-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      removePreviewAttachment(button.dataset.crAttachmentRemove || "");
      renderShell(root);
      wire(root);
    });
  });
}

function rerenderMountedTarget() {
  if (!mountedTarget) return;
  renderShell(mountedTarget);
  wire(mountedTarget);
}

function installMountSubscriptions(root) {
  for (const unsubscribe of mountSubscriptions) {
    if (typeof unsubscribe === "function") unsubscribe();
  }
  mountedTarget = root;
  mountSubscriptions = [
    runtime.events?.on?.("chat-runtime-preview:state", rerenderMountedTarget),
    runtime.events?.on?.("chat-runtime-preview:transport", rerenderMountedTarget),
    runtime.events?.on?.("chat-runtime-preview:composer", rerenderMountedTarget),
    runtime.events?.on?.("chat-runtime-preview:attachments", rerenderMountedTarget),
    runtime.events?.on?.("chat-runtime-preview:readback", rerenderMountedTarget),
  ].filter(Boolean);
}

function ensureNativeShareReceiver() {
  if (nativeShareReceiverInstalled) return true;
  const result = nativeShareIntake.install({ source: "vite_chat_runtime_mount" });
  nativeShareReceiverInstalled = Boolean(result.ok);
  return result.ok;
}

export function mount(target = document.querySelector("[data-homeai-vite-chat-runtime]")) {
  if (!target) return null;
  installStyles(target);
  if (!runtime.state?.get?.().chatRuntimePreviewState) resetPreviewState();
  ensureNativeShareReceiver();
  installMountSubscriptions(target);
  ensurePreviewFocusGuard()?.install?.();
  renderShell(target);
  wire(target);
  return {
    refresh() {
      renderShell(target);
      wire(target);
    },
    applyEvent(eventId) {
      applyPreviewEvent(eventId);
      renderShell(target);
      wire(target);
    },
    reset() {
      resetPreviewState();
      renderShell(target);
      wire(target);
    },
    dispose() {
      for (const unsubscribe of mountSubscriptions) {
        if (typeof unsubscribe === "function") unsubscribe();
      }
      mountSubscriptions = [];
      if (mountedTarget === target) mountedTarget = null;
      previewFocusGuard?.dispose?.();
    },
  };
}

browserRoot.HomeAIViteChatRuntimePreview = Object.freeze({
  mount,
  applyEvent: applyPreviewEvent,
  eventScript,
  modelPreview: (state = chatRuntimeState()) => buildChatRuntimeViewModel(state),
  reset: resetPreviewState,
  runtimeSnapshot: () => runtime.snapshot(),
  applyFrame: (frame) => applyChatEventStreamRecord(chatRuntimeState(), frame),
  applyFrameToState: applyPreviewFrame,
  composerDraft,
  setComposerDraft,
  simulateComposerSend,
  sendComposerToDevMock,
  interruptComposerDevMock,
  readbackThreadFromDevMock,
  composerApiStatus,
  threadReadbackStatus,
  attachmentState,
  attachmentUploadStatus,
  pendingArtifacts,
  nativeSharedFiles,
  addMockSystemUploadArtifact,
  uploadSelectedFilesToDevMock,
  attachServerFileToDevMock,
  receiveMockNativeShare,
  receiveNativeSharePayload: nativeShareIntake.receive,
  installNativeShareReceiver: ensureNativeShareReceiver,
  attachNativeSharedFilesToPreview,
  removePreviewAttachment,
  clearPreviewAttachments,
  focusGuardStatus,
  blurPreviewFocusedEditable,
  clearOptimisticSend: clearPreviewOptimisticSend,
  startTransport: startPreviewTransport,
  startRuntimeTransport,
  emitTransportFrame: emitNextPreviewTransportFrame,
  errorTransport: errorPreviewTransport,
  closeTransport: closePreviewTransport,
  transportStatus,
});

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  } else {
    mount();
  }
}
