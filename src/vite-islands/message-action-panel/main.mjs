import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import { buildMessageActionPanelViewModel } from "./model.mjs";
import {
  MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
  applyWardrobeOutfitWearActionResult,
  executeWardrobeOutfitWearAction,
} from "./action-client.mjs";

const PREVIEW_VERSION = "20260702-vite-message-action-panel-dev-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;
const ACTION_EXECUTION_ENABLED = Boolean(import.meta.env?.DEV);

const previewMessageFixtures = Object.freeze([
  {
    id: "assistant_ready",
    role: "assistant",
    content: "今天建议穿 OUT-001 和 SHOE-001。",
    usage: { total_tokens: 1240, model: "gpt-5", provider: "openai" },
    pluginActions: {
      wardrobeOutfitWearIntent: {
        kind: "outfit_wear_intent",
        status: "ready",
        executable: true,
        intent: {
          wear_date: "2026-07-02",
          items: [
            { role: "Outer", code: "OUT-001" },
            { role: "Footwear", code: "SHOE-001" },
          ],
        },
      },
    },
  },
  {
    id: "assistant_stored",
    role: "assistant",
    content: "这套已经写入衣橱穿着记录。",
    usage: { total_tokens: 880, model: "gpt-5" },
    pluginActions: {
      wardrobeOutfitWearIntent: {
        kind: "outfit_wear_intent",
        status: "stored",
        executable: false,
        outfitId: "777",
        readbackVerified: true,
        intent: {
          wear_date: "2026-07-02",
          items: [{ role: "Outer", code: "OUT-001" }],
        },
      },
    },
  },
  {
    id: "assistant_missing",
    role: "assistant",
    content: "这条建议没有可执行 intent。",
    pluginActionDiagnostics: {
      wardrobeOutfitWearIntent: {
        code: "intent_metadata_missing",
        reason: "prepare_tool_output_not_attached",
      },
    },
  },
]);
const previewMessageStore = new Map(previewMessageFixtures.map((message) => [
  message.id,
  JSON.parse(JSON.stringify(message)),
]));
const previewMessages = Object.freeze(previewMessageFixtures.map((message) => Object.freeze(Object.assign({}, message))));

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-message-action-panel-preview",
  clientVersion: PREVIEW_VERSION,
  appState: {
    selectedWorkspaceId: "owner",
    messageActionPanelPreview: true,
    messageActionPanelPreviewMessageId: previewMessages[0].id,
    messageActionPanelLastStatus: {
      level: "info",
      text: ACTION_EXECUTION_ENABLED
        ? "开发预览使用 Vite dev mock，不写入真实 Wardrobe 数据。"
        : "构建预览保持只读，避免误触真实 Wardrobe 写入。",
    },
  },
  attachClassicCompatibility: true,
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-message-action-panel-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-message-action-panel-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function selectedMessage() {
  const state = runtime.state?.get?.() || {};
  const id = String(state.messageActionPanelPreviewMessageId || previewMessages[0].id);
  return previewMessageStore.get(id) || previewMessageStore.get(previewMessages[0].id) || previewMessages[0];
}

function setSelectedMessage(messageId) {
  runtime.state?.set?.({
    messageActionPanelPreviewMessageId: String(messageId || previewMessages[0].id),
  });
  runtime.events?.emit?.("message-action-panel-preview:message-selected", {
    messageId: String(messageId || ""),
  });
}

function actionStatusClass(status = "") {
  if (status === "ready") return "ready";
  if (status === "stored") return "stored";
  if (status === "needs_confirmation") return "warning";
  if (status === "blocked" || status === "error") return "blocked";
  return "muted";
}

function previewStatus() {
  const state = runtime.state?.get?.() || {};
  const status = state.messageActionPanelLastStatus || {};
  return {
    level: String(status.level || "info"),
    text: String(status.text || (
      ACTION_EXECUTION_ENABLED
        ? "开发预览使用 Vite dev mock，不写入真实 Wardrobe 数据。"
        : "构建预览保持只读，避免误触真实 Wardrobe 写入。"
    )),
    detail: String(status.detail || ""),
  };
}

