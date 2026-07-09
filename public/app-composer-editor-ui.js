"use strict";

const CHAT_COMPOSER_EDITOR_MODEL_ESM_PATH = "/vite-islands/chat-composer-editor-model/chat-composer-editor-model.js";
let chatComposerEditorModel = null;
let chatComposerEditorModelPromise = null;

function importChatComposerEditorModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerEditorModel) return Promise.resolve(chatComposerEditorModel);
  if (!chatComposerEditorModelPromise) {
    const importer = typeof rootRef.__homeAiImportComposerEditorModel === "function"
      ? rootRef.__homeAiImportComposerEditorModel
      : (path) => import(path);
    chatComposerEditorModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_EDITOR_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerEditorModel = model || null;
        return chatComposerEditorModel;
      })
      .catch((error) => {
        chatComposerEditorModelPromise = null;
        throw error;
      });
  }
  return chatComposerEditorModelPromise;
}

function currentChatComposerEditorModel() {
  return chatComposerEditorModel;
}

importChatComposerEditorModel().catch(() => null);

function getComposerText() {
  const input = $("messageInput");
  const text = input && "value" in input ? input.value : input?.innerText;
  const model = currentChatComposerEditorModel();
  if (typeof model?.normalizeComposerText === "function") return model.normalizeComposerText(text || "");
  return String(text || "").replace(/\u00a0/g, " ");
}

function utf8ByteLength(text) {
  const model = currentChatComposerEditorModel();
  if (typeof model?.utf8ByteLengthForText === "function") return model.utf8ByteLengthForText(text);
  const value = String(text || "");
  if (!value) return 0;
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
  if (typeof Blob === "function") return new Blob([value]).size;
  return unescape(encodeURIComponent(value)).length;
}

function composerRequestSizeError(text, serializedBody) {
  const model = currentChatComposerEditorModel();
  if (typeof model?.composerRequestSizeErrorPlan === "function") {
    return model.composerRequestSizeErrorPlan({
      text,
      serializedBody,
      maxTextChars: COMPOSER_MAX_TEXT_CHARS,
      maxBodyBytes: COMPOSER_MAX_BODY_BYTES,
    }).error || "";
  }
  if (String(text || "").length > COMPOSER_MAX_TEXT_CHARS) {
    return "内容太长，单条消息最多约 24 万字，请拆成几条发送，或作为文件上传。";
  }
  if (utf8ByteLength(serializedBody) > COMPOSER_MAX_BODY_BYTES) {
    return "内容太长，当前消息包超过发送上限，请拆成几条发送，或作为文件上传。";
  }
  return "";
}

function clearComposerSendAfterCompositionFallback() {
  if (!state.composerSendAfterCompositionTimer) return;
  clearTimeout(state.composerSendAfterCompositionTimer);
  state.composerSendAfterCompositionTimer = null;
}

function scheduleComposerSendAfterCompositionFallback() {
  clearComposerSendAfterCompositionFallback();
  const model = currentChatComposerEditorModel();
  const plan = typeof model?.composerSendAfterCompositionFallbackPlan === "function"
    ? model.composerSendAfterCompositionFallbackPlan({ sendAfterComposition: state.composerSendAfterComposition })
    : { delayMs: 450, shouldSendWhenTimerFires: true };
  state.composerSendAfterCompositionTimer = setTimeout(() => {
    state.composerSendAfterCompositionTimer = null;
    if (!plan.shouldSendWhenTimerFires || !state.composerSendAfterComposition) return;
    state.composerComposing = false;
    state.composerSendAfterComposition = false;
    updateComposerAction();
    updateGroupMentionMenu();
    void sendMessage();
  }, plan.delayMs);
}

function setComposerText(text) {
  const input = $("messageInput");
  if (!input) return;
  if ("value" in input) input.value = text || "";
  else input.textContent = text || "";
  autoSizeComposerEditor(input);
  updateComposerAction();
}

function clearComposerAfterSuccessfulSend(sentText = "") {
  const currentText = getComposerText();
  const model = currentChatComposerEditorModel();
  const plan = typeof model?.composerSuccessfulSendClearPlan === "function"
    ? model.composerSuccessfulSendClearPlan({ currentText, sentText })
    : { shouldClear: !String(currentText || "").trim() || String(currentText || "").trim() === String(sentText || "").trim() };
  if (plan.shouldClear) {
    setComposerText("");
    return true;
  }
  return false;
}

function composerCaretOffset() {
  const input = $("messageInput");
  const model = currentChatComposerEditorModel();
  if (input && typeof input.selectionStart === "number") {
    if (typeof model?.composerCaretOffsetPlan === "function") {
      return model.composerCaretOffsetPlan({ selectionStart: input.selectionStart, text: getComposerText() }).offset;
    }
    return input.selectionStart;
  }
  const selection = window.getSelection?.();
  if (!input || !selection || !selection.rangeCount) return getComposerText().length;
  const range = selection.getRangeAt(0);
  if (!input.contains(range.endContainer)) return getComposerText().length;
  const before = document.createRange();
  before.selectNodeContents(input);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/g, " ").length;
}

