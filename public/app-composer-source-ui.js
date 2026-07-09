"use strict";

const CHAT_COMPOSER_SOURCE_MODEL_ESM_PATH = "/vite-islands/chat-composer-source-model/chat-composer-source-model.js";
let chatComposerSourceModel = null;
let chatComposerSourceModelPromise = null;

function importChatComposerSourceModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerSourceModel) return Promise.resolve(chatComposerSourceModel);
  if (!chatComposerSourceModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerSourceModel === "function"
      ? rootRef.__homeAiImportChatComposerSourceModel
      : (path) => import(path);
    chatComposerSourceModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_SOURCE_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerSourceModel = model || null;
        return chatComposerSourceModel;
      })
      .catch((error) => {
        chatComposerSourceModelPromise = null;
        throw error;
      });
  }
  return chatComposerSourceModelPromise;
}

function currentChatComposerSourceModel() {
  return chatComposerSourceModel;
}

if (typeof window !== "undefined") {
  importChatComposerSourceModel().catch(() => null);
}

const COMPOSER_SEARCH_SOURCE_LOCAL = "local";
const COMPOSER_SEARCH_SOURCE_OPTIONS = Object.freeze([
  Object.freeze({
    source: COMPOSER_SEARCH_SOURCE_LOCAL,
    sourceIntent: "local_data",
    label: "\u672c\u5730\u6570\u636e",
    shortLabel: "\u672c\u5730",
    description: "\u4f7f\u7528\u5f53\u524d\u804a\u5929\u548c\u5de5\u4f5c\u533a\u4e0a\u4e0b\u6587",
  }),
  Object.freeze({
    source: "web",
    sourceIntent: "web_search",
    label: "\u7f51\u7edc\u641c\u7d22",
    shortLabel: "\u7f51\u7edc",
    description: "\u5148\u67e5\u516c\u5171\u7f51\u9875\u4fe1\u606f",
  }),
  Object.freeze({
    source: "x",
    sourceIntent: "x_search",
    label: "X \u641c\u7d22",
    shortLabel: "X",
    description: "\u5148\u67e5 X \u4e0a\u7684\u516c\u5171\u5185\u5bb9",
  }),
]);
const COMPOSER_SEARCH_SOURCE_VISIBLE_OPTIONS = Object.freeze(
  COMPOSER_SEARCH_SOURCE_OPTIONS.filter((option) => option.source !== COMPOSER_SEARCH_SOURCE_LOCAL),
);

function normalizeComposerSearchSource(value) {
  const model = currentChatComposerSourceModel();
  if (typeof model?.normalizeComposerSearchSourceValue === "function") {
    return model.normalizeComposerSearchSourceValue(value);
  }
  const raw = String(value || "").trim().toLowerCase().replace(/[\s_\-:：]+/g, "");
  if (raw === "web"
    || raw === "websearch"
    || raw === "network"
    || raw === "internet"
    || raw === "online"
    || raw === "\u7f51\u7edc"
    || raw === "\u7f51\u7edc\u641c\u7d22"
    || raw === "\u7f51\u9875"
    || raw === "\u8054\u7f51") return "web";
  if (raw === "x"
    || raw === "xsearch"
    || raw === "twitter"
    || raw === "twittersearch"
    || raw === "\u0078\u641c\u7d22"
    || raw === "\u63a8\u7279") return "x";
  return COMPOSER_SEARCH_SOURCE_LOCAL;
}

function composerSearchSourceOption(source) {
  const model = currentChatComposerSourceModel();
  if (typeof model?.composerSearchSourceOptionPlan === "function") {
    return model.composerSearchSourceOptionPlan({
      source,
      options: COMPOSER_SEARCH_SOURCE_OPTIONS,
    });
  }
  const normalized = normalizeComposerSearchSource(source);
  return COMPOSER_SEARCH_SOURCE_OPTIONS.find((option) => option.source === normalized)
    || COMPOSER_SEARCH_SOURCE_OPTIONS[0];
}

