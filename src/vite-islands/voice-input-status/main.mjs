import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import {
  CANCELLABLE_STATUSES,
  buildVoiceStatusViewModel,
  normalizeNativeStatus,
} from "./model.mjs";
import {
  createVoiceInputSessionController,
  createVoiceSessionState,
} from "./session-controller.mjs";
import {
  VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION,
  voiceAudioCaptureReadiness,
} from "./audio-capture-adapter.mjs";

const PREVIEW_VERSION = "20260702-vite-voice-input-status-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-voice-input-status-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    selectedWorkspaceId: "owner",
    voiceInputStatusPreview: true,
  },
  attachClassicCompatibility: true,
});
let voiceSessionController = null;

function PreviewRecorder() {}
PreviewRecorder.isTypeSupported = (type) => type === "audio/webm;codecs=opus";

function PreviewAudioContext() {}

function audioCaptureReadinessPreview() {
  return voiceAudioCaptureReadiness({
    mediaDevices: { getUserMedia: () => null },
    recorderCtor: PreviewRecorder,
    audioContextCtor: PreviewAudioContext,
    serviceStatus: {
      provider: {
        streaming: {
          configured: true,
          sampleRate: 16000,
        },
      },
    },
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-voice-status-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-voice-status-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function initialVoiceState() {
  const now = Date.now();
  return createVoiceSessionState({
    status: "pending",
    statusDetail: "等待长按阈值",
    panelOpenedAt: now,
    pressStartedAt: now,
    statusUpdatedAt: now,
    target: { kind: "native" },
  }, now);
}

function runtimeVoice() {
  const state = runtime.state?.get?.() || {};
  return state.voiceInputStatusPreviewState || initialVoiceState();
}

function setRuntimeVoice(nextVoice) {
  runtime.state?.set?.({
    voiceInputStatusPreviewState: nextVoice,
  });
  runtime.events?.emit?.("voice-input-status-preview:update", {
    status: nextVoice.status,
  });
}

function ensureVoiceSessionController() {
  if (voiceSessionController) return voiceSessionController;
  voiceSessionController = createVoiceInputSessionController({
    initialState: runtimeVoice(),
    now: () => Date.now(),
    setTimer: (fn, ms) => browserRoot.setTimeout?.(fn, ms),
    clearTimer: (id) => browserRoot.clearTimeout?.(id),
    onChange: (state, effects = {}) => {
      setRuntimeVoice(Object.assign({}, state, {
        lastSessionEffect: effects.action || "",
      }));
    },
  });
  return voiceSessionController;
}

function nextVoiceStatus(status) {
  const normalized = normalizeNativeStatus(status);
  const now = Date.now();
  const previous = runtimeVoice();
  const next = Object.assign({}, previous, {
    status: normalized,
    statusUpdatedAt: now,
    statusDetail: "",
    error: "",
  });
  if (normalized === "pending") {
    next.statusDetail = "等待长按阈值";
    next.panelOpenedAt = now;
    next.pressStartedAt = now;
  }
  if (normalized === "recording") {
    next.recordingStartedAt = now - 2300;
    next.statusCache = { provider: { backend: "local-asr" } };
  }
  if (normalized === "transcribing") {
    next.partialCount = Math.max(1, Number(next.partialCount || 0) + 1);
    next.voiceSessionId = "voice_preview_session_12345678";
  }
  if (normalized === "failed") {
    next.error = "语音输入失败";
  }
  ensureVoiceSessionController().applyStatus(next);
}

function cancelVoiceStatus() {
  ensureVoiceSessionController().cancel("语音手势已取消");
}

function beginVoiceSessionPreview() {
  ensureVoiceSessionController().beginPress({ target: { kind: "native-preview" } });
}

function releaseVoiceSessionPreview() {
  ensureVoiceSessionController().releasePress();
}

function triggerLongPressPreview() {
  ensureVoiceSessionController().triggerLongPress();
}

function expirePendingGuardPreview() {
  const controller = ensureVoiceSessionController();
  const voice = controller.snapshot();
  const startedAt = Number(voice.panelOpenedAt || voice.pressStartedAt || Date.now()) || Date.now();
  setRuntimeVoice(Object.assign({}, voice, {
    panelOpenedAt: startedAt - 2000,
    pressStartedAt: startedAt - 2000,
    statusUpdatedAt: startedAt - 2000,
  }));
  voiceSessionController = null;
  ensureVoiceSessionController().evaluateTimeouts();
}

function autoHidePreview() {
  const controller = ensureVoiceSessionController();
  const voice = controller.snapshot();
  setRuntimeVoice(Object.assign({}, voice, {
    terminalHideAt: Date.now() - 1,
  }));
  voiceSessionController = null;
  ensureVoiceSessionController().evaluateTimeouts();
}

function stateButtons(activeStatus) {
  return [
    ["pending", "等待长按"],
    ["recording", "录音中"],
    ["transcribing", "转写中"],
    ["inserted", "已插入"],
    ["cancelled", "已取消"],
    ["failed", "失败"],
  ].map(([status, label]) => `
    <button
      type="button"
      class="vis-state${status === activeStatus ? " active" : ""}"
      data-vis-status="${escapeHtml(status)}"
      aria-pressed="${status === activeStatus ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `).join("");
}

function renderShell(root, voice = runtimeVoice()) {
  const model = buildVoiceStatusViewModel(voice, {
    expanded: true,
    debug: true,
  });
  const audioReadiness = audioCaptureReadinessPreview();
  const effect = voice.lastSessionEffect || "idle";
  root.innerHTML = `
    <div class="homeai-vite-voice-status">
      <div class="vis-shell">
        <header class="vis-topbar">
          <div>
            <p class="vis-eyebrow">Vite island 开发预览</p>
            <h1 class="vis-title">语音输入状态</h1>
            <p class="vis-subtitle">预览长按录音的状态面板、取消入口和 pending 超时规则。当前页面不调用麦克风，不替换 classic shell。</p>
          </div>
          <div class="vis-badges">
            <span class="vis-badge">${escapeHtml(runtime.mode || "vite-preview")}</span>
            <span class="vis-badge ${model.canCancel ? "ok" : "muted"}">${model.canCancel ? "可取消" : "不可取消"}</span>
          </div>
        </header>

        <section class="vis-panel" aria-label="语音状态预览">
          <div class="vis-overlay ${model.busy ? "busy" : ""} ${model.recording ? "recording" : ""} ${model.terminal ? "terminal" : ""}" aria-label="${escapeHtml(model.label)}">
            <span class="vis-mic" aria-hidden="true"></span>
            <span class="vis-copy">
              <strong>${escapeHtml(model.label)}</strong>
              <span>${escapeHtml(model.detail)}</span>
              <small>${escapeHtml(model.meta || "metadata-only preview")}</small>
            </span>
            <button type="button" class="vis-cancel" data-vis-cancel${model.canCancel ? "" : " hidden"}>取消</button>
          </div>

          <div class="vis-state-row" role="group" aria-label="状态切换">
            ${stateButtons(model.status)}
          </div>

          <div class="vis-state-row" role="group" aria-label="手势生命周期">
            <button type="button" class="vis-state" data-vis-action="begin">开始长按</button>
            <button type="button" class="vis-state" data-vis-action="longpress">达到阈值</button>
            <button type="button" class="vis-state" data-vis-action="release">松手</button>
            <button type="button" class="vis-state" data-vis-action="expire">pending 超时</button>
            <button type="button" class="vis-state" data-vis-action="autohide">自动隐藏</button>
          </div>

          <dl class="vis-facts">
            <div><dt>状态</dt><dd><code>${escapeHtml(model.status)}</code></dd></div>
            <div><dt>pending 保护</dt><dd>${model.pendingGuardMs ? `${model.pendingGuardMs}ms` : "无"}</dd></div>
            <div><dt>自动隐藏</dt><dd>${model.terminalHideMs ? `${model.terminalHideMs}ms` : "无"}</dd></div>
            <div><dt>超时结果</dt><dd>${model.pendingGuard.shouldCancel ? escapeHtml(model.pendingGuard.reason) : "未触发"}</dd></div>
            <div><dt>session</dt><dd><code>${escapeHtml(effect)}</code></dd></div>
            <div><dt>音频捕获 ESM</dt><dd>${audioReadiness.ready ? "fixture ready" : "fixture blocked"} · ${escapeHtml(audioReadiness.mimeType || "no mime")}</dd></div>
            <div><dt>adapter</dt><dd><code>${escapeHtml(VOICE_INPUT_AUDIO_CAPTURE_ADAPTER_VERSION)}</code></dd></div>
          </dl>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

function wire(root) {
  root.querySelectorAll("[data-vis-status]").forEach((button) => {
    button.addEventListener("click", () => {
      nextVoiceStatus(button.dataset.visStatus || "pending");
      renderShell(root);
      wire(root);
    });
  });
  root.querySelector("[data-vis-cancel]")?.addEventListener("click", () => {
    cancelVoiceStatus();
    renderShell(root);
    wire(root);
  });
  root.querySelectorAll("[data-vis-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.visAction || "";
      if (action === "begin") beginVoiceSessionPreview();
      else if (action === "longpress") triggerLongPressPreview();
      else if (action === "release") releaseVoiceSessionPreview();
      else if (action === "expire") expirePendingGuardPreview();
      else if (action === "autohide") autoHidePreview();
      renderShell(root);
      wire(root);
    });
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-voice-status]")) {
  if (!target) return null;
  installStyles(target);
  if (!runtime.state?.get?.().voiceInputStatusPreviewState) {
    setRuntimeVoice(initialVoiceState());
  }
  ensureVoiceSessionController();
  renderShell(target);
  wire(target);
  return {
    refresh() {
      renderShell(target);
      wire(target);
    },
    setStatus(status) {
      nextVoiceStatus(status);
      renderShell(target);
      wire(target);
    },
    cancel() {
      cancelVoiceStatus();
      renderShell(target);
      wire(target);
    },
    beginPress() {
      beginVoiceSessionPreview();
      renderShell(target);
      wire(target);
    },
    releasePress() {
      releaseVoiceSessionPreview();
      renderShell(target);
      wire(target);
    },
    triggerLongPress() {
      triggerLongPressPreview();
      renderShell(target);
      wire(target);
    },
    expirePendingGuard() {
      expirePendingGuardPreview();
      renderShell(target);
      wire(target);
    },
    autoHide() {
      autoHidePreview();
      renderShell(target);
      wire(target);
    },
  };
}

browserRoot.HomeAIViteVoiceInputStatusPreview = Object.freeze({
  mount,
  cancellableStatuses: CANCELLABLE_STATUSES,
  modelPreview: (voice = runtimeVoice(), options = {}) => buildVoiceStatusViewModel(voice, options),
  sessionSnapshot: () => ensureVoiceSessionController().snapshot(),
  audioCaptureReadiness: audioCaptureReadinessPreview,
  beginPress: beginVoiceSessionPreview,
  releasePress: releaseVoiceSessionPreview,
  triggerLongPress: triggerLongPressPreview,
  expirePendingGuard: expirePendingGuardPreview,
  autoHide: autoHidePreview,
  runtimeSnapshot: () => runtime.snapshot(),
});

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  } else {
    mount();
  }
}