function setComposerCaretOffset(offset) {
  const input = $("messageInput");
  if (!input) return;
  const model = currentChatComposerEditorModel();
  const target = typeof model?.composerSetCaretOffsetPlan === "function"
    ? model.composerSetCaretOffsetPlan({ offset }).offset
    : Math.max(0, Number(offset) || 0);
  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(target, target);
    return;
  }
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();
  const selection = window.getSelection?.();
  const range = document.createRange();
  while (node) {
    const length = node.nodeValue.length;
    if (remaining <= length) {
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function composerEditorMaxHeightPx() {
  const fallback = 180;
  const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 0);
  const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
  const mobileViewport = viewportWidth > 0 && viewportWidth <= 720;
  const compactTopicContext = composerEditorCompactTopicContextActive();
  if (!mobileViewport || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return fallback;
  if (compactTopicContext) return Math.max(72, Math.min(118, Math.floor(viewportHeight * 0.18)));
  return Math.max(88, Math.min(fallback, Math.floor(viewportHeight * 0.24)));
}

function composerEditorCompactTopicContextActive() {
  const app = $("app");
  return Boolean(
    app?.classList?.contains("plugin-context-nav-mode")
    && app.classList.contains("plugin-topic-detail-mode")
  );
}

function composerEditorScrollSnapshot(el) {
  if (!composerEditorCompactTopicContextActive() || document.activeElement !== el) return null;
  const root = document.scrollingElement || document.documentElement || document.body || null;
  return {
    root,
    top: Number(root?.scrollTop || 0),
    left: Number(root?.scrollLeft || 0),
    windowX: Number(window.scrollX || 0),
    windowY: Number(window.scrollY || 0),
  };
}

function restoreComposerEditorScrollSnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.root) {
    snapshot.root.scrollTop = snapshot.top;
    snapshot.root.scrollLeft = snapshot.left;
  }
  if (typeof window.scrollTo === "function" && (window.scrollX !== snapshot.windowX || window.scrollY !== snapshot.windowY)) {
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  }
}

function autoSizeComposerEditor(el) {
  const scrollSnapshot = composerEditorScrollSnapshot(el);
  const model = currentChatComposerEditorModel();
  el.style.height = "auto";
  const measuredScrollHeight = Number(el.scrollHeight) || 0;
  const plan = typeof model?.composerEditorHeightPlan === "function"
    ? model.composerEditorHeightPlan({ scrollHeight: measuredScrollHeight, maxHeightPx: composerEditorMaxHeightPx() })
    : (() => {
      const heightPx = Math.min(composerEditorMaxHeightPx(), Math.max(44, measuredScrollHeight || 44));
      return { resetHeight: "auto", height: `${heightPx}px`, heightPx };
    })();
  el.style.height = plan.resetHeight;
  el.style.height = plan.height;
  el.style.overflowY = plan.heightPx && Number(plan.heightPx) < measuredScrollHeight ? "auto" : "";
  restoreComposerEditorScrollSnapshot(scrollSnapshot);
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  const input = $("messageInput");
  if (input && typeof input.setRangeText === "function") {
    const model = currentChatComposerEditorModel();
    const plan = typeof model?.composerPlainTextPastePlan === "function"
      ? model.composerPlainTextPastePlan({
        value: input.value,
        text,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      })
      : { text, selectionStart: input.selectionStart ?? input.value.length, selectionEnd: input.selectionEnd ?? (input.selectionStart ?? input.value.length) };
    input.setRangeText(plan.text, plan.selectionStart, plan.selectionEnd, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("insertText", false, text);
}

function handleComposerKeydown(event) {
  const model = currentChatComposerEditorModel();
  const plan = typeof model?.composerKeydownActionPlan === "function"
    ? model.composerKeydownActionPlan({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.isComposing,
      mentionAvailable: composerMentionAvailable(),
      groupMentionOpen: state.groupMentionOpen,
      chatSearchMode: isChatSearchMode(),
    })
    : null;
  if (plan) {
    if (plan.preventDefault) event.preventDefault();
    if (plan.action === "mention_move") {
      moveGroupMentionSelection(plan.delta);
      return;
    }
    if (plan.action === "mention_close") {
      closeGroupMentionMenu();
      return;
    }
    if (plan.action === "mention_choose") {
      void chooseGroupMention();
      return;
    }
    if (plan.action === "chat_search") {
      performChatSearch();
      return;
    }
    if (plan.action === "send_message") {
      void sendMessage();
      return;
    }
    return;
  }
  if (composerMentionAvailable() && state.groupMentionOpen) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveGroupMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveGroupMentionSelection(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeGroupMentionMenu();
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) {
      event.preventDefault();
      void chooseGroupMention();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  if (isChatSearchMode()) {
    performChatSearch();
    return;
  }
  void sendMessage();
}