function setPreviewStatus(level, text, detail = "") {
  runtime.state?.set?.({
    messageActionPanelLastStatus: {
      level: String(level || "info"),
      text: String(text || ""),
      detail: String(detail || ""),
    },
  });
  runtime.events?.emit?.("message-action-panel-preview:status", {
    level: String(level || "info"),
    text: String(text || ""),
    detail: String(detail || ""),
  });
}

function actionButtons(actions = [], model = {}) {
  const readOnly = Boolean(model.readOnly);
  if (!actions.length) return `<li class="map-empty">没有可渲染动作</li>`;
  return actions.map((action) => `
    <li>
      <button
        type="button"
        class="map-action ${escapeHtml(actionStatusClass(action.status))}"
        data-map-action-kind="${escapeHtml(action.kind)}"
        data-map-action-status="${escapeHtml(action.status)}"
        data-map-action-label="${escapeHtml(action.label)}"
        title="${escapeHtml(action.detail || action.label)}"
        aria-label="${escapeHtml(action.detail || action.label)}"
        ${action.enabled && !readOnly ? "data-map-action-execute=\"wardrobe-outfit-wear\"" : ""}
        ${action.enabled && !readOnly ? "" : "disabled"}
      >
        <svg class="map-action-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 7.5 12 4l4 3.5"></path>
          <path d="M6.5 8.5 9 7l3 2 3-2 2.5 1.5L16 20H8L6.5 8.5Z"></path>
          <path d="M10 20v-7"></path>
          <path d="M14 20v-7"></path>
        </svg>
      </button>
    </li>
  `).join("");
}