function composerSearchSourceCommand(text = "") {
  const model = currentChatComposerSourceModel();
  if (typeof model?.composerSearchSourceCommandPlan === "function") {
    return model.composerSearchSourceCommandPlan({
      text,
      options: COMPOSER_SEARCH_SOURCE_OPTIONS,
    });
  }
  const value = String(text || "").replace(/\u00a0/g, " ");
  if (!value.trim()) return null;
  const boundary = "(?=$|[\\s)\\]}\\u3000\\uff09\\uff3d\\u3011\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])";
  const prefix = "(^|[\\s([{\\u3000\\uff08\\uff3b\\u3010\\uff0c,.;:!?\\uFF0C\\u3002\\uFF1B\\uFF1A\\uFF01\\uFF1F\\u3001])[#\\uff03]\\s*";
  const patterns = [
    { source: "x", pattern: new RegExp(`${prefix}(?:x|twitter|\\u63a8\\u7279)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i") },
    { source: "web", pattern: new RegExp(`${prefix}(?:web|internet|online|\\u7f51\\u7edc|\\u7f51\\u9875|\\u8054\\u7f51)\\s*(?:\\u641c\\u7d22|\\u641c|search)?${boundary}`, "i") },
    { source: "local", pattern: new RegExp(`${prefix}(?:local|default|\\u672c\\u5730|\\u672c\\u5730\\u6570\\u636e|\\u9ed8\\u8ba4)\\s*(?:data|\\u6570\\u636e)?${boundary}`, "i") },
  ];
  const match = patterns.find((item) => item.pattern.test(value));
  return match ? composerSearchSourceOption(match.source) : null;
}

function composerSearchSourceAutoHint(text = "") {
  const model = currentChatComposerSourceModel();
  if (typeof model?.composerSearchSourceAutoHintPlan === "function") {
    return model.composerSearchSourceAutoHintPlan({
      text,
      options: COMPOSER_SEARCH_SOURCE_OPTIONS,
    });
  }
  const value = String(text || "").replace(/\u00a0/g, " ");
  if (!value.trim()) return null;
  const patterns = [
    {
      source: "x",
      pattern: /(?:\b(?:on|from|search|check|look\s+up)\s+(?:x|twitter)\b|\b(?:x|twitter)\s+(?:search|posts?|discussion|thread|timeline|public)\b|(?:\u5728|\u53bb|\u4ece)?\s*(?:X|x|Twitter|twitter|\u63a8\u7279)\s*(?:\u4e0a|\u91cc|\u5e73\u53f0)?\s*(?:\u641c|\u641c\u7d22|\u67e5|\u67e5\u627e|\u627e|\u770b\u770b|\u770b\u4e00\u4e0b)|(?:\u641c|\u641c\u7d22|\u67e5|\u67e5\u627e|\u627e)\s*(?:\u4e00\u4e0b)?\s*(?:X|x|Twitter|twitter|\u63a8\u7279)\s*(?:\u4e0a|\u91cc|\u5e73\u53f0)?)/i,
    },
    {
      source: "web",
      pattern: /(?:\b(?:search|check|look\s+up)\s+(?:the\s+)?(?:web|internet|online)\b|\b(?:web|internet|online)\s+search\b|(?:\u7f51\u4e0a|\u7f51\u7edc|\u7f51\u9875|\u8054\u7f51|\u516c\u5171\u7f51\u9875)\s*(?:\u641c|\u641c\u7d22|\u67e5|\u67e5\u627e|\u6838\u5bf9|\u627e|\u770b\u770b|\u770b\u4e00\u4e0b)|(?:\u641c|\u641c\u7d22|\u67e5|\u67e5\u627e|\u6838\u5bf9)\s*(?:\u4e00\u4e0b)?\s*(?:\u7f51\u4e0a|\u7f51\u7edc|\u7f51\u9875|\u8054\u7f51|\u516c\u5171\u7f51\u9875))/i,
    },
  ];
  const match = patterns.find((item) => item.pattern.test(value));
  return match ? composerSearchSourceOption(match.source) : null;
}

function selectedComposerSearchSourceInfo(text = getComposerText()) {
  const model = currentChatComposerSourceModel();
  if (typeof model?.selectedComposerSearchSourceInfoPlan === "function") {
    return model.selectedComposerSearchSourceInfoPlan({
      text,
      manualSource: state.composerSearchSource,
      options: COMPOSER_SEARCH_SOURCE_OPTIONS,
    });
  }
  const manual = composerSearchSourceOption(state.composerSearchSource);
  const manualExplicit = manual.source !== COMPOSER_SEARCH_SOURCE_LOCAL;
  const auto = manualExplicit ? null : (composerSearchSourceCommand(text) || composerSearchSourceAutoHint(text));
  const option = manualExplicit ? manual : (auto || manual);
  const autoDetected = Boolean(auto && option.source !== COMPOSER_SEARCH_SOURCE_LOCAL);
  const mode = manualExplicit ? "manual" : (autoDetected ? "auto" : "local");
  return Object.assign({}, option, {
    commandExplicit: Boolean(auto),
    explicit: Boolean(manualExplicit || autoDetected),
    manualExplicit,
    autoDetected,
    sourceMode: mode,
  });
}

function composerSearchSourceBodyFields(text = getComposerText()) {
  void text;
  return null;
}

function composerSearchSourceIconHtml(source) {
  if (normalizeComposerSearchSource(source) === "x") {
    return `<span class="composer-source-x-icon" aria-hidden="true">X</span>`;
  }
  return `<svg class="composer-source-web-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    <circle cx="12" cy="12" r="8"></circle>
    <path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"></path>
  </svg>`;
}

function closeComposerSourceMenu() {
  const menu = $("composerSourceMenu");
  state.composerSourceMenuOpen = false;
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = "";
  }
}

function renderComposerSourceMenu() {
  const menu = $("composerSourceMenu");
  if (!menu) return;
  if (!state.composerSourceMenuOpen) {
    closeComposerSourceMenu();
    return;
  }
  const selected = selectedComposerSearchSourceInfo();
  menu.hidden = false;
  menu.innerHTML = COMPOSER_SEARCH_SOURCE_VISIBLE_OPTIONS.map((option) => {
    const active = option.source === selected.source && selected.manualExplicit ? " active" : "";
    return `<button class="composer-source-option${active}" type="button" data-composer-source="${escapeHtml(option.source)}">
      <span class="composer-source-option-icon">${composerSearchSourceIconHtml(option.source)}</span>
      <span class="composer-source-name">${escapeHtml(option.label)}</span>
    </button>`;
  }).join("");
}

function toggleComposerSourceMenu() {
  if (isChatSearchMode()) {
    closeComposerSourceMenu();
    return;
  }
  state.composerSourceMenuOpen = !state.composerSourceMenuOpen;
  if (state.composerSourceMenuOpen) closeGroupMentionMenu();
  renderComposerSourceMenu();
}

function chooseComposerSearchSource(source) {
  const model = currentChatComposerSourceModel();
  const plan = typeof model?.chooseComposerSearchSourcePlan === "function"
    ? model.chooseComposerSearchSourcePlan({
      currentSource: state.composerSearchSource,
      source,
    })
    : null;
  const normalized = normalizeComposerSearchSource(source);
  state.composerSearchSource = plan?.nextSource || (state.composerSearchSource === normalized
    ? COMPOSER_SEARCH_SOURCE_LOCAL
    : normalized);
  closeComposerSourceMenu();
  updateComposerSourceControl();
  renderComposerContext();
}

function resetComposerSearchSource() {
  state.composerSearchSource = COMPOSER_SEARCH_SOURCE_LOCAL;
  closeComposerSourceMenu();
  updateComposerSourceControl();
}

function updateComposerSourceControl() {
  const control = $("composerSearchSource");
  if (!control) return;
  const searchMode = isChatSearchMode();
  const canUse = !searchMode && (state.viewMode === "single" || state.viewMode === "tasks");
  const info = selectedComposerSearchSourceInfo();
  const model = currentChatComposerSourceModel();
  const controlPlan = typeof model?.composerSourceControlPlan === "function"
    ? model.composerSourceControlPlan({
      searchMode,
      viewMode: state.viewMode,
      info,
    })
    : {
      hidden: searchMode,
      canUse,
      active: info.manualExplicit,
      autoDetected: info.autoDetected,
      title: info.autoDetected
        ? `\u5df2\u81ea\u52a8\u8bc6\u522b\u672c\u53e5\u4fe1\u6e90\uff1a${info.label}`
        : `\u672c\u53e5\u4fe1\u6e90\uff1a${info.label}`,
    };
  control.hidden = controlPlan.hidden;
  control.setAttribute("aria-disabled", controlPlan.canUse ? "false" : "true");
  if (!controlPlan.canUse) closeComposerSourceMenu();
  control.classList.toggle("active", controlPlan.active);
  control.classList.toggle("auto-detected", controlPlan.autoDetected);
  control.setAttribute("title", controlPlan.title);
  control.querySelectorAll("[data-composer-source-toggle]").forEach((button) => {
    const source = normalizeComposerSearchSource(button.dataset.composerSourceToggle);
    const option = composerSearchSourceOption(source);
    const buttonPlan = typeof model?.composerSourceToggleButtonPlan === "function"
      ? model.composerSourceToggleButtonPlan({
        source,
        info,
        option,
        canUse: controlPlan.canUse,
      })
      : {
        disabled: !controlPlan.canUse,
        active: source === info.source && info.manualExplicit,
        autoDetected: source === info.source && info.autoDetected,
        ariaPressed: source === info.source && info.manualExplicit ? "true" : "false",
        title: source === info.source && info.manualExplicit
          ? `\u5df2\u9009\u4e2d${option.label}\uff0c\u518d\u70b9\u56de\u5230\u672c\u5730\u6570\u636e`
          : (source === info.source && info.autoDetected
            ? `\u5df2\u4ece\u6587\u672c\u81ea\u52a8\u8bc6\u522b${option.label}\uff1b\u70b9\u51fb\u540e\u6539\u4e3a\u624b\u52a8\u9501\u5b9a`
            : `\u672c\u53e5\u4f7f\u7528${option.label}`),
      };
    button.disabled = buttonPlan.disabled;
    button.classList.toggle("active", buttonPlan.active);
    button.classList.toggle("auto-detected", buttonPlan.autoDetected);
    button.setAttribute("aria-pressed", buttonPlan.ariaPressed);
    button.setAttribute("title", buttonPlan.title);
  });
}
