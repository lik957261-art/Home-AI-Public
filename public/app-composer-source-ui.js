"use strict";

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

function normalizeComposerSearchSource(value) {
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
  const normalized = normalizeComposerSearchSource(source);
  return COMPOSER_SEARCH_SOURCE_OPTIONS.find((option) => option.source === normalized)
    || COMPOSER_SEARCH_SOURCE_OPTIONS[0];
}

function composerSearchSourceCommand(text = "") {
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

function selectedComposerSearchSourceInfo(text = getComposerText()) {
  const command = composerSearchSourceCommand(text);
  const option = command || composerSearchSourceOption(state.composerSearchSource);
  return Object.assign({}, option, {
    commandExplicit: Boolean(command),
    explicit: Boolean(command || option.source !== COMPOSER_SEARCH_SOURCE_LOCAL),
  });
}

function composerSearchSourceBodyFields(text = getComposerText()) {
  const info = selectedComposerSearchSourceInfo(text);
  if (info.source === COMPOSER_SEARCH_SOURCE_LOCAL) return null;
  return {
    search_source: info.source,
    source_intent: info.sourceIntent,
  };
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
  menu.innerHTML = COMPOSER_SEARCH_SOURCE_OPTIONS.map((option) => {
    const active = option.source === selected.source ? " active" : "";
    return `<button class="composer-source-option${active}" type="button" data-composer-source="${escapeHtml(option.source)}">
      <span class="composer-source-name">${escapeHtml(option.label)}</span>
      <small>${escapeHtml(option.description)}</small>
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
  state.composerSearchSource = normalizeComposerSearchSource(source);
  closeComposerSourceMenu();
  updateComposerSourceControl();
  renderComposerContext();
  $("messageInput")?.focus({ preventScroll: true });
}

function resetComposerSearchSource() {
  state.composerSearchSource = COMPOSER_SEARCH_SOURCE_LOCAL;
  closeComposerSourceMenu();
  updateComposerSourceControl();
}

function updateComposerSourceControl() {
  const button = $("composerSearchSource");
  if (!button) return;
  const searchMode = isChatSearchMode();
  const canUse = !searchMode && (state.viewMode === "single" || state.viewMode === "tasks");
  button.hidden = searchMode;
  button.disabled = !canUse;
  if (!canUse) closeComposerSourceMenu();
  const info = selectedComposerSearchSourceInfo();
  button.textContent = info.shortLabel;
  button.classList.toggle("active", info.source !== COMPOSER_SEARCH_SOURCE_LOCAL);
  button.setAttribute("aria-pressed", info.source !== COMPOSER_SEARCH_SOURCE_LOCAL ? "true" : "false");
  button.setAttribute("title", `\u672c\u53e5\u4fe1\u6e90\uff1a${info.label}`);
}