function evidenceRows(model) {
  const rows = [
    ["消息", model.messageId],
    ["角色", model.role],
    ["执行模式", model.actionExecutionEnabled ? "dev mock" : "只读"],
    ["Usage", model.usage.visible ? model.usage.label : "未收集"],
  ];
  if (model.wardrobe.visible) {
    rows.push(["衣橱状态", model.wardrobe.status]);
    rows.push(["件数", String(model.wardrobe.itemCount || 0)]);
    rows.push(["确认", model.wardrobe.actionRequiresConfirmation ? "需要" : "不需要"]);
    if (model.wardrobe.itemCodes.length) rows.push(["Item codes", model.wardrobe.itemCodes.join(", ")]);
  }
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function messageTabs(activeId) {
  return previewMessages.map((message) => `
    <button
      type="button"
      class="map-tab${message.id === activeId ? " active" : ""}"
      data-map-message-id="${escapeHtml(message.id)}"
      aria-pressed="${message.id === activeId ? "true" : "false"}"
    >${escapeHtml(message.id.replace(/^assistant_/, ""))}</button>
  `).join("");
}

function renderShell(root, message = selectedMessage()) {
  const model = buildMessageActionPanelViewModel(message, { actionExecutionEnabled: ACTION_EXECUTION_ENABLED });
  const status = previewStatus();
  root.innerHTML = `
    <div class="homeai-vite-message-action-panel">
      <div class="map-shell">
        <header class="map-topbar">
          <div>
            <p class="map-eyebrow">Vite island 开发预览</p>
            <h1 class="map-title">消息动作面板</h1>
            <p class="map-subtitle">预览 Usage 附近的消息动作执行状态。dev server 只调用 Vite mock；构建预览只读，不执行真实 MCP，不替换生产根 shell。</p>
          </div>
          <div class="map-badges">
            <span class="map-badge">${escapeHtml(runtime.mode || "vite-preview")}</span>
            <span class="map-badge ok">${ACTION_EXECUTION_ENABLED ? "dev action mock" : "built read-only"}</span>
          </div>
        </header>

        <nav class="map-tabs" aria-label="消息样例">
          ${messageTabs(model.messageId)}
        </nav>

        <section class="map-message" aria-label="消息动作预览">
          <article class="map-card">
            <p class="map-preview">${escapeHtml(model.textPreview || "(无文本预览)")}</p>
            <div class="map-footer">
              ${model.usage.visible ? `<span class="map-usage">${escapeHtml(model.usage.label)}</span>` : ""}
              <ul class="map-actions">${actionButtons(model.actions, model)}</ul>
            </div>
            <p class="map-status ${escapeHtml(status.level)}" data-map-action-status-text>${escapeHtml(status.text)}${status.detail ? ` · ${escapeHtml(status.detail)}` : ""}</p>
          </article>
          <article class="map-card">
            <h2>边界证据</h2>
            <dl class="map-facts">${evidenceRows(model)}</dl>
          </article>
        </section>
      </div>
    </div>
  `;
  installStyles(root);
}

async function executeWardrobeAction(root, messageId) {
  if (!ACTION_EXECUTION_ENABLED) {
    setPreviewStatus("warning", "构建预览保持只读，请使用 npm run dev:vite 验证 action mock。");
    renderShell(root);
    wire(root);
    return null;
  }
  const message = previewMessageStore.get(String(messageId || "")) || selectedMessage();
  const model = buildMessageActionPanelViewModel(message, { actionExecutionEnabled: ACTION_EXECUTION_ENABLED });
  const confirmReplace = model.wardrobe.status === "needs_confirmation";
  setPreviewStatus("working", confirmReplace ? "正在确认替换并写入..." : "正在 dry-run 入库检查...");
  renderShell(root, message);
  wire(root);
  try {
    const execution = await executeWardrobeOutfitWearAction({
      runtime,
      threadId: MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID,
      workspaceId: "owner",
      message,
      confirmReplace,
      mode: confirmReplace ? "replace" : "create_only",
    });
    const nextMessage = applyWardrobeOutfitWearActionResult(message, execution.result);
    previewMessageStore.set(String(nextMessage.id || message.id), nextMessage);
    const nextStatus = String(execution.actionState?.status || "");
    if (nextStatus === "needs_confirmation") {
      setPreviewStatus("warning", "需要确认替换。再次点击“确认替换”会走 replace mock。", execution.result?.requestEcho?.mode || "create_only");
    } else if (nextStatus === "stored") {
      const outfitId = String(execution.actionState?.outfitId || execution.actionState?.outfit_id || "");
      setPreviewStatus("ok", "已完成 dev mock 写入并回读。", outfitId ? `outfit ${outfitId}` : "");
    } else if (execution.ok) {
      setPreviewStatus("ok", "动作请求完成。", nextStatus || "ok");
    } else {
      setPreviewStatus("error", "动作请求失败。", execution.result?.error || nextStatus || "unknown");
    }
  } catch (error) {
    setPreviewStatus("error", "动作请求失败。", error?.code || error?.message || "unknown");
    runtime.feedback?.error?.(error, { source: "vite-message-action-panel-preview" });
  } finally {
    renderShell(root);
    wire(root);
  }
}

function wire(root) {
  root.querySelectorAll("[data-map-message-id]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedMessage(button.dataset.mapMessageId || "");
      renderShell(root);
      wire(root);
    });
  });
  root.querySelectorAll("[data-map-action-execute=\"wardrobe-outfit-wear\"]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      await executeWardrobeAction(root, selectedMessage().id);
    });
  });
}

export function mount(target = document.querySelector("[data-homeai-vite-message-action-panel]")) {
  if (!target) return null;
  installStyles(target);
  renderShell(target);
  wire(target);
  return {
    refresh() {
      renderShell(target);
      wire(target);
    },
    selectMessage(messageId) {
      setSelectedMessage(messageId);
      renderShell(target);
      wire(target);
    },
  };
}

browserRoot.HomeAIViteMessageActionPanelPreview = Object.freeze({
  mount,
  modelPreview: (message = selectedMessage(), options = {}) => buildMessageActionPanelViewModel(message, options),
  previewMessages,
  executeWardrobeAction: (messageId = selectedMessage().id) => executeWardrobeAction(
    document.querySelector("[data-homeai-vite-message-action-panel]"),
    messageId,
  ),
  runtimeSnapshot: () => runtime.snapshot(),
});

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  } else {
    mount();
  }
}
